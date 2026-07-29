/**
 * Podgląd pól rozdzielnicy SN (Audyt D, faza D3) — schemat jednokreskowy szyny
 * SN i pól stacji. WYŁĄCZNIE prezentacja: rysuje role pól i status szablonu
 * dobranego z katalogu (ZERO fizyki, ZERO obliczeń — geometria to układ rysunku).
 * Motywy z automatu przez tokeny --mvd-* i currentColor.
 */

import {
  FIELD_ROLE_LABELS,
  SOURCE_STATUS_LABEL_PL,
  bayKindLabel,
  isCompleteSourceStatus,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type { StationSnFieldTemplate } from './stacjaModel';

const WYSOKOSC = 168;
const SZYNA_Y = 40;
const SLUP_DOL = 132;

export interface PodgladRozdzielnicySnProps {
  snFields: readonly StationSnFieldTemplate[];
  testid?: string;
}

export function PodgladRozdzielnicySn({ snFields, testid }: PodgladRozdzielnicySnProps) {
  const liczba = Math.max(snFields.length, 1);
  const szerokosc = Math.max(360, 60 + liczba * 96);
  const skok = (szerokosc - 80) / liczba;
  const start = 40 + skok / 2;

  return (
    <div className="mvd-podglad-rozdzielnica" data-testid={testid}>
      <svg
        viewBox={`0 0 ${szerokosc} ${WYSOKOSC}`}
        role="img"
        aria-label="Podgląd rozdzielnicy SN stacji"
        style={{ width: '100%', height: 'auto', color: 'var(--mvd-ink)' }}
      >
        <line
          x1={28}
          y1={SZYNA_Y}
          x2={szerokosc - 28}
          y2={SZYNA_Y}
          stroke="var(--mvd-accent)"
          strokeWidth={4}
        />
        <text x={32} y={SZYNA_Y - 10} fill="var(--mvd-muted)" fontSize={10}>
          SZYNA SN
        </text>
        {snFields.map((field, index) => {
          const x = start + index * skok;
          const kompletne = isCompleteSourceStatus(field.source_status);
          const label = (FIELD_ROLE_LABELS[field.field_role] ?? field.field_role).replace('Pole ', '');
          const rodzaj = field.bay_template_ref ? bayKindLabel(field.bay_kind) : 'brak szablonu';
          return (
            <g key={`${field.field_role}-${index}`} data-testid={`mvd-podglad-pole-${field.field_role}`}>
              <rect
                x={x - 30}
                y={SZYNA_Y + 8}
                width={60}
                height={SLUP_DOL - SZYNA_Y - 4}
                fill="var(--mvd-panel-2)"
                stroke="var(--mvd-line)"
                strokeWidth={1}
                rx={4}
              />
              <line
                x1={x}
                y1={SZYNA_Y}
                x2={x}
                y2={SLUP_DOL}
                stroke="currentColor"
                strokeWidth={1.6}
              />
              <rect
                x={x - 8}
                y={SZYNA_Y + 30}
                width={16}
                height={16}
                fill="none"
                stroke={kompletne ? 'var(--mvd-accent)' : 'var(--mvd-err)'}
                strokeWidth={1.6}
              />
              <text x={x} y={24} textAnchor="middle" fill="var(--mvd-muted)" fontSize={11} fontWeight={700}>
                {index + 1}
              </text>
              <text x={x} y={SLUP_DOL + 16} textAnchor="middle" fill="currentColor" fontSize={9} fontWeight={700}>
                {label}
              </text>
              <text
                x={x}
                y={SLUP_DOL + 28}
                textAnchor="middle"
                fill={kompletne ? 'var(--mvd-muted)' : 'var(--mvd-err)'}
                fontSize={8}
              >
                {field.bay_template_ref ? SOURCE_STATUS_LABEL_PL[field.source_status] : rodzaj}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
