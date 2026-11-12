/**
 * KD-11 — KONTRAKT TOŻSAMOŚCI ELEMENTÓW NA RYSUNKU.
 *
 * REGRESJA UŻYTKOWA (oględziny odbioru KD-8, zrzuty
 * `docs/audit/visual/flow-ekspert/kd8-motyw-gpz-{dark,light}.png`): po
 * podniesieniu progu czytelności opisów 6 → 9 px rysunek rozwiniętego GPZ przy
 * kadrze „Dopasuj widok" nie niósł ŻADNEGO podpisu — wskaźnik mówił „Ukryto 35
 * opisów". Rysunek techniczny bez tożsamości elementów (nazwa transformatora,
 * napięcie szyny/sekcji, nazwa źródła, oznaczenie pola) jest inżyniersko
 * bezużyteczny: nie da się z niego odczytać, CO się rysuje.
 *
 * Kontrakt (rozstrzygnięcie karty KD-11):
 *  1. klasa TOŻSAMOŚĆ nie znika — poniżej progu jest renderowana pismem
 *     powiększonym do rozmiaru minimalnego czytelnego;
 *  2. wskaźnik „Ukryto N opisów" liczy WYŁĄCZNIE klasę DANE SZCZEGÓŁOWE;
 *  3. zero kolizji: etykieta↔etykieta i etykieta↔rysunek (symbol/tor);
 *  4. klasyfikacja pochodzi z DANYCH SCENY (rodzaj właściciela / rola wiersza
 *     pasma), nigdy z treści tekstu.
 *
 * Kadr „Dopasuj widok" liczony PRODUKCYJNĄ ścieżką kamery
 * (`computeInitialCameraState` — dokładnie to, co robi akcja `refit` przycisku),
 * nie stałą testową.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneV3 } from '../../scene/buildScene';
import { computeInitialCameraState, SKALE_ODBIORU_PLANU_ETYKIET } from '../camera';
import { contentBoundingBoxOf, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { sheetSizeFor } from '../../sheet/outline';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
} from '../labelLegibility';
import {
  enlargedFontSizeWithinProportion,
  isLabelReadableAtScale,
  LABEL_TYPOGRAPHY,
  MIN_READABLE_LABEL_SCREEN_PX,
  measureTextWidth,
} from '../../core/text';
import { LABEL_ROLE_BY_OWNER_KIND } from '../../layout/labels';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnm(relative: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, relative), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }).enm;
}

/** Sieć z ROZWINIĘTYM GPZ — ta sama klasa układu, co na zrzutach odbiorczych
 *  KD-8 (GPZ 110/15 kV + magistrala kablowa ze stacjami SN/nN). */
const GPZ_ENM = loadEnm('../../scene/__tests__/fixtures/gpzFeeder.enm.json');
/** Golden sieć WIELOSTACYJNA (53 stacje) — ta sama fixtura, na której działa
 *  runner odbioru `accept:sld-v3`. */
const WIELOSTACYJNA_ENM = loadEnm('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');

/** Viewport kanwy zbliżony do produkcyjnego (środkowa kolumna 1600×900 z
 *  panelami bocznymi) — ten sam, którym liczą kadr zrzuty odbiorcze. */
const VIEWPORT = { width: 1000, height: 560 } as const;

function bboxOfRect(rect: SceneV3['bbox']) {
  return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
}

/** Skala kadru „Dopasuj widok" — PRODUKCYJNA ścieżka (`SldCanvasV3`: cel fitu =
 *  bbox TREŚCI w świecie arkusza, świat kamery = cały rysunek). */
function skalaDopasowania(scene: SceneV3): number {
  const cel = sceneBoxToCameraWorld(contentBoundingBoxOf(scene) ?? bboxOfRect(scene.bbox));
  return computeInitialCameraState(cel, VIEWPORT, null).transform.scale;
}

/**
 * Skale stanów kamery PRODUKCYJNYCH (karta SLD-SKALA-I-NAWIGACJA, jedna scena):
 * kadr dopasowania całości oraz skale odbioru planu etykiet
 * (`SKALE_ODBIORU_PLANU_ETYKIET`). Dawniej skale zależały od poziomu szczegółu
 * aktywnego w kamerze; scena jest jedna, więc zbiór jest wspólny.
 */
function skaleProdukcyjne(skalaFit: number): readonly number[] {
  return [skalaFit, ...SKALE_ODBIORU_PLANU_ETYKIET];
}

