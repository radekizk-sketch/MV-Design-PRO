/*
 * Uczciwość natychmiastowa (2026-09-23) — okno „Analizy specjalistyczne" dla jakości
 * energii (E-40) i SSCI nie wystawia werdyktu. Solver harmoniczny jest niezwalidowany
 * (bez przekładni transformatora, sieć nadrzędna jako admitancja 1e6 S, 18 zaszytych
 * rzędów, brak wyroczni): „zgodny" dostawała nawet szyna bez danych, a THD_U 3049 % było
 * przypięte jako złote. Backend niesie teraz rekord `ocena` (NIE_OCENIONO) i przenosi
 * WSZYSTKIE liczby solvera do `wynik_audytowy` z nagłówkiem o niezwalidowaniu.
 *
 * ILOCZYN CECH: rodzaj (jakość energii / SSCI / rodzaj z pasmem wiarygodności) ×
 * miejsce (panel oceny / tabele pierwszego planu / sekcja audytowa / panel
 * wiarygodności / ślad, dowód, raport, zapis techniczny) × treść (rekord oceny / liczby
 * THD / etykieta pasma). Liczby E-40 nie mogą się pojawić poza sekcją audytową.
 * Ścieżka natywna (klik w kartę → uruchom), `fetch` mockowany na granicy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { SCREEN_MATRIX } from '../../../../ui/workspace/types';
import { formatPropertyGridElementTypeLabel } from '../../../../ui/property-grid/element-type-labels';
import { decodeSelectionFromParams } from '../../../../ui/navigation/urlState';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import { MAPA_WIARYGODNOSCI } from '../prezentacja';
import type { RekordOcenyNiewykonanej } from '../../wzorzec/OcenaNiewykonana';
import { CASE_ID, migawkaSieciZlotej, ustawFetchV126 } from './atrapyV126';
import rekordyOceny from './rekordyOceny.json';

/** Rekordy oceny wygenerowane przez backend (`generuj_fixtury_ocen_fe.py`). */
const REKORDY = rekordyOceny as unknown as {
  readonly jakosc_energii: RekordOcenyNiewykonanej;
  readonly ssci_impedance: RekordOcenyNiewykonanej;
};
const OCENA_E40 = REKORDY.jakosc_energii;
const OCENA_SSCI = REKORDY.ssci_impedance;

const NAGLOWEK_AUDYTU =
  'Wynik solvera niezwalidowanego — nie jest wynikiem inżynierskim (sondy audytu '
  + 'harmonicznych z 2026-09-23)';

/** Ładunek E-40 po granicy `wynik_v126_dla_powierzchni` — liczby wyłącznie w audycie. */
const WYNIK_E40 = {
  ocena: OCENA_E40,
  wynik_audytowy: {
    naglowek_pl: NAGLOWEK_AUDYTU,
    powody_pl: [
      'Brak przekładni transformatora: szyny różnych poziomów napięcia liczone są w omach '
      + 'bez sprowadzenia do wspólnej bazy.',
      'Żadna wielkość nie ma niezależnej wyroczni (obliczenia ręcznego ani programu zewnętrznego).',
    ],
    nodes: [
      {
        bus_ref: 'bus-sn-1',
        u_h: [{ h: 5, magnitude_kv: 0.42, phase_deg: 0.0 }],
        i_h: [],
        thd_u_percent: 3049.1234,
        tdd_percent: 12.5,
        k_factor: 7.75,
        z_scan: [],
        resonance_peaks: [{ f_hz: 650, z_peak_ohm: 12.3, severity: 'ALERT' }],
        flicker_pst: null,
        flicker_plt: null,
        voltage_unbalance_u2_u1: 0.0,
        compatibility_status: 'NIE_OCENIONO',
      },
    ],
    sanity: { status: 'w paśmie wiarygodności', checks_total: 3, checks_passed: 3, violations: [] },
  },
};


async function otworzIUruchom(kod: string): Promise<void> {
  fireEvent.click(await screen.findByTestId(`mvd-akad-karta-otworz-${kod}`));
  await screen.findByTestId('mvd-akad-uruchomienie');
  await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
  fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
  await screen.findByTestId('mvd-akad-wyniki');
}

/** Tekst pierwszego planu = wyniki MINUS sekcja audytowa (jej treść nie jest pierwszym planem). */
function tekstPozaAudytem(): string {
  const wyniki = screen.getByTestId('mvd-akad-wyniki').cloneNode(true) as HTMLElement;
  wyniki.querySelector('[data-testid="mvd-akad-audyt"]')?.remove();
  return wyniki.textContent ?? '';
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID, activeCaseResultStatus: 'NONE' });
  useShellStore.setState({ wynikiTab: null });
  useSnapshotStore.setState({ snapshot: migawkaSieciZlotej() as never });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useSnapshotStore.getState().reset();
});

