import {validate} from './optimizer.mjs';
const uid=()=>crypto.randomUUID();
export function sampleProject(){return ({version:1,id:uid(),name:'The weekend bookcase',parts:[['Side panels',720,380,2],['Shelves',564,360,4],['Doors',716,296,2],['Top & base',600,400,2]].map(([label,length,width,qty])=>({id:uid(),label,length,width,qty,material:'Birch plywood',grain:false,edges:''})),stock:[{id:uid(),label:'Birch plywood',length:2440,width:1220,qty:3,material:'Birch plywood'}],settings:{unit:'mm',kerf:3,trim:5,rotation:true,materials:true,singleSheet:false,priority:'material'}});}

export function emptyProject(unit = 'mm') {
 return {version:1,id:uid(),name:'',parts:[],stock:[],settings:{unit,kerf:3,trim:0,rotation:true,materials:true,singleSheet:false,priority:'material'}};
}
export function restoreProject(saved) {
 const current=saved?.current;
 if (!current || typeof current.name !== 'string' || validate(current,{draft:true}).length) return emptyProject();
 // Retire the old automatic sample without discarding edited projects or explicit sample loads.
 const withoutIDs=p=>JSON.stringify({name:p.name,parts:p.parts.map(({id,...row})=>row),stock:p.stock.map(({id,...row})=>row)});
 if (!saved.blankStart && withoutIDs(current)===withoutIDs(sampleProject())) return emptyProject(current.settings.unit);
 return current;
}
