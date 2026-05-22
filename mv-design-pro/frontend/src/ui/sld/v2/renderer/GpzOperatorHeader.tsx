/**
 * GpzOperatorHeader — Phase 1 expansion polish (operator-grade SLD plan v2).
 *
 * Header GPZ klasy SCADA OSD (Mikronika MIKRA / Sygnity-style):
 *   - Status transmisji (TRANSMISJA POPRAWNA / BRAK TRANSMISJI).
 *   - Nazwa GPZ (duża, pomarańczowo-żółta).
 *   - Adres stacji + radio number.
 *   - Bilans stacji (P [MW], Q [MVAr]).
 *   - Alarm strip (otwarte drzwi rozdzielni, AW UJP, telesterowanie).
 *   - "Kasowanie sygnalizacji" akcja.
 *
 * Kanon Energa / PSE / Tauron: header w rogu rozdzielni LUB nad GPZ.
 * Wszystkie pola opcjonalne — header self-degrades gdy danych brak.
 *
 * @see SLD_GPZ_SWITCHGEAR_DEPTH.md §22
 */

import {
  COLOR_BADGE_BG_RED,
  COLOR_BADGE_BG_YELLOW,
  COLOR_PANEL,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';

export type TransmissionStatus = 'ok' | 'degraded' | 'lost' | 'unknown';
export type ControlAvailabilityStatus = 'remote' | 'local' | 'blocked' | 'unknown';

export interface GpzStationBalance {
  /** Moc czynna w MW (snapshot SCADA). */
  readonly pMw?: number | null;
  /** Moc bierna w MVAr. */
  readonly qMvar?: number | null;
}

export interface GpzAlarmFlags {
  /** Otwarte drzwi rozdzielni (BHP). */
  readonly enclosureDoorOpen?: boolean;
  /** Automatyka WIZ / UJP w stanie alarmu. */
  readonly awUjpAlarm?: boolean;
  /** Pożar / dym w rozdzielni. */
  readonly fireAlarm?: boolean;
  /** Niska temperatura / wentylacja. */
  readonly hvacAlarm?: boolean;
}

export interface GpzOperatorHeaderProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Nazwa GPZ (np. "GPZ-5 PST", "GPZ-21 KEK"). */
  readonly gpzName: string;
  /** Adres stacji (opcjonalny) — np. "ul. Poznańska 13/15". */
  readonly addressLine?: string;
  /** Radio / komunikacja ID — np. "radio nr 587". */
  readonly radioId?: string;
  /** Status transmisji SCADA. */
  readonly transmissionStatus?: TransmissionStatus;
  /** Status sterowania (zdalne/lokalne dispatcher-level). */
  readonly controlAvailability?: ControlAvailabilityStatus;
  /** Bilans stacji. */
  readonly balance?: GpzStationBalance;
  /** Alarm flags (BHP, automatyka). */
  readonly alarms?: GpzAlarmFlags;
  /** Click handler na "Kasowanie sygnalizacji" akcję. */
  readonly onResetSignalsClick?: () => void;
}

const HEADER_PADDING = 6;
const ROW_HEIGHT = 14;

const TRANSMISSION_LABELS_PL: Readonly<Record<TransmissionStatus, string>> = {
  ok: 'TRANSMISJA POPRAWNA',
  degraded: 'TRANSMISJA OGRANICZONA',
  lost: 'BRAK TRANSMISJI',
  unknown: '',
};

const TRANSMISSION_COLORS: Readonly<Record<TransmissionStatus, string>> = {
  ok: '#13C45A',       // zielony (norma OSD)
  degraded: '#FFB020', // pomarańczowy
  lost: '#FF4040',     // czerwony
  unknown: COLOR_TEXT_MUTED,
};

const CONTROL_LABELS_PL: Readonly<Record<ControlAvailabilityStatus, string>> = {
  remote: 'Telesterowanie czynne',
  local: 'Sterowanie lokalne',
  blocked: 'Sterowanie zablokowane',
  unknown: 'Sterowanie: ?',
};

