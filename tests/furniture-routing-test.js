const { launch } = require('./browser');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto((process.env.BASE_URL || 'http://localhost:3002') + '/index.html?debug=1&v=' + Date.now());
  await page.waitForFunction(() => window.__game, { timeout: 30000 });
  const spawns = await page.evaluate(() => __game.girls.filter(g => !g.dog).map(g => ({ short: g.short, x: g.x, y: g.y, room: __game.roomAt(g.x, g.y), blocked: __game.blocked(g.x, g.y, g) })));
  await page.click('#startGame');
  await page.waitForFunction(() => __game.state().opening === false, { timeout: 30000 });
  if (await page.evaluate(() => document.querySelector('#dialogShade').classList.contains('open')))
    await page.evaluate(() => document.querySelector('#dialogChoices button').click());
  const wakeRooms = await page.evaluate(() => __game.girls.filter(g => !g.dog).map(g => ({ short: g.short, room: __game.roomAt(g.x, g.y) })));

  const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓ ' + m); };

  assert(spawns.every(s => !s.blocked && s.room === 'girls'), 'each girl starts on open bedroom floor: ' + JSON.stringify(spawns));
  assert(wakeRooms.every(g => g.room === 'dad'), 'all three girls walk into Dad’s bedroom for the wake-up: ' + JSON.stringify(wakeRooms));

  const bedrooms = await page.evaluate(() => {
    const beds = __game.props.filter(p => p.type === 'bed');
    const girlsBeds = beds.filter(b => b.task).sort((a, b) => a.x - b.x);
    const gaps = girlsBeds.slice(1).map((b, i) => b.x - (girlsBeds[i].x + girlsBeds[i].w));
    const midY = girlsBeds[0].y + girlsBeds[0].h / 2;
    const gapCenters = gaps.map((gap, i) => [girlsBeds[i].x + girlsBeds[i].w + gap / 2, midY]);
    return { beds, girlsBeds, gaps,
      topWall: beds.every(b => b.y <= 40),
      walkableGaps: gapCenters.every(([x, y]) => !__game.blocked(x, y)),
      tuckSpotsClear: girlsBeds.every(b => !__game.blocked(b.x + b.w / 2, b.y + b.h + __game.player.r + 4)) };
  });
  assert(bedrooms.topWall && bedrooms.beds.length === 4, 'all four beds sit along the bedroom’s top wall');
  assert(bedrooms.girlsBeds.length === 3 && bedrooms.gaps.every(g => g >= 40), 'girls’ beds line the top wall with walkable gaps (' + JSON.stringify(bedrooms.gaps) + ')');
  assert(bedrooms.walkableGaps, 'the space between each pair of beds is walkable');
  assert(bedrooms.tuckSpotsClear, 'every bed has a clear spot for Dad to tuck in');

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

  const kitchen = await page.evaluate(() => {
    const get = type => __game.props.find(p => p.type === type);
    const table = get('table'), chairs = get('chairs'), stove = get('stove'), fridge = get('fridge'), sink = get('sink'), coffee = get('coffee');
    const dog = __game.girls.find(g => g.dog);
    const free = (x, y, chairsOk = false) => !__game.blocked(x, y, dog, null, chairsOk);
    const girls = __game.girls.filter(g => !g.dog);
    const seats = [0,1,2].map(i => __game.taskSpot('lunch', girls[i]));
    const overlaps = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
    const inTable = ([x,y]) => x > table.x && x < table.x+table.w && y > table.y && y < table.y+table.h;
    const g = girls[0];
    g.x = 684; g.y = 530; g.route = []; g.seatedAtTable = false;
    __game.setDestination(g, seats[1][0], seats[1][1], 'meal');
    const route = g.route.map(p => [p[0], p[1]]);
    let crossesTable = false;
    for (let i = 0; i < route.length - 1; i++) {
      const [x1,y1] = route[i], [x2,y2] = route[i+1];
      const steps = Math.max(1, Math.ceil(Math.hypot(x2-x1, y2-y1) / 6));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        if (inTable([x1 + (x2-x1)*t, y1 + (y2-y1)*t])) crossesTable = true;
      }
    }
    const applianceTop = Math.min(stove.y, fridge.y, sink.y);
    const gaps = { top: table.y - 397, left: table.x - 332, right: 665 - (table.x + table.w), bottom: applianceTop - (chairs.y + chairs.h) };
    let loopBlocked = null;
    for (let x = 366; x <= 632; x += 6) for (const y of [427, 584]) if (!loopBlocked && !free(x, y)) loopBlocked = [x, y];
    for (let y = 427; y <= 584; y += 6) for (const x of [366, 632]) if (!loopBlocked && !free(x, y)) loopBlocked = [x, y];
    return { table, chairs, stove, fridge, sink, coffee, seats, route, crossesTable, gaps, loopBlocked,
      tableCenterX: table.x + table.w/2,
      appliancesLower: [stove, fridge, sink].every(p => p.y > table.y + table.h && p.y + p.h >= 660),
      applianceRow: [stove, fridge, sink].every(p => p.y === stove.y),
      appliancesClear: [stove, fridge, sink, chairs].every(p => !overlaps(p, table)),
      seatsAtChairs: seats.every(([x,y]) => !inTable([x,y]) && x >= chairs.x - 8 && x <= chairs.x + chairs.w + 35 && y > chairs.y && y < chairs.y + chairs.h),
      seatsClear: seats.every(([x,y]) => free(x, y, true)),
      routeEndsAtSeat: route.length > 0 && route[route.length-1][0] === seats[1][0] && route[route.length-1][1] === seats[1][1],
      coffeeReachable: free(630, 580) && Math.hypot(630 - (coffee.x+coffee.w/2), 580 - (coffee.y+coffee.h/2)) < 55,
      coffeeOnLowerWall: coffee.y === stove.y };
  });
  assert(kitchen.applianceRow && kitchen.appliancesLower, 'kitchen appliances line up along the lower wall');
  assert(Math.abs(kitchen.tableCenterX - 495) < 25 && kitchen.table.y > 450 && kitchen.table.y < 500, 'dining table sits in the middle of the kitchen');
  assert(['top','left','right','bottom'].every(side => kitchen.gaps[side] >= 45), 'table leaves a generous gap on every side (' + JSON.stringify(kitchen.gaps) + ')');
  assert(!kitchen.loopBlocked, 'characters can walk a full loop around the table' + (kitchen.loopBlocked ? ' (blocked at ' + kitchen.loopBlocked + ')' : ''));
  assert(kitchen.appliancesClear, 'dining table stays clear of the appliance row');
  assert(kitchen.seatsAtChairs && kitchen.seatsClear, 'meal seats sit on the chairs and stay walkable');
  assert(kitchen.routeEndsAtSeat && !kitchen.crossesTable, 'meal routing reaches a seat without crossing the table');
  assert(kitchen.coffeeOnLowerWall, 'coffee maker joins the lower counter run');
  assert(kitchen.coffeeReachable, 'coffee maker stays reachable from the kitchen walkway');

  const hallNearest = await page.evaluate(() => { __game.player.x = 500; __game.player.y = 350; return __game.nearest(); });
  assert(!hallNearest, 'hallway does not reach through walls to the kitchen table');

  const bathroom = await page.evaluate(() => {
    const get = type => __game.props.find(p => p.type === type);
    const shower = get('tub'), washer = get('washer'), dryer = get('dryer'), sink = get('bathSink'), toilet = get('toilet');
    const showerSpots = [0,1,2].map(i => __game.taskSpot('showers', __game.girls.filter(g => !g.dog)[i]));
    const laundrySpots = [0,1,2].map(i => __game.taskSpot('laundry', __game.girls.filter(g => !g.dog)[i]));
    return { shower, washer, dryer, sink, toilet, showerSpots, laundrySpots,
      showerClear: showerSpots.every(([x,y]) => !__game.blocked(x,y)),
      laundryClear: laundrySpots.every(([x,y]) => !__game.blocked(x,y)) };
  });
  assert(bathroom.shower.x < 110 && bathroom.shower.y > 540, 'shower sits in the bathroom’s lower-left corner');
  assert(bathroom.washer.x > 250 && bathroom.dryer.x > 250 && bathroom.washer.y < bathroom.dryer.y, 'washer and dryer line the bathroom’s right side');
  assert(bathroom.sink.y > 600 && bathroom.toilet.x < 100, 'bathroom sink is on the lower wall and toilet is on the left wall');
  assert(bathroom.showerClear && bathroom.laundryClear, 'shower and laundry destinations remain clear of furniture');

  const collisions = await page.evaluate(() => {
    const couch = __game.props.find(p => p.type === 'couch');
    return {
      center: __game.blocked(couch.x+couch.w/2,couch.y+couch.h/2),
      divider: __game.blocked(332,500),
      doorwayOpen: __game.blocked(646,350) === false,
      hallway: __game.blocked(477,350),
      toilet: __game.blocked(60,460),
      bathSink: __game.blocked(165,630)
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
