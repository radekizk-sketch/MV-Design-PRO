import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { useActiveCaseId, useActiveProjectId } from '../../app-state';
import { useAppStateStore } from '../../app-state/store';
import { ProcessPanel } from '../../network-build/ProcessPanel';
import { useNetworkBuildDerived, useNetworkBuildStore } from '../../network-build/networkBuildStore';
import type { EntityTypeCode, WorkspaceSurfaceCode } from '../../workspace/types';

interface NavigatorRowProps {
  label: string;
  detail: string;
  tone?: 'ok' | 'warn' | 'muted';
  active?: boolean;
  onClick?: () => void;
}

type CalculationGoal = 'ShortCircuitCase' | 'PowerFlowCase';

interface StartProjectForm {
  projectName: string;
  voltageKv: '15' | '20' | '30';
  networkTopology: 'radial' | 'ring_nop' | 'mixed';
  neutralGrounding: 'resistor' | 'isolated' | 'petersen';
  calculationStandard: 'iec60909_2016';
  calculationGoal: CalculationGoal;
  projectState: string;
}

const DEFAULT_START_PROJECT: StartProjectForm = {
  projectName: 'Sieć SN - projekt roboczy',
  voltageKv: '15',
  networkTopology: 'ring_nop',
  neutralGrounding: 'resistor',
  calculationStandard: 'iec60909_2016',
  calculationGoal: 'ShortCircuitCase',
  projectState: 'Stan projektowany 2026',
};

function formatCount(count: number, singular: string, plural: string, empty: string) {
  if (count <= 0) return empty;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
}

function slugifyProjectName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'projekt-sn';
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
        active ? 'border-[#00e5ff] bg-[#073044]' : 'border-transparent',
        hasAction ? 'hover:border-[#1a87b9] hover:bg-[#0a1724]' : 'cursor-default',
      )}
    >
      <span
        className={clsx(
          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
          tone === 'ok' && 'bg-[#00c986]',
          tone === 'warn' && 'bg-[#ff9900]',
          tone === 'muted' && 'bg-[#4d6a84]',
        )}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block truncate font-mono-eng text-[13px] font-bold leading-4 text-scada-text">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-mono-eng text-[10px] leading-3 text-[#6f8aa7]">
          {detail}
        </span>
      </span>
    </button>
  );
}

function LockedStep({ index, label, active = false }: { index: number; label: string; active?: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 border-l-2 px-3 py-2 font-mono-eng',
        active ? 'border-[#00e5ff] bg-[#073044]' : 'border-transparent opacity-55',
      )}
    >
      <span
        className={clsx(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
          active ? 'bg-[#00e5ff] text-[#001018]' : 'border border-[#38546d] text-[#7f9bb8]',
        )}
      >
        {index}
      </span>
      <span className="text-[12px] font-bold text-scada-text">{label}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="font-mono-eng text-[10px] font-bold uppercase tracking-[0.14em] text-[#6d8fb3]">
      {children}
    </label>
  );
}

function SelectField<T extends string>({
  value,
  onChange,
  children,
}: {
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="mt-1 h-9 w-full rounded-[4px] border border-[#18334e] bg-[#08111d] px-2 font-mono-eng text-[12px] font-bold text-scada-text outline-none focus:border-[#00e5ff]"
    >
      {children}
    </select>
  );
}

