/**
 * Karta UX-04/ROZDZIELNICA-SN-KOREKTA — decyzja architekta D1 (kolumna pola TR w rastrze celek)
 * i D3c (raster wyklucza nakładanie): wieża transformatora (pole WN TR → TR2W → pole TR) jest
 * CELKĄ szeregu sekcji SN — stoi w miejscu pola TR w kolejności modelu
 * (`CanonicalGpzTransformer.pozycjaCelkiWSekcji`), jej oś jest osią toru transformatora,
 * a numeracja celek jest ciągła z polami sekcji.
 *
 * Iloczyn cech: pozycja celki {początek, środek, koniec, brak (null)} × liczba wież w sekcji
 * {1, 2 na tej samej pozycji} × pola wieży {bez rekordów, z rekordami}. Wyrocznie: numery
 * 1…n bez luk, kolumny rozłączne parami (przedziały X), oś TR2W i aparatów pola TR = oś kolumny,
 * każdy symbol wieży i każdego pola wewnątrz swojej kolumny, kolejność celek = kolejność modelu.
 */
import { describe, expect, it } from 'vitest';

import type {
  CanonicalGpzBay,
  CanonicalGpzProps,
  CanonicalGpzTransformer,
} from '../../../v2/canvas/canonicalGpzModel';
import { measureLabelWidth } from '../../core/text';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { composeGpz, type GpzComposition } from '../gpz';

const POLA = ['b-1', 'b-2', 'b-3'];

function pole(ref: string, rola: CanonicalGpzBay['fieldRole'], kinds: readonly string[]): CanonicalGpzBay {
  return {
    bayRef: ref,
    bayNumber: null,
    feederName: null,
    destinationLabel: null,
    fieldRole: rola,
    rolaPola: rola === 'TRANSFORMER' ? 'transformatorowe' : 'liniowe',
    statusFlags: [],
    qDesignations: {},
    primaryDevices: kinds.map((kind, i) => ({ kind, placement: 'MIDSTREAM' as const, deviceRef: `${ref}/${kind.toLowerCase()}-${i}` })),
  } as CanonicalGpzBay;
}

function transformator(ref: string, pozycja: number | null, zRekordami: boolean): CanonicalGpzTransformer {
  return {
    transformerRef: ref,
    designation: ref.toUpperCase(),
    snMva: 25,
    uhvKv: 110,
    ulvKv: 15,
    vectorGroup: 'YNd11',
    lvSectionId: 'sec-1',
    poleWn: null,
    poleTr: zRekordami ? pole(`${ref}/pole-tr`, 'TRANSFORMER', ['DS', 'CB', 'CT']) : null,
    pozycjaCelkiWSekcji: pozycja,
  };
}

function props(transformers: readonly CanonicalGpzTransformer[]): CanonicalGpzProps {
  return {
    id: 'gpz-raster',
    name: 'GPZ RASTER',
    transformers,
    sections: [
      {
        sectionId: 'sec-1',
        order: 1,
        label: 'Sekcja 1',
        busVoltageKv: 15,
        bays: POLA.map((ref) => pole(ref, 'LINE_OUT', ['DS', 'CB', 'CT', 'CABLE_HEAD'])),
      },
    ],
    couplers: [],
  };
}