describe('Jakość energii (E-40) — ocena niewykonana, liczby wyłącznie w audycie', () => {
  it('panel oceny: rekord z backendu, bez chipu „kryterium spełnione dla N z M węzłów"', async () => {
    ustawFetchV126({ potwierdzone: ['power_quality_harmonics'], wynik: WYNIK_E40 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzIUruchom('power_quality_harmonics');
    const ocena = screen.getByTestId('mvd-akad-ocena');
    expect(ocena).toHaveAttribute('data-status', 'NIE_OCENIONO');
    const karta = `mvd-werdykt-${OCENA_E40.kryterium_id}`;
    expect(screen.getByTestId(`${karta}-etykieta`)).toHaveTextContent('Ocena niewykonana');
    expect(screen.getByTestId(`${karta}-zdanie`)).toHaveTextContent(
      OCENA_E40.wyjasnienie.zdanie_pl,
    );
    expect(screen.getByTestId(`${karta}-czego-brakuje`)).toHaveTextContent('1e6 S');
    expect(screen.queryByTestId('mvd-akad-werdykt-chip')).not.toBeInTheDocument();
    const pierwszyPlan = tekstPozaAudytem();
    expect(pierwszyPlan).not.toMatch(/spełnione|niespełnione|zgodny/);
  });

  it('ŻADNA liczba E-40 (THD, TDD, K, U_h, „rezonanse") poza sekcją audytową', async () => {
    ustawFetchV126({ potwierdzone: ['power_quality_harmonics'], wynik: WYNIK_E40 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzIUruchom('power_quality_harmonics');
    expect(screen.queryByTestId('mvd-akad-obiekty-nodes')).not.toBeInTheDocument();
    const pierwszyPlan = tekstPozaAudytem();
    for (const liczba of ['3049', '3 049', '12,5', '7,75', '0,42', '650']) {
      expect(pierwszyPlan).not.toContain(liczba);
    }
    // Nazwy wielkości mogą paść w opisie kryterium rekordu; tabela wartości — nie.
    expect(pierwszyPlan).not.toContain('Odkształcenie w węzłach sieci');
  });

  it('sekcja audytowa: nagłówek z backendu, zwinięta; po rozwinięciu tabela węzłów i powody', async () => {
    ustawFetchV126({ potwierdzone: ['power_quality_harmonics'], wynik: WYNIK_E40 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzIUruchom('power_quality_harmonics');
    const audyt = screen.getByTestId('mvd-akad-audyt');
    expect(audyt).toHaveTextContent(NAGLOWEK_AUDYTU);
    expect(within(audyt).queryByTestId('mvd-akad-obiekty-wynik_audytowy.nodes')).toBeNull();
    fireEvent.click(within(audyt).getByTestId('mvd-akad-audyt-przelacz'));
    const tabela = within(audyt).getByTestId('mvd-akad-obiekty-wynik_audytowy.nodes');
    expect(tabela).toHaveTextContent('3049,1234');
    expect(within(audyt).getByTestId('mvd-akad-audyt-powody')).toHaveTextContent('Brak przekładni');
    // Status węzła w audycie to etykieta oceny, nie „spełnione".
    expect(tabela).toHaveTextContent('Ocena niewykonana');
    expect(tabela).not.toHaveTextContent('spełnione');
  });
});

describe('SSCI na oknie analiz specjalistycznych — ocena niewykonana', () => {
  it('panel oceny z rekordu backendu zamiast chipu wiarygodności podanego jako werdykt', async () => {
    ustawFetchV126({
      potwierdzone: ['ssci_impedance'],
      wynik: {
        converter_ref: 'INV1',
        sanity: { status: 'w paśmie wiarygodności', checks_total: 2, checks_passed: 2, violations: [] },
        ocena: OCENA_SSCI,
      },
    });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzIUruchom('ssci_impedance');
    expect(
      screen.getByTestId(`mvd-werdykt-${OCENA_SSCI.kryterium_id}-zdanie`),
    ).toHaveTextContent(OCENA_SSCI.wyjasnienie.zdanie_pl);
    expect(screen.queryByTestId('mvd-akad-werdykt-chip')).not.toBeInTheDocument();
    expect(tekstPozaAudytem()).not.toContain('wyniki wiarygodne');
  });
});

describe('Etykieta kontroli pasma — „w paśmie wiarygodności", nie „zweryfikowany"', () => {
  it('mapa wiarygodności zna etykietę pasma i nie zna słowa „zweryfikowany"', () => {
    expect(MAPA_WIARYGODNOSCI['w paśmie wiarygodności']?.tekst).toBe('wynik w paśmie wiarygodności');
    expect('zweryfikowany' in MAPA_WIARYGODNOSCI).toBe(false);
  });
});

describe('Powierzchnie E-40 bez pokrycia w solverze — skasowane', () => {
  it('ekran E-40 nie deklaruje zakładek widma, skanu Z(f) ani migotania', () => {
    const e40 = SCREEN_MATRIX['E-40'];
    for (const zakladka of ['widmo', 'z-f', 'flicker']) {
      expect(e40.allowedTabIds).not.toContain(zakladka);
    }
  });

  it('typ elementu „Pomiar jakości energii" (tylko interfejs, bez modelu i solvera) skasowany', () => {
    expect(formatPropertyGridElementTypeLabel('PowerQualityMeter')).toBe('PowerQualityMeter');
    const parametry = new URLSearchParams({ sel: 'pqm-1', type: 'PowerQualityMeter', name: 'Analizator' });
    expect(decodeSelectionFromParams(parametry)).toBeNull();
  });
});
