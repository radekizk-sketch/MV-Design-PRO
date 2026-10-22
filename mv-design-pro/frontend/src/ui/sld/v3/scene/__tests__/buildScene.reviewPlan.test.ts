/**
 * 7 pozycji PLAN recenzji NO-GO właściciela 2026-07-17 (rejestr:
 * docs/sld/SLD_REVIEW_NO_GO_2026-07-17.md, spec §12.5) — dowody sceny:
 *
 *  - pkt 5: prawda o wyposażeniu pól — `bay_equipment_probe` (`bayEquipmentGaps`,
 *    karta GEOMETRIA-STACJI zastąpiła sondę szablonów konwencji RMU) z NEGATYWAMI
 *    dla każdej przyczyny sondy;
 *  - pkt 6: tor za TR domknięty — wiersze strony nN w paśmie nazw
 *    („Szyna nN · 0,4 kV" + jawna granica modelu, bo fixtura nie niesie
 *    rekordów `Load`);
 *  - pkt 13: etykieta przęsła ZWIĄZANA z odcinkiem parą końców
 *    („GPZ ↔ S01 — typ · długość").
 *
 * Fixtura: `gpzFeeder.enm.json` — REALNY backend (stacje S01/S02 z polami
 * RMU_LINE/RMU_TRANSFORMER przez `mapStationBayRoleToMiniRole`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allBayEquipmentTruthful, bayEquipmentGaps, buildSceneV3 } from '../buildScene';
import { zRekordamiAparatowPol } from './fixtures/rekordyAparatowPola';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneV3 } from '../buildScene';

const fixturePath = join(__dirname, 'fixtures', 'gpzFeeder.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

describe('bay_equipment_probe (GEOMETRIA-STACJI §0 pkt 4; zastępuje bay_template_probe §12.5)', () => {
  // Recenzja NO-GO pkt 5 pilnowała jakości SZABLONU konwencji RMU (rozłącznik zamiast
  // CB+CT). Karta GEOMETRIA-STACJI skasowała konwencję: aparat pola rysuje się WYŁĄCZNIE
  // z rekordu modelu. Intencja pkt 5 („rysunek pola nie kłamie o wyposażeniu") przechodzi
  // na sondę prawdziwości: stos z danych = same rekordy, stos bez danych = jedna sylwetka
  // bez aparatu i bez stanu. Iloczyn: LOD {L1, L2} × fikstura {surowa, z rekordami} ×
  // naruszenie {5 przyczyn sondy}.
  const zRekordami = zRekordamiAparatowPol(enm);
  // Pole liniowe stacji bez rekordów (ani `primary_devices`, ani gałęzi w `equipment_refs`) —
  // stos „brak" (fikstura niesie wyłącznik w każdym polu stacji).
  const pierwszePoleStacji = enm.bays.findIndex((b) => b.ref_id.includes('/sn_field/000'));
  const bezRekordow: EnergyNetworkModel = {
    ...enm,
    bays: enm.bays.map((b, i) => (i === pierwszePoleStacji ? { ...b, equipment_refs: [] } : b)),
  };

  it('pozytyw: fikstura surowa, z rekordami i z polem bez rekordów — zero luk na L1/L2', () => {
    for (const model of [enm, zRekordami, bezRekordow]) {
      for (const lod of [1, 2] as const) {
        const scene = buildSceneV3(model, lod);
        expect(bayEquipmentGaps(scene)).toEqual([]);
        expect(allBayEquipmentTruthful(scene)).toBe(true);
      }
    }
  });

  it('pola stacji z rekordami RMU niosą rozłącznik i uziemnik z rekordów, ZERO wyłącznika i przekładnika', () => {
    const scene = buildSceneV3(zRekordami, 2);
    const aparatyStacji = scene.symbols.filter(
      (s) => s.meta?.apparatusSource === 'dane' && (s.meta?.ownerRef ?? '').startsWith('stn/'),
    );
    expect(aparatyStacji.length).toBeGreaterThan(0);
    // Transformator pola TR jest elementem modelu pola (rekord `Transformer`), nie aparatem.
    expect(aparatyStacji.filter((s) => s.symbolId !== 'transformer2W').every((s) => !!s.meta?.deviceRef)).toBe(true);
    expect(aparatyStacji.some((s) => s.symbolId === 'loadBreakSwitch')).toBe(true);
    expect(aparatyStacji.some((s) => s.symbolId === 'earthSwitch')).toBe(true);
    expect(aparatyStacji.some((s) => s.symbolId === 'breaker' || s.symbolId === 'currentTransformer')).toBe(false);
  });

  function sabotaz(scene: SceneV3, zrodlo: 'dane' | 'brak', zmiana: (s: SceneV3['symbols'][number]) => SceneV3['symbols'][number]): SceneV3 {
    const cel = scene.symbols.find((s) => s.meta?.apparatusSource === zrodlo && (zrodlo === 'brak' ? s.symbolId === 'bayNoEquipment' : true));
    expect(cel, `scena ma stos „${zrodlo}"`).toBeDefined();
    return { ...scene, symbols: [...scene.symbols, zmiana(cel!)] };
  }

  it('NEGATYW: aparat stosu z danych bez refu rekordu ⇒ dane-bez-rekordu', () => {
    const scene = buildSceneV3(zRekordami, 2);
    const zly = sabotaz(scene, 'dane', (s) => ({ ...s, symbolId: 'breaker', meta: { ...s.meta, deviceRef: undefined } }));
    expect(bayEquipmentGaps(zly).some((g) => g.reason === 'dane-bez-rekordu')).toBe(true);
  });

  it('NEGATYW: sylwetka braku danych w stosie z danych ⇒ dane-z-sylwetka-braku', () => {
    const scene = buildSceneV3(zRekordami, 2);
    const zly = sabotaz(scene, 'dane', (s) => ({ ...s, symbolId: 'bayNoEquipment' }));
    expect(bayEquipmentGaps(zly).some((g) => g.reason === 'dane-z-sylwetka-braku')).toBe(true);
  });

  it('NEGATYW: druga sylwetka w stosie bez danych ⇒ brak-bez-sylwetki', () => {
    const scene = buildSceneV3(bezRekordow, 2);
    const zly = sabotaz(scene, 'brak', (s) => ({ ...s }));
    expect(bayEquipmentGaps(zly).some((g) => g.reason === 'brak-bez-sylwetki')).toBe(true);
  });

  it('NEGATYW: aparat z konwencji w stosie bez danych ⇒ brak-z-aparatem', () => {
    const scene = buildSceneV3(bezRekordow, 2);
    const zly = sabotaz(scene, 'brak', (s) => ({ ...s, symbolId: 'loadBreakSwitch' }));
    expect(bayEquipmentGaps(zly).some((g) => g.reason === 'brak-z-aparatem')).toBe(true);
  });

  it('NEGATYW: stan łącznika w stosie bez danych ⇒ brak-ze-stanem', () => {
    const scene = buildSceneV3(bezRekordow, 2);
    const cel = scene.symbols.find((s) => s.symbolId === 'bayNoEquipment' && s.meta?.apparatusSource === 'brak')!;
    const zly: SceneV3 = { ...scene, symbols: scene.symbols.map((s) => (s === cel ? { ...s, state: 'closed' } : s)) };
    expect(bayEquipmentGaps(zly).some((g) => g.reason === 'brak-ze-stanem')).toBe(true);
  });
});

describe('strona nN w paśmie nazw (spec §12.5, recenzja NO-GO pkt 6)', () => {
  it('każda stacja z polem TR niesie wiersz „Szyna nN · 0,4 kV" + ODBIÓR zagregowany z rekordów Load (fixtura z realnego backendu je niesie) + strzałkę odbioru na szynie nN', () => {
    const scene = buildSceneV3(enm, 2);
    const texts = scene.labels.filter((l) => l.ownerKind === 'station-name').map((l) => l.text);
    const lvRows = texts.filter((t) => t.startsWith('Szyna nN'));
    const loadRows = texts.filter((t) => t.startsWith('Odbiór ΣP'));
    // Dwie stacje (S01/S02), obie z polem transformatorowym i rekordem Load.
    expect(lvRows.length).toBe(2);
    // ZAPIS POLSKI (V12K-235). Ten test kodyfikował wcześniej „0.4 kV" z kropką —
    // czyli zapis, który w tej samej tabliczce stał obok „ΣP 0,4 MW" z przecinkiem.
    // Intencja pozostaje: wiersz szyny nN NIESIE napięcie z modelu (nie sam opis).
    expect(lvRows[0]).toBe('Szyna nN · 0,4 kV');
    expect(loadRows.length).toBe(2);
    expect(scene.symbols.filter((s) => s.symbolId === 'loadArrow')).toHaveLength(2);
  });

  it('stacja BEZ rekordów Load ⇒ jawna granica modelu zamiast fabrykowanego odbioru (pkt 6/9: „…albo jawne granice modelu")', () => {
    const stripped: EnergyNetworkModel = { ...enm, loads: [] };
    const scene = buildSceneV3(stripped, 2);
    const texts = scene.labels.filter((l) => l.ownerKind === 'station-name').map((l) => l.text);
    expect(texts.filter((t) => t.includes('granica modelu')).length).toBe(2);
    expect(texts.some((t) => t.startsWith('Odbiór ΣP'))).toBe(false);
    expect(scene.symbols.some((s) => s.symbolId === 'loadArrow')).toBe(false);
  });
});

describe('etykieta przęsła z parą końców (spec §12.5, recenzja NO-GO pkt 13; W3-KABLE-ETYKIETY §7)', () => {
  it('etykieta segmentu GPZ→S01 niesie parę końców „GPZ ↔ S01 · …" (L2, separator §7 „ · ")', () => {
    const scene = buildSceneV3(enm, 2);
    const spanTexts = scene.labels
      .filter((l) => l.ownerKind === 'segment-span')
      .map((l) => l.text);
    expect(spanTexts.length).toBeGreaterThan(0);
    expect(spanTexts.some((t) => /^GPZ ↔ S\d{2} · /.test(t))).toBe(true);
    // Zero etykiet przęseł BEZ pary końców na tej fixturze (oba końce znane).
    expect(spanTexts.every((t) => t.includes(' ↔ '))).toBe(true);
    // W3 §7 L2: co najmniej jedna etykieta niesie PEŁNY człon techniczny
    // z realnych danych katalogu/ENM — długość w formacie „l = …" oraz
    // napięcie znamionowe (fixtura niesie voltage_rating_kv=20).
    // S9-8: napięcie znamionowe kabla jest OZNACZONE („Un=…"), żeby nie dało
    // się go pomylić z napięciem pracy sieci — intencja asercji bez zmian.
    expect(spanTexts.some((t) => /· l = \d/.test(t))).toBe(true);
    expect(spanTexts.some((t) => /· Un=\d+(?:,\d+)? kV · l = /.test(t))).toBe(true);
  });
});
