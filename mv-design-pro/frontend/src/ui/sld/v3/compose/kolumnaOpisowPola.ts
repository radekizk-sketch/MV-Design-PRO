/**
 * Kolumny opisów pola przy jego lewej krawędzi — JEDNA reguła pola GPZ (`compose/gpz.ts`) i pola
 * stacji (`compose/station.ts`, rezerwacja w `layout/measure.ts`).
 *
 * Wzorzec właściciela z 2026-11-05 (pole liniowe Z.11.1, rysunek wzorcowy): „Opisy pól po lewej
 * dzięki temu pole robi się czytelniejsze i węższe”. Pole ma dwie kolumny opisów przy lewej
 * krawędzi, przed torem głównym:
 *  1. kolumna OZNACZEŃ — oznaczenia WSZYSTKICH aparatów pola (tor główny, aparaty boczne,
 *     kolumna odgałęzienia i jej aparaty boczne: PF0, Q1, Q0, Q5, GK1, T3, T1, PF1, GK, T2),
 *     wyrównane do lewej w jednej krawędzi, każde w wierszu swojego symbolu;
 *  2. kolumna PRZEKŁADNI — tabliczki przekładników (15/√3 / 0,1/√3 kV, 200–400/5, 1/100)
 *     i montaż przekładnika napięciowego, wyrównane do lewej tuż za kolumną oznaczeń, w wierszu
 *     oznaczenia swojego aparatu.
 * Na prawo od toru głównego nie stoi żaden opis aparatu — kolumna odgałęzienia stoi tuż przy
 * torze, blok zabezpieczeń tuż za nią, a pole jest węższe.
 *
 * Pas (`pasyOpisowPola`) i wiersze (`wierszeOpisowPola`) liczy ten moduł; rezerwacja kolumny pola
 * i rysunek biorą je z tych samych funkcji (predykaty parami z jednego źródła).
 */
import { GRID, snapToGrid, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth, type LabelClass } from '../core/text';
import type { MiniBlockBayDescriptor } from '../../v2/model/widokPolStacji';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { apparatusIdentifiers, rekordyToruPola, resolveBayApparatusSymbolIds } from './apparatusSequence';
import { PROTECTION_FULL_LIST_LABEL_CLASS, tekstyOpisowPrzekladnika } from './protectionMarking';

/** Opis jednego aparatu pola: oznaczenie (albo brak) i teksty tabliczek jego przekładnika. */
export interface OpisAparatuPola {
  readonly oznaczenie: string | null;
  readonly tabliczki: readonly string[];
}

/** Rodzaje aparatów pola, których oznaczenie (T1, T2, T3) jest na rysunku od LOD1 — odbiór B-02
 *  właściciela 2026-11-04 pkt 6: „LOD0 — same symbole; LOD1 — oznaczenia (T1, T2, T3); LOD2 —
 *  krótkie przekładnie”. Pozostałe oznaczenia aparatów i przekładnie — LOD2. JEDNA reguła pola
 *  GPZ (`compose/gpz.ts`) i pola stacji (`compose/station.ts`). */
export const RODZAJE_PRZEKLADNIKOW_OD_LOD1: ReadonlySet<string> = new Set(['CT', 'VT', 'CORE_BALANCE_CT']);

/** Opis aparatu pola stacji: oznaczenie, tabliczki i poziom szczegółu, od którego oznaczenie
 *  jest na rysunku (`odLod`; brak = LOD2). */
export interface OpisAparatuPolaStacji extends OpisAparatuPola {
  readonly odLod?: 1;
}

/** Szerokości kolumn opisów pola [j.św.]. `szerokosc` = suma — odległość lewej krawędzi pola
 *  od lewej krawędzi toru głównego (bez pasów własnych pola, np. oznaczeń zacisków P1/P2). */
export interface PasyOpisowPola {
  readonly oznaczenia: number;
  readonly przekladnie: number;
  readonly szerokosc: number;
}

/**
 * Szerokości kolumny oznaczeń i kolumny przekładni pola. Kolumna = najszerszy tekst + oczko
 * prześwitu za nim, w górę do siatki (lewa krawędź kolejnej kolumny i toru leży na siatce,
 * spec §2); kolumna bez treści ma szerokość 0. Tekst stoi od lewej krawędzi swojej kolumny
 * (`wierszeOpisowPola`, prześwit 0), więc prześwit za tekstem oddziela go od następnej kolumny
 * albo od najszerszego symbolu toru.
 */