function sprawdzRaster(kompozycja: GpzComposition, oczekiwanaKolejnosc: readonly string[]): void {
  const celki = kompozycja.rasterCelek.filter((c) => c.sectionId === 'sec-1');
  // Numeracja ciągła 1…n, kolejność = kolejność modelu.
  expect(celki.map((c) => c.numer)).toEqual(celki.map((_, i) => i + 1));
  expect(celki.map((c) => c.ref)).toEqual(oczekiwanaKolejnosc);
  // Kolumny rozłączne parami (raster wyklucza nakładanie) i rosnące w X.
  for (let i = 0; i < celki.length; i += 1) {
    for (let j = i + 1; j < celki.length; j += 1) {
      expect(celki[i].rightX, `${celki[i].ref} | ${celki[j].ref}`).toBeLessThanOrEqual(celki[j].leftX);
    }
  }
  for (const celka of celki.filter((c) => c.rodzaj === 'wieza')) {
    const tr = kompozycja.symbols.find((s) => s.symbolId === 'transformer2W' && s.meta.transformerRef === celka.ref)!;
    const os = tr.x + SYMBOL_DEFS.transformer2W.width / 2;
    expect(os).toBeGreaterThan(celka.leftX);
    expect(os).toBeLessThan(celka.rightX);
    // Każdy symbol wieży (pole WN TR, TR2W, pole TR) mieści się w kolumnie celki.
    const wlasne = kompozycja.symbols.filter((s) => s.meta.transformerRef === celka.ref);
    for (const s of wlasne) {
      expect(s.x, s.meta.testId).toBeGreaterThanOrEqual(celka.leftX);
      expect(s.x + SYMBOL_DEFS[s.symbolId].width, s.meta.testId).toBeLessThanOrEqual(celka.rightX);
    }
    // Tor główny pola TR na osi kolumny (oś toru = oś TR2W).
    for (const s of wlasne.filter((x) => x.meta.testId?.includes('tr-field') && !x.meta.odgalezienieToru && x.symbolId !== 'transformer2W')) {
      if (s.meta.apparatusKind === 'ES') continue;
      expect(s.x + SYMBOL_DEFS[s.symbolId].width / 2, s.meta.testId).toBe(os);
    }
  }
  for (const celka of celki.filter((c) => c.rodzaj === 'pole')) {
    for (const s of kompozycja.symbols.filter((x) => x.meta.bayRef === celka.ref)) {
      expect(s.x, s.meta.testId).toBeGreaterThanOrEqual(celka.leftX);
      expect(s.x + SYMBOL_DEFS[s.symbolId].width, s.meta.testId).toBeLessThanOrEqual(celka.rightX);
    }
  }
}

describe('GPZ — kolumna wieży transformatora w rastrze celek sekcji (D1/D3c)', () => {
  const POZYCJE: readonly (readonly [string, number | null, readonly string[]])[] = [
    ['początek', 0, ['tr-1', 'b-1', 'b-2', 'b-3']],
    ['środek', 2, ['b-1', 'b-2', 'tr-1', 'b-3']],
    ['koniec', 3, ['b-1', 'b-2', 'b-3', 'tr-1']],
    ['brak pola TR w kolejności (null)', null, ['b-1', 'b-2', 'b-3', 'tr-1']],
  ];
  for (const [nazwa, pozycja, kolejnosc] of POZYCJE) {
    for (const zRekordami of [false, true]) {
      it(`1 wieża × pozycja ${nazwa} × pole TR ${zRekordami ? 'z rekordami' : 'bez rekordów'}`, () => {
        sprawdzRaster(composeGpz(props([transformator('tr-1', pozycja, zRekordami)]), { x: 0, y: 0 }), kolejnosc);
      });
    }
  }

  it('2 wieże na tej samej pozycji: kolejno wg transformerRef, numeracja ciągła, kolumny rozłączne', () => {
    sprawdzRaster(
      composeGpz(props([transformator('tr-2', 1, true), transformator('tr-1', 1, false)]), { x: 0, y: 0 }),
      ['b-1', 'tr-1', 'tr-2', 'b-2', 'b-3'],
    );
  });

  it('2 wieże na różnych pozycjach (początek i koniec)', () => {
    sprawdzRaster(
      composeGpz(props([transformator('tr-1', 0, true), transformator('tr-2', 3, true)]), { x: 0, y: 0 }),
      ['tr-1', 'b-1', 'b-2', 'b-3', 'tr-2'],
    );
  });

  it('kolumna wieży na początku szeregu nie wchodzi pod etykietę sekcji', () => {
    const k = composeGpz(props([transformator('tr-1', 0, true)]), { x: 0, y: 0 });
    const etykieta = k.labels.sectionLabels.find((l) => l.ownerRef.startsWith('sec-1'))!;
    const celka = k.rasterCelek.find((c) => c.ref === 'tr-1')!;
    expect(etykieta).toBeDefined();
    // Etykieta sekcji jest wyśrodkowana na lewym końcu szyny — jej prawa krawędź.
    const prawaEtykiety = etykieta.anchor.x + measureLabelWidth(etykieta.text, etykieta.labelClass) / 2;
    expect(celka.leftX).toBeGreaterThan(prawaEtykiety);
  });

  it('determinizm: ta sama migawka → ten sam raster', () => {
    const a = composeGpz(props([transformator('tr-1', 1, true)]), { x: 0, y: 0 });
    const b = composeGpz(props([transformator('tr-1', 1, true)]), { x: 0, y: 0 });
    expect(a.rasterCelek).toEqual(b.rasterCelek);
  });
});

