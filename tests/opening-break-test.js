const { launch } = require('./browser');
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto((process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1');
  await page.click('#startGame');
  await page.waitForFunction(() => window.__game && __game.state().opening === false, { timeout: 30000 });
  await page.waitForTimeout(300);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };
  const dialog = () => page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent, choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent) }));
  const click = async (needle) => { const ok = await page.evaluate(n => { const b = [...document.querySelectorAll('#dialogChoices button')].find(b => b.textContent.includes(n)); if (!b) return false; b.click(); return true; }, needle); if (!ok) throw new Error('missing choice ' + needle + ' ' + JSON.stringify(await dialog())); await page.waitForTimeout(150); };

  let d = await dialog();
  assert(/Good morning, Dad/.test(d.title), 'opening wake dialog appears');
  assert(d.choices.some(c => /Take a dad break/.test(c)), 'break option is offered in the wake dialog');

  // Take a break from the wake dialog.
  await click('Take a dad break');
  d = await dialog();
  assert(/Dad’s break/.test(d.title), 'break dialog opens from wake dialog');
  await click('Take the break');
  d = await dialog();
  assert(/Good morning, Dad/.test(d.title), 'wake dialog is restored after a break');
  assert(d.choices.some(c => /Get out of bed/.test(c)), 'get out of bed option is available again');
  await click('Get out of bed');
  let st = await page.evaluate(() => __game.state());
  assert(await page.evaluate(() => __game.player.awake) === true, 'Dad can get out of bed');

  // Push through instead also restores.
  await page.evaluate(() => { __game.setBreak(0); __game.openDialog('Test dialog','hi',[{label:'Close',run:()=>{}}]); });
  await page.waitForTimeout(150);
  await click('Take a dad break');
  await click('Push through instead');
  d = await dialog();
  assert(/Test dialog/.test(d.title), 'push through restores the interrupted dialog');
  await click('Close');

  // Safety net: force-close the wake dialog without getting up.
  await page.evaluate(() => { __game.player.awake = false; __game.closeDialog(); });
  await page.waitForTimeout(400);
  d = await dialog();
  assert(d.open && /Good morning, Dad/.test(d.title), 'safety net reopens the wake dialog if Dad is still in bed');
  await click('Get out of bed');
  assert(await page.evaluate(() => __game.player.awake) === true, 'safety net path still lets Dad get up');

  assert(errs.length === 0, 'no page errors');
  await browser.close();
  console.log('OPENING BREAK TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
