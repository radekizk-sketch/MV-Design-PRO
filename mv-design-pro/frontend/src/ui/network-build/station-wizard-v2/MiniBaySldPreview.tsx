/**
 * MiniBaySldPreview — szybki podgląd pola SN per typ vendor catalog.
 *
 * Renderuje SVG mini-SLD z apparatus stackiem zgodnym z FIELD_ROLE
 * (auto-konfiguracja po wyborze rozdzielnicy producenta). Używa
 * kanonicznych symboli IEC 60617 z `canonical_symbols/`.
 *
 * Krok 3 Kreatora (Pola SN) — prezentuje co operator zobaczy gdy
 * wybierze ABB SafePlus / Schneider RM6 / Siemens 8DJH itd.
 */
import { clsx } from 'clsx';

import type { CanonicalBayLayout } from './vendorSwitchgearCatalog';
import { autoConfigureBaysFromVendor, type AutoConfiguredBay } from './vendorBayRoleBridge';
import type { VendorSwitchgearTemplate } from './vendorSwitchgearCatalog';

export interface MiniBaySldPreviewProps {
  readonly template: VendorSwitchgearTemplate;
  /** Index wybranego pola w defaultBays. */
  readonly selectedBayIndex?: number;
  readonly onSelectBay?: (index: number) => void;
}

const BAY_COLOR_BY_LAYOUT: Record<CanonicalBayLayout, string> = {
  cable_in:    '#22c55e',  // zielony — zasilanie z GPZ
  cable_out:   '#22c55e',  // zielony — odpływ
  breaker:     '#00d4ff',  // cyan — pole wyłącznikowe
  transformer: '#f59e0b',  // amber — pole TR
  measurement: '#a78bfa',  // fioletowy — pomiarowe
  coupler:     '#ec4899',  // pink — sprzęgło
};

const BAY_WIDTH = 80;
const BAY_HEIGHT = 200;
const BUSBAR_Y = 30;
const APPARATUS_SPACING_Y = 32;

