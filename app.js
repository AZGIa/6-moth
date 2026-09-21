(function(){
"use strict";
var PLAN=window.PLAN, LEVELS=window.WORD_LEVELS;

var BANK=[],LVL=[];
LEVELS.forEach(function(L){
  var s=BANK.length;
  L.words.forEach(function(w){var p=w.split("|");BANK.push({en:p[0],ru:p[1]})});
  LVL.push({from:s,to:BANK.length,name:L.name,hint:L.hint});
});
var NWORDS=BANK.length, DAYS=182, IVL=[1,3,7,16,35,75,160,300];
var DOWS=["пн","вт","ср","чт","пт","сб","вс"];
var MON=["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
var TRACK={push:["push","повторов"],pull:["pull","повторов"],hs:["hs","секунд"],run:["km","км"]};
var CORE_IDS=["hs","push","pull","run","mob"];

var S={meta:{start:"2026-09-22"},checks:{},srs:{c:{},lastNew:-1},metrics:[],notes:{}};
var db=null, tab="today", weekView=null, dayView=null, planMode="week",
    sess=null, openPan=-1, focus=null, sheet=null, short=false, offset=0;

/* ── storage ────────────────────────── */
function lsG(k){try{var v=localStorage.getItem("c182."+k);return v?JSON.parse(v):null}catch(e){return null}}
function lsS(k,v){try{localStorage.setItem("c182."+k,JSON.stringify(v))}catch(e){}}
function pack(n){
  if(n==="meta")   return {start:S.meta.start};
  if(n==="checks") return {v:Object.keys(S.checks).join(",")};
  if(n==="srs")    return {v:Object.keys(S.srs.c).map(function(k){var a=S.srs.c[k];
                     return k+":"+a[0]+":"+a[1]+":"+a[2]}).join(","),lastNew:S.srs.lastNew};
  if(n==="notes")  return {v:JSON.stringify(S.notes)};
  return {v:JSON.stringify(S.metrics)};
}
function unpack(n,d){
  if(!d) return;
  if(n==="meta"){ if(d.start) S.meta.start=d.start; }
  else if(n==="checks"){var o={};(d.v||"").split(",").forEach(function(k){if(k)o[k]=1});S.checks=o}
  else if(n==="srs"){var c={};(d.v||"").split(",").forEach(function(s){if(!s)return;
    var p=s.split(":");c[p[0]]=[+p[1],+p[2],+p[3]]});S.srs={c:c,lastNew:d.lastNew==null?-1:d.lastNew}}
  else if(n==="notes"){try{S.notes=JSON.parse(d.v||"{}")}catch(e){}}
  else if(n==="metrics"){try{S.metrics=JSON.parse(d.v||"[]")}catch(e){}}
}
var DOCS=["meta","checks","srs","metrics","notes"],tm={},busy={};
function save(n){ lsS(n,pack(n)); clearTimeout(tm[n]); tm[n]=setTimeout(function(){flush(n)},700) }
function flush(n){
  if(!db) return;
  if(busy[n]){busy[n]="again";return}
  busy[n]=true;
  db.doc("state/"+n).set(pack(n))["catch"](function(){})
    .then(function(){var a=busy[n]==="again";busy[n]=false;if(a)flush(n)});
}
DOCS.forEach(function(n){unpack(n,lsG(n))});

/* ── dates ──────────────────────────── */
function pD(s){var p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2])}
function mid(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function rawIdx(){return Math.round((mid(new Date())-mid(pD(S.meta.start)))/86400000)}
function clamp(i){return Math.max(0,Math.min(DAYS-1,i))}
function today(){return clamp(rawIdx())}
function cur(){return clamp(today()+offset)}
function started(){return rawIdx()>=0}
function dateOf(i){var d=pD(S.meta.start);d.setDate(d.getDate()+i);return d}
function fmtD(d){return d.getDate()+" "+MON[d.getMonth()]}
function dayOf(i){i=clamp(i);return PLAN.weeks[Math.floor(i/7)].days[i%7]}
function weekOf(i){return PLAN.weeks[Math.floor(clamp(i)/7)]}
function plural(n,f){var m=n%100;if(m>=11&&m<=14)return f[2];m=n%10;
  return m===1?f[0]:(m>=2&&m<=4?f[1]:f[2])}

/* ── checks ─────────────────────────── */
function key(i,b,id){return i+"|"+b+"|"+id}
function allKeys(i){var d=dayOf(i),o=[];
  d.blocks.forEach(function(b,bi){b.items.forEach(function(it){o.push(key(i,bi,it.id))})});return o}
function pct(i){var k=allKeys(i);if(!k.length)return 0;var n=0;
  k.forEach(function(x){if(S.checks[x])n++});return n/k.length}
function toggle(i,b,id){var k=key(i,b,id);
  if(S.checks[k])delete S.checks[k];else{S.checks[k]=1;buzz(8)}
  save("checks")}
function buzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}
function streak(){var t=today(),n=0;
  for(var i=t;i>=0;i--){if(pct(i)>=0.7)n++;else if(i<t)break;else if(i===t)continue;else break}return n}
function doneDays(){var n=0;for(var i=0;i<=today();i++)if(pct(i)>=0.7)n++;return n}

/* essential (short version) */
function essential(i){
  var d=dayOf(i),set={w:1,c:1,eng_am:1,eng_pm:1,sleep:1,micro:1,breath:1},primary=null;
  d.blocks.forEach(function(b){b.items.forEach(function(it){
    if(!primary&&CORE_IDS.indexOf(it.id)>=0) primary=it.id;
  })});
  if(primary) set[primary]=1;
  return set;
}

/* ── SRS ────────────────────────────── */
function perDay(w){return w<=2?5:(w<=8?7:8)}
function due(){var t=today(),o=[];for(var k in S.srs.c)if(S.srs.c[k][1]<=t)o.push(+k);return o}
function intro(){return Object.keys(S.srs.c).length}
function learned(){var n=0;for(var k in S.srs.c)if(S.srs.c[k][0]>=5)n++;return n}
function lvlDone(li){var r=LVL[li],n=0;
  for(var k in S.srs.c){var i=+k;if(i>=r.from&&i<r.to&&S.srs.c[k][0]>=5)n++}return n}
function fresh(n){var o=[],i=0;while(o.length<n&&i<NWORDS){if(!S.srs.c[i])o.push(i);i++}return o}
function quota(){return S.srs.lastNew===today()?0:perDay(weekOf(today()).n)}
function buildSession(){
  var q=due().concat(fresh(quota()));
  for(var j=q.length-1;j>0;j--){var r=Math.floor(Math.random()*(j+1));var x=q[j];q[j]=q[r];q[r]=x}
  return q;
}
function grade(idx,g){
  var t=today(),c=S.srs.c[idx];
  if(!c){c=[0,t,25];S.srs.c[idx]=c;if(S.srs.lastNew!==t)S.srs.lastNew=t}
  if(g===0){c[0]=0;c[1]=t+1;c[2]=Math.max(15,c[2]-2)}
  else{
    if(g===1)c[2]=Math.max(15,c[2]-1);
    if(g===3)c[2]=Math.min(32,c[2]+1);
    var step=IVL[Math.min(c[0],IVL.length-1)],m=g===1?0.6:(g===3?1.35:1);
    c[1]=t+Math.max(1,Math.round(step*m*(c[2]/25))); c[0]++;
  }
  save("srs");
}

/* ── metrics ────────────────────────── */
function best(f){var b=null;S.metrics.forEach(function(m){var v=+m[f];
  if(m[f]!=null&&m[f]!==""&&!isNaN(v)&&(b===null||v>b))b=v});return b}
function series(f){return S.metrics.filter(function(m){return m[f]!=null&&m[f]!==""&&!isNaN(+m[f])})
  .map(function(m){return{x:m.d,y:+m[f]}}).sort(function(a,b){return a.x-b.x})}
function addM(o){
  var d=today(),ex=null;
  S.metrics.forEach(function(m){if(m.d===d)ex=m});
  if(!ex){ex={d:d};S.metrics.push(ex)}
  for(var k in o) if(o[k]!=null&&o[k]!=="") ex[k]=o[k];
  S.metrics.sort(function(a,b){return a.d-b.d});
  save("metrics");
}

/* ── icons ──────────────────────────── */
var I={
today:'<rect x="3" y="4.5" width="18" height="16.5" rx="4"/><path d="M8 2.5v4M16 2.5v4M3 9.8h18"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>',
week:'<rect x="3" y="4" width="18" height="17" rx="4"/><path d="M3 9.5h18M9.2 9.5V21M15 9.5V21M3 15.3h18"/>',
words:'<path d="M4 6a2.8 2.8 0 0 1 2.8-2.8H20v13.6H6.8A2.8 2.8 0 0 0 4 19.6z"/><path d="M4 16.8v2.8h16"/><path d="M8.6 7.8h6.8M8.6 11.2h4.4"/>',
prog:'<path d="M3.5 20h17"/><path d="M4.5 15.6 9 10.3l4.2 3.4 6.3-8"/><circle cx="19.5" cy="5.7" r="1.7" fill="currentColor" stroke="none"/>',
guide:'<circle cx="12" cy="12" r="9.2"/><path d="M12 17v-4.6M12 7.9v.4"/>',
dawn:'<path d="M12 2.6v3.2M4.6 12H1.8M22.2 12h-2.8M5.6 5.6l2.1 2.1M18.4 5.6l-2.1 2.1"/><path d="M7.2 17.2a4.8 4.8 0 0 1 9.6 0"/><path d="M2.5 20.6h19"/>',
eng:'<path d="M2.8 6.3h12.4M8.2 3.3v3M6 6.3c0 5.2-1.3 8.6-3.6 10.9M9.6 9.8c1 3.5 3 6.1 6.4 7.6"/><path d="M12.8 20.7l4.1-10.4 4.3 10.4M14.4 17.3h5.1"/>',
strength:'<path d="M4.6 9.2v5.6M2.3 10.8v2.4M19.4 9.2v5.6M21.7 10.8v2.4M7.6 6.6v10.8M16.4 6.6v10.8M7.6 12h8.8"/>',
run:'<circle cx="15.6" cy="4.4" r="2"/><path d="m13.5 9.2-3.9 1.9-.9 4.2M13.5 9.2l3.3 2.7 1 4.6M13.5 9.2 10.8 20.8M16.8 11.9l3.6.6M9.6 11.1 5.7 9.2l-2.7 2.1"/>',
skill:'<circle cx="12" cy="3.2" r="1.6"/><path d="M12 4.8v5.4"/><path d="m7.6 20.8 4.4-10.6 4.4 10.6M6 12.4 12 10.2l6 2.2"/>',
recovery:'<path d="M12 20.8S4.2 16 4.2 10.9A4.5 4.5 0 0 1 12 7.8a4.5 4.5 0 0 1 7.8 3.1c0 5.1-7.8 9.9-7.8 9.9z"/>',
big:'<path d="M7 3.4h10v4.2a5 5 0 0 1-10 0z"/><path d="M17 4.7h2.6a2.6 2.6 0 0 1 0 5.2H17M7 4.7H4.4a2.6 2.6 0 0 0 0 5.2H7"/><path d="M12 12.8v3.8M8.2 20.6h7.6"/>',
"long":'<path d="M2.8 19.6h18.4"/><path d="M3.8 16.2c2.6-1 3.6-5.2 5.7-5.2s2.6 3.1 4.7 3.1 3.1-6.2 6.2-6.2"/>',
moon:'<path d="M20.4 14.3A8.6 8.6 0 0 1 9.8 3.7 8.6 8.6 0 1 0 20.4 14.3z"/>',
chk:'<path d="M4.5 12.4 9.3 17.3 19.5 6.8"/>',
info:'<circle cx="12" cy="12" r="9.2"/><path d="M12 17v-4.6M12 7.9v.4"/>',
alert:'<path d="M10.3 3.6 2.5 17.2a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.4v4.2M12 17v.3"/>',
ch:'<path d="m6 9.3 6 6 6-6"/>',
left:'<path d="m14.5 5-7 7 7 7"/>', right:'<path d="m9.5 5 7 7-7 7"/>',
close:'<path d="M6 6l12 12M18 6 6 18"/>',
sound:'<path d="M11 4.6 6.4 8.3H2.8v7.4h3.6L11 19.4z"/><path d="M15.2 9.3a3.8 3.8 0 0 1 0 5.4M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
timer:'<circle cx="12" cy="13.8" r="7.8"/><path d="M12 13.8V9.4M9.3 2.4h5.4M19.3 6.6 20.9 5"/>',
play:'<path d="M7 4.5v15l13-7.5z"/>',
map:'<path d="M3 6.2 9 3.4l6 2.8 6-2.8v14.4l-6 2.8-6-2.8-6 2.8z"/><path d="M9 3.4v14.4M15 6.2v14.4"/>',
shift:'<path d="M3.5 12h13"/><path d="m12 7.2 4.8 4.8-4.8 4.8"/><path d="M20.5 4.5v15"/>',
note:'<path d="M5 3.8h14v16.4H5z" /><path d="M8.5 8.4h7M8.5 12h7M8.5 15.6h4"/>',
bolt:'<path d="M13.2 2.5 4.5 13.4h6.3l-.8 8.1 8.7-10.9h-6.3z"/>'
};
function ic(n,c){return '<svg viewBox="0 0 24 24"'+(c?' class="'+c+'"':"")+">"+(I[n]||I.info)+"</svg>"}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}

