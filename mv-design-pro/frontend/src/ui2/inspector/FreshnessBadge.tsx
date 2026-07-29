/*
 * FreshnessBadge — JEDYNY współdzielony komponent znacznika świeżości
 * (kontrakt SPEC_POWIAZANIA §6.2: „komponent znacznika »nieaktualne«; jeden,
 * współdzielony; zakaz lokalnych wariantów"). Zaprojektowany do reużycia przez
 * inne okna (wyniki, nakładki, porównania, raporty) — dlatego bez zależności od
 * kontekstu inspektora, w pełni sterowany propsami.
 *
 * Kontrakt: dana pochodna niesie `rewizjaDanej`; porównana z bieżącą `rewizjaModelu`
 * daje stan aktualny/nieaktualny. Nieaktualność = etykieta „nieaktualne (rew. a → b)"
 * + opcjonalna akcja „Przelicz". Stan aktualny = dyskretny znacznik „aktualne".
 */

import { czyNieaktualne } from './inspectorModel';
import { INSPECTOR_STRINGS, znacznikNieaktualne } from './strings';

interface FreshnessBadgeProps {
  /** Rewizja modelu, z której powstała dana pochodna. */
  rewizjaDanej: number;
  /** Bieżąca rewizja modelu. */
  rewizjaModelu: number;
  /** Akcja przeliczenia (pokazywana tylko gdy nieaktualne i podana). */
  onPrzelicz?: () => void;
  /** Pokaż znacznik również dla stanu aktualnego (domyślnie tak). */
  pokazAktualne?: boolean;
  testId?: string;
}

export function FreshnessBadge({
  rewizjaDanej,
  rewizjaModelu,
  onPrzelicz,
  pokazAktualne = true,
  testId,
}: FreshnessBadgeProps) {
  const nieaktualne = czyNieaktualne(rewizjaDanej, rewizjaModelu);

  if (!nieaktualne) {
    if (!pokazAktualne) return null;
    return (
      <span
        className="mvd-insp-fresh mvd-insp-fresh-ok"
        data-mvd-fresh="ok"
        data-testid={testId}
      >
        <span className="mvd-insp-fresh-dot" aria-hidden="true" />
        {INSPECTOR_STRINGS.aktualne}
      </span>
    );
  }

  return (
    <span
      className="mvd-insp-fresh mvd-insp-fresh-stale"
      role="status"
      data-mvd-fresh="stale"
      data-testid={testId}
    >
      <span className="mvd-insp-fresh-dot" aria-hidden="true" />
      {znacznikNieaktualne(rewizjaDanej, rewizjaModelu)}
      {onPrzelicz && (
        <button
          type="button"
          className="mvd-btn mvd-insp-fresh-recalc"
          onClick={onPrzelicz}
          data-mvd-action="przelicz"
        >
          {INSPECTOR_STRINGS.przelicz}
        </button>
      )}
    </span>
  );
}
