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

export interface SwitchgearFamily {
  readonly switchgear_family_ref: string;
  readonly manufacturer_ref: string;
  readonly family_name: string;
  readonly series_name: string | null;
  readonly voltage_levels: readonly number[];
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

export interface SwitchgearFamilyPickerProps {
  readonly families: readonly SwitchgearFamily[];
  readonly manufacturerRef: string | null;
  readonly manufacturerRequiresCatalog: boolean;
  readonly selectedRef?: string | null;
  readonly onSelect: (familyRef: string | null) => void;
  readonly className?: string;
}

const CONSTRUCTION_LABELS_PL: Record<SwitchgearFamily['construction_type'], string> = {
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

  if (manufacturerRequiresCatalog || families.length === 0) {
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
        return (
          <li key={family.switchgear_family_ref}>
            <button
              type="button"
              onClick={() => onSelect(family.switchgear_family_ref)}
              data-testid={`switchgear-family-picker-option-${family.switchgear_family_ref}`}
              data-selected={isSelected ? 'true' : 'false'}
              className={clsx(
                'flex w-full flex-col items-start rounded border p-2 text-left transition-colors',
                isSelected
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
              {family.voltage_levels.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  Napięcia: {family.voltage_levels.map((v) => `${v} kV`).join(', ')}
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
