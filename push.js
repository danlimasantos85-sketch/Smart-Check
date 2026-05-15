// ─────────────────────────────────────────────────────────────
// SmartCheck — Push Notifications via Firebase (FCM)
// Inclua este script no shell.html e no index.html com:
// <script src="/push.js"></script>
// ─────────────────────────────────────────────────────────────

// ── Config Firebase ──
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC0D5UUsV9sMphZ1CJhry2ORmqxalw5QzY",
  authDomain:        "smart-check-47516.firebaseapp.com",
  projectId:         "smart-check-47516",
  storageBucket:     "smart-check-47516.firebasestorage.app",
  messagingSenderId: "71041342338",
  appId:             "1:71041342338:web:9fdd18d22cec153f304d9b",
};

const VAPID_KEY = "BOMv74A9qvBoiJisb0ftbt_fP_IYDQyKaH40CfsLH64XuNbKPkbgHAZ3i0N1O4U-IwFF_sIzEeFzL-zou2DRsz4";

// ── Inicializa Firebase ──
let _firebaseApp   = null;
let _messaging     = null;
let _fcmToken      = null;
let _pushAtivo     = false;

async function initPush() {
  // Só roda em browsers que suportam
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('[Push] Navegador não suporta notificações.');
    return;
  }

  try {
    // Importa Firebase dinamicamente (compatível com qualquer página)
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
    }

    // Inicializa app (evita duplicata)
    if (!_firebaseApp) {
      _firebaseApp = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(FIREBASE_CONFIG);
    }

    _messaging = firebase.messaging();

    // Escuta mensagens com app em FOREGROUND
    _messaging.onMessage(payload => {
      console.log('[Push] Mensagem em foreground:', payload);
      mostrarNotifInApp(payload);
    });

    console.log('[Push] Firebase Messaging inicializado.');
  } catch (err) {
    console.warn('[Push] Erro ao inicializar Firebase:', err);
  }
}

// ── Pede permissão e obtém token FCM ──
async function pedirPermissaoPush() {
  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      console.warn('[Push] Permissão negada.');
      return null;
    }

    // Registra o service worker do Firebase
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    // Obtém o token FCM
    _fcmToken = await _messaging.getToken({
      vapidKey:           VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (_fcmToken) {
      _pushAtivo = true;
      console.log('[Push] Token FCM obtido:', _fcmToken);

      // Salva o token no backend para poder enviar notificações depois
      await salvarTokenNoBackend(_fcmToken);

      return _fcmToken;
    }
  } catch (err) {
    console.warn('[Push] Erro ao obter token:', err);
    return null;
  }
}

// ── Salva token no backend ──
async function salvarTokenNoBackend(token) {
  try {
    await fetch('/api/push/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        usuario:    localStorage.getItem('sc_user')    || 'desconhecido',
        loja:       localStorage.getItem('sc_loja')    || '',
        dispositivo: navigator.userAgent,
        timestamp:  new Date().toISOString(),
      }),
    });
    console.log('[Push] Token salvo no backend.');
  } catch (err) {
    // Não crítico — token fica salvo localmente
    console.warn('[Push] Não foi possível salvar token no backend:', err);
    localStorage.setItem('sc_fcm_token', token);
  }
}

// ── Mostra notificação dentro do app (foreground) ──
function mostrarNotifInApp(payload) {
  const { title, body } = payload.notification || {};
  const dados = payload.data || {};

  // Tenta usar o sistema de toast do shell se disponível
  if (typeof window.showToast === 'function') {
    window.showToast(`🔔 ${title || 'Novo aviso'}: ${body || ''}`, 'info');
  }

  // Atualiza badge do sino se existir
  const badge = document.getElementById('bellBadge');
  if (badge) {
    const atual = parseInt(badge.textContent) || 0;
    badge.textContent = atual + 1;
    badge.style.display = 'flex';
  }

  // Dispara evento global para outros módulos escutarem
  window.dispatchEvent(new CustomEvent('smartcheck:notif', {
    detail: { title, body, data: dados }
  }));
}

// ── Verifica se push está ativo ──
function pushAtivo() {
  return _pushAtivo && Notification.permission === 'granted';
}

// ── Carrega script dinamicamente ──
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Auto-inicializa quando o DOM estiver pronto ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPush);
} else {
  initPush();
}

// ── Expõe funções globalmente ──
window.SmartCheckPush = {
  init:              initPush,
  pedirPermissao:    pedirPermissaoPush,
  ativo:             pushAtivo,
  getToken:          () => _fcmToken,
};
