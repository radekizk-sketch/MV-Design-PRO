/**
 * W2c — TOR DER PRZYŁĄCZONEGO PO STRONIE SN na scenie (POLECENIE_DER_SN_TOPOLOGIA_
 * 2026-07, reguły 1–7). Testy end-to-end: fixtura ENM (adapter v2 → scena v3),
 * NIE wołanie backendu. Fixtury wg DOKŁADNYCH kształtów snapshotu z
 * `backend/tests/enm/test_der_sn_topology_domain_ops.py` (patrz
 * `fixtures/w2cDerSnFixtures.ts`). 8 przypadków kanonu; per przypadek wyrocznie:
 * ciągłość toru, TR blokowy ownerRef ≠ TR stacji, obecność pola źródłowego SN
 * (stos z danych), głowica na styku kabla, ZAKAZ bezpośredniego połączenia
 * symbolu źródła z szyną SN (asercja negatywna), kotwica L0/L1/L2, determinizm 2×.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  allSourcesConnected,
  allSourcesVisible,
  allSceneSegmentEndpointsAnchored,
  busbarLabelGaps,
  noSceneSymbolOverlaps,
  noSymbolWireCollisions,
  noLabelCollisions,
  type SceneLod,
  type SceneV3,
} from '../buildScene';
import {
  buildDerSnFixture,
  stationTransformerRef,
  type InjectedDer,
} from './fixtures/w2cDerSnFixtures';

const LODS: readonly SceneLod[] = [0, 1, 2] as const;

// ---------------------------------------------------------------------------
// Pomocnicze wyrocznie sceny dla toru DER-SN.
// ---------------------------------------------------------------------------

function symbolByOwner(scene: SceneV3, ownerRef: string) {
  return scene.symbols.find((s) => s.meta?.ownerRef === ownerRef);
}
function segmentByOwner(scene: SceneV3, ownerRef: string) {
  return scene.segments.find((s) => s.meta?.ownerRef === ownerRef);
}

/** Reguła 1/6: pole źródłowe SN obecne (stos aparatów z danych — głowica
 *  kablowa cableHead z `primary_devices`), zakotwiczone do szyny SN stacji. */
function hasSourceFieldStack(scene: SceneV3, inj: InjectedDer): boolean {
  const cableHeadFromField = scene.symbols.some(
    (s) => s.symbolId === 'cableHead' && (s.meta?.ownerRef ?? '') === inj.ozeFieldRef,
  );
  return cableHeadFromField;
}

/** Reguła 5: TR blokowy = `transformer2W` z ownerRef = REALNY ref TR blokowego,
 *  elementKind 'transformer'. */
function blockTransformerSymbol(scene: SceneV3, inj: InjectedDer) {
  const sym = symbolByOwner(scene, inj.blockTransformerRef!);
  return sym && sym.symbolId === 'transformer2W' && sym.meta?.elementKind === 'transformer' ? sym : undefined;
}

/** ASERCJA NEGATYWNA (reguła 7): symbol źródła NIE wisi bezpośrednio na szynie
 *  SN — brak segmentu `#sn-source-descent` dla tego źródła, a port AC symbolu
 *  źródła NIE leży na żadnej szynie SN sceny (`kind==='bus'`). */
function sourceHangsOnSnBus(scene: SceneV3, inj: InjectedDer): boolean {
  if (scene.segments.some((s) => (s.meta?.ownerRef ?? '') === `${inj.sourceId}#sn-source-descent`)) {
    return true;
  }
  const src = symbolByOwner(scene, inj.sourceId);
  if (!src) return false;
  const ac = { x: src.x + 16, y: src.y }; // derPv/derBess ac port (16,0)
  return scene.segments.some((seg) => {
    if (seg.meta?.kind !== 'bus') return false;
    const [a, b] = seg.points;
    if (!a || !b || a.y !== b.y || a.y !== ac.y) return false;
    return ac.x >= Math.min(a.x, b.x) && ac.x <= Math.max(a.x, b.x);
  });
}

/** Kotwice nazw stacji per LOD (środek pasma nazw) — dowód „JEDNA KOTWICA
 *  L0/L1/L2" (zmiana W2c nie może przesuwać kotwic). */
