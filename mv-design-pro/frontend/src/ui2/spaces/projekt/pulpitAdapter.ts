/*
 * Adapter pulpitu projektu (przestrzeń „Projekt", W-101, karta E2.1) — czyta
 * WYŁĄCZNIE istniejące store'y read-only i mapuje je na modele kafli. Zero wołań
 * API, zero mutacji (Case Immutability Rule). Funkcje `mapuj*` są czyste (bez
 * React) i testowalne fixture'ami o realnym kształcie store'ów; hooki `use*`
 * spinają je z Zustandem przez selektory.
 *
 * Źródła danych (mapowanie plik:linia — karta §2, §6):
 * - Snapshot modelu + gotowość: `useSnapshotStore` (`ui/topology/snapshotStore.ts:249`),
 *   pola `snapshot` (`EnergyNetworkModel`, snapshotStore.ts:48), `readiness`
 *   (`ReadinessInfo`, snapshotStore.ts:52), `loading` (snapshotStore.ts:71).
 *   Kształt `EnergyNetworkModel` — `types/enm.ts:888-907` (tablice elementów),
 *   nagłówek `header.revision`/`header.hash_sha256` — `types/enm.ts:92-93`
 *   (`ENMHeader`). `ReadinessInfo.ready/blockers/warnings` — `types/enm.ts:1243-1257`.
 * - Przypadki obliczeniowe: `useSortedCases` (`ui/study-cases/store.ts:372`,
 *   sort `localeCompare('pl')`) — `StudyCaseListItem` (`ui/study-cases/types.ts:105-114`:
 *   id, name, description, result_status, results_valid, is_active, updated_at).
 *   Aktywny przypadek: `useActiveCase` (`ui/study-cases/store.ts:306`) — pełny
 *   `StudyCase` z `result_status`/`results_valid` (`types.ts:92-94`).
 * - Przebiegi: `useExecutionRunsStore` (`ui/study-cases/runStore.ts:81`), pola
 *   `runs` (`ExecutionRun[]`, runStore.ts:40) i `activeStudyCaseId` (runStore.ts:31).
 *   `ExecutionRun.started_at/analysis_type/status` — `types.ts:234-243`; etykiety
 *   `ANALYSIS_TYPE_LABELS`/`RUN_STATUS_LABELS` — `types.ts:270-289`.
 *
 * TODO-KARTA (ograniczenia danych — brak źródła w store'ach, karta §2/§4):
 * 1. Kafel „Postęp wg celu" (audyt W-101) NIE MA źródła w store'ach read-only
 *    (brak modelu celu projektu) → renderowany jako kafel „wkrótce"
 *    (`KafelWkrotce`), bez zgadywania wartości. Kafel „Warunki przyłączenia
 *    i bilans mocy" (E1 — B1/B2) MA źródło: `sources` (Sk″/Ik″/U przyłączenia)
 *    + rollup mocy znamionowej `generators`/`loads` (patrz `mapujPrzylaczenie`).
 *    GAP backendu (zarejestrowany, nie fabrykowany): „moc przyłączeniowa" (limit
 *    OSD) oraz cosφ/tryb pracy przyłącza nie mają pola w modelu → nie pokazywane;
 *    dynamiczna zdolność przyłączeniowa żyje w analizie E5/E7 (hosting_capacity).
 * 2. Rewizja WYNIKÓW (liczbowa) dla stanu „nieaktualne" nie jest wystawiana przez
 *    store'y (jest wyłącznie `result_status` FRESH/OUTDATED/NONE, bez numeru
 *    rewizji modelu w chwili liczenia) → `FreshnessBadge` w `KafelSpojnosci`
 *    obsługuje uczciwie stan „aktualne" (rewizja danej = rewizja modelu); stan
 *    „nieaktualne" pokazuje etykietę statusu bez fabrykowanego numeru rew. a→b.
 * 3. „Ostatni przebieg" per przypadek: `runStore.runs` trzyma przebiegi WYŁĄCZNIE
 *    dla `activeStudyCaseId` (runStore.ts:87-97), nie pełną historię wszystkich
 *    przypadków. Kolumna „Ostatni przebieg" jest więc uzupełniana tylko dla
 *    aktywnego przypadku (realny czas z przebiegu); pozostałe wiersze pokazują „—".
 */

