#!/usr/bin/env python3
"""Behåll datumet för en oförändrad prövning i kö-passets exportindex.

Granskningsloggen registrerar varje körning. Indexet på main ska däremot bara
ändras när en post, dess utfall eller dess underlag faktiskt har ändrats.
"""

import json
import subprocess
import sys
from pathlib import Path


def poster(data):
    rows = data.get("poster") if isinstance(data, dict) else None
    if not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in rows):
        raise ValueError("Ogiltigt prövningsindex")
    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Dubbla prövnings-id")
    return rows


def bevara_datum(gammal, ny):
    gamla = {row["id"]: row for row in poster(gammal)}
    antal = 0
    for row in poster(ny):
        fore = gamla.get(row["id"])
        if fore is None or "datum" not in fore or "datum" not in row:
            continue
        utan_datum = lambda value: {key: item for key, item in value.items() if key != "datum"}
        if utan_datum(fore) == utan_datum(row) and fore["datum"] != row["datum"]:
            row["datum"] = fore["datum"]
            antal += 1
    return antal


def main():
    repo = Path(sys.argv[1]).resolve()
    path = repo / "data" / "provningar.json"
    old_bytes = subprocess.check_output(["git", "-C", str(repo), "show", "HEAD:data/provningar.json"])
    old = json.loads(old_bytes)
    new = json.loads(path.read_text())
    antal = bevara_datum(old, new)
    if old == new:
        path.write_bytes(old_bytes)
    elif antal:
        path.write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n")
    print(f"  {antal} oförändrade prövningar behöll föregående datum.")


if __name__ == "__main__":
    main()