const CONTROL_COLORS: Readonly<Record<ControlAvailabilityStatus, string>> = {
  remote: '#13C45A',
  local: COLOR_BADGE_BG_YELLOW,
  blocked: '#FF4040',
  unknown: COLOR_TEXT_MUTED,
};

/**
 * Główny GpzOperatorHeader — composite component.
 *
 * Layout (top-down):
 *   1. Transmission status (small, top-right corner align).
 *   2. GPZ name (large, central, kolor accent — pomarańczowo-żółty).
 *   3. Address + radio (small, mono).
 *   4. Balance: P [MW], Q [MVAr] (table).
 *   5. Alarm strip (gdy są flags).
 *   6. Control availability + "Kasowanie sygnalizacji" akcja.
 */
export function GpzOperatorHeader(props: GpzOperatorHeaderProps): JSX.Element {
  const {
    x, y, width, gpzName,
    addressLine, radioId,
    transmissionStatus = 'unknown',
    controlAvailability,
    balance,
    alarms,
    onResetSignalsClick,
  } = props;

  // Compute total height (variable based on present fields)
  const hasAddress = !!addressLine || !!radioId;
  const hasBalance = balance && (balance.pMw !== undefined || balance.qMvar !== undefined);
  const hasKnownTransmission = transmissionStatus !== 'unknown';
  const hasAlarms = !!(alarms && (
    alarms.enclosureDoorOpen || alarms.awUjpAlarm
    || alarms.fireAlarm || alarms.hvacAlarm
  ));
  const hasBalanceSafe = !!hasBalance;
  const hasControl = !!controlAvailability;

  let cursorY = HEADER_PADDING;

  return (
    <g
      data-testid="sld-v2-gpz-operator-header"
      data-parity-key="gpz.header"
      data-gpz-name={gpzName}
      data-transmission={transmissionStatus}
      transform={`translate(${x}, ${y})`}
    >
      {/* Tło panelu */}
      <rect
        x={0}
        y={0}
        width={width}
        height={computeHeaderHeight({ hasAddress, hasBalance: hasBalanceSafe, hasAlarms, hasControl })}
        fill={COLOR_PANEL}
        stroke={COLOR_TEXT_MUTED}
        strokeOpacity={0.4}
        strokeWidth={1}
        rx={2}
      />

      {/* 1. Transmission status (top-right). Status unknown is intentionally silent. */}
      {hasKnownTransmission && (
        <g data-testid="gpz-header-transmission" data-parity-key="gpz.header.transmission">
          <text
            x={width - HEADER_PADDING}
            y={cursorY + 9}
            textAnchor="end"
            fill={TRANSMISSION_COLORS[transmissionStatus]}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.bayLabel}
            fontWeight={700}
          >
            {TRANSMISSION_LABELS_PL[transmissionStatus]}
          </text>
        </g>
      )}

      {/* 2. GPZ name — duża, accent yellow-orange */}
      <text
        x={width / 2}
        y={cursorY + 28}
        textAnchor="middle"
        fill={COLOR_BADGE_BG_YELLOW}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.switchgearParams}
        fontWeight={800}
        data-testid="gpz-header-name"
        data-parity-key="gpz.header.name"
      >
        {gpzName}
      </text>

      {(() => { cursorY += ROW_HEIGHT * 2 + 4; return null; })()}

      {/* 3. Address + radio */}
      {hasAddress && (
        <g data-testid="gpz-header-address" data-parity-key="gpz.header.address">
          {addressLine && (
            <text
              x={width / 2}
              y={cursorY + 8}
              textAnchor="middle"
              fill={COLOR_TEXT_SECONDARY}
              fontFamily={FONT_MONO}
              fontSize={FONT_SIZES.numericValue}
            >
              {addressLine}
            </text>
          )}
          {radioId && (
            <text
              x={width / 2}
              y={cursorY + 8 + (addressLine ? 11 : 0)}
              textAnchor="middle"
              fill={COLOR_TEXT_MUTED}
              fontFamily={FONT_MONO}
              fontSize={FONT_SIZES.numericValue}
            >
              {radioId}
            </text>
          )}
          {(() => {
            cursorY += (addressLine ? 11 : 0) + (radioId ? 11 : 0) + 4;
            return null;
          })()}
        </g>
      )}

      {/* 4. Balance — P/Q tabela */}
      {hasBalance && (
        <BalanceBlock x={HEADER_PADDING} y={cursorY} balance={balance!} width={width - HEADER_PADDING * 2} />
      )}
      {(() => { if (hasBalance) cursorY += ROW_HEIGHT * 3 + 4; return null; })()}

      {/* 5. Alarm strip */}
      {hasAlarms && (
        <AlarmStrip x={HEADER_PADDING} y={cursorY} alarms={alarms!} width={width - HEADER_PADDING * 2} />
      )}
      {(() => {
        if (hasAlarms) {
          const alarmCount = countActiveAlarms(alarms!);
          cursorY += alarmCount * ROW_HEIGHT + 4;
        }
        return null;
      })()}

      {/* 6. Control availability + reset signals action */}
      {hasControl && (
        <g data-testid="gpz-header-control" data-parity-key="gpz.header.control">
          <circle
            cx={HEADER_PADDING + 4}
            cy={cursorY + 6}
            r={3}
            fill={CONTROL_COLORS[controlAvailability!]}
          />
          <text
            x={HEADER_PADDING + 12}
            y={cursorY + 9}
            fill={CONTROL_COLORS[controlAvailability!]}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.bayLabel}
          >
            {CONTROL_LABELS_PL[controlAvailability!]}
          </text>
          {onResetSignalsClick && (
            <g
              data-testid="gpz-header-reset-signals"
              data-parity-key="gpz.header.reset_signals"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onResetSignalsClick(); }}
            >
              <text
                x={width - HEADER_PADDING}
                y={cursorY + 9}
                textAnchor="end"
                fill={COLOR_BADGE_BG_YELLOW}
                fontFamily={FONT_SANS}
                fontSize={FONT_SIZES.bayLabel}
                fontWeight={600}
              >
                ◆ Kasowanie sygnalizacji
              </text>
            </g>
          )}
        </g>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------------------
   Sub-components
   --------------------------------------------------------------------------- */

