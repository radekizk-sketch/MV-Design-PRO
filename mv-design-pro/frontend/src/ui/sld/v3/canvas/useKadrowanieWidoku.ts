/**
 * KADROWANIE WIDOKU schematu — stan i polecenia przestrzeni roboczej (karta K2,
 * kontrakt UI-04, W5-UI-04/14/15).
 *
 * Hook łączy trzy czyste moduły w polecenia projektanta:
 *  - `zakresKadru.ts` — cel → zakres rysunku (jedno źródło zakresu, §0.1);
 *  - `historiaKadrow.ts` — „Poprzedni widok" (§0.4);
 *  - adapter toru zasilania (`ui2/adapters/topologiaZasilenia.ts`) — JEDYNE
 *    źródło toru (§0.7, zero przeszukiwania topologii we froncie).
 *
 * Kanwa (`SldCanvasV3`) dostaje wyłącznie żądania (`zadanieKadru`,
 * `przywrocenieKamery`) i kurtynę kadru (`refyKurtyny`) — kamera pozostaje jej
 * stanem wewnętrznym.
 *
 * K2b §0.3 — HISTORIA = KONTEKST PRACY. Wpis historii niesie kamerę, ścieżkę,
 * zaznaczenie (z kontekstem kliknięcia) i kurtynę. Trzy reguły:
 *  - wejście w cel (dwuklik stacji, „Dopasuj do…", wskazanie z wyników) odkłada
 *    widok SPRZED gestu — dla dwukliku zaznaczenie sprzed pierwszego kliku
 *    (`opcje.zaznaczeniePrzed`), bo pierwszy klik gestu sam zaznacza stację;
 *  - poprzednia/następna stacja (`opcje.przeglad`) wewnątrz kadru stacji NIE
 *    odkłada wpisu: całe przeglądanie stacji to jeden wpis powrotu;
 *  - poziom „Sieć" ścieżki wraca do wpisu sprzed wejścia w cel
 *    (`zdejmijDoWejscia`) — kamera, poziom szczegółu i zaznaczenie jak przed
 *    dwuklikiem. Escape bez zmian (zdejmuje zaznaczenie, nie widok).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  BladTopologiiZasilenia,
  pobierzTorElementu,
  type TorElementuOdpowiedz,
} from '../../../../ui2/adapters/topologiaZasilenia';
import type { SceneLod } from '../scene/buildScene';
import { scenaSld, scenyWszystkichPoziomow } from '../scene/scenaSld';
import type { ViewportTransform } from './camera';
import {
  dolozDoHistorii,
  zdejmijDoWejscia,
  zdejmijZHistorii,
  type WpisHistoriiKadru,
  type ZaznaczenieWidoku,
} from './historiaKadrow';
import {
  CELE_MENU_KADRU,
  zakresCelu,
  zakresNarysowany,
  zakresToru,
  type CelKadru,
  type PoziomSciezki,
  type WynikZakresu,
  type ZakresKadru,
} from './zakresKadru';

/** Dostępność celu menu „Dopasuj do…" dla bieżącego zaznaczenia. */
export type DostepnoscCelu =
  | { readonly dostepny: true }
  | { readonly dostepny: false; readonly przyczyna: string };

export interface KomunikatKadru {
  readonly rodzaj: 'informacja' | 'ostrzezenie' | 'blad';
  readonly tekst: string;
  /** Kolejne zdania szczegółu (np. drogi warunkowe toru) — każde osobno. */
  readonly szczegoly: readonly string[];
}

export interface StanKameryWorkspace {
  readonly transform: ViewportTransform;
  readonly lod: SceneLod;
  /** Viewport kanwy, w którym `transform` obowiązuje (para z jednego stanu kamery). */
  readonly viewportSize: { readonly width: number; readonly height: number };
}

const NIE_NARYSOWANY = 'Zakres nie jest narysowany na schemacie na żadnym poziomie szczegółu.';

