/**
 * GRAMATYKA WIZUALNA nN (§20–§30, §41–§44) — czyste funkcje: fit, zawijanie,
 * limity znaków, sufit rozmiaru symbolu w slocie, nośniki stanów, rejestr
 * elementów kanwy, paleta mono.
 */
import { describe, expect, it } from 'vitest';

import { composeLvDomainScene } from '../composeLvDomainScene';
import { scenariusz } from '../fixtures/scenariusze';
import { CAD_SYMBOL_STROKE_PX } from '../../cad/CadSymbol';
import {
  BUS_STROKE_SCREEN_PX,
  CAD_U_PX,
  CHAR_WIDTH_RATIO,
  CHAR_WIDTH_RATIO_BOLD,
  FIT_SCALE_MAX,
  LINE_DASH_SCREEN_PX,
  LINE_SCREEN_PX,
  MIN_FIELD_WIDTH_PX,
  OCCUPANCY,
  POZIOMY_LOD,
  RASTER,
  REJESTR_ELEMENTOW_KANWY,
  SLD_LABEL,
  SYMBOL_SLOT_SHARE,
  TOKENY_GEOMETRII,
  doRastra,
  skalaMinimalna,
  skalaSymboluNaEkranie,
  elementyToru,
  etykietaStanuZasilania,
  fitSceneToViewport,
  licznikOdplywowLabel,
  limitZnakow,
  mocLabel,
  paletaMono,
  paletaNnDlaMotywu,
  plFixed,
  plNumber,
  snKvaLabel,
  tokenyCss,
  tonStanuZasilania,
  warstwaElementu,
  widocznyNaLod,
  wzorKreskiStanu,
  zawinNazwe,
  type ElementKanwyNn,
} from '../visualGrammar';

