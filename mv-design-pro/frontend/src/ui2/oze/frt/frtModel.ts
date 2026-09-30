/*
 * Model i adaptery okna „Walidacja modelu falownika" (trajektorie FRT, karta U4
 * P38). Czyste, read-only odwzorowanie stanu modelu (moduły DER ze store'a) oraz
 * odpowiedzi końcówki frt-trajectories (`../api`) na struktury prezentacji (opcje
 * doboru / serie wykresu / tabela scenariuszy / tabela audytowa pól solvera).
 *
 * UCZCIWOŚĆ (2026-09-23): okno NIE wystawia werdyktu FRT. Trajektoria solvera jest
 * zadana profilem wejściowym scenariusza, a „utrzymanie pracy" i „margines do krzywej"
 * to kryterium v > 0,05 p.u. wobec TEGO SAMEGO profilu (tautologia). Tabela pierwszego
 * planu niesie echo scenariusza i etykietę rekordu oceny z backendu; pola solvera
 * trafiają WYŁĄCZNIE do tabeli audytowej — bez tagów ostrzegawczych, bo kolor też
 * byłby oceną. Dawna agregacja „werdyktu całości" skasowana razem z werdyktem.
 * Scenariusz nazywa `nazwa_pl` z backendu (parametry próby), a klucze techniczne
 * (scenariusz, typ przekształtnika, operator) idą do „Informacji audytowych".
 *
 * GRANICE (NOT-A-SOLVER / zero fizyki): warstwa wyłącznie prezentuje. „Napięcie
 * skrajne" scenariusza to projekcja min/max napięcia trajektorii (rzut danych
 * odpowiedzi, nie wyliczenie fizyczne). Zero mutacji, zero wołań API stąd.
 *
 * Determinizm: kolejność modułów = kolejność `selectAllDers` (sort po id);
 * kolejność scenariuszy/punktów = kolejność źródłowa odpowiedzi. Brak `Date.now`.
 */

