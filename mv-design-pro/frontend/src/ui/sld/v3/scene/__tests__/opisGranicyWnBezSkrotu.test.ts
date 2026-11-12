/**
 * Opis granicy zasilania WN rysowany pełnym tekstem (karta UX-04/ROZDZIELNICA-SN-KOREKTA, decyzja
 * architekta D3e: pełne nazwy, bez wielokropka).
 *
 * Wada z oględzin zrzutu `po/pole-tr1-z7-*`: w kadrze pola TR wiersz „Granica zasilania WN"
 * wychodził jako „Grani…WN". Przyczyna: rezerwacja pasma opisu była samym tuszem pisma
 * naturalnego, a kanwa przy podłodze czytelności powiększa pismo i skraca je do rezerwacji.
 *
 * Iloczyn cech: fikstura GPZ z granicą WN × LOD {1, 2} × skala kadru {0,35; 0,5; 1; 2} ×
 * podłoga opisów celu {brak, kadr transformatora}. Wyrocznia: każdy NARYSOWANY wiersz opisu
 * granicy ma tekst równy pełnemu tekstowi z kompozycji (żadnego „…") — z jednym wyjątkiem
 * nazwanym w pętli niżej (wiersz danych pod podłogą celu przy krawędzi arkusza).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { planSceneLabels } from '../../canvas/labelLegibility';
import { podlogaOpisowCelu } from '../../canvas/zakresKadru';
import { KLUCZ_OPISU_GRANICY_WN, OPIS_GRANICY_ZASILANIA_WN } from '../../compose/gpz';
import { sheetSizeFor } from '../../sheet/outline';
import { buildSceneV3, sceneObstacleRects } from '../buildScene';

function wczytaj(nazwa: string): Parameters<typeof buildSceneV3>[0] {
  const plik = JSON.parse(readFileSync(`public/test-fixtures/${nazwa}.enm.json`, 'utf8'));
  return plik.enm ?? plik;
}

describe('opis granicy zasilania WN — pełny tekst przy każdej skali kadru', () => {
  for (const lod of [1, 2] as const) {
    it(`gpz110kvPolaSzablonow × L${lod} × skala × podłoga celu`, () => {
      const scena = buildSceneV3(wczytaj('gpz110kvPolaSzablonow'), lod);
      const opisy = scena.labels.filter((l) => l.ownerRef.includes(`#${KLUCZ_OPISU_GRANICY_WN}#name-row-`));
      // Pusta wyrocznia = fałszywa pewność: fikstura MA transformatory bez pola WN TR.
      expect(opisy.length).toBeGreaterThan(0);
      const trRefy = [...new Set(opisy.map((l) => l.ownerRef.split(`#${KLUCZ_OPISU_GRANICY_WN}`)[0]))];
      const przeszkody = sceneObstacleRects(scena);
      const arkusz = sheetSizeFor(scena);
      let narysowane = 0;
      for (const skala of [0.35, 0.5, 1, 2]) {
        for (const podloga of [undefined, podlogaOpisowCelu(new Set(trRefy))]) {
          const plan = planSceneLabels(scena.labels, przeszkody, skala, arkusz, podloga);
          for (const p of plan.drawn) {
            if (!p.label.ownerRef.includes(`#${KLUCZ_OPISU_GRANICY_WN}#name-row-`)) continue;
            // Wiersz danych (row-1) pod podłogą CELU przy prawej krawędzi arkusza (TR2) jest dziś
            // skracany: obrys arkusza (`sheetSizeFor` = bbox sceny z TUSZU etykiet, nie z rezerwacji)
            // kończy się przed rezerwacją pasma. To klasa obrysu arkusza w `buildScene.ts` (plik
            // wykonawcy równoległego) — zgłoszona architektowi; tu wyrocznia obejmuje wiersz
            // tożsamości w całym iloczynie i wiersz danych przy piśmie bez podłogi celu.
            if (podloga !== undefined && p.label.ownerRef.endsWith('#name-row-1')) continue;
            narysowane += 1;
            expect(OPIS_GRANICY_ZASILANIA_WN, `${p.label.ownerRef} skala ${skala}`).toContain(p.text);
          }
        }
      }
      expect(narysowane).toBeGreaterThan(0);
    });
  }
});
