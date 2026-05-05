import type { SemanticDiagnosticsReport } from '../engineering-semantic';

interface DiagnosticMetric {
  label: string;
  value: number;
  tone: 'neutral' | 'warn' | 'block';
}

export interface SldSemanticDiagnosticsPanelProps {
  report: SemanticDiagnosticsReport;
}

function MetricPill({ label, value, tone }: DiagnosticMetric) {
  const toneClass = {
    neutral: 'border-[#244054] bg-[#0c1a26] text-[#d7e7f2]',
    warn: 'border-[#8a5d12] bg-[#2a1f0a] text-[#ffd98a]',
    block: 'border-[#7f1d1d] bg-[#2a0d12] text-[#fecaca]',
  }[tone];

  return (
    <div className={`rounded-[10px] border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function RefList({ title, refs }: { title: string; refs: string[] }) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[12px] border border-[#263a4b] bg-[#08131d] p-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f8c16b]">
        {title}
      </h4>
      <div className="mt-2 grid gap-1">
        {refs.slice(0, 8).map((refId) => (
          <code key={refId} className="truncate rounded bg-[#0f2030] px-2 py-1 text-[11px] text-[#d7e7f2]">
            {refId}
          </code>
        ))}
        {refs.length > 8 && (
          <div className="text-[11px] text-[#8ba3b4]">+ {refs.length - 8} kolejnych</div>
        )}
      </div>
    </section>
  );
}

export function SldSemanticDiagnosticsPanel({ report }: SldSemanticDiagnosticsPanelProps) {
  const metrics: DiagnosticMetric[] = [
    { label: 'ENM', value: report.totals.enmElements, tone: 'neutral' },
    { label: 'Semantyka', value: report.totals.semanticElements, tone: 'neutral' },
    { label: 'Naruszenia', value: report.totals.violations, tone: report.totals.violations > 0 ? 'block' : 'neutral' },
    {
      label: 'Archiwalny',
      value: report.legacySilentPromotionRefIds.length,
      tone: report.legacySilentPromotionRefIds.length > 0 ? 'block' : 'neutral',
    },
  ];

  return (
    <aside
      className="absolute right-4 top-16 z-30 max-h-[calc(100%-7rem)] w-[390px] overflow-hidden rounded-[16px] border border-[#274154] bg-[#06111b] shadow-[0_24px_64px_rgba(2,8,23,0.52)]"
      data-testid="sld-semantic-diagnostics-panel"
    >
      <div className="border-b border-[#1d3446] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7dd3fc]">
          Diagnostyka semantyczna modelu
        </div>
        <div className="mt-1 text-xs text-[#9fb4c6]">
          ENM kontra projekcja semantyczna i render SLD
        </div>
        <div className="mt-2 truncate font-mono text-[10px] text-[#6f8799]">
          semanticHash: {report.semanticHash}
        </div>
      </div>

      <div className="max-h-[calc(100vh-15rem)] overflow-y-auto p-4">
        <div className="grid grid-cols-4 gap-2">
          {metrics.map((metric) => (
            <MetricPill key={metric.label} {...metric} />
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          <RefList title="ENM bez elementu semantycznego" refs={report.enmElementsWithoutSemanticElement} />
          <RefList title="Elementy bez roli" refs={report.semanticElementsWithoutRole} />
          <RefList title="Elementy bez portow" refs={report.semanticElementsWithoutPorts} />
          <RefList title="Elementy bez pozycji sieciowej" refs={report.semanticElementsWithoutNetworkPosition} />
          <RefList title="Brak katalogu lub kontraktu" refs={report.semanticElementsWithoutCatalogOrEquivalent} />
          <RefList title="Nierenderowalne produkcyjnie" refs={report.enmElementsNotProductionRenderable} />
          <RefList title="Renderowane jako szkic" refs={report.elementsRenderedAsSketch} />
          <RefList title="Renderowane jako blokada semantyczna" refs={report.elementsRenderedAsSemanticBlock} />
          <RefList title="Cichy awans archiwalny" refs={report.legacySilentPromotionRefIds} />
        </div>
      </div>
    </aside>
  );
}

export default SldSemanticDiagnosticsPanel;
