/**
 * Rozstrzygnięcia architekta z 2026-10-30 (S7-P2 i KD-5, `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`
 * §12) — warunek odbioru rysunku toru mocy na WSZYSTKICH fiksturach modelu ENM.
 *
 * Iloczyn cech: fikstura (każdy plik JSON z modelem ENM w katalogach fikstur SLD, harnessu
 * i `public` — sceny, kanwa, geometria v2, migawki harnessu) × LOD {0, 1, 2} × warunek:
 *  (a) zero kropek węzłowych bez węzła modelu (`meta.wezelModelu` ∉ Bus ∪ Bay ∪ Transformer
 *      modelu) i zero kropek poza torem;
 *  (b) każdy odczep z węzła pola i każdy T-styk tras zewnętrznych ma kropkę z węzłem modelu
 *      (T-styk dwóch kabli bez węzła modelu jest więc luką z konstrukcji);
 *  (c) każde przecięcie toru mocy ma rysowalny mostek §22.1 (`przecieciaBezMostka`);
 *  (d) zero przecięć z szyną (mostek na szynie zakazany);
 *  (e) KD-5: zero współliniowych nałożeń odcinków dwóch różnych właścicieli;
 *  (f) każdy koniec odcinka toru jest portem symbolu, portem zejścia bloku zwiniętego
 *      (`meta.portyZejscBloku`, na krawędzi bloku) albo dotyka innego odcinka
 *      (`sceneSegmentEndpointGaps` — pomiar przed naprawą: 15 luk, w tym 5 na L0 migawek
 *      sieci złotej z GPZ bez pola liniowego i 10 na L1/L2 przy szynie zerowej długości;
 *      po rozsunięciu zejść L0 dodatkowe 5 luk na portach zejść spoza osi bloku);
 *  (g) zero szyn zerowej długości (stacja z jednym zaczepem; pomiar przed naprawą: 10);
 *  (h) każde źródło ma tor do szyny (`sourceConnectivityGaps` — pomiar przed naprawą: 6,
 *      glif źródła pola OZE w GPZ bez przewodu z głowicy kablowej, L1/L2);
 *  (i) zero styków członów przęsła na obcym przewodzie (`stykiCzlonowNaObcychPrzewodach` —
 *      skrzyżowanie w styku nie jest wnętrzem krawędzi, więc nie dostaje mostka; pomiar przed
 *      naprawą: 0 na fiksturach, 1 na sieci referencyjnej z odgałęzieniem stacji z odgałęzieniem,
 *      `stykiCzlonow.test.ts`);
 *  (j) zero wierzchołków współliniowych na torze mocy (`wierzcholkiWspolliniowe` — ta sama
 *      klasa wewnątrz jednej łamanej; pomiar przed naprawą: 57 fikstur na L0, po jednym wierzchołku
 *      w zejściu źródła bloku GPZ; iniekcja dawnego `dedupeVertices` — 57 czerwonych przypadków).
 * Iniekcje: każda wyrocznia gryzie na scenie z realnej fikstury po wstrzyknięciu defektu,
 * który dawny kod produkował (kropka „węzła T" bez węzła modelu, kabel nałożony na kabel,
 * mostek za blisko końca pionu, pion przez szynę).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { PreviewSegment } from '../../compose/preview';
import { GRID } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3, sceneSegmentEndpointGaps, sourceConnectivityGaps, type SceneV3 } from '../buildScene';
import {
  crossingBusGaps,
  interiorCrossings,
  junctionDotGaps,
  nalozeniaRoznychWlascicieli,
  przecieciaBezMostka,
  wezlyModeluEnm,
} from '../crossings';
import { stykiCzlonowNaObcychPrzewodach, wierzcholkiWspolliniowe } from '../stykiCzlonow';

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../../../../..');
const KATALOGI = [
  'public/test-fixtures',
  'src/harness-fixtures/generated',
  'src/ui/sld/v2/geometry/__tests__/fixtures',
  'src/ui/sld/v3/canvas/__tests__/fixtures',
  'src/ui/sld/v3/scene/__tests__/fixtures',
];

/** Model ENM pliku: korzeń, `enm` (fikstury kanwy) albo `snapshot` (migawki biegu). */
function modelPliku(sciezka: string): EnergyNetworkModel | null {
  const raw = JSON.parse(readFileSync(sciezka, 'utf8')) as Record<string, unknown> | unknown[];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const kandydat of [raw, raw.enm, raw.snapshot]) {
    const enm = kandydat as Partial<EnergyNetworkModel> | undefined;
    if (enm && Array.isArray(enm.buses) && Array.isArray(enm.branches)) return enm as EnergyNetworkModel;
  }
  return null;
}

