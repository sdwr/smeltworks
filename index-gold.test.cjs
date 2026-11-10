const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/index-gold.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
new vm.Script(script);
function node() { return { style:{setProperty(){},getPropertyValue(){return '';}}, classList:{add(){},remove(){},contains(){return false;},toggle(){}}, addEventListener(){}, setAttribute(){}, getAttribute(){return '';}, querySelector(){return node();}, querySelectorAll(){return [];}, replaceChildren(){}, appendChild(){},prepend(){}, getBoundingClientRect(){return {left:0,top:0,width:320,height:240};}, clientWidth:1200, clientHeight:800, offsetWidth:320, offsetHeight:240, innerHTML:'', textContent:'', dataset:{},ownerSVGElement:{setAttribute(){}} }; }
const store = new Map();
const document = {hidden:false,addEventListener(){},getElementById:node,createElement:node,querySelectorAll(){return [];}};
const context = vm.createContext({document,window:{addEventListener(){},devicePixelRatio:1},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},setInterval(){},requestAnimationFrame(){},console,Math:Object.create(Math),Date});
vm.runInContext(script.slice(0, script.indexOf('S = load();')),context);
function run(code) { return vm.runInContext(code,context); }
run('S = freshState(); fxOff = true; ORES.forEach(d => bars[d.id] = {root:document.createElement("div"),cur:document.createElement("div"),eport:document.createElement("div"),hport:document.createElement("div")});');


let count=0;
function test(name, body) { assert.equal(run('(()=>{'+body+'})()'),true,name); count++; console.log('PASS '+name); }
test('Isolated save, wood rack and immediate battle grant', "return SAVE_KEY==='smeltworks.gold.save.v1' && BY_ID.gear.unlock.wood===5 && BY_ID.battle.opensWith==='gear' && isRevealed('gear')");
test('Every upgrade definition uses only gold at all levels', "for(const d of ORES){for(const u of [...UPGRADES,MOULDS,AUTO,BELLOWS,LINING,STOKER]){for(let level=0;level<u.max;level++){const c=costOf(d.id,u,level); if(Object.keys(c).join()!=='gold'||c.gold<1||payOre(d.id,u)!=='gold')return false;}}}return true;");
test('Wood has fixed lower stats than plain iron in every slot', "for(const slot of GEAR_SLOTS){const w=rollGear(slot,'wood'),i={slot,mat:'iron',extra:{}}; const ws=gearStats(w),is=gearStats(i);if(Object.keys(w.extra).length || !Object.keys(is).some(k=>(ws[k]||0)<is[k]) || Object.keys(ws).some(k=>ws[k]>(is[k]||0)))return false;} return true;");
test('Fresh game can chop enough wood without buying an upgrade', "S=freshState();for(let cycle=0;cycle<5;cycle++){work('wood');for(let t=0;t<2;t+=0.1)step(0.1);}return S.ores.wood.amount===5 && canPay(BY_ID.gear.unlock);");
test('Rack purchase and wood recipe leave materials nonnegative', "pay(BY_ID.gear.unlock);S.ores.gear.unlocked=true;S.ores.battle.unlocked=true;for(let cycle=0;cycle<3;cycle++){work('wood');for(let t=0;t<2;t+=0.1)step(0.1);}forgeSpec('weapon','wood').buy();return S.ores.gear.job.mat==='wood' && S.ores.wood.amount>=0 && S.ores.battle.gold===0;");
test('Craft completes and wooden blade can be equipped', "stepForge(S.ores.gear,3);const item=S.gear.weapon.eq;if(!item)return false;return S.gear.weapon.eq.mat==='wood' && heroStats(false).atk===2;");
test('Wooden blade earns first gold against worst loot roll', "Math.random=()=>0;startRun(S.ores.battle);for(let t=0;t<8;t+=0.05)stepBattle(S.ores.battle,0.05);return S.ores.battle.best>=1 && S.ores.battle.floor.gold>=1;");
test('Starter wooden set reliably earns storage upgrade cost', "S=freshState();S.ores.gear.unlocked=S.ores.battle.unlocked=true;for(const k of GEAR_SLOTS)S.gear[k].eq=rollGear(k,'wood');startRun(S.ores.battle);for(let t=0;t<45;t+=0.05)stepBattle(S.ores.battle,0.05);collectDrop('all');return S.ores.battle.gold>=3 && S.ores.battle.best>=2;");
test('Gold storage purchase preserves wood and unlocks larger capacity', "S.ores.wood.amount=5;const before=S.ores.battle.gold;upgradeSpec('wood',UPGRADES[0]).buy();return S.ores.wood.amount===5 && capOf('wood')===8 && S.ores.battle.gold===before-3;");
test('Unaffordable upgrade does not spend or increment', "S.ores.battle.gold=0;const level=S.ores.wood.lvl.yield;upgradeSpec('wood',UPGRADES[1]).buy();return S.ores.wood.lvl.yield===level && S.ores.battle.gold===0;");
test('Milestones do not grant resource upgrade levels', "S=freshState();S.ores.battle.best=20;S.ores.farm.lifetime=1;awardMilestones();awardMilestones();return S.astra.claimed.length===3 && ORES.every(d=>Object.values(S.ores[d.id].lvl).every(l=>l===0));");
test('Iron crafting requires unlocked bar production', "S.ores.gear.unlocked=true;S.ores.bars.amount=3;forgeSpec('weapon','iron').buy();return !forgeJob() && S.ores.bars.amount===3;");
test('Iron and steel recipes still charge materials', "S.ores.bars.unlocked=true;S.ores.battle.gold=100;forgeSpec('weapon','iron').buy();return forgeJob().mat==='iron' && S.ores.bars.amount===0 && S.ores.battle.gold===100 && forgeSpec('weapon','steel').cost.steel===3;");
test('Wood recycling returns wood rather than metal or gold', "S.ores.wood.amount=0;const it=rollGear('head','wood');S.gear.head.bak[0]=it;const money=S.ores.battle.gold; meltGear(it.uid);return S.ores.wood.amount===1 && S.ores.bars.amount===0 && S.ores.battle.gold===money;");
test('Wood enhancement is rejected without removing equipment', "S.ores.bench.unlocked=true;S.gear.weapon.eq=rollGear('weapon','wood');const uid=S.gear.weapon.eq.uid;return !benchTake(uid) && S.gear.weapon.eq.uid===uid && !S.ores.bench.job;");
test('Bucket and river costs are gold with no flow prerequisite', "S.ores.battle.unlocked=S.ores.buckets.unlocked=S.ores.water.unlocked=true;return Object.keys(bucketSpec('buckets').cost).join()==='gold' && Object.keys(riverSpec('water').cost).join()==='gold' && !riverSpec('water').gate;");
test('River purchase preserves resources and recent flow', "S.ores.battle.gold=100;S.ores.water.hist=[[0,3]];S.ores.stone.amount=4;riverSpec('water').buy();return S.ores.battle.gold===75 && S.ores.stone.amount===4 && S.ores.water.hist.length===1 && S.ores.water.lvl.river===1;");
test('Wood gear and gold upgrades survive save/load', "save();const loaded=load();return loaded.gear.weapon.eq.mat==='wood' && loaded.ores.water.lvl.river===1 && loaded.ores.battle.gold===75;");
test('Existing between-run loot persistence is retained', "S.ores.battle.floor.gold=123;startRun(S.ores.battle);return S.ores.battle.floor.gold===123;");
console.log(count+' Gold economy checks passed.');

