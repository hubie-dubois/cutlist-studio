import {emptyProject, sampleProject, restoreProject} from './project.mjs';
import {parseCSV} from './csv.mjs';
import {validate, parseDimension, diagnoseFit} from './optimizer.mjs';
const $ = id => document.getElementById(id);
const icons = {folder:'M3 7h6l2-3h6a2 2 0 0 1 2 2v12H3z',save:'M5 3h12l3 3v15H4V3z M8 3v6h8V3 M8 21v-8h8v8',edit:'m4 16 11-11 4 4-11 11H4z M13 7l4 4',parts:'M3 3h18v18H3z M3 13h18 M13 3v10 M9 13v8',layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',upload:'M12 16V3 m-4 4 4-4 4 4 M4 15v5h16v-5',download:'M12 3v13 m-4-4 4 4 4-4 M4 16v5h16v-5',plus:'M12 5v14 M5 12h14',sliders:'M4 6h7 m5 0h4 M4 12h3 m5 0h8 M4 18h10 m5 0h1 M11 3v6 M7 9v6 M14 15v6',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',sparkles:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z M20 2v4 M18 4h4',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6',chevron:'m7 10 5 5 5-5',bulb:'M8 17c0-4-3-4-3-8a7 7 0 0 1 14 0c0 4-3 4-3 8 M8 18h8 M9 22h6',chart:'M4 20V10 M10 20V4 M16 20v-8 M22 20V6',check:'m4 12 5 5L20 6',scissors:'m9 9 11 11 M9 15 20 4 M10 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M10 18a4 4 0 1 1-8 0 4 4 0 0 1 8 0'};
function icon(name) {return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.parts}"/></svg>`;}
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));
const palette=[['#d8e6f7','#6787b4'],['#e4def3','#9180b6'],['#f4e3cd','#b79b72'],['#dcebe1','#789c87'],['#f3dde2','#b0808c'],['#dcebed','#7da0a7'],['#e9e6d7','#a39a75'],['#e1e1ed','#9090b4']];
const uid=()=>crypto.randomUUID();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='cutlist-studio-v1';
let library=[],project=emptyProject(),result=null,resultProject=null,sheetIndex=0,view='layout',selected=null,worker=null,revision=0,dirty=false,toastTimer,clearedProject=null,startedAt=0;
try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved){library=Array.isArray(saved.library)?saved.library.filter(p=>!validate(p).length):[];project=restoreProject(saved);}}catch{ /* A blocked or invalid store must not prevent editing. */ }
function display(n){if(n===null||!Number.isFinite(n))return '';return Number((n/(project.settings.unit==='in'?25.4:1)).toFixed(project.settings.unit==='in'?4:3)).toString();}
const dimension=n=>`${display(n)} ${project.settings.unit}`;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({current:project,library,blankStart:true}));$('saved-status').innerHTML='<span class="status-dot"></span> Saved on this device';return true;}catch{$('saved-status').textContent='Browser storage unavailable · export a backup';return false;}}
function changed(){revision++;dirty=true;$('search-progress').hidden=true;if(worker){worker.terminate();worker=null;setBusy(false);}persist();renderDiagnostics();if(result)feedback('Your inputs changed. Optimize again to update this plan.');}
function feedback(message,error=false){$('feedback').hidden=!message;$('feedback').className='feedback'+(error?' error':'');$('feedback').textContent=message;}
function renderDiagnostics() {
 const errors=project.parts.length||project.stock.length?validate(project):[];
 const issues=errors.length ? errors : [...new Set(project.parts.flatMap(p=>diagnoseFit(project,p).map(i=>i.message)))];
 $('input-feedback').hidden=!issues.length;
 $('input-feedback').innerHTML=issues.length?`<strong>Check these settings</strong><ul>${issues.map(message=>`<li>${esc(message)}</li>`).join('')}</ul>`:'';
}
function row(p,i,type){return `<tr data-id="${esc(p.id)}" data-type="${type}"><td><div class="row-name">${type==='parts'?`<span class="color-dot" style="background:${palette[i%palette.length][1]}"></span>`:''}<input class="name-input" data-field="label" aria-label="${type==='parts'?'Part':'Stock'} ${i+1} name" maxlength="100" placeholder="${type==='parts'?'Part name':'Stock name'}" value="${esc(p.label)}"></div></td><td><input data-field="length" inputmode="decimal" aria-label="${type==='parts'?'Part':'Stock'} ${i+1} length" placeholder="—" value="${display(p.length)}"></td><td><input data-field="width" inputmode="decimal" aria-label="${type==='parts'?'Part':'Stock'} ${i+1} width" placeholder="—" value="${display(p.width)}"></td><td><input data-field="qty" type="number" min="1" max="500" step="1" aria-label="${type==='parts'?'Part':'Stock'} ${i+1} quantity" value="${p.qty}"></td><td><button class="delete-row" data-delete aria-label="Remove ${esc(p.label||(type==='parts'?'part ':'stock ')+(i+1))}">×</button></td></tr>`;}
function renderDetails(){
 $('part-details').innerHTML=project.parts.map((p,i)=>`<div class="detail-row" data-type="parts" data-id="${esc(p.id)}"><span title="${esc(p.label)}">${esc(p.label||'Part '+(i+1))}</span><input type="text" data-field="material" maxlength="100" aria-label="${esc(p.label)} material" value="${esc(p.material)}"><label><input type="checkbox" data-field="grain" ${p.grain?'checked':''}> Lock grain</label><label>Band <select data-field="edges" aria-label="${esc(p.label)} edge banding"><option value="" ${!p.edges?'selected':''}>None</option><option value="T" ${p.edges==='T'?'selected':''}>Top</option><option value="TB" ${p.edges==='TB'?'selected':''}>Top + bottom</option><option value="LR" ${p.edges==='LR'?'selected':''}>Left + right</option><option value="TBLR" ${p.edges==='TBLR'?'selected':''}>All edges</option>${p.edges&&!['T','TB','LR','TBLR'].includes(p.edges)?`<option selected value="${esc(p.edges)}">${esc(p.edges)}</option>`:''}</select></label></div>`).join('');
 $('stock-details').innerHTML=project.stock.map(p=>`<div class="detail-row" data-type="stock" data-id="${esc(p.id)}"><span>${esc(p.label)}</span><input type="text" data-field="material" maxlength="100" aria-label="${esc(p.label)} stock material" value="${esc(p.material)}"></div>`).join('');
}
function renderInputs(){
 $('project-name').value=project.name;
 $('parts-body').innerHTML=project.parts.map((p,i)=>row(p,i,'parts')).join('')||'<tr><td colspan="5" class="empty-table">No parts yet. Add your first piece below.</td></tr>';
 $('stock-body').innerHTML=project.stock.map((p,i)=>row(p,i,'stock')).join('')||'<tr><td colspan="5" class="empty-table">Add the stock you have on hand.</td></tr>';
 $('part-summary').textContent=`${project.parts.reduce((s,p)=>s+(p.qty||0),0)} pieces · ${project.parts.length} unique parts`;
 document.querySelectorAll('.unit-text').forEach(el=>el.textContent=project.settings.unit);
 for(const key of ['unit','priority']) $(key).value=project.settings[key];
 for(const key of ['kerf','trim']) $(key).value=display(project.settings[key]);
 for(const key of ['rotation','materials','singleSheet']) $(key).checked=!!project.settings[key];
 renderDetails();
 renderDiagnostics();
}
function svgSheet(sheet, labels=true, interactive=true, prefix='plan') {
 const pad=Math.max(sheet.length,sheet.width)*.065, font=sheet.length*.013, t=resultProject?.settings.trim||0;
 const defs=`<defs><pattern id="${prefix}-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#f6f7f9"/><path d="M0 0v14" stroke="#e0e4ea" stroke-width="3"/></pattern></defs>`;
 const pieces=sheet.parts.map((p,i)=>{const [fill,stroke]=palette[p.color%palette.length], fs=Math.min(font,Math.min(p.w,p.h)*.15);const edges=p.rotated?String(p.edges||'').replace(/[TBLR]/g,c=>({T:'R',R:'B',B:'L',L:'T'}[c])):p.edges||'';return `<g class="piece ${selected===p.id?'selected':''}" ${interactive?`data-piece="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.label)}, ${display(p.length)} by ${display(p.width)}, ${p.rotated?'rotated':'not rotated'}"`:''}><title>${esc(p.label)} · ${display(p.length)} × ${display(p.width)} ${project.settings.unit}${p.grain?' · Grain locked':''}${p.edges?' · Banding: '+esc(p.edges):''}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${fill}" stroke="${stroke}" stroke-opacity=".55" stroke-width="1.5"/>${edges.includes('T')?`<path d="M${p.x} ${p.y}h${p.w}" stroke="${stroke}" stroke-width="9"/>`:''}${edges.includes('B')?`<path d="M${p.x} ${p.y+p.h}h${p.w}" stroke="${stroke}" stroke-width="9"/>`:''}${edges.includes('L')?`<path d="M${p.x} ${p.y}v${p.h}" stroke="${stroke}" stroke-width="9"/>`:''}${edges.includes('R')?`<path d="M${p.x+p.w} ${p.y}v${p.h}" stroke="${stroke}" stroke-width="9"/>`:''}${labels?`<text x="${p.x+p.w/2}" y="${p.y+p.h/2-fs*.25}" fill="#4e5665" text-anchor="middle" font-size="${fs}" font-weight="550">${esc(p.label.length>22?p.label.slice(0,20)+'…':p.label)}</text><text x="${p.x+p.w/2}" y="${p.y+p.h/2+fs*1.25}" fill="#5c6472" text-anchor="middle" font-size="${fs*.8}">${display(p.w)} × ${display(p.h)}${p.rotated?' ↻':''}</text>`:''}${p.grain?`<text x="${p.x+p.w/2}" y="${p.y+p.h*.23}" font-size="${fs}" text-anchor="middle" fill="${stroke}">↔</text>`:''}</g>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" class="sheet-svg" viewBox="${-pad} ${-pad} ${sheet.length+2*pad} ${sheet.width+2*pad}" role="img" aria-label="Cutting layout for ${esc(sheet.label)}">${defs}<style>text{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}</style><rect width="${sheet.length}" height="${sheet.width}" fill="url(#${prefix}-hatch)" stroke="#bdc5d1" stroke-width="3"/>${t?`<rect x="${t}" y="${t}" width="${sheet.length-2*t}" height="${sheet.width-2*t}" fill="none" stroke="#bfc7d2" stroke-width="2" stroke-dasharray="8 8"/>`:''}${pieces}<g fill="none" stroke="#bbc4d0" stroke-width="2"><path d="M0 ${-pad*.45}H${sheet.length} M0 ${-pad*.6}v${pad*.3} M${sheet.length} ${-pad*.6}v${pad*.3}"/><path d="M${-pad*.45} 0V${sheet.width} M${-pad*.6} 0h${pad*.3} M${-pad*.6} ${sheet.width}h${pad*.3}"/></g><text x="${sheet.length/2}" y="${-pad*.57}" fill="#8b96a6" text-anchor="middle" font-size="${font*.85}">${display(sheet.length)} ${project.settings.unit}</text><text transform="translate(${-pad*.6} ${sheet.width/2}) rotate(-90)" fill="#8b96a6" text-anchor="middle" font-size="${font*.85}">${display(sheet.width)} ${project.settings.unit}</text></svg>`;
}
function renderResult(){
 const r=result;
 $('metrics').innerHTML=`<div class="metric"><div class="metric-label">${icon('layers')} Sheets used</div><div class="metric-number">${r?r.sheets.length:'—'}<small>${r?'of '+(resultProject||project).stock.reduce((s,p)=>s+p.qty,0)+' available':''}</small></div></div><div class="metric green"><div class="metric-label">${icon('chart')} Material used</div><div class="metric-number">${r?r.utilization.toFixed(1)+'%':'—'}</div></div><div class="metric"><div class="metric-label">${icon('scissors')} Total cuts</div><div class="metric-number">${r?r.cutCount:'—'}<small>excl. trim</small></div></div>`;
 $('sheet-tabs').innerHTML=r?r.sheets.map((s,i)=>`<button class="sheet-tab ${i===sheetIndex?'active':''}" data-sheet="${i}" aria-pressed="${i===sheetIndex}">Sheet ${String(i+1).padStart(2,'0')} <span>${s.parts.length} pieces</span></button>`).join(''):'';
 $('layout-tab').classList.toggle('active',view==='layout');$('cuts-tab').classList.toggle('active',view==='cuts');$('layout-tab').setAttribute('aria-pressed',view==='layout');$('cuts-tab').setAttribute('aria-pressed',view==='cuts');
 $('kerf-value').textContent=dimension(resultProject?.settings.kerf??project.settings.kerf);
 const sheet=r?.sheets[sheetIndex];
 if(!sheet){$('plan-content').innerHTML=`<div class="empty-state">${icon('parts')}<br><strong>${r?'No pieces fit the available stock.':'Your next project, beautifully planned.'}</strong><br>${r?'Check sheet sizes, materials, and grain settings.':'Add your parts and stock, then optimize your layout.'}</div>`;}
 else if(view==='layout'){
  const area=sheet.parts.reduce((s,p)=>s+p.w*p.h,0);
  $('plan-content').innerHTML=`<div class="sheet-meta"><strong>${esc(sheet.label)}${sheet.material&&sheet.material!==sheet.label?` <span>· ${esc(sheet.material)}</span>`:''}</strong><span>${(area/(sheet.length*sheet.width)*100).toFixed(1)}% used</span></div><div class="drawing">${svgSheet(sheet,$('labels').checked)}</div>${sheet.parts.every(p=>Math.abs(p.h-sheet.width)<1e-7&&Math.abs(p.y)<1e-7)?`<div class="board-pieces"><p>Pieces from left to right</p><ol>${[...sheet.parts].sort((a,b)=>a.x-b.x).map(p=>`<li><strong>${esc(p.label)}</strong><span>${dimension(p.w)}</span></li>`).join('')}</ol></div>`:''}`;
 }else{$('plan-content').innerHTML=`<div class="cut-note">Cut in this order after trimming ${dimension(resultProject.settings.trim)} from each edge. X / Y are measured from the original sheet’s top-left corner, at the start of the blade kerf.</div><div class="cuts-wrap"><table class="cut-table"><thead><tr><th>#</th><th>Direction</th><th>Start X / Y</th><th>Cut length</th></tr></thead><tbody>${sheet.cuts.map((c,i)=>`<tr><td>${i+1}</td><td>${c.axis==='vertical'?'↓ Vertical':'→ Horizontal'}</td><td>${display(c.x)} / ${display(c.y)}</td><td>${dimension(c.length)}</td></tr>`).join('')}</tbody></table></div>`;}
 const total=(resultProject||project).parts.reduce((s,p)=>s+p.qty,0),fitted=r?r.sheets.reduce((s,sh)=>s+sh.parts.length,0):0;
 $('complete-badge').textContent=r?(r.unplaced.length?`${r.unplaced.length} unplaced`:'✓ All parts placed'):'Ready when you are';
 $('breakdown-caption').textContent=r?`${fitted} of ${total} pieces placed · ${((r.stockArea-r.usedArea)/(project.settings.unit==='in'?645.16:1e6)).toFixed(2)} ${project.settings.unit==='in'?'in²':'m²'} unused, including kerf & trim`:'A clear view of what goes where.';
 $('piece-legend').innerHTML=(resultProject||project).parts.map((p,i)=>`<div class="legend-item"><span class="color-dot" style="background:${palette[i%palette.length][0]};border:1px solid ${palette[i%palette.length][1]}55"></span><span class="legend-label">${esc(p.label)}</span><small>× ${p.qty}</small></div>`).join('');
 const missing=new Map();r?.unplaced.forEach(p=>{const entry=missing.get(p.id)||{...p,count:0};entry.count++;missing.set(p.id,entry);});
 $('unplaced').innerHTML=missing.size?`<section class="unplaced-card"><h3>${r.unplaced.length} ${r.unplaced.length===1?'piece could':'pieces could'} not be placed</h3><ul>${[...missing.values()].map(p=>`<li>${esc(p.label)} · ${display(p.length)} × ${display(p.width)} · quantity ${p.count}<br>${esc(diagnoseFit(resultProject,p).map(i=>i.message).join(' ') || (resultProject.settings.singleSheet?'The one-sheet limit or remaining space prevents this piece from fitting.':'No remaining space fits this piece with the current kerf and stock quantities. Add stock or review the cut settings.'))}</li>`).join('')}</ul></section>`:'';
}
function setBusy(busy){
 $('optimize-label').textContent=busy?'Cancel optimization':'Optimize layout';
 $('optimize').setAttribute('aria-busy',String(busy));
 $('search-progress').classList.toggle('is-searching',busy);
 if(!busy)$('search-progress').hidden=true;
}
function renderProgress(progress){
 const {completed,total,phase,best}=progress;
 $('search-progress').hidden=false;
 $('search-title').textContent=phase;
 $('search-count').textContent=`${completed} / ${total} strategies`;
 $('search-bar').max=total;$('search-bar').value=completed;
 $('search-percent').textContent=`${Math.floor(completed/total*100)}%`;
 $('search-best').textContent=best?`${best.sheets} ${best.sheets===1?'sheet':'sheets'} · ${best.utilization.toFixed(1)}% used · ${best.cutCount} cuts · ${best.unplaced} unplaced`:'Comparing part orders, rotations, and cut directions.';
}
function calculate(trigger){
 if(document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
 if(worker){worker.terminate();worker=null;setBusy(false);toast('Optimization canceled.');return;}
 const errors=validate(project);if(errors.length){feedback(errors.join(' '),true);return;}
 setBusy(true);feedback('');startedAt=performance.now();
 renderProgress({completed:0,total:512,phase:'Preparing your pieces',best:null});
 const version=revision;const snapshot=structuredClone(project);
 let activeWorker;
 const fail=()=>{if(activeWorker&&worker!==activeWorker)return;activeWorker?.terminate();worker=null;setBusy(false);feedback('The optimizer could not run. Reload the page and try again.',true);};
 try{activeWorker=new Worker('./worker.mjs',{type:'module'});worker=activeWorker;}catch{fail();return;}
 activeWorker.onmessage=({data})=>{
  if(worker!==activeWorker||version!==revision)return;
  if(data.progress){renderProgress(data.progress);return;}
  activeWorker.terminate();worker=null;setBusy(false);
  if(data.error){feedback(data.error,true);return;}
  result=data.result;resultProject=snapshot;sheetIndex=0;selected=null;dirty=false;renderResult();persist();
  $('search-progress').hidden=false;
  $('search-title').textContent='Best layout ready';
  $('search-count').textContent=`512 strategies compared in ${((performance.now()-startedAt)/1000).toFixed(1)}s`;
  if(trigger)toast(result.unplaced.length?`${result.unplaced.length} pieces could not be placed. See the settings warnings.`:`Placed all ${result.sheets.reduce((n,s)=>n+s.parts.length,0)} pieces on ${result.sheets.length} stock ${result.sheets.length===1?'piece':'pieces'}.`);
 };
 activeWorker.onerror=fail;activeWorker.onmessageerror=fail;
 try{activeWorker.postMessage(snapshot);}catch{fail();}
}
function replaceProject(next){$('clear-notice').hidden=true;$('search-progress').hidden=true;if(worker){worker.terminate();worker=null;setBusy(false);}project=next;revision++;result=null;resultProject=null;dirty=false;sheetIndex=0;selected=null;renderInputs();renderResult();feedback('');persist();}
function archiveCurrent(){if(!validate(project).length){const found=library.findIndex(p=>p.id===project.id);const saved={...structuredClone(project),updated:new Date().toISOString()};if(found<0)library.unshift(saved);else library[found]=saved;}}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const fileName=()=>project.name.replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'cutlist-project';
function csvCell(s){const v=String(s);return '"'+(/^[=+\-@\t\r]/.test(v)?"'":'')+v.replaceAll('"','""')+'"';}
function exportFile(kind){
 $('export-menu').hidden=true;
 if(kind==='json'){if(validate(project).length){toast('Fix invalid inputs before exporting a project.');return;}download(JSON.stringify(project,null,2),fileName()+'.json','application/json');return;}
 if(kind==='csv'){download(['label,length,width,qty,material,grain,edges,unit',...project.parts.map(p=>[p.label,display(p.length),display(p.width),p.qty,p.material,p.grain,p.edges,project.settings.unit].map(csvCell).join(','))].join('\r\n'),fileName()+'.csv','text/csv');return;}
 if(!result?.sheets.length||dirty){toast('Optimize your current inputs before exporting a cutting plan.');return;}
 if(kind==='svg'){download(svgSheet(result.sheets[sheetIndex],true,false,'export'),fileName()+`-sheet-${sheetIndex+1}.svg`,'image/svg+xml');return;}
 if(kind==='print'){
 $('print-content').innerHTML=result.sheets.map((s,i)=>`<section class="print-sheet"><h1>${esc(project.name)} · Sheet ${i+1} / ${result.sheets.length}</h1><p>${esc(s.label)} · ${dimension(s.length)} × ${dimension(s.width)} · Kerf ${dimension(project.settings.kerf)} · Trim ${dimension(project.settings.trim)} per edge · ${s.parts.length} pieces</p>${svgSheet(s,true,false,'print'+i)}<p>Verify all dimensions and grain before cutting. Dimensions are in ${project.settings.unit}. Trim first; cutting coordinates use the original sheet origin.</p></section><section class="print-sheet"><h1>Sheet ${i+1} · Cut sequence</h1><table><thead><tr><th>Step</th><th>Direction</th><th>X</th><th>Y</th><th>Length</th></tr></thead><tbody>${s.cuts.map((c,n)=>`<tr><td>${n+1}</td><td>${c.axis}</td><td>${display(c.x)}</td><td>${display(c.y)}</td><td>${display(c.length)}</td></tr>`).join('')}</tbody></table></section>`).join('')+(result.unplaced.length?`<section class="print-sheet"><h1>Unplaced pieces</h1><p>These pieces were not included in the cutting plan.</p><ul>${result.unplaced.map(p=>`<li>${esc(p.label)} · ${dimension(p.length)} × ${dimension(p.width)}</li>`).join('')}</ul></section>`:'');window.print();
 }
}
async function importCSV(file){
 if(!file)return;if(file.size>1000000){toast('Choose a CSV smaller than 1 MB.');return;}
 try{const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));const head=rows.shift()?.map(s=>s.trim().toLowerCase());if(!head||!['length','width','qty'].every(k=>head.includes(k)))throw new Error('CSV needs length, width, and qty headers. Optional: label, material, grain, edges, unit.');
 const parts=rows.map((r,i)=>{const get=k=>r[head.indexOf(k)]?.trim()||'';const unit=get('unit')||project.settings.unit;if(!['mm','in'].includes(unit))throw new Error(`Row ${i+2}: unit must be mm or in.`);return {id:uid(),label:get('label')||`Part ${i+1}`,length:parseDimension(get('length'),unit),width:parseDimension(get('width'),unit),qty:Number(get('qty')),material:get('material')||project.stock[0]?.material||'',grain:['true','1','yes'].includes(get('grain').toLowerCase()),edges:get('edges').toUpperCase()};});
 const candidate={...project,parts:[...project.parts,...parts]};const errors=validate(candidate,{draft:true});if(errors.length)throw new Error(errors[0]);project=candidate;changed();renderInputs();toast(`Added ${parts.length} part rows from CSV.`);
 }catch(error){feedback(error.message,true);}finally{$('csv-file').value='';}
}
function showProjects(){archiveCurrent();persist();$('project-list').innerHTML=library.length?library.map(p=>`<div class="project-entry"><button class="project-open" data-project="${esc(p.id)}">${esc(p.name||'Untitled project')}<small>${p.parts.reduce((s,r)=>s+r.qty,0)} pieces · ${new Date(p.updated||Date.now()).toLocaleDateString()}</small></button><button class="icon-button" data-remove-project="${esc(p.id)}" aria-label="Remove saved ${esc(p.name)}">×</button></div>`).join(''):'<p class="helper">Save a project to keep it here.</p>';$('projects-dialog').showModal();}
// Delegate row edits so all dynamically added inputs have the same validation path.
document.querySelector('.inputs-column').addEventListener('change',event=>{
 const target=event.target,field=target.dataset.field;if(!field)return;const parent=target.closest('[data-type]');const p=project[parent.dataset.type].find(p=>p.id===parent.dataset.id);
 if(['length','width'].includes(field))p[field]=target.value.trim()?parseDimension(target.value,project.settings.unit):null;else if(field==='qty')p[field]=Number(target.value);else if(field==='grain')p[field]=target.checked;else p[field]=target.value;
 changed();if(field==='label')renderDetails();$('part-summary').textContent=`${project.parts.reduce((s,p)=>s+(p.qty||0),0)} pieces · ${project.parts.length} unique parts`;
});
document.querySelector('.inputs-column').addEventListener('click',event=>{const btn=event.target.closest('[data-delete]');if(!btn)return;const parent=btn.closest('[data-type]');project[parent.dataset.type]=project[parent.dataset.type].filter(p=>p.id!==parent.dataset.id);changed();renderInputs();});
$('add-part').onclick=()=>{project.parts.push({id:uid(),label:'',length:null,width:null,qty:1,material:project.stock[0]?.material||'',grain:false,edges:''});changed();renderInputs();$('parts-body').lastElementChild.querySelector('input').focus();};
$('add-stock').onclick=()=>{project.stock.push({id:uid(),label:'',length:null,width:null,qty:1,material:project.stock[0]?.material||''});changed();renderInputs();$('stock-body').lastElementChild.querySelector('input').focus();};
$('project-name').onchange=event=>{project.name=event.target.value.trim();persist();};
$('unit').onchange=event=>{project.settings.unit=event.target.value;renderInputs();renderResult();persist();};
for(const key of ['kerf','trim'])$(key).onchange=event=>{project.settings[key]=parseDimension(event.target.value,project.settings.unit);changed();};
for(const key of ['rotation','materials','singleSheet'])$(key).onchange=event=>{project.settings[key]=event.target.checked;changed();};
$('priority').onchange=event=>{project.settings.priority=event.target.value;changed();};
$('optimize').onclick=calculate;
$('layout-tab').onclick=()=>{view='layout';renderResult();};$('cuts-tab').onclick=()=>{view='cuts';renderResult();};$('labels').onchange=renderResult;
$('sheet-tabs').onclick=event=>{const button=event.target.closest('[data-sheet]');if(button){sheetIndex=Number(button.dataset.sheet);renderResult();}};
function selectPiece(event){const el=event.target.closest('[data-piece]');if(!el)return;selected=selected===el.dataset.piece?null:el.dataset.piece;renderResult();const p=resultProject.parts.find(p=>p.id===el.dataset.piece);toast(`${p.label} · ${dimension(p.length)} × ${dimension(p.width)}${p.edges?' · Banding: '+p.edges:''}`);}
$('plan-content').onclick=selectPiece;$('plan-content').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectPiece(event);}};
$('export-btn').onclick=()=>{$('export-menu').hidden=!$('export-menu').hidden;};
document.addEventListener('click',event=>{const btn=event.target.closest('[data-export]');if(btn)exportFile(btn.dataset.export);if(!event.target.closest('.export-wrap'))$('export-menu').hidden=true;});
$('save-btn').onclick=()=>{if(validate(project).length){toast('Fix invalid inputs before saving a project.');return;}archiveCurrent();if(persist())toast('Project saved in your library.');};
$('projects-btn').onclick=showProjects;
$('project-list').onclick=event=>{const open=event.target.closest('[data-project]'),remove=event.target.closest('[data-remove-project]');if(open){const p=library.find(p=>p.id===open.dataset.project);replaceProject(structuredClone(p));$('projects-dialog').close();calculate();}if(remove){library=library.filter(p=>p.id!==remove.dataset.removeProject);persist();remove.closest('.project-entry').remove();toast('Removed from saved projects. Your current draft is still available.');}};
$('new-project').onclick=()=>{archiveCurrent();replaceProject(emptyProject(project.settings.unit));$('projects-dialog').close();$('project-name').focus();};
$('clear-btn').onclick=()=>{clearedProject=structuredClone(project);replaceProject(emptyProject(project.settings.unit));$('clear-notice').hidden=false;$('project-name').focus();};
$('undo-clear').onclick=()=>{if(!clearedProject)return;const previous=clearedProject;clearedProject=null;replaceProject(previous);toast('Project restored. Optimize when you’re ready.');};
$('sample-btn').onclick=()=>{archiveCurrent();replaceProject(sampleProject());toast('Sample loaded. Choose Optimize layout to explore it.');};
$('help-btn').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>btn.closest('dialog').close());
$('import-btn').onclick=()=>{$('csv-file').click();toast('CSV headers: label, length, width, qty, material, grain, edges, unit.');};$('csv-file').onchange=event=>importCSV(event.target.files[0]);
$('load-file').onclick=()=>$('project-file').click();$('project-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('Choose a project smaller than 1 MB.');const next=JSON.parse(await file.text());const errors=validate(next);if(errors.length)throw new Error(errors[0]);if(next.version!==1)throw new Error('Unsupported project version.');archiveCurrent();replaceProject({...next,id:uid(),name:String(next.name||'Imported project').slice(0,80)});$('projects-dialog').close();calculate();toast('Project imported.');}catch(error){toast(error.message);}finally{event.target.value='';}};
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();calculate(true);}if(event.key==='Escape')$('export-menu').hidden=true;});
renderInputs();renderResult();persist();
