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
 const drawer={w:200,h:160};
 const shell=shellGeometry.build(cut,drawer,{thickness:18,wall:2});
 const mirrored=makeBinaryStl(readStlTriangles(stl.content).map(t=>t.map(p=>({...p,y:drawer.h-p.y}))),'mirrored');
 let rejected=false;
 try { checkTopOpenings(mirrored,shell.outline,shell.voids,drawer,'mirrored'); }
 catch { rejected=true; }
 if(!rejected)throw Error('Mirrored opening accepted');
 const tris=readStlTriangles(stl.content);
 function sampleZ(x,y) {
   return tris.flatMap(([a,b,c])=>{
     const ux=b.x-a.x, uy=b.y-a.y, vx=c.x-a.x, vy=c.y-a.y;
     const det=ux*vy-uy*vx;
     if (Math.abs(det)<1e-8) return [];
     const u=((x-a.x)*vy-(y-a.y)*vx)/det, v=(ux*(y-a.y)-uy*(x-a.x))/det;
     if (u<0||v<0||u+v>1) return [];
     return [+(a.z+u*(b.z-a.z)+v*(c.z-a.z)).toFixed(4)];
   }).sort((a,b)=>a-b);
 }
 for(const [x,y,expected] of [[35.3,94.2,[]],[100.3,40.2,[0,2.5]],[80.3,35.2,[0,18]],[1.3,35.2,[0,18]],[20.4,94.2,[]]]) {
   if(JSON.stringify(sampleZ(x,y))!==JSON.stringify(expected))throw Error('Unexpected cross section at '+x+','+y+': '+sampleZ(x,y));
 }
 const noRibs=makePrintableShellStl(cut,drawer,{thickness:18,wall:2,ribs:false});
 if(!(noRibs.volume<stl.volume))throw Error('Rib toggle failed');
 const opening=shellGeometry.opening(cut[0].points,[{x:20,y:60}],12);
 if(Math.min(...opening.map(p=>p.x))!==8)throw Error('Notch is not centered on the pocket edge');
 if(shellGeometry.dimensions({thickness:18},{depth:30}).depth!==18)throw Error('Wall depth cap failed');
 const label=makePrintableShellStl([],{w:70,h:50},{thickness:18,wall:2,pitch:2,labelLoops:labelLoopsFor('B1',15,15),name:'B1'});
 if(!label.manifold.passed || label.labelDropped || !label.labeled)throw Error('Label not integrated');
 return {orientation:stl.orientation,manifold:stl.manifold,openMeshBlocked:true,reversedFaceBlocked:true,mirroredPocketBlocked:true,label:{bodies:label.manifold.bodies,labeled:label.labeled}};
});console.log(JSON.stringify(result,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
