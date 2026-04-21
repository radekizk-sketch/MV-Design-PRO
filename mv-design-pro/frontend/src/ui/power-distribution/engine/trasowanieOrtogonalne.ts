/**
 * trasowanieOrtogonalne.ts — Krok 8: Ortogonalne trasowanie polaczen (Manhattan routing).
 *
 * ALGORYTM:
 * 1. Dla kazdego polaczenia: znajdz port poczatkowy i koncowy.
 * 2. Wyznacz trase ortogonalna (Manhattan) miedzy portami.
 * 3. Unikaj obiektow (bounding box obstacle avoidance).
 * 4. Punkty lamania jako jawne dane (PunktLamania[]).
 *
 * ZASADY:
 * - Trasy WYLACZNIE ortogonalne (odcinki poziome i pionowe).
 * - Brak diagonali.
 * - Snap do siatki.
 * - DETERMINIZM: te same porty + te same przeszkody → identyczna trasa.
 */

import type {
  PolaczenieSld,
  GeometriaObiektu,
  PortSld,
  PunktLamania,
  TrasaPolaczenia,
  Prostokat,
  Punkt2D,
} from './sldContracts';

// =============================================================================
// § 1. STALE
// =============================================================================

/** Siatka trasowania. */
const SIATKA = 20;

/** Margines omijania przeszkod [px]. */
const MARGINES_OMIJANIA = 40;

/** Odleglosc wyjscia z portu przed skretem [px]. */
const STUB_PORTU = 40;

// =============================================================================
// § 2. POMOCNICZE
// =============================================================================

function snap(v: number): number {
  return Math.round(v / SIATKA) * SIATKA;
}

/** Sprawdza czy odcinek pionowy (x, y1→y2) przecina prostokat. */
function odcinekPionowyPrzecinaObrys(
  x: number,
  y1: number,
  y2: number,
  r: Prostokat,
  margines: number,
): boolean {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return (
    x >= r.x - margines &&
    x <= r.x + r.szerokosc + margines &&
    maxY >= r.y - margines &&
    minY <= r.y + r.wysokosc + margines
  );
}

/** Sprawdza czy odcinek poziomy (y, x1→x2) przecina prostokat. */
function odcinekPoziomyPrzecinaObrys(
  y: number,
  x1: number,
  x2: number,
  r: Prostokat,
  margines: number,
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return (
    y >= r.y - margines &&
    y <= r.y + r.wysokosc + margines &&
    maxX >= r.x - margines &&
    minX <= r.x + r.szerokosc + margines
  );
}

// =============================================================================
// § 3. PUNKT WYJSCIA Z PORTU (STUB)
// =============================================================================

/**
 * Wyznacza punkt wyjscia z portu (stub) — odsuniecie w kierunku wyjscia portu.
 */
function punktStubPortu(port: PortSld): Punkt2D {
  switch (port.kierunekWyjscia) {
    case 'GORA':
      return { x: port.pozycja.x, y: snap(port.pozycja.y - STUB_PORTU) };
    case 'DOL':
      return { x: port.pozycja.x, y: snap(port.pozycja.y + STUB_PORTU) };
    case 'LEWO':
      return { x: snap(port.pozycja.x - STUB_PORTU), y: port.pozycja.y };
    case 'PRAWO':
      return { x: snap(port.pozycja.x + STUB_PORTU), y: port.pozycja.y };
  }
}

// =============================================================================
// § 4. TRASOWANIE PROSTE (L-SHAPE / Z-SHAPE)
// =============================================================================

/**
 * Trasowanie proste: stub → L-ksztalt lub Z-ksztalt → stub.
 *
 * Priorytet:
 * 1. L-ksztalt (1 punkt lamania) jesli mozliwe bez kolizji.
 * 2. Z-ksztalt (2 punkty lamania) — srodek miedzy portami.
 *
 * Trasy musza byc ortogonalne (odcinki H i V).
 */
function trasujProstoMiedzyStubami(
  stubOd: Punkt2D,
  stubDo: Punkt2D,
  przeszkody: readonly Prostokat[],
): readonly PunktLamania[] {
  // Jesli wspolna linia pozioma lub pionowa — prosta linia
  if (stubOd.x === stubDo.x || stubOd.y === stubDo.y) {
    return [stubOd, stubDo];
  }

  // L-ksztalt: (stubOd.x, stubOd.y) → (stubDo.x, stubOd.y) → (stubDo.x, stubDo.y)
  const punktL: Punkt2D = { x: stubDo.x, y: stubOd.y };
  const lKolizja = przeszkody.some(
    (r) =>
      odcinekPoziomyPrzecinaObrys(stubOd.y, stubOd.x, stubDo.x, r, MARGINES_OMIJANIA / 2) ||
      odcinekPionowyPrzecinaObrys(stubDo.x, stubOd.y, stubDo.y, r, MARGINES_OMIJANIA / 2),
  );

  if (!lKolizja) {
    return [stubOd, { x: snap(punktL.x), y: snap(punktL.y) }, stubDo];
  }

  // L-ksztalt wariant 2: (stubOd.x, stubDo.y)
  const punktL2: Punkt2D = { x: stubOd.x, y: stubDo.y };
  const l2Kolizja = przeszkody.some(
    (r) =>
      odcinekPionowyPrzecinaObrys(stubOd.x, stubOd.y, stubDo.y, r, MARGINES_OMIJANIA / 2) ||
      odcinekPoziomyPrzecinaObrys(stubDo.y, stubOd.x, stubDo.x, r, MARGINES_OMIJANIA / 2),
  );

  if (!l2Kolizja) {
    return [stubOd, { x: snap(punktL2.x), y: snap(punktL2.y) }, stubDo];
  }

  // Z-ksztalt: punkt posredni na srodku
  const srodekY = snap((stubOd.y + stubDo.y) / 2);
  return [
    stubOd,
    { x: stubOd.x, y: srodekY },
    { x: stubDo.x, y: srodekY },
    stubDo,
  ];
}

