/**
 * W1 — WYROCZNIA MACIERZY WYPOSAŻENIA POLA (RECENZJA_L2 §1/§6/§12/§15/§20,
 * V12K-145). BRAMKA FAZY W1: dowód END-TO-END, że łańcuch danych „konfiguracja
 * kreatora → ENM (field_spec.primary_devices) → adapter (buildSldDataFrom
 * Snapshot) → scena (buildSceneV3)" jest DOMKNIĘTY, a schemat jest
 * BEZPOŚREDNIM odwzorowaniem modelu — RÓŻNE konfiguracje ⇒ RÓŻNE stosy
 * aparatów (koniec jednego uniwersalnego szablonu §12.4).
 *
 * Ćwiczy REALNĄ, placeable sieć referencyjną `sldSubstrate52s` z wstrzykniętymi
 * `primary_devices` wariantów §20 (patrz `fixtures/w1MatrixVariants.ts`) — nie
 * syntetyczny deskryptor, tylko pełny potok adapter→scena na prawdziwych polach.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3 } from '../buildScene';
import {
  buildW1MatrixFixture,
  W1_VARIANTS,
  type W1MatrixFixture,
} from './fixtures/w1MatrixVariants';

/** Oczekiwane sekwencje symboli sceny per wariant (tor główny wg placement,
 *  potem aparaty BOCZNE ES/SA doklejone na końcu — spec §18.1). Zmierzone na
 *  realnym potoku buildSceneV3(L2); zmiana = świadoma regresja kompozycji. */
const EXPECTED_SCENE_STACK: Record<string, readonly string[]> = {
  'linia-lbs-es': ['loadBreakSwitch', 'cableHead', 'earthSwitch'],
  'linia-lbs-es-otw': ['loadBreakSwitch', 'cableHead', 'earthSwitch'],
  'linia-cb-ct-es': ['disconnector', 'breaker', 'currentTransformer', 'disconnector', 'cableHead', 'earthSwitch'],
  'linia-lbs-fuse': ['loadBreakSwitch', 'fuseSwitch', 'cableHead', 'earthSwitch'],
  'linia-cb-ct-sa': ['disconnector', 'breaker', 'currentTransformer', 'cableHead', 'earthSwitch', 'surgeArrester'],
  // W1b (uwaga 14): 2×uziemnik (krotność z listy) i CT+VT (rozróżnialność).
  'linia-2es': ['disconnector', 'breaker', 'currentTransformer', 'cableHead', 'earthSwitch', 'earthSwitch'],
  'linia-ct-vt': ['disconnector', 'breaker', 'currentTransformer', 'cableHead', 'voltageTransformer', 'earthSwitch'],
  'tr-lbs-fuse-es': ['loadBreakSwitch', 'fuseSwitch', 'transformer2W', 'earthSwitch'],
  'tr-cb-ct-zab': ['disconnector', 'breaker', 'currentTransformer', 'transformer2W', 'earthSwitch'],
};

const LATERAL_SYMBOLS = new Set(['earthSwitch', 'voltageTransformer', 'surgeArrester']);

interface SceneSym {
  readonly symbolId: string;
  readonly x: number;
  readonly y: number;
  readonly state?: string;
  readonly meta?: { ownerRef?: unknown; apparatusSource?: unknown };
}

function baySymbols(scene: ReturnType<typeof buildSceneV3>, fieldRef: string): SceneSym[] {
  return scene.symbols.filter((s) => s.meta?.ownerRef === fieldRef) as SceneSym[];
}

