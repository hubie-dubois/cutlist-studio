import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildImagePDF,wrapCanvasText} from '../dist/export.mjs';

test('PDF cross references point to every object, including binary images',async()=>{
 const images=[new Uint8Array([255,216,255,0,17,255,217]),new Uint8Array([255,216,1,2,3,255,217])];
 const blob=buildImagePDF(images,1800,1273,'letter');assert.equal(blob.type,'application/pdf');
 const bytes=Buffer.from(await blob.arrayBuffer()),text=bytes.toString('latin1');
 assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 2/);assert.match(text,/\/MediaBox \[0 0 792 612\]/);
 const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(bytes.subarray(start,start+4).toString(),'xref');
 const table=text.slice(start).split('\n');const count=Number(table[1].split(' ')[1]);assert.equal(count,9);
 for(let id=1;id<count;id++){const offset=Number(table[id+2].split(' ')[0]);assert.ok(bytes.subarray(offset).toString('latin1').startsWith(`${id} 0 obj\n`));}
 images.forEach(image=>assert.ok(bytes.includes(Buffer.from(image))));
});
test('report wrapping preserves long labels, paragraphs and blank lines within margins',()=>{
 const ctx={measureText:text=>({width:text.length*10})};
 const rows=wrapCanvasText(ctx,'A long label with spaces\n\n'+ 'X'.repeat(50),100);
 assert.ok(rows.every(row=>row.length<=10));assert.ok(rows.includes(''));
 assert.equal(rows.join('').replaceAll(' ',''),'Alonglabelwithspaces'+'X'.repeat(50));
});
