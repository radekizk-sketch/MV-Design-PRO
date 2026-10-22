/*
 * KONTEKST WYNIKU — jeden magazyn „który bieg oglądam" dla całej aplikacji (karta K8,
 * wada Z-14 analizy odrzucenia UI-01/02/04).
 *
 * DEFEKT, KTÓRY TO USUWA. Pasek stanu pokazywał najnowszy zakończony bieg przypadku,
 * panel dolny trzymał własny `wybranyRunId` i własną pamięć wyników, nakładka schematu
 * brała bieg z `?run=`/`activeRunId` dwóch różnych magazynów (`useAppStateStore`
 * i `useExecutionRunsStore`), a ekrany pełne wybierały „aktywny, jeśli pasuje, inaczej
 * ostatni danego rodzaju" kilkunastoma kopiami tej samej funkcji (część po czasie
 * zakończenia, część po kolejności listy). Projektant mógł oglądać na schemacie bieg A,
 * w tabeli bieg B i na pasku bieg C — bez żadnej informacji.
 *
 * MODEL. Rozpływ, zwarcie i dynamika to odrębne RODZINY analiz (decyzja właściciela:
 * jeden globalny `run_id` nie wystarcza). Magazyn trzyma dla każdej rodziny bieg AKTYWNY
 * (jawny wybór; bez wyboru — najnowszy zakończony bieg tej rodziny) oraz rodzinę
 * OGLĄDANĄ (ta, której wynik jest na schemacie, w panelu dolnym i w „Dowodach").
 * Wybór biegu w DOWOLNYM miejscu (panel, ekran pełny, pasek stanu, adres `?run=`,
 * zakończenie biegu, zakładka „Przebiegi", „Otwórz dowód") idzie JEDNĄ akcją
 * `wybierzBieg` — i zmienia go wszędzie.
 *
 * KLUCZ biegu (`kluczBiegu`) jest złożony WYŁĄCZNIE z danych serwera: projekt,
 * przypadek, bieg, rodzaj analizy, rewizja modelu biegu, scenariusz biegu, odcisk
 * wejścia, status wyniku (rekord `GET /api/execution/study-cases/{id}/runs`) i status
 * jakości wyniku (`results/v1`, gdy wynik jest wczytany). Świeżość: JEDEN predykat
 * `swiezoscBiegu` — rewizja modelu biegu ≠ rewizja bieżąca ⇒ nieaktualny; werdykt
 * serwera o przypadku jest jego DANĄ WEJŚCIOWĄ (dla biegu na tej samej rewizji, którą
 * serwer ocenił), nie drugim niezależnym werdyktem.
 *
 * Wynik `results/v1` biegu zakończonego jest niezmienny, więc pamięć wyników jest
 * kluczowana identyfikatorem biegu i wspólna dla wszystkich konsumentów (panel dolny,
 * nakładka schematu) — jedno pobranie na bieg.
 *
 * ZERO fizyki, zero zgadywania: porównywane są numery rewizji i identyfikatory.
 */

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { create } from 'zustand';

import type {
  RawOverlayElement,
  RawOverlayPayload,
} from '../../../ui/sld-overlay/rawResultOverlayStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  RODZINY_ANALIZ,
  biegiRodziny,
  biegiZakonczone,
  etykietaRodzajuBiegu,
  rodzinaAnalizy,
  type RodzinaAnalizy,
} from './rodzinyBiegow';
import { swiezoscBiegu, type SwiezoscBiegu, type WerdyktPrzypadku } from './swiezoscBiegu';

export {
  ETYKIETA_RODZINY,
  RODZINY_ANALIZ,
  biegiRodziny,
  biegiZakonczone,
  etykietaRodzajuBiegu,
  rodzinaAnalizy,
  uporzadkujBiegi,
  type RodzinaAnalizy,
} from './rodzinyBiegow';

/** Źródło wyboru biegu — dziennik „skąd przyszedł kontekst" (audyt, testy iloczynu). */
export type ZrodloWyboru =
  | 'panel'
  | 'ekran'
  | 'pasek'
  | 'url'
  | 'bieg'
  | 'dowody'
  | 'przebiegi'
  | 'schemat';

/**
 * Stan wyboru (czysta część magazynu). Nie jest utrwalany między sesjami — tak jak
 * dawne `activeRunId`: po odświeżeniu kontekst odtwarza adres (`?run=`) albo domyślny
 * wybór (najnowszy bieg rodziny).
 */
