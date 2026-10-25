import {readFile,writeFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const strip=source=>source.replace(/^import .*\n/gm,'').replace(/export (async )?function /g,(_,async='')=>async+'function ');
// Dependency order matters: the browser and worker each get their own module scope.
const names=['units','optimizer','csv','workspace','project','diagram','export'];
const modules=await Promise.all(names.map(async name=>strip(await read(`dist/${name}.mjs`))));
modules[4]=modules[4].replace('const uid=()=>crypto.randomUUID();','');
const workerSource=JSON.stringify(modules[0]+'\n'+modules[1]+'\n'+strip(await read('dist/worker.mjs')));
let app=strip(await read('dist/app.mjs')).replace("new Worker('./worker.mjs?v=20261024',{type:'module'})",'new Worker(standaloneWorkerURL)');
const setup=`const standaloneWorkerURL=URL.createObjectURL(new Blob([${workerSource}],{type:'text/javascript'}));`;
let html=(await read('dist/index.html')).replace('href="./"','href="#"');
const icon='data:image/svg+xml;base64,'+Buffer.from(await read('dist/icon.svg')).toString('base64');
html=html.replaceAll('href="icon.svg"',`href="${icon}"`).replaceAll('src="icon.svg"',`src="${icon}"`);
html=html.replace('<link rel="stylesheet" href="style.css?v=20261024">',`<style>${await read('dist/style.css')}</style>`).replace('<script type="module" src="app.mjs?v=20261024"></script>','');
html=html.replace('</body>',`<script type="module">${(modules.join('\n')+'\n'+setup+'\n'+app).replaceAll('</script','<\\/script')}</script></body>`);
await writeFile(new URL('../Cutlist Studio.html',import.meta.url),html);
console.log('Created Cutlist Studio.html — open directly in a browser.');
