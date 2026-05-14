/**
 * ProofPacksPanel — Iter 10 (per Whitebox audit blocker iter 5: 4/10 NO-GO):
 * "Brak widocznych CTA dla 8 proof packs (Sprawdź braki/Nakładka/Analizy/
 *  Eksport nieobecne)... 8 proof packs jest na dysku ale UI nie ma jak ich
 *  osiągnąć"
 *
 * Pure presentational komponent pokazujący 8 proof packs (per V12.xx canon)
 * ze stanem availability per typ (dostępne / wymaga obliczenia / zablokowane).
 *
 * INVARIANTS:
 * - Pure component (zero model mutation, zero physics)
 * - Polski 100%, zero codename'ów
 * - 8 packs hard-coded (canonical V12.xx list)
 * - Deterministic ordering
 */

import { useMemo } from 'react';

export type ProofPackStatus = 'available' | 'requires_calculation' | 'blocked';

export interface ProofPackInfo {
  readonly id: string;
  readonly labelPl: string;
  readonly description: string;
  readonly status: ProofPackStatus;
  readonly blockedReason?: string;
}

/**
 * 8 kanonicznych proof packs per V12.xx + docs/v12xx/KANON_V12_XX.md:
 *   SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage
 */
export const CANONICAL_PROOF_PACKS: readonly Omit<ProofPackInfo, 'status' | 'blockedReason'>[] = [
  {
    id: 'sc_3f',
    labelPl: 'Zwarcie 3-fazowe (SC3F)',
    description: 'IEC 60909 — prądy zwarcia trójfazowego',
  },
  {
    id: 'vdrop',
    labelPl: 'Spadek napięcia (VDROP)',
    description: 'Spadki napięcia po trasach SN/nN',
  },
  {
    id: 'equipment',
    labelPl: 'Wytrzymałość aparatury',
    description: 'I_dyn, I_th — wytrzymałość cieplna i dynamiczna',
  },
  {
    id: 'power_flow',
    labelPl: 'Rozpływ mocy (PF)',
    description: 'Newton-Raphson / Gauss-Seidel / Fast Decoupled',
  },
  {
    id: 'losses',
    labelPl: 'Straty energii',
    description: 'Bilans strat na liniach i transformatorach',
  },
  {
    id: 'protection',
    labelPl: 'Zabezpieczenia (Protection)',
    description: 'IEC 60255 IDMT — koordynacja zabezpieczeń',
  },
  {
    id: 'earthing',
    labelPl: 'Zwarcie ziemne SN',
    description: 'Earthing ground fault na sieci średniego napięcia',
  },
  {
    id: 'lf_voltage',
    labelPl: 'Profile napięciowe (LF Voltage)',
    description: 'Profile napięcia po obciążeniu LF',
  },
] as const;

export interface ProofPacksPanelProps {
  /** Czy model sieci jest obecny (ENM ma busy). */
  readonly hasNetworkModel: boolean;
  /** Optional callback gdy użytkownik kliknie pack ID. */
  readonly onSelectPack?: (packId: string) => void;
  /** Opcjonalny className zewnętrzny. */
  readonly className?: string;
}

/**
 * Panel 8 proof packs — Whitebox audit blocker resolution.
 *
 * Pokazuje listę dostępnych dowodów + status (dostępny / wymaga obliczenia /
 * zablokowany). Bez modelu wszystkie blocked.
 */
export function ProofPacksPanel({
  hasNetworkModel,
  onSelectPack,
  className,
}: ProofPacksPanelProps) {
  const packs = useMemo<ProofPackInfo[]>(
    () =>
      CANONICAL_PROOF_PACKS.map((pack) => ({
        ...pack,
        status: hasNetworkModel ? 'requires_calculation' : 'blocked',
        blockedReason: hasNetworkModel
          ? undefined
          : 'Wymaga modelu sieci (dodaj GPZ)',
      })),
    [hasNetworkModel],
  );

  return (
    <section
      className={[
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-panel/95 p-2 text-[11px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Panel dowodów inżynierskich (8 pakietów uzasadnień)"
      data-testid="sld-proof-packs-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-scada-border pb-1">
        <span className="font-semibold uppercase tracking-wider text-scada-muted">
          Dowody inżynierskie ({CANONICAL_PROOF_PACKS.length})
        </span>
      </header>

      <ul className="flex flex-col gap-px">
        {packs.map((pack) => {
          const isBlocked = pack.status === 'blocked';
          return (
            <li key={pack.id}>
              <button
                type="button"
                onClick={() => {
                  if (!isBlocked) onSelectPack?.(pack.id);
                }}
                disabled={isBlocked}
                title={pack.blockedReason ?? pack.description}
                aria-label={`${pack.labelPl} — ${pack.description}`}
                data-testid={`sld-proof-pack-${pack.id}`}
                className={[
                  'flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left',
                  pack.status === 'blocked'
                    ? 'cursor-not-allowed text-scada-muted opacity-60'
                    : pack.status === 'requires_calculation'
                      ? 'cursor-pointer text-amber-200 hover:bg-scada-hover-nav'
                      : 'cursor-pointer text-emerald-300 hover:bg-scada-hover-nav',
                ].join(' ')}
              >
                <span>{pack.labelPl}</span>
                <span
                  className="font-mono-eng text-[9px] uppercase tracking-wider"
                  aria-hidden="true"
                >
                  {pack.status === 'available'
                    ? 'gotowy'
                    : pack.status === 'requires_calculation'
                      ? 'wymaga'
                      : '—'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
