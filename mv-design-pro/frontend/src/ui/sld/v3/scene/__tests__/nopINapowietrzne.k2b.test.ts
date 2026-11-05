// @vitest-environment node
/**
 * K2b §0.4 — WIDOK ROBOCZY: punkt normalnie otwarty na KAŻDYM poziomie szczegółu
 * i rozróżnienie kabel / linia napowietrzna, oba z ENM.
 *
 * Wada wyjściowa (pomiar 2026-10-21 na fiksturze 52 stacji): punkt podziału
 * ustawiony operacją domenową nie był rysowany na żadnym poziomie, a osiem linii
 * napowietrznych (`Branch.type = 'line_overhead'`) rysowało się kreską ciągłą jak kabel.
 *
 * Kanon W5-C (operacje łączników): punkt podziału to WYŁĄCZNIE łącznik z pozycją
 * normalną `'open'` (`SwitchBranch.normal_state`, lustro `punktyPodzialu`). Dawne
 * wskazania odcinka, linii albo stacji przez `Corridor.no_point_ref` są skasowane,
 * więc przypadki „NOP na odcinku kablowym / napowietrznym / stacji" z pierwszej
 * wersji tego testu nie są już reprezentowalne w modelu. Intencja zostaje: każdy
 * punkt podziału jest widoczny na każdym poziomie, dokładnie raz, bez fabrykacji.
 *
 * ILOCZYN CECH (reguła KLASA pkt 2):
 *  - punkt podziału: łącznik z fikstury · inny łącznik pola (przeniesiony) ·
 *    łącznik bez narysowanej stacji · brak punktu podziału;
 *  - poziom szczegółu L0 · L1 · L2;
 *  - rodzaj gałęzi: kabel · linia napowietrzna · model bez linii napowietrznych;
 *  - determinizm (dwa budowania tej samej migawki — identyczna scena).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, SwitchBranch } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../buildScene';
import { OVERHEAD_LINE_DASHARRAY, segmentDasharray } from '../../compose/preview';
import { computeProjectLegendEntries } from '../../sheet/projectLegend';
import { kandydaciNaPunktPodzialu, punktyPodzialu } from '../../../../shared/stanLacznika';

const here = dirname(fileURLToPath(import.meta.url));
const wczytaj = (): EnergyNetworkModel =>
  (
    JSON.parse(
      readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
    ) as { enm: EnergyNetworkModel }
  ).enm;
const enm = wczytaj();
const LODY: readonly SceneLod[] = [0, 1, 2];
const baza = (ref: string | undefined) => (ref ?? '').split('#')[0];
const NOP_FIKSTURY = punktyPodzialu(enm).map((g) => g.ref_id);

/** Kopia migawki, w której punktem podziału jest wyłącznie łącznik `ref`. */
function zNop(ref: string): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  // Jak operacja `set_normal_open_point`: dotychczasowy punkt dostaje pozycję
  // normalną „zamknięty”, wskazany łącznik — „otwarty”.
  for (const g of kopia.branches) {
    const lacznik = g as { ref_id: string; normal_state?: string | null };
    if (lacznik.ref_id === ref) lacznik.normal_state = 'open';
    else if (lacznik.normal_state === 'open') lacznik.normal_state = 'closed';
  }
  return kopia;
}
const bezNop = (): EnergyNetworkModel => zNop('');
const stacjaPolaLacznika = new Map<string, string>();
for (const pole of enm.bays ?? []) {
  if (!pole.substation_ref) continue;
  for (const ref of pole.equipment_refs ?? []) stacjaPolaLacznika.set(ref, pole.substation_ref);
}
const stacjaPola = (ref: string): string | undefined => stacjaPolaLacznika.get(ref);
function nop(sc: SceneV3, ref: string) {
  return {
    symbole: sc.symbols.filter((s) => s.symbolId === 'noPoint' && s.meta?.ownerRef === ref),
    podpisy: sc.labels.filter((l) => l.ownerRef === `${ref}#no-point` && l.text === 'NO'),
  };
}

