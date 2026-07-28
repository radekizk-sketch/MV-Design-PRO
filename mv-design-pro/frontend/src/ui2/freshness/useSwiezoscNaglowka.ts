/*
 * Nagłówek świeżości ekranu analizy — JEDNA derywacja zamiast dwunastu (V12K-264).
 *
 * DLACZEGO HOOK, A NIE POWTÓRZENIE W KAŻDYM EKRANIE. Ekranów analizy budujących
 * `NaglowekAnalizy` jest kilkanaście (`EkranZwarc`, `TabelaSzyn`, `TabelaGalezi`,
 * `EkranJakosci` ×6, `EkranOdbioru`, `EkranEstymacji`, `EkranSkladowych`,
 * `EkranStabilnosci`, `EkranRankingu`…). Wklejenie do każdego z nich tej samej
 * logiki „skąd wziąć rewizję" oznaczałoby kilkanaście kopii reguły, które
 * rozjadą się przy pierwszej zmianie kontraktu — dokładnie ten mechanizm dał
 * defekt V12K-256 (trzy kopie jednej reguły normowej z różnymi progami).
 *
 * SKĄD POCHODZĄ OBIE LICZBY (zero zgadywania):
 *  - `rewizjaModelu` — BIEŻĄCA rewizja modelu z `useSnapshotStore`
 *    (`snapshot.header.revision`), ta sama konwencja co `useSwiezoscWynikow`.
 *  - `rewizjaDanych` — rewizja, NA KTÓREJ policzono bieg, z kontraktu przebiegu
 *    (`analysisCaseContext.rewizjaModelu`, backend: `analysis_case_context`).
 *    Do V12K-264 kontrakt tej liczby NIE NIÓSŁ, więc znacznik świeżości był
 *    pomijany na każdym ekranie — mówią o tym wprost komentarze w
 *    `zwarciaModel.ts` i `rozplywAdapter.ts`.
 *  - `caseId` — aktywny wariant pracy z `useAppStateStore`; bez niego panel
 *    przyczyn nie ma czego zapytać.
 *
 * BRAK DANEJ ZOSTAJE BRAKIEM: gdy którakolwiek rewizja jest nieznana, hook zwraca
 * `undefined` i wspólny wzorzec po prostu NIE pokazuje znacznika — tak jak dotąd.
 * Nigdy nie podstawiamy zera ani rewizji bieżącej, bo „aktualne" byłoby wtedy
 * werdyktem bez podstawy.
 */

import { useAppStateStore } from '../../ui/app-state/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useAnalysisRunContract } from '../../ui/workspace/analysisRunContract';

export interface SwiezoscNaglowka {
  /** Bieżąca rewizja modelu (undefined = nieznana). */
  readonly rewizjaModelu?: number;
  /** Rewizja modelu, na której policzono bieg (undefined = kontrakt jej nie niesie). */
  readonly rewizjaDanych?: number;
  /** Aktywny wariant pracy — źródło dziennika zmian. */
  readonly caseId?: string;
}

/**
 * Pola świeżości do `NaglowekAnalizy`. Wywołanie: rozłóż wynik w nagłówku, np.
 * `naglowek={{ analizaPL, runId, ...useSwiezoscNaglowka(runId) }}`.
 */
export function useSwiezoscNaglowka(runId: string | null | undefined): SwiezoscNaglowka {
  const rewizjaModelu = useSnapshotStore((s) => s.snapshot?.header.revision);
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const { data } = useAnalysisRunContract(runId ?? null);

  const rewizjaDanych = data?.analysisCaseContext?.rewizjaModelu ?? undefined;

  return {
    rewizjaModelu: typeof rewizjaModelu === 'number' ? rewizjaModelu : undefined,
    rewizjaDanych: typeof rewizjaDanych === 'number' ? rewizjaDanych : undefined,
    caseId: caseId ?? undefined,
  };
}
