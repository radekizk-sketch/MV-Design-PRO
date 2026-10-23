/**
 * Karta PROG-ZERA-WKLADOW (wymaganie 4 właściciela): tabela rozpływu, ślad WHITE BOX
 * podziału prądu i zestawienie wkładów pominiętych pokazują TEN SAM zbiór gałęzi co
 * odpowiedź API — na odpowiedziach REALNEGO biegu backendu (fixtury generowane
 * `eksport_fixtur_harnessu.py`, ta sama funkcja co końcówka rozpływu), przez realną
 * ścieżkę ekranu: wynik w store → natywny klik wiersza punktu → hook dostawcy pobiera
 * rozpływ (`fetch` odpowiada fixturą) → sekcje rozpływu i śladu.
 *
 * Iloczyn cech: scena {sieć złota z deklaracją tolerancji nN, scena wartości roboczej} ×
 * punkt zwarcia (każdy wiersz wyniku) × tryb {podstawowy, ekspercki}. Na każdej
 * kombinacji:
 *  - wiersze tabeli rozpływu = `branch_contributions` (wkład pominięty nie jest wierszem),
 *  - kroki śladu = `branch_flow_trace`; kroki gałęziowe Thevenina = wpisy sieci zastępczej,
 *  - nota liczy DOKŁADNIE wpisy `wklady_pominiete`, a próg czyta z odpowiedzi — ten sam
 *    zapis co tytuł kroku śladu `wklady_pominiete` (frontend nie ma własnej stałej),
 *  - liczby kroku `wklady_pominiete` (per tor) sumują się do liczby wpisów zestawienia,
 *  - zestawienie (tryb ekspercki) nie pokazuje fałszywego zera „0,000",
 *  - kąt fazora każdego wpisu zestawienia to „nie określono" (karta KAT-WKLADU-POMINIETEGO:
 *    rdzeń podaje `null`, bo poniżej progu kąt jest resztą arytmetyki), nigdy liczba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { EkranZwarc } from '../EkranZwarc';
import { renderEkranZwarc } from './renderEkranZwarc';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import type {
  ShortCircuitResults,
  TraceStep,
  WkladPominietyRozplywu,
} from '../../../../ui/results-inspector/types';
import wynikiZlotej from '../../../../harness-fixtures/generated/zwarcia_wyniki_scena_zwarcia.json';
import rozplywZlotej from '../../../../harness-fixtures/generated/zwarcia_rozplyw_scena_zwarcia.json';
import wynikiRoboczej from '../../../../harness-fixtures/generated/zwarcia_wyniki_scena_tolerancja_robocza.json';
import rozplywRoboczej from '../../../../harness-fixtures/generated/zwarcia_rozplyw_scena_tolerancja_robocza.json';

interface OdpowiedzRozplywu {
  branch_contributions: { source_id: string }[] | null;
  branch_flow_trace: TraceStep[] | null;
  wklady_pominiete?: WkladPominietyRozplywu[] | null;
  prog_wkladu_pominietego_a?: number | null;
}

const SCENY = [
  {
    nazwa: 'sieć złota',
    wyniki: wynikiZlotej as unknown as ShortCircuitResults,
    rozplyw: rozplywZlotej as unknown as Record<string, OdpowiedzRozplywu>,
  },
  {
    nazwa: 'wartość robocza tolerancji nN',
    wyniki: wynikiRoboczej as unknown as ShortCircuitResults,
    rozplyw: rozplywRoboczej as unknown as Record<string, OdpowiedzRozplywu>,
  },
];

const PRZYPADKI = SCENY.flatMap((scena) =>
  scena.wyniki.rows.flatMap((row) =>
    (['basic', 'expert'] as const).map((tryb) => ({ scena, targetId: row.target_id, tryb })),
  ),
);

function atrapaFetchRozplywu(rozplyw: Record<string, OdpowiedzRozplywu>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      const adres = String(url);
      if (adres.includes('/results/short-circuit/rozplyw')) {
        const target = new URL(adres, 'http://localhost').searchParams.get('target_id') ?? '';
        const odpowiedz = rozplyw[target];
        if (odpowiedz) {
          return Promise.resolve(
            new Response(JSON.stringify(odpowiedz), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
      }
      return Promise.resolve(new Response('brak', { status: 404 }));
    }),
  );
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Wkłady pominięte — ten sam zbiór gałęzi w tabeli, śladzie i zestawieniu', () => {
  it('fixtury realnego biegu niosą wpisy pominięte i próg (inaczej test nic nie dowodzi)', () => {
    const wszystkie = SCENY.flatMap((s) => Object.values(s.rozplyw));
    expect(wszystkie.some((o) => (o.wklady_pominiete ?? []).length > 0)).toBe(true);
    expect(wszystkie.some((o) => (o.wklady_pominiete ?? []).length === 0)).toBe(true);
    for (const o of wszystkie) expect(typeof o.prog_wkladu_pominietego_a).toBe('number');
    // Kąt fazora wpisu pominiętego nie jest określony — fixtura z liczbą to regresja rdzenia.
    const katy = wszystkie.flatMap((o) => (o.wklady_pominiete ?? []).map((w) => w.kat_deg));
    expect(katy.length).toBeGreaterThan(0);
    expect(katy.filter((k) => k !== null)).toEqual([]);
  });

  it.each(PRZYPADKI)(
    '$scena.nazwa × $targetId × tryb $tryb',
    async ({ scena, targetId, tryb }) => {
      atrapaFetchRozplywu(scena.rozplyw);
      useResultsInspectorStore.setState({
        shortCircuitResults: scena.wyniki,
        selectedRunId: scena.wyniki.run_id,
      });
      await renderEkranZwarc(
        <EkranZwarc trybZaawansowania={tryb} onOtworzDowod={vi.fn()} wklady={{}} />,
      );
      const odpowiedz = scena.rozplyw[targetId];
      const wiersz = scena.wyniki.rows.find((r) => r.target_id === targetId)!;

      // Natywny klik wiersza punktu w tabeli punktów (pierwsza tabela ekranu).
      const tabelaPunktow = screen.getAllByTestId('mvd-wyn-tabela')[0];
      const wiersze = within(tabelaPunktow).getAllByTestId('mvd-wyn-wiersz');
      const doKlikniecia = wiersze.find((w) => w.textContent?.includes(wiersz.target_name ?? ''));
      expect(doKlikniecia).toBeDefined();
      fireEvent.click(doKlikniecia!);

      const sekcja = screen.getByTestId('mvd-zwarcia-rozplyw');
      await waitFor(() =>
        expect(within(sekcja).queryByTestId('mvd-zwarcia-rozplyw-ladowanie')).toBeNull(),
      );
      expect(sekcja).toHaveTextContent(wiersz.target_name ?? '');

      const wklady = odpowiedz.branch_contributions ?? [];
      const pominiete = odpowiedz.wklady_pominiete ?? [];
      const slad = odpowiedz.branch_flow_trace ?? [];

      // Tabela rozpływu = lista wkładów (wkład pominięty NIE jest wierszem).
      const tabelaRozplywu = within(sekcja).queryByTestId('mvd-zwarcia-rozplyw-tabela');
      if (wklady.length === 0) {
        expect(within(sekcja).getByTestId('mvd-zwarcia-rozplyw-pusty')).toBeInTheDocument();
        expect(tabelaRozplywu).toBeNull();
      } else {
        expect(within(tabelaRozplywu!).getAllByTestId('mvd-wyn-wiersz')).toHaveLength(wklady.length);
      }

      // Ślad: kroki = odpowiedź; kroki gałęziowe Thevenina = wpisy sieci zastępczej.
      const sekcjaSladu = screen.getByTestId('mvd-zwarcia-slad-rozplywu');
      expect(within(sekcjaSladu).queryAllByTestId('mvd-dowod-krok')).toHaveLength(slad.length);
      const krokiGalezi = slad.filter(
        (k) =>
          k.key?.startsWith('thevenin_flow_') &&
          k.key !== 'thevenin_flow_setup' &&
          k.key !== 'thevenin_flow_balance',
      );
      expect(krokiGalezi).toHaveLength(wklady.filter((w) => w.source_id === 'THEVENIN_GRID').length);

      const krokPominietych = slad.filter((k) => k.key === 'wklady_pominiete');
      const nota = within(sekcja).queryByTestId('mvd-zwarcia-rozplyw-pominiete-nota');
      if (pominiete.length === 0) {
        expect(krokPominietych).toHaveLength(0);
        expect(nota).toBeNull();
        return;
      }
      expect(krokPominietych).toHaveLength(1);
      const wynik = krokPominietych[0].result as Record<string, number>;
      expect(
        (wynik.liczba_pominietych_thevenin ?? 0) + (wynik.liczba_pominietych_falownik ?? 0),
      ).toBe(pominiete.length);

      // Nota: liczba wpisów zestawienia + próg w TYM SAMYM zapisie co tytuł kroku śladu.
      const progZTytulu = /\((\|I\| < [^)]+)\)/.exec(krokPominietych[0].title ?? '')?.[1];
      expect(progZTytulu).toBeDefined();
      expect(nota).not.toBeNull();
      expect(nota!.textContent).toContain(`(${progZTytulu}): ${pominiete.length}.`);

      const tabelaPominietych = within(sekcja).queryByTestId('mvd-zwarcia-rozplyw-pominiete-tabela');
      if (tryb === 'basic') {
        expect(tabelaPominietych).toBeNull();
        return;
      }
      expect(tabelaPominietych).not.toBeNull();
      const wierszePominietych = within(tabelaPominietych!).getAllByTestId('mvd-wyn-wiersz');
      expect(wierszePominietych).toHaveLength(pominiete.length);
      for (const w of wierszePominietych) {
        expect(w.textContent).not.toContain('0,000');
        expect(w.textContent).toContain('nie określono');
      }
    },
  );
});
