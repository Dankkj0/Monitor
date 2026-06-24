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

const clients = {};

// Função para formatar data e hora no padrão brasileiro (DD/MM/AAAA, HH:MM:SS)
function getBrTimestamp(timestampSeconds) {
  const date = timestampSeconds ? new Date(timestampSeconds * 1000) : new Date();
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function sendDiscordEmbed(embed) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await fetchFn(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ embeds: [embed] }) // Envia como Embed do Discord
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
  // Prioriza o Display Name recebido do Roblox
  const displayName = payload.displayName || payload.username || `ID: ${id}`; 
  const now = Math.floor(Date.now()/1000);
  const prev = clients[id];

  clients[id] = { 
    lastSeen: now, 
    status: (prev ? prev.status : "unknown"), 
    displayName: displayName, 
    info: payload 
  };

  if (!prev || prev.status === "offline" || prev.status === "unknown") {
    clients[id].status = "online";
    
    // Embed no estilo do antigo (Verde)
    const embed = {
      description: `**${displayName}**, você está online fofo 💙`,
      color: 3066993, // Cor Verde (Decimal)
    };
    
    sendDiscordEmbed(embed);
    console.log(`[ONLINE] ${displayName}`);
  }

  return res.json({ok:true});
});

setInterval(() => {
  const now = Math.floor(Date.now()/1000);
  for (const [id, obj] of Object.entries(clients)) {
    if (obj.status !== "offline" && (now - obj.lastSeen) > TIMEOUT_SECONDS) {
      obj.status = "offline";
      
      // Embed no estilo do antigo (Vermelho + Último visto)
      const embed = {
        description: `**${obj.displayName}**, você está offline, volte o mais rápido que puder... ou não, você pode dormir 💙✨\n\n*Último visto: ${getBrTimestamp(obj.lastSeen)}*`,
        color: 15158332, // Cor Vermelha (Decimal)
      };
      
      sendDiscordEmbed(embed);
      console.log(`[OFFLINE] ${obj.displayName}`);
    }
  }
}, CHECK_INTERVAL_MS);

app.get('/status', (req, res) => {
  res.json({now: Math.floor(Date.now()/1000), clients});
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor rodando na porta ${PORT}`);
});
