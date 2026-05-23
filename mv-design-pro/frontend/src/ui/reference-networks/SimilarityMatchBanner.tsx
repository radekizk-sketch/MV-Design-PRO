/**
 * SimilarityMatchBanner — banner pokazywany gdy user network przypomina
 * znaną sieć referencyjną z confidence ≥ 70%.
 *
 * Feature-flagged przez VITE_FEATURE_REALTIME_REF_MATCH.
 */

import { useEffect, useState } from 'react';
import { similarityMatch } from './api';
import type { SimilarityMatchScore } from './types';

const CONFIDENCE_THRESHOLD = 70.0;
const DEBOUNCE_MS = 2000;

interface SimilarityMatchBannerProps {
  /** Snapshot z aktualnym ENM-em użytkownika - lekkie features do match. */
  userNetwork: {
    bus_count: number;
    branch_count: number;
    voltage_kv_levels: number[];
    has_der: boolean;
    is_unbalanced?: boolean;
  } | null;
  /** Callback when user clicks "Otwórz walidację" - przekazuje network_id. */
  onOpenValidation?: (networkId: string) => void;
  /** Callback close. */
  onDismiss?: () => void;
}

export function SimilarityMatchBanner({
  userNetwork,
  onOpenValidation,
  onDismiss,
}: SimilarityMatchBannerProps): JSX.Element | null {
  const [topMatch, setTopMatch] = useState<SimilarityMatchScore | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Debounced similarity check
  useEffect(() => {
    if (!userNetwork || isDismissed) {
      setTopMatch(null);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const response = await similarityMatch(userNetwork);
        if (response.matches.length > 0 && response.matches[0].confidence_pct >= CONFIDENCE_THRESHOLD) {
          setTopMatch(response.matches[0]);
        } else {
          setTopMatch(null);
        }
      } catch {
        setTopMatch(null);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [userNetwork, isDismissed]);

  if (!topMatch || isDismissed) return null;

  return (
    <div
      data-testid="similarity-match-banner"
      className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs"
    >
      <span className="text-amber-300">⚡</span>
      <div className="flex-1">
        <span className="text-amber-200">
          Sieć przypomina <strong>{topMatch.name_pl}</strong> (
          {topMatch.confidence_pct.toFixed(1)}% match)
        </span>
        {topMatch.matched_features.length > 0 && (
          <span className="ml-2 text-amber-300/70">
            ({topMatch.matched_features.slice(0, 3).join(', ')})
          </span>
        )}
      </div>
      <button
        type="button"
        data-testid="similarity-banner-validate"
        onClick={() => onOpenValidation?.(topMatch.network_id)}
        className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
      >
        Sprawdź walidację
      </button>
      <button
        type="button"
        data-testid="similarity-banner-dismiss"
        onClick={() => {
          setIsDismissed(true);
          onDismiss?.();
        }}
        className="rounded border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20"
      >
        Zamknij
      </button>
    </div>
  );
}
