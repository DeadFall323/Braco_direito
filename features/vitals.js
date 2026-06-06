// teste/features/vitals.js

// Lista de alimentos que o João reconhece como comestíveis (do melhor para o pior)
// A lista agora está ordenada da MELHOR comida para a PIOR comida (carnes cruas no final)
const COMIDAS_VALIDAS = [
    'golden_apple', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken',
    'bread', 'baked_potato', 'apple', 'carrot', 'sweet_berries',
    'beef', 'porkchop', 'mutton', 'chicken'
];

async function comer(bot) {
    let comida = null;

    // Vasculha o inventário respeitando a ordem de preferência
    for (const nomeComida of COMIDAS_VALIDAS) {
        comida = bot.inventory.items().find(item => item.name === nomeComida);
        if (comida) break;
    }

    if (!comida) return false;

    try {
        console.log(`[Vitais] Comendo ${comida.name} para saciar a fome...`);
        await bot.equip(comida, 'hand');
        await bot.consume();
        console.log("[Vitais] Fome saciada.");
        return true;
    } catch (erro) {
        console.log("[Vitais] Erro ao tentar comer:", erro.message);
        return false;
    }
}
// Essa função será o "termômetro" lido pela Máquina de Estados a cada segundo
function avaliarSaude(bot) {
    const fomeCritica = bot.food <= 14;
    const precisaCurar = bot.health < 20 && bot.food < 20;

    return {
        fome: bot.food,
        vida: bot.health,
        precisaComer: fomeCritica || precisaCurar,
        emPerigo: bot.health <= 8
    };
}

module.exports = { comer, avaliarSaude };