// ---------------------------------------------------------------------------
// D1 — klasa „pole zasilające NAD szyną": inwentarz klasy w kompozycji GPZ to pole liniowe WN
// (nad szyną WN) i pole TR (nad szyną SN). Oba liczą tor OD SZYNY w górę (`w-gore`): pierwszy
// rekord aparatów (od strony szyn) stoi najniżej, zaczep szyny wychodzi z jego portu S. Pola pod
// szyną (pola sekcji SN, pole WN TR pod szyną WN) zostają `w-dol`. Iloczyn: rodzaj pola ×
// rekordy {DS-CB-CT, DS-CB-CT-ES (aparat boczny)}.
// ---------------------------------------------------------------------------
describe('GPZ — klasa pól zasilających nad szyną: tor od szyny w górę (D1)', () => {
  for (const rekordy of [['DS', 'CB', 'CT'], ['DS', 'CB', 'CT', 'ES']] as const) {
    it(`pole liniowe WN i pole TR × rekordy ${rekordy.join('-')}`, () => {
      const tr = { ...transformator('tr-1', 1, false), poleTr: pole('tr-1/pole-tr', 'TRANSFORMER', rekordy), poleWn: pole('tr-1/pole-wn', 'TRANSFORMER', rekordy) };
      const k = composeGpz(
        {
          ...props([tr]),
          hvSections: [{ sectionId: 'hv-1', order: 1, label: 'WN', busVoltageKv: 110, bays: [pole('hv-l1', 'LINE_IN', rekordy)] }],
        },
        { x: 0, y: 0 },
      );
      const nadSzyna: readonly (readonly [string, string])[] = [
        ['gpz-canonical-hv-bay-hv-l1-', 'hv-l1#hv-bus-tap'],
        ['gpz-canonical-tr-field-tr-1-', 'tr-1#tr-field-to-bus'],
      ];
      for (const [prefiks, zaczep] of nadSzyna) {
        const stos = k.symbols.filter((s) => s.meta.testId?.startsWith(prefiks));
        expect(stos.length, prefiks).toBe(rekordy.length);
        const tor = stos.filter((s) => s.meta.apparatusKind !== 'ES');
        for (const s of tor) expect(s.kierunekToru, s.meta.testId).toBe('w-gore');
        // Uziemnik boczny wisi pod węzłem toru — ziemia zawsze w dół, styk od strony toru, więc
        // glif aparatu bocznego NIE jest odwracany (orientacja `w-dol` niezależnie od toru).
        for (const s of stos.filter((x) => x.meta.apparatusKind === 'ES')) expect(s.kierunekToru, s.meta.testId).toBeUndefined();
        // Kolejność rekordów od szyny w górę: y maleje wraz z numerem rekordu.
        for (let i = 1; i < tor.length; i += 1) expect(tor[i].y, tor[i].meta.testId).toBeLessThan(tor[i - 1].y);
        const odcinek = k.segments.find((s) => s.ownerRef === zaczep)!;
        expect(odcinek, zaczep).toBeDefined();
        expect(odcinek.points[0].y).toBe(tor[0].ports.bottom.y);
      }
      for (const s of k.symbols.filter((x) => x.meta.testId?.startsWith('gpz-canonical-hv-tr-bay-') || x.meta.bayRef?.startsWith('b-'))) {
        expect(s.kierunekToru, s.meta.testId).toBeUndefined();
      }
    });
  }
});
