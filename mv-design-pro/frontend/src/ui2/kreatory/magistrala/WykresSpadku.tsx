/**
 * Profil napięcia wzdłuż magistrali — poglądowy wykres SVG ilustrujący, że napięcie
 * spada wzdłuż odcinka i że niższy cosφ pogłębia spadek (większy udział składowej
 * biernej na reaktancji). Czysta prezentacja TRENDU wg nastawy cosφ — NIE wynik
 * solvera; rzeczywisty spadek (ΔU) liczy rozpływ mocy dla katalogowego R/X, długości i
 * obciążenia. Skala poglądowa (założenie R≈X); ZERO fizyki sieci. Baza: rama/wykresPomoc.
 */

import { PAD, RamkaWykresu, VBH, VBW, px, py } from '../rama';
import { MAGISTRALA_STRINGS as T } from './strings';

/** Profil U(x) od źródła (1,0 pu) do końca; nachylenie zależne poglądowo od cosφ. */
export function WykresSpadku({ cosPhi }: { cosPhi: number }) {
  const c = Math.max(0.1, Math.min(1, cosPhi));
  const sin = Math.sqrt(Math.max(0, 1 - c * c));
  // Spadek poglądowy: baza 4% skalowana przez (cosφ + sinφ) — dla R≈X (im niższy cosφ,
  // tym stromszy profil). Rzeczywistą wartość liczy rozpływ; tu tylko trend.
  const drop = 0.04 * (c + sin);
  const vMin = 0.9;
  const vMax = 1.02;
  const ny = (v: number) => (v - vMin) / (vMax - vMin);
  const uEnd = 1 - drop;
  const limit = 0.95; // typowy dopuszczalny poziom (poglądowo)
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-wykres-svg" role="img" aria-label={T.wykresAria}>
      {/* pasmo poza dopuszczalnym zakresem (poniżej limitu) */}
      <rect
        x={PAD.l}
        y={py(ny(limit))}
        width={px(1) - PAD.l}
        height={Math.max(0, py(0) - py(ny(limit)))}
        className="mvd-wykres-pasmo"
      />
      {/* napięcie znamionowe 1,0 pu i limit */}
      <line x1={PAD.l} y1={py(ny(1))} x2={px(1)} y2={py(ny(1))} className="mvd-wykres-siatka" />
      <line x1={PAD.l} y1={py(ny(limit))} x2={px(1)} y2={py(ny(limit))} className="mvd-wykres-prog" />
      <RamkaWykresu osX={T.wykresOsX} osY={T.wykresOsU} />
      {/* profil napięcia */}
      <line x1={px(0)} y1={py(ny(1))} x2={px(1)} y2={py(ny(uEnd))} className="mvd-wykres-krzywa" />
      <circle cx={px(0)} cy={py(ny(1))} r={3} className="mvd-wykres-punkt" />
      <circle cx={px(1)} cy={py(ny(uEnd))} r={3} className="mvd-wykres-punkt" />
      <text x={px(1) - 4} y={py(ny(limit)) - 5} textAnchor="end" className="mvd-wykres-znak">
        {T.wykresLimit}
      </text>
      <text x={px(0) + 4} y={py(ny(1)) - 6} className="mvd-wykres-znak">
        {T.wykresZrodlo}
      </text>
    </svg>
  );
}