function nameAnchors(enm: EnergyNetworkModel, lod: SceneLod): Map<string, string> {
  const scene = buildSceneV3(enm, lod);
  const m = new Map<string, string>();
  for (const label of scene.labels) {
    if (label.ownerKind === 'station-name' && label.ownerRef.endsWith('#name-row-0')) {
      const ref = label.ownerRef.slice(0, -'#name-row-0'.length);
      // BLOK-PUSTY (jak w `buildScene.test.ts`): kotwica to punkt zaczepu +
      // rezerwacja kolumny — wielkości niezależne od TREŚCI poziomu; prostokąt
      // wiersza niesie od tej karty sam tusz napisu.
      const srodek = label.rect.x + label.rect.width / 2;
      m.set(ref, `${srodek},${label.rect.y},${label.rezerwacjaSzerokosci}`);
    }
  }
  return m;
}

function expectCleanScene(scene: SceneV3): void {
  expect(allSourcesVisible(scene)).toBe(true);
  expect(allSourcesConnected(scene)).toBe(true);
  expect(allSceneSegmentEndpointsAnchored(scene)).toBe(true);
  expect(noSceneSymbolOverlaps(scene)).toBe(true);
  expect(noSymbolWireCollisions(scene)).toBe(true);
  expect(noLabelCollisions(scene)).toBe(true);
}

/** Wspólne asercje toru KOMPLETNEGO (reguły 1–7) na L2. */
function expectFullChain(scene: SceneV3, inj: InjectedDer, stationTrRef: string | null): void {
  // Reguła 1/6: pole źródłowe SN (stos z danych, głowica kablowa).
  expect(hasSourceFieldStack(scene, inj), 'pole źródłowe SN z głowicą').toBe(true);
  // Reguła 5: TR blokowy jako OSOBNY transformer2W z REALNYM ref.
  const blockTr = blockTransformerSymbol(scene, inj);
  expect(blockTr, 'TR blokowy (transformer2W) obecny').toBeDefined();
  // Reguła 5: TR blokowy ownerRef ≠ TR stacji.
  expect(inj.blockTransformerRef).not.toBe(stationTrRef);
  // Kabel SN toru obecny.
  expect(segmentByOwner(scene, inj.cableRef), 'kabel SN toru').toBeDefined();
  // Symbol źródła obecny (DER), z realnym ref.
  const src = symbolByOwner(scene, inj.sourceId);
  expect(src, 'symbol źródła DER').toBeDefined();
  expect(src!.meta?.elementKind).toBe('der');
  // Reguła 7 (asercja NEGATYWNA): źródło NIE na szynie SN.
  expect(sourceHangsOnSnBus(scene, inj), 'źródło NIE wisi na szynie SN').toBe(false);
  // Ciągłość + brak kolizji.
  expectCleanScene(scene);
}

// ---------------------------------------------------------------------------
// Przypadek 1: wariant nN — DER za TR stacji (bez toru SN, bez pola źródłowego SN).
// ---------------------------------------------------------------------------

