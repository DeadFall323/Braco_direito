const { goals } = require('mineflayer-pathfinder');

const blocosIgnorados = new Set();

// Dicionário de materiais
const DICIONARIO_BLOCOS = {
    'madeira': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log'],
    'pedra': ['stone', 'cobblestone', 'diorite', 'andesite', 'granite'],
    'terra': ['dirt', 'grass_block']
};

async function missaoDeColetaFocada(bot, usernameJogador, nomeDoMaterial, quantidadeDesejada) {
    bot.estadoAtual = 'trabalhando';
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

    while (bot.estadoAtual === 'trabalhando' && !atingiuMeta && bot.inventory.items().length < 35) {

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

            // Equipa a ferramenta certa ANTES de começar a cavar
            await equiparMelhorFerramenta(bot, blocoAlvo);

            await bot.dig(blocoAlvo);

            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (erro) {
            blocosIgnorados.add(blocoAlvo.position.toString());
        }
    }

    if (bot.estadoAtual === 'trabalhando') {
        const jogador = bot.players[usernameJogador]?.entity;

        if (jogador) {
            bot.chat("Indo entregar a mercadoria!");
            try {
                await bot.pathfinder.goto(new goals.GoalNear(jogador.position.x, jogador.position.y, jogador.position.z, 2));

                const itensParaDropar = bot.inventory.items().filter(i => nomesDosBlocos.includes(i.name));
                let quantidadeDropada = 0;

                for (const item of itensParaDropar) {
                    if (quantidadeDropada >= quantidadeDesejada) break;

                    const quantoJogar = Math.min(item.count, quantidadeDesejada - quantidadeDropada);
                    await bot.toss(item.type, item.metadata, quantoJogar);
                    quantidadeDropada += quantoJogar;
                    await new Promise(r => setTimeout(r, 400));
                }

                bot.chat(`Terminei a missao! Deixei no chao para voce.`);
            } catch (e) {
                bot.chat("Não consegui chegar até voce para entregar.");
            }
        } else {
            bot.chat("Terminei de pegar, mas não te encontro para entregar!");
        }

        bot.estadoAtual = 'ocioso';
    }
}

async function equiparMelhorFerramenta(bot, blocoAlvo) {
    let tipoNecessario = '';
    const nomeBloco = blocoAlvo.name;

    // CORREÇÃO: Adicionadas TODAS as variantes de pedra (Andesito, Diorito, Granito, etc)
    if (nomeBloco.includes('stone') || nomeBloco.includes('cobble') || nomeBloco.includes('ore') ||
        nomeBloco.includes('granite') || nomeBloco.includes('diorite') || nomeBloco.includes('andesite') ||
        nomeBloco.includes('deepslate') || nomeBloco.includes('tuff')) {
        tipoNecessario = 'pickaxe';
    } else if (nomeBloco.includes('log') || nomeBloco.includes('planks') || nomeBloco.includes('wood')) {
        tipoNecessario = 'axe';
    } else if (nomeBloco.includes('dirt') || nomeBloco.includes('sand') || nomeBloco.includes('gravel')) {
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
        try {
            const itemNaMao = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
            // Verifica se a picareta já não está na mão (poupa tempo)
            if (!itemNaMao || itemNaMao.name !== melhorItem.name) {
                await bot.equip(melhorItem, 'hand');
                // CORREÇÃO: Pausa obrigatória para o servidor registar a troca de item!
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (erro) {
            console.log("[Coleta] Erro ao equipar ferramenta:", erro.message);
        }
    }
}

module.exports = { missaoDeColetaFocada, coletarBloco: () => {} };