// Service Worker para lidar com Web Push Notifications
// Recebimento $mart (04/06/2026)

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('Evento push recebido sem dados.');
    return;
  }

  try {
    const payload = event.data.json();
    const notification = payload.notification || {};
    
    const title = notification.title || 'Recebimento $mart';
    const options = {
      body: notification.body || '',
      icon: '/images/logo.svg', // Fallback para ícone do app
      badge: '/images/logo.svg', // Ícone monocromático para barra de status (Android)
      vibrate: [100, 50, 100],
      data: notification.data || {}
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('Erro ao processar dados do push:', err);
    
    // Tratamento de fallback se os dados não forem um JSON válido
    const textFallback = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Recebimento $mart', {
        body: textFallback,
        icon: '/images/logo.svg',
        badge: '/images/logo.svg'
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  const data = notification.data || {};
  const targetUrl = data.url ? `${self.location.origin}${data.url}` : self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Procura se o app já está aberto em alguma aba do navegador
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          // Se for o mesmo domínio, redireciona essa aba e foca nela
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Se o app não estiver aberto, abre em uma nova janela/aba
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
