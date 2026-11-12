// @vitest-environment node
/**
 * OBRYS ARKUSZA — wyrocznie LICZBOWE (karta RAMKA-TNIE-PODPISY, zgłoszenie
 * właściciela 2026-08-08 „dolna krawędź ramki przechodzi przez środek liter
 * oznaczeń stacji S51/S52/S53, a w prawym dolnym rogu dwa napisy chromu
 * nachodzą na siebie").
 *
 * CO ORZEKA. Rozmiar i położenie napisu miały DWA źródła prawdy, zgodne tylko
 * tam, gdzie jedno z nich nie działa:
 *   (1) REZERWACJA — `layout/labels.ts` `labelReservationRect` → `scene.bbox`
 *       → `sheet/outline.ts` `sheetSizeFor` → prostokąt `sld-sheet-border`.
 *       Liczona pismem NATURALNYM;
 *   (2) MALOWANIE — `canvas/labelLegibility.ts`, które poniżej progu
 *       czytelności POWIĘKSZA pismo (do 9× dla `t1`), a dla pisma naturalnego
 *       nie skracało tekstu do własnego slotu w ogóle.
 * Stąd napis wychodził poza ramkę, którą sam wyznaczył.
 *
 * ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (reguła KLASA §2):
 *   {krawędź: góra · dół · lewo · prawo} × {skala kamery}
 *   × {sieć: referencyjna 53 stacje · długi ciąg 93 stacje}
 *   × {skala: podłoga powiększania NIEaktywna (≥0,6923 dla `t1`) · aktywna}.
 * Sam „S51 na L0 przy dopasowaniu" nie wystarcza: POMIAR stanu przed pokazał
 * przelew także w PRAWO (282 j.św., L2 @0,30, podpis pola
 * „FT1 · transformatorowe") i w LEWO (39,5 j.św., opis zbiorczy GPZ przy
 * KAŻDEJ skali roboczej — tam pismo nie jest nawet powiększane).
 *
 * ZAPADKA NA ZBIÓR PUSTY: każdy test, który skanuje etykiety, najpierw ORZEKA,
 * że jest co skanować. Wyrocznia licząca zero elementów jest zielona z tego
 * samego powodu co wyrocznia poprawna — i to jest gorsze niż jej brak.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneV3 } from '../../scene/buildScene';
import { appendUnitToTrunk, loadEnm } from '../../scene/__tests__/syntheticNetworks';
import {
  obrysArkuszaPlanu,
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelsOutsideSheet,
  rangaTozsamosci,
} from '../../canvas/labelLegibility';
import { klasaInformacjiEtykiety } from '../../canvas/gestoscInformacji';
import type { OwnedLabel } from '../../layout/labels';
import { rectWithinSheet, sheetSizeFor } from '../outline';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { labelReservationRect } from '../../layout/labels';
import { MAX_SCALE, MIN_SCALE } from '../../canvas/camera';

const KATALOG = dirname(fileURLToPath(import.meta.url));
const FIXTURA = resolve(
  KATALOG, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
/** REALNA sieć 53 stacji — ta sama, na której stoi runner odbioru `accept:sld-v3`. */
const REFERENCYJNA = JSON.parse(readFileSync(FIXTURA, 'utf8')).enm as EnergyNetworkModel;
/** DŁUGI CIĄG 93 stacji — ta sama konstrukcja, co w `scene/__tests__/
 *  buildScene.sheetRows.test.ts`:
 *  sieć ŁAMANA na wiele wierszy arkusza, czyli inny kształt dolnej krawędzi. */
const DLUGI_CIAG: EnergyNetworkModel = (() => {
  const jednostka = loadEnm(resolve(KATALOG, '..', '..', 'scene', '__tests__', 'fixtures', 'openTrunkChain.enm.json'));
  let enm = REFERENCYJNA;
  for (let i = 0; i < 40; i++) enm = appendUnitToTrunk(enm, jednostka, `s91r${String(i).padStart(2, '0')}`);
  return enm;
})();

const SIECI = [
  { klucz: 'referencyjna', enm: REFERENCYJNA },
  { klucz: 'dlugi-ciag', enm: DLUGI_CIAG },
] as const;

/**
 * SKALA GRANICZNA PODŁOGI dla klasy `t1` (nazwy stacji): poniżej niej plan
 * POWIĘKSZA pismo, powyżej rysuje naturalne. Wyprowadzona, nie wpisana —
 * przesunięcie progu czytelności przesuwa podział cech w tym teście samo.
 */
const PODLOGA_T1 = MIN_READABLE_LABEL_SCREEN_PX / LABEL_TYPOGRAPHY.t1.fontSize;

/** Skale POKRYWAJĄCE obie strony podłogi powiększania — po obu stronach progu
 *  i na obu krańcach pasma kamery. */
