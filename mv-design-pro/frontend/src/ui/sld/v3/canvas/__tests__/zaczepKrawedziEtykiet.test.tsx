/**
 * ZACZEP ETYKIET W KRAWĘDZI (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta §11.7 pkt 8).
 *
 * Etykiety danych (`labelRole: 'dane'`) i podpisy aparatów (`ownerKind: 'apparatus'`) kotwiczą
 * tekst w krawędzi prostokąta zwróconej do symbolu — dla strony WYBRANEJ PRZEZ PLAN
 * czytelności (`PlannedLabel.strona`), nie dla strony naturalnej wytwórcy etykiety. Przy
 * tekście wyśrodkowanym w prostokącie podpisy kolumny pola zaczynały się w różnych miejscach
 * (prostokąt to miara posuwów zaokrąglona w górę, a przed 2026-10-30 — szacunek 0,62 em).
 *
 * Przypina: (A) regułę `wyrownanieEtykiety` na iloczynie rola × właściciel × strona × obrót ×
 * jawne wyrównanie wytwórcy (wyrocznia: tabela prawdy w teście); (B) render kanwy na fiksturach
 * GPZ (Z.10, Z.11.1/Z.11), sieci wielostacyjnej i stacji z polem pomiarowym na LOD 2: każda
 * etykieta `dane` / podpis aparatu po stronie lewej/prawej niesie `text-anchor` end/start,
 * a iloczyn {dane, aparat} × {lewa, prawa} jest niepusty; (C) wspólną krawędź podpisów
 * aparatów kolumny pola GPZ (podpisy po lewej stronie toru jednego pola — jedna prawa krawędź,
 * tolerancja 1 jednostki świata). Krawędź tuszu na ekranie (metryki przeglądarki) mierzy e2e
 * `ux04-pole-liniowe-zrzuty-screenshot.spec.ts::zmierzPodpisyPola`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { wyrownanieEtykiety, type OwnedLabel, type WyrownanieTekstu } from '../../layout/labels';
import type { SimpleAnchorPlacement } from '../../layout/labels';
import { SldCanvasV3 } from '../SldCanvasV3';
import { zRekordamiAparatowPol } from '../../scene/__tests__/fixtures/rekordyAparatowPola';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const enmPliku = (sciezka: string): EnergyNetworkModel =>
  (JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

describe('(A) wyrownanieEtykiety — iloczyn rola × właściciel × strona × obrót × wyrównanie wytwórcy', () => {
  const ROLE = ['tozsamosc', 'dane'] as const;
  const WLASCICIELE = ['apparatus', 'protection', 'bus', 'branch', 'station-name', 'transformer'] as const;
  const STRONY: readonly (SimpleAnchorPlacement | undefined)[] = ['left', 'right', 'above', 'below', undefined];
  const WYROWNANIA: readonly (WyrownanieTekstu | undefined)[] = [undefined, 'poczatek', 'koniec'];

  it('tabela prawdy: krawędź od strony symbolu tylko dla danych i podpisów aparatów, poziomo, przy stronie lewej/prawej', () => {
    let przypadki = 0;
    for (const labelRole of ROLE) {
      for (const ownerKind of WLASCICIELE) {
        for (const strona of STRONY) {
          for (const rotated of [false, true]) {
            for (const wyrownanieTekstu of WYROWNANIA) {
              const etykieta = { labelRole, ownerKind, placement: 'above', rotated, wyrownanieTekstu } as unknown as Pick<
                OwnedLabel,
                'labelRole' | 'ownerKind' | 'placement' | 'rotated' | 'wyrownanieTekstu'
              >;
              const krawedz = (labelRole === 'dane' || ownerKind === 'apparatus') && !rotated;
              const oczekiwane = krawedz && strona === 'left' ? 'koniec' : krawedz && strona === 'right' ? 'poczatek' : wyrownanieTekstu;
              expect(wyrownanieEtykiety(etykieta, strona), `${labelRole}/${ownerKind}/${strona}/${rotated}/${wyrownanieTekstu}`).toBe(oczekiwane);
              przypadki += 1;
            }
          }
        }
      }
    }
    expect(przypadki).toBe(2 * 6 * 5 * 2 * 3);
  });

  it('domyślna strona = strona naturalna etykiety (`placement`)', () => {
    const etykieta = { labelRole: 'dane', ownerKind: 'protection', placement: 'left', rotated: false } as unknown as OwnedLabel;
    expect(wyrownanieEtykiety(etykieta)).toBe('koniec');
    expect(wyrownanieEtykiety(etykieta, 'right')).toBe('poczatek');
  });
});

const FIKSTURY: ReadonlyArray<readonly [string, EnergyNetworkModel]> = [
  ['Z.10 (wyłącznik stały, sekcja 1)', (fxStaly1 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['Z.11.1 i Z.11 z odgałęzieniem', (fxZ11 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['GPZ z odpływem', enmPliku('../../scene/__tests__/fixtures/gpzFeeder.enm.json')],
  ['stacja z polem pomiarowym', enmPliku('../../scene/__tests__/fixtures/stacjaPolePomiarowe.enm.json')],
  ['sieć 53 stacji', zRekordamiAparatowPol(enmPliku('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'))],
];

interface EtykietaKanwy {
  readonly ownerRef: string;
  readonly kind: string;
  readonly role: string;
  readonly strona: string;
  readonly anchor: string;
  readonly x: number;
  readonly obrocona: boolean;
}

/** Kanwa 16 000 × 9 000 px: kadr „Dopasuj widok" daje skalę, przy której etykiety `dane`
 *  przekraczają próg czytelności i są rysowane (przy 1600 × 900 plan ukrywa je licznikiem
 *  „Ukryto N opisów", a test pokrywałby wyłącznie podpisy aparatów). */
