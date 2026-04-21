/**
 * pipelineSld.ts — Orkiestrator 9-etapowego pipeline'u SLD.
 *
 * ARCHITEKTURA:
 *   Snapshot/dane wejsciowe
 *     → Krok 1: Adapter semantyczny (zbudujSiecSld)
 *     → Krok 2: Pola efektywne (uzupelnijPolaEfektywne)
 *     → Krok 3: Sortowanie antykrzyzowaniowe (sortujPolaCalejSieci)
 *     → Krok 4-7: Geometria szyny + pola + aparatura + porty (obliczGeometrieObiektu)
 *     → Krok 8: Trasowanie ortogonalne (trasujWszystkiePolaczenia)
 *     → Krok 9: Wynik (WynikUkladuSld) → renderer SVG
 *
 * DETERMINIZM: identyczne dane wejsciowe → identyczny WynikUkladuSld (hash).
 * BRAK EFEKTOW UBOCZNYCH: czyste funkcje, brak mutacji, brak stanu.
 */

import type {
  WynikUkladuSld,
  GeometriaObiektu,
  Prostokat,
  Punkt2D,
  SiecSld,
} from './sldContracts';
import type { DaneWejsciowe } from './adapterSemantyczny';
import { zbudujSiecSld } from './adapterSemantyczny';
import { uzupelnijPolaEfektywne } from './polaEfektywne';
import { sortujPolaCalejSieci } from './sortowanieAntykrzyzowaniowe';
import { obliczGeometrieObiektu } from './geometriaSzyny';
import { trasujWszystkiePolaczenia } from './trasowanieOrtogonalne';

// =============================================================================
// § 1. STALE ROZMIESZCZENIA OBIEKTOW
// =============================================================================

/** Siatka bazowa. */
const SIATKA = 20;

/** Odstep poziomy miedzy obiektami [px]. */
const ODSTEP_POZIOMY = 400;

/** Domyslna pozycja startowa pierwszego obiektu. */
const POZYCJA_STARTOWA: Punkt2D = { x: 300, y: 300 };

// =============================================================================
// § 2. AUTOMATYCZNE ROZMIESZCZENIE OBIEKTOW
// =============================================================================

function snap(v: number): number {
  return Math.round(v / SIATKA) * SIATKA;
}

/**
 * Przydziela pozycje bazowe obiektom, ktore ich nie maja.
 *
 * Algorytm: obiekty bez pozycji rozmieszczone liniowo (w rzedzie)
 * z zachowaniem istniejacych pozycji.
 */
function przydzielPozycjeBazowe(siec: SiecSld): SiecSld {
  let nextX = POZYCJA_STARTOWA.x;
  const baseY = POZYCJA_STARTOWA.y;

  // Zbierz istniejace pozycje
  const maxExistingX = siec.obiekty.reduce((max, ob) => {
    if (ob.pozycjaBazowa) return Math.max(max, ob.pozycjaBazowa.x);
    return max;
  }, 0);

  if (maxExistingX > 0) nextX = snap(maxExistingX + ODSTEP_POZIOMY);

  const obiekty = siec.obiekty.map((ob) => {
    if (ob.pozycjaBazowa) return ob;

    const pozycja: Punkt2D = { x: snap(nextX), y: snap(baseY) };
    nextX = snap(nextX + ODSTEP_POZIOMY);

    return { ...ob, pozycjaBazowa: pozycja };
  });

  return { ...siec, obiekty: obiekty.sort((a, b) => a.id.localeCompare(b.id)) };
}

// =============================================================================
// § 3. OBLICZANIE OBRYS CALKOWITY
// =============================================================================