interface BalanceBlockProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly balance: GpzStationBalance;
}

function BalanceBlock(props: BalanceBlockProps): JSX.Element {
  const { x, y, width, balance } = props;
  const pPresent = balance.pMw !== null && balance.pMw !== undefined;
  const qPresent = balance.qMvar !== null && balance.qMvar !== undefined;
  const noResults = !pPresent && !qPresent;
  return (
    <g
      data-testid="gpz-header-balance"
      data-parity-key="gpz.header.balance"
      data-no-results={noResults ? 'true' : 'false'}
      transform={`translate(${x}, ${y})`}
    >
      <text
        x={0} y={9}
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={600}
      >
        Bilans stacji
      </text>
      {noResults ? (
        // Goal §7: brak wyniku ≠ 0.00. Pokazujemy explicit komunikat "Brak
        // wyników rozpływu" zamiast formatowanego zera.
        <g data-testid="gpz-header-balance-no-results">
          <rect
            x={0}
            y={13}
            width={width}
            height={ROW_HEIGHT * 2}
            fill={COLOR_PANEL_RAISED}
            stroke={COLOR_BADGE_BG_YELLOW}
            strokeOpacity={0.7}
            strokeDasharray="3 2"
          />
          <text
            x={width / 2}
            y={13 + ROW_HEIGHT}
            textAnchor="middle"
            fill={COLOR_BADGE_BG_YELLOW}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.bayLabel}
            fontWeight={600}
          >
            Wyniki rozpływu nieuruchomione
          </text>
        </g>
      ) : (
        <>
          {/* P row */}
          <rect x={0} y={13} width={width} height={ROW_HEIGHT} fill={COLOR_PANEL_RAISED} stroke={COLOR_TEXT_MUTED} strokeOpacity={0.3} />
          <text x={4} y={13 + 10} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={700}>P</text>
          <text
            x={width - 4}
            y={13 + 10}
            textAnchor="end"
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_MONO}
            fontSize={FONT_SIZES.numericValue}
            data-testid="gpz-header-balance-p-value"
          >
            {pPresent ? `${(balance.pMw as number).toFixed(1)} MW` : '— MW (do wyliczenia)'}
          </text>
          {/* Q row */}
          <rect x={0} y={13 + ROW_HEIGHT} width={width} height={ROW_HEIGHT} fill={COLOR_PANEL_RAISED} stroke={COLOR_TEXT_MUTED} strokeOpacity={0.3} />
          <text x={4} y={13 + ROW_HEIGHT + 10} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={700}>Q</text>
          <text
            x={width - 4}
            y={13 + ROW_HEIGHT + 10}
            textAnchor="end"
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_MONO}
            fontSize={FONT_SIZES.numericValue}
            data-testid="gpz-header-balance-q-value"
          >
            {qPresent ? `${(balance.qMvar as number).toFixed(1)} MVAr` : '— MVAr (do wyliczenia)'}
          </text>
        </>
      )}
    </g>
  );
}

