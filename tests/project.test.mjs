import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject, sampleProject, restoreProject} from '../dist/project.mjs';
import {validate} from '../dist/optimizer.mjs';

test('first launch and reset have no sample project data',()=>{
 const p=emptyProject('in');
 assert.equal(p.name,'');assert.deepEqual(p.parts,[]);assert.deepEqual(p.stock,[]);
 assert.equal(p.settings.unit,'in');assert.equal(p.settings.trim,0);
 assert.deepEqual(validate(p,{draft:true}),[]);
 assert.ok(validate(p).length,'empty projects cannot optimize');
 assert.deepEqual(restoreProject(null).parts,[]);
});
test('blank and partially entered drafts survive storage round trips',()=>{
 const p=emptyProject();
 p.parts.push({id:'p',label:'',length:null,width:125,qty:1,material:'',grain:false,edges:''});
 const saved=JSON.parse(JSON.stringify({current:p,blankStart:true}));
 assert.deepEqual(restoreProject(saved),p);
 assert.ok(validate(p).length,'incomplete dimensions cannot optimize');
 const blank=emptyProject();assert.deepEqual(restoreProject({current:blank,blankStart:true}),blank);
});
test('legacy automatic sample is retired, including a change of display units',()=>{
 const p=sampleProject();p.settings.unit='in';
 const restored=restoreProject({current:p});
 assert.deepEqual(restored.parts,[]);assert.deepEqual(restored.stock,[]);
 assert.equal(restored.settings.unit,'in');
});
test('edited projects and explicitly loaded samples are preserved',()=>{
 const p=sampleProject();p.parts[0].length=800;
 assert.deepEqual(restoreProject({current:p}),p);
 const explicit=sampleProject();assert.deepEqual(restoreProject({current:explicit,blankStart:true}),explicit);
 assert.deepEqual(validate(explicit),[]);
});
test('malformed stored rows recover to a blank project',()=>{
 const p=sampleProject();p.parts=[null];
 assert.deepEqual(restoreProject({current:p}).parts,[]);
});
