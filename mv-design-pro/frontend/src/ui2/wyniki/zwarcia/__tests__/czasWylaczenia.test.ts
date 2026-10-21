/**
 * Karta SC-IB-ITH-ZRODLA — prezentacja wielkości zależnych od czasu wyłączenia t_b.
 *
 * Iloczyn cech bilansu IEC 60909: {bieg z t_b · bieg bez t_b} × {wartość policzona · brak
 * wartości} × {Ib · iDC(tb)}. Bieg bez t_b i bez wartości → nazwany stan „nie obliczono"
 * z drogą naprawy (nie kreska udająca starszy wynik); bieg z t_b, ale bez wartości (np.
 * starszy zapis) → uczciwa kreska; wartość → liczba w kA niezależnie od t_b (I_b sieci
 * odległej jest wyznaczalne bez t_b).
 *
 * Założenia biegu: {t_b podane · t_b nieobecne (`brak_danej`) · starszy zapis bez pola} ×
 * {założenie biegu bez elementu (`fault.czas_tb_brak`) · założenie elementu}.
 */
import { describe, expect, it } from 'vitest';
import { naBilansIEC } from '../BilansIEC';
import { naZalozeniaZwarc } from '../zwarciaModel';
import { ZWARCIA_STRINGS, fmtCzas, fmtKA } from '../strings';
import { konfiguracjaBieguFixture, shortCircuitRowFixture } from './fixtures';

const S = ZWARCIA_STRINGS;

function pozycja(etykieta: string, over: Parameters<typeof shortCircuitRowFixture>[0]) {
  const p = naBilansIEC(shortCircuitRowFixture(over)).find((x) => x.etykieta === etykieta);
  if (!p) throw new Error(`brak pozycji ${etykieta}`);
  return p;
}

describe('naBilansIEC — Ib i iDC(tb) × obecność tb × obecność wartości', () => {
  const przypadki = [
    { tb: 0.1, wartosc: 4.5636, oczekiwane: `${fmtKA(4.5636)}` },
    { tb: null, wartosc: 4.5636, oczekiwane: `${fmtKA(4.5636)}` },
    { tb: 0.1, wartosc: null, oczekiwane: S.kreska },
    { tb: null, wartosc: null, oczekiwane: S.bilansBrakTb },
  ] as const;

  for (const [etykieta, pole] of [
    [S.bilansIb, 'ib_ka'],
    [S.bilansIdc, 'i_dc_ka'],
  ] as const) {
    for (const { tb, wartosc, oczekiwane } of przypadki) {
      it(`${etykieta}: tb=${tb} × wartość=${wartosc} → ${oczekiwane}`, () => {
        const p = pozycja(etykieta, { tb_s: tb, [pole]: wartosc });
        expect(p.wartosc).toBe(oczekiwane);
        if (oczekiwane === S.bilansBrakTb) {
          expect(p.jednostka).toBeNull();
          expect(p.tekst).toBe(true);
        } else if (wartosc !== null) {
          expect(p.jednostka).toBe(S.jednKA);
        }
      });
    }
  }

  it('kolejność normowa: Ib zaraz przed iDC(tb), oba po Ith', () => {
    const etykiety = naBilansIEC(shortCircuitRowFixture()).map((p) => p.etykieta);
    const ith = etykiety.indexOf(S.bilansIth);
    expect(etykiety.slice(ith + 1, ith + 3)).toEqual([S.bilansIb, S.bilansIdc]);
  });
});

describe('naZalozeniaZwarc — czas wyłączenia tb biegu', () => {
  const NAZWA = (ref: string) => `Element ${ref}`;

  it('tb podane → wiersz z wartością w sekundach', () => {
    const z = naZalozeniaZwarc(
      konfiguracjaBieguFixture({ breaking_time_seconds: { wartosc: 0.25, pochodzenie: 'opcje_biegu' } }),
      undefined,
      NAZWA,
    );
    expect(z).toContainEqual({ etykieta: S.zalCzasWylaczenia, wartosc: fmtCzas(0.25), jednostka: S.jednS });
  });

  it('tb nieobecne → „nie podano" + założenie biegu bez elementu nazwane etykietą biegu', () => {
    const z = naZalozeniaZwarc(
      konfiguracjaBieguFixture({
        breaking_time_seconds: { wartosc: null, pochodzenie: 'brak_danej', kod: 'fault.czas_tb_brak' },
      }),
      [
        {
          code: 'fault.czas_tb_brak',
          element_ref: null,
          message_pl: 'Bieg bez czasu wyłączenia tb.',
          scenariusz: 'MAX',
        },
        {
          code: 'source.sk_min_missing',
          element_ref: 'src-1',
          message_pl: 'Brak Sk min.',
          scenariusz: 'MIN',
        },
      ],
      NAZWA,
    );
    expect(z).toContainEqual({ etykieta: S.zalCzasWylaczenia, wartosc: S.zalCzasWylaczeniaBrak });
    const etykiety = z.map((w) => w.etykieta);
    expect(etykiety).toContain(S.zalozenieBiegu);
    expect(etykiety).toContain(S.zalozenieEtykieta('Element src-1'));
    expect(etykiety.join(' ')).not.toContain('null');
  });

  it('starszy zapis bez pola tb → brak wiersza (nie „0 s" ani domyślne 0,1 s)', () => {
    const z = naZalozeniaZwarc(konfiguracjaBieguFixture(), undefined, NAZWA);
    expect(z.map((w) => w.etykieta)).not.toContain(S.zalCzasWylaczenia);
  });
});
