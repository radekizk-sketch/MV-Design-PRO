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

/** Czy obiekt rysunku o `ownerRef` należy do elementu modelu `ref`. */
function nalezyDo(ownerRef: string | undefined | null, ref: string): boolean {
  return !!ownerRef && (ownerRef === ref || ownerRef.startsWith(`${ref}#`));
}

/**
 * Prostokąt (w układzie SCENY) obejmujący wszystko, co rysunek maluje dla
 * elementu `ref`: symbole, odcinki i etykiety. `null` = tego refu nie ma na
 * rysunku tego poziomu.
 *
 * Etykiety wchodzą do prostokąta świadomie — podpis jest częścią rysunku
 * (kontrakt kadru KD-7, `__tests__/kadrTresci.contract.test.tsx`), a stacja bez
 * widocznej nazwy nie jest „w kadrze" w sensie użytecznym dla projektanta.
 */
export function prostokatElementuWScenie(scene: SceneV3, ref: string): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const obejmij = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const symbol of scene.symbols) {
    if (!nalezyDo(symbol.meta?.ownerRef, ref)) continue;
    const def = SYMBOL_DEFS[symbol.symbolId];
    obejmij(symbol.x, symbol.y);
    obejmij(symbol.x + def.width, symbol.y + def.height);
  }
  for (const segment of scene.segments) {
    if (!nalezyDo(segment.meta?.ownerRef, ref)) continue;
    for (const punkt of segment.points) obejmij(punkt.x, punkt.y);
  }
  for (const label of scene.labels) {
    if (!nalezyDo(label.ownerRef, ref)) continue;
    obejmij(label.rect.x, label.rect.y);
    obejmij(label.rect.x + label.rect.width, label.rect.y + label.rect.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
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
