/*
 * Model i adaptery ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Czyste projekcje read-only — ZERO fizyki, ZERO pobrań, ZERO mutacji.
 *
 * UCZCIWOŚĆ (2026-09-23): bieg `dynamic_stability` NIE rozwiązuje sieci — kąty mocy,
 * napięcie i częstotliwość po zwarciu oraz czas wyłączenia WPISUJE użytkownik. Dawny
 * werdykt STABILNY/NIESTABILNY (wskaźnik, margines, czynnik, statusy kryteriów) był
 * porównaniem tych liczb z progami z opcji biegu, a ślad automatyki opowiadał
 * „wyłączenie przez zabezpieczenia" z czasu wpisanego ręcznie. Kontrakt wyniku to
 * teraz ECHO scenariusza + rekord oceny `NIE_OCENIONO` (`ocena`) z backendu.
 *
 * ŹRÓDŁA DANYCH — realny kontrakt (mapowanie plik:linia, zero zgadywania):
 * - Wiersz wyniku: `build_dynamic_stability_results` (enm/canonical_analysis.py) →
 *   `EchoScenariuszaStabilnosci.to_dict` (application/stability/dynamic_stability.py):
 *   scenariusz, kąty, napięcie i częstotliwość po zwarciu, czas wyłączenia, status
 *   `NIE_OCENIONO`, `ocena` + pola raportowalności.
 *   Endpoint: `GET /analysis-runs/{id}/results/dynamic-stability`.
 * - Ślad automatyki: `build_automation_trace_results` → `rows` zawsze puste (zdarzeń
 *   nie ma skąd wziąć — zabezpieczenia nie są symulowane) + `topology_effect`
 *   ZADEKLAROWANY w opcjach biegu + `ocena`.
 *   Endpoint: `GET /analysis-runs/{id}/results/automation-trace`.
 * - Przebieg: `GET …/dynamic-stability/time-series` — przebieg ZADANY z `uwaga_pl`.
 */

import type { Branch, EnergyNetworkModel } from '../../../types/enm';
import type { WierszZalozenia } from '../wzorzec';
import type { RekordOcenyNiewykonanej } from '../wzorzec/OcenaNiewykonana';
import { STABILNOSC_STRINGS as T } from './strings';

// ---------------------------------------------------------------------------
// Kształty odpowiedzi backendu (lustro 1:1 pól konsumowanych)
// ---------------------------------------------------------------------------

/** Wiersz wyniku — echo scenariusza wpisanego przez użytkownika + rekord oceny. */
export interface WierszStabilnosci {
  readonly scenario_id?: string;
  readonly scenario_type?: string;
  readonly source_id?: string;
  readonly faulted_element_id?: string;
  readonly cleared_by_element_ids?: readonly string[];
  /** Status maszynowy — jedyna wartość `NIE_OCENIONO` (tor nie wydaje werdyktu). */
  readonly status?: string;
  readonly contract_version?: string;
  readonly clearing_time_ms?: number;
  readonly pre_fault_angle_deg?: number;
  readonly during_fault_angle_deg?: number;
  readonly post_fault_angle_deg?: number;
  readonly post_fault_voltage_pu?: number;
  readonly post_fault_frequency_pu?: number;
  /** Rekord oceny niewykonanej (zdanie, czego brakuje, akcja naprawcza). */
  readonly ocena?: RekordOcenyNiewykonanej;
  readonly proof_ref?: string | null;
  readonly proof_status?: string | null;
  readonly proof_status_pl?: string | null;
  readonly reporting_status?: string | null;
  readonly reporting_status_pl?: string | null;
  readonly reporting_limitations?: readonly string[];
  /**
   * Ograniczenia raportowe jako polskie zdania (backend: `etykiety_raportowe_pl` —
   * kod ograniczenia → opis). Pierwszy plan czyta WYŁĄCZNIE to pole, nigdy kodów.
   */
  readonly reporting_limitations_pl?: readonly string[];
}

export interface OdpowiedzStabilnosci {
  readonly run_id: string;
  readonly rows: readonly WierszStabilnosci[];
}

