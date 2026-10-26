// Ground truth for the E2E gate, derived at runtime from the content pipeline's
// published JSON — never hardcoded counts. www/content/projects.json is the
// canonical file (src/data/projects.json is its build-time copy).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Mirrors the CATS map in both stacks (tools/build_projects.py + ProjectsGrid.astro).
export const CAT_LABELS = { brand: 'Branding', social: 'Social', print: 'Print', ui: 'UI/UX' };

// Mirrors tools/build_projects.py THEME_COLORS (CMS color token -> hex).
export const THEME_COLORS = {
  c1: '#f1670e',
  c2: '#6771db',
  c3: '#5db06c',
  c4: '#a985b2',
  c5: '#ea7980',
  c6: '#725aeb',
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Same resolution order as build_projects.resolve_color / ProjectsGrid.resolveColor.
export function resolveThumbColor(p) {
  const color = (p.color ?? '').trim();
  if (THEME_COLORS[color]) return THEME_COLORS[color];
  if (HEX_RE.test(color)) return color.toLowerCase();
  return THEME_COLORS.c1;
}

export function loadGroundTruth() {
  const file = path.join(REPO_ROOT, 'www/content/projects.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = raw.projects;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`projects.json at ${file} has no projects array`);
  }
  return list.map((p, index) => ({
    index,
    id: p.id,
    title: p.title,
    year: String(p.year),
    catLabel: CAT_LABELS[p.cat] ?? p.cat,
    thumbColor: resolveThumbColor(p),
    images: p.images ?? [],
  }));
}
