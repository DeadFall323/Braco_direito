// novo/features/armory.js
const { goals } = require('mineflayer-pathfinder');
const craftingFeature = require('./crafting');

async function fabricarEquipamentosFaltantes(bot) {
    // Para construir armas e escudos, precisamos de uma Crafting Table
    const craftingTable = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 15 });
    if (!craftingTable) return false;

    // Função auxiliar para chegar perto da mesa
    const irParaMesa = async () => {
        if (bot.entity.position.distanceTo(craftingTable.position) > 3) {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z));
        }
    };

    // ==========================================
    // PRIORIDADE 1: ESCUDO (A melhor defesa)
    // ==========================================
    const temEscudo = bot.inventory.items().some(i => i.name === 'shield');
    if (!temEscudo) {
        const temFerro = bot.inventory.items().some(i => i.name === 'iron_ingot');
        const totalPlanks = bot.inventory.items().filter(i => i.name.includes('planks')).reduce((acc, i) => acc + i.count, 0);

        if (temFerro && totalPlanks >= 6) {
            console.log("[Armaria] Estou vulneravel! Indo fabricar um Escudo...");
            await irParaMesa();
            const sucesso = await craftingFeature.craftarItem(bot, 'shield', craftingTable);
            if (sucesso) return true; // Termina o ciclo para vestir no próximo tick
        }
    }

    // ==========================================
    // PRIORIDADE 2: ESPADA (A melhor possível)
    // ==========================================
    const temEspada = bot.inventory.items().some(i => i.name.includes('sword'));
    if (!temEspada) {
        // Tenta garantir que temos gravetos (necessário para qualquer espada)
        let temGraveto = bot.inventory.items().some(i => i.name === 'stick');

        // Se não tiver graveto mas tiver tábuas, fabrica gravetos rápido
        if (!temGraveto) {
            const totalPlanks = bot.inventory.items().filter(i => i.name.includes('planks')).reduce((acc, i) => acc + i.count, 0);
            if (totalPlanks >= 2) {
                await irParaMesa();
                await craftingFeature.craftarItem(bot, 'stick', craftingTable);
                temGraveto = true;
            }
        }

        // Tabela de materiais para espada (do melhor para o pior)
        const materiais = [
            { ing: 'diamond', result: 'diamond_sword' },
            { ing: 'iron_ingot', result: 'iron_sword' },
            { ing: 'cobblestone', result: 'stone_sword' },
            { ing: 'planks', result: 'wooden_sword', isPlank: true }
        ];

        if (temGraveto) {
            for (const mat of materiais) {
                let count = 0;
                if (mat.isPlank) {
                    count = bot.inventory.items().filter(i => i.name.includes('planks')).reduce((acc, i) => acc + i.count, 0);
                } else {
                    const item = bot.inventory.items().find(i => i.name === mat.ing);
                    count = item ? item.count : 0;
                }

                if (count >= 2) {
                    console.log(`[Armaria] Sem arma corpo a corpo! Fabricando ${mat.result.replace('_', ' ')}...`);
                    await irParaMesa();
                    const sucesso = await craftingFeature.craftarItem(bot, mat.result, craftingTable);
                    if (sucesso) return true; // Para aqui para vestir a espada e focar no combate
                }
            }
        }
    }

    return false; // Não precisou (ou não pôde) fabricar nada
}

module.exports = { fabricarEquipamentosFaltantes };