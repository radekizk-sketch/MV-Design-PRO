/*
 * Model i adaptery okna „Estymacja stanu (WLS)" (ui2/wyniki/estymacja). Odpowiada za:
 *   1. serializację wejścia do żądania backendu (wiersze edytora → lista JSON
 *      `pomiary`; α i próg LNR z przecinkiem PL),
 *   2. walidację przed wysłaniem (komunikaty PL; backend i tak zwróci 422 PL,
 *      np. dla układu niedookreślonego),
 *   3. mapowanie odpowiedzi (`WidokEstymacji`) na model wspólnego wzorca ekranu
 *      analizy (`wzorzec`: kolumny + wiersze + założenia) — estymowany stan
 *      węzłów oraz rezydua pomiarów.
 *
 * Zero fizyki, zero ocen lokalnych — |V|, kąty, rezydua, χ² i flagi podejrzeń
 * pochodzą WYŁĄCZNIE z backendu. Serializacja (kropka dziesiętna) należy do
 * klienta; edytor prezentuje z przecinkiem PL.
 *
 * Nazwy adapterów/kolumn są prefiksowane tematycznie (…_WEZLY / …_POMIARY), bo
 * barrel nadrzędny `ui2/wyniki/index.ts` robi `export *` z wielu modułów —
 * prefiks zapobiega kolizji nazw (TS2308).
 */

