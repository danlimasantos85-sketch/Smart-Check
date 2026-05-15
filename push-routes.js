// ─────────────────────────────────────────────────────────────
// SmartCheck — Rotas de Push Notification (Node.js / Express)
//
// INSTALAÇÃO: no terminal do seu projeto, rode:
//   npm install firebase-admin
//
// Depois adicione este arquivo ao seu projeto e inclua no
// seu server.js/index.js principal:
//   const pushRoutes = require('./push-routes');
//   app.use(pushRoutes);
// ─────────────────────────────────────────────────────────────

const express  = require('express');
const admin    = require('firebase-admin');
const router   = express.Router();

// ── Inicializa o Firebase Admin (só uma vez) ──
// Você vai precisar baixar a chave de serviço no Firebase:
// Configurações do projeto → Contas de serviço → Gerar nova chave privada
// Salve o arquivo como "firebase-service-account.json" na raiz do projeto

if (!admin.apps.length) {
  try {
    // Opção 1: arquivo local (desenvolvimento)
    const serviceAccount = require('./firebase-service-account.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    // Opção 2: variável de ambiente (produção no Render)
    // No painel do Render, adicione uma variável FIREBASE_SERVICE_ACCOUNT
    // com o conteúdo JSON da chave de serviço
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        ),
      });
    } else {
      console.warn('[Push] Firebase Admin não configurado — push desativado.');
    }
  }
}

// ── Armazena tokens em memória (substitua por banco de dados) ──
// Em produção, salve os tokens no seu banco (MongoDB, PostgreSQL, etc.)
const tokenStore = new Map(); // userId → [tokens]

// ── POST /api/push/token — recebe e salva token do dispositivo ──
router.post('/api/push/token', express.json(), (req, res) => {
  try {
    const { token, usuario, loja, dispositivo } = req.body;
    if (!token) return res.status(400).json({ error: 'Token obrigatório' });

    // Agrupa tokens por usuário
    if (!tokenStore.has(usuario)) tokenStore.set(usuario, new Set());
    tokenStore.get(usuario).add(token);

    console.log(`[Push] Token salvo: ${usuario} (${loja}) — ${dispositivo?.substring(0,50)}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Push] Erro ao salvar token:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /api/push/send — envia notificação para um usuário ──
router.post('/api/push/send', express.json(), async (req, res) => {
  if (!admin.apps.length) return res.status(503).json({ error: 'Push não configurado' });

  try {
    const { usuario, titulo, corpo, dados, url } = req.body;
    if (!usuario || !titulo) return res.status(400).json({ error: 'usuario e titulo obrigatórios' });

    const tokens = [...(tokenStore.get(usuario) || [])];
    if (!tokens.length) return res.status(404).json({ error: 'Nenhum token para este usuário' });

    const resultado = await enviarPush(tokens, titulo, corpo, dados, url);
    res.json({ ok: true, enviados: resultado.successCount, falhas: resultado.failureCount });
  } catch (err) {
    console.error('[Push] Erro ao enviar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/push/send-loja — envia para todos da loja ──
router.post('/api/push/send-loja', express.json(), async (req, res) => {
  if (!admin.apps.length) return res.status(503).json({ error: 'Push não configurado' });

  try {
    const { loja, titulo, corpo, dados, url } = req.body;

    // Pega todos tokens (em produção, filtre por loja no banco)
    const todos = [...tokenStore.values()].flatMap(s => [...s]);
    if (!todos.length) return res.status(404).json({ error: 'Nenhum token cadastrado' });

    const resultado = await enviarPush(todos, titulo, corpo, dados, url);
    res.json({ ok: true, enviados: resultado.successCount, falhas: resultado.failureCount });
  } catch (err) {
    console.error('[Push] Erro ao enviar para loja:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Função auxiliar de envio ──
async function enviarPush(tokens, titulo, corpo, dados = {}, url = '/shell.html') {
  const mensagem = {
    notification: {
      title: titulo,
      body:  corpo || '',
    },
    data: {
      ...dados,
      url,
      timestamp: new Date().toISOString(),
    },
    webpush: {
      notification: {
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: false,
      },
      fcmOptions: { link: url },
    },
    tokens,
  };

  const response = await admin.messaging().sendEachForMulticast(mensagem);

  // Remove tokens inválidos/expirados
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code;
      if (code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered') {
        // Remove token inválido de todos os usuários
        tokenStore.forEach(set => set.delete(tokens[i]));
        console.log('[Push] Token removido (inválido):', tokens[i].substring(0, 20) + '...');
      }
    }
  });

  console.log(`[Push] Enviado: ${response.successCount} ok, ${response.failureCount} falhas`);
  return response;
}

// ── Agendamento automático: dispara push antes dos checklists ──
// Esta função é chamada a cada minuto pelo seu servidor
function verificarAgendamentosPush() {
  if (!admin.apps.length) return;

  const agora = new Date();
  const hh = agora.getHours().toString().padStart(2,'0');
  const mm = agora.getMinutes().toString().padStart(2,'0');
  const horaAtual = `${hh}:${mm}`;
  const dow = agora.getDay(); // 0=dom, 1=seg...

  // Exemplo de agendamentos fixos — integre com seu banco de dados
  // para puxar os agendamentos reais cadastrados no módulo de agenda
  const AGENDAMENTOS_EXEMPLO = [
    { hora:'07:00', antecedencia:60, tipo:'Abertura',   avaliador:'Carlos Mendes',  loja:'Unidade Centro' },
    { hora:'22:00', antecedencia:60, tipo:'Fechamento', avaliador:'Carlos Mendes',  loja:'Unidade Centro' },
    { hora:'10:00', antecedencia:60, tipo:'Geral',      avaliador:'Paula Ferreira', loja:'Unidade Norte'  },
  ];

  AGENDAMENTOS_EXEMPLO.forEach(ag => {
    // Calcula horário do aviso (antecedência em minutos)
    const [h, m] = ag.hora.split(':').map(Number);
    const dtChecklist = new Date(agora);
    dtChecklist.setHours(h, m, 0, 0);
    const dtAviso = new Date(dtChecklist.getTime() - ag.antecedencia * 60000);
    const avisoHH = dtAviso.getHours().toString().padStart(2,'0');
    const avisoMM = dtAviso.getMinutes().toString().padStart(2,'0');
    const horaAviso = `${avisoHH}:${avisoMM}`;

    if (horaAtual === horaAviso) {
      const titulo = `📋 Checklist em ${ag.antecedencia} minutos`;
      const corpo  = `${ag.tipo} — ${ag.loja} às ${ag.hora}`;
      const tokens = [...(tokenStore.get(ag.avaliador) || [])];
      if (tokens.length) {
        enviarPush(tokens, titulo, corpo, { loja: ag.loja, tipo: ag.tipo }, '/shell.html');
        console.log(`[Push] Aviso disparado para ${ag.avaliador}: ${corpo}`);
      }
    }
  });
}

// Verifica a cada minuto
setInterval(verificarAgendamentosPush, 60 * 1000);

module.exports = router;