describe('§25 fit-to-content — zajętość osi wiążącej, clamp, centrowanie, wąski ekran', () => {
  const SCENY = [
    { name: '01', p: scenariusz('01_single_tr') },
    { name: '02', p: scenariusz('02_two_tr_qbc_open') },
    { name: '15', p: scenariusz('15_many_feeders') },
  ].map(({ name, p }) => ({ name, scene: composeLvDomainScene(p.graph, p.upstream_equivalents) }));
  const VIEWPORTY = [
    { w: 1400, h: 904 },
    { w: 1280, h: 704 },
  ];

  for (const { name, scene } of SCENY) {
    for (const vp of VIEWPORTY) {
      for (const lod of POZIOMY_LOD) {
        it(`[${name} @ ${vp.w}×${vp.h} · LOD ${lod}] oś wiążąca trafia w cel zajętości (chyba że clamp); przy clampie MIN treść przewija, nigdy nie jest ściskana`, () => {
          const fit = fitSceneToViewport(scene.width, scene.height, vp.w, vp.h, lod);
          const occX = (fit.s * scene.width) / vp.w;
          const occY = (fit.s * scene.height) / vp.h;
          const clampedMin = Math.abs(fit.s - skalaMinimalna(lod)) < 1e-12;
          const clampedMax = Math.abs(fit.s - FIT_SCALE_MAX) < 1e-12;
          if (!clampedMin && !clampedMax) {
            expect(Math.abs(occX - OCCUPANCY.xTarget) < 1e-9 || Math.abs(occY - OCCUPANCY.yTarget) < 1e-9, `occX=${occX} occY=${occY}`).toBe(true);
            expect(occX).toBeLessThanOrEqual(OCCUPANCY.xTarget + 1e-9);
            expect(occY).toBeLessThanOrEqual(OCCUPANCY.yTarget + 1e-9);
          }
          // MIN_FIELD_WIDTH (R2 §17): pole odpływu na ekranie nigdy węższe niż próg poziomu.
          expect(TOKENY_GEOMETRII.feederGap * fit.s).toBeGreaterThanOrEqual(MIN_FIELD_WIDTH_PX[lod] - 1e-9);
          expect(fit.contentWidth).toBeCloseTo(fit.s * scene.width, 9);
          expect(fit.contentHeight).toBeCloseTo(fit.s * scene.height, 9);
          if (fit.scroll) {
            expect(fit.contentWidth > vp.w || fit.contentHeight > vp.h).toBe(true);
            if (fit.contentWidth > vp.w) expect(fit.tx).toBe(0);
            if (fit.contentHeight > vp.h) expect(fit.ty).toBe(0);
          } else {
            expect(fit.tx).toBeCloseTo((vp.w - fit.s * scene.width) / 2, 9);
            expect(fit.ty).toBeCloseTo((vp.h - fit.s * scene.height) / 2, 9);
          }
        });
      }
    }
  }

  it('pasmo zajętości §25 to 70–85 %, cel w środku pasma', () => {
    expect(OCCUPANCY.min).toBe(0.7);
    expect(OCCUPANCY.max).toBe(0.85);
    expect(OCCUPANCY.xTarget).toBeGreaterThanOrEqual(OCCUPANCY.min);
    expect(OCCUPANCY.xTarget).toBeLessThanOrEqual(OCCUPANCY.max);
    expect(OCCUPANCY.yTarget).toBeGreaterThanOrEqual(OCCUPANCY.min);
  });

  it('clamp MAX: mikroskopijna scena NIE jest rozdmuchana ponad FIT_SCALE_MAX', () => {
    expect(fitSceneToViewport(100, 80, 1400, 900).s).toBe(FIT_SCALE_MAX);
  });

  it('MIN_FIELD_WIDTH per poziom (R2 §17): pełny 96 px > sieć 72 px > przegląd 40 px; skala minimalna = próg / slot odpływu', () => {
    expect(MIN_FIELD_WIDTH_PX).toEqual({ 0: 40, 1: 72, 2: 96 });
    for (const lod of POZIOMY_LOD) expect(skalaMinimalna(lod)).toBeCloseTo(MIN_FIELD_WIDTH_PX[lod] / TOKENY_GEOMETRII.feederGap, 12);
    expect(skalaMinimalna(2)).toBeGreaterThan(skalaMinimalna(1));
    expect(skalaMinimalna(1)).toBeGreaterThan(skalaMinimalna(0));
  });

  it('clamp MIN NIE pomniejsza sceny poniżej czytelności — scena wychodzi poza kadr i PRZEWIJA (pan/scroll), zamiast „zmieść wszystko"', () => {
    // 3000 j.św. na 1400 px: cel 0,8 dałby 0,37 < skala minimalna pełnego poziomu (0,75).
    const duza = fitSceneToViewport(3000, 1000, 1400, 900, 2);
    expect(duza.s).toBeCloseTo(skalaMinimalna(2), 12);
    expect(duza.scroll).toBe(true);
    expect(duza.contentWidth).toBeGreaterThan(1400);
    expect(duza.tx).toBe(0);
    // Wąski ekran: przegląd (LOD 0) ma niższy próg, ale nadal nie ściska pola poniżej 40 px.
    const mobile = fitSceneToViewport(2200, 700, 390, 600, 0);
    expect(mobile.s).toBeCloseTo(skalaMinimalna(0), 12);
    expect(TOKENY_GEOMETRII.feederGap * mobile.s).toBeGreaterThanOrEqual(MIN_FIELD_WIDTH_PX[0]);
    expect(mobile.scroll).toBe(true);
    // Scena, która mieści się w celu, nie przewija i jest wycentrowana.
    const mala = fitSceneToViewport(1000, 600, 1400, 900, 2);
    expect(mala.scroll).toBe(false);
    expect(mala.tx).toBeGreaterThan(0);
  });

  it('degeneracja (scena/viewport ≤ 0) daje neutralny fit, zero wyjątku', () => {
    expect(fitSceneToViewport(0, 0, 1400, 900)).toEqual({ s: 1, tx: 0, ty: 0, contentWidth: 0, contentHeight: 0, scroll: false });
    expect(fitSceneToViewport(800, 600, 0, 0)).toEqual({ s: 1, tx: 0, ty: 0, contentWidth: 800, contentHeight: 600, scroll: false });
  });
});