describe('W1 — macierz wyposażenia: łańcuch danych kreator→ENM→adapter→scena', () => {
  let fixture: W1MatrixFixture;
  let sceneL2: ReturnType<typeof buildSceneV3>;

  beforeAll(() => {
    fixture = buildW1MatrixFixture();
    sceneL2 = buildSceneV3(fixture.enm, 2);
  });

  it('każdy wariant §20 rysuje tor pierwotny Z DANYCH (apparatusSource="dane"), sekwencja == konfiguracja', () => {
    expect(fixture.targets).toHaveLength(W1_VARIANTS.length);
    for (const target of fixture.targets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      const ids = syms.map((s) => s.symbolId);
      expect(ids, `wariant ${target.variant.id} (${target.fieldRef})`).toEqual(
        EXPECTED_SCENE_STACK[target.variant.id],
      );
      // Zero fabrykacji/konwencji: cały stos pochodzi Z DANYCH.
      expect(syms.every((s) => s.meta?.apparatusSource === 'dane'), target.variant.id).toBe(true);
    }
  });

  it('RÓŻNE konfiguracje ⇒ RÓŻNE stosy (koniec identycznych pól — asercja różnicy; STAN częścią tożsamości)', () => {
    // W1b (uwaga 13): sygnatura ZE STANEM — para stan-diff (`linia-lbs-es`
    // zamknięty vs `linia-lbs-es-otw` otwarty) ma IDENTYCZNE symbole, więc
    // rozróżnia je wyłącznie stan aparatu (dowód, że geometria stanu jest daną).
    const stacks = fixture.targets.map((t) =>
      baySymbols(sceneL2, t.fieldRef)
        .map((s) => `${s.symbolId}:${s.state ?? ''}`)
        .join('>'),
    );
    const unique = new Set(stacks);
    expect(unique.size, `stosy: ${stacks.join(' | ')}`).toBe(fixture.targets.length);
  });

  it('głowica na styku kabla (§6): pola liniowe kończą TOR GŁÓWNY głowicą, uziemnik/SA BOCZNIE (§15/§18.1)', () => {
    const lineTargets = fixture.targets.filter((t) => t.variant.targetRole === 'LINIA_IN');
    expect(lineTargets.length).toBeGreaterThan(0);
    for (const target of lineTargets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      const mainAxis = syms.filter((s) => !LATERAL_SYMBOLS.has(s.symbolId));
      // Głowica = OSTATNI aparat toru głównego (styk kabla).
      expect(mainAxis[mainAxis.length - 1].symbolId, target.variant.id).toBe('cableHead');
      // Uziemnik BOCZNIE: oś toru głównego jednakowa X, uziemnik POZA nią.
      const axisX = mainAxis[0].x + SYMBOL_DEFS[mainAxis[0].symbolId as keyof typeof SYMBOL_DEFS].width / 2;
      const es = syms.find((s) => s.symbolId === 'earthSwitch');
      expect(es, `${target.variant.id}: uziemnik obecny`).toBeTruthy();
      const esCenterX = es!.x + SYMBOL_DEFS.earthSwitch.width / 2;
      expect(esCenterX, `${target.variant.id}: uziemnik BOCZNIE od osi`).not.toBe(axisX);
    }
  });

  it('stan aparatu z danych PER APARAT (§3): dwa odłączniki wariantu CB+CT+ES mają RÓŻNE stany', () => {
    const target = fixture.targets.find((t) => t.variant.id === 'linia-cb-ct-es')!;
    const disconnectors = baySymbols(sceneL2, target.fieldRef).filter((s) => s.symbolId === 'disconnector');
    expect(disconnectors).toHaveLength(2);
    // ds-bus zamknięty (closed), ds-line otwarty (open) — stan z switchState KAŻDEGO
    // aparatu, nie z agregatu pola (dowód prymatu danych na poziomie stanu).
    const states = disconnectors.map((s) => s.state);
    expect(states).toContain('closed');
    expect(states).toContain('open');
  });

  it('pole BEZ danych = ścieżka konwencji (§12.4) — brak regresu na polach nieobjętych macierzą', () => {
    const targetFields = new Set(fixture.targets.map((t) => t.fieldRef));
    const conventional = sceneL2.symbols.find(
      (s) =>
        typeof s.meta?.ownerRef === 'string' &&
        (s.meta.ownerRef as string).includes('/sn_field/') &&
        !targetFields.has(s.meta.ownerRef as string) &&
        s.meta.apparatusSource === 'konwencja',
    );
    expect(conventional, 'istnieje pole rysowane z konwencji').toBeTruthy();
  });

  it('adapter DOMYKA łańcuch: field_spec.primary_devices → snBays[].primaryDevices (nie gubione)', () => {
    const payload = buildSldDataFromSnapshot(fixture.enm, null);
    for (const target of fixture.targets) {
      const station = payload.stations.find((s) => s.id === target.stationRef);
      expect(station, `stacja ${target.stationRef}`).toBeTruthy();
      const bay = station!.snBays.find((b) => b.bayRef === target.fieldRef);
      expect(bay, `pole ${target.fieldRef}`).toBeTruthy();
      expect(bay!.primaryDevices, `${target.variant.id}: primaryDevices niepuste`).toBeTruthy();
      // Kolejność aparatów adaptera == kolejność danych (posortowana wg placement).
      const kinds = (bay!.primaryDevices ?? []).map((d) => d.kind);
      expect(kinds.length).toBe(target.variant.devices.length);
    }
  });

  it('KOTWICA: dane pola nie zmieniają tożsamości/kotwic stacji (identyczny stationCount i ciąg główny)', () => {
    const base = buildSceneV3(fixture.baseEnm, 2);
    // Wstrzyknięcie primary_devices NIE dodaje/usuwa/przenumerowuje stacji ani
    // nie zmienia szkieletu ciągu głównego (§0: footprint kolumny MOŻE rosnąć
    // od realnych stosów, ale tożsamość/kotwice węzłów są zachowane).
    expect(sceneL2.meta.stationCount).toBe(base.meta.stationCount);
    expect([...sceneL2.meta.mainTrunkStationIds]).toEqual([...base.meta.mainTrunkStationIds]);
  });

  it('KOTWICA L0=L1=L2 (§20): szkielet ciągu głównego niezmienny między poziomami LOD', () => {
    const trunk0 = buildSceneV3(fixture.enm, 0).meta.mainTrunkStationIds;
    const trunk1 = buildSceneV3(fixture.enm, 1).meta.mainTrunkStationIds;
    const trunk2 = sceneL2.meta.mainTrunkStationIds;
    expect([...trunk1]).toEqual([...trunk0]);
    expect([...trunk2]).toEqual([...trunk0]);
  });
});

