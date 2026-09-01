/**
 * SCHEMAT-10 S3 (V12K-135) — testy `theme/colorTokens.ts`. Dowodzi:
 *  (a) klasyfikator napięcia czyta `kind`/`ownerRef` zgodnie z konwencjami
 *      `compose/gpz.ts`/`compose/station.ts` (§hv-/§lv- markery);
 *  (b) NOP dostaje kolor STANU, nie napięcia;
 *  (c) `gridSource`/`loadArrow` mają deterministyczną klasyfikację po
 *      `symbolId` (bez potrzeby `ownerRef`);
 *  (d) tabela §3 (napięcie/stan/wyróżnienie) nie ma kolizji literałów hex
 *      między WYMIARAMI (D8 — „zielony pełni naraz rolę energizacji i SN").
 */
import { describe, expect, it } from 'vitest';

import {
  BASE_STROKE,
  baseSegmentStrokeColor,
  baseSymbolStrokeColor,
  HIGHLIGHT_COLOR,
  STATE_COLOR,
  voltageClassOf,
  VOLTAGE_COLOR,
} from '../colorTokens';

describe('colorTokens — voltageClassOf (napięcie)', () => {
  it('kind="lv" ⇒ nn, niezależnie od ownerRef', () => {
    expect(voltageClassOf({ kind: 'lv', ownerRef: 'station-1#lv-bus' })).toBe('nn');
  });

  it('ownerRef z markerem #lv- ⇒ nn (stacja: #lv-bus/#lv-drop-N/#lv-load-drop/#lv-portal-drop)', () => {
    expect(voltageClassOf({ ownerRef: 'station-1#lv-bus' })).toBe('nn');
    expect(voltageClassOf({ ownerRef: 'station-1#lv-drop-0' })).toBe('nn');
    expect(voltageClassOf({ ownerRef: 'station-1#lv-load-drop' })).toBe('nn');
    expect(voltageClassOf({ ownerRef: 'station-1#lv-portal-drop' })).toBe('nn');
  });

  it('ownerRef z markerem #hv- ⇒ hv (GPZ: #hv-bus/#hv-connector/#hv-lateral-N/#hv-bus-tap)', () => {
    expect(voltageClassOf({ ownerRef: 'gpz-1#hv-bus' })).toBe('hv');
    expect(voltageClassOf({ ownerRef: 'gpz-1#hv-connector' })).toBe('hv');
    expect(voltageClassOf({ ownerRef: 'bay-1#hv-lateral-0' })).toBe('hv');
    expect(voltageClassOf({ ownerRef: 'tr-1#hv-bus-tap' })).toBe('hv');
  });

  it('domyślnie (SN bus stacji, szyna sekcji SN GPZ, brak markera) ⇒ sn', () => {
    expect(voltageClassOf({ ownerRef: 'station-1#sn-bus' })).toBe('sn');
    expect(voltageClassOf({ ownerRef: 'section-A#bus-primary', kind: 'busGpz' })).toBe('sn');
    expect(voltageClassOf(undefined)).toBe('sn');
    expect(voltageClassOf({})).toBe('sn');
  });
});

describe('colorTokens — jawna klasa napięcia z kompozycji (V12K-217)', () => {
  // Aparaty pola WN transformatora GPZ stoją po stronie 110 kV, ale ich
  // `transformerRef`/`bayRef` tego nie zdradza (referencje są opaque). Bez jawnej
  // klasy dziedziczyły domyślny kolor SN — wyłącznik 110 kV wyglądał jak
  // wyłącznik 15 kV (pomiar audytu R4). Kompozycja jest jedynym miejscem, które
  // stronę transformatora zna, więc jej deklaracja MUSI wygrywać.
  it('`voltageClass` ma pierwszeństwo przed klasyfikacją substring po ownerRef', () => {
    expect(voltageClassOf({ voltageClass: 'hv', ownerRef: 'gpz/x/transformer/001/wn_sn' })).toBe('hv');
    // ownerRef wskazywałby nN, jawna klasa mówi WN — wygrywa jawna.
    expect(voltageClassOf({ voltageClass: 'hv', ownerRef: 'stacja#lv-bus' })).toBe('hv');
    expect(voltageClassOf({ voltageClass: 'nn', ownerRef: 'gpz#hv-bus' })).toBe('nn');
  });

  it('brak `voltageClass` NIE zmienia dotychczasowej klasyfikacji (zmiana addytywna)', () => {
    expect(voltageClassOf({ ownerRef: 'gpz#hv-bus' })).toBe('hv');
    expect(voltageClassOf({ ownerRef: 'stacja#lv-drop-1' })).toBe('nn');
    expect(voltageClassOf({ ownerRef: 'gpz/x/transformer/001/wn_sn' })).toBe('sn');
    expect(voltageClassOf(undefined)).toBe('sn');
  });

  it('aparat z jawną klasą WN dostaje czerwień WN, nie zieleń SN', () => {
    expect(baseSymbolStrokeColor('breaker', { voltageClass: 'hv' })).toBe(VOLTAGE_COLOR.hv);
    expect(baseSymbolStrokeColor('breaker', { voltageClass: 'hv' })).not.toBe(VOLTAGE_COLOR.sn);
    // Ten sam symbol BEZ jawnej klasy zostaje SN — dowód, że różnicę robi klasa.
    expect(baseSymbolStrokeColor('breaker', {})).toBe(VOLTAGE_COLOR.sn);
  });
});