export interface StanWyboru {
  /** Jawnie wybrany bieg rodziny; brak = najnowszy zakończony bieg rodziny. */
  readonly wybrane: Readonly<Partial<Record<RodzinaAnalizy, string>>>;
  /** Skąd przyszedł jawny wybór rodziny. */
  readonly zrodla: Readonly<Partial<Record<RodzinaAnalizy, ZrodloWyboru>>>;
  /** Rodzina oglądana (schemat, panel dolny, „Dowody"); `null` = domyślna. */
  readonly ogladana: RodzinaAnalizy | null;
  /**
   * Bieg wskazany, którego rejestr jeszcze nie zna (adres `?run=` przy zimnym starcie,
   * zanim rejestr biegów przypadku się wczyta) — rozstrzygany, gdy rejestr go poda.
   */
  readonly oczekujacy: { readonly runId: string; readonly zrodlo: ZrodloWyboru } | null;
}

export const STAN_WYBORU_PUSTY: StanWyboru = {
  wybrane: {},
  zrodla: {},
  ogladana: null,
  oczekujacy: null,
};

/**
 * Aktywny bieg rodziny: jawnie wybrany, jeśli rejestr ma go jako zakończony; inaczej
 * najnowszy zakończony bieg rodziny; brak → `null` (uczciwy stan zerowy).
 */
export function aktywnyBiegRodziny(
  runs: readonly ExecutionRun[],
  stan: StanWyboru,
  rodzina: RodzinaAnalizy,
): ExecutionRun | null {
  const biegi = biegiRodziny(runs, rodzina);
  const wybrany = stan.wybrane[rodzina];
  return biegi.find((run) => run.id === wybrany) ?? biegi[0] ?? null;
}

/**
 * Rodzina oglądana: jawna, jeśli ma zakończony bieg; inaczej rodzina najnowszego
 * zakończonego biegu przypadku (świeży przypadek bez wyboru pokazuje to, co policzono
 * ostatnio). Brak zakończonych biegów → `null`.
 */
export function rodzinaOgladana(runs: readonly ExecutionRun[], stan: StanWyboru): RodzinaAnalizy | null {
  if (stan.ogladana && biegiRodziny(runs, stan.ogladana).length > 0) return stan.ogladana;
  for (const run of biegiZakonczone(runs)) {
    const rodzina = rodzinaAnalizy(run.analysis_type);
    if (rodzina) return rodzina;
  }
  return null;
}

/** Bieg oglądany: aktywny bieg rodziny oglądanej. */
export function biegOgladany(runs: readonly ExecutionRun[], stan: StanWyboru): ExecutionRun | null {
  const rodzina = rodzinaOgladana(runs, stan);
  return rodzina ? aktywnyBiegRodziny(runs, stan, rodzina) : null;
}

/**
 * Identyfikator biegu oglądanego — także bieg OCZEKUJĄCY (wskazany adresem, rejestr
 * jeszcze go nie zna): konsument może pobrać jego wynik od razu, bez czekania na rejestr.
 */
export function runIdOgladany(runs: readonly ExecutionRun[], stan: StanWyboru): string | null {
  if (stan.oczekujacy) return stan.oczekujacy.runId;
  return biegOgladany(runs, stan)?.id ?? null;
}

/**
 * Przejście stanu po wyborze biegu (czyste — testowalne bez magazynu). Bieg znany
 * rejestrowi: staje się aktywnym biegiem swojej rodziny i rodzina staje się oglądaną.
 * Bieg nieznany rejestrowi: zostaje oczekującym (rozstrzygnie go `rozstrzygnijOczekujacy`).
 * Bieg znany, ale spoza rodzin: bez zmian (nie ma rodziny, której mógłby być aktywnym).
 */
export function poWyborze(
  stan: StanWyboru,
  runs: readonly ExecutionRun[],
  runId: string,
  zrodlo: ZrodloWyboru,
): StanWyboru {
  const run = runs.find((r) => r.id === runId);
  if (!run) {
    if (stan.oczekujacy?.runId === runId) return stan;
    return { ...stan, oczekujacy: { runId, zrodlo } };
  }
  const rodzina = rodzinaAnalizy(run.analysis_type);
  if (!rodzina) return stan.oczekujacy ? { ...stan, oczekujacy: null } : stan;
  if (
    stan.wybrane[rodzina] === runId
    && stan.zrodla[rodzina] === zrodlo
    && stan.ogladana === rodzina
    && stan.oczekujacy === null
  ) {
    return stan;
  }
  return {
    wybrane: { ...stan.wybrane, [rodzina]: runId },
    zrodla: { ...stan.zrodla, [rodzina]: zrodlo },
    ogladana: rodzina,
    oczekujacy: null,
  };
}

