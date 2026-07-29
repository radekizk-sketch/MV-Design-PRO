/*
 * SladWywodu — WSPÓLNY komponent śladu obliczeń (WHITE BOX) na żądanie
 * (zasada właściciela 2026-07-22: „wzory renderowane KaTeX — zapisz jako
 * zasadę; ślad obliczeń wszędzie, dostępny na żądanie/klik, bez przeładowania
 * ekranu"). Kroki wywodu przychodzą Z BACKENDU jako `{tekst, latex}` —
 * komponent WYŁĄCZNIE renderuje: krok z `latex` przez KaTeX (`MathBlock`,
 * fail-safe fallback do tekstu), krok tekstowy monospace. ZERO fizyki,
 * ZERO arytmetyki w UI.
 *
 * Wzorzec interakcji: zwinięty przycisk „Pokaż ślad obliczeń" → rozwinięta
 * lista numerowana (jak ślady okna „Jakość wyników", R2-A/R3-D).
 */

import { useState } from 'react';
import { MathBlock } from '../../../ui/proof/MathRenderer';
import { WZORZEC_STRINGS } from './strings';

/** Krok wywodu z backendu: tekst zawsze, latex dla kroków ze wzorem. */
export interface KrokWywodu {
  readonly tekst: string;
  readonly latex: string | null;
}

export interface SladWywoduProps {
  /** Kroki wywodu (z backendu). Pusta lista → komponent nie renderuje się. */
  kroki: readonly KrokWywodu[];
  /** Prefiks `data-testid` (np. „mvd-zwarcia-wklady-slad"). */
  testIdPrefix: string;
}

export function SladWywodu({ kroki, testIdPrefix }: SladWywoduProps) {
  const [widoczny, setWidoczny] = useState(false);
  if (kroki.length === 0) return null;
  return (
    <div className="mvd-wyn-slad-blok">
      <button
        type="button"
        className="mvd-wyn-slad-btn"
        aria-expanded={widoczny}
        data-testid={`${testIdPrefix}-btn`}
        onClick={() => setWidoczny((w) => !w)}
      >
        {widoczny ? WZORZEC_STRINGS.sladUkryj : WZORZEC_STRINGS.sladPokaz}
      </button>
      {widoczny && (
        <div>
          <span className="mvd-wyn-slad-tytul">{WZORZEC_STRINGS.sladTytul}</span>
          <ol className="mvd-wyn-slad" data-testid={testIdPrefix}>
            {kroki.map((krok) => (
              <li key={krok.tekst} className="mvd-wyn-slad-krok">
                {krok.latex ? (
                  <MathBlock latex={krok.latex} />
                ) : (
                  <code className="mvd-num">{krok.tekst}</code>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