const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = KATALOGI.flatMap((katalog) =>
  readdirSync(resolve(FRONTEND, katalog))
    .filter((plik) => plik.endsWith('.json'))
    .sort()
    .flatMap((plik): (readonly [string, EnergyNetworkModel])[] => {
      const enm = modelPliku(resolve(FRONTEND, katalog, plik));
      return enm == null ? [] : [[`${katalog}/${plik}`, enm] as const];
    }),
);

const LODY = [0, 1, 2] as const;

/** Szyny (odcinki klasy szynowej) zerowej długości — wszystkie wierzchołki w jednym punkcie. */
function szynyZerowe(scene: SceneV3): string[] {
  return scene.segments
    .filter((g) => (g.meta?.kind === 'bus' || g.meta?.kind === 'busGpz') && g.points.every((p) => p.x === g.points[0]!.x && p.y === g.points[0]!.y))
    .map((g) => g.meta?.ownerRef ?? '');
}

const CZYSTA = {
  kropki: [],
  bezMostka: [],
  szyna: [],
  nalozenia: [],
  konce: [],
  szynyZerowe: [],
  zrodla: [],
  stykiNaPrzewodzie: [],
  wspolliniowe: [],
};

function prostokatySymboli(scene: SceneV3) {
  return scene.symbols.map((s) => ({ x: s.x, y: s.y, width: SYMBOL_DEFS[s.symbolId].width, height: SYMBOL_DEFS[s.symbolId].height }));
}

function wady(scene: SceneV3, enm: EnergyNetworkModel) {
  return {
    kropki: junctionDotGaps(scene, SYMBOL_DEFS, wezlyModeluEnm(enm)),
    bezMostka: przecieciaBezMostka(scene.segments),
    szyna: crossingBusGaps(scene.segments),
    nalozenia: nalozeniaRoznychWlascicieli(scene.segments),
    konce: sceneSegmentEndpointGaps(scene),
    szynyZerowe: szynyZerowe(scene),
    zrodla: sourceConnectivityGaps(scene),
    stykiNaPrzewodzie: stykiCzlonowNaObcychPrzewodach(scene.segments, prostokatySymboli(scene)),
    wspolliniowe: wierzcholkiWspolliniowe(scene.segments),
  };
}

