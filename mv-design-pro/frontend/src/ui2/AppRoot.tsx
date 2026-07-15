/**
 * AppRoot (karta E1.4) — kompozycja powłoki: AppShell + drzewa kontekstowe (E1.2)
 * + inspektor (E1.3) + magistrala zdarzeń (E15.1) + klient zdrowia backendu.
 *
 * Decyzje architektoniczne karty §2:
 * - selekcja: drzewo emituje zdarzenie `selekcja` z prawdziwym źródłem
 *   ('drzewo-kontekstowe'); adapter store'a selekcji pozostaje fallbackiem;
 * - tryby drzewa topologii „administracyjny"/„obwodowy": UKRYTE w U1 (brak źródła
 *   danych — zero martwego UI); dane drzewa: tryb „zasilania";
 * - hierarchia przebiegów: zakres = aktywny przypadek (agregacja wielu przypadków = E7.x).
 *
 * E1.7b (parytet kontraktu): AppRoot woła headless `useLegacyOrchestrator` (E1.7a),
 * montuje `LegacySurface` w przestrzeniach bez nowej zawartości i eksponuje
 * wymagane testidy kontraktu e2e (`canonical-layout`, `app-ready`,
 * `active-case-bar`, `main-content`, `workspace-surface-main`). Wejście
 * produkcyjne wybiera `ui2/entry` (domyślnie stara powłoka — szew parytetowy).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from './shell/AppShell';
import { useBackendHealth } from './shell/backendHealth';
import { ContextTree, useCasesTree, useRunsTree, useTopologyTree } from './nav';
import { InspectorPanel } from './inspector';
import { useObiektInspektora, useRewizjaModelu } from './adapters/inspectorAdapter';
import { emituj, subskrybuj, startEventBusAdapters } from './events';
import { CommandPalette, zbudujIndeksWyszukiwania, type PozycjaWyszukiwania } from './search';
import { PulpitProjektu } from './spaces/projekt';
import { LegacySurface } from './legacy/LegacySurface';
import { useLegacyOrchestrator } from './legacy/useLegacyOrchestrator';
import { useShellStore } from './shell/useShellStore';
import type { SpaceId } from './shell/spaces';
import { useSnapshotStore } from '../ui/topology/snapshotStore';
import { useAppStateStore } from '../ui/app-state';

/** Prawdziwe źródło selekcji emitowane przez drzewo powłoki (decyzja E1.4 §2.1). */
const ZRODLO_DRZEWO_KONTEKSTOWE = 'drzewo-kontekstowe';

function DrzewoPrzestrzeni({
  space,
  zaznaczonyId,
  onZaznacz,
}: {
  space: SpaceId;
  zaznaczonyId: string | null;
  onZaznacz: (id: string) => void;
}) {
  const topologia = useTopologyTree('zasilania');
  const przypadki = useCasesTree();
  const przebiegi = useRunsTree();

  const wezly =
    space === 'model' ? topologia : space === 'obliczenia' ? przypadki : space === 'wyniki' ? przebiegi : null;
  if (wezly == null) return null;

  return (
    <ContextTree
      wezly={wezly}
      zaznaczonyId={zaznaczonyId}
      onZaznacz={(id) => onZaznacz(id)}
      onOtworz={(id) => onZaznacz(id)}
      filtrProblemy={false}
    />
  );
}

