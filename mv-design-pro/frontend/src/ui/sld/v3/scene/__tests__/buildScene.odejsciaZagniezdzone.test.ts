/**
 * ODEJŚCIA-ZAGNIEŻDŻONE — kilka odgałęzień z pól JEDNEJ stacji (karta
 * UX-04/POLE-LINIOWE-WZORZEC, znalezisko „2. odgałęzienie tej samej stacji krzyżuje
 * się" z `buildScene.p1Recenzja.test.ts`).
 *
 * Pomiar przed naprawą (sieć referencyjna 52 stacji, `appendLateralBranch`): +1
 * odgałęzienie — `crossingCount` 2, przecięcie pionu kanału z szyną SN stacji
 * sąsiedniego lateralu 1; +2 odgałęzienia — `crossingCount` 3–4, przecięcia z szyną 3.
 * Klasa defektu ma pięć instancji, każda naprawiona u źródła:
 *  1. jeden poziom odejścia dla wszystkich pól odgałęźnych stacji (poziome odcinki
 *     współliniowe, pion pola bliższego szczelinie przez poziom pola dalszego) —
 *     `departureLevelYOf` (`scene/buildScene.ts`) + `departureStripExtraHeight`
 *     (`layout/bands.ts`);
 *  2. port odejścia wybierany po KOLEJNOŚCI ciągów, nie po tożsamości pola startowego
 *     (`startingBayRef`) — `resolveBranchOrigin`; ta sama kolejność zamiast tożsamości
 *     przypisywała podpis odgałęzienia („⟨nazwa linii⟩ · odg. ⟨kod⟩") kolejnemu polu
 *     odgałęźnemu stacji — `przypiszOdgalezieniaPolom` (`compose/directions.ts`);
 *  3. port odejścia na L0 wspólny dla wszystkich odgałęzień (środek symbolu
 *     zbiorczego) — `collapsedBranchPortX`;
 *  4. rząd DER strony nN stacji stał ZA całym blokiem, więc jego szyna przechodziła
 *     pod polem na prawo od transformatora, a kabel tego pola ją przecinał (fałszywy
 *     węzeł T) — `nnGroupFlushX`/`zarezerwujGrupeNn` (`layout/measure.ts`);
 *  5. pion głębszego lateralu tej samej szczeliny przechodził przez kolumnę 0 wiersza
 *     płytszego (degeneracja c `insertColumnChannels`) — `kolejnoscKompozycjiLateralow`
 *     + `przesuniecieZaGlebszymiKanalami` (`scene/buildScene.ts`).
 *
 * ILOCZYN CECH: topologia {sieć referencyjna z pierścieniem, ta sama po usunięciu
 * pierścieni} × liczba dodanych odgałęzień tej samej stacji {1, 2} × poziom
 * szczegółu {L0, L1, L2}; do tego tożsamość (zamiana kolejności ciągów tej samej
 * stacji) i liczba poziomów odejścia {1, 2, 3+} w rezerwacji wysokości.
 * Duże topologie (≈106 stacji) — `buildScene.p1Recenzja.test.ts` (krok budżetów).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildSceneV3, layoutMetricsReport, type SceneV3 } from '../buildScene';
import { bridgePointsForPolyline, crossingBusGaps, interiorCrossings } from '../crossings';
import { computeBands, DESCENT_STRIP_HEIGHT, departureStripExtraHeight } from '../../layout/bands';
import { GRID } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { LODS, appendLateralBranch, loadEnm, radialize, sceneSignature } from './syntheticNetworks';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const here = dirname(fileURLToPath(import.meta.url));
const substrat = loadEnm(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'));
const lancuch = loadEnm(resolve(here, 'fixtures/openTrunkChain.enm.json'));
const gpzOchrony = loadEnm(resolve(here, 'fixtures/gpzProtectionDataPath.enm.json'));

const topologie: readonly { readonly nazwa: string; readonly siec: EnergyNetworkModel }[] = [
  { nazwa: 'sieć referencyjna z pierścieniem', siec: substrat },
  { nazwa: 'sieć referencyjna bez pierścieni', siec: radialize(substrat) },
];
const doklejenia: readonly { readonly nazwa: string; readonly zastosuj: (n: EnergyNetworkModel) => EnergyNetworkModel }[] = [
  { nazwa: '+1 odgałęzienie stacji z odgałęzieniem', zastosuj: (n) => appendLateralBranch(n, lancuch) },
  {
    nazwa: '+2 odgałęzienia tej samej stacji',
    zastosuj: (n) => appendLateralBranch(appendLateralBranch(n, lancuch), lancuch, 'p2branch'),
  },
];

/** Węzły T rozcinające segment WEWNĄTRZ stacji (właściciel spoza `seg/`): połączenie,
 *  którego w sieci nie ma — kabel pola przecinał tor wewnętrzny stacji. */
