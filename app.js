
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const DB="pdf-schreibapp", STORE="docs";
const $=s=>document.querySelector(s);
let db, docs=[], selected=new Set(), current=null, pdf=null, page=1, drawing=false, points=[], annotations={};
let width=2, sensitivity=.7;

const openDB=()=>new Promise((res,rej)=>{
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id"});
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error)
});
const tx=(mode="readonly")=>db.transaction(STORE,mode).objectStore(STORE);
const all=()=>new Promise(res=>{let r=tx().getAll();r.onsuccess=()=>res(r.result)});
const put=x=>new Promise(res=>{let r=tx("readwrite").put(x);r.onsuccess=()=>res()});
const del=id=>new Promise(res=>{let r=tx("readwrite").delete(id);r.onsuccess=()=>res()});
const dateISO=()=>new Date().toISOString().slice(0,10);

async function refresh(){
  docs=(await all()).sort((a,b)=>b.modified-a.modified);
  render()
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase();
  return docs.filter(d=>!q||d.name.toLowerCase().includes(q)||new Date(d.modified).toLocaleDateString("de-DE").includes(q))
}
function render(){
  const lib=$("#library"); lib.innerHTML="";
  const list=filtered(); $("#count").textContent=`${list.length} Dokumente`;
  $("#status").textContent=selected.size?`${selected.size} markiert`:"Lange drücken = markieren";
  list.forEach(d=>{
    const card=document.createElement("div");card.className="card"+(selected.has(d.id)?" selected":"");
    const img=document.createElement("canvas");img.className="thumb";
    card.append(img);
    const text=document.createElement("div");text.innerHTML=`<h3>${esc(d.name)}</h3><small>${new Date(d.modified).toLocaleDateString("de-DE")}</small>`;card.append(text);
    makeThumb(d,img);
    let timer;
    card.addEventListener("pointerdown",()=>timer=setTimeout(()=>{selected.has(d.id)?selected.delete(d.id):selected.add(d.id);render()},550));
    card.addEventListener("pointerup",()=>clearTimeout(timer));
    card.addEventListener("pointercancel",()=>clearTimeout(timer));
    card.addEventListener("click",()=>openDoc(d));
    lib.append(card)
  })
}
async function makeThumb(d,c){
  try{
    const p=await pdfjsLib.getDocument({data:d.data.slice(0)}).promise,pg=await p.getPage(1),v=pg.getViewport({scale:.35});
    c.width=v.width;c.height=v.height;await pg.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
    drawSaved(c.getContext("2d"),d.ann?.[1]||[],c.width,c.height,d.baseW?.[1],d.baseH?.[1])
  }catch{}
}
function esc(s){return s.replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}

$("#importBtn").onclick=()=>$("#fileInput").click();
$("#fileInput").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  window.pendingFile=f;$("#nameInput").value=f.name.replace(/\.pdf$/i,"");$("#nameDialog").showModal()
};
$("#nameOk").onclick=async()=>{
  const f=window.pendingFile;if(!f)return;
  const arr=await f.arrayBuffer(), name=($("#nameInput").value.trim()||"PDF")+"_"+dateISO()+".pdf";
  await put({id:crypto.randomUUID(),name,data:arr,modified:Date.now(),ann:{},baseW:{},baseH:{}});await refresh()
};
$("#gridBtn").onclick=()=>{$("#library").className="grid";localStorage.view="grid"};
$("#listBtn").onclick=()=>{$("#library").className="list";localStorage.view="list"};
$("#deleteBtn").onclick=async()=>{if(!selected.size)return;if(confirm(`${selected.size} PDF(s) löschen?`)){for(const id of selected)await del(id);selected.clear();refresh()}};
$("#search").oninput=render;

