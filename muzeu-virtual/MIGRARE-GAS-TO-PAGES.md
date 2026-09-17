# Migrare GAS → Pages CMS (2026-09-15)

Proiect 100% static: GitHub Pages + Pages CMS. Fără backend extern.

## 1. Dependențe eliminate

| Fișier | Eliminat | Motiv |
|---|---|---|
| `index.html` | blocul `window.DEPLOY_URL` + redirectul `?page=admin` | URL Google Apps Script, incompatibil cu Pages CMS |
| `index.html` | `preconnect/dns-prefetch script.google.com`, `dns-prefetch api.imgbb.com` | domenii externe moarte după migrare |
| `js/cms.js` | `CMS_API_URL`, `baseURL()`, `apiURL()`, apelurile `getIndex/getSate/getObiecte/getObiect`, `bootDosar()`/`bootHome()` live, cache-ul LS pentru API, înregistrarea `sw.js` (fișier inexistent) | întregul strat live GAS; boot-ul e acum doar `bootStatic()` |
| `js/muzeu.js` | `IMGBB_KEY` (cheie API expusă public!), `uploadLaImgBB()`, POST-ul `fetch(deployUrl, {action:'propuneDosar'})` | upload extern + trimitere către GAS |
| `js/`, `css/` | `cms.min.js`, `muzeu.min.js`, `muzeu.min.css` **șterse** | copii comprimate făcute manual, desincronizate (conțineau încă cod GAS); sursa unică e `cms.js`/`muzeu.js`/`muzeu.css` |

Verificare: `rg "script.google|DEPLOY_URL|IMGBB|imgbb|propuneDosar"` → 0 rezultate.

## 2. Optimizări (fără pierdere de funcționalitate)

- `js/data.js`: 17 KB → 4 KB. Array-ul `obiecte` duplicat a fost șters; rămân `{muzeu, sali}` + `obiecte: []` (suprascris la boot din `content/`).
- `index.html`: referă `css/muzeu.css` + `js/cms.js` (`defer`); `cms.js` încarcă `js/muzeu.js` direct (fără tentativă `.min`).
- `content/obiecte/index.json` nu se mai editează manual: `scripts/build-index.py` + workflow-ul `build-index.yml` îl regenerează la fiecare push pe `content/obiecte/**`. Ordinea alfabetică stabilă păstrează ID-urile `DOS-00001…`.
- `js/raioane.js` (140 KB) rămâne ca rezervă; `incarcaRaion()` e acum rezolvare imediată (totul e local).

## 3. Pages CMS

- `.pages.yml` nou la rădăcină: colecția `obiecte` (`content/obiecte`, fără `index.json`), 18 câmpuri mapate 1:1 pe schema JSON, `filename: "{primary}.json"`, `settings.content.merge: true`.
- `public/images/` nou — destinația upload-urilor din CMS (`output: /images`).
- Imagini hibrid (cerință): `normalizeazaObiect()` acceptă cale din repo **sau** URL extern; placeholder-ele `picsum.photos` rămân ca fallback până la migrarea treptată.

## 4. Contribuții — suspendate temporar

Formularul rămâne în DOM (validare + preview local + ★ funcționale), dar `trimiteContribuie()` afișează mesajul de suspendare și nu face niciun `fetch`. Cârligul de reactivare: funcția `trimiteContribuie()` din `js/muzeu.js`.

## 5. Structură finală

```
.
├── .pages.yml
├── .github/workflows/build-index.yml
├── scripts/build-index.py
├── index.html
├── content/obiecte/*.json + index.json (generat)
├── public/images/
├── css/muzeu.css
└── js/cms.js, muzeu.js, data.js (slim), raioane.js (rezervă)
```

Notă: structura cu `content/css`, `content/js` din cerința inițială nu a fost aplicată — `css/` și `js/` la rădăcină sunt corecte pentru GitHub Pages; `content/` conține doar date editabile CMS.
