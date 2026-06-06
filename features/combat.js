// features/combat.js
const { goals } = require('mineflayer-pathfinder');

// features/combat.js

const MONSTROS_HOSTIS = [
    // Clássicos da Superfície
    'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'slime', 'witch', 'silverfish', 'phantom',

    // Variantes de Zumbis e Esqueletos
    'drowned', 'husk', 'stray', 'zombie_villager',

    // Illagers (Invasões e Mansões)
    'pillager', 'vindicator', 'evoker', 'vex', 'ravager', 'illusioner',

    // Oceano
    'guardian', 'elder_guardian',

    // Nether
    'ghast', 'blaze', 'magma_cube', 'wither_skeleton', 'piglin_brute', 'hoglin', 'zoglin',

    // The End e Deep Dark
    'endermite', 'shulker', 'warden',

    // Chefões
    'wither', 'ender_dragon'
];

// 1. Radar de Ameaças (16 blocos)
function detectarAmeaca(bot) {
    return bot.nearestEntity(entity =>
        MONSTROS_HOSTIS.includes(entity.name) &&
        entity.position.distanceTo(bot.entity.position) <= 16
    );
}

// 2. Avaliação Lutar vs Fugir
// 2. Avaliação Lutar vs Fugir
function deveLutar(bot) {
    // 1. Verifica se tem alguma arma (Pega no inventário)
    const temArma = bot.inventory.items().some(i => i.name.includes('sword') || i.name.includes('axe'));

    // 2. Consulta a Memória: Eu posso lutar se estiver pelado?
    const regraLutarSemArmadura = bot.memoria?.regras?.lutarSemArmadura ?? true;

    if (!regraLutarSemArmadura) {
        // No Mineflayer, os slots de 5 a 8 são os slots da armadura no corpo do bot.
        const estaVestindoArmadura = bot.inventory.slots.slice(5, 9).some(item => item !== null);

        if (!estaVestindoArmadura) {
            console.log("[Memória] Estou sem armadura! A minha regra diz para não lutar assim. Vou fugir!");
            return false;
        }
    }

    // Se estiver de armadura (ou se a regra permitir) e a vida não estiver no fim, ele luta!
    return bot.health > 8;
}



// 3. Sistema de Ataque Dinâmico (Arco vs Espada)
let tempoInicioTiro = 0; // Memória de quando ele começou a puxar a corda do arco

// 3. Sistema de Ataque Dinâmico (Arco vs Espada)
async function atacarAlvo(bot, alvo) {
    const inimigosDeLonge = ['skeleton', 'creeper'];
    let usarArco = false;

    // Checa se é um monstro perigoso de perto e se tem munição
    if (inimigosDeLonge.includes(alvo.name)) {
        const arco = bot.inventory.items().find(i => i.name === 'bow');
        const temFlecha = bot.inventory.items().some(i => i.name === 'arrow');
        if (arco && temFlecha) usarArco = true;
    }

    if (usarArco) {
        // MODO ARQUEIRO
        bot.pvp.stop(); // Desliga o rush suicida do plugin de PVP

        // Equipa o arco se ainda não estiver na mão
        const itemNaMao = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
        if (!itemNaMao || itemNaMao.name !== 'bow') {
            const arco = bot.inventory.items().find(i => i.name === 'bow');
            try { await bot.equip(arco, 'hand'); } catch (e) {}
        }

        // Calcula a parábola da flecha (mira mais pro alto quanto mais longe o alvo estiver)
        const distancia = bot.entity.position.distanceTo(alvo.position);
        const compensacaoGravidade = distancia * 0.05;
        await bot.lookAt(alvo.position.offset(0, alvo.height + compensacaoGravidade, 0), true);

        // Máquina de estados interna do Tiro com Arco
        if (tempoInicioTiro === 0) {
            bot.activateItem(); // Começa a puxar a corda do arco
            tempoInicioTiro = Date.now();
        } else if (Date.now() - tempoInicioTiro > 1200) {
            bot.deactivateItem(); // Já deu 1.2 segundos! Solta a flecha no alvo!
            tempoInicioTiro = 0;  // Reseta para engatilhar a próxima flecha
        }

    } else {
        // MODO ESPADA/MACHADO
        tempoInicioTiro = 0; // Cancela qualquer tiro que estava carregando

        // Se o plugin já não estiver focado no inimigo, atualiza a arma e ataca
        if (bot.pvp.target !== alvo) {
            const arma = bot.inventory.items().find(i => i.name.includes('sword') || i.name.includes('axe'));
            if (arma) {
                try { await bot.equip(arma, 'hand'); } catch (e) {}
            } else {
                try { await bot.unequip('hand'); } catch (e) {}
            }
            bot.pvp.attack(alvo);
        }
    }
}