/* ── chart ──────────────────────────── */
function chart(t,sub,pts,o){
  o=o||{};
  if(pts.length<2) return '<div class="group chart"><h4>'+esc(t)+'</h4><div class="cs">'+esc(sub)+
    '</div><div class="empty">Нужно минимум два замера</div></div>';
  var W=320,H=112,PL=32,PR=12,PT=12,PB=20;
  var xs=pts.map(function(p){return p.x}),ys=pts.map(function(p){return p.y});
  var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
  var y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  if(y0===y1){y0-=1;y1+=1}
  var pad=(y1-y0)*.2; y0-=pad; y1+=pad;
  if(o.zero&&y0>0) y0=0;
  if(x1===x0) x1=x0+1;
  var sx=function(v){return PL+(v-x0)/(x1-x0)*(W-PL-PR)},
      sy=function(v){return PT+(1-(v-y0)/(y1-y0))*(H-PT-PB)};
  var d=pts.map(function(p,i){return(i?"L":"M")+sx(p.x).toFixed(1)+" "+sy(p.y).toFixed(1)}).join(" ");
  var ar=d+" L"+sx(pts[pts.length-1].x).toFixed(1)+" "+(H-PB)+" L"+sx(pts[0].x).toFixed(1)+" "+(H-PB)+" Z";
  var g=[y0+(y1-y0)*.1,(y0+y1)/2,y1-(y1-y0)*.1].map(function(v){
    return '<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+sy(v).toFixed(1)+'" y2="'+sy(v).toFixed(1)+
      '" stroke="var(--sep2)" stroke-width="1"/><text x="'+(PL-6)+'" y="'+(sy(v)+3.4).toFixed(1)+
      '" text-anchor="end" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,system-ui,sans-serif" fill="var(--tx3)">'+
      (o.dec?v.toFixed(1):Math.round(v))+"</text>"}).join("");
  var L=pts[pts.length-1],lx=sx(L.x),ly=sy(L.y);
  var an=lx>W-58?"end":"start", ox=an==="end"?-11:11;
  var u="g"+Math.random().toString(36).slice(2,8);
  return '<div class="group chart"><h4>'+esc(t)+'</h4><div class="cs">'+esc(sub)+'</div>'+
   '<svg viewBox="0 0 '+W+" "+H+'" preserveAspectRatio="none" role="img" aria-label="'+esc(t)+'">'+
   '<defs><linearGradient id="'+u+'" x1="0" y1="0" x2="0" y2="1">'+
   '<stop offset="0%" stop-color="var(--acc)" stop-opacity=".2"/>'+
   '<stop offset="100%" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs>'+g+
   '<path d="'+ar+'" fill="url(#'+u+')"/>'+
   '<path d="'+d+'" fill="none" stroke="var(--acc)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'+
   '<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="4.4" fill="var(--acc)" stroke="var(--card)" stroke-width="2.4"/>'+
   '<text x="'+(lx+ox).toFixed(1)+'" y="'+(ly+3.6).toFixed(1)+'" text-anchor="'+an+
   '" font-size="11.5" font-family="-apple-system,BlinkMacSystemFont,system-ui,sans-serif" font-weight="600" fill="var(--tx)">'+
   esc((o.dec?L.y.toFixed(1):Math.round(L.y))+(o.unit||""))+"</text>"+
   '<text x="'+PL+'" y="'+(H-4)+'" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,system-ui,sans-serif" fill="var(--tx3)">день '+(pts[0].x+1)+"</text>"+
   '<text x="'+(W-PR)+'" y="'+(H-4)+'" text-anchor="end" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,system-ui,sans-serif" fill="var(--tx3)">день '+(L.x+1)+"</text>"+
   "</svg></div>";
}
function ring(p,size,sw){
  size=size||76;sw=sw||7;var r=(size-sw)/2,c=2*Math.PI*r;
  return '<div class="ring" style="width:'+size+"px;height:"+size+'px"><svg width="'+size+'" height="'+size+'">'+
    '<circle class="bgc" cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" stroke-width="'+sw+'"/>'+
    '<circle class="fg'+(p>=1?" full":"")+'" cx="'+size/2+'" cy="'+size/2+'" r="'+r+
    '" stroke-width="'+sw+'" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+
    (c*(1-p)).toFixed(1)+'"/></svg><b>'+Math.round(p*100)+"<i>%</i></b></div>";
}

/* ── exercise row ───────────────────── */
function exRow(i,bi,it,dim){
  var on=!!S.checks[key(i,bi,it.id)];
  return '<button class="ex'+(on?" done":"")+(dim?" dim":"")+'" data-a="chk" data-i="'+i+
   '" data-b="'+bi+'" data-id="'+esc(it.id)+'"><span class="chk">'+ic("chk")+"</span>"+
   '<span class="b"><span class="nm">'+esc(it.label)+"</span>"+
   (it.dose?'<span class="ds">'+esc(it.dose)+"</span>":"")+
   (it.note?'<span class="hint">'+esc(it.note)+"</span>":"")+"</span></button>";
}

