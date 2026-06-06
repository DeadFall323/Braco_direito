function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function nomeBot(bot) {
    return normalizarTexto(bot.username || bot.personality?.nome || '');
}

function removerPrefixoDoBot(bot, mensagem) {
    const indiceVirgula = mensagem.indexOf(',');
    if (indiceVirgula === -1) return mensagem.trim();

    const possivelNome = normalizarTexto(mensagem.slice(0, indiceVirgula));
    if (possivelNome !== nomeBot(bot)) return mensagem.trim();

    return mensagem.slice(indiceVirgula + 1).trim();
}

module.exports = { normalizarTexto, nomeBot, removerPrefixoDoBot };
