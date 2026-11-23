"use strict";
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
let W,H,DPR,keys={},gameStarted=false,paused=false;
let blue=0,orange=0,time=90,last=performance.now(),kickoff=3,countdown=true;
const car={x:0,y:220,a:-Math.PI/2,vx:0,vy:0,boost:100,item:null,radius:22,boosting:false};
const rival={x:0,y:-220,a:Math.PI/2,vx:0,vy:0,radius:22,cool:0};
const ball={x:0,y:0,vx:0,vy:0,radius:24};
let particles=[],itemPads=[],projectiles=[],effects={shield:0,speed:0,stun:0};
const colors=['🍄','⭐','🐢','💣','⚡','🐙'];
function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)} addEventListener('resize',resize);resize();
function resetPads(){itemPads=[{x:-150,y:-220,got:false,t:0},{x:150,y:-220,got:false,t:0},{x:-150,y:220,got:false,t:0},{x:150,y:220,got:false,t:0},{x:0,y:0,got:false,t:0}]}
resetPads();
function resetPositions(){car.x=0;car.y=220;car.vx=0;car.vy=0;car.a=-Math.PI/2;car.boost=Math.max(car.boost,70);rival.x=0;rival.y=-220;rival.vx=0;rival.vy=0;rival.a=Math.PI/2;ball.x=0;ball.y=0;ball.vx=0;ball.vy=0;kickoff=3;countdown=true}
resetPositions();
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault()});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
$('play').onclick=()=>{$('start').classList.add('hidden');gameStarted=true;last=performance.now();resetPositions();};
const stick=$('stick'),knob=$('knob');let touchVec={x:0,y:0},stickId=null;
function stickMove(e){const r=stick.getBoundingRect?stick.getBoundingRect():stick.getBoundingClientRect();const t=e.touches[0];let x=t.clientX-(r.left+r.width/2),y=t.clientY-(r.top+r.height/2);let len=Math.hypot(x,y),m=48;if(len>m){x=x/len*m;y=y/len*m}touchVec.x=x/m;touchVec.y=y/m;knob.style.transform=`translate(${x}px,${y}px)`}
stick.addEventListener('touchstart',e=>{stickId=e.touches[0].identifier;stickMove(e);e.prevent();},{passive:false});stick.addEventListener('touchmove',e=>{if([...e.touches].some(t=>t.identifier===stickId))stickMove(e);e.prevent();},{passive:false});stick.addEventListener('touchend',()=>{touchVec={x:0,y:0};knob.style.transform='';},{passive:true});
$('boostTouch').addEventListener('touchstart',()=>keys[' ']=true,{passive:true});$('boostTouch').addEventListener('touchend',()=>keys[' ']=false,{passive:true});
$('itemTouch').addEventListener('touchstart',()=>useItem(),{passive:true});
function spawnNotice(text){const n=$('notice');n.textContent=text;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),1000)}
function useItem(){if(!car.item||countdown)return;const item=car.item;car.item=null;$('itemIcon').textContent='❓';
 if(item==='🍄'||item==='⚡'){effects.speed=4;spawnNotice(item==='🍄'?'MUSHROOM TURBO!':'LIGHTNING BOOST!')}
 if(item==='⭐'){effects.shield=7;spawnNotice('STAR POWER!')}
 if(item==='🐢'){projectiles.push({x:car.x-Math.sin(car.a)*36,y:car.y+Math.cos(car.a)*36,vx:-Math.sin(car.a)*300,vy:Math.cos(car.a)*300,r:15,life:8,kind:'shell'})}
 if(item==='💣'){projectiles.push({x:car.x,y:car.y,vx:-Math.sin(car.a)*220,vy:Math.cos(car.a)*220,r:17,life:7,kind:'bomb'})}
 if(item==='🐙'){effects.stun=2.5;rival.vx=0;rival.vy=0;spawnNotice('INK SPLASH!')}
}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='e')useItem()});
function world(){const scale=Math.min(W/1060,H/760);return {cx:W/2,cy:H/2,scale,sx:scale,sy:scale}}
function wx(x){return world().cx+x*world().sx}function wy(y){return world().cy+y*world().sy}
function drawField(){const c=world();ctx.save();ctx.translate(c.cx,c.cy);ctx.scale(c.sx,c.sy);ctx.clearRect(-W/c.sx,-H/c.sy,W/c.sx*2,H/c.sy*2);
 ctx.fillStyle='#081627';ctx.fillRect(-W/c.sx,-H/c.sy,W/c.sx*2,H/c.sy*2);
 ctx.fillStyle='#1d8dc2';ctx.beginPath();ctx.roundRect(-470,-330,940,660,36);ctx.fill();ctx.fillStyle='#2cb4a7';ctx.beginPath();ctx.roundRect(-438,-298,876,596,28);ctx.fill();
 // pitch
 ctx.fillStyle='#35b9a3';ctx.fillRect(-430,-290,860,580);
 ctx.strokeStyle='#baf2e8';ctx.lineWidth=4;ctx.strokeRect(-430,-290,860,580);ctx.beginPath();ctx.arc(0,0,150,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-290);ctx.lineTo(0,290);ctx.stroke();
 ctx.fillStyle='#1b84cf';ctx.fillRect(-430,-92,55,184);ctx.strokeStyle='#5bc3ff';ctx.strokeRect(-430,-92,55,184);ctx.fillStyle='#ef6d32';ctx.fillRect(375,-92,55,184);ctx.strokeStyle='#ff9b72';ctx.strokeRect(375,-92,55,184);
 // turf pattern
 ctx.globalAlpha=.12;ctx.fillStyle='#fff';for(let x=-420;x<420;x+=40){ctx.fillRect(x,-290,20,580)}ctx.globalAlpha=1;
 // goals
 ctx.fillStyle='#8bdcff44';ctx.fillRect(-445,-72,30,144);ctx.fillStyle='#ff9a7444';ctx.fillRect(415,-72,30,144);
 ctx.restore();}
