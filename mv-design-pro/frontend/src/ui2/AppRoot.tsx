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
 * E1.7b/c (przełączenie powłoki): AppRoot jest PRODUKCYJNYM wejściem aplikacji.
 * Woła headless `useLegacyOrchestrator` (E1.7a), renderuje `LegacyWarsztat`
 * (trasy legacy + przestrzenie) i `LegacyInspektor` (panel prawy z mostem do
 * powierzchni panelowych), montuje `LegacyChrome` (powiadomienia, pomoc,
 * skróty, nakładki) i eksponuje testidy kontraktu e2e (`canonical-layout`,
 * `app-ready`, `active-case-bar`, `main-content`, `workspace-surface-main`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from './shell/AppShell';
import { useBackendHealth } from './shell/backendHealth';
import { useHydratacjaPowloki } from './shell/useHydratacjaPowloki';
import { useInspektorZaZawartoscia } from './shell/useInspektorZaZawartoscia';
import { ContextTree, NAV_STRINGS, useCasesTree, useRunsTree, useTopologyTree } from './nav';
import type { AkcjaPusty } from './nav';
import { InspectorPanel } from './inspector';
import { useObiektInspektora, useRewizjaModelu } from './adapters/inspectorAdapter';
import { emituj, subskrybuj, startEventBusAdapters } from './events';
import { CommandPalette, zbudujIndeksWyszukiwania, type PozycjaWyszukiwania } from './search';
import { PulpitProjektu, OtworzProjektKontener } from './spaces/projekt';
import { PanelGotowosci } from './spaces/gotowosc';
import { ModelWarsztat } from './spaces/model';
import { MenedzerPrzypadkow } from './spaces/obliczenia';
import { PrzebiegiPanel } from './spaces/obliczenia/przebiegi';
import { WynikiWarsztat } from './spaces/wyniki';
import { MostDokumentacji } from './spaces/dokumentacja';
import { LegacySurface } from './legacy/LegacySurface';
import { LegacyWarsztat } from './legacy/LegacyWarsztat';
import { LegacyInspektor } from './legacy/LegacyInspektor';
import { LegacyChrome } from './legacy/LegacyChrome';
import { useLegacyOrchestrator } from './legacy/useLegacyOrchestrator';
import { POZYCJE_MENU_LEGACY, useLegacyMenuActions } from './legacy/useLegacyMenuActions';
import { useShellStore } from './shell/useShellStore';
import { mostTrasyPrzestrzeni, przejdzDoPrzestrzeni } from './shell/przejsciaPrzestrzeni';
import type { SpaceId } from './shell/spaces';
import { useSnapshotStore } from '../ui/topology/snapshotStore';
import { useAppStateStore } from '../ui/app-state';
import { AreaContextPanel } from '../ui/shell/context-panels';

/** Panel kontekstu obszaru legacy (most E1.7c) — area-driven jak w starej ramie. */
function PanelKontekstuObszaru() {
  const activeArea = useAppStateStore((s) => s.activeArea);
  return <AreaContextPanel areaCode={activeArea} />;
}

/** Prawdziwe źródło selekcji emitowane przez drzewo powłoki (decyzja E1.4 §2.1). */
const ZRODLO_DRZEWO_KONTEKSTOWE = 'drzewo-kontekstowe';

/**
 * Akcja pustego drzewa per przestrzeń (K6 / H-5): slot `akcjaPusty` istniał
 * w `ContextTree` od karty E1.2, ale NIKT go nie podawał — puste drzewo mówiło
 * tylko „Brak elementów". Każda akcja woła REALNY cel:
 * - „Model" (brak topologii)     → przestrzeń „Schemat" (kanwa budowy sieci),
 * - „Obliczenia" (brak przypadków) → dialog „Nowy przypadek" (żądanie powłoki
 *   konsumowane przez `MenedzerPrzypadkow`),
 * - „Wyniki" (brak przebiegów)   → przestrzeń „Obliczenia", gdzie żyje jawny
 *   przycisk „Uruchom obliczenie" (dźwignia 2 tej samej karty).
 */
function akcjaPustegoDrzewa(space: SpaceId): AkcjaPusty | undefined {
  if (space === 'model') {
    return {
      etykieta: NAV_STRINGS.pustyModelAkcja,
      onKlik: () => przejdzDoPrzestrzeni('schemat'),
    };
  }
  if (space === 'obliczenia') {
    return {
      etykieta: NAV_STRINGS.pustyObliczeniaAkcja,
      onKlik: () => useShellStore.getState().setZadanieNowyPrzypadek(true),
    };
  }
  if (space === 'wyniki') {
    return {
      etykieta: NAV_STRINGS.pustyWynikiAkcja,
      onKlik: () => przejdzDoPrzestrzeni('obliczenia'),
    };
  }
  return undefined;
}

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
      akcjaPusty={akcjaPustegoDrzewa(space)}
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

  // K2 (defekt H-0): hydratacja stanu zależnego z serwera po zimnym starcie
  // (zakresy obliczeń, rejestr przebiegów, migawka przy reconnect) — bez tego
  // restart przeglądarki cofał przestrzenie do stanu zerowego mimo danych na
  // serwerze.
  useHydratacjaPowloki(backendStatus);
  // K11-A (SLD-first): inspektor podąża za zawartością — pusty nie zabiera
  // przestrzeni roboczej; otwiera go selekcja albo powierzchnia panelowa.
  useInspektorZaZawartoscia();

  // E1.7a w nowej powłoce: ta sama orkiestracja (hydracja z URL, trasy legacy,
  // powierzchnie, obliczenia) działa w OBU wejściach — zero duplikacji logiki.
  const { route, handleCalculate } = useLegacyOrchestrator();

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

  // Parytet trasy domyślnej (E1.7b): aktywny projekt PRZY STARCIE powłoki →
  // przestrzeń „Schemat" (SLD), jak domyślna trasa '' starego wejścia.
  // Decyzja zapada RAZ, na montaż (K4/E1a): projekt utworzony/otwarty później
  // z ekranu „Nowy / otwórz projekt" ma wylądować na pulpicie projektu
  // (KOLEJNOSC_KROKOW_E1_E8 §P1 „dokąd dalej: pulpit"), nie na kanwie.
  const domyslnaPrzestrzenUstawiona = useRef(false);
  const setActiveSpaceStore = useShellStore((s) => s.setActiveSpace);
  useEffect(() => {
    if (domyslnaPrzestrzenUstawiona.current) {
      return;
    }
    domyslnaPrzestrzenUstawiona.current = true;
    if (activeProjectId && useShellStore.getState().activeSpace === 'projekt') {
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
  // Akcje menu legacy (E1.7c) — osiągalne przez wyszukiwarkę poleceń.
  const wykonajAkcjeMenu = useLegacyMenuActions(handleCalculate);
  const pozycjeMenuLegacy = useMemo(
    (): PozycjaWyszukiwania[] =>
      POZYCJE_MENU_LEGACY.map((wpis) => ({
        id: `menu-legacy:${wpis.akcjaId}`,
        etykietaPL: wpis.etykietaPL,
        grupa: 'polecenia',
        akcja: () => wykonajAkcjeMenu(wpis.akcjaId),
      })),
    [wykonajAkcjeMenu],
  );
  const otworzPulpitProjektow = () => {
    // Pulpit projektów (lista + nowy projekt) — trasa legacy #dashboard (most E1.7c).
    setActiveSpace('projekt');
    window.location.hash = '#dashboard';
  };
  // Most tras (E1.7c) wyniesiony do `shell/przejsciaPrzestrzeni.ts` (K4-E2):
  // ta sama prawda nawigacji dla jawnego wyboru przestrzeni w AppShell i dla
  // przejść „następnego kroku" (np. Schemat → Gotowość). `przejdzDoPrzestrzeni`
  // = setActiveSpace + most (identyczna para wywołań jak dotychczas).
  const wybierzPrzestrzen = przejdzDoPrzestrzeni;
  const wykonajPozycje = (pozycja: PozycjaWyszukiwania) => {
    if (pozycja.id.startsWith('przestrzen:')) {
      wybierzPrzestrzen(pozycja.id.slice('przestrzen:'.length) as SpaceId);
    } else if (pozycja.id.startsWith('obiekt:')) {
      emituj({ typ: 'selekcja', obiektId: pozycja.id.slice('obiekt:'.length), zrodlo: 'wyszukiwarka' });
    } else if (pozycja.id === 'polecenie:przelicz') {
      void handleCalculate();
    } else if (pozycja.id === 'polecenie:otworz-projekt') {
      otworzPulpitProjektow();
    } else {
      pozycja.akcja(); // Pozycje menu legacy mają realne akcje; reszta — kolejne karty U1/U2.
    }
  };

  return (
    <div data-testid="canonical-layout" data-ready={aplikacjaGotowa} className="mvd-app-obszar">
      {aplikacjaGotowa && <div data-testid="app-ready" style={{ display: 'none' }} />}
      <LegacyChrome />
      <AppShell
      backendStatus={backendStatus}
      onReconnect={reconnect}
      modelRevision={rewizjaModelu > 0 ? rewizjaModelu : null}
      onOpenProject={otworzPulpitProjektow}
      onOpenVariants={() => wykonajAkcjeMenu('variants')}
      onActiveSpaceChange={mostTrasyPrzestrzeni}
      onCalculate={handleCalculate}
      children={
        <LegacyWarsztat
          route={route}
          space={activeSpace}
          model={<ModelWarsztat />}
          obliczenia={
            <div className="mvd-obliczenia-warsztat">
              <MenedzerPrzypadkow />
              <PrzebiegiPanel
                trybZaawansowania={advancementMode}
                onPokazWyniki={(runId) => {
                  // Parytet mostu: aktywacja przebiegu + przejście do Wyników.
                  useAppStateStore.getState().setActiveRun(runId);
                  wybierzPrzestrzen('wyniki');
                }}
              />
            </div>
          }
          gotowosc={
            <PanelGotowosci
              trybZaawansowania={advancementMode}
              onSelekcja={(elementRef) =>
                emituj({ typ: 'selekcja', obiektId: elementRef, zrodlo: 'panel-gotowosci' })
              }
              onAkcjaNaprawcza={(problem) => {
                // Formularze operacji domenowych żyją na kanwie schematu —
                // selekcja elementu + przejście do przestrzeni „Schemat" (jak most E1.7c).
                if (problem.elementRef) {
                  emituj({ typ: 'selekcja', obiektId: problem.elementRef, zrodlo: 'panel-gotowosci' });
                }
                wybierzPrzestrzen('schemat');
              }}
            />
          }
          wyniki={
            <WynikiWarsztat
              trybZaawansowania={advancementMode}
              pozostale={<LegacySurface space="wyniki" />}
              onOtworzDokumentacje={() => wybierzPrzestrzen('dokumentacja')}
            />
          }
          dokumentacja={<MostDokumentacji />}
          pulpit={
            // E1a (K4): sekwencja pierwszego użycia — bez aktywnego projektu
            // przestrzeń „Projekt" prowadzi ekranem „Nowy / otwórz projekt"
            // (W-102, realne akcje API w kontenerze); z projektem — pulpit.
            activeProjectId == null ? (
              <OtworzProjektKontener />
            ) : (
              <PulpitProjektu
                onNawiguj={wybierzPrzestrzen}
                onOtworzProjekt={otworzPulpitProjektow}
                onZaznaczPrzypadek={(id) => emituj({ typ: 'selekcja', obiektId: id, zrodlo: 'pulpit-projektu' })}
                onOtworzPrzypadek={() => wybierzPrzestrzen('obliczenia')}
              />
            )
          }
        />
      }
      contextPanel={
        activeSpace === 'schemat' ? (
          // Most E1.7c: panel kontekstu OBSZARU (schemat/proces budowy) —
          // przeniesiona funkcja lewego panelu starej ramy; sterowany
          // activeArea (przełącznik „Konfiguracja" działa jak w starej ramie).
          <PanelKontekstuObszaru />
        ) : (
          <DrzewoPrzestrzeni space={activeSpace} zaznaczonyId={zaznaczonyId} onZaznacz={zaznacz} />
        )
      }
      renderSearchDialog={(otwarta, zamknij) => (
        <CommandPalette
          otwarta={otwarta}
          onZamknij={zamknij}
          pozycje={[...pozycjeWyszukiwania, ...pozycjeMenuLegacy]}
          trybAktualny={advancementMode}
          onWykonaj={(pozycja) => {
            wykonajPozycje(pozycja);
            zamknij();
          }}
          onPrzelaczTryb={setAdvancementMode}
        />
      )}
      inspector={
        <LegacyInspektor
          fallback={
            <InspectorPanel
              obiekt={obiekt}
              rewizjaModelu={rewizjaModelu}
              trybZaawansowania={advancementMode}
              onOtworzDowod={() => undefined /* TODO-KARTA: przestrzeń Wyniki (E9) */}
              onNawiguj={(cel) => emituj({ typ: 'selekcja', obiektId: cel.id, zrodlo: 'inspektor' })}
              onPrzelicz={() => void handleCalculate()}
            />
          }
        />
      }
      />
    </div>
  );
}