function obliczObrysCalkwity(geometrie: readonly GeometriaObiektu[]): Prostokat {
  if (geometrie.length === 0) {
    return { x: 0, y: 0, szerokosc: 0, wysokosc: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const g of geometrie) {
    minX = Math.min(minX, g.obrys.x);
    minY = Math.min(minY, g.obrys.y);
    maxX = Math.max(maxX, g.obrys.x + g.obrys.szerokosc);
    maxY = Math.max(maxY, g.obrys.y + g.obrys.wysokosc);
  }

  const margines = 60;
  return {
    x: snap(minX - margines),
    y: snap(minY - margines),
    szerokosc: snap(maxX - minX + 2 * margines),
    wysokosc: snap(maxY - minY + 2 * margines),
  };
}

// =============================================================================
// § 4. HASH DETERMINISTYCZNY
// =============================================================================

/**
 * Oblicza hash deterministyczny wyniku SLD.
 *
 * Uzywa prostego FNV-1a na zserializowanych danych geometrycznych.
 * (W produkcji mozna zamienic na SHA-256 via SubtleCrypto.)
 */
function obliczHashWyniku(
  geometrie: readonly GeometriaObiektu[],
  trasyCount: number,
): string {
  // FNV-1a 32-bit hash
  let hash = 0x811c9dc5;
  const fnvPrime = 0x01000193;

  const dane = JSON.stringify({
    obiektow: geometrie.length,
    polaczenia: trasyCount,
    obrysy: geometrie.map((g) => ({
      id: g.obiektId,
      x: g.obrys.x,
      y: g.obrys.y,
      w: g.obrys.szerokosc,
      h: g.obrys.wysokosc,
      portow: g.porty.length,
      pol: g.pola.length,
    })),
  });

  for (let i = 0; i < dane.length; i++) {
    hash ^= dane.charCodeAt(i);
    hash = Math.imul(hash, fnvPrime);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

// =============================================================================
// § 5. GLOWNY PIPELINE
// =============================================================================

/**
 * Uruchamia pelny 9-etapowy pipeline SLD.
 *
 * Wejscie: DaneWejsciowe (obiekty + polaczenia)
 * Wyjscie: WynikUkladuSld (geometrie + trasy + hash)
 *
 * DETERMINIZM: identyczne dane → identyczny wynik (bit-for-bit).
 */
export function uruchomPipelineSld(dane: DaneWejsciowe): WynikUkladuSld {
  // Krok 1: Adapter semantyczny
  const siecSurowa = zbudujSiecSld(dane);

  // Krok 2: Pola efektywne
  const siecZPolami = uzupelnijPolaEfektywne(siecSurowa);

  // Krok 2.5: Przydziel pozycje bazowe (jesli brak)
  const siecZPozycjami = przydzielPozycjeBazowe(siecZPolami);

  // Krok 3: Sortowanie antykrzyzowaniowe
  const grupyMap = sortujPolaCalejSieci(siecZPozycjami);

  // Krok 4-7: Geometria obiektow (szyna + pola + aparatura + porty)
  const geometrie: GeometriaObiektu[] = [];
  for (const obiekt of siecZPozycjami.obiekty) {
    const grupy = grupyMap.get(obiekt.id);
    if (!grupy) continue;

    const pozycja = obiekt.pozycjaBazowa ?? POZYCJA_STARTOWA;
    geometrie.push(obliczGeometrieObiektu(obiekt, grupy, pozycja));
  }

  // Sortuj geometrie po obiektId
  geometrie.sort((a, b) => a.obiektId.localeCompare(b.obiektId));

  // Krok 8: Trasowanie ortogonalne
  const trasy = trasujWszystkiePolaczenia(siecZPozycjami.polaczenia, geometrie);

  // Krok 9: Zloz wynik
  const obrysCalkowity = obliczObrysCalkwity(geometrie);
  const hash = obliczHashWyniku(geometrie, trasy.length);

  return {
    obiekty: geometrie,
    trasy,
    obrysCalkowity,
    hash,
  };
}

/**
 * Uruchamia pipeline SLD z gotowego modelu semantycznego (SiecSld).
 * Pomija etap 1 (adapter).
 */
export function uruchomPipelineZSieci(siec: SiecSld): WynikUkladuSld {
  const siecZPolami = uzupelnijPolaEfektywne(siec);
  const siecZPozycjami = przydzielPozycjeBazowe(siecZPolami);
  const grupyMap = sortujPolaCalejSieci(siecZPozycjami);

  const geometrie: GeometriaObiektu[] = [];
  for (const obiekt of siecZPozycjami.obiekty) {
    const grupy = grupyMap.get(obiekt.id);
    if (!grupy) continue;
    const pozycja = obiekt.pozycjaBazowa ?? POZYCJA_STARTOWA;
    geometrie.push(obliczGeometrieObiektu(obiekt, grupy, pozycja));
  }
  geometrie.sort((a, b) => a.obiektId.localeCompare(b.obiektId));

  const trasy = trasujWszystkiePolaczenia(siecZPozycjami.polaczenia, geometrie);
  const obrysCalkowity = obliczObrysCalkwity(geometrie);
  const hash = obliczHashWyniku(geometrie, trasy.length);

  return { obiekty: geometrie, trasy, obrysCalkowity, hash };
}

// =============================================================================
// § 6. EKSPORT TYPOW WEJSCIOWYCH (RE-EXPORT)
// =============================================================================

export type { DaneWejsciowe, ObiektWejsciowy, PolaWejsciowe, AparatWejsciowy, PolaczenieWejsciowe } from './adapterSemantyczny';
export type { GrupyPol } from './sortowanieAntykrzyzowaniowe';