/**
 * Opis odpowiedzi toru tekstem — drogi warunkowe i przyczyny wprost z backendu.
 *
 * Rodzaj komunikatu wynika WYŁĄCZNIE ze statusu backendu (`zbuduj_tor_elementu`):
 * `rozstrzygniety` — od każdego źródła co najwyżej jedna droga i wszystkie pewne
 * (informacja); `nierozstrzygniety` — łącznik nieustalony, pętla bez punktu podziału
 * albo obcięta lista dróg (ostrzeżenie, przyczyny w szczegółach); `brak_drogi` —
 * element w wyspie bez źródła (ostrzeżenie). Front nie wyprowadza rodzaju z własnego
 * progu (np. liczby dróg warunkowych) — to byłaby druga, rozjeżdżalna klasyfikacja
 * tego samego wyniku (kontrakt werdyktu wyjaśnialnego).
 */
export function opisToru(tor: TorElementuOdpowiedz): KomunikatKadru {
  const nazwaElementu = tor.element.nazwa || tor.element.ref_id;
  const szczegoly: string[] = [];
  const warunkowe = tor.drogi.filter((droga) => !droga.pewna);
  for (const droga of warunkowe) {
    const laczniki = droga.laczniki_nieustalone.length > 0 ? ` — łączniki o nieustalonym stanie: ${droga.laczniki_nieustalone.join(', ')}` : '';
    szczegoly.push(`Droga warunkowa od źródła ${droga.zrodlo_ref}${laczniki}.`);
  }
  for (const przyczyna of tor.przyczyny) szczegoly.push(przyczyna.opis);
  if (tor.drogi_obciete) szczegoly.push('Lista dróg jest obcięta przez backend — kadr obejmuje drogi zwrócone w odpowiedzi.');
  const pewne = tor.drogi.length - warunkowe.length;
  const liczby = `dróg ${tor.drogi.length} (pewnych ${pewne}, warunkowych ${warunkowe.length})`;
  switch (tor.status) {
    case 'brak_drogi':
      return {
        rodzaj: 'ostrzezenie',
        tekst: `Tor zasilania elementu ${nazwaElementu}: brak drogi od źródła sieciowego (brak drogi).`,
        szczegoly,
      };
    case 'nierozstrzygniety':
      return {
        rodzaj: 'ostrzezenie',
        tekst: `Tor zasilania elementu ${nazwaElementu}: ${liczby}, tor nierozstrzygnięty. Podstawa: ${tor.opis_podstawy}`,
        szczegoly,
      };
    case 'rozstrzygniety':
      return {
        rodzaj: 'informacja',
        tekst: `Tor zasilania elementu ${nazwaElementu}: ${liczby}. Podstawa: ${tor.opis_podstawy}`,
        szczegoly,
      };
  }
}

export interface KadrowanieWidoku {
  readonly zadanieKadru: { readonly zakres: ZakresKadru; readonly seq: number } | null;
  readonly przywrocenieKamery: (StanKameryWorkspace & { readonly seq: number }) | null;
  readonly sciezka: readonly PoziomSciezki[];
  readonly historia: readonly WpisHistoriiKadru[];
  readonly komunikat: KomunikatKadru | null;
  readonly torWToku: boolean;
  readonly dostepnosc: Readonly<Record<CelKadru, DostepnoscCelu>>;
  /** Stacje w porządku obchodu rysunku (`SceneV3Meta.stationTraversalOrder`). */
  readonly stacjeObchodu: readonly string[];
  /** Indeks bieżącej stacji kadru w `stacjeObchodu` (`null`: kadr nie jest kadrem jednej stacji). */
  readonly indeksStacji: number | null;
  /** Kurtyna kadru: refy rysunku celu bieżącego kadru (`null` = bez kurtyny —
   *  widok sieci, polecenie spoza kadrowania). Kanwa przyciemnia wszystko poza
   *  nimi (K2b §0.1 (c) „izolacja"). */
  readonly refyKurtyny: readonly string[] | null;
  kadrujCel(cel: CelKadru, kontekst?: readonly string[], opcje?: OpcjeKadru): void;
  kadrujPoziom(poziom: PoziomSciezki): void;
  dopasujZakres(): void;
  poprzedniWidok(): void;
  /** Polecenie widoku spoza kadrowania (np. „Cały arkusz") — odkłada kadr do historii. */
  zapamietajPrzedPoleceniem(): void;
  zamknijKomunikat(): void;
}

