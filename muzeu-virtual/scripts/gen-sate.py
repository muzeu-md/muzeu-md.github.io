#!/usr/bin/env python3
"""Generează lista completă de sate (dropdown) în .pages.yml din js/raioane.js.

Sursa unică de adevăr: js/raioane.js (37 raioane, ~1682 sate).
Opțiunile se scriu între marcajele SATE-GENERAT-START/END; restul
fișierului .pages.yml nu este atins.

Rulare automată: .github/workflows/build-index.yml la schimbarea js/raioane.js.
Rulare locală:  python3 scripts/gen-sate.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAIOANE_JS = ROOT / "js" / "raioane.js"
PAGES_YML = ROOT / ".pages.yml"
START = "# SATE-GENERAT-START"
END = "# SATE-GENERAT-END"


def yaml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> None:
    src = RAIOANE_JS.read_text(encoding="utf-8")
    date = json.loads(re.search(r"\{.*\}", src, re.S).group(0))
    raioane = date["raioane"]

    linii = []
    for r in raioane:
        for s in r.get("sate", []):
            linii.append(
                f'            - name: {s["id"]}\n'
                f'              label: {yaml_str(r["nume"] + " — " + s["nume"])}'
            )
    bloc = "\n".join(linii)

    yml = PAGES_YML.read_text(encoding="utf-8")
    i, j = yml.index(START), yml.index(END)
    # păstrează linia START, înlocuiește totul până la linia END
    cap = yml[: i + len(START)] + "\n"
    coada = yml[j:]
    nou = cap + bloc + "\n" + " " * 12 + coada
    if nou != yml:
        PAGES_YML.write_text(nou, encoding="utf-8")
        print(f"OK: {len(linii)} sate generate în .pages.yml")
    else:
        print("nimic de actualizat — lista satelor e la zi")


if __name__ == "__main__":
    main()
