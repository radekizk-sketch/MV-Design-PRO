/*
 * Model danych + adaptery okna „Macierz wymogów NC RfG per moduł" na kontrakcie V2
 * (karta P39; karta AB-1a Pakiet D2 §2–§3).
 *
 * WARSTWA PREZENTACJI (NOT-A-SOLVER): zero fizyki, zero ocen własnych, zero agregatów.
 * Adaptery wyłącznie:
 *   1. `zbudujModuly` — kolumny macierzy z realnego źródła DER (`useStationDerStore`)
 *      i formularz biegu „co-jeśli" z WEJŚĆ MODELU odczytanych z backendu
 *      (`GET …/cases/{id}/wejscia` — ten sam most, który ocenia zgodność przypadku):
 *      wartości i pochodzenie „z modelu" pól (także liczonych z danych generatora:
 *      statyzm, martwa strefa, cosφ, zakresy Q, zdolności Q(U) i FRT) pochodzą z mostu,
 *      klient niczego z modelu nie wyprowadza sam. DER pominięty przez most → jawny powód
 *      blokady; wejścia niewczytane → blokada „brak wejść modelu" (ZAKAZ zgadywania).
 *   2. `zbudujWejscieModulu` — składa `WejscieModuluNcRfg` (dokładnie pola kontraktu
 *      `NcRfgPtpireeModuleInput`, w tym art. 4 i T12): tożsamość modułu z wejścia modelu,
 *      reszta z formularza; pole puste = `null` (ocena niewykonana z nazwanym brakiem —
 *      nigdy wartość typowa).
 *   3. `mapujMacierz` — siatka test × moduł z wyniku biegu: komórka = rekord `ocena`
 *      (`OcenaKryterium`) testu; etykieta i kolor z rekordu.
 *
 * Kontrakt V2 nie ma agregatu modułu ani liczników — ten plik ich nie liczy (dawne
 * `PodsumowanieModulu`/`PodsumowanieProjektu`/`agregujPodsumowania`/`testyNiespelnione`
 * skasowane). Status powiązania z wykazem PTPiREE nie jest liczony po stronie klienta —
 * bieg „co-jeśli" nie niesie certyfikatu (dowód wyprowadza serwer z zatwierdzonego modelu).
 *
 * Determinizm: kolejność modułów = kolejność `selectAllDers` (sort po id); kolejność wierszy
 * = kolejność katalogu testów biegu. Brak `Date.now`/losowości.
 */

import type {
  DerKindUnified,
  StationDerConnection,
} from '../../../ui/network-build/station-der';
import type { Etykieta, StatusWerdyktu } from '../../wyniki/wzorzec/werdykt';
import {
  OGRANICZENIA_WEJSCIA,
  POLA_LICZBOWE_WEJSCIA,
  modulIstniejacyZeStanu,
  parsujPole,
  zbudujNastawy,
  type FormularzNastaw,
  type PoleLiczboweWejscia,
  type StanModuluIstniejacego,
} from '../ncrfg/formularz';
import type {
  BiegNcRfg,
  DefinicjaTestuNcRfg,
  OcenaWymaganModulu,
  PoleNastawy,
  PowodPominieciaDer,
  WejsciaPrzypadkuNcRfg,
  WejscieModuluNcRfg,
  WynikModuluNcRfg,
  WynikTestuNcRfg,
  ZadanieCertyfikatu,
} from '../ncrfg/typy';
import {
  POLA_FLAG_DEKLARACJI,
  formularzDanychModuluZModelu,
  jestDataKalendarzowa,
  tekstLiczby,
  type PoleFlagiDeklaracji,
} from '../ncrfg/daneModulu';

// =============================================================================
// Typy warstwy prezentacji
// =============================================================================

/** Pochodzenie danej wejściowej (uczciwość źródła danych). */
export type PochodzenieDanej = 'model' | 'deklarowane';

/**
 * Powód, dla którego moduł nie może zostać objęty biegiem: powód pominięcia DER przez most
 * modelu (ten sam słownik co backend) albo brak wejść modelu (nie wczytano ich — brak
 * przypadku, operatora, odczyt w toku lub nieudany — albo most nie objął tego DER).
 */
