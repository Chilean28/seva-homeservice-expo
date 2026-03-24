/**
 * splash-icon.png is opaque RGB (black background baked in). Expo backgroundColor
 * cannot replace those pixels. Generates splash-icon-white-bg.png for icon + splash.
 *
 * Usage: node scripts/make-splash-icon-white-bg.cjs
 * Requires: sharp (pnpm add -D sharp -w) or: npx --package=sharp node scripts/...
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');

const targets = [
  path.join(root, 'packages/customer-app/assets/images/splash-icon.png'),
  path.join(root, 'packages/worker-app/assets/images/splash-icon.png'),
];

async function processFile(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(data);
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    if (r < 55 && g < 55 && b < 55) {
      buf[i] = 255;
      buf[i + 1] = 255;
      buf[i + 2] = 255;
      buf[i + 3] = 255;
    }
  }
  const outPath = srcPath.replace(/splash-icon\.png$/, 'splash-icon-white-bg.png');
  await sharp(buf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(outPath);
  console.log('Wrote', outPath);
}

(async () => {
  for (const src of targets) {
    if (!fs.existsSync(src)) {
      console.warn('Skip missing:', src);
      continue;
    }
    await processFile(src);
  }
})();