/** Bieg oczekujący, którego rejestr już zna → zwykły wybór; inaczej stan bez zmian. */
export function rozstrzygnijOczekujacy(stan: StanWyboru, runs: readonly ExecutionRun[]): StanWyboru {
  const oczekujacy = stan.oczekujacy;
  if (!oczekujacy || !runs.some((r) => r.id === oczekujacy.runId)) return stan;
  return poWyborze({ ...stan, oczekujacy: null }, runs, oczekujacy.runId, oczekujacy.zrodlo);
}

// ---------------------------------------------------------------------------
// Świeżość — JEDEN predykat
// ---------------------------------------------------------------------------

export {
  ETYKIETA_SWIEZOSCI,
  swiezoscBiegu,
  zdanieSwiezosci,
  type StanSwiezosciBiegu,
  type SwiezoscBiegu,
  type WerdyktPrzypadku,
} from './swiezoscBiegu';

// ---------------------------------------------------------------------------
// Wynik biegu (results/v1) — jedna pamięć dla wszystkich konsumentów
// ---------------------------------------------------------------------------

/** Wynik biegu w kształcie konsumowanym przez tabelę panelu i nakładkę schematu. */
export interface WynikBiegu {
  readonly runId: string;
  readonly analysisType: string;
  readonly elementy: Readonly<Record<string, RawOverlayElement>>;
  /** Status jakości wyniku z serwera (`global_results.quality_status`); `null` = nie podany. */
  readonly qualityStatus: string | null;
  readonly proofStatus: string | null;
  readonly runFinishedAt: string | null;
}

export type StanWynikuBiegu =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'gotowe'; readonly wynik: WynikBiegu }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

async function odczytajBlad(odpowiedz: Response): Promise<string> {
  try {
    const dane = await odpowiedz.json();
    if (typeof dane?.detail === 'string' && dane.detail.trim()) return dane.detail;
  } catch {
    /* ciało bez JSON — zostaje kod HTTP */
  }
  return `HTTP ${odpowiedz.status}`;
}

/** `GET /api/execution/runs/{run_id}/results/v1` → elementy nakładki wyniku + statusy. */
export async function pobierzWynikBiegu(runId: string): Promise<WynikBiegu> {
  const odpowiedz = await fetch(`/api/execution/runs/${encodeURIComponent(runId)}/results/v1`, {
    headers: { Accept: 'application/json' },
  });
  if (!odpowiedz.ok) throw new Error(await odczytajBlad(odpowiedz));
  const dane = await odpowiedz.json();
  const elementy = dane?.overlay_payload?.elements;
  if (!elementy || typeof elementy !== 'object' || Array.isArray(elementy)) {
    throw new Error('Serwer zwrócił wynik w nieoczekiwanym kształcie (brak elementów nakładki).');
  }
  const tekst = (wartosc: unknown): string | null =>
    typeof wartosc === 'string' && wartosc.trim() ? wartosc : null;
  return {
    runId,
    analysisType: String(dane?.overlay_payload?.analysis_type ?? dane?.analysis_type ?? ''),
    elementy: elementy as Record<string, RawOverlayElement>,
    qualityStatus: tekst(dane?.global_results?.quality_status),
    proofStatus: tekst(dane?.global_results?.proof_status),
    runFinishedAt: tekst(dane?.run_finished_at),
  };
}

// ---------------------------------------------------------------------------
// Magazyn
// ---------------------------------------------------------------------------

interface KontekstWynikuState extends StanWyboru {
  readonly wyniki: Readonly<Record<string, StanWynikuBiegu>>;
  /** JEDYNA akcja zmiany kontekstu wyniku — z dowolnego miejsca aplikacji. */
  readonly wybierzBieg: (runId: string, zrodlo: ZrodloWyboru) => void;
  /** Bieg oczekujący okazał się nieistniejący (serwer: 404) — porzucenie wskazania. */
  readonly porzucOczekujacy: (runId: string) => void;
  /** Zmiana przypadku/projektu: wybory poprzedniego przypadku nie mają tu znaczenia. */
  readonly wyczysc: () => void;
  /** Idempotentne: bieg już wczytany albo wczytywany nie jest pobierany drugi raz. */
  readonly wczytajWynik: (runId: string) => void;
  /** Ponowienie odczytu po błędzie. */
  readonly ponowWynik: (runId: string) => void;
}

