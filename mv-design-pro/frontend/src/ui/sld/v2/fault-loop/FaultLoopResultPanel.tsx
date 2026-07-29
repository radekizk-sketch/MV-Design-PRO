/**
 * FaultLoopResultPanel — P0.5 FE component dla IEC 60364-4-41 fault loop results.
 *
 * Pure presentational component: bierze FaultLoopResult z API
 * (`POST /api/fault-loop/compute`) i renderuje WHITE BOX trace
 * w stylu SCADA OSD operator-grade.
 *
 * INVARIANTS:
 * - Pure component (props in, JSX out)
 * - NO physics calculations (display only)
 * - NO model mutation
 * - Polish 100% etykiety per V12K canon
 * - Deterministic per props
 *
 * Reference:
 * - backend/src/api/fault_loop.py (FaultLoopComputeResponse)
 * - backend/src/network_model/solvers/fault_loop_iec60364.py (solver)
 * - docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md § 2.5 (Fault-loop NN gap)
 */

import type { ReactNode } from 'react';

export interface FaultLoopComponent {
  readonly label: string;
  readonly r_ohm: number;
  readonly x_ohm: number;
  readonly magnitude_ohm: number;
}

export interface FaultLoopZLoop {
  readonly re: number;
  readonly im: number;
  readonly magnitude: number;
}

export interface FaultLoopResult {
  readonly fault_node_id: string;
  readonly network_type: string;
  readonly protection_arrangement: string;
  readonly u_nom_v: number;
  readonly components: readonly FaultLoopComponent[];
  readonly z_loop_ohm: FaultLoopZLoop;
  readonly ik_min_a: number;
  readonly ik_max_a: number;
  readonly white_box_trace: readonly Record<string, unknown>[];
}

export interface FaultLoopResultPanelProps {
  /** Wynik z API /api/fault-loop/compute (po deserializacji). */
  readonly result: FaultLoopResult;
  /** Opcjonalny className zewnętrzny. */
  readonly className?: string;
}

function fmtOhm(value: number): string {
  // 4 znaczące cyfry dla impedancji Ω (R/X mogą być 1e-3 do 1e+2)
  if (value === 0) return '0,0000 Ω';
  const abs = Math.abs(value);
  if (abs >= 1) return `${value.toFixed(3).replace('.', ',')} Ω`;
  if (abs >= 0.001) return `${(value * 1000).toFixed(2).replace('.', ',')} mΩ`;
  return `${(value * 1_000_000).toFixed(1).replace('.', ',')} µΩ`;
}

