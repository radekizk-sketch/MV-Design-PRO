import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, cells, section, status } from './tracker.mjs';
const plan=readFileSync(new URL('../../mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md',import.meta.url),'utf8');
const mapa=readFileSync(new URL('../../mv-design-pro/docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md',import.meta.url),'utf8');
test('Parser tabeli uwzględnia pionowe kreski i ucieczki',()=>{
  assert.deepEqual(cells('| a | b \\| c | d |'),['a','b | c','d']);
});
test('Wszystkie pozycje kanonicznych planów',()=>{
  const p=parse(plan,mapa);
  assert.ok(p.przyrosty.length>=25);assert.equal(p.wycinki.length,12);
  assert.equal(p.domeny.length,12);assert.equal(p.rodziny.length,12);
  assert.ok(p.domeny.reduce((n,x)=>n+x.zdolnosci.length,0)>100);
  assert.ok(p.rodziny.reduce((n,x)=>n+x.zdolnosci.length,0)>100);
});
test('Commit nie jest akceptacją inżynierską',()=>{
  for(const x of parse(plan,mapa).przyrosty)assert.notEqual(status(x,'zaliczone'),'odebrane');
});
test('Niepoprawny odbiór i uszkodzony plan zostają odrzucone',()=>{
  assert.throws(()=>parse(plan,mapa,{approvals:[{id:'AB-1a',commit:'1'}]}));
  assert.throws(()=>section(plan,'## 5. Brak','## 6.'));
});
