/*
 * Dialog potwierdzenia operacji nieodwracalnej lub zmieniającej kontekst
 * (karta KD-1, luki L-2 i L-5). W pełni sterowany propsami — zero API, zero
 * store'ów. Markup i klasy jak w istniejącym dialogu W-501
 * (`spaces/obliczenia/NowyPrzypadek.tsx`) — reużycie zamiast drugiej stylistyki.
 *
 * Gramatyka MODEL_INTERAKCJI §2: `Esc` i klik w tło = anulowanie; akcja
 * potwierdzająca jest jawnie nazwana czasownikiem operacji (nigdy „OK").
 */

import { useEffect, useRef } from 'react';

export interface DialogPotwierdzeniaProps {
  tytul: string;
  /** Zdanie główne: co dokładnie się stanie. */
  pytanie: string;
  /** Zdanie uzupełniające: skutek/odwracalność (język inżynierski). */
  skutek?: string;
  etykietaPotwierdz: string;
  etykietaAnuluj: string;
  /** `true` = operacja destrukcyjna (wyróżnienie przycisku). */
  destrukcyjna?: boolean;
  /** Operacja w toku — blokuje ponowne zatwierdzenie. */
  wToku?: boolean;
  onPotwierdz: () => void;
  onAnuluj: () => void;
  testId: string;
}

export function DialogPotwierdzenia({
  tytul,
  pytanie,
  skutek,
  etykietaPotwierdz,
  etykietaAnuluj,
  destrukcyjna = false,
  wToku = false,
  onPotwierdz,
  onAnuluj,
  testId,
}: DialogPotwierdzeniaProps) {
  const anulujRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Fokus startowy na akcji bezpiecznej (anulowanie) — operacja destrukcyjna
    // nie może być zatwierdzona samym `Enter` po otwarciu dialogu.
    anulujRef.current?.focus();
  }, []);

  useEffect(() => {
    function obsluga(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onAnuluj();
      }
    }
    document.addEventListener('keydown', obsluga);
    return () => document.removeEventListener('keydown', obsluga);
  }, [onAnuluj]);

  return (
    <div className="mvd-dialog-scrim" data-testid={`${testId}-scrim`} onClick={onAnuluj}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tytul}
        className="mvd-dialog"
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mvd-dialog-tytul">{tytul}</h3>
        <p className="mvd-dialog-tresc">{pytanie}</p>
        {skutek && <p className="mvd-dialog-tresc mvd-dialog-tresc-uwaga">{skutek}</p>}
        <div className="mvd-dialog-akcje">
          <button
            type="button"
            ref={anulujRef}
            className="mvd-btn"
            onClick={onAnuluj}
            data-testid={`${testId}-anuluj`}
          >
            {etykietaAnuluj}
          </button>
          <button
            type="button"
            className={destrukcyjna ? 'mvd-btn mvd-btn-destrukcyjny' : 'mvd-btn mvd-btn-primary'}
            onClick={onPotwierdz}
            disabled={wToku}
            data-testid={`${testId}-potwierdz`}
          >
            {etykietaPotwierdz}
          </button>
        </div>
      </div>
    </div>
  );
}
