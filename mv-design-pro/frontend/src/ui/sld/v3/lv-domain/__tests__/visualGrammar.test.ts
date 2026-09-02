/**
 * GRAMATYKA WIZUALNA nN (§20–§30, §41–§44) — czyste funkcje: fit, zawijanie,
 * limity znaków, sufit rozmiaru symbolu w slocie, nośniki stanów, rejestr
 * elementów kanwy, paleta mono.
 */
import { describe, expect, it } from 'vitest';

import { composeLvDomainScene } from '../composeLvDomainScene';
import { scenariusz } from '../fixtures/scenariusze';
import {
  CHAR_WIDTH_RATIO,
  CHAR_WIDTH_RATIO_BOLD,
  FIT_SCALE_CLAMP,
  LINE_DASH_SCREEN_PX,
  OCCUPANCY,
  POZIOMY_LOD,
  RASTER,
  REJESTR_ELEMENTOW_KANWY,
  SYMBOL_SCREEN_PX,
  SYMBOL_SLOT_SHARE,
  TOKENY_GEOMETRII,
  celGlifuNaEkranie,
  doRastra,
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
      it(`[${name} @ ${vp.w}×${vp.h}] oś wiążąca trafia w cel zajętości (chyba że clamp), obie osie ≤ celu, treść wycentrowana`, () => {
        const fit = fitSceneToViewport(scene.width, scene.height, vp.w, vp.h);
        const occX = (fit.s * scene.width) / vp.w;
        const occY = (fit.s * scene.height) / vp.h;
        const clamped = fit.s === FIT_SCALE_CLAMP.min || fit.s === FIT_SCALE_CLAMP.max;
        if (!clamped) {
          expect(Math.abs(occX - OCCUPANCY.xTarget) < 1e-9 || Math.abs(occY - OCCUPANCY.yTarget) < 1e-9, `occX=${occX} occY=${occY}`).toBe(true);
        }
        expect(occX).toBeLessThanOrEqual(OCCUPANCY.xTarget + 1e-9);
        expect(occY).toBeLessThanOrEqual(OCCUPANCY.yTarget + 1e-9);
        expect(fit.tx).toBeCloseTo((vp.w - fit.s * scene.width) / 2, 9);
        expect(fit.ty).toBeCloseTo((vp.h - fit.s * scene.height) / 2, 9);
      });
    }
  }

  it('pasmo zajętości §25 to 70–85 %, cel w środku pasma', () => {
    expect(OCCUPANCY.min).toBe(0.7);
    expect(OCCUPANCY.max).toBe(0.85);
    expect(OCCUPANCY.xTarget).toBeGreaterThanOrEqual(OCCUPANCY.min);
    expect(OCCUPANCY.xTarget).toBeLessThanOrEqual(OCCUPANCY.max);
    expect(OCCUPANCY.yTarget).toBeGreaterThanOrEqual(OCCUPANCY.min);
  });

  it('clamp MAX: mikroskopijna scena NIE jest rozdmuchana ponad FIT_SCALE_CLAMP.max', () => {
    expect(fitSceneToViewport(100, 80, 1400, 900).s).toBe(FIT_SCALE_CLAMP.max);
  });

  it('clamp MIN trzyma czytelność rastru, ale NIGDY nie wypycha sceny poza kadr (§43 wąski ekran — skala „zmieść wszystko")', () => {
    // 3000 j.św. na 1400 px: cel 0,8 dałby 0,37 < clamp 0,4, a „zmieść
    // wszystko" (0,47) na to pozwala → obowiązuje clamp.
    expect(fitSceneToViewport(3000, 1000, 1400, 900).s).toBe(FIT_SCALE_CLAMP.min);
    // 4000 j.św.: nawet „zmieść wszystko" (0,35) jest poniżej clampu → clamp
    // ustępuje, scena zostaje w kadrze.
    expect(fitSceneToViewport(4000, 1000, 1400, 900).s).toBeCloseTo(0.35, 9);
    const mobile = fitSceneToViewport(2200, 700, 390, 600);
    expect(mobile.s).toBeLessThan(FIT_SCALE_CLAMP.min);
    expect(mobile.s * 2200).toBeLessThanOrEqual(390);
    expect(mobile.tx).toBeGreaterThanOrEqual(0);
  });

  it('degeneracja (scena/viewport ≤ 0) daje neutralny fit, zero wyjątku', () => {
    expect(fitSceneToViewport(0, 0, 1400, 900)).toEqual({ s: 1, tx: 0, ty: 0 });
    expect(fitSceneToViewport(800, 600, 0, 0)).toEqual({ s: 1, tx: 0, ty: 0 });
  });
});

