/**
 * Karta GPZ-H5-SLD etap 2 — wachlarz zejść zwiniętego GPZ na L0 jest PŁASKI.
 *
 * Przyczyna (pomiar przed regułą, fikstura `gpzProtectionDataPath`, L0): poziomy wachlarza
 * szły wg kolejności pól modelu, więc poziom pola dalszego od osi (y 344 do x 928) przecinał
 * pion pola bliższego (x 544, y 328…432) — skrzyżowanie dwóch zejść tego samego bloku,
 * dotąd ukryte pod fałszywą kropką odczepu T. Reguła (`composeCollapsedGpz`): poziom
 * wachlarza maleje z odległością portu pola od osi bloku.
 *
 * Iloczyn cech: fikstura {GPZ z feederem, GPZ z zabezpieczeniami (pola po obu stronach
 * osi), H5 2×2, H5 z równoważnikiem SN, sieć referencyjna 53 stacji} × L0.
 * Wyrocznie na samych zejściach `#descent` bloku (tor od bloku do portu pola):
 *  - zero przecięć wnętrz (pion jednego zejścia × poziom innego);
 *  - zero współliniowych nakładek poziomów dwóch zejść (ten sam poziom, wspólny odcinek x);
 *  - każdy poziom wachlarza leży pod dolną krawędzią bloku `gpzCollapsed`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3 } from '../buildScene';
import { interiorCrossings } from '../crossings';

const here = dirname(fileURLToPath(import.meta.url));
const FIKSTURY: Readonly<Record<string, string>> = {
  gpzFeeder: resolve(here, 'fixtures', 'gpzFeeder.enm.json'),
  gpzProtectionDataPath: resolve(here, 'fixtures', 'gpzProtectionDataPath.enm.json'),
  gpzH5_2x2: resolve(here, 'fixtures', 'gpzH5_2x2.enm.json'),
  gpzRownowaznikSn2: resolve(here, 'fixtures', 'gpzRownowaznikSn2.enm.json'),
  sldSubstrate52s: resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
};

describe('GPZ zwinięty (L0) — wachlarz zejść płaski', () => {
  for (const [nazwa, sciezka] of Object.entries(FIKSTURY)) {
    it(nazwa, () => {
      const enm = (JSON.parse(readFileSync(sciezka, 'utf8')) as { enm: EnergyNetworkModel }).enm;
      const scena = buildSceneV3(enm, 0);
      const blok = scena.symbols.find((s) => s.symbolId === 'gpzCollapsed');
      expect(blok, 'blok GPZ zwinięty narysowany').toBeDefined();
      const dolBloku = blok!.y + SYMBOL_DEFS.gpzCollapsed.height;
      const zejscia = scena.segments.filter((s) => String(s.meta?.ownerRef ?? '').endsWith('#descent'));
      expect(zejscia.length, 'blok ma zejścia pól').toBeGreaterThan(0);

      expect(interiorCrossings(zejscia), 'zejścia bloku bez przecięć').toEqual([]);

      const poziomy = zejscia.flatMap((s) =>
        s.points.slice(1).flatMap((b, i) => {
          const a = s.points[i];
          return a.y === b.y && a.x !== b.x ? [{ ref: s.meta?.ownerRef, y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x) }] : [];
        }),
      );
      for (const p of poziomy) expect(p.y, `poziom ${p.ref} pod blokiem`).toBeGreaterThan(dolBloku);
      for (let i = 0; i < poziomy.length; i++) {
        for (let j = i + 1; j < poziomy.length; j++) {
          const [p, q] = [poziomy[i], poziomy[j]];
          const nakladka = p.y === q.y && Math.min(p.x2, q.x2) > Math.max(p.x1, q.x1);
          expect(nakladka, `poziomy ${p.ref} i ${q.ref} nie nakładają się (y ${p.y})`).toBe(false);
        }
      }
    });
  }
});
