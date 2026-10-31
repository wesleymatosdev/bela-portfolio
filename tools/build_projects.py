#!/usr/bin/env python3
"""Regenerate the project cards in www/index.html from www/content/projects.json.

The CMS (Sveltia) edits projects.json; a GitHub Action runs this on push and
commits the regenerated HTML back. Running it locally with unchanged JSON
produces zero diff (idempotent).

Schema (www/content/projects.json):
  {"projects": [ {id?, title, blurb, year, cat, color?, initials, images?}, ... ]}
  - images: list of file names under www/assets/media, in display order;
    images[0] is the main image on the card thumb and the detail-window cover.
    Cards with no images fall back to the initials color tile.
  - color: empty or "auto" = derived from the cover image's palette (nearest
    theme color, written back to the JSON); a theme token (c1..c6, legacy); or
    any hex color (#rgb / #rrggbb) picked in the CMS color widget — used as-is.
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

# Grid thumbs: the detail gallery keeps the originals; the grid loads a small
# WebP derivative of images[0] so a ~1600px/500KB source never renders at
# card size. Generated from the source file (mtime-stamped) with Pillow.
THUMB_WIDTH = 800
THUMB_QUALITY_STEPS = (82, 70, 60, 50, 40, 30)  # stepped down until the file fits the budget
THUMB_MAX_BYTES = 60 * 1024

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


def nearest_theme(rgb) -> str:
    def dist(a: tuple, b: tuple) -> float:
        return float(sum((a[i] - b[i]) ** 2 for i in range(3)))
    best: str = ""
    best_score = None
    for rank, color in enumerate(rgb):
        for cls, theme in THEME_COLORS.items():
            score = dist(color, theme) * (1 + rank * 0.35)
            if best_score is None or score < best_score:
                best, best_score = cls, score
    return best


HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def token_hex(token: str) -> str:
    r, g, b = THEME_COLORS[token]
    return f"#{r:02x}{g:02x}{b:02x}"


def normalize_hex(value: str) -> str:
    """'#abc' -> '#aabbcc'; returns lowercase 6-digit hex or raises."""
    m = HEX_RE.match(value.strip())
    if not m:
        raise SystemExit(f"color must be a hex color like #ff8800, or a theme token "
                         f"{sorted(THEME_COLORS)}, or empty/auto — got '{value}'")
    h = m.group(1)
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return f"#{h.lower()}"


def resolve_color(p: dict, i: int):
    """Concrete hex for rendering plus whether JSON was healed. Auto-derived
    results are written back to the JSON; explicit choices (token or hex) are
    left untouched. Raises on an invalid explicit color."""
    color = str(p.get("color") or "").strip()
    if not color or color == "auto":
        if p.get("images"):
            token = nearest_theme(cover_palette(MEDIA / p["images"][0]))
        else:
            token = f"c{(i % 6) + 1}"  # no cover yet: cycle the palette
        changed = p.get("color") != token
        if changed:
            p["color"] = token
        return token_hex(token), changed
    if color in THEME_COLORS:
        return token_hex(color), False
    return normalize_hex(color), False


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
        thumb_hex, color_changed = resolve_color(p, i)
        if color_changed:
            changed = True
        if not (1990 <= int(p["year"]) <= 2100):
            raise SystemExit(f"project '{p['id']}': year out of range: {p['year']}")
        if not (1 <= len(str(p["initials"])) <= 3):
            raise SystemExit(f"project '{p['id']}': initials must be 1-3 chars")
    if not projects:
        raise SystemExit("projects list is empty — refusing to generate an empty grid")
    return changed


def thumb_file(src_name: str) -> str:
    """Small WebP derivative of a media image for the grid; returns the file
    name under assets/media. The longest side is capped at THUMB_WIDTH (the
    grid thumb is a ~380x160 box; portraits must shrink too, not upscale).
    Regenerated when the source is newer (mtime-stamped)."""
    from PIL import Image
    src = MEDIA / src_name
    dst = MEDIA / (Path(src_name).stem + "-thumb.webp")
    if not (dst.is_file() and dst.stat().st_mtime >= src.stat().st_mtime):
        img = Image.open(src).convert("RGB")
        if max(img.size) > THUMB_WIDTH:
            scale = THUMB_WIDTH / max(img.size)
            img = img.resize(
                (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                Image.LANCZOS,
            )
        for q in THUMB_QUALITY_STEPS:
            img.save(dst, "WEBP", quality=q, method=6)
            if dst.stat().st_size <= THUMB_MAX_BYTES:
                break
        else:
            raise SystemExit(f"thumb for '{src_name}' stayed over {THUMB_MAX_BYTES} bytes")
    return dst.name


def card_html(p, thumb_hex: str):
    images = p.get("images") or []
    data_images = esc(json.dumps(images, separators=(",", ":")))
    # keyboard access (audit item 3): cards are buttons, not click-only divs
    a11y = ' role="button" tabindex="0"'
    # bilingual fields (audit item 4): both languages ride the card; the
    # toggle swaps them client-side without a reload
    for en_key, pt_key, attr in (("title", "title_pt", "title"), ("blurb", "blurb_pt", "blurb")):
        a11y += f' data-{attr}="{esc(p[en_key])}"'
        if p.get(pt_key):
            a11y += f' data-{attr}-pt="{esc(p[pt_key])}"'
    # main image draws the eye; the initials tile is only a no-image fallback
    if images:
        cover = (f'<img class="scatter-thumb-img" src="assets/media/{esc(thumb_file(images[0]))}"'
                 f' alt="" loading="lazy">')
        thumb_cls = "scatter-thumb has-img"
    else:
        cover = f'<span class="scatter-thumb-inner">{esc(p["initials"])}</span>'
        thumb_cls = "scatter-thumb"
    return (
        f'<div class="scatter-card reveal" data-cat="{esc(p["cat"])}" data-images="{data_images}"{a11y}>'
        f'<div class="{thumb_cls}" style="--thumb-color:{esc(thumb_hex)}">{cover}</div>'
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
    cards = "\n    ".join(card_html(p, resolve_color(p, i)[0]) for i, p in enumerate(projects))
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
