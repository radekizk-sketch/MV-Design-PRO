/*
 * Panel „Wynik inżynierski" okna „Analizy specjalistyczne" (karta AB-1a D7).
 *
 * Werdykt-literał wyniku FROZEN V12.6 (NER: `thermal_check.status`, walidacja
 * porównawcza: `status` PASS/FAIL) przychodzi z backendu opakowany w pozycję wyniku
 * wyjaśnialnego (`wynik_inzynierski_v126.py`). Dane = wynik ADAPTERA na zapisanych
 * ładunkach solvera (`wynikiInzynierskieV126.json`, generator
 * `backend/tests/ci/generuj_odpowiedzi_v126.py`, parytet wartości:
 * `test_fixtura_wynikow_inzynierskich_zgodna_z_adapterem`). API mockowane NA GRANICY
 * `fetch` (`atrapyV126.ts`); interakcje natywną ścieżką (`userEvent`).
 *
 * ILOCZYN CECH: {pozycja z elementem (walidacja porównawcza: wartość, wymaganie,
 * zapas) | pozycja bez elementów (NER bez danych: nazwany powód)} × {podstawa z
 * odznaką „źródło niezweryfikowane"} × {rodzaj bez werdyktu: panel nieobecny}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import wynikiInzynierskie from './wynikiInzynierskieV126.json';
import { CASE_ID, migawkaSieciZlotej, ustawFetchV126 } from './atrapyV126';

const WYNIKI = wynikiInzynierskie as Record<string, unknown>;

async function uruchomAnalize(kod: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId(`mvd-akad-karta-otworz-${kod}`));
  await screen.findByTestId('mvd-akad-uruchomienie');
  await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
  await user.click(screen.getByTestId('mvd-akad-uruchom'));
  await screen.findByTestId('mvd-akad-wyniki');
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

describe('EkranAnalizAkademickich — wynik inżynierski werdyktu analizy', () => {
  it('pozycja z elementem: werdykt z wartością, wymaganiem i zapasem zamiast gołego PASS', async () => {
    // Panel jest GENERYCZNY (renderuje pozycję, nie rodzaj). Jedyną pozycją z elementem,
    // którą adapter wydaje na zapisanych ładunkach, jest walidacja porównawcza — rodzaj
    // wycofany z toru projektanta (`nieprezentowane.ts`, decyzja właściciela 2026-08-07),
    // więc nie ma własnej karty. Renderer elementu sprawdzamy na TEJ pozycji podanej w
    // odpowiedzi wyniku prezentowanego rodzaju (NER) — dane liczbowe dalej z adaptera.
    ustawFetchV126({
      potwierdzone: ['neutral_earthing_design'],
      wynikZFixtury: true,
      wynikInzynierski: WYNIKI.benchmark_validation,
    });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await uruchomAnalize('neutral_earthing_design');
    const panel = await screen.findByTestId('mvd-akad-wynik-inzynierski');
    const element = within(panel).getByTestId('mvd-akad-wi-element-0');
    expect(element).toHaveTextContent('IEEE 14-bus');
    expect(element).toHaveTextContent('SPEŁNIA');
    // Liczby z adaptera (odchyłka 0,01963 % wobec tolerancji 0,5 %, zapas 0,48037 pkt
    // proc.) w formacie prezentacji ekranu oceny — UI nic nie liczy.
    expect(element).toHaveTextContent('Wartość obliczona: 0,02 %');
    expect(element).toHaveTextContent('≤ 0,5 %');
    expect(element).toHaveTextContent('Margines: +0,48 pkt proc.');
    expect(element).not.toHaveTextContent('PASS');
    const odznaka = within(panel).getByTestId('mvd-akad-wi-podstawa-zrodlo');
    expect(odznaka).toBeVisible();
    expect(odznaka).toHaveTextContent('źródło niezweryfikowane');
  });

  it('dobór rezystora NER bez danych cieplnych: brak elementu, NAZWANY powód, podstawa widoczna', async () => {
    ustawFetchV126({
      potwierdzone: ['neutral_earthing_design'],
      wynikZFixtury: true,
      wynikInzynierski: WYNIKI.neutral_earthing_design,
    });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await uruchomAnalize('neutral_earthing_design');
    const panel = await screen.findByTestId('mvd-akad-wynik-inzynierski');
    expect(within(panel).getByTestId('mvd-akad-wi-bez-elementow')).toHaveTextContent(
      'Brak jawnej pojemności doziemnej',
    );
    expect(within(panel).queryByTestId('mvd-akad-wi-element-0')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('mvd-akad-wi-podstawa-zrodlo')).toHaveTextContent(
      'źródło niezweryfikowane',
    );
  });

  it('rodzaj bez werdyktu (brak pola w odpowiedzi) → panel nieobecny', async () => {
    ustawFetchV126({ potwierdzone: ['insulation_coordination'], wynikZFixtury: true });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await uruchomAnalize('insulation_coordination');
    expect(screen.queryByTestId('mvd-akad-wynik-inzynierski')).not.toBeInTheDocument();
  });
});
