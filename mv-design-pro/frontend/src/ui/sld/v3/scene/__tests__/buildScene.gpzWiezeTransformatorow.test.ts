// @vitest-environment node
/**
 * GPZ: wieże kolejnych transformatorów tej samej sekcji SN. Dawniej każda wieża
 * (pole WN TR → TR2W → pole TR) stała na środku swojej sekcji docelowej, więc dwa
 * transformatory jednej sekcji rysowały się w tej samej osi X — jeden na drugim.
 * Teraz grupa wież sekcji jest rozkładana obok siebie w porządku `transformerRef`
 * (zasięg wieży z tej samej arytmetyki co jej budowa), sekcja jest dość szeroka,
 * by każde zejście trafiało w jej szynę, a grupa sekcji następnej nie zachodzi na
 * grupę poprzedniej. Transformator bez sekcji docelowej (szyna SN spoza sekcji GPZ)
 * dostaje wieżę na prawo od sekcji, bez zejścia do szyny, której model mu nie
 * przypisuje, i wpis braku danych — dawny przydział zastępczy po indeksie
 * dowiązywał go do cudzej szyny.
 *
 * Ta sama arytmetyka pasma nad szyną SN (`layoutSections`) rezerwuje etykietę sekcji
 * (lewy koniec szyny), grupę wież i pas wyłącznika sprzęgła między sekcjami.
 *
 * Karta GPZ-MODEL: transformatory 110/SN są elementami modelu WYŁĄCZNIE przy
 * równoważniku sieci po stronie 110 kV — źródło stoi wtedy na wspólnej szynie WN
 * i wieńczy kolumnę WN (blok źródła przy prawym końcu szyny WN). Dawny wymiar
 * „źródło na szynie sekcji 1 / sekcji 2" obok transformatorów oraz „zasilanie
 * dwustronne" dwoma równoważnikami na szynach SN opisywały model, którego backend
 * już nie wytwarza (równoważnik na szynach SN odmawia transformatorów, a GPZ ma jeden
 * równoważnik). Blok źródła na szynach SN (tryb bez transformatorów) bada osobny
 * opis niżej, na migawce wytworzonej przez backend (eksport harnessu, dwie sekcje).
 *
 * Iloczyn cech na realnej ścieżce (migawka ENM → adapter → kompozycja → scena v3):
 * {1, 2, 3 transformatory na sekcji} × {sekcja 1, sekcja 2} × {sekcja 1 z polami
 * fikstury, sekcja 1 bez pól (wąska: zasięg tabliczki wieży sięga sekcji następnej)}
 * × {bez sprzęgła, ze sprzęgłem} × LOD {1, 2}; druga sekcja zawsze z jednym
 * transformatorem (sąsiad grupy). Kryteria: jeden symbol TR2W na transformator,
 * zejście na szynie SN sekcji docelowej i zaczep na szynie WN, osie rosnące
 * w porządku refów, źródło nad prawym końcem szyny WN, wyłącznik sprzęgła między
 * szynami, brak przecięcia prostokątów (symbole i etykiety) wieży, źródła i sprzęgła
 * z czymkolwiek spoza nich, żadna etykieta GPZ nieusunięta przez silnik etykiet,
 * determinizm względem kolejności transformatorów w modelu.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Bus, EnergyNetworkModel, Transformer } from '../../../../../types/enm';
import { pole } from '../../../../../test/pola';
import { rectsOverlap, type V3Rect } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildCanonicalGpzProps } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import { composeGpz } from '../../compose/gpz';
import { buildSceneV3, type SceneV3 } from '../buildScene';
import { buildDerSnFixture } from './fixtures/w2cDerSnFixtures';

type Sekcja = 1 | 2;
const LICZBY: readonly (1 | 2 | 3)[] = [1, 2, 3];
const POLA_SEKCJI_1: readonly boolean[] = [true, false];
const SPRZEGLO: readonly boolean[] = [false, true];
const POLE_SPRZEGLA = 'gpz-test/sprzeglo';
/** GEOMETRIA-STACJI (§0 pkt 2): sprzęgło istnieje z gałęzi `bus_coupler` łączącej szyny
 *  sekcji (jedno źródło); rekord pola COUPLER wskazuje ją i dokłada oznaczenie. Dawniej
 *  fikstura niosła samo pole COUPLER z `right/left_coupler_ref` — sprzęgło bez gałęzi
 *  w modelu, którego solver nie widzi; rysunek takiego sprzęgła był fabrykacją. */