function pararCombate(bot) {
    bot.pvp.stop();
    bot.deactivateItem(); // Solta o escudo E a corda do arco
    tempoInicioTiro = 0;
}

// 4. Sistema Defensivo (Mão Secundária)
async function tentarDefender(bot, ameaca) {
    // TRAVA: Se a arma principal for o arco, desabilita a automação do escudo para não cancelar as flechadas!
    const itemNaMao = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
    if (itemNaMao && itemNaMao.name === 'bow') return;

    const escudo = bot.inventory.items().find(item => item.name === 'shield');
    if (!escudo) return;

    try {
        const offhandSlot = bot.inventory.slots[45];
        if (!offhandSlot || offhandSlot.name !== 'shield') {
            await bot.equip(escudo, 'off-hand');
        }

        const distancia = bot.entity.position.distanceTo(ameaca.position);

        if ((ameaca.name === 'skeleton' && distancia < 15) || (ameaca.name === 'creeper' && distancia < 5)) {
            bot.activateItem(true);
        } else {
            bot.deactivateItem();
        }
    } catch (erro) {
        console.log("[Combate] Erro ao manipular o escudo.");
    }
}

// ==========================================
// 5. SISTEMA DE ARMADURAS INTELIGENTE
// ==========================================
const EQUIPAMENTOS = {
    'helmet': { slotId: 5, destino: 'head' },
    'chestplate': { slotId: 6, destino: 'torso' },
    'leggings': { slotId: 7, destino: 'legs' },
    'boots': { slotId: 8, destino: 'feet' }
};

const MATERIAL_TIER = {
    'leather': 10,
    'golden': 20,
    'chainmail': 30,
    'iron': 40,
    'diamond': 50,
    'netherite': 60
};

function calcularScoreArmadura(item) {
    if (!item) return 0;
    let score = 0;

    // Pontua com base no material
    for (const [material, valor] of Object.entries(MATERIAL_TIER)) {
        if (item.name.includes(material)) {
            score += valor;
            break;
        }
    }

    // Bônus se a armadura for encantada (verifica as tags NBT do Minecraft)
    if (item.nbt && item.nbt.value && (item.nbt.value.ench || item.nbt.value.Enchantments)) {
        score += 15;
    }

    return score;
}

async function equiparMelhorArmadura(bot) {
    let vestiuAlgo = false;
    const inventario = bot.inventory.items();

    for (const [sufixo, config] of Object.entries(EQUIPAMENTOS)) {
        // Filtra o inventário buscando apenas peças daquele tipo (ex: só capacetes)
        const pecasDisponiveis = inventario.filter(i => i.name.endsWith(sufixo));
        if (pecasDisponiveis.length === 0) continue;

        // Ordena da melhor armadura para a pior com base no score
        pecasDisponiveis.sort((a, b) => calcularScoreArmadura(b) - calcularScoreArmadura(a));
        const melhorPeca = pecasDisponiveis[0];

        // Compara a melhor peça da mochila com o que ele está usando no corpo agora
        const itemEquipadoAtual = bot.inventory.slots[config.slotId];
        const scoreAtual = calcularScoreArmadura(itemEquipadoAtual);
        const scoreNovo = calcularScoreArmadura(melhorPeca);

        if (scoreNovo > scoreAtual) {
            try {
                console.log(`[Defesa] Melhoria detectada! Vestindo ${melhorPeca.name}...`);
                await bot.equip(melhorPeca, config.destino);
                vestiuAlgo = true;

                // Pequena pausa para o servidor processar a troca e a animação
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (erro) {
                console.log(`[Defesa] Erro ao vestir ${melhorPeca.name}:`, erro.message);
            }
        }
    }
    return vestiuAlgo;
}

module.exports = { detectarAmeaca, deveLutar, atacarAlvo, pararCombate, tentarDefender, equiparMelhorArmadura };