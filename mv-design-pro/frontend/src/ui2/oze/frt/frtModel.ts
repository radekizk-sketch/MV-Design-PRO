/*
 * Model i adaptery okna „Walidacja modelu falownika" (trajektorie FRT, karta U4
 * P38). Czyste, read-only odwzorowanie stanu modelu (moduły DER ze store'a) oraz
 * odpowiedzi końcówki frt-trajectories (`../api`) na struktury prezentacji (opcje
 * doboru / serie wykresu / tabela wzorcowa / werdykt całości).
 *
 * GRANICE (NOT-A-SOLVER / zero fizyki): warstwa wyłącznie prezentuje. Werdykty
 * per scenariusz i pola trajektorii pochodzą WYŁĄCZNIE z backendu; werdykt całości
 * to prezentacyjna AGREGACJA SŁOWNIKOWA najgorszego werdyktu (bez oceny fizycznej).
 * „Napięcie skrajne" scenariusza to projekcja min/max napięcia trajektorii (rzut
 * danych odpowiedzi, nie wyliczenie fizyczne). Zero mutacji, zero wołań API stąd.
 *
 * Determinizm: kolejność modułów = kolejność `selectAllDers` (sort po id);
 * kolejność scenariuszy/punktów = kolejność źródłowa odpowiedzi. Brak `Date.now`.
 */

import type {
  ProfilOperatoraNcRfg,
  RodzajTestuFrt,
  ScenariuszFrt,
  WidokTrajektoriiFrt,
} from '../api';
import type {
  DerKindUnified,
  StationDerConnection,
} from '../../../ui/network-build/station-der';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import {
  FRT_STRINGS,
  fmtPuFrt,
  fmtPuOpcjaFrt,
  fmtSOpcjaFrt,
} from './strings';

// ---------------------------------------------------------------------------
// Dobór modułu DER — typ przekształtnika obecny?
// ---------------------------------------------------------------------------

/**
 * Opcja doboru modułu DER (wzorzec `ui2/oze/pulpit` — `selectAllDers`).
 * `derId` to identyfikator modułu w modelu (klucz/wartość selecta); `derRef` to
 * referencja typu katalogowego przekształtnika (`device_catalog_ref`) używana jako
 * parametr `der_ref` biegu — `null` oznacza moduł bez wskazanego typu (bieg
 * zablokowany, uczciwy stan).
 */
export interface OpcjaModuluFrt {
  readonly derId: string;
  readonly derRef: string | null;
  readonly etykieta: string;
  readonly rodzaj: DerKindUnified;
}

/**
 * Adapter: realne moduły DER (read-only ze store'a) → opcje doboru. Kolejność
 * źródłowa (`selectAllDers` sortuje po id). Etykieta bez typu przekształtnika
 * dostaje adnotację „brak wskazanego typu przekształtnika".
 */
export function opcjeModulowFrt(ders: readonly StationDerConnection[]): OpcjaModuluFrt[] {
  return ders.map((der) => {
    const derRef = der.catalogs.device_catalog_ref;
    return {
      derId: der.id,
      derRef,
      etykieta:
        derRef !== null
          ? `${der.name} · ${der.der_kind}`
          : `${der.name} · ${der.der_kind} (${FRT_STRINGS.modulBezTypu})`,
      rodzaj: der.der_kind,
    };
  });
}

/** Opcja doboru operatora OSD (nazwa PL na pierwszym planie). */
export interface OpcjaOperatoraFrt {
  readonly id: string;
  readonly etykieta: string;
}

/** Adapter: operatorzy katalogu NC RfG → opcje doboru (kolejność źródłowa). */
export function opcjeOperatorowFrt(
  operatorzy: readonly ProfilOperatoraNcRfg[],
): OpcjaOperatoraFrt[] {
  return operatorzy.map((op) => ({ id: op.operator_id, etykieta: op.operator_name_pl }));
}

// ---------------------------------------------------------------------------
// Serie wykresu — trajektoria U/Iq/P + obwiednia profilu
// ---------------------------------------------------------------------------

