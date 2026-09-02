/**
 * REJESTR SYMBOLI nN → SYMBOLE CAD (R2 §4–§12, §18, §19): odwzorowanie
 * „typ gałęzi ENM × klasa funkcjonalna wyrobu (device_kind)" → symbol CAD,
 * klasa oznaczenia, nazwa polska, nośnik stanu. Reguła KLASA, nie instancja:
 * testy iterują po ILOCZYNIE cech (typ × device_kind × stan), nie po jednym
 * przykładzie z karty.
 */
import { describe, expect, it } from 'vitest';

import { CAD_SYMBOL_IDS, ELECTRICAL_CAD_SYMBOL_REGISTRY, maStanLaczeniowy, prymitywy } from '../../cad/cadSymbolRegistry';
import {
  REJESTR_SYMBOLI_NN,
  SYMBOL_ODBIORU,
  SYMBOL_TRANSFORMATORA,
  SYMBOL_ZABEZPIECZENIA,
  SYMBOL_ZACISKU,
  SYMBOL_WEZLA,
  kodyAnsiPelne,
  nazwyFunkcjiPl,
  stanSlowny,
  symbolAparatu,
  symbolPomiaru,
  symbolPunktuToru,
  symbolZrodlaDer,
  technologiaZrodlaPl,
  wpisAparatu,
  znakiIec,
  znakiIecPelne,
} from '../symbolRegistry';
import { SCENARIUSZE_NN, SLUGI_SCENARIUSZY } from '../fixtures/scenariusze';
import type { LvDeviceType } from '../types';

const TYPY = Object.keys(REJESTR_SYMBOLI_NN) as LvDeviceType[];
const KINDY = [null, undefined, '', '  ', 'WYLACZNIK', 'WYLACZNIK_GLOWNY', 'WYLACZNIK_ODPLYWOWY', 'ROZLACZNIK', 'ROZLACZNIK_BEZPIECZNIKOWY', 'ODLACZNIK', 'REKLOZER', 'INWERTER', 'nieznany-rodzaj', 'wylacznik'] as const;

