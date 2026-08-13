/**
 * DerComplianceBadge — NC RFG compliance status badge per DER (OZE Phase B).
 *
 * Pokazuje:
 *   - Rodzaj DER (PV/BESS/FW) z kolorem modułu NC RFG (A/B/C/D per ENEA profile)
 *   - Moc czynna P [MW] i cosφ
 *   - Status zgodności NC RFG (PASS / FAIL / NIEOKREŚLONY)
 *
 * Używane w panelu wyników OZE (results panel / proof overlay).
 * Source of truth: backend/src/catalog/profiles/nc_rfg/enea.yaml
 *
 * INVARIANTS:
 * - Pure component (zero physics, zero model mutation)
 * - Polskie etykiety 100%
 * - Deterministic per props
 */

export type DerKind = 'PV' | 'BESS' | 'FW';
export type NcRfgModule = 'A' | 'B' | 'C' | 'D';
export type ComplianceStatus = 'pass' | 'fail' | 'unknown';

export interface DerComplianceBadgeProps {
  readonly id: string;
  readonly kind: DerKind;
  readonly name: string;
  readonly nominalPowerKw?: number | null;
  readonly operatingPMw?: number | null;
  readonly operatingQMvar?: number | null;
  readonly ncRfgModule?: NcRfgModule | null;
  readonly compliance?: ComplianceStatus;
  readonly className?: string;
}

const KIND_LABEL: Record<DerKind, string> = {
  PV: 'PV',
  BESS: 'BESS',
  FW: 'FW',
};

const KIND_LABEL_PL: Record<DerKind, string> = {
  PV: 'Fotowoltaika',
  BESS: 'Magazyn energii',
  FW: 'Wiatraki',
};

const NC_RFG_COLOR: Record<NcRfgModule, string> = {
  A: '#00A651',
  B: '#0070C0',
  C: '#FF8C00',
  D: '#C00000',
};

const NC_RFG_LABEL: Record<NcRfgModule, string> = {
  A: 'Moduł A (Mikro)',
  B: 'Moduł B (Małe)',
  C: 'Moduł C (Duże)',
  D: 'Moduł D (B. duże)',
};

const COMPLIANCE_ICON: Record<ComplianceStatus, string> = {
  pass: '✓',
  fail: '✗',
  unknown: '?',
};

const COMPLIANCE_COLOR: Record<ComplianceStatus, string> = {
  pass: '#00A651',
  fail: '#C00000',
  unknown: '#666',
};

const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  pass: 'ZGODNY',
  fail: 'NIEZGODNY',
  unknown: 'NIEOKREŚLONY',
};

function computeCosPhi(pMw: number, qMvar: number | null | undefined): number | null {
  const q = qMvar ?? 0;
  const s = Math.sqrt(pMw * pMw + q * q);
  return s > 0 ? pMw / s : null;
}

export function DerComplianceBadge({
  id,
  kind,
  name,
  nominalPowerKw,
  operatingPMw,
  operatingQMvar,
  ncRfgModule,
  compliance = 'unknown',
  className,
}: DerComplianceBadgeProps): JSX.Element {
  const cosPhi =
    operatingPMw !== null && operatingPMw !== undefined
      ? computeCosPhi(operatingPMw, operatingQMvar)
      : null;

  return (
    <div
      data-testid={`der-compliance-badge-${id}`}
      className={[
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-panel p-2 text-[11px] text-scada-text',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Nagłówek: rodzaj + nazwa */}
      <div className="flex items-center gap-2">
        <span
          data-testid={`der-compliance-badge-${id}-kind`}
          className="rounded px-1.5 py-0.5 font-mono-eng text-[10px] font-semibold text-white"
          style={{ backgroundColor: ncRfgModule ? NC_RFG_COLOR[ncRfgModule] : '#444' }}
          title={KIND_LABEL_PL[kind]}
        >
          {KIND_LABEL[kind]}
        </span>
        <span
          data-testid={`der-compliance-badge-${id}-name`}
          className="truncate font-semibold"
        >
          {name}
        </span>
        {nominalPowerKw !== null && nominalPowerKw !== undefined && (
          <span
            data-testid={`der-compliance-badge-${id}-nominal`}
            className="ml-auto font-mono-eng text-[10px] text-scada-muted"
          >
            {nominalPowerKw.toFixed(0)} kW
          </span>
        )}
      </div>

      {/* NC RFG Module */}
      {ncRfgModule && (
        <div
          data-testid={`der-compliance-badge-${id}-nc-rfg`}
          className="flex items-center gap-1"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: NC_RFG_COLOR[ncRfgModule] }}
          />
          <span className="text-scada-muted">NC RFG:</span>
          <span className="font-semibold" style={{ color: NC_RFG_COLOR[ncRfgModule] }}>
            {NC_RFG_LABEL[ncRfgModule]}
          </span>
        </div>
      )}

      {/* Punkt pracy: P + cosφ */}
      {operatingPMw !== null && operatingPMw !== undefined && (
        <div
          data-testid={`der-compliance-badge-${id}-operating`}
          className="flex items-center gap-2 font-mono-eng text-[10px]"
        >
          <span className="text-scada-muted">P:</span>
          <span data-testid={`der-compliance-badge-${id}-p`}>
            {(operatingPMw * 1000).toFixed(0)} kW
          </span>
          {cosPhi !== null && (
            <>
              <span className="text-scada-muted">cosφ:</span>
              <span
                data-testid={`der-compliance-badge-${id}-cos-phi`}
                className="text-scada-text"
              >
                {cosPhi.toFixed(2)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Status zgodności NC RFG */}
      <div
        data-testid={`der-compliance-badge-${id}-status`}
        className="flex items-center gap-1 text-[10px] font-semibold"
        style={{ color: COMPLIANCE_COLOR[compliance] }}
      >
        <span>{COMPLIANCE_ICON[compliance]}</span>
        <span>{COMPLIANCE_LABEL[compliance]}</span>
      </div>
    </div>
  );
}