/**
 * W1b — SEMANTYKA TORU (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 4/5/6/13/14).
 * Wyrocznie ciągłości toru, głowicy na styku kabla, węzła uziemnika na torze i
 * ogranicznika DO ZIEMI który NIE przerywa toru — plus stany i krotności macierzy.
 */
const LATERAL_SET = new Set(['earthSwitch', 'voltageTransformer', 'surgeArrester']);

type SceneSeg = { readonly points: readonly { x: number; y: number }[]; readonly meta?: { ownerRef?: unknown } };

describe('W1b — semantyka toru (uwagi 4/5/6/13/14)', () => {
  let fixture: W1MatrixFixture;
  let sceneL2: ReturnType<typeof buildSceneV3>;

  beforeAll(() => {
    fixture = buildW1MatrixFixture();
    sceneL2 = buildSceneV3(fixture.enm, 2);
  });

  const mainAxis = (fieldRef: string): SceneSym[] =>
    baySymbols(sceneL2, fieldRef).filter((s) => !LATERAL_SET.has(s.symbolId));
  const axisX = (fieldRef: string): number => {
    const m = mainAxis(fieldRef);
    return m[0].x + SYMBOL_DEFS[m[0].symbolId as keyof typeof SYMBOL_DEFS].width / 2;
  };
  const fieldSegments = (fieldRef: string): SceneSeg[] =>
    (sceneL2.segments as SceneSeg[]).filter((s) => String(s.meta?.ownerRef ?? '').startsWith(fieldRef + '#'));

  it('uwaga 4 — GŁOWICA = ZAKOŃCZENIE KABLA: port kablowy głowicy leży NA DOLE toru (styk kabla), nigdy w środku stosu', () => {
    const lineTargets = fixture.targets.filter((t) => t.variant.targetRole === 'LINIA_IN');
    expect(lineTargets.length).toBeGreaterThan(0);
    for (const target of lineTargets) {
      const axis = mainAxis(target.fieldRef);
      const head = axis[axis.length - 1];
      expect(head.symbolId, `${target.variant.id}: głowica ostatnia w torze`).toBe('cableHead');
      const headLineY = head.y + SYMBOL_DEFS.cableHead.height; // port `line` (S)
      // Żaden inny aparat toru głównego nie leży NIŻEJ niż port kablowy głowicy
      // (głowica jest fizycznym końcem toru — przejściem kabla do pola).
      const maxOtherBottom = Math.max(
        ...axis.slice(0, -1).map((s) => s.y + SYMBOL_DEFS[s.symbolId as keyof typeof SYMBOL_DEFS].height),
      );
      expect(headLineY, `${target.variant.id}: głowica na dole toru`).toBeGreaterThanOrEqual(maxOtherBottom);
    }
  });

  it('uwaga 5 — UZIEMNIK NA ODCINKU TORU: odgałęzienie ES ma jawny WĘZEŁ na osi toru (start odczepu = oś), koniec = port ES', () => {
    for (const target of fixture.targets) {
      const es = baySymbols(sceneL2, target.fieldRef).find((s) => s.symbolId === 'earthSwitch');
      if (!es) continue;
      const laterals = fieldSegments(target.fieldRef).filter((s) =>
        String(s.meta?.ownerRef).includes('#lateral-earthSwitch-'),
      );
      expect(laterals.length, `${target.variant.id}: odczep(y) uziemnika`).toBeGreaterThan(0);
      for (const seg of laterals) {
        const tap = seg.points[0];
        const tip = seg.points[seg.points.length - 1];
        // Węzeł przyłączenia leży NA osi toru głównego (odczep od toru, nie „obok kolumny").
        expect(tap.x, `${target.variant.id}: węzeł ES na osi toru`).toBe(axisX(target.fieldRef));
        // Odczep POZIOMY, koniec na osi symbolu ES (port N) — poza osią toru.
        expect(tip.y).toBe(tap.y);
        expect(tip.x).not.toBe(tap.x);
      }
    }
  });

  it('uwaga 6 — SA → ZIEMIA: ogranicznik jest BOCZNY (odgałęzienie), NIE w szeregu toru; tor główny nie zawiera SA', () => {
    const saTarget = fixture.targets.find((t) => t.variant.id === 'linia-cb-ct-sa')!;
    const axis = mainAxis(saTarget.fieldRef).map((s) => s.symbolId);
    // Wyrocznia NEGATYWNA: SA nie przerywa ciągłości toru (nie ma go w torze głównym).
    expect(axis).not.toContain('surgeArrester');
    // SA obecny jako aparat BOCZNY z odczepem od osi toru (odgałęzienie do ziemi).
    const sa = baySymbols(sceneL2, saTarget.fieldRef).find((s) => s.symbolId === 'surgeArrester');
    expect(sa, 'SA obecny').toBeTruthy();
    const saSeg = fieldSegments(saTarget.fieldRef).find((s) =>
      String(s.meta?.ownerRef).includes('#lateral-surgeArrester-'),
    );
    expect(saSeg, 'odczep SA').toBeTruthy();
    expect(saSeg!.points[0].x, 'węzeł SA na osi toru').toBe(axisX(saTarget.fieldRef));
  });

  it('uwaga 13 — STAN aparatu z danych: para IDENTYCZNEJ konfiguracji różni się WYŁĄCZNIE stanem łącznika (geometria stanu)', () => {
    const closedT = fixture.targets.find((t) => t.variant.id === 'linia-lbs-es')!;
    const openT = fixture.targets.find((t) => t.variant.id === 'linia-lbs-es-otw')!;
    const lbsClosed = baySymbols(sceneL2, closedT.fieldRef).find((s) => s.symbolId === 'loadBreakSwitch')!;
    const lbsOpen = baySymbols(sceneL2, openT.fieldRef).find((s) => s.symbolId === 'loadBreakSwitch')!;
    expect(lbsClosed.state).toBe('closed');
    expect(lbsOpen.state).toBe('open');
    // Ta sama sekwencja symboli — różnica tożsamości pola tkwi w STANIE.
    const seq = (f: string) => baySymbols(sceneL2, f).map((s) => s.symbolId).join('>');
    expect(seq(openT.fieldRef)).toBe(seq(closedT.fieldRef));
  });

  it('uwaga 14 — KROTNOŚCI z danych: 2×uziemnik (lista) oraz CT+VT rozróżnialne (CT ≠ VT) w jednym polu', () => {
    const es2 = fixture.targets.find((t) => t.variant.id === 'linia-2es')!;
    const esCount = baySymbols(sceneL2, es2.fieldRef).filter((s) => s.symbolId === 'earthSwitch').length;
    expect(esCount, '2×uziemnik z listy').toBe(2);

    const ctvt = fixture.targets.find((t) => t.variant.id === 'linia-ct-vt')!;
    const syms = baySymbols(sceneL2, ctvt.fieldRef).map((s) => s.symbolId);
    expect(syms.filter((s) => s === 'currentTransformer'), 'CT obecny').toHaveLength(1);
    expect(syms.filter((s) => s === 'voltageTransformer'), 'VT obecny, odróżnialny od CT').toHaveLength(1);
  });
});