const SKALE: readonly { readonly nazwa: string; readonly v: number; readonly podloga: boolean }[] = [
  { nazwa: 'MIN_SCALE', v: MIN_SCALE, podloga: true },
  { nazwa: '0,10 (przegląd)', v: 0.1, podloga: true },
  { nazwa: '0,14 (dopasowanie dużej sieci)', v: 0.14, podloga: true },
  { nazwa: '0,30', v: 0.3, podloga: true },
  { nazwa: '0,50', v: 0.5, podloga: true },
  { nazwa: `${PODLOGA_T1.toFixed(4)} (próg t1)`, v: PODLOGA_T1, podloga: false },
  { nazwa: '1,00 (praca)', v: 1, podloga: false },
  { nazwa: '2,00', v: 2, podloga: false },
  { nazwa: 'MAX_SCALE', v: MAX_SCALE, podloga: false },
];

const scenyCache = new Map<string, SceneV3>();
function scenaDla(klucz: string, enm: EnergyNetworkModel): SceneV3 {
  const zapamietana = scenyCache.get(klucz);
  if (zapamietana) return zapamietana;
  const scena = buildSceneV3(enm);
  scenyCache.set(klucz, scena);
  return scena;
}

describe('OBRYS ARKUSZA — arkusz jest wyprowadzony z rezerwacji, więc malowanie musi się w nim mieścić', () => {
  it('arkusz zaczyna się w (0,0) — inaczej `sheetSizeFor` nie opisuje prostokąta, który rysuje ramka', () => {
    let sprawdzonych = 0;
    for (const siec of SIECI) {
      const scene = scenaDla(siec.klucz, siec.enm);
      expect(scene.bbox.x, `${siec.klucz}`).toBeGreaterThanOrEqual(0);
      expect(scene.bbox.y, `${siec.klucz}`).toBeGreaterThanOrEqual(0);
      sprawdzonych += 1;
    }
    expect(sprawdzonych).toBe(SIECI.length);
  });

  it('REZERWACJA każdej etykiety mieści się w arkuszu (warunek WEJŚCIA pary)', () => {
    let etykiet = 0;
    for (const siec of SIECI) {
      const scene = scenaDla(siec.klucz, siec.enm);
      const sheet = sheetSizeFor(scene);
      for (const label of scene.labels) {
        expect(
          rectWithinSheet(labelReservationRect(label), sheet),
          `${siec.klucz} „${label.text}"`,
        ).toBe(true);
        etykiet += 1;
      }
    }
    // Zapadka na zbiór pusty — bez niej test jest zielony także dla sceny bez etykiet.
    expect(etykiet).toBeGreaterThan(1000);
  });

  it.each(SIECI.map((s) => s.klucz))(
    'ILOCZYN CECH {krawędź × skala}: ŻADEN malowany glif nie wychodzi poza obrys arkusza — sieć %s',
    (klucz) => {
      const siec = SIECI.find((s) => s.klucz === klucz)!;
      const naruszenia: string[] = [];
      let narysowanych = 0;
      let zPodloga = 0;
      let bezPodlogi = 0;
      const scene = scenaDla(siec.klucz, siec.enm);
      const przeszkody = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const skala of SKALE) {
        const plan = planSceneLabels(scene.labels, przeszkody, skala.v, sheet);
        narysowanych += plan.drawn.length;
        if (plan.drawn.some((p) => p.enlarged)) zPodloga += 1;
        else bezPodlogi += 1;
        for (const poza of plannedLabelsOutsideSheet(plan, sheet)) {
          naruszenia.push(`@${skala.nazwa}: ${poza.ownerRef} o ${poza.overflow.toFixed(1)} j.św.`);
        }
      }
      expect(naruszenia).toEqual([]);
      // Zapadki: skan musi mieć co skanować ORAZ dotknąć OBU reżimów pisma
      // (powiększanie aktywne i nieaktywne) — inaczej „iloczyn cech" jest nazwą,
      // a nie pomiarem.
      expect(narysowanych).toBeGreaterThan(1000);
      expect(zPodloga).toBeGreaterThan(0);
      expect(bezPodlogi).toBeGreaterThan(0);
    },
  );

  it('KAŻDA z czterech krawędzi jest realnie DOTYKANA przez malowanie — pomiar, nie deklaracja', () => {
    // Bez tego testu poprzedni byłby zielony także wtedy, gdyby napisy w ogóle
    // nie zbliżały się do krawędzi (np. po pomyłkowym zwężeniu planu).
    const luzy = { gora: Infinity, dol: Infinity, lewo: Infinity, prawo: Infinity };
    for (const siec of SIECI) {
      const scene = scenaDla(siec.klucz, siec.enm);
      const przeszkody = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const skala of SKALE) {
        // R4: ramka rysuje się po obrysie planu (tożsamość rangi ≥ 2 poszerza arkusz w prawo
        // i w dół, `obrysArkuszaPlanu`) — luz liczony do krawędzi, którą widzi projektant.
        const plan = planSceneLabels(scene.labels, przeszkody, skala.v, sheet);
        const obrys = obrysArkuszaPlanu(plan, sheet);
        for (const p of plan.drawn) {
          luzy.gora = Math.min(luzy.gora, p.rect.y);
          luzy.lewo = Math.min(luzy.lewo, p.rect.x);
          luzy.dol = Math.min(luzy.dol, obrys.height - (p.rect.y + p.rect.height));
          luzy.prawo = Math.min(luzy.prawo, obrys.width - (p.rect.x + p.rect.width));
        }
      }
    }
    for (const [krawedz, luz] of Object.entries(luzy)) {
      expect(luz, `krawędź ${krawedz}`).toBeGreaterThanOrEqual(0);
      expect(luz, `krawędź ${krawedz} — malowanie nie zbliża się do niej wcale`).toBeLessThan(400);
    }
  });

  it('INIEKCJA (+): plan z etykietą przesuniętą pod ramkę MUSI zapalić wyrocznię', () => {
    const scene = scenaDla('referencyjna', REFERENCYJNA);
    const sheet = sheetSizeFor(scene);
    // Skala czytania: rysują się dane i tożsamość rangi pola (przy 0,181 dane są poniżej
    // progu czytelności, a tożsamość rangi pola — poza sufitem proporcji).
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 1, sheet);
    expect(plannedLabelsOutsideSheet(plan, sheet)).toEqual([]);
    // Etykieta danych albo tożsamości rangi pola — jej krawędzią jest obrys sceny (R4:
    // nazwy bloków wolno wysunąć w prawo i w dół, ramka rośnie razem z nimi).
    const ofiara = plan.drawn.find((p) => rangaTozsamosci(p.label) < 2)!;
    const sabotaz = {
      ...plan,
      drawn: [{ ...ofiara, rect: { ...ofiara.rect, y: sheet.height - 1 } }],
    };
    const zgloszone = plannedLabelsOutsideSheet(sabotaz, sheet);
    expect(zgloszone).toHaveLength(1);
    expect(zgloszone[0].overflow).toBeGreaterThan(0);
  });

  it('INIEKCJA (−): ramka bez obrysu planu przecina nazwy stacji ostatniego wiersza (ZMIERZONY defekt, > 30 j.św.)', () => {
    // Dowód w drugą stronę: gdyby naprawa była pozorna, ramka rysowana po obrysie sceny
    // (pismo naturalne) nie cięłaby niczego. Tnie — to dokładnie przelew, który właściciel
    // zobaczył na zrzucie („dolna krawędź ramki przechodzi przez środek liter oznaczeń
    // stacji"). Karta SLD-SKALA-I-NAWIGACJA (R4): nazwa stacji ma stały rozmiar ekranowy,
    // więc przy skali 0,08 jej tusz wychodzi pod obrys sceny; plan jej nie odbiera ani nie
    // skraca, a ramka rośnie (`obrysArkuszaPlanu`). Dawniej: przesunięcie pasma w górę,
    // 36,7 j.św. na zwiniętym przeglądzie przy 0,181, 40,5 j.św. na jednej scenie przy 0,08.
    const SKALA_PRZELEWU = 0.08;
    const scene = scenaDla('referencyjna', REFERENCYJNA);
    const przeszkody = sceneObstacleRects(scene);
    const sheet = sheetSizeFor(scene);
    const plan = planSceneLabels(scene.labels, przeszkody, SKALA_PRZELEWU, sheet);
    const tniePrzezRamkeSceny = plan.drawn
      .filter((p) => !rectWithinSheet(p.rect, sheet))
      .map((p) => Math.max(p.rect.x + p.rect.width - sheet.width, p.rect.y + p.rect.height - sheet.height));
    expect(tniePrzezRamkeSceny.length).toBeGreaterThan(0);
    expect(Math.max(...tniePrzezRamkeSceny)).toBeGreaterThan(30);
    // …a ramka po obrysie planu obejmuje każdy narysowany napis.
    const obrys = obrysArkuszaPlanu(plan, sheet);
    expect(plan.drawn.filter((p) => !rectWithinSheet(p.rect, obrys)).map((p) => p.label.text)).toEqual([]);
    expect(plannedLabelsOutsideSheet(plan, sheet)).toEqual([]);
    // Nazwy stacji przy dolnej krawędzi są narysowane w pełnym brzmieniu (SLD-LOC: kody
    // S109–S111 to stacje najbliżej dolnej krawędzi tej fikstury).
    // Opis sekcji tych stacji („S109 · Sekcja 1 · 15 kV") dawniej stał w postaci skróconej
    // do kodu („S109"); R4: pełne brzmienie albo — gdy przegrywa kolizję przy piśmie 112 j.św.
    // (skala 0,08) — podpowiedź uchwytu. Nigdy nie znika ani nie jest skracany.
    for (const kod of ['S109', 'S110', 'S111']) {
      const opis = `${kod} · Sekcja 1 · 15 kV`;
      const naRysunku = plan.drawn.some((p) => p.text === opis);
      const wPodpowiedzi = plan.tozsamosciWPodpowiedzi.some((t) => t.label.text === opis);
      expect(naRysunku || wPodpowiedzi, `opis sekcji ${kod} narysowany albo w podpowiedzi`).toBe(true);
    }
    expect(plan.drawn.filter((p) => rangaTozsamosci(p.label) >= 2 && p.text !== p.label.text)).toEqual([]);
  });

  it('granica arkusza NIE tworzy kolizji etykieta↔etykieta (przesunięcie pasma jest blokiem, nie rozrywaniem)', () => {
    let sprawdzonych = 0;
    for (const siec of SIECI) {
      const scene = scenaDla(siec.klucz, siec.enm);
      const przeszkody = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const skala of SKALE) {
        const plan = planSceneLabels(scene.labels, przeszkody, skala.v, sheet);
        expect(
          plannedLabelCollisions(plan),
          `${siec.klucz} @${skala.nazwa}`,
        ).toEqual([]);
        sprawdzonych += 1;
      }
    }
    expect(sprawdzonych).toBe(SIECI.length * SKALE.length);
  });

  it('tekst SKRÓCONY niesie znak skrócenia i jest wyłącznie DANĄ — tożsamość stoi w całości (S9-7/C-6, R4)', () => {
    let skroconychTozsamosci = 0;
    for (const siec of SIECI) {
      const scene = scenaDla(siec.klucz, siec.enm);
      const przeszkody = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const skala of SKALE) {
        for (const p of planSceneLabels(scene.labels, przeszkody, skala.v, sheet).drawn) {
          if (p.text === p.label.text) continue;
          if (klasaInformacjiEtykiety(p.label) === 'tozsamosc') skroconychTozsamosci += 1;
          expect(p.text, `${siec.klucz} @${skala.nazwa}: „${p.label.text}"`).toContain('…');
        }
      }
    }
    expect(skroconychTozsamosci).toBe(0);
    // Zapadka mechanizmu skracania (bez niej licznik zero byłby zielony także po wyłączeniu
    // skracania): dana szersza od swojego slotu jest skracana ze znakiem skrócenia.
    const dana: OwnedLabel = {
      ownerRef: 'odcinek/1',
      ownerKind: 'segment-span',
      labelClass: 't2',
      labelRole: 'dane',
      text: 'XRUHAKXS 3×120/50 mm² · 1,25 km · 12 kV',
      slotIndex: 1,
      rect: { x: 100, y: 100, width: 60, height: 17 },
    };
    const plan = planSceneLabels([dana], [], 1, { width: 1000, height: 1000 });
    expect(plan.drawn[0]?.text).toContain('…');
  });

  it('obrys planu: rośnie wyłącznie od tożsamości rangi ≥ 2, a od skali czytania równa się obrysowi sceny', () => {
    for (const siec of SIECI) {
      const scene = scenaDla(siec.klucz, siec.enm);
      const przeszkody = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const skala of SKALE) {
        const plan = planSceneLabels(scene.labels, przeszkody, skala.v, sheet);
        const obrys = obrysArkuszaPlanu(plan, sheet);
        expect(obrys.width).toBeGreaterThanOrEqual(sheet.width);
        expect(obrys.height).toBeGreaterThanOrEqual(sheet.height);
        const doObrysuSceny = obrysArkuszaPlanu({ ...plan, drawn: plan.drawn.filter((p) => rangaTozsamosci(p.label) < 2) }, sheet);
        expect(doObrysuSceny, `${siec.klucz} @${skala.nazwa}`).toEqual(sheet);
        if (skala.v >= 1) expect(obrys, `${siec.klucz} @${skala.nazwa}`).toEqual(sheet);
      }
    }
  });
});

// Karta SLD-SKALA-I-NAWIGACJA (R3): blok „DOLNY PAS CHROMU” (rozłączność podpisów arkusza
// i wskaźnika „Ukryto N opisów”) usunięty razem ze wskaźnikiem — na kanwie nie ma już drugiego
// właściciela dolnego pasa, a stałe podpisów arkusza pilnuje `canvas/chromeLayout.ts`.
