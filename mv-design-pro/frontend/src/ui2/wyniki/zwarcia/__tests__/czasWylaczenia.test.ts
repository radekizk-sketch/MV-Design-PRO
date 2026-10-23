/**
 * Karty SC-IB-ITH-ZRODLA + TB-WARTOSC-ROBOCZA — prezentacja czasu wyłączenia t_b punktu
 * zwarcia i wielkości od niego zależnych.
 *
 * Iloczyn cech bilansu IEC 60909:
 *  - {Ib · iDC(tb)} × {wartość policzona · brak wartości (wiersz bez wyniku solvera)} — liczba
 *    w kA albo uczciwa kreska; stan „nie obliczono — bieg bez tb" nie istnieje (t_b jest
 *    rozstrzygany w każdym punkcie, brak danej nie blokuje obliczeń);
 *  - pozycja t_b × {pochodzenie: scenariusz projektanta (bez `tb_zrodlo`) · propozycja
 *    robocza · pole z roboczym czasem własnym · pole z czasem z karty} — etykieta
 *    „wartość robocza" wyłącznie przy wartości roboczej, zdanie źródła z backendu przy
 *    każdym pochodzeniu spoza scenariusza.
 *
 * Założenia biegu: {t_b scenariusza · t_b w punkcie zwarcia · starszy zapis bez pola} ×
 * {założenie biegu z listą punktów (`fault.czas_tb_wartosc_robocza`) · założenie elementu}.
 */
import { describe, expect, it } from 'vitest';
import { naBilansIEC } from '../BilansIEC';
import { naZalozeniaZwarc } from '../zwarciaModel';
import { ZWARCIA_STRINGS, fmtCzas, fmtKA } from '../strings';
import { konfiguracjaBieguFixture, shortCircuitRowFixture } from './fixtures';
import type { CzasTbPunktu } from '../../../../ui/results-inspector/types';

const S = ZWARCIA_STRINGS;

function pozycja(etykieta: string, over: Parameters<typeof shortCircuitRowFixture>[0]) {
  const p = naBilansIEC(shortCircuitRowFixture(over)).find((x) => x.etykieta === etykieta);
  if (!p) throw new Error(`brak pozycji ${etykieta}`);
  return p;
}

/** Kształty 1:1 z `CzasWylaczeniaTb.to_dict` (backend) — trzy pochodzenia spoza scenariusza. */
const TB_PROPOZYCJA: CzasTbPunktu = {
  wartosc_s: 0.1,
  pochodzenie: 'PROPOZYCJA',
  wartosc_robocza: true,
  jakosc: 'ESTIMATED',
  opis_pl: 't_b = 0,1 s — wartość robocza (węzeł tablicy μ IEC 60909-0:2016 …): brak pól.',
  zrodlo_pl: 'węzeł tablicy μ IEC 60909-0:2016 (rys. 16 / wzory (70)–(73), t_min = 0,1 s)',
};
const TB_POLE_ROBOCZE: CzasTbPunktu = {
  wartosc_s: 0.16,
  pochodzenie: 'Z_POL',
  wartosc_robocza: true,
  jakosc: 'ESTIMATED',
  opis_pl: 't_b = 0,16 s z pola Odpływ 1 (czas własny wyłącznika — wartość robocza).',
  pole_ref: 'pole/1',
  pole_nazwa: 'Odpływ 1',
  zabezpieczenie_ref: 'zab/1',
  czlon_nastawczy_s: 0.1,
  czas_wlasny_s: 0.06,
  czas_wlasny_pochodzenie: 'PROPOZYCJA',
  prad_zwarciowy_a: 12000,
};
const TB_POLE_KARTA: CzasTbPunktu = {
  ...TB_POLE_ROBOCZE,
  wartosc_s: 0.15,
  wartosc_robocza: false,
  jakosc: null,
  czas_wlasny_s: 0.05,
  czas_wlasny_pochodzenie: 'KATALOG',
  opis_pl: 't_b = 0,15 s z pola Odpływ 1 (czas własny wyłącznika z karty katalogowej).',
};

describe('naBilansIEC — Ib i iDC(tb) × obecność wartości', () => {
  for (const [etykieta, pole] of [
    [S.bilansIb, 'ib_ka'],
    [S.bilansIdc, 'i_dc_ka'],
  ] as const) {
    for (const tb of [0.1, null] as const) {
      it(`${etykieta}: tb=${tb} × wartość policzona → liczba w kA`, () => {
        const p = pozycja(etykieta, { tb_s: tb, [pole]: 4.5636 });
        expect(p.wartosc).toBe(fmtKA(4.5636));
        expect(p.jednostka).toBe(S.jednKA);
      });
      it(`${etykieta}: tb=${tb} × brak wartości (wiersz bez wyniku) → uczciwa kreska`, () => {
        const p = pozycja(etykieta, { tb_s: tb, [pole]: null });
        expect(p.wartosc).toBe(S.kreska);
        expect(p.tekst).toBeUndefined();
      });
    }
  }

  it('kolejność normowa: Ib zaraz przed iDC(tb), oba po Ith', () => {
    const etykiety = naBilansIEC(shortCircuitRowFixture()).map((p) => p.etykieta);
    const ith = etykiety.indexOf(S.bilansIth);
    expect(etykiety.slice(ith + 1, ith + 3)).toEqual([S.bilansIb, S.bilansIdc]);
  });
});