/* ── view: today ────────────────────── */
function vToday(){
  var i=cur(),t=today(),d=dayOf(i),w=weekOf(i),p=pct(i),dt=dateOf(i);
  var n=due().length+quota(), h="";
  var ess=short?essential(i):null;

  if(!started()){
    var k=-rawIdx();
    h+='<div class="callout">'+ic("info")+"<div><b>Старт "+fmtD(pD(S.meta.start))+
      "</b> — через "+k+" "+plural(k,["день","дня","дней"])+
      ". Пока есть время: найди турник во дворе, купи резиновую петлю и освободи два метра у стены.</div></div>";
  }

  h+='<div class="daycard">'+ring(p,76)+'<div class="info"><h2>'+esc(d.label)+"</h2>"+
    '<div class="meta"><span class="chip">'+DOWS[i%7]+", "+fmtD(dt)+"</span>"+
    '<span class="chip">'+d.time+"</span><span class=\"chip\">~"+d.dur+" мин</span>"+
    (w.deload?'<span class="chip acc">разгрузка</span>':"")+"</div></div></div>";

  var tb=null,tbi=-1;
  d.blocks.forEach(function(b,bi){if(b.meta){tb=b;tbi=bi}});
  h+='<div class="cta">';
  if(tb) h+='<button class="btn pri" style="flex:2" data-a="focus" data-b="'+tbi+'" data-i="'+i+'">'+
    ic("play")+" Начать тренировку</button>";
  h+='<button class="btn" style="flex:1" data-a="timer">'+ic("timer")+" Стойка</button></div>";

  if(offset!==0) h+='<div class="callout">'+ic("info")+"<div>Смотришь "+
    (offset<0?"прошедший":"будущий")+' день. <b data-a="jump" style="color:var(--acc);cursor:pointer">'+
    "Вернуться к сегодня</b></div></div>";

  if(d.note) h+='<div class="callout">'+ic("info")+"<div>"+esc(d.note)+"</div></div>";

  if(offset===0&&t>0&&pct(t-1)<0.3&&pct(t)<0.3)
    h+='<div class="callout warn">'+ic("alert")+"<div><b>Вчерашний день не закрыт.</b> "+
      'Если ты его пропустил — <b data-a="shift" style="color:var(--acc);cursor:pointer">сдвинь план на день</b>, '+
      "и продолжишь ровно с того места, а не через голову.</div></div>";

  h+='<div class="sect"><div class="shdr"><span>Неделя '+w.n+" · "+esc(w.phaseName)+"</span></div>"+
    '<div class="callout">'+ic("bolt")+"<div>"+esc(w.focus)+"</div></div></div>";

  if(tb) h+='<div class="sect" style="margin-top:14px"><button class="btn sm wide'+(short?" pri":"")+
    '" data-a="short">'+ic("bolt")+(short?" Показать полную версию":" Мало времени · короткая версия")+"</button></div>";

  d.blocks.forEach(function(b,bi){
    h+='<div class="sect"><div class="shdr">'+esc(b.title)+
      (b.meta?'<span class="r">'+b.meta.time+" · "+b.meta.dur+" мин</span>":"")+"</div>"+
      '<div class="group">';
    b.items.forEach(function(it){ h+=exRow(i,bi,it, ess&&!ess[it.id]) });
    h+="</div></div>";
  });

  h+='<div class="sect"><div class="shdr">Заметка к дню</div>'+
    '<textarea class="notefield" id="dayNote" data-a="note" data-i="'+i+
    '" placeholder="как прошло, что болело, что получилось">'+esc(S.notes[i]||"")+"</textarea></div>";

  if(n>0&&started()) h+='<div class="sect"><button class="btn wide" data-a="go" data-t="words">'+
    ic("eng")+" Слова: "+n+" на сегодня</button></div>";
  return h;
}

/* ── view: plan ─────────────────────── */
function vPlan(){
  var h='<div class="seg">'+
    '<button data-a="pmode" data-m="week" aria-selected="'+(planMode==="week")+'">Неделя</button>'+
    '<button data-a="pmode" data-m="map" aria-selected="'+(planMode==="map")+'">Карта 182 дней</button></div>';
  return h + (planMode==="map"?vMap():vWeek());
}
function vWeek(){
  var c=cur(), wn = weekView==null ? weekOf(c).n : weekView, w=PLAN.weeks[wn-1];
  var h='<div class="wsel"><button class="iconbtn press" data-a="wk" data-n="'+(wn-1)+'"'+
    (wn<=1?" disabled":"")+' aria-label="Предыдущая неделя">'+ic("left")+"</button>"+
    '<div class="mid"><b>Неделя '+wn+' <span style="color:var(--tx3);font-weight:400">из 26</span></b>'+
    "<span>"+esc(w.phaseName)+(w.deload?" · разгрузка":"")+"</span></div>"+
    '<button class="iconbtn press" data-a="wk" data-n="'+(wn+1)+'"'+(wn>=26?" disabled":"")+
    ' aria-label="Следующая неделя">'+ic("right")+"</button></div>";

  h+='<div class="callout">'+ic("bolt")+"<div>"+esc(w.focus)+"</div></div>";

  h+='<div class="sect"><div class="group">';
  w.days.forEach(function(d,di){
    var gi=(wn-1)*7+di,p=pct(gi);
    h+='<button class="row drow'+(gi===today()?" today":"")+'" data-a="day" data-i="'+gi+'">'+
      '<span class="dw">'+DOWS[di]+'</span><span class="grow"><span class="ttl">'+esc(d.label)+
      '</span><span class="sb">'+fmtD(dateOf(gi))+" · "+d.dur+' мин</span></span>'+
      '<span class="minibar"><i style="width:'+(p*100).toFixed(0)+'%"></i></span>'+
      '<span class="val" style="width:36px;text-align:right;font-size:13.5px">'+Math.round(p*100)+"%</span>"+
      ic("ch","chev")+"</button>";
  });
  h+="</div></div>";

  if(dayView!=null&&Math.floor(dayView/7)+1===wn){
    var d=dayOf(dayView);
    h+='<div class="sect"><div class="shdr">'+DOWS[dayView%7]+", "+fmtD(dateOf(dayView))+" · "+esc(d.label)+
      '<span class="r">день '+(dayView+1)+"</span></div>";
    d.blocks.forEach(function(b,bi){
      h+='<div class="shdr" style="margin-top:14px">'+esc(b.title)+"</div><div class=\"group\">";
      b.items.forEach(function(it){h+=exRow(dayView,bi,it,false)});
      h+="</div>";
    });
    h+="</div>";
  }else h+='<div class="empty">Нажми на день, чтобы раскрыть тренировку</div>';
  return h;
}
function vMap(){
  var t=today(),h='<div class="heat"><div class="ph">';
  PLAN.phases.forEach(function(p,k){
    h+='<div style="flex:'+(p.to-p.from+1)+';background:'+
      (k%2?"var(--fill2)":"var(--acc-soft)")+'" title="'+esc(p.name)+'"></div>';
  });
  h+='</div><div class="hg">';
  for(var dw=0;dw<7;dw++){
    for(var wk=0;wk<26;wk++){
      var gi=wk*7+dw,p=pct(gi),fut=gi>t;
      var st = fut ? "" : (p>0 ? "background:color-mix(in srgb,var(--ok) "+Math.round(22+p*78)+"%,transparent)" : "");
      h+='<button data-a="mapcell" data-i="'+gi+'" class="'+(fut?"fut":"")+(gi===t?" now":"")+
        '" style="'+st+'" aria-label="День '+(gi+1)+'" title="День '+(gi+1)+" · "+DOWS[dw]+" · "+
        Math.round(p*100)+'%"></button>';
    }
  }
  h+='</div><div class="lg"><i style="background:var(--fill)"></i>пропущено'+
   '<i style="background:color-mix(in srgb,var(--ok) 45%,transparent);margin-left:8px"></i>частично'+
   '<i style="background:var(--ok);margin-left:8px"></i>закрыто'+
   '<i style="background:var(--sep2);margin-left:8px"></i>впереди</div>'+
   '<div class="cap">Строки — дни недели сверху вниз (пн…вс), столбцы — 26 недель. '+
   "Нажми на клетку, чтобы открыть эту неделю.</div></div>";

  h+='<div class="sect"><div class="shdr">Фазы</div><div class="group">';
  PLAN.phases.forEach(function(p){
    var cw=weekOf(t).n, on=cw>=p.from&&cw<=p.to;
    h+='<div class="row"><span class="grow"><span class="ttl">'+esc(p.name)+
      (on?' <span class="chip acc" style="margin-left:6px">сейчас</span>':"")+
      '</span><span class="sb">'+esc(p.focus)+'</span></span>'+
      '<span class="val" style="font-size:13.5px">нед. '+p.from+"–"+p.to+"</span></div>";
  });
  h+="</div></div>";
  return h;
}

