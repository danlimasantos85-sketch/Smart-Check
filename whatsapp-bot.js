// ─────────────────────────────────────────────────────────────
// SmartCheck — Bot WhatsApp via Twilio
//
// INSTALAÇÃO:
//   npm install twilio
//
// Adicione no seu server.js/index.js:
//   const whatsappBot = require('./whatsapp-bot');
//   app.use(whatsappBot);
//
// No painel do Render, adicione as variáveis de ambiente:
//   TWILIO_ACCOUNT_SID = AC72e7ca7ebbedcdbd5744a3a500ce1429
//   TWILIO_AUTH_TOKEN  = cf008bdcc1a691ba635e40b5b8e1c3d6
//   TWILIO_WA_NUMBER   = whatsapp:+14155238886
//   GROQ_API_KEY       = (sua chave do Groq já existente)
// ─────────────────────────────────────────────────────────────

const express = require('express');
const twilio  = require('twilio');
const router  = express.Router();

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const WA_NUMBER    = process.env.TWILIO_WA_NUMBER;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const APP_URL      = process.env.APP_URL || 'https://smart-check-f77i.onrender.com/shell.html';

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// ── Contexto de conversa por número (memória curta) ──
const conversas = new Map(); // numero → { etapa, nome, loja, historico[] }

function getConversa(numero) {
  if (!conversas.has(numero)) {
    conversas.set(numero, { etapa: 'menu', nome: '', loja: '', historico: [] });
  }
  return conversas.get(numero);
}

// ── Envia mensagem WhatsApp ──
async function enviar(para, mensagem) {
  try {
    await client.messages.create({
      from: WA_NUMBER,
      to:   `whatsapp:${para}`,
      body: mensagem,
    });
    console.log(`[WA] Enviado para ${para}`);
  } catch (err) {
    console.error('[WA] Erro ao enviar:', err.message);
  }
}

// ── Consulta IA via Groq ──
async function consultarIA(pergunta, historico = []) {
  if (!GROQ_API_KEY) return 'Desculpe, o assistente de IA não está disponível no momento.';
  try {
    const mensagens = [
      {
        role: 'system',
        content: `Você é o assistente virtual do SmartCheck, uma plataforma de avaliação operacional para restaurantes.
Responda de forma clara, objetiva e amigável em português brasileiro.
Você conhece todos os módulos do SmartCheck:
- Avaliação operacional com checklist
- Dashboard analítico com scores e rankings
- Plano de ação para não-conformidades
- Agendamentos recorrentes de checklists
- Modo offline com sincronização
- Sistema multi-cliente com white-label
Mantenha respostas curtas (máx 3 parágrafos) pois é WhatsApp.
Nunca invente funcionalidades que não existem.
Se não souber, diga que vai verificar com a equipe.`,
      },
      ...historico.slice(-6), // últimas 6 mensagens para contexto
      { role: 'user', content: pergunta },
    ];

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'llama3-8b-8192',
        messages:    mensagens,
        max_tokens:  300,
        temperature: 0.7,
      }),
    });

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || 'Não consegui processar sua pergunta agora.';
  } catch (err) {
    console.error('[IA] Erro:', err.message);
    return 'Tive um problema técnico. Tente novamente em instantes.';
  }
}

// ── Menu principal ──
function menuPrincipal(nome = '') {
  const saudacao = nome ? `Olá, *${nome}*! 👋` : 'Olá! 👋';
  return `${saudacao} Sou o assistente do *SmartCheck*.

Como posso te ajudar?

1️⃣ Como fazer uma avaliação
2️⃣ Entender o Dashboard
3️⃣ Plano de Ação (NCs)
4️⃣ Agendamentos recorrentes
5️⃣ Modo offline
6️⃣ Falar com a equipe
7️⃣ 🤖 Perguntar ao assistente IA

_Responda com o número da opção ou digite sua dúvida livremente._`;
}

