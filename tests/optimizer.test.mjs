import {test} from 'node:test';
import assert from 'node:assert/strict';
import {optimize,validate,parseDimension} from '../dist/optimizer.mjs';
const part=(id,l,w,qty=1,extra={})=>({id,label:id,length:l,width:w,qty,material:'wood',...extra});
const project=(parts,stock=[part('stock',100,100,10)],settings={})=>({parts,stock,settings:{kerf:3,trim:0,rotation:true,materials:true,unit:'mm',priority:'material',...settings}});
function verify(p,r){
 const placed=r.sheets.flatMap(s=>s.parts);assert.equal(placed.length+r.unplaced.length,p.parts.reduce((s,x)=>s+x.qty,0));
 const inventory=new Map();
 for(const s of r.sheets){inventory.set(s.id,(inventory.get(s.id)||0)+1);for(const a of s.parts){assert.ok(a.x>=p.settings.trim-1e-7&&a.y>=p.settings.trim-1e-7);assert.ok(a.x+a.w<=s.length-p.settings.trim+1e-7&&a.y+a.h<=s.width-p.settings.trim+1e-7);if(a.grain||!p.settings.rotation)assert.equal(a.rotated,false);if(p.settings.materials)assert.equal(a.material,s.material);for(const b of s.parts){if(a===b)continue;const k=p.settings.kerf;assert.ok(a.x+a.w+k<=b.x+1e-7||b.x+b.w+k<=a.x+1e-7||a.y+a.h+k<=b.y+1e-7||b.y+b.h+k<=a.y+1e-7,'pieces must not overlap or consume the kerf');}}}
 for(const s of p.stock)assert.ok((inventory.get(s.id)||0)<=s.qty);
 for(const part of p.parts)assert.equal([...placed,...r.unplaced].filter(x=>x.id===part.id).length,part.qty);
}
test('exact stock fit does not require kerf beyond stock edge',()=>{const p=project([part('a',100,100)],undefined,{trim:0});const r=optimize(p);verify(p,r);assert.equal(r.sheets.length,1);assert.equal(r.cutCount,0);assert.equal(r.utilization,100);});
test('kerf makes two 50 mm pieces too large for a 100 mm sheet',()=>{const p=project([part('a',50,100,2)],[part('stock',100,100,1)]);const r=optimize(p);verify(p,r);assert.equal(r.unplaced.length,1);});
test('rotation fits a piece, but grain lock prevents it',()=>{const stock=[part('stock',80,100,1)];assert.equal(optimize(project([part('a',100,80)],stock)).unplaced.length,0);assert.equal(optimize(project([part('a',100,80,1,{grain:true})],stock)).unplaced.length,1);});
test('trim and finite quantities are honored',()=>{const p=project([part('a',90,90,2)],[part('stock',100,100,1)],{trim:5});const r=optimize(p);verify(p,r);assert.equal(r.unplaced.length,1);assert.equal(r.sheets[0].parts[0].x,5);});
test('material separation and one-sheet constraint',()=>{const p=project([part('a',80,80),part('b',80,80,1,{material:'steel'})],[part('s1',100,100,2),part('s2',100,100,1,{material:'steel'})],{singleSheet:true});const r=optimize(p);verify(p,r);assert.equal(r.sheets.length,1);assert.equal(r.unplaced.length,1);});
test('invalid and oversized inputs are rejected',()=>{for(const qty of [0,-1,1.5,501,NaN])assert.ok(validate(project([part('a',30,30,qty)])).length);assert.throws(()=>optimize(project([part('a',Infinity,20)])));assert.ok(validate(project([part('a',20,20),part('a',30,30)])).length);});
test('fractions and unit conversion',()=>{assert.equal(parseDimension('24 1/2','in'),622.3);assert.equal(parseDimension('3/4','in'),19.049999999999997);assert.ok(Number.isNaN(parseDimension('1/0')));assert.ok(Number.isNaN(parseDimension('12junk')));});
test('deterministic randomized layouts preserve all physical constraints',()=>{let seed=127;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};for(let n=0;n<80;n++){const parts=Array.from({length:5+Math.floor(rand()*15)},(_,i)=>part('p'+i,10+Math.floor(rand()*130),10+Math.floor(rand()*100),1+Math.floor(rand()*3),{grain:rand()<.3}));const p=project(parts,[part('s1',200,150,4),part('s2',150,120,3)],{trim:Math.floor(rand()*6),kerf:rand()*5,rotation:rand()>.2,priority:rand()>.5?'material':'cuts'});verify(p,optimize(p));}});
test('cut sequence can be executed as full cuts and leaves every finished piece intact',()=>{
 const p=project([part('a',73,38,4),part('b',56,36,4),part('c',71,29,2),part('d',60,40,2)],[part('stock',244,122,3)],{kerf:.3,trim:.5});
 const r=optimize(p), close=(a,b)=>Math.abs(a-b)<1e-6;
 for(const sheet of r.sheets){let rects=[{x:.5,y:.5,w:243,h:121}];for(const cut of sheet.cuts){const vertical=cut.axis==='vertical';const i=rects.findIndex(f=>vertical?close(f.y,cut.y)&&close(f.h,cut.length)&&cut.x>f.x&&cut.x<f.x+f.w:close(f.x,cut.x)&&close(f.w,cut.length)&&cut.y>f.y&&cut.y<f.y+f.h);assert.notEqual(i,-1,'cut must span an existing sub-panel');const f=rects.splice(i,1)[0];if(vertical){rects.push({...f,w:cut.x-f.x});const rem=f.x+f.w-cut.x-p.settings.kerf;if(rem>1e-7)rects.push({...f,x:cut.x+p.settings.kerf,w:rem});}else{rects.push({...f,h:cut.y-f.y});const rem=f.y+f.h-cut.y-p.settings.kerf;if(rem>1e-7)rects.push({...f,y:cut.y+p.settings.kerf,h:rem});}}
 for(const piece of sheet.parts)assert.ok(rects.some(f=>close(f.x,piece.x)&&close(f.y,piece.y)&&close(f.w,piece.w)&&close(f.h,piece.h)),'each finished part must exist after the sequence');}
});

