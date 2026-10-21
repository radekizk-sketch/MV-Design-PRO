/**
 * Inspektor transformatora klikniętego na kanwie — etykieta z nazwy modelu, bez zaszytej klasy
 * (karta ETYKIETY-TR; UI-02b: dane z kanwy trafiają do prawego inspektora, dawny panel
 * szczegółów kanwy skasowany razem z jego kopią danych technicznych transformatora).
 *
 * Dawny panel szczegółów składał „Transformator SN/nN - {stacja}”, a gdy rekordu ENM brakowało, podstawiała
 * napis „Transformator SN/nN” i napięcie strony dolnej 0,4 kV — klasę i liczbę, których model
 * nie potwierdzał. Transformator wstawiany ze stacją nosi domyślną nazwę „Transformator SN/nN”,
 * więc etykieta sklejana z rodzajem dublowała go.
 *
 * Iloczyn cech: źródło danych {rekord ENM, tylko widok SLD stacji, element wewnętrzny stacji}
 * × nazwa {domyślna nazwa stacji, nazwa własna projektanta} × pole {etykieta elementu, etykieta
 * stacji}. Napięcia i dane znamionowe transformatora pokazuje karta inspektora z modelu. Ta sama klasa w etykietach RODZAJU wspólnych dla transformatorów
 * SN/nN i WN/SN GPZ: symbol `transformer2W` (legenda arkusza rysuje go także dla TR GPZ).
 */
import { describe, expect, it } from 'vitest';

import { makeCalculationReadySnapshot } from '../../../../test/enmCalculationSnapshot';
import type { EnergyNetworkModel, Transformer } from '../../../../types/enm';
import { buildSldDataFromSnapshot, type SldDataPayload } from '../../v2/canvas/enmToSldAdapter';
import { SYMBOL_DEFS } from '../../v3/symbols/defs';
import { buildDaneElementuStacji, buildDaneStacji } from '../daneElementuKanwy';

function transformator(name: string): Transformer {
  return {
    id: 'tr-1',
    ref_id: 'tr-1',
    name,
    tags: [],
    meta: {},
    hv_bus_ref: 'bus-load',
    lv_bus_ref: 'bus-load',
    sn_mva: 0.63,
    uhv_kv: 15,
    ulv_kv: 0.4,
    uk_percent: 6,
    pk_kw: 6.5,
    vector_group: 'Dyn11',
  } as unknown as Transformer;
}

function modelZTransformatorem(name: string): EnergyNetworkModel {
  const snapshot = makeCalculationReadySnapshot();
  snapshot.transformers = [transformator(name)];
  return snapshot;
}

/** Widok SLD stacji bez rekordu ENM transformatora (ścieżka `sld_fallback`). */
function rysunekStacjiBezRekordu(snapshot: EnergyNetworkModel): SldDataPayload {
  const baza = buildSldDataFromSnapshot(snapshot, null);
  return {
    ...baza,
    stations: [
      {
        ...(baza.stations[0] ?? {}),
        id: 'st-1',
        stationCode: 'S01',
        name: 'Stacja S01',
        busVoltageKv: 15,
        transformerRatedKva: 630,
        transformerRefs: ['tr-bez-rekordu'],
      },
    ],
  } as unknown as SldDataPayload;
}

describe('inspektor transformatora — etykieta z modelu', () => {
  it.each(['Transformator SN/nN', 'TR-7 Kowalskiego'])(
    'rekord ENM „%s” → etykieta i nazwa = nazwa modelu, bez doklejonego rodzaju',
    (nazwa) => {
      const snapshot = modelZTransformatorem(nazwa);
      const dane = buildDaneElementuStacji(
        snapshot,
        buildSldDataFromSnapshot(snapshot, null),
        null,
        'transformer',
        'tr-1',
      );
      expect(dane?.label).toBe(nazwa);
    },
  );

  it('element wewnętrzny stacji bez rekordu ENM → rodzaj bez klasy', () => {
    const snapshot = makeCalculationReadySnapshot();
    const dane = buildDaneElementuStacji(
      snapshot,
      rysunekStacjiBezRekordu(snapshot),
      null,
      'transformer',
      'st-1/transformer/0',
    );
    // Rodzaj elementu bez klasy; człon po myślniku to nazwa stacji (tu: stacja spoza modelu).
    expect(dane?.label).toMatch(/^Transformator - /);
    expect(dane?.label).not.toContain('Transformator SN/nN');
    // Kod stacji z relacji elementu wewnętrznego (`st-1/…` → stacja rysunku `st-1`).
    expect(dane?.stationCode).toBe('S01');
  });

  it('widok stacji bez rekordu ENM → etykieta stacji z rysunku, bez nazwy transformatora', () => {
    const snapshot = makeCalculationReadySnapshot();
    const dane = buildDaneStacji(snapshot, rysunekStacjiBezRekordu(snapshot), null, 'st-1');
    expect(dane?.label).toBe('Stacja S01');
    expect(dane?.stationCode).toBe('S01');
  });

  it('transformator bez relacji ze stacją rysunku → brak kodu stacji (nie kod pierwszej stacji)', () => {
    const snapshot = modelZTransformatorem('TR-7 Kowalskiego');
    const dane = buildDaneElementuStacji(snapshot, rysunekStacjiBezRekordu(snapshot), null, 'transformer', 'tr-1');
    expect(dane?.label).toBe('TR-7 Kowalskiego');
    expect(dane?.stationCode).toBeNull();
  });
});

describe('etykieta rodzaju wspólna dla transformatorów SN/nN i WN/SN — bez klasy napięciowej', () => {
  it('symbol transformer2W (legenda arkusza, także TR WN/SN GPZ) nie zakłada klasy SN/nN', () => {
    expect(SYMBOL_DEFS.transformer2W.labelPl).toBe('Transformator dwuuzwojeniowy');
    expect(SYMBOL_DEFS.transformer2W.labelPl).not.toMatch(/SN|nN|WN/);
  });
});