describe('punkt podziału z `SwitchBranch.normal_state` na każdym poziomie szczegółu', () => {
  it('fikstura ma dokładnie jeden punkt podziału i co najmniej dwóch kandydatów do przeniesienia', () => {
    expect(NOP_FIKSTURY).toHaveLength(1);
    expect(kandydaciNaPunktPodzialu(enm).length).toBeGreaterThanOrEqual(2);
    expect(kandydaci.length, 'kandydaci SN').toBeGreaterThanOrEqual(2);
  });
  // Punkt podziału sieci SN: kandydaci z łącznikami po obu stronach na szynach SN.
  const napiecieSzyny = new Map(enm.buses.map((b) => [b.ref_id, b.voltage_kv]));
  const kandydaci = kandydaciNaPunktPodzialu(enm)
    .filter((g) => (napiecieSzyny.get(g.from_bus_ref) ?? 0) > 1 && (napiecieSzyny.get(g.to_bus_ref) ?? 0) > 1)
    .map((g) => g.ref_id)
    .sort();
  const PRZENIESIONY_PIERWSZY = kandydaci[0]!;
  const PRZENIESIONY_OSTATNI = kandydaci[kandydaci.length - 1]!;
  const PRZYPADKI: readonly (readonly [string, string, EnergyNetworkModel])[] = [
    ['łącznik z fikstury', NOP_FIKSTURY[0]!, enm],
    ['inny łącznik pola (pierwszy kandydat)', PRZENIESIONY_PIERWSZY, zNop(PRZENIESIONY_PIERWSZY)],
    ['inny łącznik pola (ostatni kandydat)', PRZENIESIONY_OSTATNI, zNop(PRZENIESIONY_OSTATNI)],
  ];
  for (const [nazwa, ref, model] of PRZYPADKI) {
    for (const lod of LODY) {
      it(`${nazwa} · L${lod}: dokładnie jedna reprezentacja (łącznika albo znacznika NO jego stacji), ${lod === 0 ? 'bez podpisu (GS-1)' : 'jeden podpis „NO"'}, bez notatki o pominięciu`, () => {
        const sc = buildSceneV3(model, lod);
        const stacja = stacjaPola(ref);
        const glifStacji = sc.symbols.some((s) => s.meta?.ownerRef === stacja && s.meta?.stationGlyph?.noOpen === true);
        const reprezentacje = [
          ...sc.symbols.filter((s) => s.symbolId === 'noPoint'),
          ...(glifStacji ? ['glif L0 stacji'] : []),
        ];
        // Jeden punkt podziału = jedna reprezentacja w CAŁEJ scenie: symbol łącznika
        // z sekcji 6z ALBO znacznik NO stacji, który adapter wyprowadza z tego samego łącznika.
        expect(reprezentacje, 'reprezentacje punktu podziału').toHaveLength(1);
        const symbol = sc.symbols.find((s) => s.symbolId === 'noPoint');
        if (symbol) {
          expect([ref, stacja]).toContain(symbol.meta?.ownerRef);
          expect(symbol.meta?.testId).toBe(`sld-v3-nop-${symbol.meta?.ownerRef}`);
          expect(symbol.meta?.elementKind).toBe('apparatus');
        } else {
          expect(lod, 'brak symbolu dopuszczalny wyłącznie na L0 z glifem stacji').toBe(0);
        }
        const podpisy = sc.labels.filter((l) => l.text === 'NO');
        expect(podpisy).toHaveLength(lod === 0 ? 0 : 1);
        if (lod !== 0) expect(podpisy[0]!.labelClass).toBe('t3');
        expect(sc.meta.stopNotes.some((n) => n.includes(ref))).toBe(false);
      });
    }
  }

  it('brak punktu podziału: żaden symbol noPoint, żaden podpis „NO", żadna notatka o pominięciu', () => {
    for (const lod of LODY) {
      const sc = buildSceneV3(bezNop(), lod);
      expect(sc.symbols.some((s) => s.symbolId === 'noPoint')).toBe(false);
      expect(sc.labels.some((l) => l.text === 'NO')).toBe(false);
      expect(sc.meta.stopNotes.some((n) => n.includes('normalnie otwarty'))).toBe(false);
    }
  });

  it('symbol i podpis NO nie wypychają z rysunku żadnej INNEJ etykiety (pomiar: podpis pod łącznikiem toru odrzucał jego nazwę na L2)', () => {
    const odrzucone = (sc: SceneV3) =>
      new Set(sc.meta.stopNotes.filter((n) => n.startsWith('label.declutter')).flatMap((n) => n.match(/[a-z-]+:[^ ,()]+#[a-z-]+/g) ?? []));
    const model0 = bezNop();
    for (const [nazwa, ref, model] of PRZYPADKI) {
      for (const lod of LODY) {
        const przed = odrzucone(buildSceneV3(model0, lod));
        const po = [...odrzucone(buildSceneV3(model, lod))].filter((k) => !k.endsWith(`${ref}#no-point`));
        expect(po.filter((k) => !przed.has(k)), `${nazwa} · L${lod}`).toEqual([]);
      }
    }
  });

  it('łącznik punktu podziału bez narysowanej stacji ani odcinka: brak symbolu i jawna notatka o pominięciu (bez fabrykacji położenia)', () => {
    const ref = 'sw/nie-narysowany/switch';
    const model = bezNop();
    const wzor = enm.branches.find((g) => g.ref_id === NOP_FIKSTURY[0]) as SwitchBranch;
    model.branches.push({
      ...structuredClone(wzor),
      id: ref,
      ref_id: ref,
      from_bus_ref: 'bus/nie-ma-takiej-szyny/a',
      to_bus_ref: 'bus/nie-ma-takiej-szyny/b',
      normal_state: 'open',
    } as SwitchBranch);
    for (const lod of LODY) {
      const sc = buildSceneV3(model, lod);
      expect(nop(sc, ref).symbole).toHaveLength(0);
      expect(sc.meta.stopNotes.some((n) => n.includes(ref))).toBe(true);
    }
  });

  it('determinizm: dwa budowania tej samej migawki z przeniesionym punktem podziału — identyczne sceny', () => {
    for (const lod of LODY) {
      expect(JSON.stringify(buildSceneV3(zNop(PRZENIESIONY_OSTATNI), lod))).toBe(
        JSON.stringify(buildSceneV3(zNop(PRZENIESIONY_OSTATNI), lod)),
      );
    }
  });
});

describe('kabel ciągły, linia napowietrzna przerywana — z `Branch.type` przez adapter', () => {
  const napowietrzne = new Set(enm.branches.filter((b) => b.type === 'line_overhead').map((b) => b.ref_id));
  const kablowe = new Set(enm.branches.filter((b) => b.type === 'cable').map((b) => b.ref_id));
  for (const lod of LODY) {
    it(`L${lod}: każdy odcinek SN linii napowietrznej ma lineType 'overhead' i kreskę ${OVERHEAD_LINE_DASHARRAY}; żaden odcinek kabla jej nie ma`, () => {
      const sc = buildSceneV3(enm, lod);
      let napow = 0;
      for (const s of sc.segments) {
        const rodzaj = s.meta?.kind ?? 'sn';
        if (rodzaj !== 'sn' && rodzaj !== 'snTrunk') continue;
        const ref = baza(s.meta?.ownerRef);
        if (napowietrzne.has(ref)) {
          napow += 1;
          expect(s.meta?.lineType, ref).toBe('overhead');
          expect(segmentDasharray(s)).toBe(OVERHEAD_LINE_DASHARRAY);
        }
        if (kablowe.has(ref)) {
          expect(s.meta?.lineType, ref).toBeUndefined();
          expect(segmentDasharray(s)).toBeUndefined();
        }
      }
      expect(napow, 'fikstura musi rysować linie napowietrzne').toBeGreaterThan(0);
      const legenda = computeProjectLegendEntries(sc).filter((e) => e.kind === 'line').map((e) => e.id);
      expect(legenda).toContain('overhead');
      expect(legenda).toContain('cable');
    });
  }

  it('model bez linii napowietrznych: żaden odcinek nie jest przerywany, legenda bez pozycji linii napowietrznej', () => {
    const kopia = structuredClone(enm);
    for (const b of kopia.branches) if (b.type === 'line_overhead') (b as { type: string }).type = 'cable';
    for (const lod of LODY) {
      const sc = buildSceneV3(kopia, lod);
      expect(sc.segments.some((s) => s.meta?.lineType === 'overhead')).toBe(false);
      expect(computeProjectLegendEntries(sc).some((e) => e.id === 'overhead')).toBe(false);
    }
  });
});
