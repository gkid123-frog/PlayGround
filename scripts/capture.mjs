import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [url, output] = process.argv.slice(2);
if (!url || !output) {
  console.error('Usage: capture.mjs <url> <output-dir>');
  process.exit(1);
}

try {
  new URL(url);
} catch {
  console.error(`Invalid CAPTURE_URL: ${url}`);
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

const defect = (message) => Object.assign(new Error(message), { exitCode: 1 });
const transient = (message) =>
  Object.assign(message instanceof Error ? message : new Error(message), { exitCode: 75 });

// Cloudflare and network layers use several status codes for temporary tunnel
// problems (for example HTTP 525 for a TLS handshake failure).
const temporaryStatus = (status) =>
  [408, 425, 429].includes(status) || (status >= 500 && status <= 599);

const responseFailure = (message, status) => {
  const error = new Error(message);
  error.exitCode = temporaryStatus(status) ? 75 : 1;
  return error;
};

const navigationFailure = (error) => {
  if (
    error?.name === 'TimeoutError' ||
    /net::ERR_|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|browser has been closed|Target closed/i.test(
      String(error),
    )
  ) {
    return transient(error);
  }
  return error;
};

let browser;
try {
  const launchAt = Date.now();
  browser = await chromium
    .launch({ ...config.browser.launchOptions, timeout: 30000 })
    .catch((error) => {
      throw transient(error);
    });
  mark('browser launch', launchAt);

  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ]) {
    const pageAt = Date.now();
    const page = await browser.newPage({ viewport: { width, height } }).catch((error) => {
      throw transient(error);
    });
    page.setDefaultTimeout(30000);

    const failures = [];
    page.on('pageerror', (error) => {
      failures.push({ message: error.message, exitCode: 1 });
    });
    page.on('response', (response) => {
      try {
        if (
          response.status() >= 400 &&
          new URL(response.url()).origin === new URL(url).origin
        ) {
          failures.push({
            message: `HTTP ${response.status()}: ${response.url()}`,
            exitCode: temporaryStatus(response.status()) ? 75 : 1,
          });
        }
      } catch {
        // Ignore malformed or non-HTTP resource URLs.
      }
    });

    let response;
    for (let attempt = 1; attempt <= 4; attempt++) {
      // Ignore transient failures from earlier navigation attempts.
      failures.length = 0;
      try {
        response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      } catch (error) {
        response = null;
        error = navigationFailure(error);
        if (error.exitCode === 75 && attempt < 4) {
          console.log(`[capture] ${name} navigation retry ${attempt}: ${error.message}`);
          await page.waitForTimeout(attempt * 1500);
          continue;
        }
        throw error;
      }
      if (!response) {
        const error = transient('No response from the preview');
        if (attempt < 4) {
          console.log(`[capture] ${name} navigation retry ${attempt}: ${error.message}`);
          await page.waitForTimeout(attempt * 1500);
          continue;
        }
        throw error;
      }
      if (!response.ok()) {
        const error = responseFailure(
          `HTTP ${response.status()} loading preview`,
          response.status(),
        );
        if (error.exitCode === 75 && attempt < 4) {
          console.log(`[capture] ${name} navigation retry ${attempt}: ${error.message}`);
          await page.waitForTimeout(attempt * 1500);
          continue;
        }
        throw error;
      }
      break;
    }
    mark(`${name} navigation`, pageAt);
    if (!response?.ok()) {
      throw transient('No successful response from the preview');
    }

    const readyAt = Date.now();
    try {
      await page.locator('body').waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => document.fonts.status === 'loaded', null, {
        timeout: 30000,
      });
    } catch (error) {
      throw defect(`Page content did not become ready: ${error.message}`);
    }

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
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('#game');
          if (!canvas) return false;
          const context = canvas.getContext('2d');
          if (!context) return false;
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let first = null;
          for (let i = 0; i < data.length; i += 4 * 4099) {
            const sample = `${data[i]},${data[i + 1]},${data[i + 2]}`;
            if (first === null) first = sample;
            else if (sample !== first) return true;
          }
          return false;
        },
        null,
        { timeout: 30000 },
      );
    } catch (error) {
      throw defect(`Game canvas did not render: ${error.message}`);
    }
    await page.waitForTimeout(2000);
    mark(`${name} render`, readyAt);

    if (failures.length) {
      const temporary = failures.some((failure) => failure.exitCode === 75);
      throw Object.assign(
        new Error(
          `Rendering defects on ${name}: ${failures
            .map((failure) => failure.message)
            .join('; ')}`,
        ),
        { exitCode: temporary ? 75 : 1 },
      );
    }

    const shotAt = Date.now();
    try {
      await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 });
    } catch (error) {
      if (error?.name === 'TimeoutError' || !browser.isConnected()) throw transient(error);
      throw defect(`Screenshot failed for ${name}: ${error.message}`);
    }
    const size = statSync(join(output, `final-${name}.png`)).size;
    if (size < 24) {
      throw defect(`Screenshot too small for ${name}`);
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
