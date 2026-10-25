import {parseCSV} from './csv.mjs?v=20261024';
import {parseMeasurement,formatMeasurement,unitInfo} from './units.mjs?v=20261024';
import {validate} from './optimizer.mjs?v=20261024';
export function defaultSettings(unit='mm') {return {unit,kerf:3,trim:0,minTrim:0,rotation:true,materials:true,singleSheet:false,priority:'material',cutDirection:'auto',precision:2,dimensionOrder:'lw',groupLayouts:true};}
export function prepareProject(p){return {...p,name:String(p.name||''),settings:{...defaultSettings(),...p.settings}};}
export function activeRows(rows){return rows.filter(p=>p.enabled!==false);}
export function blankRow(type,material=''){return {id:crypto.randomUUID(),label:'',length:null,width:null,qty:1,material,enabled:true,grain:type==='stock'?'length':'none',edges:'',bands:{}};}
export function dimensionsText(length,width,settings,input=false){const values=settings.dimensionOrder==='wl'?[width,length]:[length,width];return values.map(n=>formatMeasurement(n,settings.unit,settings.precision,{input})).join(' × ');}
export function edgeBands(p){const bands={...p.bands};for(const side of String(p.edges||''))if(!bands[side])bands[side]='Standard';return bands;}
export function bandTotals(parts){const totals=new Map();for(const p of activeRows(parts))for(const [side,name] of Object.entries(edgeBands(p))){if(!name)continue;const length=(side==='T'||side==='B'?p.length:p.width)*p.qty;totals.set(name,(totals.get(name)||0)+length);}return [...totals].map(([name,length])=>({name,length}));}
export function groupSheets(sheets,enabled=true){
 const groups=[],map=new Map();
 sheets.forEach((sheet,index)=>{
  const key=enabled?JSON.stringify([sheet.id,sheet.length,sheet.width,sheet.material,sheet.grain,sheet.parts.map(p=>[p.id,p.x,p.y,p.w,p.h,p.rotated,edgeBands(p)]),sheet.cuts.map(c=>[c.axis,c.x,c.y,c.length])]):String(index);
  if(map.has(key)){const group=map.get(key);group.indices.push(index);group.count++;}else{const group={sheet,index,indices:[index],count:1};map.set(key,group);groups.push(group);}
 });return groups;
}
export function sheetStats(sheet){const used=sheet.parts.reduce((n,p)=>n+p.w*p.h,0),area=sheet.length*sheet.width;return {area,used,waste:area-used,utilization:area?used/area*100:0,cuts:sheet.cuts.length,cutLength:sheet.cuts.reduce((n,c)=>n+c.length,0),pieces:sheet.parts.length,offcuts:sheet.free.length};}
export function stockUsage(result){const map=new Map();for(const s of result.sheets){const entry=map.get(s.id)||{...s,used:0};entry.used++;map.set(s.id,entry);}return [...map.values()];}
export function csvEscape(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function exportRowsCSV(rows,settings){
 const columns=['label','length','width','qty','material','grain','edges','band_top','band_bottom','band_left','band_right','enabled','unit'];
 return [columns.join(','),...rows.map(p=>{const bands=edgeBands(p);return [p.label,formatMeasurement(p.length,settings.unit,6,{input:true}),formatMeasurement(p.width,settings.unit,6,{input:true}),p.qty,p.material,p.grain===true?'length':p.grain===false?'none':p.grain||'none',p.edges||'',bands.T||'',bands.B||'',bands.L||'',bands.R||'',p.enabled!==false,settings.unit].map(csvEscape).join(',');})].join('\r\n');
}
export function importRowsText(text,type,settings){
 text=String(text).replace(/^\uFEFF/,'');
 // Tabs from spreadsheet clipboard are accepted without changing quoted CSV fields.
 const rows=text.includes('\t')&&!text.split(/\r?\n/)[0].includes(',')?text.trim().split(/\r?\n/).map(l=>l.split('\t')):parseCSV(text);
 if(rows.length>1001)throw new Error('Use at most 1,000 rows per list.');
 if(!rows.length)throw new Error('The list is empty.');
 let header=rows[0].map(s=>s.trim().toLowerCase());
 if(!header.includes('length')&&!header.includes('width'))header=['length','width','qty','label','material'];else rows.shift();
 if(!['length','width'].every(k=>header.includes(k)))throw new Error('Include length and width columns. Quantity defaults to 1.');
 if(header.includes('quantity')&&!header.includes('qty'))header[header.indexOf('quantity')]='qty';
 return rows.filter(r=>r.some(s=>s.trim())).map((r,index)=>{
  const get=key=>r[header.indexOf(key)]?.trim()||'';const unit=get('unit')||settings.unit;
  if(!unitInfo(unit))throw new Error(`Row ${index+1}: unknown unit “${unit}”.`);
  const grain=get('grain').toLowerCase();const p={...blankRow(type),label:get('label')||get('name'),length:parseMeasurement(get('length'),unit),width:parseMeasurement(get('width'),unit),qty:get('qty')?Number(get('qty')):1,material:get('material'),grain:['true','1','yes'].includes(grain)?'length':['false','0','no'].includes(grain)?'none':grain||(type==='stock'?'length':'none'),enabled:!['false','0','no'].includes(get('enabled').toLowerCase()),edges:get('edges').toUpperCase(),bands:{}};
  for(const [side,key] of [['T','band_top'],['B','band_bottom'],['L','band_left'],['R','band_right']])if(get(key))p.bands[side]=get(key);
  // Validate imported dimensions even when the imported row is disabled.
  const candidate={parts:type==='parts'?[{...p,enabled:true}]:[],stock:type==='stock'?[{...p,enabled:true}]:[],settings};
  const errors=validate(candidate,{draft:true});if(errors.length)throw new Error(`Row ${index+1}: ${errors[0]}`);
  return p;
 });
}
