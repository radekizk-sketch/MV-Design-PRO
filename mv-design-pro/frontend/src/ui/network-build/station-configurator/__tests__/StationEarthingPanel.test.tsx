/**
 * Karta „Uziemienie" konfiguratora stacji (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
 *
 * Panel tylko POKAZUJE fakty sieci SN wyliczone w backendzie (`/_uziemienie-sn`) i niczego
 * nie liczy. Iloczyn cech: stan odczytu {brak kontekstu, ładowanie, błąd, gotowe} × sekcje
 * {brak sieci SN z przyczyną, dwie sekcje o różnych wariantach} × wielkości {liczba, brak}
 * × AWSC {obecny — doziemienie w obu stanach, brak} × tryb doziemienia {rezystor, kompensowany} × gałęzie bez B0 {są, brak} × odmowy/ostrzeżenia
 * × kompletność {PELNY, NIEPELNY} × akcja „Dodaj zespół" {podana, brak}. Klik akcji —
 * natywny (`userEvent`), bo martwy klik byłby niewidoczny przy zdarzeniu syntetycznym.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { tekstZrodlowy } from '../../../../test/tekstZWzorami';
import type { DoziemienieSieci } from '../../../results-inspector/types';
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

/** Doziemienie sieci w kształcie `WynikDoziemienia.to_dict` (solver `doziemienie_sn`). */
function doziemienie(over: Partial<DoziemienieSieci>): DoziemienieSieci {
  return {
    tryb: 'rezystor',
    tryb_pl: 'punkt neutralny uziemiony przez rezystor',
    charakter: 'rezystancyjno_pojemnosciowy',
    charakter_pl: 'prąd rezystancyjno-pojemnościowy',
    prad_a: 202.43,
    i_c_a: 31.25,
    i_l_a: null,
    i_w_a: 200.0,
    rozstrojenie: null,
    u_f_v: 8660.254,
    u0_v: 8660.254,
    u_faza_b_v: 15000,
    u_faza_c_v: 15000,
    wspolczynnik_k: 1.732051,
    z_f_ohm: null,
    wzor_latex: 'I_F = \\sqrt{I_R^2 + I_C^2}',
    podstawa_pl: 'Sieć uziemiona przez rezystor (ENEA Zeszyt 1 §16, Z.14/Z.15).',
    zastrzezenia_pl: [],
    brak_pl: null,
    podwojne_doziemienie_pl: null,
    slad: [],
    ...over,
  };
}

const KOMPENSOWANE: Partial<DoziemienieSieci> = {
  tryb: 'kompensowany',
  tryb_pl: 'punkt neutralny kompensowany (dławik gaszący)',
  charakter: 'resztkowy',
  charakter_pl: 'prąd resztkowy sieci skompensowanej',
  i_c_a: 96.04,
  i_l_a: 92.08,
  rozstrojenie: 0.0412,
  podstawa_pl: 'IEC 60909-0:2016 rozdz. 1 — zakres normy nie obejmuje doziemień w sieciach skompensowanych.',
  zastrzezenia_pl: ['Straty czynne dławika nie są opisane w modelu.'],
  podwojne_doziemienie_pl: 'Podwójne zwarcie doziemne opisuje IEC 60909-3.',
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
  dane_przyjete_pojemnosci: [],
  prad_dlawikow_a: null,
  rozstrojenie: null,
  tryb_doziemienia: 'rezystor',
  doziemienie: doziemienie({}),
  ma_awsc: false,
  doziemienie_awsc_zalaczony: null,
  ostrzezenia: [],
  odmowy: [],
  kompletnosc: 'PELNY',
  opis_pl: 'Sieć SN uziemiona przez rezystor (układ Z.15).',
};

