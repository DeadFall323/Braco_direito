// novo/features/armory.js
const { goals } = require('mineflayer-pathfinder');
const craftingFeature = require('./crafting');


async function fabricarEquipamentosFaltantes(bot) {
    const craftingTable = bot.findBlock({ matching: bot.registry.blocksByName['crafting_table']?.id, maxDistance: 15 });
    if (!craftingTable) return false;

    // Função auxiliar COM PROTEÇÃO CONTRA ERROS
    const irParaMesa = async () => {
        try {
            if (bot.entity.position.distanceTo(craftingTable.position) > 3) {
                await bot.pathfinder.goto(new goals.GoalGetToBlock(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z));
            }
            return true;
        } catch (err) {
            console.log("[Armaria] Caminho bloqueado para a mesa de trabalho!");
            return false;
        }
    };

    // ==========================================
    // PRIORIDADE 1: ESCUDO
    // ==========================================
    const temEscudo = bot.inventory.items().some(i => i.name === 'shield');
    if (!temEscudo) {
        const temFerro = bot.inventory.items().some(i => i.name === 'iron_ingot');
        const totalPlanks = bot.inventory.items().filter(i => i.name.includes('planks')).reduce((acc, i) => acc + i.count, 0);

        if (temFerro && totalPlanks >= 6) {
            console.log("[Armaria] Estou vulneravel! Indo fabricar um Escudo...");
            if (!(await irParaMesa())) return false; // Aborta se não chegar na mesa
            const sucesso = await craftingFeature.craftarItem(bot, 'shield', craftingTable);
            if (sucesso) return true;
        }
    }

    // ==========================================
    // PRIORIDADE 2: ESPADA
    // ==========================================
    const temEspada = bot.inventory.items().some(i => i.name.includes('sword'));
    if (!temEspada) {
        let temGraveto = bot.inventory.items().some(i => i.name === 'stick');

        if (!temGraveto) {
            const totalPlanks = bot.inventory.items().filter(i => i.name.includes('planks')).reduce((acc, i) => acc + i.count, 0);
            if (totalPlanks >= 2) {
                if (!(await irParaMesa())) return false;
                await craftingFeature.craftarItem(bot, 'stick', craftingTable);
                temGraveto = true;
            }
        }

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
                    if (!(await irParaMesa())) return false;
                    const sucesso = await craftingFeature.craftarItem(bot, mat.result, craftingTable);
                    if (sucesso) return true;
                }
            }
        }
    }

    return false;
}

module.exports = { fabricarEquipamentosFaltantes };