/* ── view: words ────────────────────── */
function vWords(){
  if(sess) return vStudy();
  var L=learned(),n=due().length,q=quota();
  var h='<div class="tiles">'+
   '<div class="tile acc"><b>'+L+'</b><span>выучено накрепко</span></div>'+
   '<div class="tile"><b>'+intro()+'</b><span>слов в работе</span></div>'+
   '<div class="tile"><b>'+n+'</b><span>ждут повтора</span></div>'+
   '<div class="tile"><b>'+NWORDS+'</b><span>всего в базе</span></div></div>';

  h+='<div class="sect"><div class="group" style="padding:18px">';
  if(n+q>0&&started()){
    h+='<div style="font-size:15px;color:var(--tx2);margin-bottom:15px;line-height:1.5">Сегодня: '+
      '<b style="color:var(--tx);font-weight:600">'+q+" новых</b> и "+
      '<b style="color:var(--tx);font-weight:600">'+n+" на повторение</b>. Около "+
      Math.max(3,Math.round((n+q)*.22))+" минут.</div>"+
      '<button class="btn pri wide" data-a="study">Начать занятие</button>';
  }else{
    h+='<div class="empty" style="padding:6px 0 16px">'+
      (started()?"На сегодня всё закрыто. Возвращайся завтра — или добери слов вперёд.":
       "Занятия начнутся вместе с челленджем. Можно попробовать уже сейчас.")+"</div>"+
      '<button class="btn wide" data-a="extra">Взять 10 слов сверх плана</button>';
  }
  h+="</div></div>";

  h+='<div class="sect"><div class="shdr">Цель челленджа</div><div class="group">'+
    goalRow("Слов в долговременной памяти",L,1000,"слов")+"</div></div>";

  h+='<div class="sect"><div class="shdr">Уровни<span class="r">выучено из всего</span></div><div class="group">';
  LVL.forEach(function(r,li){
    var tot=r.to-r.from,dn=lvlDone(li);
    h+='<div class="row"><span class="grow"><span class="ttl">'+esc(r.name)+
      '</span><span class="sb">'+esc(r.hint)+'</span></span>'+
      '<span class="lvlbar"><i style="width:'+(dn/tot*100).toFixed(0)+'%"></i></span>'+
      '<span class="val" style="font-size:13.5px;width:58px;text-align:right">'+dn+"/"+tot+"</span></div>";
  });
  h+="</div></div>";

  h+='<div class="sect"><div class="callout">'+ic("info")+"<div><b>Как это работает.</b> Слово "+
    "возвращается за день до того, как ты его забудешь: через 1 день, 3, 7, 16, 35, 75. После пяти "+
    "успешных повторов оно уходит в долговременную память. Отвечай честно — «помню» на угаданном "+
    "слове ломает весь график.</div></div></div>";
  return h;
}
function goalRow(name,v,target,word){
  var p=Math.min(1,v/target);
  return '<div class="goal"><div class="gh"><b>'+esc(name)+'</b><span class="v"><em>'+
    (Math.round(v*10)/10)+"</em> / "+target+" "+esc(word)+"</span></div>"+
    '<div class="bar"><i class="'+(p>=1?"full":"")+'" style="width:'+(p*100).toFixed(1)+'%"></i></div></div>';
}
function vStudy(){
  var q=sess.q,k=sess.i;
  if(k>=q.length) return '<div class="study" style="align-items:center;justify-content:center;text-align:center">'+
    '<div style="font-size:30px;font-weight:600;letter-spacing:-.03em">Занятие закрыто</div>'+
    '<div style="color:var(--tx2);margin:10px 0 24px;font-size:15px">'+q.length+" "+
    plural(q.length,["слово","слова","слов"])+" пройдено. Следующая порция — завтра.</div>"+
    '<button class="btn pri wide" data-a="end">Готово</button></div>';
  var idx=q[k],w=BANK[idx],c=S.srs.c[idx],isNew=!c;
  var h='<div class="study"><div class="sbar"><i style="width:'+(k/q.length*100).toFixed(1)+'%"></i></div>'+
   '<div class="face"><div class="tag">'+(isNew?"новое слово":"повторение · "+(c[0]+1)+"-й раз")+"</div>"+
   '<div class="en">'+esc(w.en)+'</div><button class="speak" data-a="say" data-w="'+esc(w.en)+
   '" aria-label="Произнести">'+ic("sound")+"</button>"+
   (sess.shown?'<div class="ru">'+esc(w.ru)+"</div>":"")+"</div>";
  h+= sess.shown
    ? '<div class="grades"><button class="g0" data-a="gr" data-g="0">Не помню<em>завтра</em></button>'+
      '<button data-a="gr" data-g="1">Трудно<em>скоро</em></button>'+
      '<button data-a="gr" data-g="2">Помню<em>по плану</em></button>'+
      '<button class="g3" data-a="gr" data-g="3">Легко<em>нескоро</em></button></div>'
    : '<button class="btn pri wide" style="margin-top:20px" data-a="show">Показать перевод</button>';
  h+='<div style="margin-top:14px;text-align:center"><button class="btn ghost sm" data-a="end">Прервать</button></div></div>';
  return h;
}

/* ── view: progress ─────────────────── */
function vProg(){
  var t=today(),dn=doneDays();
  var h='<div class="tiles">'+
   '<div class="tile acc"><b>'+streak()+'</b><span>'+plural(streak(),["день подряд","дня подряд","дней подряд"])+"</span></div>"+
   '<div class="tile"><b>'+dn+'</b><span>дней закрыто</span></div>'+
   '<div class="tile"><b>'+Math.round(dn/Math.max(1,t+1)*100)+'%</b><span>дисциплина</span></div>'+
   '<div class="tile"><b>'+(t+1)+'<span style="display:inline;font-size:15px;color:var(--tx3)"> / 182</span></b><span>день челленджа</span></div></div>';

  h+='<div class="sect"><div class="shdr">Цели<span class="r">лучший результат</span></div><div class="group">'+
   goalRow("Английские слова",learned(),1000,"слов")+
   goalRow("Стойка на руках",best("hs")||0,20,"сек")+
   goalRow("Бег без остановки",best("km")||0,10,"км")+
   goalRow("Подтягивания",best("pull")||0,10,"раз")+
   goalRow("Отжимания",best("push")||0,35,"раз")+"</div></div>";

  h+='<div class="sect"><div class="shdr">Новый замер</div><div class="group" style="padding:16px">'+
   '<div class="mgrid">'+fld("m_w","Вес, кг","70")+fld("m_waist","Талия, см","80")+
   fld("m_hs","Стойка, сек","0")+fld("m_km","Бег, км","0")+
   fld("m_push","Отжимания","0")+fld("m_pull","Подтягивания","0")+"</div>"+
   '<button class="btn pri wide" style="margin-top:14px" data-a="savem">Сохранить замер</button>'+
   '<div style="font-size:13px;color:var(--tx3);margin-top:11px;line-height:1.45">Заполняй только то, что '+
   "мерил сегодня — пустые поля не записываются. Талию меряй утром натощак на уровне пупка, раз в две недели.</div></div></div>";

  var s={w:series("w"),waist:series("waist"),hs:series("hs"),km:series("km"),
         push:series("push"),pull:series("pull")};
  var any=0;for(var k in s)any+=s[k].length;
  if(any){
    h+='<div class="sect"><div class="shdr">Динамика</div>';
    if(s.waist.length>1)h+=chart("Талия","сантиметры · цель −3…5 см",s.waist,{unit:" см",dec:true});
    if(s.w.length>1)    h+=chart("Вес","килограммы · держим 69–71",s.w,{unit:" кг",dec:true});
    if(s.hs.length>1)   h+=chart("Стойка на руках","секунды удержания · цель 20",s.hs,{unit:" с",zero:true});
    if(s.km.length>1)   h+=chart("Бег","километров без остановки · цель 10",s.km,{unit:" км",dec:true,zero:true});
    if(s.push.length>1) h+=chart("Отжимания","повторов в подходе",s.push,{zero:true});
    if(s.pull.length>1) h+=chart("Подтягивания","повторов в подходе",s.pull,{zero:true});
    h+="</div>";
  }
  if(S.metrics.length){
    h+='<div class="sect"><div class="shdr">Журнал замеров</div><div class="group" style="padding:2px 14px 6px">'+
     '<div class="tscroll"><table class="tlog"><thead><tr><th>День</th><th>Вес</th><th>Талия</th>'+
     "<th>Стойка</th><th>Бег</th><th>Отж</th><th>Подт</th></tr></thead><tbody>";
    S.metrics.slice().sort(function(a,b){return b.d-a.d}).slice(0,24).forEach(function(m){
      h+="<tr><td>"+(m.d+1)+" · "+fmtD(dateOf(m.d))+"</td><td>"+cell(m.w)+"</td><td>"+cell(m.waist)+
        "</td><td>"+cell(m.hs)+"</td><td>"+cell(m.km)+"</td><td>"+cell(m.push)+"</td><td>"+cell(m.pull)+"</td></tr>";
    });
    h+="</tbody></table></div></div></div>";
  }
  return h;
  function cell(x){return x==null||x===""?'<span style="color:var(--tx3)">—</span>':esc(x)}
}
function fld(id,l,ph){
  return '<div><label class="f" for="'+id+'">'+esc(l)+'</label><input class="f" id="'+id+
    '" type="number" step="any" inputmode="decimal" placeholder="'+ph+'"></div>';
}

