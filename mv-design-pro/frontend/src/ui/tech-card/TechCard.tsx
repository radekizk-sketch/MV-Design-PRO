/**
 * TechCard — ujednolicony komponent karty technicznej obiektu projektowego.
 *
 * Buduje treść karty z `TechCardSubject` i deleguje renderowanie do
 * istniejącego `ObjectCard`. To pierwszy wspólny szkielet zastępujący
 * konkurujące inspektory/property-grid/karty kontekstowe w prawym panelu.
 *
 * Reguły:
 *  - Surowe identyfikatory (ref/seg/hash) trafiają wyłącznie do zwiniętej
 *    diagnostyki technicznej, nigdy do nagłówka.
 *  - Karta nie wykonuje fizyki, nie mutuje modelu i nie obsługuje obliczeń.
 *  - Akcje wystawiane są jako stabilne identyfikatory (komendy projektowe).
 */

import { useState } from 'react';
import { ObjectCard, type CardSection } from '../network-build/cards/ObjectCard';
import { publicTechnicalLabel } from '../shared/publicTechnicalLabels';
import type { TechCardSubject } from './types';

interface TechCardProps {
  readonly subject: TechCardSubject;
  readonly onClose: () => void;
}

const TECH_CARD_DIAGNOSTICS_SECTION_ID = 'tech-card-diagnostics';

export function TechCard({ subject, onClose }: TechCardProps) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const sections: CardSection[] = [...subject.sections];

  if (subject.readinessBlocker) {
    sections.unshift({
      id: 'tech-card-readiness',
      label: 'Gotowość obliczeniowa',
      fields: [
        {
          key: 'blocker',
          label: 'Blokada',
          value: subject.readinessBlocker,
          severity: 'warning',
        },
      ],
    });
  }

  if (subject.diagnostics && subject.diagnostics.length > 0 && diagnosticsOpen) {
    sections.push({
      id: TECH_CARD_DIAGNOSTICS_SECTION_ID,
      label: 'Diagnostyka techniczna',
      fields: subject.diagnostics.map((field) => ({
        ...field,
        value:
          typeof field.value === 'string'
            ? publicTechnicalLabel(field.value, field.value)
            : field.value,
      })),
    });
  }

  const showDiagnosticsToggle = (subject.diagnostics?.length ?? 0) > 0;

  return (
    <div
      className="flex flex-col h-full"
      data-testid="tech-card"
      data-tech-card-kind={subject.kind}
      data-tech-card-status={subject.status ?? 'none'}
    >
      <ObjectCard
        elementName={subject.displayName}
        elementType={subject.typeLabelPl}
        elementId=""
        statusDot={subject.status ?? 'none'}
        sections={sections}
        actions={subject.actions ? [...subject.actions] : undefined}
        onClose={onClose}
        footer={
          showDiagnosticsToggle ? (
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => setDiagnosticsOpen((open) => !open)}
                data-testid="tech-card-diagnostics-toggle"
                aria-expanded={diagnosticsOpen}
                className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-gray-800"
              >
                {diagnosticsOpen ? 'Ukryj diagnostykę techniczną' : 'Pokaż diagnostykę techniczną'}
              </button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