describe('REJESTR_SYMBOLI_NN — typ gałęzi ENM × device_kind → symbol CAD', () => {
  it('rejestr (typ → symbol CAD · klasa · nazwa polska · nośnik stanu) jest zamrożony snapshotem', () => {
    expect(REJESTR_SYMBOLI_NN).toMatchSnapshot();
  });

  it('każdy symbol rejestru istnieje w ELECTRICAL_CAD_SYMBOL_REGISTRY; przewody nie mają symbolu i stanu', () => {
    for (const typ of TYPY) {
      const wpis = REJESTR_SYMBOLI_NN[typ];
      if (wpis.symbolId === null) {
        expect(wpis.klasaOznaczenia, typ).toBe('W');
        expect(wpis.nosnikStanu, typ).toBe('brak');
        expect(wpis.rozmiar, typ).toBe('przewod');
        continue;
      }
      expect(CAD_SYMBOL_IDS, `${typ} → ${wpis.symbolId}`).toContain(wpis.symbolId);
      expect(wpis.nazwaPl).toBe(ELECTRICAL_CAD_SYMBOL_REGISTRY[wpis.symbolId].polishName);
      expect(wpis.nosnikStanu).toBe(maStanLaczeniowy(wpis.symbolId) ? 'noz' : 'brak');
    }
  });

  it('typ gałęzi rozstrzyga RODZINĘ: breaker → wyłącznik, disconnector → odłącznik, switch → rozłącznik, fuse → bezpiecznik — NIEZALEŻNIE od device_kind', () => {
    for (const kind of KINDY) {
      expect(symbolAparatu('breaker', kind), `breaker × ${String(kind)}`).toBe('cad.wylacznik');
      expect(symbolAparatu('disconnector', kind), `disconnector × ${String(kind)}`).toBe('cad.odlacznik');
      expect(symbolAparatu('fuse', kind), `fuse × ${String(kind)}`).toBe('cad.bezpiecznik');
      expect(symbolAparatu('cable', kind), `cable × ${String(kind)}`).toBeNull();
      expect(symbolAparatu('line_overhead', kind), `line × ${String(kind)}`).toBeNull();
      const oczekiwanyRozlacznik = String(kind ?? '').trim().toUpperCase() === 'ROZLACZNIK_BEZPIECZNIKOWY' ? 'cad.rozlacznikBezpiecznikowy' : 'cad.rozlacznik';
      expect(symbolAparatu('switch', kind), `switch × ${String(kind)}`).toBe(oczekiwanyRozlacznik);
    }
  });

  it('sprzęgło = symbol REALNEGO aparatu z device_kind (§6); bez klasy albo z klasą nieznaną → łącznik ogólny (audyt NN-AUD-18 po stronie backendu)', () => {
    expect(symbolAparatu('bus_coupler', 'WYLACZNIK')).toBe('cad.wylacznik');
    expect(symbolAparatu('bus_coupler', 'WYLACZNIK_GLOWNY')).toBe('cad.wylacznik');
    expect(symbolAparatu('bus_coupler', 'wylacznik')).toBe('cad.wylacznik');
    expect(symbolAparatu('bus_coupler', 'ROZLACZNIK')).toBe('cad.rozlacznik');
    expect(symbolAparatu('bus_coupler', 'ROZLACZNIK_BEZPIECZNIKOWY')).toBe('cad.rozlacznikBezpiecznikowy');
    expect(symbolAparatu('bus_coupler', 'ODLACZNIK')).toBe('cad.odlacznik');
    for (const kind of [null, undefined, '', '  ', 'INWERTER', 'nieznany-rodzaj'] as const) {
      expect(symbolAparatu('bus_coupler', kind), `bus_coupler × ${String(kind)}`).toBe('cad.lacznik');
    }
    // Sprzęgło zachowuje klasę oznaczenia QBC i slot sprzęgła niezależnie od symbolu.
    for (const kind of KINDY) {
      const wpis = wpisAparatu('bus_coupler', kind);
      expect(wpis.klasaOznaczenia).toBe('QBC');
      expect(wpis.rozmiar).toBe('sprzeglo');
      expect(wpis.nosnikStanu).toBe('noz');
    }
  });

  it('nazwy polskie z rejestru CAD (§18): WYŁĄCZNIK / ODŁĄCZNIK / ROZŁĄCZNIK / BEZPIECZNIK / ŁĄCZNIK; QF/QS/FU/QBC pozostają identyfikatorami', () => {
    expect(wpisAparatu('breaker', null).nazwaPl.toUpperCase()).toContain('WYŁĄCZNIK');
    expect(wpisAparatu('disconnector', null).nazwaPl.toUpperCase()).toContain('ODŁĄCZNIK');
    expect(wpisAparatu('switch', null).nazwaPl.toUpperCase()).toContain('ROZŁĄCZNIK');
    expect(wpisAparatu('switch', 'ROZLACZNIK_BEZPIECZNIKOWY').nazwaPl.toUpperCase()).toContain('ROZŁĄCZNIK BEZPIECZNIKOWY');
    expect(wpisAparatu('fuse', null).nazwaPl.toUpperCase()).toContain('BEZPIECZNIK');
    expect(wpisAparatu('bus_coupler', null).nazwaPl.toUpperCase()).toContain('ŁĄCZNIK');
    expect(wpisAparatu('cable', null).nazwaPl).toBe('Kabel');
    expect(wpisAparatu('line_overhead', null).nazwaPl).toBe('Linia napowietrzna');
    expect(wpisAparatu('breaker', null).klasaOznaczenia).toBe('QF');
    expect(wpisAparatu('switch', null).klasaOznaczenia).toBe('QS');
    expect(wpisAparatu('disconnector', null).klasaOznaczenia).toBe('QS');
    expect(wpisAparatu('fuse', null).klasaOznaczenia).toBe('FU');
  });

  it('stan OPEN ≠ CLOSED geometrycznie dla każdego symbolu ze stanem; wkładka i przewód bez stanu', () => {
    for (const typ of TYPY) {
      for (const kind of KINDY) {
        const wpis = wpisAparatu(typ, kind);
        if (wpis.symbolId === null) continue;
        const open = JSON.stringify(prymitywy(wpis.symbolId, 'open'));
        const closed = JSON.stringify(prymitywy(wpis.symbolId, 'closed'));
        if (wpis.nosnikStanu === 'brak') expect(open, `${typ} × ${String(kind)}`).toBe(closed);
        else expect(open, `${typ} × ${String(kind)}`).not.toBe(closed);
      }
    }
  });

  it('KAŻDY typ urządzenia i KAŻDY device_kind występujący w scenariuszach 01–18 ma odwzorowanie (zero symbolu „na oko")', () => {
    const pary = new Set<string>();
    for (const slug of SLUGI_SCENARIUSZY) {
      const g = SCENARIUSZE_NN[slug].graph;
      if (g.status !== 'OK') continue;
      for (const d of g.devices) {
        expect(TYPY, d.device_type).toContain(d.device_type);
        pary.add(`${d.device_type}×${d.device_kind ?? '∅'}`);
        const wpis = wpisAparatu(d.device_type, d.device_kind);
        expect(wpis.nazwaPl.length).toBeGreaterThan(3);
      }
    }
    // Iloczyn cech obecny w danych: sprzęgło z klasą wyłącznika, rozłącznika i BEZ klasy;
    // rozłącznik bezpiecznikowy jako `switch` + device_kind.
    expect(pary).toContain('bus_coupler×WYLACZNIK');
    expect(pary).toContain('bus_coupler×ROZLACZNIK');
    expect(pary).toContain('bus_coupler×∅');
    expect(pary).toContain('switch×ROZLACZNIK_BEZPIECZNIKOWY');
  });
});