import { useMemo } from 'react';
import type { EnergyNetworkModel, ReadinessInfo } from '../../../types/enm';
import type {
  ExecutionRun,
  StudyCase,
  StudyCaseListItem,
  StudyCaseResultStatus,
} from '../../../ui/study-cases/types';
import { ANALYSIS_TYPE_LABELS, RUN_STATUS_LABELS } from '../../../ui/study-cases/types';
import type { RunStatus } from '../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useActiveCase, useSortedCases } from '../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';

// ---------------------------------------------------------------------------
// Stan przestrzeni
// ---------------------------------------------------------------------------

/** Stan pulpitu (karta §3): brak projektu / ładowanie / gotowy. */
export type StanPulpitu = 'brak-projektu' | 'ladowanie' | 'gotowy';

// ---------------------------------------------------------------------------
// Modele kafli (widok — projekcja read-only)
// ---------------------------------------------------------------------------

/** Kafel „Model sieci": licznik elementów + rozbicia pierwszoplanowe. */
export interface ModelKafel {
  elementow: number;
  stacje: number;
  zrodla: number;
}

/** Kafel „Gotowość do analiz": stan gotowości + liczniki blokad/ostrzeżeń. */
export interface GotowoscKafel {
  gotowa: boolean;
  blokady: number;
  ostrzezenia: number;
}

/** Kafel „Ostatni przebieg": ostatni (najświeższy) przebieg aktywnego przypadku. */
export interface OstatniPrzebiegKafel {
  czasISO: string | null;
  analizaPL: string;
  statusPL: string;
  statusKod: RunStatus;
}

/** Aktualność wyników aktywnego przypadku względem modelu. */
export type AktualnoscWynikow = 'aktualne' | 'nieaktualne' | 'brak';

/** Kafel „Spójność": rewizja modelu + odcisk + aktualność wyników. */
export interface SpojnoscKafel {
  rewizjaModelu: number;
  odcisk: string;
  aktualnosc: AktualnoscWynikow;
}

/** Źródło sieciowe (punkt przyłączenia) — warunki od strony OSD. */
export interface ZrodloSieciowe {
  nazwa: string;
  napiecieKv: number | null;
  sk3Mva: number | null;
  ik3Ka: number | null;
}

/**
 * Kafel „Warunki przyłączenia i bilans mocy" (E1 — B1/B2 + K2). Warunki
 * przyłączenia = źródła sieciowe (Sk″/Ik″/U) + blok warunków OSD z nagłówka
 * modelu (`header.connection_conditions`, operacja `set_connection_conditions`).
 * Bilans = rollup mocy ZNAMIONOWEJ (nameplate) z modelu — NIE fizyka
 * (analogicznie do `_existing_generation_mw` backendu, które sumuje surowe
 * `p_mw`; `p_mw` już zawiera krotność, patrz `domain_operations_v2.py`).
 */
export interface PrzylaczenieKafel {
  zrodlaSieciowe: ZrodloSieciowe[];
  generacjaMw: number;
  odbioryMw: number;
  nettoMw: number;
  liczbaGeneratorow: number;
  liczbaOdbiorow: number;
  /** Limit mocy z warunków przyłączenia OSD [MW]; null = nie podano. */
  mocPrzylaczeniowaMw: number | null;
  /** Wymagany cosφ z warunków OSD; null = nie podano. */
  wymaganyCosPhi: number | null;
  /** Tryb pracy przyłącza (tekst z dokumentu OSD); null = nie podano. */
  trybPracy: string | null;
  /** Werdykt bilansu: generacja znamionowa > limit OSD (porównanie dwóch
   * danych WEJŚCIOWYCH — prezentacja, nie fizyka). null = brak limitu. */
  przekroczonoLimit: boolean | null;
}

/** Wiersz listy przypadków obliczeniowych. */
export interface PrzypadekWiersz {
  id: string;
  nazwa: string;
  konfiguracja: string;
  statusWynikow: StudyCaseResultStatus;
  ostatniPrzebiegISO: string | null;
  aktywny: boolean;
}

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React)
// ---------------------------------------------------------------------------