// ── Respostas fixas por opção ──
const RESPOSTAS = {
  '1': `📋 *Como fazer uma avaliação*

1. Acesse o app em: ${APP_URL}
2. Faça login com seu e-mail e senha
3. Na tela inicial toque em *"Avaliar"*
4. Selecione a loja e o tipo de avaliação
5. Preencha o checklist item por item
6. Adicione fotos das evidências
7. Assine digitalmente e salve

💡 _Funciona offline — sem internet os dados ficam salvos e sincronizam depois._

Digite *menu* para voltar ao início.`,

  '2': `📊 *Entendendo o Dashboard*

O Dashboard mostra:
• *Score médio* — nota geral das avaliações
• *Ranking de lojas* — quais estão melhor
• *NCs frequentes* — problemas que mais aparecem
• *Desempenho por avaliador*
• *Evolução ao longo do tempo*

Use os filtros de *período*, *loja* e *avaliador* para refinar a análise.

Acesse em: ${APP_URL} → aba 📊 Dashboard

Digite *menu* para voltar.`,

  '3': `⚠️ *Plano de Ação (Não-Conformidades)*

Quando uma NC é registrada:
1. O sistema identifica o responsável automaticamente
   • NCs operacionais → *Gerente da loja*
   • Documentação → *Supervisor ou Franqueado*
   • Consultor pode atribuir livremente

2. O responsável recebe notificação
3. Ele registra o progresso e resolve
4. Ao concluir, o superior é avisado automaticamente

Acesse em: ${APP_URL} → aba ⚠️ Plano

Digite *menu* para voltar.`,

  '4': `📅 *Agendamentos Recorrentes*

Configure checklists automáticos:
• *Diário* — ex: abertura toda segunda a sexta às 07h
• *Semanal* — ex: avaliação geral às quartas
• *Quinzenal ou mensal*

O sistema avisa o avaliador automaticamente via:
• 🔔 Notificação no app
• 💬 WhatsApp (esta mensagem!)

Acesse em: ${APP_URL} → aba 📅 Agenda

Digite *menu* para voltar.`,

  '5': `📡 *Modo Offline*

O SmartCheck funciona sem internet:
• Preencha o checklist normalmente
• Tire fotos das evidências
• Assine digitalmente
• Tudo fica salvo no dispositivo

Quando a internet voltar:
• Vá em 📡 Offline → aba Sincronização
• Toque em *"Sincronizar"*
• Os dados são enviados automaticamente

Digite *menu* para voltar.`,

  '6': `👤 *Falar com a equipe*

Nossa equipe está disponível:
📧 E-mail: suporte@smartcheck.com.br
🕐 Horário: seg–sex, 8h–18h

Ou descreva seu problema aqui que registraremos um chamado.

Digite *menu* para voltar.`,
};

// ── Webhook — recebe mensagens do WhatsApp ──
router.post('/api/whatsapp/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  res.status(200).send(''); // responde rápido para o Twilio

  const numero  = req.body.From?.replace('whatsapp:', '') || '';
  const texto   = (req.body.Body || '').trim();
  const textoLC = texto.toLowerCase();

  if (!numero || !texto) return;

  const conv = getConversa(numero);

  console.log(`[WA] ${numero}: "${texto}"`);

  // Adiciona ao histórico
  conv.historico.push({ role: 'user', content: texto });

  let resposta = '';

  // Comandos especiais
  if (textoLC === 'menu' || textoLC === 'início' || textoLC === 'inicio' || textoLC === 'oi' || textoLC === 'olá' || textoLC === 'ola') {
    conv.etapa = 'menu';
    resposta = menuPrincipal(conv.nome);
  }
  // Opções numeradas do menu
  else if (['1','2','3','4','5','6'].includes(texto) && conv.etapa === 'menu') {
    resposta = RESPOSTAS[texto];
    conv.etapa = 'resposta';
  }
  // Opção 7 — IA livre
  else if (texto === '7' && conv.etapa === 'menu') {
    conv.etapa = 'ia';
    resposta = `🤖 *Assistente IA ativado*\n\nPode perguntar qualquer coisa sobre o SmartCheck. Sou treinado para responder dúvidas sobre o sistema.\n\nDigite *menu* a qualquer momento para voltar ao início.`;
  }
  // Modo IA — responde livremente
  else if (conv.etapa === 'ia') {
    resposta = await consultarIA(texto, conv.historico);
  }
  // Qualquer outra mensagem — tenta IA ou mostra menu
  else {
    // Se parece uma pergunta, usa IA
    if (texto.length > 10 && (textoLC.includes('como') || textoLC.includes('o que') || textoLC.includes('quando') || textoLC.includes('onde') || textoLC.includes('?') || textoLC.includes('ajuda'))) {
      resposta = await consultarIA(texto, conv.historico);
    } else {
      conv.etapa = 'menu';
      resposta = menuPrincipal(conv.nome);
    }
  }

  // Adiciona resposta ao histórico
  conv.historico.push({ role: 'assistant', content: resposta });

  // Limita histórico a 20 mensagens
  if (conv.historico.length > 20) conv.historico = conv.historico.slice(-20);

  await enviar(numero, resposta);
});