export function pasyOpisowPola(
  opisy: readonly OpisAparatuPola[],
  klasaOznaczen: LabelClass,
  klasaTabliczek: LabelClass,
): PasyOpisowPola {
  const kolumna = (szerokosci: readonly number[]): number =>
    szerokosci.length > 0 ? snapUp(Math.max(...szerokosci) + GRID) : 0;
  const oznaczenia = kolumna(
    opisy.flatMap((o) => (o.oznaczenie ? [measureLabelWidth(o.oznaczenie, klasaOznaczen)] : [])),
  );
  const przekladnie = kolumna(opisy.flatMap((o) => o.tabliczki.map((t) => measureLabelWidth(t, klasaTabliczek))));
  return { oznaczenia, przekladnie, szerokosc: oznaczenia + przekladnie };
}

/** Prostokąt definicji symbolu aparatu w świecie — `symbolOpisu` opisów w kolumnach (powiązanie
 *  opis → aparat, `layout/labels.ts`) i środek wiersza (`WierszOpisuWejscie.srodekY`). */
export function prostokatSymbolu(d: { readonly symbolId: SymbolId; readonly x: number; readonly y: number }): V3Rect {
  const def = SYMBOL_DEFS[d.symbolId];
  return { x: d.x, y: d.y, width: def.width, height: def.height };
}

/** Wejście jednego wiersza opisów: środek symbolu aparatu, jego położenie X (kolejność przy
 *  równej wysokości), czy aparat ma oznaczenie, ile tabliczek. */
export interface WierszOpisuWejscie {
  readonly srodekY: number;
  readonly symbolX: number;
  readonly zOznaczeniem: boolean;
  readonly liczbaTabliczek: number;
}

/** Ułożony wiersz opisów: środek oznaczenia (`null` — bez oznaczenia) i środki kolejnych
 *  tabliczek (kotwice `anchor.y` etykiet). */
export interface WierszOpisu {
  readonly oznaczenieY: number | null;
  readonly tabliczkiY: readonly number[];
}

/**
 * Wiersze kolumn opisów pola, index-aligned do wejścia. Wiersz stoi na wysokości środka swojego
 * symbolu; tabliczki aparatu — od górnej krawędzi wiersza, kolejne pod poprzednią (krok w górę do
 * siatki). Aparaty o zachodzących wysokościach (aparat boczny obok aparatu toru — uziemnik
 * i ogranicznik przy transformatorze pola stacji; Z.11 wykonanie stałe: głowica GK1 odgałęzienia
 * i uziemnik Q51 obok) dają wiersze, które nachodziłyby na siebie: takie wiersze tworzą BLOK
 * ułożony jeden pod drugim (kolejność: środek symbolu, położenie X, kolejność wejścia —
 * deterministyczna), wyśrodkowany na średniej środków ich symboli — każdy wiersz zostaje możliwie
 * blisko swojego symbolu (rozsunięcie w obie strony, nie tylko w dół), a dwa bloki, które się
 * zetkną, łączą się w jeden. Górne krawędzie wierszy leżą na siatce (ta sama reguła co
 * rozwiązywacz etykiet, `prostokatEtykietyZakotwiczonej`), więc ani oznaczenia, ani tabliczki
 * dwóch wierszy nie nachodzą na siebie.
 */
