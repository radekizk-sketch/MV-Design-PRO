/**
 * geometriaSzyny.ts — Krok 4-5: Dynamiczne wymiarowanie szyny i rozmieszczenie pol.
 *
 * ALGORYTM:
 * 1. Szerokosc szyny = max(MIN_SZEROKOSC, max_pola_pionowe * KROK_POLA + marginesy).
 * 2. Pola GORA/DOL rozmieszczone symetrycznie wzdluz szyny.
 * 3. Pola LEWO/PRAWO na dedykowanych portach bocznych.
 * 4. Aparatura rysowana sekwencyjnie w polu (Krok 6).
 * 5. Porty wyznaczane na koncach pol (Krok 7).
 *
 * DETERMINIZM: identyczne grupy pol → identyczna geometria.
 */

import type {
  ObiektSld,
  GeometriaObiektu,
  GeometriaSzyny,
  GeometriaPola,
  PortSld,
  PoleSld,
  Punkt2D,
  KierunekPola,
  TypAparatu,
} from './sldContracts';
import {
  KierunekPola as KP,
  RolaPortu,
  TypAparatu as TA,
} from './sldContracts';
import type { GrupyPol } from './sortowanieAntykrzyzowaniowe';

// =============================================================================
// § 1. STALE GEOMETRYCZNE (SIATKA CANONICAL)
// =============================================================================

/** Baza siatki — wszystkie wymiary wielokrotnoscia. */
const SIATKA = 20;

/** Minimalna szerokosc szyny [px]. */
const MIN_SZEROKOSC_SZYNY = 120;

/** Krok miedzy polami pionowymi [px]. */
const KROK_POLA = 80;

/** Wysokosc szyny [px]. */
const WYSOKOSC_SZYNY = 8;

/** Dlugosc toru pola (od szyny do portu) [px]. */
const DLUGOSC_TORU = 160;

/** Krok aparaturowy (odleglosc miedzy aparatami w torze) [px]. */
const KROK_APARATURY = 30;

/** Rozmiar symbolu aparatu [px]. */
const ROZMIAR_APARATU = 20;

/** Rozmiar duzego symbolu (transformator, generator) [px]. */
const ROZMIAR_DUZY = 28;

/** Margines boczny obiektu [px]. */
const MARGINES_BOCZNY = 40;

/** Margines gorny/dolny obiektu [px]. */
const MARGINES_PIONOWY = 20;

/** Krok miedzy polami bocznymi [px]. */
const KROK_POLA_BOCZNEGO = 60;

// =============================================================================
// § 2. POMOCNICZE — SNAP DO SIATKI
// =============================================================================

function snap(v: number): number {
  return Math.round(v / SIATKA) * SIATKA;
}

function rozmiarAparatu(typ: TypAparatu): { szer: number; wys: number } {
  switch (typ) {
    case TA.TRANSFORMATOR:
    case TA.GENERATOR_PV:
    case TA.GENERATOR_BESS:
    case TA.FALOWNIK:
      return { szer: ROZMIAR_DUZY, wys: ROZMIAR_DUZY };
    default:
      return { szer: ROZMIAR_APARATU, wys: ROZMIAR_APARATU };
  }
}

function obrotAparatu(typ: TypAparatu): number {
  switch (typ) {
    case TA.PRZEKLADNIK_PRADOWY:
    case TA.PRZEKLADNIK_NAPIECIOWY:
      return 90;
    default:
      return 0;
  }
}

// =============================================================================
// § 3. OBLICZANIE SZEROKOSCI SZYNY
// =============================================================================

/**
 * Oblicza szerokosc szyny na podstawie liczby pol pionowych.
 *
 * Szerokosc = max(MIN, max(gornych, dolnych) * KROK + 2 * MARGINES)
 * Snap do siatki.
 */
export function obliczSzerokoscSzyny(grupy: GrupyPol): number {
  const maxPionowych = Math.max(grupy.gora.length, grupy.dol.length, 1);
  const surowa = maxPionowych * KROK_POLA + 2 * MARGINES_BOCZNY;
  return snap(Math.max(surowa, MIN_SZEROKOSC_SZYNY));
}

// =============================================================================
// § 4. BUDOWANIE GEOMETRII POLA
// =============================================================================

/**
 * Buduje geometrie pojedynczego pola.
 *
 * Pole zaczyna sie od szyny i biegnie w kierunku podanym przez pole.kierunek.
 * Aparatura rozmieszczona sekwencyjnie wzdluz toru.
 * Port na koncu toru.
 */
