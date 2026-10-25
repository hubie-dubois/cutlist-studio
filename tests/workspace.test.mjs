import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,blankRow,exportRowsCSV,importRowsText,edgeBands,bandTotals,groupSheets} from '../dist/workspace.mjs';
import {parseMeasurement,formatMeasurement} from '../dist/units.mjs';
import {optimize,validate,allowedOrientations,searchStrategyCount} from '../dist/optimizer.mjs';
import {sheetSVG} from '../dist/diagram.mjs';
const row=(type,extra={})=>({...blankRow(type),length:100,width:50,label:'A',...extra});
const project=(parts,stock,settings={})=>({parts,stock,settings:{...defaultSettings(),...settings}});

test('all unit formats preserve dimensions on CSV exchange',()=>{
 for(const unit of ['mm','cm','m','in','in-frac','ft-in','ft-in-frac','generic']){
  const settings=defaultSettings(unit),original=row('parts',{length:698.5,width:25.4,label:'Door, "left"',material:'Birch\n18 mm',grain:'width',qty:2,bands:{T:'Oak',L:'Maple'},enabled:false});
  const restored=importRowsText(exportRowsCSV([original],settings),'parts',settings)[0];
  for(const field of ['length','width'])assert.ok(Math.abs(restored[field]-original[field])<.001,`${unit} ${field}`);
  for(const field of ['qty','label','material','grain','enabled','bands'])assert.deepEqual(restored[field],original[field]);
 }
});
test('feet, explicit unit suffixes, fractions and rounding carry',()=>{
 assert.equal(parseMeasurement('2\' 3 1/2"','ft-in-frac'),698.5);
 assert.equal(parseMeasurement('100 cm','in'),1000);
 assert.equal(parseMeasurement('3/4','in-frac'),19.049999999999997);
 assert.equal(formatMeasurement(304.7999,'ft-in-frac'),`1' 0"`);
 assert.equal(formatMeasurement(25.4*1.5,'in-frac'),'1 1/2');
 for(const input of ['','1/0','NaN','1,000','2/3/4'])assert.ok(Number.isNaN(parseMeasurement(input)));
});
test('spreadsheet paste supports headers, aliases, no-header rows and bounds',()=>{
 const settings=defaultSettings();
 assert.equal(importRowsText('length\twidth\tquantity\tlabel\n100\t50\t3\tShelf','parts',settings)[0].qty,3);
 assert.equal(importRowsText('100\t50\t2\tShelf','parts',settings)[0].label,'Shelf');
 assert.throws(()=>importRowsText('length,width,qty\n100,50,5001','parts',settings),/quantity/);
 assert.throws(()=>importRowsText('length,width,enabled\nwrong,50,false','parts',settings),/length/);
 assert.throws(()=>importRowsText('length,width,unit\n100,50,wat','parts',settings),/unknown unit/);
 assert.match(exportRowsCSV([row('parts',{label:'=WEBSERVICE("test")'})],settings),/"'=WEBSERVICE/);
});
test('disabled rows are excluded and the enabled total is capped at 5,000',()=>{
 const p=project([row('parts'),row('parts',{length:null,width:null,qty:5000,enabled:false})],[row('stock')],{kerf:0});
 assert.deepEqual(validate(p),[]);const r=optimize(p);assert.equal(r.sheets[0].parts.length,1);assert.equal(r.unplaced.length,0);
 p.parts[1].enabled=true;assert.ok(validate(p).some(e=>e.includes('5,000 total')));
 p.parts[1].enabled=false;p.parts[1].label={bad:true};assert.ok(validate(p).length,'disabled rows still need safe metadata');
});
test('grain aligns part and stock axes in both orientations including square parts',()=>{
 const p=project([],[],{rotation:true}),part=row('parts',{grain:'width'}),stock=row('stock',{grain:'length'});
 assert.deepEqual(allowedOrientations(p,part,stock),[[50,100,true]]);
 assert.deepEqual(allowedOrientations(p,{...part,length:50},stock),[[50,50,true]]);
 assert.deepEqual(allowedOrientations(p,{...part,grain:'length'},stock),[[100,50,false]]);
 assert.equal(allowedOrientations({...p,settings:{...p.settings,rotation:false}},part,stock).length,0);
 assert.equal(allowedOrientations(p,part,{...stock,grain:'none'}).length,2);
 assert.equal(optimize(project([part],[row('stock',{width:100,length:50,grain:'length'})])).unplaced.length,0);
});
test('minimum trim rejects slivers but allows exact boundaries',()=>{
 const parts=[row('parts',{length:95,width:100})],stock=[row('stock',{width:100,length:100})];
 assert.equal(optimize(project(parts,stock,{minTrim:3,kerf:3})).unplaced.length,1);
 assert.equal(optimize(project(parts,stock,{minTrim:2,kerf:3})).unplaced.length,0);
 assert.equal(optimize(project([row('parts',{width:100})],stock,{minTrim:100})).unplaced.length,0);
});
test('preferred cut direction and source/output geometry agree with executable sequence',()=>{
 for(const direction of ['length','width']){
  const p=project([row('parts',{qty:4,length:30,width:20})],[row('stock',{length:100,width:100})],{cutDirection:direction});
  const r=optimize(p),s=r.sheets[0];assert.equal(s.cuts[0].axis,direction==='width'?'vertical':'horizontal');
  let sections=[{x:0,y:0,w:100,h:100}];
  for(const c of s.cuts){const index=sections.findIndex(f=>['x','y','w','h'].every(k=>Math.abs(f[k]-c.source[k])<1e-6));assert.notEqual(index,-1);const f=sections.splice(index,1)[0];assert.ok(c.outputs.every(o=>o.w>0&&o.h>0));
   if(c.axis==='vertical'){assert.equal(c.outputs[0].w,c.x-f.x);sections.push({...f,w:c.x-f.x});if(f.x+f.w-c.x>p.settings.kerf)sections.push({...f,x:c.x+p.settings.kerf,w:f.x+f.w-c.x-p.settings.kerf});}
   else{assert.equal(c.outputs[0].h,c.y-f.y);sections.push({...f,h:c.y-f.y});if(f.y+f.h-c.y>p.settings.kerf)sections.push({...f,y:c.y+p.settings.kerf,h:f.y+f.h-c.y-p.settings.kerf});}
  }
  for(const part of s.parts)assert.ok(sections.some(f=>['x','y','w','h'].every(k=>Math.abs(f[k]-part[k])<1e-6)));
 }
});
test('banding lengths use original edges and enabled quantities',()=>{
 const p=row('parts',{qty:2,edges:'TB',bands:{T:'Oak',L:'Maple'}});
 assert.deepEqual(edgeBands(p),{T:'Oak',B:'Standard',L:'Maple'});
 assert.deepEqual(Object.fromEntries(bandTotals([p,{...p,enabled:false}]).map(b=>[b.name,b.length])),{Oak:200,Standard:200,Maple:100});
});
test('identical layouts group without hiding stock identity or quantity',()=>{
 const p=project([row('parts',{qty:3})],[row('stock',{qty:3})]);const r=optimize(p),groups=groupSheets(r.sheets);
 assert.equal(groups.length,1);assert.equal(groups[0].count,3);assert.equal(groupSheets(r.sheets,false).length,3);
 assert.equal(groupSheets([r.sheets[0],{...r.sheets[0],id:'other-stock'}]).length,2);
});
test('SVG escapes labels, rotates geometry, and honors independent view options',()=>{
 const p=project([row('parts',{label:'<script>bad</script>',bands:{T:'"bad"'}})],[row('stock')]);const r=optimize(p);
 const svg=sheetSVG(r.sheets[0],p,{rotation:90,cuts:true});assert.match(svg,/rotate\(90\)/);assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);
 const hidden=sheetSVG(r.sheets[0],p,{labels:false,dimensions:false,colors:false});assert.match(hidden,/fill="#fff"/);assert.ok(!hidden.includes('dominant-baseline="middle"'));
});
test('search scales down for large jobs and publishes a usable best-so-far result',()=>{
 for(const [qty,count] of [[1000,512],[1001,128],[2501,80],[5000,80]])assert.equal(searchStrategyCount({parts:[{qty}]}),count);
 const p=project([row('parts')],[row('stock')]);let first,best;
 const result=optimize(p,(progress,r)=>{if(progress.completed===1)first=structuredClone(r);best=r;});
 assert.equal(first.sheets.length,1);assert.deepEqual(best,result);
});
test('invalid imported presentation settings are rejected before rendering',()=>{
 for(const settings of [{precision:99},{precision:'two'},{dimensionOrder:'bad'},{cutDirection:'bad'},{priority:'bad'},{groupLayouts:'yes'}])assert.ok(validate(project([],[],settings),{draft:true}).length);
});