/** Stan sieci po zakłóceniu — unia 1:1 z `application/automation/trace.py`. */
export type StanSieciPoZakloceniu = 'ISLANDED' | 'RECONFIGURED' | 'UNCHANGED';

/** Zakres wyłączeń — unia 1:1 z `application/automation/trace.py`. */
export type ZakresWylaczen = 'NONE' | 'LOCAL' | 'WIDE';

/** Efekt topologiczny ZADEKLAROWANY w opcjach biegu (PostFaultTopologyEffect.to_dict). */
export interface EfektTopologii {
  readonly network_state?: StanSieciPoZakloceniu;
  readonly outage_scope?: ZakresWylaczen;
  readonly opened_element_ids?: readonly string[];
}

/**
 * Polskie etykiety stanu sieci po zakłóceniu — mapa TYPOWANA unią kontraktu: nowy kod
 * w backendzie nie skompiluje się tu bez etykiety, więc kod nie trafi na ekran.
 */
export const ETYKIETY_STANU_SIECI: Readonly<Record<StanSieciPoZakloceniu, string>> = {
  ISLANDED: T.stanSieciWyspa,
  RECONFIGURED: T.stanSieciPrzekonfigurowana,
  UNCHANGED: T.stanSieciBezZmian,
};

/** Polskie etykiety zakresu wyłączeń (liczba elementów odłączonych od zasilania). */
export const ETYKIETY_ZAKRESU_WYLACZEN: Readonly<Record<ZakresWylaczen, string>> = {
  NONE: T.zakresBrak,
  LOCAL: T.zakresLokalny,
  WIDE: T.zakresRozlegly,
};

/** Ślad automatyki — `rows` zawsze puste (zabezpieczenia niesymulowane). */
export interface OdpowiedzSladuAutomatyki {
  readonly run_id: string;
  readonly topology_effect?: EfektTopologii | null;
  readonly rows: readonly unknown[];
  readonly ocena?: RekordOcenyNiewykonanej | null;
}

// ---------------------------------------------------------------------------
// Szereg czasowy przebiegu (U(t)/f(t)) — endpoint results/dynamic-stability/time-series
// ---------------------------------------------------------------------------

/** Metadana wielkości przebiegu (klucz pola w punkcie + jednostka z backendu). */
export interface WielkoscPrzebiegu {
  readonly key: string;
  readonly label_pl?: string;
  readonly unit: string;
}

/** Pojedynczy punkt przebiegu — mirror VoltageTrajectoryPoint.to_dict. */
export interface PunktPrzebiegu {
  readonly t_s: number;
  readonly voltage_pu?: number;
  readonly frequency_pu?: number;
}

/** Odpowiedź endpointu szeregu czasowego (na żądanie). */
export interface OdpowiedzPrzebieguStabilnosci {
  readonly run_id: string;
  readonly has_time_series: boolean;
  readonly time_unit: string;
  readonly contract_version?: string | null;
  /** Charakter przebiegu (zadany, nie rozwiązanie sieci) — z backendu, przy liczbach. */
  readonly uwaga_pl?: string | null;
  readonly quantities: readonly WielkoscPrzebiegu[];
  readonly points: readonly PunktPrzebiegu[];
}

// ---------------------------------------------------------------------------
// Formularz scenariusza wyłączenia zwarcia (karta W2 pkt 1, zero fabrykacji)
// ---------------------------------------------------------------------------

/**
 * Pola formularza scenariusza — DOKŁADNIE kontrakt opcji biegu
 * (`enm/canonical_analysis.py::_POLA_SCENARIUSZA_STABILNOSCI_DYNAMICZNEJ`, ten
 * sam klucz w `run.options`, ten sam komplet dziewięciu pól, ten sam powód
 * odmowy przy braku). `typ` steruje WYŁĄCZNIE walidacją i parsowaniem w tym
 * pliku — backend jest jedynym źródłem prawdy o tym, co pole znaczy fizycznie.
 */
