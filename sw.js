// Service worker — cacheia o app para abrir offline e permitir instalação (PWA).
// Não toca em dados: o banco fica no localStorage do navegador.

const VERSAO = 'v1';
const CACHE_APP = `emprestimos-app-${VERSAO}`;
const CACHE_EXTRA = 'emprestimos-runtime';

const ARQUIVOS_APP = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then((cache) => cache.addAll(ARQUIVOS_APP))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_APP && chave !== CACHE_EXTRA)
          .map((chave) => caches.delete(chave))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navegação (abrir o app): rede primeiro, cache como rede de segurança.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_APP).then((cache) => cache.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // CDN (Bootstrap, Chart.js, ícones): cache primeiro.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then((emCache) => emCache || fetch(req).then((resp) => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          const copia = resp.clone();
          caches.open(CACHE_EXTRA).then((cache) => cache.put(req, copia));
        }
        return resp;
      }))
    );
    return;
  }

  // Arquivos do próprio app: cache primeiro, completando o cache em segundo plano.
  event.respondWith(
    caches.match(req).then((emCache) => {
      const rede = fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_APP).then((cache) => cache.put(req, copia));
        }
        return resp;
      }).catch(() => emCache);
      return emCache || rede;
    })
  );
});
