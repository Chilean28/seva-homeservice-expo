#!/usr/bin/env node
/**
 * pnpm hoists dependencies to the workspace root; the iOS build expects them at
 * packages/customer-app/node_modules/. Symlink any missing deps from root.
 * Also fixes symlinks that used the wrong relative path (../../../ from node_modules).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const appNodeModules = path.join(appRoot, 'node_modules');
const rootNodeModules = path.join(appRoot, '..', '..', 'node_modules');

// Remove symlinks with wrong relative path (resolved from node_modules instead of symlink parent)
function removeWrongSymlinks(dir, prefix = '') {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(appNodeModules, full);
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(full);
        // Wrong: target relative to appNodeModules (e.g. ../../../node_modules/...)
        if (target.startsWith('../../../node_modules')) {
          fs.unlinkSync(full);
        }
      } else if (stat.isDirectory() && (name.startsWith('@') || name.startsWith('.'))) {
        removeWrongSymlinks(full, rel + '/');
      }
    } catch (_) {}
  }
}
removeWrongSymlinks(appNodeModules);

const pkgPath = path.join(appRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const deps = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
};
const packageNames = Object.keys(deps);

// Transitive deps that CocoaPods expects under ../node_modules (customer-app/node_modules)
// but pnpm hoists to root — not in package.json so they're not linked by the loop above.
const nativeTransitive = [
  'expo-modules-core',
  'expo-asset',
  'expo-keep-awake',
];

// Never symlink these — Metro must resolve them from workspace root only (single React instance).
const neverSymlink = ['react', 'react-dom', 'react-native'];

const allToLink = [...packageNames, ...nativeTransitive].filter((name) => !neverSymlink.includes(name));

function linkOne(name) {
  const appPath = path.join(appNodeModules, name);
  const rootPath = path.join(rootNodeModules, name);
  const exists = fs.existsSync(appPath);
  const isBadSymlink = exists && fs.lstatSync(appPath).isSymbolicLink() && fs.readlinkSync(appPath).startsWith('../../../node_modules');
  if ((!exists || isBadSymlink) && fs.existsSync(rootPath)) {
    try {
      if (isBadSymlink) fs.unlinkSync(appPath);
      const parent = path.dirname(appPath);
      if (parent !== appNodeModules && !fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }
      const relative = path.relative(parent, rootPath);
      fs.symlinkSync(relative, appPath);
      return true;
    } catch (e) {
      // ignore
    }
  }
  return false;
}

let linked = 0;
for (const name of allToLink) {
  if (linkOne(name)) linked++;
}
if (linked > 0) {
  console.log('[customer-app] Linked', linked, 'hoisted package(s) from workspace root');
}

// Guard: never allow react/react-dom/react-native in customer-app/node_modules (causes duplicate React).
const FORBIDDEN = ['react', 'react-dom', 'react-native'];
FORBIDDEN.forEach((pkg) => {
  const p = path.join(appNodeModules, pkg);
  if (!fs.existsSync(p)) return;
  try {
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      console.warn(`[customer-app] Removing ${pkg} from node_modules (must resolve from workspace root)`);
      fs.rmSync(p, { recursive: true, force: true });
    }
  } catch (_) {}
});
