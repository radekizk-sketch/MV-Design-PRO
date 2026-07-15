/**
 * LegacySurface (karta E1.7b) — most tymczasowy: montuje ISTNIEJĄCE powierzchnie
 * dziedzinowe starego UI w środkowym panelu nowej powłoki, per przestrzeń,
 * wg rejestru `legacyRegistry` (jawna lista wygaszania, mapowanie karty §3a).
 *
 * Zasady:
 * - komponenty z `ui/**` montowane BEZ modyfikacji; kontekst dostarczają
 *   te same store'y co w starym wejściu (zero shadow-state),
 * - nawigacja hash pozostaje jedną prawdą tras legacy: przestrzenie oparte
 *   o WorkspaceSurfaceRouter mostkują się przez navigateTo* (orkiestrator
 *   E1.7a otwiera właściwą powierzchnię — bez dublowania logiki tras),
 * - testid `workspace-surface-main` (kontrakt e2e) nosi opakowanie montażu;
 *   dla powierzchni trasowych dostarcza go sam WorkspaceSurfaceRouter.
 */

import { useEffect, type ReactNode } from 'react';
import './legacy.css';

import { SldWorkspaceContainer } from '../../ui/sld/v2/canvas/SldWorkspaceContainer';
import { WorkspaceSurfaceRouter } from '../../ui/workspace';
import { CaseConfigPage } from '../../ui/study-cases/CaseConfigPage';
import { RunHistoryPanel } from '../../ui/study-cases/RunHistoryPanel';
import { EngineeringReadinessPanel } from '../../ui/engineering-readiness';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../ui/app-state';
import { useExecutionRunsStore } from '../../ui/study-cases/runStore';
import {
  navigateToAnalysis,
  navigateToCaseConfig,
  navigateToNetworkBuild,
  navigateToReport,
} from '../../ui/navigation';
import type { ReadinessIssue, ReadinessSeverity, FixAction } from '../../ui/types';
import { useShellStore } from '../shell/useShellStore';
import { emituj } from '../events';
import type { SpaceId } from '../shell/spaces';
import { REJESTR_LEGACY } from './legacyRegistry';

/** Źródło selekcji emitowanej z mostu gotowości (magistrala E15.1). */
const ZRODLO_GOTOWOSC = 'gotowosc-legacy';

/** Opakowanie montażu legacy — nośnik testid kontraktu e2e w środkowym panelu. */
function OprawaWarsztatu({ children }: { children: ReactNode }) {
  return (
    <div data-testid="workspace-surface-main" className="mvd-legacy-host">
      {children}
    </div>
  );
}

/** Schemat/model: kanwa SLD (jak domyślna trasa starego wejścia). */
function LegacySld() {
  useEffect(() => {
    // Most tras: utrzymuje '#sld' jako prawdę nawigacji (parametry kontekstu zachowane).
    navigateToNetworkBuild();
  }, []);
  return <SldWorkspaceContainer />;
}

type ElementGotowosci = {
  code: string;
  message_pl: string;
  element_ref: string | null;
  severity: string;
};

function naProblemGotowosci(wpis: ElementGotowosci, severity: ReadinessSeverity): ReadinessIssue {
  return {
    code: wpis.code,
    severity,
    element_ref: wpis.element_ref,
    element_refs: wpis.element_ref ? [wpis.element_ref] : [],
    message_pl: wpis.message_pl,
    wizard_step_hint: null,
    suggested_fix: null,
    fix_action: null,
  };
}

/**
 * Gotowość: panel gotowości inżynierskiej zasilany z tej samej gotowości,
 * którą raportuje backend przy operacjach domenowych (useSnapshotStore.readiness).
 * Adapter minimalny (karta §3a: gotowość rozproszona w starym UI).
 */