async function openDoc(d){
  current=d;annotations=d.ann||{};$("#editor").hidden=false;$("#editorTitle").textContent=d.name;
  pdf=await pdfjsLib.getDocument({data:d.data.slice(0)}).promise;page=1;renderPage()
}
async function renderPage(){
  const pg=await pdf.getPage(page), stage=$("#pdfStage");
  const scale=Math.max(.3,(stage.clientWidth-10)/pg.getViewport({scale:1}).width);
  const v=pg.getViewport({scale});
  const c=$("#pdfCanvas"),ink=$("#inkCanvas");
  c.width=ink.width=v.width;c.height=ink.height=v.height;
  c.style.width=ink.style.width=v.width+"px";c.style.height=ink.style.height=v.height+"px";
  current.baseW=current.baseW||{};current.baseH=current.baseH||{};current.baseW[page]=v.width;current.baseH[page]=v.height;
  await pg.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
  const x=ink.getContext("2d");x.clearRect(0,0,ink.width,ink.height);drawSaved(x,annotations[page]||[],ink.width,ink.height,current.baseW[page],current.baseH[page]);
  $("#pageInfo").textContent=`Seite ${page} / ${pdf.numPages}`;
}
function drawSaved(ctx,strokes,w,h,bw=w,bh=h){
  const sx=w/(bw||w),sy=h/(bh||h);ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#000";
  strokes.forEach(st=>{if(st.p.length<2)return;ctx.beginPath();ctx.moveTo(st.p[0].x*sx,st.p[0].y*sy);for(let i=1;i<st.p.length;i++){ctx.lineWidth=(st.w[i]||st.base||2)*sx;ctx.lineTo(st.p[i].x*sx,st.p[i].y*sy)}ctx.stroke()})
}
const ink=$("#inkCanvas");
ink.addEventListener("pointerdown",e=>{
  if(e.pointerType==="pen"){drawing=true;points=[pt(e)];ink.setPointerCapture(e.pointerId)}
});
ink.addEventListener("pointermove",e=>{
  if(!drawing||e.pointerType!=="pen")return; const p=pt(e), prev=points.at(-1),ctx=ink.getContext("2d");
  const pw=width*(1+((Math.max(.05,e.pressure)-.5)*1.8*sensitivity));p.w=Math.max(.5,pw);
  ctx.strokeStyle="#000";ctx.lineCap="round";ctx.lineWidth=p.w;ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();points.push(p)
});
ink.addEventListener("pointerup",e=>{
  if(drawing){drawing=false;(annotations[page]??=[]).push({p:points.map(({x,y})=>({x,y})),w:points.map(x=>x.w||width),base:width});saveState()}
});
function pt(e){const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)*ink.width/r.width,y:(e.clientY-r.top)*ink.height/r.height,w:width}}
let sy=0;
ink.addEventListener("touchstart",e=>{if(e.touches.length===1)sy=e.touches[0].clientY},{passive:true});
ink.addEventListener("touchend",e=>{const y=e.changedTouches[0]?.clientY??sy,d=y-sy;if(Math.abs(d)>120){if(d<0&&page<pdf.numPages)page++;if(d>0&&page>1)page--;renderPage()}},{passive:true});

async function saveState(){
  current.ann=annotations;current.modified=Date.now();await put(current)
}
$("#backBtn").onclick=async()=>{await saveState();$("#editor").hidden=true;await refresh()};
$("#settingsBtn").onclick=()=>$("#settingsDialog").showModal();
$("#width").oninput=e=>width=+e.target.value;$("#pressure").oninput=e=>sensitivity=+e.target.value;
$("#renameBtn").onclick=async()=>{const n=prompt("Neuer Dateiname",current.name.replace(/\.pdf$/i,""));if(n){current.name=n.replace(/\.pdf$/i,"")+".pdf";$("#editorTitle").textContent=current.name;await saveState()}};
$("#saveBtn").onclick=async()=>{
  await saveState();
  try{
    const out=await PDFDocument.load(current.data.slice(0));
    const pages=out.getPages();

    for(let i=0;i<pages.length;i++){
      const strokes=annotations[i+1]||[];
      if(!strokes.length)continue;

      const pageObj=pages[i];
      const {width:pw,height:ph}=pageObj.getSize();
      const bw=current.baseW?.[i+1]||pw;
      const bh=current.baseH?.[i+1]||ph;

      const c=document.createElement("canvas");
      c.width=Math.max(1,Math.round(bw*2));
      c.height=Math.max(1,Math.round(bh*2));
      const ctx=c.getContext("2d");
      ctx.scale(2,2);
      ctx.strokeStyle="#000";
      ctx.lineCap="round";ctx.lineJoin="round";

      strokes.forEach(st=>{
        if(!st.p||st.p.length<2)return;
        ctx.beginPath();
        ctx.moveTo(st.p[0].x,st.p[0].y);
        for(let j=1;j<st.p.length;j++){
          ctx.lineWidth=st.w?.[j]||st.base||2;
          ctx.lineTo(st.p[j].x,st.p[j].y);
        }
        ctx.stroke();
      });

      const png=await out.embedPng(c.toDataURL("image/png"));
      pageObj.drawImage(png,{x:0,y:0,width:pw,height:ph});
    }

    const bytes=await out.save();
    const blob=new Blob([bytes],{type:"application/pdf"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=current.name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }catch(err){
    alert("PDF-Export fehlgeschlagen: "+err.message);
  }
};

db=await openDB();
$("#library").className=localStorage.view==="list"?"list":"grid";
await refresh();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js");
