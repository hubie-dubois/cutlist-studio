import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseFit} from '../dist/optimizer.mjs';
const piece={id:'p',label:'blocking',length:23*25.4,width:5.5*25.4,qty:2,material:'2x6'};
const project=()=>({parts:[piece],stock:[{id:'s',label:'2x6x16',length:192*25.4,width:5.5*25.4,qty:3,material:'Birch plywood'}],settings:{unit:'in',trim:5,rotation:true,materials:true}});
test('reports both hidden patio blockers, not just the first one',()=>{
 const p=project(),issues=diagnoseFit(p,piece);
 assert.deepEqual(issues.map(i=>i.code),['material','trim']);
 assert.match(issues[0].message,/Birch plywood/);assert.match(issues[1].message,/5.1063 in/);
});
test('correcting only material still reports the trim blocker',()=>{const p=project();p.stock[0].material=' 2X6 ';assert.deepEqual(diagnoseFit(p,piece).map(i=>i.code),['trim']);});
test('matching material and zero trim clears the patio blockers',()=>{const p=project();p.stock[0].material='2x6';p.settings.trim=0;assert.deepEqual(diagnoseFit(p,piece),[]);});
test('stock that fits prevents false trim alarms',()=>{const p=project();p.stock.push({...p.stock[0],id:'large',width:200,material:'2x6'});assert.deepEqual(diagnoseFit(p,piece),[]);});
test('grain lock is distinguished from an oversized part',()=>{const p=project();p.settings.trim=0;p.settings.materials=false;p.stock[0].length=100;p.stock[0].width=600;assert.equal(diagnoseFit(p,{...piece,width:90,grain:true})[0].code,'grain');assert.equal(diagnoseFit(p,{...piece,width:700})[0].code,'size');});
