/**
 * 7 pozycji PLAN recenzji NO-GO właściciela 2026-07-17 (rejestr:
 * docs/sld/SLD_REVIEW_NO_GO_2026-07-17.md, spec §12.5) — dowody sceny:
 *
 *  - pkt 5: szablony technologiczne pól RMU — `bay_template_probe`
 *    (`bayTemplateGaps`) z NEGATYWEM (sabotaż: breaker wstrzyknięty w pole
 *    RMU konwencji MUSI dać gap);
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
import {
  allBayTemplatesValid,
  bayTemplateGaps,
  buildSceneV3,
} from '../buildScene';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneV3 } from '../buildScene';

const fixturePath = join(__dirname, 'fixtures', 'gpzFeeder.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

describe('bay_template_probe (spec §12.5, recenzja NO-GO pkt 5)', () => {
  it('pozytyw: pola konwencji stacji SN/nN używają szablonów RMU — zero gapów na L1/L2', () => {
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      expect(bayTemplateGaps(scene, enm)).toEqual([]);
      expect(allBayTemplatesValid(scene, enm)).toBe(true);
    }
  });

  it('pola liniowe RMU niosą rozłącznik (loadBreakSwitch), ZERO breaker/CT z konwencji; pola TR RMU niosą uziemnik (pkt 6)', () => {
    const scene = buildSceneV3(enm, 2);
    const stationApparatus = scene.symbols.filter(
      (s) => s.meta?.apparatusSource === 'konwencja' && (s.meta?.ownerRef ?? '').startsWith('stn/'),
    );
    expect(stationApparatus.length).toBeGreaterThan(0);
    expect(stationApparatus.some((s) => s.symbolId === 'loadBreakSwitch')).toBe(true);
    expect(stationApparatus.some((s) => s.symbolId === 'earthSwitch')).toBe(true);
    // Pomiar recenzji pkt 5: CB+CT w polu liniowym stacji kompaktowej =
    // przeciek uniwersalnego szablonu GPZ — po naprawie ZERO takich symboli
    // ze ścieżki konwencji na stacjach.
    expect(stationApparatus.some((s) => s.symbolId === 'breaker' || s.symbolId === 'currentTransformer')).toBe(false);
  });

  it('NEGATYW (wyrocznia gryzie): breaker wstrzyknięty w pole RMU konwencji ⇒ gap rmu-line-breaker-leak', () => {
    const scene = buildSceneV3(enm, 2);
    const rmuSwitch = scene.symbols.find(
      (s) => s.symbolId === 'loadBreakSwitch' && s.meta?.apparatusSource === 'konwencja',
    );
    expect(rmuSwitch).toBeDefined();
    const sabotaged: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        { ...rmuSwitch!, symbolId: 'breaker' },
      ],
    };
    const gaps = bayTemplateGaps(sabotaged, enm);
    expect(gaps.some((g) => g.reason === 'rmu-line-breaker-leak')).toBe(true);
  });

  it('NEGATYW (wyrocznia gryzie): pole RMU bez rozłącznika ⇒ gap rmu-line-missing-switch', () => {
    const scene = buildSceneV3(enm, 2);
    const sabotaged: SceneV3 = {
      ...scene,
      symbols: scene.symbols.map((s) =>
        s.symbolId === 'loadBreakSwitch' && s.meta?.apparatusSource === 'konwencja'
          ? { ...s, symbolId: 'disconnector' }
          : s,
      ),
    };
    const gaps = bayTemplateGaps(sabotaged, enm);
    expect(gaps.some((g) => g.reason === 'rmu-line-missing-switch')).toBe(true);
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
