/**
 * K30-100 — SldRevisionTable: revision history table (OSD-required).
 *
 * Tabela rewizji per Rozporządzenie MIiR ws. dokumentacji projektowej
 * (DZ.U. 2013 poz. 1129) — OSD wymaga listy zmian wprowadzonych w
 * projekcie z datą, opisem i podpisem.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │              TABELA REWIZJI                     │
 *   ├──┬──────────┬──────────────────┬──────┬─────────┤
 *   │R │  Data    │ Opis zmian       │ Proj.│Sprawdził│
 *   ├──┼──────────┼──────────────────┼──────┼─────────┤
 *   │0 │2026-04-01│ Pierwsza wersja  │ JK   │ AN      │
 *   │A │2026-05-10│ Zmiana TR4 → 800 │ JK   │ AN      │
 *   │B │2026-05-16│ Dodano PV pole 7 │ JK   │ AN      │
 *   └──┴──────────┴──────────────────┴──────┴─────────┘
 *
 * Pure SVG group, pozycjonowanie kontroluje rodzic.
 */

import type { JSX } from 'react';

export interface SldRevisionEntry {
  readonly rev: string;
  readonly date: string;
  readonly description: string;
  readonly designer: string;
  readonly approver: string;
}

export interface SldRevisionTableProps {
  readonly entries?: readonly SldRevisionEntry[];
  /** Max wierszy wyświetlanych (najnowsze). Default 5. */
  readonly maxRows?: number;
}

const DEFAULTS: readonly SldRevisionEntry[] = [];

export function SldRevisionTable(props: SldRevisionTableProps): JSX.Element {
  const entries = (props.entries ?? DEFAULTS).slice(-(props.maxRows ?? 5));
  const rowHeight = 12;
  const headerHeight = 22;
  const totalHeight = headerHeight + Math.max(1, entries.length) * rowHeight + 4;

  // Column X positions
  const cols = {
    rev: 0,
    date: 22,
    desc: 80,
    designer: 220,
    approver: 260,
    end: 300,
  };

  return (
    <g
      data-testid="sld-v2-revision-table"
      data-row-count={entries.length}
      pointerEvents="none"
    >
      {/* Frame */}
      <rect x={0} y={0} width={cols.end} height={totalHeight} fill="#0A0E14" stroke="#5A6878" strokeWidth={1.2} />

      {/* Title */}
      <text x={cols.end / 2} y={10} textAnchor="middle" fill="#7EC8FF" fontFamily="sans-serif" fontSize={9} fontWeight={800}>
        TABELA REWIZJI
      </text>
      <line x1={0} y1={14} x2={cols.end} y2={14} stroke="#5A6878" strokeWidth={0.8} />

      {/* Header row */}
      <g data-testid="sld-v2-revision-header">
        <text x={cols.rev + 2} y={headerHeight - 2} fill="#88BBDD" fontFamily="sans-serif" fontSize={7} fontWeight={700}>R</text>
        <text x={cols.date + 2} y={headerHeight - 2} fill="#88BBDD" fontFamily="sans-serif" fontSize={7} fontWeight={700}>Data</text>
        <text x={cols.desc + 2} y={headerHeight - 2} fill="#88BBDD" fontFamily="sans-serif" fontSize={7} fontWeight={700}>Opis zmian</text>
        <text x={cols.designer + 2} y={headerHeight - 2} fill="#88BBDD" fontFamily="sans-serif" fontSize={7} fontWeight={700}>Proj.</text>
        <text x={cols.approver + 2} y={headerHeight - 2} fill="#88BBDD" fontFamily="sans-serif" fontSize={7} fontWeight={700}>Sprawdził</text>
      </g>
      <line x1={0} y1={headerHeight} x2={cols.end} y2={headerHeight} stroke="#5A6878" strokeWidth={0.6} />

      {/* Vertical separators */}
      <line x1={cols.date} y1={14} x2={cols.date} y2={totalHeight} stroke="#5A6878" strokeWidth={0.4} />
      <line x1={cols.desc} y1={14} x2={cols.desc} y2={totalHeight} stroke="#5A6878" strokeWidth={0.4} />
      <line x1={cols.designer} y1={14} x2={cols.designer} y2={totalHeight} stroke="#5A6878" strokeWidth={0.4} />
      <line x1={cols.approver} y1={14} x2={cols.approver} y2={totalHeight} stroke="#5A6878" strokeWidth={0.4} />

      {/* Data rows */}
      {entries.length === 0 ? (
        <text
          x={cols.end / 2}
          y={headerHeight + rowHeight}
          textAnchor="middle"
          fill="#7E8790"
          fontFamily="sans-serif"
          fontSize={8}
          fontStyle="italic"
          data-testid="sld-v2-revision-empty"
        >
          Brak zmian
        </text>
      ) : (
        entries.map((e, i) => {
          const y = headerHeight + (i + 1) * rowHeight - 3;
          return (
            <g key={`${e.rev}-${i}`} data-testid={`sld-v2-revision-row-${e.rev}`}>
              <text x={cols.rev + 2} y={y} fill="#FFD166" fontFamily="monospace" fontSize={8} fontWeight={700}>
                {e.rev}
              </text>
              <text x={cols.date + 2} y={y} fill="#DDF7FF" fontFamily="monospace" fontSize={8}>
                {e.date}
              </text>
              <text x={cols.desc + 2} y={y} fill="#DDF7FF" fontFamily="sans-serif" fontSize={8}>
                {e.description.length > 26 ? `${e.description.substring(0, 24)}…` : e.description}
              </text>
              <text x={cols.designer + 2} y={y} fill="#88BBDD" fontFamily="sans-serif" fontSize={7}>
                {e.designer}
              </text>
              <text x={cols.approver + 2} y={y} fill="#88BBDD" fontFamily="sans-serif" fontSize={7}>
                {e.approver}
              </text>
            </g>
          );
        })
      )}
    </g>
  );
}