describe('§30 / R2 §17 zawijanie nazw — po słowach, BEZ łamania wyrazów, skrót „…" zamiast wystawania', () => {
  it('krótka nazwa = jeden wiersz; dłuższa dzieli się po spacjach', () => {
    expect(zawinNazwe('Odbiór A1', 12, 3)).toEqual(['Odbiór A1']);
    expect(zawinNazwe('Wentylacja mechaniczna hali', 12, 3)).toEqual(['Wentylacja', 'mechaniczna', 'hali']);
  });

  it('wyraz dłuższy niż wiersz NIE jest łamany (żadnego „Oświetl-enie"): zostaje w całości i jest skrócony „…" w limicie', () => {
    const linie = zawinNazwe('Oświetlenie zewnętrzne parkingu', 8, 4);
    for (const l of linie) expect(l.length, l).toBeLessThanOrEqual(8);
    for (const l of linie) expect(l.endsWith('-'), l).toBe(false);
    expect(linie[0]).toBe('Oświetl…');
    expect(linie.join(' ')).not.toContain('Oświetl-');
  });

  it('wyraz techniczny z dywizem („grid-following") nigdy nie jest dzielony na dywizie ani w środku', () => {
    const linie = zawinNazwe('podąża za siecią · grid-following', 12, 4);
    expect(linie.some((l) => l === 'grid-' || l === 'following')).toBe(false);
    for (const l of linie) expect(l.length).toBeLessThanOrEqual(12);
    expect(zawinNazwe('grid-forming', 12, 3)).toEqual(['grid-forming']);
    expect(zawinNazwe('grid-forming', 8, 3)).toEqual(['grid-fo…']);
  });

  it('powyżej limitu wierszy ostatni kończy się „…" (uczciwy skrót, nie ukrycie)', () => {
    const linie = zawinNazwe('Stacja ładowania pojazdów elektrycznych', 10, 2);
    expect(linie).toHaveLength(2);
    expect(linie[1].endsWith('…')).toBe(true);
    for (const l of linie) expect(l.length).toBeLessThanOrEqual(10);
  });

  it('pusty tekst daje jeden pusty wiersz; limit < 2 jest podnoszony do 2', () => {
    expect(zawinNazwe('   ', 10, 2)).toEqual(['']);
    expect(zawinNazwe('ab', 1, 2)).toEqual(['ab']);
  });

  it('limitZnakow: szerokość / (współczynnik · rozmiar), nie mniej niż 4; pismo półgrube liczy szerzej', () => {
    expect(limitZnakow(120, 12)).toBe(Math.floor(120 / (CHAR_WIDTH_RATIO * 12)));
    expect(limitZnakow(120, 12, CHAR_WIDTH_RATIO_BOLD)).toBeLessThan(limitZnakow(120, 12));
    expect(limitZnakow(1, 12)).toBe(4);
    expect(CHAR_WIDTH_RATIO_BOLD).toBeGreaterThan(CHAR_WIDTH_RATIO);
  });
});

describe('R2 §16/§19 JEDNA skala symboli CAD (CAD_U_PX) z SUFITEM udziału w slocie — symbole sąsiednich kolumn się nie zlewają', () => {
  const RODZAJE = Object.keys(SYMBOL_SLOT_SHARE) as (keyof typeof SYMBOL_SLOT_SHARE)[];

  /** Szerokość nominalna symbolu danego rodzaju [u] (zacisk/węzeł 8 u, reszta 16 u). */
  const szerokoscU = (kind: keyof typeof SYMBOL_SLOT_SHARE): number => (kind === 'junction' ? 8 : 16);

  it('przy skali fitu ≥ minimalnej pełnego poziomu każdy symbol rysuje się w CAD_U_PX (rozmiar nie koduje parametrów)', () => {
    for (const kind of RODZAJE) {
      expect(skalaSymboluNaEkranie(kind, szerokoscU(kind), 1), kind).toBe(CAD_U_PX);
      expect(skalaSymboluNaEkranie(kind, szerokoscU(kind), skalaMinimalna(2)), kind).toBe(CAD_U_PX);
    }
  });

  it('przy skali minimalnej przeglądu symbol nie przekracza udziału w slocie (aparat maleje), nigdy poniżej 0,2 px/u', () => {
    const s = skalaMinimalna(0);
    for (const kind of RODZAJE) {
      const slot = kind === 'transformer' || kind === 'generator' ? TOKENY_GEOMETRII.sourceSlot : TOKENY_GEOMETRII.feederGap;
      const w = szerokoscU(kind);
      expect(skalaSymboluNaEkranie(kind, w, s), kind).toBeLessThanOrEqual(CAD_U_PX);
      expect(skalaSymboluNaEkranie(kind, w, s) * w, kind).toBeLessThanOrEqual(SYMBOL_SLOT_SHARE[kind] * slot * s + 1e-9);
      expect(skalaSymboluNaEkranie(kind, w, 0), kind).toBeGreaterThanOrEqual(0.2);
    }
    expect(skalaSymboluNaEkranie('apparatus', 16, s)).toBeLessThan(CAD_U_PX);
  });

  it('dwa aparaty w sąsiednich slotach przy skali minimalnej przeglądu nie nachodzą: szerokość symbolu < slot', () => {
    const s = skalaMinimalna(0);
    expect(skalaSymboluNaEkranie('apparatus', 16, s) * 16).toBeLessThan(TOKENY_GEOMETRII.feederGap * s);
    expect(skalaSymboluNaEkranie('transformer', 16, s) * 16).toBeLessThan(TOKENY_GEOMETRII.sourceSlot * s);
  });

  it('hierarchia grubości (R2 §13): BUS > PRIMARY > symbol > SECONDARY; podświetlenie pod torem; bez skrajnych kontrastów', () => {
    expect(BUS_STROKE_SCREEN_PX.main).toBeGreaterThan(BUS_STROKE_SCREEN_PX.sub);
    expect(BUS_STROKE_SCREEN_PX.sub).toBeGreaterThan(LINE_SCREEN_PX.connection);
    expect(LINE_SCREEN_PX.connection).toBeGreaterThan(CAD_SYMBOL_STROKE_PX);
    expect(CAD_SYMBOL_STROKE_PX).toBeGreaterThan(LINE_SCREEN_PX.secondary);
    expect(LINE_SCREEN_PX.cable).toBe(LINE_SCREEN_PX.connection);
    expect(LINE_SCREEN_PX.coupler).toBe(LINE_SCREEN_PX.connection);
    expect(LINE_SCREEN_PX.highlight).toBeGreaterThan(BUS_STROKE_SCREEN_PX.main);
    expect(BUS_STROKE_SCREEN_PX.main / LINE_SCREEN_PX.secondary).toBeLessThanOrEqual(3);
  });
});