describe('§30 zawijanie nazw — nigdy poza slot: łamanie wyrazów z dywizem, skrót „…" po ostatnim wierszu', () => {
  it('krótka nazwa = jeden wiersz; dłuższa dzieli się po spacjach', () => {
    expect(zawinNazwe('Odbiór A1', 12, 3)).toEqual(['Odbiór A1']);
    expect(zawinNazwe('Wentylacja mechaniczna hali', 12, 3)).toEqual(['Wentylacja', 'mechaniczna', 'hali']);
  });

  it('wyraz dłuższy niż wiersz jest ŁAMANY z dywizem (nie wystaje poza slot)', () => {
    const linie = zawinNazwe('Oświetlenie zewnętrzne parkingu', 8, 4);
    for (const l of linie) expect(l.length, l).toBeLessThanOrEqual(8);
    expect(linie[0].endsWith('-')).toBe(true);
    expect(linie.join('')).toContain('Oświetl-enie');
  });

  it('wyraz z dywizem łamie się NAJPIERW na dywizie („grid-following" → „grid-" / „following"), nie w środku członu', () => {
    expect(zawinNazwe('podąża za siecią · grid-following', 12, 4)).toEqual(['podąża za', 'siecią ·', 'grid-', 'following']);
    expect(zawinNazwe('grid-forming', 8, 3)).toEqual(['grid-', 'forming']);
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

describe('§43/§44 symbole screen-stable z SUFITEM udziału w slocie — na wąskim ekranie glify sąsiednich kolumn się nie zlewają', () => {
  it('przy skali ≥ 1 cel = SYMBOL_SCREEN_PX; przy małej skali cel maleje proporcjonalnie do slotu', () => {
    for (const kind of Object.keys(SYMBOL_SCREEN_PX) as (keyof typeof SYMBOL_SCREEN_PX)[]) {
      expect(celGlifuNaEkranie(kind, 1)).toBeLessThanOrEqual(SYMBOL_SCREEN_PX[kind]);
      expect(celGlifuNaEkranie(kind, 0.25)).toBeLessThan(celGlifuNaEkranie(kind, 1));
      expect(celGlifuNaEkranie(kind, 0.25)).toBeLessThanOrEqual(SYMBOL_SLOT_SHARE[kind] * TOKENY_GEOMETRII.sourceSlot * 0.25 + 1e-9);
      expect(celGlifuNaEkranie(kind, 0)).toBeGreaterThanOrEqual(2);
    }
  });

  it('dwa aparaty w sąsiednich slotach przy skali 0,25 nie nachodzą: 2 × połowa glifu < slot', () => {
    const s = 0.25;
    expect(celGlifuNaEkranie('apparatus', s)).toBeLessThan(TOKENY_GEOMETRII.feederGap * s);
    expect(celGlifuNaEkranie('transformer', s)).toBeLessThan(TOKENY_GEOMETRII.sourceSlot * s);
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
    expect(css['--sld-transformer-size']).toBe(`${SYMBOL_SCREEN_PX.transformer}px`);
    for (const klucz of Object.keys(css)) expect(klucz.startsWith('--sld-')).toBe(true);
  });

  it('transformator jest największym symbolem toru, ale lżejszy (62 px) — §9', () => {
    expect(SYMBOL_SCREEN_PX.transformer).toBe(62);
    for (const [kind, px] of Object.entries(SYMBOL_SCREEN_PX)) {
      if (kind !== 'transformer') expect(px).toBeLessThan(SYMBOL_SCREEN_PX.transformer);
    }
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
