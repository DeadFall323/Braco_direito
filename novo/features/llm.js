const vitalsFeature = require('./vitals');
const gatherFeature = require('./gather');
const { goals } = require('mineflayer-pathfinder');

async function pensarComOllama(bot, usernameJogador, mensagemDoJogador) {
    console.log(`[Ollama] Analisando pedido de ${usernameJogador}: "${mensagemDoJogador}"`);

    const nome = bot.username || bot.personality?.nome || 'Joao';
    const vida = bot.health ? Math.round(bot.health) : 20;
    const fome = bot.food ? Math.round(bot.food) : 20;
    const estado = bot.estadoAtual || 'ocioso';

    const promptDoSistema = `
    Voce e o ${nome}, um NPC construtor e sobrevivente no jogo Minecraft.
    Sua personalidade: leal ao jogador, amigavel e muito trabalhador.
    
    DADOS VITAIS: Vida: ${vida}/20 | Fome: ${fome}/20 | Estado Atual: ${estado}
    
    SISTEMA DE AÇÕES (MUITO IMPORTANTE):
    Você possui comandos que afetam o jogo. Você DEVE iniciar sua resposta com a TAG correspondente se o jogador pedir.
    - Se mandarem você seguir, vir junto ou acompanhar: [ACAO_SEGUIR]
    - Se mandarem você parar, cancelar ou ficar aí: [ACAO_PARAR]
    - Se mandarem você comer: [ACAO_COMER]
    - Se mandarem você registrar sua casa aqui: [ACAO_CASA]
    - Se mandarem você pegar, coletar, buscar ou minerar um bloco: [ACAO_COLETAR:material:quantidade] 
      (Material válido: madeira, pedra, terra. Se o jogador não disser o número exato, use 64 por padrão).

    Regras:
    1. Responda de forma extremamente curta (1 ou 2 frases).
    2. Exemplo: Jogador: "Pega 20 madeiras pra mim" -> Você: "[ACAO_COLETAR:madeira:20] Pode deixar, chefe!"
    3. Exemplo: Jogador: "Vai minerar pedra" -> Você: "[ACAO_COLETAR:pedra:64] Indo focar nisso agora mesmo."
    `;

    try {
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
        let falaDoBot = dados.response || 'Nao consegui pensar em uma resposta agora.';

        // ==========================================
        // ROTEADOR DE INTENÇÕES (REGEX PARSER)
        // ==========================================
        // Agora a Regex captura até 3 partes: ACAO, parametro e quantidade (opcional)
        const tagRegex = /\[ACAO_([A-Z_]+)(?::([a-z_]+))?(?::(\d+))?\]/;
        const match = falaDoBot.match(tagRegex);

        if (match) {
            const acao = match[1];
            const parametro = match[2];
            const quantidade = match[3] ? parseInt(match[3]) : 64; // Se a IA não passar número, assume 64

            falaDoBot = falaDoBot.replace(match[0], '').trim();
            console.log(`[Ollama Gatilho] Acionando funcionalidade: ${acao} ${parametro ? '('+parametro+')' : ''} ${quantidade ? '- Qtd: '+quantidade : ''}`);

            switch (acao) {
                case 'SEGUIR':
                    const alvo = bot.players[usernameJogador]?.entity;
                    if (alvo) {
                        bot.pathfinder.setGoal(new goals.GoalFollow(alvo, 2), true);
                    }
                    break;
                case 'PARAR':
                    bot.pathfinder.setGoal(null);
                    // Aborta tarefas de mineração em andamento
                    if(bot.estadoAtual === 'trabalhando') bot.estadoAtual = 'ocioso';
                    break;
                case 'COMER':
                    bot.estadoAtual = 'comendo';
                    await vitalsFeature.comer(bot);
                    bot.estadoAtual = 'ocioso';
                    break;
                case 'CASA':
                    if (bot.personality) bot.personality.homePosition = bot.entity.position.clone();
                    break;
                case 'COLETAR':
                    if (parametro) {
                        bot.pathfinder.setGoal(null);
                        // Dispara a nova função pesada de coleta
                        gatherFeature.missaoDeColetaFocada(bot, usernameJogador, parametro, quantidade);
                    }
                    break;
            }
        }

        if (falaDoBot.length > 0) bot.chat(falaDoBot);

    } catch (erro) {
        console.log('Erro ao conectar com Ollama:', erro.message);
    }
}

module.exports = { pensarComOllama };