const { goals } = require('mineflayer-pathfinder');

const CULTIVOS = [
    { nomePopular: 'trigo', bloco: 'wheat', idadeMaxima: 7, semente: 'wheat_seeds' },
    { nomePopular: 'cenoura', bloco: 'carrots', idadeMaxima: 7, semente: 'carrot' },
    { nomePopular: 'batata', bloco: 'potatoes', idadeMaxima: 7, semente: 'potato' },
    { nomePopular: 'beterraba', bloco: 'beetroots', idadeMaxima: 3, semente: 'beetroot_seeds' }
];

async function cuidarDaFazenda(bot) {
    // ==========================================
    // PRIORIDADE 1: COLHER
    // ==========================================
    const cultivoPronto = bot.findBlock({
        matching: (block) => {
            const info = CULTIVOS.find(c => c.bloco === block.name);
            return info && block.metadata === info.idadeMaxima;
        },
        maxDistance: 32
    });

    if (cultivoPronto) {
        console.log(`[Agricultura] Colhendo ${cultivoPronto.name}...`);
        try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(cultivoPronto.position.x, cultivoPronto.position.y, cultivoPronto.position.z));
            await bot.dig(cultivoPronto);
            await new Promise(resolve => setTimeout(resolve, 800)); // Pausa para sugar os itens
            return true;
        } catch (erro) { return false; }
    }

    // ==========================================
    // PRIORIDADE 2: PLANTAR (Livre vs Focado)
    // ==========================================
    const terraAradaVazia = bot.findBlock({
        matching: bot.registry.blocksByName['farmland']?.id,
        maxDistance: 32,
        useExtraInfo: (block) => {
            const blocoAcima = bot.blockAt(block.position.offset(0, 1, 0));
            return blocoAcima && (blocoAcima.name === 'air' || blocoAcima.name === 'cave_air');
        }
    });

    if (terraAradaVazia) {
        const preferencia = bot.memoria?.regras?.preferenciaPlantio;
        let sementeAlvo = null;

        // 1. O que o Mestre mandou plantar?
        if (preferencia && preferencia !== 'livre' && preferencia !== 'qualquer') {
            const info = CULTIVOS.find(c => c.nomePopular === preferencia || c.semente === preferencia);
            if (info) sementeAlvo = info.semente;
        }

        // 2. Busca na mochila
        let itemNaMochila = null;
        if (sementeAlvo) {
            // Modo Focado: Procura apenas a semente exigida
            itemNaMochila = bot.inventory.items().find(i => i.name === sementeAlvo);
        } else {
            // Modo Livre: Pega a primeira semente válida que achar
            itemNaMochila = bot.inventory.items().find(i => CULTIVOS.some(c => c.semente === i.name));
            if (itemNaMochila) sementeAlvo = itemNaMochila.name;
        }

        // 3. Acabou na mochila? Modo Almoxarifado (Vasculha os Baús)
        // 3. Acabou na mochila? Modo Almoxarifado (Vasculha os Baús)
        if (!itemNaMochila && sementeAlvo) {

            // ==========================================
            // TRAVA ANTI-SPAM: Pausa o plantio por 30s
            // ==========================================
            if (bot.pausaPlantio && Date.now() - bot.pausaPlantio < 30000) {
                return false; // Retorna silenciosamente para não floodar o terminal
            }

            console.log(`[Agricultura] Sem ${sementeAlvo} na mochila. Buscando nos baús da base...`);
            const bausProximos = bot.findBlocks({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15, count: 5 });
            let pegouDoBau = false;

            for (const pos of bausProximos) {
                const blocoBau = bot.blockAt(pos);
                try {
                    if (bot.entity.position.distanceTo(blocoBau.position) > 2) {
                        await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoBau.position.x, blocoBau.position.y, blocoBau.position.z));
                    }
                    const bau = await bot.openContainer(blocoBau);
                    const itemNoBau = bau.containerItems().find(i => i.name === sementeAlvo);

                    if (itemNoBau) {
                        // Tira um "pack" inteiro do baú para render
                        await bau.withdraw(itemNoBau.type, itemNoBau.metadata, Math.min(itemNoBau.count, 64));
                        pegouDoBau = true;
                    }
                    await bau.close();
                    if (pegouDoBau) break; // Achou! Pode parar de olhar outros baús.
                } catch (e) {
                    // Ignora silenciosamente baús bloqueados ou falhas de caminho
                }
            }

            if (!pegouDoBau) {
                console.log(`[Agricultura] Fiquei sem ${sementeAlvo} nos baús também! Pausando plantio por 30 segundos.`);
                bot.pausaPlantio = Date.now(); // ATIVA O COOLDOWN AQUI!
                return false;
            } else {
                bot.pausaPlantio = 0; // Desativa o cooldown se achou
                return true;
            }
        }

        // 4. Tem a semente na mão? Mão na terra!
        if (itemNaMochila) {
            try {
                await bot.pathfinder.goto(new goals.GoalGetToBlock(terraAradaVazia.position.x, terraAradaVazia.position.y, terraAradaVazia.position.z));
                await bot.equip(itemNaMochila, 'hand');
                await bot.placeBlock(terraAradaVazia, { x: 0, y: 1, z: 0 });
                return true;
            } catch (e) {
                console.log("[Agricultura] Problema com a terra:", e.message);
                return false;
            }
        }
    }
    return false;
}

module.exports = { cuidarDaFazenda };