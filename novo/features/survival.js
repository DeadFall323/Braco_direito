// teste/features/survival.js
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

// ===============================================
// FUNÇÃO: Fuga Estratégica (Vida Baixa)
// ===============================================
async function fugaEstrategica(bot) {
    try {
        if (bot.personality.homePosition) {
            console.log("[Sobrevivência] Correndo para a segurança da casa!");
            bot.pathfinder.setGoal(new goals.GoalBlock(
                bot.personality.homePosition.x,
                bot.personality.homePosition.y,
                bot.personality.homePosition.z
            ));
        } else {
            console.log("[Sobrevivência] Não tenho casa! Correndo desesperadamente sem direção!");
            // Calcula um ponto aleatório a cerca de 15 blocos de distância para fugir
            const randomX = bot.entity.position.x + (Math.random() * 30 - 15);
            const randomZ = bot.entity.position.z + (Math.random() * 30 - 15);

            // Corre para esse ponto aleatório
            bot.pathfinder.setGoal(new goals.GoalNear(randomX, bot.entity.position.y, randomZ, 2));
        }
    } catch (erro) {
        console.log("Erro ao executar fuga estratégica:", erro.message);
    }
}

module.exports = { fugaEstrategica };