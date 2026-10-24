import {describe,expect,it} from 'vitest';
import {ENEA_LV_PROFILES,profileEneaPoId} from '../eneaLvProfiles';

describe('profile referencyjne ENEA Operator SN/nN 2025',()=>{
 it('rejestr ma dwa odrębne warianty dokumentacji źródłowej',()=>{
   expect(ENEA_LV_PROFILES).toHaveLength(2);
   expect(new Set(ENEA_LV_PROFILES.map(p=>p.id)).size).toBe(2);
   for(const p of ENEA_LV_PROFILES){
     expect(p.sourceUrl).toMatch(/^https:\/\/www\.operator\.enea\.pl\/media\//);
     expect(p.effectiveDate).toBe('2025-01-01');
     expect(p.sourceClause).toContain('§4.4');
     expect(p.outgoingDeviceKind).toBe('ROZLACZNIK_BEZPIECZNIKOWY_LISTWOWY');
     expect(p.outgoingFuseSize).toBe('2');
     expect(p.outgoingSinglePoleOperation).toBe(true);
     expect(p.mainDeviceKind).toBe('ROZLACZNIK_IZOLACYJNY');
     expect(p.mainPoles).toBe(3);
     expect(p.phaseNames).toEqual(['L1','L2','L3']);
     expect(p.penName).toBe('PEN');
     expect(p.currentTransformerPlacement).toBe('ZA_LACZNIKIEM_GLOWNYM');
     expect(p.currentTransformerRatio).toBe('800:5');
     expect(p.busPitchMm).toBe(185);
     expect(p.capacitorCompensation).toBe('TYLKO_JESLI_WYMAGANA');
     expect(p.excludedAssumptions).toContain('sprzęgło dwóch sekcji');
   }
 });
 it('stacja do 630 kVA ma 1250A rozłącznik główny, 12 miejsc, Cu 60×10 i osobne In szyn 910A',()=>{
  const p=profileEneaPoId('ENEA_SN_NN_630_2025');
  expect(p.maxTransformerKva).toBe(630);
  expect(p.mainDeviceRatingA).toBe(1250);
  expect(p.outgoingPositions).toBe(12);
  expect(p.busWidthMm).toBe(60);
  expect(p.penBusWidthMm).toBe(60);
  expect(p.busRatedCurrentA).toBe(910);
 });
 it('stacja uproszczona do 400 kVA: 910A rozłącznik główny, 5 miejsc, Cu 40×10, In szyn 630A',()=>{
  const p=profileEneaPoId('ENEA_SN_NN_400_UPROSZCZONA_2025');
  expect(p.maxTransformerKva).toBe(400);
  expect(p.mainDeviceRatingA).toBe(910);
  expect(p.outgoingPositions).toBe(5);
  expect(p.busWidthMm).toBe(40);
  expect(p.penBusWidthMm).toBe(40);
  expect(p.busRatedCurrentA).toBe(630);
 });
});
