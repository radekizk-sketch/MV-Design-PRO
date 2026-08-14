/**
 * KONFIGURATOR ROZDZIELNICY SN/RMU — model kroku „Pola rozdzielnicy SN"
 * (etap S3 programu, kanon `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md`).
 *
 * DLACZEGO TEN MODUŁ ISTNIEJE. Krok 4 mylił POLE ROZDZIELCZE z APARATEM
 * ŁĄCZENIOWYM: projektant wybierał rolę pola i dokładał do niej jeden aparat, a
 * „rodzina standardowa producenta" była atrapą katalogu. POLE SN JEST KOMPLETNĄ
 * JEDNOSTKĄ FUNKCJONALNĄ KONKRETNEJ RODZINY (kanon §1) — aparat łączeniowy to
 * tylko jeden z jego elementów. Ten moduł niesie CZYSTĄ (bez DOM, bez stanu)
 * warstwę modelu tej zmiany; komponent kroku wyłącznie ją renderuje.
 *
 * DWA TORY KONFIGURACJI (kanon §3, `tor_konfiguracji` rodziny — pole WYLICZANE
 * przez backend z `construction_type`, nie druga deklaracja architektury):
 *  · `MODULARNY` — rozdzielnicę SKŁADA się z katalogowych pól rodziny,
 *  · `BLOK_RMU` — najpierw BLOK fabryczny o STAŁEJ sekwencji jednostek
 *    (`FACTORY_CONFIGURATION_REGISTRY`, np. L-L-T dla ZPUE TPM Air, CCF dla ABB
 *    SafeRing), potem doposażenie jednostek. RMU nie jest zbiorem luźnych szaf:
 *    kreator, który pozwala „dostawić czwarte pole" do bloku trzyfunkcyjnego,
 *    opisuje wyrób, którego producent nie robi.
 *
 * ZERO LOKALNYCH LIST. Rodziny, pola i bloki pochodzą WYŁĄCZNIE z tras katalogu
 * (`/api/catalog/switchgear-families`, `/complete-bay-templates`, subzasób
 * `/factory-configurations`). Ten moduł nie zna ANI JEDNEJ nazwy wyrobu.
 *
 * ZERO FIZYKI I ZERO WERDYKTU. Werdykt VALID/INVALID konfiguracji pochodzi
 * z walidatora backendu (`dry_run` tej samej operacji domenowej, która wykona
 * zapis) — tutaj nie ma ani jednej reguły zgodności elektrycznej.
 */

import type {
  BayDeviceInstanceWire,
  BayKind,
  CompleteMvBayTemplateSummary,
} from '../../../ui/catalog/BayTemplatePicker';
import {
  CONSTRUCTION_LABELS_PL,
  type FactoryConfigurationUnitWire,
  type FactoryConfigurationWire,
  type SwitchgearFamily,
} from '../../../ui/catalog/SwitchgearFamilyPicker';
import type { SnFieldRole } from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type { PoleSnWpis } from './stacjaModel';
import { STACJA_STRINGS as T } from './strings';

/** Tor konfiguracji rodziny — kontrakt `SwitchgearFamily.tor_konfiguracji`. */
export type TorKonfiguracji = 'MODULARNY' | 'BLOK_RMU';

/** Rodzaj aparatu w kompozycji pola — słownik kontraktu (18 wartości). */
export type RodzajAparatu = BayDeviceInstanceWire['apparatus_kind'];

// ---------------------------------------------------------------- Bloki RMU

/**
 * Jednostka bloku i blok fabryczny — nazwy PL dla TYCH SAMYCH typów kontraktu
 * (`FactoryConfigurationUnitWire` / `FactoryConfigurationWire` w `ui/catalog`).
 * Alias, nie druga definicja: dwa opisy tego samego wyrobu rozjechałyby się
 * przy pierwszym nowym polu kontraktu.
 */
export type JednostkaBloku = FactoryConfigurationUnitWire;
export type BlokFabryczny = FactoryConfigurationWire;

// -------------------------------------------------------- Tor konfiguracji

