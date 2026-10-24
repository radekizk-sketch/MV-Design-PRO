import {describe,expect,it} from 'vitest';
import {zweryfikujKompozycjeNnEnea,type EnmNnStationContract} from '../eneaCompositeContract';
const good:EnmNnStationContract={
  transformerRef:'TR1',transformerKva:630,
  mainSwitch:{enmRef:'Q0',typ:'ROZLACZNIK_IZOLACYJNY',znamionowyA:1250,bieguny:3},
  ctRefs:['CT1','CT2','CT3'],ctLocation:'ZA_LACZNIKIEM_GLOWNYM',
  busPhaseRefs:{L1:'B-L1',L2:'B-L2',L3:'B-L3',PEN:'B-PEN'},
  outgoing:[
    {slot:2,enmBranchRef:'BR2',aparatRef:'QS2',
     typ:'LISTWOWY_ROZLACZNIK_BEZPIECZNIKOWY',fuseSize:'2',
     fazy:['L1','L2','L3'],operacjeJednobiegunowe:true},
  ]
};
describe('ENEA RGnN — odwzorowanie z rzeczywistych ENM ref',()=>{
  it('630kVA: 12 miejsc, tylko jedno zajęte, reszta nie staje się fikcyjnymi aparatami',()=>{
    const r=zweryfikujKompozycjeNnEnea('KOMPAKT_630',good);
    expect(r.zgodny).toBe(true);
    expect(r.profile.mainInA).toBe(1250);
    expect(r.profile.nominalBusCurrentA).toBe(910);
    expect(r.rezerwowaneMiejsca).toHaveLength(12);
    expect(r.rezerwowaneMiejsca.filter(x=>x.occupied)).toHaveLength(1);
    expect(r.rezerwowaneMiejsca[1].modelRef).toBe('BR2');
    expect(r.rezerwowaneMiejsca[0].deviceRef).toBeNull();
  });
  it('400kVA: odrębny profil i 5 miejsc, 910A łącznik i 630A szyny',()=>{
    const model:EnmNnStationContract={...good,transformerKva:400,
      mainSwitch:{enmRef:'Q0',typ:'ROZLACZNIK_IZOLACYJNY',znamionowyA:910,bieguny:3}};
    const r=zweryfikujKompozycjeNnEnea('UPROSZCZONA_400',model);
    expect(r.zgodny).toBe(true);
    expect(r.rezerwowaneMiejsca).toHaveLength(5);
    expect(r.profile.nominalBusCurrentA).toBe(630);
  });
  it('nie akceptuje przypadkowego ACB ani dodatkowego sprzęgła',()=>{
    const s=zweryfikujKompozycjeNnEnea('KOMPAKT_630',{...good,
      couplerRef:'SPRZEGLO',
      mainSwitch:{...good.mainSwitch!,typ:'APARAT_INNY_Z_PROJEKTU'}});
    expect(s.zgodny).toBe(false);
    expect(s.bledy.join(' ')).toContain('sprzęgło'.toLowerCase());
    expect(s.bledy.some(x=>x.includes('funkcja'))).toBe(true);
  });
  it('odrzuca pomiar przed Q0 i brak PEN',()=>{
    const r=zweryfikujKompozycjeNnEnea('KOMPAKT_630',
      {...good,ctLocation:'PRZED_LACZNIKIEM_GLOWNYM',
       busPhaseRefs:{L1:'B-L1',L2:'B-L2',L3:'B-L3'}});
    expect(r.zgodny).toBe(false);
    expect(r.bledy.some(x=>x.includes('PEN'))).toBe(true);
    expect(r.bledy.some(x=>x.includes('przekładników'))).toBe(true);
  });
  it('odrzuca wielokrotne sloty i fikcyjny aparat w rezerwie',()=>{
    const a=good.outgoing[0];
    const r=zweryfikujKompozycjeNnEnea('KOMPAKT_630',
       {...good,outgoing:[a,a]});
    expect(r.zgodny).toBe(false);
    expect(r.bledy.some(x=>x.includes('Zduplikowane'))).toBe(true);
  });
});