function budujGeometriePola(
  pole: PoleSld,
  obiektId: string,
  poczatekX: number,
  szynaY: number,
  kierunek: KierunekPola,
): GeometriaPola {
  const czyPionowe = kierunek === KP.GORA || kierunek === KP.DOL;
  const znakPionowy = kierunek === KP.GORA ? -1 : 1;
  const znakPoziomy = kierunek === KP.LEWO ? -1 : 1;

  // Punkt startu toru (od szyny)
  const poczatekToru: Punkt2D = { x: poczatekX, y: szynaY };

  // Rozmieszczenie aparatury sekwencyjne
  const pozycjeAparaturowe: {
    elementId: string;
    pozycja: Punkt2D;
    rozmiar: { szer: number; wys: number };
    obrot: number;
  }[] = [];

  let biezacyOffset = KROK_APARATURY;

  for (const aparat of pole.aparatura) {
    const roz = rozmiarAparatu(aparat.typ);
    const obrot = obrotAparatu(aparat.typ);

    let poz: Punkt2D;
    if (czyPionowe) {
      poz = { x: poczatekX, y: snap(szynaY + znakPionowy * biezacyOffset) };
    } else {
      poz = { x: snap(poczatekX + znakPoziomy * biezacyOffset), y: szynaY };
    }

    pozycjeAparaturowe.push({
      elementId: aparat.id,
      pozycja: poz,
      rozmiar: roz,
      obrot,
    });

    biezacyOffset += KROK_APARATURY;
  }

  // Koniec toru = port polaczeniowy
  const dlugoscToru = Math.max(biezacyOffset, DLUGOSC_TORU);
  let koniecToru: Punkt2D;
  if (czyPionowe) {
    koniecToru = { x: poczatekX, y: snap(szynaY + znakPionowy * dlugoscToru) };
  } else {
    koniecToru = { x: snap(poczatekX + znakPoziomy * dlugoscToru), y: szynaY };
  }

  // Port
  const kierunekWyjscia = kierunek;
  const rolaPortu = kierunek === KP.GORA ? RolaPortu.WEJSCIE
    : kierunek === KP.DOL ? RolaPortu.WYJSCIE
    : kierunek === KP.LEWO ? RolaPortu.ODGALEZIENIE
    : RolaPortu.ODGALEZIENIE;

  const port: PortSld = {
    id: `port-${pole.id}`,
    polaId: pole.id,
    obiektId,
    rola: rolaPortu,
    kierunekWyjscia,
    pozycja: koniecToru,
  };

  // Bounding box
  const wszytkieX = [poczatekToru.x, koniecToru.x, ...pozycjeAparaturowe.map((p) => p.pozycja.x)];
  const wszytkieY = [poczatekToru.y, koniecToru.y, ...pozycjeAparaturowe.map((p) => p.pozycja.y)];
  const minX = Math.min(...wszytkieX) - ROZMIAR_APARATU;
  const maxX = Math.max(...wszytkieX) + ROZMIAR_APARATU;
  const minY = Math.min(...wszytkieY) - ROZMIAR_APARATU;
  const maxY = Math.max(...wszytkieY) + ROZMIAR_APARATU;

  return {
    polaId: pole.id,
    obiektId,
    obrys: { x: snap(minX), y: snap(minY), szerokosc: snap(maxX - minX), wysokosc: snap(maxY - minY) },
    poczatekToru,
    koniecToru,
    pozycjeAparaturowe,
    port,
  };
}

// =============================================================================
// § 5. PELNA GEOMETRIA OBIEKTU
// =============================================================================

/**
 * Oblicza pelna geometrie obiektu (szyna + pola + porty).
 *
 * DETERMINIZM: identyczne dane → identyczna geometria.
 */