export type PowodBlokady = PowodPominieciaDer | 'brak_wejscia_modelu';

/** Flagi zdolności wejścia modułu — nazwy 1:1 z kontraktem (`has_*`/`*_enabled`/…). */
export const POLA_ZDOLNOSCI = [
  'has_lvrt_curve',
  'has_hvrt_curve',
  'has_pf_droop',
  'has_qu_curve',
  'has_dynamic_model',
  'has_scada_communication',
  'has_disturbance_recorder',
  'active_power_control_enabled',
  'stop_generation_enabled',
  'reduction_generation_enabled',
  'island_operation_required',
  'island_operation_capable',
  'black_start_required',
  'black_start_capable',
  'power_oscillation_damping_required',
  'power_oscillation_damping_enabled',
] as const satisfies readonly (keyof WejscieModuluNcRfg)[];

export type PoleZdolnosci = (typeof POLA_ZDOLNOSCI)[number];

/**
 * Zdolności TRÓJSTANOWE kontraktu (`bool | None`): deklaracje modułu, dla których brak
 * deklaracji (`null`) daje ocenę niewykonaną z nazwanym brakiem — NIGDY `false`. Lista =
 * dokładnie flagi deklaracji modułu zapisywane w modelu (`DeklaracjeModulu`) bez wymagań
 * programu badań (`*_required` — kontrakt `bool`: wymaganie istnieje, gdy program je wskazał).
 */
export const POLA_ZDOLNOSCI_TROJSTANOWYCH = POLA_FLAG_DEKLARACJI.filter(
  (pole): pole is Exclude<PoleFlagiDeklaracji, PoleWymaganiaProgramu> =>
    !pole.endsWith('_required'),
) satisfies readonly PoleZdolnosci[];

type PoleWymaganiaProgramu = Extract<PoleFlagiDeklaracji, `${string}_required`>;

export type PoleZdolnosciTrojstanowej = (typeof POLA_ZDOLNOSCI_TROJSTANOWYCH)[number];

export function jestZdolnosciaTrojstanowa(pole: PoleZdolnosci): pole is PoleZdolnosciTrojstanowej {
  return (POLA_ZDOLNOSCI_TROJSTANOWYCH as readonly string[]).includes(pole);
}

/** Zdolności wejścia — typ pola 1:1 z kontraktem (`boolean` albo `boolean | null`). */
export type ZdolnosciModulu = { readonly [P in PoleZdolnosci]: WejscieModuluNcRfg[P] };

/** Formularz biegu „co-jeśli" jednego modułu (stan lokalny okna — zero mutacji modelu). */
export interface FormularzModulu {
  readonly zdolnosci: ZdolnosciModulu;
  readonly pochodzenieZdolnosci: Readonly<Record<PoleZdolnosci, PochodzenieDanej>>;
  readonly liczby: Readonly<Record<PoleLiczboweWejscia, string>>;
  readonly pochodzenieLiczb: Readonly<Record<PoleLiczboweWejscia, PochodzenieDanej>>;
  readonly modulIstniejacy: StanModuluIstniejacego;
  /** Data umowy przyłączeniowej `RRRR-MM-DD` albo pusty łańcuch (nieustalona). */
  readonly dataUmowy: string;
  readonly nastawy: FormularzNastaw;
  /** Pochodzenie art. 4, daty umowy i nastaw — `model`, gdy wartość odczytano z generatora. */
  readonly pochodzenieModuluIstniejacego: PochodzenieDanej;
  readonly pochodzenieDatyUmowy: PochodzenieDanej;
  readonly pochodzenieNastaw: PochodzenieDanej;
}

/** Moduł wytwórczy modelu — tożsamość i dane opisowe z migawki (read-only, bez oceny). */
export interface OpisModuluModelu {
  readonly derRef: string;
  readonly nazwa: string;
  readonly rodzaj: DerKindUnified;
  readonly mocKw: number | null;
  readonly napiecieKv: number | null;
}

