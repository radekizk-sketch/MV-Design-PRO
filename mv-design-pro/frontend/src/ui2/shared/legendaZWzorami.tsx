/**
 * Legenda wykresu Recharts z nazwą serii jako wzorem.
 *
 * Nazwa serii (`<Line name={…}>`) trafia do legendy jako tekst HTML; nazwa ze wzorem `$…$`
 * (`Producent $Q_{\max}$`) bez składania pokazałaby projektantowi dolary. Formatter składa
 * nazwę przez `TekstZWzorami` (KaTeX) — jedno miejsce dla wszystkich wykresów `ui2`.
 * Strażnik `scripts/ui_math_guard.py` traktuje `name` serii jako wyświetlenie, dopóki legenda
 * pliku nie ma `formatter` (a domyślny dymek — `content`/`formatter`).
 */
import type { ReactNode } from 'react';

import { TekstZWzorami } from '../kreatory/rama/tekstZWzorami';

/** Formatter `<Legend formatter={legendaZWzorami} />`. */
export function legendaZWzorami(wartosc: unknown): ReactNode {
  return <TekstZWzorami tekst={String(wartosc)} />;
}
