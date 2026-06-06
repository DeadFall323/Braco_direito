const { goals } = require('mineflayer-pathfinder');
const { normalizarTexto, nomeBot } = require('./text');

function processarComando(bot, username, comandoRecebido) {
    const comando = normalizarTexto(comandoRecebido);
    const nomeAtual = nomeBot(bot);

    if (comando === `${nomeAtual}, siga-me` || comando === `${nomeAtual}, siga me` || comando === 'vem ca') {
        const alvo = bot.players[username]?.entity;
        if (!alvo) return bot.chat('Nao te vejo!');

        bot.pathfinder.setGoal(new goals.GoalFollow(alvo, 2), true);
        bot.chat('Indo!');
        return;
    }

    if (comando === `${nomeAtual}, pare` || comando === 'pare') {
        bot.pathfinder.setGoal(null);
        bot.chat('Parei de fazer o que estava fazendo.');
    }
}

module.exports = { processarComando };
