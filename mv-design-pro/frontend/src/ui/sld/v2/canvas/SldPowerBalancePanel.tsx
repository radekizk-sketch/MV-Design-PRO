/**
 * K30-101 — SldPowerBalancePanel: bilans mocy podsumowanie dla OSD.
 *
 * Operator OSD weryfikuje że schemat ma bilans mocy zgodny z wnioskiem
 * o przyłączenie:
 *   P_źródło = ΣP_odbiory + ΣP_straty + ΣP_DER_eksport
 *
 * Tabela mocy + straty per Rozporządzenie MK ws. szczegółowych warunków
 * funkcjonowania systemu elektroenergetycznego (DZ.U. 2007 nr 93 poz. 623).
 *
 * Layout:
 *   ┌──────────────────────────────────┐
 *   │ BILANS MOCY (LF analiza)         │
 *   ├──────────────────────────────────┤
 *   │ P_źródło     │  3.150 MW         │
 *   │ ΣP_odbiory   │  2.880 MW         │
 *   │ ΣP_DER (gen) │  0.520 MW         │
 *   │ ΣP_straty    │  0.090 MW (2.85%) │
 *   │ ─────────────────────────────────│
 *   │ Bilans Δ     │  -0.020 MW (✓)    │
 *   └──────────────────────────────────┘
 */

import type { JSX } from 'react';

export interface PowerBalanceData {
  readonly pSourceMw: number | null;
  readonly pLoadsMw: number | null;
  readonly pDersMw: number | null;
  readonly pLossesMw: number | null;
}

export interface SldPowerBalancePanelProps {
  readonly data?: PowerBalanceData | null;
}

export function SldPowerBalancePanel(props: SldPowerBalancePanelProps): JSX.Element {
  const d = props.data ?? null;
  const lossPct = d?.pSourceMw != null && d?.pLossesMw != null && d.pSourceMw > 0
    ? (d.pLossesMw / d.pSourceMw) * 100
    : null;
  const balanceDelta = d?.pSourceMw != null && d?.pLoadsMw != null && d?.pLossesMw != null && d?.pDersMw != null
    ? d.pSourceMw + d.pDersMw - d.pLoadsMw - d.pLossesMw
    : null;
  const balanceOk = balanceDelta != null && Math.abs(balanceDelta) < 0.05;
  const lossColor = lossPct == null ? '#7E8790'
    : lossPct >= 5 ? '#F25F5F'
    : lossPct >= 3 ? '#FFD166'
    : '#13C45A';

  const fmt = (v: number | null | undefined, unit = ' MW'): string =>
    v == null ? '—' : `${v.toFixed(3)}${unit}`;

  return (
    <g
      data-testid="sld-v2-power-balance-panel"
      data-balance-ok={balanceOk ? 'true' : 'false'}
      pointerEvents="none"
    >
      <rect x={0} y={0} width={220} height={102} fill="#0A0E14" stroke="#5A6878" strokeWidth={1.2} />

      <text x={110} y={12} textAnchor="middle" fill="#7EC8FF" fontFamily="sans-serif" fontSize={9} fontWeight={800}>
        BILANS MOCY (LF)
      </text>
      <line x1={0} y1={16} x2={220} y2={16} stroke="#5A6878" strokeWidth={0.8} />

      <text x={6} y={28} fill="#88BBDD" fontFamily="sans-serif" fontSize={8}>P_źródło</text>
      <text x={214} y={28} textAnchor="end" data-testid="sld-v2-power-balance-source" fill="#7EE0B5" fontFamily="monospace" fontSize={9} fontWeight={700}>
        {fmt(d?.pSourceMw)}
      </text>

      <text x={6} y={42} fill="#88BBDD" fontFamily="sans-serif" fontSize={8}>ΣP_odbiory</text>
      <text x={214} y={42} textAnchor="end" data-testid="sld-v2-power-balance-loads" fill="#DDF7FF" fontFamily="monospace" fontSize={9} fontWeight={700}>
        {fmt(d?.pLoadsMw)}
      </text>

      <text x={6} y={56} fill="#88BBDD" fontFamily="sans-serif" fontSize={8}>ΣP_DER (gen)</text>
      <text x={214} y={56} textAnchor="end" data-testid="sld-v2-power-balance-der" fill="#FFD166" fontFamily="monospace" fontSize={9} fontWeight={700}>
        {fmt(d?.pDersMw)}
      </text>

      <text x={6} y={70} fill="#88BBDD" fontFamily="sans-serif" fontSize={8}>ΣP_straty</text>
      <text x={214} y={70} textAnchor="end" data-testid="sld-v2-power-balance-losses" fill={lossColor} fontFamily="monospace" fontSize={9} fontWeight={700}>
        {fmt(d?.pLossesMw)}
        {lossPct != null && ` (${lossPct.toFixed(2)}%)`}
      </text>

      <line x1={6} y1={78} x2={214} y2={78} stroke="#5A6878" strokeWidth={0.6} strokeDasharray="2 2" />

      <text x={6} y={92} fill="#B9C0C7" fontFamily="sans-serif" fontSize={8} fontWeight={700}>Bilans Δ</text>
      <text x={214} y={92} textAnchor="end" data-testid="sld-v2-power-balance-delta" fill={balanceOk ? '#13C45A' : '#FFD166'} fontFamily="monospace" fontSize={9} fontWeight={700}>
        {balanceDelta != null ? `${balanceDelta >= 0 ? '+' : ''}${balanceDelta.toFixed(3)} MW ${balanceOk ? '(✓)' : '(!)'}` : '—'}
      </text>
    </g>
  );
}
