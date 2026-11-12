/**
 * Sekcja „Wyniki” inspektora — rodzaj biegu × rodzaj elementu (meldunek koordynatora
 * 2026-11-12: po biegu zwarciowym sekcja pokazywała „Wynik aktywnego przebiegu nie zawiera
 * wielkości dla tego elementu”, a niżej tabelę Ik″, ip, Ith tej szyny — dawna lista kodów
 * inspektora znała wyłącznie kody rozpływu). Odczyt idzie dziś z JEDNEGO słownika kodów,
 * wspólnego z etykietami kanwy (`resultLabelTemplates.ts`, analiza × klasa obiektu).
 *
 * ILOCZYN CECH: rodzaj biegu {rozpływ · zwarcie 3F · zwarcie 1F · różnica zwarć A/B · analiza
 * bez wielkości w rejestrze} × rodzaj elementu kanwy {stacja · szyna · węzeł · transformator ·
 * generator · sieć zasilająca · źródło OZE · odcinek · aparat · pole} → wykaz wielkości niepusty
 * ALBO przyczyna braku z nazwą analizy (komunikat braku tylko, gdy bieg nie niesie wielkości
 * obiektu). Oczekiwania wypisane wprost (tabela), nie wyliczone z rejestru.
 *
 * Inwentarz klasy (słownik kodów): każdy kod rejestru jest kodem emitowanym przez backend
 * (`domain/result_builder_v1.py::METRYKI_ELEMENTOW_WYNIKU`, nakładka różnic zwarć
 * `application/result_mapping/zwarcia_delta_overlay_v1.py`) — kod spoza backendu byłby wierszem,
 * który nigdy nie dostanie wartości.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import fikstura from '../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { jestRodzajemGaleziAparatu } from '../../../../types/rodzajeGalezi';
import type { RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { POWOD_BRAK_PRZEBIEGU_PL, stanWynikowElementu } from '../../../network-build/inspektor-elementu/stanPaneluElementu';
import { odczytWynikuElementu, type DaneElementuKanwy } from '../daneElementuKanwy';
import { RESULT_LABEL_TEMPLATES } from '../resultLabelTemplates';

const here = dirname(fileURLToPath(import.meta.url));
const migawka = (fikstura as unknown as { snapshot: EnergyNetworkModel }).snapshot;
// Migawka backendu nie ma generatorów — jedno źródło OZE na szynie SN dopisane jawnie (rekord
// w kształcie ENM), żeby iloczyn objął klasę „źródło”.
const model: EnergyNetworkModel = {
  ...migawka,
  generators: [
    {
      id: 'gen-pv-1',
      ref_id: 'gen-pv-1',
      name: 'Falownik PV 1',
      bus_ref: (migawka.buses ?? []).find((b) => b.voltage_kv >= 1)!.ref_id,
      gen_type: 'pv_inverter',
      tags: [],
      meta: {},
    } as unknown as NonNullable<EnergyNetworkModel['generators']>[number],
  ],
};

/** Kody backendu — z obu źródeł nakładki (wyniki elementów i różnice zwarć). */
const KODY_BACKENDU: ReadonlySet<string> = (() => {
  const zrodla = [
    resolve(here, '..', '..', '..', '..', '..', '..', 'backend', 'src', 'domain', 'result_builder_v1.py'),
    resolve(here, '..', '..', '..', '..', '..', '..', 'backend', 'src', 'application', 'result_mapping', 'zwarcia_delta_overlay_v1.py'),
  ];
  const kody = new Set<string>();
  for (const plik of zrodla) {
    for (const m of readFileSync(plik, 'utf8').matchAll(/\(\s*"([A-Z][A-Za-z0-9_]*)"\s*,/g)) kody.add(m[1]);
  }
  return kody;
})();

const ZWARCIOWY = /^(IK_|IP_|ITH_|SK_)/;
const ROZNICOWY = /^(DELTA_IK|DELTA_IP|DELTA_ITH|DELTA_SK|B_)/;
/** Kody, które bieg danego rodzaju niesie (jak backend: bieg zwarciowy — wyłącznie wielkości
 *  zwarciowe; różnice A/B — kody różnic; rozpływ i analiza spoza rejestru — kody rozpływu). */
function kodyBiegu(analysisType: string): string[] {
  const kody = [...KODY_BACKENDU];
  if (analysisType.startsWith('SC_')) return kody.filter((k) => ZWARCIOWY.test(k));
  if (analysisType.startsWith('DELTA_')) return kody.filter((k) => ROZNICOWY.test(k));
  return kody.filter((k) => !ZWARCIOWY.test(k) && !ROZNICOWY.test(k));
}

/** Nakładka z kodami biegu pod każdym refem modelu. */
function nakladka(analysisType: string): RawOverlayPayload {
  const refy = new Set<string>();
  for (const kol of ['buses', 'branches', 'transformers', 'generators', 'sources', 'substations', 'bays'] as const) {
    for (const el of (model[kol] ?? []) as ReadonlyArray<{ ref_id: string }>) refy.add(el.ref_id);
  }
  const elements: RawOverlayPayload['elements'] = {};
  for (const ref of refy) {
    const metrics: Record<string, { code: string; value: number; unit: string }> = {};
    for (const code of kodyBiegu(analysisType)) metrics[code] = { code, value: 12.5, unit: code.endsWith('_A') ? 'A' : '' };
    elements[ref] = { ref_id: ref, kind: 'element', badges: [], severity: 'INFO', metrics };
  }
  return { run_id: 'run-iloczyn', analysis_type: analysisType, elements } as RawOverlayPayload;
}

const pierwszy = <T extends { ref_id: string }>(lista: readonly T[] | undefined, p: (x: T) => boolean = () => true): string => {
  const el = (lista ?? []).find(p);
  expect(el, 'element w fiksturze').toBeDefined();
  return el!.ref_id;
};

const szynaSn = pierwszy(model.buses, (b) => b.voltage_kv >= 1);
const REFY: Readonly<Record<NonNullable<DaneElementuKanwy['kind']>, string>> = {
  station: pierwszy(model.substations, (s) => s.station_type !== 'gpz'),
  bus: szynaSn,
  node: szynaSn,
  transformer: pierwszy(model.transformers),
  generator: pierwszy(model.generators),
  grid_source: pierwszy(model.sources),
  der: pierwszy(model.generators),
  cable_run: pierwszy(model.branches, (g) => !jestRodzajemGaleziAparatu(g.type)),
  apparatus: pierwszy(model.branches, (g) => jestRodzajemGaleziAparatu(g.type)),
  bay: pierwszy(model.bays),
};
const RODZAJE = Object.keys(REFY) as Array<NonNullable<DaneElementuKanwy['kind']>>;

/** Rodzaje z wykazem wielkości per bieg — tabela wprost. */
const Z_WIELKOSCIAMI: Readonly<Record<string, ReadonlySet<string>>> = {
  LOAD_FLOW: new Set(['station', 'bus', 'node', 'transformer', 'generator', 'grid_source', 'der', 'cable_run', 'apparatus']),
  SC_3F: new Set(['station', 'bus', 'node']),
  SC_1F: new Set(['station', 'bus', 'node']),
  DELTA_SC_3F: new Set(['station', 'bus', 'node']),
  HARMONICS: new Set(),
};
const TYTUL: Readonly<Record<string, string>> = {
  LOAD_FLOW: 'Rozpływ mocy',
  SC_3F: 'Obliczenia zwarciowe',
  SC_1F: 'Obliczenia zwarciowe',
  DELTA_SC_3F: 'Porównanie zwarć A/B',
};

describe('sekcja „Wyniki”: rodzaj biegu × rodzaj elementu', () => {
  it('jeden słownik: każdy kod rejestru jest kodem nakładki backendu', () => {
    expect(KODY_BACKENDU.size).toBeGreaterThan(20);
    const kodyRejestru = Object.values(RESULT_LABEL_TEMPLATES).flatMap((klasy) =>
      Object.values(klasy).flatMap((specy) => (specy ?? []).map((s) => s.code)),
    );
    expect(kodyRejestru.filter((k) => !KODY_BACKENDU.has(k))).toEqual([]);
  });

  describe.each(Object.keys(Z_WIELKOSCIAMI))('bieg %s', (bieg) => {
    const payload = nakladka(bieg);
    it.each(RODZAJE)('%s', (rodzaj) => {
      const odczyt = odczytWynikuElementu(payload, model, rodzaj, REFY[rodzaj]);
      const stan = stanWynikowElementu(true, 'aktualny', odczyt, 'Obiekt X', 'run-iloczyn');
      if (Z_WIELKOSCIAMI[bieg].has(rodzaj)) {
        expect(odczyt.metryki.length, 'wykaz wielkości').toBeGreaterThan(0);
        expect(stan.stan).toBe('wartosc');
        // Każda wielkość z wartością sformatowaną (liczba w polskim zapisie), bez kresek.
        for (const m of odczyt.metryki) expect(m.value).toMatch(/\d/);
      } else {
        expect(odczyt.metryki).toEqual([]);
        expect(stan.stan).toBe('brak');
        if (stan.stan !== 'brak') return;
        expect(stan.powodPl).not.toBe(POWOD_BRAK_PRZEBIEGU_PL);
        expect(stan.powodPl).toContain('Obiekt X');
        if (TYTUL[bieg]) expect(stan.powodPl.startsWith(TYTUL[bieg])).toBe(true);
      }
    });
  });

  it('brak biegu: jeden komunikat braku przebiegu (nie „brak wielkości”)', () => {
    const odczyt = odczytWynikuElementu(null, model, 'bus', szynaSn);
    const stan = stanWynikowElementu(false, null, odczyt, 'Obiekt X');
    expect(stan).toMatchObject({ stan: 'brak', powodPl: POWOD_BRAK_PRZEBIEGU_PL });
  });
});
