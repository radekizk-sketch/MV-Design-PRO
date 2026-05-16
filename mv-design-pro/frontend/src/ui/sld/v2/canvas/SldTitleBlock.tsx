/**
 * K30-38 — SldTitleBlock: industrial title block per PN-EN ISO 7200.
 *
 * Standardowa metryka rysunku schematu rozdzielczego SN/nN:
 *   ┌───────────────────────────────────────┐
 *   │ PROJEKT · TYTUŁ                       │
 *   ├──────────────────────┬────────────────┤
 *   │ Sieć / klient        │ Format · Skala │
 *   │ GPZ / źródło         │ Arkusz X / Y   │
 *   ├──────────────────────┴────────────────┤
 *   │ Normy · Status                        │
 *   │ Projektant · Sprawdził · Rev · Data   │
 *   └───────────────────────────────────────┘
 *
 * Zgodnie z PN-EN ISO 7200 metryka musi zawierać minimum:
 * - Tytuł rysunku (drawing title)
 * - Numer rysunku (drawing number)
 * - Format arkusza (sheet format)
 * - Skala (scale)
 * - Osoba odpowiedzialna (designer / drafter)
 * - Sprawdzający (approver / verifier)
 * - Data wykonania (issue date)
 * - Rewizja (revision marker)
 *
 * Renderer jest pure SVG group; pozycjonowanie kontroluje rodzic (zwykle
 * bottom-right corner przy width/height kanwy).
 */

import type { JSX } from 'react';

export interface SldTitleBlockData {
  /** Project name (top header). */
  readonly projectName?: string;
  /** Drawing title (subtitle pod project name). */
  readonly drawingTitle?: string;
  /** Sieć / klient / opis grupy. */
  readonly networkLabel?: string;
  /** Źródło (np. "GPZ-A 110/15 kV"). */
  readonly sourceLabel?: string;
  /** Format arkusza (A3, A2, A1, A0). */
  readonly sheetFormat?: string;
  /** Skala (np. "1:1000"). */
  readonly scale?: string;
  /** Arkusz X z Y (np. "1/3"). */
  readonly sheetNumber?: string;
  /** Stosowane normy (np. "PN-EN 60617 · IEC 60909 · PN-HD 620 S2"). */
  readonly standards?: string;
  /** Status dokumentu (DRAFT / AUDIT / RELEASED). */
  readonly status?: 'DRAFT' | 'AUDIT' | 'RELEASED' | 'ARCHIVED';
  /** Drawing number (numer dokumentacji projektowej). */
  readonly drawingNumber?: string;
  /** Designer (projektant odpowiedzialny). */
  readonly designer?: string;
  /** Approver (sprawdził / zatwierdzający). */
  readonly approver?: string;
  /** Rewizja (rev. marker — np. K30-38 lub R02). */
  readonly revision?: string;
  /** Issue date (YYYY-MM-DD). */
  readonly issueDate?: string;
  /** OSD / operator sieci dystrybucyjnej (PGE / Enea / Energa / Tauron). */
  readonly osdOperator?: string;
  /** K30-99: SEP qualification number (uprawnienia budowlane / SEP D, E). */
  readonly designerQualification?: string;
  /** K30-99: SEP qualification number sprawdzającego. */
  readonly approverQualification?: string;
  /** K30-99: Inwestor (klient zlecający projekt). */
  readonly investor?: string;
  /** K30-99: Lokalizacja (adres / nr działki dla OSD wniosku). */
  readonly location?: string;
  /** K30-99: Phase (faza projektu — PB / PW / PR). */
  readonly phase?: 'PB' | 'PW' | 'PR' | 'PK';
}

export interface SldTitleBlockProps {
  readonly data?: SldTitleBlockData;
}

const STATUS_COLORS: Record<NonNullable<SldTitleBlockData['status']>, string> = {
  DRAFT: '#FF8B5C',
  AUDIT: '#FFD166',
  RELEASED: '#7EE0B5',
  ARCHIVED: '#7E8790',
};

