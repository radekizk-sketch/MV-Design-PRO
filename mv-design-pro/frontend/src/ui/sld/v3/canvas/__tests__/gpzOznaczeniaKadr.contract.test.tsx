/**
 * Karta GPZ-H5-SLD etap 2 — wymagania 3, 5 i 7 w kadrze „Dopasuj widok" (render kanwy).
 *
 * Przyczyna (pomiar przed etapem 2): w kadrze 1000×700 układ wielotransformatorowy spadał do
 * glifu L0 — oznaczenia znikały (układ usunięty z produktu decyzją właściciela 2026-10-22); w kadrach
 * oznaczenia pól były skracane („Pole…A1", „Ł…1-2"), a nazwa odbioru znikała razem z jego
 * danymi (jeden podpis „Odbiór SN 1 · P · Q" był w całości danymi).
 *
 * Iloczyn cech: sieć {H5 2×2, równoważnik SN na dwóch sekcjach} × kadr {1400×800, 1000×700}. Wyrocznie:
 *  - GPZ rozwinięty (poziom szczegółu ≥ L1) — inaczej oznaczeń nie ma na czym sprawdzać;
 *  - KAŻDA etykieta tożsamości sceny narysowanego poziomu jest narysowana PEŁNYM tekstem
 *    (bez skrótu, bez porzucenia; `data-dropped-identity` = 0);
 *  - oznaczenia nadrzędne z MODELU są wśród narysowanych napisów: nazwy źródeł (L1/L2),
 *    oznaczenia TR, opisy sekcji 110 kV i SN, łączniki szyn, nazwy pól sekcji i odbiorów;
 *  - hierarchia „oznaczenie > dane": żadna tożsamość nie jest ukryta, gdy dane są ukryte;
 *  - najmniejszy glif ≥ `MIN_SYMBOL_SCREEN_PX`, najmniejsze pismo ≥ `MIN_READABLE_LABEL_SCREEN_PX`;
 *  - wymaganie 7: pole bez aparatu w modelu ma DOKŁADNIE jeden znak „?" (sylwetka
 *    `bayNoEquipment`) przy sobie — predykat parami ze stanem danych pola karty GPZ — i jedną
 *    zbiorczą informację w karcie GPZ (`tekstPolBezAparatuGpz`).
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { extractTransformerDesignation } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import { PROG_SKALI_L0_L1 } from '../../core/progiLod';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { tekstPolBezAparatuGpz } from '../../compose/gpzAdnotacje';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { MIN_SYMBOL_SCREEN_PX, SYMBOL_DEFS } from '../../symbols/defs';
import { SldCanvasV3 } from '../SldCanvasV3';

const FX = `${__dirname}/../../scene/__tests__/fixtures`;
const SIECI = ['gpzH5_2x2', 'gpzRownowaznikSn2'] as const;
const KADRY = [
  [1400, 800],
  [1000, 700],
] as const;

function wczytaj(nazwa: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(`${FX}/${nazwa}.enm.json`, 'utf8')) as { enm: EnergyNetworkModel }).enm;
}

/** Oznaczenia pól sekcji GPZ z rekordów modelu (pola rysowane z pasmem oznaczenia). */
function polaSekcjiZModelu(enm: EnergyNetworkModel): string[] {
  const gpz = (enm.substations ?? []).find((s) => (s.gpz_sections ?? []).length > 0)!;
  const sekcjeGpz = new Set([...(gpz.gpz_sections ?? []), ...(gpz.gpz_hv_sections ?? [])].map((s) => s.bus_ref));
  return (enm.bays ?? [])
    .filter((b) => b.substation_ref === gpz.ref_id && sekcjeGpz.has(b.bus_ref) && b.bay_role !== 'TR' && b.bay_role !== 'COUPLER')
    .map((b) => b.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
}

/** Oznaczenia nadrzędne wprost z rekordów modelu (nie z rysunku). */
function oznaczeniaZModelu(enm: EnergyNetworkModel): string[] {
  const gpz = (enm.substations ?? []).find((s) => (s.gpz_sections ?? []).length > 0)!;
  return [
    ...(enm.sources ?? []).map((s) => s.name),
    // Oznaczenie TR to jego numer z nazwy („TR1 110/15 kV" → „TR1"); przekładnia jest danymi
    // tabliczki (osobny wiersz), więc wyrocznią tożsamości jest samo oznaczenie.
    ...(enm.transformers ?? []).map((t, i) => extractTransformerDesignation(t.name, i)),
    ...[...(gpz.gpz_sections ?? []), ...(gpz.gpz_hv_sections ?? [])].map((s) => s.name),
    ...enm.branches.filter((b) => b.type === 'bus_coupler').map((b) => b.name),
    ...(enm.loads ?? []).map((l) => l.name),
    ...polaSekcjiZModelu(enm),
  ].filter((n): n is string => typeof n === 'string' && n.length > 0);
}

describe('GPZ w kadrze „Dopasuj widok" — oznaczenia nadrzędne pełne, glify czytelne', () => {
  for (const siec of SIECI) {
    const enm = wczytaj(siec);
    const wzorce = oznaczeniaZModelu(enm);
    it(`${siec}: model niesie oznaczenia nadrzędne (wyrocznia niepusta)`, () => {
      expect(wzorce.length).toBeGreaterThanOrEqual(8);
    });
    for (const [w, h] of KADRY) {
      it(`${siec} · ${w}×${h}`, () => {
        const { container } = render(<SldCanvasV3 snapshot={enm} width={w} height={h} />);
        const svg = container.querySelector('svg[viewBox]')!;
        const k = w / Number(svg.getAttribute('viewBox')!.split(/\s+/)[2]);
        const lod = Number(container.querySelector('[data-scene-lod]')!.getAttribute('data-scene-lod')) as SceneLod;
        expect(lod, `GPZ rozwinięty (skala ${k.toFixed(3)})`).toBeGreaterThanOrEqual(1);
        expect(container.querySelector('[data-dropped-identity]')?.getAttribute('data-dropped-identity') ?? '0').toBe('0');

        const narysowane = Array.from(container.querySelectorAll('g[data-testid^="sld-v3-label-"]')).map((g) => ({
          ownerRef: g.getAttribute('data-owner-ref') ?? '',
          rola: g.getAttribute('data-label-role'),
          tekst: g.querySelector('text')?.textContent ?? '',
          font: Number(g.querySelector('text')?.getAttribute('font-size') ?? 0),
        }));
        const teksty = new Set(narysowane.map((n) => n.tekst));
        for (const wzorzec of wzorce) {
          expect([...teksty].some((t) => t === wzorzec || t.startsWith(`${wzorzec} · `)), `oznaczenie „${wzorzec}" narysowane w całości`).toBe(true);
        }
        const scena = buildSceneV3(enm, lod);
        for (const etykieta of scena.labels.filter((l) => l.labelRole === 'tozsamosc')) {
          const wpis = narysowane.find((n) => n.ownerRef === etykieta.ownerRef && n.tekst === etykieta.text);
          expect(wpis, `tożsamość „${etykieta.text}" (${etykieta.ownerRef}) narysowana pełnym tekstem`).toBeDefined();
        }
        expect(narysowane.filter((n) => n.tekst.includes('…')), 'żaden napis nie jest skrócony').toEqual([]);
        for (const n of narysowane) {
          expect(n.font * k, `pismo „${n.tekst}" [px]`).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 1e-6);
        }
        const najmniejszyGlif = Math.min(
          ...scena.symbols.map((s) => Math.min(SYMBOL_DEFS[s.symbolId].width, SYMBOL_DEFS[s.symbolId].height)),
        );
        expect(najmniejszyGlif * k, 'najmniejszy glif [px]').toBeGreaterThanOrEqual(MIN_SYMBOL_SCREEN_PX);
      });
    }

    // Kadr NA PROGU rozwinięcia GPZ (skala tuż nad `PROG_SKALI_L0_L1`): tu kanwa powiększa
    // pismo oznaczeń do progu czytelności, więc pasmo oznaczenia pola musi mieścić napis
    // powiększony (`POWIEKSZENIE_T3_NA_PROGU_L1` w `compose/gpz.ts`) — w kadrach 1400×800
    // i 1000×700 skala jest wyższa i rezerwy pasma nie sprawdzają. Zakres wyroczni: oznaczenia
    // pól sekcji (pasma). Pomiar przy tym kadrze (2×2: 816×466): nazwa GPZ
    // w belce, nazwy źródeł („Sieć L1") i oznaczenie łącznika szyn („ŁS 1-2") są skracane
    // ze znakiem „…" — ich sloty są liczone pismem naturalnym; stan zgłoszony w meldunku.
    it(`${siec}: kadr na progu rozwinięcia GPZ — oznaczenia pól pełne`, () => {
      // NAJMNIEJSZY kadr (krok 16 px, proporcje 7:4), w którym kamera rozwija GPZ (L ≥ 1).
      let kadr: { w: number; h: number; container: HTMLElement } | null = null;
      for (let w = 480; w <= 1400 && kadr === null; w += 16) {
        const h = Math.round((w * 4) / 7);
        const r = render(<SldCanvasV3 snapshot={enm} width={w} height={h} />);
        if (Number(r.container.querySelector('[data-scene-lod]')!.getAttribute('data-scene-lod')) >= 1) kadr = { w, h, container: r.container };
        else r.unmount();
      }
      expect(kadr, 'istnieje kadr ≤ 1400 px z GPZ rozwiniętym').not.toBeNull();
      const { w, h, container } = kadr!;
      const skala = w / Number(container.querySelector('svg[viewBox]')!.getAttribute('viewBox')!.split(/\s+/)[2]);
      expect(skala, 'kadr leży przy progu rozwinięcia').toBeLessThan(PROG_SKALI_L0_L1 * 1.2);
      const lod = Number(container.querySelector('[data-scene-lod]')!.getAttribute('data-scene-lod'));
      expect(lod, `GPZ rozwinięty w kadrze ${w}×${h}`).toBeGreaterThanOrEqual(1);
      expect(container.querySelector('[data-dropped-identity]')?.getAttribute('data-dropped-identity') ?? '0').toBe('0');
      const teksty = Array.from(container.querySelectorAll('g[data-testid^="sld-v3-label-"] text')).map((t) => t.textContent ?? '');
      const pola = polaSekcjiZModelu(enm);
      expect(pola.length, 'model niesie pola sekcji').toBeGreaterThan(0);
      for (const wzorzec of pola) {
        expect(teksty.includes(wzorzec), `oznaczenie pola „${wzorzec}" narysowane w całości`).toBe(true);
      }
    });

    it(`${siec}: pole bez aparatu — jeden znak „?" przy polu i jedna zbiorcza informacja`, () => {
      const scena = buildSceneV3(enm, 2);
      const pola = scena.meta.gpzPola ?? [];
      const bezAparatu = pola.filter((p) => p.stanDanych === 'bez_aparatu').map((p) => p.bayRef).sort();
      expect(bezAparatu.length, 'fikstura ma pola bez aparatu').toBeGreaterThan(0);
      const znaki = scena.symbols.filter((s) => s.symbolId === 'bayNoEquipment').map((s) => s.meta?.ownerRef ?? '');
      expect([...znaki].sort(), 'znak „?" dokładnie przy polach bez aparatu, po jednym').toEqual(bezAparatu);
      expect(tekstPolBezAparatuGpz(pola)).toBe(
        `Pola bez aparatu w modelu: ${bezAparatu.length} z ${pola.length} — znak „?” przy oznaczeniu pola na schemacie`,
      );
      // Na schemacie nie ma drugiej reprezentacji tego stanu (dawny napis wiersza tabeli).
      expect(scena.labels.filter((l) => l.text.includes('bez aparatu'))).toEqual([]);
    });
  }
});
