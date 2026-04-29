self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || 'Prism';
  const options = {
    body: payload.body || 'You have a new Prism notification.',
    data: payload,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients[0];

      if (existingClient) {
        existingClient.focus();
        existingClient.postMessage({
          type: 'prism-notification-click',
          payload: event.notification.data || {},
        });
        return undefined;
      }

      return self.clients.openWindow('/');
    }),
  );
});
