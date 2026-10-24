/**
 * Nakładka SCADA 1.0 dla JEDNEGO zatwierdzonego glifu CAD.
 *
 * Ramka nie zastępuje symbolu i nie wykonuje logiki elektroenergetycznej.
 * Dziecko jest rysowane JEDYNYM istniejącym rendererem (CadSymbol albo
 * adaptacja prymitywów QET), a geometria toru pozostaje po stronie ENM.
 *
 * Projekt: 2026-10-24, akceptacja koncepcji właściciela:
 * czerwony = ZAMKNIĘTY, zielony = OTWARTY, nieznany = szary.
 */
import type { ReactNode } from 'react';
import { ocenStanRamki, type ScadaFrameInput, type RodzajRamki } from './scadaFrameState';

export interface QetScadaFrameProps {
  readonly input: ScadaFrameInput;
  /** Wymiary ramki odnoszą się do gabarytu KORPUSU aparatu, nie zacisków. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Ta sama geometria główna QET/CadSymbol. Nie wstawiać ikon React. */
  readonly children: ReactNode;
  readonly label?: string;
  readonly showStateLabel?: boolean;
  readonly showSource?: boolean;
  readonly testId?: string;
  readonly theme?: 'dark'|'light';
}

const KOLORY: Readonly<Record<RodzajRamki, string>> = {
  ZAMKNIETY: '#F05260',
  OTWARTY: '#2CCF93',
  NIEZNANY: '#96AAB6',
  PRZEJSCIOWY: '#FAB356',
  BRAK_RAMKI: '#96AAB6',
};

const ZRODLO_PL: Readonly<Record<ScadaFrameInput['zrodlo'], string>> = {
  TELEMETRIA: 'TELEMETRIA',
  ENM: 'MODEL ENM',
  SYMULACJA: 'SYMULACJA',
};

export function QetScadaFrame(props: QetScadaFrameProps): JSX.Element {
  const stan = ocenStanRamki(props.input);
  const kolor = KOLORY[stan.ramka];
  const tlo = props.theme === 'light' ? '#FFFFFF' : '#112634';
  const etykieta = props.label ?? props.input.elementRef;
  const rysowacRamke = stan.ramka !== 'BRAK_RAMKI';
  const quality = props.input.jakosc;
  return (
    <g
      role="group"
      aria-label={`${etykieta}: ${stan.etykieta}; ${ZRODLO_PL[stan.zrodlo]}; jakość: ${quality}`}
      data-testid={props.testId}
      data-scada-frame-v1="true"
      data-element-ref={props.input.elementRef}
      data-position={stan.ramka}
      data-state-source={stan.zrodlo}
      data-data-quality={quality}
      data-results-current={stan.wynikiAktualne ? 'true' : 'false'}
      data-energization={props.input.zasilenie}
      data-simulation-action-ready={stan.moznaSymulowacZmiane ? 'true' : 'false'}
      data-contradiction={stan.niespojnosc ? 'true' : 'false'}
    >
      {rysowacRamke && (
        <rect
          x={props.x} y={props.y} width={props.width} height={props.height}
          rx={3}
          fill={kolor}
          fillOpacity={0.085}
          stroke={kolor}
          strokeWidth={1.5}
          strokeDasharray={stan.ramka === 'NIEZNANY' ? '3 2' : undefined}
          vectorEffect="non-scaling-stroke"
          data-cad-overlay="mechanical-position"
          pointerEvents="none"
        />
      )}
      {props.children}
      {/* Stan nieznany ≠ mechaniczny nóż otwarty. Dotyczy to także awarii łączności. */}
      {stan.ramka === 'NIEZNANY' && (
        <g data-cad-overlay="unknown" pointerEvents="none">
          <circle cx={props.x + props.width - 1.5} cy={props.y + 1.5}
            r={4.5} fill={tlo} stroke={kolor} strokeWidth={1} />
          <text x={props.x + props.width - 1.5} y={props.y + 2.9}
            fill={kolor} textAnchor="middle" fontSize={5.8} fontWeight={800}>?</text>
        </g>
      )}
      {stan.alarm && (
        <g data-cad-overlay="alarm" pointerEvents="none">
          <rect x={props.x + props.width - 5} y={props.y - 6}
            width={10} height={9} rx={1.5} fill="#F8AA3B" />
          <text x={props.x + props.width} y={props.y + .4}
            fill="#17212B" textAnchor="middle" fontWeight={800} fontSize={7}>!</text>
        </g>
      )}
      {stan.blokada && (
        <g data-cad-overlay="blocked" pointerEvents="none">
          <rect x={props.x - 5} y={props.y - 5} width={10} height={8}
            rx={1} fill={tlo} stroke="#F8AA3B" strokeWidth={1} />
          <text x={props.x} y={props.y + 1} fontSize={5} fontWeight={700}
            textAnchor="middle" fill="#F8AA3B">B</text>
        </g>
      )}
      {props.showStateLabel !== false && (
        <text
          x={props.x + props.width / 2} y={props.y + props.height + 9}
          textAnchor="middle" fontSize={5.5} fontWeight={700}
          fill={kolor} data-cad-overlay="state-caption"
          pointerEvents="none"
        >{stan.etykieta}</text>
      )}
      {props.showSource && (
        <text
          x={props.x + props.width / 2} y={props.y + props.height + 15}
          textAnchor="middle" fontSize={4.2}
          fill={props.theme === 'light' ? '#486678' : '#9DB6C3'}
          data-cad-overlay="source-caption" pointerEvents="none"
        >{ZRODLO_PL[stan.zrodlo]}</text>
      )}
    </g>
  );
}
