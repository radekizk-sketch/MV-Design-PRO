/**
 * TABELA POSUWÓW KROJU — jedno źródło szerokości tekstu schematu (karta UX-04/POLE-LINIOWE-WZORZEC,
 * decyzja architekta §11.7 pkt 7).
 *
 * Przypina: (1) `measureTextWidth` = suma posuwów znaków z `metrykiKroju.json` (liczona tu
 * NIEZALEŻNIE z surowej tabeli), zaokrąglona w górę; (2) dobór odmiany wagą CSS (≤ 500 → 400,
 * > 500 → 700) i kroju (`sans` / `mono`); (3) znak spoza tabeli liczony 1 em (szerokość górna);
 * (4) różnicę wobec dawnego szacunku 0,62 em, która była przyczyną defektu (cyfry węższe,
 * wielkie litery szersze); (4a) zasięg pionowy tuszu (`zasiegPionowyTuszu`) i linię centralną
 * (`przesuniecieBazyCentralnej`) liczone niezależnie z surowej tabeli (`pionowe`, decyzja §11.7
 * pkt 5 — litery symboli bez nakładania na kreskę); (5) pokrycie: każdy znak każdej etykiety sceny na KAŻDEJ fiksturze
 * repozytorium jest w tabeli kroju `sans` — produkt nie opiera geometrii na zapasowym 1 em.
 * Świeżość tabeli względem plików kroju sprawdza `backend/tests/ci/test_metryki_kroju_sld.py`
 * (generator `scripts/metryki_kroju_sld.py --sprawdz`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import metrykiKroju from '../metrykiKroju.json';
import {
  LABEL_TYPOGRAPHY,
  measureLabelWidth,
  measureTextWidth,
  posuwZnakuEm,
  przesuniecieBazyCentralnej,
  zasiegPionowyTuszu,
  type KrojSchematu,
} from '../text';

const JEDNOSTKI = metrykiKroju.jednostkiEm;

/** Posuw [em] wprost z surowej tabeli (bez kodu `text.ts`). */
function posuwSurowy(znak: string, waga: '400' | '700', kroj: KrojSchematu): number | null {
  const dane = metrykiKroju.kroje[kroj];
  const i = Array.from(dane.znaki).indexOf(znak);
  return i < 0 ? null : dane.posuwy[waga][i] / JEDNOSTKI;
}

describe('tabela posuwów kroju — struktura', () => {
  it('dwa kroje (sans: Liberation Sans ≡ Arial, mono: Liberation Mono ≡ Courier New), odmiany 400 i 700, jednostki em 2048', () => {
    expect(JEDNOSTKI).toBe(2048);
    expect(metrykiKroju.kroje.sans.kroj).toBe('Liberation Sans');
    expect(metrykiKroju.kroje.sans.zgodnyMetrycznieZ).toBe('Arial');
    expect(metrykiKroju.kroje.mono.kroj).toBe('Liberation Mono');
    expect(metrykiKroju.kroje.mono.zgodnyMetrycznieZ).toBe('Courier New');
    for (const kroj of ['sans', 'mono'] as const) {
      const dane = metrykiKroju.kroje[kroj];
      const n = Array.from(dane.znaki).length;
      expect(new Set(Array.from(dane.znaki)).size, kroj).toBe(n);
      expect(dane.posuwy['400'], kroj).toHaveLength(n);
      expect(dane.posuwy['700'], kroj).toHaveLength(n);
    }
  });

  it('pokrycie typografii schematu: polskie litery, interpunkcja, greka, indeksy, operatory, strzałki', () => {
    const WYMAGANE = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ·—–„”…°±×²³µΔΩφ√≤≥→←↔₀₁₂″′';
    for (const kroj of ['sans', 'mono'] as const) {
      const znaki = new Set(Array.from(metrykiKroju.kroje[kroj].znaki));
      for (const z of WYMAGANE) expect(znaki.has(z), `${kroj}: „${z}”`).toBe(true);
    }
  });
});