const GALAZ_SPRZEGLA = 'gpz-test/sprzeglo-galaz';
const SEKCJE: readonly Sekcja[] = [1, 2];
const SZYNA_SEKCJI_2 = 'gpz-test/sekcja-2/bus_sn';
const SEKCJA_2 = 'gpz-test/sekcja-2';
const SZYNA_POZA_SEKCJAMI = 'gpz-test/szyna-poza-sekcjami';

interface Migawka {
  readonly enm: EnergyNetworkModel;
  /** Refy transformatorów GPZ wg sekcji docelowej (1, 2) albo bez sekcji (0). */
  readonly wgSekcji: ReadonlyMap<0 | Sekcja, readonly string[]>;
  readonly sekcjaId: Readonly<Record<Sekcja, string>>;
  readonly zrodloRef: string;
  readonly sprzeglo: boolean;
}

interface Warianty {
  readonly bezSekcji?: number;
  readonly odwroc?: boolean;
  readonly polaSekcji1?: boolean;
  readonly sprzeglo?: boolean;
}

/** Migawka: GPZ z dwiema sekcjami SN; sekcja `badana` dostaje `liczba` transformatorów,
 *  druga — jeden; `bezSekcji` transformatorów ma szynę SN spoza sekcji GPZ. Kolejność
 *  wstawiania do modelu odwrócona względem refów (porządek ma wynikać z refów). */
