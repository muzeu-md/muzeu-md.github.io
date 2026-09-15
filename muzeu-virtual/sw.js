/* Muzeu Virtual — Service Worker (GitHub Pages: cache HTTP via SW).
 * Strategii: app-shell cache-first; imagini imgBB/picsum cache-first cu plafon;
 * API Apps Script network-first cu fallback la cache. */
var VERSIUNE = 'muzeu-v1';
var SHELL = 'muzeu-shell-v1';
var IMAGINI = 'muzeu-imagini-v1';
var API = 'muzeu-api-v1';
var MAX_IMAGINI = 60;
var APP_SHELL = [
  './',
  'index.html',
  'css/muzeu.min.css',
  'css/muzeu.css',
  'js/cms.js',
  'js/muzeu.min.js',
  'js/muzeu.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return Promise.allSettled(APP_SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' }));
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (chei) {
      return Promise.all(chei.map(function (k) {
        if (k !== SHELL && k !== IMAGINI && k !== API && k.indexOf('muzeu-') === 0) {
          return caches.delete(k);
        }
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function esteImagine(url) {
  return /(^|\.)(ibb\.co|picsum\.photos)$/.test(url.hostname) ||
    /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url.pathname);
}
function esteApi(url) {
  return /(^|\.)script\.google(check)?\.com$/.test(url.hostname) || /\/exec(\?|$)/.test(url.pathname);
}
function plafoneaza(cacheName, max) {
  caches.open(cacheName).then(function (c) {
    c.keys().then(function (chei) {
      if (chei.length > max) c.delete(chei[0]);
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* API: rețea întâi (date proaspete), fallback la ultima copie bună */
  if (esteApi(url)) {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r && r.ok) {
          var copie = r.clone();
          caches.open(API).then(function (c) { c.put(req, copie); });
        }
        return r;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          return Response.error();
        });
      })
    );
    return;
  }

  /* Imagini remote (imgBB/picsum): cache întâi — sunt imuabile per URL */
  if (esteImagine(url)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (r) {
          if (r && r.ok) {
            var copie = r.clone();
            caches.open(IMAGINI).then(function (c) {
              c.put(req, copie).then(function () { plafoneaza(IMAGINI, MAX_IMAGINI); });
            });
          }
          return r;
        });
      })
    );
    return;
  }

  /* App-shell + restul: cache întâi, completare din rețea */
  e.respondWith(
    caches.match(req, { ignoreSearch: req.url.indexOf('index.html') !== -1 ? false : true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) {
        if (r && r.ok && url.origin === self.location.origin) {
          var copie = r.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copie); });
        }
        return r;
      });
    })
  );
});