describe('W2c — przypadek 1 (nn): DER za TR stacji, bez toru SN', () => {
  it('sieć bazowa BEZ wstrzykniętego toru ⇒ ZERO toru DER-SN, ZERO pola źródłowego SN', () => {
    // Baza (gpzFeeder): GPZ + stacje inline z TR odbiorczym, zero DER —
    // zmiana W2c jest NO-OP na sieci bez źródeł SN z torem (regresja).
    const { enm } = buildDerSnFixture([]);
    const scene = buildSceneV3(enm, 2);
    // Brak transformerów blokowych DER na scenie (rola TR blokowego nie występuje).
    const blockTrs = scene.symbols.filter(
      (s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').includes('/der'),
    );
    expect(blockTrs).toHaveLength(0);
    // Brak segmentów kabla toru DER-SN.
    expect(scene.segments.some((s) => (s.meta?.ownerRef ?? '').includes('/der') && (s.meta?.ownerRef ?? '').includes('mv_cable'))).toBe(false);
    expectCleanScene(scene);
  });
});

// ---------------------------------------------------------------------------
// Przypadek 2: PV z TR blokowym i polem SN — pełny tor.
// ---------------------------------------------------------------------------

describe('W2c — przypadek 2 (PV + TR blokowy + pole SN): pełny tor', () => {
  const { enm, stationRef, injected } = buildDerSnFixture([{ technology: 'PV' }]);
  const stationTr = stationTransformerRef(enm, stationRef);

  it('L2: pełny tor (kabel→TR blokowy→szyna nN producenta→PV), TR blokowy ≠ TR stacji, źródło NIE na szynie SN', () => {
    const scene = buildSceneV3(enm, 2);
    expectFullChain(scene, injected[0], stationTr);
    // Reguła 2/3: szyna nN producenta obecna (segment #lv-bus toru).
    expect(segmentByOwner(scene, `${injected[0].producerLvBusRef}#lv-bus`), 'szyna nN producenta').toBeDefined();
    // Symbol źródła to PV.
    expect(symbolByOwner(scene, injected[0].sourceId)!.symbolId).toBe('derPv');
    // Reguła 4: brak wpięcia źródła przez TR stacji — brak rzędu nN dla tego źródła.
    expect(scene.segments.some((s) => (s.meta?.ownerRef ?? '') === `${injected[0].sourceId}#der-source-descent`)).toBe(true);
  });

  it('kotwica stacji IDENTYCZNA L0/L1/L2 (tor DER-SN nie przesuwa kotwic)', () => {
    const a0 = nameAnchors(enm, 0);
    const a1 = nameAnchors(enm, 1);
    const a2 = nameAnchors(enm, 2);
    // KD-5: pasma nazw elementów WEWNĘTRZNYCH bloku GPZ (tabliczka TR/źródła)
    // znikają na L0 wraz ze zwinięciem bloku — liczność porównujemy na
    // STACJACH (intencja: tor DER-SN nie przesuwa kotwic STACJI), zbiór L0
    // pozostaje podzbiorem L1/L2.
    const stationsOnly = (m: Map<string, string>): Map<string, string> =>
      new Map([...m].filter(([ref]) => ref.startsWith('stn/')));
    expect(a0.size).toBeGreaterThan(0);
    expect(stationsOnly(a1).size).toBe(stationsOnly(a0).size);
    expect(stationsOnly(a2).size).toBe(stationsOnly(a0).size);
    for (const ref of a0.keys()) {
      expect(a1.has(ref) && a2.has(ref), `kotwica ${ref} obecna na L0, brak na L1/L2`).toBe(true);
    }
    const drift: string[] = [];
    for (const [ref, p0] of a0) {
      if (a1.get(ref) !== p0 || a2.get(ref) !== p0) drift.push(`${ref}: L0=${p0} L1=${a1.get(ref)} L2=${a2.get(ref)}`);
    }
    expect(drift, `kotwice dryfują:\n${drift.slice(0, 8).join('\n')}`).toEqual([]);
  });

  it('determinizm 2× (identyczny wynik sceny)', () => {
    const s1 = JSON.stringify(buildSceneV3(enm, 2));
    const s2 = JSON.stringify(buildSceneV3(enm, 2));
    expect(s1).toBe(s2);
  });
});

// ---------------------------------------------------------------------------
// Przypadek 3: BESS z rozdzielnicą nN producenta i TR blokowym.
// ---------------------------------------------------------------------------

describe('W2c — przypadek 3 (BESS + rozdzielnica nN + TR blokowy)', () => {
  const { enm, stationRef, injected } = buildDerSnFixture([
    { technology: 'BESS', lvSwitchgearVariant: 'single-bus' },
  ]);
  const stationTr = stationTransformerRef(enm, stationRef);

  it('L2: pełny tor z symbolem BESS + TR blokowy ≠ TR stacji', () => {
    const scene = buildSceneV3(enm, 2);
    expectFullChain(scene, injected[0], stationTr);
    expect(symbolByOwner(scene, injected[0].sourceId)!.symbolId).toBe('derBess');
  });
});

// ---------------------------------------------------------------------------
// Przypadek 4: DER na SN BEZ TR blokowego (generator synchroniczny / stare dane)
// ⇒ uczciwa degradacja + stopNote der.sn.torNiepelny.
// ---------------------------------------------------------------------------

describe('W2c — przypadek 4 (DER na SN bez TR blokowego): tor niepełny', () => {
  const { enm, injected } = buildDerSnFixture([{ technology: 'PV', withoutBlockTransformer: true }]);

  it('L2: brak toru (adapter nie zbuduje chain) ⇒ placeholder + stopNote der.sn.torNiepelny', () => {
    const scene = buildSceneV3(enm, 2);
    // Brak TR blokowego (nie zmaterializowany).
    expect(injected[0].blockTransformerRef).toBeNull();
    expect(scene.symbols.some((s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').includes('/der'))).toBe(false);
    // Placeholder W2: odczep pola źródłowego SN dla tego źródła.
    expect(scene.segments.some((s) => (s.meta?.ownerRef ?? '') === `${injected[0].sourceId}#sn-source-descent`)).toBe(true);
    // JAWNY stopNote toru niepełnego (koniec cichego uproszczenia, reguła 7).
    expect(scene.meta.stopNotes.some((n) => n.includes(injected[0].sourceId) && n.includes('tor niepełny'))).toBe(true);
    expectCleanScene(scene);
  });
});

// ---------------------------------------------------------------------------
// Przypadek 5: PV z kilkoma falownikami i wspólną rozdzielnią nN (quantity>1).
// ---------------------------------------------------------------------------

describe('W2c — przypadek 5 (PV × N, wspólna rozdzielnia nN)', () => {
  const { enm, stationRef, injected } = buildDerSnFixture([
    { technology: 'PV', quantity: 3, lvSwitchgearVariant: 'multi-feeder' },
  ]);
  const stationTr = stationTransformerRef(enm, stationRef);

  it('L2: JEDEN symbol źródła + krotność ×3 w etykiecie (decyzja W2c), pełny tor', () => {
    const scene = buildSceneV3(enm, 2);
    expectFullChain(scene, injected[0], stationTr);
    // Decyzja W2c: JEDEN symbol PV (nie 3 symbole), krotność w etykiecie.
    const pvSymbols = scene.symbols.filter((s) => s.meta?.ownerRef === injected[0].sourceId);
    expect(pvSymbols).toHaveLength(1);
    const derLabel = scene.labels.find((l) => l.ownerRef === `${injected[0].sourceId}#der-label`);
    expect(derLabel?.text).toContain('×3');
  });
});

// ---------------------------------------------------------------------------
// Przypadek 6: PV ze stacją kompaktową producenta (integrated-skid).
// ---------------------------------------------------------------------------

describe('W2c — przypadek 6 (integrated-skid): uproszczenie wizualne, TR OBECNY', () => {
  const { enm, stationRef, injected } = buildDerSnFixture([
    { technology: 'PV', lvSwitchgearVariant: 'integrated-skid' },
  ]);
  const stationTr = stationTransformerRef(enm, stationRef);

  it('L2: brak osobnej kreski szyny nN producenta, ale TR blokowy OBECNY i ciągłość zachowana', () => {
    const scene = buildSceneV3(enm, 2);
    // TR blokowy OBECNY mimo uproszczenia (reguła 2).
    expect(blockTransformerSymbol(scene, injected[0]), 'TR blokowy obecny (integrated-skid)').toBeDefined();
    // Brak osobnej kreski szyny nN producenta (uproszczenie wizualne).
    expect(segmentByOwner(scene, `${injected[0].producerLvBusRef}#lv-bus`)).toBeUndefined();
    // Ciągłość zachowana (TR lv → źródło bezpośrednio), źródło NIE na szynie SN.
    expect(sourceHangsOnSnBus(scene, injected[0])).toBe(false);
    expect(inj0TrEqStation(injected[0], stationTr)).toBe(false);
    expectCleanScene(scene);
  });
});

function inj0TrEqStation(inj: InjectedDer, stationTr: string | null): boolean {
  return inj.blockTransformerRef === stationTr;
}

// ---------------------------------------------------------------------------
// Przypadek 7: dwa DER o różnych topologiach na tej samej szynie SN.
// ---------------------------------------------------------------------------

describe('W2c — przypadek 7 (dwa DER różnych topologii, wspólna szyna SN)', () => {
  const { enm, stationRef, injected } = buildDerSnFixture([
    { technology: 'PV', suffix: '-a', lvSwitchgearVariant: 'multi-feeder' },
    { technology: 'BESS', suffix: '-b', lvSwitchgearVariant: 'single-bus' },
  ]);
  const stationTr = stationTransformerRef(enm, stationRef);

  it('L2: dwa pełne tory, dwa RÓŻNE TR blokowe (≠ siebie, ≠ TR stacji), wspólna stacja', () => {
    const scene = buildSceneV3(enm, 2);
    expect(injected).toHaveLength(2);
    for (const inj of injected) expectFullChain(scene, inj, stationTr);
    // Dwa RÓŻNE TR blokowe.
    expect(injected[0].blockTransformerRef).not.toBe(injected[1].blockTransformerRef);
    // Symbole: PV i BESS.
    expect(symbolByOwner(scene, injected[0].sourceId)!.symbolId).toBe('derPv');
    expect(symbolByOwner(scene, injected[1].sourceId)!.symbolId).toBe('derBess');
  });
});

// ---------------------------------------------------------------------------
// Przypadek 8: DER na SN obok niezależnego pola TR odbiorczego stacji.
// ---------------------------------------------------------------------------

describe('W2c — przypadek 8 (DER-SN obok TR odbiorczego stacji)', () => {
  const { enm, stationRef, injected } = buildDerSnFixture([{ technology: 'PV' }]);
  const stationTr = stationTransformerRef(enm, stationRef);

  it('L2: tor DER-SN współistnieje z TR stacji; TR blokowy ownerRef ≠ TR stacji', () => {
    // Stacja referencyjna MA TR odbiorczy (sn_bus→nn_bus) — przypadek 8 z definicji.
    expect(stationTr).not.toBeNull();
    const scene = buildSceneV3(enm, 2);
    expectFullChain(scene, injected[0], stationTr);
    // TR stacji nadal obecny w danych (osobny element).
    expect(stationTr).toContain('/transformer');
    expect(injected[0].blockTransformerRef).not.toBe(stationTr);
  });
});

// ---------------------------------------------------------------------------
// Determinizm materializacji toru na WSZYSTKICH LOD.
// ---------------------------------------------------------------------------

describe('W2c — determinizm toru DER-SN na wszystkich LOD', () => {
  const { enm } = buildDerSnFixture([{ technology: 'PV' }]);
  for (const lod of LODS) {
    it(`L${lod}: scena 2× identyczna`, () => {
      expect(JSON.stringify(buildSceneV3(enm, lod))).toBe(JSON.stringify(buildSceneV3(enm, lod)));
    });
  }
});

// ---------------------------------------------------------------------------
// S9-12 (klasa C-8 audytu 2026-08) — etykieta szyny nN PRODUCENTA: gramatyka
// nN zamiast pożyczonej gramatyki SEKCJI stacji + parowanie w wyroczni.
// ---------------------------------------------------------------------------

describe('S9-12 — etykieta szyny nN producenta DER (klasa C-8: opis nie udaje sekcji stacji)', () => {
  // Iloczyn cech: {DWA tory DER w jednym kadrze} × {gramatyka nN} ×
  // {wyrocznia busbar: parowanie + tekst}. Przed kartą oba tory nosiły
  // IDENTYCZNY, semantycznie fałszywy opis „Sekcja 1 · 0,4 kV" (szyna
  // producenta nie jest sekcją niczego w modelu), a wyrocznia
  // `busbarLabelGaps` fałszywie flagowała każdą taką etykietę jako
  // `label-without-bus` (etykieta spoza słownika parowania).
  const { enm } = buildDerSnFixture([
    { technology: 'PV', suffix: 'a' },
    { technology: 'BESS', suffix: 'b' },
  ]);

  it('L2: obie szyny producentów opisane zamkniętą gramatyką nN („Szyna nN · V kV"), zero „Sekcja” poza stacjami', () => {
    const scene = buildSceneV3(enm, 2);
    const producerLabels = scene.labels.filter((l) => l.ownerRef.endsWith('#producer-bus-voltage'));
    expect(producerLabels).toHaveLength(2);
    expect(producerLabels.every((l) => /^Szyna nN(?: · \d+(?:,\d+)? kV)?$/.test(l.text))).toBe(true);
    expect(producerLabels.every((l) => !l.text.includes('Sekcja'))).toBe(true);
  });

  it('L2: wyrocznia busbarLabelGaps bez luk — etykieta producenta sparowana ze SWOIM odcinkiem #lv-bus', () => {
    const scene = buildSceneV3(enm, 2);
    expect(busbarLabelGaps(scene)).toEqual([]);
  });

  it('(test negatywny a): etykieta producenta bez odcinka szyny ⇒ label-without-bus zgłoszony', () => {
    const scene = buildSceneV3(enm, 2);
    const producerLabel = scene.labels.find((l) => l.ownerRef.endsWith('#producer-bus-voltage'))!;
    const busRef = producerLabel.ownerRef.replace(/#producer-bus-voltage$/, '#lv-bus');
    const sabotaged = {
      ...scene,
      segments: scene.segments.filter((s) => s.meta?.ownerRef !== busRef),
    };
    expect(busbarLabelGaps(sabotaged).some((g) => g.reason === 'label-without-bus')).toBe(true);
  });

  it('(test negatywny b): powrót tekstu „Sekcja 1 · 0,4 kV" na szynie producenta ⇒ malformed-text zgłoszony', () => {
    const scene = buildSceneV3(enm, 2);
    const producerLabel = scene.labels.find((l) => l.ownerRef.endsWith('#producer-bus-voltage'))!;
    const sabotaged = {
      ...scene,
      labels: scene.labels.map((l) => (l === producerLabel ? { ...l, text: 'Sekcja 1 · 0,4 kV' } : l)),
    };
    expect(busbarLabelGaps(sabotaged).some((g) => g.reason === 'malformed-text')).toBe(true);
  });
});
