// Geometry is stored in millimeters; generic units use a scale of one.
export function unitInfo(unit='mm') {
 const units={mm:{scale:1,label:'mm',area:'mm²'},cm:{scale:10,label:'cm',area:'cm²'},m:{scale:1000,label:'m',area:'m²'},in:{scale:25.4,label:'in',area:'in²'},'in-frac':{scale:25.4,label:'in',area:'in²'},'ft-in':{scale:25.4,label:'ft / in',area:'ft²'},'ft-in-frac':{scale:25.4,label:'ft / in',area:'ft²'},generic:{scale:1,label:'units',area:'units²'}};
 return units[unit];
}
export function parseMeasurement(value,unit='mm') {
 let text=String(value).trim().replace(/[′’]/g,"'").replace(/[″“”]/g,'"');
 const info=unitInfo(unit);if(!info||!text)return NaN;
 const scalar=s=>{const m=s.trim().match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);const n=m?Number(m[1]||0)+Number(m[2])/Number(m[3]):/^\d*\.?\d+$/.test(s.trim())?Number(s):NaN;return Number.isFinite(n)?n:NaN;};
 const feet=text.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft)\s*(.*?)\s*(?:"|in)?$/i);
 if(feet){const inches=feet[2]?scalar(feet[2]):0;return Number.isFinite(inches)?(Number(feet[1])*12+inches)*25.4:NaN;}
 const suffix=text.match(/^(.*?)\s*(mm|cm|m|in|\")$/i);
 if(suffix)return scalar(suffix[1])*(suffix[2]==='"'?25.4:unitInfo(suffix[2].toLowerCase()).scale);
 return scalar(text)*info.scale;
}
export function formatMeasurement(value,unit='mm',precision=2,{input=false}={}) {
 if(value===null||!Number.isFinite(value))return '';
 const info=unitInfo(unit)||unitInfo();const n=value/info.scale;
 const digits=input?6:Math.max(0,Math.min(6,Number(precision)));
 const decimal=v=>Number(v.toFixed(digits)).toString();
 const fraction=v=>{let ticks=Math.round(v*64),whole=Math.floor(ticks/64),num=ticks%64,den=64;while(num&&num%2===0){num/=2;den/=2;}return num?`${whole?whole+' ':''}${num}/${den}`:String(whole);};
 if(unit.startsWith('ft-in')){const rounded=unit.endsWith('frac')&&!input?Math.round(n*64)/64:Number(n.toFixed(digits));const feet=Math.floor(rounded/12),inches=rounded-feet*12;return `${feet}' ${unit.endsWith('frac')&&!input?fraction(inches):decimal(inches)}"`;}
 if(unit==='in-frac'&&!input)return fraction(n);
 return decimal(n);
}
export function formatArea(value,unit='mm',precision=2){
 const info=unitInfo(unit)||unitInfo();const scale=unit.startsWith('ft-in')?304.8:info.scale;
 return `${Number((value/(scale*scale)).toFixed(precision))} ${info.area}`;
}
