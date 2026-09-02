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
 *   {krawędź: góra · dół · lewo · prawo} × {LOD 0/1/2}
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
import { buildSceneV3, sceneObstacleRects, SCENE_LOD_LABELS_PL, type SceneLod, type SceneV3 } from '../../scene/buildScene';
import { appendUnitToTrunk, loadEnm } from '../../scene/__tests__/syntheticNetworks';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelsOutsideSheet,
} from '../../canvas/labelLegibility';
import {
  chromeCaptionCollisions,
  hiddenLabelsHintPlateRect,
  hiddenLabelsHintScreenRect,
  hiddenLabelsHintText,
  sheetCaptionScreenRects,
  zachodza,
  HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX,
  HIDDEN_LABELS_HINT_PLATE_PADDING_Y_PX,
} from '../../canvas/chromeLayout';
import { rectWithinSheet, sheetSizeFor } from '../outline';
import { FRAME_MARGIN } from '../Frame';
import {
  LABEL_TYPOGRAPHY,
  measureTextWidth,
  MIN_READABLE_LABEL_SCREEN_PX,
  screenFixedFontSize,
} from '../../core/text';
import { labelReservationRect } from '../../layout/labels';
import {
  boundingBoxOfRect,
  computeInitialCameraState,
  MAX_SCALE,
  MIN_SCALE,
  type BoundingBox,
} from '../../canvas/camera';
import { SLD_CANVAS_DOCK_INSETS } from '../../canvas/toolbarLayout';
import { contentBoundingBoxOf, sceneBoxToCameraWorld } from '../../canvas/SldCanvasV3';

