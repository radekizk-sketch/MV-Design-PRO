/*
 * Model i adaptery okna „Zgodność powykonawcza" (karta U4 P45). Odpowiada za:
 *   1. serializację wejścia do żądania backendu (CSV → tekst surowy,
 *      wiersze edytora → lista JSON `pomiary`; tolerancje z przecinkiem PL),
 *   2. walidację przed wysłaniem (komunikaty PL; backend i tak zwróci 422 PL),
 *   3. mapowanie odpowiedzi (`WidokZgodnosci`) na model wspólnego wzorca ekranu
 *      analizy (`wzorzec`: kolumny + wiersze + założenia).
 *
 * Zero fizyki, zero ocen lokalnych — werdykty, odchyłki i tolerancje pochodzą
 * WYŁĄCZNIE z backendu. Serializacja (kropka dziesiętna) należy do klienta;
 * edytor prezentuje z przecinkiem PL.
 */

import type {
  DefinicjaKolumny,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzec';
import type {
  PomiarWejscie,
  WidokZgodnosci,
  WielkoscPomiaru,
  WierszZgodnosci,
  ZgodnoscZadanie,
} from './api';
import {
  JEDNOSTKA_WIELKOSCI,
  ODBIOR_STRINGS,
  fmtProcent,
  fmtWartosc,
  parsujLiczbaPL,
  wielkoscPL,
} from './strings';

// ---------------------------------------------------------------------------
// Stan edytora wierszy (prezentacja) — wartości surowe z przecinkiem PL
// ---------------------------------------------------------------------------

/** Tryb wejścia pomiarów. */
export type TrybWejscia = 'csv' | 'wiersze';

/** Pojedynczy wiersz edytora (wartości jako surowy tekst — przecinek PL). */
export interface WierszEdytora {
  readonly element_ref: string;
  readonly wielkosc: WielkoscPomiaru;
  readonly wartosc: string;
}

/** Domyślny (pusty) wiersz edytora. */
export const WIERSZ_EDYTORA_DOMYSLNY: WierszEdytora = {
  element_ref: '',
  wielkosc: 'U',
  wartosc: '',
};

/** Czy wiersz edytora jest całkowicie pusty (do pominięcia przy serializacji). */
export function wierszPusty(w: WierszEdytora): boolean {
  return w.element_ref.trim() === '' && w.wartosc.trim() === '';
}

// ---------------------------------------------------------------------------
// Budowa żądania + walidacja (przed wysłaniem)
// ---------------------------------------------------------------------------

/** Wynik budowy żądania: gotowe body albo lista błędów walidacji PL. */
export type WynikBudowy =
  | { readonly ok: true; readonly zadanie: ZgodnoscZadanie }
  | { readonly ok: false; readonly bledy: readonly string[] };

/** Parametry wejściowe budowy żądania. */
export interface WejscieBudowy {
  readonly runId: string;
  readonly tryb: TrybWejscia;
  readonly csv: string;
  readonly wiersze: readonly WierszEdytora[];
  readonly tolNapiecie: string;
  readonly tolMoc: string;
}

/** Serializuje wiersze edytora do listy `pomiary` (jednostka z wielkości). */
function serializujWiersze(
  wiersze: readonly WierszEdytora[],
): { pomiary: PomiarWejscie[]; bledy: string[] } {
  const pomiary: PomiarWejscie[] = [];
  const bledy: string[] = [];
  wiersze.forEach((w, i) => {
    if (wierszPusty(w)) return;
    const numer = i + 1;
    const element = w.element_ref.trim();
    if (element === '') {
      bledy.push(`Wiersz ${numer}: brak identyfikatora elementu (element_ref).`);
      return;
    }
    const wartosc = parsujLiczbaPL(w.wartosc);
    if (wartosc === 'pusto') {
      bledy.push(`Wiersz ${numer}: podaj wartość pomiaru.`);
      return;
    }
    if (wartosc === 'blad') {
      bledy.push(`Wiersz ${numer}: wartość „${w.wartosc.trim()}" nie jest liczbą.`);
      return;
    }
    pomiary.push({
      element_ref: element,
      wielkosc: w.wielkosc,
      wartosc,
      jednostka: JEDNOSTKA_WIELKOSCI[w.wielkosc],
    });
  });
  return { pomiary, bledy };
}

/** Parsuje pojedyncze pole tolerancji; dokłada błąd PL do listy przy niepowodzeniu. */
function parsujTolerancje(
  surowy: string,
  bledLiczba: string,
  bledUjemna: string,
  bledy: string[],
): number | null {
  const wynik = parsujLiczbaPL(surowy);
  if (wynik === 'pusto') return null;
  if (wynik === 'blad') {
    bledy.push(bledLiczba);
    return null;
  }
  if (wynik < 0) {
    bledy.push(bledUjemna);
    return null;
  }
  return wynik;
}

/**
 * Buduje żądanie raportu z wejścia UI i waliduje je (PL). W trybie wierszy
 * wielkości są znane, więc egzekwuje wymagane tolerancje zależnie od U/P/Q;
 * w trybie CSV (wielkości nieznane bez parsowania) wymaga co najmniej jednej
 * tolerancji — pełną spójność rozstrzyga backend (422 PL).
 */
export function zbudujZadanie(wejscie: WejscieBudowy): WynikBudowy {
  const bledy: string[] = [];

  const napiecie_pct = parsujTolerancje(
    wejscie.tolNapiecie,
    ODBIOR_STRINGS.bladTolNapiecieLiczba,
    ODBIOR_STRINGS.bladTolNapiecieUjemna,
    bledy,
  );
  const moc_pct = parsujTolerancje(
    wejscie.tolMoc,
    ODBIOR_STRINGS.bladTolMocLiczba,
    ODBIOR_STRINGS.bladTolMocUjemna,
    bledy,
  );

  let pomiary: PomiarWejscie[] | undefined;
  let csv: string | undefined;

  if (wejscie.tryb === 'wiersze') {
    const wynik = serializujWiersze(wejscie.wiersze);
    bledy.push(...wynik.bledy);
    if (wynik.pomiary.length === 0 && wynik.bledy.length === 0) {
      bledy.push(ODBIOR_STRINGS.bladBrakWierszy);
    }
    const wielkosci = new Set(wynik.pomiary.map((p) => p.wielkosc));
    if (wielkosci.has('U') && napiecie_pct === null) {
      bledy.push(ODBIOR_STRINGS.bladWymaganaTolNapiecie);
    }
    if ((wielkosci.has('P') || wielkosci.has('Q')) && moc_pct === null) {
      bledy.push(ODBIOR_STRINGS.bladWymaganaTolMoc);
    }
    if (wynik.pomiary.length > 0) pomiary = wynik.pomiary;
  } else {
    if (wejscie.csv.trim() === '') {
      bledy.push(ODBIOR_STRINGS.bladBrakCsv);
    }
    if (napiecie_pct === null && moc_pct === null) {
      bledy.push(ODBIOR_STRINGS.bladBrakTolerancji);
    }
    if (wejscie.csv.trim() !== '') csv = wejscie.csv;
  }

  if (bledy.length > 0) {
    return { ok: false, bledy };
  }

  const tolerancje: { napiecie_pct?: number; moc_pct?: number } = {};
  if (napiecie_pct !== null) tolerancje.napiecie_pct = napiecie_pct;
  if (moc_pct !== null) tolerancje.moc_pct = moc_pct;

  return {
    ok: true,
    zadanie: {
      run_id: wejscie.runId,
      ...(pomiary ? { pomiary } : {}),
      ...(csv !== undefined ? { csv } : {}),
      tolerancje,
    },
  };
}

// ---------------------------------------------------------------------------
// Klucz wiersza + kolumny tabeli raportu
// ---------------------------------------------------------------------------

export const KLUCZ_WIERSZA_ZGODNOSCI = 'kluczWiersza';

/** Deterministyczny, unikatowy klucz wiersza raportu (element + wielkość). */
export function kluczWierszaZgodnosci(w: WierszZgodnosci): string {
  return `${w.element_ref}::${w.wielkosc}`;
}

export const KOLUMNY_ZGODNOSCI: DefinicjaKolumny[] = [
  { klucz: 'element', etykieta: ODBIOR_STRINGS.kolElement, wyrownanie: 'lewo' },
  { klucz: 'wielkosc', etykieta: ODBIOR_STRINGS.kolWielkosc, wyrownanie: 'lewo' },
  { klucz: 'pomiar', etykieta: ODBIOR_STRINGS.kolPomiar, mono: true },
  { klucz: 'model', etykieta: ODBIOR_STRINGS.kolModel, mono: true },
  { klucz: 'odchylka', etykieta: ODBIOR_STRINGS.kolOdchylka, mono: true },
  {
    klucz: 'odchylkaPct',
    etykieta: ODBIOR_STRINGS.kolOdchylkaPct,
    jednostka: ODBIOR_STRINGS.jednProcent,
    mono: true,
  },
  {
    klucz: 'tolerancja',
    etykieta: ODBIOR_STRINGS.kolTolerancja,
    jednostka: ODBIOR_STRINGS.jednProcent,
    mono: true,
  },
  { klucz: 'werdykt', etykieta: ODBIOR_STRINGS.kolWerdykt, wyrownanie: 'lewo', sortowalna: false },
];

/** Komórka liczbowa: null → „—" (sortowana na dół); wartość → PL + sortKey. */
function komorkaLiczba(
  wartosc: number | null,
  format: (n: number) => string,
  opcje?: { jednostka?: string; ostrzezenie?: boolean },
): WartoscKomorki {
  if (wartosc === null) {
    return { wartosc: ODBIOR_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return {
    wartosc: format(wartosc),
    sortKey: wartosc,
    jednostka: opcje?.jednostka,
    ostrzezenie: opcje?.ostrzezenie,
  };
}

/** Adapter: wiersz raportu → wiersz tabeli wzorca (werdykty wyłącznie z backendu). */
export function mapujWierszZgodnosci(w: WierszZgodnosci): WierszTabeli {
  const poza = w.werdykt === 'poza tolerancją';
  return {
    element: { wartosc: w.element_ref },
    wielkosc: { wartosc: wielkoscPL(w.wielkosc) },
    pomiar: komorkaLiczba(w.wartosc_pomiar, fmtWartosc, { jednostka: w.jednostka }),
    model: komorkaLiczba(w.wartosc_model, fmtWartosc, { jednostka: w.jednostka }),
    odchylka: komorkaLiczba(w.odchylka_bezwzgledna, fmtWartosc, {
      jednostka: w.jednostka,
      ostrzezenie: poza,
    }),
    odchylkaPct: komorkaLiczba(w.odchylka_pct, fmtProcent),
    tolerancja: komorkaLiczba(w.tolerancja_pct, fmtProcent),
    werdykt: { wartosc: w.werdykt },
    [KLUCZ_WIERSZA_ZGODNOSCI]: { wartosc: kluczWierszaZgodnosci(w) },
  };
}

/** Mapuje wiersze raportu na wiersze tabeli wzorca (kolejność źródłowa z backendu). */
export function naWierszeZgodnosci(wiersze: readonly WierszZgodnosci[]): WierszTabeli[] {
  return wiersze.map(mapujWierszZgodnosci);
}

/** Buduje sekcję ZAŁOŻENIA z listy `zalozenia_pl` backendu (zawsze widoczna). */
export function naZalozeniaZgodnosci(dane: WidokZgodnosci): WierszZalozenia[] {
  return dane.zalozenia_pl.map((tekst, i) => ({
    etykieta: `${i + 1}.`,
    wartosc: tekst,
  }));
}
