/**
 * QET-SCADA Frame 2.0 — akceptacja właścicielska: dwa stany, dwie ramki.
 *
 * ZAMKNIĘTY = czerwona #F05260; OTWARTY = zielona #2CCF93.
 * Błędny stan ENM nie posiada reprezentacji geometrycznej — bez trzeciego
 * koloru, znaku zapytania, migania, znaczników alarmu i blokad na SLD.
 *
 * Ramka NIE KODUJE napięcia, przepływu, alarmu ani wyniku solvera.
 */
import type { ReactNode } from 'react';
import { ocenStanRamki, type ScadaFrameInput } from './scadaFrameState';

export interface QetScadaFrameProps {
  readonly input: ScadaFrameInput;
  /** Obwiednia korpusu aparatu bez przewodów i punktów przyłączenia. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Dziecko musi pochodzić ze wspólnego renderera CadSymbol/QET. */
  readonly children: ReactNode;
  readonly label?: string;
  /** Opcjonalnie do planszy/atlasu; domyślnie brak podpisu przy aparacie. */
  readonly showStateLabel?: boolean;
  readonly testId?: string;
}

export function QetScadaFrame(props: QetScadaFrameProps): JSX.Element {
  const stan = ocenStanRamki(props.input);
  const kolor = stan.ramka === 'ZAMKNIETY' ? '#F05260' :
    stan.ramka === 'OTWARTY' ? '#2CCF93' : null;
  const rysowacZnak = props.input.rodzaj !== 'LACZNIK' || stan.poprawnyDlaTopologii;

  return (
    <g
      role="group"
      aria-label={`${props.label ?? props.input.elementRef}: ${stan.etykieta}`}
      data-testid={props.testId}
      data-scada-frame-v1="true"
      data-element-ref={props.input.elementRef}
      data-position={stan.ramka}
      data-state-source={stan.zrodlo}
      data-data-quality={props.input.jakosc}
      data-results-current={stan.wynikiAktualne ? 'true' : 'false'}
      data-energization={props.input.zasilenie}
      data-simulation-action-ready={stan.moznaSymulowacZmiane ? 'true' : 'false'}
      data-validation-valid={stan.poprawnyDlaTopologii ? 'true' : 'false'}
      data-contradiction={stan.niespojnosc ? 'true' : 'false'}
    >
      {kolor && (
        <rect
          x={props.x} y={props.y} width={props.width} height={props.height}
          rx={3} fill={kolor} fillOpacity={0.085}
          stroke={kolor} strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          data-cad-overlay="mechanical-position"
          pointerEvents="none"
        />
      )}
      {rysowacZnak ? props.children : null}
      {props.showStateLabel && kolor && (
        <text x={props.x + props.width / 2}
          y={props.y + props.height + 9}
          textAnchor="middle" fontSize={5.5} fontWeight={700}
          fill={kolor}
          pointerEvents="none"
          data-cad-overlay="state-caption"
        >{stan.etykieta}</text>
      )}
    </g>
  );
}
