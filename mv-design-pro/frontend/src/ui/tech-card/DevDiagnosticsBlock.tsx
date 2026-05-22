/**
 * DevDiagnosticsBlock — sekcja "Diagnostyka" w TechCard.
 *
 * Renderowana tylko gdy VITE_DEV_DIAGNOSTICS=1.
 * Pokazuje ref_id, content_hash, raw IDs - dane diagnostyczne ukryte przed
 * użytkownikiem końcowym, dostępne dla developera w trybie diagnostycznym.
 */

import type { CardField } from '../network-build/cards/ObjectCard';
import { isDiagnosticsEnabled } from './redactor';

interface DevDiagnosticsBlockProps {
  fields: CardField[];
}

export function DevDiagnosticsBlock({ fields }: DevDiagnosticsBlockProps) {
  if (!isDiagnosticsEnabled()) return null;
  if (fields.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50/30" data-testid="dev-diagnostics-block">
      <div className="px-4 py-2">
        <h4 className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
          Diagnostyka (dev)
        </h4>
        <div className="space-y-1">
          {fields.map((field, index) => (
            <div key={`${field.key}:${index}`} className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-amber-700 flex-shrink-0 font-mono">{field.key}</span>
              <span
                className="text-[11px] font-mono text-right truncate max-w-[55%] text-amber-900"
                title={String(field.value ?? '—')}
              >
                {String(field.value ?? '—')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
