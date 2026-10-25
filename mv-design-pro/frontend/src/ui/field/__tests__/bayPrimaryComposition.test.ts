import {describe,expect,it} from 'vitest';
import type {BayBaseModel,BayPrimaryDevice} from '../../../types/enm';
import {
  zlozPoleSn,stanEnmDoRamki,torFunkcjonalny,rodzinaCadDlaAparatu,
} from '../bayPrimaryComposition';

function device(ref:string,kind:BayPrimaryDevice['kind'],
 placement:BayPrimaryDevice['placement']='MIDSTREAM',
 actual:'zamkniety'|'otwarty'|'nieznany'='otwarty'):BayPrimaryDevice {
 return {
  device_ref:ref,symbol_ref:ref,kind,placement,
  is_controllable:kind==='CB'||kind==='DS'||kind==='ES'||kind==='LOAD_SWITCH',
  switch_state:kind==='CB'||kind==='DS'||kind==='ES'||kind==='LOAD_SWITCH'
    ?{actual_state:actual}:null,
 };
}
function bay(role:BayBaseModel['bay_role'],
 devices:BayPrimaryDevice[]):BayBaseModel {
 return {bay_ref:'SN/POL-01',bay_role:role,primary_devices:devices,
   secondary_units:[],gpz_section_id:'A'} as unknown as BayBaseModel;
}
describe('GPZ SN — kontrakt rzeczywistych aparatów ENM',()=>{
 it('położenie jest dwu-stanowe, ale brak ENM nie jest zamknięciem domyślnym',()=>{
   expect(stanEnmDoRamki('zamkniety')).toBe('ZAMKNIETY');
   expect(stanEnmDoRamki('otwarty_naped_rozbrojony')).toBe('OTWARTY');
   expect(stanEnmDoRamki(null)).toBeNull();
   expect(stanEnmDoRamki('nieznany')).toBeNull();
   expect(stanEnmDoRamki('awaria')).toBeNull();
 });
 it('CT jest w torze pierwotnym, VT i uziemnik w odrębnych gałęziach',()=>{
   const devices=[
     device('QF1','CB'),device('T1','CT'),
     device('VT1','VT','OFF_PATH'),
     device('QE1','ES','GROUND_BRANCH'),
   ];
   const out=zlozPoleSn(bay('LINIA_OUT',devices));
   expect(out.primary.map(d=>d.ref)).toEqual(['QF1','T1']);
   expect(out.lateral.map(d=>d.ref)).toEqual(['VT1','QE1']);
   expect(out.primary.find(d=>d.ref==='T1')?.cadId).toBe('cad.przekladnikPradowy');
   expect(out.lateral.find(d=>d.ref==='VT1')?.cadId).toBe('cad.przekladnikNapieciowy');
   expect(out.lateral.find(d=>d.ref==='QE1')?.cadId).toBe('cad.uziemnik');
   expect(out.issues.filter(p=>p.kod==='BRAK_PORTU_ODGALEZIENIA')).toHaveLength(2);
   expect(out.kompletna).toBe(false);
 });
 it('nie odwraca źródłowej kolejności aparatów i nie przestawia CT przed wyłącznik',()=>{
   const out=zlozPoleSn(bay('LINIA_OUT',[
     device('DS','DS'),device('CB','CB'),device('CT','CT'),
   ]));
   expect(out.primary.map(d=>d.ref)).toEqual(['DS','CB','CT']);
   expect(out.primary[0].y).toBeLessThan(out.primary[1].y);
   expect(out.primary[1].y).toBeLessThan(out.primary[2].y);
 });
 it('pole transformatorowe skierowane do szyn — transformator i źródło nad szynami',()=>{
   const out=zlozPoleSn(bay('TRANSFORMATOROWE',[
     device('QF1','CB'),device('CT1','CT'),
   ]));
   expect(out.direction).toBe('DO_SZYN');
   expect(out.primary[0].y).toBeGreaterThan(out.primary[1].y);
   expect(out.busY).toBeGreaterThan(out.primary[0].y);
 });
 it('VT przypisany do toru szeregowego jest błędem ENM, a nie automatycznym CT',()=>{
   const out=zlozPoleSn(bay('POMIAROWE',[
      device('Q1','DS'),device('VT1','VT','MIDSTREAM'),
   ]));
   expect(out.primary.map(d=>d.kind)).toEqual(['DS']);
   expect(out.lateral.map(d=>d.kind)).toEqual(['VT']);
   expect(out.issues.map(p=>p.kod)).toContain('VT_NIE_ODGALEZIENIE');
 });
 it('niepoprawny uziemnik oraz niejednoznaczne położenie blokują odbiór',()=>{
   const out=zlozPoleSn(bay('LINIA_OUT',[
     device('QF1','CB','MIDSTREAM','nieznany'),
     device('QE1','ES','MIDSTREAM'),
   ]));
   expect(out.issues.map(p=>p.kod)).toContain('NIEOKRESLONY_STAN_LACZNIKA');
   expect(out.issues.map(p=>p.kod)).toContain('ES_POZA_ODGALEZIENIEM');
   expect(out.kompletna).toBe(false);
 });
 it('nie rysuje fikcyjnej głowicy kablowej przy braku źródłowego CAD',()=>{
   const out=zlozPoleSn(bay('LINIA_OUT',[
     device('QF1','CB'),
     device('GK1','CABLE_HEAD','DOWNSTREAM'),
   ]));
   expect(rodzinaCadDlaAparatu('CABLE_HEAD')).toBeNull();
   expect(out.issues.map(p=>p.kod)).toContain('BRAK_SYMBOLU_CAD');
 });
 it('sprzęgło bez jawnych obydwu celek/stron wymaga uzupełnienia ENM',()=>{
   const out=zlozPoleSn(bay('SPRZEGLO',[device('QF','CB')]));
   expect(out.issues.map(p=>p.kod)).toContain('SPRZEGLO_NIEPELNE');
 });
 it('duplikaty identyfikatorów aparatów nie są ukrywane',()=>{
   const out=zlozPoleSn(bay('LINIA_OUT',[
     device('Q1','DS'),device('Q1','CB'),
   ]));
   expect(out.issues.map(p=>p.kod)).toContain('DUPLIKAT_REF');
 });
 it('izolowany wygląd odgałęzienia nie udaje bezpieczeństwa operacji',()=>{
   const p=torFunkcjonalny(device('QE1','ES','GROUND_BRANCH'));
   expect(p).toBe('ODG_UZIEMIENIA');
   expect(zlozPoleSn(bay('LINIA_OUT',[device('Q1','CB'),device('QE','ES','GROUND_BRANCH')]))
     .issues.map(i=>i.kod)).toContain('BRAK_PORTU_ODGALEZIENIA');
 });
});
