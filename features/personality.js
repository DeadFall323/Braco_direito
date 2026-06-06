const { goals, Movements } = require('mineflayer-pathfinder');
const vitalsFeature = require('./vitals');
const llmFeature = require('./llm');
const survivalFeature = require('./survival');
const foodFeature = require('./food');
const farmFeature = require('./farm');
const craftingFeature = require('./crafting');
const inventoryFeature = require('./inventory');
const memoryFeature = require('./memory');

function initPersonality(bot) {
    bot.memoria = memoryFeature.carregarMemoria(bot.username);
    bot.estadoAtual = 'ocioso';
    bot.pathfinder.setGoal(null);

    // ==========================================
    // SISTEMA DE MOVIMENTAÇÃO E PROTEÇÃO DE BASE
    // ==========================================
    bot.modoPanicoPreso = false;
    bot.tempoPreso = 0;
    bot.ultimaPosicaoTrajeto = null;

    const movimentosSeguros = new Movements(bot);
    const safeToBreakOriginal = movimentosSeguros.safeToBreak;

    // Sobrescrevemos a função do Mineflayer que decide se um bloco pode ser partido
    movimentosSeguros.safeToBreak = function(block) {
        // Se estiver em pânico (preso há 30s), ignora as regras e quebra tudo para sair
        if (bot.modoPanicoPreso) {
            return safeToBreakOriginal.call(this, block);
        }

        // Se tem uma casa registrada, cria um escudo de proteção de 32 blocos
        if (bot.memoria?.locais?.casa) {
            const casa = bot.memoria.locais.casa;
            const dx = block.position.x - casa.x;
            const dy = block.position.y - casa.y;
            const dz = block.position.z - casa.z;
            const distanciaDaCasa = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (distanciaDaCasa <= 32) {
                return false; // NÃO PODE QUEBRAR ESTE BLOCO!
            }
        }

        // Se estiver fora do raio de 32 blocos da casa, comportamento normal
        return safeToBreakOriginal.call(this, block);
    };

    bot.pathfinder.setMovements(movimentosSeguros);

    if (bot.personalityInicializada) return;

    bot.personalityInicializada = true;
    bot.pensando = false;

    setInterval(async () => {
        if (bot.pensando) return;

        bot.pensando = true;
        try {
            await pensar(bot);
        } finally {
            bot.pensando = false;
        }
    }, 500);
}