describe('§5/§17/§26 nośniki stanów — etykieta słowna + wzór kreski; kolor tylko drugim kanałem', () => {
  it('etykiety stanów po polsku, ENERGIZED bez etykiety (stan normalny)', () => {
    expect(etykietaStanuZasilania('DEENERGIZED')).toBe('NIEZASILONA (WG AKTUALNEJ TOPOLOGII)');
    expect(etykietaStanuZasilania('UNKNOWN')).toBe('STAN ZASILANIA NIEZNANY');
    expect(etykietaStanuZasilania('CONFLICT')).toBe('KONFLIKT ŹRÓDEŁ');
    expect(etykietaStanuZasilania('MULTISOURCE')).toBe('ZASILANIE WIELOSTRONNE');
    expect(etykietaStanuZasilania('ENERGIZED')).toBeNull();
  });

  it('wzór kreski: bez napięcia ≠ nieznany ≠ ciągła; granica ma własny wzór', () => {
    expect(wzorKreskiStanu('DEENERGIZED')).toEqual(LINE_DASH_SCREEN_PX.deenergized);
    expect(wzorKreskiStanu('UNKNOWN')).toEqual(LINE_DASH_SCREEN_PX.unknown);
    expect(wzorKreskiStanu('ENERGIZED')).toBeUndefined();
    expect(wzorKreskiStanu('MULTISOURCE')).toBeUndefined();
    expect(LINE_DASH_SCREEN_PX.deenergized).not.toEqual(LINE_DASH_SCREEN_PX.unknown);
    expect(LINE_DASH_SCREEN_PX.boundary).not.toEqual(LINE_DASH_SCREEN_PX.deenergized);
  });

  it('paleta MONO: jeden tusz — ton stanu nie niesie informacji, więc każdy stan musi mieć nośnik geometryczny', () => {
    const mono = paletaMono();
    expect(mono.tonOk).toBe(mono.tonBledu);
    expect(mono.tonBledu).toBe(mono.tonOstrzegawczy);
    expect(tonStanuZasilania('CONFLICT', mono)).toBe(mono.kreskaBazowa);
    for (const stan of ['DEENERGIZED', 'UNKNOWN', 'CONFLICT', 'MULTISOURCE'] as const) {
      expect(etykietaStanuZasilania(stan), stan).not.toBeNull();
    }
  });

  it('palety motywów: jasna ≠ ciemna; werdykt trzytonowy ma trzy różne tony w obu', () => {
    const ciemna = paletaNnDlaMotywu('dark_scada');
    const jasna = paletaNnDlaMotywu('light_technical');
    expect(jasna.tlo).not.toBe(ciemna.tlo);
    expect(jasna.kreskaBazowa).not.toBe(ciemna.kreskaBazowa);
    for (const paleta of [ciemna, jasna]) {
      expect(new Set([paleta.tonOk, paleta.tonBledu, paleta.tonOstrzegawczy]).size).toBe(3);
    }
  });
});