test('Enhancement odds decline by ten points to a ten percent floor', "return [0,1,2,3,4,5,6,7,8,9,20].every((n,i)=>Math.abs(enhChance(n)-[.9,.8,.7,.6,.5,.4,.3,.2,.1,.1,.1][i])<1e-9);");
test('Successful +1 preserves item and increments its level', "S=freshState();S.ores.bench.unlocked=true;S.ores.battle.embers.iron=100;S.gear.weapon.eq={uid:500,slot:'weapon',mat:'iron',tier:1,extra:{hp:4},plus:0};benchTake(500);benchConfirm();Math.random=()=>.899;stepBench(S.ores.bench,100);return S.gear.weapon.eq.uid===500 && S.gear.weapon.eq.plus===1 && S.ores.battle.embers.iron===99;");
test('Failure at +2 resets to +0 and retains rolled bonuses', "benchTake(500);benchConfirm();Math.random=()=>.8;stepBench(S.ores.bench,100);return S.gear.weapon.eq.uid===500 && S.gear.weapon.eq.plus===0 && S.gear.weapon.eq.extra.hp===4 && S.ores.battle.embers.iron===96;");
test('Failure at +1 leaves an intact +0 item', "benchTake(500);benchConfirm();Math.random=()=>.9;stepBench(S.ores.bench,100);return S.gear.weapon.eq.uid===500 && S.gear.weapon.eq.plus===0;");
test('Loaded enhancement jobs use current odds', "benchTake(500);S.ores.bench.job.chance=1;save();const restored=load();return restored.ores.bench.job.chance===.9;");
test('A normal enemy kill awards loot without drop audio', "S=freshState();S.ores.battle.unlocked=true;S.ores.battle.wave=1;S.ores.battle.heroHp=20;const heard=[],old=sfx;sfx=n=>heard.push(n);try{winWave(S.ores.battle,heroStats());}finally{sfx=old;}return S.ores.battle.floor.gold>0 && !heard.includes('coin');");
assert.equal((html.match(/class="skull"/g)||[]).length,1,'Only hero skull remains');
console.log('Enhancement and combat feedback checks passed; total '+count+' behavior checks.');

