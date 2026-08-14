/**
 * T2-LOD — KONTRAKT POLITYKI LOD nN (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`
 * §„POLITYKA LOD nN", BINDING).
 *
 * Zasada planu: LOD ukrywa SZCZEGÓŁY, nigdy TOPOLOGIĘ ani TOŻSAMOŚĆ.
 *
 *  - L0 (Fit / cały arkusz) — NIGDY nie ukrywane, żadnym zoomem: oznaczenia
 *    referencyjne aparatów, poziomy napięć i etykiety szyn, nazwy pól,
 *    nazwa+parametry kluczowe TR, stany OPEN/CLOSED, ostrzeżenia krytyczne,
 *    granica domen napięciowych.
 *  - L1 (zbliżenie robocze) — dochodzą: typy katalogowe, prądy znamionowe,
 *    przekroje/długości kabli, oznaczenia głowic, N/PE/PEN szczegółowo.
 *  - L2 (inspekcja) — dochodzą: parametry katalogowe pełne, producent,
 *    warstwa wyników inline, marginesy doboru.
 *  - Wyjątek bezwzględny: element w stanie błędu/UNRESOLVED renderuje pełną
 *    etykietę na KAŻDYM poziomie LOD.
 *  - „Ukryto N opisów" dopuszczalne WYŁĄCZNIE dla treści L1/L2.
 *
 * Ten plik dowodzi, że TE reguły — WPIĘTE w istniejący, ŻYWY mechanizm KD-11
 * (`canvas/labelLegibility.ts` `planSceneLabels`, klasyfikacja
 * `layout/labels.ts` `lodClassOf`/`LOD_CLASS_BY_OWNER_KIND`) — trzymają jako
 * MIERZONA własność, nie deklaracja (reguła KLASA §4).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../../scene/buildScene';
import { MAX_SCALE, MIN_SCALE } from '../camera';
import { sheetSizeFor, type SheetOutline } from '../../sheet/outline';
import {
  hiddenDetailContainsL0,
  labelsWithInconsistentL0Classification,
  planSceneLabels,
} from '../labelLegibility';
import {
  LOD_CLASS_BY_OWNER_KIND,
  lodClassOf,
  type OwnedLabel,
  type OwnerKind,
} from '../../layout/labels';
import type { LabelClass, LodClass } from '../../core/text';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnm(relative: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, relative), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }).enm;
}

const GPZ_ENM = loadEnm('../../scene/__tests__/fixtures/gpzFeeder.enm.json');
const WIELOSTACYJNA_ENM = loadEnm('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');

/** Arkusz syntetyczny wystarczająco duży, żeby OBRYS ARKUSZA (RAMKA-TNIE-
 *  PODPISY) nigdy nie ingerował w testy jednostkowe klasyfikacji — te badają
 *  WYŁĄCZNIE oś zoomu, nie geometrię layoutu (T3, poza zakresem tej karty). */
const DUZY_ARKUSZ: SheetOutline = { width: 1_000_000, height: 1_000_000 };

/** Odsunięcie slotu bazowego od (0,0) [j.św.] — pismo TOŻSAMOŚCI może urosnąć
 *  do `maxEnlargement`× (t1: 9×) i rośnie SYMETRYCZNIE wokół środka slotu, gdy
 *  etykieta nie niesie `placement` (patrz `canvas/labelLegibility.ts`
 *  `anchoredRect`, gałąź domyślna) — slot blisko krawędzi arkusza (0,0)
 *  ucinałby powiększony prostokąt na `rectWithinSheet`, co jest artefaktem
 *  GEOMETRII testu, nie przedmiotem tego kontraktu (oś zoomu, nie layout/T3).
 *  Odsunięcie 10 000 j.św. w obrębie arkusza 1 000 000×1 000 000 daje zapas
 *  wielokrotnie większy niż najszerszy możliwy prostokąt (t1 @ 9×, tekst
 *  kilkudziesięcioznakowy) na każdej osi. */
const SLOT_OFFSET = 10_000;

/** Etykieta syntetyczna minimalna — pola geometryczne nieistotne dla osi
 *  zoomu dostają wartości NEUTRALNE (bez kolizji, z dala od krawędzi arkusza). */
