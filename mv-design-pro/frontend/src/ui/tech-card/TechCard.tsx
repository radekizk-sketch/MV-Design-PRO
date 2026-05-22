/**
 * TechCard — zunifikowana karta techniczna obiektu sieci.
 *
 * Wrapper nad ObjectCard rozszerzający go o sekcję "Diagnostyka" pod flagą
 * VITE_DEV_DIAGNOSTICS=1. Domyślny widok nie pokazuje ref_id, hash, seg_ -
 * te trafiają do Diagnostyki dostępnej tylko w buildzie dev.
 *
 * Specjalizacje per typ elementu (GPZ, pole, stacja, ZKSN, słup, odcinek, DER,
 * transformator, switch, NN) używają TechCard zamiast ObjectCard.
 */

import { ObjectCard, type ObjectCardProps, type CardSection } from '../network-build/cards/ObjectCard';
import { DevDiagnosticsBlock } from './DevDiagnosticsBlock';
import { redactRawIds } from './redactor';

export interface TechCardProps extends Omit<ObjectCardProps, 'sections' | 'footer'> {
  sections: CardSection[];
  footer?: ObjectCardProps['footer'];
}

export function TechCard({ sections, footer, ...rest }: TechCardProps) {
  const redactedSections: CardSection[] = [];
  const allDiagnosticsFields = [];

  for (const section of sections) {
    const { visibleFields, diagnosticsFields } = redactRawIds(section.fields);
    if (visibleFields.length > 0) {
      redactedSections.push({ ...section, fields: visibleFields });
    }
    for (const field of diagnosticsFields) {
      allDiagnosticsFields.push(field);
    }
  }

  return (
    <ObjectCard
      {...rest}
      sections={redactedSections}
      footer={
        <>
          <DevDiagnosticsBlock fields={allDiagnosticsFields} />
          {footer}
        </>
      }
    />
  );
}
