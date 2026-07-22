/**
 * Charakterystyki czasowo-prądowe IDMT (IEC 60255) — poglądowy wykres SVG kształtu prawa
 * $t = TMS\cdot k/((I/I_s)^{\alpha}-1)$ dla trzech rodzin (SI/VI/EI). Czysta prezentacja
 * specyfikacji normy — NIE wynik solvera; rzeczywiste czasy/prądy liczy backend. Kolory
 * wyłącznie przez tokeny --mvd-* (theme-aware), wymiary stałe (deterministyczne).
 * Baza: rama/wykresPomoc. Wzorzec: WykresSztywnosci (zrodlo).
 */

import { PAD, RamkaWykresu, VBH, VBW, px, py } from '../rama';
import { PRZEKAZNIK_STRINGS as T } from './strings';

/** Krotność prądu I/Is w zakresie osi (log-poglądowo, liniowa oś dla czytelności). */
const M_MIN = 1.2;
const M_MAX = 20;
/** Czas znormalizowany do zakresu osi (górne obcięcie). */
const T_MAX = 3;

const RODZINY = [
  { k: 0.14, a: 0.02, klasa: 'mvd-wykres-krzywa', znak: T.wykresSi },
  { k: 13.5, a: 1, klasa: 'mvd-wykres-krzywa-przyklad', znak: T.wykresVi },
  { k: 80, a: 2, klasa: 'mvd-wykres-krzywa-lustro', znak: T.wykresEi },
] as const;

function krzywa(k: number, a: number): string {
  const nx = (m: number) => (m - M_MIN) / (M_MAX - M_MIN);
  const ny = (t: number) => Math.min(t, T_MAX) / T_MAX;
  const pts: string[] = [];
  for (let i = 0; i <= 80; i += 1) {
    const m = M_MIN + ((M_MAX - M_MIN) * i) / 80;
    const t = k / (Math.pow(m, a) - 1); // TMS = 1 (kształt poglądowy)
    if (!Number.isFinite(t) || t > T_MAX * 1.5) continue;
    pts.push(`${px(nx(m)).toFixed(1)},${py(ny(t)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Trzy poglądowe krzywe IDMT (SI/VI/EI) na wspólnym układzie współrzędnych. */
export function WykresIdmt() {
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-wykres-svg" role="img" aria-label={T.wykresAria}>
      <RamkaWykresu osX={T.wykresOsI} osY={T.wykresOsT} />
      {RODZINY.map((r) => (
        <polyline key={r.znak} points={krzywa(r.k, r.a)} className={r.klasa} />
      ))}
      <text x={px(0.62)} y={py(0.72)} className="mvd-wykres-znak">{T.wykresEi}</text>
      <text x={px(0.72)} y={py(0.42)} className="mvd-wykres-znak">{T.wykresVi}</text>
      <text x={px(0.82)} y={py(0.16)} className="mvd-wykres-znak">{T.wykresSi}</text>
      <line x1={px(0)} y1={PAD.t} x2={px(0)} y2={py(0)} className="mvd-wykres-siatka" />
    </svg>
  );
}