describe('measureTextWidth = suma posuwów z tabeli (iloczyn krój × waga × treść × rozmiar)', () => {
  const TRESCI = ['79', 'SCO', 'ZS · 50BF · 79', 'Wyłącznik Q0', 'ąężźćńółś', 'Ik″ = 12,5 kA', 'MWMW iiii'];
  for (const kroj of ['sans', 'mono'] as const) {
    for (const waga of [400, 500, 600, 700] as const) {
      it(`${kroj} / waga ${waga}`, () => {
        const odmiana = waga > 500 ? '700' : '400';
        for (const tresc of TRESCI) {
          for (const rozmiar of [7, 9, 11, 13]) {
            let em = 0;
            for (const z of tresc) {
              const p = posuwSurowy(z, odmiana, kroj);
              expect(p, `${kroj}: „${z}” w tabeli`).not.toBeNull();
              em += p!;
            }
            expect(measureTextWidth(tresc, rozmiar, waga, kroj), `${kroj}/${waga}/„${tresc}”/${rozmiar}`).toBe(Math.ceil(em * rozmiar - 1e-9));
          }
        }
      });
    }
  }

  it('klasa etykiety mierzy w odmianie swojej wagi (`measureLabelWidth` ≡ `measureTextWidth` z typografią klasy)', () => {
    for (const cls of ['t1', 't2', 't3', 't4'] as const) {
      const { fontSize, fontWeight } = LABEL_TYPOGRAPHY[cls];
      expect(measureLabelWidth('Pole liniowe Z.10 · 51N', cls), cls).toBe(measureTextWidth('Pole liniowe Z.10 · 51N', fontSize, fontWeight));
    }
  });

  it('znak spoza tabeli liczony 1 em (szerokość górna, nigdy niedoszacowana)', () => {
    expect(metrykiKroju.posuwSpozaTabeliEm).toBe(1);
    expect(posuwZnakuEm('中', 400)).toBe(1);
    expect(measureTextWidth('中中', 10, 700)).toBe(20);
    expect(measureTextWidth('⚠', 9, 400, 'mono')).toBe(9);
  });

  it('mono: stały posuw 1229/2048 em każdego znaku drukowalnego w obu odmianach', () => {
    for (const odmiana of ['400', '700'] as const) {
      const dane = metrykiKroju.kroje.mono;
      Array.from(dane.znaki).forEach((z, i) => {
        // Litery, cyfry, interpunkcja, operatory (bez znaków modyfikujących i formatujących
        // o posuwie 0, np. U+0374 „ʹ”, U+200C).
        if (/[\p{Lu}\p{Ll}\p{Nd}\p{Po}\p{Pd}\p{Ps}\p{Pe}\p{Sm}]/u.test(z)) expect(dane.posuwy[odmiana][i], `„${z}”`).toBe(1229);
      });
    }
  });

  it('przyczyna defektu: dawny szacunek 0,62 em zawyżał cyfry i zaniżał wielkie litery — tabela rozróżnia oba', () => {
    const SZACUNEK = 0.62;
    for (const cyfra of '0123456789') expect(posuwZnakuEm(cyfra, 400), cyfra).toBeLessThan(SZACUNEK);
    for (const litera of 'MWOQG') expect(posuwZnakuEm(litera, 400), litera).toBeGreaterThan(SZACUNEK);
    // Wiersz kodów i wiersz wielkich liter tej samej długości mają różne szerokości.
    expect(measureTextWidth('7979', 9, 400)).toBeLessThan(measureTextWidth('OWGM', 9, 400));
  });
});

