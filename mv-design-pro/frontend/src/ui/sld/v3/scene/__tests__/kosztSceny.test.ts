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
 * ODCISKI RYSUNKU — pin tożsamości bajtowej sceny, declutteru i planu etykiet.
 *
 * POCHODZENIE (S9-9): policzone na drzewie SPRZED optymalizacji indeksu
 * przestrzennego (1dd788f4) i wpisane ręcznie jako DOWÓD, że optymalizacja
 * zmieniła wyłącznie czas.
 *
 * AKTUALIZACJA ŚWIADOMA (karta PROPORCJE, 2026-08-07) — WSZYSTKIE odciski
 * przeliczone, bo karta ZMIENIA RYSUNEK w trzech miejscach naraz i każda z
 * tych zmian jest zamierzona:
 *   (1) sufit powiększenia pisma (`core/text.ts` `maxEnlargement`) — plan
 *       etykiet przy skalach 0,05/0,1/0,2 nie rysuje już napisów, których nie
 *       da się narysować proporcjonalnie (zamiast rysować je 2,8–7,5× większe
 *       od symbolu, który opisują) ⇒ zmienia się `plany` na małych skalach;
 *   (2) podpis pola niesie OZNACZNIK („F01 · liniowe" zamiast „pole liniowe")
 *       ⇒ zmienia się TREŚĆ etykiet i szerokość rezerwacji kolumn, więc także
 *       geometria sceny i wynik declutteru;
 *   (3) kod stacji pada w bloku RAZ (opis sekcji), więc pasmo nazw traci
 *       wiersz z gołym kodem ⇒ krótsze pasmo, inna wysokość bloku stacji.
 * AKTUALIZACJA ŚWIADOMA (karta BLOK-PUSTY, 2026-08-07) — WSZYSTKIE odciski
 * przeliczone ponownie, bo karta zmienia rysunek w dwóch miejscach:
 *   (4) prostokąt etykiety niesie TUSZ, nie rezerwację slotu (`layout/labels.ts`
 *       `tuszWSlocie`) ⇒ zmieniają się prostokąty wierszy pasma nazw, a przez
 *       nie wynik declutteru i planu (mniej fałszywych kolizji: wiersz zajmował
 *       dotąd CAŁĄ szerokość kolumny, choć rysował napis 7,57× węższy);
 *   (5) rezerwacja strony nN bloku stacji liczona `max`, nie sumą
 *       (`layout/measure.ts` `nnSideBelowBusHeight`) ⇒ blok stacji z odbiorem
 *       nN i DER na nN krótszy o 32 j.św., więc inna geometria sceny.
 * Odciski są tu po to, żeby rysunek nie zmienił się PRZYPADKIEM — nie po to,
 * żeby go zamrozić. Zmiana wchodzi w TYM SAMYM commicie co zmiana kodu, z
 * uzasadnieniem wyżej; gdyby którykolwiek z tych mechanizmów wrócił do stanu
 * sprzed karty, test zapali się natychmiast.
 *
 * Kolejność `plany` odpowiada `SKALE`.
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: '2e8a6e22fffa2f87078eaabae0249f52',
      declutter: '5808602b7a97b060d16d27edeea008fc',
      plany: [
        '6f33392b020c9028266f9ee4722709d2',
        '1fe9c18397525c81d19de126c266ba7c',
        '658a25dcda075709843224acbd1a46e1',
        '7230e9f225b6206d85da4a1bfa7542af',
        '5f81cfa88f201375244670bf9ee6be12',
        '2a0743eaa23b14ee099623809b4ebbaa',
        '2a0743eaa23b14ee099623809b4ebbaa',
      ],
    },
    {
      scena: '756459ac883e2099f7b39e5b98746515',
      declutter: 'e8eb6e02cfe030163c868dc48fa3f044',
      plany: [
        'ef56cce4125679c62a21cf1d9c6a509a',
        'f4e07bc2ef06af34d9c44f67aa9b06bb',
        '3a3292455f87d77691c6d123c5f4e0c7',
        '283a4e2a5f25d2208c0aac3a162b5dc9',
        'b3beb01daafd6d16830fad09ece82329',
        '5b2b06e295d7c6b33b627ee5e31efe5b',
        '5b2b06e295d7c6b33b627ee5e31efe5b',
      ],
    },
    {
      scena: 'bda03f4635e203ff883e1680f13e8963',
      declutter: 'db4aca1587e4b48df38610b93e17dbd6',
      plany: [
        '730c2b574b9ed4fb81188097d480466d',
        '36bdd12a7ad4d72034f30929ad3890e2',
        'd265aef7da6bac03392578e3fdf47516',
        '9a28af5b0f93aa0e23462d3c80d6cff0',
        '21a5ee33004c24282c4e74e6d4cae832',
        'aa3331a2769b966c4bac76699b546f9f',
        'aa3331a2769b966c4bac76699b546f9f',
      ],
    },
  ],
  podwojona: [
    {
      scena: '27e2ff4f6ac9fa5a8f48b02b1a14dfca',
      declutter: 'c6e4fd694b64432dc34f82e102559b7f',
      plany: [
        '50cc15c7bbc7766675e3067a331153ae',
        'ce200fc332f2a95eeb0dace2cb043e31',
        'f2c2db8bfd965d6c36e88fbd778dbf91',
        '999d9ea78977efbf3ba6fa2b3c5a691b',
        '2b82c447b6ee78646b68ad1d2955f0ca',
        '21fe0ca5f2623af01d391301351b04e1',
        '21fe0ca5f2623af01d391301351b04e1',
      ],
    },
    {
      scena: '1628d311bd8e1796b7c6fe7a2b0b0eef',
      declutter: '4d047bb2997f9ba17b578a3a9944a990',
      plany: [
        '8a3c980f6ac0e4f84f9eea4ef6f0a687',
        'bf57f9f3b41c3909d4de0c1d9b9c13e9',
        '270960aef5365963c0286f57a9f29301',
        '0cd2856c2c5752b3c30e1d80b7d24d47',
        'c9149428ea1e18df805b0ebfe8675c2e',
        '95061ffb3fe844517c61f6b295c26f73',
        '95061ffb3fe844517c61f6b295c26f73',
      ],
    },
    {
      scena: 'cdadfff1cda4b2115610c4de7d741a5d',
      declutter: 'f7e1fe7fd5aeff81a7ffa99e633320a9',
      plany: [
        'c3567aab447a8e1ae6abeacda3888cf5',
        '33f0670851434f8ac50f11f53902f9fe',
        'fb38183006c5e7b308f87aa7cf4735bc',
        'e7ba4351d8c62caa51cce85c39e075b8',
        'f8bba4c77e467e000e2c7e8cf658bd85',
        '66a8417d522aa78a1eee52feee74071d',
        '66a8417d522aa78a1eee52feee74071d',
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
