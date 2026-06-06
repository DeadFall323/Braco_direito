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

function initPersonality(bot) {
    if (!bot.personality) {
        bot.personality = {
            nome: bot.username,
            tipo: 'Construtor',
            nivelDeMedo: 80,
            homePosition: null,
            raioDeAcao: 30,
            comportamentoNoturno: 'dormir',
            funcao: 'trabalhador' // NOVO: Define se ele é 'trabalhador' ou 'guarda'
        };
    }
// ...

    bot.personality.nome = bot.username;
    bot.estadoAtual = 'ocioso';
    bot.pathfinder.setGoal(null);

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
            // MODO LUTA: Se apareceu um alvo novo na visão
            if (bot.estadoAtual !== 'em_combate' || bot.alvoAtual !== ameaca) {
                bot.estadoAtual = 'em_combate';
                bot.alvoAtual = ameaca; // Salva a entidade na memória
                bot.pathfinder.setGoal(null);
                console.log(`[Combate] Focando no alvo: ${ameaca.name}!`);
            }

            // IMPORTANTE: Agora ele roda o ataque continuamente A CADA TICK (500ms)
            combatFeature.atacarAlvo(bot, ameaca);
            combatFeature.tentarDefender(bot, ameaca);
            return; // Interrompe o resto do pensamento para focar 100% no combate

        } else {
            // MODO FUGA
            if (bot.estadoAtual !== 'fuga_desesperada') {
                bot.estadoAtual = 'fuga_desesperada';
                combatFeature.pararCombate(bot);
                bot.pathfinder.setGoal(null);

                console.log(`[Combate] Socorro! Um ${ameaca.name} me achou e estou em desvantagem!`);
                survivalFeature.fugaEstrategica(bot);

                llmFeature.pensarComOllama(
                    bot,
                    `Um ${ameaca.name} está te atacando de surpresa e você não consegue lutar! Grite por ajuda de forma bem desesperada.`
                );
            }

            combatFeature.tentarDefender(bot, ameaca);
            return;
        }
    } else if (bot.estadoAtual === 'em_combate') {
        // A ameaça morreu ou sumiu do radar de 16 blocos
        console.log("[Combate] A ameaca foi neutralizada ou despistada. Voltando a respirar.");
        combatFeature.pararCombate(bot);
        bot.alvoAtual = null; // Limpa a memória de mira
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
            bot,
            'Voce esta com pouquissima vida no Minecraft e quase morrendo. Grite por socorro no chat de forma curta e desesperada.'
        );

        survivalFeature.fugaEstrategica(bot);
        return;
    }

    // ==========================================
    // PRIORIDADE 1: ALIMENTAÇÃO E CAÇA
    // ==========================================
    if (saude.precisaComer && bot.estadoAtual !== 'comendo' && bot.estadoAtual !== 'fuga_desesperada' && bot.estadoAtual !== 'buscando_comida') {
        const estadoAnterior = bot.estadoAtual; // Guarda se ele estava 'trabalhando' ou 'ocioso'
        bot.estadoAtual = 'comendo';

        const conseguiuComer = await vitalsFeature.comer(bot);

        if (!conseguiuComer) {
            console.log('[Emergencia] Sem comida na mochila! Virando cacador/coletor.');
            bot.estadoAtual = 'buscando_comida';

            llmFeature.pensarComOllama(
                bot,
                'Voce esta morrendo de fome e nao tem absolutamente nada na mochila para comer. Diga que vai cacar de forma dramatica.'
            );

            await foodFeature.procurarComida(bot);
            bot.estadoAtual = 'ocioso'; // Se ele precisou caçar, ele perde o foco na tarefa para não dar loop
            return;
        }

        // Se ele apenas tirou a maçã do bolso e comeu, ele retoma o estado anterior (voltando ao trabalho instantaneamente)
        bot.estadoAtual = estadoAnterior;
    }

    // ==========================================
    // PRIORIDADE 2: CICLO DIA/NOITE
    // ==========================================
    // ==========================================
    // PRIORIDADE 2: CICLO DIA/NOITE E SONO
    // ==========================================
    if (isNoite) {
        // Se a ordem for de guarda, ele pula o toque de recolher e cai para o Estado Ocioso (onde faz a patrulha e ataca)
        if (bot.personality.comportamentoNoturno === 'guarda') {
            if (bot.estadoAtual === 'dormindo' || bot.estadoAtual === 'indo_dormir') {
                bot.estadoAtual = 'ocioso';
                if (bot.isSleeping) try { await bot.wake(); } catch (e) {}
            }
        } else {
            // COMPORTAMENTO PADRÃO: Tentar dormir ou se trancar em casa
            if (bot.estadoAtual !== 'dormindo' && bot.estadoAtual !== 'fuga_desesperada') {

                // Procura qualquer cama num raio de 15 blocos
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
                    // Sem cama, corre pra casa e fica estático lá
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
            return; // Encerra o cérebro aqui. Ele não patrulha nem faz pão enquanto dorme/se esconde.
        }
    }

    // Lógica para acordar quando amanhecer
    if (!isNoite && (bot.estadoAtual === 'em_casa' || bot.estadoAtual === 'dormindo' || bot.estadoAtual === 'indo_dormir')) {
        if (bot.isSleeping) {
            try { await bot.wake(); } catch (e) {}
        }
        console.log(`[Rotina] Bom dia! ${bot.username} acordou para trabalhar.`);
        bot.estadoAtual = 'ocioso';
        return;
    }

    // ==========================================
    // PRIORIDADE 3: ESTADO OCIOSO (TAREFAS DOMÉSTICAS E PATRULHA)
    // ==========================================
    if (bot.estadoAtual === 'ocioso') {

        if (!bot.pathfinder.isMoving()) {
            const vestiuArmadura = await combatFeature.equiparMelhorArmadura(bot);
            if (vestiuArmadura) {
                return; // Se ele trocou de roupa, encerra o ciclo para repensar
            }
        }

        // ==========================================
        // 3.0.5 INSTINTO DE ORGANIZAÇÃO (BAÚS)
        // ==========================================
        if (inventoryFeature.inventarioEstaCheio(bot) && !bot.pathfinder.isMoving()) {
            // Procura um baú num raio de 15 blocos
            const blocoBau = bot.findBlock({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15 });

            if (blocoBau) {
                bot.estadoAtual = 'guardando_itens';
                console.log("[Logística] Minha mochila esta quase cheia! Indo guardar o excesso no bau...");

                await inventoryFeature.descarregarInventario(bot, blocoBau);

                bot.estadoAtual = 'ocioso';
                return; // Encerra o ciclo de pensamento para processar o inventário mais leve no próximo tick
            }
        }

        // ==========================================
        // 3.1 INSTINTO DE ARMEIRO
        // ==========================================
        if (!bot.pathfinder.isMoving()) {
            bot.estadoAtual = 'fabricando';
            const fabricouArma = await armoryFeature.fabricarEquipamentosFaltantes(bot);
            if (fabricouArma) {
                bot.estadoAtual = 'ocioso';
                return; // Se ele craftou algo, encerra o pensamento e deixa para checar outras coisas no próximo meio segundo
            }
            bot.estadoAtual = 'ocioso';
        }

        // ==========================================
        // TAREFAS DOMÉSTICAS (APENAS TRABALHADORES)
        // ==========================================
        if (bot.personality.funcao === 'trabalhador') {

            // 3.1 Instinto de Padeiro: Fazer pão se tiver 128 ou mais trigos (2 packs inteiros)
            const itensDeTrigo = bot.inventory.items().filter(item => item.name === 'wheat');
            const totalTrigo = itensDeTrigo.reduce((soma, item) => soma + item.count, 0);

            if (totalTrigo >= 128 && !bot.pathfinder.isMoving()) {
                bot.estadoAtual = 'fabricando';

                // Procura uma Mesa de Trabalho num raio de 15 blocos
                const craftingTable = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 15 });

                if (craftingTable) {
                    console.log(`[Padaria] Acumulei ${totalTrigo} trigos! Hora de fazer uma grande fornada de pao...`);
                    try {
                        if (bot.entity.position.distanceTo(craftingTable.position) > 3) {
                            await bot.pathfinder.goto(new goals.GoalGetToBlock(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z));
                        }

                        // Como atingimos o gatilho, ele gasta todo o trigo fazendo pão até sobrar menos que 3
                        let trigoRestante = totalTrigo;
                        while (trigoRestante >= 3) {
                            const sucesso = await craftingFeature.craftarItem(bot, 'bread', craftingTable);
                            if (!sucesso) break; // Sai do loop se der algum erro no meio

                            trigoRestante -= 3;
                            await new Promise(resolve => setTimeout(resolve, 600)); // Pequena pausa para a animação do jogo e não dar lag
                        }
                        console.log("[Padaria] Fornada finalizada com sucesso!");

                    } catch (erro) {
                        console.log("[Padaria] Falha ao tentar fazer pao:", erro.message);
                    }
                } else {
                    console.log("[Padaria] Queria fazer pao, mas nao achei nenhuma Mesa de Trabalho por perto.");
                }

                bot.estadoAtual = 'ocioso';
                return;
            }

            // 3.2 Instinto de Chef: Assar carnes cruas se estiver perto de uma fornalha
            const carneCrua = bot.inventory.items().find(item => foodFeature.CARNES_CRUAS.includes(item.name));
            if (carneCrua && !bot.pathfinder.isMoving()) {
                bot.estadoAtual = 'cozinhando';
                await foodFeature.cozinharComida(bot);
                bot.estadoAtual = 'ocioso';
                return;
            }

            // 3.3 Instinto de Fazendeiro: Colher ou replantar a roça
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

        // ==========================================
        // 3.4 INSTINTO DE PATRULHA
        // ==========================================
        // Se for Guarda, patrulha 60% das vezes que estiver ocioso. Se for trabalhador, apenas 5% (passeio leve).
        const chanceDePatrulha = bot.personality.funcao === 'guarda' ? 0.60 : 0.05;

        if (Math.random() < chanceDePatrulha && !bot.pathfinder.isMoving()) {

            if (bot.personality.homePosition) {
                // Calcula um ponto na borda do território (70% do raio de ação para não se afastar demais)
                const angulo = Math.random() * Math.PI * 2;
                const raioDePatrulha = bot.personality.raioDeAcao * 0.7;

                const patrulhaX = bot.personality.homePosition.x + (Math.cos(angulo) * raioDePatrulha);
                const patrulhaZ = bot.personality.homePosition.z + (Math.sin(angulo) * raioDePatrulha);

                console.log(`[Seguranca] ${bot.username} patrulhando o perimetro da vila...`);
                // Usa a altura da casa como base para não mirar no céu ou debaixo da terra
                bot.pathfinder.setGoal(new goals.GoalNear(patrulhaX, bot.personality.homePosition.y, patrulhaZ, 3));
            } else {
                // Se o bot não tem casa (andarilho), ele patrulha em volta de si mesmo
                const randomX = bot.entity.position.x + (Math.random() * 16 - 8);
                const randomZ = bot.entity.position.z + (Math.random() * 16 - 8);
                bot.pathfinder.setGoal(new goals.GoalNear(randomX, bot.entity.position.y, randomZ, 2));
            }
        }
    }
}
    // Deixa o bot olhar ativamente para os lados para parecer alerta e varrer o campo de visão
    if (Math.random() < 0.05) {
        const yaw = bot.entity.yaw + (Math.random() * Math.PI - Math.PI / 2);
        const pitch = (Math.random() * Math.PI / 4) - Math.PI / 8;
        bot.look(yaw, pitch, true);
    }

function processarComando(bot, username, comando) {
    if (comando.includes('aqui e sua casa')) {
        bot.personality.homePosition = bot.entity.position.clone();
        bot.chat(`Casa registrada! Meu raio de seguranca e de ${bot.personality.raioDeAcao} blocos.`);
    } else if (comando.includes('fique de guarda') || comando.includes('fique de patrulha')) {
        bot.personality.funcao = 'guarda';
        bot.personality.comportamentoNoturno = 'guarda'; // Fica acordado à noite
        bot.chat('Entendido! Assumindo posto de guarda. Ignorarei a fazenda e focarei na seguranca!');
    } else if (comando.includes('pode trabalhar') || comando.includes('pode dormir')) {
        bot.personality.funcao = 'trabalhador';
        bot.personality.comportamentoNoturno = 'dormir'; // Dorme à noite
        bot.chat('Ufa! Voltando para a rotina normal de trabalho e descanso.');
    }

}
module.exports = { initPersonality, processarComando };