function LegacyGotowosc() {
  const readiness = useSnapshotStore((s) => s.readiness);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  if (!readiness) {
    return (
      <p className="mvd-inspector-empty">
        Brak danych gotowości. Wybierz projekt i zakres obliczeń, a kontrola techniczna układu
        pojawi się tutaj po pierwszej operacji na modelu.
      </p>
    );
  }

  const problemy: ReadinessIssue[] = [
    ...(readiness.blockers ?? []).map((wpis) => naProblemGotowosci(wpis, 'BLOCKER')),
    ...(readiness.warnings ?? []).map((wpis) => naProblemGotowosci(wpis, 'IMPORTANT')),
  ];
  const bySeverity: Record<ReadinessSeverity, number> = {
    BLOCKER: readiness.blockers?.length ?? 0,
    IMPORTANT: readiness.warnings?.length ?? 0,
    INFO: 0,
  };
  const status = bySeverity.BLOCKER > 0 ? 'FAIL' : bySeverity.IMPORTANT > 0 ? 'WARN' : 'OK';

  const nawigujDoElementu = (elementRef: string) => {
    emituj({ typ: 'selekcja', obiektId: elementRef, zrodlo: ZRODLO_GOTOWOSC });
  };

  // Akcje naprawcze wykonuje się na kanwie schematu (formularze operacji
  // domenowych żyją w SldWorkspaceContainer) — most przenosi tam użytkownika.
  const wykonajNaprawe = (fixAction: FixAction) => {
    if (fixAction.element_ref) {
      emituj({ typ: 'selekcja', obiektId: fixAction.element_ref, zrodlo: ZRODLO_GOTOWOSC });
    }
    setActiveSpace('schemat');
  };

  return (
    <EngineeringReadinessPanel
      issues={problemy}
      status={status}
      ready={readiness.ready}
      bySeverity={bySeverity}
      onNavigate={nawigujDoElementu}
      onFix={wykonajNaprawe}
    />
  );
}

/** Obliczenia: konfiguracja zakresu obliczeń + historia przebiegów (study-cases). */
function LegacyObliczenia() {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const setActiveRun = useAppStateStore((s) => s.setActiveRun);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  useEffect(() => {
    // Most tras: '#case-config' (parametry kontekstu zachowane przez navigateToHash).
    navigateToCaseConfig({ caseId: useAppStateStore.getState().activeCaseId });
  }, []);

  return (
    <div className="mvd-legacy-obliczenia">
      <CaseConfigPage />
      <RunHistoryPanel
        selectedRunId={activeRunId}
        onSelectRun={(runId) => {
          setActiveRun(runId);
          setActiveSpace('wyniki');
        }}
      />
    </div>
  );
}

/**
 * Wyniki/dokumentacja: powierzchnie trasowe starego UI (E-24 analizy / E-25 raport).
 * Most ustawia hash (jedna prawda nawigacji), orkiestrator E1.7a otwiera
 * powierzchnię, a WorkspaceSurfaceRouter renderuje ją w warsztacie
 * (testid `workspace-surface-main` pochodzi z routera).
 */
function LegacyPowierzchniaTrasowa({ cel }: { cel: 'analiza' | 'raport' }) {
  useEffect(() => {
    const runId =
      useAppStateStore.getState().activeRunId
      ?? useExecutionRunsStore.getState().activeRunId;
    if (cel === 'analiza') {
      navigateToAnalysis({ runId });
    } else {
      navigateToReport({ runId });
    }
  }, [cel]);

  return (
    <div className="mvd-legacy-host">
      <WorkspaceSurfaceRouter region="main" />
    </div>
  );
}

export interface LegacySurfaceProps {
  space: SpaceId;
}

export function LegacySurface({ space }: LegacySurfaceProps) {
  const wpis = REJESTR_LEGACY[space];
  if (wpis.zrodlo === 'nowa-powloka') {
    // Zawartość dostarcza nowa powłoka (AppRoot) — most nie montuje niczego.
    return null;
  }

  switch (space) {
    case 'model':
    case 'schemat':
      return (
        <OprawaWarsztatu>
          <LegacySld />
        </OprawaWarsztatu>
      );
    case 'gotowosc':
      return (
        <OprawaWarsztatu>
          <LegacyGotowosc />
        </OprawaWarsztatu>
      );
    case 'obliczenia':
      return (
        <OprawaWarsztatu>
          <LegacyObliczenia />
        </OprawaWarsztatu>
      );
    case 'wyniki':
      return <LegacyPowierzchniaTrasowa cel="analiza" />;
    case 'dokumentacja':
      return <LegacyPowierzchniaTrasowa cel="raport" />;
    default:
      return null;
  }
}