/** Punkt wykresu trajektorii: napięcie, prąd bierny i moc czynna w czasie. */
export interface PunktTrajektoriiWykresu {
  readonly czas: number;
  readonly napiecie: number;
  readonly iq: number;
  readonly p: number;
}

/** Adapter: trajektoria scenariusza → punkty wykresu (kolejność źródłowa). */
export function punktyTrajektoriiFrt(scenariusz: ScenariuszFrt): PunktTrajektoriiWykresu[] {
  return scenariusz.trajektoria.map((pt) => ({
    czas: pt.czas_s,
    napiecie: pt.napiecie_pu,
    iq: pt.iq_bierny_pu,
    p: pt.p_czynna_pu,
  }));
}

/** Punkt obwiedni profilu operatora (łamana czas→napięcie). */
export interface PunktObwiedniWykresu {
  readonly czas: number;
  readonly napiecie: number;
}

/** Adapter: obwiednia profilu → punkty wykresu (kolejność źródłowa). */
export function punktyObwiedniFrt(widok: WidokTrajektoriiFrt): PunktObwiedniWykresu[] {
  return widok.obwiednia_profilu.punkty.map((pt) => ({
    czas: pt.czas_s,
    napiecie: pt.napiecie_pu,
  }));
}

// ---------------------------------------------------------------------------
// „Napięcie skrajne" scenariusza — projekcja min/max trajektorii
// ---------------------------------------------------------------------------

/**
 * Napięcie skrajne zakłócenia [p.u.] — projekcja danych trajektorii odpowiedzi:
 * minimum napięcia dla LVRT (najgłębszy zapad), maksimum dla HVRT (najwyższy
 * wzrost). To RZUT danych z odpowiedzi (min/max), nie wyliczenie fizyczne — ta
 * sama klasa co agregacja werdyktu. Brak punktów → `null`.
 */
export function napiecieSkrajneFrt(
  scenariusz: ScenariuszFrt,
  rodzaj: RodzajTestuFrt,
): number | null {
  if (scenariusz.trajektoria.length === 0) return null;
  const napiecia = scenariusz.trajektoria.map((pt) => pt.napiecie_pu);
  return rodzaj === 'lvrt' ? Math.min(...napiecia) : Math.max(...napiecia);
}

// ---------------------------------------------------------------------------
// Tabela scenariuszy — wzorzec `TabelaWynikow` (ui2/wyniki/wzorzec)
// ---------------------------------------------------------------------------

/** Deklaratywne kolumny tabeli scenariuszy (etykiety PL, jednostki zawsze). */
export function kolumnyTabeliFrt(): DefinicjaKolumny[] {
  return [
    { klucz: 'scenariusz', etykieta: FRT_STRINGS.kolScenariusz, sortowalna: false },
    {
      klucz: 'glebokosc',
      etykieta: FRT_STRINGS.kolGlebokosc,
      jednostka: FRT_STRINGS.jednPu,
      mono: true,
    },
    { klucz: 'utrzymanie', etykieta: FRT_STRINGS.kolUtrzymanie },
    {
      klucz: 'margines_s',
      etykieta: FRT_STRINGS.kolMarginesS,
      jednostka: FRT_STRINGS.jednS,
      mono: true,
    },
    {
      klucz: 'margines_pu',
      etykieta: FRT_STRINGS.kolMarginesPu,
      jednostka: FRT_STRINGS.jednPu,
      mono: true,
    },
    {
      klucz: 'odzysk',
      etykieta: FRT_STRINGS.kolOdzysk,
      jednostka: FRT_STRINGS.jednS,
      mono: true,
    },
    { klucz: 'werdykt', etykieta: FRT_STRINGS.kolWerdykt, sortowalna: false },
  ];
}

