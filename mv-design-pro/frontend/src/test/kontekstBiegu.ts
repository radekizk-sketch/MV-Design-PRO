/**
 * Pomocnik testów (karta K8 KONTEKST-WYNIKU): „oglądany bieg" ustawiony tak, jak ustawia
 * go produkcja — bieg jest w rejestrze biegów przypadku (`useExecutionRunsStore.runs`,
 * stan DONE), a wybór przechodzi przez akcję magazynu kontekstu wyniku
 * (`wybierzBieg`). Dawny skrót testów (`useAppStateStore.setState({ activeRunId })`)
 * nie jest już źródłem biegu dla żadnej powierzchni wyników.
 */
import { useExecutionRunsStore } from '../ui/study-cases/runStore';
import type { ExecutionAnalysisType } from '../ui/study-cases/types';
import {
  STAN_WYBORU_PUSTY,
  useKontekstWynikuStore,
  type WynikBiegu,
  type ZrodloWyboru,
} from '../ui2/wyniki/kontekst/kontekstWyniku';
import { biegRejestru } from './biegNieaktualny';

/**
 * Wybiera bieg jawnie (domyślnie: jak z adresu URL `?run=`). Bieg, którego rejestr jeszcze
 * nie zna, jest — jak w produkcji — wyborem OCZEKUJĄCYM, rozstrzyganym, gdy rejestr go
 * dostanie. `dolozDoRejestru` dokłada zakończony rekord biegu danego rodzaju, gdy test
 * nie zasiewa rejestru sam (istniejący rekord testu nigdy nie jest nadpisywany).
 */
export function ustawBiegOgladany(
  id: string,
  opcje: { readonly dolozDoRejestru?: ExecutionAnalysisType; readonly zrodlo?: ZrodloWyboru } = {},
): void {
  const { dolozDoRejestru, zrodlo = 'url' } = opcje;
  const runs = useExecutionRunsStore.getState().runs;
  if (dolozDoRejestru && !runs.some((r) => r.id === id)) {
    useExecutionRunsStore.setState({ runs: [...runs, biegRejestru(id, dolozDoRejestru)] });
  }
  useKontekstWynikuStore.getState().wybierzBieg(id, zrodlo);
}

/** Czysty kontekst wyniku (izolacja testów). */
export function wyczyscKontekstWyniku(): void {
  useKontekstWynikuStore.setState({ ...STAN_WYBORU_PUSTY, wyniki: {} });
}

/**
 * Wynik biegu WCZYTANY do pamięci magazynu kontekstu — stan, który zostawia udany odczyt
 * `GET /api/execution/runs/{id}/results/v1` (`pobierzWynikBiegu`). Dla testów synchronicznych
 * powierzchni czytających wynik (inspektor); testy samego odczytu zaślepiają `fetch`.
 */
export function zasiejWynikWczytany(wynik: WynikBiegu): void {
  useKontekstWynikuStore.setState((s) => ({
    wyniki: { ...s.wyniki, [wynik.runId]: { rodzaj: 'gotowe', wynik } },
  }));
}
