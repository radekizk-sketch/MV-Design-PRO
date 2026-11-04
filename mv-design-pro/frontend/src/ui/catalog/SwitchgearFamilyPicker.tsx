/**
 * Rodzina rozdzielnicy SN (goal §11A.4) — typ kontraktu `GET /api/catalog/switchgear-families`,
 * jedyny predykat „czy na rodzinie wolno budować", powód blokady i nazwy konstrukcji.
 *
 * Komponent listy rodzin (`SwitchgearFamilyPicker`) skasowany 2026-11-04 (karta
 * KOMUNIKATY-BEZ-ID): zero miejsc montażu w aplikacji — rodzinę wybiera się w kreatorach
 * (`ui2/kreatory/stacja`, `pole`, `zrodlo`) z tych samych predykatów, a martwy komponent
 * pokazywał kod producenta (`manufacturer_ref`) zamiast nazwy. Nazwa pliku zostaje, bo
 * przypinają ją testy parytetu backendu (`test_parytet_statusow_rodzin_rozdzielnic.py`,
 * `test_komunikaty_operacji_bez_kodow.py`).
 */

import type { BayDeviceInstanceWire, BayKind } from './BayTemplatePicker';

export interface SwitchgearFamily {
  readonly switchgear_family_ref: string;
  readonly manufacturer_ref: string;
  readonly family_name: string;
  readonly series_name: string | null;
  /**
   * DWIE RÓŻNE WIELKOŚCI NAPIĘCIOWE, DWA POLA (kontrakt
   * `switchgear/switchgear_family.py`, karta K-J):
   *
   * · `network_voltages_kv` — napięcia SIECI, dla których karta producenta
   *   oferuje wyrób (wiersz „napięcie nominalne sieci" / „napięcie robocze");
   * · `um_classes_kv` — klasy URZĄDZENIA (wiersz „napięcie znamionowe (Ur)" /
   *   „najwyższe napięcie urządzeń (Um)"), czyli górna granica napięcia sieci
   *   wg PN-EN 62271-1.
   *
   * Karta ZPUE Rotoblok podaje OBIE (sieć 15/20 kV przy klasach 17,5/24 kV) —
   * jedno wspólne pole `voltage_levels` mieszało je i nie dało się na nim
   * oprzeć żadnego uczciwego porównania. Pusta lista = karta danego wiersza NIE
   * ma (jawny brak), nie „zero kilowoltów".
   */
  readonly network_voltages_kv: readonly number[];
  readonly um_classes_kv: readonly number[];
  /**
   * Prądy znamionowe szyn [A] i prądy zwarciowe krótkotrwałe [kA, 1 s] rodziny —
   * pola `rated_current_options` / `short_time_current_options` kontraktu
   * (`switchgear/switchgear_family.py`), wystawiane trasą
   * `GET /api/catalog/switchgear-families`. Typ ich dotąd nie deklarował, więc
   * nagłówek rozdzielnicy nie miał czym opisać pakietu, mimo że dane przychodzą
   * z każdą odpowiedzią. Pusta lista = rodzina wartości nie deklaruje (jawny
   * brak), nie „zero amperów".
   */
  readonly rated_current_options?: readonly number[];
  readonly short_time_current_options?: readonly number[];
  readonly insulation_type: 'air' | 'sf6' | 'vacuum' | 'mixed' | 'unknown';
  readonly construction_type:
    | 'RMU'
    | 'jednoczlonowa'
    | 'dwuczlonowa'
    | 'wysuwna'
    | 'GIS_SF6'
    | 'wnetrzowa'
    | 'kontenerowa'
    | 'prefabrykowana'
    | 'unknown';
  /**
   * TOR KONFIGURACJI rodziny — pole WYLICZANE przez backend z
   * `construction_type` (`switchgear_family.py`, `TOR_KONFIGURACJI_WG_KONSTRUKCJI`)
   * i wystawiane addytywnie przez `GET /api/catalog/switchgear-families`:
   *  · `MODULARNY` — rozdzielnicę SKŁADA się z pojedynczych katalogowych pól,
   *  · `BLOK_RMU` — najpierw BLOK fabryczny o stałej sekwencji jednostek
   *    (RMU nie jest zbiorem luźnych szaf), potem doposażenie jednostek.
   * `null`/brak = rodzina nie zadeklarowała konstrukcji — jawny brak, NIGDY
   * domyślny tor (konfigurator odmawia wtedy budowania na tej rodzinie).
   */
  readonly tor_konfiguracji?: 'MODULARNY' | 'BLOK_RMU' | null;
  /**
   * Status weryfikacji rodziny. `repo_verified` = dane z publicznej strony
   * produktowej producenta zweryfikowane w repozytorium katalogu — TAKI status
   * wystawia katalog referencyjny dla wszystkich rodzin (`switchgear/families.py`),
   * a poprzedni typ go nie znał, więc UI nie pokazywało ŻADNEJ rodziny.
   */
  readonly status:
    | 'verified'
    | 'repo_verified'
    | 'user_defined'
    | 'requires_catalog'
    | 'deprecated';
  readonly source_refs: readonly string[];
  readonly notes_pl: string | null;
}