function etykietyKanwy(enm: EnergyNetworkModel): EtykietaKanwy[] {
  const { container } = render(<SldCanvasV3 snapshot={enm} width={16000} height={9000} lodOverride={2} animateLodTransitions={false} />);
  const wynik = [...container.querySelectorAll('g[data-testid^="sld-v3-label-"]')].map((g) => {
    const t = g.querySelector('text')!;
    return {
      ownerRef: g.getAttribute('data-owner-ref') ?? '',
      kind: g.getAttribute('data-owner-kind') ?? '',
      role: g.getAttribute('data-label-role') ?? '',
      strona: g.getAttribute('data-label-strona') ?? '',
      anchor: t.getAttribute('text-anchor') ?? '',
      x: Number(t.getAttribute('x')),
      obrocona: t.hasAttribute('transform'),
    };
  });
  cleanup();
  return wynik;
}

describe('(B) render kanwy LOD 2 — etykiety danych i podpisy aparatów zaczepione w krawędzi od strony symbolu', () => {
  const ETYKIETY = FIKSTURY.map(([nazwa, enm]) => [nazwa, etykietyKanwy(enm)] as const);

  for (const [nazwa, etykiety] of ETYKIETY) {
    it(nazwa, () => {
      expect(etykiety.length, `${nazwa}: kanwa rysuje etykiety`).toBeGreaterThan(0);
      for (const e of etykiety) {
        if (e.obrocona || (e.role !== 'dane' && e.kind !== 'apparatus')) continue;
        if (e.strona === 'left') expect(e.anchor, `${nazwa}: ${e.ownerRef} (lewa)`).toBe('end');
        if (e.strona === 'right') expect(e.anchor, `${nazwa}: ${e.ownerRef} (prawa)`).toBe('start');
      }
    });
  }

  // Komórka „dane po lewej" nie występuje w danych produktu: etykiety `dane` mają stronę
  // prawą (wiersze bloku przekaźnika, adnotacje CT/VT), dolną (lista kodów R-2, wiersze nazw
  // stacji) albo żadną (opisy odcinków, portów, końców toru — środek odcinka); plan
  // czytelności nie przenosi ich na stronę lewą (sonda 2026-10-30: 58 fikstur × skale 0,5/1/2/4,
  // zero przypadków). Regułę dla tej komórki przypina tabela prawdy (A).
  it('iloczyn {dane, podpis aparatu} × {lewa, prawa} osiągalny w danych produktu pokryty na kolekcji fikstur (test nie jest pusty)', () => {
    const komorki = new Set<string>();
    for (const [, etykiety] of ETYKIETY) {
      for (const e of etykiety) {
        if (e.obrocona || (e.strona !== 'left' && e.strona !== 'right')) continue;
        if (e.role === 'dane') komorki.add(`dane|${e.strona}`);
        if (e.kind === 'apparatus') komorki.add(`aparat|${e.strona}`);
      }
    }
    expect([...komorki].sort()).toEqual(['aparat|left', 'aparat|right', 'dane|right']);
  });

  it('(C) podpisy aparatów po lewej stronie toru jednego pola GPZ mają wspólną prawą krawędź (≤ 1 jednostka świata)', () => {
    let pola = 0;
    for (const [nazwa, etykiety] of ETYKIETY.slice(0, 2)) {
      const wPolu = new Map<string, number[]>();
      for (const e of etykiety) {
        const dopasowanie = /^(.*)#etykieta-aparatu-/.exec(e.ownerRef);
        if (!dopasowanie || e.strona !== 'left' || e.obrocona) continue;
        wPolu.set(dopasowanie[1], [...(wPolu.get(dopasowanie[1]) ?? []), e.x]);
      }
      for (const [pole, krawedzie] of wPolu) {
        if (krawedzie.length < 2) continue;
        pola += 1;
        expect(Math.max(...krawedzie) - Math.min(...krawedzie), `${nazwa}: ${pole} (${krawedzie.join(', ')})`).toBeLessThanOrEqual(1);
      }
    }
    expect(pola, 'pola GPZ z co najmniej dwoma podpisami po lewej').toBeGreaterThan(0);
  });
});