describe('S7 (rozstrzygnięcie przecięć) i KD-5 — węzły, mostki i rozłączność toru na każdej fiksturze × LOD', () => {
  it('kontrola wejścia: 58 fikstur modelu ENM z pięciu katalogów (sceny, kanwa, v2, public, harness)', () => {
    expect(FIKSTURY).toHaveLength(58);
    for (const katalog of KATALOGI) expect(FIKSTURY.some(([n]) => n.startsWith(`${katalog}/`))).toBe(true);
    // Migawki biegu (model pod `snapshot`) i fikstury kanwy (model pod `enm`) są w zbiorze.
    expect(FIKSTURY.some(([n]) => n.endsWith('pulpit_scena_migawka.json'))).toBe(true);
    expect(FIKSTURY.some(([n]) => n.endsWith('sldSubstrate52s.enm.json'))).toBe(true);
  });

  it.each(FIKSTURY.flatMap(([nazwa, enm]) => LODY.map((lod) => [nazwa, lod, enm] as const)))(
    '%s L%i: zero kropek bez węzła modelu, każde przecięcie z mostkiem, zero przecięć szyny i nałożeń, końce zakotwiczone, szyny niezerowe, źródła przyłączone',
    (_nazwa, lod, enm) => {
      const scene = buildSceneV3(enm, lod);
      expect(wady(scene, enm)).toEqual(CZYSTA);
    },
  );

  it('zbiór zawiera przecięcia z mostkiem i kropki z węzłem modelu (wyrocznie nie są puste z konstrukcji)', () => {
    let przeciecia = 0;
    let kropki = 0;
    for (const [, enm] of FIKSTURY) {
      for (const lod of LODY) {
        const scene = buildSceneV3(enm, lod);
        przeciecia += interiorCrossings(scene.segments).filter((c) => !c.involvesBus).length;
        kropki += scene.symbols.filter((s) => s.symbolId === 'junction').length;
      }
    }
    // Pomiar 2026-10-30: 107 przecięć z mostkiem, 65 kropek z węzłem modelu. Kropka odczepu
    // stoi tylko w rozgałęzieniu (≥ 3 ramiona toru, `ramionaToru`): dawne 67 obejmowało dwie
    // kropki narożnika (gpzProtectionDataPath L1/L2 — uziemnik pola tr01 przy przekładniku,
    // za którym tor się nie ciągnie); przewód glifu źródła pola OZE z głowicy kablowej
    // (wyrocznia (h)) dokłada sześć narożników — też bez kropki.
    // AKTUALIZACJA ŚWIADOMA 107 → 113 (karta UX-04/POLE-LINIOWE-WZORZEC, regeneracja fikstur
    // generatorem): pomiar 2×2 per fikstura × LOD — kod karty na fiksturach sprzed regeneracji
    // daje 107, na fiksturach zregenerowanych 113; różnica w CAŁOŚCI to sieć referencyjna
    // `sldSubstrate52s.enm.json` (dwie kopie: `public/test-fixtures` i geometria v2) × L0/L1/L2,
    // po +1: nowe identyfikatory gałęzi (forma `starting_port_ref` i słownik kodów EAZ zmieniają
    // treść rekordów, a z nią skróty `ref_id`) zmieniają kolejność komponowania lateralów, co
    // dokłada jedno skrzyżowanie lateral×lateral (7 → 8, `crossings.test.ts`). Każde z nich ma
    // rysowalny mostek (wyrocznia (c) zielona na każdej fiksturze × LOD wyżej).
    expect(przeciecia).toBe(113);
    expect(kropki).toBe(65);
  });
});

