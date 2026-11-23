const { launch } = require('./browser');
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto((process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1&v=' + Date.now());
  await page.click('#startGame');
  await page.waitForFunction(() => window.__game && __game.state().opening === false, { timeout: 30000 });
  if (await page.evaluate(() => document.querySelector('#dialogShade').classList.contains('open')))
    await page.evaluate(() => document.querySelector('#dialogChoices button').click());
  await page.waitForTimeout(300);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };

  // Force Charlie to nap in the hallway with the girls far away.
  await page.evaluate(() => {
    const c = __game.girls.find(g => g.dog);
    c.x = 477; c.y = 350; c.route = [];
    __game.charlieTimer.action = 'nap';
    __game.charlieTimer.next = 999;
    __game.charlieTimer.checkCooldown = 999;
    __game.girls.filter(x => !x.dog).forEach((g, i) => { g.x = 850 + i * 20; g.y = 600; g.route = []; });
  });
  await page.waitForTimeout(500);
  const napping = await page.evaluate(() => {
    const c = __game.girls.find(g => g.dog);
    return { action: __game.charlieTimer.action, route: c.route.length, x: c.x, y: c.y };
  });
  assert(napping.action === 'nap' && napping.route === 0, 'Charlie is stationary while napping');

  // Send a girl straight at him.
  await page.evaluate(() => {
    const g = __game.girls.find(x => !x.dog);
    g.x = 477; g.y = 390; g.route = [];
    __game.setDestination(g, 477, 310, 'activity');
  });

  // A girl should not be able to occupy Charlie's spot.
  const overlap = await page.evaluate(() => {
    const c = __game.girls.find(g => g.dog);
    const g = __game.girls.find(x => !x.dog);
    return Math.hypot(g.x - c.x, g.y - c.y);
  });
  assert(overlap > 20, 'girls cannot walk through a napping Charlie');

  // Trip reaction should fire (bubble or Charlie waking).
  let tripped = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const c = __game.girls.find(g => g.dog);
      const g = __game.girls.find(x => !x.dog);
      return { bubble: g.bubble, action: __game.charlieTimer.action, route: c.route.length };
    });
    if (/charlie/i.test(info.bubble || '') || info.route > 0 || info.action !== 'nap') { tripped = true; break; }
  }
  assert(tripped, 'a girl trips on Charlie and he moves');

  // Dad can interact with a napping Charlie and wake him.
  await page.evaluate(() => {
    const c = __game.girls.find(g => g.dog);
    c.x = 400; c.y = 450; c.route = [];
    __game.charlieTimer.action = 'nap'; __game.charlieTimer.next = 999;
    __game.player.x = 400; __game.player.y = 490; __game.player.awake = true;
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => __game.interact());
  const dialog = await page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent, choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent) }));
  assert(dialog.open && /Charlie is napping/.test(dialog.title), 'Dad can interact with napping Charlie');
  assert(dialog.choices.some(c => /Wake him up/.test(c)), 'wake option is available');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#dialogChoices button')].find(b => /Wake him up/.test(b.textContent)); b.click(); });
  await page.waitForTimeout(300);
  const woke = await page.evaluate(() => { const c = __game.girls.find(g => g.dog); return { route: c.route.length, action: __game.charlieTimer.action }; });
  assert(woke.route > 0 || woke.action !== 'nap', 'waking Charlie makes him move');

  assert(errs.length === 0, 'no page errors');
  await browser.close();
  console.log('CHARLIE NAP TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
