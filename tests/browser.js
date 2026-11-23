const fs = require('fs');
const path = require('path');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || '', '.cache/ms-playwright');
  const candidates = [];
  try {
    for (const dir of fs.readdirSync(base)) {
      for (const rel of [
        'chrome-headless-shell-linux64/chrome-headless-shell',
        'chrome-linux64/chrome',
        'chrome-linux/chrome',
      ]) {
        const candidate = path.join(base, dir, rel);
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    }
  } catch {}
  candidates.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return candidates[0] || undefined;
}

function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch {
    return require('/home/runner/.local/share/omgithub-playwright/node_modules/playwright-core').chromium;
  }
}

function launch() {
  const chromium = loadChromium();
  const executablePath = findChromium();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
}

module.exports = { launch, findChromium };