/**
 * `element` — jeden element modelu wybierany z listy po nazwie (element objęty
 * zwarciem); `aparaty` — lista aparatów wyłączających zaznaczanych po nazwie;
 * `liczba` — wartość wpisana. Referencje modelu są WARTOŚCIĄ opcji, nigdy tekstem,
 * który projektant musiałby znać i wpisać.
 */
export type TypPolaScenariusza = 'element' | 'aparaty' | 'liczba';

export interface PoleScenariusza {
  readonly klucz: string;
  readonly etykieta: string;
  readonly jednostka?: string;
  readonly typ: TypPolaScenariusza;
  /** Wartość musi być > 0 (kontrakt: `clearing_time_ms`/`recovery_time_constant_s`
   *  wchodzą jako dzielnik/czas dodatni — backend odrzuca <= 0 albo dzieli przez τ). */
  readonly wymagaDodatniej?: boolean;
}

export const POLA_SCENARIUSZA_STABILNOSCI: readonly PoleScenariusza[] = [
  { klucz: 'faulted_element_id', etykieta: T.poleElement, typ: 'element' },
  {
    klucz: 'clearing_time_ms',
    etykieta: T.poleCzasWylaczenia,
    jednostka: T.jednMs,
    typ: 'liczba',
    wymagaDodatniej: true,
  },
  { klucz: 'cleared_by_element_ids', etykieta: T.poleElementyWylaczajace, typ: 'aparaty' },
  { klucz: 'pre_fault_angle_deg', etykieta: T.poleKatPrzed, jednostka: T.jednDeg, typ: 'liczba' },
  {
    klucz: 'during_fault_angle_deg',
    etykieta: T.poleKatWCzasie,
    jednostka: T.jednDeg,
    typ: 'liczba',
  },
  { klucz: 'post_fault_angle_deg', etykieta: T.poleKatPo, jednostka: T.jednDeg, typ: 'liczba' },
  {
    klucz: 'post_fault_voltage_pu',
    etykieta: T.poleNapiecie,
    jednostka: T.jednPu,
    typ: 'liczba',
  },
  {
    klucz: 'post_fault_frequency_pu',
    etykieta: T.poleCzestotliwosc,
    jednostka: T.jednPu,
    typ: 'liczba',
  },
  {
    klucz: 'recovery_time_constant_s',
    etykieta: T.poleStalaCzasowa,
    jednostka: T.jednS,
    typ: 'liczba',
    wymagaDodatniej: true,
  },
] as const;

/**
 * Wartości formularza (kontrolowane pola): liczby jako tekst wpisany przez inżyniera,
 * element jako referencja wybranej opcji, aparaty jako referencje rozdzielone przecinkiem.
 */
export type WartosciFormularzaScenariusza = Record<string, string>;

/** Referencje zaznaczonych aparatów z wartości pola `aparaty`. */
export function referencjeAparatow(wartosc: string | undefined): string[] {
  return (wartosc ?? '')
    .split(',')
    .map((wpis) => wpis.trim())
    .filter((wpis) => wpis !== '');
}

/** Przełącza aparat w wartości pola `aparaty` (kolejność = kolejność zaznaczania). */
export function przelaczAparat(wartosc: string | undefined, ref: string): string {
  const obecne = referencjeAparatow(wartosc);
  return (obecne.includes(ref) ? obecne.filter((wpis) => wpis !== ref) : [...obecne, ref]).join(
    ',',
  );
}

/** Opcja doboru elementu scenariusza — nazwa i rodzaj z modelu, referencja jako wartość. */
export interface OpcjaElementuScenariusza {
  readonly ref: string;
  readonly nazwa: string;
  readonly rodzaj: string;
}

const RODZAJ_GALEZI: Readonly<Record<Branch['type'], string>> = {
  line_overhead: T.rodzajLinia,
  cable: T.rodzajKabel,
  switch: T.rodzajLacznik,
  breaker: T.rodzajWylacznik,
  bus_coupler: T.rodzajSprzeglo,
  disconnector: T.rodzajOdlacznik,
  fuse: T.rodzajBezpiecznik,
};

const GALEZIE_PRZEWODZACE: ReadonlySet<Branch['type']> = new Set(['line_overhead', 'cable']);

