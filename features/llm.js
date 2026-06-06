const vitalsFeature = require('./vitals');
const gatherFeature = require('./gather');
const { goals } = require('mineflayer-pathfinder');
const memoryFeature = require('./memory');

async function pensarComOllama(bot, usernameJogador, mensagemDoJogador) {
    console.log(`\n======================================================`);
    console.log(`[Ollama 📥] MENSAGEM RECEBIDA de ${usernameJogador}: "${mensagemDoJogador}"`);

    // Busca os dados da memória ou define padrões de segurança
    const memoria = bot.memoria || {};
    const regras = memoria.regras || {};
    const casaStr = memoria.locais?.casa ? `X: ${Math.round(memoria.locais.casa.x)}, Y: ${Math.round(memoria.locais.casa.y)}, Z: ${Math.round(memoria.locais.casa.z)}` : 'Nenhuma casa registrada';
    const dono = memoria.dono || 'Desconhecido';

    // Lista os amigos que têm o status "amigo" como true
    const listaAmigos = Object.keys(memoria.jogadores || {}).filter(k => memoria.jogadores[k].amigo).join(', ') || 'Nenhum';

    const vida = bot.health ? Math.round(bot.health) : 20;
    const fome = bot.food ? Math.round(bot.food) : 20;
    const estado = bot.estadoAtual || 'ocioso';

    // O SUPER PROMPT DE CONTEXTO MENTAL
    const promptDoSistema = `
    Voce e o ${bot.username}, um NPC construtor e sobrevivente no jogo Minecraft.
    
    SUA MEMÓRIA PERMANENTE:
    - O seu Mestre/Dono é: ${dono}
    - A sua casa fica nas coordenadas: ${casaStr}
    - Os seus amigos de confiança são: ${listaAmigos}
    - As suas regras de combate e comportamento: ${JSON.stringify(regras)}
    
    DADOS VITAIS AGORA: Vida: ${vida}/20 | Fome: ${fome}/20 | Estado Atual: ${estado}
    
    SISTEMA DE AÇÕES (EXTREMAMENTE IMPORTANTE):
    Você DEVE iniciar sua resposta com a TAG EXATA correspondente se o jogador pedir.
    NÃO traduza a tag para inglês. NÃO use acentos.
    - [ACAO_SEGUIR] (seguir o jogador)
    - [ACAO_PARAR] (ficar parado/cancelar missão)
    - [ACAO_COMER] (alimentar-se)
    - [ACAO_CASA] (registrar coordenadas atuais como casa)
    - [ACAO_GUARDA] (proteger e vigiar)
    - [ACAO_TRABALHAR] (voltar a rotina civil)
    - [ACAO_COLETAR:material:quantidade] (Material válido: madeira, pedra, terra).

    Regras:
    1. Responda de forma curta (1 ou 2 frases).
    2. Trate o seu dono (${dono}) com grande lealdade e respeito.
    `;

    try {
        console.log(`[Ollama ⏳] Processando prompt com LLaMA3... (Vida: ${vida}, Fome: ${fome}, Estado: ${estado})`);
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

        console.log(`[Ollama 🤖] Resposta Bruta (${tempoResposta}ms): "${dados.response}"`);

        let falaDoBot = dados.response || 'Nao consegui pensar em uma resposta agora.';

        // ROTEADOR DE INTENÇÕES À PROVA DE BALAS (REGEX PARSER)
        // Agora aceita [ACAO_...], [AÇÃO_...], [ACTION_...] e não se importa com maiúsculas/minúsculas nas tags
        const tagRegex = /\[(?:ACAO|AÇÃO|ACTION)_([A-Z_]+)(?::([A-Z_]+))?(?::(\d+))?\]/i;
        const match = falaDoBot.match(tagRegex);

        if (match) {
            const acao = match[1].toUpperCase(); // Força a ação a ficar em maiúsculas
            const parametro = match[2] ? match[2].toLowerCase() : undefined; // Força o material a ficar em minúsculas
            const quantidade = match[3] ? parseInt(match[3]) : 64;

            falaDoBot = falaDoBot.replace(match[0], '').trim();

            console.log(`[Ollama ⚙️] Tag Interceptada com Sucesso:`);
            console.log(`            - Ação: ${acao}`);
            console.log(`            - Parâmetro: ${parametro || 'Nenhum'}`);
            console.log(`            - Quantidade: ${quantidade}`);

            switch (acao) {
                case 'SEGUIR':
                    const alvo = bot.players[usernameJogador]?.entity;
                    if (alvo) bot.pathfinder.setGoal(new goals.GoalFollow(alvo, 2), true);
                    if (!falaDoBot) falaDoBot = "Entendido, estou indo atras de voce!";
                    break;
                case 'PARAR':
                    bot.pathfinder.setGoal(null);
                    if(bot.estadoAtual === 'trabalhando') bot.estadoAtual = 'ocioso';
                    if (!falaDoBot) falaDoBot = "Parei tudo o que estava fazendo, chefe.";
                    break;
                case 'COMER':
                    bot.estadoAtual = 'comendo';
                    await vitalsFeature.comer(bot);
                    bot.estadoAtual = 'ocioso';
                    if (!falaDoBot) falaDoBot = "Vou procurar algo para mastigar.";
                    break;
                case 'CASA':
                    if (bot.personality) bot.personality.homePosition = bot.entity.position.clone();
                    if (!falaDoBot) falaDoBot = "Casa registrada com sucesso nesta coordenada!";
                    break;
                case 'GUARDA':
                    if (bot.personality) {
                        bot.personality.funcao = 'guarda';
                        bot.personality.comportamentoNoturno = 'guarda';
                    }
                    if (!falaDoBot) falaDoBot = "Assumindo postura militar. Vou patrulhar a area!";
                    break;
                case 'TRABALHAR':
                    if (bot.personality) {
                        bot.personality.funcao = 'trabalhador';
                        bot.personality.comportamentoNoturno = 'dormir';
                    }
                    if (!falaDoBot) falaDoBot = "Voltando para a rotina civil de trabalhador.";
                    break;
                case 'COLETAR':
                    if (parametro) {
                        bot.pathfinder.setGoal(null);
                        gatherFeature.missaoDeColetaFocada(bot, usernameJogador, parametro, quantidade);
                    }
                    if (!falaDoBot) falaDoBot = `Iniciando missao de mineracao de ${parametro}!`;
                    break;
                default:
                    console.log(`[Ollama ⚠️] Ação ${acao} não reconhecida pelo sistema.`);
            }
        } else {
            console.log(`[Ollama 💬] Nenhuma tag de ação detetada. Apenas conversa livre.`);
        }

        console.log(`[Ollama 📤] Mensagem enviada ao chat: "${falaDoBot}"`);
        console.log(`======================================================\n`);

        if (falaDoBot.length > 0) bot.chat(falaDoBot);

    } catch (erro) {
        console.log('\n[Ollama ❌] ERRO FATAL ao conectar com o modelo local:');
        console.error(erro.message);
        console.log(`======================================================\n`);
    }
}

module.exports = { pensarComOllama };