const KATALOG = dirname(fileURLToPath(import.meta.url));
const FIXTURA = resolve(
  KATALOG, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
/** REALNA sieć 53 stacji — ta sama, na której stoi runner odbioru `accept:sld-v3`. */
const REFERENCYJNA = JSON.parse(readFileSync(FIXTURA, 'utf8')).enm as EnergyNetworkModel;
/** DŁUGI CIĄG 93 stacji — ta sama konstrukcja, co w `scene/__tests__/
 *  buildScene.sheetRows.test.ts` i `scripts/render_s9_7_8_typografia.tsx`:
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
const LODY: readonly SceneLod[] = [0, 1, 2];

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
function scenaDla(klucz: string, enm: EnergyNetworkModel, lod: SceneLod): SceneV3 {
  const k = `${klucz}#${lod}`;
  const zapamietana = scenyCache.get(k);
  if (zapamietana) return zapamietana;
  const scena = buildSceneV3(enm, lod);
  scenyCache.set(k, scena);
  return scena;
}

describe('OBRYS ARKUSZA — arkusz jest wyprowadzony z rezerwacji, więc malowanie musi się w nim mieścić', () => {
  it('arkusz zaczyna się w (0,0) — inaczej `sheetSizeFor` nie opisuje prostokąta, który rysuje ramka', () => {
    let sprawdzonych = 0;
    for (const siec of SIECI) {
      for (const lod of LODY) {
        const scene = scenaDla(siec.klucz, siec.enm, lod);
        expect(scene.bbox.x, `${siec.klucz} L${lod}`).toBeGreaterThanOrEqual(0);
        expect(scene.bbox.y, `${siec.klucz} L${lod}`).toBeGreaterThanOrEqual(0);
        sprawdzonych += 1;
      }
    }
    expect(sprawdzonych).toBe(SIECI.length * LODY.length);
  });

  it('REZERWACJA każdej etykiety mieści się w arkuszu (warunek WEJŚCIA pary)', () => {
    let etykiet = 0;
    for (const siec of SIECI) {
      for (const lod of LODY) {
        const scene = scenaDla(siec.klucz, siec.enm, lod);
        const sheet = sheetSizeFor(scene);
        for (const label of scene.labels) {
          expect(
            rectWithinSheet(labelReservationRect(label), sheet),
            `${siec.klucz} L${lod} „${label.text}"`,
          ).toBe(true);
          etykiet += 1;
        }
      }
    }
    // Zapadka na zbiór pusty — bez niej test jest zielony także dla sceny bez etykiet.
    expect(etykiet).toBeGreaterThan(1000);
  });

  it.each(SIECI.map((s) => s.klucz))(
    'ILOCZYN CECH {krawędź × LOD × skala}: ŻADEN malowany glif nie wychodzi poza obrys arkusza — sieć %s',
    (klucz) => {
      const siec = SIECI.find((s) => s.klucz === klucz)!;
      const naruszenia: string[] = [];
      let narysowanych = 0;
      let zPodloga = 0;
      let bezPodlogi = 0;
      for (const lod of LODY) {
        const scene = scenaDla(siec.klucz, siec.enm, lod);
        const przeszkody = sceneObstacleRects(scene);
        const sheet = sheetSizeFor(scene);
        for (const skala of SKALE) {
          const plan = planSceneLabels(scene.labels, przeszkody, skala.v, sheet);
          narysowanych += plan.drawn.length;
          if (plan.drawn.some((p) => p.enlarged)) zPodloga += 1;
          else bezPodlogi += 1;
          for (const poza of plannedLabelsOutsideSheet(plan, sheet)) {
            naruszenia.push(`L${lod} @${skala.nazwa}: ${poza.ownerRef} o ${poza.overflow.toFixed(1)} j.św.`);
          }
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
      for (const lod of LODY) {
        const scene = scenaDla(siec.klucz, siec.enm, lod);
        const przeszkody = sceneObstacleRects(scene);
        const sheet = sheetSizeFor(scene);
        for (const skala of SKALE) {
          for (const p of planSceneLabels(scene.labels, przeszkody, skala.v, sheet).drawn) {
            luzy.gora = Math.min(luzy.gora, p.rect.y);
            luzy.lewo = Math.min(luzy.lewo, p.rect.x);
            luzy.dol = Math.min(luzy.dol, sheet.height - (p.rect.y + p.rect.height));
            luzy.prawo = Math.min(luzy.prawo, sheet.width - (p.rect.x + p.rect.width));
          }
        }
      }
    }
    for (const [krawedz, luz] of Object.entries(luzy)) {
      expect(luz, `krawędź ${krawedz}`).toBeGreaterThanOrEqual(0);
      expect(luz, `krawędź ${krawedz} — malowanie nie zbliża się do niej wcale`).toBeLessThan(400);
    }
  });

  it('INIEKCJA (+): plan z etykietą przesuniętą pod ramkę MUSI zapalić wyrocznię', () => {
    const scene = scenaDla('referencyjna', REFERENCYJNA, 0);
    const sheet = sheetSizeFor(scene);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 0.181, sheet);
    expect(plannedLabelsOutsideSheet(plan, sheet)).toEqual([]);
    const sabotaz = {
      ...plan,
      drawn: [{ ...plan.drawn[0], rect: { ...plan.drawn[0].rect, y: sheet.height - 1 } }],
    };
    const zgloszone = plannedLabelsOutsideSheet(sabotaz, sheet);
    expect(zgloszone).toHaveLength(1);
    expect(zgloszone[0].overflow).toBeGreaterThan(0);
  });

  it('INIEKCJA (−): usunięcie granicy arkusza z planu przywraca ZMIERZONY defekt (36,7 j.św. pod ramką)', () => {
    // Dowód w drugą stronę: gdyby naprawa była pozorna (np. defekt zniknął
    // przez przypadek, a nie przez granicę), plan liczony z arkuszem
    // NIESKOŃCZONYM dałby ten sam wynik. Daje inny — i to jest dokładnie ten
    // przelew, który właściciel zobaczył na zrzucie.
    const scene = scenaDla('referencyjna', REFERENCYJNA, 0);
    const przeszkody = sceneObstacleRects(scene);
    const sheet = sheetSizeFor(scene);
    const bezGranicy = planSceneLabels(scene.labels, przeszkody, 0.181, {
      width: Number.MAX_SAFE_INTEGER,
      height: Number.MAX_SAFE_INTEGER,
    });
    const przelewy = plannedLabelsOutsideSheet(bezGranicy, sheet);
    expect(przelewy.length).toBeGreaterThan(0);
    expect(Math.max(...przelewy.map((p) => p.overflow))).toBeGreaterThan(30);

    // …a z granicą tych samych etykiet NIE ubywa: tożsamość stacji ostatniego
    // wiersza jest PRZESUNIĘTA, nie porzucona (kanon KD-11).
    const zGranica = planSceneLabels(scene.labels, przeszkody, 0.181, sheet);
    expect(plannedLabelsOutsideSheet(zGranica, sheet)).toEqual([]);
    expect(zGranica.drawn.length).toBe(bezGranicy.drawn.length);
    expect(zGranica.droppedIdentity.length).toBe(bezGranicy.droppedIdentity.length);
    for (const kod of ['S51', 'S52', 'S53']) {
      expect(zGranica.drawn.some((p) => p.text === kod), `nazwa ${kod} musi zostać narysowana`).toBe(true);
    }
  });

  it('granica arkusza NIE tworzy kolizji etykieta↔etykieta (przesunięcie pasma jest blokiem, nie rozrywaniem)', () => {
    let sprawdzonych = 0;
    for (const siec of SIECI) {
      for (const lod of LODY) {
        const scene = scenaDla(siec.klucz, siec.enm, lod);
        const przeszkody = sceneObstacleRects(scene);
        const sheet = sheetSizeFor(scene);
        for (const skala of SKALE) {
          const plan = planSceneLabels(scene.labels, przeszkody, skala.v, sheet);
          expect(
            plannedLabelCollisions(plan),
            `${siec.klucz} L${lod} @${skala.nazwa}`,
          ).toEqual([]);
          sprawdzonych += 1;
        }
      }
    }
    expect(sprawdzonych).toBe(SIECI.length * LODY.length * SKALE.length);
  });

  it('tekst SKRÓCONY do slotu niesie znak skrócenia — skrót bez znaku udaje kompletną daną (S9-7/C-6)', () => {
    let skroconych = 0;
    for (const siec of SIECI) {
      for (const lod of LODY) {
        const scene = scenaDla(siec.klucz, siec.enm, lod);
        const przeszkody = sceneObstacleRects(scene);
        const sheet = sheetSizeFor(scene);
        for (const skala of SKALE) {
          for (const p of planSceneLabels(scene.labels, przeszkody, skala.v, sheet).drawn) {
            if (p.text === p.label.text) continue;
            skroconych += 1;
            expect(p.text, `${siec.klucz} L${lod} @${skala.nazwa}: „${p.label.text}"`).toContain('…');
          }
        }
      }
    }
    // Zapadka: gdyby skracanie przestało działać, licznik byłby zerowy, a test
    // zielony — dokładnie ten rodzaj fałszywej pewności zamyka reguła KLASA §4.
    expect(skroconych).toBeGreaterThan(0);
  });
});

describe('DOLNY PAS CHROMU — podpisy arkusza i wskaźnik ekranowy są rozłączne z konstrukcji', () => {
  const KADRY = [
    { width: 1400, height: 900 },
    { width: 1800, height: 1100 },
    { width: 1322, height: 696 },
    { width: 2000, height: 1180 },
  ] as const;
  const MNOZNIKI = [0.5, 1, 2, 5] as const;
  const METRYKA = { measure: measureTextWidth };

  function ukladDla(
    scene: SceneV3,
    sceny: Readonly<Record<SceneLod, SceneV3>>,
    lod: SceneLod,
    kadr: { readonly width: number; readonly height: number },
    mnoznik: number,
    liczbaUkrytych: number,
  ) {
    const lodBboxes: Record<SceneLod, BoundingBox> = {
      0: boundingBoxOfRect(sceny[0].bbox),
      1: boundingBoxOfRect(sceny[1].bbox),
      2: boundingBoxOfRect(sceny[2].bbox),
    };
    const cel = sceneBoxToCameraWorld(contentBoundingBoxOf(scene) ?? lodBboxes[lod]);
    const fit = computeInitialCameraState(cel, kadr, lodBboxes, null, SLD_CANVAS_DOCK_INSETS);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit.transform.scale * mnoznik));
    const camera = { ...fit.transform, scale };
    const sheet = sheetSizeFor(scene);
    const captions = sheetCaptionScreenRects(
      {
        sheet,
        frameMargin: FRAME_MARGIN,
        camera,
        captionFontPx: screenFixedFontSize('t2', scale) * scale,
        scaleLabel: 'wg kamery',
        lodLabel: SCENE_LOD_LABELS_PL[lod],
      },
      METRYKA,
    );
    const hint = hiddenLabelsHintScreenRect(kadr, hiddenLabelsHintText(liczbaUkrytych), captions, METRYKA);
    return { aparat: captions, hint };
  }

  it('ILOCZYN {kadr × LOD × zoom}: zero kolizji „Skala …" × „Widok: …" × „Ukryto N opisów"', () => {
    const sceny: Record<SceneLod, SceneV3> = {
      0: scenaDla('referencyjna', REFERENCYJNA, 0),
      1: scenaDla('referencyjna', REFERENCYJNA, 1),
      2: scenaDla('referencyjna', REFERENCYJNA, 2),
    };
    const kolizje: string[] = [];
    let ukladow = 0;
    for (const kadr of KADRY) {
      for (const lod of LODY) {
        for (const mnoznik of MNOZNIKI) {
          const { aparat, hint } = ukladDla(sceny[lod], sceny, lod, kadr, mnoznik, 1);
          // Dolny aparat arkusza = KRAWĘDŹ RAMKI + oba podpisy. Krawędź jest w
          // tym zbiorze dlatego, że napis przecięty linią ramki jest tak samo
          // nieczytelny jak napis pod drugim napisem — to jedna klasa.
          expect(aparat.map((a) => a.id)).toEqual(['ramka', 'skala', 'widok']);
          const znalezione = chromeCaptionCollisions([...aparat, { id: 'ukryto', ...hint }]);
          for (const k of znalezione) {
            kolizje.push(`${kadr.width}×${kadr.height} L${lod} ×${mnoznik}: ${k.a}↔${k.b}`);
          }
          ukladow += 1;
        }
      }
    }
    expect(kolizje).toEqual([]);
    expect(ukladow).toBe(KADRY.length * LODY.length * MNOZNIKI.length);
  });

  it('INIEKCJA: bez ustąpienia wskaźnika kolizja WRACA — czyli test mierzy naprawę, a nie przypadek', () => {
    const sceny: Record<SceneLod, SceneV3> = {
      0: scenaDla('referencyjna', REFERENCYJNA, 0),
      1: scenaDla('referencyjna', REFERENCYJNA, 1),
      2: scenaDla('referencyjna', REFERENCYJNA, 2),
    };
    let bezUstapienia = 0;
    for (const kadr of KADRY) {
      for (const lod of LODY) {
        // Slot BAZOWY (bez znajomości aparatu arkusza) = stan sprzed karty.
        const { aparat } = ukladDla(sceny[lod], sceny, lod, kadr, 1, 1);
        const surowy = hiddenLabelsHintScreenRect(kadr, hiddenLabelsHintText(1), [], METRYKA);
        const znalezione = chromeCaptionCollisions([
          ...aparat.filter((a) => a.id === 'skala'),
          { id: 'ukryto-surowy', ...surowy },
        ]);
        if (znalezione.length > 0) bezUstapienia += 1;
      }
    }
    // Pomiar karty: kolizja w 12 na 12 par {kadr × LOD} przy kadrze dopasowania.
    // LV Domain Projection (po B-02): kolumny stacji z transformatorem
    // poszerzone o portal domeny nN ⇒ arkusz szerszy, inna skala dopasowania i
    // inny podpis skali — zmierzone ponownie: kolizja w 3 na 12 par. Sens
    // testu (wyrocznia MIERZY naprawę: bez ustąpienia kolizja WRACA w co
    // najmniej jednej parze) zachowany; liczba par jest własnością geometrii
    // fixtury, nie kontraktu.
    expect(bezUstapienia).toBeGreaterThan(0);
  });

  it('wskaźnik zachowuje slot bazowy tam, gdzie podpis arkusza jest daleko (ustępuje TYLKO gdy trzeba)', () => {
    const kadr = { width: 1400, height: 900 };
    const daleko = hiddenLabelsHintScreenRect(
      kadr,
      hiddenLabelsHintText(3),
      [{ x: 0, y: 0, width: 120, height: 17 }],
      METRYKA,
    );
    expect(daleko.y).toBe(kadr.height - 52 - 12);
  });

  it('ustępowanie liczy się dla PODKŁADKI, nie dla gołego napisu (pin dołożony przy odbiorze)', () => {
    /*
     * DLACZEGO TEN PIN ISTNIEJE. Podkładka wskaźnika powstała z OGLĘDZIN zrzutu —
     * napis systemowy, ustąpiwszy podpisom arkusza, lądował na treści rysunku i na
     * linii ramki, więc dostał nieprzezroczyste tło. Docstring `hiddenLabelsHintPlateRect`
     * nazywa to koniecznością, ale przy odbiorze karty zmierzono, że NIC tego nie
     * pilnowało: przestawienie warunku kolizji z podkładki na sam napis zostawiało
     * 675 testów na zielono. Skutek takiego przestawienia jest dokładnie tą klasą,
     * którą karta zamykała — nieprzezroczyste tło nachodzi na podpis arkusza i
     * ZASŁANIA go, czyli informacja ginie tak samo, tylko w drugą stronę.
     *
     * Wyrocznia bierze przeszkodę stojącą w PASIE PODKŁADKI, ale POZA prostokątem
     * napisu: goły napis jej nie dotyka, podkładka owszem. Bez naprawy wskaźnik
     * zostaje w slocie bazowym; z naprawą ustępuje.
     */
    const kadr = { width: 1400, height: 900 };
    const tekst = hiddenLabelsHintText(1);
    const slotBazowy = hiddenLabelsHintScreenRect(kadr, tekst, [], METRYKA);
    const podkladka = hiddenLabelsHintPlateRect(slotBazowy);

    // Zapadka na przypadek zdegenerowany: pas podkładki poza napisem MUSI istnieć,
    // inaczej przeszkoda poniżej byłaby pusta i test przechodziłby bez treści.
    expect(HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX).toBeGreaterThan(0);
    expect(HIDDEN_LABELS_HINT_PLATE_PADDING_Y_PX).toBeGreaterThan(0);

    const przeszkodaTylkoPodPodkladka = {
      x: podkladka.x,
      y: podkladka.y,
      width: HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX,
      height: podkladka.height,
    };
    expect(zachodza(przeszkodaTylkoPodPodkladka, podkladka)).toBe(true);
    expect(zachodza(przeszkodaTylkoPodPodkladka, slotBazowy)).toBe(false);

    const poUstapieniu = hiddenLabelsHintScreenRect(
      kadr,
      tekst,
      [przeszkodaTylkoPodPodkladka],
      METRYKA,
    );
    expect(poUstapieniu.y).toBeLessThan(slotBazowy.y);
    expect(zachodza(hiddenLabelsHintPlateRect(poUstapieniu), przeszkodaTylkoPodPodkladka)).toBe(
      false,
    );
  });
});
