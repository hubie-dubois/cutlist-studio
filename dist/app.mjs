import {emptyProject, sampleProject, restoreProject} from './project.mjs?v=20261024';
import {validate, parseDimension, diagnoseFit, searchStrategyCount} from './optimizer.mjs?v=20261024';
import {formatMeasurement, formatArea, unitInfo} from './units.mjs?v=20261024';
import {prepareProject, blankRow, activeRows, dimensionsText, edgeBands, bandTotals, groupSheets, sheetStats, stockUsage, exportRowsCSV, importRowsText} from './workspace.mjs?v=20261024';
import {sheetSVG, escapeHTML, pieceColors} from './diagram.mjs?v=20261024';
import {downloadBlob, exportSheetPNG, exportReportPDF} from './export.mjs?v=20261024';
const $ = id => document.getElementById(id);
const icons = {folder:'M3 7h6l2-3h6a2 2 0 0 1 2 2v12H3z',save:'M5 3h12l3 3v15H4V3z M8 3v6h8V3 M8 21v-8h8v8',edit:'m4 16 11-11 4 4-11 11H4z M13 7l4 4',parts:'M3 3h18v18H3z M3 13h18 M13 3v10 M9 13v8',layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',upload:'M12 16V3 m-4 4 4-4 4 4 M4 15v5h16v-5',download:'M12 3v13 m-4-4 4 4 4-4 M4 16v5h16v-5',plus:'M12 5v14 M5 12h14',sliders:'M4 6h7 m5 0h4 M4 12h3 m5 0h8 M4 18h10 m5 0h1 M11 3v6 M7 9v6 M14 15v6',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',sparkles:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z M20 2v4 M18 4h4',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6',chevron:'m7 10 5 5 5-5',bulb:'M8 17c0-4-3-4-3-8a7 7 0 0 1 14 0c0 4-3 4-3 8 M8 18h8 M9 22h6',chart:'M4 20V10 M10 20V4 M16 20v-8 M22 20V6',check:'m4 12 5 5L20 6',scissors:'m9 9 11 11 M9 15 20 4 M10 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M10 18a4 4 0 1 1-8 0 4 4 0 0 1 8 0'};
function icon(name) {return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.parts}"/></svg>`;}
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));
const uid=()=>crypto.randomUUID(), esc=escapeHTML, STORAGE='cutlist-studio-v1';
let library=[],lists=[],project=prepareProject(emptyProject()),result=null,resultProject=null,groups=[],sheetIndex=0,view='layout',selected=null,worker=null,revision=0,dirty=false,toastTimer,clearedProject=null,undoProject=null,deletedLibrary=null,deletedList=null,listType='parts',nameAction=null,exportKind='pdf',exporting=false;
let latestBest=null,searchSnapshot=null,startedAt=0,completedStrategies=0;
const diagramView={labels:true,dimensions:true,colors:true,cuts:false,offcuts:true,fontScale:1,rotation:0};
let zoom=100,pan=null;
const validDraft=p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&!validate(p,{draft:true}).length;
try{
 const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
 if(saved){library=Array.isArray(saved.library)?saved.library.filter(validDraft).map(prepareProject):[];project=prepareProject(restoreProject(saved));lists=Array.isArray(saved.lists)?saved.lists.filter(l=>l&&typeof l.id==='string'&&typeof l.name==='string'&&['parts','stock'].includes(l.type)&&!validate({...emptyProject(),[l.type]:l.rows},{draft:true}).length):[];}
}catch{/* A blocked store must not prevent editing. */}
const display=n=>formatMeasurement(n,project.settings.unit,project.settings.precision);
const inputValue=n=>formatMeasurement(n,project.settings.unit,project.settings.precision,{input:true});
const dimension=n=>`${display(n)} ${unitInfo(project.settings.unit).label}`;
const dims=(l,w)=>dimensionsText(l,w,project.settings);
const area=n=>formatArea(n,project.settings.unit,project.settings.precision);
const drawingProject=()=>({...resultProject,settings:{...resultProject.settings,unit:project.settings.unit,precision:project.settings.precision,dimensionOrder:project.settings.dimensionOrder}});
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({current:project,library,lists,blankStart:true}));$('saved-status').innerHTML='<span class="status-dot"></span> Saved on this device';return true;}catch{$('saved-status').textContent='Storage full or unavailable · export a backup';return false;}}
function stopWorker(){worker?.terminate();worker=null;$('optimize-label').textContent='Optimize layout';$('optimize').setAttribute('aria-busy','false');$('search-progress').classList.remove('is-searching');$('accept-best').disabled=true;}
function changed(){revision++;dirty=true;stopWorker();latestBest=null;$('search-progress').hidden=true;persist();renderDiagnostics();if(result)feedback('Your inputs changed. Optimize again to update this plan.');}
function feedback(message,error=false){$('feedback').hidden=!message;$('feedback').className='feedback'+(error?' error':'');$('feedback').textContent=message;}
function rememberEdit(message){undoProject=structuredClone(project);$('edit-message').textContent=message;$('edit-notice').hidden=false;}
function renderDiagnostics(){
 const errors=project.parts.length||project.stock.length?validate(project):[];
 const issues=errors.length?errors:[...new Set(activeRows(project.parts).flatMap(p=>diagnoseFit(project,p).map(i=>i.message)))];
 $('input-feedback').hidden=!issues.length;$('input-feedback').innerHTML=issues.length?`<strong>Check these settings</strong><ul>${issues.slice(0,8).map(m=>`<li>${esc(m)}</li>`).join('')}${issues.length>8?`<li>…and ${issues.length-8} more. Review your rows.</li>`:''}</ul>`:'';
}
function row(p,i,type){
 const label=type==='parts'?'Part':'Stock', fields=project.settings.dimensionOrder==='wl'?['width','length']:['length','width'];
 return `<tr data-id="${esc(p.id)}" data-type="${type}" class="${p.enabled===false?'disabled-row':''}"><td><div class="row-name"><input type="checkbox" data-field="enabled" aria-label="Enable ${label.toLowerCase()} ${i+1}" ${p.enabled!==false?'checked':''}><input class="name-input" data-field="label" aria-label="${label} ${i+1} name" maxlength="100" placeholder="${label} name" value="${esc(p.label)}"></div></td>${fields.map(f=>`<td><input data-field="${f}" aria-label="${label} ${i+1} ${f}" placeholder="—" value="${esc(typeof p[f]==='string'?p[f]:inputValue(p[f]))}"></td>`).join('')}<td><input data-field="qty" type="number" min="1" max="5000" step="1" aria-label="${label} ${i+1} quantity" value="${esc(p.qty)}"></td><td><button class="delete-row" data-delete aria-label="Remove ${label.toLowerCase()} ${i+1}">×</button></td></tr>`;
}
function renderDetails(){
 for(const type of ['parts','stock'])$(type==='parts'?'part-details':'stock-details').innerHTML=project[type].map((p,i)=>{
 const name=p.label||`${type==='parts'?'Part':'Stock'} ${i+1}`,grain=p.grain===true?'length':p.grain===false?'none':p.grain||(type==='stock'?'length':'none'),bands=edgeBands(p);
 return `<div class="detail-row" data-type="${type}" data-id="${esc(p.id)}"><strong>${esc(name)}</strong><label>Material<input type="text" data-field="material" maxlength="100" aria-label="${esc(name)} material" value="${esc(p.material)}" list="materials-list"></label><label>Grain<select data-field="grain" aria-label="${esc(name)} grain">${['none','length','width'].map(g=>`<option value="${g}" ${grain===g?'selected':''}>${g==='none'?'None':g==='length'?'Along length':'Along width'}</option>`).join('')}</select></label><button class="text-button" data-duplicate>Duplicate row</button>${type==='parts'?`<div class="band-fields">${[['T','Top'],['B','Bottom'],['L','Left'],['R','Right']].map(([side,label])=>`<label>${label} band<input type="text" data-band="${side}" maxlength="100" aria-label="${esc(name)} ${label.toLowerCase()} band" value="${esc(bands[side]||'')}" placeholder="None" list="bands-list"></label>`).join('')}</div>`:''}</div>`;
 }).join('');
 const materials=[...new Set([...project.parts,...project.stock].map(p=>p.material).filter(Boolean))],bands=[...new Set(project.parts.flatMap(p=>Object.values(edgeBands(p))).filter(Boolean))];
 $('materials-list').innerHTML=materials.map(v=>`<option value="${esc(v)}"></option>`).join('');$('bands-list').innerHTML=bands.map(v=>`<option value="${esc(v)}"></option>`).join('');
}
function renderInputs(){
 $('project-name').value=project.name;
 for(const type of ['parts','stock'])$(type+'-body').innerHTML=project[type].map((p,i)=>row(p,i,type)).join('')||`<tr><td colspan="5" class="empty-table">${type==='parts'?'No parts yet. Add your first piece below.':'Add the stock you have on hand.'}</td></tr>`;
 $('part-summary').textContent=`${activeRows(project.parts).reduce((n,p)=>n+(p.qty||0),0)} enabled pieces · ${project.parts.length} rows`;
 document.querySelectorAll('.unit-text').forEach(el=>el.textContent=unitInfo(project.settings.unit).label);
 document.querySelectorAll('.first-dimension').forEach(el=>el.textContent=project.settings.dimensionOrder==='wl'?'WIDTH':'LENGTH');document.querySelectorAll('.second-dimension').forEach(el=>el.textContent=project.settings.dimensionOrder==='wl'?'LENGTH':'WIDTH');
 for(const key of ['unit','priority','cutDirection','precision','dimensionOrder'])$(key).value=project.settings[key];
 for(const key of ['kerf','trim','minTrim'])$(key).value=inputValue(project.settings[key]);
 for(const key of ['rotation','materials','singleSheet','groupLayouts'])$(key).checked=!!project.settings[key];
 renderDetails();renderDiagnostics();
}
function renderResult(){
 const r=result;groups=r?groupSheets(r.sheets,project.settings.groupLayouts):[];sheetIndex=Math.min(sheetIndex,Math.max(0,groups.length-1));
 $('metrics').innerHTML=`<div class="metric"><div class="metric-label">${icon('layers')} Sheets used</div><div class="metric-number">${r?r.sheets.length:'—'}<small>${r?'of '+activeRows(resultProject.stock).reduce((n,p)=>n+p.qty,0)+' available':''}</small></div></div><div class="metric green"><div class="metric-label">${icon('chart')} Material used</div><div class="metric-number">${r?r.utilization.toFixed(1)+'%':'—'}</div></div><div class="metric"><div class="metric-label">${icon('scissors')} Total cuts</div><div class="metric-number">${r?r.cutCount:'—'}<small>excl. trim</small></div></div>`;
 $('sheet-tabs').innerHTML=groups.map((g,i)=>`<button class="sheet-tab ${i===sheetIndex?'active':''}" data-sheet="${i}" aria-pressed="${i===sheetIndex}">Sheet ${g.index+1}${g.count>1?` × ${g.count}`:''}<span>${g.sheet.parts.length} pieces</span></button>`).join('');
 for(const [id,value] of [['layout-tab','layout'],['cuts-tab','cuts']]){$(id).classList.toggle('active',view===value);$(id).setAttribute('aria-pressed',view===value);}
 $('kerf-value').textContent=dimension(resultProject?.settings.kerf??project.settings.kerf);
 const group=groups[sheetIndex],sheet=group?.sheet;
 if(!sheet)$('plan-content').innerHTML=`<div class="empty-state">${icon('parts')}<br><strong>${r?'No pieces fit the available stock.':'Your next project, beautifully planned.'}</strong><br>${r?'Check sizes, materials, grain, and trim settings.':'Add your parts and stock, then optimize your layout.'}</div>`;
 else if(view==='layout'){
  const stats=sheetStats(sheet);
  $('plan-content').innerHTML=`<div class="sheet-meta"><strong>${esc(sheet.label||'Stock')} · ${esc(sheet.material)}${group.count>1?` · Repeat ${group.count} times`:''}</strong><span>${stats.utilization.toFixed(1)}% used</span></div><div class="drawing-viewport" tabindex="0" aria-label="Cutting diagram; scroll or drag to pan"><div class="drawing" style="width:${zoom}%">${sheetSVG(sheet,drawingProject(),{...diagramView,interactive:true,selected,prefix:'plan'})}</div></div>${sheet.parts.every(p=>Math.abs(p.h-sheet.width)<1e-7&&Math.abs(p.y)<1e-7)?`<div class="board-pieces"><p>Pieces from left to right</p><ol>${[...sheet.parts].sort((a,b)=>a.x-b.x).map(p=>`<li><strong>${esc(p.label||'Part')}</strong><span>${dimension(p.w)}</span></li>`).join('')}</ol></div>`:''}<div class="sheet-stats"><span>${esc(dims(sheet.length,sheet.width))}</span><span>${stats.pieces} pieces</span><span>${stats.cuts} cuts · ${dimension(stats.cutLength)}</span><span>${area(stats.waste)} unused</span></div>`;
 }else{
  $('plan-content').innerHTML=`<div class="cut-note">Trim ${dimension(resultProject.settings.trim)} from each edge first. X / Y locate the start of the blade kerf from the original top-left corner.${group.count>1?` Repeat this sequence on ${group.count} sheets.`:''}</div><div class="cuts-wrap"><table class="cut-table"><thead><tr><th>#</th><th>Direction</th><th>X / Y</th><th>Length</th><th>Source section</th><th>Resulting sections</th></tr></thead><tbody>${sheet.cuts.map((c,i)=>`<tr><td>${i+1}</td><td>${c.axis==='vertical'?'↓ Vertical':'→ Horizontal'}</td><td>${display(c.x)} / ${display(c.y)}</td><td>${display(c.length)}</td><td>${c.source?esc(dims(c.source.w,c.source.h)):'—'}</td><td>${c.outputs?.map(p=>esc(dims(p.w,p.h))).join(' + ')||'—'}</td></tr>`).join('')}</tbody></table></div>`;
 }
 $('statistics').hidden=!r;
 if(r){const bands=bandTotals(resultProject.parts);$('statistics').innerHTML=`<details><summary>Project statistics & materials</summary><div class="stats-content"><dl><dt>Used area</dt><dd>${area(r.usedArea)}</dd><dt>Unused area (kerf & trim included)</dt><dd>${area(r.stockArea-r.usedArea)}</dd><dt>Total cut length</dt><dd>${dimension(r.cutLength)}</dd><dt>Reusable offcut rectangles</dt><dd>${r.sheets.reduce((n,s)=>n+s.free.length,0)}</dd></dl><h3>Stock usage</h3><ul>${stockUsage(r).map(s=>`<li>${esc(s.label||'Stock')} · ${esc(dims(s.length,s.width))} · ${s.used} used / ${s.qty} available</li>`).join('')}</ul>${bands.length?`<h3>Banding for all enabled parts</h3><ul>${bands.map(b=>`<li>${esc(b.name)} · ${dimension(b.length)}</li>`).join('')}</ul>`:''}${sheet?.free.length?`<h3>Offcuts on this sheet</h3><ul>${sheet.free.map(f=>`<li>${esc(dims(f.w,f.h))} · X ${display(f.x)} / Y ${display(f.y)}</li>`).join('')}</ul>`:''}</div></details>`;}
 const total=activeRows((resultProject||project).parts).reduce((n,p)=>n+p.qty,0),fitted=r?r.sheets.reduce((n,s)=>n+s.parts.length,0):0;
 $('complete-badge').textContent=r?(r.unplaced.length?`${r.unplaced.length} unplaced`:'✓ All parts placed'):'Ready when you are';
 $('breakdown-caption').textContent=r?`${fitted} of ${total} pieces placed · ${area(r.stockArea-r.usedArea)} unused`:'A clear view of what goes where.';
 $('piece-legend').innerHTML=activeRows((resultProject||project).parts).map((p,i)=>`<div class="legend-item"><span class="color-dot" style="background:${pieceColors(i)[0]}"></span><span class="legend-label">${esc(p.label||'Part '+(i+1))}</span><small>× ${p.qty}</small></div>`).join('');
 const missing=new Map();r?.unplaced.forEach(p=>{const item=missing.get(p.id)||{...p,count:0};item.count++;missing.set(p.id,item);});
 $('unplaced').innerHTML=missing.size?`<section class="unplaced-card"><h3>${r.unplaced.length} pieces could not be placed</h3><ul>${[...missing.values()].map(p=>`<li>${esc(p.label||'Part')} · ${esc(dims(p.length,p.width))} · quantity ${p.count}<br>${esc(diagnoseFit(drawingProject(),p).map(i=>i.message).join(' ')||(resultProject.settings.singleSheet?'The one-sheet limit prevents this piece from fitting.':'No remaining space fits this piece with the current kerf and stock quantities.'))}</li>`).join('')}</ul></section>`:'';
}
function renderProgress(progress){
 completedStrategies=progress.completed;const {completed,total,phase,best}=progress;
 $('search-progress').hidden=false;$('search-title').textContent=phase;$('search-count').textContent=`${completed} / ${total} strategies`;$('search-bar').max=total;$('search-bar').value=completed;$('search-percent').textContent=`${Math.floor(completed/total*100)}%`;
 $('search-best').textContent=best?`${best.sheets} sheets · ${best.utilization.toFixed(1)}% used · ${best.cutCount} cuts · ${best.unplaced} unplaced`:'Comparing part orders, rotations, and cut directions.';
}
function finishSearch(best,early=false){stopWorker();result=best;resultProject=searchSnapshot;dirty=false;sheetIndex=0;selected=null;renderResult();persist();$('search-title').textContent=early?'Best so far accepted':'Best layout ready';$('search-count').textContent=`${completedStrategies} strategies compared in ${((performance.now()-startedAt)/1000).toFixed(1)}s`;toast(best.unplaced.length?`${best.unplaced.length} pieces could not be placed.`:`Placed all ${best.sheets.reduce((n,s)=>n+s.parts.length,0)} pieces.`);}
function calculate(){
 document.activeElement?.blur();if(worker){stopWorker();$('search-progress').hidden=true;toast('Optimization canceled.');return;}
 const errors=validate(project);if(errors.length){feedback(errors.join(' '),true);return;}
 feedback('');latestBest=null;searchSnapshot=structuredClone(project);startedAt=performance.now();const version=revision;
 $('optimize-label').textContent='Cancel optimization';$('optimize').setAttribute('aria-busy','true');$('search-progress').classList.add('is-searching');renderProgress({completed:0,total:searchStrategyCount(project),phase:'Preparing your pieces',best:null});
 let activeWorker;
 const fail=message=>{if(activeWorker&&worker!==activeWorker)return;stopWorker();$('search-progress').hidden=true;feedback(message||'The optimizer could not run. Reload and try again.',true);};
 try{activeWorker=new Worker('./worker.mjs?v=20261024',{type:'module'});worker=activeWorker;}catch{fail();return;}
 activeWorker.onmessage=({data})=>{if(worker!==activeWorker||version!==revision)return;if(data.progress){renderProgress(data.progress);if(data.bestResult){latestBest=data.bestResult;$('accept-best').disabled=false;}return;}if(data.error){fail(data.error);return;}finishSearch(data.result);};
 activeWorker.onerror=()=>fail();activeWorker.onmessageerror=()=>fail();activeWorker.postMessage(searchSnapshot);
}
function replaceProject(next){stopWorker();clearedProject=null;undoProject=null;$('edit-notice').hidden=true;project=prepareProject(next);revision++;result=null;resultProject=null;dirty=false;sheetIndex=0;selected=null;latestBest=null;$('clear-notice').hidden=true;$('search-progress').hidden=true;renderInputs();renderResult();feedback('');persist();}
function archiveCurrent(){if(!validDraft(project))return false;const saved={...structuredClone(project),updated:new Date().toISOString()},found=library.findIndex(p=>p.id===project.id);if(found<0)library.unshift(saved);else library[found]=saved;return true;}
function askName(title,value,action){$('name-title').textContent=title;$('name-value').value=value;nameAction=action;$('name-dialog').showModal();$('name-value').select();}
$('name-form').onsubmit=event=>{event.preventDefault();const value=$('name-value').value.trim();if(!value)return;$('name-dialog').close();nameAction?.(value);};
function download(text,name,type){downloadBlob(new Blob([text],{type}),name);}
const safeName=name=>String(name).replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'cutting-plan';
function exportFile(kind){
 $('export-menu').hidden=true;
 if(kind==='json'){if(!validDraft(project)){toast('Fix invalid inputs before exporting.');return;}download(JSON.stringify(project,null,2),safeName(project.name)+'.json','application/json');return;}
 if(kind==='csv'||kind==='stock-csv'){download(exportRowsCSV(project[kind==='csv'?'parts':'stock'],project.settings),safeName(project.name)+(kind==='csv'?'-parts':'-stock')+'.csv','text/csv');return;}
 if(!result?.sheets.length||dirty){toast('Optimize your current inputs before exporting a cutting plan.');return;}
 if(kind==='svg'){download(sheetSVG(groups[sheetIndex].sheet,drawingProject(),{...diagramView,prefix:'export'}),safeName(project.name)+`-sheet-${groups[sheetIndex].index+1}.svg`,'image/svg+xml');return;}
 if(kind==='print'){
  $('print-content').innerHTML=groups.map(g=>`<section class="print-sheet"><h1>${esc(project.name||'Cutting plan')} · Sheet ${g.index+1}${g.count>1?` × ${g.count}`:''}</h1><p>${esc(g.sheet.label)} · ${esc(dims(g.sheet.length,g.sheet.width))} · Kerf ${dimension(resultProject.settings.kerf)} · Trim ${dimension(resultProject.settings.trim)}</p>${sheetSVG(g.sheet,drawingProject(),{...diagramView,prefix:'print'+g.index})}</section>`).join('');window.print();return;
 }
 exportKind=kind;const form=$('export-form');form.elements.filename.value=safeName(project.name);form.elements.header.value=project.name;form.elements.scope.value=kind==='png'?'current':'all';$('export-title').textContent=kind==='png'?'Export sheet images':'Export PDF report';document.querySelectorAll('[data-pdf]').forEach(el=>el.hidden=kind==='png');$('export-status').textContent='';$('export-dialog').showModal();
}
$('export-form').onsubmit=async event=>{
 event.preventDefault();if(exporting)return;exporting=true;$('export-submit').disabled=true;
 const values=new FormData(event.target),options=Object.fromEntries(values);options.filename=safeName(options.filename);options.summary=values.has('summary');options.cuts=values.has('cuts');options.date=values.has('date');const chosen=options.scope==='current'?[groups[sheetIndex]]:groups;
 try{$('export-status').textContent='Preparing your export…';if(exportKind==='pdf')await exportReportPDF({...drawingProject(),name:project.name},result,chosen,options,diagramView,n=>$('export-status').textContent=`Preparing page ${n}…`);else for(const g of chosen)await exportSheetPNG(g,{...drawingProject(),name:project.name},diagramView,options.filename+`-sheet-${g.index+1}`,options);$('export-dialog').close();toast('Export ready.');}catch(error){$('export-status').textContent=error.message;}finally{exporting=false;$('export-submit').disabled=false;}
};
function appendRows(text){const rows=importRowsText(text,listType,project.settings),candidate={...project,[listType]:[...project[listType],...rows]},errors=validate(candidate,{draft:true});if(errors.length)throw new Error(errors[0]);rememberEdit(`Added ${rows.length} ${listType} rows.`);project=candidate;changed();renderInputs();toast(`Added ${rows.length} rows.`);}
function renderProjects(){const query=$('project-search').value.toLowerCase();const shown=library.filter(p=>p.name.toLowerCase().includes(query));$('project-list').innerHTML=shown.map(p=>`<div class="project-entry" data-library-id="${esc(p.id)}"><button class="project-open" data-library-action="open">${esc(p.name||'Untitled project')}<small>${p.parts.length} part rows · ${new Date(p.updated||Date.now()).toLocaleDateString()}</small></button><button class="text-button" data-library-action="rename">Rename</button><button class="icon-button" data-library-action="delete" aria-label="Delete ${esc(p.name||'project')}">×</button></div>`).join('')||'<p class="helper">No saved projects match.</p>';$('undo-library').hidden=!deletedLibrary;}
function renderLists(){const query=$('list-search').value.toLowerCase();$('lists-title').textContent=`Saved ${listType==='parts'?'part':'stock'} lists`;$('saved-lists').innerHTML=lists.filter(l=>l.type===listType&&l.name.toLowerCase().includes(query)).map(l=>`<div class="project-entry" data-list-id="${esc(l.id)}"><button class="project-open" data-saved-list-action="load">${esc(l.name)}<small>${l.rows.length} rows</small></button><button class="text-button" data-saved-list-action="rename">Rename</button><button class="icon-button" data-saved-list-action="delete" aria-label="Delete ${esc(l.name)}">×</button></div>`).join('')||'<p class="helper">No saved lists match.</p>';$('undo-list-delete').hidden=!deletedList;}
function runListAction(type,action){
 listType=type;
 if(action==='save'){if(validate({...emptyProject(),[type]:project[type]},{draft:true}).length){toast('Fix invalid rows before saving a list.');return;}const rows=structuredClone(project[type]);askName('Save '+(type==='parts'?'part':'stock')+' list','',name=>{lists.unshift({id:uid(),name,type,rows});if(persist())toast('List saved.');});return;}
 if(action==='load'){$('list-search').value='';renderLists();$('lists-dialog').showModal();return;}
 if(action==='import'){$('csv-file').click();return;}
 if(action==='export'){exportFile(type==='parts'?'csv':'stock-csv');return;}
 if(action==='paste'){$('paste-text').value='';$('paste-error').textContent='';$('paste-dialog').showModal();return;}
 rememberEdit(`${type==='parts'?'Part':'Stock'} list updated.`);
 if(action==='clear')project[type]=[];
 if(action==='enable'||action==='disable')project[type].forEach(p=>p.enabled=action==='enable');
 if(action==='labels')project[type].forEach(p=>p.label=dims(p.length,p.width));
 changed();renderInputs();
}
// Delegate edits so imported and newly created rows follow the same rules.
document.querySelector('.inputs-column').addEventListener('change',event=>{
 const target=event.target;
 if(target.dataset.sort){const type=target.dataset.sort,key=target.value;if(!key)return;rememberEdit('List sorted.');project[type].sort((a,b)=>['label','material'].includes(key)?a[key].localeCompare(b[key]):key==='area'?(b.length*b.width)-(a.length*a.width):(b[key]||0)-(a[key]||0));changed();renderInputs();target.value='';return;}
 const field=target.dataset.field,band=target.dataset.band;if(!field&&!band)return;
 const parent=target.closest('[data-type]'),p=project[parent.dataset.type].find(p=>p.id===parent.dataset.id);if(!p)return;
 if(band){p.bands={...edgeBands(p),[band]:target.value.trim()};p.edges='';}
 else if(['length','width'].includes(field)){const n=parseDimension(target.value,project.settings.unit);p[field]=target.value.trim()?(Number.isFinite(n)?n:target.value):null;}
 else if(field==='qty')p.qty=Number(target.value);else if(field==='enabled')p.enabled=target.checked;else p[field]=target.value;
 changed();if(field==='label')renderDetails();if(field==='enabled')renderInputs();else $('part-summary').textContent=`${activeRows(project.parts).reduce((n,p)=>n+(p.qty||0),0)} enabled pieces · ${project.parts.length} rows`;
});
document.querySelector('.inputs-column').addEventListener('click',event=>{
 const action=event.target.closest('[data-list-action]');if(action){runListAction(action.closest('[data-list]').dataset.list,action.dataset.listAction);return;}
 const btn=event.target.closest('[data-delete],[data-duplicate]');if(!btn)return;const parent=btn.closest('[data-type]'),type=parent.dataset.type;
 rememberEdit(btn.hasAttribute('data-delete')?'Row removed.':'Row duplicated.');if(btn.hasAttribute('data-delete'))project[type]=project[type].filter(p=>p.id!==parent.dataset.id);else{if(project[type].length>=1000){toast('Use at most 1,000 rows.');return;}const row=project[type].find(p=>p.id===parent.dataset.id);project[type].push({...structuredClone(row),id:uid()});}changed();renderInputs();
});
for(const [id,type] of [['add-part','parts'],['add-stock','stock']])$(id).onclick=()=>{if(project[type].length>=1000){toast('Use at most 1,000 rows.');return;}project[type].push(blankRow(type,project.stock[0]?.material||''));changed();renderInputs();$(type+'-body').lastElementChild.querySelector('.name-input').focus();};
$('project-name').onchange=event=>{project.name=event.target.value.trim();persist();};
for(const key of ['unit','precision','dimensionOrder','groupLayouts'])$(key).onchange=event=>{project.settings[key]=key==='groupLayouts'?event.target.checked:key==='precision'?Number(event.target.value):event.target.value;renderInputs();renderResult();persist();};
for(const key of ['kerf','trim','minTrim'])$(key).onchange=event=>{const n=parseDimension(event.target.value,project.settings.unit);project.settings[key]=Number.isFinite(n)?n:event.target.value;changed();};
for(const key of ['rotation','materials','singleSheet'])$(key).onchange=event=>{project.settings[key]=event.target.checked;changed();};
for(const key of ['priority','cutDirection'])$(key).onchange=event=>{project.settings[key]=event.target.value;changed();};
$('optimize').onclick=calculate;$('accept-best').onclick=()=>{if(worker&&latestBest)finishSearch(latestBest,true);};
$('layout-tab').onclick=()=>{view='layout';renderResult();};$('cuts-tab').onclick=()=>{view='cuts';renderResult();};$('labels').onchange=event=>{diagramView.labels=event.target.checked;renderResult();};
$('view-options-btn').onclick=()=>{$('view-options').hidden=!$('view-options').hidden;$('view-options-btn').setAttribute('aria-expanded',!$('view-options').hidden);};
document.querySelectorAll('[data-view]').forEach(el=>el.onchange=()=>{diagramView[el.dataset.view]=el.checked;renderResult();});
$('font-scale').onchange=event=>{diagramView.fontScale=Number(event.target.value);renderResult();};$('rotate-view').onclick=()=>{diagramView.rotation=(diagramView.rotation+90)%360;renderResult();};
$('zoom').oninput=event=>{zoom=Number(event.target.value);$('zoom-value').textContent=zoom+'%';renderResult();};$('reset-view').onclick=()=>{zoom=100;diagramView.rotation=0;$('zoom').value=100;$('zoom-value').textContent='100%';renderResult();};
$('sheet-tabs').onclick=event=>{const btn=event.target.closest('[data-sheet]');if(btn){sheetIndex=Number(btn.dataset.sheet);selected=null;renderResult();}};
function selectPiece(event){const el=event.target.closest('[data-piece]');if(!el)return;selected=selected===el.dataset.piece?null:el.dataset.piece;const p=groups[sheetIndex].sheet.parts.find(p=>`${p.id}:${p.copy}`===el.dataset.piece);renderResult();if(p)toast(`${p.label||'Part'} · ${dims(p.length,p.width)}${Object.values(edgeBands(p)).some(Boolean)?' · Bands: '+Object.entries(edgeBands(p)).filter(([,v])=>v).map(([s,v])=>s+' '+v).join(', '):''}`);}
let suppressClick=false;
$('plan-content').onclick=event=>{if(suppressClick){suppressClick=false;return;}selectPiece(event);};$('plan-content').onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-piece]')){event.preventDefault();selectPiece(event);}};
$('plan-content').onpointerdown=event=>{const viewport=event.target.closest('.drawing-viewport');if(!viewport||zoom===100||event.button!==0)return;pan={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,viewport};};
$('plan-content').onpointermove=event=>{if(!pan)return;const dx=event.clientX-pan.x,dy=event.clientY-pan.y;if(Math.abs(dx)+Math.abs(dy)>5){suppressClick=true;pan.viewport.scrollLeft=pan.left-dx;pan.viewport.scrollTop=pan.top-dy;}};
window.addEventListener('pointerup',()=>pan=null);window.addEventListener('pointercancel',()=>pan=null);
$('export-btn').onclick=()=>{$('export-menu').hidden=!$('export-menu').hidden;};document.addEventListener('click',event=>{const btn=event.target.closest('[data-export]');if(btn)exportFile(btn.dataset.export);if(!event.target.closest('.export-wrap'))$('export-menu').hidden=true;});
$('save-btn').onclick=()=>{if(!archiveCurrent()){toast('Fix invalid inputs before saving.');return;}if(persist())toast('Project saved in your library.');};
$('save-as-btn').onclick=()=>{if(!validDraft(project)){toast('Fix invalid inputs before saving.');return;}askName('Save project as',project.name,name=>{project={...structuredClone(project),id:uid(),name};archiveCurrent();renderInputs();if(persist())toast('New project copy saved.');});};
$('projects-btn').onclick=()=>{$('project-search').value='';renderProjects();$('projects-dialog').showModal();};$('project-search').oninput=renderProjects;
$('project-list').onclick=event=>{const btn=event.target.closest('[data-library-action]');if(!btn)return;const id=btn.closest('[data-library-id]').dataset.libraryId,p=library.find(p=>p.id===id);if(!p)return;const action=btn.dataset.libraryAction;if(action==='open'){archiveCurrent();replaceProject(structuredClone(p));$('projects-dialog').close();}if(action==='delete'){deletedLibrary=p;library=library.filter(p=>p.id!==id);persist();renderProjects();}if(action==='rename')askName('Rename project',p.name,name=>{p.name=name;if(project.id===id){project.name=name;$('project-name').value=name;}persist();renderProjects();});};
$('undo-library').onclick=()=>{if(deletedLibrary){library.unshift(deletedLibrary);deletedLibrary=null;persist();renderProjects();}};
$('list-search').oninput=renderLists;
$('saved-lists').onclick=event=>{const btn=event.target.closest('[data-saved-list-action]');if(!btn)return;const id=btn.closest('[data-list-id]').dataset.listId,l=lists.find(l=>l.id===id);if(!l)return;const action=btn.dataset.savedListAction;if(action==='load'){rememberEdit('Saved list loaded.');project[l.type]=l.rows.map(row=>({...structuredClone(row),id:uid()}));changed();renderInputs();$('lists-dialog').close();}if(action==='delete'){deletedList=l;lists=lists.filter(l=>l.id!==id);persist();renderLists();}if(action==='rename')askName('Rename list',l.name,name=>{l.name=name;persist();renderLists();});};
$('undo-list-delete').onclick=()=>{if(deletedList){lists.unshift(deletedList);deletedList=null;persist();renderLists();}};
$('new-project').onclick=()=>{archiveCurrent();replaceProject(emptyProject(project.settings.unit));$('projects-dialog').close();$('project-name').focus();};
$('clear-btn').onclick=()=>{const previous=structuredClone(project);replaceProject(emptyProject(project.settings.unit));clearedProject=previous;undoProject=null;$('edit-notice').hidden=true;$('clear-notice').hidden=false;};$('undo-clear').onclick=()=>{if(clearedProject){const previous=clearedProject;clearedProject=null;replaceProject(previous);toast('Project restored.');}};
$('undo-edit').onclick=()=>{if(undoProject){project=undoProject;undoProject=null;changed();renderInputs();renderResult();$('edit-notice').hidden=true;}};$('dismiss-undo').onclick=()=>{$('edit-notice').hidden=true;undoProject=null;};
$('sample-btn').onclick=()=>{archiveCurrent();replaceProject(sampleProject());toast('Sample loaded. Choose Optimize layout to explore it.');};
$('help-btn').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>{if(btn.closest('dialog').id==='export-dialog'&&exporting)return;btn.closest('dialog').close();});$('export-dialog').addEventListener('cancel',event=>{if(exporting)event.preventDefault();});
$('import-btn').onclick=()=>runListAction('parts','import');$('csv-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2000000)throw new Error('Choose a file smaller than 2 MB.');appendRows(await file.text());}catch(error){feedback(error.message,true);}finally{event.target.value='';}};
$('paste-apply').onclick=()=>{try{appendRows($('paste-text').value);$('paste-dialog').close();}catch(error){$('paste-error').textContent=error.message;}};
$('load-file').onclick=()=>$('project-file').click();$('project-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>4000000)throw new Error('Choose a project smaller than 4 MB.');const next=JSON.parse(await file.text());const errors=validate(next,{draft:true});if(errors.length)throw new Error(errors[0]);if(next.version!==1)throw new Error('Unsupported project version.');archiveCurrent();replaceProject({...next,id:uid(),name:String(next.name||'Imported project').slice(0,80)});$('projects-dialog').close();toast('Project imported.');}catch(error){toast(error.message);}finally{event.target.value='';}};
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!document.querySelector('dialog[open]')){event.preventDefault();calculate();}if(event.key==='Escape')$('export-menu').hidden=true;});
renderInputs();renderResult();persist();