interface AlarmStripProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly alarms: GpzAlarmFlags;
}

function AlarmStrip(props: AlarmStripProps): JSX.Element {
  const { x, y, width, alarms } = props;
  const items: { label: string; severity: 'red' | 'orange' }[] = [];
  if (alarms.fireAlarm) items.push({ label: 'POŻAR / DYM', severity: 'red' });
  if (alarms.enclosureDoorOpen) items.push({ label: 'Otwarte drzwi rozdzielni', severity: 'orange' });
  if (alarms.awUjpAlarm) items.push({ label: 'AW UJP', severity: 'red' });
  if (alarms.hvacAlarm) items.push({ label: 'Wentylacja / temperatura', severity: 'orange' });

  return (
    <g data-testid="gpz-header-alarms" data-parity-key="gpz.header.alarms" data-alarm-count={items.length} transform={`translate(${x}, ${y})`}>
      {items.map((item, idx) => {
        const color = item.severity === 'red' ? COLOR_BADGE_BG_RED : COLOR_BADGE_BG_YELLOW;
        return (
          <g key={idx} data-testid={`gpz-header-alarm-${idx}`}>
            <rect
              x={0} y={idx * ROW_HEIGHT}
              width={width}
              height={ROW_HEIGHT - 1}
              fill={color}
              fillOpacity={0.15}
              stroke={color}
              strokeWidth={0.8}
            />
            <text
              x={width / 2}
              y={idx * ROW_HEIGHT + 10}
              textAnchor="middle"
              fill={color}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.bayLabel}
              fontWeight={700}
            >
              ⚠ {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

function countActiveAlarms(alarms: GpzAlarmFlags): number {
  let count = 0;
  if (alarms.fireAlarm) count += 1;
  if (alarms.enclosureDoorOpen) count += 1;
  if (alarms.awUjpAlarm) count += 1;
  if (alarms.hvacAlarm) count += 1;
  return count;
}

function computeHeaderHeight(
  flags: { hasAddress: boolean; hasBalance: boolean; hasAlarms: boolean; hasControl: boolean },
): number {
  let h = HEADER_PADDING * 2;
  h += ROW_HEIGHT * 2 + 4; // transmission + GPZ name (compactly stacked)
  if (flags.hasAddress) h += ROW_HEIGHT + 4;
  if (flags.hasBalance) h += ROW_HEIGHT * 3 + 4;
  if (flags.hasAlarms) h += ROW_HEIGHT * 4 + 4; // max 4 alarms
  if (flags.hasControl) h += ROW_HEIGHT + 4;
  return h;
}
