/**
 * LegacyWarsztat (karta E1.7c) — środkowy panel nowej powłoki z zachowaniem
 * PEŁNEJ semantyki starego wejścia (PRZENIESIONY przełącznik tras App.tsx
 * + reguła rozwinięcia powierzchni AppShellV12):
 *
 * 1. Powierzchnia rozwinięta (openMode 'expand_workspace') wypełnia warsztat
 *    (WorkspaceSurfaceRouter region="main" — jak stary `mainSurfaceExpanded`).
 * 2. Trasy dedykowane renderują dawne strony: #dashboard (pulpit projektów
 *    legacy), #sld-view (podgląd), #fault-scenarios,
 *    #enm-inspector (za flagą), trasa nieznana → strona błędu trasy.
 * 3. W pozostałych przypadkach zawartość wyznacza aktywna przestrzeń
 *    (LegacySurface / pulpit projektu nowej powłoki).
 *
 * Ponadto: baner problemów semantycznych nad warsztatem (dawny AppShellV12).
 *
 * Karta K1 POWLOKA: dawne pasy nad kanwą (pasek metryk, „Tryb pracy",
 * „Następny krok") są skasowane — polecenia przeszły do paska narzędzi powłoki
 * (`ui2/shell/PasekNarzedzi`), a przełącznik trybu pracy kanwy pokazuje się tam
 * pod tym samym warunkiem co dawniej (`useWidokKanwySchematu`).
 */

import type { ReactNode } from 'react';

import { EnmInspectorPage } from '../../ui/enm-inspector';
import { FaultScenariosPanel, FaultScenarioModal } from '../../ui/fault-scenarios';
import { featureFlags } from '../../ui/config/featureFlags';
import { SldCanvasV3Workspace } from '../../ui/sld/v3/canvas/SldCanvasV3Workspace';
import { ProjectDashboardSurface } from '../../ui/workspace/surfaces/ProjectDashboardSurface';
import { WorkspaceSurfaceRouter } from '../../ui/workspace';
import { SemanticIssuesBanner } from '../../ui/tech-card/SemanticIssuesBanner';
import { useAppStateStore } from '../../ui/app-state';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../ui/selection/store';
import { ROUTES, getRouteByHash, isAnalysisRouteAlias } from '../../ui/navigation';
import type { SpaceId } from '../shell/spaces';
import { LegacySurface } from './LegacySurface';

/** Strona nieznanej trasy — PRZENIESIONA z App.tsx (kasacja ramy E1.7c). */
function UnknownRoutePage({ route }: { route: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="max-w-lg rounded-lg border border-amber-300 bg-amber-50 px-6 py-5 text-slate-900 shadow-sm">
        <h1 className="text-lg font-semibold">Nieznana trasa interfejsu</h1>
        <p className="mt-2 text-sm leading-6">
          Aktywna trasa <code>{route || '(pusta)'}</code> nie jest zmapowana do kanonicznego
          powierzchni. Przejdź do jednej z aktywnych sekcji albo popraw routing.
        </p>
      </div>
    </div>
  );
}

/**
 * Trasa `#fault-scenarios` (most legacy) — K8, naprawa u źródła (Zero-Debt).
 *
 * Defekt zastany: panel dostawał `studyCaseId={null}` NA SZTYWNO, więc trasa
 * ZAWSZE pokazywała stan „Wybierz wariant pracy…" — scenariuszy zwarciowych nie
 * dało się obejrzeć ani dodać, niezależnie od aktywnego przypadku. Panel sam
 * ustawia `studyCaseId` w store (efekt na propie), więc jedyną poprawną wartością
 * jest AKTYWNY przypadek obliczeniowy powłoki; brak przypadku nadal daje uczciwy
 * stan zerowy panelu (bez zgadywania identyfikatora).
 */
function ScenariuszeZwarcioweTrasa() {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  return (
    <div className="flex flex-col h-full">
      <FaultScenariosPanel studyCaseId={activeCaseId} />
      <FaultScenarioModal />
    </div>
  );
}

export interface LegacyWarsztatProps {
  /** Aktywna trasa hash (z useLegacyOrchestrator). */
  route: string;
  /** Aktywna przestrzeń powłoki. */
  space: SpaceId;
  /** Zawartość przestrzeni „Projekt" (nowa powłoka). */
  pulpit: ReactNode;
  /** Zawartość przestrzeni „Gotowość" (nowa powłoka — E6.1, wygaszenie mostu w U2). */
  gotowosc: ReactNode;
  /** Zawartość przestrzeni „Model sieci" (warsztat z zakładkami — scalenie U2 #2). */
  model: ReactNode;
  /** Zawartość przestrzeni „Obliczenia" (nowe okno E7.1 + most historii — scalenie U2 #3). */
  obliczenia: ReactNode;
  /** Zawartość przestrzeni „Wyniki" (warsztat z zakładkami: rozpływ E8.1 + most — scalenie U3 #1). */
  wyniki: ReactNode;
  /** Zawartość przestrzeni „Dokumentacja" (hub F-E8.1 + dostawcy raportu/dowodu). */
  dokumentacja: ReactNode;
}

