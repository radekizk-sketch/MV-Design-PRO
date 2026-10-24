import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { QetScadaFrame } from '../QetScadaFrame';
import {
  ocenStanRamki, zweryfikujPolozeniaDoObliczen,
  type ScadaFrameInput,
} from '../scadaFrameState';

const VER = {
  scenarioId:'SC-01', enmVersion:'ENM-v3', topologyHash:'top-003',
  resultSnapshotId:'LF-004', resultTopologyHash:'top-003',
  resultEnmVersion:'ENM-v3', resultScenarioId:'SC-01',
} as const;

const QF: ScadaFrameInput = {
  elementRef:'QF1', rodzaj:'LACZNIK',
  polozenie:'ZAMKNIETY', eksploatacja:'NORMALNY',
  jakosc:'PRAWIDLOWE', zrodlo:'SYMULACJA', zasilenie:'BEZ_NAPIECIA',
  wersjaStanu:VER, wersjaWidoku:VER,
};

function renderFrame(input: ScadaFrameInput) {
  return render(
    <svg><QetScadaFrame input={input} x={0} y={10} width={28} height={38} testId="ramka">
      <line data-testid="qet-original-ink" x1={14} y1={0} x2={14} y2={60} />
    </QetScadaFrame></svg>,
  );
}

