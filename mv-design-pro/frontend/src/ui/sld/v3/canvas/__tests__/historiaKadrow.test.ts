// @vitest-environment node
/**
 * K2 (§0.4) — historia kadrów „Poprzedni widok": stos ograniczony, bez
 * podwójnych wpisów tego samego kadru, zdejmowanie od wierzchu, operacje
 * niezmiennicze. K2b §0.3: wpis niesie zaznaczenie i kurtynę; „ten sam widok"
 * = ta sama kamera, ścieżka, zaznaczenie i kurtyna; poziom „Sieć" wraca do wpisu
 * sprzed wejścia w cel (`zdejmijDoWejscia`).
 */
import { describe, expect, it } from 'vitest';

import {
  BEZ_ZAZNACZENIA,
  dolozDoHistorii,
  LIMIT_HISTORII_KADROW,
  zdejmijDoWejscia,
  zdejmijZHistorii,
  type WpisHistoriiKadru,
  type ZaznaczenieWidoku,
} from '../historiaKadrow';

const wpis = (n: number, lod: 0 | 1 | 2 = 0): WpisHistoriiKadru => ({
  transform: { scale: 1 + n / 100, translateX: n, translateY: -n },
  lod,
  viewportSize: { width: 1322, height: 856 },
  sciezka: n === 0 ? [] : [{ cel: 'stacja', kontekst: [`stn/${n}`], etykieta: `Stacja ${n}` }],
  zaznaczenie: BEZ_ZAZNACZENIA,
  kurtyna: n === 0 ? null : [`stn/${n}`],
});
const zaznaczony = (id: string): ZaznaczenieWidoku => ({
  elementy: [{ id, type: 'LineBranch', name: id }],
  kontekst: { selekcjaId: id, elementKind: 'segment', ref: id, temat: 'segment', tylkoOdczyt: false } as unknown as ZaznaczenieWidoku['kontekst'],
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

  // K2b §0.3 — iloczyn: {ta sama kamera} × {zaznaczenie: to samo / inne} × {kurtyna: ta sama / inna}.
  it('ta sama kamera z INNYM zaznaczeniem albo inną kurtyną to inny widok — wpis powstaje', () => {
    const s1 = dolozDoHistorii([], wpis(0));
    expect(dolozDoHistorii(s1, { ...wpis(0), zaznaczenie: zaznaczony('seg/1') })).toHaveLength(2);
    expect(dolozDoHistorii(s1, { ...wpis(0), kurtyna: ['stn/9'] })).toHaveLength(2);
    const s2 = dolozDoHistorii([], { ...wpis(0), zaznaczenie: zaznaczony('seg/1') });
    expect(dolozDoHistorii(s2, { ...wpis(0), zaznaczenie: zaznaczony('seg/1') })).toBe(s2);
    expect(dolozDoHistorii(s2, { ...wpis(0), zaznaczenie: zaznaczony('seg/2') })).toHaveLength(2);
  });

  it('wpis zachowuje zaznaczenie (elementy i kontekst kliknięcia) bez zmian przy zdjęciu', () => {
    const z = zaznaczony('seg/7');
    const stos = dolozDoHistorii([], { ...wpis(0), zaznaczenie: z });
    expect(zdejmijZHistorii(stos)!.wpis.zaznaczenie).toEqual(z);
  });

  it('zdejmijDoWejscia: ostatni wpis z pustą ścieżką i stos poniżej niego; brak takiego wpisu = null', () => {
    const siec = { ...wpis(0), zaznaczenie: zaznaczony('seg/1') };
    let stos: readonly WpisHistoriiKadru[] = dolozDoHistorii([], wpis(5));
    stos = dolozDoHistorii(stos, siec);
    stos = dolozDoHistorii(stos, wpis(1));
    stos = dolozDoHistorii(stos, wpis(2));
    const wynik = zdejmijDoWejscia(stos)!;
    expect(wynik.wpis).toEqual(siec);
    expect(wynik.stos).toEqual([wpis(5)]);
    expect(zdejmijDoWejscia([wpis(1), wpis(2)])).toBeNull();
    expect(zdejmijDoWejscia([])).toBeNull();
  });
});
