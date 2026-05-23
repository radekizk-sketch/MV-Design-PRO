/**
 * NcRfgComplianceBadge — status NC RfG per DER (Etap 8 z planu).
 *
 * "Per-DER status NC RfG compliance: badge 'zgodny' / 'wymaga audytu' / 'niezgodny'"
 *
 * NC RfG (Network Code on Requirements for Generators) wymaga:
 * - FRT (Fault Ride Through) profile per OSD
 * - HVRT/LVRT envelope
 * - cos φ(P) profile
 * - Q(U) profile
 * - Anti-islanding (ROCOF/dRoCoF)
 *
 * Norma: NC RfG Annex II, IRiESD.
 */

export type NcRfgComplianceStatus = 'compliant' | 'audit_required' | 'non_compliant';

export interface NcRfgChecklist {
  frtConfigured: boolean;
  cosPhiProfileConfigured: boolean;
  qOfUProfileConfigured: boolean;
  antiIslandingEnabled: boolean;
  inverterCertified: boolean;
}

export function evaluateNcRfgCompliance(checklist: NcRfgChecklist): {
  status: NcRfgComplianceStatus;
  passedCount: number;
  totalCount: number;
  missing: string[];
} {
  const items: Array<[keyof NcRfgChecklist, string]> = [
    ['frtConfigured', 'Profil FRT (Fault Ride Through)'],
    ['cosPhiProfileConfigured', 'Profil cos φ(P)'],
    ['qOfUProfileConfigured', 'Profil Q(U)'],
    ['antiIslandingEnabled', 'Anti-islanding (ROCOF)'],
    ['inverterCertified', 'Certyfikat PTPIREE'],
  ];
  const totalCount = items.length;
  const passedItems = items.filter(([key]) => checklist[key]);
  const passedCount = passedItems.length;
  const missing = items.filter(([key]) => !checklist[key]).map(([, label]) => label);

  let status: NcRfgComplianceStatus;
  if (passedCount === totalCount) {
    status = 'compliant';
  } else if (passedCount >= 3) {
    status = 'audit_required';
  } else {
    status = 'non_compliant';
  }
  return { status, passedCount, totalCount, missing };
}

interface NcRfgComplianceBadgeProps {
  checklist: NcRfgChecklist;
  className?: string;
}

const STATUS_LABELS: Record<NcRfgComplianceStatus, string> = {
  compliant: 'Zgodny NC RfG',
  audit_required: 'Wymaga audytu',
  non_compliant: 'Niezgodny',
};

const STATUS_COLORS: Record<NcRfgComplianceStatus, string> = {
  compliant: 'bg-emerald-100 text-emerald-800',
  audit_required: 'bg-amber-100 text-amber-800',
  non_compliant: 'bg-red-100 text-red-800',
};

const STATUS_ICONS: Record<NcRfgComplianceStatus, string> = {
  compliant: '✓',
  audit_required: '⚠',
  non_compliant: '✗',
};

export function NcRfgComplianceBadge({ checklist, className }: NcRfgComplianceBadgeProps) {
  const { status, passedCount, totalCount, missing } = evaluateNcRfgCompliance(checklist);
  const tooltip =
    missing.length === 0
      ? 'Wszystkie wymagania NC RfG spełnione'
      : `Brakuje: ${missing.join(', ')}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]} ${className ?? ''}`}
      data-testid={`nc-rfg-badge-${status}`}
      title={tooltip}
      aria-label={`Status NC RfG: ${STATUS_LABELS[status]}. ${passedCount}/${totalCount} wymagań spełnione.`}
    >
      <span aria-hidden="true">{STATUS_ICONS[status]}</span>
      <span>{STATUS_LABELS[status]}</span>
      <span className="text-xs opacity-70">
        ({passedCount}/{totalCount})
      </span>
    </span>
  );
}
