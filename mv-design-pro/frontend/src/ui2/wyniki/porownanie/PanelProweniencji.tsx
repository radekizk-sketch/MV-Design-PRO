/*
 * PanelProweniencji — panel proweniencji JEDNEGO biegu (A albo B), karta
 * CV-3.3-B (B1/B5). Wydzielony ze wspólnego pliku `EkranPorownania.tsx`
 * (karta CV-3.3-B2, D1: „ten sam panel proweniencji" dla WSZYSTKICH rodzajów
 * porównania — rozpływ, zwarcia, zabezpieczenia), żeby `TrybRozplywu` i
 * `TrybZabezpieczen` (oba osobne moduły) mogły go reużyć bez importu
 * cyklicznego przez `EkranPorownania.tsx`.
 *
 * `RunProvenance` ma IDENTYCZNY kształt w `power-flow-comparison/types.ts` i
 * `protection-comparison/types.ts` (oba pola 1:1 z `RunProvenanceResponse`
 * backendu) — strukturalne typowanie TS przyjmuje obiekt z dowolnego z tych
 * modułów bez rzutowania. Zero fizyki, zero wyliczeń — wyłącznie odczyt pól
 * przez `naLinieProweniencji` (`porownanieModel.ts`).
 */

import type { RunProvenance } from '../../../ui/power-flow-comparison/types';
import { naLinieProweniencji } from './porownanieModel';

export interface PanelProweniencjiProps {
  etykieta: string;
  dane: RunProvenance;
}

/** Panel proweniencji jednego biegu (A albo B) — karta CV-3.3-B, B1/B5. */
export function PanelProweniencji({ etykieta, dane }: PanelProweniencjiProps) {
  return (
    <dl className="mvd-por-proweniencja-panel" data-testid="mvd-por-proweniencja-panel">
      <div className="mvd-por-proweniencja-naglowek">{etykieta}</div>
      {naLinieProweniencji(dane).map((linia) => (
        <div key={linia.etykieta} className="mvd-por-szczegol-poz">
          <dt>{linia.etykieta}</dt>
          <dd className="mvd-num">{linia.wartosc}</dd>
        </div>
      ))}
    </dl>
  );
}