function makeLabel(partial: {
  readonly ownerRef: string;
  readonly ownerKind: OwnerKind;
  readonly labelClass: LabelClass;
  readonly labelRole: 'tozsamosc' | 'dane';
  readonly text?: string;
  readonly x?: number;
  readonly unresolved?: boolean;
}): OwnedLabel {
  return {
    ownerRef: partial.ownerRef,
    ownerKind: partial.ownerKind,
    labelClass: partial.labelClass,
    labelRole: partial.labelRole,
    text: partial.text ?? partial.ownerRef,
    slotIndex: 1,
    rect: { x: SLOT_OFFSET + (partial.x ?? 0), y: SLOT_OFFSET, width: 40, height: 20 },
    ...(partial.unresolved !== undefined ? { unresolved: partial.unresolved } : {}),
  };
}

/** Reprezentant KAŻDEGO rodzaju właściciela klasy L0 wg planu — jeden na
 *  `OwnerKind`, ROZSTAWIONE (x rosnące o 500 j.św.), żeby zero kolizji między
 *  nimi przy wspólnym planie. Klasa typograficzna dobrana zgodnie z realnym
 *  wytwórcą (`compose/*`/`scene/buildScene.ts`) — patrz `LABEL_TYPOGRAPHY`
 *  komentarze w `core/text.ts`. */
const L0_OWNER_KINDS = [
  'apparatus',
  'busbar-voltage',
  'field-role',
  'der',
  'no-point',
  'branch-point',
  'station-name',
] as const satisfies readonly OwnerKind[];

const L0_LABEL_CLASS_BY_KIND: Readonly<Record<(typeof L0_OWNER_KINDS)[number], LabelClass>> = {
  apparatus: 't4',
  'busbar-voltage': 't2',
  'field-role': 't3',
  der: 't2',
  'no-point': 't3',
  'branch-point': 't3',
  'station-name': 't1',
};

/** Drabina skal od `MIN_SCALE` do `MAX_SCALE` — pokrywa CAŁY zakres kamery,
 *  nie tylko pasmo produkcyjne (plan mówi „niezależnie od zoomu", więc bramka
 *  jest szersza niż stany osiągalne histerezą kamery). */
const PELNA_DRABINA_SKAL: readonly number[] = [
  MIN_SCALE,
  0.1,
  0.3,
  0.6,
  0.818, // próg czytelności t2 (9/11) — granica L1
  0.9,
  1.0,
  1.125, // próg czytelności t4 (9/8) — granica L2 (protection/lv-load/segment-endpoint)
  1.2,
  2,
  MAX_SCALE,
];

describe('T2-LOD §1 — LOD_CLASS_BY_OWNER_KIND jest KOMPLETNA i zgodna z planem', () => {
  const wszystkieRodzaje: readonly OwnerKind[] = [
    'segment-span',
    'segment-lateral',
    'segment-endpoint',
    'station-name',
    'port-caption',
    'field-role',
    'apparatus',
    'der',
    'busbar-voltage',
    'no-point',
    'branch-point',
    'protection',
    'lv-load',
  ];

  it('KAŻDY rodzaj właściciela ma przypisaną klasę LOD', () => {
    for (const kind of wszystkieRodzaje) {
      expect(['L0', 'L1', 'L2'], kind).toContain(LOD_CLASS_BY_OWNER_KIND[kind]);
    }
  });

  it('L0 = dosłowna lista planu: aparaty, napięcia/szyny, pola, TR (pasmo nazw), stany, tożsamość źródła', () => {
    const oczekiwaneL0: readonly OwnerKind[] = [
      'apparatus',
      'busbar-voltage',
      'field-role',
      'der',
      'no-point',
      'branch-point',
      'station-name',
    ];
    for (const kind of oczekiwaneL0) {
      expect(LOD_CLASS_BY_OWNER_KIND[kind], kind).toBe('L0');
    }
  });

  it('L1 = „przekroje/długości kabli" (segment-span/lateral), dosłowny przykład planu', () => {
    expect(LOD_CLASS_BY_OWNER_KIND['segment-span']).toBe('L1');
    expect(LOD_CLASS_BY_OWNER_KIND['segment-lateral']).toBe('L1');
  });

  it('L2 = adnotacje drugorzędne (kierunek pola, koniec odcinka, zabezpieczenia, odbiór zagregowany nN)', () => {
    expect(LOD_CLASS_BY_OWNER_KIND['port-caption']).toBe('L2');
    expect(LOD_CLASS_BY_OWNER_KIND['segment-endpoint']).toBe('L2');
    expect(LOD_CLASS_BY_OWNER_KIND.protection).toBe('L2');
    expect(LOD_CLASS_BY_OWNER_KIND['lv-load']).toBe('L2');
  });

  it('ŻADEN rodzaj klasy `dane` nie jest L0 (rozłączność L0 od reszty)', () => {
    const daneKinds: readonly OwnerKind[] = [
      'segment-span',
      'segment-lateral',
      'segment-endpoint',
      'port-caption',
      'protection',
      'lv-load',
    ];
    for (const kind of daneKinds) {
      expect(LOD_CLASS_BY_OWNER_KIND[kind], kind).not.toBe('L0');
    }
  });
});

