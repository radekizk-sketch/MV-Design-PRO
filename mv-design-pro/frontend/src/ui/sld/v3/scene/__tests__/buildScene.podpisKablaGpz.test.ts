/**
 * GPZ-MODEL — podpis kabla wychodzącego z GPZ nie leży na symbolach ani na
 * etykietach GPZ i nie jest odrzucany przez silnik etykiet (L2).
 *
 * DLACZEGO. Podpis przęsła GPZ→S0 (ciąg główny) i GPZ→odpływ (pole odpływowe)
 * jest centrowany na kawałku trasy, który zaczyna się w polu liniowym GPZ, więc
 * jego prostokąt wypada wewnątrz bloku GPZ, w wierszu podpisów nad osią szyny.
 * Od GPZ-MODEL (równoważnik 110 kV ⇒ transformator WN/SN z torem strony SN
 * tuż nad szyną SN) w tym wierszu stoją aparaty toru transformatora; podpis
 * trafiał na przekładnik i silnik etykiet odrzucał go (`label.declutter`) —
 * parametry kabla znikały z rysunku. Po scaleniu z GEOMETRIA-STACJI (pole TR bez
 * rekordu aparatów = jedna sylwetka „brak danych", niższa wieża TR) w ten sam
 * wiersz zeszła tabliczka transformatora — podpis trafiał na jej wiersze
 * „110/15 kV" i „uk 11 % · Pk 120 kW". Naprawa: `odsunPodpisOdElementowGpz`
 * (buildScene.ts) — przeszkodami są symbole I etykiety kompozycji GPZ.
 *
 * ILOCZYN CECH: {ciąg główny z GPZ, pole odpływowe GPZ} × {GPZ z równoważnikiem
 * 110 kV i jednym TR, GPZ z kilkoma TR (wieże), GPZ z równoważnikiem na szynach
 * SN bez TR} — każda fikstura ENM sceny z GPZ (cały katalog `fixtures/`),
 * sieć referencyjna 52 stacji i scena harnessu w trybie SN. Wyrocznia
 * niezależna od kodu produkcji: prostokąt podpisu z gotowej sceny ×
 * gabaryty symboli GPZ z `SYMBOL_DEFS` oraz × prostokąty etykiet GPZ z gotowej
 * sceny (ten sam predykat zachodzenia, otwarty).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';

const here = path.dirname(fileURLToPath(import.meta.url));
const katalogFikstur = path.join(here, 'fixtures');
const zrodla: ReadonlyArray<readonly [string, string]> = [
  ...readdirSync(katalogFikstur)
    .filter((f) => f.endsWith('.enm.json'))
    .sort()
    .map((f) => [f, path.join(katalogFikstur, f)] as const),
  ['sldSubstrate52s.enm.json', path.join(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json')],
  [
    'punkt_startu_gpz_z_zaciskami_wolne_kilka.json',
    path.join(here, '..', '..', '..', '..', '..', 'harness-fixtures', 'generated', 'punkt_startu_gpz_z_zaciskami_wolne_kilka.json'),
  ],
];

function wczytaj(plik: string): EnergyNetworkModel {
  const raw = JSON.parse(readFileSync(plik, 'utf8')) as Record<string, unknown>;
  return (raw.enm ?? raw.snapshot ?? raw) as EnergyNetworkModel;
}

const zachodzi = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const przypadki = zrodla
  .map(([nazwa, plik]) => ({ nazwa, enm: wczytaj(plik) }))
  .filter(({ enm }) => (enm.substations ?? []).some((s) => s.station_type === 'gpz'));

describe('GPZ-MODEL — podpis kabla wychodzącego z GPZ (L2)', () => {
  it('pokrycie: fikstury obejmują ciąg główny i pole odpływowe z GPZ oraz oba tryby równoważnika', () => {
    const nazwy = przypadki.map((p) => p.nazwa);
    expect(nazwy).toContain('gpzFeeder.enm.json');
    expect(nazwy).toContain('stacjaPolePomiarowe.enm.json');
    expect(nazwy).toContain('sldSubstrate52s.enm.json');
    expect(nazwy).toContain('punkt_startu_gpz_z_zaciskami_wolne_kilka.json');
    // Tryb A (TR WN/SN w GPZ) i tryb B (bez TR) — oba obecne w zbiorze.
    const zTr = przypadki.filter(({ enm }) => (enm.transformers ?? []).length > 0 && (enm.buses ?? []).some((b) => b.voltage_kv >= 60));
    const bezTr = przypadki.filter(({ enm }) => !(enm.buses ?? []).some((b) => b.voltage_kv >= 60));
    expect(zTr.length).toBeGreaterThan(0);
    expect(bezTr.length).toBeGreaterThan(0);
  });

  for (const { nazwa, enm } of przypadki) {
    it(`${nazwa}: podpis „GPZ ↔ …" nie leży na symbolu GPZ i nie został odrzucony`, () => {
      // Przedrostek tożsamości GPZ (`gpz/<ziarno>/`): ref stacji to `gpz/<ziarno>/substation`,
      // a aparaty, pola i źródło niosą `gpz/<ziarno>/…` w `ownerRef`/`testId`.
      const gpzRef = enm.substations!.find((s) => s.station_type === 'gpz')!.ref_id.replace(/substation$/, '');
      const scena = buildSceneV3(enm, 2);
      const symboleGpz = scena.symbols
        .filter((s) => (s.meta?.ownerRef ?? '').startsWith(gpzRef) || (s.meta?.testId ?? '').includes(gpzRef))
        .map((s) => ({ s, rect: { x: s.x, y: s.y, width: SYMBOL_DEFS[s.symbolId].width, height: SYMBOL_DEFS[s.symbolId].height } }));
      expect(symboleGpz.length).toBeGreaterThan(0);
      const podpisy = scena.labels.filter((l) => l.ownerKind === 'segment-span' && l.text.startsWith('GPZ ↔'));
      const etykietyGpz = scena.labels.filter((l) => l.ownerRef.startsWith(gpzRef));
      expect(etykietyGpz.length).toBeGreaterThan(0);
      for (const podpis of podpisy) {
        const kolizje = symboleGpz.filter(({ rect }) => zachodzi(podpis.rect, rect)).map(({ s }) => s.meta?.testId);
        expect(kolizje, `${podpis.text} @ ${JSON.stringify(podpis.rect)}`).toEqual([]);
        const kolizjeEtykiet = etykietyGpz.filter((l) => zachodzi(podpis.rect, l.rect)).map((l) => l.ownerRef);
        expect(kolizjeEtykiet, `${podpis.text} @ ${JSON.stringify(podpis.rect)}`).toEqual([]);
      }
      const odrzucenia = scena.meta.stopNotes.filter((n) => n.startsWith('label.declutter') && n.includes('segment-span:'));
      expect(odrzucenia).toEqual([]);
    });
  }

  it('gpzFeeder: oba kable z GPZ (ciąg główny i pole odpływowe) mają podpis na L2', () => {
    const { enm } = przypadki.find((p) => p.nazwa === 'gpzFeeder.enm.json')!;
    const podpisy = buildSceneV3(enm, 2).labels.filter((l) => l.ownerKind === 'segment-span' && l.text.startsWith('GPZ ↔'));
    expect(podpisy.map((l) => l.text.split(' · ')[0]).sort()).toEqual(['GPZ ↔ S01', 'GPZ ↔ S02']);
  });
});
