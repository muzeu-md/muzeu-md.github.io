/* Muzeu CMS bootloader — încărcare în etape (rapid, „nativ").
 * Regula de boot: ?home = harta; ?DOS-00001 = modalul dosarului;
 * orice alt URL proaspăt încărcat pornește la ?home (doar dosarul e onorat).
 * Etape: getIndex (~4KB, harta instant) → restul leneș per raion.
 * Fallback: cache localStorage → js/data.js + js/raioane.js statice. */
(function () {
  'use strict';
  /* Sursă unică: window.DEPLOY_URL din <head> (dacă există), altfel constanta locală. */
  var CMS_API_URL = window.DEPLOY_URL || 'PASTE_AICI_LINK_EXEC'; // ex: https://script.google.com/macros/s/AKfy.../exec
  var TIMEOUT_MS = 8000;
  var LS_VER = 'muzeu-cms-ver-v1';
  var LS_IDX = 'muzeu-cms-index-v1';
  var LS_RAION = 'muzeu-cms-raion-v1-';
  var TTL_IDX_MS = 24 * 60 * 60 * 1000; /* indexul din localStorage e proaspăt 24h */
  var SIGURANTA_LOADER_MS = 12000; /* loader-ul nu blochează niciodată mai mult */

  /* ---- Loader tematic arhivă: progres real, nu spinner fals ----
   * Overlay-ul e HTML static în index.html (vizibil instant, fără JS).
   * Aici doar actualizăm bara; ascunderea se face cu body.arhiva-gata. */
  var LoaderArhiva = (function () {
    function el(id) { return document.getElementById(id); }
    function set(pct, msg) {
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      var bara = el('loader-bara'), umplere = el('loader-progres'),
          txt = el('loader-pct'), mesaj = el('loader-msg');
      if (umplere) umplere.style.width = pct + '%';
      if (bara) bara.setAttribute('aria-valuenow', String(pct));
      if (txt) txt.textContent = pct + '%';
      if (mesaj && msg) mesaj.textContent = msg;
    }
    var gata = false;
    function done() {
      if (gata) return;
      gata = true;
      set(100, 'Arhiva e deschisă. Bine ai venit!');
      document.body.classList.add('arhiva-gata');
      /* nodul rămâne ascuns via CSS (vizitatorii cu Back nu-l mai văd); îl scoatem din DOM după tranziție */
      setTimeout(function () {
        var n = el('loader-arhiva');
        if (n && n.parentNode) n.parentNode.removeChild(n);
      }, 700);
    }
    /* siguranță absolută: pagina devine utilizabilă chiar dacă API-ul atârnă */
    setTimeout(done, SIGURANTA_LOADER_MS);
    /* muzeu.js anunță primul cadru randat → închidem precis, nu aproximativ */
    window.addEventListener('muzeu-gata', done, { once: true });
    window.addEventListener('load', function () { setTimeout(done, 2500); });
    return { set: set, done: done };
  })();
  window.LoaderArhiva = LoaderArhiva;

  var memPlin = {}; // raioane cu sate+obiecte deja încărcate

  /* ---- parser URL (sursă unică, folosit și de muzeu.js la Back) ---- */
  function parseQuery(qs) {
    var q = String(qs || '').replace(/^[?#]/, '');
    var parts = q.split('&').filter(Boolean);
    var out = { view: 'home', raion: null, sat: null, dosar: null, contribuie: false };
    var path = '';
    var areContribuie = false;
    parts.forEach(function (p) {
      var m = /^dosar=(.+)$/i.exec(p);
      if (m) { out.dosar = m[1].trim().toUpperCase(); return; }
      if (/^contribuie($|=)/i.test(p)) { areContribuie = true; return; }
      if (p.indexOf('=') === -1 && !path) path = p;
    });
    if (areContribuie || (path && path.toLowerCase() === 'contribuie')) {
      out.view = 'contribuie'; out.contribuie = true; return out;
    }
    if (/^dos-\d+$/i.test(path)) { out.view = 'dosar'; out.dosar = path.toUpperCase(); return out; }
    if (!path || path.toLowerCase() === 'home') return out;
    var seg = path.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!seg.length) return out;
    out.view = 'muzeu'; out.raion = seg[0].toLowerCase();
    if (seg[1]) out.sat = seg[1].toLowerCase();
    return out;
  }

  function baseURL() {
    if (!CMS_API_URL || CMS_API_URL.indexOf('PASTE_AICI') !== -1) return null;
    return CMS_API_URL;
  }
  function apiURL(action, params) {
    var u = baseURL() + (baseURL().indexOf('?') === -1 ? '?action=' + action : '&action=' + action);
    Object.keys(params || {}).forEach(function (k) { u += '&' + k + '=' + encodeURIComponent(params[k]); });
    return u;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.fetchPriority = 'high';
      s.onload = res;
      s.onerror = function () { rej(new Error('Nu s-a încărcat ' + src)); };
      document.body.appendChild(s);
    });
  }
  /* muzeu.min.js (generat la build) întâi, cu fallback la muzeu.js sursă */
  function loadMuzeu() {
    return loadScript('js/muzeu.min.js').catch(function () {
      return loadScript('js/muzeu.js');
    });
  }
  /* Service Worker (GitHub Pages: fără headers custom, deci cache-ul HTTP se face aici).
   * App-shell + imagini imgBB/picsum cache-first cu plafon; API network-first. */
  function inregistreazaSW() {
    try {
      if (!('serviceWorker' in navigator)) return;
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    } catch (e) {}
  }
  inregistreazaSW();
  function idxProaspat(cached) {
    return !!(cached && cached.data && cached.t && (Date.now() - cached.t) < TTL_IDX_MS);
  }
  function fetchJSON(url, ms) {
    var c = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (c) c.abort(); }, ms);
    /* default (nu no-store): lăsăm browserul + SW să refolosească răspunsul;
     * prospețimea reală e garantată de TTL-ul din localStorage + revalidare fundal. */
    var opt = c ? { signal: c.signal, cache: 'default' } : {};
    return fetch(url, opt).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) { clearTimeout(t); throw e; });
  }
  function readLS(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  /* data.js declară const MUZEU (lexical, nu pe window) — citește pe ambele căi. */
  function G_MUZEU() { return (typeof MUZEU !== 'undefined') ? MUZEU : window.MUZEU; }
  function G_RAIOANE() { return (typeof RAIOANE !== 'undefined') ? RAIOANE : window.RAIOANE; }

  function useIndex(idx) {
    window.MUZEU = {
      muzeu: idx.muzeu, sali: idx.sali, obiecte: [], trasee: [], quiz: []
    };
    window.RAIOANE = {
      raioane: (idx.raioane || []).map(function (r) {
        return { id: r.id, nume: r.nume, stare: r.stare, tip: r.tip, nrSate: r.nrSate, nrDosare: r.nrDosare, sate: [] };
      })
    };
    try { localStorage.setItem(LS_VER, idx.updatedAt || ''); } catch (e) {}
  }
  function mergeRaion(rid, sate, obiecte) {
    var MZ = G_MUZEU(), RZ = G_RAIOANE();
    if (!MZ || !RZ) return;
    var r = (RZ.raioane || []).find(function (x) { return x.id === rid; });
    if (r) { r.sate = sate || []; r._plin = true; }
    if (obiecte) {
      MZ.obiecte = MZ.obiecte.filter(function (o) { return (o.raion || 'chisinau') !== rid; }).concat(obiecte);
    }
    memPlin[rid] = true;
  }

  /* Încarcă satele + dosarele unui raion (leneș, cu cache). Rezolvă imediat în mod static. */
  function incarcaRaion(rid) {
    rid = String(rid || '').toLowerCase();
    if (memPlin[rid]) return Promise.resolve();
    if (window.CMS_STATUS === 'static') {
      var r = (window.RAIOANE.raioane || []).find(function (x) { return x.id === rid; });
      if (r) r._plin = true;
      memPlin[rid] = true;
      return Promise.resolve();
    }
    var cached = readLS(LS_RAION + rid);
    var ver = null;
    try { ver = localStorage.getItem(LS_VER); } catch (e) {}
    if (cached && cached.ver === ver) {
      mergeRaion(rid, cached.sate, cached.obiecte);
      return Promise.resolve();
    }
    LoaderArhiva.set(65, 'Se aduc dosarele raionului…');
    return Promise.all([
      fetchJSON(apiURL('getSate', { raion: rid }), TIMEOUT_MS),
      fetchJSON(apiURL('getObiecte', { raion: rid }), TIMEOUT_MS)
    ]).then(function (rs) {
      if (!rs[0].ok) throw new Error(rs[0].error || 'getSate');
      if (!rs[1].ok) throw new Error(rs[1].error || 'getObiecte');
      mergeRaion(rid, rs[0].sate, rs[1].obiecte);
      writeLS(LS_RAION + rid, { ver: ver, sate: rs[0].sate, obiecte: rs[1].obiecte });
      LoaderArhiva.set(80, 'Dosarele sunt aici. Se aprind luminile…');
    });
  }

  /* Boot direct pe dosar (?DOS-00001): dosarul întâi, contextul după. */
  function bootDosar(dosId) {
    LoaderArhiva.set(20, 'Se caută dosarul ' + dosId + '…');
    return Promise.all([
      fetchJSON(apiURL('getObiect', { id: dosId }), TIMEOUT_MS),
      fetchJSON(apiURL('getIndex'), TIMEOUT_MS)
    ]).then(function (rs) {
      if (!rs[0].ok) throw new Error(rs[0].error || 'Dosar inexistent');
      var o = rs[0].obiect;
      useIndex(rs[1]);
      writeLS(LS_IDX, { t: Date.now(), data: rs[1] });
      LoaderArhiva.set(45, 'Dosarul e găsit. Se deschide sala…');
      return incarcaRaion(o.raion || 'chisinau').then(function () {
        // garantează că dosarul e în listă (chiar dacă n-ar fi venit pe canalul de raion)
        var MZ = G_MUZEU();
        var gata = MZ.obiecte.some(function (x) { return dosarIdDe(x) === dosId; });
        if (!gata) MZ.obiecte.push(o);
        window.__boot = { view: 'dosar', dosar: dosId };
        window.CMS_STATUS = 'live-dosar';
        LoaderArhiva.set(70, 'Se așază filele în ramă…');
        return loadMuzeu().then(function () { LoaderArhiva.set(88, 'Se lustruiește sticla vitrinei…'); });
      });
    });
  }
  function dosarIdDe(o) { return String(o.dosarId || o.id || '').toUpperCase(); }

  function bootHome() {
    var cached = readLS(LS_IDX);
    /* Cache proaspăt (<24h): afișare instant + revalidare silențioasă în fundal */
    if (idxProaspat(cached)) {
      useIndex(cached.data);
      window.__boot = { view: 'home' };
      window.CMS_STATUS = 'cache';
      LoaderArhiva.set(50, 'Harta e gata din arhiva locală…');
      var p = loadMuzeu().then(function () { LoaderArhiva.set(85, 'Se aprind luminile sălii…'); });
      // revalidare în fundal pentru vizita următoare
      fetchJSON(apiURL('getIndex'), TIMEOUT_MS).then(function (idx) {
        if (idx.ok) writeLS(LS_IDX, { t: Date.now(), data: idx });
      }).catch(function () {});
      return p;
    }
    /* Fără cache proaspăt: rețea întâi, cu fallback la cache-ul vechi (oricât de vechi) */
    LoaderArhiva.set(18, 'Se cere indexul arhivei…');
    return fetchJSON(apiURL('getIndex'), TIMEOUT_MS).then(function (idx) {
      if (!idx.ok) throw new Error(idx.error || 'getIndex');
      useIndex(idx);
      writeLS(LS_IDX, { t: Date.now(), data: idx });
      window.__boot = { view: 'home' };
      window.CMS_STATUS = 'live';
      LoaderArhiva.set(55, 'Indexul a sosit. Se deschide muzeul…');
      return loadMuzeu().then(function () { LoaderArhiva.set(85, 'Se aprind luminile sălii…'); });
    }).catch(function (e) {
      if (cached && cached.data) {
        useIndex(cached.data);
        window.__boot = { view: 'home' };
        window.CMS_STATUS = 'cache-vechi';
        LoaderArhiva.set(50, 'Netul e slab — deschidem copia locală…');
        return loadMuzeu();
      }
      throw e;
    });
  }

  /* Fallback static: fișierele locale. ID-urile DOS se sintetizează din ordine
   * (aceeași ordine ca în CSV: DOS-00001 = primul obiect din data.js). */
  function bootStatic(dosId) {
    LoaderArhiva.set(25, 'Arhiva online nu răspunde — deschidem copia locală…');
    return loadScript('js/data.js')
      .then(function () { LoaderArhiva.set(45, 'File locale găsite…'); return loadScript('js/raioane.js'); })
      .then(function () {
        var MZ = G_MUZEU(), RZ = G_RAIOANE();
        MZ.obiecte.forEach(function (o, i) {
          if (!o.dosarId) o.dosarId = 'DOS-' + String(i + 1).padStart(5, '0');
        });
        (RZ.raioane || []).forEach(function (r) { r._plin = true; memPlin[r.id] = true; });
        window.__boot = dosId ? { view: 'dosar', dosar: String(dosId).toUpperCase() } : { view: 'home' };
        window.CMS_STATUS = 'static';
        LoaderArhiva.set(70, 'Se așază exponatele…');
        return loadMuzeu().then(function () { LoaderArhiva.set(88, 'Se aprind luminile sălii…'); });
      });
  }

  function bootContribuie() {
    window.__boot = { view: 'contribuie' };
    LoaderArhiva.set(15, 'Se pregătește formularul de contribuire…');
    var cached = readLS(LS_IDX);
    var gata = function () {
      LoaderArhiva.set(70, 'Se așază formularul pe masă…');
      return loadMuzeu().then(function () { LoaderArhiva.set(88, 'Gata de scris…'); });
    };
    if (idxProaspat(cached)) {
      useIndex(cached.data);
      window.CMS_STATUS = 'cache';
      fetchJSON(apiURL('getIndex'), TIMEOUT_MS).then(function (idx) {
        if (idx.ok) writeLS(LS_IDX, { t: Date.now(), data: idx });
      }).catch(function () {});
      return gata();
    }
    var url = baseURL();
    if (!url) return bootStatic(null).then(function () { window.__boot = { view: 'contribuie' }; });
    return fetchJSON(apiURL('getIndex'), TIMEOUT_MS).then(function (idx) {
      if (!idx.ok) throw new Error(idx.error || 'getIndex');
      useIndex(idx);
      writeLS(LS_IDX, { t: Date.now(), data: idx });
      window.__boot = { view: 'contribuie' };
      window.CMS_STATUS = 'live';
      return loadMuzeu().then(function () { LoaderArhiva.set(88, 'Gata de scris…'); });
    }).catch(function (e) {
      console.warn('[cms] API indisponibil, fallback static:', e.message || e);
      return bootStatic(null).then(function () { window.__boot = { view: 'contribuie' }; });
    });
  }

  function boot() {
    LoaderArhiva.set(12, 'Se descuie ușile muzeului…');
    var q = parseQuery(location.search);
    var url = baseURL();
    if (q.view === 'contribuie') return bootContribuie();
    // Orice link cu dosar (?DOS-00001 sau ?…&dosar=DOS-00001) deschide modalul dosarului.
    if (url && q.dosar) {
      return bootDosar(q.dosar).catch(function (e) {
        console.warn('[cms] dosar indisponibil, fallback static:', e.message || e);
        return bootStatic(q.dosar);
      });
    }
    if (url) {
      return bootHome().catch(function (e) {
        console.warn('[cms] API indisponibil, fallback static:', e.message || e);
        return bootStatic(null);
      });
    }
    return bootStatic(q.view === 'dosar' ? q.dosar : null);
  }

  window.__cms = { parseQuery: parseQuery, incarcaRaion: incarcaRaion };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot().catch(function (e) { console.error('[cms]', e); }); });
  } else {
    boot().catch(function (e) { console.error('[cms]', e); });
  }
})();