// ── POST /api/whatsapp/send — envia notificação manual ──
router.post('/api/whatsapp/send', express.json(), async (req, res) => {
  try {
    const { numero, mensagem } = req.body;
    if (!numero || !mensagem) return res.status(400).json({ error: 'numero e mensagem obrigatórios' });
    await enviar(numero, mensagem);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/notif-checklist — notificação automática de checklist ──
router.post('/api/whatsapp/notif-checklist', express.json(), async (req, res) => {
  try {
    const { numero, avaliador, tipo, loja, hora, prazo } = req.body;
    if (!numero) return res.status(400).json({ error: 'numero obrigatório' });

    const msg =
`🔔 *SmartCheck — Lembrete de Avaliação*

Olá, *${avaliador || 'Avaliador'}*! 👋

Você tem um checklist pendente para hoje:

📋 *${tipo || 'Avaliação'}*
🏪 ${loja || 'Sua loja'}
🕐 Horário: ${hora || '--:--'}
⏰ Prazo: até ${prazo || '--:--'}

Acesse o app para realizar a avaliação:
${APP_URL}

_Este é um aviso automático do SmartCheck._`;

    await enviar(numero, msg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/notif-nc — notificação de nova NC atribuída ──
router.post('/api/whatsapp/notif-nc', express.json(), async (req, res) => {
  try {
    const { numero, responsavel, nc, loja, prazo, prioridade } = req.body;
    if (!numero) return res.status(400).json({ error: 'numero obrigatório' });

    const icone = prioridade === 'alta' ? '🔴' : prioridade === 'media' ? '🟡' : '⚪';

    const msg =
`⚠️ *SmartCheck — Nova NC Atribuída*

Olá, *${responsavel || 'Responsável'}*!

Uma não-conformidade foi atribuída a você:

${icone} *${nc || 'Não-conformidade'}*
🏪 ${loja || 'Loja'}
📅 Prazo: ${prazo || 'A definir'}

Acesse o Plano de Ação para registrar o progresso:
${APP_URL}

_Apenas você pode marcar esta NC como resolvida._`;

    await enviar(numero, msg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/notif-resolucao — notifica superior quando NC é resolvida ──
router.post('/api/whatsapp/notif-resolucao', express.json(), async (req, res) => {
  try {
    const { numero, superior, responsavel, nc, loja } = req.body;
    if (!numero) return res.status(400).json({ error: 'numero obrigatório' });

    const msg =
`✅ *SmartCheck — NC Resolvida*

Olá, *${superior || 'Supervisor'}*!

Uma não-conformidade foi marcada como resolvida:

📋 *${nc || 'Não-conformidade'}*
🏪 ${loja || 'Loja'}
👤 Resolvida por: *${responsavel || 'Responsável'}*

Acesse o app para validar a resolução:
${APP_URL}

_SmartCheck — Avaliação Operacional_`;

    await enviar(numero, msg);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.enviar = enviar;