function nazwaLubRodzaj(nazwa: string | null | undefined, rodzaj: string): string {
  const przycieta = (nazwa ?? '').trim();
  return przycieta === '' ? `${rodzaj} ${T.bezNazwy}` : przycieta;
}

function poNazwie(a: OpcjaElementuScenariusza, b: OpcjaElementuScenariusza): number {
  return a.nazwa.localeCompare(b.nazwa, 'pl') || a.ref.localeCompare(b.ref);
}

/**
 * Elementy, na których projektant może zadać zwarcie: linie, kable, szyny i
 * transformatory z migawki modelu (nazwa z modelu — ta sama co na schemacie).
 * Deterministycznie: sortowanie po nazwie, remis po referencji.
 */
export function opcjeElementuZwarcia(
  snapshot: EnergyNetworkModel | null,
): OpcjaElementuScenariusza[] {
  if (!snapshot) return [];
  const galezie = (snapshot.branches ?? [])
    .filter((galaz) => GALEZIE_PRZEWODZACE.has(galaz.type))
    .map((galaz) => ({
      ref: galaz.ref_id,
      nazwa: nazwaLubRodzaj(galaz.name, RODZAJ_GALEZI[galaz.type]),
      rodzaj: RODZAJ_GALEZI[galaz.type],
    }));
  const szyny = (snapshot.buses ?? []).map((szyna) => ({
    ref: szyna.ref_id,
    nazwa: nazwaLubRodzaj(szyna.name, T.rodzajSzyna),
    rodzaj: T.rodzajSzyna,
  }));
  const transformatory = (snapshot.transformers ?? []).map((tr) => ({
    ref: tr.ref_id,
    nazwa: nazwaLubRodzaj(tr.name, T.rodzajTransformator),
    rodzaj: T.rodzajTransformator,
  }));
  return [...galezie, ...szyny, ...transformatory].sort(poNazwie);
}

/**
 * Aparaty, które mogą wyłączyć zwarcie: wyłączniki, łączniki, odłączniki, sprzęgła
 * i bezpieczniki z migawki modelu (nazwa z modelu). Deterministycznie jak wyżej.
 */
export function opcjeAparatowWylaczajacych(
  snapshot: EnergyNetworkModel | null,
): OpcjaElementuScenariusza[] {
  if (!snapshot) return [];
  return (snapshot.branches ?? [])
    .filter((galaz) => !GALEZIE_PRZEWODZACE.has(galaz.type))
    .map((galaz) => ({
      ref: galaz.ref_id,
      nazwa: nazwaLubRodzaj(galaz.name, RODZAJ_GALEZI[galaz.type]),
      rodzaj: RODZAJ_GALEZI[galaz.type],
    }))
    .sort(poNazwie);
}

/** Formularz startuje PUSTY — zero wartości podpowiadanych jako „typowe" (karta W2 pkt 1). */
export function pusteWartosciScenariusza(): WartosciFormularzaScenariusza {
  return Object.fromEntries(POLA_SCENARIUSZA_STABILNOSCI.map((pole) => [pole.klucz, '']));
}

/** Błąd walidacji jednego pola formularza (klucz pola → treść błędu PL). */
export type BledyFormularzaScenariusza = Record<string, string>;

/**
 * Waliduje formularz WYŁĄCZNIE względem tego, co kontrakt backendu faktycznie
 * sprawdza (`FaultClearScenario.__post_init__`: pole wymagane, `clearing_time_ms`
 * i `recovery_time_constant_s` > 0, `cleared_by_element_ids` niepuste) — zero
 * progów inżynierskich wymyślonych w UI (zakaz fizyki w interfejsie).
 */
