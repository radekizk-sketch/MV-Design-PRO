import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CadPrimitivesPreview } from '../../CadSymbol';
import { ELECTRICAL_CAD_SYMBOL_REGISTRY } from '../../cadSymbolRegistry';
import { LV_CANDIDATE_SYMBOLS, LV_CANDIDATE_IDS, geometriaPropozycji } from '../lvCandidateRegistry';

describe('biblioteka nN — propozycje do akceptacji', () => {
 it('kandydaci mają unikatowe identyfikatory, polskie opisy i status DRAFT', () => {
  expect(LV_CANDIDATE_SYMBOLS).toHaveLength(14);
  expect(new Set(LV_CANDIDATE_IDS).size).toBe(LV_CANDIDATE_IDS.length);
  for(const s of LV_CANDIDATE_SYMBOLS) {
   expect(s.normativeStatus).toBe('DRAFT');
   expect(s.namePl.length).toBeGreaterThan(5);
   expect(s.modelBinding.length).toBeGreaterThan(2);
   expect(s.reviewerNote.length).toBeGreaterThan(15);
  }
 });
 it('zaciski są nazwane i leżą na granicach gabarytu; brak podwójnych punktów', () => {
  for(const s of LV_CANDIDATE_SYMBOLS) {
   expect(s.ports.length).toBeGreaterThan(0);
   const uniq=new Set<string>();
   for(const p of s.ports) {
    expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    expect(p.x>=0 && p.x<=s.width && p.y>=0 && p.y<=s.height).toBe(true);
    expect(p.x===0||p.x===s.width||p.y===0||p.y===s.height).toBe(true);
    expect(uniq.has(p.name)).toBe(false);
    uniq.add(p.name);
   }
  }
 });
 it('aliasy ACB i MCCB wskazują ten sam normowy symbol wyłącznika, nie powielają geometrii',()=>{
  const [acb,mccb]=LV_CANDIDATE_SYMBOLS.slice(0,2);
  expect(acb.baseSymbol).toBe('cad.wylacznik');
  expect(mccb.baseSymbol).toBe('cad.wylacznik');
  expect(acb.body).toEqual([]);
  expect(mccb.body).toEqual([]);
  expect(ELECTRICAL_CAD_SYMBOL_REGISTRY['cad.wylacznik'].states).toBeDefined();
 });
 it('każda propozycja odnosi się do istniejącego symbolu albo dostarcza prymitywy',()=>{
  for (const s of LV_CANDIDATE_SYMBOLS) {
   if(s.baseSymbol)expect(ELECTRICAL_CAD_SYMBOL_REGISTRY[s.baseSymbol]).toBeDefined();
   else expect(geometriaPropozycji(s,'closed').length).toBeGreaterThan(0);
   for(const state of ['closed','open','unknown'] as const){
    for(const p of geometriaPropozycji(s,state)){
     expect(['line','circle','arc','path','pivot','letter']).toContain(p.k);
    }
   }
  }
 });
 it('stany kandydatów łączeniowych różnią się geometrią noża',()=>{
  for(const s of LV_CANDIDATE_SYMBOLS.filter(s=>s.states)){
   expect(s.states?.open).not.toEqual(s.states?.closed);
   expect(s.states?.unknown).not.toEqual(s.states?.open);
  }
 });
 it('podgląd korzysta z renderera prymitywów kanonicznego CadSymbol',()=>{
  const s=LV_CANDIDATE_SYMBOLS.find(s=>s.id==='nn.ogranicznikPrzepiec')!;
  const markup=renderToStaticMarkup(createElement('svg',null,createElement(CadPrimitivesPreview,{
   primitives:geometriaPropozycji(s,'closed'),x:0,y:0,ink:'#111111',paper:'#ffffff',state:'closed'
  })));
  expect(markup).toContain('data-cad-preview="draft"');
  expect(markup).toContain('<path');
 });
});