function StartProjectPanel() {
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const [form, setForm] = useState<StartProjectForm>(() => ({
    ...DEFAULT_START_PROJECT,
    projectName: activeProjectName ?? DEFAULT_START_PROJECT.projectName,
  }));
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const setActiveVariant = useAppStateStore((state) => state.setActiveVariant);

  const update = <K extends keyof StartProjectForm>(key: K, value: StartProjectForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreateProject = () => {
    const projectName = (activeProjectName ?? form.projectName.trim()) || DEFAULT_START_PROJECT.projectName;
    const projectSlug = slugifyProjectName(projectName);
    const projectId = activeProjectId ?? `project:${projectSlug}:${form.voltageKv}kv`;
    const caseId = crypto.randomUUID();
    const variantId = `variant:${projectSlug}:${slugifyProjectName(form.projectState)}`;
    const caseName = form.calculationGoal === 'ShortCircuitCase'
      ? 'Zwarcie maksymalne IEC 60909'
      : 'Rozpływ mocy - obciążenie szczytowe';

    if (!activeProjectId) {
      setActiveProject(projectId, projectName);
    }
    setActiveCase(caseId, caseName, form.calculationGoal, 'NONE');
    setActiveVariant(variantId, form.projectState);
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="mo-project-start">
      <div className="border-b border-[#10263d] px-3 py-3">
        <div className="font-mono-eng text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d8fb3]">
          Krok 1 z 6
        </div>
        <h2 className="mt-2 font-mono-eng text-[15px] font-bold leading-5 text-scada-text">
          {activeProjectId ? 'Utwórz zakres obliczeń' : 'Utwórz projekt SN'}
        </h2>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <FieldLabel>Nazwa projektu</FieldLabel>
          <input
            data-testid="mo-project-name"
            value={form.projectName}
            onChange={(event) => update('projectName', event.target.value)}
            className="mt-1 h-9 w-full rounded-[4px] border border-[#18334e] bg-[#08111d] px-2 font-mono-eng text-[12px] font-bold text-scada-text outline-none focus:border-[#00e5ff]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Napięcie SN</FieldLabel>
            <SelectField value={form.voltageKv} onChange={(value) => update('voltageKv', value)}>
              <option value="15">15 kV</option>
              <option value="20">20 kV</option>
              <option value="30">30 kV</option>
            </SelectField>
          </div>
          <div>
            <FieldLabel>Norma</FieldLabel>
            <SelectField
              value={form.calculationStandard}
              onChange={(value) => update('calculationStandard', value)}
            >
              <option value="iec60909_2016">IEC 60909:2016</option>
            </SelectField>
          </div>
        </div>

        <div>
          <FieldLabel>Układ sieci</FieldLabel>
          <SelectField value={form.networkTopology} onChange={(value) => update('networkTopology', value)}>
            <option value="ring_nop">Pierścień SN z punktem normalnie otwartym</option>
            <option value="radial">Sieć promieniowa SN</option>
            <option value="mixed">Układ mieszany SN</option>
          </SelectField>
        </div>

        <div>
          <FieldLabel>Uziemienie punktu neutralnego</FieldLabel>
          <SelectField value={form.neutralGrounding} onChange={(value) => update('neutralGrounding', value)}>
            <option value="resistor">Rezystor uziemiający</option>
            <option value="isolated">Punkt neutralny izolowany</option>
            <option value="petersen">Cewka Petersena</option>
          </SelectField>
        </div>

        <div>
          <FieldLabel>Cel obliczeń</FieldLabel>
          <SelectField value={form.calculationGoal} onChange={(value) => update('calculationGoal', value)}>
            <option value="ShortCircuitCase">Zwarcie maksymalne IEC 60909</option>
            <option value="PowerFlowCase">Rozpływ mocy - obciążenie szczytowe</option>
          </SelectField>
        </div>

        <div>
          <FieldLabel>Stan projektu</FieldLabel>
          <SelectField value={form.projectState} onChange={(value) => update('projectState', value)}>
            <option value="Stan projektowany 2026">Stan projektowany 2026</option>
            <option value="Stan istniejący">Stan istniejący</option>
            <option value="Rozbudowa OZE">Rozbudowa OZE</option>
          </SelectField>
        </div>

        <button
          type="button"
          data-testid="mo-create-project"
          onClick={handleCreateProject}
          className="mt-2 flex h-10 w-full items-center justify-center rounded-[4px] bg-[#00ffaa] px-3 font-mono-eng text-[12px] font-bold text-[#00110b] transition-colors hover:bg-[#31ffba]"
        >
          {activeProjectId ? 'Utwórz zakres i przejdź do GPZ' : 'Utwórz projekt i przejdź do GPZ'}
        </button>
      </div>

      <div className="border-t border-[#10263d] py-1">
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
  const snSectionCount = derived.trunkSegmentCount + derived.branchCount;
  const snSectionDetail = snSectionCount > 0
    ? [
        derived.trunkSegmentCount > 0
          ? formatCount(derived.trunkSegmentCount, 'odcinek magistrali', 'odcinków magistrali', '')
          : null,
        derived.branchCount > 0
          ? formatCount(derived.branchCount, 'odgałęzienie', 'odgałęzień', '')
          : null,
      ].filter(Boolean).join(' / ')
    : 'brak odcinków SN';

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
      detail: formatCount(derived.trunkCount, 'ciąg', 'ciągów', 'brak ciągu głównego'),
      tone: derived.trunkCount > 0 ? 'ok' : 'warn',
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
      detail: formatCount(derived.stationCount, 'stacja', 'stacji', 'brak stacji'),
      tone: derived.stationCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-13', 'Stacje SN/nN', 'station', 'topologia'),
    },
    {
      label: 'Transformatory',
      detail: formatCount(derived.transformerCount, 'transformator', 'transformatorów', 'brak transformatorów'),
      tone: derived.transformerCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-18', 'Transformatory SN/nN', 'station', 'transformator'),
    },
    {
      label: 'Źródła OZE',
      detail: derived.generatorCount > 0
        ? formatCount(derived.generatorCount, 'źródło', 'źródeł', 'brak źródeł')
        : 'PV / FW / BESS po zdefiniowaniu stacji',
      tone: derived.generatorCount > 0 ? 'ok' : 'muted',
      onClick: () => openNavigatorSurface('E-21', 'Konfiguracja źródeł OZE', 'pv_source', 'identyfikacja'),
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
  ]);

  return (
    <div data-testid="mo-context-panel" className="flex h-full flex-col overflow-hidden bg-[#050810]">
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-[#10263d] px-3">
        <div className="font-mono-eng text-[12px] font-bold text-scada-text">Nawigator modelu</div>
        <span className="font-mono-eng text-[13px] text-[#6f8aa7]" aria-hidden="true">←</span>
      </div>

      <div className="border-b border-[#10263d] px-3 py-2">
        <div className="font-mono-eng text-[9px] font-semibold uppercase tracking-[0.2em] text-[#6d8fb3]">
          Model sieci
        </div>
        <div
          className={clsx(
            'mt-1 inline-flex max-w-full rounded-[3px] px-2 py-0.5 font-mono-eng text-[10px] font-bold',
            derived.isReady ? 'bg-[#06231a] text-[#00ffaa]' : 'bg-[#2b1600] text-[#ff9900]',
          )}
          data-testid="mo-build-phase"
          title={phaseLabel}
        >
          <span className="truncate">{phaseLabel}</span>
        </div>
      </div>

      {!isProjectReady ? (
        <StartProjectPanel />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto" data-testid="mo-navigator-tree">
          <div className="py-1">
            {navigatorRows.map((row, index) => (
              <NavigatorRow key={`${row.label}:${row.detail}:${index}`} {...row} />
            ))}
          </div>

          <div className="mt-2 border-t border-[#10263d] py-1">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="font-mono-eng text-[10px] font-bold uppercase tracking-[0.16em] text-[#6d8fb3]">
                Blokady gotowości
              </div>
              <div
                className={clsx(
                  'rounded px-2 py-0.5 font-mono-eng text-[10px] font-bold',
                  blockerCount > 0 ? 'bg-[#2b1600] text-[#ff9900]' : 'bg-[#06231a] text-[#00ffaa]',
                )}
              >
                {blockerCount > 0 ? blockerCount : 'OK'}
              </div>
            </div>
          </div>

          <div className="mt-2 border-t border-[#10263d] py-1">
            <div className="px-3 py-2 font-mono-eng text-[10px] font-bold uppercase tracking-[0.16em] text-[#6d8fb3]">
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
              detail="węzły, gałęzie, bilans, profil"
              tone="ok"
              onClick={() => openNavigatorSurface('E-35', 'Rozpływ mocy', 'analysis_run', 'power-flow')}
            />
          </div>

          <div className="mt-2 border-t border-[#10263d]">
            <div className="px-3 pb-1 pt-3 font-mono-eng text-[10px] font-bold uppercase tracking-[0.16em] text-[#6d8fb3]">
              Sekwencja budowy
            </div>
            <ProcessPanel className="bg-[#050810]" />
          </div>
        </div>
      )}
    </div>
  );
}
