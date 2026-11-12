/*
 * „Wróć do: <ekran>" (karta SLD-SKALA-I-NAWIGACJA, część W, pkt 4) — jeden
 * dyskretny element w istniejącym pasku narzędzi powłoki, w gnieździe kanwy
 * (obok przełącznika trybu pracy), widoczny wyłącznie po wejściu na schemat
 * z innego ekranu (`powrotZeSchematu.ts`). Bez nowego kafla, bez skoku
 * samoczynnego — powrót jest jawnym klikiem.
 */

import './schemat.css';
import { usePowrotZeSchematu, wrocDoEkranu } from '../../shell/powrotZeSchematu';
import { SCHEMAT_STRINGS as T } from './strings';

export function PowrotDoEkranu() {
  const wpis = usePowrotZeSchematu((s) => s.wpis);
  if (!wpis) return null;
  return (
    <button
      type="button"
      className="mvd-schemat-powrot"
      data-testid="mvd-schemat-powrot"
      title={T.powrotOpis(wpis.etykieta)}
      onClick={wrocDoEkranu}
    >
      <span aria-hidden="true">←</span> {T.powrot(wpis.etykieta)}
    </button>
  );
}