test('patio blocking fits on two 16-foot boards with saw kerf',()=>{
 const parts=[[23,2],[47,2],[28,2],[15,2],[30,5]].map(([length,qty],i)=>part('blocking '+(i+1),length*25.4,5.5*25.4,qty));
 for (const kerf of [3,0.13*25.4]) {
  const p=project(parts,[part('2x6x16',192*25.4,5.5*25.4,2)],{kerf,unit:'in'});
  const result=optimize(p);verify(p,result);
  assert.equal(result.unplaced.length,0);assert.equal(result.sheets.length,2);
  assert.ok(Math.abs(result.utilization-97.9166667)<0.0001);
  assert.deepEqual(optimize(p),result,'optimization must be repeatable');
 }
});

test('deep search reports real monotonic progress and never worsens the original search',()=>{
 for(const priority of ['material','cuts']){
  const p=project([part('a',73,38,4),part('b',56,36,4),part('c',71,29,2)],undefined,{priority});
  const before=structuredClone(p),updates=[];
  const r=optimize(p,progress=>updates.push(progress));
  assert.equal(updates[0].completed,0);assert.equal(updates[0].best,null);
  assert.equal(updates.at(-1).completed,512);
  const rank=b=>[b.unplaced,priority==='cuts'?b.cutCount:b.sheets,priority==='cuts'?b.sheets:b.cutCount];
  for(let i=1;i<updates.length;i++){
   assert.equal(updates[i].completed,updates[i-1].completed+1);
   assert.equal(updates[i].total,512);
   if(i>1){const a=rank(updates[i].best),b=rank(updates[i-1].best);const first=a.findIndex((v,j)=>v!==b[j]);assert.ok(first===-1||a[first]<b[first]);}
  }
  assert.deepEqual(updates.at(-1).best,{sheets:r.sheets.length,unplaced:r.unplaced.length,utilization:r.utilization,cutCount:r.cutCount});
  assert.deepEqual(p,before,'search must not mutate inputs');verify(p,r);
 }
});