/**
 * Tor konfiguracji wybranej rodziny. `null` = rodzina nie zadeklarowała
 * konstrukcji ALBO nie wybrano rodziny — w obu przypadkach konfigurator nie
 * zgaduje toru pracy, tylko pokazuje jawny brak (kanon §3: „`None` oznacza
 * rodzinę, która nie zadeklarowała konstrukcji — jawny brak, nigdy domyślny
 * tor").
 */
export function torRodziny(rodzina: SwitchgearFamily | null | undefined): TorKonfiguracji | null {
  return rodzina?.tor_konfiguracji ?? null;
}

// --------------------------------------- Oferta rodzin producenta (widok)

/**
 * Statusy rodziny, przy których katalog POZWALA budować konfigurację —
 * odwzorowanie `POTWIERDZONE_STATUSY_RODZINY` z pakietu katalogu
 * (`switchgear/families.py`, polityka `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`).
 * `requires_catalog` i `deprecated` są POZA tym zbiorem.
 */
const STATUSY_POZWALAJACE_BUDOWAC: ReadonlySet<SwitchgearFamily['status']> = new Set([
  'verified',
  'repo_verified',
  'user_defined',
]);

/** Powód, dla którego rodziny katalogu NIE MOŻNA dziś użyć (albo `null`). */
export type PowodNiedostepnosci = 'WYMAGA_KARTY' | 'WYCOFANA' | 'INNA_KLASA_NAPIECIOWA';

export interface PozycjaOfertyRodzin {
  readonly rodzina: SwitchgearFamily;
  /** `null` = rodzinę wolno wybrać; inaczej powód niedostępności (jawny). */
  readonly powod: PowodNiedostepnosci | null;
}

/**
 * Czy klasa napięciowa rodziny obejmuje napięcie szyny SN. Porównanie
 * KATALOGOWE (wartość znamionowa do wartości znamionowej), nie fizyka.
 * Rodzina bez zadeklarowanych napięć nie jest odrzucana — brak deklaracji to
 * brak przeciwwskazania, a nie niezgodność.
 */
function klasaNapieciowaObejmuje(rodzina: SwitchgearFamily, snVoltageKv: number): boolean {
  if (!(snVoltageKv > 0) || rodzina.voltage_levels.length === 0) return true;
  return rodzina.voltage_levels.some((poziom) => poziom + 0.5 >= snVoltageKv);
}

/**
 * OFERTA RODZIN PRODUCENTA — WSZYSTKIE rodziny producenta z katalogu, każda
 * z jawnym powodem ewentualnej niedostępności.
 *
 * DLACZEGO NIE FILTR. Krok pokazywał wcześniej wyłącznie rodziny „używalne",
 * więc producent z jedną potwierdzoną kartą wyglądał na producenta z jedną
 * rodziną — a katalog niesie ich osiemnaście. Ukrycie pozycji kasuje wiedzę
 * o realnym portfolio i podsuwa fałszywy wniosek („nie ma czego wybierać")
 * zamiast informacji, czego brakuje do użycia rodziny (karty katalogowej).
 * Predykat „wolno budować" pozostaje JEDEN i pochodzi z katalogu — widoczność
 * i wybieralność to dwie różne rzeczy.
 */
export function ofertaRodzinProducenta(
  rodziny: readonly SwitchgearFamily[],
  manufacturerRef: string,
  snVoltageKv: number,
): PozycjaOfertyRodzin[] {
  return rodziny
    .filter((f) => f.manufacturer_ref === manufacturerRef)
    .map((rodzina) => ({ rodzina, powod: powodNiedostepnosci(rodzina, snVoltageKv) }))
    .sort(
      (a, b) =>
        a.rodzina.family_name.localeCompare(b.rodzina.family_name, 'pl-PL')
        || a.rodzina.switchgear_family_ref.localeCompare(b.rodzina.switchgear_family_ref),
    );
}

