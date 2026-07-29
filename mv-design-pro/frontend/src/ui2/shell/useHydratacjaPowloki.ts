/**
 * Hydratacja powłoki po zimnym starcie (karta K2, defekt H-0).
 *
 * `useAppStateStore` JEST persystowany (zustand persist) — activeProjectId /
 * activeCaseId przeżywają restart przeglądarki, ale stan ZALEŻNY był dotąd
 * odtwarzany wyłącznie interakcjami użytkownika. Ten hook — wpięty w korzeń
 * powłoki (AppRoot) — odtwarza go z SERWERA na montaż oraz po odzyskaniu
 * połączenia z backendem:
 *
 * 1. `useStudyCasesStore` — `setProjectId(projectId)` (reużycie istniejącej
 *    akcji: woła `loadCases` + `loadActiveCase`; zasila licznik zakresów
 *    i znacznik świeżości paska przypadku).
 * 2. `useExecutionRunsStore` — `setActiveStudyCaseId(caseId)` (reużycie:
 *    sam woła `loadRuns`; bez rejestru przebiegów `useWpiecieWynikow` nie ma
 *    skąd poznać rodzaju analizy aktywnego przebiegu → ekran wyników wracał
 *    do stanu zerowego po `page.reload()`).
 * 3. Migawka/rewizja modelu (pasek `mvd-status-model`, znacznik świeżości
 *    nagłówków): odtwarzanie REUŻYWA istniejące ścieżki orkiestratora
 *    (`useLegacyOrchestrator`: `refreshFromBackend` przy braku przebiegu w
 *    trasie, `restoreAnalysisRunSnapshot` przy `?run=`). Tu domykamy jedynie
 *    scenariusz reconnect: backend niedostępny przy montażu ⇒ migawki brak
 *    i orkiestrator nie ponawia (zapamiętany `snapshotError`) — po odzyskaniu
 *    połączenia odtwarzamy ją tą samą akcją store'u (`refreshFromBackend`,
 *    operacja domenowa `refresh_snapshot` — zero nowych endpointów).
 *
 * UCZCIWA walidacja (zero udawania danych):
 * - projekt 404 na serwerze ⇒ `setActiveProject(null)` (czyści też przypadek);
 * - przypadek 404 ⇒ `setActiveCase(null)`;
 * - błąd sieci / 5xx ⇒ stan NIE jest czyszczony (pasek stanu pokazuje
 *   „łączenie…"/błąd; ponowienie następuje po reconnect backendu).
 *
 * Idempotencja (HMR / remount): przed każdym ładowaniem porównujemy klucz
 * kontekstu ze store'em zależnym (`projectId` / `activeStudyCaseId`) — ten sam
 * wzorzec co `AnContextPanel` (`ui/shell/context-panels/AnContextPanel.tsx`);
 * dodatkowo równoległe wywołania dla tego samego kontekstu są zbijane do
 * jednego przebiegu (rejestr „w toku" na poziomie modułu).
 *
 * Warstwy: ZERO fizyki, zero mutacji modelu — wyłącznie odczyt API i akcje
 * istniejących store'ów aplikacyjnych (CLAUDE.md).
 */
import { useEffect, useRef } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import { useStudyCasesStore } from '../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import type { BackendStatus } from './shellStatus';

type WynikWalidacji = 'istnieje' | 'brak' | 'blad-sieci';

/** GET zasobu wyłącznie w celu walidacji istnienia (404 ⇒ 'brak'). */
async function sprawdzIstnienie(url: string): Promise<WynikWalidacji> {
  try {
    const odpowiedz = await fetch(url);
    if (odpowiedz.status === 404) return 'brak';
    if (!odpowiedz.ok) return 'blad-sieci';
    return 'istnieje';
  } catch {
    return 'blad-sieci';
  }
}

/** Rejestr hydratacji w toku — zbija duble z HMR/remount do jednego przebiegu. */
let hydratacjaWToku: { klucz: string; obietnica: Promise<void> } | null = null;

