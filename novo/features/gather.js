const { goals } = require('mineflayer-pathfinder');
const { nomeBot } = require('./text');

const blocosIgnorados = new Set();

// Dicionário de materiais
const DICIONARIO_BLOCOS = {
    'madeira': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log'],
    'pedra': ['stone', 'cobblestone', 'diorite', 'andesite', 'granite'],
    'terra': ['dirt', 'grass_block']
};

async function missaoDeColetaFocada(bot, usernameJogador, nomeDoMaterial, quantidadeDesejada) {
    bot.estadoAtual = 'trabalhando'; // Trava o cérebro dele!
    console.log(`[Missão] Iniciando coleta focada de ${quantidadeDesejada} ${nomeDoMaterial} para ${usernameJogador}.`);

    const nomesDosBlocos = DICIONARIO_BLOCOS[nomeDoMaterial];
    if (!nomesDosBlocos) {
        bot.chat(`Chefe, eu não sei o que é "${nomeDoMaterial}".`);
        bot.estadoAtual = 'ocioso';
        return;
    }

    const idsDosBlocos = nomesDosBlocos
        .map(nome => bot.registry.blocksByName[nome]?.id)
        .filter(id => id !== undefined);

    let atingiuMeta = false;

    // LOOP PRINCIPAL DE TRABALHO
    // Só para se bater a meta, se a mochila encher muito (>= 35 slots), ou se sofrer um ataque (estado sai de 'trabalhando')
    while (bot.estadoAtual === 'trabalhando' && !atingiuMeta && bot.inventory.items().length < 35) {

        // Conta quanto já tem na mochila
        const itensNaMochila = bot.inventory.items().filter(i => nomesDosBlocos.includes(i.name));
        const totalColetado = itensNaMochila.reduce((acc, item) => acc + item.count, 0);

        if (totalColetado >= quantidadeDesejada) {
            atingiuMeta = true;
            break;
        }

        const blocoAlvo = bot.findBlock({
            matching: idsDosBlocos,
            maxDistance: 45,
            useExtraInfo: (block) => !blocosIgnorados.has(block.position.toString())
        });

        if (!blocoAlvo) {
            bot.chat(`Puts, chefe. Limpei a área e não achei mais ${nomeDoMaterial} por aqui.`);
            break;
        }

        try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoAlvo.position.x, blocoAlvo.position.y, blocoAlvo.position.z));
            await equiparMelhorFerramenta(bot, blocoAlvo);
            await bot.dig(blocoAlvo);

            // Pausa rápida para a gravidade deixar o item cair e ele sugar
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (erro) {
            blocosIgnorados.add(blocoAlvo.position.toString()); // Block blacklist
        }
    }

    // ==========================================
    // ENTREGA VIP (Se ele ainda estiver na tarefa e não fugindo)
    // ==========================================
    if (bot.estadoAtual === 'trabalhando') {
        const jogador = bot.players[usernameJogador]?.entity;

        if (jogador) {
            bot.chat("Indo entregar a mercadoria!");
            try {
                // Vai até o jogador
                await bot.pathfinder.goto(new goals.GoalNear(jogador.position.x, jogador.position.y, jogador.position.z, 2));

                // Joga os itens no chão
                const itensParaDropar = bot.inventory.items().filter(i => nomesDosBlocos.includes(i.name));
                let quantidadeDropada = 0;

                for (const item of itensParaDropar) {
                    if (quantidadeDropada >= quantidadeDesejada) break;

                    const quantoJogar = Math.min(item.count, quantidadeDesejada - quantidadeDropada);
                    await bot.toss(item.type, item.metadata, quantoJogar);
                    quantidadeDropada += quantoJogar;
                    await new Promise(r => setTimeout(r, 400)); // Delay para o servidor processar o drop
                }

                bot.chat(`Terminei a missao! Deixei no chao para voce.`);
            } catch (e) {
                bot.chat("Não consegui chegar até voce para entregar.");
            }
        } else {
            bot.chat("Terminei de pegar, mas não te encontro para entregar!");
        }

        bot.estadoAtual = 'ocioso'; // Volta a ser um cidadão livre
    }
}

// ... (Copie e cole aqui a função antiga `equiparMelhorFerramenta` que já tínhamos no arquivo original)
async function equiparMelhorFerramenta(bot, blocoAlvo) {
    let tipoNecessario = '';
    if (blocoAlvo.name.includes('log') || blocoAlvo.name.includes('planks') || blocoAlvo.name.includes('wood')) {
        tipoNecessario = 'axe';
    } else if (blocoAlvo.name.includes('stone') || blocoAlvo.name.includes('cobble') || blocoAlvo.name.includes('ore') || blocoAlvo.name.includes('granite')) {
        tipoNecessario = 'pickaxe';
    } else if (blocoAlvo.name.includes('dirt') || blocoAlvo.name.includes('sand') || blocoAlvo.name.includes('gravel')) {
        tipoNecessario = 'shovel';
    }

    if (!tipoNecessario) return;

    const ordemTiers = ['wooden_', 'golden_', 'stone_', 'iron_', 'diamond_', 'netherite_'];
    let melhorItem = null;
    let melhorTier = -1;

    for (const item of bot.inventory.items()) {
        if (item.name.includes(tipoNecessario)) {
            const tierAtual = ordemTiers.findIndex(prefixo => item.name.startsWith(prefixo));
            if (tierAtual > melhorTier) {
                melhorTier = tierAtual;
                melhorItem = item;
            }
        }
    }

    if (melhorItem) {
        try { await bot.equip(melhorItem, 'hand'); } catch (erro) {}
    }
}

// Para retrocompatibilidade com códigos mais antigos, mantemos o export
module.exports = { missaoDeColetaFocada, coletarBloco: () => {} };