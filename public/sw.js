// Import Firebase scripts from CDN
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase App in service worker
firebase.initializeApp({
  apiKey: "AIzaSyCBoR-xYiuPSIw8PQu_kN52D7rLL5PCG5A",
  authDomain: "nupur-ai-engine-480322.firebaseapp.com",
  projectId: "nupur-ai-engine-480322",
  storageBucket: "nupur-ai-engine-480322.firebasestorage.app",
  messagingSenderId: "1046784973762",
  appId: "1:1046784973762:web:084c3979b8216a171ed45b"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Background Message Received:', payload);
  
  const title = payload.notification?.title || payload.data?.title || 'বুনন ফেব্রিক্স';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'আপনার জন্য নতুন ডিসকাউন্ট অফার!',
    icon: payload.notification?.icon || payload.data?.icon || '/image/faveicon.png',
    image: payload.notification?.image || payload.data?.image || '',
    badge: '/image/faveicon.png',
    data: payload.data,
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
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