/** Kolumna macierzy: moduł modelu + blokada z mostu + wejście modelu + formularz „co-jeśli". */
export interface OpisModulu extends OpisModuluModelu {
  /** null = moduł gotowy do biegu; wartość = jawny powód braku danych. */
  readonly powodBlokady: PowodBlokady | null;
  /**
   * Wejście modułu złożone z modelu przez most backendu (`null` — moduł zablokowany):
   * źródło tożsamości wejścia biegu (referencja, nazwa, rodzaj, moc, napięcie) i formularza
   * wstępnego.
   */
  readonly wejscieModelu: WejscieModuluNcRfg | null;
  readonly formularz: FormularzModulu;
}

/** Komórka macierzy (test × moduł): rekord oceny z biegu albo nazwany stan jego braku. */
export type KomorkaMacierzy =
  | {
      readonly stan: 'brak_danych_modul';
      readonly derRef: string;
      readonly testId: string;
      readonly powodModulu: PowodBlokady;
    }
  | { readonly stan: 'brak_biegu'; readonly derRef: string; readonly testId: string }
  | {
      readonly stan: 'wynik';
      readonly derRef: string;
      readonly testId: string;
      readonly wynik: WynikTestuNcRfg;
    };

/** Wiersz macierzy = jeden test katalogu × wszystkie moduły. */
export interface WierszMacierzy {
  readonly test: DefinicjaTestuNcRfg;
  readonly komorki: readonly KomorkaMacierzy[];
}

// =============================================================================
// Rozwiązanie napięcia przyłączenia — WYŁĄCZNIE z modelu (ZAKAZ zgadywania)
// =============================================================================

/**
 * Napięcie przyłączenia [kV] z modelu — `connection_voltage_kv`, napięcie SZYNY
 * PRZYŁĄCZENIA z migawki. Brak → `null` (moduł w stanie „brak danych"); bez domyślnego
 * 15 kV i bez wnioskowania ze strony przyłączenia.
 */
export function rozwiazNapiecieKv(der: StationDerConnection): number | null {
  const zModelu = der.connection_voltage_kv;
  if (typeof zModelu === 'number' && Number.isFinite(zModelu) && zModelu > 0) {
    return zModelu;
  }
  return null;
}

// =============================================================================
// Adapter: realne źródło DER → opisy modułów i formularze
// =============================================================================

/**
 * Formularz wstępny z WEJŚCIA MODELU (odczyt `GET …/cases/{id}/wejscia`): każde pole formularza
 * = wartość wejścia złożonego przez most backendu (zdolności z wiązań i deklaracji kreatora,
 * statyzm, martwa strefa, cosφ, zakresy Q, deklaracje modułu, art. 4, data umowy, nastawy);
 * pochodzenie „z modelu" dokładnie dla pól, które most nazwał w `pola_z_modelu`. Brak danej
 * w modelu = pole puste / stan nieustalony z pochodzeniem „dane deklarowane" — projektant
 * deklaruje ją w formularzu; nigdy wartość typowa.
 */
export function formularzZWejscia(
  wejscie: WejscieModuluNcRfg,
  polaZModelu: readonly (keyof WejscieModuluNcRfg)[],
): FormularzModulu {
  const zModelu = new Set<keyof WejscieModuluNcRfg>(polaZModelu);
  const pochodzenie = (pole: keyof WejscieModuluNcRfg): PochodzenieDanej =>
    zModelu.has(pole) ? 'model' : 'deklarowane';
  const dane = formularzDanychModuluZModelu({
    modul_istniejacy: wejscie.modul_istniejacy,
    data_umowy_przylaczeniowej: wejscie.data_umowy_przylaczeniowej,
    nastawy_zabezpieczen: wejscie.nastawy_zabezpieczen_modulu,
    deklaracje_modulu: null,
  });
  return {
    zdolnosci: Object.fromEntries(
      POLA_ZDOLNOSCI.map((pole) => [pole, wejscie[pole]]),
    ) as unknown as ZdolnosciModulu,
    pochodzenieZdolnosci: Object.fromEntries(
      POLA_ZDOLNOSCI.map((pole) => [pole, pochodzenie(pole)]),
    ) as Record<PoleZdolnosci, PochodzenieDanej>,
    liczby: Object.fromEntries(
      POLA_LICZBOWE_WEJSCIA.map((pole) => [pole, tekstLiczby(wejscie[pole])]),
    ) as Record<PoleLiczboweWejscia, string>,
    pochodzenieLiczb: Object.fromEntries(
      POLA_LICZBOWE_WEJSCIA.map((pole) => [pole, pochodzenie(pole)]),
    ) as Record<PoleLiczboweWejscia, PochodzenieDanej>,
    modulIstniejacy: dane.modulIstniejacy,
    dataUmowy: dane.dataUmowy,
    nastawy: dane.nastawy,
    pochodzenieModuluIstniejacego: pochodzenie('modul_istniejacy'),
    pochodzenieDatyUmowy: pochodzenie('data_umowy_przylaczeniowej'),
    pochodzenieNastaw: pochodzenie('nastawy_zabezpieczen_modulu'),
  };
}

