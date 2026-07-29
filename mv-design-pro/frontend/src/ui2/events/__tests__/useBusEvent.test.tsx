/**
 * Testy hooka useBusEvent (E15.1).
 * Kryteria akceptacji: docs/uiux/karty/U1_E15_1_MAGISTRALA.md §7.3.
 */

import { describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach } from 'vitest';

import { useBusEvent } from '../useBusEvent';
import { emituj, magistrala } from '../bus';

afterEach(() => {
  cleanup();
});

describe('useBusEvent — subskrypcja w cyklu zycia komponentu (§7.3)', () => {
  it('subskrybuje w mount — zdarzenie emitowane po zamontowaniu wywoluje obsluznik', () => {
    const obsluznik = vi.fn();
    renderHook(() => useBusEvent('selekcja', obsluznik));

    emituj({ typ: 'selekcja', obiektId: 'bus-1', zrodlo: 'test' });

    expect(obsluznik).toHaveBeenCalledTimes(1);
    expect(obsluznik).toHaveBeenCalledWith({ typ: 'selekcja', obiektId: 'bus-1', zrodlo: 'test' });
  });

  it('odsubskrybowuje w unmount — magistrala nie ma juz subskrybenta tego typu z tego hooka', () => {
    const obsluznik = vi.fn();
    const przedLiczbaSubskrybentowTypu = (magistrala as any)['obsluzniceTypu'].get('selekcja')
      ?.size ?? 0;

    const { unmount } = renderHook(() => useBusEvent('selekcja', obsluznik));
    const wTrakcieLiczbaSubskrybentowTypu = (magistrala as any)['obsluzniceTypu'].get('selekcja')
      ?.size ?? 0;
    expect(wTrakcieLiczbaSubskrybentowTypu).toBe(przedLiczbaSubskrybentowTypu + 1);

    unmount();

    const poLiczbaSubskrybentowTypu = (magistrala as any)['obsluzniceTypu'].get('selekcja')?.size ?? 0;
    expect(poLiczbaSubskrybentowTypu).toBe(przedLiczbaSubskrybentowTypu);
  });

  it('brak wycieku — emisja po odmontowaniu NIE woła obsluznika', () => {
    const obsluznik = vi.fn();
    const { unmount } = renderHook(() => useBusEvent('selekcja', obsluznik));

    unmount();
    emituj({ typ: 'selekcja', obiektId: 'bus-2', zrodlo: 'test' });

    expect(obsluznik).not.toHaveBeenCalled();
  });

  it('zmiana referencji obsluznika miedzy renderami nie powoduje resubskrypcji, ale wywoluje najnowsza wersje', () => {
    let mnoznik = 1;
    const wywolania: number[] = [];
    const zrobObsluznik = (m: number) => () => {
      wywolania.push(m);
    };

    const { rerender } = renderHook(({ obsluznik }) => useBusEvent('selekcja', obsluznik), {
      initialProps: { obsluznik: zrobObsluznik(mnoznik) },
    });

    mnoznik = 2;
    rerender({ obsluznik: zrobObsluznik(mnoznik) });

    emituj({ typ: 'selekcja', obiektId: 'bus-3', zrodlo: 'test' });

    // Wywolana zostaje TYLKO najnowsza wersja obsluznika (mnoznik=2), nie stara.
    expect(wywolania).toEqual([2]);
  });

  it('hook nie zwraca wartosci (void) — moduł bez UI, czysty efekt uboczny (subskrypcja)', () => {
    const { result } = renderHook(() => useBusEvent('selekcja', () => {}));
    expect(result.current).toBeUndefined();
  });
});
