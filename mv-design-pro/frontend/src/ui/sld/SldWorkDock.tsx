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
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50';
    case 'warn':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-50';
    case 'danger':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-50';
    default:
      return 'border-[#274154] bg-[#0d1c29] text-slate-50';
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
    <section className="scada-panel-muted p-3.5" data-testid={testId}>
      <div className="scada-shell-eyebrow">{eyebrow}</div>
      <div className="mt-1 text-sm font-semibold text-slate-50">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="scada-metric-tile">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[#6f8ca4]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-50">{value}</div>
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
      className="flex w-[388px] min-w-[388px] flex-col overflow-hidden border-r border-[#183041] bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.18),transparent_32%),linear-gradient(180deg,#06111a_0%,#08141d_48%,#091821_100%)] shadow-[inset_-1px_0_0_rgba(148,163,184,0.05)] backdrop-blur"
      data-testid="sld-work-dock"
    >
      <div className="border-b border-[#1a3040] px-4 py-4">
        <div className="scada-shell-eyebrow">Dock operatorski V12.5.1</div>
        <h2 className="mt-1 text-base font-semibold text-slate-50">
          Prowadzenie projektu ze schematu jednokreskowego
        </h2>
        <p className="mt-2 text-xs leading-5 text-[#8ea6ba]">
          Jedyny aktywny panel roboczy. Proces, blokady i stan modelu sa osadzone
          w tym samym shellu i prowadza operatora od budowy do analityki.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDockMode('workspace')}
            data-testid="left-panel-mode-workspace"
            className={`rounded-[12px] border px-3 py-1.5 text-xs font-semibold transition ${
              dockMode === 'workspace'
                ? 'border-cyan-400/35 bg-cyan-500/14 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                : 'border-[#274154] bg-[#091721] text-[#9cb4c8] hover:bg-[#102331] hover:text-white'
            }`}
          >
            Kontekst i drzewo
          </button>
          <button
            type="button"
            onClick={() => setDockMode('readiness')}
            data-testid="left-panel-mode-readiness"
            className={`rounded-[12px] border px-3 py-1.5 text-xs font-semibold transition ${
              dockMode === 'readiness'
                ? 'border-emerald-400/35 bg-emerald-500/14 text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
                : 'border-[#274154] bg-[#091721] text-[#9cb4c8] hover:bg-[#102331] hover:text-white'
            }`}
          >
            Proces i gotowosc
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {dockMode === 'workspace' ? (
          <>
            <Section eyebrow="Kontekst pracy" title="Aktywny kontekst projektowy" testId="sld-dock-context">
              <div className="grid grid-cols-2 gap-2">
                {contextItems.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className={`rounded-[14px] border px-3 py-2 ${toneClasses(item.tone)}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[#7a95ab]">{item.label}</div>
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
                  className="rounded-[14px] border border-dashed border-[#294153] bg-[#091721] px-3 py-3 text-xs text-[#8ea6ba]"
                >
                  Drzewo modelu nie jest jeszcze dostepne dla aktywnego kontekstu.
                </div>
              )}
            </Section>

            <Section eyebrow="Nastepny krok" title="Najblizsza operacja procesu" testId="sld-dock-next-step">
              {nextStep ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-50">{nextStep.title}</div>
                    <p className="mt-1 text-xs leading-5 text-[#8ea6ba]">{nextStep.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={nextStep.onAction}
                    disabled={nextStep.disabled}
                    className="scada-action-btn-primary w-full justify-center py-2.5 text-sm disabled:cursor-not-allowed disabled:border-[#3a4d5d] disabled:bg-[#233241] disabled:text-[#7c91a3]"
                  >
                    {nextStep.actionLabel}
                  </button>
                  {nextStep.disabledReason ? (
                    <div className="rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-50">
                      {nextStep.disabledReason}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[14px] border border-[#294153] bg-[#091721] px-3 py-3 text-xs text-[#8ea6ba]">
                  Brak zalecanej akcji. Wybierz element na schemacie albo otworz powierzchnie analityczne.
                </div>
              )}
            </Section>

            <Section eyebrow="Blokady i naprawy" title="Braki, ryzyka i sciezki naprawy" testId="sld-dock-repair">
              <div className="space-y-3">
                {interactionMessage ? (
                  <div className="rounded-[12px] border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50">
                    {interactionMessage}
                  </div>
                ) : null}
                {interactionHint ? (
                  <div className="rounded-[12px] border border-[#294153] bg-[#091721] px-3 py-2 text-[11px] text-[#8ea6ba]">
                    {interactionHint}
                  </div>
                ) : null}
                {readinessContent}
              </div>
            </Section>

            <Section eyebrow="Paleta dzialan i obiektow" title="Dozwolone operacje w biezacym kontekscie" testId="sld-dock-actions">
              <div className="space-y-4">
                {actionGroups.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8ca4]">
                      {group.title}
                    </div>
                    <div className="space-y-2">
                      {group.actions.map((action) => (
                        <div
                          key={action.id}
                          className="rounded-[14px] border border-[#22384a] bg-[#091721] p-2.5"
                        >
                          <button
                            type="button"
                            onClick={action.onSelect}
                            disabled={!action.enabled}
                            className={`flex w-full items-center justify-between rounded-[10px] border px-3 py-2 text-left text-sm font-medium transition ${
                              action.active
                                ? 'border-cyan-400/35 bg-cyan-500/14 text-cyan-50'
                                : action.enabled
                                  ? 'border-[#2a4253] bg-[#0d1c29] text-slate-50 hover:bg-[#112433]'
                                  : 'cursor-not-allowed border-[#243745] bg-[#0b151f] text-[#637a8e]'
                            }`}
                          >
                            <span>{action.label}</span>
                            <span className="text-[10px] uppercase tracking-[0.18em]">
                              {action.active ? 'Aktywne' : action.enabled ? 'Dostepne' : 'Zablokowane'}
                            </span>
                          </button>
                          <div className="mt-2 text-[11px] leading-5 text-[#8ea6ba]">{action.description}</div>
                          {!action.enabled && action.disabledReason ? (
                            <div className="mt-2 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-50">
                              {action.disabledReason}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8ca4]">
                    Obiekty topologiczne
                  </div>
                  <div className="space-y-2">
                    {objectPalette.map((item, index) => (
                      <div
                        key={`${item.label}-${index}`}
                        className="rounded-[14px] border border-[#22384a] bg-[#091721] px-3 py-2.5"
                      >
                        <div className="text-sm font-medium text-slate-50">{item.label}</div>
                        <div className="mt-1 text-[11px] leading-5 text-[#8ea6ba]">{item.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section eyebrow="Stan modelu" title="Przekroj topologii i gotowosci" testId="sld-dock-summary">
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Szyny" value={modelSummary.buses} />
                <StatCard label="Galezie" value={modelSummary.branches} />
                <StatCard label="Stacje" value={modelSummary.stations} />
                <StatCard label="Otwarte porty" value={modelSummary.openTerminals} />
              </div>
              <div className="mt-2">
                <StatCard label="Transformatory" value={modelSummary.transformers} />
              </div>
            </Section>
          </>
        ) : (
          <div className="min-h-full" data-testid="sld-dock-process-mode">
            {processContent ?? (
              <div className="scada-panel-muted p-4 text-sm text-[#8ea6ba]">
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
