// novo/features/farm.js
const { goals } = require('mineflayer-pathfinder');

// Dicionário de cultivos suportados com suas idades máximas de crescimento e itens correspondentes
const CULTIVOS = [
    { bloco: 'wheat', idadeMaxima: 7, semente: 'wheat_seeds' },
    { bloco: 'carrots', idadeMaxima: 7, semente: 'carrot' },
    { bloco: 'potatoes', idadeMaxima: 7, semente: 'potato' },
    { bloco: 'beetroots', idadeMaxima: 3, semente: 'beetroot_seeds' }
];

async function cuidarDaFazenda(bot) {
    // ==========================================
    // PRIORIDADE 1: Colher qualquer cultivo maduro
    // ==========================================
    const cultivoPronto = bot.findBlock({
        matching: (block) => {
            // Procura no dicionário se o bloco atual é um cultivo conhecido
            const info = CULTIVOS.find(c => c.bloco === block.name);
            // Retorna true apenas se for um cultivo e estiver na idade máxima
            return info && block.metadata === info.idadeMaxima;
        },
        maxDistance: 32
    });

    if (cultivoPronto) {
        console.log(`[Agricultura] Encontrei ${cultivoPronto.name} maduro! Indo colher...`);
        try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(cultivoPronto.position.x, cultivoPronto.position.y, cultivoPronto.position.z));

            await bot.dig(cultivoPronto);
            console.log(`[Agricultura] ${cultivoPronto.name} colhido com sucesso!`);

            // Pausa rápida para o bot sugar os itens que caíram no chão
            await new Promise(resolve => setTimeout(resolve, 1000));
            return true;
        } catch (erro) {
            console.log("[Agricultura] Erro ao tentar colher:", erro.message);
            return false;
        }
    }

    // ==========================================
    // PRIORIDADE 2: Replantar Sementes
    // ==========================================
    // Procura na mochila a primeira semente válida que ele tiver
    let sementeNaMochila = null;
    for (const cultivo of CULTIVOS) {
        sementeNaMochila = bot.inventory.items().find(item => item.name === cultivo.semente);
        if (sementeNaMochila) break; // Achou uma semente, para de procurar
    }

    if (sementeNaMochila) {
        const terraAradaVazia = bot.findBlock({
            matching: bot.registry.blocksByName['farmland']?.id,
            maxDistance: 32,
            useExtraInfo: (block) => {
                const blocoAcima = bot.blockAt(block.position.offset(0, 1, 0));
                return blocoAcima && (blocoAcima.name === 'air' || blocoAcima.name === 'cave_air');
            }
        });

        if (terraAradaVazia) {
            console.log(`[Agricultura] Terra livre! Plantando ${sementeNaMochila.name}...`);
            try {
                await bot.pathfinder.goto(new goals.GoalGetToBlock(terraAradaVazia.position.x, terraAradaVazia.position.y, terraAradaVazia.position.z));

                await bot.equip(sementeNaMochila, 'hand');
                await bot.placeBlock(terraAradaVazia, { x: 0, y: 1, z: 0 });

                console.log("[Agricultura] Semente plantada!");
                return true;
            } catch (erro) {
                console.log("[Agricultura] Erro ao plantar a semente:", erro.message);
                return false;
            }
        }
    }

    return false; // Não precisou colher nem plantar
}

module.exports = { cuidarDaFazenda };