describe('§41/§42 tokeny geometrii i raster — jedno źródło liczb dla sceny i CSS', () => {
  it('każdy token geometrii jest wielokrotnością rastru', () => {
    for (const [nazwa, wartosc] of Object.entries(TOKENY_GEOMETRII)) {
      expect(wartosc % RASTER, nazwa).toBe(0);
    }
    expect(doRastra(13)).toBe(16);
    expect(doRastra(11)).toBe(8);
  });

  it('zmienne CSS `--sld-*` niosą te same liczby, co tokeny', () => {
    const css = tokenyCss();
    expect(css['--sld-feeder-gap']).toBe(String(TOKENY_GEOMETRII.feederGap));
    expect(css['--sld-bus-gap']).toBe(String(TOKENY_GEOMETRII.busGap));
    expect(css['--sld-section-gap']).toBe(String(TOKENY_GEOMETRII.sectionGap));
    expect(css['--sld-transformer-size']).toBe(`${CAD_U_PX * 28}px`);
    expect(css['--sld-device-size']).toBe(`${CAD_U_PX * 24}px`);
    expect(css['--sld-symbol-stroke']).toBe(`${CAD_SYMBOL_STROKE_PX}px`);
    expect(css['--sld-bus-stroke']).toBe(`${BUS_STROKE_SCREEN_PX.main}px`);
    for (const klucz of Object.keys(css)) expect(klucz.startsWith('--sld-')).toBe(true);
  });

  it('skala CAD: aparat 16×24 u = 32×48 px, transformator 16×28 u = 56 px — rozmiar nie koduje mocy (R2 §8); korpus aparatu ≈ 2× pismo oznaczenia', () => {
    expect(CAD_U_PX).toBe(2);
    expect(CAD_U_PX * 24).toBe(48);
    expect(CAD_U_PX * 28).toBe(56);
    expect(CAD_U_PX * 10).toBeGreaterThanOrEqual(1.5 * (SLD_LABEL.PRIMARY - 2));
  });
});

describe('§20/§28 rejestr elementów kanwy — LOD nigdy nie ukrywa toru', () => {
  it('każdy element warstwy TOR jest widoczny na WSZYSTKICH poziomach', () => {
    for (const kind of elementyToru()) {
      for (const lod of POZIOMY_LOD) expect(widocznyNaLod(kind, lod), `${kind}@${lod}`).toBe(true);
    }
  });

  it('każdy element warstwy OPIS żyje WYŁĄCZNIE na poziomie pełnym; TOZSAMOSC ma niepusty zasięg', () => {
    for (const kind of Object.keys(REJESTR_ELEMENTOW_KANWY) as ElementKanwyNn[]) {
      const wpis = REJESTR_ELEMENTOW_KANWY[kind];
      if (warstwaElementu(kind) === 'opis') expect(wpis.lody, kind).toEqual([2]);
      expect(wpis.lody.length, kind).toBeGreaterThan(0);
      expect(wpis.powod.length, kind).toBeGreaterThan(20);
    }
  });

  it('stany zasilania, wyspy, ostrzeżenia i status wyniku są widoczne na każdym poziomie (stan ruchowy, nie opis)', () => {
    for (const kind of ['znacznikStanuZasilania', 'znacznikWyspy', 'znacznikOstrzezenia', 'znacznikSwiezosciWyniku'] as const) {
      expect(REJESTR_ELEMENTOW_KANWY[kind].lody).toEqual([0, 1, 2]);
    }
  });
});

describe('formaty liczb po polsku', () => {
  it('przecinek dziesiętny, kVA, kW/MW, liczebniki odpływów', () => {
    expect(plNumber(0.4)).toBe('0,4');
    expect(plFixed(23.748, 2)).toBe('23,75');
    expect(snKvaLabel(0.63)).toBe('630 kVA');
    expect(mocLabel(0.05)).toBe('50 kW');
    expect(mocLabel(1.5)).toBe('1,50 MW');
    expect(licznikOdplywowLabel(1)).toBe('1 odpływ');
    expect(licznikOdplywowLabel(3)).toBe('3 odpływy');
    expect(licznikOdplywowLabel(12)).toBe('12 odpływów');
    expect(licznikOdplywowLabel(22)).toBe('22 odpływy');
  });
});
