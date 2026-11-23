const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3002;
const BASE = `http://localhost:${PORT}`;

function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http.get(`${BASE}/index.html`, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(tryOnce, 300);
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
  try {
    await waitForServer();
    process.env.BASE_URL = BASE;
    for (const file of ['tests/playtest.js', 'tests/mechanics-test.js', 'tests/charlie-nap-test.js', 'tests/opening-break-test.js']) {
      console.log(`\n===== ${file} =====`);
      const child = spawn(process.execPath, [file], { stdio: 'inherit', env: process.env });
      const code = await new Promise((res) => child.on('close', res));
      if (code !== 0) {
        console.error(`\n${file} FAILED (exit ${code})`);
        process.exitCode = 1;
      }
    }
  } finally {
    server.kill();
  }
})();
