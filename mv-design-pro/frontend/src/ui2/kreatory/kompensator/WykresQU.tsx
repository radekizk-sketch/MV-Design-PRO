/**
 * Charakterystyka Q(U) baterii kondensatorów — poglądowy wykres SVG prawa fizycznego
 * Q ∝ U² (moc bierna pojemnościowa rośnie z kwadratem napięcia). Czysta prezentacja
 * kształtu zależności — NIE wynik solvera; rzeczywistą moc bierną w punkcie pracy liczy
 * rozpływ mocy dla napięcia z rozwiązanego przypadku. ZERO fizyki sieci (parabola
 * znormalizowana Q/Qn vs U/Un). Baza wspólna: rama/wykresPomoc.
 */

import { PAD, RamkaWykresu, VBH, VBW, px, py } from '../rama';
import { KOMPENSATOR_STRINGS as T } from './strings';

/** Q/Qn = (U/Un)² — parabola z zaznaczonym punktem znamionowym (1,0 pu; 1,0 pu). */
export function WykresQU() {
  const uMin = 0.85;
  const uMax = 1.1;
  const qMax = 1.3; // Q/Qn przy uMax≈1,1 to ~1,21 — margines osi
  const nx = (u: number) => (u - uMin) / (uMax - uMin);
  const ny = (q: number) => q / qMax;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const u = uMin + ((uMax - uMin) * i) / 60;
    pts.push(`${px(nx(u)).toFixed(1)},${py(ny(u * u)).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-wykres-svg" role="img" aria-label={T.wykresQuAria}>
      {/* linie znamionowe U=1, Q=1 */}
      <line x1={px(nx(1))} y1={PAD.t} x2={px(nx(1))} y2={py(0)} className="mvd-wykres-siatka" />
      <line x1={PAD.l} y1={py(ny(1))} x2={px(1)} y2={py(ny(1))} className="mvd-wykres-siatka" />
      <RamkaWykresu osX={T.wykresQuOsU} osY={T.wykresQuOsQ} />
      <polyline points={pts.join(' ')} className="mvd-wykres-krzywa" />
      {/* punkt znamionowy */}
      <circle cx={px(nx(1))} cy={py(ny(1))} r={3} className="mvd-wykres-punkt" />
      <text x={px(nx(1)) + 6} y={py(ny(1)) - 6} className="mvd-wykres-znak">
        {T.wykresQuPunkt}
      </text>
    </svg>
  );
}