describe('T2-LOD §2 — lodClassOf: jedno źródło prawdy, pasmo nazw MIESZANE rozstrzyga wiersz', () => {
  for (const kind of L0_OWNER_KINDS) {
    it(`ownerKind='${kind}' (tozsamosc) ⇒ 'L0'`, () => {
      const label = makeLabel({
        ownerRef: `test/${kind}`,
        ownerKind: kind,
        labelClass: L0_LABEL_CLASS_BY_KIND[kind],
        labelRole: 'tozsamosc',
      });
      expect(lodClassOf(label)).toBe('L0');
    });
  }

  it("station-name, wiersz 'dane' t2 (typ·kVA) ⇒ 'L1'", () => {
    const label = makeLabel({
      ownerRef: 'test/station-name-dane-t2',
      ownerKind: 'station-name',
      labelClass: 't2',
      labelRole: 'dane',
    });
    expect(lodClassOf(label)).toBe('L1');
  });

  it("station-name, wiersz 'dane' t4 (typ stacji) ⇒ 'L2'", () => {
    const label = makeLabel({
      ownerRef: 'test/station-name-dane-t4',
      ownerKind: 'station-name',
      labelClass: 't4',
      labelRole: 'dane',
    });
    expect(lodClassOf(label)).toBe('L2');
  });

  it("segment-span (zawsze t2/'dane') ⇒ 'L1'; protection (zawsze t4/'dane') ⇒ 'L2'", () => {
    const span = makeLabel({ ownerRef: 'seg', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane' });
    const prot = makeLabel({ ownerRef: 'prot', ownerKind: 'protection', labelClass: 't4', labelRole: 'dane' });
    expect(lodClassOf(span)).toBe('L1');
    expect(lodClassOf(prot)).toBe('L2');
  });

  it("`unresolved: true` NADPISUJE WSZYSTKO ⇒ zawsze 'L0' (nawet dla ownerKind L2)", () => {
    const prot = makeLabel({
      ownerRef: 'prot-unresolved',
      ownerKind: 'protection',
      labelClass: 't4',
      labelRole: 'dane',
      unresolved: true,
    });
    expect(lodClassOf(prot)).toBe('L0');
    const stationDane = makeLabel({
      ownerRef: 'station-dane-unresolved',
      ownerKind: 'station-name',
      labelClass: 't4',
      labelRole: 'dane',
      unresolved: true,
    });
    expect(lodClassOf(stationDane)).toBe('L0');
  });
});

describe('T2-LOD §3 — ILOCZYN {klasa LOD × zoom} → widoczność (planSceneLabels)', () => {
  // Parametryzowane po WSZYSTKICH typach etykiet L0 (siedem rodzajów
  // właściciela z planu) × CAŁA drabina skal — nie jeden przykład z karty.
  for (const kind of L0_OWNER_KINDS) {
    it(`L0 (ownerKind='${kind}') NIGDY nie trafia do hiddenDetail — na CAŁEJ drabinie skal (a przy skali roboczej JEST narysowana)`, () => {
      const label = makeLabel({
        ownerRef: `l0/${kind}`,
        ownerKind: kind,
        labelClass: L0_LABEL_CLASS_BY_KIND[kind],
        labelRole: 'tozsamosc',
      });
      for (const scale of PELNA_DRABINA_SKAL) {
        const plan = planSceneLabels([label], [], scale, DUZY_ARKUSZ);
        expect(plan.hiddenDetail, `${kind} @ skala ${scale}`).toEqual([]);
        // TWARDA PODŁOGA EKRANOWA (S9-7): przy skrajnym oddaleniu może
        // zabraknąć proporcji do powiększenia i etykieta trafia do
        // `droppedIdentity` (sygnał T3 layoutu — poza zakresem tej karty),
        // ale NIGDY nie znika bez policzenia w ŻADNYM z dwóch kubełków.
        const narysowana = plan.drawn.some((p) => p.label.ownerRef === `l0/${kind}`);
        const porzucona = plan.droppedIdentity.some((l) => l.ownerRef === `l0/${kind}`);
        expect(narysowana || porzucona, `${kind} @ skala ${scale}: etykieta zgubiona bez policzenia`).toBe(true);
      }
      // Przy skali roboczej (powyżej sufitu proporcji WSZYSTKICH klas
      // typograficznych — najwyższy próg to t1 @0,0769) etykieta JEST
      // narysowana, nie tylko „nie zgubiona".
      const robocza = planSceneLabels([label], [], 1.0, DUZY_ARKUSZ);
      expect(robocza.drawn.map((p) => p.label.ownerRef), kind).toContain(`l0/${kind}`);
      expect(robocza.droppedIdentity, kind).toEqual([]);
    });
  }

  it('L1 (segment-span, t2) UKRYWANE poniżej progu 0,818, WIDOCZNE od niego (dowód, że test nie jest pusty)', () => {
    const label = makeLabel({ ownerRef: 'l1/span', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane' });
    const ukryte = planSceneLabels([label], [], 0.6, DUZY_ARKUSZ);
    expect(ukryte.hiddenDetail.map((l) => l.ownerRef)).toEqual(['l1/span']);
    const widoczne = planSceneLabels([label], [], 1.0, DUZY_ARKUSZ);
    expect(widoczne.hiddenDetail).toEqual([]);
    expect(widoczne.drawn.map((p) => p.label.ownerRef)).toContain('l1/span');
  });

  it('L2 (protection, t4) UKRYWANE poniżej progu 1,125, WIDOCZNE od niego', () => {
    const label = makeLabel({ ownerRef: 'l2/protection', ownerKind: 'protection', labelClass: 't4', labelRole: 'dane' });
    const ukryte = planSceneLabels([label], [], 1.0, DUZY_ARKUSZ);
    expect(ukryte.hiddenDetail.map((l) => l.ownerRef)).toEqual(['l2/protection']);
    const widoczne = planSceneLabels([label], [], 1.3, DUZY_ARKUSZ);
    expect(widoczne.hiddenDetail).toEqual([]);
    expect(widoczne.drawn.map((p) => p.label.ownerRef)).toContain('l2/protection');
  });

  it('@0,9: L1 już WIDOCZNE (próg 0,818 przekroczony), L2 jeszcze UKRYTE (próg 1,125 nie przekroczony) — L1 ujawnia się WCZEŚNIEJ niż L2', () => {
    const l1 = makeLabel({ ownerRef: 'kolejnosc/l1', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane' });
    const l2 = makeLabel({
      ownerRef: 'kolejnosc/l2',
      ownerKind: 'protection',
      labelClass: 't4',
      labelRole: 'dane',
      x: 500,
    });
    const przy09 = planSceneLabels([l1, l2], [], 0.9, DUZY_ARKUSZ);
    // L1 już czytelne (0,9 > 0,818), L2 jeszcze nie (0,9 < 1,125).
    expect(przy09.drawn.map((p) => p.label.ownerRef)).toContain('kolejnosc/l1');
    expect(przy09.hiddenDetail.map((l) => l.ownerRef)).toEqual(['kolejnosc/l2']);
  });
});

describe('T2-LOD §4 — WYJĄTEK BEZWZGLĘDNY: `unresolved` ⇒ pełna etykieta na KAŻDYM poziomie LOD', () => {
  it('etykieta L1 (segment-span) NORMALNIE ukryta @0,6 — z `unresolved:true` pozostaje NARYSOWANA', () => {
    const zwykla = makeLabel({ ownerRef: 'unresolved/l1', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane' });
    const wyjatkowa = { ...zwykla, unresolved: true };
    const planZwykly = planSceneLabels([zwykla], [], 0.6, DUZY_ARKUSZ);
    const planWyjatkowy = planSceneLabels([wyjatkowa], [], 0.6, DUZY_ARKUSZ);
    expect(planZwykly.hiddenDetail.map((l) => l.ownerRef)).toEqual(['unresolved/l1']); // DOWÓD: bez wyjątku BYŁOBY ukryte
    expect(planWyjatkowy.hiddenDetail).toEqual([]);
    expect(planWyjatkowy.drawn.map((p) => p.label.ownerRef)).toContain('unresolved/l1');
  });

  it('etykieta L2 (protection) NORMALNIE ukryta @1,0 — z `unresolved:true` pozostaje NARYSOWANA', () => {
    const zwykla = makeLabel({ ownerRef: 'unresolved/l2', ownerKind: 'protection', labelClass: 't4', labelRole: 'dane' });
    const wyjatkowa = { ...zwykla, unresolved: true };
    const planZwykly = planSceneLabels([zwykla], [], 1.0, DUZY_ARKUSZ);
    const planWyjatkowy = planSceneLabels([wyjatkowa], [], 1.0, DUZY_ARKUSZ);
    expect(planZwykly.hiddenDetail.map((l) => l.ownerRef)).toEqual(['unresolved/l2']);
    expect(planWyjatkowy.hiddenDetail).toEqual([]);
  });

  it('wyjątek trzyma na CAŁEJ drabinie skal (włącznie z MIN_SCALE), nie tylko w jednym punkcie', () => {
    const wyjatkowa = makeLabel({
      ownerRef: 'unresolved/pelna-drabina',
      ownerKind: 'protection',
      labelClass: 't4',
      labelRole: 'dane',
      unresolved: true,
    });
    for (const scale of PELNA_DRABINA_SKAL) {
      const plan = planSceneLabels([wyjatkowa], [], scale, DUZY_ARKUSZ);
      expect(plan.hiddenDetail, `skala ${scale}`).toEqual([]);
    }
  });

  it('wyjątek działa też dla wiersza pasma nazw stacji (`station-name`, rola `dane`)', () => {
    const zwykla = makeLabel({
      ownerRef: 'unresolved/station-row',
      ownerKind: 'station-name',
      labelClass: 't4',
      labelRole: 'dane',
    });
    const wyjatkowa = { ...zwykla, unresolved: true };
    const planZwykly = planSceneLabels([zwykla], [], 1.0, DUZY_ARKUSZ);
    const planWyjatkowy = planSceneLabels([wyjatkowa], [], 1.0, DUZY_ARKUSZ);
    expect(planZwykly.hiddenDetail.map((l) => l.ownerRef)).toEqual(['unresolved/station-row']);
    expect(planWyjatkowy.hiddenDetail).toEqual([]);
  });
});

describe('T2-LOD §5 — licznik „Ukryto N opisów" liczy WYŁĄCZNIE L1/L2, na REALNYCH scenach', () => {
  const sceny = { 0: buildSceneV3(GPZ_ENM, 0), 1: buildSceneV3(GPZ_ENM, 1), 2: buildSceneV3(GPZ_ENM, 2) } as const;

  for (const lod of [0, 1, 2] as readonly SceneLod[]) {
    it(`LOD ${lod}: hiddenDetailContainsL0 jest PUSTA na całej drabinie skal`, () => {
      const scene = sceny[lod];
      const obstacles = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const scale of PELNA_DRABINA_SKAL) {
        const plan = planSceneLabels(scene.labels, obstacles, scale, sheet);
        expect(hiddenDetailContainsL0(plan), `LOD ${lod} @ ${scale}`).toEqual([]);
      }
    });
  }

  it('bramka NIE jest pusta trywialnie: przy niskiej skali sieć referencyjna FAKTYCZNIE ukrywa opisy L1/L2', () => {
    const scene = sceny[2];
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), MIN_SCALE, sheetSizeFor(scene));
    expect(plan.hiddenDetail.length).toBeGreaterThan(0);
    // …a mimo to zbiór L0 w hiddenDetail zostaje pusty (dowód wyżej).
    for (const label of plan.hiddenDetail) {
      expect(['L1', 'L2'], label.ownerRef).toContain(lodClassOf(label));
    }
  });
});

describe('T2-LOD §6 — wyrocznia spójności GRYZIE (sabotaż)', () => {
  it('brak sabotażu: WIELOSTACYJNA sieć referencyjna ma ZERO niespójności klasyfikacji L0', () => {
    const scene = buildSceneV3(WIELOSTACYJNA_ENM, 1);
    expect(labelsWithInconsistentL0Classification(scene.labels)).toEqual([]);
  });

  it('SABOTAŻ 1: `apparatus` (ownerKind L0) z rolą przekłamaną na `dane` JEST wykrywany', () => {
    const uszkodzona: OwnedLabel = {
      ...makeLabel({ ownerRef: 'sabotaz/apparatus', ownerKind: 'apparatus', labelClass: 't4', labelRole: 'tozsamosc' }),
      labelRole: 'dane',
    };
    expect(labelsWithInconsistentL0Classification([uszkodzona])).toEqual(['sabotaz/apparatus']);
  });

  it('SABOTAŻ 2: `segment-span` (ownerKind L1) z rolą przekłamaną na `tozsamosc` JEST wykrywany', () => {
    const uszkodzona: OwnedLabel = {
      ...makeLabel({ ownerRef: 'sabotaz/segment-span', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane' }),
      labelRole: 'tozsamosc',
    };
    expect(labelsWithInconsistentL0Classification([uszkodzona])).toEqual(['sabotaz/segment-span']);
  });
});

// Determinizm: czyste funkcje, bez DOM/Date/losowości — te same wejścia dają
// zawsze ten sam wynik, bez stanu ukrytego między wywołaniami.
describe('T2-LOD §7 — determinizm: te same wejścia = ten sam plan, bez stanu ukrytego', () => {
  it('planSceneLabels jest CZYSTĄ funkcją: dwa wywołania z KLONAMI tych samych danych dają identyczny wynik', () => {
    const scene = buildSceneV3(GPZ_ENM, 2);
    const obstacles = sceneObstacleRects(scene);
    const sheet = sheetSizeFor(scene);
    const scale = 0.5;
    const kopia1 = JSON.parse(JSON.stringify(scene.labels)) as OwnedLabel[];
    const kopia2 = JSON.parse(JSON.stringify(scene.labels)) as OwnedLabel[];
    const plan1 = planSceneLabels(kopia1, obstacles, scale, sheet);
    const plan2 = planSceneLabels(kopia2, obstacles, scale, sheet);
    expect(plan1.drawn.map((p) => [p.label.ownerRef, p.text, p.rect, p.fontSize])).toEqual(
      plan2.drawn.map((p) => [p.label.ownerRef, p.text, p.rect, p.fontSize]),
    );
    expect(plan1.hiddenDetail.map((l) => l.ownerRef)).toEqual(plan2.hiddenDetail.map((l) => l.ownerRef));
    expect(plan1.droppedIdentity.map((l) => l.ownerRef)).toEqual(plan2.droppedIdentity.map((l) => l.ownerRef));
  });

  it('lodClassOf jest CZYSTA: wynik zależy WYŁĄCZNIE od pól etykiety, powtórzone wywołanie identyczne', () => {
    const label = makeLabel({ ownerRef: 'determinizm/1', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane' });
    const wyniki: readonly LodClass[] = Array.from({ length: 5 }, () => lodClassOf(label));
    expect(new Set(wyniki).size).toBe(1);
    expect(wyniki[0]).toBe('L1');
  });
});
