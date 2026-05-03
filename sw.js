const CACHE = 'financrb-v2';
const SHELL = ['/app', '/app.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Nunca intercepta chamadas ao Supabase, Stripe, APIs externas ou Vercel Functions
  if (
    url.includes('supabase.co') ||
    url.includes('stripe.com') ||
    url.includes('googleapis.com') ||
    url.includes('unpkg.com') ||
    url.includes('/api/') ||
    e.request.method !== 'GET'
  ) return;

  // Network-first para HTML e manifest — garante que código atualizado sempre chega ao usuário
  if (url.includes('/app') || url.endsWith('.html') || url.endsWith('.webmanifest')) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first para demais assets estáticos
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }))
  );
});