/* ── view: guide ────────────────────── */
var GUIDE=[
["Распорядок буднего дня","dawn",
 "<p>Это не пожелание, а каркас — всё остальное в приложении рассчитано на него.</p>"+
 '<table class="sched">'+
 "<tr><td>5:30</td><td>Подъём. Стакан воды сразу.</td></tr>"+
 "<tr><td>5:35–5:50</td><td><b>Микроблок:</b> суставная разминка, запястья, вакуум живота натощак, полый хват.</td></tr>"+
 "<tr><td>5:50–6:40</td><td>Завтрак с белком, сборы. 7 минут английского.</td></tr>"+
 "<tr><td>6:40–8:00</td><td>Дорога. Аудирование или повтор слов.</td></tr>"+
 "<tr><td>8:00–20:00</td><td>Работа. Раз в час встать; в обед — 20 приседаний и прогулка.</td></tr>"+
 "<tr><td>20:00–20:45</td><td>Дорога. Повтор слов.</td></tr>"+
 "<tr><td>20:45–21:05</td><td>Ужин. Белок обязательно.</td></tr>"+
 "<tr><td>21:05–21:50</td><td><b>Тренировка дня.</b></td></tr>"+
 "<tr><td>21:50–22:15</td><td>Душ, заминка, растяжка.</td></tr>"+
 "<tr><td>22:15–22:35</td><td>Вечерний блок английского.</td></tr>"+
 "<tr><td>22:35–23:00</td><td>Свет приглушить, экраны убрать.</td></tr>"+
 "<tr><td>23:00</td><td><b>Отбой.</b></td></tr></table>"+
 '<div class="tip">Выходные — тренировки утром в 10:00. Это единственный момент недели, когда ты '+
 "тренируешься отдохнувшим, поэтому на субботу и воскресенье поставлены самые важные вещи: стойка и длительный бег.</div>"],

["Сон: почему это цель номер ноль","moon",
 "<p>Сейчас ты спишь 4,5–5,5 часа. На таком сне пять целей одновременно не берутся, и вот почему:</p>"+
 "<ul><li><b>Стойка на руках</b> — навык нервной системы. Он закрепляется в глубоком сне, а не на тренировке.</li>"+
 "<li><b>Слова</b> переходят в долговременную память ночью. Недосып бьёт по запоминанию сильнее, чем плохая методика.</li>"+
 "<li><b>Жир и талия</b> — при недосыпе растёт кортизол и тяга к сладкому, а жир охотнее держится на животе.</li>"+
 "<li><b>Мышцы</b> восстанавливаются ночью. Без этого через месяц придёт плато, а не прогресс.</li></ul>"+
 "<h5>Как сдвинуть отбой</h5><p>Резко не выйдет. Двигай на 15 минут раньше каждые три дня: "+
 "00:30 → 00:15 → 00:00 → 23:45 → 23:30 → 23:15 → 23:00. Займёт три недели — это заложено в план.</p>"+
 "<ul><li>Последний тяжёлый подход — минимум за час до сна. Поэтому будние тренировки короткие (35–45 мин), "+
 "а всё объёмное вынесено на выходное утро.</li>"+
 "<li>Дыхание 4-7-8 после тренировки: вдох 4 секунды, задержка 7, выдох 8. Шесть циклов.</li>"+
 "<li>Кофе — до 14:00, иначе он ещё работает в полночь.</li></ul>"+
 '<div class="tip">6,5 часа — рабочий минимум для твоего объёма, 7 — хорошо. Если выбираешь между лишним '+
 "подходом и лишними тридцатью минутами сна, выбирай сон. Это не лень, это часть программы.</div>"],

["Талия и жир: что реально работает","recovery",
 "<p>При росте 178 и весе 70 кг тебе не нужно худеть. Нужна <b>рекомпозиция</b>: чуть меньше жира, "+
 "заметно больше мышц, вес почти тот же. Талия уйдёт, цифра на весах — нет. Это нормально и это цель.</p>"+
 "<h5>Что уменьшает талию</h5>"+
 "<ul><li><b>Вакуум живота</b> — главный инструмент. Утром натощак: выдохнуть весь воздух, втянуть живот "+
 "под рёбра, держать. От 3×15 сек до 5×25 сек. Тренирует поперечную мышцу — внутренний корсет, "+
 "который подтягивает талию изнутри.</li>"+
 "<li><b>Бег и длительная работа</b> — общий расход и чувствительность к инсулину.</li>"+
 "<li><b>Осанка</b> — грудной отдел, плечи назад. Часть сантиметров на талии это просто сутулость.</li>"+
 "<li><b>Небольшой дефицит</b> — около 250 ккал в день. Больше нельзя: на глубоком дефиците сила не вырастет.</li></ul>"+
 "<h5>Что не уменьшает талию</h5>"+
 "<ul><li>Скручивания сотнями. Локального жиросжигания не существует.</li>"+
 "<li>Тяжёлые наклоны в стороны с весом: косые растут, талия визуально становится <b>шире</b>.</li>"+
 "<li>Пояса, плёнки, сауна — это вода, она возвращается за сутки.</li></ul>"+
 "<h5>Питание, коротко</h5>"+
 "<ul><li><b>Белок 110–140 г в день</b> — это главное. Яйца, творог, курица, рыба, мясо: по ладони в каждый приём.</li>"+
 "<li>Ужин с белком не позже 21:15 — он же закрывает окно восстановления после тренировки.</li>"+
 "<li>Вода 2–2,5 л. Овощи в каждый приём — объём без калорий.</li>"+
 "<li>Не режь углеводы полностью: на них ты едешь утром и бежишь вечером.</li></ul>"+
 '<div class="tip">Реалистичный результат за 26 недель: −3…5 см на талии при том же весе.</div>'],

["Стойка на руках: техника и безопасность","skill",
 "<h5>Правило первое: сначала научись падать</h5>"+
 "<p>До первой попытки отработай <b>выход поворотом</b>: из стойки поворачиваешь плечи и таз, "+
 "переставляешь одну руку и опускаешь ноги вбок, как будто описываешь полукруг. Повтори 10 раз "+
 "у стены, прежде чем пробовать свободно. Заваливаться назад в мостик опаснее и страшнее.</p>"+
 "<h5>Правило второе: запястья каждый день</h5>"+
 "<p>Запястья — то, на чём ломается большинство. Две-три минуты ежедневно: круги, упор ладонями с "+
 "разворотом пальцев к себе, покачивания вперёд-назад в упоре, растяжка сгибателей. Это в утреннем "+
 "микроблоке каждый день, включая выходные.</p>"+
 "<h5>Линия тела</h5>"+
 "<ul><li>Руки прямые, плечи <b>вытолкнуты вверх</b> — уши между руками, а не зажаты.</li>"+
 "<li>Таз подкручен под рёбра, поясница не прогнута. Прогиб — главная ошибка новичка, поза «банан».</li>"+
 "<li>Ноги вместе, носки вытянуты, взгляд между ладонями.</li>"+
 "<li>Баланс держится <b>пальцами</b>: заваливаешься вперёд — давишь пальцами, назад — отпускаешь.</li></ul>"+
 "<h5>Почему грудью к стене, а не спиной</h5>"+
 "<p>Спиной к стене тело само встаёт в «банан», и ты закрепляешь неправильную линию. Грудью к стене "+
 "(живот и носки касаются) заставляет держать прямую линию с первого дня. Вначале это медленнее, "+
 "дальше — гораздо быстрее.</p>"+
 '<div class="tip">Стойку тренируй <b>свежим и часто</b>: в начале тренировки, короткими подходами, '+
 "три-четыре раза в неделю. Навык растёт от количества качественных повторов, а не от усталости.</div>"],

["Бег зимой в Москве","run",
 "<p>Челлендж идёт с сентября по март — большая часть бега придётся на холод и темноту. Это решаемо.</p>"+
 "<h5>Одежда</h5>"+
 "<ul><li>Одевайся так, будто на улице на <b>10 градусов теплее</b>: первые пять минут должно быть "+
 "прохладно. Вышел и сразу тепло — значит перегреешься и промокнешь.</li>"+
 "<li>Три слоя: термобельё (не хлопок), флис, ветрозащита. Шапка и перчатки обязательны.</li>"+
 "<li>Светоотражатели или фонарик: в декабре в 21:00 темно.</li></ul>"+
 "<h5>Техника в холод</h5>"+
 "<ul><li>Дыши через нос, сколько можешь — воздух успевает согреться. Приходится ртом — темп слишком высокий.</li>"+
 "<li>Разминка <b>дома</b>, до выхода: 5 минут суставной, чтобы не стартовать на холодных мышцах.</li>"+
 "<li>Шаг короче и чаще, стопа под себя — на льду это спасает от падений.</li></ul>"+
 "<h5>Когда не бежать на улице</h5>"+
 "<p>Ниже −18°, гололёд, сильный ветер со снегом или ты болеешь. В эти дни замена дома, она равноценна:</p>"+
 "<ul><li><b>Лестница подъезда</b> — 12–18 минут: вверх бегом, вниз шагом. Отлично заменяет интервалы.</li>"+
 "<li><b>Скакалка</b> — 8×(1 минута работы / 1 минута отдыха).</li>"+
 "<li><b>Берпи-интервалы</b> — 10×(30 секунд работы / 60 отдыха).</li>"+
 "<li><b>Бег на месте с высоким бедром</b> — по схеме того же дня.</li></ul>"+
 '<div class="tip">Длительный бег в воскресенье — самое важное для выносливости и самое медленное. '+
 "Темп такой, чтобы ты мог говорить целыми предложениями. Не можешь — бежишь слишком быстро.</div>"],

["Инвентарь","strength",
 "<p>Зал не нужен. Нужно вот это:</p>"+
 "<ul><li><b>Турник</b> — дворовый или дверной распорный. Без него не будет подтягиваний и подъёмов ног в висе.</li>"+
 "<li><b>Резиновая петля</b> средней жёсткости — для подтягиваний с 10-й недели. Стоит недорого, "+
 "заменяет половину тренажёрного зала.</li>"+
 "<li><b>Коврик</b> — для йоги и кора.</li>"+
 "<li><b>Свободная стена</b> около 1,5 м и два метра пола перед ней. Убери оттуда всё бьющееся.</li>"+
 "<li><b>Стул и стол</b> — отжимания с возвышения, австралийские подтягивания, болгарские приседы.</li>"+
 "<li><b>Сантиметровая лента</b> — мерить талию.</li></ul>"+
 "<h5>Если турника нет вообще</h5>"+
 "<p>Тяга заменяется: австралийские подтягивания под столом, тяга полотенца, закинутого за закрытую "+
 "дверь, тяга рюкзака с книгами в наклоне. Работает хуже турника, поэтому турник — приоритетная "+
 "покупка первой недели.</p>"],

["Если что-то пошло не так","guide",
 "<h5>Пропустил день</h5>"+
 "<p>Ничего не навёрстывай. Открой приложение и нажми «сдвинуть план на день» — программа поедет "+
 "дальше с того места, где ты остановился. Один пропуск не ломает 26 недель; ломает попытка "+
 "отработать два дня подряд и последующее выгорание.</p>"+
 "<h5>Пропустил неделю</h5><p>Вернись на неделю назад и повтори её. Лучше потерять неделю, чем травму.</p>"+
 "<h5>Задержали на работе, есть 20 минут</h5>"+
 "<p>Нажми «мало времени» — приложение оставит только разминку, главное упражнение дня, заминку и "+
 "английский. Это 80% пользы за 30% времени.</p>"+
 "<h5>Болит</h5>"+
 "<ul><li><b>Мышцы ноют день-два</b> — норма, особенно первые три недели. Работай дальше, легче.</li>"+
 "<li><b>Боль в суставе, острая или при каждом повторе</b> — стоп. Пропусти движение, замени на "+
 "безболезненную вариацию. Не проходит за неделю — к врачу.</li>"+
 "<li><b>Болят запястья в стойке</b> — почти всегда мало разминки. Добавь две минуты и работай на кулаках или упорах.</li></ul>"+
 "<h5>Заболел</h5>"+
 "<p>Правило шеи: симптомы выше шеи (насморк) — можно лёгкую тренировку. Ниже (кашель, температура, "+
 "ломота) — полный отдых, пока не пройдёт, плюс два дня. Английский делай, он не требует тела.</p>"+
 "<h5>Нет мотивации</h5>"+
 "<p>Мотивация не топливо, а побочный продукт. Сделай <b>только разминку</b>, пять минут. В девяти "+
 "случаях из десяти дальше пойдёт само. В десятом ты честно отдохнул.</p>"],

["Как читать прогресс","prog",
 "<p>Пять целей растут с разной скоростью, и это сбивает, если не знать заранее.</p>"+
 "<ul><li><b>Английский</b> — линейно и предсказуемо. Твой якорь: в плохую неделю он всё равно идёт вперёд.</li>"+
 "<li><b>Бег</b> — быстрый прогресс первые восемь недель (есть база лёгкой атлетики), потом медленнее.</li>"+
 "<li><b>Отжимания и подтягивания</b> — ступеньками. Неделями ничего, потом резкий скачок. Это нормально.</li>"+
 "<li><b>Стойка</b> — самая нелинейная. Можешь шесть недель держать пять секунд, а потом за неделю выйти "+
 "на пятнадцать. Не бросай на плато — оно и есть работа.</li>"+
 "<li><b>Талия</b> — медленно и не каждую неделю. Мерь раз в две недели, иначе будешь ловить шум вместо тренда.</li></ul>"+
 "<h5>Контрольные точки</h5><p>Недели 4, 12, 19 и 26 — замерь всё: вес, талию, максимум отжиманий и "+
 "подтягиваний, удержание стойки, дистанцию бега. Четыре точки за полгода дают честную картину.</p>"+
 '<div class="tip">Реалистичный финиш: 1000–1200 слов, 30–40 отжиманий, 8–10 подтягиваний, '+
 "20–30 секунд стойки, 10 км бегом, бакасана и колесо в йоге, талия −3…5 см.</div>"],

["Настройки","today",
 "<p>Дата старта челленджа. Все 182 дня отсчитываются от неё.</p>"+
 '<div style="max-width:210px"><label class="f" for="setStart">Первый день</label>'+
 '<input class="f" id="setStart" type="date" value="__START__"></div>'+
 '<div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">'+
 '<button class="btn sm" data-a="setstart">Сохранить дату</button>'+
 '<button class="btn sm" data-a="shift">Сдвинуть план на день</button></div>'+
 "<h5>Перенос между устройствами</h5>"+
 "<p>Всё сохраняется прямо на устройстве и работает без интернета. Автоматической синхронизации между макбуком и айфонами нет — для неё нужен сервер. Переносить можно вручную через файл:</p>"+
 '<div style="display:flex;gap:9px;margin-top:4px;flex-wrap:wrap">'+
 '<button class="btn sm" data-a="export">Выгрузить в файл</button>'+
 '<button class="btn sm" data-a="merge">Загрузить и объединить</button>'+
 '<button class="btn sm" data-a="replace">Заменить всё</button></div>'+
 "<p style=\"margin-top:12px\"><b>Как пользоваться.</b> На устройстве, где ты занимался, нажми «Выгрузить в файл» и сохрани его в iCloud Drive. На втором устройстве открой приложение, нажми «Загрузить и объединить» и выбери этот файл. Объединение ничего не стирает: галочки складываются, по каждому слову берётся лучший прогресс, замеры дописываются. «Заменить всё» нужно только если хочешь откатиться к сохранённой копии.</p>"+
 "<p>Выгружай файл раз в неделю, даже если не переносишь данные, — это твоя резервная копия. Если очистить историю Safari, данные приложения тоже пропадут.</p>"]
];
function vGuide(){
  var h='<div class="callout">'+ic("info")+"<div><b>Прочти один раз целиком, потом возвращайся "+
    "по ситуации.</b> Здесь то, что не помещается в ежедневные карточки: почему план устроен "+
    "именно так и что делать, когда он ломается.</div></div>";
  h+='<div class="sect"><div class="group acc">';
  GUIDE.forEach(function(g,i){
    h+='<button data-a="pan" data-i="'+i+'" aria-expanded="'+(openPan===i)+'">'+ic(g[1],"ic")+
      "<span>"+esc(g[0])+"</span>"+ic("ch","ch")+"</button>";
    if(openPan===i) h+='<div class="pan">'+g[2].replace("__START__",S.meta.start)+"</div>";
  });
  h+="</div></div>";
  return h;
}

