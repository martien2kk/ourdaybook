const themes = {
  minimal:{bg:'#fffdf9',text:'#322f2c',accent:'#e86f61'},
  film:{bg:'#24211f',text:'#f9e9cd',accent:'#d5a756'},
  journal:{bg:'#f4ead7',text:'#4b3d31',accent:'#6f8b6b'}
}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.arc(x+r,y+r,r,Math.PI,1.5*Math.PI);ctx.arc(x+w-r,y+r,r,1.5*Math.PI,0);ctx.arc(x+w-r,y+h-r,r,0,.5*Math.PI);ctx.arc(x+r,y+h-r,r,.5*Math.PI,Math.PI);ctx.closePath()}
function drawImageCover(ctx,img,x,y,w,h){const ratio=Math.max(w/img.width,h/img.height);const sw=w/ratio;const sh=h/ratio;ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h)}
function polygon(ctx,points,color){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=color;ctx.fill()}
function tape(ctx,x,y,w,h,color,angle){ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(angle);ctx.fillStyle=color;ctx.globalAlpha=.82;ctx.fillRect(-w/2,-h/2,w,h);ctx.globalAlpha=.22;ctx.strokeStyle='#5d493d';ctx.lineWidth=1;for(let i=-w/2+5;i<w/2;i+=7){ctx.beginPath();ctx.moveTo(i,-h/2);ctx.lineTo(i+4,h/2);ctx.stroke()}ctx.restore()}
function heart(ctx,x,y,color){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+5);ctx.bezierCurveTo(x-10,y-4,x-12,y+9,x,y+17);ctx.bezierCurveTo(x+12,y+9,x+10,y-4,x,y+5);ctx.stroke();ctx.restore()}
function paperclip(ctx,x,y,color){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+14);ctx.bezierCurveTo(x-8,y+8,x-8,y-7,x,y-8);ctx.bezierCurveTo(x+7,y-8,x+8,y+5,x+2,y+9);ctx.bezierCurveTo(x-2,y+12,x-5,y+8,x-4,y+3);ctx.stroke();ctx.restore()}
function journalBackground(ctx,w,h){
  polygon(ctx,[[0,0],[72,0],[63,8],[47,5],[35,13],[19,8],[0,18]],'#ba674b')
  polygon(ctx,[[58,0],[143,0],[132,9],[116,6],[101,14],[82,7],[66,12]],'#567d78')
  polygon(ctx,[[w-92,0],[w,0],[w,17],[w-19,10],[w-34,15],[w-49,7],[w-67,13]],'#d0a44f')
  polygon(ctx,[[0,105],[12,98],[9,145],[15,162],[7,188],[0,181]],'#6c8175')
  polygon(ctx,[[w,245],[w-11,239],[w-8,270],[w-15,289],[w-6,309],[w,303]],'#bc6e4d')
  polygon(ctx,[[0,h-9],[38,h-14],[71,h-7],[108,h-13],[147,h-6],[191,h-12],[230,h-7],[277,h-13],[w,h-8],[w,h],[0,h]],'#c97b56')
}
function journalPhotoAccents(ctx,w){
  tape(ctx,16,82,42,12,'#b9674e',-.14)
  tape(ctx,w/2-20,82,39,12,'#d3aa63',.12)
  tape(ctx,w-59,82,43,12,'#5f837b',.15)
  tape(ctx,w/2-17,306,34,10,'#c87963',-.12)
  paperclip(ctx,w-17,184,'#355f69')
  paperclip(ctx,16,210,'#9b5a45')
  heart(ctx,w/2,300,'#a45e50')
  ctx.save();ctx.strokeStyle='#6e5a4a';ctx.lineWidth=1.4;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(8,68);ctx.quadraticCurveTo(18,78,10,90);ctx.stroke();ctx.beginPath();ctx.moveTo(w-8,326);ctx.quadraticCurveTo(w-18,316,w-10,304);ctx.stroke();ctx.setLineDash([]);ctx.restore()
}
function ellipsize(ctx,text,maxWidth,suffix='...',force=false){
  let value=String(text||'')
  if(!force&&ctx.measureText(value).width<=maxWidth)return value
  while(value&&ctx.measureText(value+suffix).width>maxWidth)value=value.slice(0,-1)
  return value+suffix
}
function singleLine(ctx,text,x,y,maxWidth){ctx.fillText(ellipsize(ctx,text,maxWidth),x,y)}
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines,showEllipsis=false){
  const value=String(text||'').slice(0,100),lines=[];let line='',index=0
  while(index<value.length&&lines.length<maxLines){
    const char=value[index]
    if(char==='\n'){lines.push(line);line='';index+=1;continue}
    const test=line+char
    if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line='';continue}
    line=test;index+=1
  }
  if(line&&lines.length<maxLines)lines.push(line)
  const truncated=index<value.length
  if(showEllipsis&&truncated&&lines.length)lines[lines.length-1]=ellipsize(ctx,lines[lines.length-1],maxWidth,'...',true)
  lines.forEach((item,row)=>ctx.fillText(item,x,y+row*lineHeight))
}
function sprockets(ctx,w,y){ctx.fillStyle='#090909';for(let x=18;x<w-12;x+=25){rounded(ctx,x,y,13,11,3);ctx.fill()}}
function sideSprockets(ctx,x,y,height){
  ctx.save();ctx.lineWidth=.8
  for(let top=y;top<y+height-12;top+=28){
    rounded(ctx,x,top,13,18,3);ctx.fillStyle='#3a342c';ctx.fill();ctx.strokeStyle='rgba(224,174,111,.52)';ctx.stroke()
    ctx.fillStyle='rgba(255,224,172,.16)';ctx.fillRect(x+3,top+3,7,2)
  }
  ctx.restore()
}
function filmEdgeTicks(ctx,x,y,height,direction){
  ctx.save();ctx.strokeStyle='rgba(214,157,91,.62)';ctx.lineWidth=.8
  for(let top=y;top<y+height;top+=9){const len=(top-y)%27===0?7:3;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x+direction*len,top);ctx.stroke()}
  ctx.restore()
}
function filmFrame(ctx,x,y,w,h){
  ctx.fillStyle='#0b0a09';ctx.fillRect(x,y,w,h)
  ctx.strokeStyle='rgba(204,147,84,.68)';ctx.lineWidth=1.1;ctx.strokeRect(x+.5,y+.5,w-1,h-1)
  ctx.strokeStyle='rgba(234,192,132,.2)';ctx.lineWidth=.7;ctx.strokeRect(x+5.5,y+5.5,w-11,h-11)
}
function filmRoll(ctx,x,y){
  ctx.save();ctx.strokeStyle='#c38b54';ctx.fillStyle='#171513';ctx.lineWidth=1.5
  ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke()
  for(let a=0;a<Math.PI*2;a+=Math.PI/3){ctx.beginPath();ctx.arc(x+Math.cos(a)*11,y+Math.sin(a)*11,2.2,0,Math.PI*2);ctx.stroke()}
  ctx.beginPath();ctx.moveTo(x+17,y+4);ctx.bezierCurveTo(x+43,y+3,x+39,y+25,x+67,y+20);ctx.bezierCurveTo(x+84,y+17,x+85,y+31,x+104,y+27);ctx.stroke();ctx.restore()
}
function camera(ctx,x,y){
  ctx.save();ctx.strokeStyle='#c38b54';ctx.fillStyle='rgba(201,146,88,.06)';ctx.lineWidth=1.5;rounded(ctx,x,y,70,42,6);ctx.fill();ctx.stroke();rounded(ctx,x+9,y-8,22,9,2);ctx.stroke();ctx.beginPath();ctx.arc(x+39,y+21,14,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x+39,y+21,8,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x+39,y+21,3,0,Math.PI*2);ctx.stroke();rounded(ctx,x+57,y+7,7,5,1);ctx.stroke();ctx.beginPath();ctx.moveTo(x+5,y+11);ctx.lineTo(x+21,y+11);ctx.stroke();ctx.restore()
}
function stamp(ctx,x,y,w,h,color,angle){
  ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(angle);ctx.fillStyle='rgba(255,250,235,.54)';ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.fillRect(-w/2,-h/2,w,h);ctx.strokeRect(-w/2,-h/2,w,h);ctx.strokeRect(-w/2+4,-h/2+4,w-8,h-8);heart(ctx,0,-7,color);ctx.beginPath();ctx.moveTo(-9,8);ctx.lineTo(9,8);ctx.stroke();ctx.restore()
}
function postalMark(ctx,x,y,color){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,20,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.stroke();ctx.font='6px sans-serif';ctx.fillStyle=color;ctx.fillText('OUR DAYBOOK',x-19,y+3);for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(x+19,y-9+i*6);ctx.lineTo(x+54,y-5+i*6);ctx.stroke()}ctx.restore()
}
function tornPatch(ctx,points,color){
  polygon(ctx,points,color);ctx.save();ctx.strokeStyle='rgba(86,65,48,.22)';ctx.lineWidth=1;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.stroke();ctx.restore()
}
function renderJournalFull(ctx,canvas,memory,images,showLocation){
  const w=canvas.width,h=canvas.height
  ctx.fillStyle='#f4ecdd';ctx.fillRect(0,0,w,h)
  ctx.fillStyle='#fff8e9';rounded(ctx,14,14,w-28,h-28,12);ctx.fill();ctx.strokeStyle='rgba(107,82,58,.18)';ctx.lineWidth=1;ctx.stroke()
  tornPatch(ctx,[[15,15],[98,15],[91,27],[77,23],[64,34],[48,27],[34,39],[15,32]],'#b85f47')
  tornPatch(ctx,[[82,15],[190,15],[181,29],[165,24],[151,37],[132,28],[116,35],[101,25]],'#517c76')
  tornPatch(ctx,[[w-117,15],[w-15,15],[w-15,43],[w-34,35],[w-51,47],[w-70,33],[w-88,42]],'#d0a04d')
  tornPatch(ctx,[[15,h-65],[73,h-80],[123,h-64],[174,h-82],[225,h-67],[278,h-81],[w-15,h-70],[w-15,h-15],[15,h-15]],'#bd654a')
  tornPatch(ctx,[[w-119,h-145],[w-15,h-169],[w-15,h-67],[w-60,h-78],[w-79,h-67]],'#d8bd82')
  tape(ctx,52,80,44,13,'#b9604d',-.18);tape(ctx,w/2-22,78,44,13,'#d7ad61',.18);tape(ctx,w-96,80,43,13,'#5e837a',.14)
  postalMark(ctx,w-72,55,'#75604f');stamp(ctx,w-55,107,30,42,'#b35e4c',.16);stamp(ctx,29,500,34,47,'#66836b',-.1)
  paperclip(ctx,26,180,'#5f7773');paperclip(ctx,w-20,335,'#9c604d');heart(ctx,w-67,h-102,'#a95648')
  ctx.fillStyle='#6f8b6b';ctx.font='600 12px sans-serif';ctx.fillText(memory.dateKey,60,69)
  ctx.fillStyle='#4b3d31';ctx.font='bold 18px sans-serif';wrapText(ctx,memory.task.prompt.text,58,94,w-116,22,2)
  const gap=13,x1=49,photoY=126,photoH=260,photoW=(w-98-gap)/2
  images.forEach((img,i)=>{const x=x1+i*(photoW+gap);ctx.save();rounded(ctx,x,photoY,photoW,photoH,4);ctx.clip();drawImageCover(ctx,img,x,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle='rgba(87,64,45,.28)';ctx.lineWidth=1;ctx.strokeRect(x+.5,photoY+.5,photoW-1,photoH-1);tape(ctx,x+photoW/2-17,photoY-8,34,12,i?'#dbc47c':'#d89b7e',i?-.15:.15)})
  const colW=(w-86)/2
  memory.entries.forEach((entry,i)=>{const x=43+i*(colW+10);let y=412;ctx.fillStyle='#4b3d31';ctx.font='11px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',x,y,colW-8,17,6);if(showLocation&&entry.city){ctx.fillStyle='#6f8b6b';ctx.font='10px sans-serif';ctx.fillText(String(entry.city).slice(0,16),x,518)}})
  ctx.fillStyle='#66574a';ctx.font='12px sans-serif';ctx.fillText(memory.shareText.slice(0,38),42,550)
  ctx.fillStyle='#6f8b6b';ctx.font='13px sans-serif';ctx.fillText('OUR DAYBOOK',42,578)
  ctx.save();ctx.strokeStyle='#bd6653';ctx.lineWidth=1.4;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(23,110);ctx.quadraticCurveTo(8,200,24,285);ctx.stroke();ctx.beginPath();ctx.moveTo(w-25,185);ctx.quadraticCurveTo(w-8,270,w-27,365);ctx.stroke();ctx.setLineDash([]);ctx.restore()
  ctx.fillStyle='#806c58';ctx.font='italic 16px serif';ctx.fillText('nice day',w-106,h-90)
}
function ginghamTape(ctx,x,y,w,h,angle,color){
  ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(angle);ctx.globalAlpha=.88;ctx.fillStyle='#eee2b9';ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle=color
  for(let px=-w/2;px<w/2;px+=8)ctx.fillRect(px,-h/2,4,h)
  ctx.globalAlpha=.42;for(let py=-h/2;py<h/2;py+=8)ctx.fillRect(-w/2,py,w,4)
  ctx.restore()
}
function flowerStamp(ctx,x,y,w,h,color,angle){
  ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(angle);ctx.fillStyle='#efe0b6';ctx.strokeStyle=color;ctx.lineWidth=1
  ctx.fillRect(-w/2,-h/2,w,h);ctx.setLineDash([2,2]);ctx.strokeRect(-w/2+1,-h/2+1,w-2,h-2);ctx.setLineDash([]);ctx.strokeRect(-w/2+5,-h/2+5,w-10,h-10)
  ctx.beginPath();ctx.moveTo(0,h/2-9);ctx.quadraticCurveTo(-2,1,0,-7);ctx.stroke()
  for(let a=0;a<Math.PI*2;a+=Math.PI/2){ctx.beginPath();ctx.ellipse(Math.cos(a)*5,-8+Math.sin(a)*5,4,7,a,0,Math.PI*2);ctx.fillStyle='rgba(177,92,72,.35)';ctx.fill();ctx.stroke()}
  ctx.beginPath();ctx.moveTo(0,4);ctx.quadraticCurveTo(-8,-1,-9,7);ctx.moveTo(0,7);ctx.quadraticCurveTo(8,1,9,9);ctx.stroke();ctx.restore()
}
function linedNote(ctx,x,y,w,h,angle){
  ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(angle);ctx.fillStyle='#eadab7';ctx.fillRect(-w/2,-h/2,w,h);ctx.strokeStyle='rgba(117,91,65,.22)';ctx.lineWidth=.8
  for(let py=-h/2+15;py<h/2;py+=13){ctx.beginPath();ctx.moveTo(-w/2+7,py);ctx.lineTo(w/2-7,py);ctx.stroke()}
  ctx.strokeStyle='#bd5d4c';ctx.lineWidth=1.5;heart(ctx,-w/2+22,-h/2+20,'#bd5d4c');ctx.font='italic 18px serif';ctx.fillStyle='#7a604d';ctx.fillText('nice',-10,5);ctx.fillText('day',8,24);ctx.restore()
}
function tinyDoodle(ctx,x,y,color,type){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.2
  if(type==='star'){ctx.beginPath();ctx.moveTo(x,y-7);ctx.lineTo(x+2,y-2);ctx.lineTo(x+7,y);ctx.lineTo(x+2,y+2);ctx.lineTo(x,y+7);ctx.lineTo(x-2,y+2);ctx.lineTo(x-7,y);ctx.lineTo(x-2,y-2);ctx.closePath();ctx.stroke()}
  else{ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.stroke();for(let a=0;a<Math.PI*2;a+=Math.PI/2){ctx.beginPath();ctx.ellipse(x+Math.cos(a)*6,y+Math.sin(a)*6,3,5,a,0,Math.PI*2);ctx.stroke()}}
  ctx.restore()
}
function renderJournalFullDetailed(ctx,canvas,memory,images,showLocation){
  const w=canvas.width,h=canvas.height
  ctx.fillStyle='#e9ddc9';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff8e9';rounded(ctx,7,7,w-14,h-14,10);ctx.fill();ctx.strokeStyle='rgba(94,70,48,.22)';ctx.stroke()
  tornPatch(ctx,[[8,8],[82,8],[75,20],[61,16],[48,28],[34,22],[22,35],[8,29]],'#b75c45')
  tornPatch(ctx,[[68,8],[178,8],[169,22],[153,17],[138,30],[119,21],[101,28],[84,18]],'#4e7872')
  tornPatch(ctx,[[160,8],[282,8],[270,24],[251,18],[236,30],[214,19],[197,27],[180,20]],'#d1a04c')
  tornPatch(ctx,[[w-96,8],[w-7,8],[w-7,34],[w-25,28],[w-40,39],[w-59,27],[w-77,34]],'#be6b50')
  tornPatch(ctx,[[7,184],[25,171],[19,219],[29,237],[18,263],[25,286],[7,280]],'#b95d46')
  tornPatch(ctx,[[7,482],[31,471],[25,518],[35,539],[22,567],[7,560]],'#527b73')
  tornPatch(ctx,[[7,h-30],[61,h-39],[111,h-29],[163,h-40],[217,h-31],[269,h-40],[w-7,h-34],[w-7,h-7],[7,h-7]],'#bd654a')
  tornPatch(ctx,[[w-115,h-176],[w-7,h-197],[w-7,h-75],[w-47,h-86],[w-73,h-70],[w-92,h-92]],'#d5bd85')
  ginghamTape(ctx,18,18,58,16,-.45,'#4d7d79');ginghamTape(ctx,w-83,151,67,16,.3,'#4e7d78');ginghamTape(ctx,7,424,62,17,-.18,'#c1984e');ginghamTape(ctx,w-55,h-58,54,17,.35,'#4e7d78')
  postalMark(ctx,w-78,47,'#6f5c4d');stamp(ctx,w-53,88,31,43,'#b15d4c',.15);flowerStamp(ctx,24,466,38,53,'#65836c',-.08);flowerStamp(ctx,15,h-111,42,57,'#69836b',-.12)
  ctx.save();ctx.strokeStyle='#bd6653';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(23,60);ctx.bezierCurveTo(7,79,33,91,15,111);ctx.bezierCurveTo(3,126,26,137,14,154);ctx.stroke();ctx.beginPath();ctx.moveTo(w-18,126);ctx.bezierCurveTo(w-4,145,w-29,158,w-13,176);ctx.bezierCurveTo(w-3,190,w-26,204,w-14,221);ctx.stroke();ctx.restore()
  tinyDoodle(ctx,35,131,'#ae5f50','star');tinyDoodle(ctx,w-34,143,'#ae5f50','star');tinyDoodle(ctx,27,315,'#527b73','flower');tinyDoodle(ctx,w-25,300,'#c58b47','star')
  ctx.fillStyle='#6f8b6b';ctx.font='600 11px sans-serif';ctx.fillText(memory.dateKey,55,66)
  ctx.fillStyle='#4b3d31';ctx.font='bold 17px sans-serif';wrapText(ctx,memory.task.prompt.text,53,91,w-106,21,2)
  const gap=12,x1=42,photoY=121,photoH=270,photoW=(w-84-gap)/2
  images.forEach((img,i)=>{const x=x1+i*(photoW+gap);ctx.save();rounded(ctx,x,photoY,photoW,photoH,3);ctx.clip();drawImageCover(ctx,img,x,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle='rgba(75,54,37,.3)';ctx.strokeRect(x+.5,photoY+.5,photoW-1,photoH-1);tape(ctx,x+photoW/2-19,photoY-8,38,13,i?'#dfc982':'#d99b7e',i?-.18:.18);ctx.fillStyle='#55483e';ctx.font='10px sans-serif';ctx.fillText(i?'1':'2',x+2,photoY+photoH+15)})
  paperclip(ctx,w/2-2,284,'#394e56');paperclip(ctx,25,516,'#4e5960');tape(ctx,31,374,28,11,'#cf846d',-.25);tape(ctx,w-61,378,31,11,'#d8b97e',.2)
  const colW=(w-76)/2
  memory.entries.forEach((entry,i)=>{const x=38+i*(colW+8);ctx.fillStyle='#6f8b6b';ctx.font='600 10px sans-serif';ctx.fillText(filmIdentity(memory,entry,i,showLocation,18),x,423);ctx.fillStyle='#5c4d42';ctx.font='10px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',x,442,colW-6,15,6)})
  ctx.fillStyle='#66574a';ctx.font='11px sans-serif';wrapText(ctx,memory.shareText,38,558,w-76,15,2);ctx.save();ctx.fillStyle='#6f8b6b';ctx.textAlign='center';ctx.font='12px sans-serif';ctx.fillText('OUR DAYBOOK',w/2,h-72);ctx.font='9px sans-serif';ctx.fillText('同日簿',w/2,h-59);ctx.restore()
  linedNote(ctx,w-125,h-160,112,105,-.04);heart(ctx,w/2,h-100,'#383b3b');tinyDoodle(ctx,29,h-149,'#b45d4c','star')
}
function notesIcon(ctx,type,x,y,color){
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.7;ctx.lineCap='round';ctx.lineJoin='round'
  if(type==='back'){ctx.beginPath();ctx.moveTo(x+7,y-7);ctx.lineTo(x,y);ctx.lineTo(x+7,y+7);ctx.stroke()}
  if(type==='more'){[-7,0,7].forEach(dx=>{ctx.beginPath();ctx.arc(x+dx,y,1.6,0,Math.PI*2);ctx.fill()})}
  if(type==='check'){ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x-1,y+4);ctx.lineTo(x+5,y-4);ctx.stroke()}
  if(type==='camera'){rounded(ctx,x-10,y-7,20,15,3);ctx.stroke();ctx.strokeRect(x-4,y-10,8,4);ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke()}
  if(type==='pen'){ctx.beginPath();ctx.moveTo(x-7,y+7);ctx.lineTo(x+5,y-5);ctx.lineTo(x+8,y-2);ctx.lineTo(x-4,y+9);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(x-7,y+7);ctx.lineTo(x-9,y+10);ctx.lineTo(x-4,y+9);ctx.stroke()}
  if(type==='share'){ctx.strokeRect(x-8,y-5,16,14);ctx.beginPath();ctx.moveTo(x,y+1);ctx.lineTo(x,y-11);ctx.moveTo(x,y-11);ctx.lineTo(x-5,y-6);ctx.moveTo(x,y-11);ctx.lineTo(x+5,y-6);ctx.stroke()}
  ctx.restore()
}
function renderMinimalFull(ctx,canvas,memory,images,showLocation){
  const w=canvas.width,h=canvas.height;const yellow='#d99b18';const ink='#242322';const muted='#8b8985'
  ctx.fillStyle='#f2f1ed';ctx.fillRect(0,0,w,h)
  ctx.fillStyle='#fffefa';ctx.shadowColor='rgba(36,31,24,.12)';ctx.shadowBlur=12;rounded(ctx,10,10,w-20,h-20,12);ctx.fill();ctx.shadowBlur=0
  ctx.fillStyle='rgba(248,247,243,.96)';rounded(ctx,10,10,w-20,58,12);ctx.fill();ctx.fillRect(10,48,w-20,20)
  notesIcon(ctx,'back',28,39,yellow);ctx.fillStyle=yellow;ctx.font='14px sans-serif';ctx.fillText('OUR DAYBOOK',42,44)
  notesIcon(ctx,'share',w-76,39,yellow);notesIcon(ctx,'more',w-32,39,yellow)
  ctx.strokeStyle='rgba(74,69,62,.1)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(10,68);ctx.lineTo(w-10,68);ctx.stroke()
  ctx.fillStyle=muted;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(memory.dateKey+'  ·  MEMORY NOTE',w/2,91);ctx.textAlign='left'
  ctx.fillStyle=ink;ctx.font='bold 22px sans-serif';wrapText(ctx,memory.task.prompt.text,27,124,w-54,27,2)
  const gap=12,x1=27,photoY=184,photoH=215,photoW=(w-54-gap)/2
  images.forEach((img,i)=>{const x=x1+i*(photoW+gap);ctx.save();rounded(ctx,x,photoY,photoW,photoH,8);ctx.clip();drawImageCover(ctx,img,x,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle='rgba(35,32,28,.1)';ctx.strokeRect(x+.5,photoY+.5,photoW-1,photoH-1)})
  const colW=(w-66)/2
  memory.entries.forEach((entry,i)=>{const x=27+i*(colW+12);const y=423;ctx.fillStyle=ink;ctx.font='11px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',x,y,colW-5,16,7);if(showLocation&&entry.city){ctx.fillStyle=yellow;ctx.font='10px sans-serif';ctx.fillText('⌖ '+String(entry.city).slice(0,15),x,557)}})
  ctx.strokeStyle='rgba(74,69,62,.1)';ctx.beginPath();ctx.moveTo(27,575);ctx.lineTo(w-27,575);ctx.stroke()
  ctx.fillStyle=ink;ctx.font='12px sans-serif';wrapText(ctx,memory.shareText,27,599,w-54,18,2)
  ctx.fillStyle='#aaa7a1';ctx.font='10px sans-serif';ctx.fillText('OUR DAYBOOK',27,646)
  ctx.fillStyle='rgba(248,247,243,.98)';ctx.fillRect(10,h-51,w-20,41);ctx.strokeStyle='rgba(74,69,62,.1)';ctx.beginPath();ctx.moveTo(10,h-51);ctx.lineTo(w-10,h-51);ctx.stroke()
  notesIcon(ctx,'check',58,h-30,yellow);notesIcon(ctx,'camera',w/2,h-30,yellow);notesIcon(ctx,'pen',w-58,h-30,yellow)
}
function renderMinimalFullCard(ctx,canvas,memory,images,showLocation){
  const w=canvas.width,h=canvas.height;const paper='#fffdf9';const ink='#322f2c';const muted='#8a837c';const coral='#e86f61'
  ctx.fillStyle='#eee9e2';ctx.fillRect(0,0,w,h)
  ctx.save();ctx.shadowColor='rgba(67,55,44,.14)';ctx.shadowBlur=14;ctx.shadowOffsetY=4;ctx.fillStyle=paper;rounded(ctx,12,12,w-24,h-24,14);ctx.fill();ctx.restore()
  ctx.strokeStyle='rgba(83,71,61,.1)';ctx.lineWidth=1;rounded(ctx,12.5,12.5,w-25,h-25,14);ctx.stroke()
  ctx.fillStyle=coral;rounded(ctx,28,28,34,5,2.5);ctx.fill();ctx.fillStyle=muted;ctx.font='600 11px sans-serif';ctx.fillText(memory.dateKey,28,54)
  ctx.fillStyle=ink;ctx.font='bold 21px sans-serif';wrapText(ctx,memory.task.prompt.text,28,86,w-56,26,2)
  ctx.strokeStyle='rgba(232,111,97,.3)';ctx.beginPath();ctx.moveTo(28,116);ctx.lineTo(w-28,116);ctx.stroke()
  const gap=13,x1=28,photoY=137,photoH=260,photoW=(w-56-gap)/2
  images.forEach((img,i)=>{const x=x1+i*(photoW+gap);ctx.save();rounded(ctx,x,photoY,photoW,photoH,10);ctx.clip();drawImageCover(ctx,img,x,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle='rgba(73,63,55,.1)';ctx.lineWidth=1;rounded(ctx,x+.5,photoY+.5,photoW-1,photoH-1,10);ctx.stroke()})
  const colW=(w-69)/2
  memory.entries.forEach((entry,i)=>{const x=28+i*(colW+13);ctx.fillStyle=coral;ctx.font='600 10px sans-serif';ctx.fillText(filmIdentity(memory,entry,i,showLocation,18),x,421);ctx.fillStyle=ink;ctx.font='11px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',x,441,colW-4,16,7)})
  ctx.strokeStyle='rgba(83,71,61,.1)';ctx.beginPath();ctx.moveTo(28,570);ctx.lineTo(w-28,570);ctx.stroke()
  ctx.fillStyle=ink;ctx.font='12px sans-serif';wrapText(ctx,memory.shareText,28,596,w-56,18,2)
  ctx.save();ctx.fillStyle=coral;ctx.textAlign='center';ctx.font='600 11px sans-serif';ctx.fillText('OUR DAYBOOK',w/2,h-38);ctx.font='9px sans-serif';ctx.fillText('同日簿',w/2,h-23);ctx.restore()
  ctx.fillStyle='rgba(232,111,97,.12)';rounded(ctx,w-59,627,31,31,15.5);ctx.fill();ctx.strokeStyle=coral;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(w-43.5,642.5,5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(w-43.5,632);ctx.lineTo(w-43.5,637);ctx.stroke()
}
function entryNickname(memory,entry,index,maxLength){
  const users=Array.isArray(memory.users)?memory.users:[]
  const profile=users.find(item=>item.id===entry.userId)||users[index]||{}
  return String(profile.nickname||'我们').slice(0,maxLength)
}
function filmIdentity(memory,entry,index,showLocation,maxLength){
  const nickname=entryNickname(memory,entry,index,maxLength)
  const city=String(entry.city||'').trim()
  return (showLocation&&city?`${nickname} · ${city}`:nickname).slice(0,maxLength)
}
function renderFilmCompact(ctx,canvas,memory,images,showLocation){
  const w=canvas.width,h=canvas.height;ctx.fillStyle='#151412';ctx.fillRect(0,0,w,h)
  ctx.fillStyle='#d69a5d';ctx.font='600 12px sans-serif';ctx.fillText(memory.dateKey,22,27);ctx.fillStyle='#f3eadb';ctx.font='bold 16px sans-serif';wrapText(ctx,memory.task.prompt.text,22,51,w-44,20,2,true)
  const filmX=17,filmY=78,filmW=w-34,filmH=272;filmFrame(ctx,filmX,filmY,filmW,filmH)
  sideSprockets(ctx,26,101,222);sideSprockets(ctx,w-39,101,222)
  filmEdgeTicks(ctx,43,102,220,1);filmEdgeTicks(ctx,w-44,102,220,-1)
  ctx.fillStyle='#d79a57';ctx.font='10px sans-serif';ctx.fillText('FILM 400',52,96);ctx.fillText('16',w/2-5,96);ctx.fillText('FILM 400',w-105,96)
  const gap=10,x1=55,photoY=105,photoH=194,photoW=(w-110-gap)/2
  images.forEach((img,i)=>{const x=x1+i*(photoW+gap);ctx.save();rounded(ctx,x,photoY,photoW,photoH,4);ctx.clip();drawImageCover(ctx,img,x,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle='rgba(215,154,87,.68)';ctx.strokeRect(x,photoY,photoW,photoH)})
  ctx.save();ctx.fillStyle='#eee4d5';ctx.font='9px sans-serif';ctx.textAlign='center';memory.entries.forEach((entry,i)=>ctx.fillText(filmIdentity(memory,entry,i,showLocation,14),x1+photoW/2+i*(photoW+gap),317));ctx.restore()
  ctx.fillStyle='#d79a57';ctx.font='10px sans-serif';ctx.fillText('▶ 15A',52,338);ctx.fillText('16',w/2-5,338);ctx.fillText('16A ◀',w-98,338)
  const labelY=368;memory.entries.forEach((entry,i)=>{const x=23+i*(w/2-2);ctx.fillStyle='#eee4d5';ctx.font='10px sans-serif';singleLine(ctx,entry.caption||'今日一瞬',x,labelY,w/2-30)})
  ctx.fillStyle='#eee4d5';ctx.font='11px sans-serif';wrapText(ctx,memory.shareText,22,397,w-44,14,1,true);ctx.save();ctx.fillStyle='#d69a5d';ctx.textAlign='center';ctx.font='13px sans-serif';ctx.fillText('OUR DAYBOOK',w/2,419);ctx.font='9px sans-serif';ctx.fillText('同日簿',w/2,431);ctx.restore()
}
function renderFilmFull(ctx,canvas,memory,images,showLocation){
  const w=canvas.width,h=canvas.height;ctx.fillStyle='#151412';ctx.fillRect(0,0,w,h)
  ctx.strokeStyle='#b48350';ctx.lineWidth=1;ctx.strokeRect(16,16,w-32,h-32);ctx.fillStyle='#d69a5d';ctx.font='600 13px sans-serif';ctx.fillText(memory.dateKey,24,34)
  ctx.fillStyle='#f3eadb';ctx.font='bold 19px sans-serif';wrapText(ctx,memory.task.prompt.text,24,61,w-48,23,2)
  const filmX=17,filmY=88,filmW=w-34,filmH=304;filmFrame(ctx,filmX,filmY,filmW,filmH)
  sideSprockets(ctx,27,116,246);sideSprockets(ctx,w-40,116,246)
  filmEdgeTicks(ctx,44,117,242,1);filmEdgeTicks(ctx,w-45,117,242,-1)
  ctx.fillStyle='#d79a57';ctx.font='11px sans-serif';ctx.fillText('FILM 400',54,108);ctx.fillText('16',w/2-5,108);ctx.fillText('FILM 400',w-108,108)
  const gap=12,x1=56,photoY=120,photoH=220,photoW=(w-112-gap)/2
  images.forEach((img,i)=>{const x=x1+i*(photoW+gap);ctx.save();rounded(ctx,x,photoY,photoW,photoH,5);ctx.clip();drawImageCover(ctx,img,x,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle='rgba(215,154,87,.7)';ctx.strokeRect(x,photoY,photoW,photoH)})
  ctx.save();ctx.fillStyle='#eee4d5';ctx.font='10px sans-serif';ctx.textAlign='center';memory.entries.forEach((entry,i)=>ctx.fillText(filmIdentity(memory,entry,i,showLocation,18),x1+photoW/2+i*(photoW+gap),359));ctx.restore()
  ctx.fillStyle='#d79a57';ctx.font='11px sans-serif';ctx.fillText('▶ 15A',55,380);ctx.fillText('16',w/2-5,380);ctx.fillText('16A ◀',w-101,380)
  const colW=(w-70)/2
  memory.entries.forEach((entry,i)=>{const x=34+i*(colW+14);ctx.fillStyle='#d69a5d';ctx.font='10px sans-serif';ctx.fillText(i===0?'FRAME 02  /  MEMORY':'FRAME 01  /  MEMORY',x,410);ctx.strokeStyle='rgba(198,145,91,.3)';ctx.beginPath();ctx.moveTo(x,417);ctx.lineTo(x+colW-12,417);ctx.stroke();ctx.fillStyle='#e9dfd0';ctx.font='10.5px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',x,435,colW-12,16,8)})
  ctx.fillStyle='#eee4d5';ctx.font='12px sans-serif';wrapText(ctx,memory.shareText,24,574,w-48,16,2);ctx.save();ctx.fillStyle='#d69a5d';ctx.textAlign='center';ctx.font='15px sans-serif';ctx.fillText('OUR DAYBOOK',w/2,630);ctx.font='10px sans-serif';ctx.fillText('同日簿',w/2,647);ctx.restore()
  filmRoll(ctx,40,632);camera(ctx,w-96,608);ctx.font='9px sans-serif';ctx.fillText('ISO 400  ·  1/125',24,674)
}
function renderPersonalCard(ctx,canvas,memory,image,themeName,showLocation,full){
  const w=canvas.width,h=canvas.height,entry=memory.entries[0]||{},identity=filmIdentity(memory,entry,0,showLocation,24)
  // Compact cards need separate vertical zones for identity, caption and quote.
  // Keeping the photo slightly shorter prevents long text from drawing over
  // the user's name/city line.
  const photoX=full?35:28,photoY=full?137:105,photoW=w-photoX*2,photoH=full?300:190
  if(themeName==='film'){
    ctx.fillStyle='#151412';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#b48350';ctx.lineWidth=1;ctx.strokeRect(16,16,w-32,h-32)
    ctx.fillStyle='#d69a5d';ctx.font='600 12px sans-serif';ctx.fillText(memory.dateKey,24,36)
    ctx.fillStyle='#f3eadb';ctx.font=full?'bold 19px sans-serif':'bold 16px sans-serif';wrapText(ctx,memory.task.prompt.text,24,64,w-48,full?23:20,2,true)
    const frameY=photoY-17,frameH=photoH+62;filmFrame(ctx,18,frameY,w-36,frameH);sideSprockets(ctx,27,photoY,photoH);sideSprockets(ctx,w-40,photoY,photoH)
    filmEdgeTicks(ctx,44,photoY,photoH,1);filmEdgeTicks(ctx,w-45,photoY,photoH,-1)
    ctx.fillStyle='#d79a57';ctx.font='10px sans-serif';ctx.fillText('FILM 400',53,photoY-3);ctx.fillText('24',w-70,photoY-3)
    ctx.save();rounded(ctx,55,photoY,w-110,photoH,5);ctx.clip();drawImageCover(ctx,image,55,photoY,w-110,photoH);ctx.restore();ctx.strokeStyle='rgba(215,154,87,.7)';ctx.strokeRect(55,photoY,w-110,photoH)
    const identityY=photoY+photoH+20,filmNumberY=identityY+19,captionY=filmNumberY+22,quoteY=full?h-72:h-62
    ctx.fillStyle='#eee4d5';ctx.font='10px sans-serif';ctx.textAlign='center';singleLine(ctx,identity,w/2,identityY,w-112);ctx.textAlign='left';ctx.fillStyle='#d79a57';ctx.fillText('▶ 24A',55,filmNumberY);ctx.fillText('24A ◀',w-98,filmNumberY)
    ctx.fillStyle='#e9dfd0';ctx.font=full?'11px sans-serif':'10px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',28,captionY,w-56,full?18:15,full?5:1,true)
    ctx.fillStyle='#eee4d5';ctx.font='11px sans-serif';wrapText(ctx,memory.shareText,28,quoteY,w-56,16,full?2:1,true);ctx.fillStyle='#d69a5d';ctx.font='600 13px sans-serif';ctx.fillText('OUR DAYBOOK · MY DAYS',28,h-38);ctx.font='10px sans-serif';ctx.fillText('同日簿',28,h-23)
    if(full){filmRoll(ctx,42,h-47);camera(ctx,w-98,h-70)}
    return
  }
  const journal=themeName==='journal',t=themes[themeName]||themes.minimal
  ctx.fillStyle=journal?'#eee2cf':'#eee9e2';ctx.fillRect(0,0,w,h)
  ctx.fillStyle=journal?'#fff8e9':'#fffdf9';rounded(ctx,12,12,w-24,h-24,14);ctx.fill();ctx.strokeStyle=journal?'rgba(94,70,48,.2)':'rgba(83,71,61,.1)';ctx.stroke()
  if(journal){journalBackground(ctx,w,h);postalMark(ctx,w-76,53,'#75604f');stamp(ctx,w-53,91,29,40,'#b35e4c',.14);tape(ctx,w/2-28,photoY-8,56,14,'#d3aa63',-.08);paperclip(ctx,24,photoY+80,'#5f7773');heart(ctx,w-43,h-92,'#a95648')}
  ctx.fillStyle=t.accent;ctx.font='600 12px sans-serif';ctx.fillText(memory.dateKey,28,44)
  ctx.fillStyle=t.text;ctx.font=full?'bold 20px sans-serif':'bold 17px sans-serif';wrapText(ctx,memory.task.prompt.text,28,75,w-56,full?25:21,2,true)
  ctx.save();rounded(ctx,photoX,photoY,photoW,photoH,10);ctx.clip();drawImageCover(ctx,image,photoX,photoY,photoW,photoH);ctx.restore();ctx.strokeStyle=journal?'rgba(87,64,45,.28)':'rgba(73,63,55,.12)';rounded(ctx,photoX+.5,photoY+.5,photoW-1,photoH-1,10);ctx.stroke()
  const identityY=photoY+photoH+24,captionY=identityY+24,quoteY=full?h-72:h-62
  ctx.fillStyle=t.accent;ctx.font='600 10px sans-serif';singleLine(ctx,identity,photoX,identityY,photoW)
  ctx.fillStyle=t.text;ctx.font=full?'11px sans-serif':'10.5px sans-serif';wrapText(ctx,entry.caption||'今日一瞬',photoX,captionY,photoW,full?18:16,full?5:1,true)
  ctx.strokeStyle=journal?'rgba(107,82,58,.2)':'rgba(83,71,61,.1)';ctx.beginPath();ctx.moveTo(28,quoteY-18);ctx.lineTo(w-28,quoteY-18);ctx.stroke()
  ctx.fillStyle=t.text;ctx.font='12px sans-serif';wrapText(ctx,memory.shareText,28,quoteY,w-56,18,full?2:1,true);ctx.fillStyle=t.accent;ctx.font='600 11px sans-serif';ctx.fillText('OUR DAYBOOK · MY DAYS',28,h-38);ctx.font='10px sans-serif';ctx.fillText('同日簿',28,h-23)
}
async function render(selector,memory,themeName,options){
  if(options&&options.showQuote===false)memory=Object.assign({},memory,{shareText:''})
  const query=wx.createSelectorQuery();const canvas=await new Promise((resolve,reject)=>query.select(selector).fields({node:true,size:true}).exec(r=>r&&r[0]?resolve(r[0]):reject(new Error('Canvas 初始化失败'))))
  const node=canvas.node;const ctx=node.getContext('2d');const dpr=wx.getWindowInfo?wx.getWindowInfo().pixelRatio:2;node.width=canvas.width*dpr;node.height=canvas.height*dpr;ctx.scale(dpr,dpr)
  const load=path=>new Promise((resolve,reject)=>{const img=node.createImage();img.onload=()=>resolve(img);img.onerror=reject;img.src=path})
  const images=await Promise.all(memory.entries.map(e=>load(e.imagePath)))
  const showLocation=Boolean(options&&options.showLocation)
  if(memory.mode==='personal'&&images[0]){renderPersonalCard(ctx,canvas,memory,images[0],themeName,showLocation,Boolean(options&&options.full));return node}
  if(themeName==='film'){
    if(options&&options.full)renderFilmFull(ctx,canvas,memory,images,showLocation)
    else renderFilmCompact(ctx,canvas,memory,images,showLocation)
    return node
  }
  if(themeName==='journal'&&options&&options.full){renderJournalFullDetailed(ctx,canvas,memory,images,showLocation);return node}
  if(themeName==='minimal'&&options&&options.full){renderMinimalFullCard(ctx,canvas,memory,images,showLocation);return node}
  const t=themes[themeName]||themes.minimal;ctx.fillStyle=t.bg;ctx.fillRect(0,0,canvas.width,canvas.height);if(themeName==='journal')journalBackground(ctx,canvas.width,canvas.height);ctx.fillStyle=t.accent;ctx.font='600 13px sans-serif';ctx.fillText(memory.dateKey,24,32);ctx.fillStyle=t.text;ctx.font='bold 20px sans-serif';wrapText(ctx,memory.task.prompt.text,24,62,canvas.width-48,22,1,true)
  images.forEach((img,i)=>{const x=24+i*(canvas.width/2-4);const w=canvas.width/2-28;ctx.save();rounded(ctx,x,88,w,214,12);ctx.clip();drawImageCover(ctx,img,x,88,w,214);ctx.restore();ctx.fillStyle=t.accent;ctx.font='600 11px sans-serif';singleLine(ctx,filmIdentity(memory,memory.entries[i],i,showLocation,18),x,326,w);ctx.fillStyle=t.text;ctx.font='13px sans-serif';singleLine(ctx,memory.entries[i].caption||'今日一瞬',x,346,w)})
  if(themeName==='journal')journalPhotoAccents(ctx,canvas.width)
  ctx.fillStyle=t.text;ctx.font='12px sans-serif';wrapText(ctx,memory.shareText,24,386,canvas.width-48,16,1,true);ctx.save();ctx.fillStyle=t.accent;ctx.textAlign='center';ctx.font='600 12px sans-serif';ctx.fillText('OUR DAYBOOK',canvas.width/2,414);ctx.font='9px sans-serif';ctx.fillText('同日簿',canvas.width/2,428);ctx.restore()
  return node
}
function save(node){return new Promise((resolve,reject)=>wx.canvasToTempFilePath({canvas:node,success:r=>resolve(r.tempFilePath),fail:reject}))}
module.exports={themes,render,save}
