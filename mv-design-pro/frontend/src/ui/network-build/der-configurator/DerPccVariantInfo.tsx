/**
 * DerPccVariantInfo — informacja o wybranym wariancie przyłączenia DER (PCC).
 *
 * Komponent prezentacyjny dla goal §13: pokazuje 5 możliwych wariantów
 * `GeneratorConnectionVariant` z polskimi opisami i wymaganymi referencjami.
 * Operator widzi czy aktualny wariant jest kompletny (`station_ref` /
 * `blocking_transformer_ref` ustawione zgodnie z wariantem).
 *
 * Reguła architektoniczna: komponent NIE walidator (walidacja jest w backend
 * ENMValidator E028/E029 + readiness blocker `generator.*_missing`). Tutaj
 * tylko **prezentacja** wymagań i stanu kompletności per wariant.
 */

import { clsx } from 'clsx';

import type { GeneratorConnectionVariant } from '../../../types/enm';

export interface DerPccVariantInfoProps {
  /** Aktualny wariant; null → operator nie wybrał wariantu (blocker E028). */
  readonly connectionVariant: GeneratorConnectionVariant | null;
  /** Referencja stacji (wymagana dla nn_side / LV_BEHIND_STATION_TRANSFORMER). */
  readonly stationRef: string | null;
  /** Referencja transformatora blokowego (wymagana dla block_transformer). */
  readonly blockingTransformerRef: string | null;
  readonly className?: string;
}

interface VariantSpec {
  readonly variant: GeneratorConnectionVariant;
  readonly title_pl: string;
  readonly description_pl: string;
  readonly required_refs: readonly ('station_ref' | 'blocking_transformer_ref')[];
}

const VARIANT_SPECS: readonly VariantSpec[] = [
  {
    variant: 'nn_side',
    title_pl: 'Po stronie nN stacji SN/nN',
    description_pl:
      'Falownik/PCS przyłączony do szyny nN za transformatorem stacji. '
      + 'Wymaga referencji stacji (station_ref).',
    required_refs: ['station_ref'],
  },
  {
    variant: 'LV_BEHIND_STATION_TRANSFORMER',
    title_pl: 'Za transformatorem stacji (legacy)',
    description_pl:
      'Wariant historyczny: PV/BESS po stronie nN za transformatorem stacji. '
      + 'Wymaga station_ref.',
    required_refs: ['station_ref'],
  },
  {
    variant: 'block_transformer',
    title_pl: 'Przez transformator blokowy',
    description_pl:
      'Falownik/PCS przyłączony do szyny SN przez dedykowany transformator '
      + 'blokowy. Wymaga referencji transformatora (blocking_transformer_ref).',
    required_refs: ['blocking_transformer_ref'],
  },
  {
    variant: 'DEDICATED_MV_CONNECTION',
    title_pl: 'Dedykowane pole SN',
    description_pl:
      'Generator przyłączony przez dedykowane pole SN z własnym torem '
      + 'pomiarowo-zabezpieczeniowym. Bez wymaganych dodatkowych referencji.',
    required_refs: [],
  },
  {
    variant: 'SOURCE_CONNECTION_STATION',
    title_pl: 'Osobna stacja przyłączeniowa',
    description_pl:
      'Generator z osobną stacją przyłączeniową źródła (rozdzielnia abonencka).',
    required_refs: [],
  },
];

function isVariantComplete(spec: VariantSpec, stationRef: string | null, transformerRef: string | null): boolean {
  for (const required of spec.required_refs) {
    if (required === 'station_ref' && !stationRef) {
      return false;
    }
    if (required === 'blocking_transformer_ref' && !transformerRef) {
      return false;
    }
  }
  return true;
}

export function DerPccVariantInfo({
  connectionVariant,
  stationRef,
  blockingTransformerRef,
  className,
}: DerPccVariantInfoProps): JSX.Element {
  if (connectionVariant === null) {
    return (
      <div
        className={clsx(
          'rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900',
          className,
        )}
        data-testid="der-pcc-variant-info-missing"
      >
        <span className="font-semibold">Brak wybranego wariantu przyłączenia (PCC).</span>{' '}
        Każdy falownik (PV/BESS/FW) wymaga jawnego `connection_variant` — bez tego
        SLD nie wie jak narysować drzewo połączeń. Readiness blocker:{' '}
        <span className="font-mono">generator.connection_variant_missing</span>.
      </div>
    );
  }

  const spec = VARIANT_SPECS.find((s) => s.variant === connectionVariant);
  if (!spec) {
    return (
      <div
        className={clsx(
          'rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900',
          className,
        )}
        data-testid="der-pcc-variant-info-unknown"
      >
        Nieznany wariant przyłączenia: <span className="font-mono">{connectionVariant}</span>.
      </div>
    );
  }

  const isComplete = isVariantComplete(spec, stationRef, blockingTransformerRef);

  return (
    <div
      className={clsx(
        'rounded border p-3 text-sm',
        isComplete ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50',
        className,
      )}
      data-testid="der-pcc-variant-info"
      data-variant={connectionVariant}
      data-complete={isComplete ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{spec.title_pl}</span>
        <span
          className={clsx(
            'rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase',
            isComplete
              ? 'border-green-400 bg-green-100 text-green-800'
              : 'border-amber-400 bg-amber-100 text-amber-900',
          )}
        >
          {isComplete ? 'Kompletny' : 'Brakuje referencji'}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-gray-700">{spec.description_pl}</p>
      {spec.required_refs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[11px]">
          {spec.required_refs.map((req) => {
            const value = req === 'station_ref' ? stationRef : blockingTransformerRef;
            const present = Boolean(value);
            return (
              <li
                key={req}
                className="flex items-center gap-1"
                data-testid={`der-pcc-variant-info-req-${req}`}
                data-present={present ? 'true' : 'false'}
              >
                <span
                  className={clsx(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    present ? 'bg-green-600' : 'bg-amber-600',
                  )}
                />
                <span className="font-mono">{req}</span>
                <span className="text-gray-500">
                  {present ? `→ ${value}` : '(wymagana — uzupełnij w karcie DER)'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
