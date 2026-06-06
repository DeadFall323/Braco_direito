const vitalsFeature = require('./vitals');
const gatherFeature = require('./gather');
const { goals } = require('mineflayer-pathfinder');
const memoryFeature = require('./memory');

async function pensarComOllama(bot, usernameJogador, mensagemDoJogador) {
    // Guarda de segurança: aborta se chamado sem mensagem
    if (!mensagemDoJogador) {
        console.log('[Ollama ⚠️] pensarComOllama chamado sem mensagem. Ignorando.');
        return;
    }

    console.log(`\n======================================================`);
    console.log(`[Ollama 📥] MENSAGEM de "${usernameJogador}": "${mensagemDoJogador}"`);

    // Busca dados da memória permanente
    const memoria = bot.memoria || {};
    const regras = memoria.regras || {};
    const casaStr = memoria.locais?.casa
        ? `X: ${Math.round(memoria.locais.casa.x)}, Y: ${Math.round(memoria.locais.casa.y)}, Z: ${Math.round(memoria.locais.casa.z)}`
        : 'Nenhuma casa registrada';
    const dono = memoria.dono || 'Desconhecido';
    const listaAmigos = Object.keys(memoria.jogadores || {}).filter(k => memoria.jogadores[k].amigo).join(', ') || 'Nenhum';

    const vida = bot.health ? Math.round(bot.health) : 20;
    const fome = bot.food ? Math.round(bot.food) : 20;
    const estado = bot.estadoAtual || 'ocioso';

    const promptDoSistema = `
Voce e o ${bot.username}, um NPC construtor e sobrevivente no jogo Minecraft.

SUA MEMÓRIA PERMANENTE:
- Seu Mestre/Dono: ${dono}
- Sua casa: ${casaStr}
- Seus amigos: ${listaAmigos}
- Suas regras: ${JSON.stringify(regras)}

DADOS VITAIS AGORA: Vida: ${vida}/20 | Fome: ${fome}/20 | Estado: ${estado}

SISTEMA DE AÇÕES (EXTREMAMENTE IMPORTANTE):
Você DEVE iniciar sua resposta com a TAG EXATA se o jogador pedir.
- Seguir o jogador: [ACAO_SEGUIR]
- Parar/cancelar: [ACAO_PARAR]
- Comer: [ACAO_COMER]
- Registrar casa aqui: [ACAO_CASA]
- Ficar de guarda: [ACAO_GUARDA]
- Voltar a trabalhar: [ACAO_TRABALHAR]
- Coletar/minerar: [ACAO_COLETAR:material:quantidade]
  (Materiais válidos: madeira, pedra, terra. Padrão se não informado: 64)

Regras:
1. Responda de forma curta (1 ou 2 frases).
2. Trate seu dono (${dono}) com lealdade e respeito.
3. Exemplo: "Pega 20 madeiras" -> "[ACAO_COLETAR:madeira:20] Pode deixar, chefe!"
4. Se for mensagem de socorro interna, responda dramaticamente sem tag de ação.
`;

    try {
        console.log(`[Ollama ⏳] Processando com LLaMA3... (Vida: ${vida}, Fome: ${fome}, Estado: ${estado})`);
        const inicioPensamento = Date.now();

        const resposta = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3',
                prompt: mensagemDoJogador,
                system: promptDoSistema,
                stream: false
            })
        });

        const dados = await resposta.json();
        const tempoResposta = Date.now() - inicioPensamento;
        console.log(`[Ollama 🤖] Resposta bruta (${tempoResposta}ms): "${dados.response}"`);

        let falaDoBot = dados.response || 'Nao consegui pensar em uma resposta agora.';

        // ROTEADOR DE INTENÇÕES — aceita ACAO, AÇÃO, ACTION (case-insensitive)
        const tagRegex = /\[(?:ACAO|AÇÃO|ACTION)_([A-Z_]+)(?::([a-zA-Z_]+))?(?::(\d+))?\]/i;
        const match = falaDoBot.match(tagRegex);

        if (match) {
            const acao = match[1].toUpperCase();
            const parametro = match[2] ? match[2].toLowerCase() : undefined;
            const quantidade = match[3] ? parseInt(match[3]) : 64;

            falaDoBot = falaDoBot.replace(match[0], '').trim();

            console.log(`[Ollama ⚙️] Tag interceptada:`);
            console.log(`            - Ação: ${acao}`);
            console.log(`            - Parâmetro: ${parametro || 'Nenhum'}`);
            console.log(`            - Quantidade: ${quantidade}`);

            switch (acao) {
                case 'SEGUIR': {
                    const alvo = bot.players[usernameJogador]?.entity;
                    if (alvo) {
                        bot.pathfinder.setGoal(new goals.GoalFollow(alvo, 2), true);
                    }
                    if (!falaDoBot) falaDoBot = 'Entendido, estou indo atras de voce!';
                    break;
                }
                case 'PARAR': {
                    bot.pathfinder.setGoal(null);
                    if (bot.estadoAtual === 'trabalhando') bot.estadoAtual = 'ocioso';
                    if (!falaDoBot) falaDoBot = 'Parei tudo o que estava fazendo, chefe.';
                    break;
                }
                case 'COMER': {
                    bot.estadoAtual = 'comendo';
                    await vitalsFeature.comer(bot);
                    bot.estadoAtual = 'ocioso';
                    if (!falaDoBot) falaDoBot = 'Vou procurar algo para mastigar.';
                    break;
                }
                case 'CASA': {
                    if (bot.personality) bot.personality.homePosition = bot.entity.position.clone();
                    if (!falaDoBot) falaDoBot = 'Casa registrada com sucesso nesta coordenada!';
                    break;
                }
                case 'GUARDA': {
                    if (bot.personality) {
                        bot.personality.funcao = 'guarda';
                        bot.personality.comportamentoNoturno = 'guarda';
                    }
                    if (!falaDoBot) falaDoBot = 'Assumindo postura militar. Vou patrulhar a area!';
                    break;
                }
                case 'TRABALHAR': {
                    if (bot.personality) {
                        bot.personality.funcao = 'trabalhador';
                        bot.personality.comportamentoNoturno = 'dormir';
                    }
                    if (!falaDoBot) falaDoBot = 'Voltando para a rotina civil de trabalhador.';
                    break;
                }
                case 'COLETAR': {
                    if (parametro) {
                        bot.pathfinder.setGoal(null);
                        gatherFeature.missaoDeColetaFocada(bot, usernameJogador, parametro, quantidade);
                    }
                    if (!falaDoBot) falaDoBot = `Iniciando missao de coleta de ${parametro}!`;
                    break;
                }
                default: {
                    console.log(`[Ollama ⚠️] Ação "${acao}" não reconhecida.`);
                    break;
                }
            }
        } else {
            console.log(`[Ollama 💬] Nenhuma tag detectada. Conversa livre.`);
        }

        console.log(`[Ollama 📤] Chat: "${falaDoBot}"`);
        console.log(`======================================================\n`);

        if (falaDoBot && falaDoBot.length > 0) bot.chat(falaDoBot);

    } catch (erro) {
        console.log('\n[Ollama ❌] ERRO ao conectar com Ollama:');
        console.error(erro.message);
        console.log(`======================================================\n`);
    }
}

module.exports = { pensarComOllama };