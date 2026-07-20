/**
 * Wspólna baza wykresów charakterystyk kreatorów (V12K-067). Czysta prezentacja SVG:
 * rysunek kształtu PRAWA STEROWANIA / charakterystyki wg nastaw projektanta (specyfikacja,
 * NIE wynik solvera). Wyniki liczbowe zawsze z backendu. Kolory wyłącznie przez tokeny
 * --mvd-* (theme-aware). Deterministyczne (stałe wymiary). Wzorzec: WykresyNcRfg (OZE).
 *
 * Współdzielą to WSZYSTKIE wykresy w kreatorach — jeden układ współrzędnych, jedna rama,
 * jeden arkusz stylów (rama/wykresy.css). Reuse zamiast równoległych definicji.
 */

import './wykresy.css';

export const VBW = 440;
export const VBH = 210;
export const PAD = { l: 48, r: 18, t: 16, b: 34 } as const;
export const PLW = VBW - PAD.l - PAD.r;
export const PLH = VBH - PAD.t - PAD.b;

/** Mapowanie znormalizowanej wartości t∈[0,1] na piksel osi X (rośnie w prawo). */
export const px = (t: number): number => PAD.l + t * PLW;
/** Mapowanie t∈[0,1] na piksel osi Y (rośnie w górę → odwracamy). */
export const py = (t: number): number => PAD.t + (1 - t) * PLH;

/** Wspólna ramka wykresu: osie X/Y z etykietami. */
export function RamkaWykresu({ osX, osY }: { osX: string; osY: string }) {
  return (
    <>
      <line x1={PAD.l} y1={py(0)} x2={px(1)} y2={py(0)} className="mvd-wykres-os" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={py(0)} className="mvd-wykres-os" />
      <text x={px(1)} y={VBH - 8} textAnchor="end" className="mvd-wykres-etyk">
        {osX}
      </text>
      <text x={6} y={PAD.t + 4} className="mvd-wykres-etyk">
        {osY}
      </text>
    </>
  );
}
