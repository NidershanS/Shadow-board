const fs=require('fs');const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});const p=await b.newPage();await p.goto('file:///'+path.resolve(__dirname,'../outputs/index.html').replaceAll('\\','/'));
const results=await p.evaluate(()=>{
 const out=[];
 for(const type of ['plain','shadow','hard-shadow','two','hole','fragment','pale','pale-tip']) {
 const c=document.createElement('canvas');c.width=1050;c.height=1485;const g=c.getContext('2d');g.fillStyle='rgb(225,228,230)';g.fillRect(0,0,c.width,c.height);
 if(type==='shadow'||type==='hard-shadow') {if(type==='shadow')g.filter='blur(15px)';const a=g.createLinearGradient(400,0,490,0);a.addColorStop(0,'rgb(145,148,150)');a.addColorStop(1,'rgb(225,228,230)');g.fillStyle=a;g.fillRect(400,300,90,500);g.filter="none";}
 g.fillStyle=type==='pale'?'rgb(198,201,203)':'#303030';g.fillRect(200,300,200,500);
 if(type==='pale-tip'){g.fillStyle='rgb(198,201,203)';g.beginPath();g.moveTo(285,798);g.lineTo(315,798);g.lineTo(300,990);g.closePath();g.fill();}
 if(type==='two'){g.fillStyle='#303030';g.fillRect(600,300,150,300);}
 if(type==='hole'){g.fillStyle='rgb(225,228,230)';g.fillRect(250,400,100,300);}
 if(type==='fragment'){g.fillStyle='#303030';g.fillRect(700,1000,20,20);}
 const parts=segmentTools(c,7);const boxes=parts.map(x=>maskBBoxMm(x.mask,x.w,x.h));
 if(parts.length!==(type==='two'?2:1)) throw Error(type+' count '+parts.length);
 if(type==='hole'&&!parts[0].mask[500*1050+300]) throw Error('hole unfilled');
 if(type.includes('shadow') && Math.abs(boxes[0].w-40)>1.5) throw Error('cast shadow affected tool width '+boxes[0].w);
 if(type==='pale-tip' && boxes[0].h<136) throw Error('pale tip cut short '+boxes[0].h);
 out.push({type,boxes,shadowExcessMm:type.includes('shadow')?boxes[0].w-40:undefined});
 }
 return out;
});console.log(JSON.stringify(results,null,2));await b.close();})();
