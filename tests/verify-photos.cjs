const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
(async()=>{
const repo=path.resolve(__dirname,'..'), root=path.resolve(process.argv[3]||'photo-verification');
const mode='verified';
if(!process.argv[2]) throw Error('Usage: node tests/verify-photos.cjs <photo-directory> [report-directory]');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const page=await browser.newPage();
await page.goto('file:///'+path.join(repo,'outputs/index.html').replaceAll('\\','/'));
const names=['20260629_111626.jpg','20260629_111459.jpg','20260629_111517.jpg','20260629_110314.jpg','20260629_111722.jpg','20260629_111912.jpg','WhatsApp Image 2026-06-29 at 11.30.20 AM (1).jpeg','WhatsApp Image 2026-06-29 at 11.30.20 AM.jpeg'];
const results=[];fs.mkdirSync(path.join(root,'outputs',mode),{recursive:true});
for(let k=0;k<names.length;k++){
const name=names[k],b64=fs.readFileSync(path.join(process.argv[2],name)).toString('base64');
const result=await page.evaluate(async({name,b64})=>{
const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],name,{type:'image/jpeg'});
const start=performance.now();const img=await loadImage(file);const page=await detectAndRectify(img,null);const parts=segmentTools(page.canvas,Number(el.metalRepairInput.value));
const ms=performance.now()-start;
const g=page.canvas.getContext('2d');g.strokeStyle='#00ff80';g.lineWidth=3;
const tools=parts.map(p=>{const raw=traceMask(p.mask,p.w,p.h);const contour=(typeof smoothDetectionContour === "function" ? smoothDetectionContour : smoothContour)(raw,Number(el.spacingInput.value),Number(el.smoothInput.value));const norm=normalizeMm(contour);g.beginPath();contour.forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();g.stroke();const cut=(typeof smoothDetectionContour === "function" ? smoothDetectionContour : smoothContour)(traceMask(boxDilate(p.mask,p.w,p.h,Number(el.offsetInput.value)*PROC_PX_PER_MM),p.w,p.h),Number(el.spacingInput.value),Number(el.smoothInput.value));const pocket=normalizeMm(cut);return {raw:[norm.height,norm.width],pocket:[pocket.height,pocket.width],confidence:p.confidence,metrics:p.metrics};});
el.offsetInput.value='0'; const fullStart=performance.now(); const processed=await processFile(file,0,null); const fullMs=performance.now()-fullStart; el.offsetInput.value='2';
if(processed.length!==tools.length) throw Error('processFile count mismatch');
for(let i=0;i<tools.length;i++) if(Math.abs(processed[i].height-tools[i].raw[0])>.001) throw Error('pipeline mismatch');
return {name,ms,fullMs,corners:page.corners,paperConfidence:page.confidence,tools,overlay:page.canvas.toDataURL()};
},{name,b64});
fs.writeFileSync(path.join(root,'outputs',mode,`${k+1}.png`),Buffer.from(result.overlay.split(',')[1],'base64'));delete result.overlay;
if(result.tools.length!==1) throw Error(name+': expected one tool');
if(k===4 && (result.tools[0].raw[0]<200 || result.tools[0].raw[0]>220)) throw Error('Scissors length outside 200–220 mm');
results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(root,'outputs',mode,'results.json'),JSON.stringify(results,null,2));await browser.close();
})();