function TrasaLubPrzestrzen({ route, space, pulpit, gotowosc, model, obliczenia, wyniki, dokumentacja }: LegacyWarsztatProps) {
  // Trasy dedykowane starego wejścia (przeniesiony przełącznik App.tsx).
  if (route === ROUTES.ENM_INSPECTOR.hash && featureFlags.ENM_INSPECTOR_VISIBLE) {
    return <EnmInspectorPage />;
  }
  // KD-1: trasa `#kreator-stacji-v2` USUNIĘTA razem z podzespołem kreatora
  // stacji v2 (werdykt MARTWY, inwentarz parytetu mostów L-6) — realnym
  // kreatorem stacji jest `ui2/kreatory/stacja/KreatorStacjiSnNn` wpięty przez
  // `operationFormRegistry` (operacje `insert_station_on_segment_sn` /
  // `append_station_on_endpoint`). Nieznany hash → zachowanie domyślne.
  if (route === ROUTES.FAULT_SCENARIOS.hash) {
    return <ScenariuszeZwarcioweTrasa />;
  }
  // Pulpit projektów legacy (lista projektów + nowy projekt) — trasa #dashboard;
  // przestrzeń „Projekt" nowej powłoki kieruje tu akcją „Otwórz projekt".
  if (route === ROUTES.DASHBOARD.hash) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <ProjectDashboardSurface />
      </div>
    );
  }
  if (route === ROUTES.SLD_VIEW.hash) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <SldCanvasV3Workspace readOnly />
      </div>
    );
  }
  // Jawna trasa schematu — kanwa SLD niezależnie od przestrzeni (parytet
  // starego wejścia: '#sld' zawsze renderował środowisko schematu). TEN SAM
  // element co przestrzeń „Schemat" (`LegacySurface`): wybór przestrzeni
  // ustawia trasę `#sld` (`mostTrasyPrzestrzeni` → `navigateToNetworkBuild`)
  // dopiero po pierwszym renderze, więc dwa różne komponenty na tym samym
  // miejscu montowały warsztat schematu DWA razy — drugi montaż gubił stan
  // warsztatu (pomiar e2e K2: wskazanie z „Gotowości" wykadrowało stację
  // w pierwszym montażu, a po zmianie trasy widok wracał do sieci bez ścieżki
  // kontekstu). Tryb pracy kanwy (edycja/podgląd) czyta `LegacySld`.
  if (route === ROUTES.SLD.hash) {
    return <LegacySurface space="schemat" />;
  }
  if (getRouteByHash(route) === null && !isAnalysisRouteAlias(route)) {
    return <UnknownRoutePage route={route} />;
  }

  // Zawartość przestrzeni (nowa: projekt, gotowość; most legacy: pozostałe).
  if (space === 'projekt') {
    return <div data-testid="workspace-surface-main">{pulpit}</div>;
  }
  if (space === 'gotowosc') {
    return <div data-testid="workspace-surface-main">{gotowosc}</div>;
  }
  if (space === 'model') {
    return <div data-testid="workspace-surface-main">{model}</div>;
  }
  if (space === 'obliczenia') {
    return <div data-testid="workspace-surface-main">{obliczenia}</div>;
  }
  if (space === 'wyniki') {
    // Testid kontraktu e2e nosi opakowanie mostu wewnątrz warsztatu
    // (WorkspaceSurfaceRouter w zakładce „Pozostałe analizy").
    return <>{wyniki}</>;
  }
  if (space === 'dokumentacja') {
    // F-E8.1: przestrzeń „Dokumentacja" ma własny hub prowadzący (MostDokumentacji);
    // powierzchnie raportu/dowodu (E-37/E-36) renderują się WEWNĄTRZ mostu z
    // paskiem powrotu, więc — jak „wyniki" — jest wyłączona z mainSurfaceExpanded.
    return <>{dokumentacja}</>;
  }
  return <LegacySurface space={space} />;
}

/**
 * Scalenie U3 #1: w przestrzeni „Wyniki" (i „Dokumentacja") powierzchnia
 * rozwinięta renderuje się WEWNĄTRZ warsztatu przestrzeni (slot), więc nie
 * wypełnia warsztatu. JEDNO źródło tego warunku dla warsztatu i dla paska
 * narzędzi powłoki.
 */
function useRozwinietaPowierzchnia(space: SpaceId): boolean {
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  return activeSurface?.openMode === 'expand_workspace' && space !== 'wyniki' && space !== 'dokumentacja';
}

/**
 * Czy warsztat pokazuje kanwę schematu (przestrzeń „Schemat", trasa '' lub
 * '#sld', bez rozwiniętej powierzchni). Pod tym warunkiem pasek narzędzi
 * powłoki pokazuje przełącznik trybu pracy kanwy (Edycja/Podgląd); trasy
 * dedykowane (scenariusze, pulpit itd.) mają własny tor pracy.
 */
export function useWidokKanwySchematu(route: string, space: SpaceId): boolean {
  const rozwinieta = useRozwinietaPowierzchnia(space);
  return space === 'schemat' && !rozwinieta && (route === '' || route === ROUTES.SLD.hash);
}

export function LegacyWarsztat(props: LegacyWarsztatProps) {
  const semanticIssues = useSnapshotStore((state) => state.lastSemanticIssues);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const mainSurfaceExpanded = useRozwinietaPowierzchnia(props.space);

  return (
    <div className="mvd-legacy-host">
      {/* Walidacja semantyczna — globalny baner nad warsztatem (dawny AppShellV12). */}
      {(semanticIssues?.length ?? 0) > 0 && (
        <SemanticIssuesBanner
          issues={semanticIssues}
          onSelectElement={(ref) => centerSldOnElement(ref)}
        />
      )}
      <div className="mvd-legacy-warsztat-tresc">
        {mainSurfaceExpanded ? <WorkspaceSurfaceRouter region="main" /> : <TrasaLubPrzestrzen {...props} />}
      </div>
    </div>
  );
}