export const useKontekstWynikuStore = create<KontekstWynikuState>()((set, get) => {
  const pobierz = (runId: string) => {
    set((s) => ({ wyniki: { ...s.wyniki, [runId]: { rodzaj: 'ladowanie' } } }));
    pobierzWynikBiegu(runId)
      .then((wynik) => set((s) => ({ wyniki: { ...s.wyniki, [runId]: { rodzaj: 'gotowe', wynik } } })))
      .catch((blad: unknown) =>
        set((s) => ({
          wyniki: {
            ...s.wyniki,
            [runId]: {
              rodzaj: 'blad',
              komunikat: blad instanceof Error ? blad.message : 'Nie udało się pobrać wyniku przebiegu.',
            },
          },
        })),
      );
  };
  return {
    ...STAN_WYBORU_PUSTY,
    wyniki: {},
    wybierzBieg: (runId, zrodlo) => {
      const stan = get();
      const nastepny = poWyborze(stan, useExecutionRunsStore.getState().runs, runId, zrodlo);
      if (nastepny !== stan) set(nastepny);
    },
    porzucOczekujacy: (runId) => {
      if (get().oczekujacy?.runId === runId) set({ oczekujacy: null });
    },
    wyczysc: () => set({ ...STAN_WYBORU_PUSTY }),
    wczytajWynik: (runId) => {
      if (get().wyniki[runId]) return;
      pobierz(runId);
    },
    ponowWynik: (runId) => pobierz(runId),
  };
});

// Rejestr biegów doładowany (zimny start z `?run=`, bieg zakończony w tle) — bieg
// oczekujący, który rejestr już zna, staje się zwykłym wyborem.
useExecutionRunsStore.subscribe((s, poprzedni) => {
  if (s.runs === poprzedni.runs) return;
  const kontekst = useKontekstWynikuStore.getState();
  const nastepny = rozstrzygnijOczekujacy(kontekst, s.runs);
  if (nastepny !== kontekst) useKontekstWynikuStore.setState(nastepny);
});

// ---------------------------------------------------------------------------
// Hooki odczytu — wszystkie powierzchnie czytają kontekst WYŁĄCZNIE stąd
// ---------------------------------------------------------------------------

function useStanWyboru(): StanWyboru {
  const wybrane = useKontekstWynikuStore((s) => s.wybrane);
  const zrodla = useKontekstWynikuStore((s) => s.zrodla);
  const ogladana = useKontekstWynikuStore((s) => s.ogladana);
  const oczekujacy = useKontekstWynikuStore((s) => s.oczekujacy);
  return useMemo(() => ({ wybrane, zrodla, ogladana, oczekujacy }), [wybrane, zrodla, ogladana, oczekujacy]);
}

/** Aktywny bieg rodziny (do odczytu w komponentach). */
export function useAktywnyBieg(rodzina: RodzinaAnalizy): ExecutionRun | null {
  const runs = useExecutionRunsStore((s) => s.runs);
  const stan = useStanWyboru();
  return useMemo(() => aktywnyBiegRodziny(runs, stan, rodzina), [runs, stan, rodzina]);
}

/** Identyfikator aktywnego biegu rodziny. */
export function useAktywnyRunId(rodzina: RodzinaAnalizy): string | null {
  return useAktywnyBieg(rodzina)?.id ?? null;
}

/** Bieg oglądany (schemat, panel dolny, „Dowody", powierzchnie bez własnej rodziny). */
export function useBiegOgladany(): ExecutionRun | null {
  const runs = useExecutionRunsStore((s) => s.runs);
  const stan = useStanWyboru();
  return useMemo(() => biegOgladany(runs, stan), [runs, stan]);
}

/** Identyfikator biegu oglądanego (z biegiem oczekującym włącznie). */
export function useRunIdOgladany(): string | null {
  const runs = useExecutionRunsStore((s) => s.runs);
  const stan = useStanWyboru();
  return useMemo(() => runIdOgladany(runs, stan), [runs, stan]);
}

