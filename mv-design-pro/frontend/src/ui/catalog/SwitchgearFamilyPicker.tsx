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
import type { StanObiektu } from '../../types/enm';

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
  /**
   * Izolacja główna rodziny (`InsulationType`, `switchgear/switchgear_family.py`): powietrzna
   * (AIS), stała (SSIS), gazowa bez gazów fluorowanych (powietrze suche / azot), SF₆ albo
   * nieokreślona. Medium łączników to OSOBNA oś (`medium_lacznikow`).
   */
  readonly insulation_type: 'air' | 'ssis' | 'gaz_bez_f' | 'sf6' | 'unknown';
  /**
   * Medium łączników rodziny: SF₆, próżnia, powietrze albo „wg katalogu aparatów" (rodzina
   * z łącznikami dobieranymi z katalogu aparatów SN). `null` = karta nie rozstrzyga.
   */
  readonly medium_lacznikow?: 'SF6' | 'PROZNIA' | 'POWIETRZE' | 'KATALOG_APARATOW' | null;
  /**
   * Pola WYLICZANE przez backend (jedno źródło reguły — `gazy_fluorowane.py` i status rodziny):
   * `gaz_fluorowany` (`null` = rodzina nie potwierdza wykonania bez gazów fluorowanych),
   * dopuszczenie do budowania (status) i do NOWYCH pól (status + zakaz gazów fluorowanych
   * w obiektach projektowanych, rozporządzenie (UE) 2024/573, art. 13 ust. 9) — każde z
   * powodem blokady po polsku. Front nie trzyma żadnej kopii tych reguł.
   */
  readonly gaz_fluorowany: boolean | null;
  readonly dopuszczona_do_budowania: boolean;
  readonly powod_blokady_pl: string | null;
  readonly dopuszczona_do_nowych_pol: boolean;
  readonly powod_blokady_nowych_pol_pl: string | null;
  readonly construction_type:
    | 'RMU'
    | 'jednoczlonowa'
    | 'dwuczlonowa'
    | 'wysuwna'
    | 'GIS'
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
    | 'standard_osd'
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
 * Stan obiektu pola, dla którego wybierana jest rodzina (`Bay.stan_obiektu`): pole istniejące
 * w sieci może mieć rodzinę z gazem fluorowanym (serwis i przeniesienie — art. 13 ust. 7 i 10
 * rozporządzenia (UE) 2024/573), pole projektowane — nie.
 */
export type StanObiektuPola = StanObiektu;

/**
 * JEDYNY predykat frontu „czy tę rodzinę wolno wybrać" — kreator stacji, kreator pola
 * i karta pola czytają go stąd. Decyzja jest BACKENDU (pola wyliczane rodziny): pole
 * istniejące — `dopuszczona_do_budowania` (status), każde inne (nowe, projektowane) —
 * `dopuszczona_do_nowych_pol` (status i zakaz gazów fluorowanych). Parytet przypina
 * `backend/tests/ci/test_parytet_statusow_rodzin_rozdzielnic.py`. Korekta 2026-10-15: trzy
 * kopie zbioru statusów we froncie dopuszczały `user_defined`, którego backend nie dopuszcza;
 * korekta 2026-10-28: front nie trzyma już ŻADNEJ kopii reguły.
 */
export function czyRodzinaDoBudowania(
  family: SwitchgearFamily,
  stanObiektu: StanObiektuPola | null = null,
): boolean {
  return stanObiektu === 'ISTNIEJACY'
    ? family.dopuszczona_do_budowania
    : family.dopuszczona_do_nowych_pol;
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

/**
 * Powód, dla którego rodziny NIE wolno wybrać (albo `null`) — zdanie backendu z podstawą
 * i akcją naprawczą, nigdy cisza ani zdanie składane we froncie.
 */
export function powodBlokadyRodzinyPl(
  family: SwitchgearFamily,
  stanObiektu: StanObiektuPola | null = null,
): string | null {
  return stanObiektu === 'ISTNIEJACY' ? family.powod_blokady_pl : family.powod_blokady_nowych_pol_pl;
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
  GIS: 'GIS (izolacja gazowa)',
  wnetrzowa: 'Wnętrzowa',
  kontenerowa: 'Kontenerowa',
  prefabrykowana: 'Prefabrykowana',
  unknown: 'Nieznana konstrukcja',
};

/** Nazwy PL izolacji rodziny — JEDNO źródło frontu (kreator stacji, karta pola). */
export const NAZWY_IZOLACJI_RODZINY_PL: Readonly<Record<SwitchgearFamily['insulation_type'], string>> = {
  air: 'powietrzna (AIS)',
  ssis: 'stała (SSIS)',
  gaz_bez_f: 'gazowa bez gazów fluorowanych',
  sf6: 'SF₆',
  unknown: 'nieokreślona',
};

/** Nazwy PL medium łączników rodziny. */
export const NAZWY_MEDIUM_LACZNIKOW_PL: Readonly<
  Record<NonNullable<SwitchgearFamily['medium_lacznikow']>, string>
> = {
  SF6: 'SF₆',
  PROZNIA: 'próżnia',
  POWIETRZE: 'powietrze',
  KATALOG_APARATOW: 'wg katalogu aparatów',
};

/** „Izolacja: … · łączniki: …" — medium rodziny widoczne przy każdym wyborze. */
export function opisMediumRodzinyPl(family: SwitchgearFamily): string {
  const lacznik = family.medium_lacznikow
    ? NAZWY_MEDIUM_LACZNIKOW_PL[family.medium_lacznikow]
    : 'nieokreślone';
  return `Izolacja: ${NAZWY_IZOLACJI_RODZINY_PL[family.insulation_type]} · łączniki: ${lacznik}`;
}
