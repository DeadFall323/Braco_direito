const { goals } = require('mineflayer-pathfinder');
const vitalsFeature = require('./vitals');
const llmFeature = require('./llm');
const survivalFeature = require('./survival');
const foodFeature = require('./food');
const farmFeature = require('./farm');
const craftingFeature = require('./crafting');
const combatFeature = require('./combat');
const armoryFeature = require('./armory');
const inventoryFeature = require('./inventory');
const memoryFeature = require('./memory');

function initPersonality(bot) {
    // 1. CARREGA A MEMÓRIA PERMANENTE (JSON)
    bot.memoria = memoryFeature.carregarMemoria(bot.username);
    // 2. CRIA A MEMÓRIA DE CURTO PRAZO (Esquece ao reiniciar)
    bot.memoriaCurta = {
        ultimoInimigo: null,
        ultimoJogadorVisto: null,
        ultimaMensagem: null,
        ultimaPosicaoSegura: null
    };

    // Mescla as informações legadas para não quebrar módulos antigos
    if (!bot.personality) {
        bot.personality = {
            nome: bot.username,
            tipo: 'Construtor',
            nivelDeMedo: 80,
            homePosition: bot.memoria.locais.casa, // Puxa a casa direto do JSON!
            raioDeAcao: 30,
            comportamentoNoturno: 'dormir',
            funcao: 'trabalhador'
        };
    }

    bot.estadoAtual = 'ocioso';
    bot.pathfinder.setGoal(null);

    if (bot.personalityInicializada) return;
    bot.personalityInicializada = true;
    bot.pensando = false;

    // Salva a memória no arquivo JSON automaticamente a cada 30 segundos!
    setInterval(() => {
        memoryFeature.salvarMemoria(bot.username, bot.memoria);
    }, 30000);

    if (!bot.personality) {
        bot.personality = {
            nome: bot.username,
            tipo: 'Construtor',
            nivelDeMedo: 80,
            homePosition: null,
            raioDeAcao: 30,
            comportamentoNoturno: 'dormir',
            funcao: 'trabalhador' // Define se ele é 'trabalhador' ou 'guarda'
        };
    }

    bot.personality.nome = bot.username;
    bot.estadoAtual = 'ocioso';
    bot.ultimoEstadoMonitorado = 'ocioso'; // NOVO: Memória para o Log
    bot.pathfinder.setGoal(null);

    if (bot.personalityInicializada) return;

    bot.personalityInicializada = true;
    bot.pensando = false;

    setInterval(async () => {
        if (bot.pensando) return;

        bot.pensando = true;
        try {
            await pensar(bot);

            // ==========================================
            // 🛠️ MONITOR DE ESTADOS (RAIO-X DE DEBUG) 🛠️
            // ==========================================
            if (bot.ultimoEstadoMonitorado !== bot.estadoAtual) {
                // Captura os dados vitais no momento da decisão
                const vida = bot.health ? Math.round(bot.health) : 20;
                const fome = bot.food ? Math.round(bot.food) : 20;
                const itensMochila = bot.inventory ? bot.inventory.items().length : 0;

                console.log(`\n[FSM Debug] 🧠 MUDANÇA DE ESTADO: [${bot.ultimoEstadoMonitorado.toUpperCase()}] ===> [${bot.estadoAtual.toUpperCase()}]`);
                console.log(`[FSM Debug] 📊 Status: Vida ${vida}/20 | Fome ${fome}/20 | Inventário: ${itensMochila}/36 slots ocupados\n`);

                bot.ultimoEstadoMonitorado = bot.estadoAtual;
            }

        } finally {
            bot.pensando = false;
        }
    }, 500);
}

