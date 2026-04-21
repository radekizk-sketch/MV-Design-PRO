/**
 * polaEfektywne.ts — Krok 2: Wyznaczanie pol efektywnych.
 *
 * Scala pola jawne (z modelu) z polami niejawnymi (z topologii/polaczen).
 *
 * ZASADY:
 * - Pole jawne: zdefiniowane w modelu obiektu.
 * - Pole niejawne: wynikajace z polaczen (jesli brak jawnego pola wejsciowego/wyjsciowego).
 * - DETERMINIZM: te same dane → identyczne pola.
 * - Brak fabrykowania: brak pola = FixAction, nie auto-dodanie.
 */

import type {
  SiecSld,
  ObiektSld,
  PoleSld,
  PolaczenieSld,
  TypPola,
  KierunekPola,
  ElementAparatury,
} from './sldContracts';
import { TypPola as TP, KierunekPola as KP, TypPolaczenia, TypAparatu as TA, ETYKIETY_APARATY } from './sldContracts';

// =============================================================================
// § 1. ANALIZA TOPOLOGICZNA OBIEKTU
// =============================================================================

interface PolaczenieObiektu {
  readonly polaczenie: PolaczenieSld;
  /** Czy obiekt jest zrodlem polaczenia */
  readonly czyOd: boolean;
}

function polaczeniaObiektu(
  obiektId: string,
  polaczenia: readonly PolaczenieSld[],
): readonly PolaczenieObiektu[] {
  return polaczenia
    .filter((p) => p.odId === obiektId || p.doId === obiektId)
    .map((p) => ({ polaczenie: p, czyOd: p.odId === obiektId }));
}

// =============================================================================
// § 2. GENEROWANIE POL NIEJAWNYCH
// =============================================================================

function tworzPoleNiejawne(
  obiektId: string,
  typPola: TypPola,
  kierunek: KierunekPola,
  kolejnosc: number,
  celId: string | null,
  etykieta: string,
): PoleSld {
  // Minimalna aparatura dla pola niejawnego
  const aparatura: ElementAparatury[] = [
    {
      id: `${obiektId}-impl-${kolejnosc}-ap0`,
      typ: TA.WYLACZNIK,
      etykieta: ETYKIETY_APARATY[TA.WYLACZNIK],
      katalogRef: null,
      powiazanieZabezpieczenia: null,
    },
  ];

  return {
    id: `${obiektId}-impl-${typPola}-${kolejnosc}`,
    obiektId,
    typ: typPola,
    kierunek,
    kolejnosc,
    etykieta,
    jawne: false,
    aparatura,
    celId,
    celKotwica: null,
    celXHint: null,
  };
}

// =============================================================================
// § 3. WYZNACZANIE POL EFEKTYWNYCH
// =============================================================================

/**
 * Wyznacza pola efektywne dla obiektu.
 *
 * Algorytm:
 * 1. Zbierz pola jawne z modelu obiektu.
 * 2. Dla kazdego polaczenia sprawdz, czy istnieje jawne pole wejsciowe/wyjsciowe.
 * 3. Jesli brak jawnego pola, wygeneruj niejawne.
 * 4. Sortuj deterministycznie.
 *
 * DETERMINIZM: te same dane → identyczna lista pol efektywnych.
 */
export function wyznaczPolaEfektywne(
  obiekt: ObiektSld,
  polaczenia: readonly PolaczenieSld[],
): readonly PoleSld[] {
  const polaJawne = [...obiekt.pola];
  const polaNiejawne: PoleSld[] = [];

  // Indeks polaczen tego obiektu
  const polaczenieOb = polaczeniaObiektu(obiekt.id, polaczenia);

  let niejawnyIdx = 0;

  for (const { polaczenie, czyOd } of polaczenieOb) {
    const celId = czyOd ? polaczenie.doId : polaczenie.odId;

    // Sprawdz czy istnieje jawne pole powiazane z tym polaczeniem
    const maJawnePole = polaJawne.some(
      (p) => p.celId === celId,
    );

    if (!maJawnePole) {
      // Okresl typ niejawnego pola
      let typPola: TypPola;
      let kierunek: KierunekPola;
      let etykieta: string;

      if (polaczenie.typ === TypPolaczenia.TOR_GLOWNY) {
        if (czyOd) {
          typPola = TP.LINIOWE_WYJSCIOWE;
          kierunek = KP.DOL;
          etykieta = 'Wyjscie magistrali';
        } else {
          typPola = TP.LINIOWE_WEJSCIOWE;
          kierunek = KP.GORA;
          etykieta = 'Wejscie magistrali';
        }
      } else if (polaczenie.typ === TypPolaczenia.ODGALEZIENIE) {
        typPola = TP.ODGALEZIENIOWE;
        kierunek = czyOd ? KP.DOL : KP.GORA;
        etykieta = 'Odgalezienie';
      } else if (polaczenie.typ === TypPolaczenia.PIERSCIEN) {
        typPola = TP.LINIOWE_WYJSCIOWE;
        kierunek = czyOd ? KP.DOL : KP.GORA;
        etykieta = polaczenie.normalnieOtwarty ? 'Punkt NOP' : 'Pierscien';
      } else {
        typPola = TP.LINIOWE_WYJSCIOWE;
        kierunek = KP.DOL;
        etykieta = 'Polaczenie';
      }

      polaNiejawne.push(
        tworzPoleNiejawne(obiekt.id, typPola, kierunek, niejawnyIdx, celId, etykieta),
      );
      niejawnyIdx++;
    }
  }

  // Scal i sortuj deterministycznie
  const wszystkiePola = [...polaJawne, ...polaNiejawne];
  return wszystkiePola.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Wyznacza pola efektywne dla calej sieci SLD.
 *
 * Zwraca nowa SiecSld z uzupelnionymi polami.
 */
export function uzupelnijPolaEfektywne(siec: SiecSld): SiecSld {
  const obiekty = siec.obiekty.map((ob) => ({
    ...ob,
    pola: wyznaczPolaEfektywne(ob, siec.polaczenia),
  }));

  return {
    ...siec,
    obiekty: obiekty.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
