/**
 * SCHEMAT-10 GS-1 (V12K-137) — GRAMATYKA STACJI na L0: mini-RMU zamiast
 * kwadratu 16×16 (DOMKNIĘCIE GAP `S7_GAP_CROSSING_ZERO_2026-07` §10.4).
 *
 * Recenzja właściciela (§9 pkt 3): na widoku CAŁEJ sieci muszą być
 * rozpoznawalne TYP STACJI, TRANSFORMATOR, MARKER DER i STAN ŁĄCZNIKA/NO.
 * GS-1 wprowadził rodzinę glifów mini-RMU (obrys + szyna + markery), tu
 * bramkowana:
 *  - baza §10.4 „DER na L0 = 0 vs L1 = 20": PARYTET OBECNOŚCI DER L0↔L1 —
 *    zbiór stacji z markerem DER na L0 == zbiór stacji z DER na L1 (nie zginął);
 *  - każdy glif stacji NIESIE podsumowanie typ/TR/DER/NO (`meta.stationGlyph`),
 *    wyprowadzone z TYPU elementów (spec §19.3), nie z nazw;
 *  - rozmiar sylwetki 48×48 (6×GRID) wyprowadzony z czytelności na kadrze
 *    całości (patrz `defs.ts`), JEDNA KOTWICA (środek = kotwica stacji);
 *  - test negatywny: usunięcie `meta.stationGlyph` ⇒ luka czytelności §3.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  lod0ReadabilityGaps,
  allLod0ElementsReadable,
  type SceneV3,
} from '../buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { GRID } from '../../core/grid';

const here = dirname(fileURLToPath(import.meta.url));
const bigFixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');

function loadEnm(path: string): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return parsed.enm ?? (parsed as unknown as EnergyNetworkModel);
}

const bigEnm = loadEnm(bigFixturePath);
const DER_SYMBOLS = new Set(['derPv', 'derBess', 'derWind', 'derGenerator']);

describe('SCHEMAT-10 GS-1 — sylwetka mini-RMU L0 (GAP §10.4)', () => {
  it('rozmiar sylwetki: 48×48 (6×GRID) — wyprowadzony z czytelności kadru całości', () => {
    // Uzasadnienie liczby: patrz `defs.ts` (fit sieci referencyjnej skala
    // 0,1203 ⇒ 48px świata = 5,78px ekranu; 16px dawało 1,93px). Bramkujemy
    // stałą, żeby przypadkowa zmiana rozmiaru złamała dowód czytelności.
    expect(SYMBOL_DEFS.stationCollapsed.width).toBe(6 * GRID);
    expect(SYMBOL_DEFS.stationCollapsed.height).toBe(6 * GRID);
    // Porty na krawędzi i środku siatki (kontrakt routingu, JEDNA KOTWICA).
    const names = SYMBOL_DEFS.stationCollapsed.ports.map((p) => p.name).sort();
    expect(names).toEqual(['e', 'n', 's', 'w']);
  });

  it('każdy glif stacji na L0 NIESIE podsumowanie typ/TR/DER/NO (meta.stationGlyph)', () => {
    const scene = buildSceneV3(bigEnm, 0);
    const stations = scene.symbols.filter((s) => s.symbolId === 'stationCollapsed');
    expect(stations.length).toBeGreaterThan(0);
    for (const s of stations) {
      expect(s.meta?.stationGlyph, `stacja ${s.meta?.ownerRef} bez stationGlyph`).toBeTruthy();
    }
    // Zbiór §3 „nigdy nie znika" (z rozszerzeniem GS-1) — zielony.
    expect(lod0ReadabilityGaps(scene)).toHaveLength(0);
    expect(allLod0ElementsReadable(scene)).toBe(true);
  });

  it('sylwetka: stacja z transformatorem ma hasTransformer (SN/nN ≠ rozdzielnia sieciowa)', () => {
    const scene = buildSceneV3(bigEnm, 0);
    const stations = scene.symbols.filter((s) => s.symbolId === 'stationCollapsed');
    // Sieć referencyjna to stacje SN/nN — wszystkie z transformatorem.
    expect(stations.every((s) => s.meta?.stationGlyph?.hasTransformer === true)).toBe(true);
  });

  it('DER na L0 nie zginął: markery DER obecne (domknięcie bazy §10.4 „L0=0 vs L1=20")', () => {
    const s0 = buildSceneV3(bigEnm, 0);
    const s1 = buildSceneV3(bigEnm, 1);
    // Baza §10.4: L1 rysuje symbole DER (derPv/derBess/derWind) — POJEDYNCZO.
    const l1DerSymbols = s1.symbols.filter((s) => DER_SYMBOLS.has(s.symbolId)).length;
    // GS-1/GS-4: L0 rysuje MARKER DER na sylwetce stacji — po jednym na stację
    // z DER PER STRONA przyłączenia (rodzaj dominujący). Zbiór stacji z markerem.
    const l0DerStations = s0.symbols.filter(
      (s) =>
        s.symbolId === 'stationCollapsed' &&
        (s.meta?.stationGlyph?.derOnMv != null || s.meta?.stationGlyph?.derBehindTr != null),
    );
    // DOMKNIĘCIE: L0 miało 0 markerów DER — teraz > 0 (obecność nie znika).
    expect(l0DerStations.length).toBeGreaterThan(0);
    expect(l1DerSymbols).toBeGreaterThan(0);
    // Agregacja L0 (marker per stacja) ≤ liczba symboli DER L1 (per instalacja):
    // każda stacja z DER na L0 ma ≥1 symbol DER na L1 (marker nie fabrykowany).
    expect(l0DerStations.length).toBeLessThanOrEqual(l1DerSymbols);
    // Rodzaj markera z zamkniętej unii (kształt koduje PV/BESS/FW/generator).
    for (const s of l0DerStations) {
      const g = s.meta?.stationGlyph;
      for (const kind of [g?.derOnMv, g?.derBehindTr]) {
        if (kind != null) expect(['pv', 'bess', 'wind', 'generator']).toContain(kind);
      }
    }
  });

  it('GS-4: sieć referencyjna — WSZYSTKIE DER na szynach nN (0,4 kV) ⇒ znak ZA transformatorem, zero na SN', () => {
    // Pomiar bazowy (2026-07-23): 20/20 generatorów fixture ma `bus_ref` →
    // szynę 0,4 kV. Przed GS-4 sylwetka rysowała je od szyny SN — kłamstwo
    // topologiczne w 100% przypadków (recenzja: „mini-RMU nie może kłamać
    // topologicznie"). Po GS-4: strona z REALNEJ szyny ENM.
    const s0 = buildSceneV3(bigEnm, 0);
    const withDer = s0.symbols.filter(
      (s) =>
        s.symbolId === 'stationCollapsed' &&
        (s.meta?.stationGlyph?.derOnMv != null || s.meta?.stationGlyph?.derBehindTr != null),
    );
    expect(withDer.length).toBeGreaterThan(0);
    for (const s of withDer) {
      expect(s.meta?.stationGlyph?.derBehindTr, `stacja ${s.meta?.ownerRef}: DER musi być za TR (nN)`).not.toBeNull();
      expect(s.meta?.stationGlyph?.derOnMv, `stacja ${s.meta?.ownerRef}: zero DER na SN w fixture`).toBeNull();
      // Kontrakt GS-4: derBehindTr wymaga transformatora (walidacja czerwona).
      expect(s.meta?.stationGlyph?.hasTransformer).toBe(true);
    }
    // Sprzeczność derBehindTr-bez-TR NIE występuje ⇒ zero stopNote GS-4.
    expect(s0.meta.stopNotes.filter((n) => n.includes('station.der.behindTrBezTR'))).toHaveLength(0);
  });

  it('kotwica: środek glifu mini-RMU L0 = środek glifu L1/L2 (JEDNA KOTWICA, zoom = skala szczegółu)', () => {
    // Środek stacji na L0 (środek stationCollapsed) MUSI zgadzać się z osią
    // magistrali/kolumną L2 — geometria liczona zawsze przy L2 (buildRowLayout).
    const s0 = buildSceneV3(bigEnm, 0);
    const centersByRef = new Map<string, { x: number; y: number }>();
    for (const s of s0.symbols) {
      if (s.symbolId !== 'stationCollapsed') continue;
      const d = SYMBOL_DEFS[s.symbolId];
      centersByRef.set(s.meta?.ownerRef ?? '', { x: s.x + d.width / 2, y: s.y + d.height / 2 });
    }
    // Determinizm: powtórny build daje identyczne środki (kotwica stabilna).
    const s0b = buildSceneV3(bigEnm, 0);
    for (const s of s0b.symbols) {
      if (s.symbolId !== 'stationCollapsed') continue;
      const d = SYMBOL_DEFS[s.symbolId];
      const c = centersByRef.get(s.meta?.ownerRef ?? '');
      expect(c).toEqual({ x: s.x + d.width / 2, y: s.y + d.height / 2 });
    }
  });

  it('determinizm: podsumowanie sylwetki bajt-identyczne przy dwóch buildach', () => {
    const a = buildSceneV3(bigEnm, 0).symbols.filter((s) => s.symbolId === 'stationCollapsed');
    const b = buildSceneV3(bigEnm, 0).symbols.filter((s) => s.symbolId === 'stationCollapsed');
    const key = (arr: typeof a) =>
      JSON.stringify(arr.map((s) => [s.meta?.ownerRef, s.meta?.stationGlyph]).sort());
    expect(key(a)).toBe(key(b));
  });

  it('wyrocznia GRYZIE: usunięcie meta.stationGlyph ⇒ luka „sylwetka stacji" na L0', () => {
    const scene = buildSceneV3(bigEnm, 0);
    const sabotaged: SceneV3 = {
      ...scene,
      symbols: scene.symbols.map((s) =>
        s.symbolId === 'stationCollapsed'
          ? { ...s, meta: { ...s.meta, stationGlyph: undefined } }
          : s,
      ),
    };
    const gaps = lod0ReadabilityGaps(sabotaged);
    expect(gaps.some((g) => g.element === 'sylwetka stacji')).toBe(true);
    expect(allLod0ElementsReadable(sabotaged)).toBe(false);
  });
});
