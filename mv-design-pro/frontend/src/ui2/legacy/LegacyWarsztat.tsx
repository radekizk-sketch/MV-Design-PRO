/**
 * LegacyWarsztat (karta E1.7c) — środkowy panel nowej powłoki z zachowaniem
 * PEŁNEJ semantyki starego wejścia (PRZENIESIONY przełącznik tras App.tsx
 * + reguła rozwinięcia powierzchni AppShellV12):
 *
 * 1. Powierzchnia rozwinięta (openMode 'expand_workspace') wypełnia warsztat
 *    (WorkspaceSurfaceRouter region="main" — jak stary `mainSurfaceExpanded`).
 * 2. Trasy dedykowane renderują dawne strony: #dashboard (pulpit projektów
 *    legacy), #sld-view (podgląd), #kreator-stacji-v2, #fault-scenarios,
 *    #enm-inspector (za flagą), trasa nieznana → strona błędu trasy.
 * 3. W pozostałych przypadkach zawartość wyznacza aktywna przestrzeń
 *    (LegacySurface / pulpit projektu nowej powłoki).
 *
 * Ponadto: baner problemów semantycznych nad warsztatem (dawny AppShellV12).
 */

import type { ReactNode } from 'react';

import { EnmInspectorPage } from '../../ui/enm-inspector';
import { FaultScenariosPanel, FaultScenarioModal } from '../../ui/fault-scenarios';
import { StationWizardSurface } from '../../ui/network-build/station-wizard-v2/StationWizardSurface';
import { featureFlags } from '../../ui/config/featureFlags';
import { SldWorkspaceContainer } from '../../ui/sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from '../../ui/workspace/surfaces/ProjectDashboardSurface';
import { WorkspaceSurfaceRouter } from '../../ui/workspace';
import { SemanticIssuesBanner } from '../../ui/tech-card/SemanticIssuesBanner';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../ui/selection/store';
import { ROUTES, getRouteByHash, isAnalysisRouteAlias } from '../../ui/navigation';
import type { SpaceId } from '../shell/spaces';
import { LegacySurface } from './LegacySurface';
import { LegacyPasekNarzedzi } from './LegacyPasekNarzedzi';

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
}

function TrasaLubPrzestrzen({ route, space, pulpit, gotowosc, model }: LegacyWarsztatProps) {
  // Trasy dedykowane starego wejścia (przeniesiony przełącznik App.tsx).
  if (route === '#enm-inspector' && featureFlags.ENM_INSPECTOR_VISIBLE) {
    return <EnmInspectorPage />;
  }
  if (route === '#kreator-stacji-v2') {
    return <StationWizardSurface />;
  }
  if (route === '#fault-scenarios') {
    return (
      <div className="flex flex-col h-full">
        <FaultScenariosPanel studyCaseId={null} />
        <FaultScenarioModal />
      </div>
    );
  }
  // Pulpit projektów legacy (lista projektów + nowy projekt) — trasa #dashboard;
  // przestrzeń „Projekt" nowej powłoki kieruje tu akcją „Otwórz projekt".
  if (route === '#dashboard') {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <ProjectDashboardSurface />
      </div>
    );
  }
  if (route === '#sld-view') {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <SldWorkspaceContainer readOnly />
      </div>
    );
  }
  // Jawna trasa schematu — kanwa SLD niezależnie od przestrzeni (parytet
  // starego wejścia: '#sld' zawsze renderował środowisko schematu).
  if (route === ROUTES.SLD.hash) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <SldWorkspaceContainer />
      </div>
    );
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
  return <LegacySurface space={space} />;
}

export function LegacyWarsztat(props: LegacyWarsztatProps) {
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const semanticIssues = useSnapshotStore((state) => state.lastSemanticIssues);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const mainSurfaceExpanded = activeSurface?.openMode === 'expand_workspace';

  return (
    <div className="mvd-legacy-host">
      {/* Pasek przepływu pracy + modale funkcji globalnych (dawny AppShellV12). */}
      <LegacyPasekNarzedzi />
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