/** Adapter jednego scenariusza → wiersz wzorca tabeli (semantyka `ValueRow`). */
function wierszScenariuszaFrt(scenariusz: ScenariuszFrt, rodzaj: RodzajTestuFrt): WierszTabeli {
  const skrajne = napiecieSkrajneFrt(scenariusz, rodzaj);
  return {
    scenariusz: { wartosc: scenariusz.scenario_id },
    glebokosc: {
      wartosc: skrajne === null ? FRT_STRINGS.kreska : fmtPuFrt(skrajne),
      sortKey: skrajne ?? undefined,
    },
    // Tag „Nie" czyta WYŁĄCZNIE flagę `stayed_connected` z backendu — bez oceny lokalnej.
    utrzymanie: {
      wartosc: scenariusz.stayed_connected
        ? FRT_STRINGS.utrzymanieTak
        : FRT_STRINGS.utrzymanieNie,
      ostrzezenie: !scenariusz.stayed_connected,
    },
    margines_s: {
      wartosc: fmtSOpcjaFrt(scenariusz.margin_to_curve_s),
      sortKey: scenariusz.margin_to_curve_s ?? undefined,
    },
    // Tag ostrzegawczy dla marginesu ujemnego (poza obwiednią) — flaga z pola solvera.
    margines_pu: {
      wartosc: fmtPuOpcjaFrt(scenariusz.margin_to_curve_pu),
      sortKey: scenariusz.margin_to_curve_pu ?? undefined,
      ostrzezenie: scenariusz.margin_to_curve_pu !== null && scenariusz.margin_to_curve_pu < 0,
    },
    odzysk: {
      wartosc: fmtSOpcjaFrt(scenariusz.p_recovery_time_s),
      sortKey: scenariusz.p_recovery_time_s ?? undefined,
    },
    werdykt: { wartosc: scenariusz.werdykt_pl },
  };
}

/** Adapter: widok trajektorii → wiersze tabeli scenariuszy (kolejność źródłowa). */
export function wierszeTabeliFrt(widok: WidokTrajektoriiFrt): WierszTabeli[] {
  return widok.scenariusze.map((sc) => wierszScenariuszaFrt(sc, widok.test_kind));
}

// ---------------------------------------------------------------------------
// Werdykt całości — agregacja słownikowa najgorszego werdyktu per scenariusz
// ---------------------------------------------------------------------------

/** Istotność werdyktu do doboru koloru banera (wyłącznie prezentacja). */
export type IstotnoscFrt = 'ok' | 'warn' | 'err';

/** Werdykt całości: tekst PL + istotność banera. */
export interface WerdyktCalosciFrt {
  readonly tekst: string;
  readonly istotnosc: IstotnoscFrt;
}

/**
 * Ranga werdyktu per scenariusz (słownik — im wyżej, tym gorzej). Wartości pól
 * `werdykt_pl` pochodzą z backendu: „w obwiedni" / „poza obwiednią" / „moduł wypadł".
 */
const RANGA_WERDYKTU: Record<string, number> = {
  'w obwiedni': 0,
  'poza obwiednią': 1,
  'moduł wypadł': 2,
};

const WERDYKT_CALOSCI: Record<number, WerdyktCalosciFrt> = {
  0: { tekst: FRT_STRINGS.werdyktWObwiedni, istotnosc: 'ok' },
  1: { tekst: FRT_STRINGS.werdyktPozaObwiednia, istotnosc: 'warn' },
  2: { tekst: FRT_STRINGS.werdyktModulWypadl, istotnosc: 'err' },
};

/**
 * Werdykt całości = prezentacyjna AGREGACJA SŁOWNIKOWA najgorszego werdyktu
 * scenariusza (najwyższa ranga). Brak scenariuszy → stan „w obwiedni" jako neutralny
 * (nic nie naruszone). To NIE jest odrębna ocena fizyczna — jedynie rzut najgorszego
 * werdyktu z pól solvera. Werdykt nieznany (spoza słownika) traktowany jako najgorszy.
 */
export function werdyktCalosciFrt(widok: WidokTrajektoriiFrt): WerdyktCalosciFrt {
  let najgorszaRanga = 0;
  for (const sc of widok.scenariusze) {
    const ranga = RANGA_WERDYKTU[sc.werdykt_pl];
    najgorszaRanga = Math.max(najgorszaRanga, ranga ?? 2);
  }
  return WERDYKT_CALOSCI[najgorszaRanga];
}
