// teste/features/builder.js
const { Vec3 } = require('vec3');

// Define como é a casa perfeita do João (uma cabana básica de 5x5)
// Tudo é calculado com base na homePosition (x=0, y=0, z=0 é o centro)
function obterEsquemaDaCasa(homePos) {
    const esquema = [];

    // 1. CHÃO (Madeira)
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            esquema.push({ pos: homePos.offset(x, -1, z), material: 'oak_planks', tipo: 'chao' });
        }
    }

    // 2. PAREDES (Madeira) com altura de 3 blocos
    for (let y = 0; y < 3; y++) {
        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
                // Apenas as bordas formam as paredes
                if (x === -2 || x === 2 || z === -2 || z === 2) {

                    // Deixa um buraco para a porta na frente (x=0, z=2)
                    if (x === 0 && z === 2 && (y === 0 || y === 1)) {
                        continue; // Aqui vai a porta, não colocamos parede
                    }
                    esquema.push({ pos: homePos.offset(x, y, z), material: 'oak_planks', tipo: 'parede' });
                }
            }
        }
    }

    // 3. TETO (Madeira)
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            esquema.push({ pos: homePos.offset(x, 3, z), material: 'oak_planks', tipo: 'teto' });
        }
    }

    // 4. MOBÍLIA E UTILIDADES (A parte que o torna autônomo)
    esquema.push({ pos: homePos.offset(0, 0, 2), material: 'oak_door', tipo: 'porta' });
    esquema.push({ pos: homePos.offset(-1, 0, -1), material: 'crafting_table', tipo: 'crafting_table' });
    esquema.push({ pos: homePos.offset(1, 0, -1), material: 'furnace', tipo: 'furnace' });
    esquema.push({ pos: homePos.offset(-1, 0, 1), material: 'chest', tipo: 'chest' });
    esquema.push({ pos: homePos.offset(1, 0, 1), material: 'red_bed', tipo: 'cama' });

    return esquema;
}

// O João olha para o mundo e anota na prancheta o que falta
async function auditarObra(bot) {
    if (!bot.personality.homePosition) return null;

    const esquema = obterEsquemaDaCasa(bot.personality.homePosition);
    const pendencias = [];

    for (const item of esquema) {
        const blocoNoMundo = bot.blockAt(item.pos);

        // Se o bloco no mundo for ar, água, ou um material diferente do que ele quer
        if (!blocoNoMundo || blocoNoMundo.name === 'air' || blocoNoMundo.name === 'cave_air' || !blocoNoMundo.name.includes(item.material.replace('oak_', ''))) {
            pendencias.push(item);
        }
    }

    return pendencias; // Retorna uma lista de blocos que precisam ser construídos
}

module.exports = { auditarObra };