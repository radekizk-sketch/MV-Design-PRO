/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — JEDNO źródło „uchwytu stacji" w testach SLD.
 *
 * Do tej karty stacja i GPZ miały na L0 symbol zbiorczy (`elementKind: 'station'`, blok
 * zwinięty), a testy kanwy szukały stacji predykatem `s.meta?.elementKind === 'station'`
 * powielonym w kilkunastu plikach. Blok zwinięty skasowano (jedna kompozycja na każdym LOD),
 * więc stację na rysunku identyfikuje jej NAZWA (wiersz tożsamości pasma nazw,
 * `ownerKind: 'station-name'`, `ownerRef: <ref stacji>#name-row-0`, ten sam na L0/L1/L2),
 * a UCHWYTEM kliku jest jej OBRYS (decyzja A: rama strefy GPZ albo obwiednia symboli stacji,
 * `canvas/hitAreas.ts::stacjeSceny`) — obecny także wtedy, gdy plan czytelności zdejmie nazwę.
 *
 * Wiersze nazw transformatora i źródła mają ten sam `ownerKind`, ale ref `…#label#name-row-0`
 * — nie są uchwytem stacji. Testy pytają tutaj, nie powielają selektora.
 */
import type { SceneV3 } from '../ui/sld/v3/scene/buildScene';

const SUFIKS_NAZWY = '#name-row-0';

type EtykietaSceny = SceneV3['labels'][number];

export interface NazwaStacji {
  /** Indeks etykiety w `scene.labels`. */
  readonly index: number;
  readonly label: EtykietaSceny;
  /** Ref stacji (GPZ albo stacja SN/nN) — kotwica w modelu. */
  readonly stationRef: string;
}

/** Czy etykieta jest wierszem tożsamości STACJI (nie transformatora ani źródła). */
export function jestNazwaStacji(label: EtykietaSceny): boolean {
  return (
    label.ownerKind === 'station-name'
    && label.ownerRef.endsWith(SUFIKS_NAZWY)
    && !label.ownerRef.includes('#label#')
  );
}

/** Wiersze nazw wszystkich stacji sceny w kolejności etykiet. */
export function nazwyStacji(scene: SceneV3): readonly NazwaStacji[] {
  const wynik: NazwaStacji[] = [];
  scene.labels.forEach((label, index) => {
    if (jestNazwaStacji(label)) {
      wynik.push({ index, label, stationRef: label.ownerRef.slice(0, -SUFIKS_NAZWY.length) });
    }
  });
  return wynik;
}

/** Wiersz nazwy stacji: wskazanej refem albo — bez refu — pierwszej stacji sceny. */
export function nazwaStacji(scene: SceneV3, stationRef?: string): NazwaStacji | undefined {
  return nazwyStacji(scene).find((n) => stationRef === undefined || n.stationRef === stationRef);
}

/** Pierwsza stacja SN/nN sceny (nie GPZ) — wiersz jej nazwy. */
export function nazwaStacjiSn(scene: SceneV3): NazwaStacji | undefined {
  return nazwyStacji(scene).find((n) => !n.stationRef.startsWith('gpz/'));
}

/** Uchwyt STACJI w warstwie `sld-v3-trafienia` — krawędź obrysu stacji (rama strefy GPZ albo
 *  obwiednia symboli stacji SN/nN, decyzja A karty), węzeł, w który w przeglądarce faktycznie
 *  trafia kursor (rysunek kanwy jest bierny). Istnieje na każdym LOD i przy każdym planie
 *  czytelności — nie zależy od nazwy. */
export function uchwytStacji(container: ParentNode, stationRef: string): Element | null {
  return container.querySelector(
    `[data-hit-klasa="stacja"][data-hit-role="obrys"][data-hit-owner-ref="${stationRef}"]`,
  );
}

/** Uchwyt NAZWY stacji (wiersz tożsamości) — obecny tylko, gdy plan czytelności rysuje nazwę. */
export function uchwytNazwyStacji(container: ParentNode, stationRef: string): Element | null {
  return container.querySelector(
    `[data-hit-klasa="etykieta"][data-hit-role="obrys"][data-hit-owner-ref="${stationRef}${SUFIKS_NAZWY}"]`,
  );
}

/** Stacje SN/nN sceny (bez GPZ) z uchwytem obrysu w drzewie kanwy (filtr warstw może uchwyt
 *  zdjąć razem z obiektem). */
export function stacjeSnZUchwytem(
  container: ParentNode,
  scene: SceneV3,
): readonly { readonly stationRef: string; readonly uchwyt: Element }[] {
  const wynik: { stationRef: string; uchwyt: Element }[] = [];
  for (const n of nazwyStacji(scene)) {
    if (n.stationRef.startsWith('gpz/')) continue;
    const uchwyt = uchwytStacji(container, n.stationRef);
    if (uchwyt) wynik.push({ stationRef: n.stationRef, uchwyt });
  }
  return wynik;
}