// =============================================================================
// § 5. TRASOWANIE POLACZENIA
// =============================================================================

/**
 * Wyznacza trase ortogonalna dla jednego polaczenia.
 *
 * 1. Znajdz port poczatkowy i koncowy.
 * 2. Wyznacz stuby (wyjscia z portow).
 * 3. Trasuj miedzy stubami z omijaniem przeszkod.
 * 4. Zloz pelna trase: port → stub → [trasa] → stub → port.
 */
function trasujPolaczenie(
  polaczenie: PolaczenieSld,
  portyMap: ReadonlyMap<string, PortSld>,
  przeszkody: readonly Prostokat[],
): TrasaPolaczenia | null {
  // Znajdz porty
  const portOd = portyMap.get(`port-${polaczenie.odPolaId}`);
  const portDo = portyMap.get(`port-${polaczenie.doPolaId}`);

  if (!portOd || !portDo) {
    // Brak portow — nie mozna trasowac
    return null;
  }

  // Stuby
  const stubOd = punktStubPortu(portOd);
  const stubDo = punktStubPortu(portDo);

  // Trasowanie miedzy stubami
  const trasaSrodkowa = trasujProstoMiedzyStubami(stubOd, stubDo, przeszkody);

  // Pelna trasa: port → stub → [trasa srodkowa] → stub → port
  const punkty: PunktLamania[] = [
    { x: portOd.pozycja.x, y: portOd.pozycja.y },
  ];

  // Dodaj stuby i trase srodkowa (unikaj duplikatow)
  for (const p of trasaSrodkowa) {
    const ostatni = punkty[punkty.length - 1];
    if (ostatni.x !== p.x || ostatni.y !== p.y) {
      punkty.push({ x: p.x, y: p.y });
    }
  }

  // Dodaj punkt koncowy
  const ostatni = punkty[punkty.length - 1];
  if (ostatni.x !== portDo.pozycja.x || ostatni.y !== portDo.pozycja.y) {
    punkty.push({ x: portDo.pozycja.x, y: portDo.pozycja.y });
  }

  return {
    polaczenieId: polaczenie.id,
    portOd,
    portDo,
    punkty,
    typ: polaczenie.typ,
    normalnieOtwarty: polaczenie.normalnieOtwarty,
  };
}

// =============================================================================
// § 6. TRASOWANIE CALEJ SIECI
// =============================================================================

/**
 * Wyznacza trasy ortogonalne dla wszystkich polaczen sieci.
 *
 * DETERMINIZM: polaczenia sortowane po id, porty identyfikowane po id.
 */
export function trasujWszystkiePolaczenia(
  polaczenia: readonly PolaczenieSld[],
  geometrieObiektow: readonly GeometriaObiektu[],
): readonly TrasaPolaczenia[] {
  // Buduj mape portow
  const portyMap = new Map<string, PortSld>();
  for (const geom of geometrieObiektow) {
    for (const port of geom.porty) {
      portyMap.set(port.id, port);
    }
  }

  // Zbierz przeszkody (obrysy obiektow)
  const przeszkody: Prostokat[] = geometrieObiektow.map((g) => g.obrys);

  // Trasuj kazde polaczenie
  const trasy: TrasaPolaczenia[] = [];

  // Sortuj polaczenia po ID (determinizm)
  const sortowanePolaczenia = [...polaczenia].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  for (const pol of sortowanePolaczenia) {
    // Filtruj przeszkody — usun obiekty poczatkowe i koncowe z listy przeszkod
    const przeszkodyBezKoncow = przeszkody.filter((_, idx) => {
      const geom = geometrieObiektow[idx];
      return geom.obiektId !== pol.odId && geom.obiektId !== pol.doId;
    });

    const trasa = trasujPolaczenie(pol, portyMap, przeszkodyBezKoncow);
    if (trasa) {
      trasy.push(trasa);
    }
  }

  return trasy.sort((a, b) => a.polaczenieId.localeCompare(b.polaczenieId));
}