/** Suma wszystkich elementów sieci w snapshotcie (spis tablic `EnergyNetworkModel`). */
function liczbaElementow(snapshot: EnergyNetworkModel): number {
  return (
    snapshot.buses.length +
    snapshot.branches.length +
    snapshot.transformers.length +
    snapshot.sources.length +
    snapshot.loads.length +
    snapshot.generators.length +
    snapshot.substations.length +
    snapshot.bays.length +
    snapshot.junctions.length +
    (snapshot.branch_points?.length ?? 0) +
    snapshot.corridors.length +
    snapshot.measurements.length +
    snapshot.protection_assignments.length
  );
}

/**
 * Kafel „Model sieci". „Źródła" = `sources` + `generators` zgodnie z tabelą
 * terminologii (CLAUDE.md: „Source | External Grid / Generator / Inverter") —
 * pojęcie źródła obejmuje sieć zewnętrzną, generatory i falowniki OZE.
 */
export function mapujModel(snapshot: EnergyNetworkModel): ModelKafel {
  return {
    elementow: liczbaElementow(snapshot),
    stacje: snapshot.substations.length,
    zrodla: snapshot.sources.length + snapshot.generators.length,
  };
}

/**
 * Kafel „Warunki przyłączenia i bilans mocy" (E1 — B1/B2). Źródła sieciowe z
 * `sources` (napięcie z połączonej szyny), bilans z sumy `p_mw` generatorów i
 * odbiorów. Suma znamionowa (rollup danych wejściowych, spójna z backendem —
 * `_existing_generation_mw`), NIE wynik fizyki; zero wywołań solvera.
 */
export function mapujPrzylaczenie(snapshot: EnergyNetworkModel): PrzylaczenieKafel {
  const napiecieSzyny = new Map<string, number>();
  for (const bus of snapshot.buses) napiecieSzyny.set(bus.ref_id, bus.voltage_kv);

  const zrodlaSieciowe: ZrodloSieciowe[] = snapshot.sources.map((s) => ({
    nazwa: s.name,
    napiecieKv: napiecieSzyny.get(s.bus_ref) ?? null,
    sk3Mva: s.sk3_mva ?? null,
    ik3Ka: s.ik3_ka ?? null,
  }));

  const generacjaMw = snapshot.generators.reduce((acc, g) => acc + g.p_mw, 0);
  const odbioryMw = snapshot.loads.reduce((acc, l) => acc + l.p_mw, 0);

  const warunki = snapshot.header.connection_conditions ?? null;
  const mocPrzylaczeniowaMw = warunki?.moc_przylaczeniowa_mw ?? null;

  return {
    zrodlaSieciowe,
    generacjaMw,
    odbioryMw,
    nettoMw: generacjaMw - odbioryMw,
    liczbaGeneratorow: snapshot.generators.length,
    liczbaOdbiorow: snapshot.loads.length,
    mocPrzylaczeniowaMw,
    wymaganyCosPhi: warunki?.wymagany_cos_phi ?? null,
    trybPracy: warunki?.tryb_pracy ?? null,
    przekroczonoLimit:
      mocPrzylaczeniowaMw === null ? null : generacjaMw > mocPrzylaczeniowaMw,
  };
}

/** Kafel „Gotowość do analiz" z `ReadinessInfo`. */
export function mapujGotowosc(readiness: ReadinessInfo | null): GotowoscKafel {
  return {
    gotowa: readiness?.ready ?? false,
    blokady: readiness?.blockers.length ?? 0,
    ostrzezenia: readiness?.warnings.length ?? 0,
  };
}

/**
 * Ostatni (najświeższy) przebieg z listy `runs` — porządek deterministyczny:
 * malejąco po `started_at`, remis rozstrzygany malejąco po `id`. `null` = brak.
 */
export function mapujOstatniPrzebieg(runs: ExecutionRun[]): OstatniPrzebiegKafel | null {
  if (runs.length === 0) return null;
  const posortowane = [...runs].sort((a, b) => {
    const czasA = a.started_at ?? '';
    const czasB = b.started_at ?? '';
    if (czasA !== czasB) return czasB.localeCompare(czasA);
    return b.id.localeCompare(a.id);
  });
  const ostatni = posortowane[0];
  return {
    czasISO: ostatni.started_at,
    analizaPL: ANALYSIS_TYPE_LABELS[ostatni.analysis_type],
    statusPL: RUN_STATUS_LABELS[ostatni.status],
    statusKod: ostatni.status,
  };
}

