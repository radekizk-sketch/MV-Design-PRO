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
 *     powiększonym do rozmiaru minimalnego czytelnego (karta
 *     SLD-SKALA-I-NAWIGACJA R4: w całości, bez wielokropka; przegrana kolizji
 *     albo sufitu proporcji trafia do podpowiedzi uchwytu);
 *  2. poza planem zostają WYŁĄCZNIE dane (karta SLD-SKALA-I-NAWIGACJA R3:
 *     wskaźnik „Ukryto N opisów" usunięty — gęstość danych jest funkcją skali,
 *     a intencja punktu, „brak na rysunku dotyczy tylko danych", jest mierzona
 *     wprost na planie);
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
  rangaTozsamosci,
  type LabelRenderPlan,
} from '../labelLegibility';
import { klasaInformacjiEtykiety } from '../gestoscInformacji';
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
/** Indeksy etykiet sceny, których plan nie rysuje ani nie oddaje do podpowiedzi
 *  (R3: wyłącznie dane poniżej progu czytelności). */
function pozaPlanem(scene: SceneV3, plan: LabelRenderPlan): readonly number[] {
  const obecne = new Set([...plan.drawn.map((p) => p.index), ...plan.tozsamosciWPodpowiedzi.map((t) => t.index)]);
  return scene.labels.map((_, i) => i).filter((i) => !obecne.has(i));
}

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

  it(`KAŻDA etykieta tożsamości jest narysowana albo w podpowiedzi, poza planem zostają WYŁĄCZNIE dane`, () => {
    const scene = scena;
    const scale = skalaDopasowania(scena);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));

    // Karta GPZ-MODEL: GPZ fikstury to model obliczeniowo prawdziwy (równoważnik sieci
    // po stronie 110 kV, transformator 110/15 kV). Kontrakt KD-11 po karcie
    // SLD-SKALA-I-NAWIGACJA (R4): nazwy GPZ/stacji i oznaczenia sekcji (ranga ≥ 2) rysują
    // się w stałym rozmiarze ekranowym bez sufitu proporcji — przy kadrze dopasowania
    // WSZYSTKIE; tożsamość rangi pola, której klasa przekracza sufit proporcji
    // (`enlargedFontSizeWithinProportion` = null), albo która przegrała kolizję z wyższą
    // rangą, trafia do podpowiedzi uchwytu. Żadna tożsamość nie ginie.
    const tozsamosci = scene.labels.map((l, i) => [l, i] as const).filter(([l]) => klasaInformacjiEtykiety(l) === 'tozsamosc');
    const narysowane = new Set(plan.drawn.map((p) => p.index));
    const wPodpowiedzi = new Set(plan.tozsamosciWPodpowiedzi.map((t) => t.index));
    expect(tozsamosci.length).toBeGreaterThan(0);
    for (const [l, i] of tozsamosci) {
      expect(narysowane.has(i) !== wPodpowiedzi.has(i), `${l.ownerKind}:${l.text}`).toBe(true);
    }
    const bloki = tozsamosci.filter(([l]) => rangaTozsamosci(l) >= 2);
    expect(bloki.length).toBeGreaterThan(0);
    // Nazwy GPZ i stacji (ranga ≥ 3) — wszystkie narysowane. Oznaczenie sekcji GPZ „Sekcja 1 ·
    // 15 kV" przy skali 0,336 (pismo 26,8 j.św., tusz ~150 j.św.) nie ma miejsca na pełne
    // brzmienie: nad szyną sekcji (288 j.św.) stoi zejście transformatora (x 191), pod szyną —
    // pola GPZ co 136 j.św.; trafia do podpowiedzi uchwytu (pomiar 2026-11-12; pin w dół).
    expect(bloki.filter(([l, i]) => rangaTozsamosci(l) >= 3 && !narysowane.has(i)).map(([l]) => l.text)).toEqual([]);
    expect(bloki.filter(([, i]) => !narysowane.has(i)).length).toBeLessThanOrEqual(1);
    // Tożsamość rangi pola (oznaczenie i rola pola, oznacznik aparatu) przy kadrze całej sieci
    // (skala 0,336, pismo 26,8 j.św. — trzykrotność naturalnego) nie mieści się w kolumnie pola
    // zwymiarowanej pod pismo naturalne i trafia do podpowiedzi uchwytu, nigdy w postaci
    // skróconej (asercje niżej). Pełne nazwy pól daje kadr rozdzielnicy z podłogą skali
    // czytania (`SKALA_PODLOGI_ROZDZIELNICY`, `camera.kadr.test.ts`).
    for (const t of plan.tozsamosciWPodpowiedzi) expect(t.label.text.length).toBeGreaterThan(0);

    // Poza planem — wyłącznie dane.
    const ukryte = pozaPlanem(scene, plan);
    expect(ukryte.every((i) => klasaInformacjiEtykiety(scene.labels[i]!) !== 'tozsamosc')).toBe(true);

    // POMIAR REGRESJI KD-8 (dowód, że kontrakt dotyczy realnego defektu):
    // przy TEJ SAMEJ skali reguła sprzed KD-11 (próg dla WSZYSTKICH klas)
    // ukrywała także tożsamości — i to WIĘCEJ niż dziś plan.
    const ukryteRegulaKD8 = scene.labels.filter(
      (l) => !isLabelReadableAtScale(l.labelClass, scale),
    ).length;
    expect(ukryteRegulaKD8).toBeGreaterThan(ukryte.length);
    expect(ukryteRegulaKD8).toBe(scene.labels.length); // kadr, na którym NIE BYŁO żadnego podpisu
  });

  it('kadr dopasowania: podpisy tożsamości są rysowane pismem o rozmiarze ekranowym ≥ próg czytelności', () => {
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
      // R4: tożsamość w pełnym brzmieniu.
      expect(p.text, `${p.label.ownerRef}`).toBe(p.label.text);
    }
  });

  it('skrócenie z wielokropkiem nie wychodzi poza prostokąt planu (pomiar szerokości)', () => {
    const scene = scena;
    const scale = skalaDopasowania(scena);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const skrocone = plan.drawn.filter((p) => p.text !== p.label.text);
    // R4: skracane bywają wyłącznie DANE — tożsamość stoi w całości albo ustępuje.
    expect(skrocone.filter((p) => klasaInformacjiEtykiety(p.label) === 'tozsamosc').map((p) => p.label.text)).toEqual([]);
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

  it(`w stanach kamery PRODUKCYJNYCH żadna tożsamość nie znika (narysowana albo w podpowiedzi)`, () => {
    const scene = scena;
    const obstacles = sceneObstacleRects(scene);
    for (const scale of skaleProdukcyjne(skalaFit)) {
      const plan = planSceneLabels(scene.labels, obstacles, scale, sheetSizeFor(scene));
      const ukryteTozsamosci = pozaPlanem(scene, plan).filter((i) => klasaInformacjiEtykiety(scene.labels[i]!) === 'tozsamosc');
      expect(ukryteTozsamosci.map((i) => `${scale.toFixed(4)}:${scene.labels[i]!.text}`)).toEqual([]);
      // Nazwy bloków przegrywające kolizję z nazwą sąsiada (kadr dopasowania 53 stacji w oknie
      // 1000×560: skala 0,066, nazwa stacji 136 j.św. wysokości) trafiają do podpowiedzi —
      // nigdy nie znikają. Kadr dopasowania w oknie roboczym 1800×1100 rysuje wszystkie nazwy
      // (`gestoscInformacji.contract.test.ts`, „sieci referencyjne przy dopasowaniu”).
      const narysowaneNazwy = plan.drawn.filter((p) => rangaTozsamosci(p.label) >= 3).length;
      expect(narysowaneNazwy, `@${scale.toFixed(4)}`).toBeGreaterThan(0);
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
    // …a kontrakt wyżej wymaga, żeby po naprawie żadna nie zniknęła (narysowana albo w
    // podpowiedzi uchwytu — R4).
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const obecne = new Set([...plan.drawn.map((p) => p.label), ...plan.tozsamosciWPodpowiedzi.map((t) => t.label)]);
    for (const l of ukryteTozsamosci) expect(obecne.has(l), l.text).toBe(true);
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
      expect(plan.tozsamosciWPodpowiedzi).toEqual([]);
      expect(plan.drawn.every((p) => !p.enlarged)).toBe(true);
    }
  });

  it('powyżej progu plan jest TOŻSAMOŚCIĄ renderu sprzed KD-11 (zero zmiany zachowania)', () => {
    const scene = scena;
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 2, sheetSizeFor(scene));
    expect(plan.drawn.length).toBe(scene.labels.length);
    expect(plan.tozsamosciWPodpowiedzi).toEqual([]);
    for (const p of plan.drawn) {
      expect(p.text).toBe(p.label.text);
      expect(p.rect).toEqual(p.label.rect);
      expect(p.fontSize).toBe(LABEL_TYPOGRAPHY[p.label.labelClass].fontSize);
    }
  });
});