/** Odczyt nie-Reactowy (akcje, nawigacja): bieg oglądany w chwili wywołania. */
export function runIdOgladanyTeraz(): string | null {
  return runIdOgladany(useExecutionRunsStore.getState().runs, useKontekstWynikuStore.getState());
}

/** Odczyt nie-Reactowy: aktywny bieg rodziny w chwili wywołania. */
export function aktywnyBiegTeraz(rodzina: RodzinaAnalizy): ExecutionRun | null {
  return aktywnyBiegRodziny(useExecutionRunsStore.getState().runs, useKontekstWynikuStore.getState(), rodzina);
}

/** Akcja wyboru biegu (stabilna referencja). */
export function useWybierzBieg(): (runId: string, zrodlo: ZrodloWyboru) => void {
  return useKontekstWynikuStore((s) => s.wybierzBieg);
}

/** Świeżość biegu z jednego predykatu — bieżąca rewizja i werdykt serwera ze store'ów. */
export function useSwiezoscBiegu(run: Pick<ExecutionRun, 'model_revision'> | null): SwiezoscBiegu | null {
  const rewizjaModelu = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const przypadek = useStudyCasesStore((s) => s.activeCase);
  return useMemo(
    () => (run ? swiezoscBiegu(run, rewizjaModelu, przypadek) : null),
    [run, rewizjaModelu, przypadek],
  );
}

/** Pełny klucz kontekstu wyniku biegu — wyłącznie dane serwera (karta K8 §0 pkt 1). */
export interface KluczBiegu {
  readonly projekt: string | null;
  readonly przypadek: string;
  readonly runId: string;
  readonly rodzajAnalizy: string;
  readonly rodzina: RodzinaAnalizy | null;
  readonly rewizjaModeluBiegu: number | null;
  /** Scenariusz roboczy biegu; `null` = stan normalny modelu; `undefined` = serwer nie podał. */
  readonly scenariusz: { readonly id: string; readonly rewizja: number } | null | undefined;
  readonly odciskWejscia: string;
  readonly statusWyniku: string | null;
  readonly statusJakosci: string | null;
  readonly swiezosc: SwiezoscBiegu;
}

export function kluczBiegu(
  run: ExecutionRun,
  swiezosc: SwiezoscBiegu,
  wynik: StanWynikuBiegu | undefined,
): KluczBiegu {
  return {
    projekt: run.project_id ?? null,
    przypadek: run.study_case_id,
    runId: run.id,
    rodzajAnalizy: run.analysis_type,
    rodzina: rodzinaAnalizy(run.analysis_type),
    rewizjaModeluBiegu: typeof run.model_revision === 'number' ? run.model_revision : null,
    scenariusz:
      run.scenario_ref === undefined
        ? undefined
        : run.scenario_ref === null
          ? null
          : { id: run.scenario_ref.scenario_id, rewizja: run.scenario_ref.revision },
    odciskWejscia: run.solver_input_hash,
    statusWyniku: run.result_status ?? null,
    statusJakosci: wynik?.rodzaj === 'gotowe' ? wynik.wynik.qualityStatus : null,
    swiezosc,
  };
}

/** Kontekst jednej rodziny dla paska stanu: aktywny bieg, lista biegów, świeżość. */
export interface KontekstRodziny {
  readonly rodzina: RodzinaAnalizy;
  readonly bieg: ExecutionRun;
  readonly biegi: readonly ExecutionRun[];
  readonly swiezosc: SwiezoscBiegu;
  readonly ogladana: boolean;
}

/** Kontekst rodzin, które mają zakończony bieg — w stałej kolejności `RODZINY_ANALIZ`. */
export function kontekstyRodzin(
  runs: readonly ExecutionRun[],
  stan: StanWyboru,
  rewizjaModelu: number | null,
  przypadek: WerdyktPrzypadku | null,
): KontekstRodziny[] {
  const ogladana = rodzinaOgladana(runs, stan);
  const wynik: KontekstRodziny[] = [];
  for (const rodzina of RODZINY_ANALIZ) {
    const bieg = aktywnyBiegRodziny(runs, stan, rodzina);
    if (!bieg) continue;
    wynik.push({
      rodzina,
      bieg,
      biegi: biegiRodziny(runs, rodzina),
      swiezosc: swiezoscBiegu(bieg, rewizjaModelu, przypadek),
      ogladana: rodzina === ogladana,
    });
  }
  return wynik;
}

