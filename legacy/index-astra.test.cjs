const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/index-astra.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
new vm.Script(script);
function node() { return { style:{setProperty(){},getPropertyValue(){return '';}}, classList:{add(){},remove(){},contains(){return false;},toggle(){}}, addEventListener(){}, setAttribute(){}, getAttribute(){return '';}, querySelector(){return node();}, querySelectorAll(){return [];}, replaceChildren(){}, appendChild(){},prepend(){}, getBoundingClientRect(){return {left:0,top:0,width:320,height:240};}, clientWidth:1200, clientHeight:800, offsetWidth:320, offsetHeight:240, innerHTML:'', textContent:'', dataset:{},ownerSVGElement:{setAttribute(){}} }; }
const store = new Map();
const document = {hidden:false,addEventListener(){},getElementById:node,createElement:node,querySelectorAll(){return [];}};
const context = vm.createContext({document,window:{addEventListener(){},devicePixelRatio:1},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},setInterval(){},requestAnimationFrame(){},console,Math:Object.create(Math),Date});
vm.runInContext(script.slice(0, script.indexOf('S = load();')),context);
function run(code) { return vm.runInContext(code,context); }
run('S = freshState(); fxOff = true; ORES.forEach(d => bars[d.id] = {root:document.createElement("div"),cur:document.createElement("div"),eport:document.createElement("div"),hport:document.createElement("div")});');

let passed = 0;
function test(name, code) { assert.equal(run(code), true, name); passed++; console.log('PASS ' + name); }
test('Separate save and shorter opening', "SAVE_KEY === 'smeltworks.astra.save.v1' && BY_ID.stone.unlock.wood === 8 && BY_ID.furnace.unlock.stone === 5");
test('Wave milestones grant helpers once', "S.ores.battle.best=5; awardMilestones(); const claims=S.astra.claimed.length; awardMilestones(); S.ores.wood.lvl.auto===1 && S.ores.bars.lvl.auto===1 && S.ores.stone.lvl.auto===1 && S.astra.claimed.length===claims");
test('Starter garden is awarded once', "S.ores.farm.unlocked=true; awardMilestones(); awardMilestones(); S.ores.buckets.buckets.length===1 && seedsHeld('grain')===3 && S.ores.farm.moulds.length===3");
test('First harvest earns farmer and river', "S.ores.farm.lifetime=1; awardMilestones(); S.ores.farm.lvl.auto===1 && S.ores.water.lvl.river===1");
test('Batch casting respects input balance', "S.ores.bars.unlocked=true; S.ores.iron.unlocked=true; S.ores.iron.amount=5; batchBench('bars',false); S.ores.iron.amount===2 && S.ores.bars.moulds.filter(m=>m.s==='cool').length===1");
test('Full storage does not consume casting inputs', "S.ores.bars.amount=capOf('bars'); const ironBefore=S.ores.iron.amount; batchBench('bars',false); S.ores.iron.amount===ironBefore");
test('Farm expansions add exactly one plot', "plotCount('farm',0)===3 && plotCount('farm',1)===4 && upgradesFor(BY_ID.farm).includes(MOULDS)");
test('Preview preserves equipped item', "S.ores.bench.unlocked=true; S.gear.weapon.eq={uid:99,slot:'weapon',mat:'iron',tier:0,extra:{},plus:0}; benchTake(99); S.gear.weapon.eq.uid===99 && heroStats(false).atk===4 && enhancementPreview(S.gear.weapon.eq,1)==='ATK 3 → 4'");
test('Cancel preview never duplicates gear', "benchReturn(); S.gear.weapon.eq.uid===99 && S.gear.weapon.bak.every(x=>x===null) && !S.ores.bench.job");
test('First enhancement is guaranteed and restores equipment', "benchTake(99); S.ores.battle.embers.iron=50; benchConfirm(); const unequipped=!S.gear.weapon.eq; Math.random=()=>0.999; stepBench(S.ores.bench,100); unequipped && S.gear.weapon.eq.plus===1 && S.ores.battle.embers.iron===49");
test('Later failed enhancement preserves item and level', "S.gear.weapon.eq.plus=3; benchTake(99); benchConfirm(); stepBench(S.ores.bench,100); S.gear.weapon.eq.uid===99 && S.gear.weapon.eq.plus===3 && !S.ores.bench.job && S.ores.battle.embers.iron===39");
test('Loot persists between runs', "S.ores.battle.floor.gold=123; S.ores.battle.floor.embers.iron=4; startRun(S.ores.battle); S.ores.battle.floor.gold===123 && S.ores.battle.floor.embers.iron===4");
test('Save round trip retains settings and milestones', "S.astra.autoFire=true; save(); const restored=load(); restored.astra.autoFire && restored.astra.claimed.includes('farmer') && restored.ores.battle.floor.gold===123 && restored.gear.weapon.eq.uid===99");
test('Offline produces only from helpers and pauses battle', "S=freshState(); S.ores.wood.lvl.auto=1; S.ores.wood.lvl.cap=5; S.ores.battle.active=true; S.ores.battle.unlocked=true; S.ores.battle.wave=1; S.ores.battle.enemyHp=10; catchUpAstra(10); Math.abs(S.ores.wood.amount-3.5)<0.00001 && S.ores.battle.enemyHp===10 && S.ores.battle.wave===1");
test('Offline does not chop without a helper', "S=freshState(); catchUpAstra(10); S.ores.wood.amount===0");
test('Offline respects the 30 minute cap', "S=freshState(); S.ores.wood.lvl.auto=1; S.ores.wood.lvl.cap=30; catchUpAstra(7200); Math.abs(S.ores.wood.amount-630)<0.001");
test('Automatic burns require earned helper and consume wood', "S=freshState(); S.ores.furnace.unlocked=true; S.astra.autoFire=true; S.astra.claimed.push('firekeeper'); S.ores.wood.amount=5; step(0.25); S.ores.wood.amount===0 && S.ores.furnace.burnLeft>0 && S.ores.furnace.heat>0");
test('Field helper waters another crop when selected crop is full', "S=freshState(); S.ores.farm.unlocked=true; S.ores.farm.crops.grain=capOf('farm'); S.ores.farm.moulds[0]={s:'planted',kind:'herb',t:0}; S.ores.buckets.buckets=[{f:100}]; autoPressMould('farm'); S.ores.farm.moulds[0].s==='cool' && fullBuckets()===0");
test('Preview survives save and reload without duplicating equipment', "S=freshState(); S.ores.bench.unlocked=true; S.gear.weapon.eq={uid:10,slot:'weapon',mat:'iron',tier:0,extra:{},plus:0}; benchTake(10); save(); S=load(); benchReturn(); S.gear.weapon.eq.uid===10 && S.gear.weapon.bak.every(x=>!x)");
console.log(passed + ' simulation checks passed. Visual browser checks remain separate.');