export function AppRoot() {
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);
  const activeSpace = useShellStore((s) => s.activeSpace);
  const advancementMode = useShellStore((s) => s.advancementMode);
  const rewizjaModelu = useRewizjaModelu();
  const obiekt = useObiektInspektora(zaznaczonyId);
  const { status: backendStatus, reconnect } = useBackendHealth();
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);

  // E1.7a w nowej powłoce: ta sama orkiestracja (hydracja z URL, trasy legacy,
  // powierzchnie, obliczenia) działa w OBU wejściach — zero duplikacji logiki.
  const { handleCalculate } = useLegacyOrchestrator();

  // Kontrakt e2e: znacznik gotowości aplikacji (odpowiednik App.useAppReady).
  const [aplikacjaGotowa, setAplikacjaGotowa] = useState(false);
  useEffect(() => {
    const klatka = requestAnimationFrame(() => setAplikacjaGotowa(true));
    return () => cancelAnimationFrame(klatka);
  }, []);

  // Start adapterów magistrali (raz na życie powłoki) + globalna synchronizacja selekcji.
  useEffect(() => startEventBusAdapters(), []);
  useEffect(
    () => subskrybuj('selekcja', (z) => setZaznaczonyId(z.obiektId)),
    [],
  );

  // Parytet trasy domyślnej (E1.7b): aktywny projekt → przestrzeń „Schemat" (SLD),
  // jak domyślna trasa '' starego wejścia. Jednorazowo na życie powłoki.
  const domyslnaPrzestrzenUstawiona = useRef(false);
  const setActiveSpaceStore = useShellStore((s) => s.setActiveSpace);
  useEffect(() => {
    if (domyslnaPrzestrzenUstawiona.current || !activeProjectId) {
      return;
    }
    domyslnaPrzestrzenUstawiona.current = true;
    if (useShellStore.getState().activeSpace === 'projekt') {
      setActiveSpaceStore('schemat');
    }
  }, [activeProjectId, setActiveSpaceStore]);

  const zaznacz = (id: string) => {
    // Okno emituje selekcję z prawdziwym źródłem; stan lokalny ustawi subskrypcja.
    emituj({ typ: 'selekcja', obiektId: id, zrodlo: ZRODLO_DRZEWO_KONTEKSTOWE });
  };

  // Wyszukiwarka (E1.5 → integracja E1.4+): indeks z przestrzeni/poleceń + obiekty ze snapshotu.
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const pozycjeWyszukiwania = useMemo(
    () =>
      zbudujIndeksWyszukiwania({
        obiekty: () =>
          (snapshot?.buses ?? []).map((szyna) => ({
            id: szyna.ref_id || szyna.id,
            nazwa: szyna.name || szyna.ref_id,
          })),
      }),
    [snapshot],
  );
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setAdvancementMode = useShellStore((s) => s.setAdvancementMode);
  const wykonajPozycje = (pozycja: PozycjaWyszukiwania) => {
    if (pozycja.id.startsWith('przestrzen:')) {
      setActiveSpace(pozycja.id.slice('przestrzen:'.length) as SpaceId);
    } else if (pozycja.id.startsWith('obiekt:')) {
      emituj({ typ: 'selekcja', obiektId: pozycja.id.slice('obiekt:'.length), zrodlo: 'wyszukiwarka' });
    } else {
      pozycja.akcja(); // TODO-KARTA: realne akcje poleceń/przykładów/pomocy — kolejne karty U1/U2.
    }
  };

  return (
    <div data-testid="canonical-layout" data-ready={aplikacjaGotowa} className="mvd-app-obszar">
      {aplikacjaGotowa && <div data-testid="app-ready" style={{ display: 'none' }} />}
      <AppShell
      backendStatus={backendStatus}
      onReconnect={reconnect}
      modelRevision={rewizjaModelu > 0 ? rewizjaModelu : null}
      onOpenProject={() => setActiveSpace('projekt')}
      onCalculate={handleCalculate}
      children={
        activeSpace === 'projekt' ? (
          <div data-testid="workspace-surface-main">
            <PulpitProjektu
              onNawiguj={setActiveSpace}
              onOtworzProjekt={() => undefined /* TODO-KARTA: nowy/otwórz projekt (E2.2) */}
              onZaznaczPrzypadek={(id) => emituj({ typ: 'selekcja', obiektId: id, zrodlo: 'pulpit-projektu' })}
              onOtworzPrzypadek={() => setActiveSpace('obliczenia')}
            />
          </div>
        ) : (
          <LegacySurface space={activeSpace} />
        )
      }
      contextPanel={
        <DrzewoPrzestrzeni space={activeSpace} zaznaczonyId={zaznaczonyId} onZaznacz={zaznacz} />
      }
      renderSearchDialog={(otwarta, zamknij) => (
        <CommandPalette
          otwarta={otwarta}
          onZamknij={zamknij}
          pozycje={pozycjeWyszukiwania}
          trybAktualny={advancementMode}
          onWykonaj={(pozycja) => {
            wykonajPozycje(pozycja);
            zamknij();
          }}
          onPrzelaczTryb={setAdvancementMode}
        />
      )}
      inspector={
        <InspectorPanel
          obiekt={obiekt}
          rewizjaModelu={rewizjaModelu}
          trybZaawansowania={advancementMode}
          onOtworzDowod={() => undefined /* TODO-KARTA: przestrzeń Wyniki (E9) */}
          onNawiguj={(cel) => emituj({ typ: 'selekcja', obiektId: cel.id, zrodlo: 'inspektor' })}
          onPrzelicz={() => undefined /* TODO-KARTA: uruchomienie przebiegu (E7) */}
        />
      }
      />
    </div>
  );
}
