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
    const couch = __game.props.find(p => p.type === 'couch');
    const destinations = [[810,530],[750,610],[900,610]].map(([x,y]) => !(x >= couch.x && x <= couch.x+couch.w && y >= couch.y && y <= couch.y+couch.h));
    const g = __game.girls.find(x => !x.dog);
    g.x = 477; g.y = 350; g.route = []; g.seatedOnCouch = false;
    __game.setDestination(g, 810, 530, 'couch');
    return { couch, outside: destinations.every(Boolean), route: g.route, seatedBefore: g.seatedOnCouch };
  });
  assert(geometry.couch.x === 690 && geometry.couch.y === 430 && geometry.couch.w === 180 && geometry.couch.h === 78, 'couch has the preserved footprint');
  assert(geometry.outside, 'TV and afternoon destinations remain outside the couch footprint');
  assert(geometry.route.some(p => p[0] === 646 && p[1] === 350) || geometry.route.some(p => p[0] === 684 && p[1] === 350), 'living-room routing uses an explicit hallway doorway');
  assert(!geometry.seatedBefore, 'routing begins with couch seating cleared');

  await page.evaluate(() => {
    const g = __game.girls.find(x => !x.dog);
    g.route = []; g.routeMode = 'couch'; g.seatedOnCouch = false; g.seatedAtTable = true;
    g.callTask = '';
    __game.routeArrived(g);
  });
  const lifecycle = await page.evaluate(() => {
    const g = __game.girls.find(x => !x.dog);
    return { couch: g.seatedOnCouch, table: g.seatedAtTable, mode: g.routeMode };
  });
  assert(lifecycle.couch && lifecycle.table === true && lifecycle.mode === '', 'couch arrival sets couch mode and preserves separate meal-state tracking');

  const collisions = await page.evaluate(() => {
    const couch = __game.props.find(p => p.type === 'couch');
    return {
      center: __game.blocked(couch.x+couch.w/2,couch.y+couch.h/2),
      divider: __game.blocked(332,500),
      doorwayOpen: __game.blocked(646,350) === false,
      hallway: __game.blocked(477,350)
    };
  });
  assert(collisions.center, 'couch blocks movement through its footprint');
  assert(collisions.divider, 'kitchen/bathroom divider remains blocked');
  assert(collisions.doorwayOpen, 'living-room hallway waypoint is usable');
  assert(!collisions.hallway, 'hallway center remains usable');

  await page.evaluate(() => {
    const g = __game.girls.find(x => !x.dog);
    g.seatedOnCouch = true; g.route = [[810,530]]; g.routeMode = 'couch';
    __game.setDestination(g, 750,610,'activity');
  });
  const cleared = await page.evaluate(() => __game.girls.find(x => !x.dog).seatedOnCouch);
  assert(!cleared, 'starting a new route clears couch seating');

  assert(errors.length === 0, 'no page errors');
  await browser.close();
  console.log('FURNITURE ROUTING TESTS PASSED');
})().catch(e => { console.error('FAIL', e.stack || e); process.exit(1); });
