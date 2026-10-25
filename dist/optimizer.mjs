import {parseMeasurement, unitInfo, formatMeasurement} from './units.mjs?v=20261024';
const EPS = 1e-7;
export function validate(project, {draft = false} = {}) {
  const errors = [];
  if (!project || !Array.isArray(project.parts) || !Array.isArray(project.stock) || !project.settings || typeof project.settings !== 'object' || Array.isArray(project.settings)) return ['Invalid project file.'];
  for (const [key, label] of [['parts', 'Part'], ['stock', 'Stock']]) {
    if (!draft && !project[key].some(p=>p?.enabled!==false)) errors.push(`Add at least one ${label.toLowerCase()} row.`);
    if (project[key].length > 1000) errors.push(`Use at most 1000 ${label.toLowerCase()} rows.`);
    const ids = new Set();
    project[key].forEach((p, i) => {
      if (!p || typeof p !== 'object') {errors.push(`${label} ${i + 1}: invalid row.`);return;}
      if (typeof p.id !== 'string' || ids.has(p.id)) errors.push(`${label} ${i + 1}: invalid or duplicate ID.`);
      ids.add(p.id);
      if(p.enabled!==undefined && typeof p.enabled!=='boolean') errors.push(`${label} ${i+1}: enabled must be true or false.`);
      const inactive=p.enabled===false;
      for (const dim of ['length', 'width']) if (!inactive && !(draft && p[dim] === null) && (!Number.isFinite(p[dim]) || p[dim] <= 0 || p[dim] > 100000)) errors.push(`${label} ${i + 1}: ${dim} must be greater than 0 and at most 100,000 mm.`);
      if (!inactive && (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > 5000)) errors.push(`${label} ${i + 1}: quantity must be 1–5,000.`);
      if (typeof p.label !== 'string' || typeof p.material !== 'string' || p.label.length > 100 || p.material.length > 100) errors.push(`${label} ${i + 1}: use labels and materials under 100 characters.`);
      if (p.grain!==undefined && ![true,false,'none','length','width'].includes(p.grain)) errors.push(`${label} ${i+1}: invalid grain direction.`);
      if (p.bands && (typeof p.bands!=='object'||Array.isArray(p.bands)||Object.entries(p.bands).some(([side,name])=>!['T','B','L','R'].includes(side)||typeof name!=='string'||name.length>100))) errors.push(`${label} ${i+1}: invalid edge banding.`);
      if (key === 'parts' && p.edges && !/^[TBLR]*$/.test(p.edges)) errors.push(`${label} ${i + 1}: edges must use T, B, L, R.`);
    });
    if (project[key].reduce((sum, p) => sum + (p?.enabled===false?0:(p?.qty || 0)), 0) > 5000) errors.push(`Use at most 5,000 total ${key === 'parts' ? 'pieces' : 'sheets'}.`);
  }
  for (const key of ['kerf', 'trim', 'minTrim']) if (key==='minTrim' && project.settings[key]===undefined) continue; else if (!Number.isFinite(project.settings[key]) || project.settings[key] < 0 || project.settings[key] > 1000) errors.push(`${key === 'kerf' ? 'Saw kerf' : key==='minTrim'?'Minimum trim width':'Edge trim'} must be 0–1,000 mm.`);
  if (!unitInfo(project.settings.unit)) errors.push('Choose a supported measurement unit.');
  if(project.settings.priority!==undefined&&!['material','cuts','smallSheets'].includes(project.settings.priority))errors.push('Choose a supported optimization priority.');
  if(project.settings.cutDirection!==undefined&&!['auto','length','width'].includes(project.settings.cutDirection))errors.push('Choose a supported cut direction.');
  if(project.settings.precision!==undefined&&(!Number.isInteger(project.settings.precision)||project.settings.precision<0||project.settings.precision>6))errors.push('Decimal precision must be 0–6.');
  if(project.settings.dimensionOrder!==undefined&&!['lw','wl'].includes(project.settings.dimensionOrder))errors.push('Choose a supported dimension order.');
  for(const key of ['rotation','materials','singleSheet','groupLayouts'])if(project.settings[key]!==undefined&&typeof project.settings[key]!=='boolean')errors.push(`${key} must be true or false.`);
  return errors;
}
function split(f, width, height, kerf, vertical, part, cuts) {
  // Every split is a full guillotine cut through the current free rectangle.
  const right = f.w - width, bottom = f.h - height;
  const free = [];
  const cutV = h => { if (right > EPS) cuts.push({axis:'vertical', x:f.x + width, y:f.y, length:h, partId:part.id,source:{x:f.x,y:f.y,w:f.w,h},outputs:[{w:width,h},...(right>kerf+EPS?[{w:right-kerf,h}]:[])]}); };
  const cutH = w => { if (bottom > EPS) cuts.push({axis:'horizontal', x:f.x, y:f.y + height, length:w, partId:part.id,source:{x:f.x,y:f.y,w,h:f.h},outputs:[{w,h:height},...(bottom>kerf+EPS?[{w,h:bottom-kerf}]:[])]}); };
  if (vertical) {
    cutV(f.h); cutH(width);
    if (right > kerf + EPS) free.push({x:f.x + width + kerf, y:f.y, w:right - kerf, h:f.h});
    if (bottom > kerf + EPS) free.push({x:f.x, y:f.y + height + kerf, w:width, h:bottom - kerf});
  } else {
    cutH(f.w); cutV(height);
    if (bottom > kerf + EPS) free.push({x:f.x, y:f.y + height + kerf, w:f.w, h:bottom - kerf});
    if (right > kerf + EPS) free.push({x:f.x + width + kerf, y:f.y, w:right - kerf, h:height});
  }
  return free;
}
function run(project, sortMode, splitMode, fitMode) {
  const {kerf, trim, rotation, materials, singleSheet} = project.settings;
  const all = project.parts.filter(p=>p.enabled!==false).flatMap((p, color) => Array.from({length:p.qty}, (_, copy) => ({...p, color, copy})));
  const scores = [p => p.length*p.width, p => Math.max(p.length,p.width), p => p.length, p => p.width];
  if (sortMode < 4) {
    all.sort((a,b) => scores[sortMode](b)-scores[sortMode](a) || b.length*b.width-a.length*a.width);
  } else {
    // Seeded permutations escape the same descending-order trap for equal-width boards.
    let seed = sortMode * 7919;
    for (let i=all.length-1; i>0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = Math.floor(seed / 2147483647 * (i+1));
      [all[i],all[j]] = [all[j],all[i]];
    }
  }
  const available = project.stock.filter(p=>p.enabled!==false).map(p => ({...p, remaining:p.qty}));
  const sheets = [], unplaced = [];
  const sameMaterial = (a,b) => !materials || a.material.trim().toLowerCase() === b.material.trim().toLowerCase();
  const options = (p,sheet) => allowedOrientations(project,p,sheet);
  const minimum = project.settings.minTrim||0;
  const trimFits = (w,h,f) => w<=f.w+EPS && h<=f.h+EPS && (!minimum || [f.w-w,f.h-h].every(gap=>gap<=EPS || gap-kerf>=minimum-EPS));
  function candidate(sheet, p) {
    if (!sameMaterial(sheet,p)) return null;
    let best = null;
    sheet.free.forEach((f, fi) => options(p,sheet).forEach(([w,h,rotated]) => {
      if (!trimFits(w,h,f)) return;
      const score = fitMode ? Math.min(f.w-w,f.h-h)*100000 + f.w*f.h-w*h : f.w*f.h-w*h;
      if (!best || score < best.score) best = {f,fi,w,h,rotated,score};
    }));
    return best;
  }
  for (const part of all) {
    let chosen = null;
    sheets.forEach(sheet => { const c = candidate(sheet,part); if(c && (!chosen || c.score < chosen.c.score)) chosen = {sheet,c}; });
    if (!chosen && (!singleSheet || sheets.length === 0)) {
      const candidates = available.filter(s => s.remaining > 0 && sameMaterial(s,part) && options(part,s).some(([w,h]) => trimFits(w,h,{w:s.length-2*trim,h:s.width-2*trim})));
      candidates.sort((a,b) => a.length*a.width-b.length*b.width);
      if (candidates.length) {
        const stock = candidates[0]; stock.remaining--;
        const sheet = {...stock, parts:[], cuts:[], free:[{x:trim,y:trim,w:stock.length-2*trim,h:stock.width-2*trim}]};
        sheets.push(sheet); chosen = {sheet,c:candidate(sheet,part)};
      }
    }
    if (!chosen) {unplaced.push(part); continue;}
    const {sheet,c} = chosen;
    const vertical = project.settings.cutDirection==='width'?true:project.settings.cutDirection==='length'?false:splitMode === 0 ? c.f.w-c.w > c.f.h-c.h : splitMode === 1 ? c.f.w-c.w <= c.f.h-c.h : splitMode === 2;
    sheet.free.splice(c.fi,1,...split(c.f,c.w,c.h,kerf,vertical,part,sheet.cuts));
    sheet.parts.push({...part,x:c.f.x,y:c.f.y,w:c.w,h:c.h,rotated:c.rotated});
  }
  const usedArea = sheets.reduce((sum,s) => sum+s.parts.reduce((a,p) => a+p.w*p.h,0),0);
  const stockArea = sheets.reduce((sum,s) => sum+s.length*s.width,0);
  const cutLength = sheets.reduce((sum,s) => sum+s.cuts.reduce((a,c) => a+c.length,0),0);
  return {sheets,unplaced,usedArea,stockArea,cutLength,utilization:stockArea ? usedArea/stockArea*100 : 0,cutCount:sheets.reduce((sum,s)=>sum+s.cuts.length,0)};
}
export function optimize(project, onProgress = () => {}) {
  const errors = validate(project);
  if (errors.length) throw new Error(errors.join('\n'));
  let best, completed = 0;
  const total = searchStrategyCount(project);
  const consider = result => {
    const rank = r => [r.unplaced.length, project.settings.priority === 'cuts' ? r.cutCount : project.settings.priority==='smallSheets'?r.stockArea/Math.max(1,r.sheets.length):r.stockArea, project.settings.priority === 'cuts' ? r.stockArea : r.cutCount, r.cutLength];
    const a = rank(result), b = best && rank(best);
    if (!best || a.some((n,i) => n < b[i] && a.slice(0,i).every((v,j) => v === b[j]))) best = result;
    completed++;
    onProgress({completed,total,phase:completed<=32?'Comparing cut directions':completed<=80?'Exploring part orders':'Refining the best layout',best:{sheets:best.sheets.length,unplaced:best.unplaced.length,utilization:best.utilization,cutCount:best.cutCount}},best);
  };
  onProgress({completed:0,total,phase:'Preparing your pieces',best:null});
  for(let order=0;order<4;order++) for(let split=0;split<4;split++) for(let fit=0;fit<2;fit++) consider(run(project,order,split,fit));
  for(let seed=4;seed<52;seed++) consider(run(project,seed,seed%4,seed%2));
  // Keep all original strategies, then explore additional orders with every split/fit combination.
  for(let seed=52;seed<106;seed++) for(let split=0;split<4;split++) for(let fit=0;fit<2;fit++) if(completed<total)consider(run(project,seed,split,fit));
  return best;
}
export function parseDimension(value,unit='mm'){return parseMeasurement(value,unit);}
export function searchStrategyCount(project){const count=project.parts.reduce((n,p)=>n+(p.enabled===false?0:p.qty||0),0);return count>2500?80:count>1000?128:512;}
export function allowedOrientations(project,part,stock){
 const grain=part.grain===true?'length':part.grain===false||!part.grain?'none':part.grain;
 const stockGrain=stock.grain===false?'none':stock.grain===true?'length':stock.grain||'length';
 const candidates=[[part.length,part.width,false]];
 if(project.settings.rotation)candidates.push([part.width,part.length,true]);
 return candidates.filter(([, ,rotated])=>grain==='none'||stockGrain==='none'||(rotated?(grain==='length'?'width':'length'):grain)===stockGrain);
}

