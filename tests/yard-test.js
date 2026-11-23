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
  const dialog = () => page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent, choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent) }));
  const click = async (needle) => { const ok = await page.evaluate(n => { const b = [...document.querySelectorAll('#dialogChoices button')].find(b => b.textContent.includes(n)); if (!b) return false; b.click(); return true; }, needle); if (!ok) throw new Error('missing choice ' + needle + ' ' + JSON.stringify(await dialog())); await page.waitForTimeout(150); };

  // Walk Dad to the outside door and interact.
  await page.evaluate(() => { __game.player.x = 870; __game.player.y = 350; __game.player.awake = true; });
  await page.waitForTimeout(100);
  await page.evaluate(() => __game.interact());
  let d = await dialog();
  assert(d.open && /Go outside\?/.test(d.title), 'outside door prompts confirmation');
  assert(d.choices.some(c => /Yes, go outside/.test(c)), 'yes option available');
  assert(d.choices.some(c => /No, stay inside/.test(c)), 'no option available');

  // Decline first.
  await click('No, stay inside');
  assert(await page.evaluate(() => __game.state().scene) === 'house', 'declining keeps Dad inside');

  // Accept.
  await page.evaluate(() => __game.interact());
  await click('Yes, go outside');
  assert(await page.evaluate(() => __game.state().scene) === 'yard', 'Dad goes outside');
  const outside = await page.evaluate(() => ({ charlieOutside: __game.state().charlieOutside, player: { x: __game.player.x, y: __game.player.y } }));
  assert(outside.charlieOutside === true, 'Charlie comes outside too');
  assert(outside.player.x < 200, 'Dad is in the yard');

  // Screenshot the yard.
  await page.screenshot({ path: 'screenshots/yard.png' });

  // Call the girls outside via the sandbox.
  await page.evaluate(() => { __game.player.x = 505; __game.player.y = 495; __game.player.awake = true; });
  await page.waitForTimeout(100);
  await page.evaluate(() => __game.interact());
  d = await dialog();
  assert(d.open && /Sandbox/.test(d.title), 'sandbox interaction opens');
  await click('Call the girls outside');
  assert(await page.evaluate(() => __game.state().girlsOutside) === true, 'girls come outside');
  const girlsInYard = await page.evaluate(() => __game.girls.filter(g => !g.dog).every(g => g.x > 400 && g.x < 560));
  assert(girlsInYard, 'girls are in the yard');

  // Send them inside.
  await page.evaluate(() => __game.interact());
  await click('Send the girls inside');
  assert(await page.evaluate(() => __game.state().girlsOutside) === false, 'girls go back inside');

  // Go back inside.
  await page.evaluate(() => { __game.player.x = 70; __game.player.y = 350; __game.player.awake = true; });
  await page.waitForTimeout(100);
  await page.evaluate(() => __game.interact());
  d = await dialog();
  assert(d.open && /Go back inside\?/.test(d.title), 'inside door prompts');
  await click('Yes, go inside');
  assert(await page.evaluate(() => __game.state().scene) === 'house', 'Dad goes back inside');
  assert(await page.evaluate(() => __game.state().charlieOutside) === false, 'Charlie comes back inside');

  // No-trigger interaction when no prop nearby.
  await page.evaluate(() => { __game.player.x = 500; __game.player.y = 350; __game.player.awake = true; });
  await page.waitForTimeout(100);
  await page.evaluate(() => __game.interact());
  d = await dialog();
  assert(d.open, 'interacting in empty yard still opens a dialog');

  assert(errs.length === 0, 'no page errors');
  await browser.close();
  console.log('YARD TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
