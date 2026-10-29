/**
 * Karta „Uziemienie" konfiguratora stacji (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
 *
 * Panel tylko POKAZUJE fakty sieci SN wyliczone w backendzie (`/_uziemienie-sn`) i niczego
 * nie liczy. Iloczyn cech: stan odczytu {brak kontekstu, ładowanie, błąd, gotowe} × sekcje
 * {brak sieci SN z przyczyną, dwie sekcje o różnych wariantach} × wielkości {liczba, brak}
 * × AWSC {zmienia wariant, nie zmienia} × gałęzie bez B0 {są, brak} × odmowy/ostrzeżenia
 * × kompletność {PELNY, NIEPELNY} × akcja „Dodaj zespół" {podana, brak}. Klik akcji —
 * natywny (`userEvent`), bo martwy klik byłby niewidoczny przy zdarzeniu syntetycznym.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UziemienieSekcjiSn } from '../../station-der/audit2-api';
import { StationConfigurator, type StationEarthingProps } from '../StationConfigurator';

const minimalProps = {
  basic: {
    stationName: 'ST-01',
    topologicalType: 'końcowa' as const,
    constructionType: 'kontenerowa' as const,
    snVoltageKv: 15,
    nnVoltageLevels: [0.4],
    completeness: 'complete' as const,
  },
  topology: {
    externalPorts: [],
    errors: [],
    endToEndConnectionsCount: 0,
    missingEndpointsCount: 0,
  },
  snSwitchgear: {
    layout: 'sectioned_busbar' as const,
    nominalVoltageKv: 15,
    nominalCurrentA: 630,
    nominalShortCircuitKa: 16,
    sectionsCount: 2,
    hasCoupler: true,
    baysCount: 6,
    reservesCount: 1,
    readinessLabelPl: 'gotowe',
  },
  bays: { bays: [], hvFuses: [] },
  transformer: { transformers: [], availableLvVoltages: [0.4], tapChangers: [] },
  nnSwitchgear: { switchgears: [], loads: [], stanDanych: { stan: 'gotowe' as const } },
  derSources: { stationId: 'station_test', ders: [] },
  protection: {
    relays: [],
  },
  measurements: { cts: [], vts: [], polaPomiarowe: [] },
  readiness: { items: [] },
};

const SEKCJA_REZYSTOR: UziemienieSekcjiSn = {
  szyny: ['szyna-s1'],
  napiecie_kv: 15,
  wariant: 'rezystor',
  wariant_awsc_zalaczony: 'rezystor',
  typ_punktu_neutralnego: 'resistor_grounded',
  punkty: [],
  b0_s: 0.0012,
  galezie_bez_b0: [],
  prad_pojemnosciowy_a: 31.25,
  prad_dlawikow_a: null,
  rozstrojenie: null,
  ostrzezenia: [],
  odmowy: [],
  kompletnosc: 'PELNY',
  opis_pl: 'Sieć SN uziemiona przez rezystor (układ Z.15).',
};

const SEKCJA_DLAWIK_AWSC: UziemienieSekcjiSn = {
  szyny: ['szyna-s2', 'szyna-s3'],
  napiecie_kv: 15,
  wariant: 'dlawik_awsc',
  wariant_awsc_zalaczony: 'dlawik_rezystor',
  typ_punktu_neutralnego: 'petersen_coil',
  punkty: [],
  b0_s: 0.004,
  galezie_bez_b0: ['kabel-1', 'kabel-2'],
  prad_pojemnosciowy_a: 96.04,
  prad_dlawikow_a: 100,
  rozstrojenie: 0.0412,
  ostrzezenia: ['Rozstrojenie kompensacji powyżej zalecanego zakresu.'],
  odmowy: ['Dławik pracuje bez odłącznika w torze punktu neutralnego.'],
  kompletnosc: 'NIEPELNY',
  opis_pl: 'Sieć SN kompensowana dławikiem z automatyką AWSC (układ Z.13).',
};

function gotowe(over: Partial<StationEarthingProps> = {}): StationEarthingProps {
  return { stan: 'gotowe', sekcje: [], przyczynaBraku: null, bladPl: null, ...over };
}

function renderuj(earthing: StationEarthingProps | undefined) {
  return render(<StationConfigurator {...minimalProps} defaultCard="earthing" earthing={earthing} />);
}

describe('StationConfigurator — karta uziemienia z modelu', () => {
  it.each([
    ['brak propsa', undefined, 'czytany jest z modelu projektu'],
    ['brak kontekstu', gotowe({ stan: 'brak_kontekstu' }), 'czytany jest z modelu projektu'],
    ['ładowanie', gotowe({ stan: 'ladowanie' }), 'Odczyt uziemienia sieci SN z modelu'],
  ] as const)('%s: nazwany stan zerowy, bez faktów sekcji', (_n, earthing, tekst) => {
    renderuj(earthing);
    expect(screen.getByText(new RegExp(tekst))).toBeInTheDocument();
    expect(screen.queryByTestId('station-earthing')).toBeNull();
    expect(screen.queryByTestId('station-earthing-sekcja')).toBeNull();
  });

  it.each([
    ['komunikat backendu', 'Model nie istnieje.', 'Model nie istnieje.'],
    ['bez komunikatu', null, 'Nie udało się odczytać uziemienia sieci SN z modelu.'],
  ] as const)('błąd odczytu (%s) jest POKAZANY, nie zamieniony w pustą stację', (_n, blad, tekst) => {
    renderuj(gotowe({ stan: 'blad', bladPl: blad }));
    expect(screen.getByTestId('station-earthing-blad').textContent).toBe(tekst);
    expect(screen.queryByTestId('station-earthing-sekcja')).toBeNull();
  });

  it.each([
    ['przyczyna backendu', 'Stacja nie ma szyn SN w modelu.', 'Stacja nie ma szyn SN w modelu.'],
    ['bez przyczyny', null, 'Stacja nie ma sieci SN w modelu.'],
  ] as const)('stacja bez sieci SN (%s): przyczyna zamiast sekcji', (_n, przyczyna, tekst) => {
    renderuj(gotowe({ przyczynaBraku: przyczyna, onDodajZespol: vi.fn() }));
    expect(within(screen.getByTestId('station-earthing')).getByText(tekst)).toBeInTheDocument();
    expect(screen.queryByTestId('station-earthing-sekcja')).toBeNull();
    expect(screen.queryByTestId('station-earthing-dodaj-zespol')).toBeNull();
  });

  it('dwie sekcje: fakty każdej z backendu (liczby i braki nazwane), bez własnych obliczeń', () => {
    renderuj(gotowe({ sekcje: [SEKCJA_REZYSTOR, SEKCJA_DLAWIK_AWSC] }));
    const sekcje = screen.getAllByTestId('station-earthing-sekcja');
    expect(sekcje.map((s) => s.getAttribute('data-wariant'))).toEqual(['rezystor', 'dlawik_awsc']);

    const [rezystor, dlawik] = sekcje as [HTMLElement, HTMLElement];
    expect(rezystor.textContent).toContain('układ Z.15');
    expect(rezystor.textContent).toContain('31.3 A');
    expect(rezystor.textContent).toContain('brak dławika w ruchu');
    expect(rezystor.textContent).toContain('nie dotyczy');
    expect(rezystor.textContent).toContain('dane potwierdzone');
    expect(within(rezystor).queryByTestId('station-earthing-awsc')).toBeNull();
    expect(rezystor.textContent).not.toContain('Gałęzie bez susceptancji zerowej');

    expect(dlawik.textContent).toContain('96.0 A');
    expect(dlawik.textContent).toContain('100.0 A');
    expect(dlawik.textContent).toContain('4.1 %');
    expect(dlawik.textContent).toContain('wartości robocze');
    expect(within(dlawik).getByTestId('station-earthing-awsc').textContent).toContain(
      'w obu stanach automatyki',
    );
    expect(dlawik.textContent).toContain('Gałęzie bez susceptancji zerowej (prąd pojemnościowy zaniżony): 2.');
    expect(dlawik.textContent).toContain('bez odłącznika w torze punktu neutralnego');
    expect(dlawik.textContent).toContain('powyżej zalecanego zakresu');
    // Bez akcji konfiguratora (poza projektem) przycisk nie powstaje — nie ma martwego klika.
    expect(screen.queryByTestId('station-earthing-dodaj-zespol')).toBeNull();
  });

  it('brak susceptancji zerowej: prąd pojemnościowy nazwany brakiem, nie zerem', () => {
    renderuj(gotowe({ sekcje: [{ ...SEKCJA_REZYSTOR, prad_pojemnosciowy_a: null }] }));
    expect(screen.getByTestId('station-earthing-sekcja').textContent).toContain(
      'brak danych susceptancji zerowej gałęzi',
    );
  });

  it('„Dodaj zespół uziemiający" otwiera kreator dla szyn WŁAŚCIWEJ sekcji (natywny klik)', async () => {
    const onDodajZespol = vi.fn();
    const user = userEvent.setup();
    renderuj(gotowe({ sekcje: [SEKCJA_REZYSTOR, SEKCJA_DLAWIK_AWSC], onDodajZespol }));
    const przyciski = screen.getAllByTestId('station-earthing-dodaj-zespol');
    expect(przyciski).toHaveLength(2);
    await user.click(przyciski[1] as HTMLElement);
    expect(onDodajZespol).toHaveBeenCalledTimes(1);
    expect(onDodajZespol).toHaveBeenLastCalledWith(['szyna-s2', 'szyna-s3']);
    await user.click(przyciski[0] as HTMLElement);
    expect(onDodajZespol).toHaveBeenLastCalledWith(['szyna-s1']);
  });
});
