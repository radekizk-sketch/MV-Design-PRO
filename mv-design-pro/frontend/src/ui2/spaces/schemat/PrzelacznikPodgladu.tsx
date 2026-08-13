/**
 * PrzelacznikPodgladu — tryb pracy kanwy schematu (KD-4, ZAMKNIĘCIE luki L-1).
 *
 * CO ZASTĘPUJE. Podgląd schematu tylko do odczytu istniał WYŁĄCZNIE jako trasa
 * mostu `#sld-view` (jedyne wejście: wyszukiwarka poleceń „Podgląd schematu").
 * Z przestrzeni „Schemat" nie dało się zablokować edycji — a to podstawowy tryb
 * pracy przy omawianiu układu i przy przeglądzie cudzego projektu.
 *
 * REUŻYCIE: dostawcą blokady jest istniejący prop `readOnly` kanwy v3
 * (wykonawca akcji SLD dostaje `readOnly` i odrzuca operacje edycyjne). Ten
 * przełącznik ustawia wyłącznie stan WIDOKU powłoki — zero mutacji modelu.
 */

import './schemat.css';
import { useShellStore } from '../../shell/useShellStore';
import { SCHEMAT_STRINGS as T } from './strings';

export function PrzelacznikPodgladu() {
  const podglad = useShellStore((s) => s.podgladSchematu);
  const setPodglad = useShellStore((s) => s.setPodgladSchematu);

  return (
    <div className="mvd-schemat-tryb" data-testid="mvd-schemat-tryb" data-podglad={String(podglad)}>
      <span className="mvd-schemat-tryb-etyk">{T.trybEtykieta}</span>
      <button
        type="button"
        className="mvd-schemat-tryb-btn"
        data-testid="mvd-schemat-tryb-edycja"
        aria-pressed={!podglad}
        onClick={() => setPodglad(false)}
      >
        {T.trybEdycja}
      </button>
      <button
        type="button"
        className="mvd-schemat-tryb-btn"
        data-testid="mvd-schemat-tryb-podglad"
        aria-pressed={podglad}
        onClick={() => setPodglad(true)}
      >
        {T.trybPodglad}
      </button>
      {podglad && (
        <span className="mvd-schemat-tryb-uwaga" data-testid="mvd-schemat-tryb-uwaga">
          {T.trybPodgladOpis}
        </span>
      )}
    </div>
  );
}
