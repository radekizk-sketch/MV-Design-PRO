/*
 * Nagłówek świeżości ekranu analizy — JEDNA derywacja zamiast dwunastu (V12K-264).
 *
 * DLACZEGO HOOK, A NIE POWTÓRZENIE W KAŻDYM EKRANIE. Ekranów analizy budujących
 * `NaglowekAnalizy` jest kilkanaście (`EkranZwarc`, `TabelaSzyn`, `TabelaGalezi`,
 * `EkranJakosci` ×6, `EkranOdbioru`, `EkranEstymacji`, `EkranSkladowych`,
 * `EkranRankingu`…). Wklejenie do każdego z nich tej samej
 * logiki „skąd wziąć rewizję" oznaczałoby kilkanaście kopii reguły, które
 * rozjadą się przy pierwszej zmianie kontraktu — dokładnie ten mechanizm dał
 * defekt V12K-256 (trzy kopie jednej reguły normowej z różnymi progami).
 *
 * SKĄD POCHODZĄ OBIE LICZBY (zero zgadywania):
 *  - `rewizjaModelu` — BIEŻĄCA rewizja modelu z JEDNEGO źródła
 *    `useSnapshotStore.rewizjaBiezacegoModelu` (S9-11 / W-5): rewizja
 *    wyświetlanej migawki (`snapshot.header.revision`) bywa rewizją PODGLĄDU
 *    PRZEBIEGU — porównanie z nią wychodziło „aktualne" zawsze, niezależnie od
 *    tego, jak daleko pojechał żywy model, i przeczyło chipowi paska przypadku
 *    („trzy prawdy stanu" z pomiaru audytu). Ta sama konwencja co
 *    `useSwiezoscWynikow`. CV-2-W: chip PASKA PRZYPADKU nie liczy już świeżości
 *    sam — pokazuje werdykt, który backend wyprowadza z biegów przypadku i
 *    koperty rewizji (`ui2/shell/znacznikSwiezosci.ts`). Tutaj podmiotem jest
 *    JEDEN PRZEBIEG, więc porównanie rewizji zostaje; że oba wskaźniki nigdy nie
 *    mówią rzeczy przeciwnych, pilnuje
 *    `freshness/__tests__/jednaPrawdaStanuWynikow.test.tsx`.
 *  - `rewizjaDanych` — rewizja, NA KTÓREJ policzono bieg, z kontraktu przebiegu
 *    (`analysisCaseContext.rewizjaModelu`, backend: `analysis_case_context`).
 *    Do V12K-264 kontrakt tej liczby NIE NIÓSŁ, więc znacznik świeżości był
 *    pomijany na każdym ekranie — mówią o tym wprost komentarze w
 *    `zwarciaModel.ts` i `rozplywAdapter.ts`.
 *  - `caseId` — aktywny wariant pracy z `useAppStateStore`; bez niego panel
 *    przyczyn nie ma czego zapytać.
 *
 *  - `przyczynaSerwera` (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN) — werdykt TEGO
 *    biegu z serwera (`/api/analysis-runs/{id}`: `result_freshness`, ta sama funkcja co
 *    status przypadku w powłoce), przepuszczony przez JEDEN predykat `swiezoscBiegu`.
 *    Zmiana grupy nastaw, nadpisania nastaw przypadku albo scenariusza nazwanego biegu
 *    nie rusza rewizji modelu — samo porównanie rewizji zostawiało nagłówek „aktualny"
 *    przy powłoce „nieaktualne". Kontrakt biegu jest pobierany ponownie, gdy odcisk wejść
 *    aktywnego przypadku (`odcisk_wejsc_swiezosci`) różni się od odcisku werdyktu.
 *
 * BRAK DANEJ ZOSTAJE BRAKIEM: gdy którakolwiek rewizja jest nieznana, hook zwraca
 * `undefined` i wspólny wzorzec po prostu NIE pokazuje znacznika — tak jak dotąd.
 * Nigdy nie podstawiamy zera ani rewizji bieżącej, bo „aktualne" byłoby wtedy
 * werdyktem bez podstawy.
 */

import { useAppStateStore } from '../../ui/app-state/store';
import { useStudyCasesStore } from '../../ui/study-cases/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useAnalysisRunContract } from '../../ui/workspace/analysisRunContract';
import { swiezoscBiegu } from '../wyniki/kontekst/swiezoscBiegu';

export interface SwiezoscNaglowka {
  /** Bieżąca rewizja modelu (undefined = nieznana). */
  readonly rewizjaModelu?: number;
  /** Rewizja modelu, na której policzono bieg (undefined = kontrakt jej nie niesie). */
  readonly rewizjaDanych?: number;
  /** Aktywny wariant pracy — źródło dziennika zmian. */
  readonly caseId?: string;
  /**
   * Wynik nieaktualny z orzeczenia serwera przy tej samej rewizji modelu (zmiana wyboru
   * zabezpieczeń przypadku albo scenariusza nazwanego) — zdanie przyczyny po polsku.
   * `undefined` = serwer nie orzekł nieaktualności albo rozstrzyga porównanie rewizji.
   */
  readonly przyczynaSerwera?: string;
}

/**
 * Pola świeżości do `NaglowekAnalizy`. Wywołanie: rozłóż wynik w nagłówku, np.
 * `naglowek={{ analizaPL, runId, ...useSwiezoscNaglowka(runId) }}`.
 */
export function useSwiezoscNaglowka(runId: string | null | undefined): SwiezoscNaglowka {
  // Jedno źródło rewizji bieżącego modelu (W-5) — `null` = nieznana, znacznik
  // po prostu się nie renderuje (brak danej zostaje brakiem, nie awarią).
  const rewizjaModelu = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const przypadek = useStudyCasesStore((s) => s.activeCase);
  const przypadekBiegu = przypadek && przypadek.id === caseId ? przypadek : null;
  const odciskWejsc = przypadekBiegu?.odcisk_wejsc_swiezosci ?? null;
  const { data } = useAnalysisRunContract(runId ?? null, odciskWejsc);

  const rewizjaDanych = data?.analysisCaseContext?.rewizjaModelu ?? undefined;
  // Werdykt biegu rozstrzyga w predykacie tylko, gdy wydano go na bieżących wejściach
  // przypadku (odciski równe) — kontrakt w trakcie ponownego pobrania opisuje stan sprzed zmiany.
  const swiezosc = swiezoscBiegu(
    {
      model_revision: typeof rewizjaDanych === 'number' ? rewizjaDanych : null,
      result_freshness: data?.resultFreshness ?? null,
      result_freshness_reason_pl: data?.resultFreshnessReasonPl ?? null,
      odcisk_wejsc_swiezosci: data?.odciskWejscSwiezosci ?? null,
    },
    typeof rewizjaModelu === 'number' ? rewizjaModelu : null,
    przypadekBiegu,
  );
  const przyczynaSerwera =
    swiezosc.przyczyna === 'werdykt-serwera' ? swiezosc.przyczynaPl ?? undefined : undefined;

  return {
    rewizjaModelu: typeof rewizjaModelu === 'number' ? rewizjaModelu : undefined,
    rewizjaDanych: typeof rewizjaDanych === 'number' ? rewizjaDanych : undefined,
    caseId: caseId ?? undefined,
    ...(przyczynaSerwera !== undefined ? { przyczynaSerwera } : {}),
  };
}
