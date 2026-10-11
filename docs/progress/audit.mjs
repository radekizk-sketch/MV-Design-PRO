import {readFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const data=JSON.parse(readFileSync('docs/progress/odbior.json','utf8'));
const keys=['funkcja','kanoniczny_enm','brak_drugiej_prawdy','przypadki_rzeczywiste','niezalezna_wyrocznia','testy_backendu','testy_frontendu','testy_e2e','straznicy','zdalne_ci','ocena_interfejsu','dokumentacja','ograniczenia'];
if(!Array.isArray(data.approvals))throw Error('Nieprawidłowy format odbiorów');
const seen=new Set();
for(const x of data.approvals){
 if(seen.has(x.id))throw Error('Duplikat odbioru '+x.id);
 seen.add(x.id);
 if(!x.kryteria||!keys.every(key=>x.kryteria[key]===true)||Object.keys(x.kryteria).length!==13)throw Error('Brak 13 kryteriów dla '+x.id);
 if(!Array.isArray(x.dowody)||!Array.isArray(x.testy)||!x.dowody.length||!x.testy.length)throw Error('Brak dowodów i testów dla '+x.id);
 for(const p of [...x.dowody,...x.testy]){
  if(typeof p!=='string'||p.startsWith('/')||p.includes('..')||!statSync(p).isFile())throw Error('Brak pliku lub niebezpieczna ścieżka '+p);
 }
 if(!/^[a-f0-9]{40}$/.test(x.commit||''))throw Error('Wymagane 40 znaków SHA '+x.id);
 try{execFileSync('git',['merge-base','--is-ancestor',x.commit,'HEAD'],{stdio:'ignore'});}
 catch{throw Error('Commit odbioru nie jest przodkiem HEAD '+x.id);}
 if(!String(x.przeglad||'').startsWith('https://github.com/radekizk-sketch/MV-Design-PRO/pull/'))throw Error('Brak powiązanego przeglądu PR');
}
console.log('Bramka 13 kryteriów odbioru: '+data.approvals.length+' wpisów.');