describe('Symbole elementów nie-gałęziowych — z DANYCH, nie z domysłu', () => {
  it('transformator, odbiór, zabezpieczenie, zacisk, węzeł — stałe symbole rejestru CAD', () => {
    expect(SYMBOL_TRANSFORMATORA).toBe('cad.transformator2u');
    expect(SYMBOL_ODBIORU).toBe('cad.odplywOdbior');
    expect(SYMBOL_ZABEZPIECZENIA).toBe('cad.zabezpieczenie');
    expect(SYMBOL_ZACISKU).toBe('cad.zacisk');
    expect(SYMBOL_WEZLA).toBe('cad.wezel');
    for (const id of [SYMBOL_TRANSFORMATORA, SYMBOL_ODBIORU, SYMBOL_ZABEZPIECZENIA, SYMBOL_ZACISKU, SYMBOL_WEZLA]) {
      expect(ELECTRICAL_CAD_SYMBOL_REGISTRY[id]).toBeDefined();
    }
  });

  it('punkt toru wg stopnia: ≥ 3 = węzeł (kropka), 1–2 = zacisk (okrąg pusty) — zacisk ≠ węzeł', () => {
    expect(symbolPunktuToru(1)).toBe('cad.zacisk');
    expect(symbolPunktuToru(2)).toBe('cad.zacisk');
    expect(symbolPunktuToru(3)).toBe('cad.wezel');
    expect(symbolPunktuToru(7)).toBe('cad.wezel');
    expect(prymitywy('cad.zacisk')).not.toEqual(prymitywy('cad.wezel'));
  });

  it('źródło rozproszone wg gen_type: PV → złożenie PV+falownik, BESS → bateria+przekształtnik, maszyny i typ nieznany → generator G~', () => {
    expect(symbolZrodlaDer('pv_inverter')).toBe('cad.zrodloPvZPrzeksztaltnikiem');
    expect(symbolZrodlaDer('bess')).toBe('cad.magazynZPrzeksztaltnikiem');
    expect(symbolZrodlaDer('wind_inverter')).toBe('cad.generator');
    expect(symbolZrodlaDer('fw_dfig')).toBe('cad.generator');
    expect(symbolZrodlaDer('synchronous')).toBe('cad.generator');
    expect(symbolZrodlaDer(null)).toBe('cad.generator');
  });

  it('technologia źródła po polsku (opis obok symbolu): PV to technologia, falownik element; typ nieznany nazwany uczciwie', () => {
    expect(technologiaZrodlaPl('pv_inverter')).toContain('fotowoltaika');
    expect(technologiaZrodlaPl('pv_inverter')).toContain('falownik');
    expect(technologiaZrodlaPl('bess')).toContain('magazyn energii');
    expect(technologiaZrodlaPl('synchronous')).toContain('synchroniczny');
    expect(technologiaZrodlaPl('fw_pmsg')).toContain('turbina wiatrowa');
    expect(technologiaZrodlaPl(null)).toContain('nieokreślonej');
  });

  it('pomiar: CT → przekładnik prądowy (w torze), VT → napięciowy (odgałęzienie)', () => {
    expect(symbolPomiaru('CT')).toBe('cad.przekladnikPradowy');
    expect(symbolPomiaru('VT')).toBe('cad.przekladnikNapieciowy');
  });

  it('funkcje zabezpieczeń: znaki IEC do prostokąta (≤2, inaczej pierwszy + licznik), pełne listy IEC/ANSI/nazw osobno; kod nieznany przechodzi bez zmian', () => {
    expect(znakiIec(['overcurrent_50', 'overcurrent_51'])).toEqual(['I>>', 'I>']);
    expect(znakiIec(['rocof_81R', 'underfrequency_81U', 'vector_shift_78'])).toEqual(['df/dt', '+2']);
    expect(znakiIecPelne(['rocof_81R', 'underfrequency_81U', 'vector_shift_78'])).toEqual(['df/dt', 'f<', 'Δφ']);
    expect(znakiIecPelne(['earth_fault_51N', 'directional_67N', 'undervoltage_27', 'overvoltage_59', 'overfrequency_81O', 'earth_fault_50N', 'directional_67'])).toEqual(['I0>', 'I0>→', 'U<', 'U>', 'f>', 'I0>>', 'I>→']);
    expect(kodyAnsiPelne(['rocof_81R', 'underfrequency_81U', 'vector_shift_78'])).toEqual(['81R', '81U', '78']);
    expect(nazwyFunkcjiPl(['overcurrent_51', 'earth_fault_51N'])).toEqual(['nadprądowe zwłoczne', 'ziemnozwarciowe zwłoczne']);
    expect(kodyAnsiPelne(['nieznany_kod'])).toEqual(['nieznany_kod']);
    expect(znakiIecPelne(['nieznany_kod'])).toEqual(['nieznany_kod']);
    expect(znakiIec([])).toEqual([]);
  });

  it('słowo stanu po polsku (drugorzędne potwierdzenie symbolu)', () => {
    expect(stanSlowny('OPEN')).toBe('OTWARTY');
    expect(stanSlowny('CLOSED')).toBe('ZAMKNIĘTY');
    expect(stanSlowny('UNKNOWN')).toBe('STAN NIEZNANY');
  });
});
