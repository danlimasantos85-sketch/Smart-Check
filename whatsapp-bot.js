// ─────────────────────────────────────────────────────────────
// SmartCheck — Bot WhatsApp via Twilio (VERSÃO FINAL CORRIGIDA)
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

// ── Contexto de conversa ──
const conversas = new Map();

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
      to: `whatsapp:${para}`,
      body: mensagem,
    });
    console.log(`[WA] Enviado para ${para}`);
  } catch (err) {
    console.error('[WA] Erro ao enviar:', err.message);
  }
}

// ── Consulta IA via Groq ──
async function consultarIA(pergunta, historico = []) {
  if (!GROQ_API_KEY) return 'Desculpe, o assistente de IA não está disponível agora.';
  
  try {
    const mensagens = [
      {
        role: 'system',
        content: `Você é o assistente virtual do SmartCheck, uma plataforma de avaliação operacional para restaurantes. Responda de forma clara em português brasileiro. Mantenha respostas curtas.`,
      },
      ...historico.slice(-6),
      { role: 'user', content: pergunta },
    ];

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY.trim()}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: mensagens,
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data = await resp.json();

    if (data.error) {
      console.error('[GROQ API ERROR]:', data.error.message);
      return 'Tive um problema ao consultar a IA. Por favor, tente novamente.';
    }

    return data.choices?.[0]?.message?.content || 'Não consegui processar sua pergunta agora.';
  } catch (err) {
    console.error('[IA EXCEPTION]:', err.message);
    return 'Tive um problema técnico na conexão com a inteligência artificial.';
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

const RESPOSTAS = {
  '1': `📋 *Como fazer uma avaliação*\n\n1. Acesse o app em: ${APP_URL}\n2. Na tela inicial toque em *"Avaliar"*\n3. Preencha o checklist e salve.\n\nDigite *menu* para voltar.`,
  '2': `📊 *Dashboard*\n\nVeja Score médio, rankings e NCs frequentes em: ${APP_URL}\n\nDigite *menu* para voltar.`,
  '3': `⚠️ *Plano de Ação*\n\nIdentifique e resolva não-conformidades direto no app.\n\nDigite *menu* para voltar.`,
  '4': `📅 *Agendamentos*\n\nConfigure checklists automáticos na aba Agenda do app.\n\nDigite *menu* para voltar.`,
  '5': `📡 *Modo Offline*\n\nO app salva tudo sem internet e sincroniza depois.\n\nDigite *menu* para voltar.`,
  '6': `👤 *Falar com a equipe*\n\nSuporte: suporte@smartcheck.com.br\n\nDigite *menu* para voltar.`
};

// ── Webhook principal ──
router.post('/api/whatsapp/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  res.status(200).send('');

  const numero = req.body.From?.replace('whatsapp:', '') || '';
  const texto = (req.body.Body || '').trim();
  const textoLC = texto.toLowerCase();

  if (!numero || !texto) return;

  const conv = getConversa(numero);
  console.log(`[WA] ${numero}: "${texto}"`);

  conv.historico.push({ role: 'user', content: texto });

  let resposta = '';

  if (['menu', 'inicio', 'olá', 'oi', 'ola'].includes(textoLC)) {
    conv.etapa = 'menu';
    resposta = menuPrincipal(conv.nome);
  } 
  else if (['1','2','3','4','5','6'].includes(texto) && conv.etapa === 'menu') {
    resposta = RESPOSTAS[texto];
    conv.etapa = 'menu';
  } 
  else if (texto === '7' && conv.etapa === 'menu') {
    conv.etapa = 'ia';
    resposta = `🤖 *IA Ativada*\n\nO que você quer saber sobre o SmartCheck?`;
  } 
  else if (conv.etapa === 'ia' || texto.length > 15) {
    resposta = await consultarIA(texto, conv.historico);
  } 
  else {
    resposta = menuPrincipal(conv.nome);
  }

  conv.historico.push({ role: 'assistant', content: resposta });
  if (conv.historico.length > 20) conv.historico = conv.historico.slice(-20);

  await enviar(numero, resposta);
});

// ── Outros Endpoints ──
router.post('/api/whatsapp/send', express.json(), async (req, res) => {
  const { numero, mensagem } = req.body;
  await enviar(numero, mensagem);
  res.json({ ok: true });
});

module.exports = router;
module.exports.enviar = enviar;