/** Powód niedostępności rodziny — kolejność od najbardziej rozstrzygającego. */
function powodNiedostepnosci(
  rodzina: SwitchgearFamily,
  snVoltageKv: number,
): PowodNiedostepnosci | null {
  if (rodzina.status === 'deprecated') return 'WYCOFANA';
  if (!STATUSY_POZWALAJACE_BUDOWAC.has(rodzina.status)) return 'WYMAGA_KARTY';
  // Status potwierdzony bez ANI JEDNEGO źródła to ta sama luka danych, co brak
  // karty — polityka źródeł wymaga proweniencji, nie samej etykiety statusu.
  if (rodzina.status !== 'user_defined' && rodzina.source_refs.length === 0) return 'WYMAGA_KARTY';
  if (!klasaNapieciowaObejmuje(rodzina, snVoltageKv)) return 'INNA_KLASA_NAPIECIOWA';
  return null;
}

/** Etykieta pozycji oferty: nazwa rodziny + jawny powód niedostępności. */
export function etykietaOfertyRodziny(pozycja: PozycjaOfertyRodzin): string {
  const nazwa = pozycja.rodzina.family_name;
  if (pozycja.powod === null) return nazwa;
  return `${nazwa} — ${T.powodNiedostepnosci[pozycja.powod]}`;
}

// ------------------------------------------------ Funkcja pola → rola pola

/**
 * ODWZOROWANIE FUNKCJI POLA NA ROLĘ KONTRAKTU OPERACJI STACYJNEJ.
 *
 * Jednostka bloku deklaruje FUNKCJĘ (`BayKind` katalogu), a operacja domenowa
 * przyjmuje ROLĘ (`field_role`). Odwzorowanie jest tu JEDNO i pokrywa KOMPLET
 * wartości `BayKind` (test dwustronny) — brak wpisu oznaczałby cichy domyślny
 * rodzaj pola, czyli dokładnie tę fabrykację, którą kanon zakazuje.
 *
 * `null` = funkcji NIE DA SIĘ wyrazić rolą pola w kontrakcie operacji stacyjnej.
 * Taka jednostka jest w kreatorze nazwana wprost (jednostka spoza zakresu
 * operacji), a nie po cichu zamieniona na pole liniowe.
 *
 * Kierunek odwrotny (`SN_FIELD_ROLE_TO_BAY_KIND`) nie jest różnowartościowy:
 * `LINIA_OUT` i `LINIA_ODG` mają tę samą funkcję `liniowe_odplywowe`. Odwrotność
 * wybiera `LINIA_OUT` — rolę odpływu magistralnego — bo blok RMU opisuje pola
 * ciągu liniowego, a nie odgałęzienia. Projektant zmienia rolę wprost w polu.
 */
export const ROLA_Z_FUNKCJI_POLA: Readonly<Record<BayKind, SnFieldRole | null>> = {
  liniowe_doplywowe: 'LINIA_IN',
  liniowe_odplywowe: 'LINIA_OUT',
  transformatorowe: 'TRANSFORMATOROWE',
  sprzeglowe_podluzne: 'SPRZEGLO',
  sprzeglowe_poprzeczne: 'SPRZEGLO',
  // Funkcje BEZ odpowiednika w rolach operacji stacyjnej — jawny brak.
  // `kablowe`/`napowietrzne` opisują MEDIUM przyłącza, nie kierunek pola, więc
  // nie da się z nich wyprowadzić roli (dopływ czy odpływ) bez zgadywania.
  pomiarowe: null,
  sekcyjne: null,
  potrzeb_wlasnych: null,
  odgromnikowe: null,
  pv: null,
  bess: null,
  fw: null,
  rezerwowe: null,
  kablowe: null,
  napowietrzne: null,
  nop_lacznikowe: null,
};

// ------------------------------------------------------- Wyposażenie pola

/** Status wyposażenia aparatu — kontrakt `BayDeviceInstanceTemplate`. */
export type StatusWyposazenia = BayDeviceInstanceWire['status_wyposazenia'];

/**
 * Pozycja wyposażenia pola pokazywana na karcie pola/jednostki.
 * Wszystko poza `kluczWyposazenia` to READOUT katalogu — UI niczego nie liczy.
 */
