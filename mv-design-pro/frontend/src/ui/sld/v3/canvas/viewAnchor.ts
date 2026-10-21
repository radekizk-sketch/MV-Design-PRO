/**
 * KOTWICA WIDOKU — gdzie na rysunku leży obiekt wskazany przez operację
 * domenową (karta B-2, audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §4.3
 * „ogon przesuwa się o pełną szerokość stacji, więc obraz skacze… kamera nie
 * nadąża za miejscem edycji").
 *
 * ---------------------------------------------------------------------------
 * PO CO (pomiar na żywym backendzie 2026-08-07, sieć 50 → 51 stacji)
 * ---------------------------------------------------------------------------
 * Każda zmiana migawki modelu wywoływała w kanwie PEŁNY refit — kamera wracała
 * do widoku całej sieci, kasując pan/zoom projektanta. Zmierzone na scenariuszu
 * audytu (wstawienie stacji na środkowym odcinku magistrali, kanwa 1600×1000):
 *
 * | praca projektanta | skala przed → po | oddalenie | poziom szczegółu |
 * |-------------------|------------------|-----------|------------------|
 * | L2 (aparatura)    | 1,380 → 0,153    | **9,01×** | L2 → **L0**      |
 * | L1 (operatorski)  | 0,699 → 0,153    | **4,56×** | L1 → **L0**      |
 *
 * Po operacji wstawiona stacja miała 79,6 × 28,6 px ekranu (przy skali roboczej
 * ~700 px) — formalnie „w kadrze", praktycznie nie do zobaczenia, a rozwinięcie
 * pól, w których projektant właśnie pracował, znikało wraz ze spadkiem LOD.
 *
 * ---------------------------------------------------------------------------
 * CO ROBI TEN MODUŁ
 * ---------------------------------------------------------------------------
 * Zamienia WSKAZANIE operacji (lista kandydatów z `ui/topology/
 * wskazanieOperacji.ts` — jedno źródło wspólne z selekcją) na PROSTOKĄT ŚWIATA
 * KAMERY, w którym ten obiekt jest narysowany — osobno dla każdego poziomu
 * szczegółu, bo światy L0/L1/L2 mają własne geometrie (spec §7 „osobne
 * rezerwacje"). Kamera (`camera.ts`, akcja `'kotwicz'`) dostaje gotowe
 * prostokąty i nie musi nic wiedzieć o refach ani o scenie.
 *
 * DOPASOWANIE REFU: dokładny `ownerRef` albo kompozyt rysunkowy `ref#…` —
 * TA SAMA konwencja sufiksów, którą odcina w drugą stronę `canvasMenuSubject.
 * menuRefCandidates` (`compose/station.ts`, `compose/gpz.ts`, `layout/labels.ts`).
 * Zero zgadywania po nazwie: kandydat, którego rysunek nie nosi, jest po prostu
 * odrzucany i próbowany jest następny — dokładnie jak w `kanonicznyRefZOperacji`
 * (selekcja sprawdza rozwiązywalność w migawce, kamera w scenie).
 *
 * Moduł jest CZYSTY (zero DOM, zero Reacta, zero fizyki) — testowalny bez
 * renderu.
 */
import type { BoundingBox } from '../../v2/viewport/ViewportController';
import type { SceneLod, SceneV3 } from '../scene/buildScene';
import { SYMBOL_DEFS } from '../symbols/defs';

/** Prostokąty kotwicy dla wszystkich trzech poziomów szczegółu. */
export type AnchorBoxByLod = Readonly<Record<SceneLod, BoundingBox>>;

/**
 * KLUCZE PRZYNALEŻNOŚCI obiektu rysunku o `ownerRef` — wszystkie refy, do których
 * obiekt NALEŻY według konwencji kompozytu `ref#sufiks` (`compose/station.ts`,
 * `compose/gpz.ts`, `layout/labels.ts`): sam `ownerRef` oraz każdy jego prefiks
 * odcięty przed znakiem `#`. Przykład: `stn/A/station#name-row-0` należy do
 * `stn/A/station#name-row-0` i do `stn/A/station`.
 *
 * JEDNO źródło relacji „obiekt należy do elementu" (karta K2, rozstrzygnięcie §0.1):
 * czyta je zarówno kotwica widoku (`prostokatElementuWScenie`), jak i zakres kadru
 * (`zakresKadru.ts`). Dwie niezależne reguły dopasowania byłyby predykatami, które
 * „dziś się zgadzają" (CLAUDE.md, reguła KLASA pkt 3).
 */
export function kluczePrzynaleznosci(ownerRef: string | undefined | null): readonly string[] {
  if (!ownerRef) return [];
  const klucze: string[] = [];
  let indeks = ownerRef.indexOf('#');
  while (indeks > 0) {
    klucze.push(ownerRef.slice(0, indeks));
    indeks = ownerRef.indexOf('#', indeks + 1);
  }
  klucze.push(ownerRef);
  return klucze;
}

/** Czy obiekt rysunku o `ownerRef` należy do elementu modelu `ref` (ta sama
 *  relacja co `kluczePrzynaleznosci`, w postaci predykatu). */
export function nalezyDo(ownerRef: string | undefined | null, ref: string): boolean {
  return !!ownerRef && (ownerRef === ref || ownerRef.startsWith(`${ref}#`));
}

