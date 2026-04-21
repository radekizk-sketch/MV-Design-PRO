/**
 * adapterSemantyczny.ts — Krok 1: Adapter semantyczny SLD.
 *
 * Buduje model semantyczny SiecSld z danych wejsciowych (demonstrator/snapshot).
 * Rozdziela obiekty SLD od geometrii i renderu.
 *
 * ARCHITEKTURA: Warstwa ADAPTERA — czyste funkcje, brak efektow ubocznych.
 * DETERMINIZM: Ten sam input → identyczny SiecSld.
 */

import type {
  SiecSld,
  ObiektSld,
  PolaczenieSld,
  PoleSld,
  ElementAparatury,
  TypObiektuSld,
  TypPola,
  KierunekPola,
  TypPolaczenia,
  TypAparatu,
} from './sldContracts';

// =============================================================================
// § 1. DANE WEJSCIOWE ADAPTERA (format przejsciowy)
// =============================================================================

/** Obiekt wejsciowy — format przejsciowy z demonstratora / przyszlego Snapshot. */
export interface ObiektWejsciowy {
  readonly id: string;
  readonly typ: TypObiektuSld;
  readonly nazwa: string;
  readonly napiecieKv: number;
  readonly sekcjeSzyn?: number;
  readonly pozycjaX?: number;
  readonly pozycjaY?: number;
  /** Deklarowane pola (jawne). */
  readonly pola?: readonly PolaWejsciowe[];
}

export interface PolaWejsciowe {
  readonly id: string;
  readonly typ: TypPola;
  readonly kierunek: KierunekPola;
  readonly etykieta: string;
  readonly celId?: string | null;
  readonly aparatura?: readonly AparatWejsciowy[];
}

export interface AparatWejsciowy {
  readonly typ: TypAparatu;
  readonly etykieta?: string;
  readonly katalogRef?: string | null;
}

/** Polaczenie wejsciowe. */
export interface PolaczenieWejsciowe {
  readonly id: string;
  readonly odObiektId: string;
  readonly doObiektId: string;
  readonly typ: TypPolaczenia;
  readonly typLinii?: 'KABEL' | 'NAPOWIETRZNA';
  readonly dlugoscKm?: number | null;
  readonly etykieta?: string;
  readonly normalnieOtwarty?: boolean;
}

/** Dane wejsciowe adaptera. */
export interface DaneWejsciowe {
  readonly obiekty: readonly ObiektWejsciowy[];
  readonly polaczenia: readonly PolaczenieWejsciowe[];
}

// =============================================================================
// § 2. DOMYSLNA APARATURA WG TYPU POLA
// =============================================================================

import {
  TypPola as TP,
  TypAparatu as TA,
  ETYKIETY_APARATY,
} from './sldContracts';

function domyslnaAparatura(typPola: TypPola): readonly ElementAparatury[] {
  const tworzElement = (typ: TypAparatu, idx: number): ElementAparatury => ({
    id: `ap-${idx}`,
    typ,
    etykieta: ETYKIETY_APARATY[typ],
    katalogRef: null,
    powiazanieZabezpieczenia: null,
  });

  switch (typPola) {
    case TP.LINIOWE_WEJSCIOWE:
    case TP.LINIOWE_WYJSCIOWE:
      return [
        tworzElement(TA.GLOWICA_KABLOWA, 0),
        tworzElement(TA.ODLACZNIK, 1),
        tworzElement(TA.WYLACZNIK, 2),
        tworzElement(TA.PRZEKLADNIK_PRADOWY, 3),
        tworzElement(TA.GLOWICA_KABLOWA, 4),
      ];
    case TP.ODGALEZIENIOWE:
      return [
        tworzElement(TA.GLOWICA_KABLOWA, 0),
        tworzElement(TA.WYLACZNIK, 1),
        tworzElement(TA.PRZEKLADNIK_PRADOWY, 2),
        tworzElement(TA.GLOWICA_KABLOWA, 3),
      ];
    case TP.TRANSFORMATOROWE:
      return [
        tworzElement(TA.ODLACZNIK, 0),
        tworzElement(TA.WYLACZNIK, 1),
        tworzElement(TA.PRZEKLADNIK_PRADOWY, 2),
        tworzElement(TA.TRANSFORMATOR, 3),
      ];
    case TP.ZRODLO_PV:
      return [
        tworzElement(TA.WYLACZNIK, 0),
        tworzElement(TA.PRZEKLADNIK_PRADOWY, 1),
        tworzElement(TA.FALOWNIK, 2),
        tworzElement(TA.GENERATOR_PV, 3),
      ];
    case TP.ZRODLO_BESS:
      return [
        tworzElement(TA.WYLACZNIK, 0),
        tworzElement(TA.PRZEKLADNIK_PRADOWY, 1),
        tworzElement(TA.FALOWNIK, 2),
        tworzElement(TA.GENERATOR_BESS, 3),
      ];
    case TP.SPRZEGLO:
      return [tworzElement(TA.WYLACZNIK, 0)];
    case TP.POMIAROWE:
      return [
        tworzElement(TA.PRZEKLADNIK_PRADOWY, 0),
        tworzElement(TA.PRZEKLADNIK_NAPIECIOWY, 1),
      ];
  }
}