export interface PozycjaWyposazenia {
  readonly ref: string;
  readonly rodzaj: RodzajAparatu;
  /** Oznaczenie operatorskie z karty katalogowej (np. „Q1", „Q9 (E)"). */
  readonly oznaczenie: string;
  readonly nazwa: string;
  readonly status: StatusWyposazenia;
  /**
   * Klucz wyposażenia payloadu operacji stacyjnej (`equipment.ct|vt|relay`)
   * albo `null`, gdy operacja nie ma dla tego aparatu żadnego pola. Steruje
   * tym, czy pozycja OPCJA dostaje realną kontrolkę, czy pozostaje readoutem —
   * kontrolka bez pokrycia w backendzie jest zakazana (phantom rule).
   */
  readonly kluczWyposazenia: KluczWyposazenia | null;
}

/** Klucze wyposażenia, które operacja stacyjna REALNIE przyjmuje (B-3). */
export type KluczWyposazenia = 'ct' | 'vt' | 'relay';

/**
 * JEDNO ŹRÓDŁO PRAWDY: który rodzaj aparatu ma dostawcę w payloadzie operacji
 * stacyjnej. Klucze odpowiadają 1:1 blokom budowanym przez
 * `zbudujWyposazeniePolaDoPayloadu` (`equipment.ct`, `.vt`, `.relay`) —
 * przypięte testem, żeby dołożenie tam czwartego bloku bez wpisu tutaj (albo
 * odwrotnie) nie przeszło po cichu.
 *
 * Rodzaj spoza tej tablicy NIE dostaje kontrolki: aparat opcjonalny, którego
 * operacja nie umie przyjąć, byłby przełącznikiem bez skutku w modelu.
 */
export const KLUCZ_WYPOSAZENIA_Z_APARATU: Readonly<
  Partial<Record<RodzajAparatu, KluczWyposazenia>>
> = {
  current_transformer: 'ct',
  voltage_transformer: 'vt',
  protection_relay: 'relay',
};

/**
 * Nazwy PL rodzajów aparatu kompozycji pola — KOMPLET słownika kontraktu
 * (18 wartości, test dwustronny). Brak wpisu oznaczałby kod backendu na ekranie
 * projektanta.
 */
export const NAZWY_APARATU_PL: Readonly<Record<RodzajAparatu, string>> = {
  circuit_breaker: 'wyłącznik',
  switch_disconnector: 'rozłącznik',
  disconnector_busbar: 'odłącznik szynowy',
  disconnector_line: 'odłącznik liniowy',
  earthing_switch: 'uziemnik',
  fuse_set: 'zestaw bezpieczników',
  current_transformer: 'przekładnik prądowy',
  voltage_transformer: 'przekładnik napięciowy',
  surge_arrester: 'ogranicznik przepięć',
  cable_head: 'głowica kablowa',
  busbar: 'szyna zbiorcza',
  bus_coupler: 'sprzęgło szyn',
  voltage_indicator: 'wskaźnik obecności napięcia',
  protection_relay: 'zabezpieczenie',
  meter: 'licznik',
  transformer: 'transformator',
  lv_breaker: 'wyłącznik strony nN',
  interlock: 'blokada',
};

/**
 * Wyposażenie katalogowego pola — kompozycja aparatów z szablonu rodziny,
 * w kolejności montażowej (`position_in_bay`, potem ref — porządek
 * deterministyczny, bo lista trafia do rysunku i do testów).
 *
 * Szablon bez kompozycji zwraca listę pustą: to uczciwy stan zerowy karty pola
 * („karta producenta nie wylicza wyposażenia"), a nie powód do dorysowania
 * aparatów, których katalog nie deklaruje.
 */
