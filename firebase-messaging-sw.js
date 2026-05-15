// ─────────────────────────────────────────────────────────────
// SmartCheck — Firebase Messaging Service Worker
// Este arquivo DEVE se chamar firebase-messaging-sw.js
// e ficar na raiz do projeto (mesma pasta do index.html)
// ─────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyC0D5UUsV9sMphZ1CJhry2ORmqxalw5QzY",
  authDomain:        "smart-check-47516.firebaseapp.com",
  projectId:         "smart-check-47516",
  storageBucket:     "smart-check-47516.firebasestorage.app",
  messagingSenderId: "71041342338",
  appId:             "1:71041342338:web:9fdd18d22cec153f304d9b",
});

const messaging = firebase.messaging();

// ── Notificação recebida com app em BACKGROUND ou fechado ──
messaging.onBackgroundMessage(payload => {
  console.log('[FCM] Mensagem em background:', payload);

  const { title, body, icon, data } = payload.notification || {};

  self.registration.showNotification(title || '📋 SmartCheck', {
    body:    body  || 'Você tem um checklist pendente.',
    icon:    icon  || '/icons/icon-192.png',
    badge:        '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag:     data?.tag || 'smartcheck-notif',
    renotify: true,
    data:    data  || {},
    actions: [
      { action: 'abrir',  title: '▶ Abrir agora' },
      { action: 'depois', title: '⏰ Mais tarde'  },
    ],
  });
});

// ── Clique na notificação ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'depois') return;

  const url = event.notification.data?.url || '/shell.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Se já tem uma janela aberta, foca nela
      for (const client of list) {
        if (client.url.includes('smart-check') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão abre nova aba
      return clients.openWindow(url);
    })
  );
});
