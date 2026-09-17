# Ghid Pages CMS — Muzeul virtual

## Adăugarea unui obiect nou

1. Deschide Pages CMS → colecția **Obiecte muzeu** → **New entry**.
2. Completează câmpurile obligatorii: `id` (slug unic, ex: `ceas-bunic-1950`), `titlu`, `sala`, `perioada`, `an`, `material`, `descriere`, **`cadruId`** (stilul ramei, 1–8), **`raion`** (din dropdown) și **`sat`** (id-ul satului din raionul ales, ex: `singera`). Numărul dosarului (`dosarId`, ex: `DOS-00016`) **nu se completează** — îl pune automat sistemul (următorul număr liber) în ~1–2 min după salvare.
3. Numele fișierului se face automat din slug (`ceas-bunic-1950.json`). Linkul dosarului este numărul: `index.html?DOS-00016`, afișat în dosar ca `#00016`.
3. Imagine principală: încarcă un fișier (ajunge în `public/images/`, URL `/images/…`) **sau** lipește un URL extern.
4. Imaginile 2–5 sunt opționale (URL sau cale; lasă gol dacă nu ai).
5. Salvează → Pages CMS face commit în `content/obiecte/<id>.json`.
6. Workflow-ul `build-index` regenerează automat `index.json` (fișa apare pe site după deploy-ul GitHub Pages, ~1–2 min).

## Reguli

- Nu edita manual `content/obiecte/index.json` — e generat (workflow-ul `build-index` atribuie automat `dosarId` fișelor noi și regenerează indexul la fiecare push; ~1–2 min până apare fișa pe site).
- `dosarId`-ul nu se schimbă după publicare (e linkul dosarului) și nu se repetă (sistemul dă mereu maximul existent + 1).
- `cadruId` (1–8) stabilește rama vizuală a dosarului.
- `raion` se alege din dropdown; `sat` trebuie să fie un sat al acelui raion.
- Nu mai există câmpul `Obiect vedetă` (șters).

## Local

```bash
python3 scripts/build-index.py   # regenerează index.json după editări manuale
python3 -m http.server 8000      # previzualizare (deschide http://localhost:8000)
```