export function wyposazenieSzablonu(
  szablon: CompleteMvBayTemplateSummary | null | undefined,
): PozycjaWyposazenia[] {
  const instancje = szablon?.device_instances ?? [];
  return [...instancje]
    .sort(
      (a, b) =>
        (a.position_in_bay ?? 0) - (b.position_in_bay ?? 0)
        || a.device_template_ref.localeCompare(b.device_template_ref),
    )
    .map((instancja) => ({
      ref: instancja.device_template_ref,
      rodzaj: instancja.apparatus_kind,
      oznaczenie: instancja.label,
      nazwa: NAZWY_APARATU_PL[instancja.apparatus_kind] ?? instancja.apparatus_kind,
      status: instancja.status_wyposazenia,
      kluczWyposazenia: KLUCZ_WYPOSAZENIA_Z_APARATU[instancja.apparatus_kind] ?? null,
    }));
}

/** Czy pozycja jest fabrycznym wyposażeniem pola (znacznik stały karty). */
export function czyFabryczne(pozycja: PozycjaWyposazenia): boolean {
  return pozycja.status === 'FABRYCZNY';
}

// ------------------------------------------------------ Nagłówek rodziny

/**
 * Wiersz nagłówka rodziny. `wartosc === null` to JAWNY BRAK danej katalogowej
 * („katalog tego nie niesie") — pokazywany jako brak, nigdy zastąpiony liczbą
 * domyślną.
 */
export interface WierszNaglowka {
  readonly etykieta: string;
  readonly wartosc: string | null;
}

/**
 * Lista wartości znamionowych rodziny w konwencji katalogu: „12 / 17,5 / 24 kV".
 *
 * UWAGA NA DRUGĄ ŚCIEŻKĘ: identyczne zestawienie buduje nagłówek RYSUNKU
 * (`podgladRozdzielnicy.ts`, prywatne `listaZnamion`). Ten sam fakt w dwóch
 * miejscach rozjechałby się po cichu, dlatego równość obu nagłówków jest
 * PRZYPIĘTA TESTEM (`naglowekRodziny` vs `zbudujPodglad(...).naglowek`).
 */
export function listaZnamionRodziny(
  wartosci: readonly number[] | undefined,
  jednostka: string,
): string | null {
  if (!wartosci || wartosci.length === 0) return null;
  return `${wartosci.map((w) => String(w).replace('.', ',')).join(' / ')} ${jednostka}`;
}

/** Nazwy PL izolacji rodziny — komplet słownika kontraktu (test dwustronny). */
export const NAZWY_IZOLACJI_PL: Readonly<Record<SwitchgearFamily['insulation_type'], string>> = {
  air: 'powietrzna',
  sf6: 'SF₆',
  vacuum: 'próżniowa',
  mixed: 'mieszana',
  unknown: 'nieokreślona',
};

/** Nazwy PL toru konfiguracji — język projektanta, nie kod kontraktu. */
export const NAZWY_TORU_PL: Readonly<Record<TorKonfiguracji, string>> = {
  MODULARNY: 'modułowy — rozdzielnica składana z pól',
  BLOK_RMU: 'blokowy (RMU) — blok fabryczny o stałej sekwencji jednostek',
};

/**
 * Nagłówek wybranej rodziny (kanon §3): producent, klasy znamionowe, technologia
 * (izolacja + konstrukcja) i tor konfiguracji. Wyłącznie readout katalogu.
 */
export function naglowekRodziny(
  rodzina: SwitchgearFamily | null | undefined,
  producent: string | null | undefined,
): WierszNaglowka[] {
  const tor = torRodziny(rodzina);
  return [
    { etykieta: T.naglowekProducent, wartosc: producent ?? rodzina?.manufacturer_ref ?? null },
    {
      etykieta: T.naglowekNapiecie,
      wartosc: listaZnamionRodziny(rodzina?.voltage_levels, 'kV'),
    },
    {
      etykieta: T.naglowekPradSzyn,
      wartosc: listaZnamionRodziny(rodzina?.rated_current_options, 'A'),
    },
    {
      etykieta: T.naglowekPradZwarciowy,
      wartosc: listaZnamionRodziny(rodzina?.short_time_current_options, 'kA'),
    },
    {
      etykieta: T.naglowekIzolacja,
      // Rekord katalogu bez zadeklarowanej izolacji/konstrukcji (albo z wartością
      // spoza słownika kontraktu) daje JAWNY BRAK — nigdy `undefined` na ekranie
      // ani nazwę „domyślnej" technologii.
      wartosc: (rodzina && NAZWY_IZOLACJI_PL[rodzina.insulation_type]) ?? null,
    },
    {
      etykieta: T.naglowekKonstrukcja,
      wartosc: (rodzina && CONSTRUCTION_LABELS_PL[rodzina.construction_type]) ?? null,
    },
    { etykieta: T.naglowekTor, wartosc: tor ? NAZWY_TORU_PL[tor] : null },
  ];
}

