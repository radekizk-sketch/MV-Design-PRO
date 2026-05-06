/**
 * Karta 2 — Topologia i porty (PR-8a, brief 2 §8 karta 2).
 */

import { PORT_KIND_LABELS_PL, type PortKind } from '../../../sld/v2/core/ports';

export interface StationConfigPortRow {
  readonly portId: string;
  readonly kind: PortKind;
  readonly nominalVoltageKv: number;
  readonly bayDesignation?: string;
  readonly occupiedByLabelPl?: string | null;
}

export interface StationConfigTopologyError {
  readonly id: string;
  readonly descriptionPl: string;
  readonly severity: 'error' | 'warning' | 'info';
}

export interface StationConfigTopologyCardProps {
  readonly externalPorts: readonly StationConfigPortRow[];
  readonly errors: readonly StationConfigTopologyError[];
  readonly endToEndConnectionsCount: number;
  readonly missingEndpointsCount: number;
}

const SEVERITY_CLASS: Record<StationConfigTopologyError['severity'], string> = {
  error: 'text-status-error',
  warning: 'text-status-warn',
  info: 'text-scada-muted',
};

export function StationConfigTopologyCard(
  props: StationConfigTopologyCardProps,
): JSX.Element {
  const { externalPorts, errors, endToEndConnectionsCount, missingEndpointsCount } = props;

  return (
    <div data-testid="station-config-topology" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Topologia i porty
      </div>

      <div className="grid grid-cols-2 gap-2 rounded border border-scada-border bg-scada-bg px-2 py-1">
        <div>
          <div className="text-[10px] text-scada-muted">Połączenia end-to-end</div>
          <div className="text-base font-semibold text-status-ok">{endToEndConnectionsCount}</div>
        </div>
        <div>
          <div className="text-[10px] text-scada-muted">Brak endpointu</div>
          <div className={`text-base font-semibold ${missingEndpointsCount > 0 ? 'text-status-error' : 'text-status-ok'}`}>
            {missingEndpointsCount}
          </div>
        </div>
      </div>

      <div data-testid="station-config-ports-list">
        <div className="text-[10px] font-medium text-scada-muted">Porty zewnętrzne stacji</div>
        {externalPorts.length === 0 ? (
          <div className="italic text-scada-muted">Brak portów (uruchom automigrację PR-3).</div>
        ) : (
          <table className="mt-1 w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Port</th>
                <th className="text-left">Typ</th>
                <th className="text-right">U_n [kV]</th>
                <th className="text-left">Pole</th>
                <th className="text-left">Zajęty przez</th>
              </tr>
            </thead>
            <tbody>
              {externalPorts.map((p) => (
                <tr
                  key={p.portId}
                  data-testid={`station-port-${p.portId}`}
                  className="border-b border-scada-border/40"
                >
                  <td className="font-mono text-[10px]">{p.portId}</td>
                  <td>{PORT_KIND_LABELS_PL[p.kind]}</td>
                  <td className="text-right font-mono">{p.nominalVoltageKv}</td>
                  <td>{p.bayDesignation ?? '—'}</td>
                  <td>
                    {p.occupiedByLabelPl ?? <span className="italic text-scada-muted">wolny</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {errors.length > 0 && (
        <div data-testid="station-config-topology-errors" className="flex flex-col gap-1">
          <div className="text-[10px] font-medium text-scada-muted">Błędy walidacji</div>
          {errors.map((e) => (
            <div
              key={e.id}
              data-testid={`station-topology-error-${e.id}`}
              className={`rounded border border-scada-border bg-scada-panel-raised px-2 py-1 ${SEVERITY_CLASS[e.severity]}`}
            >
              {e.descriptionPl}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
