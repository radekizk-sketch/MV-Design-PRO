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
          {blocked ? 'Blokada semantyczna' : formatCompleteness(card.completeness)}
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
  const visiblePositionRows = card.networkPosition.filter((row) => row.value !== '-');

  return (
    <div className="mt-3 space-y-3">
      <dl className="grid gap-1.5 text-[12px]">
        <SemanticRow label="Rodzaj elementu" value={formatElementKind(card.elementKind)} />
        <SemanticRow label="Rola inżynierska" value={formatEngineeringRole(card.engineeringRole)} />
        <SemanticRow label="Funkcja układowa" value={formatFunctionalRole(card.functionalRole)} />
        <SemanticRow label="Domena napięciowa" value={formatVoltageDomain(card.voltageDomain)} />
        <SemanticRow label="Jakość danych" value={formatDataQuality(card.dataQualityState)} />
      </dl>

      {visiblePositionRows.length > 0 && (
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Pozycja w sieci
        </h4>
        <dl className="mt-1 grid gap-1 text-[11px]">
          {visiblePositionRows.map((row) => (
            <SemanticRow key={row.key} label={row.labelPl} value={formatPositionValue(row.value)} />
          ))}
        </dl>
      </div>
      )}

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
                  <span className="truncate font-semibold text-scada-text" title={port.portId}>
                    {formatPortRole(port.role)}
                  </span>
                  <span className="font-mono text-scada-muted">{formatVoltageDomain(port.voltageDomain)}</span>
                </div>
                <div className="mt-0.5 text-scada-muted">
                  {formatConnectionSide(port.connectionSide)} · {formatVoltage(port.nominalVoltageKv)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-scada-muted">Brak portów w modelu semantycznym.</p>
        )}
      </div>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Raportowalność
        </h4>
        <dl className="mt-1 grid gap-1 text-[11px]">
          {card.reportEligibility.map((row) => (
            <SemanticRow key={row.reportKind} label={formatReportKind(row.reportKind)} value={formatReportStatus(row.status)} />
          ))}
        </dl>
      </div>

      <RawDiagnostics card={card} />
    </div>
  );
}

function BlockedSemanticContent({ card }: { card: SemanticInspectorCardModel }) {
  return (
    <div className="mt-3 space-y-2 text-[12px]">
      <p className="font-semibold text-red-100">{card.messagePl}</p>
      <p className="text-red-200">{card.repairActionPl}</p>
      <RawDiagnostics card={card} />
    </div>
  );
}

function RawDiagnostics({ card }: { card: SemanticInspectorCardModel }) {
  return (
    <details className="border-t border-scada-border pt-2 text-[10px] text-scada-muted">
      <summary className="cursor-pointer font-semibold uppercase tracking-[0.12em]">
        Diagnostyka techniczna
      </summary>
      <dl className="mt-2 grid gap-1">
        <SemanticRow label="refId" value={card.refId} mono />
        {card.fallbackVisualLabel && (
          <SemanticRow label="Typ wizualny" value={card.fallbackVisualLabel} mono />
        )}
        {card.semanticHash && (
          <SemanticRow label="semanticHash" value={card.semanticHash} mono />
        )}
        {card.networkPosition.map((row) => (
          <SemanticRow key={`diag-${row.key}`} label={row.key} value={row.value} mono />
        ))}
        {card.ports.map((port) => (
          <SemanticRow key={`diag-${port.portId}`} label="portId" value={port.portId} mono />
        ))}
      </dl>
    </details>
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
  return value === null ? 'napięcie: -' : `${value} kV`;
}

function formatElementKind(value: string | null): string {
  if (!value) return '-';
  const normalized = value.toUpperCase();
  if (normalized.includes('BAY')) return 'Pole rozdzielcze SN';
  if (normalized.includes('BUS')) return 'Sekcja szyn';
  if (normalized.includes('SUBSTATION') || normalized.includes('STATION')) return 'Stacja elektroenergetyczna';
  if (normalized.includes('LINE') || normalized.includes('CABLE')) return 'Odcinek sieci SN';
  if (normalized.includes('TRANSFORMER')) return 'Transformator';
  if (normalized.includes('SOURCE')) return 'Źródło zasilania';
  if (normalized.includes('LOAD')) return 'Odbiór';
  return value;
}

function formatEngineeringRole(value: string | null): string {
  switch (value) {
    case 'LINE_FEEDER_BAY':
      return 'Pole odpływowe SN zasilające magistralę';
    case 'FEEDS_MV_TRUNK':
      return 'Zasila magistralę SN';
    case 'BUSBAR_SECTION':
      return 'Sekcja szyn';
    default:
      return value ?? '-';
  }
}

function formatFunctionalRole(value: string | null): string {
  switch (value) {
    case 'FEEDS_MV_TRUNK':
      return 'Wyprowadzenie magistrali SN';
    default:
      return value ?? '-';
  }
}

function formatVoltageDomain(value: string | null): string {
  if (!value) return '-';
  if (value === 'NN') return 'nN';
  return value;
}

function formatDataQuality(value: string | null): string {
  switch (value) {
    case 'PELNA':
      return 'Pełna';
    case 'CZESCIOWA':
      return 'Częściowa';
    case 'BRAK':
      return 'Brak danych';
    case 'NIEZWERYFIKOWANA':
      return 'Niezweryfikowana';
    case 'OSZACOWANA':
      return 'Oszacowana';
    default:
      return value ?? '-';
  }
}

function formatCompleteness(value: string | null): string {
  switch (value) {
    case 'SZKIC_LOGICZNY':
      return 'Szkic logiczny';
    case 'MODEL_TECHNICZNY_NIEPELNY':
      return 'Model techniczny niepełny';
    case 'MODEL_TECHNICZNY_PELNY':
      return 'Model techniczny pełny';
    default:
      return value ?? '-';
  }
}

function formatPortRole(value: string): string {
  if (value.includes('OUT')) return 'Port wyjściowy';
  if (value.includes('IN')) return 'Port wejściowy';
  if (value.includes('BRANCH')) return 'Port odgałęzienia';
  return 'Port techniczny';
}

function formatConnectionSide(value: string): string {
  switch (value) {
    case 'STRONA_LINII':
      return 'strona linii';
    case 'STRONA_SZYN':
      return 'strona szyn';
    default:
      return value || '-';
  }
}

function formatReportKind(value: string): string {
  switch (value) {
    case 'RAPORT_TECHNICZNY':
      return 'Raport techniczny';
    case 'RAPORT_OSD':
      return 'Raport OSD';
    case 'RAPORT_AUDYTOWY':
      return 'Raport audytowy';
    case 'RAPORT_ZGODNOSCI_ZRODLA':
      return 'Raport zgodności źródła';
    case 'RAPORT_ZABEZPIECZEN':
      return 'Raport zabezpieczeń';
    default:
      return value;
  }
}

function formatReportStatus(value: string): string {
  switch (value) {
    case 'RAPORTOWALNY':
      return 'Raportowalny';
    case 'RAPORTOWALNY_Z_OSTRZEZENIEM':
      return 'Raportowalny z ostrzeżeniem';
    case 'NIERAPORTOWALNY_BRAK_DANYCH':
      return 'Brak danych do raportu';
    case 'NIERAPORTOWALNY_SZKIC':
      return 'Szkic, nie raportować';
    case 'NIE_DOTYCZY':
      return 'Nie dotyczy';
    default:
      return value;
  }
}

function formatPositionValue(value: string): string {
  return value.includes('/') || value.length > 36 ? 'powiązanie techniczne' : value;
}

export default SemanticInspectorCard;