export function walidujFormularzScenariusza(
  wartosci: WartosciFormularzaScenariusza,
): BledyFormularzaScenariusza {
  const bledy: BledyFormularzaScenariusza = {};
  for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
    const surowa = (wartosci[pole.klucz] ?? '').trim();
    if (pole.typ === 'aparaty') {
      if (referencjeAparatow(surowa).length === 0) bledy[pole.klucz] = T.bladListaPusta;
      continue;
    }
    if (surowa === '') {
      bledy[pole.klucz] = T.bladWymagane;
      continue;
    }
    if (pole.typ === 'liczba') {
      const liczba = Number(surowa.replace(',', '.'));
      if (!Number.isFinite(liczba)) {
        bledy[pole.klucz] = T.bladWymagane;
      } else if (pole.wymagaDodatniej && liczba <= 0) {
        bledy[pole.klucz] = T.bladDodatnie;
      }
    }
  }
  return bledy;
}

/**
 * Buduje `options` biegu z formularza — 1:1 kontrakt opcji biegu backendu.
 * Wołający MUSI sprawdzić `walidujFormularzScenariusza` wcześniej (zero pól
 * pustych/błędnych trafia tu) — funkcja nie waliduje ponownie, tylko rzutuje.
 */
export function zbudujOpcjeScenariusza(
  wartosci: WartosciFormularzaScenariusza,
): Record<string, unknown> {
  const opcje: Record<string, unknown> = {};
  for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
    const surowa = wartosci[pole.klucz]?.trim() ?? '';
    if (pole.typ === 'aparaty') {
      opcje[pole.klucz] = referencjeAparatow(surowa);
    } else if (pole.typ === 'liczba') {
      opcje[pole.klucz] = Number(surowa.replace(',', '.'));
    } else {
      opcje[pole.klucz] = surowa;
    }
  }
  return opcje;
}

// ---------------------------------------------------------------------------
// Wybór przebiegu stabilności
// ---------------------------------------------------------------------------

const STATUS_ZAKONCZONY = 'DONE';
const TYP_STABILNOSCI = 'DYNAMIC_STABILITY';

export interface PrzebiegDoWyboru {
  readonly id: string;
  readonly analysis_type: string;
  readonly status: string;
  readonly finished_at?: string | null;
  readonly started_at?: string | null;
}

/**
 * Wybiera przebieg stabilności: aktywny, jeśli jest zakończoną analizą
 * stabilności; inaczej najnowszy zakończony przebieg DYNAMIC_STABILITY;
 * brak → null (uczciwy stan zerowy ekranu).
 */
export function wybierzPrzebiegStabilnosci<T extends PrzebiegDoWyboru>(
  przebiegi: readonly T[],
  activeRunId: string | null,
): T | null {
  const stabilnosciowe = przebiegi.filter(
    (r) => r.status === STATUS_ZAKONCZONY && r.analysis_type === TYP_STABILNOSCI,
  );
  if (stabilnosciowe.length === 0) return null;
  const aktywny = activeRunId ? stabilnosciowe.find((r) => r.id === activeRunId) : undefined;
  if (aktywny) return aktywny;
  return [...stabilnosciowe].sort((a, b) =>
    String(b.finished_at ?? b.started_at ?? '').localeCompare(
      String(a.finished_at ?? a.started_at ?? ''),
    ),
  )[0];
}

// ---------------------------------------------------------------------------
// Formaty deterministyczne (przecinek PL — czyste formatowanie prezentacji)
// ---------------------------------------------------------------------------

function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Czas [ms] — 1 miejsce po przecinku. */
export function fmtMs(n: number): string {
  return fmtLiczba(n, 1);
}

/** Czas [s] — 3 miejsca po przecinku (oś przebiegu). */
export function fmtS(n: number): string {
  return fmtLiczba(n, 3);
}

/** Kąt [°] — 1 miejsce po przecinku. */
export function fmtDeg(n: number): string {
  return fmtLiczba(n, 1);
}

/** Wielkość względna [p.u.] — 3 miejsca po przecinku. */
export function fmtPu(n: number): string {
  return fmtLiczba(n, 3);
}

// ---------------------------------------------------------------------------
// Adaptery sekcji
// ---------------------------------------------------------------------------

/**
 * ZAŁOŻENIA — scenariusz zakłócenia (część wyniku, W-602). Elementy nazwane mostem
 * nazw wyników (`nazwa` = `useNazwaObiektu()`): projektant czyta nazwy z modelu, nie
 * referencje (karta #145).
 */
