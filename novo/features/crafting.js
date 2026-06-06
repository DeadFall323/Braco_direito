// novo/features/crafting.js
const { goals } = require('mineflayer-pathfinder');

// ==========================================
// O DICIONÁRIO DE INTENÇÕES DO JOÃO
// ==========================================
// Aqui você registra apenas o que ele deve fazer AUTOMATICAMENTE quando estiver ocioso.
// Não precisa colocar a receita exata (o bot já sabe), apenas a condição de gatilho.
const GUIA_DE_CRAFTING = [
    {
        resultado: 'bread',
        gatilhoItem: 'wheat',     // O que ele precisa ter na mochila para ter a ideia de craftar
        quantidadeMinima: 3,      // Quantidade mínima do gatilho para valer a pena
        precisaMesa: false        // Pão pode ser feito no inventário 2x2 do próprio personagem
    },
    // No futuro, podemos adicionar coisas como:
    // { resultado: 'wooden_axe', gatilhoItem: 'oak_planks', quantidadeMinima: 3, precisaMesa: true }
];

async function craftarItem(bot, nomeDoItem, blocoCraftingTable = null) {
    const itemParaCraftar = bot.registry.itemsByName[nomeDoItem];
    if (!itemParaCraftar) {
        console.log(`[Oficina] O item ${nomeDoItem} não existe no jogo.`);
        return false;
    }

    const receitas = bot.recipesFor(itemParaCraftar.id, null, 1, blocoCraftingTable);

    if (receitas.length === 0) {
        return false;
    }

    try {
        bot.chat(`Fabricando ${nomeDoItem.replace('_', ' ')}...`);
        await bot.craft(receitas[0], 1, blocoCraftingTable);
        return true;
    } catch (erro) {
        console.log(`[Oficina] Erro ao tentar craftar ${nomeDoItem}:`, erro.message);
        return false;
    }
}

// ==========================================
// NOVA FUNÇÃO: Oficina Autônoma
// ==========================================
async function oficinaAutonoma(bot) {
    // O bot lê o dicionário de cima para baixo (por prioridade)
    for (const regra of GUIA_DE_CRAFTING) {

        // Verifica se tem o item de gatilho na mochila
        const itensGatilho = bot.inventory.items().filter(i => i.name === regra.gatilhoItem);
        const totalGatilho = itensGatilho.reduce((acc, item) => acc + item.count, 0);

        if (totalGatilho >= regra.quantidadeMinima) {
            console.log(`[Oficina] Percebi que tenho ${totalGatilho} ${regra.gatilhoItem}(s). Vou tentar fazer ${regra.resultado}!`);

            let mesa = null;

            // Se a regra diz que precisa de mesa, ele procura uma perto
            if (regra.precisaMesa) {
                mesa = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 4 });

                if (!mesa) {
                    console.log(`[Oficina] Preciso de uma Mesa de Trabalho para fazer ${regra.resultado}, mas não tem nenhuma perto.`);
                    continue; // Pula para a próxima regra do dicionário
                }

                // Se achou a mesa, ele se aproxima dela para garantir o crafting
                if (bot.entity.position.distanceTo(mesa.position) > 2) {
                    await bot.pathfinder.goto(new goals.GoalGetToBlock(mesa.position.x, mesa.position.y, mesa.position.z));
                }
            }

            // Tenta realizar o craft
            const sucesso = await craftarItem(bot, regra.resultado, mesa);
            if (sucesso) {
                return true; // Fez algo! Encerra a oficina por agora.
            }
        }
    }

    return false; // Não tinha nada para craftar no dicionário
}

// (Mantenha as funções refinarMateriaisBase e precisaDeFerramentas intactas aqui embaixo)
async function refinarMateriaisBase(bot) { /* ... código original ... */ }
function precisaDeFerramentas(bot) { /* ... código original ... */ }

module.exports = { craftarItem, refinarMateriaisBase, precisaDeFerramentas, oficinaAutonoma };