function drawPad(p){if(p.got&&p.t>0)return;ctx.save();ctx.translate(wx(p.x),wy(p.y));ctx.rotate(performance.now()/900);ctx.fillStyle='#ffe45e';ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#f59e0b';ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawCar(o,orangeTeam=false){ctx.save();ctx.translate(wx(o.x),wy(o.y));ctx.rotate(-o.a+Math.PI/2);if(effects.shield>0&&!orangeTeam){ctx.strokeStyle='#b8efff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,38,0,Math.PI*2);ctx.stroke()}if(o.boosting&&car.boost>0&&!orangeTeam){ctx.fillStyle='#65d6ff';ctx.beginPath();ctx.moveTo(-10,24);ctx.lineTo(0,55+Math.random()*18);ctx.lineTo(10,24);ctx.fill()}ctx.fillStyle=orangeTeam?'#ff642c':'#168fff';ctx.beginPath();ctx.roundRect(-24,-28,48,56,12);ctx.fill();ctx.fillStyle='#cbeaff';ctx.beginPath();ctx.roundRect(-16,-18,32,22,8);ctx.fill();ctx.fillStyle='#10213a';ctx.beginPath();ctx.arc(-18,23,9,0,Math.PI*2);ctx.arc(18,23,9,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawBall(){ctx.save();ctx.translate(wx(ball.x),wy(ball.y));const r=ball.radius*world().sx;ctx.shadowColor='#000';ctx.shadowBlur=12;ctx.fillStyle='#f7f3df';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#19233a';for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.arc(r*.55,0,r*.16,0,Math.PI*2);ctx.fill();ctx.restore()}ctx.restore()}
function update(dt){if(!gameStarted)return;if(countdown){kickoff-=dt;if(kickoff<=0){countdown=false;spawnNotice('GO!')}}else{time-=dt;if(time<=0){gameEnd()} }
 if(countdown)return;
 // car controls
 let forward=(keys['w']||keys['arrowup']||touchVec.y<-.15)?1:0,back=(keys['s']||keys['arrowdown']||touchVec.y>.15)?1:0,left=(keys['a']||keys['arrowleft']||touchVec.x<-.15)?1:0,right=(keys['d']||keys['arrowright']||touchVec.x>.15)?1:0;
 const speedBoost=effects.speed>0?1.55:1;car.boosting=(keys[' ']||keys['shift'])&&car.boost>0&&forward>0;if(car.boosting){car.boost-=25*dt}else car.boost=Math.min(100,car.boost+7*dt);car.boost=Math.max(0,car.boost);
 if(left)car.a-=2.7*dt*(1+Math.min(Math.hypot(car.vx,car.vy)/500,.5));if(right)car.a+=2.7*dt*(1+Math.min(Math.hypot(car.vx,car.vy)/500,.5));
 let acc=(forward-back)*310*speedBoost;if(car.boosting)acc+=480;car.vx+=-Math.sin(car.a)*acc*dt;car.vy+=Math.cos(car.a)*acc*dt;const drag=1-Math.min(.95,dt*1.3);car.vx*=drag;car.vy*=drag;
 car.x+=car.vx*dt;car.y+=car.vy*dt;keepInArena(car,true);
 // rival AI
 let da=Math.atan2(-(rival.x-ball.x),rival.y-ball.y)-rival.a;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;rival.a+=Math.max(-2*dt,Math.min(2*dt,da));if(effects.stun<=0){rival.vx+=-Math.sin(rival.a)*230*dt;rival.vy+=Math.cos(rival.a)*230*dt;rival.vx*=.992;rival.vy*=.992;rival.x+=rival.vx*dt;rival.y+=rival.vy*dt}else effects.stun-=dt;keepInArena(rival,false);
 // ball physics
 ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.vx*=1-dt*.12;ball.vy*=1-dt*.12;
 collideCircle(car,ball,0.8);collideCircle(rival,ball,0.7);
 const arenaR=430,goalTop=-72,goalBot=72;if(ball.x>arenaR-10&&ball.y>goalTop&&ball.y<goalBot){score('blue')}if(ball.x<-arenaR+10&&ball.y>goalTop&&ball.y<goalBot){score('orange')}
 if(ball.x>405){if(ball.y<goalTop||ball.y>goalBot){ball.x=405;ball.vx=-Math.abs(ball.vx)*.8}}if(ball.x<-405){if(ball.y<goalTop||ball.y>goalBot){ball.x=-405;ball.vx=Math.abs(ball.vx)*.8}}if(ball.y>290){ball.y=290;ball.vy=-Math.abs(ball.vy)*.82}if(ball.y<-290){ball.y=-290;ball.vy=Math.abs(ball.vy)*.82}
 for(const p of itemPads){if(!p.got&&Math.hypot(car.x-p.x,car.y-p.y)<45){p.got=true;p.t=8;car.item=colors[Math.floor(Math.random()*colors.length)];$('itemIcon').textContent=car.item;spawnNotice('ITEM!')}}pTimer(dt);
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.kind==='bomb'&&p.life<5.5){p.r=17+Math.sin(p.life*20)*3}if(Math.hypot(p.x-rival.x,p.y-rival.y)<p.r+rival.radius){rival.vx+=p.vx*1.2;rival.vy+=p.vy*1.2;if(p.kind==='shell')effects.stun=Math.max(effects.stun,.8);projectiles.splice(i,1);continue}if(p.x<-405||p.x>405||p.y<-290||p.y>290){projectiles.splice(i,1)}else if(p.life<=0)projectiles.splice(i,1)}
 if(effects.speed>0)effects.speed-=dt;if(effects.shield>0)effects.shield-=dt;
 updateHud(dt)}