export function obliczGeometrieObiektu(
  obiekt: ObiektSld,
  grupy: GrupyPol,
  pozycjaBazowa: Punkt2D,
): GeometriaObiektu {
  const szerokoscSzyny = obliczSzerokoscSzyny(grupy);

  // Pozycja szyny
  const szynaX = snap(pozycjaBazowa.x - szerokoscSzyny / 2);
  const szynaY = snap(pozycjaBazowa.y);

  // Geometria szyny
  const sekcje = obiekt.sekcjeSzyn <= 1
    ? [{ sekcjaId: `${obiekt.id}-s1`, x1: szynaX, x2: szynaX + szerokoscSzyny }]
    : [
        { sekcjaId: `${obiekt.id}-s1`, x1: szynaX, x2: snap(szynaX + szerokoscSzyny / 2 - 10) },
        { sekcjaId: `${obiekt.id}-s2`, x1: snap(szynaX + szerokoscSzyny / 2 + 10), x2: szynaX + szerokoscSzyny },
      ];

  const szyna: GeometriaSzyny = {
    obiektId: obiekt.id,
    x: szynaX,
    y: szynaY,
    szerokosc: szerokoscSzyny,
    wysokosc: WYSOKOSC_SZYNY,
    sekcje,
  };

  // Rozmieszczenie pol pionowych
  const geometriePol: GeometriaPola[] = [];
  const porty: PortSld[] = [];

  // Pola GORA — symetrycznie wzdluz szyny, od lewej
  const gorneStartX = szynaX + MARGINES_BOCZNY + KROK_POLA / 2;
  grupy.gora.forEach((pole, idx) => {
    const x = snap(gorneStartX + idx * KROK_POLA);
    const geom = budujGeometriePola(pole, obiekt.id, x, szynaY, KP.GORA);
    geometriePol.push(geom);
    porty.push(geom.port);
  });

  // Pola DOL — symetrycznie wzdluz szyny
  const dolneStartX = szynaX + MARGINES_BOCZNY + KROK_POLA / 2;
  grupy.dol.forEach((pole, idx) => {
    const x = snap(dolneStartX + idx * KROK_POLA);
    const geom = budujGeometriePola(pole, obiekt.id, x, szynaY + WYSOKOSC_SZYNY, KP.DOL);
    geometriePol.push(geom);
    porty.push(geom.port);
  });

  // Pola LEWO — pionowo wzdluz lewej krawedzi szyny
  grupy.lewo.forEach((pole, idx) => {
    const y = snap(szynaY + idx * KROK_POLA_BOCZNEGO);
    const geom = budujGeometriePola(pole, obiekt.id, szynaX, y, KP.LEWO);
    geometriePol.push(geom);
    porty.push(geom.port);
  });

  // Pola PRAWO — pionowo wzdluz prawej krawedzi szyny
  grupy.prawo.forEach((pole, idx) => {
    const y = snap(szynaY + idx * KROK_POLA_BOCZNEGO);
    const geom = budujGeometriePola(pole, obiekt.id, szynaX + szerokoscSzyny, y, KP.PRAWO);
    geometriePol.push(geom);
    porty.push(geom.port);
  });

  // Dodaj porty szyny (lewy/prawy koniec)
  porty.push({
    id: `port-${obiekt.id}-szyna-lewo`,
    polaId: '',
    obiektId: obiekt.id,
    rola: RolaPortu.SZYNA_LEWO,
    kierunekWyjscia: KP.LEWO,
    pozycja: { x: szynaX, y: snap(szynaY + WYSOKOSC_SZYNY / 2) },
  });
  porty.push({
    id: `port-${obiekt.id}-szyna-prawo`,
    polaId: '',
    obiektId: obiekt.id,
    rola: RolaPortu.SZYNA_PRAWO,
    kierunekWyjscia: KP.PRAWO,
    pozycja: { x: szynaX + szerokoscSzyny, y: snap(szynaY + WYSOKOSC_SZYNY / 2) },
  });

  // Calkowity obrys obiektu
  const wszytkieObrysy = geometriePol.map((g) => g.obrys);
  const minX = Math.min(szynaX, ...wszytkieObrysy.map((o) => o.x));
  const maxX = Math.max(szynaX + szerokoscSzyny, ...wszytkieObrysy.map((o) => o.x + o.szerokosc));
  const minY = Math.min(szynaY - MARGINES_PIONOWY, ...wszytkieObrysy.map((o) => o.y));
  const maxY = Math.max(szynaY + WYSOKOSC_SZYNY + MARGINES_PIONOWY, ...wszytkieObrysy.map((o) => o.y + o.wysokosc));

  return {
    obiektId: obiekt.id,
    obrys: {
      x: snap(minX - MARGINES_PIONOWY),
      y: snap(minY),
      szerokosc: snap(maxX - minX + 2 * MARGINES_PIONOWY),
      wysokosc: snap(maxY - minY),
    },
    szyna,
    pola: geometriePol.sort((a, b) => a.polaId.localeCompare(b.polaId)),
    porty: porty.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
