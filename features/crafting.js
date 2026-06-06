// features/crafting.js
const { goals } = require('mineflayer-pathfinder');

const GUIA_DE_CRAFTING = [
    {
        resultado: 'bread',
        gatilhoItem: 'wheat',
        quantidadeMinima: 3,
        precisaMesa: false
    }
];

// Agora aceita a "quantidade" e não envia mensagem no chat!
async function craftarItem(bot, nomeDoItem, blocoCraftingTable = null, quantidade = 1) {
    const itemParaCraftar = bot.registry.itemsByName[nomeDoItem];
    if (!itemParaCraftar) {
        console.log(`[Oficina] O item ${nomeDoItem} não existe no jogo.`);
        return false;
    }

    // Procura a receita dizendo exatamente QUANTOS queremos fabricar
    const receitas = bot.recipesFor(itemParaCraftar.id, null, quantidade, blocoCraftingTable);
    if (receitas.length === 0) {
        return false;
    }

    try {
        console.log(`[Oficina] Fabricando ${quantidade}x ${nomeDoItem.replace('_', ' ')}...`);
        // Fabrica TUDO numa única ação!
        await bot.craft(receitas[0], quantidade, blocoCraftingTable);
        return true;
    } catch (erro) {
        console.log(`[Oficina] Erro ao tentar craftar ${nomeDoItem}:`, erro.message);
        return false;
    }
}

async function oficinaAutonoma(bot) {
    for (const regra of GUIA_DE_CRAFTING) {
        const itensGatilho = bot.inventory.items().filter(i => i.name === regra.gatilhoItem);
        const totalGatilho = itensGatilho.reduce((acc, item) => acc + item.count, 0);

        if (totalGatilho >= regra.quantidadeMinima) {
            let mesa = null;
            if (regra.precisaMesa) {
                mesa = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 4 });
                if (!mesa) continue;

                if (bot.entity.position.distanceTo(mesa.position) > 2) {
                    await bot.pathfinder.goto(new goals.GoalGetToBlock(mesa.position.x, mesa.position.y, mesa.position.z));
                }
            }
            // Chama a função para fabricar apenas 1 por padrão no instinto autónomo
            const sucesso = await craftarItem(bot, regra.resultado, mesa, 1);
            if (sucesso) return true;
        }
    }
    return false;
}

async function refinarMateriaisBase(bot) { }
function precisaDeFerramentas(bot) { }

module.exports = { craftarItem, refinarMateriaisBase, precisaDeFerramentas, oficinaAutonoma };