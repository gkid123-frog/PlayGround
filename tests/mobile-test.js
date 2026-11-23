const { launch } = require('./browser');

(async () => {
  const browser = await launch();
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };

  for (const [name, width, height] of [['landscape phone', 844, 390], ['portrait phone', 390, 844]]) {
    console.log(`  ${name}`);
    const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto((process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1&v=' + Date.now(), { waitUntil: 'load' });

    const intro = await page.evaluate(() => {
      const b = document.querySelector('#startGame').getBoundingClientRect();
      const s = getComputedStyle(document.querySelector('#introShade'));
      const shade = document.querySelector('#introShade');
      return { top: b.top, bottom: b.bottom, vh: innerHeight, overflowY: s.overflowY, scrollH: shade.scrollHeight, clientH: shade.clientHeight };
    });
    assert(intro.bottom <= intro.vh + 1 || ['auto', 'scroll'].includes(intro.overflowY), 'intro start button is visible or the intro scrolls');
    await page.click('#startGame');
    await page.waitForFunction(() => window.__game && __game.state().opening === false, { timeout: 30000 });
    if (await page.evaluate(() => document.querySelector('#dialogShade').classList.contains('open')))
      await page.evaluate(() => document.querySelector('#dialogChoices button').click());
    await page.waitForTimeout(350);

    const layout = await page.evaluate(() => {
      const rect = sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
      const panel = document.querySelector('.panel');
      return {
        vw: innerWidth, vh: innerHeight,
        docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
        canvas: rect('#game'), pad: rect('.pad'), act: rect('#act'), panel: rect('.panel'),
        panelOverflow: getComputedStyle(panel).overflowY, panelScroll: panel.scrollHeight, panelClient: panel.clientHeight
      };
    });
    assert(layout.canvas.w > 250 && layout.canvas.h > 150, 'game canvas is usable');
    assert(layout.pad.x >= 0 && layout.pad.y >= 0 && layout.pad.right <= layout.vw && layout.pad.bottom <= layout.vh, 'touch movement pad stays on screen');
    assert(layout.act.x >= 0 && layout.act.y >= 0 && layout.act.right <= layout.vw && layout.act.bottom <= layout.vh, 'touch action button stays on screen');
    assert(layout.docW <= layout.vw && layout.docH <= layout.vh, 'no page scrolling or overflow');
    assert(layout.panel.bottom <= layout.vh + 1, 'sidebar stays inside the viewport');
    if (layout.panelScroll > layout.panelClient) assert(['auto', 'scroll'].includes(layout.panelOverflow), 'overflowing sidebar is scrollable');

    // Touch/pointer movement and the green action button both work.
    await page.evaluate(() => { __game.player.x = 500; __game.player.y = 350; __game.player.awake = true; });
    const box = await page.locator('[data-dir="up"]').boundingBox();
    const beforeY = await page.evaluate(() => __game.player.y);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.up();
    const afterY = await page.evaluate(() => __game.player.y);
    assert(afterY < beforeY - 4, 'on-screen pad moves Dad');

    // Stand in an empty hallway spot so the action tap has a predictable result.
    await page.evaluate(() => { __game.player.x = 500; __game.player.y = 350; __game.player.awake = true; });
    await page.waitForTimeout(80);
    await page.tap('#act');
    await page.waitForTimeout(200);
    const dialog = await page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent }));
    assert(dialog.open, 'tap action button opens an interaction');
    assert(/Take a moment/i.test(dialog.title), 'tap action reaches the nearby interaction');
    await page.evaluate(() => document.querySelector('#dialogChoices button').click());
    await page.waitForTimeout(100);

    // The sidebar must be reachable by touch on a portrait phone.
    if (layout.panelScroll > layout.panelClient) {
      const cdp = await page.context().newCDPSession(page);
      const x = Math.round(layout.panel.x + layout.panel.w / 2);
      const y0 = Math.round(layout.panel.y + layout.panel.h - 40);
      const y1 = Math.round(layout.panel.y + 50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y0 + (y1 - y0) * i / 10) }] });
        await page.waitForTimeout(15);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
      const scrolled = await page.evaluate(() => document.querySelector('.panel').scrollTop);
      assert(scrolled > 20, 'overflowing sidebar scrolls by touch');
    }

    // Dad breaks are reachable and stay open after a touch tap.
    await page.tap('#break');
    await page.waitForTimeout(200);
    const breakDialog = await page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent }));
    assert(breakDialog.open && /Dad’s break/.test(breakDialog.title), 'dad break opens and stays open on touch');
    assert(errs.length === 0, 'no page errors');

    await page.screenshot({ path: `screenshots/mobile-${width}x${height}.png` });
    await page.close();
  }
  await browser.close();
  console.log('MOBILE TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
