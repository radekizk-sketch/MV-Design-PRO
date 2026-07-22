/**
 * PanelTeorii — standard „must-have" ramy kreatorów: kontekstowy, rozwijany panel
 * z wykładem teorii inżynierskiej dla danego kroku konfiguracji. Opcjonalnie mieści
 * wykres/schemat (dzieci) tam, gdzie istnieje charakterystyka. Czysta prezentacja:
 * treść dydaktyczna + wizualizacja specyfikacji — NIE wynik solvera (wyniki liczbowe
 * zawsze z backendu). Kolory wyłącznie przez tokeny --mvd-* (theme-aware light/dark);
 * deterministyczny (statyczny, bez animacji/losowości). Wzorzec: panel NC RfG (G-OZE-B5).
 *
 * Kontrakt (V12K-066): każdy krok konfiguracji kreatora ui2 udostępnia PanelTeorii
 * (po co / z czego / co daje + norma/wymóg + podstawa), aby projektant rozumiał, co i
 * dlaczego ustawia. Rozwinięty na żądanie (nie przytłacza ekranu prowadzącego).
 *
 * Zasada wywodów KaTeX (2026-07-22): fragmenty `$...$` w `opis`/`wymog` renderują
 * się przez KaTeX (TekstZWzorami → MathInline) — surowe wzory tekstowe są zakazane.
 */

import type { ReactNode } from 'react';
import './panelTeorii.css';
import { TekstZWzorami } from './tekstZWzorami';

export interface PanelTeoriiProps {
  /** Tytuł panelu (widoczny w nagłówku rozwijanym). */
  tytul: string;
  /** Główny wykład teorii — po co, jak działa, jak czytać. */
  opis: string;
  /** Wymóg normatywny / dobra praktyka (wyróżniony blok). */
  wymog?: string;
  /** Prefiks bloku wymogu (np. „Wymóg NC RfG: "). Domyślnie ogólny. */
  wymogPrefix?: string;
  /** Podstawa (norma / rozporządzenie / źródło) — przypis. */
  podstawa?: string;
  /** Rozwinięty domyślnie (np. gdy krok jest kluczowy). */
  domyslnieOtwarty?: boolean;
  /** Wykres / schemat / dodatkowe figury (opcjonalne). */
  children?: ReactNode;
  testid?: string;
}

/** Prefiks bloku wymogu — stała UI (spójny język w całej ramie). */
export const PANEL_TEORII_WYMOG_PREFIX = 'Wymóg / dobra praktyka: ';

/** Standardowy panel teorii kroku kreatora (rozwijany). */
export function PanelTeorii({
  tytul,
  opis,
  wymog,
  wymogPrefix = PANEL_TEORII_WYMOG_PREFIX,
  podstawa,
  domyslnieOtwarty = false,
  children,
  testid,
}: PanelTeoriiProps) {
  return (
    <details className="mvd-teoria" data-testid={testid} open={domyslnieOtwarty || undefined}>
      <summary className="mvd-teoria-summary">{tytul}</summary>
      <div className="mvd-teoria-body">
        <p className="mvd-teoria-opis">
          <TekstZWzorami tekst={opis} />
        </p>
        {children}
        {wymog ? (
          <p className="mvd-teoria-wymog">
            <strong>{wymogPrefix}</strong>
            <TekstZWzorami tekst={wymog} />
          </p>
        ) : null}
        {podstawa ? <p className="mvd-teoria-podstawa">{podstawa}</p> : null}
      </div>
    </details>
  );
}
