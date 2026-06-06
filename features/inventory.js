// teste/features/inventory.js
const { goals } = require('mineflayer-pathfinder');

// Dicionário para traduzir o seu pedido no chat para o ID do jogo
const DICIONARIO_BUSCA = {
    'trigo': 'wheat_seeds',
    'batata': 'potato',
    'cenoura': 'carrot',
    'beterraba': 'beetroot_seeds',
    'madeira': 'oak_log',
    'pedra': 'cobblestone',
    'ferro': 'iron_ingot',
    'carvao': 'coal'
};

async function procurarItemEmBaus(bot, nomeDoItem) {
    const idMinecraft = DICIONARIO_BUSCA[nomeDoItem.toLowerCase()] || nomeDoItem.toLowerCase();

    const bausProximos = bot.findBlocks({ matching: bot.registry.blocksByName['chest']?.id, maxDistance: 15, count: 8 });

    if (bausProximos.length === 0) {
        bot.chat("Chefe, não tem nenhum baú aqui perto para eu procurar!");
        return false;
    }

    for (const pos of bausProximos) {
        const blocoBau = bot.blockAt(pos);
        try {
            // Caminha até o baú
            if (bot.entity.position.distanceTo(blocoBau.position) > 2) {
                await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoBau.position.x, blocoBau.position.y, blocoBau.position.z));
            }

            const bau = await bot.openContainer(blocoBau);

            // Procura o item (aceita ID exato ou parte do nome)
            const itemNoBau = bau.containerItems().find(i => i.name.includes(idMinecraft) || i.name === idMinecraft);

            if (itemNoBau) {
                // Puxa até 64 unidades do item
                await bau.withdraw(itemNoBau.type, itemNoBau.metadata, Math.min(itemNoBau.count, 64));
                bot.chat(`Bingo! Achei ${nomeDoItem} num dos baús.`);
                await bau.close();
                return true;
            }
            await bau.close();
        } catch (e) {
            console.log("[Inventário] Erro ao abrir um baú:", e.message);
        }
    }

    bot.chat(`Revirei todos os baús e não encontrei nada de ${nomeDoItem}. Tem certeza de que guardou aí?`);
    return false;
}

// Lista de itens que o João NUNCA deve guardar no baú (ferramentas, comida, etc.)
const ITENS_ESSENCIAIS = [
    'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe',
    'wooden_axe', 'stone_axe', 'iron_axe',
    'bread', 'cooked_beef', 'apple', 'torch'
];

// 1. Verifica se o bot já tem o item na própria mochila
function temNoInventario(bot, nomeDoItem, quantidadeNecessaria = 1) {
    const itens = bot.inventory.items().filter(item => item.name === nomeDoItem);
    const total = itens.reduce((acc, item) => acc + item.count, 0);
    return total >= quantidadeNecessaria;
}

// 2. Procura um item específico no baú e retira
async function pegarDoBau(bot, blocoBau, nomeDoItem, quantidade) {
    if (!blocoBau) return false;

    try {
        // Anda até o baú se estiver longe
        if (bot.entity.position.distanceTo(blocoBau.position) > 3) {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoBau.position.x, blocoBau.position.y, blocoBau.position.z));
        }

        const bau = await bot.openContainer(blocoBau);
        const itemNoBau = bau.containerItems().find(item => item.name === nomeDoItem);

        if (itemNoBau) {
            const qtdParaPegar = Math.min(quantidade, itemNoBau.count);
            await bau.withdraw(itemNoBau.type, null, qtdParaPegar);
            bot.chat(`Peguei ${qtdParaPegar} ${nomeDoItem} no baú!`);
            bau.close();
            return true;
        }

        bau.close();
        return false;
    } catch (erro) {
        console.log("Erro ao interagir com o baú para retirar:", erro.message);
        return false;
    }
}

// 3. Guarda tudo o que não for essencial
async function descarregarInventario(bot, blocoBau) {
    if (!blocoBau) {
        bot.chat("Não tenho um baú para guardar minhas coisas!");
        return false;
    }

    try {
        if (bot.entity.position.distanceTo(blocoBau.position) > 3) {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(blocoBau.position.x, blocoBau.position.y, blocoBau.position.z));
        }

        const bau = await bot.openContainer(blocoBau);
        bot.chat("Organizando meu inventário no baú...");

        for (const item of bot.inventory.items()) {
            if (!ITENS_ESSENCIAIS.includes(item.name)) {
                try {
                    await bau.deposit(item.type, null, item.count);
                } catch (err) {
                    console.log(`Baú cheio ou erro ao guardar ${item.name}`);
                    break; // Sai do loop se o baú estiver cheio
                }
            }
        }

        bau.close();
        return true;
    } catch (erro) {
        console.log("Erro ao interagir com o baú para depositar:", erro.message);
        return false;
    }
}

// 4. Calcula a percentagem de ocupação da mochila
function inventarioEstaCheio(bot) {
    // O inventário principal do Minecraft tem 36 slots
    const slotsOcupados = bot.inventory.items().length;
    return slotsOcupados >= 30; // Se tiver 30 ou mais slots ocupados, consideramos "quase cheio"
}

module.exports = {
    temNoInventario,
    pegarDoBau,
    descarregarInventario,
    inventarioEstaCheio,
    procurarItemEmBaus
};