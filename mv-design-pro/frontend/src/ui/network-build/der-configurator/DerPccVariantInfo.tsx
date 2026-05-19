/**
 * DerPccVariantInfo - informacja o wybranym wariancie przyłączenia DER (PCC).
 *
 * Komponent prezentacyjny dla goal §13: pokazuje wariant katalogowy
 * `GeneratorConnectionVariant` z polskimi opisami i wymaganymi powiązaniami.
 * Operator widzi, czy aktualny wariant ma wskazaną stację lub transformator
 * blokowy zgodnie z wariantem katalogowym.
 *
 * Reguła architektoniczna: komponent nie jest walidatorem. Walidacja pozostaje
 * w backendzie i ENMValidator. Tutaj pokazujemy stan konfiguracji przyłączenia.
 */

import { clsx } from 'clsx';

import type { GeneratorConnectionVariant } from '../../../types/enm';

export interface DerPccVariantInfoProps {
  /** Aktualny wariant; null oznacza, że operator nie wybrał wariantu PCC. */
  readonly connectionVariant: GeneratorConnectionVariant | null;
  /** Identyfikator stacji wymagany dla przyłączenia po stronie nN. */
  readonly stationRef: string | null;
  /** Identyfikator transformatora blokowego wymagany dla wariantu blokowego. */
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
      + 'Wybierz stację, która wyznacza punkt przyłączenia.',
    required_refs: ['station_ref'],
  },
  {
    variant: 'LV_BEHIND_STATION_TRANSFORMER',
    title_pl: 'Po stronie nN za transformatorem stacji',
    description_pl:
      'PV/BESS/FW pracuje po stronie nN za transformatorem stacji. '
      + 'Wybierz stację, która wyznacza tor przyłączenia.',
    required_refs: ['station_ref'],
  },
  {
    variant: 'block_transformer',
    title_pl: 'Przez transformator blokowy',
    description_pl:
      'Falownik/PCS przyłączony do szyny SN przez dedykowany transformator '
      + 'blokowy. Wybierz transformator blokowy i pole SN przyłączenia.',
    required_refs: ['blocking_transformer_ref'],
  },
  {
    variant: 'DEDICATED_MV_CONNECTION',
    title_pl: 'Dedykowane pole SN',
    description_pl:
      'Generator przyłączony przez dedykowane pole SN z własnym torem '
      + 'pomiarowo-zabezpieczeniowym. Wariant katalogowy zawiera wymagane powiązania.',
    required_refs: [],
  },
  {
    variant: 'SOURCE_CONNECTION_STATION',
    title_pl: 'Osobna stacja przyłączeniowa',
    description_pl:
      'Generator z osobną stacją przyłączeniową źródła i rozdzielnią abonencką.',
    required_refs: [],
  },
];

function isVariantComplete(
  spec: VariantSpec,
  stationRef: string | null,
  transformerRef: string | null,
): boolean {
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

function requirementLabel(req: VariantSpec['required_refs'][number]): string {
  if (req === 'station_ref') return 'Stacja przyłączenia';
  return 'Transformator blokowy';
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
          'rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900',
          className,
        )}
        data-testid="der-pcc-variant-info-missing"
      >
        <span className="font-semibold">Wybierz wariant przyłączenia PCC.</span>{' '}
        Każde źródło PV/BESS/FW jest zapisywane jako gotowy wariant katalogowy
        z punktem przyłączenia, pomiarem i wymaganym torem zabezpieczeniowym.
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
        Wariant przyłączenia nie jest obsługiwany przez katalog źródeł.
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
          {isComplete ? 'Skonfigurowany' : 'Do konfiguracji'}
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
                <span>{requirementLabel(req)}</span>
                <span className="text-gray-500">
                  {present ? '→ wybrano w układzie' : '→ wybierz w konfiguracji DER'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
