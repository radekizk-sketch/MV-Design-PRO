/**
 * SZYNY-STACJI-LUSTRO (commit 2) — reguła „transformatory stacji” × KONSUMENCI.
 * ILOCZYN CECH: transformator {na szynie głównej, na zacisku pola, blokowy przez wskazanie
 * źródła, blokowy przez rolę katalogową, na szynie obcej, zadeklarowany w stacji bez szyn}
 * × konsument {podsumowanie transformatorów budowy sieci, szuflada (stacja transformatora),
 * topologia SLD (transformatory stacji), karta i przegląd stacji (transformatory rozdzielcze)}.
 * Konsument „eksport CIM (kontener)” zniknął razem z klientowym eksporterem CIM (karta
 * KASACJA-SCL-I-CIM-KLIENT, decyzja K-14/D-41): model sieci eksportuje wyłącznie backend
 * (CGMES EQ+TP), który przynależności transformatora do stacji nie zapisuje w EQ (pola i
 * kontenery idą w side-car) — w kliencie nie ma już czwartego czytelnika tej reguły. Model = model iloczynu z pliku parytetu (zbiory backendu).
 * Dawna reguła „samo `transformer_refs`” gubiła transformator na zacisku pola stacji bez
 * deklaracji — te asercje ją czerwienią (iniekcja w meldunku karty).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { selectTransformerSummaries } from '../../network-build/networkBuildStore';
import { readTopologyFromENM } from '../../sld/core/topologyInputReader';
import { stationRefForTransformerSelection } from '../../sld/shared/detailDrawerData';
import { selectStationDistributionTransformers, stationRefOfTransformer } from '../transformatoryStacji';

const here = dirname(fileURLToPath(import.meta.url));
const { iloczyn } = JSON.parse(readFileSync(resolve(here, 'fixtures/szynyStacjiParytet.json'), 'utf8')) as {
  readonly iloczyn: { readonly model: Record<string, unknown>; readonly transformatory: Record<string, readonly string[]> };
};
const surowy = iloczyn.model as {
  substations: Record<string, unknown>[];
  transformers: Record<string, unknown>[];
  bays: Record<string, unknown>[];
};
const enm = {
  buses: [],
  loads: [],
  sources: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
  branch_points: [],
  ...iloczyn.model,
  header: { hash_sha256: 'iloczyn' },
  bays: surowy.bays.map((b) => ({ id: b.ref_id, name: b.ref_id, bay_role: 'OUT', equipment_refs: [], ...b })),
  substations: surowy.substations.map((s) => ({ id: s.ref_id, name: s.ref_id, transformer_refs: [], ...s })),
  transformers: surowy.transformers.map((t) => ({ id: t.ref_id, name: t.ref_id, sn_mva: 0.63, uk_percent: 6, ...t })),
} as unknown as EnergyNetworkModel;

const OCZEKIWANA_STACJA: Record<string, string | null> = {
  'T/na-szynie-glownej': 'A/stacja',
  'T/na-zacisku': 'A/stacja',
  'T/blokowy-wskazany': 'A/stacja',
  'T/blokowy-rola': 'A/stacja',
  'T/obcy': null,
  'T/deklarowany-w-C': 'C/stacja-bez-meta',
};

describe('stacja transformatora — każdy konsument na jednej regule', () => {
  it.each(Object.entries(OCZEKIWANA_STACJA))('%s → %s', (tr, stacja) => {
    expect(stationRefOfTransformer(enm, tr)).toBe(stacja);
    expect(stationRefForTransformerSelection(enm, tr)).toBe(stacja);
    expect(selectTransformerSummaries(enm).find((t) => t.id === tr)?.stationRef ?? null).toBe(stacja);
  });

  it('topologia SLD: transformatory stacji A = rozdzielcze i blokowe (przynależność, bez filtra)', () => {
    const stacjaA = readTopologyFromENM(enm).stations.find((s) => s.id === 'A/stacja')!;
    expect([...stacjaA.transformerIds]).toEqual(
      ['T/blokowy-rola', 'T/blokowy-wskazany', 'T/na-szynie-glownej', 'T/na-zacisku'],
    );
  });
});

describe('transformatory ROZDZIELCZE — jeden filtr blokowego źródła DER', () => {
  it.each(Object.keys(iloczyn.transformatory))('%s = backend', (ref) => {
    const stacja = enm.substations.find((s) => s.ref_id === ref) as Substation;
    expect(selectStationDistributionTransformers(enm, stacja).map((t) => t.ref_id).sort()).toEqual(iloczyn.transformatory[ref]);
  });

  it('blokowy przez wskazanie źródła i przez rolę katalogową są wykluczone także z deklaracji stacji', () => {
    const zDeklaracja = {
      ...enm,
      substations: enm.substations.map((s) =>
        s.ref_id === 'A/stacja' ? { ...s, transformer_refs: ['T/blokowy-wskazany', 'T/blokowy-rola', 'T/na-zacisku'] } : s,
      ),
    } as EnergyNetworkModel;
    const a = zDeklaracja.substations.find((s) => s.ref_id === 'A/stacja')!;
    expect(selectStationDistributionTransformers(zDeklaracja, a).map((t) => t.ref_id)).toEqual(['T/na-zacisku']);
  });
});
