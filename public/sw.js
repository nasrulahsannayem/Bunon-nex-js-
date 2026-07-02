// Service Worker for receiving background web push notifications
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        notification: {
          title: 'বুনন ফেব্রিক্স',
          body: event.data.text()
        }
      };
    }
  }

  // Fallback structures if payload is not nested inside FCM format
  const title = data.notification?.title || data.title || 'বুনন ফেব্রিক্স';
  const options = {
    body: data.notification?.body || data.body || 'আপনার জন্য নতুন ডিসকাউন্ট অফার!',
    icon: '/image/faveicon.png',
    badge: '/image/faveicon.png',
    data: data.data || data, // payload metadata
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();

  // Navigate to product detail or home page when notification is clicked
  const payload = event.notification.data || {};
  const targetUrl = payload.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
