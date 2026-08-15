import { useMemo } from 'react';
import { clsx } from 'clsx';

import { useActiveCaseId, useActiveProjectId } from '../../app-state';
import { ProcessPanel } from '../../network-build/ProcessPanel';
import { przejdzDoPrzestrzeni } from '../../../ui2/shell/przejsciaPrzestrzeni';
import { useNetworkBuildDerived, useNetworkBuildStore } from '../../network-build/networkBuildStore';
import type { EntityTypeCode, WorkspaceSurfaceCode } from '../../workspace/types';

interface NavigatorRowProps {
  label: string;
  detail: string;
  tone?: 'ok' | 'warn' | 'muted';
  active?: boolean;
  onClick?: () => void;
}

function formatCount(count: number, singular: string, plural: string, empty: string) {
  if (count <= 0) return empty;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
}

function NavigatorRow({ label, detail, tone = 'muted', active = false, onClick }: NavigatorRowProps) {
  const hasAction = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasAction}
      className={clsx(
        'group flex min-h-[44px] w-full items-start gap-3 border-l-2 px-3 py-2 text-left transition-colors',
        active ? 'border-sygnal-info bg-scada-panel-raised' : 'border-transparent',
        hasAction ? 'hover:border-sygnal-info hover:bg-scada-bg' : 'cursor-default',
      )}
    >
      <span
        className={clsx(
          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
          tone === 'ok' && 'bg-sygnal-ok',
          tone === 'warn' && 'bg-sygnal-uwaga',
          tone === 'muted' && 'bg-scada-border-strong',
        )}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block truncate font-mono-eng text-[13px] font-bold leading-4 text-scada-text">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-mono-eng text-[10px] leading-3 text-scada-muted">
          {detail}
        </span>
      </span>
    </button>
  );
}

/** Krok sekwencji budowy — informacja o kolejności etapów (bez akcji). */
function LockedStep({ index, label, active = false }: { index: number; label: string; active?: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 border-l-2 px-3 py-2 font-mono-eng',
        active ? 'border-sygnal-info bg-scada-panel-raised' : 'border-transparent opacity-55',
      )}
    >
      <span
        className={clsx(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
          active ? 'bg-sygnal-info text-scada-bg' : 'border border-scada-border-strong text-scada-muted',
        )}
      >
        {index}
      </span>
      <span className="text-[12px] font-bold text-scada-text">{label}</span>
    </div>
  );
}

/**
 * Stan zerowy warsztatu budowy: bez projektu i zakresu obliczeń nie ma czego
 * budować.
 *
 * ZERO FABRYKACJI (naprawa u źródła, karta NAWIGACJA-JEDEN-KANON). Dotąd stał
 * tu formularz „Utwórz projekt SN" z napięciem, układem sieci, uziemieniem
 * punktu neutralnego, normą i celem obliczeń — i ŻADNE z tych pól nie jechało
 * do backendu. Przycisk wywoływał wyłącznie `setActiveProject` /
 * `setActiveCase` / `setActiveVariant` na stanie klienta, wymyślając
 * identyfikator projektu z nazwy (`project:<slug>:15kv`) i losując UUID
 * zakresu obliczeń przez `crypto.randomUUID()`. Powstawał projekt-widmo:
 * aplikacja wskazywała zakres, którego na serwerze NIE MA, więc każda operacja
 * domenowa i każdy bieg trafiały w pustkę. Realna ścieżka (z zapisem przez API)
 * żyje w przestrzeni „Projekt" — i tam prowadzi ten stan zerowy.
 */
function StanZerowyProjektu({ maProjekt }: { maProjekt: boolean }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="mo-project-start">
      <div className="border-b border-scada-border px-3 py-3">
        <h2 className="font-mono-eng text-[15px] font-bold leading-5 text-scada-text">
          {maProjekt ? 'Wybierz zakres obliczeń' : 'Zacznij od projektu'}
        </h2>
        <p className="mt-2 text-[11px] leading-4 text-scada-muted">
          {maProjekt
            ? 'Budowa układu wymaga aktywnego zakresu obliczeń. Zakresy zakłada i przełącza przestrzeń „Obliczenia".'
            : 'Budowa układu wymaga otwartego projektu i zakresu obliczeń. Projekt zakładasz w przestrzeni „Projekt" — dane trafiają na serwer.'}
        </p>
        <button
          type="button"
          data-testid="mo-create-project"
          onClick={() => przejdzDoPrzestrzeni(maProjekt ? 'obliczenia' : 'projekt')}
          className="mt-3 flex h-10 w-full items-center justify-center rounded-[4px] bg-sygnal-ok px-3 font-mono-eng text-[12px] font-bold text-scada-bg transition-colors hover:bg-sygnal-ok"
        >
          {maProjekt ? 'Przejdź do zakresów obliczeń' : 'Nowy / otwórz projekt'}
        </button>
      </div>

      <div className="border-t border-scada-border py-1">
        <LockedStep index={1} label="Projekt SN" active />
        <LockedStep index={2} label="Źródło zasilania GPZ" />
        <LockedStep index={3} label="Pole SN i magistrala" />
        <LockedStep index={4} label="Stacje SN/nN i transformatory" />
        <LockedStep index={5} label="PV, FW i BESS" />
        <LockedStep index={6} label="Obliczenia i raport" />
      </div>
    </div>
  );
}

