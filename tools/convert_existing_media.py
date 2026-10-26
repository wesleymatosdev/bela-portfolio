#!/usr/bin/env python3
"""One-off: convert existing www/assets/media originals into the same webp
derivatives tools/sync_from_sonicjs.py now produces, update projects.json."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from sync_from_sonicjs import make_derivative  # noqa: E402

MEDIA = ROOT / "www" / "assets" / "media"
DATA = ROOT / "www" / "content" / "projects.json"

renames = {}
total_before = total_after = 0
for f in sorted(MEDIA.iterdir()):
    if f.suffix.lower() == ".webp" or not f.is_file():
        continue
    if f.stat().st_size == 0:  # placeholders like .gitkeep
        continue
    dest = f.with_suffix(".webp")
    make_derivative(f.read_bytes(), dest)
    renames[f.name] = dest.name
    total_before += f.stat().st_size
    total_after += dest.stat().st_size
    f.unlink()

data = json.loads(DATA.read_text(encoding="utf-8"))
refs = 0
for p in data["projects"]:
    p["images"] = [renames.get(x, x) for x in p["images"]]
    refs += len(p["images"])
DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print(f"converted {len(renames)} images: {total_before/1e6:.1f}MB -> {total_after/1e6:.1f}MB")
print(f"updated {refs} image refs in projects.json")
missing = [x for p in data["projects"] for x in p["images"] if not (MEDIA / x).is_file()]
if missing:
    print(f"MISSING after rename: {missing}")
    sys.exit(1)