describe('naBilansIEC — pozycja tb × pochodzenie tb punktu', () => {
  it('tb scenariusza projektanta (bez tb_zrodlo) → sama liczba, bez etykiety i źródła', () => {
    const p = pozycja(S.bilansTb, { tb_s: 0.08 });
    expect(p.wartosc).toBe(fmtCzas(0.08));
    expect(p.jednostka).toBe(S.jednS);
    expect(p.zrodloTb).toBeUndefined();
    expect(p.tekst).toBeUndefined();
  });

  it.each([
    ['propozycja robocza', TB_PROPOZYCJA, true],
    ['pole z roboczym czasem własnym', TB_POLE_ROBOCZE, true],
    ['pole z czasem własnym z karty', TB_POLE_KARTA, false],
  ] as const)('%s → liczba + zdanie źródła z backendu; etykieta robocza tylko przy wartości roboczej', (_n, zrodlo, robocza) => {
    const p = pozycja(S.bilansTb, { tb_s: zrodlo.wartosc_s, tb_zrodlo: zrodlo });
    expect(p.wartosc).toBe(fmtCzas(zrodlo.wartosc_s));
    expect(p.jednostka).toBe(S.jednS);
    expect(p.tekst).toBe(true);
    expect(p.zrodloTb).toEqual({ robocza, opis: zrodlo.opis_pl });
  });
});

describe('naZalozeniaZwarc — czas wyłączenia tb biegu', () => {
  const NAZWA = (ref: string) => `Element ${ref}`;
  const OPIS_REGULY =
    'Scenariusz zwarciowy nie podaje t_b — t_b każdego punktu zwarcia to najkrótszy czas wyłączenia pól …';

  it('tb scenariusza → wiersz z wartością w sekundach', () => {
    const z = naZalozeniaZwarc(
      konfiguracjaBieguFixture({ breaking_time_seconds: { wartosc: 0.25, pochodzenie: 'opcje_biegu' } }),
      undefined,
      NAZWA,
    );
    expect(z).toContainEqual({ etykieta: S.zalCzasWylaczenia, wartosc: fmtCzas(0.25), jednostka: S.jednS });
  });

  it('tb w punkcie zwarcia → „w punkcie zwarcia" ze zdaniem reguły; założenie z punktami → liczba punktów', () => {
    const z = naZalozeniaZwarc(
      konfiguracjaBieguFixture({
        breaking_time_seconds: { wartosc: null, pochodzenie: 'punkt_zwarcia', opis_pl: OPIS_REGULY },
      }),
      [
        {
          code: 'fault.czas_tb_wartosc_robocza',
          element_ref: null,
          message_pl: 'Czas wyłączenia tb w części punktów zwarcia jest wartością roboczą.',
          scenariusz: 'MAX',
          punkty: [
            { ...TB_PROPOZYCJA, fault_node_id: 'n1', element_id: 'bus-1', nazwa: 'Szyna 1' },
            { ...TB_POLE_ROBOCZE, fault_node_id: 'n2', element_id: 'bus-2', nazwa: 'Szyna 2' },
          ],
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
    expect(z).toContainEqual({
      etykieta: S.zalCzasWylaczenia,
      wartosc: S.zalCzasWylaczeniaPunkt,
      uwaga: OPIS_REGULY,
    });
    const biegu = z.find((w) => w.etykieta === S.zalozenieBiegu);
    expect(biegu?.uwaga).toContain(S.zalozeniePunkty(2));
    const elementu = z.find((w) => w.etykieta === S.zalozenieEtykieta('Element src-1'));
    expect(elementu?.uwaga).not.toContain('Dotyczy punktów zwarcia');
    expect(z.map((w) => `${w.etykieta} ${w.wartosc} ${w.uwaga ?? ''}`).join(' ')).not.toContain('null');
  });

  it('starszy zapis bez pola tb → brak wiersza (nie „0 s" ani domyślne 0,1 s)', () => {
    const z = naZalozeniaZwarc(konfiguracjaBieguFixture(), undefined, NAZWA);
    expect(z.map((w) => w.etykieta)).not.toContain(S.zalCzasWylaczenia);
  });
});
