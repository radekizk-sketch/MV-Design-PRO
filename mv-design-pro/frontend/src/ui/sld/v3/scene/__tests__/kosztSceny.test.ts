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
 * Odciski są tu po to, żeby rysunek nie zmienił się PRZYPADKIEM — nie po to,
 * żeby go zamrozić. Zmiana wchodzi w TYM SAMYM commicie co zmiana kodu, z
 * uzasadnieniem wyżej; gdyby którykolwiek z tych trzech mechanizmów wrócił do
 * stanu sprzed karty, test zapali się natychmiast.
 *
 * Kolejność `plany` odpowiada `SKALE`.
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: '3b8146a2511065b360990f83b65531b7',
      declutter: 'c5d80dae0b18e54c8234fa131df9fa9b',
      plany: [
        '92078ab272e7c7ca0ccc1b51ac403996',
        '5e6b5aeae5880d6556ec65b5edf30cf4',
        '2953761450935d7e7aef43d62db5c1b7',
        '07a9358d5fb7b2c1af66b97d249f89fc',
        '17518dfdfa5c1c8f62449d036d3f95e7',
        '2cc85bd3ac36d5130eaef3d4d96fe344',
        '2cc85bd3ac36d5130eaef3d4d96fe344',
      ],
    },
    {
      scena: 'd8ff210594365c67d691d9c9ae6dff3f',
      declutter: '0082823ee9b92577e0296576b267d87d',
      plany: [
        '078c313f8eaa1c3c643a56adbb30721a',
        'dd17b0d2b6b48f46abbe3839e2e538fe',
        'a68f30ed382c4c3fe9559f6efa2c99ae',
        'c836780bbce645a6a65a032339ea34c0',
        'ae49d243aed0fac2f22b05697e62d8c2',
        'f4f60df664dba8dbfbc9c8e3c8e98f30',
        'f4f60df664dba8dbfbc9c8e3c8e98f30',
      ],
    },
    {
      scena: 'a4f08a2fe0a8ebfc75753afa14920e18',
      declutter: 'df9c403af3fa63915f418478beb1c6e5',
      plany: [
        '3f9606a7d7da60fe08fe2cb41346a123',
        '0b19d1ff785a15b69f3590c0523e0df7',
        'eec376ad254389622400e7ab73fef179',
        '7205d166c6283b2e365b3d33c494659c',
        'd20c09defed942b2e44961ada826fb12',
        '9bd6f99fc2ad6d848d1e4548e9708d4a',
        '9bd6f99fc2ad6d848d1e4548e9708d4a',
      ],
    },
  ],
  podwojona: [
    {
      scena: '30d5e0a91782f5276fd66a66f506f3c9',
      declutter: 'aa37705358f048fff40125daf28a3eb9',
      plany: [
        '9f71403c4f75f99124aa81a22d2b0356',
        '07f199b096af46ab807963913d8437d2',
        '515bd2888106975154a2531be5ec510a',
        '494fcf6d7fb3c359af6ff9e795039509',
        '57aa8f74d1e889f70a5fc492d02a8614',
        '1c3875640d5a1cc3b45b74d86ec49cf2',
        '1c3875640d5a1cc3b45b74d86ec49cf2',
      ],
    },
    {
      scena: '852b319b42a150f5ebc6000b3bf99e94',
      declutter: 'e3e624fbc868f76b4cfd1feae2330ff7',
      plany: [
        '76d68c91a0cd06e4b608725930a1e2eb',
        '7b50bb1f270dc6c00674ab5a9354d7a9',
        '864ce7dd445e155bb0b5f54ade921252',
        '1440d88cf9451e423f748cc3f43d0082',
        '31d1626ace08c534d2dbc7385d580e9d',
        'd252ce367f9abbd9d30a10968d907a79',
        'd252ce367f9abbd9d30a10968d907a79',
      ],
    },
    {
      scena: '6be1e3c5e3adf89be06d66f89057ca1c',
      declutter: '0561a6773e612f58286c7583ff9f05e9',
      plany: [
        '224fa5b9e1f242729893fd2132743c80',
        '250ea46485eb925191b89ecb86fbcace',
        '6230b063e9a2e1295aa3674dd167f560',
        'fe69fcad226f8da7cf31acd90f7353e0',
        '49161b949b1cb12a36fb1e62c7162cb6',
        '84e0c97fa1c5882d3d923a094d72abdf',
        '84e0c97fa1c5882d3d923a094d72abdf',
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
