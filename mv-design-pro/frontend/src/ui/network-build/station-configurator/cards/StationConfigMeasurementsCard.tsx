/**
 * Karta 9 — Pomiary (PR-8a, brief §8 karta 9).
 */

export interface MeasurementRow {
  readonly id: string;
  readonly bayDesignation: string;
  readonly kind: 'CT' | 'VT';
  readonly ratioPrimary: number;
  readonly ratioSecondary: number;
  readonly accuracyClassPl: string;
  readonly burdenVa?: number | null;
}

export interface StationConfigMeasurementsCardProps {
  readonly cts: readonly MeasurementRow[];
  readonly vts: readonly MeasurementRow[];
  readonly metersCount: number;
  readonly telemetryCount: number;
  readonly missingMeasurementsPl?: readonly string[];
}

export function StationConfigMeasurementsCard(
  props: StationConfigMeasurementsCardProps,
): JSX.Element {
  const { cts, vts, metersCount, telemetryCount, missingMeasurementsPl } = props;

  return (
    <div data-testid="station-config-measurements" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Pomiary
      </div>

      <div data-testid="measurements-cts">
        <div className="text-[10px] font-medium text-scada-muted">
          Przekładniki prądowe (CT) — {cts.length}
        </div>
        {cts.length === 0 ? (
          <div className="italic text-scada-muted">Brak.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Pole</th>
                <th className="text-right">Przekładnia</th>
                <th className="text-left">Klasa</th>
                <th className="text-right">Obciążenie [VA]</th>
              </tr>
            </thead>
            <tbody>
              {cts.map((m) => (
                <tr key={m.id} data-testid={`ct-row-${m.id}`} className="border-b border-scada-border/40">
                  <td className="font-mono">{m.bayDesignation}</td>
                  <td className="text-right font-mono">{m.ratioPrimary} / {m.ratioSecondary} A</td>
                  <td>{m.accuracyClassPl}</td>
                  <td className="text-right font-mono">{m.burdenVa ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div data-testid="measurements-vts">
        <div className="text-[10px] font-medium text-scada-muted">
          Przekładniki napięciowe (VT) — {vts.length}
        </div>
        {vts.length === 0 ? (
          <div className="italic text-scada-muted">Brak.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Pole</th>
                <th className="text-right">Przekładnia</th>
                <th className="text-left">Klasa</th>
              </tr>
            </thead>
            <tbody>
              {vts.map((m) => (
                <tr key={m.id} data-testid={`vt-row-${m.id}`} className="border-b border-scada-border/40">
                  <td className="font-mono">{m.bayDesignation}</td>
                  <td className="text-right font-mono">{m.ratioPrimary} / {m.ratioSecondary} V</td>
                  <td>{m.accuracyClassPl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-scada-muted">Liczniki: </span>{metersCount}
        </div>
        <div>
          <span className="text-scada-muted">Telepomiary: </span>{telemetryCount}
        </div>
      </div>

      {missingMeasurementsPl && missingMeasurementsPl.length > 0 && (
        <div data-testid="missing-measurements" className="rounded border border-scada-border bg-scada-panel-raised px-2 py-1 text-status-warn">
          <div className="text-[10px] font-medium">Pomiary do konfiguracji:</div>
          <ul className="ml-3 list-disc text-[11px]">
            {missingMeasurementsPl.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