describe('colorTokens — baseSegmentStrokeColor', () => {
  it('odcinki adnotacji (protectionTrip/measurementLink/leader) zostają na BASE_STROKE — NIE dostają koloru napięcia', () => {
    expect(baseSegmentStrokeColor({ kind: 'protectionTrip', ownerRef: 'x#hv-bus' })).toBe(BASE_STROKE);
    expect(baseSegmentStrokeColor({ kind: 'measurementLink', ownerRef: 'x#lv-bus' })).toBe(BASE_STROKE);
    expect(baseSegmentStrokeColor({ kind: 'leader' })).toBe(BASE_STROKE);
  });

  it('odcinek toru mocy dostaje kolor napięcia z VOLTAGE_COLOR', () => {
    expect(baseSegmentStrokeColor({ ownerRef: 'gpz-1#hv-bus' })).toBe(VOLTAGE_COLOR.hv);
    expect(baseSegmentStrokeColor({ ownerRef: 'station-1#sn-bus' })).toBe(VOLTAGE_COLOR.sn);
    expect(baseSegmentStrokeColor({ kind: 'lv', ownerRef: 'station-1#lv-bus' })).toBe(VOLTAGE_COLOR.nn);
  });
});

describe('colorTokens — baseSymbolStrokeColor', () => {
  it('noPoint (D7/D8): kolor STANU (STATE_COLOR.nop), NIE napięcia — wyróżniony niezależnie od ownerRef', () => {
    expect(baseSymbolStrokeColor('noPoint', { ownerRef: 'station-7' })).toBe(STATE_COLOR.nop);
    expect(baseSymbolStrokeColor('noPoint', undefined)).toBe(STATE_COLOR.nop);
  });

  it('gridSource ⇒ ZAWSZE hv (sieć zewnętrzna GPZ — deterministyczne po symbolId)', () => {
    expect(baseSymbolStrokeColor('gridSource', { ownerRef: 'src-1' })).toBe(VOLTAGE_COLOR.hv);
  });

  it('loadArrow ⇒ ZAWSZE nn (zagregowany odbiór 0,4 kV — deterministyczne po symbolId)', () => {
    expect(baseSymbolStrokeColor('loadArrow', { ownerRef: 'station-1#lv-load-drop' })).toBe(VOLTAGE_COLOR.nn);
  });

  it('aparatura bez klasyfikowalnego ownerRef spada na fallback sn (GAP udokumentowany w colorTokens.ts)', () => {
    expect(baseSymbolStrokeColor('breaker', { ownerRef: 'bay-42' })).toBe(VOLTAGE_COLOR.sn);
  });
});

describe('colorTokens — D8 (zero kolizji hex MIĘDZY wymiarami napięcie/stan/wyróżnienie)', () => {
  it('napięcie (VOLTAGE_COLOR) nie koliduje z żadną wartością wyróżnienia (HIGHLIGHT_COLOR) — poza celowym hv=BASE_STROKE', () => {
    const highlightValues = new Set(Object.values(HIGHLIGHT_COLOR));
    for (const [key, value] of Object.entries(VOLTAGE_COLOR)) {
      if (key === 'hv') continue; // celowy alias z BASE_STROKE (matrix §3: „110 biały" = baza), udokumentowany.
      expect(highlightValues.has(value), `VOLTAGE_COLOR.${key}=${value} koliduje z HIGHLIGHT_COLOR`).toBe(false);
    }
  });

  it('stan (STATE_COLOR) nie koliduje z żadną wartością napięcia/wyróżnienia', () => {
    const otherValues = new Set([...Object.values(VOLTAGE_COLOR), ...Object.values(HIGHLIGHT_COLOR)]);
    for (const [key, value] of Object.entries(STATE_COLOR)) {
      expect(otherValues.has(value), `STATE_COLOR.${key}=${value} koliduje z napięciem/wyróżnieniem`).toBe(false);
    }
  });

  it('wyróżnienie (HIGHLIGHT_COLOR): każda wartość WŁASNEGO wymiaru jest unikalna (jeden odcień = jedno znaczenie wyniku)', () => {
    const values = Object.values(HIGHLIGHT_COLOR);
    expect(new Set(values).size).toBe(values.length);
  });
});
