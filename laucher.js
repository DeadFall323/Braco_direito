// launcher.js
const { iniciarBot } = require('./Cerebro');

const nomesDosBots = ['Carlos', 'Andre', 'Pedra'];
const PORTA = 25565; // Porta do seu servidor

nomesDosBots.forEach((nome, index) => {
    // Adiciona um pequeno delay para não sobrecarregar o servidor no login
    setTimeout(() => {
        console.log(`Iniciando bot: ${nome}...`);
        iniciarBot(PORTA, nome);
    }, index * 2000); // 2 segundos de diferença entre cada login
});