const EPS = 1e-7;
export function validate(project) {
  const errors = [];
  if (!project || !Array.isArray(project.parts) || !Array.isArray(project.stock) || !project.settings) return ['Invalid project file.'];
  for (const [key, label] of [['parts', 'Part'], ['stock', 'Stock']]) {
    if (!project[key].length) errors.push(`Add at least one ${label.toLowerCase()} row.`);
    if (project[key].length > 200) errors.push(`Use at most 200 ${label.toLowerCase()} rows.`);
    const ids = new Set();
    project[key].forEach((p, i) => {
      if (typeof p.id !== 'string' || ids.has(p.id)) errors.push(`${label} ${i + 1}: invalid or duplicate ID.`);
      ids.add(p.id);
      for (const dim of ['length', 'width']) if (!Number.isFinite(p[dim]) || p[dim] <= 0 || p[dim] > 100000) errors.push(`${label} ${i + 1}: ${dim} must be greater than 0 and at most 100,000 mm.`);
      if (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > 500) errors.push(`${label} ${i + 1}: quantity must be 1–500.`);
      if (typeof p.label !== 'string' || typeof p.material !== 'string' || p.label.length > 100 || p.material.length > 100) errors.push(`${label} ${i + 1}: use labels and materials under 100 characters.`);
      if (key === 'parts' && p.edges && !/^[TBLR]*$/.test(p.edges)) errors.push(`${label} ${i + 1}: edges must use T, B, L, R.`);
    });
    if (project[key].reduce((sum, p) => sum + p.qty, 0) > 500) errors.push(`Use at most 500 total ${key === 'parts' ? 'pieces' : 'sheets'}.`);
  }
  for (const key of ['kerf', 'trim']) if (!Number.isFinite(project.settings[key]) || project.settings[key] < 0 || project.settings[key] > 1000) errors.push(`${key === 'kerf' ? 'Saw kerf' : 'Edge trim'} must be 0–1,000 mm.`);
  if (!['mm', 'in'].includes(project.settings.unit)) errors.push('Choose millimeters or inches.');
  return errors;
}
function split(f, width, height, kerf, vertical, part, cuts) {
  // Every split is a full guillotine cut through the current free rectangle.
  const right = f.w - width, bottom = f.h - height;
  const free = [];
  const cutV = h => { if (right > EPS) cuts.push({axis:'vertical', x:f.x + width, y:f.y, length:h, partId:part.id}); };
  const cutH = w => { if (bottom > EPS) cuts.push({axis:'horizontal', x:f.x, y:f.y + height, length:w, partId:part.id}); };
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
  const all = project.parts.flatMap((p, color) => Array.from({length:p.qty}, (_, copy) => ({...p, color, copy})));
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
  const available = project.stock.map(p => ({...p, remaining:p.qty}));
  const sheets = [], unplaced = [];
  const sameMaterial = (a,b) => !materials || a.material.trim().toLowerCase() === b.material.trim().toLowerCase();
  const options = p => rotation && !p.grain && p.length !== p.width ? [[p.length,p.width,false],[p.width,p.length,true]] : [[p.length,p.width,false]];
  function candidate(sheet, p) {
    if (!sameMaterial(sheet,p)) return null;
    let best = null;
    sheet.free.forEach((f, fi) => options(p).forEach(([w,h,rotated]) => {
      if (w > f.w + EPS || h > f.h + EPS) return;
      const score = fitMode ? Math.min(f.w-w,f.h-h)*100000 + f.w*f.h-w*h : f.w*f.h-w*h;
      if (!best || score < best.score) best = {f,fi,w,h,rotated,score};
    }));
    return best;
  }
  for (const part of all) {
    let chosen = null;
    sheets.forEach(sheet => { const c = candidate(sheet,part); if(c && (!chosen || c.score < chosen.c.score)) chosen = {sheet,c}; });
    if (!chosen && (!singleSheet || sheets.length === 0)) {
      const candidates = available.filter(s => s.remaining > 0 && sameMaterial(s,part) && options(part).some(([w,h]) => w <= s.length-2*trim+EPS && h <= s.width-2*trim+EPS));
      candidates.sort((a,b) => a.length*a.width-b.length*b.width);
      if (candidates.length) {
        const stock = candidates[0]; stock.remaining--;
        const sheet = {...stock, parts:[], cuts:[], free:[{x:trim,y:trim,w:stock.length-2*trim,h:stock.width-2*trim}]};
        sheets.push(sheet); chosen = {sheet,c:candidate(sheet,part)};
      }
    }
    if (!chosen) {unplaced.push(part); continue;}
    const {sheet,c} = chosen;
    const vertical = splitMode === 0 ? c.f.w-c.w > c.f.h-c.h : splitMode === 1 ? c.f.w-c.w <= c.f.h-c.h : splitMode === 2;
    sheet.free.splice(c.fi,1,...split(c.f,c.w,c.h,kerf,vertical,part,sheet.cuts));
    sheet.parts.push({...part,x:c.f.x,y:c.f.y,w:c.w,h:c.h,rotated:c.rotated});
  }
  const usedArea = sheets.reduce((sum,s) => sum+s.parts.reduce((a,p) => a+p.w*p.h,0),0);
  const stockArea = sheets.reduce((sum,s) => sum+s.length*s.width,0);
  const cutLength = sheets.reduce((sum,s) => sum+s.cuts.reduce((a,c) => a+c.length,0),0);
  return {sheets,unplaced,usedArea,stockArea,cutLength,utilization:stockArea ? usedArea/stockArea*100 : 0,cutCount:sheets.reduce((sum,s)=>sum+s.cuts.length,0)};
}
export function optimize(project) {
  const errors = validate(project);
  if (errors.length) throw new Error(errors.join('\n'));
  let best;
  const consider = result => {
    const rank = r => [r.unplaced.length, project.settings.priority === 'cuts' ? r.cutCount : r.stockArea, project.settings.priority === 'cuts' ? r.stockArea : r.cutCount, r.cutLength];
    const a = rank(result), b = best && rank(best);
    if (!best || a.some((n,i) => n < b[i] && a.slice(0,i).every((v,j) => v === b[j]))) best = result;
  };
  for(let order=0;order<4;order++) for(let split=0;split<4;split++) for(let fit=0;fit<2;fit++) consider(run(project,order,split,fit));
  for(let seed=4;seed<52;seed++) consider(run(project,seed,seed%4,seed%2));
  return best;
}
export function parseDimension(value, unit='mm') {
  const text = String(value).trim();
  const match = text.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  const n = match ? Number(match[1] || 0) + Number(match[2])/Number(match[3]) : /^\d*\.?\d+$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(n) ? n*(unit === 'in' ? 25.4 : 1) : NaN;
}