/**
 * Jednostka funkcjonalna bloku fabrycznego RMU — kontrakt
 * `FactoryConfigurationUnit` (`switchgear/factory_configuration.py`), wystawiany
 * subzasobem `GET /api/catalog/switchgear-families/{ref}/factory-configurations`.
 *
 * `unit_code` to litera KATALOGOWA producenta (L/T/W dla ZPUE TPM Air, C/F/V dla
 * ABB SafeRing) — nomenklatura wyrobu, nie kod wewnętrzny. `apparatus_kinds` to
 * aparaty toru głównego, które ODRÓŻNIAJĄ jednostkę (SafeRing CCF vs CCV to dwa
 * różne wyroby właśnie tą pozycją). `width_mm === null` = karta jej nie podaje.
 */
export interface FactoryConfigurationUnitWire {
  readonly unit_code: string;
  readonly unit_name_pl: string;
  readonly bay_kind: BayKind;
  readonly apparatus_kinds: readonly BayDeviceInstanceWire['apparatus_kind'][];
  readonly width_mm: number | null;
}

/**
 * Blok fabryczny rodziny RMU — kontrakt `FactoryConfiguration`. `unit_sequence`
 * i `total_width_mm` są po stronie backendu polami WYLICZANYMI (sekwencja liter;
 * suma szerokości jednostek). `total_width_mm === null` znaczy „choć jedna
 * jednostka nie ma szerokości w karcie", nigdy „zero milimetrów".
 */
export interface FactoryConfigurationWire {
  readonly configuration_ref: string;
  readonly switchgear_family_ref: string;
  readonly code: string;
  readonly name_pl: string;
  readonly units: readonly FactoryConfigurationUnitWire[];
  readonly unit_sequence: string;
  readonly total_width_mm: number | null;
  readonly source_refs: readonly string[];
  readonly notes_pl: string | null;
}

/**
 * Statusy rodzin, na których backend POZWALA budować konfigurację
 * (`switchgear/families.py: POTWIERDZONE_STATUSY_RODZINY`). Rodzina spoza tego
 * zbioru jest w katalogu — bo nie kasujemy wiedzy o portfolio producenta — ale
 * walidator zgodności odmówi na niej budowania twardym błędem.
 *
 * DLACZEGO TO TU JEST (2026-08-14). Picker renderował KAŻDĄ rodzinę z odpowiedzi
 * jako klikalny przycisk. Dopóki katalog miał wyłącznie rodziny `repo_verified`,
 * nikt tego nie widział; pierwsza rodzina `requires_catalog` w odpowiedzi (ABB
 * UniSec — publiczna strona nie podaje klas prądowych i zwarciowych) zamieniłaby
 * ten przycisk w martwy klik: UI oferuje wybór, backend go odrzuca. Wybór bez
 * pokrycia w backendzie jest zakazany, więc taka rodzina jest pokazana jako
 * NIEAKTYWNA z powodem, a nie ukryta i nie klikalna.
 */
export const STATUSY_DO_BUDOWANIA: ReadonlySet<SwitchgearFamily['status']> = new Set([
  'verified',
  'repo_verified',
]);