export function naZalozeniaStabilnosci(
  row: WierszStabilnosci,
  nazwa: (ref: string) => string,
): WierszZalozenia[] {
  return [
    {
      etykieta: T.zalElement,
      wartosc: row.faulted_element_id ? nazwa(row.faulted_element_id) : T.kreska,
    },
    { etykieta: T.zalZrodlo, wartosc: row.source_id ? nazwa(row.source_id) : T.kreska },
    {
      etykieta: T.zalWylaczaly,
      wartosc:
        row.cleared_by_element_ids && row.cleared_by_element_ids.length > 0
          ? row.cleared_by_element_ids.map((ref) => nazwa(ref)).join(', ')
          : T.kreska,
    },
  ];
}

/** Jedna pozycja echa scenariusza (wartość wpisana przez użytkownika). */
export interface PozycjaEcha {
  readonly klucz: string;
  readonly wielkosc: string;
  readonly wartosc: string;
}

/**
 * Echo scenariusza — liczby WPISANE przez użytkownika, zwrócone przez backend bez
 * żadnego porównania z progami. Brak pola → kreska (uczciwy brak, zero domysłu).
 */
export function naEchoScenariusza(row: WierszStabilnosci): PozycjaEcha[] {
  const pozycja = (
    klucz: string,
    wielkosc: string,
    wartosc: number | undefined,
    format: (n: number) => string,
    jednostka: string,
  ): PozycjaEcha => ({
    klucz,
    wielkosc,
    wartosc: wartosc != null ? `${format(wartosc)} ${jednostka}` : T.kreska,
  });
  return [
    pozycja('clearing_time_ms', T.echoCzas, row.clearing_time_ms, fmtMs, T.jednMs),
    pozycja('pre_fault_angle_deg', T.echoKatPrzed, row.pre_fault_angle_deg, fmtDeg, T.jednDeg),
    pozycja('during_fault_angle_deg', T.echoKatWCzasie, row.during_fault_angle_deg, fmtDeg, T.jednDeg),
    pozycja('post_fault_angle_deg', T.echoKatPo, row.post_fault_angle_deg, fmtDeg, T.jednDeg),
    pozycja('post_fault_voltage_pu', T.echoNapiecie, row.post_fault_voltage_pu, fmtPu, T.jednPu),
    pozycja(
      'post_fault_frequency_pu',
      T.echoCzestotliwosc,
      row.post_fault_frequency_pu,
      fmtPu,
      T.jednPu,
    ),
  ];
}

/** Jedna seria wykresu przebiegu (pole punktu → etykieta PL + jednostka). */
export interface SeriaPrzebiegu {
  readonly dataKey: 'voltage_pu' | 'frequency_pu';
  readonly nazwa: string;
  readonly jednostka: string;
}

/** Mapowanie kluczy backendu na etykiety PL serii przebiegu (read-only). */
const SERIA_PL: Record<string, { readonly nazwa: string; readonly klucz: SeriaPrzebiegu['dataKey'] }> =
  {
    voltage_pu: { nazwa: T.przebiegSeriaNapiecie, klucz: 'voltage_pu' },
    frequency_pu: { nazwa: T.przebiegSeriaCzestotliwosc, klucz: 'frequency_pu' },
  };

/**
 * Buduje listę serii przebiegu z metadanych `quantities` backendu — WYŁĄCZNIE
 * wielkości, które backend zadeklarował (zero fabrykacji). Kolejność stabilna
 * wg deklaracji backendu; wielkość nierozpoznana pomijana (bez fizyki w UI).
 */
export function naSeriePrzebiegu(
  quantities: readonly WielkoscPrzebiegu[],
): SeriaPrzebiegu[] {
  const serie: SeriaPrzebiegu[] = [];
  for (const q of quantities) {
    const mapa = SERIA_PL[q.key];
    if (!mapa) continue;
    serie.push({ dataKey: mapa.klucz, nazwa: mapa.nazwa, jednostka: q.unit });
  }
  return serie;
}
