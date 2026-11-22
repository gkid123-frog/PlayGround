const { chromium } = require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true, executablePath:'/usr/bin/chromium-browser', args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3002',{waitUntil:'networkidle'});
 await page.fill('#playerName','Morgan'); await page.selectOption('#playerAge','15'); await page.selectOption('#playerGender','Nonbinary');
 await page.click('#setupForm button[type="submit"]'); await page.waitForSelector('#gameScreen.active');
 for(let day=1;day<=5;day++){
   await page.waitForSelector('.choice');
   await page.locator('.choice').nth((day-1)%3).click();
   await page.waitForSelector('#nextDay');
   await page.click('#nextDay');
 }
 await page.waitForSelector('#modalBackdrop.open');
 const heading=await page.locator('#modal h2').textContent();
 await page.screenshot({path:'screenshots/ending.jpg',fullPage:true,quality:90,type:'jpeg'});
 await page.click('#playAgain'); await page.waitForSelector('#setupScreen.active');
 const setupActive=await page.locator('#setupScreen').evaluate(el=>el.classList.contains('active'));
 const mobile=await browser.newPage({viewport:{width:375,height:812}}); mobile.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto('http://127.0.0.1:3002',{waitUntil:'networkidle'}); await mobile.screenshot({path:'screenshots/mobile_setup.jpg',fullPage:true,quality:90,type:'jpeg'});
 await mobile.click('#setupForm button[type="submit"]'); await mobile.waitForSelector('#gameScreen.active'); await mobile.screenshot({path:'screenshots/mobile_game.jpg',fullPage:true,quality:90,type:'jpeg'});
 const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
 console.log(JSON.stringify({heading,setupActive,overflow,errors}));
 await browser.close();
})();
