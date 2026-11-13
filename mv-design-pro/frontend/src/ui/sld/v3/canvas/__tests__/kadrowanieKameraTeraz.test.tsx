/**
 * Historia kadrów czyta kamerę W CHWILI POLECENIA (`useKadrowanieWidoku`, opcja `kamera` jako ref).
 *
 * Defekt zmierzony w e2e `sld-kamera-przelot-okno.spec.ts` (2 z 5 biegów, B-02 2026-11-13):
 * `Shift+F` → `Alt+←` → `Alt+→` nie wracało do kadru całej sieci. Kanwa zgłaszała kamerę efektem
 * biernym, a warsztat trzymał ją w stanie Reacta — polecenie wydane tuż po zmianie `viewBox`
 * zapisywało w drodze naprzód kadr SPRZED zmiany. Iloczyn: {polecenie odkładające: zapamiętanie
 * przed poleceniem, wstecz, naprzód} × {kamera zmieniona bez ponownego renderu hooka}.
 *
 * Iniekcja (wynik w kontrakcie §3): hook czyta kopię kamery z chwili pierwszego renderu
 * (`useRef(kamera.current)`) — czerwone.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { BEZ_ZAZNACZENIA } from '../historiaKadrow';
import { useKadrowanieWidoku, type StanKameryWorkspace } from '../useKadrowanieWidoku';

const WIDOK = { width: 1000, height: 700 } as const;
function kamera(scale: number, translateX: number): StanKameryWorkspace {
  return { transform: { scale, translateX, translateY: 0 }, viewportSize: WIDOK };
}

function hak(kameraRef: { current: StanKameryWorkspace | null }) {
  return renderHook(() =>
    useKadrowanieWidoku({
      snapshot: null,
      kamera: kameraRef,
      zaznaczenie: [],
      caseId: null,
      pobierzZaznaczenie: () => BEZ_ZAZNACZENIA,
      przywrocZaznaczenie: () => {},
    }),
  );
}

describe('historia kadrów — kamera z chwili polecenia, nie z ostatniego renderu', () => {
  it('wstecz zaraz po zmianie kadru: naprzód wraca do kadru PO zmianie', () => {
    const ref: { current: StanKameryWorkspace | null } = { current: kamera(1.2, -300) };
    const { result } = hak(ref);
    // Polecenie widoku (np. „Cała sieć”) odkłada bieżący kadr, kanwa zgłasza nowy — bez renderu hooka.
    act(() => result.current.zapamietajPrzedPoleceniem());
    ref.current = kamera(0.3, 40);
    act(() => result.current.poprzedniWidok());
    expect(result.current.przywrocenieKamery?.transform).toEqual(kamera(1.2, -300).transform);
    // Kanwa wykonała przywrócenie i zgłosiła je (znów bez renderu hooka), potem `Alt+→`.
    ref.current = kamera(1.2, -300);
    act(() => result.current.nastepnyWidok());
    expect(result.current.przywrocenieKamery?.transform, 'naprzód = kadr całej sieci').toEqual(kamera(0.3, 40).transform);
  });

  it('naprzód zaraz po wstecz: wstecz wraca do kadru, z którego poszło naprzód', () => {
    const ref: { current: StanKameryWorkspace | null } = { current: kamera(1, 0) };
    const { result } = hak(ref);
    act(() => result.current.zapamietajPrzedPoleceniem());
    ref.current = kamera(2, -800);
    act(() => result.current.poprzedniWidok());
    ref.current = kamera(1, 0);
    act(() => result.current.nastepnyWidok());
    ref.current = kamera(2, -800);
    act(() => result.current.poprzedniWidok());
    expect(result.current.przywrocenieKamery?.transform).toEqual(kamera(1, 0).transform);
  });
});