/* ── focus mode ─────────────────────── */
function openFocus(i,bi){
  var b=dayOf(i).blocks[bi];
  var ess=short?essential(i):null;
  var steps=b.items.filter(function(it){return !ess||ess[it.id]});
  if(!steps.length) steps=b.items.slice();
  focus={i:i,bi:bi,steps:steps,k:0,rest:false,left:0,dur:90,t:null};
  drawFocus();
}
function restNeeded(id){return ["push","pull","legs","core","hs","pike"].indexOf(id)>=0}
function drawFocus(){
  if(!focus){document.getElementById("layer").innerHTML="";return}
  var F=focus,st=F.steps[F.k],L=document.getElementById("layer"),h;
  if(F.k>=F.steps.length){
    h='<div class="focus"><div class="fhead"><div class="fdots"></div>'+
      '<button class="iconbtn press" data-a="fclose" aria-label="Закрыть">'+ic("close")+"</button></div>"+
      '<div class="fbody"><div style="font-size:64px;line-height:1">'+ring(1,120,10)+"</div>"+
      '<h2 style="margin-top:20px">Тренировка закрыта</h2>'+
      '<div class="hint">Все упражнения отмечены. Осталось заминка, душ и вечерний блок английского.</div></div>'+
      '<div class="ffoot"><button class="btn pri wide" data-a="fclose">Готово</button></div></div>';
    L.innerHTML=h;
    var rc=L.querySelector(".ring");if(rc)rc.style.margin="0 auto";
    return;
  }
  var dots="";
  for(var j=0;j<F.steps.length;j++) dots+='<i class="'+(j<F.k?"past":(j===F.k?"on":""))+'"></i>';
  if(F.rest){
    var c=2*Math.PI*84, p=F.left/F.dur;
    h='<div class="focus"><div class="fhead"><div class="fdots">'+dots+"</div>"+
     '<button class="iconbtn press" data-a="fclose" aria-label="Закрыть">'+ic("close")+"</button></div>"+
     '<div class="fbody"><div class="rest"><div class="rr"><svg width="190" height="190">'+
     '<circle class="bgc" cx="95" cy="95" r="84"/>'+
     '<circle class="fg" cx="95" cy="95" r="84" stroke-dasharray="'+c.toFixed(1)+
     '" stroke-dashoffset="'+(c*(1-p)).toFixed(1)+'"/></svg><b>'+F.left+"</b></div>"+
     '<div class="lbl">Отдых между подходами</div>'+
     '<div class="opts">'+[45,60,90,120].map(function(v){
       return '<button data-a="rdur" data-v="'+v+'" aria-selected="'+(F.dur===v)+'">'+v+"с</button>"}).join("")+
     "</div></div></div>"+
     '<div class="ffoot"><button class="btn wide" data-a="rskip">Пропустить отдых</button></div></div>';
    L.innerHTML=h; return;
  }
  var tr=TRACK[st.id];
  h='<div class="focus"><div class="fhead"><div class="fdots">'+dots+"</div>"+
   '<button class="iconbtn press" data-a="fclose" aria-label="Закрыть">'+ic("close")+"</button></div>"+
   '<div class="fbody"><div class="step">'+(F.k+1)+" из "+F.steps.length+"</div>"+
   "<h2>"+esc(st.label)+"</h2>"+
   (st.dose?'<div class="dose">'+esc(st.dose)+"</div>":"")+
   (st.note?'<div class="hint">'+esc(st.note)+"</div>":"")+
   (tr?'<div class="flog"><div class="lb">Записать результат — '+tr[1]+' (по желанию)</div>'+
       '<input class="f" id="fres" type="number" step="any" inputmode="decimal" placeholder="—"></div>':"")+
   "</div>"+
   '<div class="ffoot">'+(F.k>0?'<button class="btn" data-a="fback" aria-label="Назад">'+ic("left")+"</button>":"")+
   '<button class="btn pri" style="flex:1" data-a="fnext">'+
   (F.k===F.steps.length-1?"Завершить":"Готово, дальше")+"</button></div></div>";
  L.innerHTML=h;
}
function focusNext(){
  var F=focus,st=F.steps[F.k];
  var inp=document.getElementById("fres");
  if(inp&&inp.value.trim()!==""){
    var v=parseFloat(inp.value.replace(",","."));
    if(!isNaN(v)&&TRACK[st.id]){var o={};o[TRACK[st.id][0]]=v;addM(o)}
  }
  var k=key(F.i,F.bi,st.id);
  if(!S.checks[k]){S.checks[k]=1;save("checks")}
  buzz(10);
  F.k++;
  if(F.k<F.steps.length&&restNeeded(st.id)){ startRest() } else { drawFocus() }
}
function startRest(){
  var F=focus; F.rest=true; F.left=F.dur; drawFocus();
  clearInterval(F.t);
  F.t=setInterval(function(){
    if(!focus){clearInterval(F.t);return}
    focus.left--;
    if(focus.left<=0){clearInterval(focus.t);buzz([30,60,30]);focus.rest=false;drawFocus()}
    else drawFocus();
  },1000);
}
function closeFocus(){ if(focus&&focus.t)clearInterval(focus.t); focus=null;
  document.getElementById("layer").innerHTML=""; render() }