test('Craft panel explains missing materials and locks metal recipes', "S=freshState();S.ores.gear.unlocked=true;const wood=craftPanelState('weapon','wood'),iron=craftPanelState('weapon','iron');return !wood.enabled && wood.reason.includes('Need') && !iron.enabled && iron.reason.includes('Unlock');");
test('Craft panel enables the selected affordable recipe', "S.ores.wood.amount=3;const state=craftPanelState('offhand','wood');return state.enabled && state.spec.title.includes('Shield') && state.spec.cost.wood===3;");
test('Busy anvil blocks additional recipes and reports its timer', "forgeSpec('offhand','wood').buy();const state=craftPanelState('head','wood');return !state.enabled && state.reason.includes('Crafting Wood Shield') && state.reason.includes('remaining');");
test('Unequip moves equipment to inventory without duplication', "S=freshState();const item=rollGear('weapon','wood');S.gear.weapon.eq=item;return unequipGear(item.uid) && !S.gear.weapon.eq && S.gear.weapon.bak[0].uid===item.uid && !S.gear.weapon.bak[1];");
test('Equipping from inventory swaps the previously worn item back', "const spare=S.gear.weapon.bak[0],worn=rollGear('weapon','iron');S.gear.weapon.eq=worn;wearGear(spare.uid);return S.gear.weapon.eq.uid===spare.uid && S.gear.weapon.bak[0].uid===worn.uid;");
test('Full inventory blocks unequip and crafting without losing gear', "S.ores.gear.unlocked=true;S.ores.wood.amount=5;S.gear.weapon.bak[1]=rollGear('weapon','wood');const uid=S.gear.weapon.eq.uid;return !unequipGear(uid) && S.gear.weapon.eq.uid===uid && !craftPanelState('weapon','wood').enabled && craftPanelState('weapon','wood').reason.includes('full');");
test('Tooltip compares full stats against equipped gear', "const item=S.gear.weapon.bak[0],tip=gearTooltipSpec(item,'bak');return tip.title.includes('Iron') && tip.eff.includes('Attack') && tip.eff.includes('better') && tip.eff.includes('+2') && tip.tip.includes('Click to equip');");
test('Equipment chips use custom tooltip targets instead of browser titles', "const item=S.gear.weapon.eq,markup=chipHtml(item,'eq','eq','weapon');return markup.includes('data-gear-tooltip') && markup.includes('aria-label') && !markup.includes(' title=');");
test('Equipment save round trip retains body and inventory arrangement', "save();const loaded=load();return loaded.gear.weapon.eq.uid===S.gear.weapon.eq.uid && loaded.gear.weapon.bak[0].uid===S.gear.weapon.bak[0].uid && loaded.gear.weapon.bak[1].uid===S.gear.weapon.bak[1].uid;");
console.log('Equipment redesign checked; '+count+' behavior checks total.');

test('Wide equipment does not push furnace or wood down', "const cards=[{id:'furnace',y:1015,width:380,height:460},{id:'wood',y:1300,width:380,height:300},{id:'gear',y:1015,width:820,height:680},{id:'bench',y:1015,width:380,height:420}];const a=columnLayout(cards),b=columnLayout(cards.map(c=>c.id==='gear'?{...c,width:1100,height:1000}:c));return ['furnace','wood'].every(id=>a.cards.find(c=>c.id===id).y===b.cards.find(c=>c.id===id).y);");
test('All cards retain spacing across compact and wide layouts', "for(const width of [540,820,1100]){const result=columnLayout(ORES.filter(d=>!d.hosted).map(d=>({id:d.id,y:POS_OF_ORE[d.id].y/100*ASTRA_MAP_HEIGHT,width:d.id==='gear'?width:d.id==='battle'?580:380,height:d.id==='gear'?800:400})));for(let i=0;i<result.cards.length;i++)for(let j=i+1;j<result.cards.length;j++){const a=result.cards[i],b=result.cards[j];const horizontal=Math.abs(a.x-b.x)-(a.width+b.width)/2,vertical=Math.abs(a.y-b.y)-(a.height+b.height)/2;if(horizontal<48-.001&&vertical<48-.001)return false;}if(result.cards.some(c=>c.x-c.width/2<0||c.x+c.width/2>result.width))return false;}return true;");
console.log('Layout checks passed; '+count+' behavior and geometry checks total.');
