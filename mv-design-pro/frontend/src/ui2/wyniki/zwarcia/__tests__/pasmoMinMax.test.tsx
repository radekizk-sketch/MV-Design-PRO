/*
 * Sekcja „Pasmo MIN/MAX" (karta W3-G3, aneks D7) — testy jako ILOCZYN CECH:
 * {brak runId / wczytywanie / błąd pobrania / gotowe} × {obie strony obecne /
 * strona brakująca (MAX albo MIN)} × {ta sama rewizja / różne rewizje}.
 * Klik akcji „Uruchom bieg {MAX|MIN}" NIE jest tu klikany (uruchamia PRAWDZIWY
 * łańcuch tworzenia biegu — `ui2/spaces/obliczenia/uruchomObliczenie` — jak w
 * całej reszcie aplikacji nietestowany na poziomie jednostkowym); przejście
 * klik → nowy bieg → pasmo się domyka jest przedmiotem e2e (realny backend).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';

import type { PasmoZwarciaOdpowiedz, StronaPasmaOdpowiedz } from '../api';
import { PasmoMinMax } from '../PasmoMinMax';
import { ZWARCIA_STRINGS } from '../strings';
import { shortCircuitResultsFixture, shortCircuitRowFixture } from './fixtures';

function stronaFixture(over: Partial<StronaPasmaOdpowiedz> = {}): StronaPasmaOdpowiedz {
  return {
    zrodlo: 'biegu_zapisanego',
    run_id: 'run-max-1',
    bieg_bazowy_id: 'run-max-1',
    wynik: shortCircuitResultsFixture({
      rows: [shortCircuitRowFixture({ target_id: 'BUS-A', target_name: 'Szyna A', ikss_ka: 12.345 })],
    }),
    analysis_case_context: { rewizja_modelu: 5 },
    ...over,
  };
}

function pasmoFixture(over: Partial<PasmoZwarciaOdpowiedz> = {}): PasmoZwarciaOdpowiedz {
  return {
    run_id_kotwicy: 'run-max-1',
    scenariusz_kotwicy: 'MAX',
    typ_zwarcia_kotwicy: '3F',
    brakujacy_scenariusz: null,
    powod_niedostepnosci: null,
    powod_niedostepnosci_pl: null,
    max: stronaFixture(),
    min: stronaFixture({
      zrodlo: 'obliczony_na_zadanie',
      run_id: null,
      bieg_bazowy_id: 'run-max-1',
      wynik: shortCircuitResultsFixture({
        rows: [shortCircuitRowFixture({ target_id: 'BUS-A', target_name: 'Szyna A', ikss_ka: 6.111 })],
      }),
    }),
    ...over,
  };
}

function odpowiedzFetch(dane: PasmoZwarciaOdpowiedz | { blad: true }, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(dane), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PasmoMinMax — stany kontenera (runId / wczytywanie / błąd)', () => {
  it('runId = null: sekcja się NIE montuje (żaden fetch, żadna treść)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PasmoMinMax runId={null} trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(screen.queryByTestId('mvd-zwarcia-pasmo')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd pobrania (HTTP 500) → komunikat błędu, nie cisza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('awaria', { status: 500 })));
    render(<PasmoMinMax runId="run-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(await screen.findByTestId('mvd-zwarcia-pasmo-blad')).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.pasmoBladPobrania)).toBeInTheDocument();
  });

  it('poprawne wywołanie trafia w endpoint pasma DLA PODANEGO run_id', async () => {
    const fetchMock = vi.fn().mockReturnValue(odpowiedzFetch(pasmoFixture()));
    vi.stubGlobal('fetch', fetchMock);
    render(<PasmoMinMax runId="run-kotwica-9" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-pasmo-strony');
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-runs/run-kotwica-9/results/short-circuit/pasmo');
  });
});

describe('PasmoMinMax — obie strony dostępne', () => {
  it('tryb ekspercki: identyfikator biegu zapisanego i biegu kotwicy strony policzonej w „Informacjach audytowych"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(pasmoFixture())));
    render(<PasmoMinMax runId="run-max-1" trybZaawansowania="expert" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-pasmo-strony');
    // Strona zapisana — jej własny identyfikator biegu.
    fireEvent.click(screen.getByTestId('mvd-zwarcia-pasmo-max-informacje-audytowe-przelacz'));
    const audytMax = screen.getByTestId('mvd-zwarcia-pasmo-max-informacje-audytowe-lista');
    expect(audytMax).toHaveTextContent(ZWARCIA_STRINGS.pasmoIdentyfikatorBiegu);
    expect(audytMax).toHaveTextContent('run-max-1');
    // Strona policzona na żądanie NIE udaje własnego biegu — nazwany jest bieg kotwicy.
    fireEvent.click(screen.getByTestId('mvd-zwarcia-pasmo-min-informacje-audytowe-przelacz'));
    const audytMin = screen.getByTestId('mvd-zwarcia-pasmo-min-informacje-audytowe-lista');
    expect(audytMin).toHaveTextContent(ZWARCIA_STRINGS.pasmoIdentyfikatorKotwicy);
    expect(audytMin).toHaveTextContent('run-max-1');
  });

  it('tabela pokazuje wartości MAX i MIN obok siebie dla tego samego punktu, z proweniencją obu stron', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(pasmoFixture())));
    render(<PasmoMinMax runId="run-max-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-pasmo-strony');

    // Wartości MAX i MIN tego samego punktu jednocześnie w DOM (aneks D7: "obok siebie").
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('6,111')).toBeInTheDocument();

    // Proweniencja słowami (karta #145): identyfikator biegu NIE stoi na pierwszym
    // planie — trafia do „Informacji audytowych" trybu eksperckiego (test niżej).
    const blokMax = screen.getByTestId('mvd-zwarcia-pasmo-max');
    expect(within(blokMax).getByText(ZWARCIA_STRINGS.pasmoProwenencjaZapisany, { exact: false })).toBeInTheDocument();
    expect(blokMax).not.toHaveTextContent('run-max-1');
    const blokMin = screen.getByTestId('mvd-zwarcia-pasmo-min');
    expect(within(blokMin).getByText(ZWARCIA_STRINGS.pasmoProwenencjaObliczony, { exact: false })).toBeInTheDocument();
    expect(blokMin).not.toHaveTextContent('run-max-1');
    expect(screen.queryByTestId('mvd-zwarcia-pasmo-max-informacje-audytowe')).toBeNull();

    // Brak akcji "Uruchom" gdy obie strony są dostępne.
    expect(screen.queryByTestId('mvd-zwarcia-pasmo-max-akcja')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zwarcia-pasmo-min-akcja')).not.toBeInTheDocument();
  });

  it('źródła sieciowe (c, S″kQ) obu scenariuszy renderowane (proweniencja c/S″kQ — aneks D7)', async () => {
    const dane = pasmoFixture({
      max: stronaFixture({
        wynik: shortCircuitResultsFixture({
          zrodla_sieciowe: [
            {
              ref_id: 's1',
              tryb: 'MOC_ZWARCIOWA',
              scenariusz: 'MAX',
              u_nq_kv: 15.0,
              sk3_mva: 250.0,
              c: 1.1,
              pasmo_c: 'SN/WN',
              rx_ratio: 0.1,
              rx_ratio_zrodlo: 'MODEL',
              z_q_abs_ohm: 0.66,
              z_q_ohm: { re: 0.0657, im: 0.6568 },
              formula: 'Z_Q = c·U_nQ²/S″_kQ',
            },
          ],
        }),
      }),
      min: stronaFixture({
        zrodlo: 'obliczony_na_zadanie',
        run_id: null,
        wynik: shortCircuitResultsFixture({
          zrodla_sieciowe: [
            {
              ref_id: 's1',
              tryb: 'MOC_ZWARCIOWA_MIN',
              scenariusz: 'MIN',
              u_nq_kv: 15.0,
              sk3_mva: 150.0,
              c: 1.0,
              pasmo_c: 'SN/WN',
              rx_ratio: 0.2,
              rx_ratio_zrodlo: 'MODEL_MIN',
              z_q_abs_ohm: 1.0,
              z_q_ohm: { re: 0.196, im: 0.9806 },
              formula: 'Z_Q = c·U_nQ²/S″_kQ',
            },
          ],
        }),
      }),
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(dane)));
    render(<PasmoMinMax runId="run-max-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-pasmo-strony');
    const blokMax = screen.getByTestId('mvd-zwarcia-pasmo-max');
    const blokMin = screen.getByTestId('mvd-zwarcia-pasmo-min');
    expect(within(blokMax).getByTestId('mvd-zwarcia-zrodla')).toBeInTheDocument();
    expect(within(blokMax).getByText('250,0 MVA')).toBeInTheDocument(); // S''kQ max
    expect(within(blokMin).getByTestId('mvd-zwarcia-zrodla')).toBeInTheDocument();
    expect(within(blokMin).getByText('150,0 MVA')).toBeInTheDocument(); // S''kQ min
  });

  it('ta sama rewizja obu stron: BEZ ostrzeżenia świeżości', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(pasmoFixture())));
    render(<PasmoMinMax runId="run-max-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-pasmo-strony');
    expect(screen.queryByTestId('mvd-zwarcia-pasmo-swiezosc')).not.toBeInTheDocument();
  });

  it('różne rewizje obu stron: ostrzeżenie świeżości (mechanika ui2/freshness, nie ciche zestawienie)', async () => {
    const dane = pasmoFixture({
      max: stronaFixture({ analysis_case_context: { rewizja_modelu: 5 } }),
      min: stronaFixture({
        zrodlo: 'biegu_zapisanego',
        run_id: 'run-min-2',
        analysis_case_context: { rewizja_modelu: 7 },
      }),
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(dane)));
    render(<PasmoMinMax runId="run-max-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    const swiezosc = await screen.findByTestId('mvd-zwarcia-pasmo-swiezosc');
    expect(within(swiezosc).getByText(ZWARCIA_STRINGS.pasmoRozbieznoscRewizji)).toBeInTheDocument();
    expect(within(swiezosc).getByTestId('mvd-zwarcia-pasmo-swiezosc-znacznik')).toHaveAttribute(
      'data-mvd-fresh',
      'stale',
    );
  });
});

describe('PasmoMinMax — strona niedostępna (uczciwe stany, akcja „Uruchom")', () => {
  it('brak biegu MIN (c ręczne) → komunikat NAZWANY + akcja „Uruchom bieg MIN"; MAX pozostaje widoczny', async () => {
    const dane = pasmoFixture({
      brakujacy_scenariusz: 'MIN',
      powod_niedostepnosci: 'wspolczynnik_c_recznie_ustawiony',
      powod_niedostepnosci_pl:
        'Bieg kotwicy ma ręcznie ustawiony współczynnik c — jednoznaczny bieg przeciwnego scenariusza nie jest policzalny automatycznie.',
      min: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(dane)));
    render(<PasmoMinMax runId="run-max-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId('mvd-zwarcia-pasmo-brak-min')).toBeInTheDocument());

    const blokBrak = screen.getByTestId('mvd-zwarcia-pasmo-brak-min');
    expect(within(blokBrak).getByText(ZWARCIA_STRINGS.pasmoBrakScenariusz('MIN'))).toBeInTheDocument();
    expect(within(blokBrak).getByText(dane.powod_niedostepnosci_pl!)).toBeInTheDocument();
    const akcja = within(blokBrak).getByTestId('mvd-zwarcia-pasmo-min-akcja');
    expect(akcja).toBeInTheDocument();
    expect(akcja).toHaveTextContent(ZWARCIA_STRINGS.pasmoUruchomScenariusz('MIN'));
    expect(akcja).not.toBeDisabled();

    // Strona MAX (kotwica) zostaje dostępna mimo braku pary.
    expect(screen.getByTestId('mvd-zwarcia-pasmo-max')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
  });

  it('brak biegu MAX (symetria — kotwica bywa też MIN) → akcja „Uruchom bieg MAX"', async () => {
    const dane = pasmoFixture({
      scenariusz_kotwicy: 'MIN',
      run_id_kotwicy: 'run-min-1',
      brakujacy_scenariusz: 'MAX',
      powod_niedostepnosci: 'kotwica_jest_wariantem_scenariusza',
      powod_niedostepnosci_pl: 'Bieg kotwicy sam jest wariantem scenariusza roboczego.',
      max: null,
      min: stronaFixture({ run_id: 'run-min-1', bieg_bazowy_id: 'run-min-1' }),
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(odpowiedzFetch(dane)));
    render(<PasmoMinMax runId="run-min-1" trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId('mvd-zwarcia-pasmo-brak-max')).toBeInTheDocument());
    const akcja = within(screen.getByTestId('mvd-zwarcia-pasmo-brak-max')).getByTestId(
      'mvd-zwarcia-pasmo-max-akcja',
    );
    expect(akcja).toHaveTextContent(ZWARCIA_STRINGS.pasmoUruchomScenariusz('MAX'));
  });
});