function wezlyTWewnatrzStacji(scena: SceneV3): string[] {
  return scena.segments
    .map((s) => s.meta?.ownerRef ?? '')
    .filter((owner) => /#tee-\d+$/.test(owner) && !owner.startsWith('seg/'));
}

/** Kropki węzła T (`resolveTeeJunctions`, rozstrzygnięcie S7-P2) w punkcie, w którym
 *  spotykają się kable DWÓCH RÓŻNYCH odgałęzień tej samej stacji. Przecięcie zejścia
 *  odgałęzienia z magistralą innej pary stacji dostaje kropkę z projektu S7-P2; dwa
 *  odgałęzienia jednej stacji nie mają prawa się spotkać — kropka między nimi rysuje
 *  połączenie dwóch odpływów, którego w sieci nie ma (pomiar przed naprawą na L0: 1 dla
 *  +1 odgałęzienia, 3 dla +2). */
function kropkiTMiedzyOdgalezieniamiStacji(model: EnergyNetworkModel, scena: SceneV3): string[] {
  const ciagSegmentu = new Map<string, { readonly stacja: string; readonly ciag: string }>();
  for (const run of model.line_runs ?? []) {
    if (run.run_kind !== 'branch') continue;
    for (const seg of run.segments) {
      ciagSegmentu.set(seg.segment_ref, { stacja: run.starting_bay_ref.replace(/\/sn_field\/\d+$/, ''), ciag: run.id });
    }
  }
  const kropki = scena.symbols
    .filter((s) => s.symbolId === 'junction' && String(s.meta?.testId ?? '').startsWith('sld-v3-wezel-t-'))
    .map((s) => ({ x: s.x + SYMBOL_DEFS.junction.width / 2, y: s.y + SYMBOL_DEFS.junction.height / 2 }));
  const wynik: string[] = [];
  for (const d of kropki) {
    const ciagi = new Map<string, string>();
    for (const seg of scena.segments) {
      const ciag = ciagSegmentu.get((seg.meta?.ownerRef ?? '').replace(/#tee-\d+$/, ''));
      if (!ciag) continue;
      const lezy = seg.points.some((a, k) => {
        const b = seg.points[k + 1];
        if (!b) return false;
        return (
          (a.x === b.x && a.x === d.x && d.y >= Math.min(a.y, b.y) && d.y <= Math.max(a.y, b.y))
          || (a.y === b.y && a.y === d.y && d.x >= Math.min(a.x, b.x) && d.x <= Math.max(a.x, b.x))
        );
      });
      if (lezy) ciagi.set(ciag.ciag, ciag.stacja);
    }
    const wpisy = [...ciagi.entries()];
    for (let i = 0; i < wpisy.length; i++) {
      for (let j = i + 1; j < wpisy.length; j++) {
        if (wpisy[i][1] === wpisy[j][1]) wynik.push(`${wpisy[i][0]} × ${wpisy[j][0]} @${d.x},${d.y}`);
      }
    }
  }
  return wynik;
}

interface Krawedz {
  readonly owner: string;
  readonly staly: number;
  readonly od: number;
  readonly do: number;
}

/** Odcinki toru mocy różnych właścicieli leżące współliniowo na wspólnym odcinku
 *  dodatniej długości — dwa obwody narysowane jedną kreską. */
function nakladaniaWspolliniowe(scena: SceneV3): string[] {
  const poziome: Krawedz[] = [];
  const pionowe: Krawedz[] = [];
  for (const s of scena.segments) {
    if ((s.meta?.kind ?? 'sn') !== 'sn') continue;
    const owner = (s.meta?.ownerRef ?? '').replace(/#tee-\d+$/, '');
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a.y === b.y && a.x !== b.x) poziome.push({ owner, staly: a.y, od: Math.min(a.x, b.x), do: Math.max(a.x, b.x) });
      if (a.x === b.x && a.y !== b.y) pionowe.push({ owner, staly: a.x, od: Math.min(a.y, b.y), do: Math.max(a.y, b.y) });
    }
  }
  const wynik: string[] = [];
  for (const zbior of [poziome, pionowe]) {
    const wgStalej = new Map<number, Krawedz[]>();
    for (const k of zbior) wgStalej.set(k.staly, [...(wgStalej.get(k.staly) ?? []), k]);
    for (const lista of wgStalej.values()) {
      for (let i = 0; i < lista.length; i++) {
        for (let j = i + 1; j < lista.length; j++) {
          const p = lista[i];
          const q = lista[j];
          if (p.owner === q.owner) continue;
          if (Math.min(p.do, q.do) - Math.max(p.od, q.od) > 0) wynik.push(`${p.owner} ≡ ${q.owner} @${p.staly}`);
        }
      }
    }
  }
  return wynik;
}

describe('ODEJŚCIA-ZAGNIEŻDŻONE — topologia × liczba odgałęzień tej samej stacji × poziom szczegółu', () => {
  for (const topo of topologie) {
    for (const dokl of doklejenia) {
      for (const lod of LODS) {
        it(`${topo.nazwa} × ${dokl.nazwa} × L${lod}: zero skrzyżowań (także z szyną), zero węzłów T w stacji i między odgałęzieniami stacji, zero nakładań`, () => {
          const model = dokl.zastosuj(topo.siec);
          const scena = buildSceneV3(model, lod);
          expect(layoutMetricsReport(scena).crossingCount).toBe(0);
          expect(kropkiTMiedzyOdgalezieniamiStacji(model, scena)).toEqual([]);
          expect(crossingBusGaps(scena.segments)).toEqual([]);
          expect(interiorCrossings(scena.segments)).toEqual([]);
          expect(wezlyTWewnatrzStacji(scena)).toEqual([]);
          expect(nakladaniaWspolliniowe(scena)).toEqual([]);
          // Degeneracja c (kanał w kolumnie 0 wiersza lateralu) nie występuje.
          expect(scena.meta.stopNotes.filter((n) => n.includes('degeneracja (c'))).toEqual([]);
        });
      }
    }
  }
});

describe('ODEJŚCIA-ZAGNIEŻDŻONE — port odejścia z tożsamości pola, nie z kolejności ciągów', () => {
  /** Odwraca KOLEJNOŚĆ ciągów odgałęzień wychodzących z pól tej samej stacji: adapter
   *  szereguje ciągi po `id` (`enmToSldAdapter.ts`), więc spójna zamiana identyfikatorów
   *  ciągów stacji (każde wystąpienie identyfikatora w modelu — ciąg, korytarz,
   *  odwołania) odwraca kolejność, w której scena je widzi, przy niezmienionych polach
   *  startowych (`starting_bay_ref`). Rysunek ma zostać bit w bit ten sam — port odejścia
   *  i podpis odgałęzienia wynikają z pola, nie z miejsca w kolejności. Jedyną dozwoloną
   *  różnicą jest numeracja stacji (`stationCode` adaptera nadaje kody S01… w kolejności
   *  przejścia ciągów, więc przemianowanie ciągów przenumerowuje stacje) — sygnatura
   *  zamienia kod na identyfikator stacji, któremu adapter go nadał. */
  function odwrocKolejnoscCiagowStacji(model: EnergyNetworkModel): EnergyNetworkModel {
    const wgStacji = new Map<string, string[]>();
    for (const run of model.line_runs ?? []) {
      if (run.run_kind !== 'branch') continue;
      const stacja = run.starting_bay_ref.replace(/\/sn_field\/\d+$/, '');
      wgStacji.set(stacja, [...(wgStacji.get(stacja) ?? []), run.id]);
    }
    const zamiana = new Map<string, string>();
    for (const ids of wgStacji.values()) {
      if (ids.length < 2) continue;
      const odwrocone = [...ids].reverse();
      ids.forEach((id, k) => zamiana.set(id, odwrocone[k]));
    }
    expect(zamiana.size, 'model ma stację z co najmniej dwoma odgałęzieniami').toBeGreaterThan(0);
    const przemianuj = (v: unknown): unknown => {
      if (typeof v === 'string') return zamiana.get(v) ?? v;
      if (Array.isArray(v)) return v.map(przemianuj);
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, w]) => [k, przemianuj(w)]));
      }
      return v;
    };
    return przemianuj(model) as EnergyNetworkModel;
  }

  /** Sygnatura sceny z kodami stacji zastąpionymi identyfikatorem stacji (numeracja jest
   *  konwencją kolejności przejścia, nie tożsamością). */
  function sygnaturaBezNumeracji(model: EnergyNetworkModel, lod: (typeof LODS)[number]): string {
    const dane = buildSldDataFromSnapshot(model, model.logical_views ?? null, null);
    const idStacji = new Map(dane.stations.map((s) => [s.stationCode, s.id]));
    return sceneSignature(buildSceneV3(model, lod)).replace(/\bS\d+\b/g, (kod) => idStacji.get(kod) ?? kod);
  }

  for (const dokl of doklejenia) {
    for (const lod of LODS) {
      it(`${dokl.nazwa} × L${lod}: odwrócona kolejność ciągów stacji nie zmienia rysunku ani podpisów`, () => {
        const model = dokl.zastosuj(substrat);
        expect(sygnaturaBezNumeracji(odwrocKolejnoscCiagowStacji(model), lod)).toBe(sygnaturaBezNumeracji(model, lod));
      });
    }
  }
});

