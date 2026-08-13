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
import { useEtykietaOstatniegoPrzebiegu } from './shell/shellStatus';
import { useHydratacjaPowloki } from './shell/useHydratacjaPowloki';
import { useInspektorZaZawartoscia } from './shell/useInspektorZaZawartoscia';
import { useSynchronizacjaDerZModelu } from '../ui/network-build/station-der';
import {
  ContextTree,
  NAV_STRINGS,
  useCasesTree,
  useRunsTree,
  useTopologyTree,
  useZasilanieDrzewaTopologii,
} from './nav';
import type { AkcjaPusty } from './nav';
import { InspectorPanel } from './inspector';
import { useObiektInspektora, useRewizjaModelu } from './adapters/inspectorAdapter';
import { emituj, subskrybuj, startEventBusAdapters } from './events';
import {
  CommandPalette,
  zbudujIndeksWyszukiwania,
  type AkcjeIndeksu,
  type PozycjaWyszukiwania,
} from './search';
import {
  PulpitProjektu,
  OtworzProjektKontener,
  EkranArchiwum,
  EkranImportuArkusza,
} from './spaces/projekt';
import { PanelGotowosci } from './spaces/gotowosc';
import { ModelWarsztat } from './spaces/model';
import { MenedzerPrzypadkow, PanelScenariuszy } from './spaces/obliczenia';
import { PrzebiegiPanel } from './spaces/obliczenia/przebiegi';
import { SeriePanel } from './spaces/obliczenia/serie';
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
import { useNetworkBuildStore } from '../ui/network-build/networkBuildStore';
import { useAppStateStore } from '../ui/app-state';
import { AreaContextPanel } from '../ui/shell/context-panels';
import { obszarDlaTrasy } from './legacy/mostObszarow';

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
  // KD-1 (parytet L-5): tryb ZMIANY projektu — ekran „Nowy / otwórz projekt"
  // pokazany mimo otwartego projektu (wejście „Otwórz projekt" z powłoki).
  const [zmianaProjektu, setZmianaProjektu] = useState(false);
  const activeSpace = useShellStore((s) => s.activeSpace);
  const advancementMode = useShellStore((s) => s.advancementMode);
  const panelSchematu = useShellStore((s) => s.panelSchematu);
  // Okno „Archiwum projektu (ZIP)" przestrzeni „Projekt": otwiera je kafel
  // pulpitu ALBO karta huba dokumentacji (jednorazowe żądanie powłoki).
  const zadanieArchiwum = useShellStore((s) => s.zadanieArchiwumProjektu);
  const zadanieArkusza = useShellStore((s) => s.zadanieImportuArkusza);
  const setZadanieArchiwum = useShellStore((s) => s.setZadanieArchiwumProjektu);
  const setZadanieArkusza = useShellStore((s) => s.setZadanieImportuArkusza);
  const rewizjaModelu = useRewizjaModelu();
  const obiekt = useObiektInspektora(zaznaczonyId);
  const { status: backendStatus, reconnect } = useBackendHealth();
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  // K6 / H-6 R3: etykieta paska stanu z REJESTRU przebiegów (ostatni DONE) —
  // dotąd pole nie miało dostawcy i zawsze pokazywało „—".
  const etykietaPrzebiegu = useEtykietaOstatniegoPrzebiegu();

  // K2 (defekt H-0): hydratacja stanu zależnego z serwera po zimnym starcie
  // (zakresy obliczeń, rejestr przebiegów, migawka przy reconnect) — bez tego
  // restart przeglądarki cofał przestrzenie do stanu zerowego mimo danych na
  // serwerze.
  useHydratacjaPowloki(backendStatus);
  // KD-1: drzewo topologii dostaje dane z serwera (dotąd `loadSummary` nie miał
  // żadnego wołającego, więc drzewo przestrzeni „Model" było zawsze puste).
  useZasilanieDrzewaTopologii();
  // Wytwórcy DER z MODELU zasilają warsztat czytany przez ekrany strumienia OZE
  // (macierz NC RfG, pulpit OZE, krzywe P–Q, walidacja falownika). Bez tego
  // źródło zapisane kreatorem OZE nie istniało dla żadnego z nich.
  useSynchronizacjaDerZModelu();
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

  // KD-1 (L-5): tryb zmiany projektu żyje tylko wewnątrz przestrzeni „Projekt" —
  // wyjście do innej przestrzeni przywraca pulpit otwartego projektu. Tak samo
  // okno archiwum: żądanie gaśnie z wyjściem z przestrzeni (żadnych zaległych
  // żądań, wzorzec `zadanieNowyPrzypadek`).
  useEffect(() => {
    if (activeSpace !== 'projekt') {
      setZmianaProjektu(false);
      if (useShellStore.getState().zadanieArchiwumProjektu) {
        useShellStore.getState().setZadanieArchiwumProjektu(false);
      }
      if (useShellStore.getState().zadanieImportuArkusza) {
        useShellStore.getState().setZadanieImportuArkusza(false);
      }
    }
  }, [activeSpace]);

  const zaznacz = (id: string) => {
    // Okno emituje selekcję z prawdziwym źródłem; stan lokalny ustawi subskrypcja.
    emituj({ typ: 'selekcja', obiektId: id, zrodlo: ZRODLO_DRZEWO_KONTEKSTOWE });
  };

  // Wyszukiwarka (E1.5 → integracja E1.4+): indeks z przestrzeni/ekranów/poleceń
  // + obiekty ze snapshotu. D4: KAŻDA pozycja niesie realną akcję powłoki —
  // indeks nie tworzy pozycji, dla której nie ma dostawcy.
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setAdvancementMode = useShellStore((s) => s.setAdvancementMode);
  const akcjeWyszukiwarki = useMemo(
    (): AkcjeIndeksu => ({
      przejdzDoPrzestrzeni,
      wybierzObiekt: (id) => emituj({ typ: 'selekcja', obiektId: id, zrodlo: 'wyszukiwarka' }),
      // Zdolność przeniesiona ze skasowanej palety `ui/network-build`:
      // otwarcie okna E-XX tym samym routerem powierzchni co dotąd.
      otworzEkran: (kod, tytulPl) =>
        openRouteSurface(kod, { titlePl: tytulPl, subjectKind: 'helper_context' }),
      przelicz: () => void handleCalculate(),
      otworzProjekt: () => otworzPulpitProjektow(),
      przywrocUklad: () => useShellStore.getState().resetLayout(useShellStore.getState().activeSpace),
      polaczPonownie: () => reconnect(),
    }),
    [handleCalculate, openRouteSurface, reconnect],
  );
  const pozycjeWyszukiwania = useMemo(
    () =>
      zbudujIndeksWyszukiwania({
        akcje: akcjeWyszukiwarki,
        obiekty: () =>
          (snapshot?.buses ?? []).map((szyna) => ({
            id: szyna.ref_id || szyna.id,
            nazwa: szyna.name || szyna.ref_id,
          })),
      }),
    [akcjeWyszukiwarki, snapshot],
  );
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
    // KD-1 (parytet L-5): „Otwórz projekt" prowadzi do ekranu ui2 „Nowy /
    // otwórz projekt" TAKŻE przy otwartym projekcie (dotąd skakało na trasę
    // mostu `#dashboard`, bo ekran ui2 renderował się wyłącznie bez projektu).
    // Zmiana projektu przechodzi przez potwierdzenie w samym ekranie.
    setActiveSpace('projekt');
    setZmianaProjektu(true);
  };
  // Most tras (E1.7c) wyniesiony do `shell/przejsciaPrzestrzeni.ts` (K4-E2):
  // ta sama prawda nawigacji dla jawnego wyboru przestrzeni w AppShell i dla
  // przejść „następnego kroku" (np. Schemat → Gotowość). `przejdzDoPrzestrzeni`
  // = setActiveSpace + most (identyczna para wywołań jak dotychczas).
  const wybierzPrzestrzen = przejdzDoPrzestrzeni;
  // Lądowisko K3 dla biegu: aktywacja przebiegu + jawne przejście do „Wyników".
  // JEDNA funkcja dla obu paneli historii (przebiegi i serie) — parytet mostu.
  const pokazWynikiBiegu = (runId: string) => {
    useAppStateStore.getState().setActiveRun(runId);
    wybierzPrzestrzen('wyniki');
  };
  // D4: JEDNA ścieżka wykonania — pozycja sama niesie swoją akcję. Dawny
  // rozdzielacz po przedrostku identyfikatora obsługiwał cztery przypadki, a
  // wszystko poza nimi wpadało w `pozycja.akcja()`, czyli w pustą funkcję
  // indeksu (dziewięć martwych kliknięć). Teraz pozycja bez dostawcy nie
  // powstaje, więc rozdzielacz jest zbędny.
  const wykonajPozycje = (pozycja: PozycjaWyszukiwania) => {
    pozycja.akcja();
  };

  return (
    <div data-testid="canonical-layout" data-ready={aplikacjaGotowa} className="mvd-app-obszar">
      {aplikacjaGotowa && <div data-testid="app-ready" style={{ display: 'none' }} />}
      <LegacyChrome />
      <AppShell
      backendStatus={backendStatus}
      onReconnect={reconnect}
      modelRevision={rewizjaModelu > 0 ? rewizjaModelu : null}
      lastRunLabel={etykietaPrzebiegu}
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
              {/* KD-4 (L-7): scenariusze zwarciowe mają wejście w powłoce —
                  do tej karty zdolność żyła wyłącznie na trasie mostu, do
                  której nie prowadziło ŻADNE wejście produkcyjne. */}
              <PanelScenariuszy />
              {/* Karta BATCH-ROUTER: seria przebiegów nad scenariuszami —
                  wejście w wyniki pojedynczego biegu tym samym lądowiskiem K3. */}
              <SeriePanel
                trybZaawansowania={advancementMode}
                onPokazWyniki={pokazWynikiBiegu}
                onPrzejdzDoScenariuszy={() => {
                  document
                    .querySelector('[data-testid="mvd-scenariusze"]')
                    ?.scrollIntoView?.({ block: 'start' });
                }}
              />
              <PrzebiegiPanel
                trybZaawansowania={advancementMode}
                onPokazWyniki={pokazWynikiBiegu}
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
            // Okno archiwum ma pierwszeństwo także BEZ otwartego projektu:
            // eksport pokazuje wtedy uczciwy stan zerowy, a odtworzenie z paczki
            // jest właśnie sposobem na zdobycie projektu.
            zadanieArchiwum ? (
              <EkranArchiwum onZamknij={() => setZadanieArchiwum(false)} />
            ) : zadanieArkusza ? (
              // Import z arkusza (E1) ma pierwszeństwo także BEZ otwartego projektu:
              // wczytanie arkusza od operatora jest właśnie sposobem na zdobycie projektu.
              <EkranImportuArkusza onZamknij={() => setZadanieArkusza(false)} />
            ) : // E1a (K4): sekwencja pierwszego użycia — bez aktywnego projektu
            // przestrzeń „Projekt" prowadzi ekranem „Nowy / otwórz projekt"
            // (W-102, realne akcje API w kontenerze); z projektem — pulpit.
            activeProjectId == null || zmianaProjektu ? (
              <OtworzProjektKontener
                onWrocDoPulpitu={
                  activeProjectId == null ? undefined : () => setZmianaProjektu(false)
                }
                onProjektOtwarty={() => setZmianaProjektu(false)}
              />
            ) : (
              <PulpitProjektu
                onNawiguj={wybierzPrzestrzen}
                onOtworzProjekt={otworzPulpitProjektow}
                onZaznaczPrzypadek={(id) => emituj({ typ: 'selekcja', obiektId: id, zrodlo: 'pulpit-projektu' })}
                onOtworzPrzypadek={() => wybierzPrzestrzen('obliczenia')}
                onOtworzArchiwum={() => setZadanieArchiwum(true)}
                onOtworzImportArkusza={() => setZadanieArkusza(true)}
              />
            )
          }
        />
      }
      contextPanel={
        activeSpace === 'schemat' ? (
          // Most E1.7c: panel kontekstu lewego doku. D1 rozdzielił dwie role,
          // które dotąd pełnił jeden stan `activeArea`:
          //  - ADRES wyznacza obszar (projekcja trasy, `mostObszarow`),
          //  - PRZEŁĄCZNIK powłoki wybiera panel schematu: tor pracy na
          //    schemacie albo warsztat budowy modelu (przycisk „Konfiguracja"
          //    w stopce panelu; dotąd gasł przy każdej zmianie adresu, bo
          //    zapisywał się w tym samym polu co obszar trasy).
          <AreaContextPanel
            obszar={panelSchematu === 'model' ? 'MODEL_SIECI' : obszarDlaTrasy(route)}
          />
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