describe('KD-11 §1 — klasyfikacja etykiet pochodzi z DANYCH SCENY', () => {
  const scena = buildSceneV3(GPZ_ENM);

  it(`KAŻDA etykieta niesie klasę znaczeniową, a tożsamość zna stronę kotwicy`, () => {
    const scene = scena;
    expect(scene.labels.length).toBeGreaterThan(0);
    for (const label of scene.labels) {
      expect(['tozsamosc', 'dane'], `${label.ownerRef}`).toContain(label.labelRole);
      if (label.labelRole === 'tozsamosc') {
        // Bez strony kotwicy powiększone pismo nie wiedziałoby, w którą
        // stronę rosnąć — a rosnąc „w kotwicę" siadłoby na torze/symbolu.
        expect(label.placement, `${label.ownerRef} bez placement`).toBeDefined();
      }
    }
  });

  it('klasa znaczeniowa NIE wynika z klasy typograficznej (dowód: t2 w obu klasach)', () => {
    const t2 = scena.labels.filter((l) => l.labelClass === 't2');
    expect(t2.some((l) => l.labelRole === 'tozsamosc'), 'brak t2 tożsamości').toBe(true);
    expect(t2.some((l) => l.labelRole === 'dane'), 'brak t2 danych').toBe(true);
  });

  it('klasa znaczeniowa NIE wynika z treści: „Sekcja 1 · 15 kV" i „Yd11 · 25 MVA" różnią się rodzajem właściciela', () => {
    const szyna = scena.labels.find((l) => l.ownerKind === 'busbar-voltage');
    const parametr = scena.labels.find(
      (l) => l.ownerKind === 'station-name' && l.labelRole === 'dane',
    );
    expect(szyna?.labelRole).toBe('tozsamosc');
    expect(parametr?.labelRole).toBe('dane');
    // Reguła jest TABELĄ rodzajów właściciela, nie dopasowaniem tekstu.
    expect(LABEL_ROLE_BY_OWNER_KIND['busbar-voltage']).toBe('tozsamosc');
    expect(LABEL_ROLE_BY_OWNER_KIND['segment-span']).toBe('dane');
  });

  it('tożsamość obejmuje nazwę stacji/GPZ, oznaczenie transformatora, napięcie szyny, oznaczenie pola i nazwę źródła', () => {
    const role = new Map(scena.labels.map((l) => [l.text, l.labelRole] as const));
    // PROPORCJE (2026-08-07): kod stacji pada w bloku RAZ — niesie go OPIS
    // SEKCJI („S01 · Sekcja 1 · 15 kV"), a pasmo nazw pokazuje NAZWĘ stacji.
    // Intencja testu bez zmian: sprawdzamy, że KAŻDY nośnik tożsamości bloku
    // jest sklasyfikowany jako tożsamość — pod nowym adresem kodu stacji.
    const oczekiwane = ['GPZ 15 kV · 110/15 kV', 'TR1', 'Sekcja 1 · 15 kV', 'Szyna WN · 110 kV'];
    for (const tekst of oczekiwane) {
      expect(role.get(tekst), `„${tekst}" powinno być tożsamością`).toBe('tozsamosc');
    }
    // …a parametry NIE (dowód rozłączności, nie tylko obecności).
    expect(role.get('Yd11 · 25 MVA')).toBe('dane');
    expect(role.get('$u_{k}$ 11% · $P_{k}$ 120 kW')).toBe('dane');
  });
});

