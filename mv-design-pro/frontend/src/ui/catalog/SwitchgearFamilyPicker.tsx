/**
 * SwitchgearFamilyPicker — krok 2 wyboru rodziny rozdzielnicy SN (goal §11A.4).
 *
 * Komponent prezentacyjny — wyświetla listę rodzin rozdzielnic
 * (`SwitchgearFamily`) wybranego producenta. Gdy producent ma
 * `status="requires_catalog"`, lista rodzin jest pusta (backend nie udostępnia
 * fabrykowanych rodzin) — UI pokazuje informację o fallbacku do canonical
 * BayTemplate.
 *
 * Pickerem rozdzielnic NIE wybieramy konkretnego modelu aparatu —
 * tylko rodzinę (np. "Rotoblok", "UniGear ZS1"). Krok 3 (`BayTemplatePicker`)
 * wybiera typ pola w wybranej rodzinie.
 */

import { clsx } from 'clsx';

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
 * JEDYNY predykat frontu „czy tę rodzinę wolno wybrać" — picker, kreator stacji, kreator pola
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
 * Powód, dla którego rodziny NIE wolno wybrać (albo `null`) — zdanie backendu z podstawą
 * i akcją naprawczą, nigdy cisza ani zdanie składane we froncie.
 */
export function powodBlokadyRodzinyPl(
  family: SwitchgearFamily,
  stanObiektu: StanObiektuPola | null = null,
): string | null {
  return stanObiektu === 'ISTNIEJACY' ? family.powod_blokady_pl : family.powod_blokady_nowych_pol_pl;
}

export interface SwitchgearFamilyPickerProps {
  readonly families: readonly SwitchgearFamily[];
  readonly manufacturerRef: string | null;
  readonly manufacturerRequiresCatalog: boolean;
  readonly selectedRef?: string | null;
  readonly onSelect: (familyRef: string | null) => void;
  readonly className?: string;
  /** Stan obiektu pola, dla którego wybierana jest rodzina; brak = pole nowe (projektowane). */
  readonly stanObiektu?: StanObiektuPola | null;
}

/**
 * Nazwy PL konstrukcji rodziny — JEDNO źródło dla pickera i dla nagłówka
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

/** Nazwy PL izolacji rodziny — JEDNO źródło frontu (picker, kreator stacji, karta pola). */
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

export function SwitchgearFamilyPicker({
  families,
  manufacturerRef,
  manufacturerRequiresCatalog,
  selectedRef,
  onSelect,
  className,
  stanObiektu = null,
}: SwitchgearFamilyPickerProps): JSX.Element {
  if (manufacturerRef === null) {
    return (
      <div
        className={clsx('rounded border border-gray-300 p-3 text-sm text-gray-600', className)}
        data-testid="switchgear-family-picker-no-manufacturer"
      >
        Najpierw wybierz producenta rozdzielnicy.
      </div>
    );
  }

  const doBudowania = families.filter((family) => czyRodzinaDoBudowania(family, stanObiektu));

  if (manufacturerRequiresCatalog || doBudowania.length === 0) {
    return (
      <div
        className={clsx(
          'rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900',
          className,
        )}
        data-testid="switchgear-family-picker-fallback"
        data-manufacturer-ref={manufacturerRef}
      >
        <span className="font-semibold">Brak zweryfikowanych rodzin rozdzielnic.</span>{' '}
        Producent <span className="font-mono">{manufacturerRef}</span> wymaga uzupełnienia
        katalogu. Pole zostanie zbudowane z szablonu kanonicznego ogólnego (rozwiązanie zapasowe)
        z badge ostrzegawczym.
      </div>
    );
  }

  return (
    <ul
      className={clsx('flex flex-col gap-2', className)}
      data-testid="switchgear-family-picker"
    >
      {families.map((family) => {
        const isSelected = family.switchgear_family_ref === selectedRef;
        const doWyboru = czyRodzinaDoBudowania(family, stanObiektu);
        const powodBlokady = powodBlokadyRodzinyPl(family, stanObiektu);
        return (
          <li key={family.switchgear_family_ref}>
            <button
              type="button"
              disabled={!doWyboru}
              title={powodBlokady ?? undefined}
              onClick={() => onSelect(family.switchgear_family_ref)}
              data-testid={`switchgear-family-picker-option-${family.switchgear_family_ref}`}
              data-selected={isSelected ? 'true' : 'false'}
              data-buildable={doWyboru ? 'true' : 'false'}
              className={clsx(
                'flex w-full flex-col items-start rounded border p-2 text-left transition-colors',
                !doWyboru
                  ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-70'
                  : isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{family.family_name}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                  {CONSTRUCTION_LABELS_PL[family.construction_type]}
                </span>
              </div>
              <span
                className="text-[11px] text-gray-500"
                data-testid={`switchgear-family-picker-medium-${family.switchgear_family_ref}`}
              >
                {opisMediumRodzinyPl(family)}
              </span>
              {family.series_name && (
                <span className="text-[11px] text-gray-500">Seria: {family.series_name}</span>
              )}
              {family.network_voltages_kv.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  Napięcia sieci: {family.network_voltages_kv.map((v) => `${v} kV`).join(', ')}
                </span>
              )}
              {family.um_classes_kv.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  Klasy urządzenia: {family.um_classes_kv.map((v) => `${v} kV`).join(', ')}
                </span>
              )}
              {powodBlokady && (
                <span
                  className="mt-1 text-[11px] font-medium text-amber-800"
                  data-testid={`switchgear-family-picker-blocked-${family.switchgear_family_ref}`}
                >
                  {powodBlokady}
                </span>
              )}
              {family.notes_pl && (
                <span className="mt-1 text-[11px] text-gray-600">{family.notes_pl}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
