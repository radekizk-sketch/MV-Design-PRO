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
 * 1. Kafle „Postęp wg celu" i „Bilans przyłączeniowy" (audyt W-101) NIE MAJĄ
 *    źródła w store'ach read-only (brak modelu celu projektu i bilansu mocy
 *    przyłączeniowej) → renderowane jako kafle „wkrótce" (`KafelWkrotce`),
 *    bez zgadywania wartości.
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
