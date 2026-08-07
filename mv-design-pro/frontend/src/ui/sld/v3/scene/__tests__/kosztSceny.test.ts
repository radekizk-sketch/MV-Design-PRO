/**
 * KOSZT SCENY I PŁYNNOŚĆ GESTU — pin tożsamości bajtowej + budżet (karta S9-9).
 *
 * CO ZAMYKA TA KARTA (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`, wiersz
 * S9-9). Plan etykiet (`canvas/labelLegibility.ts`) jest liczony w ŚCIEŻCE GESTU
 * — `SldCanvasV3` przelicza go przy każdej zmianie skali kamery, czyli przy
 * każdym kliknięciu kółka myszy. Rozstrzygał kolizje przeglądem LINIOWYM całego
 * zbioru przeszkód, więc koszt rósł kwadratowo z liczbą etykiet: zmierzone
 * 0,13 s (54 stacje), 0,45 s (107) i 1,03 s (160) NA JEDNĄ KLATKĘ. Ten sam
 * mechanizm i ten sam koszt miał silnik etykiet przy budowie sceny
 * (`layout/declutter.ts`). Oba liczą teraz predykat indeksem przestrzennym
 * (`core/rectIndex.ts`).
 *
 * DLACZEGO ODCISKI, A NIE „testy zachowania". Optymalizacja ma prawo zmienić
 * WYŁĄCZNIE czas. Rysunek techniczny — pozycje i treść etykiet, zbiór odrzuconych
 * — musi zostać CO DO BAJTU ten sam, bo od niego zależy odbiór (`accept:sld-v3`),
 * eksport i porównania wizualne. Odciski niżej policzono na drzewie SPRZED
 * optymalizacji (commit bazowy 1dd788f4) i wpisano tu ręcznie — są dowodem
 * równoważności, a nie zapisem stanu po zmianie.
 *
 * GDY TEN TEST ZAŚWIECI NA CZERWONO. To znaczy, że scena albo plan etykiet
 * ZMIENIŁY SIĘ merytorycznie. Jeśli zmiana jest zamierzona (nowa reguła układu,
 * nowa etykieta), odciski aktualizuje się ŚWIADOMIE, w tym samym commicie co
 * zmiana i z uzasadnieniem — nigdy „żeby przeszło". Jeśli zmiany nie planowano,
 * to jest regresja rysunku.
 *
 * CZEGO TEN PLIK NIE MIERZY (uczciwie). Budżet czasu liczony jest w jsdom na
 * maszynie CI — to NIE jest pomiar klatki przeglądarki: nie ma tu układu,
 * rasteryzacji ani rywalizacji o wątek główny. Mierzymy to, czego jsdom mierzyć
 * MOŻE i co jest właściwym przedmiotem tej karty: czas SYNCHRONICZNYCH przeliczeń,
 * które ścieżka gestu wykonuje na wątku głównym między zdarzeniem a renderem.
 * Próg jest luźny (poniżej), bo służy wykryciu POWROTU kosztu kwadratowego,
 * a nie stopniowaniu wydajności.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { planSceneLabels } from '../../canvas/labelLegibility';
import { declutterLabels } from '../../layout/declutter';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../buildScene';
import { synthLargeTrunk } from './syntheticNetworks';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURA = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);

const siecReferencyjna = JSON.parse(readFileSync(FIXTURA, 'utf8')).enm as EnergyNetworkModel;
/** Sieć podwojona — ta sama maszyneria co w testach skalowalności (rodzina H). */
const siecPodwojona = synthLargeTrunk(siecReferencyjna, 2);

/** Drabina skal gestu: od kadru „cała sieć" po zoom roboczy. */
const SKALE = [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3] as const;
const LODY: readonly SceneLod[] = [0, 1, 2];

const odcisk = (v: unknown): string =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

interface OdciskiLod {
  readonly scena: string;
  readonly declutter: string;
  readonly plany: readonly string[];
}

