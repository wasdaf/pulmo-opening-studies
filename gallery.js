"use strict";
const el=id=>document.getElementById(id);
const player=el("film"),browse=el("browse"),menu=el("menu"),search=el("search"),results=el("results");
const dayFormat=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"long",day:"numeric",year:"numeric"});
const clockFormat=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"short"});
let items=[],selected=null,visible=[],restorePlay=false,alternate=false;
const text=(id,value)=>{el(id).textContent=value||""};
const size=bytes=>bytes<1e6?(bytes/1e3).toFixed(0)+" KB":(bytes/1e6).toFixed(1)+" MB";
function reveal(open,returnFocus=false){
  menu.hidden=!open;browse.setAttribute("aria-expanded",String(open));
  if(open){search.value="";list();search.focus();results.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"})}
  else if(returnFocus)browse.focus();
}
function list(){
  const q=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  visible=items.filter(x=>q.every(term=>[x.title,x.edition,x.displayDateTime,x.dateTime,x.kind].join(" ").toLowerCase().includes(term)));
  const frag=document.createDocumentFragment();let last="";
  for(const item of visible){
    const d=new Date(item.dateTime),day=dayFormat.format(d);
    if(day!==last){const h=document.createElement("div");h.className="group";h.setAttribute("role","presentation");h.textContent=day;frag.append(h);last=day}
    const row=document.createElement("button");row.type="button";row.tabIndex=-1;row.className="option";row.setAttribute("role","option");row.setAttribute("aria-selected",String(item.id===selected?.id));
    row.setAttribute("aria-label",item.title+", "+item.edition+", "+item.displayDateTime);
    const img=document.createElement("img");img.src=item.poster;img.loading="lazy";img.alt="";
    const label=document.createElement("span");label.className="opttext";
    const name=document.createElement("strong");name.textContent=item.title;
    const edition=document.createElement("small");edition.textContent=item.edition;label.append(name,edition);
    const date=document.createElement("span");date.className="optdate";date.textContent=clockFormat.format(d);
    row.append(img,label,date);row.onclick=()=>{select(item,true);reveal(false,true)};frag.append(row)
  }
  if(!visible.length){const line=document.createElement("div");line.className="empty";line.textContent="No matching previews.";frag.append(line)}
  results.replaceChildren(frag);
}
function select(item,save=false){
  if(!item)return;
  restorePlay=Boolean(selected&&!player.paused&&!player.ended);
  selected=item;alternate=Boolean(item.losslessUrl&&player.canPlayType('video/webm; codecs="vp9"'));
  player.pause();player.poster=item.poster;player.src=alternate?item.losslessUrl:item.url;player.load();
  text("title",item.title);document.title=item.title+" · Pulmo opening studies";
  text("note",item.description);el("note").hidden=!item.description;text("edition",item.edition);
  const date=el("date");date.dateTime=item.dateTime;date.textContent=item.displayDateTime;date.title=item.dateSource;
  text("spec",item.width+" × "+item.height+" · "+Number(item.fps.toFixed(2))+" fps · "+Number(item.duration.toFixed(1))+" s");
  const a=el("download");a.href=item.download;a.download=item.downloadName;a.hidden=false;a.textContent="Download "+(item.downloadName.split(".").pop().toUpperCase())+" · "+size(item.downloadBytes);
  el("expand").disabled=false;text("status","");
  const i=items.indexOf(item);el("newer").disabled=i<=0;el("older").disabled=i===items.length-1;
  const u=new URL(location);u.searchParams.set("preview",item.id);
  if(save&&u.href!==location.href)history.pushState(null,"",u);
}
browse.onclick=()=>reveal(menu.hidden);search.oninput=list;
document.addEventListener("pointerdown",e=>{if(!menu.hidden&&!e.target.closest(".picker"))reveal(false)});
document.addEventListener("keydown",e=>{
  if(menu.hidden){if(document.activeElement===browse&&e.key==="ArrowDown"){e.preventDefault();reveal(true)}return}
  if(e.key==="Escape"){e.preventDefault();reveal(false,true);return}
  const opts=[...results.querySelectorAll(".option")],i=opts.indexOf(document.activeElement);
  if(["ArrowDown","ArrowUp"].includes(e.key)&&opts.length){e.preventDefault();opts[Math.max(0,Math.min(opts.length-1,i+(e.key==="ArrowDown"?1:-1)))].focus()}
  if(i>=0&&["Home","End"].includes(e.key)){e.preventDefault();opts[e.key==="Home"?0:opts.length-1]?.focus()}
  if(document.activeElement===search&&e.key==="Enter"&&opts.length){e.preventDefault();opts[0].click()}
});
document.querySelector(".picker").addEventListener("focusout",e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))reveal(false)});
el("newer").onclick=()=>select(items[items.indexOf(selected)-1],true);
el("older").onclick=()=>select(items[items.indexOf(selected)+1],true);
el("expand").onclick=async()=>{try{if(el("stage").requestFullscreen)await el("stage").requestFullscreen();else if(player.webkitEnterFullscreen)player.webkitEnterFullscreen();else window.open(player.currentSrc,"_blank","noopener")}catch{if(player.webkitEnterFullscreen)player.webkitEnterFullscreen()}};
player.addEventListener("loadeddata",()=>{if(restorePlay){restorePlay=false;player.play().catch(()=>{})}});
player.addEventListener("error",()=>{if(alternate){alternate=false;player.src=selected.url;player.load()}else{text("status","Playback is unavailable in this browser. You can download the original above.")}});
const fromUrl=()=>items.find(x=>x.id===new URL(location).searchParams.get("preview"))||items[0];
window.addEventListener("popstate",()=>{if(items.length){reveal(false);select(fromUrl())}});
fetch("catalog.json").then(r=>{if(!r.ok)throw Error();return r.json()}).then(c=>{
  items=c.items.slice().sort((a,b)=>b.dateTime.localeCompare(a.dateTime)||b.id.localeCompare(a.id));
  if(!items.length)throw Error();text("count",String(items.length));browse.disabled=false;select(fromUrl());
}).catch(()=>text("status","The preview list could not be loaded. Reload to try again."));
