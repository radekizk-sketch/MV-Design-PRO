/**
 * W3-KABLE-ETYKIETY §17 (kotwiczenie etykiet do właściciela) + §7 (etykiety
 * techniczne linii) — dowody sceny na fixturze referencyjnej (53 stacje).
 *
 * §17 ANTY-DRYF: każda etykieta przęsła (`segment-span`) ma właściciela (kod
 * stacji docelowej w `ownerRef` = „⟨stationId⟩#segment-label") i musi leżeć
 * BLIŻEJ kolumny swojej stacji-właściciela niż kolumny KAŻDEJ innej stacji
 * ciągu — inaczej etykieta „dryfuje" do sąsiedniego przęsła i gubi jednoznaczne
 * przypisanie (recenzja pkt 13). Odległość = |środek-x etykiety − środek-x
 * zakresu symboli stacji|.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSceneV3, sheetRowStationIds } from '../buildScene';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneV3 } from '../buildScene';

const fixturePath = join(
  __dirname,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/** Hash stacji (`stn/<hash>/station` → `<hash>`) — jak w accept:sld-v3. */
function stationHash(stationId: string): string {
  return stationId.split('/')[1] ?? stationId;
}

/** Zakres X symboli stacji (środek = (min+max)/2) — jak `stationXRange` w
 *  skrypcie akceptacyjnym. `null`, gdy stacja nie ma symboli na tym LOD. */
function stationCenterX(scene: SceneV3, stationId: string): number | null {
  const hash = stationHash(stationId);
  const xs = scene.symbols
    .filter((s) => s.meta?.testId != null && s.meta.testId.includes(hash))
    .map((s) => s.x);
  if (xs.length === 0) return null;
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

describe('W3 §17 — kotwiczenie etykiet przęseł do właściciela (anty-dryf)', () => {
  it('każda etykieta segment-span leży bliżej stacji-właściciela niż każdej innej stacji ciągu (L2)', () => {
    const scene = buildSceneV3(enm, 2);
    // S9-1 (ŁAMANIE ARKUSZA): intencja BEZ ZMIAN — etykieta przęsła nie może
    // dryfować od swojej stacji. Zmienia się ZBIÓR ODNIESIENIA: po złamaniu
    // arkusza każdy wiersz zaczyna się od lewego marginesu, więc stacje z
    // RÓŻNYCH wierszy mają nakładające się zakresy X i porównanie „w poprzek
    // całego ciągu" mierzyłoby odległość do stacji leżącej pół arkusza wyżej.
    // Sąsiedztwo, o które chodzi wyroczni, jest sąsiedztwem W WIERSZU.
    const rowOfStation = new Map<string, number>();
    sheetRowStationIds(scene).forEach((row, rowIndex) => {
      for (const id of row) rowOfStation.set(id, rowIndex);
    });
    const allCenters = scene.meta.mainTrunkStationIds
      .map((id) => ({ id, x: stationCenterX(scene, id), row: rowOfStation.get(id) ?? 0 }))
      .filter((c): c is { id: string; x: number; row: number } => c.x != null);
    expect(allCenters.length).toBeGreaterThan(1);

    const spanLabels = scene.labels.filter(
      (l) => l.ownerKind === 'segment-span' && l.ownerRef.endsWith('#segment-label'),
    );
    expect(spanLabels.length).toBeGreaterThan(0);

    let checked = 0;
    for (const label of spanLabels) {
      const ownerId = label.ownerRef.replace(/#segment-label$/, '');
      const owner = allCenters.find((c) => c.id === ownerId);
      if (!owner) continue; // GPZ→S0 właściciel to stacja0 — obecny w centers; inne pomijamy uczciwie
      const labelCenterX = label.rect.x + label.rect.width / 2;
      const distToOwner = Math.abs(labelCenterX - owner.x);
      for (const other of allCenters) {
        if (other.id === ownerId || other.row !== owner.row) continue;
        const distToOther = Math.abs(labelCenterX - other.x);
        expect(distToOwner).toBeLessThanOrEqual(distToOther);
      }
      checked += 1;
    }
    // Dowód, że asercja faktycznie coś sprawdziła (nie pusta pętla).
    expect(checked).toBeGreaterThan(0);
  });
});

describe('W3 §7 — etykieta techniczna L2 z realnych danych katalogu/ENM', () => {
  it('co najmniej jedna etykieta przęsła niesie relację · typ · napięcie · długość „l = …"', () => {
    const scene = buildSceneV3(enm, 2);
    const spanTexts = scene.labels
      .filter((l) => l.ownerKind === 'segment-span')
      .map((l) => l.text);
    expect(spanTexts.length).toBeGreaterThan(0);
    // Relacja z parą końców (§17) + długość w formacie §7.
    expect(spanTexts.some((t) => / ↔ /.test(t) && /· l = \d/.test(t))).toBe(true);
    // Napięcie znamionowe z katalogu (fixtura: voltage_rating_kv=20) przed
    // długością. S9-8: człon jest OZNACZONY („Un="), żeby nie dało się go
    // pomylić z napięciem pracy sieci — intencja asercji bez zmian.
    expect(spanTexts.some((t) => /· Un=\d+(?:,\d+)? kV · l = /.test(t))).toBe(true);
  });
});