function migawka(badana: Sekcja, liczba: number, w: Warianty = {}): Migawka {
  const { bezSekcji = 0, odwroc = true, polaSekcji1 = true, sprzeglo = false } = w;
  const { enm } = buildDerSnFixture([]);
  const gpz = enm.substations.find((s) => s.station_type === 'gpz')!;
  const sekcja1 = gpz.gpz_sections![0];
  if (!polaSekcji1) enm.bays = enm.bays.filter((b) => b.gpz_section_id !== sekcja1.section_id);
  const tr1 = enm.transformers.find((t) => t.ref_id === gpz.transformer_refs[0])! as Transformer;
  enm.buses.push(
    { id: SZYNA_SEKCJI_2, ref_id: SZYNA_SEKCJI_2, name: 'Szyna SN sekcji 2', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as Bus,
    { id: SZYNA_POZA_SEKCJAMI, ref_id: SZYNA_POZA_SEKCJAMI, name: 'Szyna SN poza sekcjami', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as Bus,
  );
  gpz.bus_refs.push(SZYNA_SEKCJI_2);
  gpz.gpz_sections!.push({ ...sekcja1, section_id: SEKCJA_2, order: 1, name: 'Sekcja 2', bus_ref: SZYNA_SEKCJI_2, incoming_source_ref: null });
  // Źródło zasilania GPZ: równoważnik sieci po stronie 110 kV na wspólnej szynie WN
  // (górna szyna transformatora fikstury) — jedyny tryb z transformatorami w modelu.
  const zrodlo = enm.sources.find((src) => src.bus_ref === tr1.hv_bus_ref);
  expect(zrodlo, 'równoważnik sieci na szynie WN GPZ fikstury').toBeDefined();
  if (sprzeglo) {
    gpz.gpz_sections![0] = { ...gpz.gpz_sections![0], right_coupler_ref: POLE_SPRZEGLA };
    gpz.gpz_sections![1] = { ...gpz.gpz_sections![1], left_coupler_ref: POLE_SPRZEGLA };
    enm.branches.push({
      id: GALAZ_SPRZEGLA,
      ref_id: GALAZ_SPRZEGLA,
      name: 'Sprzęgło S1-S2',
      type: 'bus_coupler',
      from_bus_ref: sekcja1.bus_ref!,
      to_bus_ref: SZYNA_SEKCJI_2,
      status: 'closed',
      tags: [],
      meta: {},
    } as unknown as EnergyNetworkModel['branches'][number]);
    enm.bays.push(
      pole({
        ref_id: POLE_SPRZEGLA,
        name: 'Sprzęgło S1-S2',
        bay_role: 'COUPLER',
        substation_ref: gpz.ref_id,
        bus_ref: sekcja1.bus_ref!,
        equipment_refs: [GALAZ_SPRZEGLA],
      }),
    );
  }
  const nowe: Transformer[] = [];
  const dodaj = (ref: string, numer: number, szyna: string): void => {
    nowe.push({ ...tr1, id: ref, ref_id: ref, name: `TR${numer} 110/15 kV`, lv_bus_ref: szyna } as Transformer);
  };
  const s1: string[] = [tr1.ref_id];
  const s2: string[] = [];
  const s0: string[] = [];
  let numer = 2;
  const naSekcji1 = badana === 1 ? liczba - 1 : 0;
  const naSekcji2 = badana === 2 ? liczba : 1;
  for (let i = 0; i < naSekcji1; i++) {
    const ref = `gpz-test/tr-s1-${i}`;
    dodaj(ref, numer++, sekcja1.bus_ref!);
    s1.push(ref);
  }
  for (let i = 0; i < naSekcji2; i++) {
    const ref = `gpz-test/tr-s2-${i}`;
    dodaj(ref, numer++, SZYNA_SEKCJI_2);
    s2.push(ref);
  }
  for (let i = 0; i < bezSekcji; i++) {
    const ref = `gpz-test/tr-s0-${i}`;
    dodaj(ref, numer++, SZYNA_POZA_SEKCJAMI);
    s0.push(ref);
  }
  const wstawiane = odwroc ? [...nowe].reverse() : nowe;
  enm.transformers.push(...wstawiane);
  gpz.transformer_refs.push(...wstawiane.map((t) => t.ref_id));
  const porzadek = (lista: string[]): string[] => [...lista].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    enm,
    wgSekcji: new Map<0 | Sekcja, readonly string[]>([
      [1, porzadek(s1)],
      [2, porzadek(s2)],
      [0, porzadek(s0)],
    ]),
    sekcjaId: { 1: sekcja1.section_id, 2: SEKCJA_2 },
    zrodloRef: zrodlo!.ref_id,
    sprzeglo,
  };
}

const PREFIKSY_WIEZY = ['gpz-canonical-hv-tr-bay-', 'gpz-canonical-transformer-', 'gpz-canonical-tr-field-'];

function nalezyDoWiezy(testId: string | undefined, trRef: string): boolean {
  if (!testId) return false;
  return PREFIKSY_WIEZY.some((p) => testId === `${p}${trRef}` || testId.startsWith(`${p}${trRef}-`));
}

interface Prostokat {
  readonly opis: string;
  readonly rect: V3Rect;
  readonly wieza: string | null;
}

/** Elementy sprawdzane na kolizje: wieże transformatorów, blok źródła (symbol + tabliczka)
 *  i wyłącznik sprzęgła z oznacznikiem — każdy jako osobna grupa „właściciela". */
function prostokatySceny(scena: SceneV3, refyWiez: readonly string[], zrodloRef: string): Prostokat[] {
  const wiezaSymbolu = (testId: string | undefined): string | null => {
    if (testId === `gpz-canonical-source-${zrodloRef}`) return `źródło ${zrodloRef}`;
    if (testId === `gpz-canonical-coupler-${GALAZ_SPRZEGLA}`) return 'sprzęgło';
    return refyWiez.find((ref) => nalezyDoWiezy(testId, ref)) ?? null;
  };
  const wiezaEtykiety = (ownerRef: string): string | null => {
    if (ownerRef.startsWith(`${zrodloRef}#`)) return `źródło ${zrodloRef}`;
    if (ownerRef.startsWith(`${GALAZ_SPRZEGLA}#`) || ownerRef.startsWith(`${POLE_SPRZEGLA}#`)) return 'sprzęgło';
    return refyWiez.find((ref) => ownerRef.startsWith(`${ref}#`)) ?? null;
  };
  return [
    ...scena.symbols.map((s) => ({
      opis: `symbol ${s.symbolId} ${s.meta?.testId ?? s.meta?.ownerRef ?? ''}`,
      rect: { x: s.x, y: s.y, width: SYMBOL_DEFS[s.symbolId].width, height: SYMBOL_DEFS[s.symbolId].height },
      wieza: wiezaSymbolu(s.meta?.testId),
    })),
    ...scena.labels.map((l) => ({ opis: `etykieta „${l.text}" ${l.ownerRef}`, rect: l.rect, wieza: wiezaEtykiety(l.ownerRef) })),
  ];
}

/** Pary (element wieży, element spoza tej wieży) o przecinających się prostokątach. */
function kolizjeWiez(scena: SceneV3, refyWiez: readonly string[], zrodloRef: string): string[] {
  const prostokaty = prostokatySceny(scena, refyWiez, zrodloRef);
  const kolizje: string[] = [];
  prostokaty.forEach((a, i) => {
    if (a.wieza === null) return;
    prostokaty.forEach((b, j) => {
      if (i === j || b.wieza === a.wieza) return;
      if (b.wieza !== null && j < i) return;
      if (rectsOverlap(a.rect, b.rect)) kolizje.push(`${a.opis} × ${b.opis}`);
    });
  });
  return kolizje;
}

function odcinek(scena: SceneV3, ownerRef: string) {
  return scena.segments.find((g) => g.meta?.ownerRef === ownerRef);
}

function szynaSekcji(scena: SceneV3, sekcjaId: string) {
  const szyna = scena.segments.find((g) => g.meta?.testId === `gpz-canonical-section-${sekcjaId}-bus`);
  expect(szyna, `szyna SN sekcji ${sekcjaId}`).toBeDefined();
  const xs = szyna!.points.map((p) => p.x);
  return { y: szyna!.points[0].y, lewo: Math.min(...xs), prawo: Math.max(...xs) };
}

function osWiezy(scena: SceneV3, trRef: string): number {
  const tr = scena.symbols.filter((s) => s.symbolId === 'transformer2W' && s.meta?.testId === `gpz-canonical-transformer-${trRef}`);
  expect(tr, `jeden symbol TR2W transformatora ${trRef}`).toHaveLength(1);
  return tr[0].x + SYMBOL_DEFS.transformer2W.width / 2;
}

function sprawdzWieze(m: Migawka, scena: SceneV3): void {
  const hv = scena.segments.find((g) => g.meta?.testId === 'gpz-canonical-hv-bus')!;
  const hvXs = hv.points.map((p) => p.x);
  const wszystkie = [...m.wgSekcji.values()].flat();
  for (const sekcja of SEKCJE) {
    const refy = m.wgSekcji.get(sekcja)!;
    const szyna = szynaSekcji(scena, m.sekcjaId[sekcja]);
    const osie = refy.map((ref) => osWiezy(scena, ref));
    // Porządek po refach: osie ściśle rosnące (dawniej wszystkie równe).
    osie.forEach((os, i) => {
      if (i > 0) expect(os, `oś wieży ${refy[i]} na prawo od ${refy[i - 1]}`).toBeGreaterThan(osie[i - 1]);
    });
    refy.forEach((ref, i) => {
      const zejscie = odcinek(scena, `${ref}#tr-field-to-bus`);
      expect(zejscie, `zejście ${ref} do szyny SN`).toBeDefined();
      const koniec = zejscie!.points[zejscie!.points.length - 1];
      expect(koniec.y).toBe(szyna.y);
      expect(koniec.x).toBe(osie[i]);
      expect(koniec.x, `zejście ${ref} w obrębie szyny sekcji ${sekcja}`).toBeGreaterThan(szyna.lewo);
      expect(koniec.x).toBeLessThan(szyna.prawo);
    });
  }
  for (const ref of wszystkie) {
    const zaczep = odcinek(scena, `${ref}#hv-connector`)!;
    expect(zaczep.points[0].y).toBe(hv.points[0].y);
    expect(zaczep.points[0].x).toBeGreaterThan(Math.min(...hvXs));
    expect(zaczep.points[0].x).toBeLessThan(Math.max(...hvXs));
  }
  expect(kolizjeWiez(scena, wszystkie, m.zrodloRef)).toEqual([]);
  // Źródło nad prawym końcem szyny WN: przedłużenie szyny WN zaczyna się na jej końcu,
  // zejście źródła na wysokości szyny WN; żadne przedłużenie szyny SN (źródło nie stoi
  // na szynach SN).
  const prawoWN = Math.max(...hvXs);
  const zejscieZrodla = odcinek(scena, `${m.zrodloRef}#grid-source-drop`);
  expect(zejscieZrodla, 'zejście źródła').toBeDefined();
  const dolZrodla = zejscieZrodla!.points[zejscieZrodla!.points.length - 1];
  expect(dolZrodla.y).toBe(hv.points[0].y);
  expect(dolZrodla.x).toBeGreaterThan(prawoWN);
  const przedluzenie = scena.segments.find(
    (g) => g.meta?.ownerRef?.endsWith('#hv-bus-source-extension') && g.points[0].x === prawoWN,
  );
  expect(przedluzenie, 'przedłużenie szyny WN do zaczepu źródła').toBeDefined();
  expect(scena.segments.filter((g) => g.meta?.ownerRef?.endsWith('#source-bus-extension'))).toEqual([]);
  expect(scena.meta.missingData).not.toContain('gpz.source.unattached');
  expect(scena.labels.some((l) => l.ownerRef.startsWith(`${m.zrodloRef}#system-source-label`))).toBe(true);
  // Wyłącznik sprzęgła między końcem szyny sekcji 1 a początkiem szyny sekcji 2.
  const wylacznikSprzegla = scena.symbols.filter((s) => s.meta?.testId === `gpz-canonical-coupler-${GALAZ_SPRZEGLA}`);
  expect(wylacznikSprzegla).toHaveLength(m.sprzeglo ? 1 : 0);
  if (m.sprzeglo) {
    const os = wylacznikSprzegla[0].x + SYMBOL_DEFS[wylacznikSprzegla[0].symbolId].width / 2;
    expect(os).toBeGreaterThan(szynaSekcji(scena, m.sekcjaId[1]).prawo);
    expect(os).toBeLessThan(szynaSekcji(scena, m.sekcjaId[2]).lewo);
  }
  // Silnik etykiet usuwa przegraną etykietę zamiast rysować ją na kolizji — kolizja
  // wieży z etykietą znikłaby wtedy z testu prostokątów. Żadna etykieta GPZ (wieże,
  // źródło, pola, sekcje) nie może zostać odrzucona.
  const odrzuconeGpz = scena.meta.stopNotes
    .filter((n) => n.startsWith('label.declutter:'))
    .flatMap((n) => n.match(/[a-z-]+:gpz[^,( ]*/g) ?? []);
  expect(odrzuconeGpz).toEqual([]);
  for (const ref of wszystkie) {
    expect(
      scena.labels.some((l) => l.ownerRef.startsWith(`${ref}#label`)),
      `tabliczka transformatora ${ref} narysowana`,
    ).toBe(true);
  }
}

describe('GPZ: wieże transformatorów tej samej sekcji rozłożone bez kolizji — liczba × sekcja × LOD', () => {
  for (const liczba of LICZBY) {
    for (const sekcja of SEKCJE) {
      for (const pola of POLA_SEKCJI_1) {
        for (const sprzeglo of SPRZEGLO) {
          for (const lod of [1, 2] as const) {
            const nazwa =
              `${liczba} TR na sekcji ${sekcja} × sekcja 1 ${pola ? 'z polami' : 'bez pól'} × ` +
              `źródło na szynie WN × ${sprzeglo ? 'ze sprzęgłem' : 'bez sprzęgła'} × L${lod}`;
            it(nazwa, () => {
              const m = migawka(sekcja, liczba, { polaSekcji1: pola, sprzeglo });
              const scena = buildSceneV3(m.enm, lod);
              sprawdzWieze(m, scena);
              expect(scena.meta.missingData.filter((k) => k.startsWith('gpz.transformer.section.missing:'))).toEqual([]);
            });
          }
        }
      }
    }
  }

  for (const bezSekcji of [1, 2] as const) {
    for (const lod of [1, 2] as const) {
      it(`${bezSekcji} TR z szyną SN spoza sekcji (obok 2 TR na sekcji 1, sekcja 2 wąska) × L${lod}: wieża na prawo od sekcji, bez zejścia, wpis braku`, () => {
        const m = migawka(1, 2, { bezSekcji, sprzeglo: true });
        const scena = buildSceneV3(m.enm, lod);
        sprawdzWieze(m, scena);
        const refy = m.wgSekcji.get(0)!;
        const prawaSekcji = Math.max(szynaSekcji(scena, m.sekcjaId[1]).prawo, szynaSekcji(scena, m.sekcjaId[2]).prawo);
        const osie = refy.map((ref) => osWiezy(scena, ref));
        osie.forEach((os, i) => {
          expect(os, `wieża ${refy[i]} na prawo od szyn sekcji`).toBeGreaterThan(prawaSekcji);
          if (i > 0) expect(os).toBeGreaterThan(osie[i - 1]);
          expect(odcinek(scena, `${refy[i]}#tr-field-to-bus`), `brak zejścia ${refy[i]}`).toBeUndefined();
        });
        expect(scena.meta.missingData.filter((k) => k.startsWith('gpz.transformer.section.missing:')).sort()).toEqual(
          refy.map((ref) => `gpz.transformer.section.missing:${ref}`),
        );
      });
    }
  }

  it('kompozycja: kolejność transformatorów na wejściu kompozycji nie zmienia rozkładu wież (porządek po refach)', () => {
    // Adapter sortuje transformatory, więc scena tego nie rozróżnia — kompozycja nie może
    // jednak polegać na kolejności wejścia (kontrakt `grupaWiez`).
    const m = migawka(1, 3, { bezSekcji: 2, sprzeglo: true });
    const gpz = m.enm.substations.find((st) => st.station_type === 'gpz')!;
    const props = buildCanonicalGpzProps(m.enm, gpz.ref_id);
    const zrodla = m.enm.sources.map((src) => ({ id: src.ref_id, connectionRef: src.bus_ref }));
    const wprost = composeGpz(props, { x: 0, y: 0 }, zrodla);
    const odwrotnie = composeGpz({ ...props, transformers: [...props.transformers].reverse() }, { x: 0, y: 0 }, zrodla);
    const osie = (c: typeof wprost): string[] =>
      c.symbols
        .filter((s) => s.symbolId === 'transformer2W')
        .map((s) => `${s.meta.transformerRef}@${s.x}`)
        .sort();
    expect(osie(odwrotnie)).toEqual(osie(wprost));
  });

  it('determinizm: kolejność transformatorów w modelu nie zmienia sceny', () => {
    for (const lod of [1, 2] as const) {
      const a = buildSceneV3(migawka(1, 3, { bezSekcji: 1, odwroc: true, sprzeglo: true }).enm, lod);
      const b = buildSceneV3(migawka(1, 3, { bezSekcji: 1, odwroc: false, sprzeglo: true }).enm, lod);
      const c = buildSceneV3(migawka(1, 3, { bezSekcji: 1, odwroc: true, sprzeglo: true }).enm, lod);
      expect(JSON.stringify(b.symbols)).toBe(JSON.stringify(a.symbols));
      expect(JSON.stringify(b.labels)).toBe(JSON.stringify(a.labels));
      expect(JSON.stringify(c.segments)).toBe(JSON.stringify(a.segments));
    }
  });
});

/** Migawka GPZ z równoważnikiem sieci na szynach SN, wytworzona przez backend (eksport
 *  harnessu `punkt_startu_gpz_z_zaciskami_wolne_kilka`: dwie sekcje, sprzęgło, pola
 *  liniowe, równoważnik na szynie sekcji 1, brak transformatorów 110/SN). */
function migawkaTrybuSn(stanSprzegla: 'closed' | 'open'): EnergyNetworkModel {
  const sciezka = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../harness-fixtures/generated/punkt_startu_gpz_z_zaciskami_wolne_kilka.json',
  );
  const enm = (JSON.parse(readFileSync(sciezka, 'utf8')) as { snapshot: EnergyNetworkModel }).snapshot;
  for (const galaz of enm.branches) {
    if (galaz.type === 'bus_coupler') galaz.status = stanSprzegla;
  }
  return enm;
}

describe('GPZ z równoważnikiem sieci na szynach SN (karta GPZ-MODEL): blok źródła przy szynie sekcji 1, bez kolumny WN', () => {
  for (const stan of ['closed', 'open'] as const) {
    for (const lod of [1, 2] as const) {
      it(`dwie sekcje × sprzęgło ${stan === 'closed' ? 'zamknięte' : 'otwarte'} × L${lod}`, () => {
        const enm = migawkaTrybuSn(stan);
        const gpz = enm.substations.find((st) => st.station_type === 'gpz')!;
        const [sekcja1, sekcja2] = gpz.gpz_sections!;
        expect(enm.transformers.filter((t) => gpz.transformer_refs.includes(t.ref_id))).toEqual([]);
        const zrodlo = enm.sources.find((src) => src.bus_ref === sekcja1.bus_ref);
        expect(zrodlo, 'równoważnik na szynie sekcji 1').toBeDefined();
        const scena = buildSceneV3(enm, lod);
        // Bez transformatorów i bez szyny WN — rysunek nie sugeruje zasilania, którego
        // model obliczeniowy nie ma.
        expect(scena.symbols.filter((sym) => sym.symbolId === 'transformer2W' && sym.meta?.testId?.startsWith('gpz-'))).toEqual([]);
        expect(scena.segments.filter((g) => g.meta?.testId === 'gpz-canonical-hv-bus')).toEqual([]);
        expect(scena.labels.filter((l) => /^Szyna WN/.test(l.text))).toEqual([]);
        // Blok źródła przy prawym końcu szyny sekcji 1, przedłużenie szyny do zaczepu.
        const szyna1 = szynaSekcji(scena, sekcja1.section_id);
        szynaSekcji(scena, sekcja2.section_id);
        const zejscie = odcinek(scena, `${zrodlo!.ref_id}#grid-source-drop`);
        expect(zejscie, 'zejście źródła').toBeDefined();
        const dol = zejscie!.points[zejscie!.points.length - 1];
        expect(dol.y).toBe(szyna1.y);
        expect(dol.x).toBeGreaterThan(szyna1.prawo);
        expect(
          scena.segments.find((g) => g.meta?.ownerRef?.endsWith('#source-bus-extension') && g.points[0].x === szyna1.prawo),
          'przedłużenie szyny sekcji 1 do zaczepu źródła',
        ).toBeDefined();
        expect(scena.meta.missingData).not.toContain('gpz.source.unattached');
        expect(scena.labels.some((l) => l.ownerRef.startsWith(`${zrodlo!.ref_id}#system-source-label`))).toBe(true);
        // Blok źródła nie koliduje z niczym spoza siebie.
        expect(kolizjeWiez(scena, [], zrodlo!.ref_id)).toEqual([]);
        const odrzuconeGpz = scena.meta.stopNotes
          .filter((n) => n.startsWith('label.declutter:'))
          .flatMap((n) => n.match(/[a-z-]+:gpz[^,( ]*/g) ?? []);
        expect(odrzuconeGpz).toEqual([]);
      });
    }
  }
});