/** Default values per typowy projekt MV-DESIGN-PRO. */
const DEFAULTS = {
  projectName: 'MV-DESIGN-PRO · SCHEMAT ROZDZIELCZY SN/nN',
  drawingTitle: '',
  networkLabel: 'Sieć: K30 (30 stacji)',
  sourceLabel: 'GPZ-A 110/15 kV',
  sheetFormat: 'A3',
  scale: '1:1000',
  sheetNumber: '1/1',
  standards: 'PN-EN 60617 · IEC 60909 · PN-HD 620 S2',
  status: 'AUDIT' as const,
  drawingNumber: '',
  designer: '',
  approver: '',
  revision: 'K30-38',
  issueDate: '',
  osdOperator: 'Operator OSD: ENEA',
  designerQualification: '',
  approverQualification: '',
  investor: '',
  location: '',
  phase: 'PB' as const,
};

export function SldTitleBlock(props: SldTitleBlockProps): JSX.Element {
  const data = { ...DEFAULTS, ...(props.data ?? {}) };
  const issueDate = data.issueDate || new Date().toISOString().split('T')[0];
  const statusColor = STATUS_COLORS[data.status];

  const totalHeight = 178;
  return (
    <g
      data-testid="sld-v2-title-block"
      data-status={data.status}
      pointerEvents="none"
    >
      {/* Frame */}
      <rect x={0} y={0} width={360} height={totalHeight} fill="#0A0E14" stroke="#5A6878" strokeWidth={1.4} />
      {/* Horizontal separators */}
      <line x1={0} y1={20} x2={360} y2={20} stroke="#5A6878" strokeWidth={0.8} />
      <line x1={0} y1={60} x2={360} y2={60} stroke="#5A6878" strokeWidth={0.8} />
      <line x1={0} y1={86} x2={360} y2={86} stroke="#5A6878" strokeWidth={0.8} />
      {/* Vertical separators */}
      <line x1={150} y1={20} x2={150} y2={86} stroke="#5A6878" strokeWidth={0.8} />
      <line x1={240} y1={60} x2={240} y2={86} stroke="#5A6878" strokeWidth={0.8} />

      {/* Row 1: Project name + drawing title */}
      <text x={6} y={14} fill="#DDF7FF" fontFamily="sans-serif" fontSize={10} fontWeight={800}>
        {data.projectName}
      </text>

      {/* Row 2 left: Network label + Source */}
      <text x={6} y={34} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
        {data.networkLabel}
      </text>
      <text x={6} y={46} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
        {data.sourceLabel}
      </text>

      {/* Row 2 right: Format + Scale + Sheet number */}
      <text x={156} y={34} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
        Format: {data.sheetFormat}
      </text>
      <text x={156} y={46} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
        Skala: {data.scale}
      </text>
      <text x={260} y={34} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
        Arkusz: {data.sheetNumber}
      </text>

      {/* Row 3 (60-86): Standards + Status (left) | Drawing # + OSD (right) */}
      <text x={6} y={74} fill="#7EE0B5" fontFamily="sans-serif" fontSize={9} fontWeight={700}>
        {data.standards}
      </text>
      <text x={156} y={74} fill={statusColor} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
        STATUS: {data.status}
      </text>
      <text x={246} y={74} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
        {data.osdOperator}
      </text>

      {/* Row 4 (86-108): Designer / Approver / Revision / Date — PN-EN ISO 7200 mandatory */}
      <text x={6} y={100} fill="#B9C0C7" fontFamily="sans-serif" fontSize={8}>
        Proj.: {data.designer || '—'}
      </text>
      <text x={100} y={100} fill="#B9C0C7" fontFamily="sans-serif" fontSize={8}>
        Sprawdz.: {data.approver || '—'}
      </text>
      <text x={206} y={100} fill="#7EC8FF" fontFamily="sans-serif" fontSize={8}>
        Rev. {data.revision}
      </text>
      <text x={266} y={100} fill="#7EC8FF" fontFamily="sans-serif" fontSize={8}>
        {issueDate}
      </text>
      {data.drawingNumber && (
        <text
          x={354}
          y={14}
          textAnchor="end"
          fill="#DDF7FF"
          fontFamily="sans-serif"
          fontSize={9}
          fontWeight={700}
          data-testid="sld-v2-title-block-drawing-number"
        >
          Nr rys.: {data.drawingNumber}
        </text>
      )}

      {/* K30-99: Investor + Location row (110-128) — OSD wniosek-grade context */}
      <line x1={0} y1={108} x2={360} y2={108} stroke="#5A6878" strokeWidth={0.8} />
      {(data.investor || data.location) && (
        <g data-testid="sld-v2-title-block-investor">
          <text x={6} y={118} fill="#B9C0C7" fontFamily="sans-serif" fontSize={8} fontWeight={700}>
            Inwestor:
          </text>
          <text x={50} y={118} fill="#DDF7FF" fontFamily="sans-serif" fontSize={8}>
            {data.investor || '—'}
          </text>
          <text x={6} y={128} fill="#B9C0C7" fontFamily="sans-serif" fontSize={8} fontWeight={700}>
            Lokalizacja:
          </text>
          <text x={62} y={128} fill="#DDF7FF" fontFamily="sans-serif" fontSize={8}>
            {data.location || '—'}
          </text>
        </g>
      )}
      <text
        x={354}
        y={118}
        textAnchor="end"
        fill="#FFD166"
        fontFamily="sans-serif"
        fontSize={9}
        fontWeight={700}
        data-testid="sld-v2-title-block-phase"
      >
        Faza: {data.phase}
      </text>

      {/* K30-99: Signature row (132-178) — designer / approver / investor stamps */}
      <line x1={0} y1={132} x2={360} y2={132} stroke="#5A6878" strokeWidth={0.8} />
      <line x1={120} y1={132} x2={120} y2={totalHeight} stroke="#5A6878" strokeWidth={0.8} />
      <line x1={240} y1={132} x2={240} y2={totalHeight} stroke="#5A6878" strokeWidth={0.8} />

      <g data-testid="sld-v2-title-block-designer-sig">
        <text x={6} y={142} fill="#7EC8FF" fontFamily="sans-serif" fontSize={8} fontWeight={700}>
          PROJEKTANT
        </text>
        <text x={6} y={152} fill="#DDF7FF" fontFamily="sans-serif" fontSize={8}>
          {data.designer || '—'}
        </text>
        <text x={6} y={162} fill="#88BBDD" fontFamily="sans-serif" fontSize={7}>
          Upr.: {data.designerQualification || '—'}
        </text>
        <rect x={6} y={166} width={108} height={10} fill="none" stroke="#5A6878" strokeWidth={0.6} strokeDasharray="2 2" />
        <text x={60} y={173} textAnchor="middle" fill="#5A6878" fontFamily="sans-serif" fontSize={6} fontStyle="italic">
          [pieczęć / podpis]
        </text>
      </g>

      <g data-testid="sld-v2-title-block-approver-sig">
        <text x={126} y={142} fill="#7EC8FF" fontFamily="sans-serif" fontSize={8} fontWeight={700}>
          SPRAWDZIŁ
        </text>
        <text x={126} y={152} fill="#DDF7FF" fontFamily="sans-serif" fontSize={8}>
          {data.approver || '—'}
        </text>
        <text x={126} y={162} fill="#88BBDD" fontFamily="sans-serif" fontSize={7}>
          Upr.: {data.approverQualification || '—'}
        </text>
        <rect x={126} y={166} width={108} height={10} fill="none" stroke="#5A6878" strokeWidth={0.6} strokeDasharray="2 2" />
        <text x={180} y={173} textAnchor="middle" fill="#5A6878" fontFamily="sans-serif" fontSize={6} fontStyle="italic">
          [pieczęć / podpis]
        </text>
      </g>

      <g data-testid="sld-v2-title-block-investor-sig">
        <text x={246} y={142} fill="#7EC8FF" fontFamily="sans-serif" fontSize={8} fontWeight={700}>
          INWESTOR / ODBIÓR
        </text>
        <text x={246} y={152} fill="#DDF7FF" fontFamily="sans-serif" fontSize={8}>
          {data.investor || '—'}
        </text>
        <text x={246} y={162} fill="#88BBDD" fontFamily="sans-serif" fontSize={7}>
          Akceptacja OSD
        </text>
        <rect x={246} y={166} width={108} height={10} fill="none" stroke="#5A6878" strokeWidth={0.6} strokeDasharray="2 2" />
        <text x={300} y={173} textAnchor="middle" fill="#5A6878" fontFamily="sans-serif" fontSize={6} fontStyle="italic">
          [podpis · data]
        </text>
      </g>
    </g>
  );
}
