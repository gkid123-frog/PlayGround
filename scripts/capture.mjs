import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [url, output] = process.argv.slice(2);
if (!url || !output) {
  console.error('Usage: capture.mjs <url> <output-dir>');
  process.exit(1);
}

const runtime = join(process.env.HOME || '', '.local/share/omgithub-playwright');
const require = createRequire(join(runtime, 'package.json'));
const { chromium } = require('playwright');
const config = JSON.parse(
  readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'),
);
if (process.platform === 'linux') {
  process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim();
}

mkdirSync(output, { recursive: true });

const startedAt = Date.now();
const mark = (label, from) =>
  console.log(`[capture] ${label}: ${((Date.now() - from) / 1000).toFixed(2)}s`);
const transient = (error) => Object.assign(error, { exitCode: 75 });

let browser;
try {
  const launchAt = Date.now();
  browser = await chromium
    .launch({ ...config.browser.launchOptions, timeout: 30000 })
    .catch(transient);
  mark('browser launch', launchAt);

  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ]) {
    const pageAt = Date.now();
    const page = await browser.newPage({ viewport: { width, height } }).catch(transient);
    page.setDefaultTimeout(30000);

    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (
        response.status() >= 400 &&
        new URL(response.url()).origin === new URL(url).origin
      ) {
        failures.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (error) {
      if (error.name === 'TimeoutError' || /net::ERR_/.test(String(error))) transient(error);
      throw error;
    }
    if (!response) transient(new Error('No response from the preview'));
    if (!response.ok()) {
      const status = response.status();
      const error = new Error(`HTTP ${status} loading preview`);
      error.exitCode = [408, 429, 500, 502, 503, 504].includes(status) ? 75 : 1;
      throw error;
    }
    mark(`${name} navigation`, pageAt);

    const readyAt = Date.now();
    await page.locator('body').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, {
      timeout: 30000,
    });

    // Enter the game when the intro is present so the capture shows real gameplay.
    const start = page.locator('#startGame');
    if ((await start.count()) > 0) {
      try {
        await start.click({ timeout: 5000 });
      } catch {
        // The game may already be running.
      }
    }

    try {
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('#game');
          if (!canvas) return false;
          const rect = canvas.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
        null,
        { timeout: 30000 },
      );
    } catch (error) {
      throw Object.assign(new Error(`Game canvas did not render: ${error.message}`), {
        exitCode: 1,
      });
    }
    await page.waitForTimeout(2000);
    mark(`${name} render`, readyAt);

    if (failures.length) {
      throw Object.assign(
        new Error(`Rendering defects on ${name}: ${failures.join('; ')}`),
        { exitCode: 1 },
      );
    }

    const shotAt = Date.now();
    await page
      .screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 })
      .catch((error) => {
        if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error);
        throw error;
      });
    const size = statSync(join(output, `final-${name}.png`)).size;
    if (size < 24) {
      throw Object.assign(new Error(`Screenshot too small for ${name}`), { exitCode: 1 });
    }
    mark(`${name} screenshot`, shotAt);
    await page.close();
  }
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = error?.exitCode || 1;
} finally {
  await browser?.close().catch((error) => {
    console.error(error);
    process.exitCode ||= 75;
  });
  mark('total', startedAt);
}
