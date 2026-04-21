/**
 * sortowanieAntykrzyzowaniowe.ts — Krok 3: Sortowanie pol zapobiegajace krzyzowaniu tras.
 *
 * ALGORYTM:
 * 1. Podziel pola na grupy: GORA, DOL, LEWO, PRAWO.
 * 2. Dla grup pionowych (GORA, DOL): sortuj wg celXHint lub pozycji celu.
 * 3. Dla grup bocznych (LEWO, PRAWO): sortuj wg kolejnosci.
 * 4. Rozstrzygaj remisy deterministycznie po ID.
 *
 * DETERMINIZM: te same pola + te same obiekty → identyczna kolejnosc.
 */

import type {
  PoleSld,
  ObiektSld,
  SiecSld,
} from './sldContracts';
import { KierunekPola as KP } from './sldContracts';

// =============================================================================
// § 1. GRUPOWANIE POL
// =============================================================================

export interface GrupyPol {
  readonly gora: readonly PoleSld[];
  readonly dol: readonly PoleSld[];
  readonly lewo: readonly PoleSld[];
  readonly prawo: readonly PoleSld[];
}

/**
 * Grupuje pola obiektu wg kierunku.
 */
export function grupujPola(pola: readonly PoleSld[]): GrupyPol {
  const gora: PoleSld[] = [];
  const dol: PoleSld[] = [];
  const lewo: PoleSld[] = [];
  const prawo: PoleSld[] = [];

  for (const pole of pola) {
    switch (pole.kierunek) {
      case KP.GORA: gora.push(pole); break;
      case KP.DOL: dol.push(pole); break;
      case KP.LEWO: lewo.push(pole); break;
      case KP.PRAWO: prawo.push(pole); break;
    }
  }

  return { gora, dol, lewo, prawo };
}

// =============================================================================
// § 2. WYZNACZANIE X-HINT CELU
// =============================================================================

/**
 * Wyznacza wspolrzedna X celu pola (dla sortowania).
 *
 * Kolejnosc priorytetow:
 * 1. celXHint (jawnie podany)
 * 2. pozycjaBazowa.x obiektu docelowego
 * 3. 0 (fallback — sortowanie po ID)
 */
function xHintPola(pole: PoleSld, indeksObiektow: Map<string, ObiektSld>): number {
  if (pole.celXHint != null) return pole.celXHint;
  if (pole.celId) {
    const cel = indeksObiektow.get(pole.celId);
    if (cel?.pozycjaBazowa) return cel.pozycjaBazowa.x;
  }
  return 0;
}

// =============================================================================
// § 3. SORTOWANIE ANTYKRZYZOWANIOWE
// =============================================================================

/**
 * Sortuje pola w grupie pionowej (GORA lub DOL) zapobiegajac krzyzowaniu.
 *
 * Algorytm: pola sortowane wg pozycji X celu (od lewej do prawej).
 * Jesli X celu jest identyczne, sortowanie deterministyczne po ID.
 *
 * Dla grupy GORA: pola z celem po lewej stronie → po lewej na szynie.
 * Dla grupy DOL: analogicznie.
 *
 * DETERMINIZM: identyczny input → identyczna kolejnosc.
 */
function sortujGrupePionowa(
  pola: readonly PoleSld[],
  indeksObiektow: Map<string, ObiektSld>,
): readonly PoleSld[] {
  return [...pola].sort((a, b) => {
    const xa = xHintPola(a, indeksObiektow);
    const xb = xHintPola(b, indeksObiektow);
    if (xa !== xb) return xa - xb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sortuje pola boczne (LEWO, PRAWO) wg kolejnosci jawnej.
 * Rozstrzyganie remisow po ID.
 */
function sortujGrupeBoczna(pola: readonly PoleSld[]): readonly PoleSld[] {
  return [...pola].sort((a, b) => {
    if (a.kolejnosc !== b.kolejnosc) return a.kolejnosc - b.kolejnosc;
    return a.id.localeCompare(b.id);
  });
}

// =============================================================================
// § 4. SORTOWANIE POL OBIEKTU
// =============================================================================

/**
 * Sortuje pola obiektu antykrzyzowaniowo.
 *
 * Zwraca GrupyPol z posortowanymi polami w kazdej grupie.
 */
export function sortujPolaObiektu(
  obiekt: ObiektSld,
  indeksObiektow: Map<string, ObiektSld>,
): GrupyPol {
  const grupy = grupujPola(obiekt.pola);

  return {
    gora: sortujGrupePionowa(grupy.gora, indeksObiektow),
    dol: sortujGrupePionowa(grupy.dol, indeksObiektow),
    lewo: sortujGrupeBoczna(grupy.lewo),
    prawo: sortujGrupeBoczna(grupy.prawo),
  };
}

/**
 * Wyznacza posortowane pola dla calej sieci.
 *
 * Zwraca mape: obiektId → GrupyPol.
 */
export function sortujPolaCalejSieci(
  siec: SiecSld,
): ReadonlyMap<string, GrupyPol> {
  const indeksObiektow = new Map(siec.obiekty.map((o) => [o.id, o]));
  const wynik = new Map<string, GrupyPol>();

  for (const obiekt of siec.obiekty) {
    wynik.set(obiekt.id, sortujPolaObiektu(obiekt, indeksObiektow));
  }

  return wynik;
}