/**
 * ODCISKI Z DRZEWA SPRZED OPTYMALIZACJI (1dd788f4) — patrz nagłówek pliku.
 * Kolejność `plany` odpowiada `SKALE`.
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: 'def9a97355eba8762a75023abec12328',
      declutter: '88b3e222d779c0f0b34672aac1c2fe16',
      plany: [
        'c2a8ee4c7f952ac580153c55a031c962',
        '4bee56f66aae90249fdb67b836b92e4b',
        '71ee7b3137572078f287cb69100333c8',
        'eb1257eba93c96d9ea4e92671d058641',
        '062ccfaf3321178165252feb0b25f31c',
        'b43e53f3ed9194fff1fc66a1a880ac76',
        'b43e53f3ed9194fff1fc66a1a880ac76',
      ],
    },
    {
      scena: '98021e8b6689553ce650a902dc8ab739',
      declutter: 'e4b3cf3e73944d9702bd82ef3807eed1',
      plany: [
        'd52148afca6f0509c2d63d0f4250b591',
        '44fe1e37a6f4007e9e58efa9c7243903',
        'f2629e12ef9e1c3e7d5be9c8b8a0af11',
        'b7819e4a8f53497f10da7c47542aa2d2',
        '30d5a0b7509498686e519b4dc84fec37',
        '5df2a11612b4c787e1b45c06d4df08ff',
        '5df2a11612b4c787e1b45c06d4df08ff',
      ],
    },
    {
      scena: '26a2a847b0c37ec9afdd39d1b447d60a',
      declutter: 'c1fc62a45fdabf5f9bdf35b980ec9111',
      plany: [
        'b8f0460e238318e60a2ad2d2678afda9',
        'f1b6405f6c1317b8ff60dd05b9c297b7',
        '73d6f1ba82145b03b98c272d7bac66d1',
        '86fa96625f3a33bde686e10b6eba6c7a',
        '342f82d90d67b42eec5281e1750968ce',
        '38dad5d05b0287127116be0169eaa45f',
        '38dad5d05b0287127116be0169eaa45f',
      ],
    },
  ],
  podwojona: [
    {
      scena: '7ddd709589c9b5303c3d6e2c5baf8e2d',
      declutter: '90eb06c3184d8535d1b95fc5f57cc693',
      plany: [
        '4e78aa1c6e1780904529a0e3f38d35c4',
        '82ece76ea4019cb307485d58e2c26c1e',
        '789576a1b5620a7ddac3546b65a3ffee',
        'ea91f859702f92c565fe33e30a525728',
        '6edbd79bddc248b9ca7100e490dcd1c4',
        '4db3455c9329730248fe408622e82c0d',
        '4db3455c9329730248fe408622e82c0d',
      ],
    },
    {
      scena: '4eb024e55968024c02b899e614b92c46',
      declutter: '1e35a0a0e9982cc9a8663d03d1f20abf',
      plany: [
        '582c2a30b639b8153e8bb7e47551b5ce',
        '8eae2e182247a36136b90768cfb522a7',
        'e401415b0bf5deea3e9d6aa046e7ed48',
        'bd34161efe0b0fc7f23d333e0271b966',
        '6e8bbd21e278ab9cbabac8a72dad34d1',
        '4572e0172d4ac2fbe31a024744672e5c',
        '4572e0172d4ac2fbe31a024744672e5c',
      ],
    },
    {
      scena: 'e610c3e813a74aa31c6a34688aef2d8d',
      declutter: '1d6d62eee440ea6894d242743665d020',
      plany: [
        '425f6a0ec8094dd2f93f06aa7d19c76a',
        'd281eefd9c23401e64a87e4329fc062f',
        '61b2c05161657ed694d425e0ac1be680',
        'c06ebe7aa5dc1cf34c8ea571b2735361',
        'cbc72658df48f7e25ea6328ec91f8836',
        '427ef3d7cbd92feed97a2c6dd17421a0',
        '427ef3d7cbd92feed97a2c6dd17421a0',
      ],
    },
  ],
};

const SIECI = [
  ['referencyjna', siecReferencyjna],
  ['podwojona', siecPodwojona],
] as const;

describe('S9-9 — tożsamość bajtowa sceny, declutteru i planu etykiet', () => {
  it.each(SIECI)('sieć %s: odciski scen L0/L1/L2 jak przed optymalizacją', (nazwa, model) => {
    const policzone = LODY.map((lod) => odcisk(buildSceneV3(model, lod)));
    expect(policzone).toEqual(ODCISKI_BAZOWE[nazwa].map((o) => o.scena));
  });

  it.each(SIECI)('sieć %s: odciski wyniku silnika etykiet L0/L1/L2', (nazwa, model) => {
    const policzone = LODY.map((lod) => {
      const scena = buildSceneV3(model, lod);
      return odcisk(declutterLabels(scena.labels, sceneObstacleRects(scena)));
    });
    expect(policzone).toEqual(ODCISKI_BAZOWE[nazwa].map((o) => o.declutter));
  });

  it.each(SIECI)('sieć %s: odciski PLANU etykiet — iloczyn LOD × skala gestu', (nazwa, model) => {
    // ILOCZYN CECH (reguła KLASA §2): defekt indeksu ujawnia się dopiero przy
    // etykietach POWIĘKSZONYCH (małe skale) — same skale robocze przechodzą
    // ścieżką szybką i niczego nie dowodzą. Stąd pełna drabina skal × 3 LOD.
    const policzone = LODY.map((lod) => {
      const scena = buildSceneV3(model, lod);
      const przeszkody = sceneObstacleRects(scena);
      return SKALE.map((skala) => odcisk(planSceneLabels(scena.labels, przeszkody, skala)));
    });
    expect(policzone).toEqual(ODCISKI_BAZOWE[nazwa].map((o) => o.plany));
  });
});

describe('S9-9 — budżet przeliczeń synchronicznych ścieżki gestu', () => {
  /** Mediana z kilku przebiegów — odporniejsza na chwilowe zajęcie maszyny CI. */
  function mediana(fn: () => unknown, powtorzenia = 5): number {
    const czasy: number[] = [];
    for (let i = 0; i < powtorzenia; i++) {
      const t0 = performance.now();
      fn();
      czasy.push(performance.now() - t0);
    }
    czasy.sort((a, b) => a - b);
    return czasy[Math.floor(czasy.length / 2)];
  }

  /** Najdroższa skala gestu (etykiety powiększone) na danej sieci. */
  function najgorszyPlan(model: EnergyNetworkModel): number {
    const scena = buildSceneV3(model, 2);
    const przeszkody = sceneObstacleRects(scena);
    return Math.max(...SKALE.map((s) => mediana(() => planSceneLabels(scena.labels, przeszkody, s))));
  }

  it('plan etykiet mieści się w budżecie klatki na sieci podwojonej (107 stacji)', () => {
    // PRÓG 100 ms wprost z kryterium odbioru karty („zero klatek > 100 ms przy
    // zoomie"). Zmierzone po naprawie: ~26 ms (przed naprawą: 451 ms — próg
    // przekroczony 4,5-krotnie). Zapas jest celowy: to wykrywacz POWROTU kosztu
    // kwadratowego, nie miernik wydajności maszyny.
    expect(najgorszyPlan(siecPodwojona)).toBeLessThan(100);
  });

  it('koszt planu rośnie LINIOWO, nie kwadratowo, z rozmiarem sieci', () => {
    // Kryterium ILORAZOWE zamiast bezwzględnego — nie zależy od szybkości
    // maszyny. Sieć podwojona ma 2× więcej etykiet: koszt liniowy daje ~2×,
    // kwadratowy ~4×. Próg 3× rozdziela te dwa reżimy.
    // PODŁOGA BEZWZGLĘDNA (wzorzec z V12K-325: iloraz na podsekundowych
    // pomiarach mierzy szum planisty, nie algorytm): przy pomiarze bazowym
    // poniżej 2 ms iloraz jest nierozstrzygalny i asercji nie wykonujemy —
    // moc detekcyjna zostaje, bo koszt kwadratowy tej podłogi nie osiąga.
    const bazowy = najgorszyPlan(siecReferencyjna);
    const podwojony = najgorszyPlan(siecPodwojona);
    if (bazowy < 2) return;
    expect(podwojony / bazowy).toBeLessThan(3);
  });
});
