const readline = require('readline');
const { iniciarBot } = require('./Cerebro');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const nomeBot = process.env.BOT_USERNAME || 'Joao';

console.log('=========================================');
console.log(`       ${nomeBot.toUpperCase()} LAUNCHER v1.3`);
console.log('       Sistema multi-modulos ativo');
console.log('=========================================');

rl.question('Qual a porta do seu servidor local? (Ex: 25565): ', (portaInput) => {
    const port = Number(portaInput) || 25565;
    iniciarBot(port, nomeBot);
    rl.close();
});
