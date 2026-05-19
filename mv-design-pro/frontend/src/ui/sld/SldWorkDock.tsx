import { useState, type ReactNode } from 'react';

interface ContextItem {
  label: string;
  value: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
}

interface NextStepCard {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}

interface ActionItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  active: boolean;
  onSelect: () => void;
  disabledReason?: string | null;
}

interface ActionGroup {
  title: string;
  actions: ActionItem[];
}

interface ObjectPaletteItem {
  label: string;
  description: string;
}

interface ModelSummary {
  buses: number;
  branches: number;
  transformers: number;
  stations: number;
  openTerminals: number;
}

export interface SldWorkDockProps {
  contextItems: ContextItem[];
  nextStep: NextStepCard | null;
  actionGroups: ActionGroup[];
  objectPalette: ObjectPaletteItem[];
  modelSummary: ModelSummary;
  readinessContent: ReactNode;
  projectTreeContent?: ReactNode;
  processContent?: ReactNode;
  interactionMessage?: string | null;
  interactionHint?: string | null;
}

function toneClasses(tone: ContextItem['tone'] = 'default'): string {
  switch (tone) {
    case 'ok':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    case 'warn':
      return 'border-amber-500/35 bg-amber-500/12 text-amber-100';
    case 'danger':
      return 'border-rose-500/35 bg-rose-500/12 text-rose-100';
    default:
      return 'border-scada-border bg-scada-bg text-scada-text';
  }
}

function Section({
  eyebrow,
  title,
  children,
  testId,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      className="rounded border border-scada-border bg-scada-surface p-3 shadow-sm shadow-cyan-950/10"
      data-testid={testId}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
        {eyebrow}
      </div>
      <div className="mt-1 text-sm font-semibold text-scada-text">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-scada-border bg-scada-bg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-scada-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-scada-text">{value}</div>
    </div>
  );
}