import type { ExecutionRun } from '../../../ui/study-cases/types';
import type {
  DefinicjaKolumny,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzec';
import type {
  EstymacjaZadanie,
  MetaTypuPomiaru,
  PomiarWejscie,
  RezyduumPomiaru,
  TypPomiaru,
  WidokEstymacji,
  WezelStanu,
} from './api';
import {
  ESTYMACJA_STRINGS,
  fmtKV,
  fmtPu,
  fmtRezyduum,
  fmtStopnie,
} from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu z rejestru — przebieg rozpływu (LOAD_FLOW/DONE)
// ---------------------------------------------------------------------------

/**
 * Ostatni/aktywny zakończony przebieg rozpływu (LOAD_FLOW/DONE) — źródło Y-bus.
 * Preferuje aktywny (gdy pasuje i zakończony), inaczej OSTATNI zakończony.
 * Deterministyczne dla danego wejścia (kolejność źródłowa listy `runs`).
 */
export function przebiegRozplywuEstymacji(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  const kandydaci = runs.filter((r) => r.analysis_type === 'LOAD_FLOW' && r.status === 'DONE');
  if (kandydaci.length === 0) return null;
  const aktywny = kandydaci.find((r) => r.id === activeRunId);
  return aktywny ?? kandydaci[kandydaci.length - 1];
}

// ---------------------------------------------------------------------------
// Stan edytora pomiarów (prezentacja) — wartości surowe z przecinkiem PL
// ---------------------------------------------------------------------------

/** Pojedynczy wiersz edytora pomiarów (wartości jako surowy tekst — przecinek PL). */
export interface WierszEdytora {
  readonly meas_type: TypPomiaru;
  readonly bus_ref: string;
  readonly value: string;
  readonly sigma: string;
  readonly bus_j_ref: string;
}

/** Domyślny (pusty) wiersz edytora — typ |V| (najczęstszy pomiar SCADA). */
export const WIERSZ_EDYTORA_DOMYSLNY: WierszEdytora = {
  meas_type: 'V_MAGNITUDE',
  bus_ref: '',
  value: '',
  sigma: '',
  bus_j_ref: '',
};

/** Czy wiersz edytora jest całkowicie pusty (do pominięcia przy serializacji). */
export function wierszPusty(w: WierszEdytora): boolean {
  return w.bus_ref.trim() === '' && w.value.trim() === '' && w.sigma.trim() === '';
}

/** Czy dany typ pomiaru wymaga węzła „do" gałęzi (wg metadanych z backendu). */
export function wymagaWezlaJ(
  typ: TypPomiaru,
  typy: readonly MetaTypuPomiaru[],
): boolean {
  return typy.find((t) => t.code === typ)?.requires_bus_j ?? false;
}

/** Polska etykieta typu pomiaru (z metadanych backendu; nieznany kod → dosłownie). */
export function typPomiaruPL(typ: TypPomiaru, typy: readonly MetaTypuPomiaru[]): string {
  return typy.find((t) => t.code === typ)?.label_pl ?? typ;
}

// ---------------------------------------------------------------------------
// Parsowanie liczb (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Parsuje liczbę z przecinkiem PL; `'pusto'` gdy puste, `'blad'` gdy nieliczbowe. */
export function parsujLiczbaPL(surowy: string): number | 'pusto' | 'blad' {
  const tekst = surowy.trim();
  if (tekst === '') return 'pusto';
  const liczba = Number(tekst.replace(',', '.'));
  return Number.isFinite(liczba) ? liczba : 'blad';
}

// ---------------------------------------------------------------------------
// Budowa żądania + walidacja (przed wysłaniem)
// ---------------------------------------------------------------------------

/** Domyślne parametry detekcji złych danych (kontrakt `StanWLSZadanie`). */
export const ALFA_DOMYSLNA = 0.01;
export const PROG_LNR_DOMYSLNY = 3.0;

/** Wynik budowy żądania: gotowe body albo lista błędów walidacji PL. */
export type WynikBudowy =
  | { readonly ok: true; readonly zadanie: EstymacjaZadanie }
  | { readonly ok: false; readonly bledy: readonly string[] };

/** Parametry wejściowe budowy żądania. */
export interface WejscieBudowy {
  readonly runId: string;
  readonly wiersze: readonly WierszEdytora[];
  readonly alfa: string;
  readonly progLnr: string;
  readonly typy: readonly MetaTypuPomiaru[];
  readonly includeTrace: boolean;
}

/** Serializuje wiersze edytora do listy `pomiary` (typy z wymagań backendu). */
function serializujWiersze(
  wiersze: readonly WierszEdytora[],
  typy: readonly MetaTypuPomiaru[],
): { pomiary: PomiarWejscie[]; bledy: string[] } {
  const pomiary: PomiarWejscie[] = [];
  const bledy: string[] = [];
  wiersze.forEach((w, i) => {
    if (wierszPusty(w)) return;
    const numer = i + 1;
    const bus = w.bus_ref.trim();
    if (bus === '') {
      bledy.push(`Wiersz ${numer}: ${ESTYMACJA_STRINGS.bladWezel}`);
      return;
    }
    const value = parsujLiczbaPL(w.value);
    if (value === 'pusto' || value === 'blad') {
      bledy.push(`Wiersz ${numer}: ${ESTYMACJA_STRINGS.bladWartosc}`);
      return;
    }
    const sigma = parsujLiczbaPL(w.sigma);
    if (sigma === 'pusto' || sigma === 'blad' || sigma <= 0) {
      bledy.push(`Wiersz ${numer}: ${ESTYMACJA_STRINGS.bladSigma}`);
      return;
    }
    const pomiar: {
      meas_type: TypPomiaru;
      bus_ref: string;
      value: number;
      sigma: number;
      bus_j_ref?: string;
    } = { meas_type: w.meas_type, bus_ref: bus, value, sigma };

    if (wymagaWezlaJ(w.meas_type, typy)) {
      const busJ = w.bus_j_ref.trim();
      if (busJ === '') {
        bledy.push(`Wiersz ${numer}: ${ESTYMACJA_STRINGS.bladWezelJ}`);
        return;
      }
      if (busJ === bus) {
        bledy.push(`Wiersz ${numer}: ${ESTYMACJA_STRINGS.bladWezelJRowny}`);
        return;
      }
      pomiar.bus_j_ref = busJ;
    }
    pomiary.push(pomiar);
  });
  return { pomiary, bledy };
}

/**
 * Buduje żądanie estymacji z wejścia UI i waliduje je (PL). Obserwowalność
 * (m < n lub układ niedookreślony) rozstrzyga backend (422 PL) — tu egzekwujemy
 * tylko poprawność pojedynczych pomiarów i parametrów detekcji.
 */
export function zbudujZadanie(wejscie: WejscieBudowy): WynikBudowy {
  const bledy: string[] = [];

  const { pomiary, bledy: bledyWierszy } = serializujWiersze(wejscie.wiersze, wejscie.typy);
  bledy.push(...bledyWierszy);
  if (pomiary.length === 0 && bledyWierszy.length === 0) {
    bledy.push(ESTYMACJA_STRINGS.bladBrakPomiarow);
  }

  // α ∈ (0; 1); puste → domyślne.
  const alfaParsed = parsujLiczbaPL(wejscie.alfa);
  let alpha = ALFA_DOMYSLNA;
  if (alfaParsed === 'pusto') {
    alpha = ALFA_DOMYSLNA;
  } else if (alfaParsed === 'blad' || alfaParsed <= 0 || alfaParsed >= 1) {
    bledy.push(ESTYMACJA_STRINGS.bladAlfa);
  } else {
    alpha = alfaParsed;
  }

  // Próg LNR > 0; puste → domyślne.
  const progParsed = parsujLiczbaPL(wejscie.progLnr);
  let lnr_threshold = PROG_LNR_DOMYSLNY;
  if (progParsed === 'pusto') {
    lnr_threshold = PROG_LNR_DOMYSLNY;
  } else if (progParsed === 'blad' || progParsed <= 0) {
    bledy.push(ESTYMACJA_STRINGS.bladProgLnr);
  } else {
    lnr_threshold = progParsed;
  }

  if (bledy.length > 0) {
    return { ok: false, bledy };
  }

  return {
    ok: true,
    zadanie: {
      run_id: wejscie.runId,
      pomiary,
      alpha,
      lnr_threshold,
      include_trace: wejscie.includeTrace,
    },
  };
}

// ---------------------------------------------------------------------------
// Komórki liczbowe (null → „—", sortowane na dół; wartość → PL + sortKey)
// ---------------------------------------------------------------------------

function komorkaLiczba(
  wartosc: number | null,
  format: (n: number) => string,
  opcje?: { jednostka?: string; ostrzezenie?: boolean },
): WartoscKomorki {
  if (wartosc === null) {
    return { wartosc: ESTYMACJA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return {
    wartosc: format(wartosc),
    sortKey: wartosc,
    jednostka: opcje?.jednostka,
    ostrzezenie: opcje?.ostrzezenie,
  };
}

// ---------------------------------------------------------------------------
// Tabela estymowanego stanu węzłów (|V|, kąt)
// ---------------------------------------------------------------------------

export const KLUCZ_WIERSZA_WEZLY = 'identyfikator';

export const KOLUMNY_WEZLY: DefinicjaKolumny[] = [
  { klucz: 'wezel', etykieta: ESTYMACJA_STRINGS.kolWezel, wyrownanie: 'lewo' },
  {
    klucz: 'napiecie',
    etykieta: ESTYMACJA_STRINGS.kolNapiecieZnam,
    jednostka: ESTYMACJA_STRINGS.jednKV,
    mono: true,
  },
  {
    klucz: 'modul',
    etykieta: ESTYMACJA_STRINGS.kolModul,
    jednostka: ESTYMACJA_STRINGS.jednPu,
    mono: true,
  },
  {
    klucz: 'kat',
    etykieta: ESTYMACJA_STRINGS.kolKat,
    jednostka: ESTYMACJA_STRINGS.jednStopnie,
    mono: true,
  },
  { klucz: 'rola', etykieta: ESTYMACJA_STRINGS.kolRola, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: KLUCZ_WIERSZA_WEZLY,
    etykieta: ESTYMACJA_STRINGS.kolIndeksWezla,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/** Adapter: estymowany stan węzła → wiersz tabeli wzorca (wartości z backendu). */
export function mapujWierszWezla(wezel: WezelStanu): WierszTabeli {
  return {
    wezel: { wartosc: wezel.name ?? wezel.bus_ref },
    napiecie: komorkaLiczba(wezel.voltage_kv, fmtKV),
    modul: komorkaLiczba(wezel.v_magnitude_pu, fmtPu),
    kat: komorkaLiczba(wezel.v_angle_deg, fmtStopnie),
    rola: {
      wartosc: wezel.is_slack ? ESTYMACJA_STRINGS.rolaSlack : ESTYMACJA_STRINGS.rolaZwykly,
    },
    [KLUCZ_WIERSZA_WEZLY]: { wartosc: wezel.bus_ref },
  };
}

/** Mapuje estymowane stany węzłów na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeWezlow(buses: readonly WezelStanu[]): WierszTabeli[] {
  return buses.map(mapujWierszWezla);
}

// ---------------------------------------------------------------------------
// Tabela rezyduów pomiarów (r, r_N, flaga podejrzenia)
// ---------------------------------------------------------------------------

export const KLUCZ_WIERSZA_POMIARY = 'kluczWiersza';

/** Deterministyczny klucz wiersza rezyduy (indeks pomiaru z backendu). */
export function kluczPomiaru(pomiar: RezyduumPomiaru): string {
  return `pomiar-${pomiar.index}`;
}

export const KOLUMNY_POMIARY: DefinicjaKolumny[] = [
  { klucz: 'typ', etykieta: ESTYMACJA_STRINGS.kolTypPomiaru, wyrownanie: 'lewo' },
  { klucz: 'wezel', etykieta: ESTYMACJA_STRINGS.kolWezelPomiaru, wyrownanie: 'lewo' },
  { klucz: 'wezelJ', etykieta: ESTYMACJA_STRINGS.kolWezelJ, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: 'wartosc',
    etykieta: ESTYMACJA_STRINGS.kolWartoscPomiaru,
    jednostka: ESTYMACJA_STRINGS.jednPu,
    mono: true,
  },
  {
    klucz: 'sigma',
    etykieta: ESTYMACJA_STRINGS.kolSigma,
    jednostka: ESTYMACJA_STRINGS.jednPu,
    mono: true,
  },
  {
    klucz: 'rezyduum',
    etykieta: ESTYMACJA_STRINGS.kolRezyduum,
    jednostka: ESTYMACJA_STRINGS.jednPu,
    mono: true,
  },
  { klucz: 'rezyduumZnorm', etykieta: ESTYMACJA_STRINGS.kolRezyduumZnorm, mono: true },
  { klucz: 'flaga', etykieta: ESTYMACJA_STRINGS.kolFlaga, wyrownanie: 'lewo', sortowalna: false },
];

/** Adapter: rezyduum pomiaru → wiersz tabeli wzorca (flaga wyłącznie z backendu). */
export function mapujWierszPomiaru(
  pomiar: RezyduumPomiaru,
  typy: readonly MetaTypuPomiaru[],
): WierszTabeli {
  return {
    typ: { wartosc: typPomiaruPL(pomiar.meas_type, typy) },
    wezel: { wartosc: pomiar.bus_ref },
    wezelJ: { wartosc: pomiar.bus_j_ref ?? ESTYMACJA_STRINGS.kreska },
    wartosc: komorkaLiczba(pomiar.value, fmtRezyduum),
    sigma: komorkaLiczba(pomiar.sigma, fmtRezyduum),
    rezyduum: komorkaLiczba(pomiar.residual, fmtRezyduum, { ostrzezenie: pomiar.suspect }),
    rezyduumZnorm: komorkaLiczba(pomiar.normalized_residual, fmtRezyduum, {
      ostrzezenie: pomiar.suspect,
    }),
    flaga: {
      wartosc: pomiar.suspect
        ? ESTYMACJA_STRINGS.flagaPodejrzany
        : ESTYMACJA_STRINGS.flagaOk,
    },
    [KLUCZ_WIERSZA_POMIARY]: { wartosc: kluczPomiaru(pomiar) },
  };
}

/** Mapuje rezydua pomiarów na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszePomiarow(
  pomiary: readonly RezyduumPomiaru[],
  typy: readonly MetaTypuPomiaru[],
): WierszTabeli[] {
  return pomiary.map((p) => mapujWierszPomiaru(p, typy));
}

// ---------------------------------------------------------------------------
// Sekcja ZAŁOŻENIA (metoda + baza mocy + slack + parametry detekcji)
// ---------------------------------------------------------------------------

/** Buduje sekcję ZAŁOŻENIA z widoku estymacji (wartości wyłącznie z backendu). */
export function naZalozeniaEstymacji(dane: WidokEstymacji): WierszZalozenia[] {
  return [
    { etykieta: ESTYMACJA_STRINGS.zalMetoda, wartosc: ESTYMACJA_STRINGS.zalMetodaWartosc },
    {
      etykieta: ESTYMACJA_STRINGS.zalBazaMocy,
      wartosc: fmtRezyduum(dane.base_mva),
      jednostka: ESTYMACJA_STRINGS.jednMva,
    },
    { etykieta: ESTYMACJA_STRINGS.zalSlack, wartosc: dane.slack_bus_ref },
    { etykieta: ESTYMACJA_STRINGS.zalAlfa, wartosc: fmtRezyduum(dane.bad_data.alpha) },
    { etykieta: ESTYMACJA_STRINGS.zalProgLnr, wartosc: fmtRezyduum(dane.bad_data.lnr_threshold) },
  ];
}