/* ── stopwatch sheet ────────────────── */
var sw={el:0,on:false,t0:0,raf:0,laps:[]};
function openTimer(){
  sw.el=0;sw.on=false;sw.laps=[];
  sheet=true; drawTimer();
}
function drawTimer(){
  var b=best("hs")||0;
  document.getElementById("layer").innerHTML=
   '<div class="scrim" data-a="closes"><div class="sheet" data-stop="1"><div class="grab"></div>'+
   "<h3>Секундомер стойки</h3><div class=\"sh\">Замеряй каждую попытку. Лучшая за сессию попадёт в прогресс.</div>"+
   '<div class="tbig'+(sw.on?" on":"")+'" id="tb">'+(sw.el/1000).toFixed(1)+"</div>"+
   '<div class="tsub">личный рекорд: '+b+" сек</div>"+
   '<div class="laps" id="laps">'+lapHtml()+"</div>"+
   '<div class="t2"><button class="btn pri" id="tgo">'+(sw.on?"Стоп":"Старт")+"</button>"+
   '<button class="btn" data-a="tlap">Записать попытку</button></div>'+
   '<button class="btn wide" style="margin-top:10px" data-a="tsave">Сохранить лучшую в прогресс</button>'+
   '<button class="btn ghost wide" style="margin-top:4px" data-a="closes">Закрыть</button></div></div>';
  var g=document.getElementById("tgo");
  if(g) g.onclick=function(){ sw.on?stopSW():startSW() };
}
function lapHtml(){
  if(!sw.laps.length) return '<span style="background:transparent;color:var(--tx3)">попыток пока нет</span>';
  var m=Math.max.apply(null,sw.laps);
  return sw.laps.map(function(v){return '<span class="'+(v===m?"best":"")+'">'+v.toFixed(1)+" с</span>"}).join("");
}
function startSW(){ sw.on=true; sw.t0=Date.now()-sw.el; tick();
  var g=document.getElementById("tgo"); if(g)g.textContent="Стоп";
  var e=document.getElementById("tb"); if(e)e.classList.add("on") }
function tick(){
  if(!sw.on)return;
  sw.el=Date.now()-sw.t0;
  var e=document.getElementById("tb");
  if(!e){sw.on=false;return}
  e.textContent=(sw.el/1000).toFixed(1);
  sw.raf=requestAnimationFrame(tick);
}
function stopSW(){ sw.on=false; cancelAnimationFrame(sw.raf);
  var g=document.getElementById("tgo"); if(g)g.textContent="Старт";
  var e=document.getElementById("tb"); if(e)e.classList.remove("on"); buzz(12) }
function closeSheet(){ stopSW(); sheet=null; document.getElementById("layer").innerHTML="" }

/* ── render ─────────────────────────── */
var TABS=[["today","Сегодня","today"],["plan","План","week"],["words","Слова","words"],
          ["prog","Прогресс","prog"],["guide","Гид","guide"]];
function titleFor(){
  if(tab==="today"){ var i=cur();
    return started()||offset!==0 ? "День "+(i+1)+" из 182" : "До старта" }
  if(tab==="plan")  return "План";
  if(tab==="words") return "Слова";
  if(tab==="prog")  return "Прогресс";
  return "Гид";
}
function largeTitle(){
  var i=cur(),w=weekOf(i);
  if(tab==="today"){
    return '<div class="lt"><div class="kick">'+(started()?"Неделя "+w.n+" из 26 · "+esc(w.phaseName):
      "Старт "+fmtD(pD(S.meta.start)))+'</div><h1>'+(started()||offset!==0?"День "+(i+1):"До старта")+
      '</h1><div class="sub">'+(started()||offset!==0?"из 182 · "+esc(dayOf(i).label):
      "подготовка")+'</div><div class="prog-line"><i style="width:'+
      ((today()+1)/DAYS*100).toFixed(1)+'%"></i></div></div>';
  }
  var sub={plan:"26 недель, 182 дня",words:learned()+" из 1000 слов выучено",
           prog:"цифры и динамика",guide:"как всё устроено"}[tab];
  return '<div class="lt"><h1>'+titleFor()+'</h1><div class="sub">'+esc(sub)+"</div></div>";
}
function render(){
  var n=due().length+quota();
  document.getElementById("navT").textContent=titleFor();
  document.getElementById("navL").innerHTML = tab==="today"
    ? '<button class="iconbtn press" data-a="nav" data-d="-1" aria-label="Предыдущий день">'+ic("left")+"</button>" : "";
  document.getElementById("navR").innerHTML = tab==="today"
    ? '<button class="iconbtn press" data-a="nav" data-d="1" aria-label="Следующий день">'+ic("right")+"</button>"
    : (tab==="plan"?'<button class="iconbtn press" data-a="pmode" data-m="'+(planMode==="week"?"map":"week")+
      '" aria-label="Карта">'+ic("map")+"</button>":"");
  document.getElementById("tabs").innerHTML=TABS.map(function(t){
    return '<button data-a="go" data-t="'+t[0]+'" aria-selected="'+(tab===t[0])+'">'+ic(t[2])+
      "<span>"+t[1]+"</span>"+(t[0]==="words"&&n>0&&started()?'<span class="badge">'+Math.min(99,n)+"</span>":"")+
      "</button>"}).join("");
  document.getElementById("view").innerHTML = largeTitle() +
    (tab==="today"?vToday():tab==="plan"?vPlan():tab==="words"?vWords():tab==="prog"?vProg():vGuide());
}
window.addEventListener("scroll",function(){
  document.getElementById("nav").classList.toggle("stuck",window.scrollY>34);
},{passive:true});

