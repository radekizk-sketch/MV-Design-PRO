/**
 * Sztywność sieci zasilającej (GPZ) — poglądowy wykres SVG zależności impedancji źródła
 * od mocy zwarciowej: Z ∝ 1/Sk″ (Z = c·U²/Sk″). Czysta prezentacja prawa (hiperbola
 * znormalizowana Z/Zn vs Sk/Skn): im większa moc zwarciowa, tym mniejsza impedancja
 * źródła i „sztywniejsza" sieć (wyższe prądy zwarciowe, mniejsze wahania napięcia).
 * NIE wynik solvera; rzeczywiste Ik″/Z liczy backend wg IEC 60909. Baza: rama/wykresPomoc.
 */

import { PAD, RamkaWykresu, VBH, VBW, px, py } from '../rama';
import { ZRODLO_STRINGS as T } from './strings';

/** Hiperbola Z/Zn = Skn/Sk″ z punktem odniesienia (1;1). */
export function WykresSztywnosci() {
  const sMin = 0.3;
  const sMax = 3;
  const zMax = 3.5; // Z/Zn przy sMin≈0,3 to ~3,33 — margines osi
  const nx = (s: number) => (s - sMin) / (sMax - sMin);
  const ny = (z: number) => z / zMax;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const s = sMin + ((sMax - sMin) * i) / 60;
    pts.push(`${px(nx(s)).toFixed(1)},${py(ny(1 / s)).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-wykres-svg" role="img" aria-label={T.wykresAria}>
      {/* linie odniesienia Sk=Skn, Z=Zn */}
      <line x1={px(nx(1))} y1={PAD.t} x2={px(nx(1))} y2={py(0)} className="mvd-wykres-siatka" />
      <line x1={PAD.l} y1={py(ny(1))} x2={px(1)} y2={py(ny(1))} className="mvd-wykres-siatka" />
      <RamkaWykresu osX={T.wykresOsSk} osY={T.wykresOsZ} />
      <polyline points={pts.join(' ')} className="mvd-wykres-krzywa" />
      <circle cx={px(nx(1))} cy={py(ny(1))} r={3} className="mvd-wykres-punkt" />
      <text x={px(nx(1)) + 6} y={py(ny(1)) - 6} className="mvd-wykres-znak">
        {T.wykresPunkt}
      </text>
    </svg>
  );
}
