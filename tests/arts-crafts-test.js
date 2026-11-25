const { launch } = require('./browser');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto((process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1&v=' + Date.now());
  await page.waitForFunction(() => window.__game, { timeout: 30000 });
  await page.click('#startGame');
  await page.waitForFunction(() => __game.state().opening === false, { timeout: 30000 });
  if (await page.evaluate(() => document.querySelector('#dialogShade').classList.contains('open')))
    await page.evaluate(() => document.querySelector('#dialogChoices button').click());

  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };

  const geometry = await page.evaluate(() => {
    const rt = __game.props.find(p => p.type === 'roundTable');
    const seats = __game.craftSeats();
    const kitchen = __game.props.find(p => p.type === 'table');
    const centers = seats.map(s => [s.x + s.w / 2, s.y + s.h / 2]);
    return {
      rt: rt && { x: rt.x, y: rt.y, w: rt.w, h: rt.h, task: rt.task || '' },
      seatCount: seats.length,
      seatRooms: centers.map(([x, y]) => __game.roomAt(x, y)),
      seatClear: centers.map(([x, y]) => !__game.blocked(x, y)),
      tableSolid: rt ? __game.blocked(rt.x + rt.w / 2, rt.y + rt.h / 2) : false,
      kitchenTask: kitchen && kitchen.task,
      seatCenters: centers,
      dadRoom: __game.roomAt(__game.player.x, __game.player.y)
    };
  });
  assert(!!geometry.rt && geometry.rt.x > 665 && geometry.rt.y > 397, 'round table sits in the living room’s bottom half');
  assert(geometry.seatCount === 4 && geometry.seatRooms.every(r => r === 'living'), 'four chairs surround the round table in the living room');
  assert(geometry.seatRooms.length === 4 && geometry.seatCenters.every(([, y]) => y > 397), 'every craft chair is in the bottom half of the living room');
  assert(geometry.tableSolid, 'the round table blocks movement through its top');
  assert(geometry.seatClear.every(Boolean), 'all four craft chairs stay walkable');
  assert(geometry.rt.task === '' && geometry.kitchenTask === 'meal', 'arts-and-crafts table stays separate from kitchen meal stations');

  await page.evaluate(() => {
    __game.girls.filter(g => !g.dog).forEach((g, i) => {
      g.x = 690; g.y = 445 + i * 32; g.route = []; g.routeMode = '';
      g.seatedAtCraft = false; g.seatedAtTable = false;
    });
    __game.player.x = 786; __game.player.y = 500; __game.player.awake = true;
  });
  await page.evaluate(() => __game.interact());
  const dialog = await page.evaluate(() => ({
    open: document.querySelector('#dialogShade').classList.contains('open'),
    title: document.querySelector('#dialogTitle').textContent,
    choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent)
  }));
  assert(dialog.open && /Arts and crafts/.test(dialog.title), 'interacting at the round table opens arts and crafts');
  assert(dialog.choices.some(c => /Sit down and craft/.test(c)), 'the craft invitation is available');

  await page.evaluate(() => {
    [...document.querySelectorAll('#dialogChoices button')].find(b => b.textContent.includes('Sit down and craft')).click();
  });
  await page.waitForFunction(() => __game.state().craftActive, { timeout: 5000 });
  assert(true, 'arts and crafts begins');
  await page.waitForFunction(() => __game.girls.filter(g => !g.dog).every(g => g.seatedAtCraft), { timeout: 25000 });
  const seated = await page.evaluate(() => {
    const seats = __game.craftSeats().map(s => [s.x + s.w / 2, s.y + s.h / 2]);
    const girls = __game.girls.filter(g => !g.dog);
    const used = girls.map(g => seats.findIndex(([x, y]) => Math.hypot(g.x - x, g.y - y) < 3));
    const dadSeat = seats.findIndex(([x, y]) => Math.hypot(__game.player.x - x, __game.player.y - y) < 3);
    return { seated: girls.every(g => g.seatedAtCraft), used, dadSeat, dadCrafting: __game.state().dadCrafting };
  });
  assert(seated.seated && seated.used.every(i => i >= 0), 'all three girls sit on chairs at the round table');
  assert(seated.dadCrafting && seated.dadSeat >= 0, 'Dad takes the fourth chair');
  assert(new Set([...seated.used, seated.dadSeat]).size === 4, 'the family fills all four chairs');

  await page.evaluate(() => { __game.setFocus(50); __game.setTemper(50); });
  const before = await page.evaluate(() => ({
    focus: __game.state().focus,
    temper: __game.state().temper,
    moods: __game.girls.filter(g => !g.dog).map(g => g.mood)
  }));
  await page.evaluate(() => __game.finishCrafts());
  const after = await page.evaluate(() => ({
    state: __game.state(),
    girls: __game.girls.filter(g => !g.dog).map(g => ({ seated: g.seatedAtCraft, mood: g.mood, agenda: g.agenda }))
  }));
  assert(!after.state.craftActive && after.state.craftDone, 'the craft session wraps up cleanly');
  assert(after.state.focus > before.focus && after.state.temper > before.temper, 'arts and crafts rewards focus and patience');
  assert(after.girls.every((g, i) => !g.seated && g.mood > before.moods[i]), 'each girl leaves the table happier with her craft');

  assert(errors.length === 0, 'no page errors');
  await browser.close();
  console.log('ARTS AND CRAFTS TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
