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
 *
 * `przyczynaSerwera` (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN): serwer orzekł wynik
 * nieaktualnym przy tej samej rewizji modelu (zmiana wyboru zabezpieczeń przypadku albo
 * scenariusza nazwanego biegu). Znacznik jest wtedy nieaktualny, a etykieta niesie zdanie
 * przyczyny z serwera — UI go nie tłumaczy (werdykt wyjaśnialny, jedno źródło z powłoką).
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
  /** Zdanie przyczyny nieaktualności orzeczonej przez serwer (patrz nagłówek pliku). */
  przyczynaSerwera?: string;
  /** Pokaż znacznik również dla stanu aktualnego (domyślnie tak). */
  pokazAktualne?: boolean;
  testId?: string;
}

export function FreshnessBadge({
  rewizjaDanej,
  rewizjaModelu,
  onPrzelicz,
  przyczynaSerwera,
  pokazAktualne = true,
  testId,
}: FreshnessBadgeProps) {
  const zmianaRewizji = czyNieaktualne(rewizjaDanej, rewizjaModelu);
  const nieaktualne = zmianaRewizji || przyczynaSerwera !== undefined;

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
      data-mvd-fresh-zrodlo={zmianaRewizji ? 'rewizja' : 'werdykt-serwera'}
      data-testid={testId}
    >
      <span className="mvd-insp-fresh-dot" aria-hidden="true" />
      {zmianaRewizji ? znacznikNieaktualne(rewizjaDanej, rewizjaModelu) : INSPECTOR_STRINGS.nieaktualne}
      {przyczynaSerwera !== undefined && (
        <span className="mvd-insp-fresh-przyczyna" data-testid={testId ? `${testId}-przyczyna` : undefined}>
          {` — ${przyczynaSerwera}`}
        </span>
      )}
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
