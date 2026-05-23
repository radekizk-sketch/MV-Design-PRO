/**
 * EquipmentProofBadge — warning Ith/Idyn na elemencie SLD.
 *
 * Pokazuje czerwoną ikonę ⚠ + tooltip gdy aparat NIE wytrzyma obliczonego
 * prądu zwarcia (Ith/Idyn vs nameplate). Krytyczne dla zgodności normatywnej.
 *
 * IEC 60909/PN-EN 60865: wymaganie projektanta że Ith aparatu ≥ Ith"
 * obliczone w punkcie zwarcia.
 */

export type EquipmentProofStatus = 'ok' | 'warning' | 'fail';

export interface EquipmentProofData {
  /** Status zgodności aparatury vs obliczone prądy. */
  readonly status: EquipmentProofStatus;
  /** Obliczony prąd Ith [kA] z PF/SC. */
  readonly calculated_Ith_kA?: number;
  /** Nameplate Ith aparatu [kA] z katalogu. */
  readonly rated_Ith_kA?: number;
  /** Obliczony prąd udarowy Idyn [kA]. */
  readonly calculated_Idyn_kA?: number;
  /** Nameplate Idyn aparatu [kA]. */
  readonly rated_Idyn_kA?: number;
  /** Wskaźnik wykorzystania 0-1+ (1 = limit, >1 = przekroczenie). */
  readonly utilization?: number;
}

const STATUS_INFO: Record<EquipmentProofStatus, { color: string; label: string; icon: string }> = {
  ok: { color: '#26f0b1', label: 'Aparat wytrzyma obliczony prąd zwarcia', icon: '✓' },
  warning: { color: '#ffd166', label: 'Aparat na granicy wytrzymałości (>80% Ith/Idyn)', icon: '⚠' },
  fail: { color: '#ff5252', label: 'Aparat NIE wytrzyma obliczonego prądu zwarcia!', icon: '✗' },
};

export interface EquipmentProofBadgeProps {
  readonly data: EquipmentProofData;
  readonly x: number;
  readonly y: number;
  readonly onClick?: () => void;
}

export function EquipmentProofBadge({ data, x, y, onClick }: EquipmentProofBadgeProps): JSX.Element {
  const info = STATUS_INFO[data.status];

  const tooltipLines: string[] = [info.label];
  if (data.calculated_Ith_kA !== undefined && data.rated_Ith_kA !== undefined) {
    tooltipLines.push(`Ith: ${data.calculated_Ith_kA.toFixed(1)} / ${data.rated_Ith_kA.toFixed(1)} kA`);
  }
  if (data.calculated_Idyn_kA !== undefined && data.rated_Idyn_kA !== undefined) {
    tooltipLines.push(`Idyn: ${data.calculated_Idyn_kA.toFixed(1)} / ${data.rated_Idyn_kA.toFixed(1)} kA`);
  }
  if (data.utilization !== undefined) {
    tooltipLines.push(`Wykorzystanie: ${(data.utilization * 100).toFixed(0)}%`);
  }

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      data-testid={`equipment-proof-badge-${data.status}`}
    >
      <circle cx={0} cy={0} r={8} fill={info.color} fillOpacity={0.15} stroke={info.color} strokeWidth={1.5} />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={700}
        fill={info.color}
      >
        {info.icon}
      </text>
      {data.status === 'fail' && (
        // Pulsing ring dla fail - alarm visual
        <circle cx={0} cy={0} r={11} fill="none" stroke={info.color} strokeWidth={1.5} opacity={0.4}>
          <animate attributeName="r" from="8" to="14" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
      <title>{tooltipLines.join('\n')}</title>
    </g>
  );
}

/**
 * Pure helper - oblicza status na bazie obliczonych vs rated prądów.
 */
export function computeEquipmentProofStatus(
  calculated_Ith_kA: number | undefined,
  rated_Ith_kA: number | undefined,
  calculated_Idyn_kA?: number,
  rated_Idyn_kA?: number,
): EquipmentProofStatus {
  let worstUtil = 0;
  if (calculated_Ith_kA !== undefined && rated_Ith_kA !== undefined && rated_Ith_kA > 0) {
    worstUtil = Math.max(worstUtil, calculated_Ith_kA / rated_Ith_kA);
  }
  if (calculated_Idyn_kA !== undefined && rated_Idyn_kA !== undefined && rated_Idyn_kA > 0) {
    worstUtil = Math.max(worstUtil, calculated_Idyn_kA / rated_Idyn_kA);
  }
  if (worstUtil >= 1.0) return 'fail';
  if (worstUtil >= 0.8) return 'warning';
  return 'ok';
}
