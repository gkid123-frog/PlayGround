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
  await page.waitForTimeout(250);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };
  const state = () => page.evaluate(() => __game.state());
  const girls = () => page.evaluate(() => __game.girls.filter(g => !g.dog).map(g => ({ mood: g.mood, history: g.history, agenda: g.agenda })));
  const toast = () => page.evaluate(() => document.querySelector('#toast').textContent);
  const dialog = () => page.evaluate(() => ({ open: document.querySelector('#dialogShade').classList.contains('open'), title: document.querySelector('#dialogTitle').textContent, choices: [...document.querySelectorAll('#dialogChoices button')].map(b => b.textContent) }));
  const click = async (needle) => { const ok = await page.evaluate(n => { const b = [...document.querySelectorAll('#dialogChoices button')].find(b => b.textContent.includes(n)); if (!b) return false; b.click(); return true; }, needle); if (!ok) throw new Error('missing choice ' + needle + ' ' + JSON.stringify(await dialog())); await page.waitForTimeout(150); };

  // Set a mid-day baseline so the fresh-air boost is measurable.
  await page.evaluate(() => {
    __game.setFocus(50);
    __game.setTemper(50);
    __game.girls.filter(g => !g.dog).forEach(g => { g.mood = 40; g.history = 1; });
  });
  const beforeOut = await page.evaluate(() => ({ focus: __game.state().focus, temper: __game.state().temper }));
  const beforeGirls = await girls();

  await page.evaluate(() => __game.goOutside());
  const afterOut = await state();
  const outGirls = await girls();
  assert(afterOut.scene === 'yard', 'going outside enters the yard');
  assert(afterOut.focus > beforeOut.focus, 'fresh air restores Dad’s focus');
  assert(afterOut.temper > beforeOut.temper, 'fresh air restores Dad’s patience');
  assert(afterOut.outsidePlayBonus >= 1, 'going outside banks a cooperation boost');
  assert(outGirls.every((g, i) => g.mood > beforeGirls[i].mood), 'fresh air lifts every girl’s mood');
  assert(outGirls.every((g, i) => g.history > beforeGirls[i].history), 'fresh air builds goodwill with every girl');
  assert(/Fresh air/i.test(await toast()), 'toast explains the purpose of going outside');
  assert(afterOut.sandboxPlayed === false && afterOut.fetchUses === 0, 'a new backyard visit resets activities');

  // Charlie patrols the yard instead of standing still.
  const charlieStart = await page.evaluate(() => { const c = __game.girls.find(g => g.dog); return { x: c.x, y: c.y }; });
  await page.waitForTimeout(1500);
  const charlieMoved = await page.evaluate(() => { const c = __game.girls.find(g => g.dog); return { x: c.x, y: c.y, agenda: c.agenda }; });
  assert(Math.hypot(charlieMoved.x - charlieStart.x, charlieMoved.y - charlieStart.y) > 15, 'Charlie runs around the yard instead of standing still');
  assert(!/doorway|shower/.test(charlieMoved.agenda), 'Charlie uses yard movement language');

  // A passing car near the fence makes Charlie bark.
  await page.evaluate(() => { const c = __game.girls.find(g => g.dog); c.x = 875; c.y = 160; c.route = []; __game.spawnCar(965, 160, 120); });
  await page.waitForTimeout(150);
  const bark = await page.evaluate(() => { const c = __game.girls.find(g => g.dog); return { bubble: c.bubble, agenda: c.agenda }; });
  assert(/Woof! Car!/.test(bark.bubble), 'Charlie barks at a car from the fence');

  // Calling the girls outside works once and cannot be spammed.
  await page.evaluate(() => __game.callGirlsOutside());
  const called = await state();
  const calledMoods = (await girls()).map(g => g.mood);
  await page.evaluate(() => __game.callGirlsOutside());
  await page.waitForTimeout(120);
  const calledAgain = await state();
  const calledMoodsAgain = (await girls()).map(g => g.mood);
  assert(called.girlsOutside === true, 'the girls come outside');
  assert(/already playing outside/i.test(await toast()), 'calling the girls again is rejected');
  assert(calledAgain.outsidePlayBonus === called.outsidePlayBonus, 'repeat calls do not farm cooperation boosts');
  assert(calledMoodsAgain.every((m, i) => Math.abs(m - calledMoods[i]) < 1), 'repeat calls do not farm girl moods');

  // The girls spread out across the yard instead of hugging the door.
  const playStart = await page.evaluate(() => {
    __game.assignYardPlay();
    return __game.girls.filter(g => !g.dog).map(g => ({ x: g.x, y: g.y }));
  });
  await page.waitForTimeout(1200);
  const playNow = await page.evaluate(() => __game.girls.filter(g => !g.dog).map(g => ({ x: g.x, y: g.y, agenda: g.agenda })));
  const movers = playNow.filter((g, i) => Math.hypot(g.x - playStart[i].x, g.y - playStart[i].y) > 10);
  assert(movers.length >= 2, 'the girls run to different areas of the yard');
  assert(playNow.every(g => /playing outside/i.test(g.agenda)), 'the girls’ action log says they are playing outside');

  // The sandbox launches the timing-based sandcastle game and keeps its result
  // for the rest of this backyard visit.
  await page.evaluate(() => {
    __game.girls.filter(g => !g.dog).forEach((g, i) => { g.mood = 40; g.history = 1; g.x = 200 + i * 30; g.y = 300; g.route = []; });
    __game.player.x = 505;
    __game.player.y = 495;
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => __game.interact());
  let d = await dialog();
  assert(d.choices.some(c => /Build a sandcastle together/.test(c)), 'sandbox offers the sandcastle mini-game');
  assert(d.choices.some(c => /Play fetch with Charlie/.test(c)), 'sandbox offers fetch with Charlie');
  assert(d.choices.some(c => /Send the girls inside/.test(c)), 'yard actions include sending the girls inside');
  await click('Build a sandcastle together');
  assert((await page.evaluate(() => __game.miniState())).type === 'sandcastle', 'sandcastle mini-game opens from the yard choice');
  const sandcastleBefore = await girls();
  for (let drop = 1; drop <= 5; drop++) {
    await page.evaluate(() => __game.miniPrimary());
    await page.waitForFunction(n => __game.miniState().sandcastle.drops >= n, drop);
  }
  await page.waitForFunction(() => __game.miniState().phase === 'result');
  const sandbox = await state();
  const sandboxGame = await page.evaluate(() => __game.miniState());
  const sandboxGirls = await girls();
  assert(sandbox.sandboxPlayed === true && sandboxGame.sandcastle.drops === 5, 'completed castle is tracked for the visit');
  assert(sandbox.sandcastleQuality === sandboxGame.sandcastle.quality, 'castle quality is retained in the yard');
  assert(sandboxGirls.every((g, i) => g.mood > sandcastleBefore[i].mood), 'sandcastle rewards raise the girls’ moods');
  assert(sandboxGirls.every((g, i) => g.history > sandcastleBefore[i].history), 'sandcastle rewards build goodwill');
  assert(sandbox.outsidePlayBonus >= 1, 'a successful sandcastle banks cooperation');
  await page.evaluate(() => __game.miniPrimary());
  assert(/Sandcastle time/i.test(await toast()), 'sandcastle result explains its benefits');
  assert((await page.evaluate(() => __game.tasks)).afternoon === false, 'a sandcastle outside the afternoon slot does not skip chores');

  const sandboxMoods = (await girls()).map(g => g.mood);
  await page.evaluate(() => __game.startSandcastleGame());
  await page.waitForTimeout(120);
  const sandboxAgain = await state();
  const sandboxMoodsAgain = (await girls()).map(g => g.mood);
  assert(/already had their sandbox time/i.test(await toast()), 'sandcastle is limited to once per visit');
  assert(sandboxAgain.outsidePlayBonus === sandbox.outsidePlayBonus, 'repeat sandcastle cannot farm boosts');
  assert(sandboxMoodsAgain.every((m, i) => Math.abs(m - sandboxMoods[i]) < 1), 'repeat sandcastle cannot farm moods');

  // Cycling the girls inside and back out cannot refresh yard rewards.
  await page.evaluate(() => __game.sendGirlsInside());
  const cycleBefore = await state();
  const cycleMoods = (await girls()).map(g => g.mood);
  await page.evaluate(() => __game.callGirlsOutside());
  await page.waitForTimeout(120);
  const cycleAfter = await state();
  const cycleMoodsAfter = (await girls()).map(g => g.mood);
  assert(cycleAfter.girlsOutside === true, 'the girls can come back outside');
  assert(cycleAfter.outsidePlayBonus === cycleBefore.outsidePlayBonus, 're-calling after sending them inside cannot farm boosts');
  assert(cycleAfter.callBoostUsed === true, 'the outside call boost is once per trip');
  assert(cycleMoodsAfter.every((m, i) => Math.abs(m - cycleMoods[i]) < 1), 're-calling after sending them inside cannot farm moods');
  await page.evaluate(() => __game.startSandcastleGame());
  await page.waitForTimeout(100);
  assert(/already had their sandbox time/i.test(await toast()), 'sandcastle stays used for the whole backyard trip');

  // Fetch uses three throws and Charlie’s return for a score, with two games
  // allowed per backyard visit.
  const playFetchRound = async (round) => {
    await page.evaluate(() => {
      const target = __game.miniState().fetch.target;
      __game.miniAim(target.x, target.y);
      __game.miniPrimary();
    });
    if (round < 3) await page.waitForFunction(n => __game.miniState().fetch.round > n && __game.miniState().fetch.phase === 'aim', round);
    else await page.waitForFunction(() => __game.miniState().phase === 'result');
  };
  await page.evaluate(() => {
    __game.setFocus(50);
    __game.setTemper(50);
    __game.girls.find(g => g.dog).mood = 40;
    __game.startFetchGame();
  });
  assert((await page.evaluate(() => __game.miniState())).type === 'fetch', 'fetch mini-game opens with Charlie');
  for (let round = 1; round <= 3; round++) await playFetchRound(round);
  const fetch1 = await page.evaluate(() => ({ focus: __game.state().focus, temper: __game.state().temper, charlie: __game.girls.find(g => g.dog).mood, uses: __game.state().fetchUses, mini: __game.miniState().fetch }));
  assert(fetch1.uses === 1, 'completed fetch is tracked for the visit');
  assert(fetch1.focus > 50, 'fetch restores Dad’s focus');
  assert(fetch1.temper > 50, 'fetch restores Dad’s patience');
  assert(fetch1.charlie > 40, 'fetch makes Charlie happy');
  assert(fetch1.mini.quality >= 60, 'accurate throws earn a good fetch result');
  await page.evaluate(() => __game.miniPrimary());
  assert(/Fetch time/i.test(await toast()), 'fetch result explains its benefits');

  await page.evaluate(() => __game.startFetchGame());
  for (let round = 1; round <= 3; round++) await playFetchRound(round);
  const fetch2 = await state();
  await page.evaluate(() => __game.startFetchGame());
  await page.waitForTimeout(120);
  const fetch3 = await state();
  assert(fetch2.fetchUses === 2 && fetch3.fetchUses === 2, 'fetch is capped at two games per visit');
  assert(/tuckered out/i.test(await toast()), 'a third fetch explains the cap');

  // Returning inside resets the outdoor state.
  await page.evaluate(() => __game.goInside());
  const inside = await state();
  assert(inside.scene === 'house' && inside.charlieOutside === false && inside.girlsOutside === false, 'returning inside resets the yard');

  assert(errs.length === 0, 'no page errors');
  await browser.close();
  console.log('YARD PURPOSE TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