/**
 * Formularz modułu zablokowanego (bez wejścia modelu): stan nieustalony każdego pola —
 * panel go nie edytuje (blokada nazywa powód), a bieg modułu nie obejmuje.
 */
function formularzBezWejscia(): FormularzModulu {
  const dane = formularzDanychModuluZModelu({
    modul_istniejacy: null,
    data_umowy_przylaczeniowej: null,
    nastawy_zabezpieczen: null,
    deklaracje_modulu: null,
  });
  return {
    zdolnosci: Object.fromEntries(
      POLA_ZDOLNOSCI.map((pole) => [pole, jestZdolnosciaTrojstanowa(pole) ? null : false]),
    ) as unknown as ZdolnosciModulu,
    pochodzenieZdolnosci: Object.fromEntries(
      POLA_ZDOLNOSCI.map((pole) => [pole, 'deklarowane']),
    ) as Record<PoleZdolnosci, PochodzenieDanej>,
    liczby: Object.fromEntries(POLA_LICZBOWE_WEJSCIA.map((pole) => [pole, ''])) as Record<
      PoleLiczboweWejscia,
      string
    >,
    pochodzenieLiczb: Object.fromEntries(
      POLA_LICZBOWE_WEJSCIA.map((pole) => [pole, 'deklarowane']),
    ) as Record<PoleLiczboweWejscia, PochodzenieDanej>,
    modulIstniejacy: dane.modulIstniejacy,
    dataUmowy: dane.dataUmowy,
    nastawy: dane.nastawy,
    pochodzenieModuluIstniejacego: 'deklarowane',
    pochodzenieDatyUmowy: 'deklarowane',
    pochodzenieNastaw: 'deklarowane',
  };
}

/**
 * Moduły modelu (kolejność `selectAllDers`) — tożsamość i dane opisowe z migawki: moc
 * znamionowa (brak → `null`) i napięcie szyny przyłączenia (`rozwiazNapiecieKv`). Bez oceny
 * gotowości: o objęciu modułu biegiem rozstrzyga most modelu po stronie serwera.
 */
export function opisyModulow(ders: readonly StationDerConnection[]): OpisModuluModelu[] {
  return ders.map((der) => ({
    derRef: der.id,
    nazwa: der.name,
    rodzaj: der.der_kind,
    mocKw:
      typeof der.nominal_power_kw === 'number' && der.nominal_power_kw > 0
        ? der.nominal_power_kw
        : null,
    napiecieKv: rozwiazNapiecieKv(der),
  }));
}

/**
 * Kolumny macierzy (kolejność `selectAllDers`) z formularzem wstępnym z wejść modelu. Blokada
 * modułu pochodzi WYŁĄCZNIE z mostu: DER pominięty (`pominiete` — brak mocy / napięcia) →
 * jego powód; DER, którego most nie objął albo wejścia niewczytane (`wejscia === null`) →
 * `brak_wejscia_modelu`. Moc i napięcie kolumny — z modelu (migawka), tylko do opisu.
 */
export function zbudujModuly(
  ders: readonly StationDerConnection[],
  wejscia: WejsciaPrzypadkuNcRfg | null,
): OpisModulu[] {
  return opisyModulow(ders).map((opis) => {
    const wejscie = wejscia?.modules.find((m) => m.der_ref === opis.derRef) ?? null;
    const pominiety = wejscia?.pominiete.find((p) => p.der_ref === opis.derRef) ?? null;
    const powodBlokady: PowodBlokady | null =
      pominiety !== null ? pominiety.powod : wejscie === null ? 'brak_wejscia_modelu' : null;
    return {
      ...opis,
      powodBlokady,
      wejscieModelu: wejscie,
      formularz:
        wejscie !== null
          ? formularzZWejscia(wejscie, wejscia?.pola_z_modelu[opis.derRef] ?? [])
          : formularzBezWejscia(),
    };
  });
}

