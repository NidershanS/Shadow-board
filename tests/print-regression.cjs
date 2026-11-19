// Run with Playwright available in NODE_PATH; the app itself needs no build.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});try{const page=await browser.newPage();await page.goto('file:///'+path.resolve(__dirname,'../outputs/index.html').replaceAll('\\','/'));
const result=await page.evaluate(()=>{
 const cut=[{points:[{x:20,y:30},{x:50,y:30},{x:50,y:100},{x:20,y:100},{x:20,y:30}],depth:15}];
 const stl=makePrintableShellStl(cut,{w:200,h:160},{thickness:18,wall:2,pitch:2,chamfer:.3});
 if(!stl.manifold.passed || !stl.orientation.passed)throw Error('Valid board rejected');
 const corrupt=stl.content.slice(0,stl.content.byteLength-50);new DataView(corrupt).setUint32(80,new DataView(corrupt).getUint32(80,true)-1,true);
 if(meshAudit(corrupt).passed)throw Error('Open mesh accepted');
 const flipped=stl.content.slice(0),v=new DataView(flipped);const base=84+12;const a=[0,1,2].map(k=>[0,1,2].map(c=>v.getFloat32(base+k*12+c*4,true)));for(let c=0;c<3;c++){v.setFloat32(base+12+c*4,a[2][c],true);v.setFloat32(base+24+c*4,a[1][c],true);}
 if(meshAudit(flipped).passed)throw Error('Bad winding accepted');
 const loop=cut[0].points.slice(0,-1),t=triangulatePolygonWithHoles(loop,[]).map(t=>t.map(p=>({x:p.x,y:160-p.y,z:3}))),floors=[{loop,start:0,end:t.length}];
 checkPocketOrientation(makeBinaryStl(t,'fixture'),floors,{h:160});let rejected=false;
 try{checkPocketOrientation(makeBinaryStl(t.map(t=>t.map(p=>({...p,y:160-p.y}))),'mirrored'),floors,{h:160});}catch{rejected=true;}if(!rejected)throw Error('Mirrored pocket accepted');
 const label=makePrintableShellStl([],{w:70,h:50},{thickness:18,wall:2,pitch:2,labelLoops:labelLoopsFor('B1',15,15),name:'B1'});
 if(!label.manifold.passed || label.labelDropped || !label.labeled)throw Error('Label not integrated');
 return {orientation:stl.orientation,manifold:stl.manifold,openMeshBlocked:true,reversedFaceBlocked:true,mirroredPocketBlocked:true,label:{bodies:label.manifold.bodies,labeled:label.labeled}};
});console.log(JSON.stringify(result,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