// =============================================================================
// § 3. ADAPTER SEMANTYCZNY
// =============================================================================

/**
 * Buduje pelny model semantyczny SiecSld z danych wejsciowych.
 *
 * Krok 1 pipeline'u SLD.
 * DETERMINIZM: sortowanie po id, brak losowosci.
 */
export function zbudujSiecSld(dane: DaneWejsciowe): SiecSld {
  // Buduj indeks polaczen (obiektId → lista polaczen)
  const polaczenieMap = new Map<string, PolaczenieWejsciowe[]>();
  for (const pol of dane.polaczenia) {
    if (!polaczenieMap.has(pol.odObiektId)) polaczenieMap.set(pol.odObiektId, []);
    if (!polaczenieMap.has(pol.doObiektId)) polaczenieMap.set(pol.doObiektId, []);
    polaczenieMap.get(pol.odObiektId)!.push(pol);
    polaczenieMap.get(pol.doObiektId)!.push(pol);
  }

  const obiekty: ObiektSld[] = dane.obiekty.map((ob) => {
    // Zbierz jawne pola z wejscia
    const polaJawne: PoleSld[] = (ob.pola ?? []).map((p, idx) => ({
      id: `${ob.id}-${p.id}`,
      obiektId: ob.id,
      typ: p.typ,
      kierunek: p.kierunek,
      kolejnosc: idx,
      etykieta: p.etykieta,
      jawne: true,
      aparatura: p.aparatura
        ? p.aparatura.map((a, ai) => ({
            id: `${ob.id}-${p.id}-ap${ai}`,
            typ: a.typ,
            etykieta: a.etykieta ?? ETYKIETY_APARATY[a.typ],
            katalogRef: a.katalogRef ?? null,
            powiazanieZabezpieczenia: null,
          }))
        : domyslnaAparatura(p.typ).map((a, ai) => ({
            ...a,
            id: `${ob.id}-${p.id}-ap${ai}`,
          })),
      celId: p.celId ?? null,
      celKotwica: null,
      celXHint: null,
    }));

    return {
      id: ob.id,
      typ: ob.typ,
      nazwa: ob.nazwa,
      napiecieKv: ob.napiecieKv,
      pola: polaJawne.sort((a, b) => a.id.localeCompare(b.id)),
      sekcjeSzyn: ob.sekcjeSzyn ?? 1,
      pozycjaBazowa: ob.pozycjaX != null && ob.pozycjaY != null
        ? { x: ob.pozycjaX, y: ob.pozycjaY }
        : null,
    };
  });

  const polaczenia: PolaczenieSld[] = dane.polaczenia.map((pol) => {
    // Wyznacz pole poczatkowe i koncowe
    const obiektOd = obiekty.find((o) => o.id === pol.odObiektId);
    const obiektDo = obiekty.find((o) => o.id === pol.doObiektId);

    // Znajdz lub stworz referencje do pol
    const polaOd = obiektOd?.pola.find((p) =>
      p.celId === pol.doObiektId ||
      p.typ === TP.LINIOWE_WYJSCIOWE ||
      p.typ === TP.ODGALEZIENIOWE
    );
    const polaDo = obiektDo?.pola.find((p) =>
      p.celId === pol.odObiektId ||
      p.typ === TP.LINIOWE_WEJSCIOWE
    );

    return {
      id: pol.id,
      odId: pol.odObiektId,
      odPolaId: polaOd?.id ?? `${pol.odObiektId}-auto-out`,
      doId: pol.doObiektId,
      doPolaId: polaDo?.id ?? `${pol.doObiektId}-auto-in`,
      typ: pol.typ,
      typLinii: pol.typLinii ?? 'KABEL',
      dlugoscKm: pol.dlugoscKm ?? null,
      etykieta: pol.etykieta ?? '',
      normalnieOtwarty: pol.normalnieOtwarty ?? false,
    };
  });

  return {
    obiekty: obiekty.sort((a, b) => a.id.localeCompare(b.id)),
    polaczenia: polaczenia.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