// =============================================================================
// Adapter: opis modułu + formularz → wejście biegu (dokładnie pola kontraktu)
// =============================================================================

/** Błędy pól formularza jednego modułu (klucz = nazwa pola kontraktu). */
export type BledyFormularza = Readonly<
  Partial<Record<PoleLiczboweWejscia | PoleNastawy | 'zrodlo_pl' | 'data_umowy_przylaczeniowej', string>>
>;

export type WynikWejscia =
  | { readonly stan: 'ok'; readonly wejscie: WejscieModuluNcRfg }
  | { readonly stan: 'blad'; readonly bledy: BledyFormularza }
  | { readonly stan: 'zablokowany'; readonly powod: PowodBlokady };

/**
 * Składa `WejscieModuluNcRfg` z wejścia modelu i formularza. Moduł zablokowany (pominięty
 * przez most albo bez wejścia modelu) NIE trafia do biegu; pole spoza ograniczeń kontraktu
 * blokuje żądanie z nazwanym błędem pola (backend odrzuciłby je 422).
 */
export function zbudujWejscieModulu(opis: OpisModulu, operatorId: string): WynikWejscia {
  const model = opis.wejscieModelu;
  if (opis.powodBlokady !== null || model === null) {
    return { stan: 'zablokowany', powod: opis.powodBlokady ?? 'brak_wejscia_modelu' };
  }
  const f = opis.formularz;
  const bledy: Partial<Record<string, string>> = {};
  const liczby: Partial<Record<PoleLiczboweWejscia, number | null>> = {};
  for (const pole of POLA_LICZBOWE_WEJSCIA) {
    const wynik = parsujPole(f.liczby[pole], OGRANICZENIA_WEJSCIA[pole]);
    if (wynik.stan === 'blad') bledy[pole] = wynik.komunikat;
    else liczby[pole] = wynik.wartosc;
  }
  const data = f.dataUmowy.trim();
  if (data !== '' && !jestDataKalendarzowa(data)) {
    bledy.data_umowy_przylaczeniowej = 'data kalendarzowa w zapisie RRRR-MM-DD';
  }
  const nastawy = zbudujNastawy(f.nastawy);
  if (nastawy.stan === 'blad') Object.assign(bledy, nastawy.bledy);
  if (Object.keys(bledy).length > 0 || nastawy.stan === 'blad') {
    return { stan: 'blad', bledy: bledy as BledyFormularza };
  }
  return {
    stan: 'ok',
    wejscie: {
      // Tożsamość modułu z wejścia modelu (most backendu) — formularz jej nie zmienia.
      der_ref: model.der_ref,
      der_name: model.der_name,
      der_kind: model.der_kind,
      module_family: model.module_family,
      operator_id: operatorId,
      p_max_kw: model.p_max_kw,
      voltage_kv: model.voltage_kv,
      modul_istniejacy: modulIstniejacyZeStanu(f.modulIstniejacy),
      data_umowy_przylaczeniowej: data === '' ? null : data,
      nastawy_zabezpieczen_modulu: nastawy.nastawy,
      ...f.zdolnosci,
      p_min_kw: liczby.p_min_kw ?? null,
      droop_percent: liczby.droop_percent ?? null,
      dead_band_hz: liczby.dead_band_hz ?? null,
      ramp_rate_pct_per_min: liczby.ramp_rate_pct_per_min ?? null,
      cos_phi_min: liczby.cos_phi_min ?? null,
      q_range_pct_pn_min: liczby.q_range_pct_pn_min ?? null,
      q_range_pct_pn_max: liczby.q_range_pct_pn_max ?? null,
      reactive_current_gain: liczby.reactive_current_gain ?? null,
      p_recovery_time_s: liczby.p_recovery_time_s ?? null,
      harmonic_thdu_percent: liczby.harmonic_thdu_percent ?? null,
      cease_generation_time_s: liczby.cease_generation_time_s ?? null,
    },
  };
}

