const { goals } = require('mineflayer-pathfinder');

// A batata agora é considerada um item "cru" que pode ir ao forno!
const CARNES_CRUAS = ['beef', 'porkchop', 'mutton', 'chicken', 'potato'];

const RECEITAS_FORNALHA = [
    { cru: 'beef', assado: 'cooked_beef' },
    { cru: 'porkchop', assado: 'cooked_porkchop' },
    { cru: 'mutton', assado: 'cooked_mutton' },
    { cru: 'chicken', assado: 'cooked_chicken' },
    { cru: 'potato', assado: 'baked_potato' }
];

async function procurarComida(bot) {
    console.log("[Nutrição] A fome bateu! Procurando alimento na natureza...");

    // PRIORIDADE 1: Caça (Animais)
    const animais = ['cow', 'pig', 'sheep', 'chicken'];
    const alvo = bot.nearestEntity(entity =>
        animais.includes(entity.name) &&
        entity.position.distanceTo(bot.entity.position) < 32
    );

    if (alvo) {
        console.log(`[Nutrição] Avistei um(a) ${alvo.name}! Iniciando caça...`);
        try {
            const arma = bot.inventory.items().find(i => i.name.includes('sword') || i.name.includes('axe'));
            if (arma) await bot.equip(arma, 'hand');

            bot.pathfinder.setGoal(new goals.GoalFollow(alvo, 1.5), true);

            while (alvo.isValid) {
                if (bot.health <= 8) {
                    console.log("[Nutrição] Vida crítica! Abortando caça.");
                    bot.pathfinder.setGoal(null);
                    return false; 
                }
                bot.attack(alvo); 
                await new Promise(resolve => setTimeout(resolve, 800)); 
            }

            bot.pathfinder.setGoal(null); 
            await new Promise(resolve => setTimeout(resolve, 1500)); 
            return true; 
        } catch (erro) {
            console.log("[Nutrição] Falha ao caçar animal:", erro.message); 
            bot.pathfinder.setGoal(null); 
            return false; 
        }
    }

    // PRIORIDADE 2: Coleta Passiva (Arbustos de Berries)
    const berryBush = bot.findBlock({
        matching: bot.registry.blocksByName['sweet_berry_bush']?.id, 
    maxDistance: 32 
}); 

    if (berryBush) {
        console.log("[Nutrição] Encontrei arbustos de frutas!"); 
        try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(berryBush.position.x, berryBush.position.y, berryBush.position.z)); 
            await bot.activateBlock(berryBush); 
            await new Promise(resolve => setTimeout(resolve, 500)); 
            return true; 
        } catch (erro) {
            console.log("[Nutrição] Erro ao colher frutinhas."); 
        }
    }

    console.log("[Nutrição] Não encontrei nenhuma fonte de comida por perto."); 
    return false; 
}

async function cozinharComida(bot) {
    const blocoFornalha = bot.findBlock({ matching: bot.registry.blocksByName['furnace']?.id, maxDistance: 15 }); 
    if (!blocoFornalha) return false; 

    const itemCru = bot.inventory.items().find(item => CARNES_CRUAS.includes(item.name)); 
    const combustivel = bot.inventory.items().find(item => item.name.includes('coal') || item.name.includes('log') || item.name.includes('planks')); 

    if (itemCru && combustivel) {
        console.log(`[Cozinha] Vou assar ${itemCru.name} na fornalha!`);
        try {
            if (bot.entity.position.distanceTo(blocoFornalha.position) > 3) {
                await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoFornalha.position.x, blocoFornalha.position.y, blocoFornalha.position.z)); 
            }

            const fornalha = await bot.openFurnace(blocoFornalha); 
            await fornalha.putInput(itemCru.type, null, 1); 
            await fornalha.putFuel(combustivel.type, null, 1); 

            await new Promise(resolve => setTimeout(resolve, 10500)); // Tempo para assar 1 item

            await fornalha.takeOutput(); 
            fornalha.close(); 

            console.log("[Cozinha] Terminei de assar!");
            return true;
        } catch (erro) {
            console.log("[Cozinha] Deu problema na fornalha:", erro.message); 
            return false; 
        }
    }
    return false; 
}

module.exports = { procurarComida, cozinharComida, CARNES_CRUAS, RECEITAS_FORNALHA };