export function diagnoseFit(project, part) {
  const {trim,rotation,materials,unit} = project.settings;
  const fmt = n => `${formatMeasurement(n,unit,4)} ${unitInfo(unit).label}`;
  const normalized = s => s.trim().toLowerCase();
  const activeStock=project.stock.filter(s=>s.enabled!==false);
  const matching = activeStock.filter(s => !materials || normalized(s.material)===normalized(part.material));
  const issues = [];
  if (!matching.length) issues.push({code:'material',message:`No stock matches material “${part.material || '(blank)'}”. Available stock materials: ${[...new Set(project.stock.map(s=>s.material||'(blank)'))].join(', ')}. Correct Stock materials or turn off Match materials.`});
  const stock = matching.length ? matching : activeStock;
  const fits = (s,margin,ignoreGrain=false) => (ignoreGrain?[[part.length,part.width],[part.width,part.length]]:allowedOrientations(project,part,s)).some(([w,h])=>w<=s.length-2*margin+EPS&&h<=s.width-2*margin+EPS);
  if(stock.some(s=>fits(s,trim))){
   const minimum=project.settings.minTrim||0;
   if(minimum&&!stock.some(s=>allowedOrientations(project,part,s).some(([w,h])=>[s.length-2*trim-w,s.width-2*trim-h].every(gap=>gap>=-EPS&&(gap<=EPS||gap-project.settings.kerf>=minimum-EPS)))))issues.push({code:'minTrim',message:'This part leaves a trim strip narrower than the minimum trim width. Reduce that setting or use different stock.'});
   return issues;
  }
  const beforeTrim = stock.find(s=>fits(s,0));
  if (trim>0 && beforeTrim) issues.push({code:'trim',message:`Edge trim of ${fmt(trim)} on all four edges leaves ${fmt(Math.max(0,beforeTrim.length-2*trim))} × ${fmt(Math.max(0,beforeTrim.width-2*trim))} usable on “${beforeTrim.label}”. The part fits before trimming, but not after. Reduce trim or use larger stock.`});
  else if (stock.some(s=>fits(s,trim,true))) issues.push({code:'grain',message:'This part fits only when rotated. Check part/stock grain directions and Allow part rotation.'});
  else issues.push({code:'size',message:'This part is larger than the usable stock in either allowed orientation. Check its dimensions or add larger stock.'});
  return issues;
}
