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
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900';
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
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      data-testid={testId}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {eyebrow}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
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
      className="flex w-[368px] min-w-[368px] flex-col overflow-hidden border-r border-slate-200 bg-slate-50/95 backdrop-blur"
      data-testid="sld-work-dock"
    >
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Dock operatorski V12.5.1
        </div>
        <h2 className="mt-1 text-sm font-semibold text-slate-900">
          Prowadzenie projektu ze schematu jednokreskowego
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
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
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Proces i gotowosc
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
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</div>
                <div className="mt-1 text-sm font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Drzewo modelu" title="Topologiczne drzewo pracy" testId="sld-dock-project-tree">
          {projectTreeContent ?? (
            <div
              data-testid="project-tree"
              data-empty="true"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
            >
              Drzewo modelu nie jest jeszcze dostepne dla aktywnego kontekstu.
            </div>
          )}
        </Section>

        <Section eyebrow="Nastepny krok" title="Najblizsza operacja procesu" testId="sld-dock-next-step">
          {nextStep ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{nextStep.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{nextStep.description}</p>
              </div>
              <button
                type="button"
                onClick={nextStep.onAction}
                disabled={nextStep.disabled}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {nextStep.actionLabel}
              </button>
              {nextStep.disabledReason && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {nextStep.disabledReason}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Brak zalecanej akcji. Wybierz element na schemacie albo otworz powierzchnie analityczne.
            </div>
          )}
        </Section>

        <Section eyebrow="Blokady i naprawy" title="Braki, ryzyka i sciezki naprawy" testId="sld-dock-repair">
          <div className="space-y-3">
            {interactionMessage && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                {interactionMessage}
              </div>
            )}
            {interactionHint && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                {interactionHint}
              </div>
            )}
            {readinessContent}
          </div>
        </Section>

        <Section eyebrow="Paleta dzialan i obiektow" title="Dozwolone operacje w biezacym kontekscie" testId="sld-dock-actions">
          <div className="space-y-4">
            {actionGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.title}
                </div>
                <div className="space-y-2">
                  {group.actions.map((action) => (
                    <div key={action.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <button
                        type="button"
                        onClick={action.onSelect}
                        disabled={!action.enabled}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium transition ${
                          action.active
                            ? 'bg-blue-100 text-blue-900'
                            : action.enabled
                              ? 'bg-white text-slate-900 hover:bg-slate-100'
                              : 'cursor-not-allowed bg-slate-100 text-slate-400'
                        }`}
                      >
                        <span>{action.label}</span>
                        <span className="text-[10px] uppercase tracking-wide">
                          {action.active ? 'Aktywne' : action.enabled ? 'Dostepne' : 'Zablokowane'}
                        </span>
                      </button>
                      <div className="mt-2 text-[11px] text-slate-600">{action.description}</div>
                      {!action.enabled && action.disabledReason && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                          {action.disabledReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Obiekty topologiczne
              </div>
              <div className="space-y-2">
                {objectPalette.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-slate-900">{item.label}</div>
                    <div className="mt-1 text-[11px] text-slate-600">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section eyebrow="Stan modelu" title="Przekroj topologii i gotowosci" testId="sld-dock-summary">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Szyny" value={modelSummary.buses} />
            <StatCard label="Galazie" value={modelSummary.branches} />
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
            {processContent ?? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                Brak aktywnego panelu procesu dla biezacego kontekstu.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default SldWorkDock;