async function pensar(bot) {
    if (!bot.entity || !bot.personality) return;

    const saude = vitalsFeature.avaliarSaude(bot);
    const timeOfDay = bot.time?.timeOfDay ?? 0;
    const isNoite = timeOfDay >= 13000 && timeOfDay <= 23000;

    // ==========================================
    // PRIORIDADE 0.5: RADAR DE AMEAÇAS E DEFESA
    // ==========================================
    const ameaca = combatFeature.detectarAmeaca(bot);

    if (ameaca) {
        if (combatFeature.deveLutar(bot)) {
            // MODO LUTA
            if (bot.estadoAtual !== 'em_combate' || bot.alvoAtual !== ameaca) {
                bot.estadoAtual = 'em_combate';
                bot.alvoAtual = ameaca;
                bot.pathfinder.setGoal(null);
                console.log(`[Combate] Focando no alvo: ${ameaca.name}!`);
            }

            combatFeature.atacarAlvo(bot, ameaca);
            combatFeature.tentarDefender(bot, ameaca);
            return;

        } else {
            // MODO FUGA
            if (bot.estadoAtual !== 'fuga_desesperada') {
                bot.estadoAtual = 'fuga_desesperada';
                combatFeature.pararCombate(bot);
                bot.pathfinder.setGoal(null);

                console.log(`[Combate] Socorro! Um ${ameaca.name} me achou e estou em desvantagem!`);
                survivalFeature.fugaEstrategica(bot);

                llmFeature.pensarComOllama(
                    bot, bot.username, // Usa o bot.username para a fuga, pois não é um chat de jogador
                    `Um ${ameaca.name} está te atacando de surpresa e você não consegue lutar! Grite por ajuda de forma bem desesperada.`
                );
            }

            combatFeature.tentarDefender(bot, ameaca);
            return;
        }
    } else if (bot.estadoAtual === 'em_combate' || bot.estadoAtual === 'fuga_desesperada') {
        console.log("[Combate] A ameaca foi neutralizada ou despistada. Voltando a respirar.");
        combatFeature.pararCombate(bot);
        bot.alvoAtual = null;
        bot.estadoAtual = 'ocioso';
    }

    // ==========================================
    // PRIORIDADE 0: SOBREVIVÊNCIA E FUGA
    // =========================================
    if (saude.emPerigo && bot.estadoAtual !== 'fuga_desesperada') {
        bot.estadoAtual = 'fuga_desesperada';
        bot.pathfinder.setGoal(null);

        console.log('[Sistema] Vida critica! Iniciando protocolo de fuga.');

        llmFeature.pensarComOllama(
            bot, bot.username,
            'Voce esta com pouquissima vida no Minecraft e quase morrendo. Grite por socorro no chat de forma curta e desesperada.'
        );

        survivalFeature.fugaEstrategica(bot);
        return;
    }

    // ==========================================
    // PRIORIDADE 1: ALIMENTAÇÃO E CAÇA
    // ==========================================
    if (saude.precisaComer && bot.estadoAtual !== 'comendo' && bot.estadoAtual !== 'fuga_desesperada' && bot.estadoAtual !== 'buscando_comida') {
        const estadoAnterior = bot.estadoAtual;
        bot.estadoAtual = 'comendo';

        const conseguiuComer = await vitalsFeature.comer(bot);

        if (!conseguiuComer) {
            console.log('[Emergencia] Sem comida na mochila! Virando cacador/coletor.');
            bot.estadoAtual = 'buscando_comida';

            llmFeature.pensarComOllama(
                bot, bot.username,
                'Voce esta morrendo de fome e nao tem absolutamente nada na mochila para comer. Diga que vai cacar de forma dramatica.'
            );

            await foodFeature.procurarComida(bot);
            bot.estadoAtual = 'ocioso';
            return;
        }

        bot.estadoAtual = estadoAnterior;
    }

    // ==========================================
    // PRIORIDADE 2: CICLO DIA/NOITE E SONO
    // ==========================================
    if (isNoite) {
        if (bot.personality.comportamentoNoturno === 'guarda') {
            if (bot.estadoAtual === 'dormindo' || bot.estadoAtual === 'indo_dormir') {
                bot.estadoAtual = 'ocioso';
                if (bot.isSleeping) try { await bot.wake(); } catch (e) {}
            }
        } else {
            if (bot.estadoAtual !== 'dormindo' && bot.estadoAtual !== 'fuga_desesperada') {
                const cama = bot.findBlock({ matching: block => block.name.endsWith('_bed'), maxDistance: 15 });

                if (cama) {
                    if (bot.entity.position.distanceTo(cama.position) > 2) {
                        bot.estadoAtual = 'indo_dormir';
                        bot.pathfinder.setGoal(new goals.GoalGetToBlock(cama.position.x, cama.position.y, cama.position.z));
                    } else if (!bot.isSleeping) {
                        try {
                            bot.pathfinder.setGoal(null);
                            await bot.sleep(cama);
                            bot.estadoAtual = 'dormindo';
                            console.log(`[Rotina] Zzz... ${bot.username} deitou na cama.`);
                        } catch (erro) {
                            console.log(`[Rotina] ${bot.username} tentou deitar, mas: ${erro.message}`);
                        }
                    }
                } else if (bot.personality.homePosition && bot.estadoAtual !== 'em_casa') {
                    bot.pathfinder.setGoal(null);
                    bot.estadoAtual = 'em_casa';
                    console.log(`[Sistema] Escureceu. ${bot.username} voltou para casa para se proteger.`);
                    bot.pathfinder.setGoal(new goals.GoalBlock(
                        bot.personality.homePosition.x,
                        bot.personality.homePosition.y,
                        bot.personality.homePosition.z
                    ));
                }
            }
            return;
        }
    }

    if (!isNoite && (bot.estadoAtual === 'em_casa' || bot.estadoAtual === 'dormindo' || bot.estadoAtual === 'indo_dormir')) {
        if (bot.isSleeping) {
            try { await bot.wake(); } catch (e) {}
        }
        console.log(`[Rotina] Bom dia! ${bot.username} acordou para trabalhar.`);
        bot.estadoAtual = 'ocioso';
        return;
    }

    // ==========================================
    // PRIORIDADE 3: ESTADO OCIOSO E TAREFAS
    // ==========================================
    if (bot.estadoAtual === 'ocioso') {

        if (!bot.pathfinder.isMoving()) {
            const vestiuArmadura = await combatFeature.equiparMelhorArmadura(bot);
            if (vestiuArmadura) return;
        }

        if (inventoryFeature.inventarioEstaCheio(bot) && !bot.pathfinder.isMoving()) {
            const blocoBau = bot.findBlock({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15 });

            if (blocoBau) {
                bot.estadoAtual = 'guardando_itens';
                console.log("[Logística] Minha mochila esta quase cheia! Indo guardar o excesso no bau...");
                await inventoryFeature.descarregarInventario(bot, blocoBau);
                bot.estadoAtual = 'ocioso';
                return;
            }
        }

        if (!bot.pathfinder.isMoving()) {
            bot.estadoAtual = 'fabricando';
            const fabricouArma = await armoryFeature.fabricarEquipamentosFaltantes(bot);
            if (fabricouArma) {
                bot.estadoAtual = 'ocioso';
                return;
            }
            bot.estadoAtual = 'ocioso';
        }

        if (bot.personality.funcao === 'trabalhador') {
            const itensDeTrigo = bot.inventory.items().filter(item => item.name === 'wheat');
            const totalTrigo = itensDeTrigo.reduce((soma, item) => soma + item.count, 0);

            if (totalTrigo >= 128 && !bot.pathfinder.isMoving()) {
                bot.estadoAtual = 'fabricando';
                const craftingTable = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 15 });

                if (craftingTable) {
                    console.log(`[Padaria] Acumulei ${totalTrigo} trigos! Hora de fazer uma grande fornada de pao...`);
                    try {
                        if (bot.entity.position.distanceTo(craftingTable.position) > 3) {
                            await bot.pathfinder.goto(new goals.GoalGetToBlock(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z));
                        }
                        let trigoRestante = totalTrigo;
                        while (trigoRestante >= 3) {
                            const sucesso = await craftingFeature.craftarItem(bot, 'bread', craftingTable);
                            if (!sucesso) break;

                            trigoRestante -= 3;
                            await new Promise(resolve => setTimeout(resolve, 600));
                        }
                        console.log("[Padaria] Fornada finalizada com sucesso!");
                    } catch (erro) {
                        console.log("[Padaria] Falha ao tentar fazer pao:", erro.message);
                    }
                }
                bot.estadoAtual = 'ocioso';
                return;
            }

            const carneCrua = bot.inventory.items().find(item => foodFeature.CARNES_CRUAS.includes(item.name));
            if (carneCrua && !bot.pathfinder.isMoving()) {
                bot.estadoAtual = 'cozinhando';
                await foodFeature.cozinharComida(bot);
                bot.estadoAtual = 'ocioso';
                return;
            }

            if (!bot.pathfinder.isMoving()) {
                bot.estadoAtual = 'cuidando_fazenda';
                const trabalhouNaFazenda = await farmFeature.cuidarDaFazenda(bot);
                if (trabalhouNaFazenda) {
                    bot.estadoAtual = 'ocioso';
                    return;
                }
                bot.estadoAtual = 'ocioso';
            }
        }

        const chanceDePatrulha = bot.personality.funcao === 'guarda' ? 0.60 : 0.05;
        if (Math.random() < chanceDePatrulha && !bot.pathfinder.isMoving()) {
            if (bot.personality.homePosition) {
                const angulo = Math.random() * Math.PI * 2;
                const raioDePatrulha = bot.personality.raioDeAcao * 0.7;
                const patrulhaX = bot.personality.homePosition.x + (Math.cos(angulo) * raioDePatrulha);
                const patrulhaZ = bot.personality.homePosition.z + (Math.sin(angulo) * raioDePatrulha);

                bot.pathfinder.setGoal(new goals.GoalNear(patrulhaX, bot.personality.homePosition.y, patrulhaZ, 3));
            } else {
                const randomX = bot.entity.position.x + (Math.random() * 16 - 8);
                const randomZ = bot.entity.position.z + (Math.random() * 16 - 8);
                bot.pathfinder.setGoal(new goals.GoalNear(randomX, bot.entity.position.y, randomZ, 2));
            }
        }
    } // <-- AQUI É O LUGAR CORRETO PARA FECHAR A FUNÇÃO pensar(bot)

    if (Math.random() < 0.05) {
        const yaw = bot.entity.yaw + (Math.random() * Math.PI - Math.PI / 2);
        const pitch = (Math.random() * Math.PI / 4) - Math.PI / 8;
        bot.look(yaw, pitch, true);
    }
}

function processarComando(bot, username, comando) {
    if (comando.includes('aqui e sua casa')) {
        bot.personality.homePosition = bot.entity.position.clone();
        bot.chat(`Casa registrada! Meu raio de seguranca e de ${bot.personality.raioDeAcao} blocos.`);
    } else if (comando.includes('fique de guarda') || comando.includes('fique de patrulha')) {
        bot.personality.funcao = 'guarda';
        bot.personality.comportamentoNoturno = 'guarda';
        bot.chat('Entendido! Assumindo posto de guarda. Ignorarei a fazenda e focarei na seguranca!');
    } else if (comando.includes('pode trabalhar') || comando.includes('pode dormir')) {
        bot.personality.funcao = 'trabalhador';
        bot.personality.comportamentoNoturno = 'dormir';
        bot.chat('Ufa! Voltando para a rotina normal de trabalho e descanso.');
    }
}

module.exports = { initPersonality, processarComando };