/* ── events ─────────────────────────── */
document.addEventListener("click",function(e){
  if(!e.target.closest)return;
  var el=e.target.closest("[data-a]"); if(!el)return;
  var a=el.getAttribute("data-a");

  if(a==="closes"){ if(el.classList.contains("scrim")&&e.target.closest("[data-stop]"))return;
    closeSheet(); return }
  if(a==="go"){ tab=el.getAttribute("data-t"); if(tab!=="words")sess=null;
    window.scrollTo(0,0); render(); return }
  if(a==="chk"){ toggle(+el.getAttribute("data-i"),+el.getAttribute("data-b"),el.getAttribute("data-id"));
    render(); return }
  if(a==="nav"){ var d=+el.getAttribute("data-d");
    offset=Math.max(-today(),Math.min(DAYS-1-today(),offset+d)); short=false; render(); return }
  if(a==="jump"){ offset=0; render(); return }
  if(a==="short"){ short=!short; render(); return }
  if(a==="pmode"){ planMode=el.getAttribute("data-m"); dayView=null; render(); return }
  if(a==="wk"){ weekView=Math.max(1,Math.min(26,+el.getAttribute("data-n"))); dayView=null; render(); return }
  if(a==="day"){ var i=+el.getAttribute("data-i"); dayView=dayView===i?null:i; render(); return }
  if(a==="mapcell"){ weekView=Math.floor(+el.getAttribute("data-i")/7)+1;
    dayView=+el.getAttribute("data-i"); planMode="week"; render(); return }
  if(a==="pan"){ var p=+el.getAttribute("data-i"); openPan=openPan===p?-1:p; render(); return }
  if(a==="timer"){ openTimer(); return }
  if(a==="tlap"){ if(sw.el>0){ sw.laps.push(Math.round(sw.el/100)/10); stopSW(); sw.el=0;
      var e2=document.getElementById("tb"); if(e2)e2.textContent="0.0";
      var lp=document.getElementById("laps"); if(lp)lp.innerHTML=lapHtml(); } return }
  if(a==="tsave"){ var all=sw.laps.slice(); if(sw.el>0)all.push(Math.round(sw.el/100)/10);
    if(all.length) addM({hs:Math.max.apply(null,all)});
    closeSheet(); tab="prog"; window.scrollTo(0,0); render(); return }
  if(a==="focus"){ openFocus(+el.getAttribute("data-i"),+el.getAttribute("data-b")); return }
  if(a==="fnext"){ focusNext(); return }
  if(a==="fback"){ if(focus&&focus.k>0){focus.k--;focus.rest=false;clearInterval(focus.t);drawFocus()} return }
  if(a==="fclose"){ closeFocus(); return }
  if(a==="rskip"){ if(focus){clearInterval(focus.t);focus.rest=false;drawFocus()} return }
  if(a==="rdur"){ if(focus){focus.dur=+el.getAttribute("data-v");focus.left=focus.dur;drawFocus()} return }
  if(a==="study"){ sess={q:buildSession(),i:0,shown:false};
    if(S.srs.lastNew!==today()){S.srs.lastNew=today();save("srs")} render(); return }
  if(a==="extra"){ sess={q:fresh(10),i:0,shown:false}; render(); return }
  if(a==="show"){ sess.shown=true; render(); return }
  if(a==="gr"){ var g=+el.getAttribute("data-g"),ix=sess.q[sess.i];
    grade(ix,g); if(g===0)sess.q.push(ix); sess.i++; sess.shown=false; buzz(6); render(); return }
  if(a==="end"){ sess=null; render(); return }
  if(a==="say"){ say(el.getAttribute("data-w")); return }
  if(a==="savem"){ saveForm(); return }
  if(a==="shift"){ var d=pD(S.meta.start); d.setDate(d.getDate()+1);
    S.meta.start=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
      String(d.getDate()).padStart(2,"0");
    save("meta"); offset=0; weekView=null; dayView=null; render(); return }
  if(a==="export"){ exportData(); return }
  if(a==="merge"){ pickFile("merge"); return }
  if(a==="replace"){ pickFile("replace"); return }
  if(a==="setstart"){ var v=document.getElementById("setStart").value;
    if(v){S.meta.start=v;save("meta");offset=0;weekView=null;dayView=null;render()} return }
});
document.addEventListener("input",function(e){
  var el=e.target; if(!el.getAttribute||el.getAttribute("data-a")!=="note")return;
  var i=+el.getAttribute("data-i"),v=el.value;
  if(v.trim()==="") delete S.notes[i]; else S.notes[i]=v.slice(0,600);
  save("notes");
});
document.addEventListener("keydown",function(e){
  if(focus){ if(e.key==="Escape")closeFocus(); return }
  if(sheet){ if(e.key==="Escape")closeSheet(); return }
  if(!sess||tab!=="words")return;
  if(e.key===" "||e.key==="Enter"){e.preventDefault();if(!sess.shown){sess.shown=true;render()}return}
  if(sess.shown&&e.key>="1"&&e.key<="4"){
    var g=+e.key-1,ix=sess.q[sess.i];
    grade(ix,g); if(g===0)sess.q.push(ix); sess.i++; sess.shown=false; render();
  }
});
/* swipe between days on Today */
var tx=0,ty=0,tracking=false;
document.addEventListener("touchstart",function(e){
  if(tab!=="today"||focus||sheet||e.touches.length!==1)return;
  tx=e.touches[0].clientX; ty=e.touches[0].clientY; tracking=true;
},{passive:true});
document.addEventListener("touchend",function(e){
  if(!tracking)return; tracking=false;
  var t=e.changedTouches[0],dx=t.clientX-tx,dy=t.clientY-ty;
  if(Math.abs(dx)<62||Math.abs(dy)>44)return;
  var d=dx<0?1:-1;
  offset=Math.max(-today(),Math.min(DAYS-1-today(),offset+d)); short=false; render();
},{passive:true});

function say(w){
  try{ if(!window.speechSynthesis)return;
    var u=new SpeechSynthesisUtterance(w); u.lang="en-US"; u.rate=.88;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){}
}
function saveForm(){
  var g=function(id){var e=document.getElementById(id);if(!e)return null;
    var v=(e.value||"").trim(); if(!v)return null;
    var n=parseFloat(v.replace(",","."));return isNaN(n)?null:n};
  var o={w:g("m_w"),waist:g("m_waist"),hs:g("m_hs"),km:g("m_km"),push:g("m_push"),pull:g("m_pull")};
  var any=false; for(var k in o) if(o[k]!=null) any=true;
  if(!any)return;
  addM(o); buzz(10);
  ["m_w","m_waist","m_hs","m_km","m_push","m_pull"].forEach(function(id){
    var e=document.getElementById(id); if(e)e.value=""});
  render();
}

/* ── перенос данных ─────────────────── */
function toast(msg){
  var t=document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity="0"; setTimeout(function(){t.remove()},300) },2600);
}
function exportData(){
  try{
    var payload={app:"182dnya",v:1,at:new Date().toISOString(),meta:S.meta,
      checks:Object.keys(S.checks),srs:S.srs,metrics:S.metrics,notes:S.notes};
    var blob=new Blob([JSON.stringify(payload)],{type:"application/json"});
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url; a.download="182dnya-"+new Date().toISOString().slice(0,10)+".json";
    document.body.appendChild(a); a.click();
    setTimeout(function(){URL.revokeObjectURL(url); a.remove()},3000);
    toast("Файл выгружен — сохрани его в iCloud Drive");
  }catch(e){ toast("Не удалось выгрузить файл") }
}
function pickFile(mode){
  var inp=document.createElement("input");
  inp.type="file"; inp.accept="application/json,.json";
  inp.onchange=function(){ if(inp.files&&inp.files[0]) readData(inp.files[0],mode) };
  inp.click();
}
function readData(file,mode){
  var r=new FileReader();
  r.onerror=function(){ toast("Файл не читается") };
  r.onload=function(){
    var d;
    try{ d=JSON.parse(r.result) }catch(e){ d=null }
    if(!d||d.app!=="182dnya"){ toast("Не тот файл — нужен .json из этого приложения"); return }
    try{
      if(mode==="replace"){
        if(d.meta&&d.meta.start) S.meta.start=d.meta.start;
        var o={}; (d.checks||[]).forEach(function(k){o[k]=1}); S.checks=o;
        if(d.srs&&d.srs.c) S.srs={c:d.srs.c,lastNew:d.srs.lastNew==null?-1:d.srs.lastNew};
        S.metrics=Array.isArray(d.metrics)?d.metrics:[];
        S.notes=d.notes||{};
      }else{
        (d.checks||[]).forEach(function(k){ S.checks[k]=1 });
        if(d.srs&&d.srs.c){
          for(var k in d.srs.c){
            var a=d.srs.c[k],b=S.srs.c[k];
            if(!b||a[0]>b[0]) S.srs.c[k]=a;
          }
          if(d.srs.lastNew>S.srs.lastNew) S.srs.lastNew=d.srs.lastNew;
        }
        (d.metrics||[]).forEach(function(m){
          var ex=null; S.metrics.forEach(function(x){ if(x.d===m.d) ex=x });
          if(!ex){ S.metrics.push(m) } else { for(var f in m) if(m[f]!=null&&m[f]!=="") ex[f]=m[f] }
        });
        S.metrics.sort(function(a,b){return a.d-b.d});
        for(var n in (d.notes||{})) if(!S.notes[n]) S.notes[n]=d.notes[n];
      }
      DOCS.forEach(function(n){ save(n) });
      offset=0; weekView=null; dayView=null; sess=null;
      render();
      toast(mode==="replace"?"Данные заменены":"Данные объединены");
    }catch(e){ toast("Файл повреждён") }
  };
  r.readAsText(file);
}

/* ── boot ───────────────────────────── */
render();
if("serviceWorker" in navigator){
  var had=!!navigator.serviceWorker.controller, reloading=false;
  window.addEventListener("load",function(){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  });
  if(had) navigator.serviceWorker.addEventListener("controllerchange",function(){
    if(reloading)return; reloading=true; location.reload();
  });
}
})();
