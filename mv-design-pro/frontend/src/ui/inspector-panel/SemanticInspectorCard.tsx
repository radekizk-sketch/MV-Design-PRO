import { clsx } from 'clsx';

import type { SemanticInspectorCardModel } from '../engineering-semantic/semanticInspectorAdapter';

export interface SemanticInspectorCardProps {
  card: SemanticInspectorCardModel;
}

export function SemanticInspectorCard({ card }: SemanticInspectorCardProps) {
  const blocked = card.status === 'BLOKADA_SEMANTYCZNA';

  return (
    <section
      className={clsx(
        'border-b p-3',
        blocked
          ? 'border-red-500/40 bg-red-950/20 text-scada-text'
          : 'border-scada-border bg-scada-panel text-scada-text',
      )}
      data-testid="semantic-inspector-card"
      data-semantic-status={card.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-scada-muted">
            {card.titlePl}
          </h3>
          <p className="mt-1 truncate text-sm font-semibold text-scada-text" title={card.displayName}>
            {card.displayName}
          </p>
        </div>
        <span
          className={clsx(
            'shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
            blocked
              ? 'border-red-400 bg-red-500/10 text-red-200'
              : 'border-scada-border bg-scada-bg text-scada-muted',
          )}
        >
          {blocked ? 'BLOKADA_SEMANTYCZNA' : card.completeness}
        </span>
      </div>

      {blocked ? (
        <BlockedSemanticContent card={card} />
      ) : (
        <CompleteSemanticContent card={card} />
      )}
    </section>
  );
}

function CompleteSemanticContent({ card }: { card: SemanticInspectorCardModel }) {
  return (
    <div className="mt-3 space-y-3">
      <dl className="grid gap-1.5 text-[12px]">
        <SemanticRow label="refId" value={card.refId} mono />
        <SemanticRow label="Rodzaj elementu" value={card.elementKind ?? '-'} mono />
        <SemanticRow label="Rola inzynierska" value={card.engineeringRole ?? '-'} mono />
        <SemanticRow label="Funkcja ukladowa" value={card.functionalRole ?? '-'} mono />
        <SemanticRow label="Domena napieciowa" value={card.voltageDomain ?? '-'} mono />
        <SemanticRow label="Jakosc danych" value={card.dataQualityState ?? '-'} mono />
      </dl>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Pozycja w sieci
        </h4>
        <dl className="mt-1 grid gap-1 text-[11px]">
          {card.networkPosition.map((row) => (
            <SemanticRow key={row.key} label={row.labelPl} value={row.value} mono />
          ))}
        </dl>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Porty semantyczne
        </h4>
        {card.ports.length > 0 ? (
          <div className="mt-1 space-y-1">
            {card.ports.map((port) => (
              <div
                key={port.portId}
                className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-[11px]"
                data-testid="semantic-inspector-port"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-scada-text" title={port.portId}>
                    {port.portId}
                  </span>
                  <span className="font-mono text-scada-muted">{port.voltageDomain}</span>
                </div>
                <div className="mt-0.5 font-mono text-scada-muted">
                  {port.role} / {port.connectionSide} / {formatVoltage(port.nominalVoltageKv)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-scada-muted">Brak portow w modelu semantycznym.</p>
        )}
      </div>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Raportowalnosc
        </h4>
        <dl className="mt-1 grid gap-1 text-[11px]">
          {card.reportEligibility.map((row) => (
            <SemanticRow key={row.reportKind} label={row.reportKind} value={row.status} mono />
          ))}
        </dl>
      </div>

      {card.semanticHash && (
        <div className="truncate border-t border-scada-border pt-2 font-mono text-[10px] text-scada-muted">
          semanticHash: {card.semanticHash}
        </div>
      )}
    </div>
  );
}

function BlockedSemanticContent({ card }: { card: SemanticInspectorCardModel }) {
  return (
    <div className="mt-3 space-y-2 text-[12px]">
      <p className="font-semibold text-red-100">{card.messagePl}</p>
      <p className="text-red-200">{card.repairActionPl}</p>
      <dl className="grid gap-1">
        <SemanticRow label="refId" value={card.refId} mono />
        {card.fallbackVisualLabel && (
          <SemanticRow label="Typ wizualny" value={card.fallbackVisualLabel} mono />
        )}
        {card.semanticHash && (
          <SemanticRow label="semanticHash" value={card.semanticHash} mono />
        )}
      </dl>
    </div>
  );
}

function SemanticRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
      <dt className="truncate text-scada-muted" title={label}>
        {label}
      </dt>
      <dd
        className={clsx('truncate text-right text-scada-text', mono && 'font-mono')}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function formatVoltage(value: number | null): string {
  return value === null ? 'napiecie: -' : `${value} kV`;
}

export default SemanticInspectorCard;