export function MoContextPanel() {
  const activeProjectId = useActiveProjectId();
  const activeCaseId = useActiveCaseId();
  const derived = useNetworkBuildDerived();
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const isProjectReady = Boolean(activeProjectId && activeCaseId);
  const phaseLabel = isProjectReady
    ? derived.buildPhaseLabel ?? 'Faza budowy'
    : 'Wymagany projekt SN';
  const blockerCount = derived.blockersByCategory?.total ?? 0;
  const controlLabel = derived.isReady
    ? 'do analiz'
    : blockerCount > 0
      ? String(blockerCount)
      : 'w konfiguracji';
  const snSectionCount = derived.snSectionCount ?? (derived.trunkSegmentCount + derived.branchCount);
  const trunkDetail = derived.trunkCount > 0
    ? formatCount(derived.trunkCount, 'ciąg', 'ciągów', 'Wyprowadź ciąg główny')
    : snSectionCount > 0
      ? `${snSectionCount} odcinków SN w układzie`
      : 'Wyprowadź ciąg główny';
  const snSectionDetail = snSectionCount > 0
    ? [
        derived.trunkSegmentCount > 0
          ? formatCount(derived.trunkSegmentCount, 'odcinek magistrali', 'odcinków magistrali', '')
          : null,
        derived.branchCount > 0
          ? formatCount(derived.branchCount, 'odgałęzienie', 'odgałęzień', '')
          : null,
      ].filter(Boolean).join(' / ')
    : 'Zacznij od wyprowadzenia magistrali SN';

  const openNavigatorSurface = (
    screenCode: WorkspaceSurfaceCode,
    titlePl: string,
    entityType: EntityTypeCode | null,
    tabId?: string | null,
  ) => {
    const entityRef = entityType ? `${entityType}:navigator` : null;
    openRouteSurface(screenCode, {
      entityRef,
      entityType,
      subjectKind: entityType ? 'entity' : 'helper_context',
      subjectRef: entityRef ?? 'model_navigator',
      tabId,
      titlePl,
      route: screenCode === 'E-35' || screenCode === 'E-37' || screenCode === 'E-28' ? 'analysis' : 'sld',
      openMode: screenCode === 'E-35' || screenCode === 'E-37' || screenCode === 'E-28'
        ? 'expand_workspace'
        : 'replace_right_panel',
      supportsMiniSld: screenCode !== 'E-04',
      payload: { source: 'model_navigator' },
    });
  };

  const navigatorRows = useMemo(() => [
    {
      label: 'Źródło zasilania',
      detail: derived.sourceCount > 0 ? 'GPZ zdefiniowany' : 'Najpierw dodaj GPZ',
      tone: derived.sourceCount > 0 ? 'ok' : 'warn',
      active: derived.sourceCount === 0,
      onClick: () => openNavigatorSurface('E-10', 'Konfiguracja GPZ', 'gpz', 'uproszczony'),
    },
    {
      label: 'Magistrale SN',
      detail: trunkDetail,
      tone: derived.trunkCount > 0 || snSectionCount > 0 ? 'ok' : 'warn',
      onClick: () => openNavigatorSurface('E-12', 'Odcinki magistrali SN', 'segment', 'kabel-sn'),
    },
    {
      label: 'Odcinki i odgałęzienia',
      detail: snSectionDetail,
      tone: snSectionCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-12', 'Odcinki i odgałęzienia SN', 'segment', 'kabel-sn'),
    },
    {
      label: 'Stacje SN/nN',
      detail: formatCount(derived.stationCount, 'stacja', 'stacji', 'Wstaw pierwszą stację'),
      tone: derived.stationCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-13', 'Stacje SN/nN', 'station', 'topologia'),
    },
    {
      label: 'Transformatory',
      detail: formatCount(derived.transformerCount, 'transformator', 'transformatorów', 'Dobierz transformatory z katalogu'),
      tone: derived.transformerCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-18', 'Transformatory SN/nN', 'station', 'transformator'),
    },
    {
      label: 'Układy PV/BESS/FW',
      detail: derived.generatorCount > 0
        ? formatCount(derived.generatorCount, 'układ', 'układów', 'Dodaj układ PV/BESS/FW')
        : 'PV / FW / BESS po zdefiniowaniu stacji',
      tone: derived.generatorCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-21', 'Konfiguracja układów PV/BESS/FW', 'pv_source', 'identyfikacja'),
    },
  ] satisfies Array<NavigatorRowProps>, [
    derived.branchCount,
    derived.generatorCount,
    derived.sourceCount,
    derived.stationCount,
    derived.transformerCount,
    derived.trunkCount,
    derived.trunkSegmentCount,
    openRouteSurface,
    snSectionCount,
    snSectionDetail,
    trunkDetail,
  ]);

  return (
    <div data-testid="mo-context-panel" className="flex h-full flex-col overflow-hidden bg-scada-bg">
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-scada-border px-3">
        <div className="font-mono-eng text-[12px] font-bold text-scada-text">Nawigator układu sieci</div>
        <span className="font-mono-eng text-[13px] text-scada-muted" aria-hidden="true">←</span>
      </div>

      <div className="border-b border-scada-border px-3 py-2">
        <div className="font-mono-eng text-[9px] font-semibold uppercase tracking-[0.2em] text-scada-muted">
          Budowa sieci
        </div>
        <div
          className={clsx(
            'mt-1 inline-flex max-w-full rounded-[3px] px-2 py-0.5 font-mono-eng text-[10px] font-bold',
            derived.isReady ? 'bg-sygnal-ok-tlo text-sygnal-ok-tusz' : 'bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz',
          )}
          data-testid="mo-build-phase"
          title={phaseLabel}
        >
          <span className="truncate">{phaseLabel}</span>
        </div>
      </div>

      {!isProjectReady ? (
        <StanZerowyProjektu maProjekt={Boolean(activeProjectId)} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto" data-testid="mo-navigator-tree">
          <div className="py-1">
            {navigatorRows.map((row, index) => (
              <NavigatorRow key={`${row.label}:${row.detail}:${index}`} {...row} />
            ))}
          </div>

          <div className="mt-2 border-t border-scada-border py-1">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="font-mono-eng text-[10px] font-bold uppercase tracking-[0.16em] text-scada-muted">
                Kontrola konfiguracji
              </div>
              <div
                className={clsx(
                  'rounded px-2 py-0.5 font-mono-eng text-[10px] font-bold',
                  derived.isReady ? 'bg-sygnal-ok-tlo text-sygnal-ok-tusz' : 'bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz',
                )}
              >
                {controlLabel}
              </div>
            </div>
          </div>

          <div className="mt-2 border-t border-scada-border py-1">
            <div className="px-3 py-2 font-mono-eng text-[10px] font-bold uppercase tracking-[0.16em] text-scada-muted">
              Narzędzia zaawansowane
            </div>
            <NavigatorRow
              label="Analityka i wykresy"
              detail="profile, napięcia, scenariusze"
              tone="ok"
              onClick={() => openNavigatorSurface('E-35', 'Wyniki i analizy', 'analysis_run', 'results')}
            />
            <NavigatorRow
              label="Generator raportów"
              detail="PDF, DOCX, załączniki"
              tone="ok"
              onClick={() => openNavigatorSurface('E-37', 'Raport techniczny', 'report', null)}
            />
            <NavigatorRow
              label="Koordynacja zabezpieczeń"
              detail="nastawy, TCC, selektywność"
              tone="ok"
              onClick={() => openNavigatorSurface('E-28', 'Koordynacja zabezpieczeń', 'analysis_run', null)}
            />
            <NavigatorRow
              label="Wyniki rozpływu mocy"
              detail="szyny, odcinki, bilans, profil"
              tone="ok"
              onClick={() => openNavigatorSurface('E-35', 'Rozpływ mocy', 'analysis_run', 'power-flow')}
            />
          </div>

          <div className="mt-2 border-t border-scada-border">
            <div className="px-3 pb-1 pt-3 font-mono-eng text-[10px] font-bold uppercase tracking-[0.16em] text-scada-muted">
              Sekwencja budowy
            </div>
            <ProcessPanel className="bg-scada-bg" />
          </div>
        </div>
      )}
    </div>
  );
}