function expect(code) { assert.equal(run(code),true,code); }
expect("S=freshState(); furnaceActionState().state==='locked'");
expect("S.ores.furnace.unlocked=true; furnaceActionState().state==='short' && !furnaceActionState().enabled");
expect("S.ores.wood.amount=5; furnaceActionState().state==='ready' && furnaceActionState().enabled");
expect("stokeFurnace(true); furnaceActionState().state==='burning' && !furnaceActionState().enabled");
expect("S.ores.furnace.burnLeft=0; S.ores.furnace.burnCooldown=8; furnaceActionState().state==='cooldown' && furnaceActionState().label.includes('8.0s')");
expect("S.ores.furnace.burnCooldown=0; S.ores.furnace.heat=heatMax(); furnaceActionState().state==='full'");
expect("S.ores.furnace.heat=10; S.ores.wood.amount=5; furnaceActionState().state==='ready'");

expect("JSON.stringify(spaceAstraCards([{id:'iron',x:1240,y:681.5,width:320,height:380},{id:'furnace',x:1240,y:1015,width:320,height:420},{id:'wood',x:1240,y:1300.65,width:320,height:200}]).map(c=>c.y)) === JSON.stringify([681.5,1129.5,1487.5])");
expect("(() => { for(let size=130;size<=650;size+=40) { const cards=ORES.filter(d=>!d.hosted).map(d=>({id:d.id,x:POS_OF_ORE[d.id].x/100*WORLD.w,y:POS_OF_ORE[d.id].y/100*ASTRA_MAP_HEIGHT,width:520,height:size})); const placed=spaceAstraCards(cards); for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i],b=placed[j];if(Math.abs(a.x-b.x)<(a.width+b.width)/2 && Math.abs(a.y-b.y)<(a.height+b.height)/2+48-0.001)return false;} } return true; })()");
console.log('Layout geometry: furnace/iron/wood spacing and 14 card-height scenarios passed.');