describe('zasięg pionowy tuszu i linia centralna (iloczyn krój × waga × treść × rozmiar)', () => {
  const TRESCI = ['3', 'G', 'M', '!', '51N', 'pąg', 'Ąę', '—', ' ', ''];
  for (const kroj of ['sans', 'mono'] as const) {
    for (const waga of [400, 600] as const) {
      it(`${kroj} / waga ${waga}`, () => {
        const odmiana = waga > 500 ? '700' : '400';
        const dane = metrykiKroju.kroje[kroj];
        const znaki = Array.from(dane.znaki);
        const pion = dane.pionowe[odmiana];
        for (const tresc of TRESCI) {
          for (const rozmiar of [4, 8, 8.4, 13]) {
            let yMin = 0;
            let yMax = 0;
            for (const z of tresc) {
              const i = znaki.indexOf(z);
              expect(i, `${kroj}: „${z}”`).toBeGreaterThanOrEqual(0);
              yMin = Math.min(yMin, pion.tuszDol[i] / JEDNOSTKI);
              yMax = Math.max(yMax, pion.tuszGora[i] / JEDNOSTKI);
            }
            const z = zasiegPionowyTuszu(tresc, rozmiar, waga, kroj);
            expect(z.gora, `${kroj}/${waga}/„${tresc}”/${rozmiar}`).toBeCloseTo(-yMax * rozmiar, 12);
            expect(z.dol, `${kroj}/${waga}/„${tresc}”/${rozmiar}`).toBeCloseTo(-yMin * rozmiar, 12);
          }
        }
        expect(przesuniecieBazyCentralnej(10, kroj)).toBeCloseTo(((pion.wznoszenie - pion.zejscie) / 2 / JEDNOSTKI) * 10, 12);
      });
    }
  }

  it('Liberation Sans: wznoszenie 1854, zejście 434 (hhea) — linia centralna 0,3467 em nad linią bazową', () => {
    expect(metrykiKroju.kroje.sans.pionowe['400'].wznoszenie).toBe(1854);
    expect(metrykiKroju.kroje.sans.pionowe['400'].zejscie).toBe(434);
    expect(przesuniecieBazyCentralnej(1)).toBeCloseTo(0.3467, 4);
  });

  it('znak spoza tabeli liczony pełnym wznoszeniem i zejściem kroju (zasięg górny)', () => {
    const pion = metrykiKroju.kroje.sans.pionowe['400'];
    const z = zasiegPionowyTuszu('中', 10, 400);
    expect(z.gora).toBeCloseTo((-pion.wznoszenie / JEDNOSTKI) * 10, 12);
    expect(z.dol).toBeCloseTo((pion.zejscie / JEDNOSTKI) * 10, 12);
  });
});

describe('pokrycie: każdy znak etykiet sceny na każdej fiksturze repozytorium jest w tabeli kroju sans', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FRONTEND = resolve(here, '../../../../../..');
  const KATALOGI = [
    'public/test-fixtures',
    'src/harness-fixtures/generated',
    'src/ui/sld/v2/geometry/__tests__/fixtures',
    'src/ui/sld/v3/canvas/__tests__/fixtures',
    'src/ui/sld/v3/scene/__tests__/fixtures',
  ];
  const modelPliku = (sciezka: string): EnergyNetworkModel | null => {
    const raw = JSON.parse(readFileSync(sciezka, 'utf8')) as Record<string, unknown> | unknown[];
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    for (const kandydat of [raw, raw.enm, raw.snapshot]) {
      const enm = kandydat as Partial<EnergyNetworkModel> | undefined;
      if (enm && Array.isArray(enm.buses) && Array.isArray(enm.branches)) return enm as EnergyNetworkModel;
    }
    return null;
  };
  const FIKSTURY = KATALOGI.flatMap((katalog) =>
    readdirSync(resolve(FRONTEND, katalog))
      .filter((plik) => plik.endsWith('.json'))
      .sort()
      .flatMap((plik) => {
        const enm = modelPliku(resolve(FRONTEND, katalog, plik));
        return enm == null ? [] : [[`${katalog}/${plik}`, enm] as const];
      }),
  );

  it('liczba fikstur z modelem ENM (ta sama kolekcja co test mostków i węzłów)', () => {
    expect(FIKSTURY.length).toBe(58);
  });

  it('LOD 2 (pełna treść etykiet): zero znaków poza tabelą', () => {
    const znaki = new Set(Array.from(metrykiKroju.kroje.sans.znaki));
    const braki = new Map<string, string>();
    for (const [nazwa, enm] of FIKSTURY) {
      const scena = buildSceneV3(enm, 2);
      for (const etykieta of scena.labels) {
        for (const z of etykieta.text) if (!znaki.has(z) && !braki.has(z)) braki.set(z, `${nazwa}: „${etykieta.text}”`);
      }
    }
    expect([...braki.entries()].map(([z, gdzie]) => `U+${z.codePointAt(0)!.toString(16).toUpperCase()} ${gdzie}`)).toEqual([]);
  });
});
