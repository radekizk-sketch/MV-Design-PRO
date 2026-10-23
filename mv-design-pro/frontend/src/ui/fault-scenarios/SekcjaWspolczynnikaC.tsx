/**
 * Sekcja „Współczynnik napięciowy c" formularza scenariusza zwarciowego.
 *
 * Wspólna dla okna „Scenariusze zwarciowe" (ui2) i okna scenariusza warsztatu (ui) —
 * jedna kontrolka nośnika c zamiast dwóch (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK).
 * Przełącznik MAX/MIN wybiera kolumnę tabeli 1 IEC 60909-0 (backend dobiera c per
 * węzeł); nadpisanie odsłania pola wartości i OBOWIĄZKOWEGO uzasadnienia.
 */

import { SCENARIUSZ_C_LABELS, type ScenariuszC } from './types';
import type { PolaWspolczynnikaC } from './wspolczynnikC';

const SCENARIUSZE: readonly ScenariuszC[] = ['MAX', 'MIN'];

export const SEKCJA_C_STRINGS = {
  legenda: 'Współczynnik napięciowy c (IEC 60909-0, tabela 1)',
  podpis:
    'Wartość c dobiera obliczenie dla napięcia każdego węzła (pasmo nN z tolerancją sieci, SN, WN). Wybierasz tylko scenariusz.',
  nadpisz: 'Nadpisz c ręcznie (wymaga uzasadnienia)',
  wartosc: 'Wartość c',
  uzasadnienie: 'Uzasadnienie nadpisania',
  uzasadnieniePodpis: 'np. uzgodnienie z operatorem, ograniczenie c·Un ≤ Um',
} as const;

interface SekcjaWspolczynnikaCProps {
  pola: PolaWspolczynnikaC;
  onZmiana: (pola: PolaWspolczynnikaC) => void;
  /** Prefiks identyfikatorów testowych (np. `mvd-scenariusze`, `fault-scenario`). */
  testIdPrefix: string;
  /** Klasa kontenera pola (styl warstwy, w której sekcja jest osadzona). */
  klasaPola?: string;
}

export function SekcjaWspolczynnikaC({
  pola,
  onZmiana,
  testIdPrefix,
  klasaPola,
}: SekcjaWspolczynnikaCProps) {
  return (
    <fieldset className={klasaPola} data-testid={`${testIdPrefix}-sekcja-c`}>
      <legend>{SEKCJA_C_STRINGS.legenda}</legend>
      <p>{SEKCJA_C_STRINGS.podpis}</p>
      {SCENARIUSZE.map((scenariusz) => (
        <label key={scenariusz} className={klasaPola}>
          <input
            type="radio"
            name={`${testIdPrefix}-scenariusz-c`}
            value={scenariusz}
            data-testid={`${testIdPrefix}-scenariusz-${scenariusz}`}
            checked={pola.scenariusz === scenariusz}
            onChange={() => onZmiana({ ...pola, scenariusz })}
          />
          <span>{SCENARIUSZ_C_LABELS[scenariusz]}</span>
        </label>
      ))}
      <label className={klasaPola}>
        <input
          type="checkbox"
          data-testid={`${testIdPrefix}-nadpisz-c`}
          checked={pola.nadpisz}
          onChange={(e) => onZmiana({ ...pola, nadpisz: e.target.checked })}
        />
        <span>{SEKCJA_C_STRINGS.nadpisz}</span>
      </label>
      {pola.nadpisz && (
        <>
          <label className={klasaPola}>
            <span>{SEKCJA_C_STRINGS.wartosc}</span>
            <input
              type="number"
              step="0.01"
              data-testid={`${testIdPrefix}-c-wartosc`}
              value={pola.wartoscC}
              onChange={(e) => onZmiana({ ...pola, wartoscC: e.target.value })}
            />
          </label>
          <label className={klasaPola}>
            <span>{SEKCJA_C_STRINGS.uzasadnienie}</span>
            <input
              type="text"
              data-testid={`${testIdPrefix}-c-uzasadnienie`}
              placeholder={SEKCJA_C_STRINGS.uzasadnieniePodpis}
              value={pola.uzasadnienie}
              onChange={(e) => onZmiana({ ...pola, uzasadnienie: e.target.value })}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