/**
 * JEDYNY predykat frontu „czy na tej rodzinie wolno budować" — kreator stacji i karta
 * pola czytają go stąd. Zbiór jest lustrem `POTWIERDZONE_STATUSY_RODZINY`; parytet przypina
 * `backend/tests/ci/test_parytet_statusow_rodzin_rozdzielnic.py`. Korekta 2026-10-15: trzy kopie
 * tego zbioru we froncie dopuszczały też `user_defined`, którego backend NIE dopuszcza
 * (`family_validation.wymagaj_rodziny_oferowanej`) — wybór oferowany w UI kończyłby się twardym
 * błędem operacji.
 */
export function czyRodzinaDoBudowania(family: SwitchgearFamily): boolean {
  return STATUSY_DO_BUDOWANIA.has(family.status);
}

/**
 * Czy z POJEDYNCZEGO szablonu pola tej rodziny (bez wyboru bloku fabrycznego) backend złoży
 * pole — lustro planu pola katalogowego (`enm/pole_katalogowe.py`: rodzina oferowana
 * `wymagaj_rodziny_oferowanej` i tor różny od `BLOK_RMU`; rodzina blokowa wymaga bloku
 * i jednostki). Kontrolka oferująca szablon rodziny spoza tego predykatu kończy się zawsze
 * twardym błędem operacji — jest fantomem, więc listy szablonów pojedynczego pola (edytor
 * wyposażenia pola, kreator źródła) jej nie pokazują.
 */
export function czyRodzinaPrzyjmujePojedynczePole(family: SwitchgearFamily): boolean {
  return czyRodzinaDoBudowania(family) && family.tor_konfiguracji !== 'BLOK_RMU';
}

/**
 * Szablon pola do zastosowania bez wyboru bloku: deklaruje rodzinę znaną katalogowi rodzin
 * i ta rodzina przyjmuje pojedyncze pole. Szablon bez rodziny backend odrzuca („nie deklaruje
 * rodziny rozdzielnicy”), rodziny spoza katalogu — tak samo.
 */
export function czySzablonPojedynczegoPola(
  switchgearFamilyRef: string | null | undefined,
  rodziny: readonly SwitchgearFamily[],
): boolean {
  if (!switchgearFamilyRef) return false;
  const rodzina = rodziny.find((r) => r.switchgear_family_ref === switchgearFamilyRef);
  return rodzina !== undefined && czyRodzinaPrzyjmujePojedynczePole(rodzina);
}

const POWOD_BLOKADY_PL: Partial<Record<SwitchgearFamily['status'], string>> = {
  requires_catalog: 'Wymaga karty katalogowej producenta — brak potwierdzonych klas znamionowych.',
  deprecated: 'Rodzina wycofana z oferty producenta.',
};

/**
 * Powód, dla którego na rodzinie NIE wolno budować (albo `null`, gdy wolno). Status bez
 * własnego zdania dostaje zdanie domyślne backendu (`family_validation`), nigdy ciszę.
 */
export function powodBlokadyRodzinyPl(family: SwitchgearFamily): string | null {
  if (czyRodzinaDoBudowania(family)) return null;
  return POWOD_BLOKADY_PL[family.status] ?? 'Status rodziny nie dopuszcza budowania konfiguracji.';
}

/**
 * Nazwy PL konstrukcji rodziny — JEDNO źródło dla inspektora i dla nagłówka
 * rozdzielnicy w podglądzie kreatora (`ui2/kreatory/stacja`). Druga tablica tych
 * samych nazw rozjechałaby się przy pierwszej nowej konstrukcji w kontrakcie.
 */
export const CONSTRUCTION_LABELS_PL: Record<SwitchgearFamily['construction_type'], string> = {
  RMU: 'RMU',
  jednoczlonowa: 'Jednoczłonowa',
  dwuczlonowa: 'Dwuczłonowa',
  wysuwna: 'Wysuwna',
  GIS_SF6: 'GIS / SF₆',
  wnetrzowa: 'Wnętrzowa',
  kontenerowa: 'Kontenerowa',
  prefabrykowana: 'Prefabrykowana',
  unknown: 'Nieznana konstrukcja',
};
