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
const SRC = path.resolve(DIR, '../assets/icons-src');

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

const MARK = (colour) => `
      <path d="M50 16 A34 34 0 1 1 16 50" stroke-width="10"/>
      <circle cx="50" cy="16" r="7" fill="${colour}" stroke="none"/>
      <path d="M33 52 L46 65 L69 38" stroke-width="9"/>`;

const STROKE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

/**
 * The mark centred on a square canvas. `fill` scales the glyph so its
 * bounding-box HEIGHT occupies that fraction of the canvas; width follows at
 * fill * 78/80.
 */
function svg({ size, fill, colour, background }) {
  const scale = (size * fill) / BBOX.h;
  const cx = BBOX.x + BBOX.w / 2; // 50
  const cy = BBOX.y + BBOX.h / 2; // 49
  const bg = background ? TILE_BG.replaceAll('{SIZE}', String(size)) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}
    <g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(${-cx} ${-cy})"
       ${STROKE} stroke="${colour}">${MARK(colour)}
    </g>
  </svg>`;
}

/** The mark cropped to exactly its bounding box — used to compose the splash. */
function tightGlyphSvg({ height, colour }) {
  const scale = height / BBOX.h;
  const width = Math.round(BBOX.w * scale);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(height)}" viewBox="0 0 ${width} ${Math.round(height)}">
    <g transform="scale(${scale}) translate(${-BBOX.x} ${-BBOX.y})"
       ${STROKE} stroke="${colour}">${MARK(colour)}
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

/**
 * Splash — mark above the "TASK MANAGER" wordmark, transparent, centred on
 * BASE by the expo-splash-screen plugin.
 *
 * The wordmark is a raster master (`icons-src/wordmark-task-manager.png`,
 * lifted from the previously shipped splash) rather than live text: its
 * typeface is not bundled in the repo, so rendering it as SVG <text> would
 * silently substitute whatever font the machine happens to have. Sizing it
 * relative to the mark keeps the proportions of the old splash.
 *
 * The canvas MUST stay square. expo-splash-screen pads a non-square source
 * into a square when it generates the native launch-screen asset, but the
 * runtime splash view (held open by preventAutoHideAsync while expo-updates
 * checks in) works from the source as authored. A non-square source therefore
 * renders at two different scales and the splash visibly jumps between them.
 */
const SPLASH = {
  canvasWidth: 1024,
  glyphFill: 0.52, // of canvas width, matching splash.svg
  wordmarkToGlyphWidth: 496 / 320, // ratio measured off the old splash
  gapToGlyphHeight: 26 / 150, // ratio from the splash design mock
};

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

{
  const W = SPLASH.canvasWidth;
  const glyphH = Math.round(W * SPLASH.glyphFill);
  const glyphW = Math.round((glyphH * BBOX.w) / BBOX.h);
  const gap = Math.round(glyphH * SPLASH.gapToGlyphHeight);

  const wmSrc = path.join(SRC, 'wordmark-task-manager.png');
  const wmMeta = await sharp(wmSrc).metadata();
  const wmW = Math.round(glyphW * SPLASH.wordmarkToGlyphWidth);
  const wmH = Math.round((wmMeta.height * wmW) / wmMeta.width);

  // Square canvas, lockup centred — see the note on SPLASH above.
  const H = W;
  const contentTop = Math.round((H - (glyphH + gap + wmH)) / 2);

  const glyph = await sharp(Buffer.from(tightGlyphSvg({ height: glyphH, colour: AMBER })))
    .png()
    .toBuffer();
  const wordmark = await sharp(wmSrc).resize({ width: wmW }).png().toBuffer();

  const dest = path.join(OUT, 'splash-icon.png');
  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: glyph, left: Math.round((W - glyphW) / 2), top: contentTop },
      {
        input: wordmark,
        left: Math.round((W - wmW) / 2),
        top: contentTop + glyphH + gap,
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(dest);

  const meta = await sharp(dest).metadata();
  console.log(
    `${'splash-icon.png'.padEnd(30)} ${meta.width}x${meta.height}  ` +
      `${meta.channels}ch alpha=${meta.hasAlpha}  fill=${Math.round(SPLASH.glyphFill * 100)}%  ` +
      `— splash: mark + wordmark, transparent on ${BASE}`,
  );
}

// The masters are kept purely as provenance; regenerate them so a future edit
// to BBOX/fill stays in sync with what shipped.
await writeFile(
  path.resolve(SRC, 'GENERATED.md'),
  `# icons-src\n\nSVG masters from the Claude Design export\n(\`design-export/mobile-task-manager-prototype/project/assets/\`), plus\n\`wordmark-task-manager.png\` — the "TASK MANAGER" wordmark lifted from the\npreviously shipped splash, kept because its typeface is not bundled here.\n\nThese are reference only. The shipped PNGs in \`../images/\` are generated by\n\`app/scripts/generate-app-icons.mjs\`, which composes the same glyph from its\ntight bounding box (\`viewBox 11 9 78 80\`) and re-applies padding per platform.\n\nFills: iOS 82% · Android adaptive 60% · splash 52% · notification 58%.\n`,
);

console.log('\nDone.');