// --------------------------------------------------- Blok RMU → pola stacji

/**
 * Jednostka bloku rozłożona na wpis pola stacji. `rola === null` znaczy, że
 * funkcji jednostki NIE DA SIĘ wyrazić w kontrakcie operacji stacyjnej —
 * kreator mówi to wprost przy jednostce zamiast wstawiać pole zastępcze.
 */
export interface JednostkaRozlozona {
  readonly jednostka: JednostkaBloku;
  readonly rola: SnFieldRole | null;
  /** Numer jednostki w sekwencji bloku (1-based) — stała kolejność wyrobu. */
  readonly pozycja: number;
}

/** Rozkłada blok fabryczny na jednostki z rolami kontraktu (kolejność wyrobu). */
export function rozlozBlok(blok: BlokFabryczny | null | undefined): JednostkaRozlozona[] {
  return (blok?.units ?? []).map((jednostka, index) => ({
    jednostka,
    rola: ROLA_Z_FUNKCJI_POLA[jednostka.bay_kind],
    pozycja: index + 1,
  }));
}

/**
 * Pola stacji WYNIKAJĄCE z bloku fabrycznego — sekwencja jednostek jest STAŁA,
 * więc lista pól powstaje z bloku, a nie z ról rodzaju stacji.
 *
 * Identyfikator wpisu niesie ref bloku i pozycję jednostki: zmiana bloku
 * przebudowuje listę bez mieszania wyposażenia poprzedniego wyrobu (klucze
 * wyposażenia są per wpis pola), a dwie identyczne jednostki (np. L-L) dostają
 * różne, stabilne klucze.
 *
 * Jednostki bez roli w kontrakcie operacji są POMIJANE w liście pól (nie da się
 * ich zapisać), ale ZOSTAJĄ widoczne na karcie bloku przez `rozlozBlok` —
 * projektant widzi pełny skład wyrobu i wie, czego kreator nie zapisze.
 */
export function polaZBloku(
  blok: BlokFabryczny | null | undefined,
  szablonDlaRoli: (rola: SnFieldRole) => string | null,
  aparatDlaRoli: (rola: SnFieldRole) => string | null,
): PoleSnWpis[] {
  return rozlozBlok(blok)
    .filter((wpis): wpis is JednostkaRozlozona & { rola: SnFieldRole } => wpis.rola !== null)
    .map((wpis) => ({
      id: `blok-${blok?.configuration_ref ?? ''}-${wpis.pozycja}-${wpis.jednostka.unit_code}`,
      field_role: wpis.rola,
      bay_template_ref: szablonDlaRoli(wpis.rola),
      apparatus_catalog_ref: aparatDlaRoli(wpis.rola),
    }));
}

/**
 * Opis aparatury jednostki bloku po polsku (np. „rozłącznik + zestaw
 * bezpieczników") — to właśnie ta różnica ODRÓŻNIA jednostki wyrobu (SafeRing
 * CCF vs CCV to różne bloki), więc karta jednostki musi ją nazywać.
 */
export function aparaturaJednostkiPl(jednostka: JednostkaBloku): string {
  return jednostka.apparatus_kinds.map((rodzaj) => NAZWY_APARATU_PL[rodzaj] ?? rodzaj).join(' + ');
}

/** Szerokość bloku w konwencji katalogu; `null` = karta producenta jej nie podaje. */
export function szerokoscBlokuPl(blok: BlokFabryczny | null | undefined): string | null {
  const szerokosc = blok?.total_width_mm ?? null;
  return szerokosc === null ? null : `${szerokosc} mm`;
}
