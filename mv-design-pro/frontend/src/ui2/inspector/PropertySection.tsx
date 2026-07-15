/*
 * PropertySection — sekcja akordeonowa siatki właściwości (karta E1.3 §1/§4a).
 *
 * Akordeon: nagłówek to przycisk z `aria-expanded`, zawartość to region kv-grid.
 * Stan zwinięcia zapamiętywany PER TYP OBIEKTU w pinStore (localStorage).
 * Reguła twarda: sekcja z błędem (`bledy` niepuste) jest WYMUSZONA otwarta i nie
 * daje się zwinąć — „Zaawansowane" nigdy nie ukrywa pola z błędem.
 */

import type { SekcjaWlasciwosci } from './inspectorModel';
import { INSPECTOR_STRINGS } from './strings';
import { usePinStore } from './pinStore';
import { ValueRow } from './ValueRow';

interface PropertySectionProps {
  /** Typ obiektu — klucz pamięci akordeonu (per typ). */
  typObiektu: string;
  sekcja: SekcjaWlasciwosci;
  rewizjaModelu: number;
  onOtworzDowod: (ref: string) => void;
  onPrzelicz?: () => void;
}

export function PropertySection({
  typObiektu,
  sekcja,
  rewizjaModelu,
  onOtworzDowod,
  onPrzelicz,
}: PropertySectionProps) {
  // Subskrybujemy KONKRETNĄ wartość (nie funkcję), by re-render nastąpił po zmianie.
  const zapamietany = usePinStore((s) => s.accordions[typObiektu]?.[sekcja.id]);
  const toggleSection = usePinStore((s) => s.toggleSection);

  const maBledy = (sekcja.bledy?.length ?? 0) > 0;
  // Sekcje zaawansowane domyślnie zwinięte; pozostałe rozwinięte.
  const domyslnieOtwarta = !sekcja.zaawansowana;
  // Błąd wymusza otwarcie niezależnie od zapamiętanego stanu.
  const otwarta = maBledy || (zapamietany === undefined ? domyslnieOtwarta : zapamietany);

  const regionId = `mvd-insp-sec-${typObiektu}-${sekcja.id}`;

  return (
    <section className="mvd-insp-section" data-mvd-section={sekcja.id}>
      <h4 className="mvd-insp-section-head">
        <button
          type="button"
          className="mvd-insp-section-toggle"
          aria-expanded={otwarta}
          aria-controls={regionId}
          disabled={maBledy}
          data-mvd-forced={maBledy || undefined}
          onClick={() => toggleSection(typObiektu, sekcja.id, domyslnieOtwarta)}
        >
          <span className="mvd-insp-caret" aria-hidden="true">
            {otwarta ? '▾' : '▸'}
          </span>
          <span className="mvd-insp-section-title">
            {sekcja.zaawansowana ? INSPECTOR_STRINGS.zaawansowane : sekcja.tytul}
          </span>
        </button>
      </h4>

      <div id={regionId} className="mvd-insp-section-body" hidden={!otwarta} role="group">
        {maBledy && (
          <ul className="mvd-insp-errors" data-mvd-errors="">
            {sekcja.bledy!.map((blad, i) => (
              <li key={i} className="mvd-insp-error">
                {blad}
              </li>
            ))}
          </ul>
        )}
        <div className="mvd-insp-kv-grid">
          {sekcja.wiersze.map((wiersz, i) => (
            <ValueRow
              key={`${wiersz.etykieta}-${i}`}
              etykieta={wiersz.etykieta}
              wartosc={wiersz.wartosc}
              rewizjaModelu={rewizjaModelu}
              onOtworzDowod={onOtworzDowod}
              onPrzelicz={onPrzelicz}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
