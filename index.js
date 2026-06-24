// index.js
const express = require('express');
let fetchFn = global.fetch;
try {
  if (!fetchFn) {
    fetchFn = (...args) => import('node-fetch').then(m => m.default(...args));
  }
} catch(e) {}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TIMEOUT_SECONDS = parseInt(process.env.TIMEOUT_SECONDS) || 90;
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS) || 15_000;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || "";
const EXPECTED_SECRET = process.env.MONITOR_SECRET || "seu_secret_compartilhado";

// Estrutura que guarda os clientes conectados
const clients = {};

async function sendDiscord(content) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await fetchFn(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ content })
    });
  } catch (e) {
    console.warn("Falha ao notificar Discord:", e);
  }
}

app.post('/heartbeat', (req, res) => {
  const payload = req.body || {};
  if (!payload.clientId || !payload.secret) return res.status(400).json({ok:false, err:"clientId/secret missing"});
  if (payload.secret !== EXPECTED_SECRET) return res.status(403).json({ok:false, err:"invalid secret"});

  const id = String(payload.clientId);
  // Se o script do Roblox não enviar o username, usamos o clientId como padrão
  const username = payload.username || `ID: ${id}`; 
  const now = Math.floor(Date.now()/1000);
  const prev = clients[id];

  // Salva o status atual e o username do jogador
  clients[id] = { 
    lastSeen: now, 
    status: (prev ? prev.status : "unknown"), 
    username: username, 
    info: payload 
  };

  // Se o jogador acabou de entrar (estava offline ou é a primeira vez)
  if (!prev || prev.status === "offline" || prev.status === "unknown") {
    clients[id].status = "online";
    const msg = `\"${username}\" está ativo 💙`;
    sendDiscord(msg);
    console.log(`[ONLINE] ${username} entrou.`);
  } else {
    console.log(`Heartbeat: ${username} está jogando...`);
  }

  return res.json({ok:true});
});

// Checagem periódica para ver quem saiu
setInterval(() => {
  const now = Math.floor(Date.now()/1000);
  for (const [id, obj] of Object.entries(clients)) {
    if (obj.status !== "offline" && (now - obj.lastSeen) > TIMEOUT_SECONDS) {
      obj.status = "offline";
      
      const msg = `\"${obj.username}\" saiu do jogo, volte se puder 💙`;
      sendDiscord(msg);
      console.log(`[OFFLINE] ${obj.username} desconectou por timeout.`);
    }
  }
}, CHECK_INTERVAL_MS);

app.get('/status', (req, res) => {
  res.json({now: Math.floor(Date.now()/1000), clients});
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor rodando na porta ${PORT}`);
});
             
