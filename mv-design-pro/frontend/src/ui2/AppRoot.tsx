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
 * `ui2` pozostaje poza produkcyjnym wejściem aplikacji (przełączenie powłoki = E1.7).
 */
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from './shell/AppShell';
import { useBackendHealth } from './shell/backendHealth';
import { ContextTree, useCasesTree, useRunsTree, useTopologyTree } from './nav';
import { InspectorPanel } from './inspector';
import { useObiektInspektora, useRewizjaModelu } from './adapters/inspectorAdapter';
import { emituj, subskrybuj, startEventBusAdapters } from './events';
import { CommandPalette, zbudujIndeksWyszukiwania, type PozycjaWyszukiwania } from './search';
import { PulpitProjektu } from './spaces/projekt';
import { useShellStore } from './shell/useShellStore';
import type { SpaceId } from './shell/spaces';
import { useSnapshotStore } from '../ui/topology/snapshotStore';

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

  // Start adapterów magistrali (raz na życie powłoki) + globalna synchronizacja selekcji.
  useEffect(() => startEventBusAdapters(), []);
  useEffect(
    () => subskrybuj('selekcja', (z) => setZaznaczonyId(z.obiektId)),
    [],
  );

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
    <AppShell
      backendStatus={backendStatus}
      onReconnect={reconnect}
      modelRevision={rewizjaModelu > 0 ? rewizjaModelu : null}
      onOpenProject={() => setActiveSpace('projekt')}
      children={
        activeSpace === 'projekt' ? (
          <PulpitProjektu
            onNawiguj={setActiveSpace}
            onOtworzProjekt={() => undefined /* TODO-KARTA: nowy/otwórz projekt (E2.2) */}
            onZaznaczPrzypadek={(id) => emituj({ typ: 'selekcja', obiektId: id, zrodlo: 'pulpit-projektu' })}
            onOtworzPrzypadek={() => setActiveSpace('obliczenia')}
          />
        ) : undefined
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
  );
}
