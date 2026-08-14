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
const STATUSY_DO_BUDOWANIA: ReadonlySet<SwitchgearFamily['status']> = new Set([
  'verified',
  'repo_verified',
  'user_defined',
]);

export function czyRodzinaDoBudowania(family: SwitchgearFamily): boolean {
  return STATUSY_DO_BUDOWANIA.has(family.status);
}

const POWOD_BLOKADY_PL: Partial<Record<SwitchgearFamily['status'], string>> = {
  requires_catalog: 'Wymaga karty katalogowej producenta — brak potwierdzonych klas znamionowych.',
  deprecated: 'Rodzina wycofana z oferty producenta.',
};

export interface SwitchgearFamilyPickerProps {
  readonly families: readonly SwitchgearFamily[];
  readonly manufacturerRef: string | null;
  readonly manufacturerRequiresCatalog: boolean;
  readonly selectedRef?: string | null;
  readonly onSelect: (familyRef: string | null) => void;
  readonly className?: string;
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
  GIS_SF6: 'GIS / SF₆',
  wnetrzowa: 'Wnętrzowa',
  kontenerowa: 'Kontenerowa',
  prefabrykowana: 'Prefabrykowana',
  unknown: 'Nieznana konstrukcja',
};

export function SwitchgearFamilyPicker({
  families,
  manufacturerRef,
  manufacturerRequiresCatalog,
  selectedRef,
  onSelect,
  className,
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

  const doBudowania = families.filter(czyRodzinaDoBudowania);

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
        const doWyboru = czyRodzinaDoBudowania(family);
        const powodBlokady = doWyboru ? null : (POWOD_BLOKADY_PL[family.status] ?? null);
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
