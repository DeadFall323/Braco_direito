const vitalsFeature = require('./vitals');   
const gatherFeature = require('./gather');   
const { goals } = require('mineflayer-pathfinder');   
const memoryFeature = require('./memory');   

async function pensarComOllama(bot, usernameJogador, mensagemDoJogador) {
    console.log(`\n======================================================`);   
    console.log(`[Ollama 📥] MENSAGEM RECEBIDA de ${usernameJogador}: "${mensagemDoJogador}"`);   

    const memoria = bot.memoria || {};   
    const regras = memoria.regras || {};   
    const casaStr = memoria.locais?.casa ? `X: ${Math.round(memoria.locais.casa.x)}, Y: ${Math.round(memoria.locais.casa.y)}, Z: ${Math.round(memoria.locais.casa.z)}` : 'Nenhuma casa registrada';   
    const dono = memoria.dono || 'Desconhecido';   
    const listaAmigos = Object.keys(memoria.jogadores || {}).filter(k => memoria.jogadores[k].amigo).join(', ') || 'Nenhum';   

    const vida = bot.health ? Math.round(bot.health) : 20;   
    const fome = bot.food ? Math.round(bot.food) : 20;   
    const estado = bot.estadoAtual || 'ocioso';   

    const itens = bot.inventory.items();   
    const resumoMochila = itens.length > 0   
        ? itens.map(i => `${i.count}x ${i.name}`).join(', ')   
: 'Mochila vazia';   

    const promptDoSistema = `
    Voce e o ${bot.username}, um NPC construtor e sobrevivente no jogo Minecraft.
    
    SUA MEMÓRIA PERMANENTE:
    - O seu Mestre/Dono é: ${dono}
    - A sua casa fica nas coordenadas: ${casaStr}
    - Os seus amigos de confiança são: ${listaAmigos}
    - As suas regras de comportamento: ${JSON.stringify(regras)}
    
    DADOS VITAIS E INVENTÁRIO AGORA: 
    - Vida: ${vida}/20 | Fome: ${fome}/20 | Estado Atual: ${estado}
    - O que você tem na mochila: ${resumoMochila}
    
    SISTEMA DE AÇÕES (EXTREMAMENTE IMPORTANTE):
    Você DEVE iniciar sua resposta com a TAG EXATA correspondente se o jogador pedir uma destas ações.
    NÃO traduza a tag. NÃO use acentos.
    - [ACAO_SEGUIR] (seguir o jogador)
    - [ACAO_PARAR] (ficar parado/cancelar missão)
    - [ACAO_COMER] (alimentar-se)
    - [ACAO_CASA] (registrar coordenadas atuais como casa)
    - [ACAO_GUARDA] (proteger e vigiar)
    - [ACAO_TRABALHAR] (voltar a rotina civil)
    - [ACAO_COLETAR:material:quantidade] (Material válido: madeira, pedra, terra).
    - Se o jogador escolher qual colheita plantar: [ACAO_PLANTIO:material] (Ex: trigo, cenoura, batata, beterraba)
    - Se o jogador pedir um relatório, inventário ou perguntar o que você tem/produziu: [ACAO_RELATORIO]
    

    Regras OBRIGATÓRIAS:
    1. Responda de forma extremamente curta (1 ou 2 frases).
    2. NUNCA repita a lista de tags [ACAO_...] na sua resposta, escolha apenas uma se necessário.
    3. Se não houver uma tag perfeita para o que o jogador pediu, responda apenas conversando normalmente, SEM usar tags.
    `;   

    try {
        console.log(`[Ollama ⏳] Processando prompt...`);   
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

        // ROTEADOR DE INTENÇÕES À PROVA DE BALAS (Agora ignora "CACAO" e afins)
        const tagRegex = /\[.*?(?:ACAO|AÇÃO|ACTION)_([A-Z_]+)(?::([A-Z_]+))?(?::(\d+))?\]/i;
        const match = falaDoBot.match(tagRegex);   

        if (match) {
            const acao = match[1].toUpperCase();   
            const parametro = match[2] ? match[2].toLowerCase() : undefined;   
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
                    if (!bot.memoria.locais) bot.memoria.locais = {};   
                    bot.memoria.locais.casa = bot.entity.position.clone();   
                    if (bot.personality) bot.personality.homePosition = bot.memoria.locais.casa;   
                    memoryFeature.salvarMemoria(bot.username, bot.memoria);   
                    if (!falaDoBot) falaDoBot = "Casa registrada com sucesso!";   
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
                    if (!falaDoBot) falaDoBot = `Iniciando missao de mineracao!`;   
                    break;
                case 'RELATORIO':
                    bot.pathfinder.setGoal(null); // Ele para de andar para falar consigo

                    if (itens.length === 0) {
                        if (!falaDoBot) falaDoBot = "Chefe, a minha mochila está completamente vazia no momento.";
                    } else {
                        // Formata o resumo da mochila para ficar bonito no chat
                        const relatorio = itens.map(i => `${i.count}x ${i.name.replace('_', ' ')}`).join(', ');
                        if (!falaDoBot) falaDoBot = `Aqui está o relatório do meu inventário: ${relatorio}`;
                    }
                    break;
                case 'PLANTIO':
                    if (!bot.memoria.regras) bot.memoria.regras = {};
                    bot.memoria.regras.preferenciaPlantio = parametro;
                    memoryFeature.salvarMemoria(bot.username, bot.memoria);
                    if (!falaDoBot) falaDoBot = `Entendido! De agora em diante vou plantar apenas ${parametro}.`;
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