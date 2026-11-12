/**
 * Znacznik punktu zwarcia — NOŚNIK refu na jednej scenie (karta SLD-SKALA-I-NAWIGACJA, R1).
 *
 * KLASA DEFEKTU. Backend wskazuje punkt zwarcia refem STACJI (`stn/…/station`, fikstura
 * `falowniki_rozplyw_scena_gpz_feeder_wynik.json`) albo refem SZYNY modelu (`Bus.ref_id`);
 * kanał etykiet wynikowych — refem rysunkowym odcinka szyny (`${busRef}#sn-bus`). Dawniej
 * ref stacji trafiał WYŁĄCZNIE w zwinięty symbol stacji przeglądu, więc przy pełnym
 * szczególe znacznik ginął, a na jednej scenie (bez symbolu stacji) ginąłby zawsze.
 *
 * ILOCZYN CECH: rodzaj refu {symbol, odcinek toru, szyna modelu `#sn-bus`, szyna modelu
 * `busResultRef` (GPZ), stacja} × liczba sekcji stacji {1, ≥2} × skala — skala nie istnieje
 * w funkcji (scena jest jedna), co przypina osobny test determinizmu. Każda stacja
 * narysowana na DWÓCH sieciach referencyjnych ma znacznik; nośnik jest szyną SN dla stacji
 * jednosekcyjnej i nazwą stacji dla wielosekcyjnej (odmowa domysłu sekcji).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { computeFaultPointMarkerPlacement, computeFaultPointMarkerPlacements } from '../SldCanvasV3';

const here = dirname(fileURLToPath(import.meta.url));
const wczytaj = (sciezka: string): EnergyNetworkModel => {
  // Fikstury: `{ enm }` (podłoże 52 stacji) albo `{ snapshot }` (generator harnessu).
  const surowe = JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as {
    readonly enm?: EnergyNetworkModel;
    readonly snapshot?: EnergyNetworkModel;
  };
  const enm = surowe.enm ?? surowe.snapshot;
  if (!enm) throw new Error(`fikstura ${sciezka} bez enm/snapshot`);
  return enm;
};

const SIECI: readonly (readonly [string, string])[] = [
  ['referencyjna 52 stacje', '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'],
  ['stacje pięciu rodzajów (w tym sekcyjna)', '../../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json'],
  ['GPZ 110 kV z sekcjami', '../../../../../harness-fixtures/generated/geometria_stacji_gpz_110kv.json'],
];

function sekcjeStacji(scene: SceneV3, ref: string): string[] {
  return Object.entries(scene.meta.stacjaSzynySekcji)
    .filter(([, stacja]) => stacja === ref)
    .map(([szyna]) => szyna)
    .sort();
}

function srodekOdcinkaORefie(scene: SceneV3, ownerRef: string): { x: number; y: number } | null {
  const seg = scene.segments.find(
    (s) => s.meta?.elementKind !== 'protectionAnnotation' && s.meta?.ownerRef === ownerRef && s.points.length >= 2,
  );
  if (!seg) return null;
  let best = 0;
  let len = 0;
  for (let i = 0; i < seg.points.length - 1; i++) {
    const l = Math.abs(seg.points[i + 1].x - seg.points[i].x) + Math.abs(seg.points[i + 1].y - seg.points[i].y);
    if (l > len) {
      len = l;
      best = i;
    }
  }
  return {
    x: (seg.points[best].x + seg.points[best + 1].x) / 2,
    y: (seg.points[best].y + seg.points[best + 1].y) / 2,
  };
}

/** Pokrycie iloczynu sumowane po sieciach (każda komórka musi wystąpić co najmniej raz). */
const NOSNIKI = { naSzynie: 0, naNazwie: 0, szynySekcji: 0, szynyGpz: 0 };