describe('KD-11 §2 (bramka 1) — kadr „Dopasuj widok" na sieci z rozwiniętym GPZ', () => {
  const scena = buildSceneV3(GPZ_ENM);

  it(`KAŻDA etykieta tożsamości jest narysowana, licznik ukrytych to WYŁĄCZNIE dane szczegółowe`, () => {
    const scene = scena;
    const scale = skalaDopasowania(scena);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));

    // Karta GPZ-MODEL: GPZ fikstury to odtąd model obliczeniowo prawdziwy (równoważnik
    // sieci po stronie 110 kV, transformator 110/15 kV) — źródło wieńczy kolumnę WN.
    // Pomiar na drzewie scalonym z GEOMETRIA-STACJI (baza `f7235700e`): skala
    // dopasowania L2 = 0,4034, czyli POWYŻEJ sufitu proporcji klasy t4
    // (9 px / (8 × 3) = 0,375, `LabelTypography.maxEnlargement`) — oznaczniki aparatów
    // t4 mają proporcjonalny rozmiar i MUSZĄ się narysować. Blok GPZ jest węższy po
    // stronie SN (źródło przeszło do kolumny WN), więc pierwsze pole S01 stoi tuż za
    // ostatnim polem GPZ; oznacznik „Q1" tego pola rysuje się dzięki regule (f) planu
    // (ustąpienie skracalnego sąsiada, `labelLegibility.ts` `ustapSasiadow`), bez niej
    // ginął od kolizji z powiększonym „Pole liniowe GPZ 1.2". Gdy skala spada poniżej
    // sufitu klasy, plan odrzuca tożsamość JAWNIE (`droppedIdentity`, wskaźnik
    // „Ukryto N opisów"), zgodnie z kontraktem PROPORCJE. Kontrakt KD-11 bez zmian intencji: KAŻDA tożsamość,
    // którą da się narysować proporcjonalnie, JEST narysowana, a odrzucone są
    // DOKŁADNIE te, których klasa przekracza sufit (jedno źródło prawdy:
    // `enlargedFontSizeWithinProportion`) — żadna nie ginie od kolizji ani progu.
    const tozsamosci = scene.labels.filter((l) => l.labelRole === 'tozsamosc');
    const ponadSufitem = (l: (typeof tozsamosci)[number]): boolean =>
      enlargedFontSizeWithinProportion(l.labelClass, scale) === null;
    const narysowaneTozsamosci = new Set(
      plan.drawn.filter((p) => p.label.labelRole === 'tozsamosc').map((p) => p.label.ownerRef),
    );
    expect(tozsamosci.filter((l) => !ponadSufitem(l)).length).toBeGreaterThan(0);
    const brakujace = tozsamosci.filter((l) => !ponadSufitem(l) && !narysowaneTozsamosci.has(l.ownerRef));
    expect(brakujace.map((l) => `${l.ownerKind}:${l.text}`)).toEqual([]);
    expect(plan.droppedIdentity.map((l) => l.ownerRef).sort()).toEqual(
      tozsamosci.filter(ponadSufitem).map((l) => l.ownerRef).sort(),
    );

    // Licznik „Ukryto N opisów" = wyłącznie dane szczegółowe.
    expect(plan.hiddenDetail.every((l) => l.labelRole === 'dane')).toBe(true);

    // POMIAR REGRESJI KD-8 (dowód, że kontrakt dotyczy realnego defektu):
    // przy TEJ SAMEJ skali reguła sprzed KD-11 (próg dla WSZYSTKICH klas)
    // ukrywała także tożsamości — i to WIĘCEJ niż dziś licznik danych.
    const ukryteRegulaKD8 = scene.labels.filter(
      (l) => !isLabelReadableAtScale(l.labelClass, scale),
    ).length;
    expect(ukryteRegulaKD8).toBeGreaterThan(plan.hiddenDetail.length);
    expect(ukryteRegulaKD8).toBe(scene.labels.length); // kadr, na którym NIE BYŁO żadnego podpisu
  });

  it('LOD 1: podpisy tożsamości są rysowane pismem o rozmiarze ekranowym ≥ próg czytelności', () => {
    const scene = scena;
    const scale = skalaDopasowania(scena);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const powiekszone = plan.drawn.filter((p) => p.enlarged);
    expect(powiekszone.length).toBeGreaterThan(0);
    for (const p of plan.drawn) {
      if (p.label.labelRole !== 'tozsamosc') continue;
      // Pismo naturalne (gdy czytelne) albo powiększone — w obu razach na
      // ekranie nie mniej niż próg.
      expect(p.fontSize * scale, `${p.label.ownerRef}`).toBeGreaterThanOrEqual(
        Math.min(MIN_READABLE_LABEL_SCREEN_PX, LABEL_TYPOGRAPHY[p.label.labelClass].fontSize * scale),
      );
    }
  });

  it('skrócenie z wielokropkiem nie wychodzi poza prostokąt planu (pomiar szerokości)', () => {
    const scene = scena;
    const scale = skalaDopasowania(scena);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const skrocone = plan.drawn.filter((p) => p.text !== p.label.text);
    expect(skrocone.length).toBeGreaterThan(0); // kadr faktycznie ćwiczy skracanie
    for (const p of skrocone) {
      // S9-7 (audyt C-6): znak skrócenia może stać w ŚRODKU („Szy…WN",
      // „Źródło…15 kV"), a nie tylko na końcu — od tej karty skracanie
      // ZACHOWUJE CZŁON ROZRÓŻNIAJĄCY (końcówkę), bo „Stacja SN-…" ×20 wygląda
      // identycznie dla dwudziestu stacji. Intencja asercji bez zmian: każdy
      // skrót MUSI być jawnie oznaczony, żeby nie udawał kompletnej danej.
      expect(p.text.includes('…'), `${p.label.ownerRef} skrócone bez wielokropka`).toBe(true);
      expect(measureTextWidth(p.text, p.fontSize, LABEL_TYPOGRAPHY[p.label.labelClass].fontWeight)).toBeLessThanOrEqual(p.rect.width);
    }
  });
});