export function diagnoseFit(project, part) {
  const {trim,rotation,materials,unit} = project.settings;
  const fmt = n => `${Number((n/(unit==='in'?25.4:1)).toFixed(unit==='in'?4:3))} ${unit}`;
  const normalized = s => s.trim().toLowerCase();
  const matching = project.stock.filter(s => !materials || normalized(s.material)===normalized(part.material));
  const issues = [];
  if (!matching.length) issues.push({code:'material',message:`No stock matches material “${part.material || '(blank)'}”. Available stock materials: ${[...new Set(project.stock.map(s=>s.material||'(blank)'))].join(', ')}. Correct Stock materials or turn off Match materials.`});
  const stock = matching.length ? matching : project.stock;
  const fits = (s,margin,canRotate) => (part.length<=s.length-2*margin+EPS && part.width<=s.width-2*margin+EPS) || (canRotate && part.width<=s.length-2*margin+EPS && part.length<=s.width-2*margin+EPS);
  const canRotate = rotation && !part.grain;
  if (stock.some(s=>fits(s,trim,canRotate))) return issues;
  const beforeTrim = stock.find(s=>fits(s,0,canRotate));
  if (trim>0 && beforeTrim) issues.push({code:'trim',message:`Edge trim of ${fmt(trim)} on all four edges leaves ${fmt(Math.max(0,beforeTrim.length-2*trim))} × ${fmt(Math.max(0,beforeTrim.width-2*trim))} usable on “${beforeTrim.label}”. The part fits before trimming, but not after. Reduce trim or use larger stock.`});
  else if (!canRotate && stock.some(s=>fits(s,trim,true))) issues.push({code:'grain',message:'This part fits only when rotated. Check its grain lock and Allow part rotation.'});
  else issues.push({code:'size',message:'This part is larger than the usable stock in either allowed orientation. Check its dimensions or add larger stock.'});
  return issues;
}