async function wykonajHydratacje(wymus: boolean): Promise<void> {
  const projectId = useAppStateStore.getState().activeProjectId;
  if (!projectId) {
    // Brak projektu w persist ⇒ nic do odtworzenia (stan zerowy jest uczciwy).
    return;
  }

  const projekt = await sprawdzIstnienie(`/api/projects/${projectId}`);
  // Kontekst mógł się zmienić w trakcie walidacji — nie nadpisujemy nowszego stanu.
  if (useAppStateStore.getState().activeProjectId !== projectId) return;
  if (projekt === 'brak') {
    useAppStateStore.getState().setActiveProject(null);
    return;
  }
  if (projekt === 'blad-sieci') return;

  const przypadki = useStudyCasesStore.getState();
  if (wymus || przypadki.projectId !== projectId) {
    // setProjectId = loadCases + loadActiveCase (jedna istniejąca akcja).
    przypadki.setProjectId(projectId);
  }

  const caseId = useAppStateStore.getState().activeCaseId;
  if (!caseId) return;

  const przypadek = await sprawdzIstnienie(`/api/study-cases/${caseId}`);
  const stanPoWalidacji = useAppStateStore.getState();
  if (stanPoWalidacji.activeProjectId !== projectId || stanPoWalidacji.activeCaseId !== caseId) {
    return;
  }
  if (przypadek === 'brak') {
    useAppStateStore.getState().setActiveCase(null);
    return;
  }
  if (przypadek === 'blad-sieci') return;

  const przebiegi = useExecutionRunsStore.getState();
  if (wymus || przebiegi.activeStudyCaseId !== caseId) {
    przebiegi.setActiveStudyCaseId(caseId);
  }

  // Domknięcie reconnect (pkt 3 nagłówka): migawki nie ma i orkiestrator nie
  // ponowi (zapamiętany błąd) ⇒ odtwarzamy z serwera istniejącą akcją store'u.
  const migawka = useSnapshotStore.getState();
  if (!migawka.snapshot && !migawka.loading && migawka.error != null) {
    await migawka.refreshFromBackend(caseId);
  }
}

/**
 * Jednorazowa (per kontekst projekt+przypadek) hydratacja stanu zależnego.
 * Eksport dla testów jednostkowych; powłoka używa `useHydratacjaPowloki`.
 */
export function hydratujPowloke(opcje?: { wymus?: boolean }): Promise<void> {
  const stan = useAppStateStore.getState();
  const klucz = `${stan.activeProjectId ?? ''}|${stan.activeCaseId ?? ''}`;
  if (!opcje?.wymus && hydratacjaWToku?.klucz === klucz) {
    return hydratacjaWToku.obietnica;
  }
  const obietnica = wykonajHydratacje(opcje?.wymus ?? false).finally(() => {
    if (hydratacjaWToku?.obietnica === obietnica) {
      hydratacjaWToku = null;
    }
  });
  hydratacjaWToku = { klucz, obietnica };
  return obietnica;
}

/**
 * Hook powłoki: hydratacja na montaż / zmianę kontekstu + ponowienie po
 * odzyskaniu połączenia z backendem (error → connected).
 */
export function useHydratacjaPowloki(backendStatus: BackendStatus): void {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  useEffect(() => {
    void hydratujPowloke();
  }, [activeProjectId, activeCaseId]);

  const poprzedniStatus = useRef(backendStatus);
  useEffect(() => {
    const poprzedni = poprzedniStatus.current;
    poprzedniStatus.current = backendStatus;
    if (poprzedni === 'error' && backendStatus === 'connected') {
      // Po niedostępności backendu stan zależny mógł nie zostać załadowany —
      // ponowienie wymuszone (guardy idempotencji pomijamy świadomie).
      void hydratujPowloke({ wymus: true });
    }
  }, [backendStatus]);
}