describe('KD-11 §3 (bramka 2) — wyrocznia braku kolizji na golden sieci wielostacyjnej', () => {
  const scena = buildSceneV3(WIELOSTACYJNA_ENM);

  const skalaFit = skalaDopasowania(scena);
  for (const scale of skaleProdukcyjne(skalaFit)) {
    it(`@ skala ${scale.toFixed(4)}: zero nachodzeń etykieta↔etykieta i etykieta↔rysunek`, () => {
      const scene = scena;
      const obstacles = sceneObstacleRects(scene);
      const plan = planSceneLabels(scene.labels, obstacles, scale, sheetSizeFor(scene));
      const pary = plannedLabelCollisions(plan);
      expect(pary.map((p) => `${p.a} ↔ ${p.b}`)).toEqual([]);
      const naRysunku = plannedLabelObstacleCollisions(plan, obstacles);
      expect(naRysunku).toEqual([]);
    });
  }

  it(`w stanach kamery PRODUKCYJNYCH żadna tożsamość nie jest porzucana`, () => {
    const scene = scena;
    const obstacles = sceneObstacleRects(scene);
    for (const scale of skaleProdukcyjne(skalaFit)) {
      const plan = planSceneLabels(scene.labels, obstacles, scale, sheetSizeFor(scene));
      expect(
        plan.droppedIdentity.map((l) => `${scale.toFixed(4)}:${l.ownerKind}:${l.text}`),
      ).toEqual([]);
    }
  });
});

describe('KD-11 §4 (bramka 3) — wyrocznie GRYZĄ', () => {
  const scena = buildSceneV3(GPZ_ENM);

  it('regresja „tożsamość podlega zwykłemu progowi" (stan po KD-8) ⇒ liczba ukrytych tożsamości > 0', () => {
    // Symulacja regresji NA DANYCH (bez mutowania kodu): gdyby tożsamość
    // podlegała progowi jak dane, plan przy kadrze dopasowanym gubiłby DOKŁADNIE
    // tyle podpisów. Ta liczba jest miarą defektu z odbioru KD-8.
    const scene = scena;
    const scale = skalaDopasowania(scena);
    // Karta GPZ-MODEL: tożsamości klasy ponad sufitem proporcji odrzuca kontrakt
    // PROPORCJE (test bramki 1 wyżej) — miarą defektu KD-8 są te, które da się narysować.
    const ukryteTozsamosci = scene.labels.filter(
      (l) =>
        l.labelRole === 'tozsamosc' &&
        !isLabelReadableAtScale(l.labelClass, scale) &&
        enlargedFontSizeWithinProportion(l.labelClass, scale) !== null,
    );
    expect(ukryteTozsamosci.length).toBeGreaterThan(0);
    // …a kontrakt wyżej wymaga, żeby po naprawie było ich ZERO w planie.
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const narysowane = new Set(plan.drawn.map((p) => p.label.ownerRef));
    for (const l of ukryteTozsamosci) expect(narysowane.has(l.ownerRef)).toBe(true);
  });

  it('wyrocznia kolizji GRYZIE: sztuczny plan z nachodzącymi etykietami jest zgłaszany', () => {
    const scene = scena;
    const scale = skalaDopasowania(scena);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const [a, b] = plan.drawn;
    const sabotaz = { ...plan, drawn: [a, { ...b, rect: { ...a.rect } }] };
    expect(plannedLabelCollisions(sabotaz).length).toBeGreaterThan(0);
    expect(plannedLabelObstacleCollisions(sabotaz, [a.rect]).length).toBeGreaterThan(0);
  });

  it('brak wiarygodnego pomiaru skali NIE ukrywa i NIE powiększa niczego', () => {
    const scene = scena;
    for (const scale of [0, -1, Number.NaN]) {
      const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
      expect(plan.drawn.length).toBe(scene.labels.length);
      expect(plan.hiddenDetail).toEqual([]);
      expect(plan.drawn.every((p) => !p.enlarged)).toBe(true);
    }
  });

  it('powyżej progu plan jest TOŻSAMOŚCIĄ renderu sprzed KD-11 (zero zmiany zachowania)', () => {
    const scene = scena;
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 2, sheetSizeFor(scene));
    expect(plan.drawn.length).toBe(scene.labels.length);
    expect(plan.hiddenDetail).toEqual([]);
    for (const p of plan.drawn) {
      expect(p.text).toBe(p.label.text);
      expect(p.rect).toEqual(p.label.rect);
      expect(p.fontSize).toBe(LABEL_TYPOGRAPHY[p.label.labelClass].fontSize);
    }
  });
});
