// features/memory.js
const fs = require('fs');
const path = require('path');

// Caminho absoluto para a pasta de memórias
const MEMORY_DIR = path.join(__dirname, '..', 'memory');

// Garante que a pasta existe quando o bot ligar
if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// O esqueleto mental inicial do bot
function modeloPadrao(username) {
    return {
        nome: username,
        dono: "Kawan",
        locais: {
            casa: null,
            vila: null
        },
        regras: {
            lutarSemArmadura: false,
            usarArcoContraZumbi: true,
            protegerJogadores: ["Kawan"]
        },
        conhecimento: {
            ultimaMorte: null,
            ultimaExploracao: null
        },
        jogadores: {
            Kawan: { amigo: true, confianca: 100 }
        }
    };
}

function carregarMemoria(username) {
    const filePath = path.join(MEMORY_DIR, `${username}.json`);
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            console.log(`[Memória] Arquivo corrompido para ${username}. Criando um novo.`);
        }
    }
    const novaMemoria = modeloPadrao(username);
    salvarMemoria(username, novaMemoria); // Cria o arquivo inicial
    return novaMemoria;
}

function salvarMemoria(username, dados) {
    const filePath = path.join(MEMORY_DIR, `${username}.json`);
    // Salva o JSON formatado para ficar fácil de você ler e editar manualmente
    fs.writeFileSync(filePath, JSON.stringify(dados, null, 2), 'utf-8');
}

module.exports = { carregarMemoria, salvarMemoria };