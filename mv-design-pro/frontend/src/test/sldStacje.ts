/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — JEDNO źródło „uchwytu stacji" w testach SLD.
 *
 * Do tej karty stacja i GPZ miały na L0 symbol zbiorczy (`elementKind: 'station'`, blok
 * zwinięty), a testy kanwy szukały stacji predykatem `s.meta?.elementKind === 'station'`
 * powielonym w kilkunastu plikach. Blok zwinięty skasowano (jedna kompozycja na każdym LOD),
 * więc obiekt STACJI reprezentuje na rysunku jej NAZWA: wiersz tożsamości pasma nazw
 * (`ownerKind: 'station-name'`, `ownerRef: <ref stacji>#name-row-0`) — ten sam na L0/L1/L2.
 * Trafienie w nazwę rozstrzyga kotwica w modelu (`canvasMenuSubject.resolveCanvasMenuSubject`
 * → stacja), tak samo jak dawniej trafienie w blok.
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

/** Uchwyt trafienia nazwy stacji w warstwie `sld-v3-trafienia` — węzeł, w który
 *  w przeglądarce faktycznie trafia kursor (rysunek kanwy jest bierny). */
export function uchwytStacji(container: ParentNode, stationRef: string): Element | null {
  return container.querySelector(
    `[data-hit-klasa="etykieta"][data-hit-role="obrys"][data-hit-owner-ref="${stationRef}${SUFIKS_NAZWY}"]`,
  );
}

/** Stacje SN/nN sceny (bez GPZ), których nazwa ma uchwyt trafienia w bieżącym kadrze kanwy —
 *  stacje poza kadrem albo z nazwą zdjętą planem czytelności uchwytu nie mają. */
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