export function wierszeOpisowPola(
  wiersze: readonly WierszOpisuWejscie[],
  klasaOznaczen: LabelClass,
  klasaTabliczek: LabelClass,
): WierszOpisu[] {
  const hOznaczenia = labelLineHeight(klasaOznaczen);
  const hTabliczki = labelLineHeight(klasaTabliczek);
  const krokTabliczki = snapUp(hTabliczki);
  const wynik: WierszOpisu[] = wiersze.map(() => ({ oznaczenieY: null, tabliczkiY: [] }));
  const kolejnosc = wiersze
    .map((_, i) => i)
    .filter((i) => wiersze[i].zOznaczeniem || wiersze[i].liczbaTabliczek > 0)
    .sort((a, b) => wiersze[a].srodekY - wiersze[b].srodekY || wiersze[a].symbolX - wiersze[b].symbolX || a - b);
  // Wysokość wiersza (oznaczenie albo stos tabliczek) i jego miejsce w bloku (w górę do siatki —
  // górna krawędź następnego wiersza bloku na siatce).
  const wysokosc = (i: number): number =>
    Math.max(wiersze[i].zOznaczeniem ? hOznaczenia : 0, wiersze[i].liczbaTabliczek > 0 ? hTabliczki + (wiersze[i].liczbaTabliczek - 1) * krokTabliczki : 0);
  interface Blok { readonly czlonkowie: number[]; gora: number }
  const ulozBlok = (czlonkowie: number[]): Blok => {
    const sloty = czlonkowie.map((i) => snapUp(wysokosc(i)));
    const razem = sloty.reduce((a, b) => a + b, 0) - sloty[sloty.length - 1] + wysokosc(czlonkowie[czlonkowie.length - 1]);
    const srodek = czlonkowie.reduce((a, i) => a + wiersze[i].srodekY, 0) / czlonkowie.length;
    return { czlonkowie, gora: snapToGrid(srodek - razem / 2) };
  };
  const dolBloku = (b: Blok): number => {
    let y = b.gora;
    b.czlonkowie.forEach((i, k) => {
      y += k < b.czlonkowie.length - 1 ? snapUp(wysokosc(i)) : wysokosc(i);
    });
    return y;
  };
  const bloki: Blok[] = [];
  for (const i of kolejnosc) {
    let blok = ulozBlok([i]);
    // Łączenie z poprzednim blokiem, dopóki nachodzą (scalony blok może dosięgnąć wcześniejszego).
    while (bloki.length > 0 && blok.gora < dolBloku(bloki[bloki.length - 1])) {
      blok = ulozBlok([...bloki.pop()!.czlonkowie, ...blok.czlonkowie]);
    }
    bloki.push(blok);
  }
  for (const blok of bloki) {
    let gora = blok.gora;
    for (const i of blok.czlonkowie) {
      const tabliczkiY: number[] = [];
      for (let k = 0; k < wiersze[i].liczbaTabliczek; k += 1) tabliczkiY.push(gora + k * krokTabliczki + hTabliczki / 2);
      wynik[i] = { oznaczenieY: wiersze[i].zOznaczeniem ? gora + hOznaczenia / 2 : null, tabliczkiY };
      gora += snapUp(wysokosc(i));
    }
  }
  return wynik;
}

/** Klasa pisma oznaczenia aparatu pola stacji (§19.1, identyfikatory Q/QE/T). */
export const KLASA_OZNACZENIA_APARATU_STACJI = 't4' as const;

/**
 * Opisy aparatów pola stacji, index-aligned do sekwencji `resolveBayApparatusSymbolIds(bay)`:
 * oznaczenie (`apparatusIdentifiers` z oznaczeniami rekordów — ta sama sekwencja i te same
 * oznaczenia co rysunek, `compose/station.ts` `stackItemsForBay`) i opisy przekładnika
 * (`tekstyOpisowPrzekladnika` — te same predykaty co rysunek tabliczek). JEDNO źródło tekstów
 * rezerwacji kolumn (`pasyOpisowPolaStacji`, `layout/measure.ts`) i rysunku (`buildBayStack`).
 */
export function opisyAparatowPolaStacji(
  bay: Pick<
    MiniBlockBayDescriptor,
    'fieldRole' | 'primaryDevices' | 'reserve' | 'transformerRef' | 'ctRatingAnnotations' | 'vtMountingAnnotations'
  >,
): readonly OpisAparatuPolaStacji[] {
  const { symbolIds, source } = resolveBayApparatusSymbolIds(bay);
  const devices = source === 'dane' ? rekordyToruPola(bay.primaryDevices).rekordy : [];
  const oznaczenia = apparatusIdentifiers(symbolIds, symbolIds.map((_, i) => devices[i]?.designation));
  return symbolIds.map((symbolId, i) => {
    const d = devices[i];
    return {
      // Aparat bez identyfikatora konwencji §19.1 (przekładnik prądowy, głowica kablowa, wskaźnik
      // napięcia) — oznaczenie z rekordu, jak w polu GPZ (`compose/gpz.ts::tekstyEtykietAparatowGpz`;
      // karta RAMKA-PRZEKAZNIKA, następca 2026-11-11: pole stacji gubiło T1 i GK z danych).
      oznaczenie: oznaczenia[i] ?? (d?.designation?.trim() || null),
      tabliczki: d ? tekstyOpisowPrzekladnika(bay, { symbolId, deviceRef: d.deviceRef, linkedRef: d.linkedRef }) : [],
      ...(d && RODZAJE_PRZEKLADNIKOW_OD_LOD1.has(d.kind) ? { odLod: 1 as const } : {}),
    };
  });
}

/** Kolumny opisów pola stacji (`pasyOpisowPola` z `opisyAparatowPolaStacji`) — rezerwacja
 *  kolumny pola i oś stosu (`layout/measure.ts`) oraz kotwice kolumn (`compose/station.ts`). */
export function pasyOpisowPolaStacji(
  bay: Parameters<typeof opisyAparatowPolaStacji>[0],
): PasyOpisowPola {
  return pasyOpisowPola(opisyAparatowPolaStacji(bay), KLASA_OZNACZENIA_APARATU_STACJI, PROTECTION_FULL_LIST_LABEL_CLASS);
}
