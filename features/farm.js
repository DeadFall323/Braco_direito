const { goals } = require('mineflayer-pathfinder');

const CULTIVOS = [
    { nomePopular: 'trigo', bloco: 'wheat', idadeMaxima: 7, semente: 'wheat_seeds' },  
{ nomePopular: 'cenoura', bloco: 'carrots', idadeMaxima: 7, semente: 'carrot' },  
{ nomePopular: 'batata', bloco: 'potatoes', idadeMaxima: 7, semente: 'potato' },  
{ nomePopular: 'beterraba', bloco: 'beetroots', idadeMaxima: 3, semente: 'beetroot_seeds' }  
];

async function cuidarDaFazenda(bot) {
    const cultivoPronto = bot.findBlock({
        matching: (block) => {
            const info = CULTIVOS.find(c => c.bloco === block.name);  
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
            await new Promise(resolve => setTimeout(resolve, 1000));  
            return true;  
        } catch (erro) {
            console.log("[Agricultura] Erro ao tentar colher:", erro.message);  
            return false;  
        }
    }

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

        const sementesUnicas = [...new Set(bot.inventory.items()
            .filter(i => CULTIVOS.some(c => c.semente === i.name))
            .map(i => i.name))];

        if (sementesUnicas.length === 0) return false;

        if (!preferencia && sementesUnicas.length > 1) {
            const nomes = sementesUnicas.map(s => CULTIVOS.find(c => c.semente === s).nomePopular).join(', ');
            bot.chat(`Chefe, a terra está pronta e eu tenho sementes de ${nomes}. Qual quer que eu plante?`);

            if(!bot.memoria.regras) bot.memoria.regras = {};
            bot.memoria.regras.preferenciaPlantio = 'aguardando_ordem';
            return true;
        }

        if (preferencia === 'aguardando_ordem') return false;

        // Define a semente a usar (a preferida, ou a única que ele tem)
        let sementeEscolhida = null;
        if (preferencia && preferencia !== 'aguardando_ordem') {
            // CORREÇÃO: Agora ele aceita tanto o nome em português (cenoura) quanto em inglês (carrot)
            const infoCultivo = CULTIVOS.find(c => c.nomePopular === preferencia || c.semente === preferencia);
            sementeEscolhida = infoCultivo ? infoCultivo.semente : null;
        } else if (sementesUnicas.length === 1) {
            sementeEscolhida = sementesUnicas[0];
        }

        // Se ele não tem a semente preferida na mochila, avisa e reseta a ordem!
        // Se ele não tem a semente preferida na mochila, VAI PROCURAR NOS BAÚS!
        let itemNaMochila = bot.inventory.items().find(i => i.name === sementeEscolhida);

        if (!itemNaMochila) {
            console.log(`[Agricultura] Fiquei sem ${sementeEscolhida}. Vou procurar nos baús próximos...`);

            // Encontra até 5 baús num raio de 15 blocos
            const bausProximos = bot.findBlocks({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15, count: 5 });
            let encontrouNoBau = false;

            for (const pos of bausProximos) {
                const blocoBau = bot.blockAt(pos);
                try {
                    // Vai até ao baú
                    if (bot.entity.position.distanceTo(blocoBau.position) > 2) {
                        await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoBau.position.x, blocoBau.position.y, blocoBau.position.z));
                    }

                    const bau = await bot.openContainer(blocoBau);
                    const itemAlvo = bau.containerItems().find(i => i.name === sementeEscolhida);

                    // Se achou a semente, retira até 64 unidades!
                    if (itemAlvo) {
                        await bau.withdraw(itemAlvo.type, itemAlvo.metadata, Math.min(itemAlvo.count, 64));
                        encontrouNoBau = true;
                        console.log(`[Agricultura] Bingo! Achei as sementes no baú.`);
                    }
                    await bau.close();

                    if (encontrouNoBau) break; // Para de procurar se já achou
                } catch (e) {
                    console.log("[Agricultura] Não consegui abrir este baú.");
                }
            }

            // Se procurou em tudo e não achou, aí sim ele avisa o chefe
            if (!encontrouNoBau) {
                bot.chat(`Chefe, as sementes acabaram na minha mochila e não encontrei mais nenhuma nos nossos baús!`);
                bot.memoria.regras.preferenciaPlantio = null; // Reseta a ordem
                return true;
            } else {
                return true; // Vai tentar plantar no próximo "tick" do cérebro, agora que tem as sementes!
            }
        }
        }
    }
module.exports = { cuidarDaFazenda };