describe.each(SIECI)('znacznik zwarcia — nośnik refu (%s)', (_nazwa, sciezka) => {
  const scene = buildSceneV3(wczytaj(sciezka));

  it('KAŻDA narysowana stacja ma znacznik; jednosekcyjna — na szynie SN, wielosekcyjna — na nazwie', () => {
    const stacje = scene.meta.drawnStationIds;
    if (stacje.length === 0) return; // sieć z samym GPZ — przypadek szyn GPZ niżej.
    let naSzynie = 0;
    let naNazwie = 0;
    for (const ref of stacje) {
      const p = computeFaultPointMarkerPlacement(scene, ref);
      expect(p, `stacja ${ref} bez znacznika`).not.toBeNull();
      expect(p!.ownerRef).toBe(ref);
      const sekcje = sekcjeStacji(scene, ref);
      const nosnik = sekcje.length === 1 ? `${sekcje[0]}#sn-bus` : `${ref}#sn-bus`;
      const szyna = sekcje.length <= 1 ? srodekOdcinkaORefie(scene, nosnik) : null;
      if (szyna) {
        expect({ x: p!.x, y: p!.y }).toEqual(szyna);
        naSzynie += 1;
      } else {
        const nazwa = scene.labels.find((l) => l.ownerRef === `${ref}#name-row-0`);
        expect(nazwa, `stacja ${ref} bez szyny i bez nazwy`).toBeTruthy();
        expect(p!.x).toBe(nazwa!.rect.x + nazwa!.rect.width / 2);
        expect(p!.y).toBe(nazwa!.rect.y + nazwa!.rect.height / 2);
        naNazwie += 1;
      }
    }
    expect(naSzynie + naNazwie).toBe(stacje.length);
    NOSNIKI.naSzynie += naSzynie;
    NOSNIKI.naNazwie += naNazwie;
  });

  it('ref SZYNY modelu (sekcja stacji, `${busRef}#sn-bus`) trafia w odcinek tej sekcji', () => {
    const szyny = Object.keys(scene.meta.stacjaSzynySekcji);
    let trafione = 0;
    for (const busRef of szyny) {
      const oczekiwany = srodekOdcinkaORefie(scene, `${busRef}#sn-bus`);
      if (!oczekiwany) continue;
      const p = computeFaultPointMarkerPlacement(scene, busRef);
      expect(p, busRef).not.toBeNull();
      expect({ x: p!.x, y: p!.y }).toEqual(oczekiwany);
      trafione += 1;
    }
    NOSNIKI.szynySekcji += trafione;
  });

  it('ref SZYNY modelu niesiony jako `busResultRef` (szyny GPZ) trafia w odcinek', () => {
    const odcinki = scene.segments.filter((s) => s.meta?.busResultRef);
    NOSNIKI.szynyGpz += odcinki.length;
    for (const s of odcinki) {
      const p = computeFaultPointMarkerPlacement(scene, s.meta!.busResultRef!);
      expect(p, s.meta!.busResultRef).not.toBeNull();
    }
  });

  it('ref rysunkowy odcinka i ref symbolu — trafienie wprost (pierwszeństwo przed regułami szyny/stacji)', () => {
    const odcinek = scene.segments.find((s) => s.meta?.elementKind !== 'protectionAnnotation' && s.meta?.ownerRef && s.points.length >= 2);
    expect(odcinek).toBeTruthy();
    const p = computeFaultPointMarkerPlacement(scene, odcinek!.meta!.ownerRef!);
    expect({ x: p!.x, y: p!.y }).toEqual(srodekOdcinkaORefie(scene, odcinek!.meta!.ownerRef!));
    const symbol = scene.symbols.find((s) => s.meta?.ownerRef);
    expect(computeFaultPointMarkerPlacement(scene, symbol!.meta!.ownerRef!)).not.toBeNull();
  });

  it('ref spoza sceny ⇒ brak znacznika; wynik deterministyczny (dwie budowy sceny)', () => {
    expect(computeFaultPointMarkerPlacement(scene, 'stn/nie-ma-takiej/station')).toBeNull();
    const refy = new Set(scene.meta.stationTraversalOrder);
    expect(computeFaultPointMarkerPlacements(buildSceneV3(wczytaj(sciezka)), refy)).toEqual(
      computeFaultPointMarkerPlacements(scene, refy),
    );
  });
});

describe('pokrycie iloczynu cech na sieciach testu', () => {
  it('wystąpiła stacja jednosekcyjna, wielosekcyjna, szyna sekcji stacji i szyna GPZ', () => {
    expect(NOSNIKI.naSzynie).toBeGreaterThan(0);
    expect(NOSNIKI.naNazwie).toBeGreaterThan(0);
    expect(NOSNIKI.szynySekcji).toBeGreaterThan(0);
    expect(NOSNIKI.szynyGpz).toBeGreaterThan(0);
  });
});