/** Aktualność wyników z pełnego przypadku aktywnego (`result_status`). */
function aktualnoscZPrzypadku(activeCase: StudyCase | null): AktualnoscWynikow {
  if (!activeCase || activeCase.result_status === 'NONE') return 'brak';
  return activeCase.results_valid ? 'aktualne' : 'nieaktualne';
}

/** Kafel „Spójność" — rewizja modelu + odcisk + aktualność wyników aktywnego przypadku. */
export function mapujSpojnosc(
  snapshot: EnergyNetworkModel,
  activeCase: StudyCase | null,
): SpojnoscKafel {
  return {
    rewizjaModelu: snapshot.header.revision,
    odcisk: snapshot.header.hash_sha256,
    aktualnosc: aktualnoscZPrzypadku(activeCase),
  };
}

/**
 * Wiersze listy przypadków. `ostatniPrzebiegWgId` mapuje id przypadku → ISO
 * czasu ostatniego przebiegu (dostępne wyłącznie dla aktywnego przypadku —
 * TODO-KARTA #3); brak wpisu → `null` („—" w kolumnie).
 */
export function mapujPrzypadki(
  cases: StudyCaseListItem[],
  ostatniPrzebiegWgId?: ReadonlyMap<string, string>,
): PrzypadekWiersz[] {
  return cases.map((c) => ({
    id: c.id,
    nazwa: c.name,
    konfiguracja: c.description.trim() || '—',
    statusWynikow: c.result_status,
    ostatniPrzebiegISO: ostatniPrzebiegWgId?.get(c.id) ?? null,
    aktywny: c.is_active,
  }));
}

// ---------------------------------------------------------------------------
// Hooki read-only (spięcie ze store'ami)
// ---------------------------------------------------------------------------

/** Stan przestrzeni: snapshot obecny → gotowy; ładowanie → ładowanie; inaczej brak projektu. */
export function usePulpitStan(): StanPulpitu {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const loading = useSnapshotStore((s) => s.loading);
  if (snapshot) return 'gotowy';
  if (loading) return 'ladowanie';
  return 'brak-projektu';
}

export function useModelKafel(): ModelKafel | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  return useMemo(() => (snapshot ? mapujModel(snapshot) : null), [snapshot]);
}

export function useGotowoscKafel(): GotowoscKafel {
  const readiness = useSnapshotStore((s) => s.readiness);
  return useMemo(() => mapujGotowosc(readiness), [readiness]);
}

export function usePrzylaczenieKafel(): PrzylaczenieKafel | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  return useMemo(() => (snapshot ? mapujPrzylaczenie(snapshot) : null), [snapshot]);
}

export function useOstatniPrzebiegKafel(): OstatniPrzebiegKafel | null {
  const runs = useExecutionRunsStore((s) => s.runs);
  return useMemo(() => mapujOstatniPrzebieg(runs), [runs]);
}

export function useSpojnoscKafel(): SpojnoscKafel | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCase = useActiveCase();
  return useMemo(
    () => (snapshot ? mapujSpojnosc(snapshot, activeCase) : null),
    [snapshot, activeCase],
  );
}

export function usePrzypadkiWiersze(): PrzypadekWiersz[] {
  const cases = useSortedCases();
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeStudyCaseId = useExecutionRunsStore((s) => s.activeStudyCaseId);
  const ostatniPrzebiegWgId = useMemo(() => {
    // TODO-KARTA #3: pełna historia per przypadek niedostępna — mapa niesie
    // wyłącznie ostatni przebieg aktywnego przypadku.
    const najswiezszy = activeStudyCaseId ? mapujOstatniPrzebieg(runs) : null;
    const mapa = new Map<string, string>();
    if (activeStudyCaseId && najswiezszy?.czasISO) {
      mapa.set(activeStudyCaseId, najswiezszy.czasISO);
    }
    return mapa;
  }, [runs, activeStudyCaseId]);
  return useMemo(() => mapujPrzypadki(cases, ostatniPrzebiegWgId), [cases, ostatniPrzebiegWgId]);
}