/**
 * INDEKS PRZYNALEŻNOŚCI sceny: klucz przynależności → prostokąt (układ SCENY)
 * obejmujący wszystko, co rysunek maluje dla tego klucza — symbole, odcinki
 * i etykiety. Budowany JEDNYM przejściem po scenie i pamiętany per obiekt sceny
 * (`WeakMap`: scena jest niezmienna, a jej utrata zwalnia indeks).
 *
 * Etykiety wchodzą do prostokąta świadomie — podpis jest częścią rysunku
 * (kontrakt kadru KD-7, `__tests__/kadrTresci.contract.test.tsx`), a stacja bez
 * widocznej nazwy nie jest „w kadrze" w sensie użytecznym dla projektanta.
 */
export type IndeksPrzynaleznosci = ReadonlyMap<string, BoundingBox>;

const INDEKSY = new WeakMap<SceneV3, IndeksPrzynaleznosci>();

export function indeksPrzynaleznosci(scene: SceneV3): IndeksPrzynaleznosci {
  const zapamietany = INDEKSY.get(scene);
  if (zapamietany) return zapamietany;
  const pudla = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
  const obejmij = (ownerRef: string | undefined | null, x0: number, y0: number, x1: number, y1: number): void => {
    for (const klucz of kluczePrzynaleznosci(ownerRef)) {
      const pudlo = pudla.get(klucz);
      if (pudlo) {
        pudlo.minX = Math.min(pudlo.minX, x0);
        pudlo.minY = Math.min(pudlo.minY, y0);
        pudlo.maxX = Math.max(pudlo.maxX, x1);
        pudlo.maxY = Math.max(pudlo.maxY, y1);
      } else {
        pudla.set(klucz, { minX: x0, minY: y0, maxX: x1, maxY: y1 });
      }
    }
  };
  for (const symbol of scene.symbols) {
    const def = SYMBOL_DEFS[symbol.symbolId];
    obejmij(symbol.meta?.ownerRef, symbol.x, symbol.y, symbol.x + def.width, symbol.y + def.height);
  }
  for (const segment of scene.segments) {
    for (const punkt of segment.points) obejmij(segment.meta?.ownerRef, punkt.x, punkt.y, punkt.x, punkt.y);
  }
  for (const label of scene.labels) {
    obejmij(
      label.ownerRef,
      label.rect.x,
      label.rect.y,
      label.rect.x + label.rect.width,
      label.rect.y + label.rect.height,
    );
  }
  INDEKSY.set(scene, pudla);
  return pudla;
}

/** Suma prostokątów `pudla` (`null` dla pustej listy). */
export function sumaProstokatow(pudla: readonly (BoundingBox | null | undefined)[]): BoundingBox | null {
  let wynik: BoundingBox | null = null;
  for (const pudlo of pudla) {
    if (!pudlo) continue;
    wynik = wynik
      ? {
          minX: Math.min(wynik.minX, pudlo.minX),
          minY: Math.min(wynik.minY, pudlo.minY),
          maxX: Math.max(wynik.maxX, pudlo.maxX),
          maxY: Math.max(wynik.maxY, pudlo.maxY),
        }
      : pudlo;
  }
  return wynik;
}

/**
 * Prostokąt (w układzie SCENY) obejmujący wszystko, co rysunek maluje dla
 * elementu `ref`: symbole, odcinki i etykiety. `null` = tego refu nie ma na
 * rysunku tego poziomu. Odczyt z indeksu przynależności (jedno przejście sceny).
 */
export function prostokatElementuWScenie(scene: SceneV3, ref: string): BoundingBox | null {
  return indeksPrzynaleznosci(scene).get(ref) ?? null;
}

/** Prostokąt SUMY elementów `refy` na rysunku sceny (`null`: żaden nie narysowany). */
export function prostokatRefowWScenie(scene: SceneV3, refy: readonly string[]): BoundingBox | null {
  const indeks = indeksPrzynaleznosci(scene);
  return sumaProstokatow(refy.map((ref) => indeks.get(ref)));
}

/**
 * Kotwica dla listy kandydatów: PIERWSZY kandydat narysowany na WSZYSTKICH
 * trzech poziomach szczegółu. Wymóg kompletu jest celowy — kamera przy
 * kotwiczeniu może zmienić poziom (gdy musi oddalić, żeby obiekt się zmieścił),
 * więc kotwica ważna tylko na jednym poziomie byłaby pułapką: po przejściu LOD
 * kadr celowałby w prostokąt z innego świata.
 *
 * `przeliczDoSwiataKamery` mostkuje układ SCENY (w którym liczy `buildSceneV3`)
 * na układ ARKUSZA/KAMERY (scena przesunięta o `FRAME_MARGIN`) — ten sam
 * mostek, którym kanwa przelicza cel fitu (`sceneBoxToCameraWorld`); wołający
 * podaje go jawnie, żeby moduł pozostał wolny od zależności od `SldCanvasV3`.
 */
export function kotwicaWidoku(
  sceneByLod: Readonly<Record<SceneLod, SceneV3>>,
  kandydaci: readonly string[],
  przeliczDoSwiataKamery: (bbox: BoundingBox) => BoundingBox,
): { readonly ref: string; readonly boxByLod: AnchorBoxByLod } | null {
  for (const ref of kandydaci) {
    const l0 = prostokatElementuWScenie(sceneByLod[0], ref);
    const l1 = prostokatElementuWScenie(sceneByLod[1], ref);
    const l2 = prostokatElementuWScenie(sceneByLod[2], ref);
    if (!l0 || !l1 || !l2) continue;
    return {
      ref,
      boxByLod: {
        0: przeliczDoSwiataKamery(l0),
        1: przeliczDoSwiataKamery(l1),
        2: przeliczDoSwiataKamery(l2),
      },
    };
  }
  return null;
}