function fmtAmps(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace('.', ',')} kA`;
  return `${value.toFixed(0)} A`;
}

/**
 * Panel wyniku pętli zwarcia nN.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ Pętla zwarcia • TN-S • PE • Un=230 V    │
 *   ├─────────────────────────────────────────┤
 *   │ Z_loop = R + jX                          │
 *   │   R: 40,4 mΩ   X: 29,8 mΩ   |Z|: 50,2 mΩ│
 *   │                                          │
 *   │ I_k_min (c=0,95): 4357 A                 │
 *   │ I_k_max (c=1,05): 4814 A                 │
 *   ├─────────────────────────────────────────┤
 *   │ Składowe pętli:                          │
 *   │  • L 50 mm² Cu 30 m         R+X / |Z|    │
 *   │  • PE 25 mm² Cu 30 m        R+X / |Z|    │
 *   │  • TR 400 kVA SN/nN         R+X / |Z|    │
 *   └─────────────────────────────────────────┘
 */
export function FaultLoopResultPanel({
  result,
  className,
}: FaultLoopResultPanelProps): JSX.Element {
  const { z_loop_ohm: z, ik_min_a, ik_max_a, components, fault_node_id, network_type, protection_arrangement, u_nom_v } = result;

  return (
    <section
      data-testid="sld-fault-loop-result-panel"
      aria-label="Wynik pętli zwarcia nN (IEC 60364-4-41)"
      className={[
        'flex flex-col gap-2 rounded border border-scada-border bg-scada-panel/95 p-3 text-[12px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Header
        faultNodeId={fault_node_id}
        networkType={network_type}
        protectionArrangement={protection_arrangement}
        uNomV={u_nom_v}
      />

      <ZLoopBlock z={z} />

      <CurrentsBlock ikMinA={ik_min_a} ikMaxA={ik_max_a} />

      <ComponentsList components={components} />

      <footer
        className="mt-1 border-t border-scada-border pt-1 text-[10px] text-scada-muted"
        aria-label="Informacja o śladzie obliczeń (pełna jawność)"
      >
        Trace: {result.white_box_trace.length} kroków obliczeniowych (audytowalny).
      </footer>
    </section>
  );
}

function Header(props: {
  faultNodeId: string;
  networkType: string;
  protectionArrangement: string;
  uNomV: number;
}): JSX.Element {
  return (
    <header
      className="flex flex-wrap items-center gap-1 border-b border-scada-border pb-1 text-[11px]"
      data-testid="fault-loop-header"
    >
      <span className="font-semibold uppercase tracking-wider text-scada-muted">
        Pętla zwarcia nN
      </span>
      <Badge testid="fault-loop-network-type">{props.networkType}</Badge>
      <Badge testid="fault-loop-protection">{props.protectionArrangement}</Badge>
      <Badge testid="fault-loop-unom">
        Un = {props.uNomV.toFixed(0)} V
      </Badge>
      <span
        className="ml-auto font-mono-eng text-[10px] text-scada-muted"
        title={`Bus: ${props.faultNodeId}`}
      >
        @ {props.faultNodeId.slice(0, 18)}
        {props.faultNodeId.length > 18 ? '…' : ''}
      </span>
    </header>
  );
}

function Badge({
  children,
  testid,
}: {
  children: ReactNode;
  testid?: string;
}): JSX.Element {
  return (
    <span
      data-testid={testid}
      className="rounded border border-scada-border bg-scada-surface px-1.5 py-0.5 font-mono-eng text-[10px] text-scada-text"
    >
      {children}
    </span>
  );
}

function ZLoopBlock({ z }: { z: FaultLoopZLoop }): JSX.Element {
  return (
    <div
      data-testid="fault-loop-z-block"
      className="flex flex-col gap-0.5"
      aria-label="Impedancja pętli zwarcia Z_loop"
    >
      <div className="font-semibold text-scada-muted">Z_loop = R + jX</div>
      <div className="grid grid-cols-3 gap-2 font-mono-eng">
        <div>
          <span className="text-scada-muted">R:</span>{' '}
          <span data-testid="fault-loop-r" className="text-scada-text">
            {fmtOhm(z.re)}
          </span>
        </div>
        <div>
          <span className="text-scada-muted">X:</span>{' '}
          <span data-testid="fault-loop-x" className="text-scada-text">
            {fmtOhm(z.im)}
          </span>
        </div>
        <div>
          <span className="text-scada-muted">|Z|:</span>{' '}
          <span data-testid="fault-loop-magnitude" className="font-semibold text-scada-text">
            {fmtOhm(z.magnitude)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CurrentsBlock({
  ikMinA,
  ikMaxA,
}: {
  ikMinA: number;
  ikMaxA: number;
}): JSX.Element {
  return (
    <div
      data-testid="fault-loop-currents"
      className="flex flex-col gap-0.5"
      aria-label="Prąd zwarcia I_k (c-factor min/max)"
    >
      <div className="flex justify-between font-mono-eng">
        <span className="text-scada-muted">I_k_min (c=0,95):</span>
        <span data-testid="fault-loop-ik-min" className="text-scada-text">
          {fmtAmps(ikMinA)}
        </span>
      </div>
      <div className="flex justify-between font-mono-eng">
        <span className="text-scada-muted">I_k_max (c=1,05):</span>
        <span data-testid="fault-loop-ik-max" className="font-semibold text-emerald-300">
          {fmtAmps(ikMaxA)}
        </span>
      </div>
    </div>
  );
}

function ComponentsList({
  components,
}: {
  components: readonly FaultLoopComponent[];
}): JSX.Element {
  return (
    <details
      open
      className="border-t border-scada-border pt-1"
      data-testid="fault-loop-components"
    >
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-scada-muted">
        Składowe pętli ({components.length})
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
        {components.map((c) => (
          <li
            key={c.label}
            className="flex items-center justify-between gap-2 font-mono-eng"
            data-testid={`fault-loop-component-${c.label.replace(/\s+/g, '-')}`}
          >
            <span className="text-scada-text">{c.label}</span>
            <span className="text-scada-muted">
              R={fmtOhm(c.r_ohm)} X={fmtOhm(c.x_ohm)} |Z|={fmtOhm(c.magnitude_ohm)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
