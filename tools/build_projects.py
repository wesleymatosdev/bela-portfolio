#!/usr/bin/env python3
"""Regenerate the project cards in www/index.html from www/content/projects.json.

The CMS (Sveltia) edits projects.json; a GitHub Action runs this on push and
commits the regenerated HTML back. Running it locally with unchanged JSON
produces zero diff (idempotent).

Schema (www/content/projects.json):
  {"projects": [ {id?, title, blurb, year, cat, color?, initials, images?}, ... ]}
  - images: list of file names under www/assets/media, in display order;
    images[0] is the cover/main image shown in the detail window.
  - color: c1..c6 theme color; when omitted or "auto", derived from the cover
    image's palette (nearest theme color) and written back to the JSON.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "www" / "index.html"
DATA = ROOT / "www" / "content" / "projects.json"
MEDIA = ROOT / "www" / "assets" / "media"
START = "<!-- @projects:start -->"
END = "<!-- @projects:end -->"

CATS = {"brand": "Branding", "social": "Social", "print": "Print", "ui": "UI/UX"}
THEME_COLORS = {  # css class -> hex
    "c1": (241, 103, 14),   # orange
    "c2": (103, 113, 219),  # blue
    "c3": (93, 176, 108),   # green
    "c4": (169, 133, 178),  # purple
    "c5": (234, 121, 128),  # coral
    "c6": (114, 90, 235),   # violet
}


def esc(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(title).lower()).strip("-")
    return (s[:24] or "project")


def cover_palette(path: Path):
    """Dominant colors of an image via coarse quantization (Pillow)."""
    from PIL import Image
    img = Image.open(path).convert("RGB")
    img.thumbnail((64, 64))
    counts = {}
    for px in img.getdata():
        key = (px[0] // 32, px[1] // 32, px[2] // 32)
        counts[key] = counts.get(key, 0) + 1
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:5]
    return [tuple(int(min(255, (k[i] + 0.5) * 32)) for i in range(3)) for k, _ in top]


def nearest_theme(rgb):
    def dist(a: tuple, b: tuple) -> float:
        return float(sum((a[i] - b[i]) ** 2 for i in range(3)))
    best, best_score = None, None
    for rank, color in enumerate(rgb):
        for cls, theme in THEME_COLORS.items():
            score = dist(color, theme) * (1 + rank * 0.35)
            if best_score is None or score < best_score:
                best, best_score = cls, score
    return best


def validate_and_heal(projects):
    """Fill ids, resolve colors; returns True if JSON changed."""
    changed = False
    ids = set()
    for p in projects:
        pid = str(p.get("id") or "").strip()
        if not pid:
            pid = slugify(p.get("title", ""))
            p["id"] = pid
            changed = True
        base = pid
        n = 2
        while pid in ids:
            pid = f"{base}-{n}"
            n += 1
            p["id"] = pid
            changed = True
        ids.add(pid)
    for i, p in enumerate(projects):
        missing = {"title", "blurb", "year", "cat", "initials"} - set(p)
        if missing:
            raise SystemExit(f"project '{p.get('id', '?')}' missing fields: {sorted(missing)}")
        if p["cat"] not in CATS:
            raise SystemExit(f"project '{p['id']}': cat must be one of {sorted(CATS)}, got '{p['cat']}'")
        images = p.get("images") or []
        # CMS writes image entries as {img: "file.png"}; humans/flat lists as "file.png"
        images = [x if isinstance(x, str) else x.get("img") for x in images]
        if any(not isinstance(x, str) or not x for x in images):
            raise SystemExit(f"project '{p['id']}': images must be a list of image entries")
        if p.get("images") != images:
            p["images"] = images
            changed = True
        for x in images:
            if not (MEDIA / x).is_file():
                raise SystemExit(f"project '{p['id']}': image not found in www/assets/media: '{x}'")
        color = str(p.get("color") or "").strip()
        if not color or color == "auto":
            if images:
                color = nearest_theme(cover_palette(MEDIA / images[0]))
            else:
                color = f"c{(i % 6) + 1}"  # no cover yet: cycle the palette
            if p.get("color") != color:
                p["color"] = color
                changed = True
        if color not in THEME_COLORS:
            raise SystemExit(f"project '{p['id']}': color must be one of {sorted(THEME_COLORS)}, got '{color}'")
        if not (1990 <= int(p["year"]) <= 2100):
            raise SystemExit(f"project '{p['id']}': year out of range: {p['year']}")
        if not (1 <= len(str(p["initials"])) <= 3):
            raise SystemExit(f"project '{p['id']}': initials must be 1-3 chars")
    if not projects:
        raise SystemExit("projects list is empty — refusing to generate an empty grid")
    return changed


def card_html(p):
    images = p.get("images") or []
    data_images = esc(json.dumps(images, separators=(",", ":")))
    return (
        f'<div class="scatter-card reveal" data-cat="{esc(p["cat"])}" data-images="{data_images}">'
        f'<div class="scatter-thumb {esc(p["color"])}">'
        f'<span class="scatter-thumb-inner">{esc(p["initials"])}</span></div>'
        f'<div class="scatter-body"><h3>{esc(p["title"])}</h3>'
        f"<p>{esc(p['blurb'])}</p>"
        f'<div class="scatter-meta">'
        f'<span class="scatter-year">{int(p["year"])}</span>'
        f'<span class="scatter-cat {esc(p["cat"])}">{CATS[p["cat"]]}</span>'
        f"</div></div></div>"
    )


def main():
    raw = json.loads(DATA.read_text(encoding="utf-8"))
    is_dict = isinstance(raw, dict)
    projects = raw["projects"] if is_dict else raw
    changed = validate_and_heal(projects)
    if changed:
        payload = {"projects": projects} if is_dict else projects
        DATA.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("healed ids/colors -> projects.json")
    cards = "\n    ".join(card_html(p) for p in projects)
    html = HTML.read_text(encoding="utf-8")
    if START not in html or END not in html:
        raise SystemExit(f"{HTML.name} is missing the {START}/{END} markers")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    replacement = (
        f"{START}\n    {cards}\n  {END}"
    )
    new_html = pattern.sub(lambda _: replacement, html, count=1)
    if new_html != html:
        HTML.write_text(new_html, encoding="utf-8")
        print(f"regenerated {len(projects)} cards -> {HTML.name}")
    else:
        print(f"up to date ({len(projects)} cards)")


if __name__ == "__main__":
    main()
