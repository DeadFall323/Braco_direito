const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const llmFeature = require('./features/llm');
const personalityFeature = require('./features/personality');
const { normalizarTexto, nomeBot, removerPrefixoDoBot } = require('./features/text');

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

    // ROTEADOR DE INTENÇÕES ÚNICO E LIMPO
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        const comando = normalizarTexto(message);
        const nomeAtual = nomeBot(bot);

        if (comando.startsWith(`${nomeAtual}, `) || comando.startsWith(`${nomeAtual} `)) {
            const pergunta = removerPrefixoDoBot(bot, message);
            await llmFeature.pensarComOllama(bot, username, pergunta);
        }
    });

    bot.on('kicked', (reason) => {
        const motivo = typeof reason === 'object' ? JSON.stringify(reason) : reason;
        console.log(`Fui expulso: ${motivo}`);
    });

    bot.on('error', (err) => console.log(`Erro no sistema: ${err.message}`));
}

module.exports = { iniciarBot, iniciarKelvin: iniciarBot };