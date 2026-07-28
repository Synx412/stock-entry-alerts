/* Firebase Messaging + PWA service worker.
   Replace the REPLACE_* values with the same Firebase configuration used in
   firebase-config.js. */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const firebaseConfig = {
    apiKey: "AIzaSyBz9a_xuW_G_rAMFj7ZfLnxcOAlEKbfTzI",
    authDomain: "stock-entry-alerts.firebaseapp.com",
    projectId: "stock-entry-alerts",
    storageBucket: "stock-entry-alerts.firebasestorage.app",
    messagingSenderId: "995555783650",
    appId: "1:995555783650:web:3a7388b951aed601ebbfbb"
  };


firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

const CACHE_NAME = "stock-entry-alerts-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

messaging.onBackgroundMessage(payload => {
  const title = payload?.notification?.title || "Stock Entry Alert";
  const options = {
    body: payload?.notification?.body || "A watchlist condition was reached.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: payload?.data || {},
    tag: payload?.data?.ticker || "stock-entry-alert"
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow("./");
    })
  );
});
