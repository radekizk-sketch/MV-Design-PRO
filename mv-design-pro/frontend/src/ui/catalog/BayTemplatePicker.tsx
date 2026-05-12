/**
 * BayTemplatePicker — krok 3 wyboru kompletnego szablonu pola SN (goal §11A.5).
 *
 * Wybiera spośród listy `CompleteMvBayTemplate` z backendu
 * (`GET /api/catalog/complete-bay-templates?manufacturer_ref=...&bay_kind=...`).
 *
 * Wyświetla każdy szablon z badge `source_status`:
 * - `canonical_fallback` — szablon kanoniczny ogólny (fallback, nie producent),
 * - `official_catalog` / `repo_verified` — pełne dane producenta,
 * - `user_defined` — pozycja użytkownika,
 * - `requires_catalog` — niedopuszczone do użycia (placeholder).
 *
 * Operator widzi co dokładnie pochodzi z kanonu, a co z katalogu producenta.
 */

import { clsx } from 'clsx';

export type BayKind =
  | 'liniowe_doplywowe'
  | 'liniowe_odplywowe'
  | 'transformatorowe'
  | 'pomiarowe'
  | 'sprzeglowe_podluzne'
  | 'sprzeglowe_poprzeczne'
  | 'sekcyjne'
  | 'potrzeb_wlasnych'
  | 'odgromnikowe'
  | 'pv'
  | 'bess'
  | 'fw'
  | 'rezerwowe'
  | 'kablowe'
  | 'napowietrzne'
  | 'nop_lacznikowe';

export type BayTemplateSourceStatus =
  | 'official_catalog'
  | 'repo_verified'
  | 'user_defined'
  | 'canonical_fallback'
  | 'requires_catalog'
  | 'incomplete_requires_review';

export interface CompleteMvBayTemplateSummary {
  readonly template_ref: string;
  readonly manufacturer_ref: string | null;
  readonly switchgear_family_ref: string | null;
  readonly bay_kind: BayKind;
  readonly bay_role: 'IN' | 'OUT' | 'TR' | 'COUPLER' | 'FEEDER' | 'MEASUREMENT' | 'OZE';
  readonly source_status: BayTemplateSourceStatus;
  readonly source_refs: readonly string[];
  readonly version: string;
  readonly hash: string;
  readonly notes_pl: string | null;
}

export interface BayTemplatePickerProps {
  readonly templates: readonly CompleteMvBayTemplateSummary[];
  readonly bayKindFilter?: BayKind | null;
  readonly selectedRef?: string | null;
  readonly onSelect: (templateRef: string) => void;
  readonly className?: string;
}

const SOURCE_STATUS_BADGE: Record<BayTemplateSourceStatus, { class: string; label: string }> = {
  official_catalog: {
    class: 'bg-green-100 text-green-800 border-green-300',
    label: 'Oficjalny katalog producenta',
  },
  repo_verified: {
    class: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    label: 'Zweryfikowany w repozytorium',
  },
  user_defined: {
    class: 'bg-blue-100 text-blue-800 border-blue-300',
    label: 'Definicja użytkownika',
  },
  canonical_fallback: {
    class: 'bg-amber-100 text-amber-800 border-amber-300',
    label: 'Szablon kanoniczny ogólny (fallback)',
  },
  requires_catalog: {
    class: 'bg-red-100 text-red-800 border-red-300',
    label: 'Wymaga uzupełnienia katalogu',
  },
  incomplete_requires_review: {
    class: 'bg-red-100 text-red-800 border-red-300',
    label: 'Niekompletny — wymaga przeglądu',
  },
};

const BAY_KIND_LABELS_PL: Record<BayKind, string> = {
  liniowe_doplywowe: 'Pole liniowe wejściowe',
  liniowe_odplywowe: 'Pole liniowe wyjściowe',
  transformatorowe: 'Pole transformatorowe',
  pomiarowe: 'Pole pomiarowe',
  sprzeglowe_podluzne: 'Pole sprzęgłowe podłużne',
  sprzeglowe_poprzeczne: 'Pole sprzęgłowe poprzeczne',
  sekcyjne: 'Pole sekcyjne',
  potrzeb_wlasnych: 'Pole potrzeb własnych',
  odgromnikowe: 'Pole odgromnikowe',
  pv: 'Pole DER — PV',
  bess: 'Pole DER — BESS',
  fw: 'Pole DER — FW',
  rezerwowe: 'Pole rezerwowe',
  kablowe: 'Pole kablowe',
  napowietrzne: 'Pole napowietrzne',
  nop_lacznikowe: 'Pole łącznikowe NOP',
};

export function BayTemplatePicker({
  templates,
  bayKindFilter,
  selectedRef,
  onSelect,
  className,
}: BayTemplatePickerProps): JSX.Element {
  const filtered = bayKindFilter
    ? templates.filter((t) => t.bay_kind === bayKindFilter)
    : templates;

  if (filtered.length === 0) {
    return (
      <div
        className={clsx('rounded border border-gray-300 p-3 text-sm text-gray-600', className)}
        data-testid="bay-template-picker-empty"
      >
        Brak szablonów dla wybranego typu pola.
      </div>
    );
  }

  return (
    <ul
      className={clsx('flex flex-col gap-2', className)}
      data-testid="bay-template-picker"
    >
      {filtered.map((t) => {
        const isSelected = t.template_ref === selectedRef;
        const badge = SOURCE_STATUS_BADGE[t.source_status];
        const kindLabel = BAY_KIND_LABELS_PL[t.bay_kind];
        return (
          <li key={t.template_ref}>
            <button
              type="button"
              onClick={() => onSelect(t.template_ref)}
              data-testid={`bay-template-picker-option-${t.template_ref}`}
              data-source-status={t.source_status}
              data-bay-kind={t.bay_kind}
              data-selected={isSelected ? 'true' : 'false'}
              className={clsx(
                'flex w-full flex-col items-start rounded border p-2 text-left transition-colors',
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{kindLabel}</span>
                <span
                  className={clsx(
                    'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                    badge.class,
                  )}
                  data-testid={`bay-template-picker-badge-${t.template_ref}`}
                >
                  {badge.label}
                </span>
              </div>
              {t.manufacturer_ref && (
                <span className="text-[11px] text-gray-500">
                  Producent: <span className="font-mono">{t.manufacturer_ref}</span>
                </span>
              )}
              <span className="text-[11px] text-gray-500">
                Rola pola: <span className="font-mono">{t.bay_role}</span> · Wersja: {t.version}
              </span>
              {t.notes_pl && (
                <span className="mt-1 text-[11px] text-gray-600">{t.notes_pl}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
