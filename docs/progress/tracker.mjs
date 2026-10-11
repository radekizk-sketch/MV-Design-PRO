export const REPO = 'radekizk-sketch/MV-Design-PRO';
export const PLAN = 'mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md';
export const MAPA = 'mv-design-pro/docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md';
export const DOMENY = ['Cyfrowy model sieci / ENM','Projektowanie sieci i stacji','Rozpływy, zwarcia i doziemienia','Zabezpieczenia i pomiary','OZE, BESS i NC RfG','Jakość energii i dynamika','Sieci nN i uziemienia','Schematy, CAD i GIS','Optymalizacja i niezawodność','Raporty i dowody obliczeń','Uruchomienia i dokumentacja powykonawcza','Sterowanie inżynierskie i integracje'];
export function cells(line) {
  if (!line.startsWith('|')) return [];
  const parts=[]; let buf='',q=false,esc=false;
  for(const c of line.slice(1)) {
    if(esc){buf+=c;esc=false;}
    else if(c==='\\')esc=true;
    else if(c===String.fromCharCode(96)){q=!q;buf+=c;}
    else if(c==='|'&&!q){parts.push(buf.trim());buf='';}
    else buf+=c;
  }
  if(buf.trim())parts.push(buf.trim());
  return parts;
}
export function section(md,start,end) {
  const lines=md.split(/\r?\n/),i=lines.findIndex(l=>l.startsWith(start));
  if(i<0||lines.findIndex((l,k)=>k>i&&l.startsWith(start))>=0)throw Error('Brak jednoznacznej sekcji: '+start);
  const j=lines.findIndex((l,k)=>k>i&&l.startsWith(end));
  return lines.slice(i,j<0?undefined:j);
}
export function clean(s,n=220) {
  const t=String(s||'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*_]/g,'').split(String.fromCharCode(96)).join('').replace(/\s+/g,' ').trim();
  return t.length>n?t.slice(0,n)+'…':t;
}
export function parse(plan,map,registr={approvals:[]}) {
  const przyrosty=[];
  for(const line of section(plan,'## 5. Przyrosty','## 6.')) {
    const c=cells(line),m=c[0]?.match(/^\*\*((?:AB-[A-Za-z0-9._-]+|W6-K))\*\*/);
    if(m&&c.length>=4)przyrosty.push({id:m[1],opis:clean(c[1],520),wymagania:clean(c[3],330),wpisy:[]});
  }
  if(przyrosty.length!==25||new Set(przyrosty.map(x=>x.id)).size!==25)throw Error('Niezgodna liczba 25 przyrostów A/B');
  for(const line of section(plan,'## 7. Rejestr postępu','## 8.')){
    const c=cells(line);if(c.length<5||!/^20\d{2}-\d\d-\d\d$/.test(c[0]))continue;
    const codes=c[1].split(/[^A-Za-z0-9._-]+/),sha=c[2].match(/\b[0-9a-f]{8,40}\b/i);
    for(const task of przyrosty)if(codes.includes(task.id))task.wpisy.push({data:c[0],sha:sha?.[0]||'',opis:clean(c[3],180)});
  }
  const wycinki=[];
  for(const line of section(map,'## 8. Kolejność','## 9.')){
    const c=cells(line);
    if(c.length>=5&&/^\*\*W(?:[1-9]|1[0-2])\*\*$/.test(c[0]))
      wycinki.push({id:c[0].replace(/\*/g,''),nazwa:clean(c[1],130),opis:clean(c[2],350),zaleznosc:clean(c[4],130)});
  }
  if(wycinki.length!==12)throw Error('Brak pełnych wycinków W1–W12');
  const domeny=[],rodziny=[];let current=null;
  for(const line of map.split(/\r?\n/)){
    const d=line.match(/^### 3\.(\d+) Domena/),f=line.match(/^### 3a\.([A-L]) Rodzina/);
    if(d){const id=Number(d[1]);current={id:String(id),nazwa:DOMENY[id-1],zdolnosci:[]};domeny.push(current);}
    else if(f){current={id:f[1],nazwa:clean(line.split('—').slice(1).join('—'),140),zdolnosci:[]};rodziny.push(current);}
    else if(line.startsWith('## '))current=null;
    const c=cells(line);if(!current||c.length<4)continue;
    if(domeny.includes(current)&&! /^\d+$/.test(c[0]))continue;
    if(rodziny.includes(current)&&! /^[A-L]\d+$/.test(c[0]))continue;
    current.zdolnosci.push({id:c[0],nazwa:clean(c[1],170),klasa:clean(c[2],130),dowod:clean(c[3],240)});
  }
  if(domeny.length!==12||rodziny.length!==12||[...domeny,...rodziny].some(g=>!g.zdolnosci.length))throw Error('Niekompletne domeny lub rodziny');
  if(!Array.isArray(registr.approvals))throw Error('Rejestr odbiorów jest nieprawidłowy');
  const ids=new Set(przyrosty.map(x=>x.id)),seen=new Set();
  for(const a of registr.approvals){
    if(!ids.has(a.id)||seen.has(a.id)||! /^[a-f0-9]{40}$/.test(a.commit||'')||
      !Array.isArray(a.dowody)||!a.dowody.length||!Array.isArray(a.testy)||!a.testy.length||
      !String(a.przeglad||'').startsWith('https://github.com/'+REPO+'/pull/'))throw Error('Nieważny wpis odbioru: '+a.id);
    seen.add(a.id);przyrosty.find(x=>x.id===a.id).odbior=a;
  }
  return {przyrosty,wycinki,domeny,rodziny};
}
export function status(task,ci){
  if(task.odbior)return ci==='zaliczone'?'odebrane':'oczekuje na CI';
  return task.wpisy.some(x=>x.sha)?'ślad wdrożenia':'bez odbioru';
}
