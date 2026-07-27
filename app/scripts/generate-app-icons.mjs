#!/usr/bin/env node
/**
 * Generates every app icon / splash / notification asset from vector.
 *
 * Run with:  node app/scripts/generate-app-icons.mjs
 *
 * Why this exists: the previous icon sat in a ~600px box inside the 1024px
 * canvas AND did not fill its own viewBox, so the drawn art covered only ~46%
 * of the tile while neighbouring home-screen icons cover ~80%. It also had
 * rounded corners baked in, which double-round under the iOS squircle mask.
 *
 * The fix is to work from the glyph's TRUE bounding box and re-add padding
 * explicitly per platform, rather than inheriting whatever inset the design
 * file happened to carry. BBOX below is that tight box, verified against the
 * geometry: the arc is c(50,50) r=34 with stroke-width 10, giving x 15..85 +-5
 * = 11..89; the sweep-head circle at (50,16) r=7 pulls y up to 9.
 *
 * SVG masters for reference live in app/assets/icons-src/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(DIR, '../assets/images');

/** Tight bounding box of the glyph, in glyph units. */
const BBOX = { x: 11, y: 9, w: 78, h: 80 };

const AMBER = '#E8A33D';
const BASE = '#0B0E13';

/** Radial tile background, matching icon-1024.svg. */
const TILE_BG = `
    <defs>
      <radialGradient id="bg" cx="30%" cy="20%" r="120%">
        <stop offset="0%" stop-color="#242A36"/>
        <stop offset="60%" stop-color="#14181F"/>
        <stop offset="100%" stop-color="${BASE}"/>
      </radialGradient>
    </defs>
    <rect width="{SIZE}" height="{SIZE}" fill="url(#bg)"/>`;

/**
 * The mark itself. `fill` scales the glyph so its bounding-box HEIGHT occupies
 * that fraction of the canvas; width follows at fill * 78/80.
 */
function svg({ size, fill, colour, background }) {
  const scale = (size * fill) / BBOX.h;
  const cx = BBOX.x + BBOX.w / 2; // 50
  const cy = BBOX.y + BBOX.h / 2; // 49
  const bg = background ? TILE_BG.replaceAll('{SIZE}', String(size)) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}
    <g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(${-cx} ${-cy})"
       fill="none" stroke="${colour}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 16 A34 34 0 1 1 16 50" stroke-width="10"/>
      <circle cx="50" cy="16" r="7" fill="${colour}" stroke="none"/>
      <path d="M33 52 L46 65 L69 38" stroke-width="9"/>
    </g>
  </svg>`;
}

/**
 * `opaque: true` flattens onto the base colour and strips the alpha channel
 * entirely — iOS renders any transparency in the app icon as black.
 */
const TARGETS = [
  {
    file: 'icon.png',
    size: 1024,
    fill: 0.82,
    colour: AMBER,
    background: true,
    opaque: true,
    note: 'iOS / store / Android legacy',
  },
  {
    file: 'android-icon-foreground.png',
    size: 1024,
    fill: 0.6,
    colour: AMBER,
    note: 'Android adaptive foreground — inside the 66% safe circle',
  },
  {
    file: 'android-icon-monochrome.png',
    size: 1024,
    fill: 0.6,
    colour: '#FFFFFF',
    note: 'Android 13+ themed layer',
  },
  {
    file: 'splash-icon.png',
    size: 1024,
    fill: 0.52,
    colour: AMBER,
    note: `splash art, transparent on ${BASE}`,
  },
  {
    file: 'notification-icon.png',
    size: 96,
    // Rendered at 1024 then downscaled, so the small output stays clean.
    renderAt: 1024,
    fill: 0.58,
    colour: '#FFFFFF',
    note: 'Android status-bar icon — white, per Android spec',
  },
  {
    file: 'favicon.png',
    size: 48,
    renderAt: 1024,
    fill: 0.82,
    colour: AMBER,
    background: true,
    note: 'web',
  },
];

await mkdir(OUT, { recursive: true });

for (const t of TARGETS) {
  const renderAt = t.renderAt ?? t.size;
  const markup = svg({
    size: renderAt,
    fill: t.fill,
    colour: t.colour,
    background: t.background,
  });

  // The SVG carries explicit pixel width/height, so the default 72dpi density
  // renders it 1:1 at `renderAt`. Small targets render large and downscale.
  let img = sharp(Buffer.from(markup)).resize(t.size, t.size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (t.opaque) {
    img = img.flatten({ background: BASE }).removeAlpha();
  }

  const dest = path.join(OUT, t.file);
  await img.png({ compressionLevel: 9 }).toFile(dest);

  const meta = await sharp(dest).metadata();
  const pct = Math.round(t.fill * 100);
  console.log(
    `${t.file.padEnd(30)} ${meta.width}x${meta.height}  ` +
      `${meta.channels}ch alpha=${meta.hasAlpha}  fill=${pct}%  — ${t.note}`,
  );
}

// The masters are kept purely as provenance; regenerate them so a future edit
// to BBOX/fill stays in sync with what shipped.
await writeFile(
  path.resolve(DIR, '../assets/icons-src/GENERATED.md'),
  `# icons-src\n\nSVG masters from the Claude Design export\n(\`design-export/mobile-task-manager-prototype/project/assets/\`).\n\nThese are reference only. The shipped PNGs in \`../images/\` are generated by\n\`app/scripts/generate-app-icons.mjs\`, which composes the same glyph from its\ntight bounding box (\`viewBox 11 9 78 80\`) and re-applies padding per platform.\n\nFills: iOS 82% · Android adaptive 60% · splash 52% · notification 58%.\n`,
);

console.log('\nDone.');
