/**
 * Charakterystyka regulacji napięcia (AVR/przełącznik zaczepów) — poglądowy wykres SVG
 * kształtu prawa regulacji wg nastaw projektanta (specyfikacja, NIE wynik solvera).
 * Rzeczywiste napięcie szyny i wybraną pozycję zaczepu liczy rozpływ mocy (pętla OLTC).
 * ZERO fizyki sieci: rysunek zależy wyłącznie od nastaw (zakres/krok zaczepów, napięcie
 * zadane, pasmo) — bez napięć z rozwiązanego przypadku. Baza wspólna: rama/wykresPomoc.
 */

import { PAD, RamkaWykresu, VBH, VBW, px, py } from '../rama';
import { TRANSFORMATOR_STRINGS as T } from './strings';

export interface WykresAvrProps {
  tapMin: number;
  tapMax: number;
  tapNeutral: number;
  stepPct: number;
  /** Ułamkowa połowa pasma nieczułości (pasmo_kV / napięcie_zadane_kV); null = brak (tryb ręczny/DETC). */
  dbFrac: number | null;
}

/** Wykres: osiągalne napięcie szyny per zaczep (kropki) + pasmo nieczułości wokół napięcia zadanego. */
export function WykresAvr({ tapMin, tapMax, tapNeutral, stepPct, dbFrac }: WykresAvrProps) {
  // Napięcie względne osiągane na danym zaczepie: 1 pu w pozycji neutralnej ± krok·liczba zaczepów.
  const vOf = (tap: number): number => 1 + ((tap - tapNeutral) * stepPct) / 100;
  const taps: number[] = [];
  for (let t = tapMin; t <= tapMax; t += 1) taps.push(t);
  const vLo = vOf(tapMin);
  const vHi = vOf(tapMax);
  const bandLo = dbFrac !== null ? 1 - dbFrac : 1;
  const bandHi = dbFrac !== null ? 1 + dbFrac : 1;
  const yLo = Math.min(vLo, vHi, bandLo) - 0.02;
  const yHi = Math.max(vLo, vHi, bandHi) + 0.02;
  const nx = (tap: number) => (tapMax === tapMin ? 0.5 : (tap - tapMin) / (tapMax - tapMin));
  const ny = (v: number) => (yHi === yLo ? 0.5 : (v - yLo) / (yHi - yLo));
  const linia = taps.map((t) => `${px(nx(t)).toFixed(1)},${py(ny(vOf(t))).toFixed(1)}`).join(' ');
  // Ogranicz liczbę rysowanych kropek (czytelność) — pokaż co drugi zaczep dla dużych zakresów.
  const skok = taps.length > 25 ? 2 : 1;
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-wykres-svg" role="img" aria-label={T.teoriaRegTytul}>
      {dbFrac !== null ? (
        <rect
          x={PAD.l}
          y={py(ny(bandHi))}
          width={px(1) - PAD.l}
          height={Math.max(0, py(ny(bandLo)) - py(ny(bandHi)))}
          className="mvd-wykres-pasmo"
        />
      ) : null}
      {/* napięcie zadane (1.0 pu) */}
      <line x1={PAD.l} y1={py(ny(1))} x2={px(1)} y2={py(ny(1))} className="mvd-wykres-siatka" />
      {/* zaczep neutralny */}
      <line x1={px(nx(tapNeutral))} y1={PAD.t} x2={px(nx(tapNeutral))} y2={py(0)} className="mvd-wykres-siatka" />
      <RamkaWykresu osX={T.avrOsTap} osY={T.avrOsU} />
      <polyline points={linia} className="mvd-wykres-krzywa" />
      {taps
        .filter((_, i) => i % skok === 0)
        .map((t) => (
          <circle key={t} cx={px(nx(t))} cy={py(ny(vOf(t)))} r={2.4} className="mvd-wykres-punkt" />
        ))}
      {dbFrac !== null ? (
        <text x={px(1) - 4} y={py(ny(1)) - 5} textAnchor="end" className="mvd-wykres-znak">
          {T.avrZadane}
        </text>
      ) : null}
    </svg>
  );
}
