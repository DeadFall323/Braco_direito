const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const llmFeature = require('./features/llm');
const movementFeature = require('./features/movement');
const gatherFeature = require('./features/gather');
const personalityFeature = require('./features/personality');
const { normalizarTexto, nomeBot, removerPrefixoDoBot } = require('./features/text');
const pvp = require('mineflayer-pvp').plugin;

function iniciarBot(port, username = process.env.BOT_USERNAME || 'Joao') {
    const bot = mineflayer.createBot({
        host: '127.0.0.1',
        port,
        username,
        version: '1.20.4'
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);

    bot.on('spawn', () => {
        console.log(`Bot ${bot.username} entrou no mundo e carregou todos os modulos!`);
        const defaultMove = new Movements(bot);
        bot.pathfinder.setMovements(defaultMove);

        personalityFeature.initPersonality(bot);
    });

    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        const comando = normalizarTexto(message);
        const nomeAtual = nomeBot(bot);

        // Verifica se a mensagem começa com o nome do bot (ex: "Joao, ...")
        if (comando.startsWith(`${nomeAtual}, `) || comando.startsWith(`${nomeAtual} `)) {
            const pergunta = removerPrefixoDoBot(bot, message);

            // Agora passamos o username de quem falou para a IA saber quem seguir!
            await llmFeature.pensarComOllama(bot, username, pergunta);
        }


        if (comando.includes('aqui e sua casa') || comando.includes('fique de guarda') || comando.includes('pode dormir')) {
            personalityFeature.processarComando(bot, username, comando);
            return;
        }

        if (comando.startsWith(`${nomeAtual}, pegue `)) {
            gatherFeature.processarComando(bot, username, comando);
            return;
        }

        if (comando === `${nomeAtual}, siga-me` || comando === `${nomeAtual}, siga me` || comando === 'vem ca') {
            movementFeature.processarComando(bot, username, comando);
            return;
        }

        if (comando === `${nomeAtual}, pare` || comando === 'pare') {
            movementFeature.processarComando(bot, username, comando);
            return;
        }

        if (comando.startsWith(`${nomeAtual}, `)) {
            const pergunta = removerPrefixoDoBot(bot, message);
            await llmFeature.pensarComOllama(bot, pergunta);
        }
        // Intercepta ordens de trabalho e moradia
        if (comando.includes('aqui e sua casa') || comando.includes('fique de guarda') || comando.includes('fique de patrulha') || comando.includes('pode dormir') || comando.includes('pode trabalhar')) {
            personalityFeature.processarComando(bot, username, comando);
            return;
        }
    });

    bot.on('kicked', (reason) => {
        const motivo = typeof reason === 'object' ? JSON.stringify(reason) : reason;
        console.log(`Fui expulso: ${motivo}`);
    });

    bot.on('error', (err) => console.log(`Erro no sistema: ${err.message}`));
}

module.exports = { iniciarBot, iniciarKelvin: iniciarBot };
