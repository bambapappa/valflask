"""Import only review proposals; never copy published data from an artifact."""
import json
import os
from pathlib import Path
import sys
import tempfile


def read_queue(path):
    value = json.loads(path.read_text())
    if not isinstance(value, list) or any(not isinstance(p, dict) for p in value):
        raise ValueError("Invalid calculation review queue")
    return value


def merge_artifact(artifact, destination):
    matches = list(artifact.rglob("calculation_review.json"))
    if len(matches) != 1 or matches[0].is_symlink():
        raise ValueError("Expected exactly one calculation_review.json")
    incoming = read_queue(matches[0])
    current = read_queue(destination) if destination.exists() else []
    merged = {}
    for row in current + incoming:
        merged[json.dumps(row, sort_keys=True, ensure_ascii=False)] = row
    with tempfile.NamedTemporaryFile(mode="w", dir=destination.parent, delete=False) as f:
        temporary = Path(f.name)
        json.dump(list(merged.values()), f, ensure_ascii=False, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    try:
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    merge_artifact(Path(sys.argv[1]), Path(sys.argv[2]))