export function useKontekstyRodzin(): KontekstRodziny[] {
  const runs = useExecutionRunsStore((s) => s.runs);
  const stan = useStanWyboru();
  const rewizjaModelu = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const przypadek = useStudyCasesStore((s) => s.activeCase);
  return useMemo(
    () => kontekstyRodzin(runs, stan, rewizjaModelu, przypadek),
    [runs, stan, rewizjaModelu, przypadek],
  );
}

/** Wynik biegu z pamięci wspólnej + wczytanie przy pierwszym odczycie. */
export function useWynikBiegu(runId: string | null): StanWynikuBiegu | null {
  const stan = useKontekstWynikuStore((s) => (runId ? s.wyniki[runId] ?? null : null));
  const wczytaj = useKontekstWynikuStore((s) => s.wczytajWynik);
  useEffect(() => {
    if (runId) wczytaj(runId);
  }, [runId, wczytaj]);
  return stan;
}

/** Wynik biegu w kształcie nakładki schematu (`RawOverlayPayload`) — jedno odwzorowanie. */
export function payloadNakladki(wynik: WynikBiegu): RawOverlayPayload {
  return {
    run_id: wynik.runId,
    analysis_type: wynik.analysisType || 'LOAD_FLOW',
    elements: wynik.elementy as Record<string, RawOverlayElement>,
    quality_status: wynik.qualityStatus,
    proof_status: wynik.proofStatus,
    run_finished_at: wynik.runFinishedAt,
  };
}

/**
 * Wynik biegu OGLĄDANEGO w kształcie nakładki: bieg (gdy rejestr go zna), stan odczytu
 * i payload (gdy wczytany). Źródło nakładki schematu i sekcji „Wyniki" inspektora.
 */
export function useNakladkaBieguOgladanego(): {
  readonly runId: string | null;
  readonly bieg: ExecutionRun | null;
  readonly stan: StanWynikuBiegu | null;
  readonly payload: RawOverlayPayload | null;
} {
  const runId = useRunIdOgladany();
  const bieg = useBiegOgladany();
  const stan = useWynikBiegu(runId);
  return useMemo(
    () => ({
      runId,
      bieg: bieg && bieg.id === runId ? bieg : null,
      stan,
      payload: stan?.rodzaj === 'gotowe' && stan.wynik.runId === runId ? payloadNakladki(stan.wynik) : null,
    }),
    [bieg, runId, stan],
  );
}

/** Etykieta biegu: „{rodzaj PL} · {czas} · rew. N" (rewizja nieznana — bez członu). */
export function etykietaBiegu(run: ExecutionRun): string {
  const iso = run.finished_at ?? run.started_at;
  const dopasowanie = iso ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso) : null;
  const czas = dopasowanie ? `${dopasowanie[1]} ${dopasowanie[2]}` : (iso ?? '—');
  const rewizja = typeof run.model_revision === 'number' ? ` · rew. ${run.model_revision}` : '';
  return `${etykietaRodzajuBiegu(run.analysis_type)} · ${czas}${rewizja}`;
}

// ---------------------------------------------------------------------------
// Ekran pełny → schemat (synchronizacja dwukierunkowa, K8 §0 pkt 4)
// ---------------------------------------------------------------------------

/**
 * Bieg, którego wynik pokazuje ekran pełny (aktywny bieg rodziny zakładki). Dostarcza go
 * warsztat wyników; tabele wspólnego wzorca (`TabelaWynikow`) czytają go przy wyborze
 * wiersza. `null` = tabela poza ekranem pełnym rodziny (panel dolny, sekcje bez rodziny).
 */
export const KontekstBieguEkranu = createContext<string | null>(null);

/**
 * Wybór wiersza elementu na ekranie pełnym zaznacza element na schemacie — a schemat musi
 * pokazywać TEN SAM bieg co wiersz. Gdy oglądany jest inny bieg (np. zwarcie, a wiersz jest
 * z rozpływu), kontekst przełącza się jawnie (`wybierzBieg(…, 'ekran')`) — nigdy po cichu
 * nie zostaje wynik innego biegu pod zaznaczonym elementem.
 */
export function usePokazBiegEkranuNaSchemacie(): () => void {
  const runId = useContext(KontekstBieguEkranu);
  const wybierz = useKontekstWynikuStore((s) => s.wybierzBieg);
  return useCallback(() => {
    if (runId) wybierz(runId, 'ekran');
  }, [runId, wybierz]);
}
