// features/food.js
const { goals } = require('mineflayer-pathfinder');

const CARNES_CRUAS = ['beef', 'porkchop', 'mutton', 'chicken'];

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
            // Equipa uma arma se tiver
            const arma = bot.inventory.items().find(i => i.name.includes('sword') || i.name.includes('axe'));
            if (arma) await bot.equip(arma, 'hand');

            // CORREÇÃO CRÍTICA: Usa setGoal sem 'await' para seguir a entidade dinamicamente sem travar o código
            bot.pathfinder.setGoal(new goals.GoalFollow(alvo, 1.5), true);

            // Bate continuamente enquanto a entidade estiver viva no servidor
            while (alvo.isValid) {
                // Trava de segurança: Aborta a caça se a vida ficar crítica
                if (bot.health <= 8) {
                    console.log("[Nutrição] Vida crítica! Abortando caça.");
                    bot.pathfinder.setGoal(null);
                    return false;
                }

                bot.attack(alvo);

                // Espera 800ms (tempo natural de cooldown do machado/espada no Minecraft)
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            // O animal morreu! Remove o objetivo de seguir e espera os itens caírem
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

// Tier 2: O Chef João usa a fornalha para assar as carnes
async function cozinharComida(bot) {
    const blocoFornalha = bot.findBlock({ matching: bot.registry.blocksByName['furnace']?.id, maxDistance: 15 });
    if (!blocoFornalha) return false;

    const carneCrua = bot.inventory.items().find(item => CARNES_CRUAS.includes(item.name));
    const combustivel = bot.inventory.items().find(item => item.name.includes('log') || item.name.includes('planks') || item.name.includes('coal'));

    if (carneCrua && combustivel) {
        console.log(`[Nutrição] Assando ${carneCrua.name} na fornalha para render mais...`);
        try {
            if (bot.entity.position.distanceTo(blocoFornalha.position) > 3) {
                await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoFornalha.position.x, blocoFornalha.position.y, blocoFornalha.position.z));
            }

            const fornalha = await bot.openFurnace(blocoFornalha);
            await fornalha.putInput(carneCrua.type, null, 1);
            await fornalha.putFuel(combustivel.type, null, 1);

            // Espera exatos 10 segundos
            await new Promise(resolve => setTimeout(resolve, 10000));

            await fornalha.takeOutput();
            fornalha.close();

            console.log("[Nutrição] Carne assada com sucesso!");
            return true;
        } catch (erro) {
            console.log("[Nutrição] Deu problema na fornalha:", erro.message);
            return false;
        }
    }
    return false;
}

module.exports = { procurarComida, cozinharComida, CARNES_CRUAS };