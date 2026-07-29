/**
 * Trójkąt mocy odbioru — poglądowy wykres SVG zależności S/P/Q od cosφ (znormalizowany
 * S=1). Czysta prezentacja prawa trygonometrycznego: Q = P·tan(arccos cosφ) — im niższy
 * cosφ, tym większa moc bierna Q na tę samą moc czynną. NIE wynik solvera; rzeczywisty
 * pobór P/Q i rozkład napięć liczy rozpływ mocy. ZERO fizyki sieci. Baza: rama/wykresPomoc.
 */

import { RamkaWykresu, VBH, VBW, px, py } from '../rama';
import { ODBIOR_STRINGS as T } from './strings';

/** Trójkąt: przyprostokątne P (czynna) i Q (bierna), przeciwprostokątna S (pozorna). */
export function WykresTrojkatMocy({ cosPhi }: { cosPhi: number }) {
  const c = Math.max(0.1, Math.min(1, cosPhi));
  const sin = Math.sqrt(Math.max(0, 1 - c * c));
  const span = 1.15; // margines osi (S=1 mieści się z zapasem)
  const nx = (p: number) => p / span;
  const ny = (q: number) => q / span;
  const x0 = px(nx(0));
  const y0 = py(ny(0));
  const xP = px(nx(c));
  const yQ = py(ny(sin));
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-wykres-svg" role="img" aria-label={T.wykresAria}>
      <RamkaWykresu osX={T.wykresOsP} osY={T.wykresOsQ} />
      {/* przyprostokątna P (czynna) */}
      <line x1={x0} y1={y0} x2={xP} y2={y0} className="mvd-wykres-krzywa" />
      {/* przyprostokątna Q (bierna) */}
      <line x1={xP} y1={y0} x2={xP} y2={yQ} className="mvd-wykres-krzywa" />
      {/* przeciwprostokątna S (pozorna) */}
      <line x1={x0} y1={y0} x2={xP} y2={yQ} className="mvd-wykres-krzywa-lustro" />
      <circle cx={xP} cy={yQ} r={3} className="mvd-wykres-punkt" />
      <text x={(x0 + xP) / 2} y={y0 - 6} textAnchor="middle" className="mvd-wykres-znak">
        {T.wykresP}
      </text>
      <text x={xP + 6} y={(y0 + yQ) / 2} className="mvd-wykres-znak">
        {T.wykresQ}
      </text>
      <text x={(x0 + xP) / 2 - 6} y={(y0 + yQ) / 2 - 4} textAnchor="end" className="mvd-wykres-znak">
        {T.wykresS}
      </text>
      <text x={xP + 6} y={yQ - 4} className="mvd-wykres-znak">
        {`cosφ = ${c.toFixed(2)}`}
      </text>
    </svg>
  );
}