describe('ODEJŚCIA-ZAGNIEŻDŻONE — grupa nN za ostatnim transformatorem, przed polem na prawo od niego', () => {
  for (const dokl of doklejenia) {
    for (const lod of [1, 2] as const) {
      it(`${dokl.nazwa} × L${lod}: szyna rzędu DER nN nie obejmuje osi żadnego pola SN stacji`, () => {
        const scena = buildSceneV3(dokl.zastosuj(substrat), lod);
        let stacjePolaZaTr = 0;
        let rzedyDer = 0;
        for (const seg of scena.segments) {
          const owner = seg.meta?.ownerRef ?? '';
          if (!owner.endsWith('/station#der-row-bus')) continue;
          rzedyDer += 1;
          const prefiks = owner.replace(/\/station#der-row-bus$/, '');
          const osiePol = scena.symbols
            .filter((s) => s.symbolId === 'breaker' && (s.meta?.ownerRef ?? '').startsWith(`${prefiks}/sn_field/`))
            .map((s) => s.x + SYMBOL_DEFS[s.symbolId].width / 2);
          const osieTr = scena.symbols
            .filter((s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith(`${prefiks}/`))
            .map((s) => s.x + SYMBOL_DEFS[s.symbolId].width / 2);
          if (osieTr.length > 0 && osiePol.some((x) => x > Math.max(...osieTr))) stacjePolaZaTr += 1;
          const lewo = Math.min(...seg.points.map((p) => p.x));
          const prawo = Math.max(...seg.points.map((p) => p.x));
          expect(osiePol.filter((x) => x >= lewo && x <= prawo), owner).toEqual([]);
        }
        // Warunek wstępny: scena ma rzędy DER i stację z polem SN na prawo od TR —
        // inaczej test nie ćwiczyłby instancji 4 klasy.
        expect(rzedyDer).toBeGreaterThan(0);
        expect(stacjePolaZaTr).toBeGreaterThan(0);
      });
    }
  }
});

/**
 * Wachlarz pól GPZ (fikstura `gpzProtectionDataPath`): ciąg główny wychodzi z pola
 * LEWEGO i kończy się stacją wiersza 0 (na wysokości GPZ), kabel odgałęzienia wychodzi
 * z pola PRAWEGO i kończy się stacją wiersza niższego. Przy torach ortogonalnych
 * wchodzących do stacji od lewej przecięcie tych dwóch kabli jest konieczne
 * topologicznie: poziom kabla z pola lewego musi minąć pion zejścia pola prawego, a gdyby
 * zszedł głębiej, jego pion powrotu do stacji wiersza 0 przeciąłby poziom kabla z pola
 * prawego. Dawniej `resolveTeeJunctions` zamieniał to przecięcie w KROPKĘ węzła T — czyli
 * w fikcyjne połączenie dwóch kabli dwóch różnych pól, którego w modelu ENM nie ma
 * (karta UX-04, wymaganie 8: zero fikcyjnych połączeń). Test sprawdzał wtedy „zero
 * skrzyżowań" tylko dlatego, że kropka rozcinała odcinki. Intencja testu po naprawie:
 * zero węzłów T, zero przecięć z szyną, a jedyne skrzyżowanie to dwa kable z dwóch pól
 * GPZ rysowane mostkiem (§22.1 `SLD_CAD_SPEC_V3.md`: skrzyżowanie ≠ połączenie).
 */
describe('ODEJŚCIA-ZAGNIEŻDŻONE — wachlarz pól GPZ na L0', () => {
  const KABEL_CIAGU_GLOWNEGO = 'seg/88ced29037bd5e349790a5f668820445/segment_L';
  const KABEL_ODGALEZIENIA = 'seg/f31c2d6beb2fb5ea74648308abfaa4d5/branch_segment_L';
  for (const lod of LODS) {
    it(`GPZ z kilkoma polami liniowymi × L${lod}: zejścia pól bez węzła T; jedyne skrzyżowanie to dwa kable dwóch pól, rysowane mostkiem`, () => {
      const scena = buildSceneV3(gpzOchrony, lod);
      expect(scena.segments.filter((s) => /#tee-\d+$/.test(s.meta?.ownerRef ?? ''))).toEqual([]);
      // Kropki węzła T z rozstrzygania przecięć (`sld-v3-wezel-t-…`) — zero. Kropki
      // `sld-v3-wezel-lateral-…` to węzły odgałęzień stacji z modelu, nie przecięcia.
      expect(
        scena.symbols.filter((s) => s.symbolId === 'junction' && (s.meta?.testId ?? '').startsWith('sld-v3-wezel-t-')),
      ).toEqual([]);
      expect(crossingBusGaps(scena.segments)).toEqual([]);
      const przeciecia = interiorCrossings(scena.segments);
      expect(przeciecia.map((c) => [c.hOwnerRef, c.vOwnerRef, c.involvesBus])).toEqual([
        [KABEL_CIAGU_GLOWNEGO, KABEL_ODGALEZIENIA, false],
      ]);
      // Mostek: pion kabla odgałęzienia przeskakuje poziom ciągu głównego dokładnie w
      // punkcie przecięcia (ta sama funkcja, której używa kanwa przy rysowaniu ścieżki).
      const pion = scena.segments.find((s) => s.meta?.ownerRef === KABEL_ODGALEZIENIA)!;
      const mostki = [...bridgePointsForPolyline(pion.points, przeciecia).values()].flat();
      expect(mostki).toEqual([przeciecia[0].y]);
    });
  }
});

describe('ODEJŚCIA-ZAGNIEŻDŻONE — rezerwacja wysokości strefy zejść', () => {
  it('jeden i dwa poziomy odejścia mieszczą się w dotychczasowej strefie; każdy kolejny dokłada GRID', () => {
    expect(departureStripExtraHeight(1)).toBe(0);
    expect(departureStripExtraHeight(2)).toBe(0);
    expect(departureStripExtraHeight(3)).toBe(GRID);
    expect(departureStripExtraHeight(5)).toBe(3 * GRID);
    // Wartość nieprawidłowa (0 poziomów) liczona jak jeden poziom — stacja bez pola odgałęźnego.
    expect(departureStripExtraHeight(0)).toBe(0);
  });

  it('computeBands: liczba poziomów wiersza = maksimum po stacjach, B4 rośnie tylko od trzeciego poziomu', () => {
    const stacja = (poziomy?: number) => ({
      incomingSegmentLabelText: null,
      stationBlockHeight: 200,
      nameBandHeight: 40,
      ...(poziomy != null ? { departureLevelCount: poziomy } : {}),
    });
    const bez = computeBands([stacja(), stacja()]);
    expect(bez.departureLevels).toBe(1);
    expect(bez.bands.B4.height).toBe(200 + DESCENT_STRIP_HEIGHT);
    const dwa = computeBands([stacja(1), stacja(2)]);
    expect(dwa.departureLevels).toBe(2);
    expect(dwa.bands.B4.height).toBe(bez.bands.B4.height);
    const cztery = computeBands([stacja(4), stacja(2)]);
    expect(cztery.departureLevels).toBe(4);
    expect(cztery.bands.B4.height).toBe(bez.bands.B4.height + 2 * GRID);
  });
});