// =============================================================================
// Adapter: wynik biegu → siatka macierzy
// =============================================================================

/** Wynik modułu z biegu (po `der_ref`); `null` bez biegu albo gdy moduł nie był w biegu. */
export function wynikModulu(wynik: BiegNcRfg | null, derRef: string): WynikModuluNcRfg | null {
  return wynik?.modules.find((m) => m.der_ref === derRef) ?? null;
}

/** Ocena wymagań modułu z biegu (rekordy W, kolejność profilu). */
export function ocenaWymaganModulu(
  wynik: BiegNcRfg | null,
  derRef: string,
): OcenaWymaganModulu | null {
  return wynik?.ocena_wymagan.find((o) => o.der_ref === derRef) ?? null;
}

/**
 * Siatka macierzy: wiersze = testy katalogu biegu (przed biegiem — katalog procedury),
 * kolumny = moduły; komórka = rekord `ocena` testu z biegu. Moduły zablokowane (brak danych
 * modelu) renderują stan „brak danych modułu" z nazwanym powodem.
 */
export function mapujMacierz(
  definicje: readonly DefinicjaTestuNcRfg[],
  wynik: BiegNcRfg | null,
  moduly: readonly OpisModulu[],
): WierszMacierzy[] {
  return definicje.map((test) => ({
    test,
    komorki: moduly.map((modul): KomorkaMacierzy => {
      if (modul.powodBlokady !== null) {
        return {
          stan: 'brak_danych_modul',
          derRef: modul.derRef,
          testId: test.test_id,
          powodModulu: modul.powodBlokady,
        };
      }
      const wynikTestu = wynikModulu(wynik, modul.derRef)?.tests.find(
        (t) => t.test_id === test.test_id,
      );
      if (!wynikTestu) return { stan: 'brak_biegu', derRef: modul.derRef, testId: test.test_id };
      return { stan: 'wynik', derRef: modul.derRef, testId: test.test_id, wynik: wynikTestu };
    }),
  }));
}

/** Etykieta obecna w biegu (filtr komórek — nawigacja, tekst z rekordu). */
export interface EtykietaObecna {
  readonly etykieta: Etykieta;
  readonly status: StatusWerdyktu;
}

/**
 * Etykiety rekordów `ocena` obecne w biegu, w kolejności pierwszego wystąpienia (moduły ×
 * testy) — opcje filtra komórek. Klucz filtra to tekst etykiety z rekordu (dwa rekordy tego
 * samego statusu z różną kompletnością dowodu mają różne etykiety — i różne opcje).
 */
export function etykietyObecne(wynik: BiegNcRfg | null): EtykietaObecna[] {
  const widziane = new Set<string>();
  const wynikowe: EtykietaObecna[] = [];
  for (const modul of wynik?.modules ?? []) {
    for (const test of modul.tests) {
      const tekst = test.ocena.etykieta.etykieta_pl;
      if (widziane.has(tekst)) continue;
      widziane.add(tekst);
      wynikowe.push({ etykieta: test.ocena.etykieta, status: test.ocena.status_maszynowy });
    }
  }
  return wynikowe;
}

// =============================================================================
// Adapter: identyfikacja + operator → żądanie certyfikatu (dokładnie pola kontraktu)
// =============================================================================

/**
 * Ciało `POST /api/oze-analysis/compliance-certificate` (`CertyfikatZgodnosciRequest`):
 * nazwa projektu (pusta → nazwa zastępcza — pole wymagane, `min_length=1`), nazwa przypadku
 * albo `null` i operator. Dane modułów NIE są częścią żądania — serwer czyta je z modelu
 * przypadku (`case_id` w zapytaniu).
 */
export function zbudujZadanieCertyfikatu(params: {
  readonly nazwaProjektu: string | null;
  readonly nazwaPrzypadku: string | null;
  readonly operatorId: string;
  readonly nazwaZastepcza: string;
}): ZadanieCertyfikatu {
  const projekt = params.nazwaProjektu?.trim();
  const przypadek = params.nazwaPrzypadku?.trim();
  return {
    nazwa_projektu: projekt ? projekt : params.nazwaZastepcza,
    nazwa_przypadku: przypadek ? przypadek : null,
    operator_id: params.operatorId,
  };
}