import type { ProfilOperatoraNcRfg } from '../ncrfg/typy';
import type {
  RodzajTestuFrt,
  ScenariuszFrt,
  WidokTrajektoriiFrt,
} from '../api';
import type {
  DerKindUnified,
  StationDerConnection,
} from '../../../ui/network-build/station-der';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import type { WierszInformacjiAudytowych } from '../../wyniki/wzorzec/InformacjeAudytowe';
import type { StatusSolveraFrt } from '../api';
import {
  FRT_STRINGS,
  etykietaStatusuFrt,
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

/**
 * Adapter: obwiednia profilu → punkty wykresu (kolejność źródłowa).
 * `obwiednia_profilu` jest nieobecna WYŁĄCZNIE przy `status_solvera ===
 * 'blocked'` (karta S-4) — wywołujący (`WynikTrajektorii`) renderuje się
 * tylko poza tym stanem, ale sygnatura pozostaje uczciwa: brak → pusto.
 */
export function punktyObwiedniFrt(widok: WidokTrajektoriiFrt): PunktObwiedniWykresu[] {
  return (widok.obwiednia_profilu?.punkty ?? []).map((pt) => ({
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
 * wzrost). To RZUT danych z odpowiedzi (min/max), nie wyliczenie fizyczne; skoro
 * napięcie trajektorii jest zadane profilem wejściowym, to echo zapadu z wejścia.
 * Brak punktów → `null`.
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
// Tabela scenariuszy (pierwszy plan) — wzorzec `TabelaWynikow` (ui2/wyniki/wzorzec)
// ---------------------------------------------------------------------------

/** Kolumny tabeli scenariuszy pierwszego planu: echo scenariusza + etykieta oceny. */
export function kolumnyTabeliFrt(): DefinicjaKolumny[] {
  return [
    { klucz: 'scenariusz', etykieta: FRT_STRINGS.kolScenariusz, sortowalna: false },
    {
      klucz: 'glebokosc',
      etykieta: FRT_STRINGS.kolGlebokosc,
      jednostka: FRT_STRINGS.jednPu,
      mono: true,
    },
    { klucz: 'ocena', etykieta: FRT_STRINGS.kolOcena, sortowalna: false },
  ];
}

/** Adapter jednego scenariusza → wiersz pierwszego planu (etykieta z rekordu backendu). */
function wierszScenariuszaFrt(scenariusz: ScenariuszFrt, rodzaj: RodzajTestuFrt): WierszTabeli {
  const skrajne = napiecieSkrajneFrt(scenariusz, rodzaj);
  return {
    scenariusz: { wartosc: scenariusz.nazwa_pl },
    glebokosc: {
      wartosc: skrajne === null ? FRT_STRINGS.kreska : fmtPuFrt(skrajne),
      sortKey: skrajne ?? undefined,
    },
    ocena: { wartosc: scenariusz.ocena.etykieta.etykieta_pl },
  };
}

/** Adapter: widok trajektorii → wiersze tabeli scenariuszy (kolejność źródłowa). */
export function wierszeTabeliFrt(widok: WidokTrajektoriiFrt): WierszTabeli[] {
  return widok.scenariusze.map((sc) => wierszScenariuszaFrt(sc, widok.test_kind));
}

// ---------------------------------------------------------------------------
// Tabela audytowa pól solvera (tylko sekcja audytowa, bez tagów ostrzegawczych)
// ---------------------------------------------------------------------------

/** Kolumny tabeli audytowej: pola solvera uproszczonego (materiał audytowy). */
export function kolumnyAudytuFrt(): DefinicjaKolumny[] {
  return [
    { klucz: 'scenariusz', etykieta: FRT_STRINGS.kolScenariusz, sortowalna: false },
    { klucz: 'status', etykieta: FRT_STRINGS.kolStatusSolvera, sortowalna: false },
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
  ];
}

/** Pola solvera wspólne dla scenariusza trajektorii i zapadu sekwencji. */
export interface PolaSolveraFrt {
  readonly status: StatusSolveraFrt;
  readonly stayed_connected: boolean;
  readonly margin_to_curve_s: number | null;
  readonly margin_to_curve_pu: number | null;
  readonly p_recovery_time_s: number | null;
}

/**
 * Adapter pól solvera → komórki tabeli audytowej. Wartości WPROST z pól solvera,
 * bez tagu ostrzegawczego (kolor byłby oceną wyprowadzoną z tautologii).
 */
export function komorkiAudytuFrt(pola: PolaSolveraFrt): WierszTabeli {
  return {
    status: { wartosc: etykietaStatusuFrt(pola.status) },
    utrzymanie: {
      wartosc: pola.stayed_connected ? FRT_STRINGS.utrzymanieTak : FRT_STRINGS.utrzymanieNie,
    },
    margines_s: {
      wartosc: fmtSOpcjaFrt(pola.margin_to_curve_s),
      sortKey: pola.margin_to_curve_s ?? undefined,
    },
    margines_pu: {
      wartosc: fmtPuOpcjaFrt(pola.margin_to_curve_pu),
      sortKey: pola.margin_to_curve_pu ?? undefined,
    },
    odzysk: {
      wartosc: fmtSOpcjaFrt(pola.p_recovery_time_s),
      sortKey: pola.p_recovery_time_s ?? undefined,
    },
  };
}

/** Adapter: widok trajektorii → wiersze tabeli audytowej (kolejność źródłowa). */
export function wierszeAudytuFrt(widok: WidokTrajektoriiFrt): WierszTabeli[] {
  return widok.scenariusze.map((sc) => ({
    scenariusz: { wartosc: sc.nazwa_pl },
    ...komorkiAudytuFrt(sc),
  }));
}

// ---------------------------------------------------------------------------
// Informacje audytowe (karta #145) — identyfikatory techniczne biegu
// ---------------------------------------------------------------------------

/**
 * Wiersze „Informacji audytowych" widoku trajektorii: identyfikator typu
 * katalogowego przekształtnika, identyfikator operatora i klucze scenariuszy.
 * Pierwszy plan niesie ich nazwy (moduł, operator, nazwa scenariusza z parametrów
 * próby); identyfikatory są metadanymi i żyją wyłącznie tutaj.
 */
export function informacjeAudytoweFrt(widok: WidokTrajektoriiFrt): WierszInformacjiAudytowych[] {
  return [
    { etykieta: FRT_STRINGS.ekspModulId, wartosc: widok.modul_der.id },
    { etykieta: FRT_STRINGS.ekspOperatorId, wartosc: widok.operator.id },
    ...widok.scenariusze.map((sc, indeks) => ({
      etykieta: `${FRT_STRINGS.ekspScenariuszId} (${indeks + 1})`,
      wartosc: sc.scenario_id,
    })),
  ];
}