describe('iniekcje — każda wyrocznia gryzie na realnej scenie', () => {
  const nazwa = 'src/ui/sld/v3/scene/__tests__/fixtures/gpzProtectionDataPath.enm.json';
  const enm = FIKSTURY.find(([n]) => n === nazwa)![1];
  const scene = buildSceneV3(enm, 2);
  const przeciecie = interiorCrossings(scene.segments).find((c) => !c.involvesBus)!;
  const kropka = scene.symbols.find((s) => s.symbolId === 'junction')!;
  const rozmiar = SYMBOL_DEFS.junction;

  it('scena wejściowa jest czysta i ma przecięcie oraz kropkę odczepu', () => {
    expect(wady(scene, enm)).toEqual(CZYSTA);
    expect(przeciecie).toBeDefined();
    expect(kropka.meta?.wezelModelu).toBeTruthy();
  });

  it('kropka „węzła T" w przecięciu kabli bez węzła modelu → luka kropka-bez-wezla-modelu', () => {
    const z = {
      ...scene,
      symbols: [
        ...scene.symbols,
        { ...kropka, x: przeciecie.x - rozmiar.width / 2, y: przeciecie.y - rozmiar.height / 2, meta: { elementKind: 'apparatus' as const } },
      ],
    };
    expect(junctionDotGaps(z, SYMBOL_DEFS, wezlyModeluEnm(enm))).toEqual([
      expect.objectContaining({ x: przeciecie.x, y: przeciecie.y, reason: 'kropka-bez-wezla-modelu' }),
    ]);
  });

  it('kropka wskazująca węzeł spoza modelu → luka kropka-bez-wezla-modelu', () => {
    const z = {
      ...scene,
      symbols: scene.symbols.map((s) => (s === kropka ? { ...s, meta: { ...s.meta, wezelModelu: 'wezel/nieistniejacy' } } : s)),
    };
    expect(junctionDotGaps(z, SYMBOL_DEFS, wezlyModeluEnm(enm)).map((g) => g.reason)).toEqual(
      expect.arrayContaining(['kropka-bez-wezla-modelu', 'rozgalezienie-bez-kropki']),
    );
  });

  it('kropka w narożniku toru (dawna kropka uziemnika pola tr01 za przekładnikiem) → luka kropka-bez-rozgalezienia', () => {
    // Odczep z węzła pola tr01 w (384, 600): port S przekładnika + odczep uziemnika = dwa
    // ramiona, tor dalej się nie ciągnie. Kod sprzed rozstrzygnięcia rysował tu kropkę.
    const narozne = scene.segments.find((s) => s.meta?.ownerRef?.endsWith('/bay/tr01#lateral-0'))!;
    const p = narozne.points[0]!;
    expect(scene.symbols.some((s) => s.symbolId === 'junction' && s.x === p.x - rozmiar.width / 2 && s.y === p.y - rozmiar.height / 2)).toBe(
      false,
    );
    const wezel = narozne.meta!.ownerRef!.slice(0, narozne.meta!.ownerRef!.indexOf('#'));
    const z = {
      ...scene,
      symbols: [
        ...scene.symbols,
        { ...kropka, x: p.x - rozmiar.width / 2, y: p.y - rozmiar.height / 2, meta: { ...kropka.meta, wezelModelu: wezel } },
      ],
    };
    expect(junctionDotGaps(z, SYMBOL_DEFS, wezlyModeluEnm(enm))).toEqual([
      expect.objectContaining({ x: p.x, y: p.y, reason: 'kropka-bez-rozgalezienia' }),
    ]);
  });

  it('kropka odczepu przesunięta z toru → luka kropka-poza-torem i rozgalezienie-bez-kropki', () => {
    const z = { ...scene, symbols: scene.symbols.map((s) => (s === kropka ? { ...s, x: s.x + 3 * 8, y: s.y + 3 * 8 } : s)) };
    expect(junctionDotGaps(z, SYMBOL_DEFS, wezlyModeluEnm(enm)).map((g) => g.reason).sort()).toEqual([
      'kropka-poza-torem',
      'rozgalezienie-bez-kropki',
    ]);
  });

  it('T-styk dwóch kabli bez węzła modelu (dawne rozcięcie kabla w przecięciu) → luka rozgalezienie-bez-kropki', () => {
    const pion = scene.segments.find((s) => s.meta?.ownerRef === przeciecie.vOwnerRef)!;
    const i = pion.points.findIndex(
      (p, k) => k + 1 < pion.points.length && p.x === przeciecie.x && pion.points[k + 1]!.x === przeciecie.x,
    );
    const ucietyDoPrzeciecia: PreviewSegment = {
      ...pion,
      meta: { ...pion.meta!, ownerRef: `seg/wstrzykniety#uciety` },
      points: [...pion.points.slice(0, i + 1), { x: przeciecie.x, y: przeciecie.y }],
    };
    const z = { ...scene, segments: [...scene.segments.filter((s) => s !== pion), ucietyDoPrzeciecia] };
    const luki = junctionDotGaps(z, SYMBOL_DEFS, wezlyModeluEnm(enm));
    expect(luki).toEqual(
      expect.arrayContaining([expect.objectContaining({ x: przeciecie.x, y: przeciecie.y, reason: 'rozgalezienie-bez-kropki' })]),
    );
  });

  it('mostek nierysowalny (przecięcie bliżej końca pionu niż promień mostka) → przecieciaBezMostka', () => {
    const segmenty: PreviewSegment[] = [
      { points: [{ x: 0, y: 0 }, { x: 0, y: 10 }], meta: { kind: 'sn', ownerRef: 'seg/a', elementKind: 'segment' } },
      { points: [{ x: -16, y: 7 }, { x: 16, y: 7 }], meta: { kind: 'sn', ownerRef: 'seg/b', elementKind: 'segment' } },
    ];
    expect(przecieciaBezMostka(segmenty)).toEqual([expect.objectContaining({ x: 0, y: 7 })]);
    // Kontrola: ten sam układ z przecięciem w środku pionu jest pokryty mostkiem.
    const zdrowy = [segmenty[0]!, { ...segmenty[1]!, points: [{ x: -16, y: 5 }, { x: 16, y: 5 }] }];
    expect(przecieciaBezMostka(zdrowy)).toEqual([]);
  });

  it('dwa mostki jednego pionu bliżej niż średnica łuku → przecieciaBezMostka', () => {
    const segmenty: PreviewSegment[] = [
      { points: [{ x: 0, y: 0 }, { x: 0, y: 40 }], meta: { kind: 'sn', ownerRef: 'seg/a', elementKind: 'segment' } },
      { points: [{ x: -16, y: 16 }, { x: 16, y: 16 }], meta: { kind: 'sn', ownerRef: 'seg/b', elementKind: 'segment' } },
      { points: [{ x: -16, y: 22 }, { x: 16, y: 22 }], meta: { kind: 'sn', ownerRef: 'seg/c', elementKind: 'segment' } },
    ];
    expect(przecieciaBezMostka(segmenty).map((c) => c.y)).toEqual([16, 22]);
  });

  it('kabel nałożony na odcinek innego kabla (KD-5) → nalozeniaRoznychWlascicieli', () => {
    const kabel = scene.segments.find((s) => s.meta?.ownerRef === przeciecie.hOwnerRef)!;
    const z = [...scene.segments, { ...kabel, meta: { ...kabel.meta!, ownerRef: 'seg/wstrzykniety-drugi-kabel' } }];
    const nalozenia = nalozeniaRoznychWlascicieli(z);
    expect(nalozenia.length).toBeGreaterThan(0);
    expect(nalozenia.every((n) => n.ownerB === 'seg/wstrzykniety-drugi-kabel' || n.ownerA === 'seg/wstrzykniety-drugi-kabel')).toBe(
      true,
    );
  });

  it('styk członów przęsła przesunięty na obcy kabel → stykiCzlonowNaObcychPrzewodach', () => {
    // Pion obcego kabla przecinający poziom `przeciecie.hOwnerRef` — rozcięty w punkcie przecięcia
    // na dwa człony współliniowe (styk na przewodzie poziomym, jak cięcie przęsła sprzed naprawy).
    const pion = scene.segments.find((s) => s.meta?.ownerRef === przeciecie.vOwnerRef)!;
    const i = pion.points.findIndex(
      (p, k) => k + 1 < pion.points.length && p.x === przeciecie.x && pion.points[k + 1]!.x === przeciecie.x,
    );
    const punkt = { x: przeciecie.x, y: przeciecie.y };
    const czlonPrzed: PreviewSegment = { ...pion, meta: { ...pion.meta!, ownerRef: 'seg/wstrzykniety-przed' }, points: [...pion.points.slice(0, i + 1), punkt] };
    const czlonZa: PreviewSegment = { ...pion, meta: { ...pion.meta!, ownerRef: 'seg/wstrzykniety-za' }, points: [punkt, ...pion.points.slice(i + 1)] };
    const z = [...scene.segments.filter((s) => s !== pion), czlonPrzed, czlonZa];
    expect(stykiCzlonowNaObcychPrzewodach(z, prostokatySymboli(scene))).toEqual([
      expect.objectContaining({ punkt, wlascicielPrzed: 'seg/wstrzykniety-przed', wlascicielZa: 'seg/wstrzykniety-za', obcyPrzewod: przeciecie.hOwnerRef }),
    ]);
  });

  it('wierzchołek współliniowy na torze (dawne zejście źródła GPZ na L0) → wierzcholkiWspolliniowe', () => {
    const kabel = scene.segments.find((s) => s.meta?.ownerRef === przeciecie.hOwnerRef)!;
    const [a, b] = [kabel.points[0]!, kabel.points[1]!];
    const srodek = { x: a.x === b.x ? a.x : (a.x + b.x) / 2, y: a.y === b.y ? a.y : (a.y + b.y) / 2 };
    const z = scene.segments.map((s) => (s === kabel ? { ...s, points: [a, srodek, ...s.points.slice(1)] } : s));
    expect(wierzcholkiWspolliniowe(z)).toEqual([{ ownerRef: przeciecie.hOwnerRef, punkt: srodek }]);
  });

  it('pion kabla przez szynę → crossingBusGaps', () => {
    const szyna = scene.segments.find((s) => s.meta?.kind === 'busGpz')!;
    const [a, b] = szyna.points as readonly [{ x: number; y: number }, { x: number; y: number }];
    const x = (a.x + b.x) / 2;
    const z = [
      ...scene.segments,
      { points: [{ x, y: a.y - 32 }, { x, y: a.y + 32 }], meta: { kind: 'sn' as const, ownerRef: 'seg/wstrzykniety', elementKind: 'segment' as const } },
    ];
    expect(crossingBusGaps(z)).toEqual([expect.objectContaining({ x, y: a.y })]);
  });
  it('port zejścia bloku zwiniętego zadeklarowany POZA krawędzią bloku → luka końca odcinka (L0)', () => {
    const l0 = buildSceneV3(enm, 0);
    expect(sceneSegmentEndpointGaps(l0)).toEqual([]);
    const blok = l0.symbols.find((s) => s.symbolId === 'gpzCollapsed')!;
    const porty = blok.meta?.portyZejscBloku ?? [];
    // Wachlarz gpzProtectionDataPath ma zejścia spoza osi bloku (porty deklarowane).
    expect(porty.length).toBeGreaterThan(1);
    const przesuniete = porty.map((p) => ({ x: p.x, y: p.y + GRID }));
    const z: SceneV3 = {
      ...l0,
      symbols: l0.symbols.map((s) => (s === blok ? { ...s, meta: { ...s.meta, portyZejscBloku: przesuniete } } : s)),
    };
    expect(sceneSegmentEndpointGaps(z).length).toBeGreaterThan(0);
    // Bez deklaracji portów zejścia poza osią wiszą w pustce.
    const bezPortow: SceneV3 = {
      ...l0,
      symbols: l0.symbols.map((s) => (s === blok ? { ...s, meta: { ...s.meta, portyZejscBloku: undefined } } : s)),
    };
    expect(sceneSegmentEndpointGaps(bezPortow).length).toBe(porty.length - 1);
  });

  it('szyna zwinięta do punktu → szynyZerowe', () => {
    const szyna = scene.segments.find((s) => s.meta?.kind === 'busGpz')!;
    const z: SceneV3 = {
      ...scene,
      segments: scene.segments.map((g) => (g === szyna ? { ...g, points: [g.points[0]!, g.points[0]!] } : g)),
    };
    expect(szynyZerowe(z)).toEqual([szyna.meta?.ownerRef ?? '']);
  });

  it('glif źródła pola OZE bez przewodu z głowicy kablowej → sourceConnectivityGaps', () => {
    const [, magazyn] = FIKSTURY.find(([n]) => n.endsWith('magazyn_scena_migawka.json'))!;
    const l2 = buildSceneV3(magazyn, 2);
    expect(sourceConnectivityGaps(l2)).toEqual([]);
    const zrodlo = l2.symbols.find((s) => s.meta?.elementKind === 'der' || s.meta?.elementKind === 'source')!;
    const ref = zrodlo.meta!.ownerRef!;
    // Przewód glifu: odcinek odczepu pola źródła kończący się w porcie glifu.
    const port = { x: zrodlo.x + SYMBOL_DEFS[zrodlo.symbolId].width / 2, y: zrodlo.y };
    const bezPrzewodu: SceneV3 = {
      ...l2,
      segments: l2.segments.filter((g) => !(g.meta?.ownerRef?.startsWith(ref) && g.points.some((p) => p.x === port.x && p.y === port.y))),
    };
    expect(bezPrzewodu.segments.length).toBe(l2.segments.length - 1);
    expect(sourceConnectivityGaps(bezPrzewodu).map((g) => g.sourceId)).toEqual([ref]);
  });
});
