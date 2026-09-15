#!/usr/bin/env python3
"""Atribuie automat dosarId (DOS-xxxxx) fișelor noi din content/obiecte.

Logica fără risc: următorul număr = MAXIMUL existent + 1 (nu count),
ca ștergerea unei fișe să nu provoace duplicate. Duplicatele sau
formatele invalide primesc și ele următorul număr liber.

Rulare automată: .github/workflows/build-index.yml, înainte de build-index.py.
Rulare locală:  python3 scripts/atribuie-dosar.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "content" / "obiecte"
PAT = re.compile(r"^DOS-(\d+)$", re.IGNORECASE)


def numar(dosar_id) -> int:
    m = PAT.match(str(dosar_id or "").strip())
    return int(m.group(1)) if m else 0


def main() -> None:
    fisiere = sorted(
        p.name for p in DIR.glob("*.json") if p.name != "index.json"
    )
    obiecte = []
    for f in fisiere:
        o = json.loads((DIR / f).read_text(encoding="utf-8"))
        obiecte.append((f, o))

    # Prima trecere: păstrează prima apariție a fiecărui număr valid.
    vazute = set()
    de_atribuit = []
    for f, o in obiecte:
        n = numar(o.get("dosarId"))
        if n and n not in vazute:
            vazute.add(n)
        else:
            de_atribuit.append((f, o))

    # A doua trecere: atribuie crescător de la maximul existent.
    max_n = max(vazute) if vazute else 0
    for f, o in de_atribuit:
        max_n += 1
        nou = {}
        if "id" in o:
            nou["id"] = o["id"]
        nou["dosarId"] = f"DOS-{max_n:05d}"
        for k, v in o.items():
            if k not in nou:
                nou[k] = v
        (DIR / f).write_text(
            json.dumps(nou, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"{f}: atribuit {nou['dosarId']}")

    if not de_atribuit:
        print("nimic de atribuit — toate fișele au dosarId unic")


if __name__ == "__main__":
    main()
