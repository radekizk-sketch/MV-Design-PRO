import { describe, expect, it } from 'vitest';
import { SCENARIUSZE_NN } from '../../../lv-domain/fixtures/scenariusze';
import { ocenStanRamki, zweryfikujPolozeniaDoObliczen } from '../scadaFrameState';
import { daneRamkiZProjekcji, kontraktWersjiRamki } from '../qetScadaProjectionAdapter';

describe('QET-SCADA: autentyczne dane LvDomainProjectionV1 wyeksportowane z backendu',()=>{
  it('stany są pobierane WYŁĄCZNIE z ENM, bez zgadywania OPEN/CLOSED',()=>{
    const p=SCENARIUSZE_NN['01_single_tr'];
    const ref=p.graph.devices[0]?.ref_id;
    expect(ref).toBeTruthy();
    const input=daneRamkiZProjekcji(p,ref!);
    expect(input).not.toBeNull();
    expect(input!.zrodlo).toBe('ENM');
    expect(input!.zasilenie).toBe('NIEUSTALONY');
    expect(input!.wersjaStanu.scenarioId).toContain(p.case_id);
    expect(input!.wersjaStanu.enmVersion).toBe(String(p.model_snapshot.revision));
  });
  it('dla prawdziwych urządzeń nie ma szarej ani bursztynowej ramki',()=>{
    for(const p of Object.values(SCENARIUSZE_NN)) {
      for(const device of p.graph.devices){
        const input=daneRamkiZProjekcji(p,device.ref_id)!;
        const wynik=ocenStanRamki(input);
        expect(['ZAMKNIETY','OTWARTY','BRAK_RAMKI']).toContain(wynik.ramka);
        if(input.rodzaj==='LACZNIK' &&
          p.status==='OK' && p.completeness==='COMPLETE' &&
          device.device_state!=='UNKNOWN'){
          expect(wynik.ramka).toBe(
            device.device_state==='CLOSED'?'ZAMKNIETY':'OTWARTY',
          );
        }
      }
    }
  });
  it('sprzęgło ENM ma przeciwne ramki w scenariuszu otwartym i zamkniętym',()=>{
    const otwarty=SCENARIUSZE_NN['02_two_tr_qbc_open'];
    const zamkniety=SCENARIUSZE_NN['03_two_tr_qbc_closed'];
    const coupO=otwarty.graph.devices.find(d=>d.device_type==='bus_coupler');
    const coupZ=zamkniety.graph.devices.find(d=>d.device_type==='bus_coupler');
    expect(coupO).toBeDefined(); expect(coupZ).toBeDefined();
    expect(coupO!.device_state).toBe('OPEN');
    expect(coupZ!.device_state).toBe('CLOSED');
    const po=ocenStanRamki(daneRamkiZProjekcji(otwarty,coupO!.ref_id)!);
    const pz=ocenStanRamki(daneRamkiZProjekcji(zamkniety,coupZ!.ref_id)!);
    expect(po.ramka).toBe('OTWARTY');
    expect(pz.ramka).toBe('ZAMKNIETY');
  });
  it('nieistniejąca referencja jest brakiem danych, nie domyślnym położeniem',()=>{
    const p=SCENARIUSZE_NN['01_single_tr'];
    expect(daneRamkiZProjekcji(p,'BRAK-REF')).toBeNull();
  });
  it('nieaktualne wyniki backendu nie mogą być uznane za aktualne przez adapter',()=>{
    const p=SCENARIUSZE_NN['16_stale_result'];
    expect(p.result_snapshot.status).toBe('OUTDATED');
    const ver=kontraktWersjiRamki(p);
    expect(ver.resultSnapshotId).toBeNull();
    const ref=p.graph.devices.find(d=>d.device_type==='breaker')?.ref_id ??
      p.graph.devices[0]?.ref_id;
    if(ref){
      const input=daneRamkiZProjekcji(p,ref)!;
      expect(ocenStanRamki(input).wynikiAktualne).toBe(false);
    }
  });
  it('gdy backend zwraca UNKNOWN, zbiorcza walidacja nie zezwala na analizę',()=>{
    const p=SCENARIUSZE_NN['01_single_tr'];
    const first=p.graph.devices.find(d=>d.device_type!=='fuse');
    expect(first).toBeDefined();
    const input=daneRamkiZProjekcji(p,first!.ref_id)!;
    const zly={...input,polozenie:null};
    expect(zweryfikujPolozeniaDoObliczen([zly]).moznaObliczac).toBe(false);
    expect(ocenStanRamki(zly).ramka).toBe('BRAK_RAMKI');
  });
});
