/**
 * K2 (§0.4) — historia kadrów „Poprzedni widok": stos ograniczony, bez
 * podwójnych wpisów tego samego kadru, zdejmowanie od wierzchu, operacje
 * niezmiennicze.
 */
import { describe, expect, it } from 'vitest';

import { dolozDoHistorii, LIMIT_HISTORII_KADROW, zdejmijZHistorii, type WpisHistoriiKadru } from '../historiaKadrow';

const wpis = (n: number, lod: 0 | 1 | 2 = 0): WpisHistoriiKadru => ({
  transform: { scale: 1 + n / 100, translateX: n, translateY: -n },
  lod,
  sciezka: n === 0 ? [] : [{ cel: 'stacja', kontekst: [`stn/${n}`], etykieta: `Stacja ${n}` }],
});

describe('historiaKadrow', () => {
  it('dokłada na wierzch i zdejmuje od wierzchu (LIFO), bez mutacji wejścia', () => {
    const pusty: readonly WpisHistoriiKadru[] = [];
    const jeden = dolozDoHistorii(pusty, wpis(1));
    const dwa = dolozDoHistorii(jeden, wpis(2));
    expect(pusty).toHaveLength(0);
    expect(jeden).toHaveLength(1);
    const zdjety = zdejmijZHistorii(dwa)!;
    expect(zdjety.wpis).toEqual(wpis(2));
    expect(zdjety.stos).toEqual([wpis(1)]);
    expect(dwa).toHaveLength(2);
  });

  it('pusty stos: zdjęcie zwraca null', () => {
    expect(zdejmijZHistorii([])).toBeNull();
  });

  it('ten sam kadr dwa razy z rzędu nie tworzy drugiego wpisu; inny poziom przy tej samej transformacji — tworzy', () => {
    const s1 = dolozDoHistorii([], wpis(3));
    expect(dolozDoHistorii(s1, wpis(3))).toBe(s1);
    expect(dolozDoHistorii(s1, { ...wpis(3), lod: 2 })).toHaveLength(2);
    // Ten sam kadr, ale NIE bezpośrednio na wierzchu — wpis powstaje.
    expect(dolozDoHistorii(dolozDoHistorii(s1, wpis(4)), wpis(3))).toHaveLength(3);
  });

  it(`stos ograniczony do ${LIMIT_HISTORII_KADROW}: przy przepełnieniu wypada najstarszy`, () => {
    let stos: readonly WpisHistoriiKadru[] = [];
    for (let n = 1; n <= LIMIT_HISTORII_KADROW + 5; n += 1) stos = dolozDoHistorii(stos, wpis(n));
    expect(stos).toHaveLength(LIMIT_HISTORII_KADROW);
    expect(stos[0]).toEqual(wpis(6));
    expect(stos[stos.length - 1]).toEqual(wpis(LIMIT_HISTORII_KADROW + 5));
  });

  it('limit jawny działa tak samo jak domyślny', () => {
    let stos: readonly WpisHistoriiKadru[] = [];
    for (let n = 1; n <= 4; n += 1) stos = dolozDoHistorii(stos, wpis(n), 2);
    expect(stos).toEqual([wpis(3), wpis(4)]);
  });
});
