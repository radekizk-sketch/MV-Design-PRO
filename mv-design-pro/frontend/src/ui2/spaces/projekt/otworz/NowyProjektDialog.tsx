/*
 * Dialog „Nowy projekt" z DOWOLNĄ nazwą i opisem (karta KD-1, luka L-3).
 *
 * Ścieżka od celu pracy (`CelProjektu`) zostaje ścieżką pierwszoplanową —
 * wyprowadza nazwę/opis z celu i tworzy projekt jednym klikiem. Ten dialog
 * dokłada brakującą zdolność mostu `#dashboard`: projektant nadaje własną
 * nazwę (numer zlecenia, nazwa GPZ) i opis zakresu opracowania.
 *
 * Pola mapują 1:1 na kontrakt `POST /api/projects` (`CreateProjectRequest.name`
 * i `.description` — `ui/projects/api.ts`); zero pól, których backend nie zna.
 * W pełni sterowany propsami — zero wołań API w warstwie prezentacji.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';

import { OTWORZ_STRINGS } from './strings';

export interface NowyProjektDialogProps {
  /** Operacja tworzenia w toku (blokuje ponowne zatwierdzenie). */
  wToku?: boolean;
  onUtworz: (nazwa: string, opis: string) => void;
  onAnuluj: () => void;
}

export function NowyProjektDialog({ wToku = false, onUtworz, onAnuluj }: NowyProjektDialogProps) {
  const [nazwa, setNazwa] = useState('');
  const [opis, setOpis] = useState('');
  const [walidacja, setWalidacja] = useState<string | null>(null);

  function przeslij(event: FormEvent) {
    event.preventDefault();
    const nazwaOczyszczona = nazwa.trim();
    if (!nazwaOczyszczona) {
      setWalidacja(OTWORZ_STRINGS.bladNazwaPusta);
      return;
    }
    setWalidacja(null);
    onUtworz(nazwaOczyszczona, opis.trim());
  }

  return (
    <div className="mvd-dialog-scrim" data-testid="mvd-nowy-projekt-scrim" onClick={onAnuluj}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={OTWORZ_STRINGS.nowyTytul}
        className="mvd-dialog"
        data-testid="mvd-nowy-projekt-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mvd-dialog-tytul">{OTWORZ_STRINGS.nowyTytul}</h3>
        <form className="mvd-dialog-form" onSubmit={przeslij}>
          <label className="mvd-pole">
            <span className="mvd-pole-etykieta">{OTWORZ_STRINGS.nowyNazwa}</span>
            <input
              type="text"
              className="mvd-input"
              value={nazwa}
              onChange={(e) => setNazwa(e.target.value)}
              placeholder={OTWORZ_STRINGS.nowyNazwaPodpis}
              data-testid="mvd-nowy-projekt-nazwa"
              autoFocus
            />
          </label>
          <label className="mvd-pole">
            <span className="mvd-pole-etykieta">{OTWORZ_STRINGS.nowyOpis}</span>
            <input
              type="text"
              className="mvd-input"
              value={opis}
              onChange={(e) => setOpis(e.target.value)}
              placeholder={OTWORZ_STRINGS.nowyOpisPodpis}
              data-testid="mvd-nowy-projekt-opis"
            />
          </label>

          {walidacja && (
            <p className="mvd-dialog-blad" role="alert" data-testid="mvd-nowy-projekt-blad">
              {walidacja}
            </p>
          )}

          <div className="mvd-dialog-akcje">
            <button
              type="button"
              className="mvd-btn"
              onClick={onAnuluj}
              data-testid="mvd-nowy-projekt-anuluj"
            >
              {OTWORZ_STRINGS.anuluj}
            </button>
            <button
              type="submit"
              className="mvd-btn mvd-btn-primary"
              disabled={wToku}
              data-testid="mvd-nowy-projekt-utworz"
            >
              {OTWORZ_STRINGS.nowyUtworz}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
