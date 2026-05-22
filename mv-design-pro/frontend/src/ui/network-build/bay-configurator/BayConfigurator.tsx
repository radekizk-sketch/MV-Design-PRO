/**
 * BayConfigurator — konfigurator pola SN z 8 sekcjami (PR-8b, brief 2 §9).
 *
 * 8 sekcji: Dane podstawowe / Aparatura pierwotna / Przekładniki / Zabezpieczenia /
 * Pomiary / Połączenia (porty) / Podgląd SLD / Obliczenia.
 *
 * 6 reguł walidacji per typ pola (brief §9):
 *  1. Pole liniowe wymaga wyprowadzenia kabla/linii (lub status "rezerwowe")
 *  2. Pole transformatorowe wymaga połączenia z transformatorem
 *  3. Pole DER wymaga określonego punktu przyłączenia
 *  4. Pole pomiarowe NIE udaje liniowego (zakaz portu odpływu)
 *  5. Pole sprzęgłowe wymaga 2 sekcji szyn
 *  6. Pole rezerwowe NIE może mieć aktywnego odcinka
 */

import { useMemo, useState } from 'react';

import { validateBay, type BayValidationContext, type BayValidationResult } from './bayValidation';

export type BayConfigSectionId =
  | 'basic'
  | 'primary-equipment'
  | 'instrument-transformers'
  | 'protection'
  | 'measurements'
  | 'connections'
  | 'sld-preview'
  | 'calculations';

const SECTION_LABELS: Record<BayConfigSectionId, string> = {
  basic: 'Dane podstawowe',
  'primary-equipment': 'Aparatura pierwotna',
  'instrument-transformers': 'Przekładniki',
  protection: 'Zabezpieczenia',
  measurements: 'Pomiary',
  connections: 'Połączenia (porty)',
  'sld-preview': 'Podgląd SLD',
  calculations: 'Obliczenia',
};

export interface BayConfiguratorProps {
  readonly bayId: string;
  readonly designation: string;
  readonly bayContext: BayValidationContext;
  readonly defaultSection?: BayConfigSectionId;
  readonly children?: Partial<Record<BayConfigSectionId, React.ReactNode>>;
}

export function BayConfigurator(props: BayConfiguratorProps): JSX.Element {
  const { bayId, designation, bayContext, defaultSection = 'basic', children = {} } = props;
  const [activeSection, setActiveSection] = useState<BayConfigSectionId>(defaultSection);

  const validation: BayValidationResult = useMemo(
    () => validateBay(bayContext),
    [bayContext],
  );

  return (
    <div data-testid={`bay-configurator-${bayId}`} className="flex h-full flex-col bg-scada-panel">
      {/* Header z designation + status walidacji */}
      <div className="shrink-0 border-b border-scada-border bg-scada-surface px-3 py-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-scada-text">{designation}</h3>
          <span data-testid="bay-validation-status" className={
            validation.valid
              ? 'text-xs text-status-ok'
              : 'text-xs text-status-error'
          }>
            {validation.valid ? '✓ pole zgodne z regułami' : `${validation.errors.length} błędów`}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav role="tablist" className="flex shrink-0 overflow-x-auto border-b border-scada-border bg-scada-surface">
        {(Object.keys(SECTION_LABELS) as BayConfigSectionId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-testid={`bay-section-tab-${id}`}
            data-active={activeSection === id}
            aria-selected={activeSection === id}
            onClick={() => setActiveSection(id)}
            className={
              'whitespace-nowrap px-2 py-1.5 text-[10px] font-medium transition-colors '
              + (activeSection === id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {SECTION_LABELS[id]}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div data-testid={`bay-section-content-${activeSection}`} className="flex-1 overflow-y-auto p-3 text-xs">
        {children[activeSection] ?? (
          <div className="italic text-scada-muted">Zakres sekcji "{SECTION_LABELS[activeSection]}" zostanie pokazany po wyborze wariantu pola.</div>
        )}
      </div>

      {/* Validation errors banner — zawsze widoczny przy błędach */}
      {!validation.valid && (
        <div data-testid="bay-validation-errors" className="shrink-0 border-t border-scada-border bg-scada-bg p-2">
          <div className="text-[10px] font-medium text-status-error">
            Naruszenia reguł pola ({validation.errors.length}):
          </div>
          <ul className="mt-1 list-disc pl-4 text-[11px]">
            {validation.errors.map((err) => (
              <li key={err.ruleId} data-testid={`bay-error-${err.ruleId}`} className="text-status-error">
                <span className="font-medium">[{err.ruleId}]</span> {err.descriptionPl}
                {err.fixActionPl && (
                  <span className="ml-1 text-scada-muted">→ {err.fixActionPl}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