/** Opcje polecenia kadru (K2b §0.3). */
export interface OpcjeKadru {
  /** Zaznaczenie sprzed gestu (dwuklik: sprzed pierwszego kliku). Brak = bieżące. */
  readonly zaznaczeniePrzed?: ZaznaczenieWidoku;
  /** Przeglądanie stacji (poprzednia/następna) — bez nowego wpisu historii, gdy
   *  bieżący kadr jest już kadrem stacji. */
  readonly przeglad?: boolean;
}

export function useKadrowanieWidoku(opcje: {
  readonly snapshot: EnergyNetworkModel | null;
  readonly kamera: StanKameryWorkspace | null;
  readonly zaznaczenie: readonly string[];
  readonly caseId: string | null;
  /** Bieżące zaznaczenie z kontekstem kliknięcia (do wpisu historii). */
  readonly pobierzZaznaczenie: () => ZaznaczenieWidoku;
  /** Odtworzenie zaznaczenia z wpisu historii. */
  readonly przywrocZaznaczenie: (zaznaczenie: ZaznaczenieWidoku) => void;
}): KadrowanieWidoku {
  const { snapshot, kamera, zaznaczenie, caseId } = opcje;
  const zaznaczenieWidokuRef = useRef({ pobierz: opcje.pobierzZaznaczenie, przywroc: opcje.przywrocZaznaczenie });
  zaznaczenieWidokuRef.current = { pobierz: opcje.pobierzZaznaczenie, przywroc: opcje.przywrocZaznaczenie };
  const [zadanieKadru, setZadanieKadru] = useState<KadrowanieWidoku['zadanieKadru']>(null);
  const [przywrocenieKamery, setPrzywrocenieKamery] = useState<KadrowanieWidoku['przywrocenieKamery']>(null);
  const [sciezka, setSciezka] = useState<readonly PoziomSciezki[]>([]);
  const [historia, setHistoria] = useState<readonly WpisHistoriiKadru[]>([]);
  const [komunikat, setKomunikat] = useState<KomunikatKadru | null>(null);
  const [torWToku, setTorWToku] = useState(false);
  const [refyKurtyny, setRefyKurtyny] = useState<readonly string[] | null>(null);
  const refyKurtynyRef = useRef(refyKurtyny);
  refyKurtynyRef.current = refyKurtyny;
  const seq = useRef(0);
  const zapytanieToru = useRef(0);
  // Bieżące wartości dla poleceń (stabilne referencje funkcji, aktualne dane).
  const kameraRef = useRef(kamera);
  kameraRef.current = kamera;
  const sciezkaRef = useRef(sciezka);
  sciezkaRef.current = sciezka;
  const historiaRef = useRef(historia);
  historiaRef.current = historia;

  const sceny = useMemo(() => (snapshot ? scenyWszystkichPoziomow(snapshot) : null), [snapshot]);

  const wynikCelu = useCallback(
    (cel: Exclude<CelKadru, 'tor'>, kontekst: readonly string[]): WynikZakresu => {
      if (!snapshot || !sceny) return { dostepny: false, przyczyna: 'Brak modelu sieci — nie ma czego kadrować.' };
      const wynik = zakresCelu(cel, snapshot, kontekst, sceny[2]);
      if (wynik.dostepny && !zakresNarysowany(sceny, wynik.zakres)) return { dostepny: false, przyczyna: NIE_NARYSOWANY };
      return wynik;
    },
    [snapshot, sceny],
  );

  const dostepnosc = useMemo<Readonly<Record<CelKadru, DostepnoscCelu>>>(() => {
    const wynik = {} as Record<CelKadru, DostepnoscCelu>;
    for (const cel of CELE_MENU_KADRU) {
      if (cel === 'tor') {
        wynik.tor = !caseId
          ? { dostepny: false, przyczyna: 'Brak aktywnego przypadku obliczeniowego — tor zasilania liczy backend dla przypadku.' }
          : zaznaczenie.length !== 1
            ? {
                dostepny: false,
                przyczyna:
                  zaznaczenie.length === 0
                    ? 'Zaznacz jeden element, aby wykadrować jego tor zasilania od źródła.'
                    : 'Tor zasilania dotyczy jednego elementu — zaznacz dokładnie jeden.',
              }
            : { dostepny: true };
        continue;
      }
      const w = wynikCelu(cel, zaznaczenie);
      wynik[cel] = w.dostepny ? { dostepny: true } : { dostepny: false, przyczyna: w.przyczyna };
    }
    return wynik;
  }, [wynikCelu, zaznaczenie, caseId]);

  /** Wpis historii z BIEŻĄCEGO widoku (kamera, ścieżka, zaznaczenie, kurtyna). */
  const odlozWidok = useCallback((zaznaczeniePrzed?: ZaznaczenieWidoku) => {
    const teraz = kameraRef.current;
    if (!teraz) return;
    const stos = dolozDoHistorii(historiaRef.current, {
      transform: teraz.transform,
      lod: teraz.lod,
      viewportSize: teraz.viewportSize,
      sciezka: sciezkaRef.current,
      zaznaczenie: zaznaczeniePrzed ?? zaznaczenieWidokuRef.current.pobierz(),
      kurtyna: refyKurtynyRef.current,
    });
    historiaRef.current = stos;
    setHistoria(stos);
  }, []);

  const wykonajKadr = useCallback(
    (zakres: ZakresKadru, nowyKomunikat: KomunikatKadru | null, opcjeKadru?: OpcjeKadru) => {
      const biezacy = sciezkaRef.current[sciezkaRef.current.length - 1];
      const wPrzegladzieStacji = opcjeKadru?.przeglad === true && biezacy?.cel === 'stacja';
      if (!wPrzegladzieStacji) odlozWidok(opcjeKadru?.zaznaczeniePrzed);
      seq.current += 1;
      setZadanieKadru({ zakres, seq: seq.current });
      const nowaSciezka = zakres.cel === 'siec' ? [] : zakres.sciezka;
      sciezkaRef.current = nowaSciezka;
      setSciezka(nowaSciezka);
      const kurtyna = zakres.cel === 'siec' || zakres.refy.length === 0 ? null : zakres.refy;
      refyKurtynyRef.current = kurtyna;
      setRefyKurtyny(kurtyna);
      setKomunikat(nowyKomunikat);
    },
    [odlozWidok],
  );

  const kadrujTor = useCallback(
    (ref: string) => {
      if (!snapshot || !sceny || !caseId) return;
      zapytanieToru.current += 1;
      const numer = zapytanieToru.current;
      setTorWToku(true);
      setKomunikat(null);
      pobierzTorElementu(caseId, ref)
        .then((tor) => {
          if (numer !== zapytanieToru.current) return;
          const opis = opisToru(tor);
          const wynik = zakresToru(snapshot, tor);
          if (!wynik.dostepny) {
            setKomunikat(opis);
            return;
          }
          if (!zakresNarysowany(sceny, wynik.zakres)) {
            setKomunikat({ ...opis, rodzaj: 'ostrzezenie', szczegoly: [...opis.szczegoly, NIE_NARYSOWANY] });
            return;
          }
          wykonajKadr(wynik.zakres, opis);
        })
        .catch((blad: unknown) => {
          if (numer !== zapytanieToru.current) return;
          const tekst =
            blad instanceof BladTopologiiZasilenia
              ? `Nie udało się pobrać toru zasilania (HTTP ${blad.status}).`
              : 'Nie udało się pobrać toru zasilania — brak połączenia z serwerem obliczeń.';
          const szczegol =
            blad instanceof BladTopologiiZasilenia && typeof blad.szczegoly === 'object' && blad.szczegoly !== null
              ? JSON.stringify((blad.szczegoly as { detail?: unknown }).detail ?? blad.szczegoly)
              : null;
          setKomunikat({ rodzaj: 'blad', tekst, szczegoly: szczegol ? [szczegol] : [] });
        })
        .finally(() => {
          if (numer === zapytanieToru.current) setTorWToku(false);
        });
    },
    [snapshot, sceny, caseId, wykonajKadr],
  );

  const kadrujCel = useCallback(
    (cel: CelKadru, kontekst: readonly string[] = zaznaczenie, opcjeKadru?: OpcjeKadru) => {
      if (cel === 'tor') {
        if (kontekst.length === 1) kadrujTor(kontekst[0]);
        return;
      }
      const wynik = wynikCelu(cel, kontekst);
      if (!wynik.dostepny) {
        setKomunikat({ rodzaj: 'ostrzezenie', tekst: wynik.przyczyna, szczegoly: [] });
        return;
      }
      wykonajKadr(wynik.zakres, null, opcjeKadru);
    },
    [zaznaczenie, kadrujTor, wynikCelu, wykonajKadr],
  );

  /** Odtworzenie wpisu historii: kamera, ścieżka, kurtyna i zaznaczenie. */
  const przywrocWpis = useCallback((wpis: WpisHistoriiKadru) => {
    seq.current += 1;
    setPrzywrocenieKamery({ transform: wpis.transform, lod: wpis.lod, viewportSize: wpis.viewportSize, seq: seq.current });
    sciezkaRef.current = wpis.sciezka;
    setSciezka(wpis.sciezka);
    refyKurtynyRef.current = wpis.kurtyna;
    setRefyKurtyny(wpis.kurtyna);
    setKomunikat(null);
    zaznaczenieWidokuRef.current.przywroc(wpis.zaznaczenie);
  }, []);

  const kadrujPoziom = useCallback(
    (poziom: PoziomSciezki) => {
      if (poziom.cel === 'siec') {
        // K2b §0.3: „Sieć" = powrót do widoku sprzed wejścia w cel.
        const wejscie = zdejmijDoWejscia(historiaRef.current);
        if (wejscie) {
          historiaRef.current = wejscie.stos;
          setHistoria(wejscie.stos);
          przywrocWpis(wejscie.wpis);
          return;
        }
      }
      kadrujCel(poziom.cel, poziom.kontekst);
    },
    [kadrujCel, przywrocWpis],
  );

  const dopasujZakres = useCallback(() => {
    kadrujCel(zaznaczenie.length > 0 ? 'zaznaczenie' : 'siec', zaznaczenie);
  }, [kadrujCel, zaznaczenie]);

  const poprzedniWidok = useCallback(() => {
    const zdjety = zdejmijZHistorii(historiaRef.current);
    if (!zdjety) return;
    historiaRef.current = zdjety.stos;
    setHistoria(zdjety.stos);
    przywrocWpis(zdjety.wpis);
  }, [przywrocWpis]);

  const zapamietajPrzedPoleceniem = useCallback(() => {
    odlozWidok();
    sciezkaRef.current = [];
    setSciezka([]);
    refyKurtynyRef.current = null;
    setRefyKurtyny(null);
    setKomunikat(null);
  }, [odlozWidok]);

  const zamknijKomunikat = useCallback(() => setKomunikat(null), []);

  const stacjeObchodu = useMemo(
    () => (snapshot ? scenaSld(snapshot, 2).meta.stationTraversalOrder : []),
    [snapshot],
  );
  const indeksStacji = useMemo(() => {
    const ostatni = sciezka[sciezka.length - 1];
    if (!ostatni || ostatni.cel !== 'stacja' || ostatni.kontekst.length !== 1) return null;
    const i = stacjeObchodu.indexOf(ostatni.kontekst[0]);
    return i >= 0 ? i : null;
  }, [sciezka, stacjeObchodu]);

  return {
    zadanieKadru,
    przywrocenieKamery,
    sciezka,
    historia,
    komunikat,
    torWToku,
    dostepnosc,
    stacjeObchodu,
    indeksStacji,
    refyKurtyny,
    kadrujCel,
    kadrujPoziom,
    dopasujZakres,
    poprzedniWidok,
    zapamietajPrzedPoleceniem,
    zamknijKomunikat,
  };
}