async function pensar(bot) {
    if (!bot.entity) return;

    // ==========================================
    // SISTEMA ANTI-STUCK (PRESO NO CAMINHO)
    // ==========================================
    if (bot.pathfinder.isMoving()) {
        if (!bot.ultimaPosicaoTrajeto) {
            bot.ultimaPosicaoTrajeto = bot.entity.position.clone();
            bot.tempoPreso = 0;
        } else {
            const distanciaDaAncora = bot.entity.position.distanceTo(bot.ultimaPosicaoTrajeto);

            // Se ele não conseguiu afastar-se 2 blocos da posição de ancoragem...
            if (distanciaDaAncora < 2.0) {
                bot.tempoPreso += 500; // Conta +500 milissegundos
            } else {
                // Andou normalmente! Reseta o cronômetro e desliga o pânico (caso estivesse ligado).
                bot.ultimaPosicaoTrajeto = bot.entity.position.clone();
                bot.tempoPreso = 0;
                if (bot.modoPanicoPreso) {
                    bot.modoPanicoPreso = false;
                    console.log("[Anti-Stuck] Destravado! O escudo da base foi reativado.");
                }
            }

            // Preso por 30 segundos (30.000 ms)
            if (bot.tempoPreso >= 30000 && !bot.modoPanicoPreso) {
                bot.modoPanicoPreso = true;
                bot.chat("Chefe, estou preso aqui faz meia hora! Vou ter que quebrar uns blocos para abrir caminho!");

                // Recalcula a rota com a nova permissão (Modo Trator Ativado)
                const objetivoAtual = bot.pathfinder.goal;
                bot.pathfinder.setGoal(null);
                setTimeout(() => {
                    if (objetivoAtual) bot.pathfinder.setGoal(objetivoAtual);
                }, 500);
            }
        }
    } else {
        // Se não está a tentar ir a lugar nenhum, limpa os radares.
        bot.ultimaPosicaoTrajeto = null;
        bot.tempoPreso = 0;
        bot.modoPanicoPreso = false;
    }

    const saude = vitalsFeature.avaliarSaude(bot);
    const timeOfDay = bot.time?.timeOfDay ?? 0;
    const isNoite = timeOfDay >= 13000 && timeOfDay <= 23000;

    // ==========================================
    // PRIORIDADE 0: SOBREVIVÊNCIA E FOME
    // ==========================================
    if (saude.emPerigo && bot.estadoAtual !== 'fuga_desesperada') {
        bot.estadoAtual = 'fuga_desesperada';
        bot.pathfinder.setGoal(null);
        console.log('[Fazendeiro] Sendo atacado! Fugindo para salvar a vida!');
        survivalFeature.fugaEstrategica(bot);
        return;
    }

    if (saude.precisaComer && bot.estadoAtual !== 'comendo' && bot.estadoAtual !== 'fuga_desesperada') {
        const estadoAnterior = bot.estadoAtual;
        bot.estadoAtual = 'comendo';
        const conseguiuComer = await vitalsFeature.comer(bot);

        if (!conseguiuComer) {
            console.log('[Fazendeiro] Fiquei sem marmita. Vou procurar comida na natureza.');
            bot.estadoAtual = 'buscando_comida';
            await foodFeature.procurarComida(bot);
            bot.estadoAtual = 'ocioso';
            return;
        }
        bot.estadoAtual = estadoAnterior === 'comendo' ? 'ocioso' : estadoAnterior;
    }

    // ==========================================
    // PRIORIDADE 1: CICLO NOTURNO (DORMIR)
    // ==========================================
    if (isNoite) {
        if (bot.estadoAtual === 'dormindo' && bot.isSleeping) {
            return;
        }

        if (bot.estadoAtual !== 'fuga_desesperada') {
            const cama = bot.findBlock({ matching: block => block.name.endsWith('_bed'), maxDistance: 15 });

            if (cama) {
                if (bot.entity.position.distanceTo(cama.position) > 2) {
                    if (bot.estadoAtual !== 'indo_dormir') {
                        bot.estadoAtual = 'indo_dormir';
                        console.log("[Fazendeiro] Estou com sono... Indo para a cama.");
                        bot.pathfinder.setGoal(new goals.GoalNear(cama.position.x, cama.position.y, cama.position.z, 1.5));
                    }
                } else if (!bot.isSleeping) {
                    try {
                        bot.pathfinder.setGoal(null);
                        bot.clearControlStates();
                        await new Promise(resolve => setTimeout(resolve, 500));

                        bot.estadoAtual = 'dormindo';
                        console.log(`[Fazendeiro] Deitando na cama... Zzz...`);
                        await bot.sleep(cama);
                    } catch (erro) {
                        console.log(`[Fazendeiro] Não consegui deitar: ${erro.message}`);
                        bot.estadoAtual = 'ocioso';
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else if (bot.memoria?.locais?.casa && bot.estadoAtual !== 'em_casa') {
                bot.pathfinder.setGoal(null);
                bot.estadoAtual = 'em_casa';
                console.log(`[Fazendeiro] Escureceu e não acho a cama. Voltando para casa por segurança.`);
                bot.pathfinder.setGoal(new goals.GoalNear(
                    bot.memoria.locais.casa.x, bot.memoria.locais.casa.y, bot.memoria.locais.casa.z, 2
                ));
            }
        }
        return;
    }

    // ==========================================
    // PRIORIDADE 1: CICLO NOTURNO (FIM DO EXPEDIENTE E DORMIR)
    // ==========================================
    if (isNoite) {
        if (bot.estadoAtual === 'dormindo' && bot.isSleeping) {
            return;
        }

        if (bot.estadoAtual !== 'fuga_desesperada') {

            // 1.1 ROTINA DE FIM DE DIA: Guardar itens no baú
            if (!bot.jaGuardouItensHoje && bot.estadoAtual !== 'guardando_itens_noturno') {
                const blocoBau = bot.findBlock({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15 });

                if (blocoBau) {
                    bot.estadoAtual = 'guardando_itens_noturno';
                    console.log("[Fazendeiro] Fim do expediente! Guardando a colheita no baú antes de dormir...");

                    try {
                        // Vai até ao baú
                        if (bot.entity.position.distanceTo(blocoBau.position) > 2) {
                            await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoBau.position.x, blocoBau.position.y, blocoBau.position.z));
                        }

                        const bau = await bot.openContainer(blocoBau);

                        // Lista do que ELE NÃO PODE GUARDAR (Sementes, Comida pronta e Ferramentas)
                        const itensIntocaveis = [
                            'wheat_seeds', 'carrot', 'potato', 'beetroot_seeds', // Sementes
                            'bread', 'baked_potato', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken' // Comida pronta
                        ];

                        for (const item of bot.inventory.items()) {
                            // Pula os itens intocáveis
                            if (itensIntocaveis.includes(item.name)) continue;
                            // Pula ferramentas e armas
                            if (item.name.includes('hoe') || item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel') || item.name.includes('sword')) continue;

                            try {
                                await bau.deposit(item.type, item.metadata, item.count);
                                await new Promise(r => setTimeout(r, 300)); // Pequena pausa para não bugar o servidor
                            } catch (e) {
                                console.log("[Fazendeiro] O baú está cheio!");
                                break; // Sai do loop se o baú encher
                            }
                        }
                        await bau.close();
                        console.log("[Fazendeiro] Tudo guardado! Agora sim, vou descansar.");
                    } catch (e) {
                        console.log("[Fazendeiro] Falha ao tentar usar o baú:", e.message);
                    }
                } else {
                    console.log("[Fazendeiro] Queria guardar a colheita, mas não achei nenhum baú por perto.");
                }

                // Marca como concluído para ele não tentar guardar de novo na mesma noite
                bot.jaGuardouItensHoje = true;
                bot.estadoAtual = 'ocioso';
                return; // Encerra o cérebro aqui para ele ir dormir no próximo tick
            }

            // 1.2 HORA DE DORMIR
            const cama = bot.findBlock({ matching: block => block.name.endsWith('_bed'), maxDistance: 15 });

            if (cama) {
                if (bot.entity.position.distanceTo(cama.position) > 2) {
                    if (bot.estadoAtual !== 'indo_dormir') {
                        bot.estadoAtual = 'indo_dormir';
                        console.log("[Fazendeiro] Estou com sono... Indo para a cama.");
                        bot.pathfinder.setGoal(new goals.GoalNear(cama.position.x, cama.position.y, cama.position.z, 1.5));
                    }
                } else if (!bot.isSleeping) {
                    try {
                        bot.pathfinder.setGoal(null);
                        bot.clearControlStates();
                        await new Promise(resolve => setTimeout(resolve, 500));

                        bot.estadoAtual = 'dormindo';
                        console.log(`[Fazendeiro] Deitando na cama... Zzz...`);
                        await bot.sleep(cama);
                    } catch (erro) {
                        console.log(`[Fazendeiro] Não consegui deitar: ${erro.message}`);
                        bot.estadoAtual = 'ocioso';
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else if (bot.memoria?.locais?.casa && bot.estadoAtual !== 'em_casa') {
                bot.pathfinder.setGoal(null);
                bot.estadoAtual = 'em_casa';
                console.log(`[Fazendeiro] Escureceu e não acho a cama. Voltando para casa por segurança.`);
                bot.pathfinder.setGoal(new goals.GoalNear(
                    bot.memoria.locais.casa.x, bot.memoria.locais.casa.y, bot.memoria.locais.casa.z, 2
                ));
            }
        }
        return;
    }

    // ==========================================
    // LÓGICA DE ACORDAR (DIA)
    // ==========================================
    if (!isNoite && (bot.estadoAtual === 'em_casa' || bot.estadoAtual === 'dormindo' || bot.estadoAtual === 'indo_dormir')) {
        if (bot.isSleeping) {
            try { await bot.wake(); } catch (e) {}
        }

        bot.jaGuardouItensHoje = false; // Reseta a memória para a próxima noite!

        console.log(`[Fazendeiro] O sol nasceu! O galo cantou. Hora de ir para a roça.`);
        bot.estadoAtual = 'ocioso';
        return;
    }

    // ==========================================
    // PRIORIDADE 2: A ROTINA NA ROÇA (DIA)
    // ==========================================
    if (bot.estadoAtual === 'ocioso' && !bot.pathfinder.isMoving()) {

        if (inventoryFeature.inventarioEstaCheio(bot)) {
            const blocoBau = bot.findBlock({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15 });
            if (blocoBau) {
                bot.estadoAtual = 'guardando_itens';
                console.log("[Fazendeiro] Mochila pesada! Guardando a colheita no baú.");
                await inventoryFeature.descarregarInventario(bot, blocoBau);
                bot.estadoAtual = 'ocioso';
                return;
            }
        }

        bot.estadoAtual = 'cuidando_fazenda';
        const trabalhouNaFazenda = await farmFeature.cuidarDaFazenda(bot);
        if (trabalhouNaFazenda) {
            bot.estadoAtual = 'ocioso';
            return;
        }
        bot.estadoAtual = 'ocioso';

        // 2.3 Fazer o próprio Pão (Sem Spam e em Lote!)
        const totalTrigo = bot.inventory.items().filter(item => item.name === 'wheat').reduce((soma, item) => soma + item.count, 0);
        if (totalTrigo >= 21) {
            bot.estadoAtual = 'fabricando';
            const craftingTable = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 15 });

            if (craftingTable) {
                // Descobre quantos pães ele pode fazer (3 trigos = 1 pão)
                const quantidadeDePao = Math.floor(totalTrigo / 3);
                console.log(`[Fazendeiro] Batendo uma super fornada de ${quantidadeDePao} pães de uma só vez!`);

                try {
                    if (bot.entity.position.distanceTo(craftingTable.position) > 3) {
                        await bot.pathfinder.goto(new goals.GoalGetToBlock(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z));
                    }

                    bot.chat(`Ufa! Muita colheita. Vou fazer ${quantidadeDePao} pães fresquinhos agora mesmo.`);

                    // Faz tudo de uma vez (o Minecraft vai lidar com o tempo interno da interface)
                    await craftingFeature.craftarItem(bot, 'bread', craftingTable, quantidadeDePao);

                    // Pausa de 2 segundos para o inventário sincronizar com o servidor sem lag
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (erro) {
                    console.log("[Fazendeiro] Problema na padaria:", erro.message);
                }
            } else {
                console.log("[Fazendeiro] Quero fazer pão, mas não acho a mesa de trabalho.");
            }
            bot.estadoAtual = 'ocioso';
            return;
        }

        // ==========================================
        // O CÓDIGO DO PASSEIO (Math.random() < 0.10) FOI REMOVIDO DAQUI!
        // Agora, se ele não tem trabalho, ele fica parado à espera que a plantação cresça.
        // ==========================================
    }

    // Mantemos apenas a animação de mexer a cabeça, para ele não parecer um robô desligado
    if (Math.random() < 0.05) {
        const yaw = bot.entity.yaw + (Math.random() * Math.PI - Math.PI / 2);
        const pitch = (Math.random() * Math.PI / 4) - Math.PI / 8;
        bot.look(yaw, pitch, true);
    }
}

module.exports = { initPersonality };