export function MiniBaySldPreview(props: MiniBaySldPreviewProps): JSX.Element {
  const { template, selectedBayIndex = 0, onSelectBay } = props;
  const bays = autoConfigureBaysFromVendor(template);
  const totalWidth = bays.length * BAY_WIDTH + 40;
  const totalHeight = BAY_HEIGHT + 60;

  return (
    <div
      data-testid="mini-bay-sld-preview"
      data-template={template.id}
      className="flex h-full flex-col rounded border border-[#1a2a3a] bg-[#080e18] p-3"
    >
      <header className="mb-2 border-b border-[#1a2a3a] pb-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4a6a8a]">
          Mini-SLD rozdzielnicy
        </div>
        <div className="text-[11px] font-semibold text-scada-text">{template.fullName}</div>
        <div className="text-[10px] text-[#4a6a8a]">
          Pola: {bays.length} · IAC {template.arcClass} · {template.ipRating} · {template.lscCategory}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <svg
          width={totalWidth}
          height={totalHeight}
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`Schemat rozdzielnicy ${template.fullName}`}
        >
          {/* Szyna SN — pozioma */}
          <line
            x1={20}
            y1={BUSBAR_Y}
            x2={totalWidth - 20}
            y2={BUSBAR_Y}
            stroke="#fbbf24"
            strokeWidth={3}
            data-testid="mini-sld-busbar"
          />
          <text
            x={totalWidth - 25}
            y={BUSBAR_Y - 5}
            fontSize={9}
            fill="#fbbf24"
            textAnchor="end"
          >
            {template.voltageLevels[0] || 15} kV
          </text>

          {/* Pola */}
          {bays.map((bay, i) => (
            <BaySvgColumn
              key={`bay-${i}`}
              bay={bay}
              index={i}
              x={20 + i * BAY_WIDTH + BAY_WIDTH / 2}
              busbarY={BUSBAR_Y}
              selected={selectedBayIndex === i}
              onClick={() => onSelectBay?.(i)}
            />
          ))}
        </svg>
      </div>

      {/* Lista pól tekstowo (pod SVG) */}
      <div className="mt-2 grid grid-cols-2 gap-1 border-t border-[#1a2a3a] pt-2">
        {bays.map((bay, i) => (
          <button
            key={`legend-${i}`}
            type="button"
            data-testid={`bay-legend-${i}`}
            onClick={() => onSelectBay?.(i)}
            className={clsx(
              'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left transition-colors',
              selectedBayIndex === i
                ? 'bg-[#00d4ff10] text-[#00d4ff]'
                : 'text-[#8a9aaa] hover:bg-[#0b1725]',
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: BAY_COLOR_BY_LAYOUT[bay.layout] }}
              aria-hidden
            />
            <span className="font-mono text-[10px]">{bay.designation}</span>
            <span className="min-w-0 flex-1 truncate text-[10px]">{bay.labelPl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface BaySvgColumnProps {
  readonly bay: AutoConfiguredBay;
  readonly index: number;
  readonly x: number;
  readonly busbarY: number;
  readonly selected: boolean;
  readonly onClick: () => void;
}

function BaySvgColumn(props: BaySvgColumnProps): JSX.Element {
  const { bay, index, x, busbarY, selected, onClick } = props;
  const color = BAY_COLOR_BY_LAYOUT[bay.layout];

  return (
    <g
      data-testid={`bay-column-${index}`}
      data-bay-layout={bay.layout}
      data-bay-selected={selected ? 'true' : 'false'}
      transform={`translate(${x}, 0)`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Wertical line — bay drop */}
      <line
        x1={0}
        y1={busbarY}
        x2={0}
        y2={busbarY + BAY_HEIGHT}
        stroke={selected ? color : '#4a6a8a'}
        strokeWidth={selected ? 2.5 : 1.5}
      />

      {/* Apparatus stack — render IEC 60617 symbols */}
      {bay.apparatusStack.map((apparatus, idx) => {
        const y = busbarY + 10 + idx * APPARATUS_SPACING_Y;
        return (
          <ApparatusSymbol
            key={`${apparatus}-${idx}`}
            type={apparatus}
            x={0}
            y={y}
            color={selected ? color : '#8a9aaa'}
          />
        );
      })}

      {/* Bay designation */}
      <text
        x={0}
        y={busbarY + BAY_HEIGHT + 18}
        fontSize={10}
        fill={selected ? color : '#8a9aaa'}
        textAnchor="middle"
        fontFamily="monospace"
        fontWeight={selected ? 'bold' : 'normal'}
      >
        {bay.designation}
      </text>

      {/* Selection highlight */}
      {selected && (
        <rect
          x={-BAY_WIDTH / 2 + 5}
          y={busbarY - 5}
          width={BAY_WIDTH - 10}
          height={BAY_HEIGHT + 30}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3 2"
          rx={4}
        />
      )}
    </g>
  );
}

interface ApparatusSymbolProps {
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

/** Uproszczone symbole apparatus dla preview (pełne IEC 60617 w canonical_symbols/). */
function ApparatusSymbol(props: ApparatusSymbolProps): JSX.Element {
  const { type, x, y, color } = props;
  const SIZE = 16;
  const half = SIZE / 2;

  switch (type) {
    case 'DS': // Odłącznik — diagonal line z kropką
      return (
        <g data-apparatus-type="DS">
          <circle cx={x} cy={y} r={2} fill={color} />
          <line x1={x} y1={y + 2} x2={x + half} y2={y - half + 2} stroke={color} strokeWidth={1.5} />
          <circle cx={x} cy={y + SIZE} r={2} fill={color} />
        </g>
      );
    case 'CB': // Wyłącznik — kwadrat z X
      return (
        <g data-apparatus-type="CB">
          <rect x={x - half + 2} y={y} width={SIZE - 4} height={SIZE} fill="none" stroke={color} strokeWidth={1.5} />
          <line x1={x - half + 4} y1={y + 3} x2={x + half - 4} y2={y + SIZE - 3} stroke={color} strokeWidth={1.2} />
          <line x1={x + half - 4} y1={y + 3} x2={x - half + 4} y2={y + SIZE - 3} stroke={color} strokeWidth={1.2} />
        </g>
      );
    case 'ES': // Uziemnik — ostrze + linie ziemi
      return (
        <g data-apparatus-type="ES">
          <line x1={x} y1={y} x2={x + half} y2={y + SIZE - 2} stroke={color} strokeWidth={1.5} />
          <line x1={x - half + 2} y1={y + SIZE} x2={x + half - 2} y2={y + SIZE} stroke={color} strokeWidth={1.5} />
          <line x1={x - half + 5} y1={y + SIZE + 2} x2={x + half - 5} y2={y + SIZE + 2} stroke={color} strokeWidth={1.2} />
          <line x1={x - 2} y1={y + SIZE + 4} x2={x + 2} y2={y + SIZE + 4} stroke={color} strokeWidth={1} />
        </g>
      );
    case 'CT': // Przekładnik prądowy — okrąg z linią
      return (
        <g data-apparatus-type="CT">
          <circle cx={x} cy={y + half} r={5} fill="none" stroke={color} strokeWidth={1.5} />
          <line x1={x} y1={y} x2={x} y2={y + SIZE} stroke={color} strokeWidth={1.5} />
        </g>
      );
    case 'VT': // Przekładnik napięciowy — okrąg z V
      return (
        <g data-apparatus-type="VT">
          <circle cx={x} cy={y + half} r={5} fill="none" stroke={color} strokeWidth={1.5} />
          <text x={x} y={y + half + 2} fontSize={6} fill={color} textAnchor="middle">V</text>
        </g>
      );
    case 'FUSE': // Bezpiecznik — prostokąt
      return (
        <g data-apparatus-type="FUSE">
          <rect x={x - 4} y={y} width={8} height={SIZE} fill="none" stroke={color} strokeWidth={1.2} />
        </g>
      );
    case 'SD': // Switch-Disconnector — load break switch
      return (
        <g data-apparatus-type="SD">
          <circle cx={x} cy={y + 2} r={1.5} fill={color} />
          <line x1={x} y1={y + 2} x2={x + half - 1} y2={y + SIZE - 4} stroke={color} strokeWidth={1.5} />
          <line x1={x - 3} y1={y + SIZE - 4} x2={x + 3} y2={y + SIZE - 4} stroke={color} strokeWidth={1.2} />
          <circle cx={x} cy={y + SIZE} r={1.5} fill={color} />
        </g>
      );
    default:
      return (
        <g data-apparatus-type={type}>
          <circle cx={x} cy={y + half} r={3} fill="none" stroke={color} strokeWidth={1.2} />
        </g>
      );
  }
}