function pTimer(dt){for(const p of itemPads)if(p.got){p.t-=dt;if(p.t<=0)p.got=false}}
function keepInArena(o,isCar){if(o.x>405){o.x=405;o.vx=-Math.abs(o.vx)*.55}if(o.x<-405){o.x=-405;o.vx=Math.abs(o.vx)*.55}if(o.y>270){o.y=270;o.vy=-Math.abs(o.vy)*.55}if(o.y<-270){o.y=-270;o.vy=Math.abs(o.vy)*.55}}
function collideCircle(a,b,loss){let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.radius+b.radius;if(d<min&&d>0){let nx=dx/d,ny=dy/d,over=min-d;b.x+=nx*over;b.y+=ny*over;let av=a.vx*nx+a.vy*ny;ball.vx+=nx*av*1.1*loss;ball.vy+=ny*av*1.1*loss;let rv=-(a.vx*ny-a.vy*nx)*.01;}}
function score(team){if(team==='blue')blue++;else orange++;$('blueScore').textContent=blue;$('orangeScore').textContent=orange;spawnNotice(team==='blue'?'BLUE GOAL!':'ORANGE GOAL!');resetPositions();itemPads.forEach(p=>p.got=false)}
function gameEnd(){paused=true;spawnNotice(blue===orange?'OVERTIME':blue>orange?'BLUE WINS':'ORANGE WINS');setTimeout(()=>{if(confirm((blue===orange?'Draw':blue>orange?'Blue wins!':'Orange wins!')+'  Play again?')){blue=orange=0;time=90;$('blueScore').textContent=0;$('orangeScore').textContent=0;resetPositions();paused=false}else paused=false},900)}
function updateHud(){let m=Math.max(0,Math.ceil(time));$('clock').textContent=`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;$('boostFill').style.width=car.boost+'%';const mph=Math.round(Math.hypot(car.vx,car.vy)*.28);$('speed').textContent=mph+' MPH';if(countdown)$('countdown').textContent=Math.ceil(kickoff)||'';else $('countdown').textContent=''}
function frame(now){let dt=Math.min(.033,(now-last)/1000||0);last=now;drawField();if(!paused)update(dt);itemPads.forEach(drawPad);for(const p of projectiles){ctx.save();ctx.translate(wx(p.x),wy(p.y));ctx.fillStyle=p.kind==='bomb'?'#263548':'#42a5f5';ctx.beginPath();ctx.arc(0,0,p.r*world().sx,0,Math.PI*2);ctx.fill();ctx.restore()}drawCar(rival,true);drawCar(car,false);drawBall();requestAnimationFrame(frame)}requestAnimationFrame(frame);