describe('QET-SCADA Frame 2.0 — dokładnie dwa stany graficzne', () => {
  it('zamknięty = czerwony #F05260; zasilenie bez napięcia nie wpływa na położenie',()=>{
    const result=ocenStanRamki(QF);
    expect(result.ramka).toBe('ZAMKNIETY');
    const {container}=renderFrame(QF);
    const g=container.querySelector('[data-testid="ramka"]')!;
    expect(g.querySelector('[data-cad-overlay="mechanical-position"]')?.getAttribute('stroke')).toBe('#F05260');
    expect(g.querySelector('[data-testid="qet-original-ink"]')).not.toBeNull();
    expect(g.getAttribute('data-energization')).toBe('BEZ_NAPIECIA');
    expect(g.getAttribute('data-results-current')).toBe('true');
  });
  it('otwarty = zielony #2CCF93, także gdy obie strony mogą pozostawać pod napięciem',()=>{
    const q={...QF,polozenie:'OTWARTY' as const,zasilenie:'POD_NAPIECIEM' as const};
    const {container}=renderFrame(q);
    expect(ocenStanRamki(q).stanGeometryczny).toBe('open');
    expect(container.querySelector('[data-cad-overlay="mechanical-position"]')?.getAttribute('stroke')).toBe('#2CCF93');
  });
  it('brak położenia → walidacja, bez żadnej ramki, glyphu ani znaku zapytania',()=>{
    const q={...QF,polozenie:null};
    const wynik=ocenStanRamki(q);
    expect(wynik.poprawnyDlaTopologii).toBe(false);
    expect(wynik.ramka).toBe('BRAK_RAMKI');
    expect(wynik.stanGeometryczny).toBeNull();
    const {container}=renderFrame(q);
    expect(container.querySelector('[data-cad-overlay="mechanical-position"]')).toBeNull();
    expect(container.querySelector('[data-testid="qet-original-ink"]')).toBeNull();
    expect(container.querySelector('text')).toBeNull();
    expect(zweryfikujPolozeniaDoObliczen([q]).moznaObliczac).toBe(false);
  });
  it('niewiarygodne, przestarzałe i brak danych nie generują trzeciej ramki',()=>{
    for(const jakosc of ['NIEWIARYGODNE','PRZESTARZALE','BRAK'] as const){
      const q={...QF,jakosc};
      const result=ocenStanRamki(q);
      expect(result.ramka).toBe('BRAK_RAMKI');
      expect(result.poprawnyDlaTopologii).toBe(false);
      expect(zweryfikujPolozeniaDoObliczen([q]).moznaObliczac).toBe(false);
    }
  });
  it('wersja stanu inna niż ENM/scenariusz blokuje topologię, wynik stary tylko K-S2',()=>{
    const niezgodny={...QF,wersjaStanu:{...VER,scenarioId:'SC-02'}};
    expect(ocenStanRamki(niezgodny).ramka).toBe('BRAK_RAMKI');
    const staryWynik={...QF,wersjaWidoku:{...VER,resultEnmVersion:'ENM-v2'}};
    const res=ocenStanRamki(staryWynik);
    expect(res.ramka).toBe('ZAMKNIETY');
    expect(res.wynikiAktualne).toBe(false);
    expect(res.poprawnyDlaTopologii).toBe(true);
  });
  it('wyzwolony i potwierdzony otwarty: zielona ramka, bez wykrzyknika',()=>{
    const q={...QF,polozenie:'OTWARTY' as const,eksploatacja:'WYZWOLONY' as const};
    expect(ocenStanRamki(q).alarm).toBe(true);
    const {container}=renderFrame(q);
    expect(container.querySelector('[data-cad-overlay="mechanical-position"]')?.getAttribute('stroke')).toBe('#2CCF93');
    expect(container.querySelector('[data-cad-overlay="alarm"]')).toBeNull();
    expect(container.querySelector('text')).toBeNull();
  });
  it('wyzwolony zamknięty: sprzeczność i brak ramki, a nie fałszywa czerwień',()=>{
    const q={...QF,eksploatacja:'WYZWOLONY' as const};
    expect(ocenStanRamki(q).niespojnosc).toBe(true);
    expect(ocenStanRamki(q).ramka).toBe('BRAK_RAMKI');
    expect(zweryfikujPolozeniaDoObliczen([q]).moznaObliczac).toBe(false);
  });
  it('blokada nie zmienia czerwieni, ale ogranicza symulację; bez litery B na SLD',()=>{
    const q={...QF,eksploatacja:'ZABLOKOWANY' as const};
    const res=ocenStanRamki(q);
    expect(res.ramka).toBe('ZAMKNIETY');
    expect(res.moznaSymulowacZmiane).toBe(false);
    const {container}=renderFrame(q);
    expect(container.querySelector('[data-cad-overlay="blocked"]')).toBeNull();
    expect(container.querySelector('[data-cad-overlay="mechanical-position"]')?.getAttribute('stroke')).toBe('#F05260');
  });
  it('wkładka przepalona: brak ramki łącznika i brak fikcyjnego sterowania',()=>{
    const q={...QF,elementRef:'FU1',rodzaj:'BEZPIECZNIK' as const,wkladka:'PRZEPALONA' as const};
    const res=ocenStanRamki(q);
    expect(res.ramka).toBe('BRAK_RAMKI');
    expect(res.alarm).toBe(true);
    expect(res.moznaSymulowacZmiane).toBe(false);
    const {container}=renderFrame(q);
    expect(container.querySelector('[data-testid="qet-original-ink"]')).not.toBeNull();
    expect(container.querySelector('[data-cad-overlay]')).toBeNull();
  });
  it('rozbieżne bieguny L1-L2-L3 blokują jednoznaczną ramkę i analizę trójfazową',()=>{
    const q={...QF,bieguny:[
      {faza:'L1' as const,polozenie:'ZAMKNIETY' as const},
      {faza:'L2' as const,polozenie:'OTWARTY' as const},
      {faza:'L3' as const,polozenie:'ZAMKNIETY' as const},
    ]};
    expect(ocenStanRamki(q).ramka).toBe('BRAK_RAMKI');
    expect(zweryfikujPolozeniaDoObliczen([q]).moznaObliczac).toBe(false);
  });
  it('pełna lista ENM: wszystkie poprawne stany uprawniają wyłącznie do dalszej walidacji solvera',()=>{
    const q1={...QF,bieguny:[
      {faza:'L1' as const,polozenie:'ZAMKNIETY' as const},
      {faza:'L2' as const,polozenie:'ZAMKNIETY' as const},
      {faza:'L3' as const,polozenie:'ZAMKNIETY' as const},
    ]};
    const q2={...QF,elementRef:'QS2',polozenie:'OTWARTY' as const};
    expect(zweryfikujPolozeniaDoObliczen([q1,q2])).toEqual({
      moznaObliczac:true,bledy:[],
    });
  });
});
