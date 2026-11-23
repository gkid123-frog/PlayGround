const { launch } = require('./browser');
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto((process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1');
  await page.click('#startGame');
  await page.waitForFunction(() => window.__game && __game.state().opening === false, { timeout: 30000 });
  if (await page.evaluate(() => document.querySelector('#dialogShade').classList.contains('open')))
    await page.evaluate(() => document.querySelector('#dialogChoices button').click());
  await page.waitForTimeout(300);

  const state = () => page.evaluate(() => __game.state());
  const dialog = () => page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent, choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent) }));
  const click = async (needle) => { const ok = await page.evaluate(n => { const b = [...document.querySelectorAll('#dialogChoices button')].find(b => b.textContent.includes(n)); if (!b) return false; b.click(); return true; }, needle); if (!ok) throw new Error('missing choice ' + needle + ' ' + JSON.stringify(await dialog())); await page.waitForTimeout(100); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };

  console.log('coffee');
  await page.evaluate(() => { __game.setFocus(20); __game.setTemper(100); __game.player.x = 369; __game.player.y = 600; __game.player.awake = true; });
  await page.waitForTimeout(100);
  const note = await page.evaluate(() => document.querySelector('#dadNote').textContent);
  assert(/coffee/i.test(note), 'sidebar points Dad to coffee when focus is low');
  await page.evaluate(() => __game.interact());
  let d = await dialog();
  assert(/Coffee run/.test(d.title), 'coffee maker opens a coffee dialog');
  await click('Brew a cup');
  let st = await state();
  assert(st.focus >= 55, 'coffee restores focus');
  assert(st.coffeeCooldown > 0, 'coffee has a cooldown');
  assert(st.elapsed >= 10, 'coffee costs a little time');
  await page.evaluate(() => __game.interact());
  d = await dialog();
  assert(!d.open, 'coffee cannot be immediately repeated');

  console.log('break');
  await page.evaluate(() => { __game.setTemper(20); __game.setFocus(20); });
  await page.waitForTimeout(100);
  const labelBefore = await page.evaluate(() => document.querySelector('#break').textContent);
  assert(/Take a dad break/.test(labelBefore), 'break button is available');
  await page.click('#break');
  d = await dialog();
  assert(/Dad’s break/.test(d.title), 'break dialog opens');
  await click('Take the break');
  st = await state();
  assert(st.temper >= 45, 'break restores temper');
  assert(st.focus >= 45, 'break restores focus');
  assert(st.breakTimer > 0, 'break has a cooldown');
  await page.waitForTimeout(200);
  const labelAfter = await page.evaluate(() => document.querySelector('#break').textContent);
  assert(/Break ready in/.test(labelAfter), 'break button shows cooldown');

  console.log('non-compliance pressure');
  await page.evaluate(() => {
    __game.setTemper(90); __game.setFocus(20);
    __game.girls.filter(g => !g.dog).forEach(g => { g.mood = 10; g.history = -2; });
    __game.tasks.breakfast = false;
    __game.callGirls('breakfast');
  });
  await page.waitForTimeout(300);
  st = await state();
  assert(st.temper < 90, 'breakfast resistance immediately drains temper');
  const beforePassive = st.temper;
  await page.waitForTimeout(2500);
  st = await state();
  assert(st.temper < beforePassive, 'active non-compliance keeps draining temper over time');

  console.log('page errors', JSON.stringify(errs));
  assert(errs.length === 0, 'no page errors');
  await browser.close();
  console.log('MECHANICS TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
