const { launch } = require('./browser');

const URL = (process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1&v=' + Date.now();
const errors = [];
const consoleErrors = [];
const logs = [];

function log(...args) { const line = args.join(' '); logs.push(line); console.log(line); }

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const dialog = () => page.evaluate(() => ({
    open: document.querySelector('#dialogShade').classList.contains('open'),
    title: document.querySelector('#dialogTitle').textContent,
    text: document.querySelector('#dialogText').textContent,
    choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent)
  }));
  const state = () => page.evaluate(() => __game.state());
  const girls = () => page.evaluate(() => __game.girls.map(g => ({
    short: g.short, x: Math.round(g.x), y: Math.round(g.y), mood: Math.round(g.mood),
    status: g.callStatus, agenda: g.agenda, seated: !!g.seatedAtTable, asleep: !!g.asleep,
    bubble: g.bubble, routeMode: g.routeMode, heartLeft: g.heartLeft || 0
  })));
  const clickChoice = async (needle) => {
    const ok = await page.evaluate((needle) => {
      const b = [...document.querySelectorAll('#dialogChoices button')].find(b => b.textContent.includes(needle));
      if (!b) return false;
      b.click();
      return true;
    }, needle);
    if (!ok) throw new Error(`Choice not found: ${needle}\nDialog: ${JSON.stringify(await dialog())}`);
    await page.waitForTimeout(80);
  };
  const interactAt = async (x, y) => {
    await page.evaluate(([x, y]) => { __game.player.x = x; __game.player.y = y; __game.player.awake = true; }, [x, y]);
    await page.evaluate(() => __game.interact());
    await page.waitForTimeout(80);
  };
  const waitTask = async (task, timeout = 25000) => {
    await page.waitForFunction(t => __game.tasks[t] === true, task, { timeout });
  };
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); log('  ✓ ' + msg); };

  log('open + start');
  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#startGame');
  await page.waitForFunction(() => window.__game && __game.state().opening === false, { timeout: 30000 });
  let d = await dialog();
  if (d.open) await clickChoice('Get out of bed');
  await page.waitForFunction(() => !__game.state().paused, { timeout: 5000 });
  assert((await state()).opening === false, 'opening scene completes and game unpauses');

  // Make NPC walking fast for flow testing, but keep behavior intact.
  await page.evaluate(() => __game.girls.filter(g => !g.dog).forEach(g => { g.speed = 190; g.mood = 85; g.history = 2; }));

  log('breakfast: call, refusals, redirect, seating, completion');
  await interactAt(495, 560);
  await page.waitForTimeout(250);
  let gs = await girls();
  log('  breakfast statuses: ' + gs.map(g => `${g.short}:${g.status}`).join(', '));
  assert(gs.filter(g => !g.short.includes('Charlie')).some(g => g.status === 'refusing'), 'at least one girl visibly refuses breakfast immediately');
  assert(gs.filter(g => !g.short.includes('Charlie')).some(g => g.status === 'coming'), 'at least one girl heads to breakfast');
  await page.screenshot({ path: 'screenshots/test-breakfast-call.png' });

  // Retry each refusing girl with a calm redirect until she is coming/seated.
  for (let i = 0; i < 12; i++) {
    const pending = await page.evaluate(() => __game.girls.filter(g => !g.dog && ['refusing','wandering'].includes(g.callStatus)).map(g => g.short));
    if (!pending.length) break;
    await page.evaluate(() => {
      __game.girls.filter(g => !g.dog && ['refusing','wandering'].includes(g.callStatus)).forEach(g => __game.redirectGirl(g, 'breakfast'));
    });
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => __game.girls.filter(g => !g.dog).every(g => g.seatedAtTable), { timeout: 25000 });
  assert(true, 'all three girls reach the breakfast table');
  await interactAt(495, 560);
  d = await dialog();
  assert(d.open && /Handle Make breakfast/i.test(d.title), 'breakfast completion dialog appears after everyone is seated');
  await clickChoice('I’ll handle it');
  await waitTask('breakfast');
  assert(true, 'breakfast task completes');
  await page.waitForTimeout(3000);

  log('showers: three sequential girls');
  const callShowerGirl = async (name) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const dlg = await dialog();
      if (!dlg.open) break;
      if (/Showers, one at a time/.test(dlg.title)) await clickChoice(`Call ${name} first`);
      else if (/Call .* for a shower/.test(dlg.title)) await clickChoice('Let’s talk it through together');
      else break;
    }
  };
  await interactAt(90, 520);
  await callShowerGirl('Elaina');
  await page.waitForFunction(() => __game.state().showerIndex >= 1, { timeout: 25000 });
  assert(true, 'Elaina finishes her shower and the sequence advances');
  await interactAt(90, 520);
  await callShowerGirl('Elsie');
  await page.waitForFunction(() => __game.state().showerIndex >= 2, { timeout: 25000 });
  assert(true, 'Elsie finishes her shower and the sequence advances');
  await interactAt(90, 520);
  await callShowerGirl('Ellerle');
  await waitTask('showers');
  assert(true, 'all showers complete');

  log('laundry: delegation and cycle');
  await page.evaluate(() => { __game.tasks.laundry = false; __game.setWash(0); });
  await interactAt(190, 520);
  d = await dialog();
  assert(/Wash & dry the laundry/.test(d.title), 'laundry dialog opens');
  await clickChoice('Ask a girl to help');
  d = await dialog();
  assert(/Laundry delegation/.test(d.title), 'laundry delegation list opens');
  await clickChoice('Elsie');
  for (let i = 0; i < 12; i++) {
    const dlg = await dialog();
    if (!dlg.open) break;
    if (/Talk with Elsie/.test(dlg.title)) await clickChoice('Let’s talk it through together');
    else break;
  }
  const wash = (await state()).washTimer;
  assert(wash > 0, 'delegated laundry starts the wash cycle');
  await waitTask('laundry', 15000);
  assert(true, 'laundry cycle finishes without freezing');

  log('lunch, dishes, afternoon, dinner');
  await interactAt(400, 520);
  await page.waitForTimeout(250);
  await page.waitForFunction(() => __game.girls.filter(g => !g.dog).every(g => g.seatedAtTable), { timeout: 25000 });
  await interactAt(495, 560);
  await clickChoice('I’ll handle it');
  await waitTask('lunch');
  assert(true, 'lunch completes');
  await page.waitForTimeout(3000);

  await interactAt(600, 520);
  await clickChoice('I’ll handle it');
  await waitTask('dishes');
  assert(true, 'dishes complete');

  await interactAt(810, 450);
  await clickChoice('I’ll handle it');
  await waitTask('afternoon');
  assert(true, 'afternoon activities complete');

  await interactAt(400, 520);
  await page.waitForTimeout(250);
  await page.waitForFunction(() => __game.girls.filter(g => !g.dog).every(g => g.seatedAtTable), { timeout: 25000 });
  await interactAt(495, 560);
  await clickChoice('I’ll handle it');
  await waitTask('dinner');
  assert(true, 'dinner completes');
  await page.waitForTimeout(3000);

  log('Charlie: zoomies, room barks, proximity hearts');
  await page.evaluate(() => {
    const c = __game.girls.find(g => g.dog);
    c.speed = 130;
    __game.charlieTimer.action = 'zoomies';
    __game.charlieTimer.lastRoom = __game.roomAt(c.x, c.y);
    __game.charlieTimer.zoomieRooms = new Set([__game.charlieTimer.lastRoom]);
    __game.setMultiDestination(c, [[180, 225], [440, 225], [300, 350], [230, 550], [560, 550], [800, 550]], 'charlie-zoomies');
  });
  const roomsSeen = new Set();
  let barkSeen = false;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(100);
    const info = await page.evaluate(() => {
      const c = __game.girls.find(g => g.dog);
      return { room: __game.roomAt(c.x, c.y), rooms: __game.charlieTimer.zoomieRooms.size, bubble: c.bubble, action: __game.charlieTimer.action };
    });
    roomsSeen.add(info.room);
    if (info.bubble === 'Woof!') barkSeen = true;
    if (info.rooms >= 5) break;
  }
  assert(roomsSeen.size >= 4, 'Charlie crosses at least four rooms during zoomies');
  assert(barkSeen, 'Charlie barks in newly visited rooms');
  assert((await page.evaluate(() => __game.charlieTimer.zoomieRooms.size)) >= 5, 'Charlie tracks five or more unique rooms');

  // Put a girl next to Charlie and confirm hearts + mood boost.
  const heart = await page.evaluate(async () => {
    const c = __game.girls.find(g => g.dog);
    const g = __game.girls[0];
    g.x = c.x + 10; g.y = c.y + 10; g.mood = 40; g.charlieNear = false;
    await new Promise(r => setTimeout(r, 250));
    return { heartLeft: g.heartLeft, mood: g.mood, near: g.charlieNear, bubble: g.bubble };
  });
  assert(heart.heartLeft > 0 && heart.near, 'Charlie proximity shows hearts');
  assert(heart.mood > 40, 'Charlie proximity raises a girl’s mood');

  log('bedtime + win');
  const bedGirl = async (name) => {
    const coords = { Elaina: [417, 160], Elsie: [557, 160], Ellerle: [435, 250] }[name];
    await interactAt(...coords);
    for (let i = 0; i < 12; i++) {
      const dlg = await dialog();
      if (!dlg.open) break;
      if (/Tuck .* in/.test(dlg.title)) await clickChoice('Goodnight, time to settle in');
      else if (/isn’t ready for bed/.test(dlg.title)) await clickChoice('Talk it through calmly');
      else break;
    }
    await waitTask('bed' + name, 25000);
  };
  await bedGirl('Elaina');
  assert(true, 'Elaina tucked in');
  await bedGirl('Elsie');
  assert(true, 'Elsie tucked in');
  await bedGirl('Ellerle');
  assert(true, 'Ellerle tucked in');
  await interactAt(135, 130);
  d = await dialog();
  assert(/Call it a day/.test(d.title), 'Dad can call it a day after all girls are tucked in');
  await clickChoice('Get into bed');
  await page.waitForTimeout(300);
  assert((await state()).ended === 'win', 'game reaches the win state');

  await page.screenshot({ path: 'screenshots/test-win.png' });
  log('errors: ' + JSON.stringify(errors));
  log('console errors: ' + JSON.stringify(consoleErrors.filter(e => !/favicon/.test(e))));
  assert(errors.length === 0, 'no uncaught page errors');
  assert(consoleErrors.filter(e => !/favicon/.test(e)).length === 0, 'no console errors');

  await browser.close();
  log('ALL TESTS PASSED');
})().catch(async (e) => {
  console.error('TEST FAILURE:', e.stack || e);
  console.error('recent logs:\n' + logs.join('\n'));
  process.exit(1);
});