export function SldWorkDock({
  contextItems,
  nextStep,
  actionGroups,
  objectPalette,
  modelSummary,
  readinessContent,
  projectTreeContent,
  processContent,
  interactionMessage,
  interactionHint,
}: SldWorkDockProps) {
  const [dockMode, setDockMode] = useState<'workspace' | 'readiness'>('workspace');

  return (
    <aside
      className="flex w-[368px] min-w-[368px] flex-col overflow-hidden border-r border-scada-border bg-scada-panel backdrop-blur"
      data-testid="sld-work-dock"
    >
      <div className="border-b border-scada-border bg-scada-surface px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          Dock operatorski V12.5.1
        </div>
        <h2 className="mt-1 text-sm font-semibold text-scada-text">
          Prowadzenie projektu ze schematu jednokreskowego
        </h2>
        <p className="mt-1 text-xs leading-5 text-scada-muted">
          Jedyny aktywny panel roboczy. Dzialania, blokady i stan modelu sa powiazane z
          aktualnym kontekstem pracy.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDockMode('workspace')}
            data-testid="left-panel-mode-workspace"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              dockMode === 'workspace'
                ? 'bg-blue-600 text-white'
                : 'border border-scada-border bg-scada-bg text-scada-muted hover:bg-scada-active hover:text-scada-text'
            }`}
          >
            Kontekst i drzewo
          </button>
          <button
            type="button"
            onClick={() => setDockMode('readiness')}
            data-testid="left-panel-mode-readiness"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              dockMode === 'readiness'
                ? 'bg-blue-600 text-white'
                : 'border border-scada-border bg-scada-bg text-scada-muted hover:bg-scada-active hover:text-scada-text'
            }`}
          >
            Proces i kontrola
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {dockMode === 'workspace' && (
          <>
        <Section eyebrow="Kontekst pracy" title="Aktywny kontekst projektowy" testId="sld-dock-context">
          <div className="grid grid-cols-2 gap-2">
            {contextItems.map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border px-3 py-2 ${toneClasses(item.tone)}`}
              >
                <div className="text-[10px] uppercase tracking-wide text-scada-muted">{item.label}</div>
                <div className="mt-1 text-sm font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Drzewo modelu" title="Topologiczne drzewo pracy" testId="sld-dock-project-tree">
          {projectTreeContent ? (
            projectTreeContent
          ) : (
            <div
              data-testid="project-tree"
              data-empty="true"
              className="rounded border border-scada-border bg-scada-bg px-3 py-2 text-xs text-scada-muted"
            >
              Drzewo modelu nie jest jeszcze dostepne dla aktywnego kontekstu.
            </div>
          )}
        </Section>

        <Section eyebrow="Nastepny krok" title="Najblizsza operacja procesu" testId="sld-dock-next-step">
          {nextStep ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-scada-text">{nextStep.title}</div>
                <p className="mt-1 text-xs leading-5 text-scada-muted">{nextStep.description}</p>
              </div>
              <button
                type="button"
                onClick={nextStep.onAction}
                disabled={nextStep.disabled}
                data-testid="sld-dock-next-step-action"
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {nextStep.actionLabel}
              </button>
              {nextStep.disabledReason && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {nextStep.disabledReason}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded border border-scada-border bg-scada-bg px-3 py-2 text-xs text-scada-muted">
              Wybierz element na schemacie albo otworz powierzchnie analityczne, aby przejsc do kolejnej operacji.
            </div>
          )}
        </Section>

        <Section eyebrow="Konfiguracja ukladu" title="Zagadnienia, ryzyka i sciezki projektowe" testId="sld-dock-repair">
          <div className="space-y-3">
            {interactionMessage && (
              <div className="rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                {interactionMessage}
              </div>
            )}
            {interactionHint && (
              <div className="rounded border border-scada-border bg-scada-bg px-3 py-2 text-[11px] text-scada-muted">
                {interactionHint}
              </div>
            )}
            {readinessContent}
          </div>
        </Section>

        <Section eyebrow="Paleta działań i obiektów" title="Dozwolone operacje w bieżącym kontekście" testId="sld-dock-actions">
          <div className="space-y-4">
            {actionGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-scada-muted">
                  {group.title}
                </div>
                <div className="space-y-2">
                  {group.actions.map((action) => (
                    <div key={action.id} className="rounded border border-scada-border bg-scada-bg p-2">
                      <button
                        type="button"
                        onClick={action.onSelect}
                        disabled={!action.enabled}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium transition ${
                          action.active
                            ? 'bg-blue-600 text-white'
                            : action.enabled
                              ? 'bg-scada-surface text-scada-text hover:bg-scada-active'
                              : 'cursor-not-allowed bg-scada-surface/60 text-scada-muted'
                        }`}
                      >
                        <span>{action.label}</span>
                        <span className="text-[10px] uppercase tracking-wide">
                          {action.active ? 'Aktywne' : action.enabled ? 'Dostepne' : 'Zablokowane'}
                        </span>
                      </button>
                      <div className="mt-2 text-[11px] text-scada-muted">{action.description}</div>
                      {!action.enabled && action.disabledReason && (
                        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                          {action.disabledReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-scada-muted">
                Obiekty topologiczne
              </div>
              <div className="space-y-2">
                {objectPalette.map((item) => (
                  <div
                    key={item.label}
                    className="rounded border border-scada-border bg-scada-bg px-3 py-2"
                  >
                    <div className="text-sm font-medium text-scada-text">{item.label}</div>
                    <div className="mt-1 text-[11px] text-scada-muted">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section eyebrow="Stan układu" title="Przekrój topologii i kontroli" testId="sld-dock-summary">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Szyny" value={modelSummary.buses} />
            <StatCard label="Tory SN" value={modelSummary.branches} />
            <StatCard label="Stacje" value={modelSummary.stations} />
            <StatCard label="Otwarte porty" value={modelSummary.openTerminals} />
          </div>
          <div className="mt-2">
            <StatCard label="Transformatory" value={modelSummary.transformers} />
          </div>
        </Section>
          </>
        )}

        {dockMode === 'readiness' && (
          <div className="min-h-full" data-testid="sld-dock-process-mode">
            {processContent ? (
              processContent
            ) : (
              <div className="rounded border border-scada-border bg-scada-surface p-4 text-sm text-scada-muted shadow-sm shadow-cyan-950/10">
                Panel procesu nie jest dostępny dla bieżącego kontekstu.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default SldWorkDock;
