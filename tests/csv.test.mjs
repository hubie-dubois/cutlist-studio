import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV} from '../dist/csv.mjs';
test('quoted commas, escaped quotes, and CRLF are parsed without breaking rows',()=>{assert.deepEqual(parseCSV('label,length,width,qty\r\n"Shelf, \"\"upper\"\"",600,300,2\r\n'),[['label','length','width','qty'],['Shelf, "upper"','600','300','2']]);});
test('blank rows are ignored and quoted multiline fields are preserved',()=>{assert.deepEqual(parseCSV('a,b\n\n"x\ny",2'),[['a','b'],['x\ny','2']]);});
test('unterminated quote is an actionable failure',()=>{assert.throws(()=>parseCSV('a,b\n"x,2'),/unclosed quote/);});
