const assert=require('node:assert/strict'),path=require('path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});try{const page=await browser.newPage();await page.goto('file:///'+path.resolve(__dirname,'../outputs/index.html').replaceAll('\\','/'));const result=await page.evaluate(async()=>{
 const estimate={grams:10,hours:1,printedMm3:100,solidMm3:100,skinMm3:50,perimeterMm3:20,shellMm3:70,infillMm3:30};
 const calls=[];let release;buildShellStl=async(cuts,drawer,settings)=>{calls.push(settings.profile.perimeters);if(calls.length===1)await new Promise(resolve=>release=resolve);else throw Error('Injected tile failure');return {estimate};};
 planTileExport=()=>({jobs:[{cuts:[],drawer:{w:40,h:40},settings:printSettings()}]});
 document.getElementById('print-perimeters').value=3;
 const promise=preparePrintModels({ents:[],drawer:{w:100,h:100}});
 document.getElementById('print-perimeters').value=6;release();const model=await promise;
 return {calls,profile:model.profile.perimeters,board:model.whole.grams,tileError:model.tileError,tiles:model.tiles,cached:!!state.printModels};
 });assert.deepEqual(result,{calls:[3,3],profile:3,board:10,tileError:'Injected tile failure',tiles:null,cached:false});console.log('Print snapshot and independent board export checks passed.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
