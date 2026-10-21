#!/usr/bin/env python3
"""Regenerate the project cards in www/index.html from www/content/projects.json.

The CMS (Sveltia) edits projects.json; a GitHub Action runs this on push and
commits the regenerated HTML back. Running it locally with unchanged JSON
produces zero diff (idempotent).

Schema (www/content/projects.json): {"projects": [ {id, title, blurb, year,
cat, cat_label, color, initials}, ... ]}
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "www" / "index.html"
DATA = ROOT / "www" / "content" / "projects.json"
START = "<!-- @projects:start -->"
END = "<!-- @projects:end -->"

CATS = {"brand": "Branding", "social": "Social", "print": "Print", "ui": "UI/UX"}
COLORS = {f"c{i}" for i in range(1, 7)}


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(title).lower()).strip("-")
    return (s[:24] or "project")


def validate_and_heal(projects):
    """Fill missing/duplicate ids from titles; returns True if JSON changed."""
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
    for p in projects:
        missing = {"title", "blurb", "year", "cat", "color", "initials"} - set(p)
        if missing:
            raise SystemExit(f"project '{p.get('id', '?')}' missing fields: {sorted(missing)}")
        if p["cat"] not in CATS:
            raise SystemExit(f"project '{p['id']}': cat must be one of {sorted(CATS)}, got '{p['cat']}'")
        if p["color"] not in COLORS:
            raise SystemExit(f"project '{p['id']}': color must be one of {sorted(COLORS)}, got '{p['color']}'")
        if not (1990 <= int(p["year"]) <= 2100):
            raise SystemExit(f"project '{p['id']}': year out of range: {p['year']}")
        if not (1 <= len(p["initials"]) <= 3):
            raise SystemExit(f"project '{p['id']}': initials must be 1-3 chars")
    if not projects:
        raise SystemExit("projects list is empty — refusing to generate an empty grid")
    return changed


def card_html(p):
    return (
        f'<div class="scatter-card reveal" data-cat="{esc(p["cat"])}">'
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
        print("healed project ids -> projects.json")
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