const SEKCJA_DLAWIK_AWSC: UziemienieSekcjiSn = {
  szyny: ['szyna-s2', 'szyna-s3'],
  napiecie_kv: 15,
  wariant: 'dlawik_awsc',
  // Z.13: dławik z AWSC w obu stanach automatyki to sieć skompensowana — wariant bez zmiany.
  wariant_awsc_zalaczony: 'dlawik_awsc',
  typ_punktu_neutralnego: 'petersen_coil',
  punkty: [],
  b0_s: 0.004,
  galezie_bez_b0: [],
  prad_pojemnosciowy_a: 96.04,
  // B′0 kabli z wartości roboczej (kabel SN: B′0 = B′1) — dana przyjęta ESTIMATED.
  dane_przyjete_pojemnosci: [
    {
      nazwa_pl: 'B′0 wartość robocza (Kabel 1, Kabel 2)',
      wartosc: { wartosc: 0.000088, jednostka: 'S/km' },
      powod_pl: 'Kabel SN o polu promieniowym: B′0 = B′1. Zmień wartość: B′0 w parametrach odcinka.',
      jakosc: 'ESTIMATED',
    },
  ],
  prad_dlawikow_a: 100,
  rozstrojenie: 0.0412,
  tryb_doziemienia: 'kompensowany',
  doziemienie: doziemienie({ ...KOMPENSOWANE, prad_a: 4.12, i_w_a: 1.2 }),
  ma_awsc: true,
  doziemienie_awsc_zalaczony: doziemienie({ ...KOMPENSOWANE, prad_a: 30.2, i_w_a: 30.0 }),
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
    expect(within(dlawik).getByTestId('station-earthing-awsc').textContent).toContain(
      'sieć pozostaje skompensowana',
    );
    // Doziemienie wg sposobu pracy punktu neutralnego — z solvera, w obu stanach AWSC.
    const spoczynek = within(dlawik).getByTestId('station-earthing-doziemienie-spoczynek');
    expect(spoczynek.textContent).toContain('Doziemienie sieci: punkt neutralny kompensowany');
    expect(spoczynek.textContent).toContain('Prąd doziemienia (prąd resztkowy sieci skompensowanej): 4.1 A');
    // Symbole wielkości renderuje KaTeX — treść źródłowa (`tekstZrodlowy`) niesie zapis `$…$`.
    const spoczynekZrodlo = tekstZrodlowy(spoczynek);
    expect(spoczynekZrodlo).toContain('Prąd indukcyjny $I_L$: 92.1 A');
    expect(spoczynekZrodlo).toContain('Składowa czynna $I_w$: 1.2 A');
    expect(spoczynekZrodlo).toContain('Napięcie składowej zerowej $U_0$: 8660 V');
    expect(spoczynekZrodlo).toContain('Współczynnik zwarcia doziemnego $k$: 1.732');
    const zalaczony = within(dlawik).getByTestId('station-earthing-doziemienie-zalaczony');
    expect(zalaczony.textContent).toContain('Doziemienie sieci po załączeniu AWSC');
    expect(tekstZrodlowy(zalaczony)).toContain('Składowa czynna $I_w$: 30.0 A');
    // Rezystor: prąd rezystancyjno-pojemnościowy, bez I_L i bez drugiego stanu automatyki.
    const rez = within(rezystor).getByTestId('station-earthing-doziemienie-spoczynek');
    expect(rez.textContent).toContain('Prąd doziemienia (prąd rezystancyjno-pojemnościowy): 202.4 A');
    expect(tekstZrodlowy(rez)).not.toContain('Prąd indukcyjny $I_L$');
    expect(tekstZrodlowy(rez)).toContain('Prąd pojemnościowy $I_C$');
    expect(within(rezystor).queryByTestId('station-earthing-doziemienie-zalaczony')).toBeNull();
    // Etykiety: suma NASTAW dławików (nie prąd I_L przy doziemieniu) i znak rozstrojenia.
    expect(dlawik.textContent).toContain('Suma nastaw dławików w ruchu');
    expect(dlawik.textContent).toContain('(dodatnie — niedokompensowanie)');
    // Wartość robocza B′0 pokazana dyskretnie, z powodem w podpowiedzi (zasada nr 4).
    const robocze = within(dlawik).getByTestId('station-earthing-b0-robocze');
    // Zapis liczby po polsku (ten sam co karta werdyktu) — dawniej surowy zapis JS „0.000088".
    expect(robocze.textContent).toContain('B′0 wartość robocza (Kabel 1, Kabel 2): 0,000088 S/km');
    expect(robocze.textContent).not.toMatch(/\d\.\d/);
    expect(within(robocze).getByText(/B′0 wartość robocza/)).toHaveAttribute(
      'title',
      'Kabel SN o polu promieniowym: B′0 = B′1. Zmień wartość: B′0 w parametrach odcinka.',
    );
    expect(within(rezystor).queryByTestId('station-earthing-b0-robocze')).toBeNull();
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

  it('gałęzie bez B′0: prąd pojemnościowy NIEWYZNACZONY (częściowa suma nie jest wynikiem), liczba gałęzi nazwana', () => {
    // Kontrakt backendu: choć jedna gałąź sieci bez B′0 ⇒ prad_pojemnosciowy_a = null
    // (enm/uziemienie_sekcji.py::UziemienieSekcji.prad_pojemnosciowy_a).
    renderuj(
      gotowe({
        sekcje: [
          {
            ...SEKCJA_REZYSTOR,
            galezie_bez_b0: ['kabel-r1', 'kabel-r2'],
            prad_pojemnosciowy_a: null,
            kompletnosc: 'NIEPELNY',
          },
        ],
      }),
    );
    const sekcja = screen.getByTestId('station-earthing-sekcja');
    expect(sekcja.textContent).toContain('brak danych susceptancji zerowej gałęzi');
    expect(sekcja.textContent).not.toContain('zaniżony');
    expect(tekstZrodlowy(within(sekcja).getByTestId('station-earthing-bez-b0'))).toBe(
      "Gałęzie bez susceptancji zerowej $B'_{0}$ (prąd pojemnościowy niewyznaczony — uzupełnij $B'_{0}$ "
        + 'albo typ katalogowy odcinka): 2.',
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
