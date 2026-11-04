/**
 * Jedno sprawdzenie zgodności referencyjnej — wspólny wiersz trzech miejsc oceny (diagnostyka
 * ENM, przestrzeń „Gotowość”, właściwości elementu; karta WERDYKT-MIGRACJA-190, E61/D71/D72).
 *
 * Dawniej każde miejsce tłumaczyło goły status `pass`/`fail` na własny znak ✓/✗ i kolor.
 * Teraz wiersz pokazuje etykietę rekordu K (`EtykietaWerdyktu` — kolor z jedynej mapy
 * semantyki), element nazwą z modelu, stan stwierdzony przez silnik i rozwijane wyjaśnienie
 * rekordu (`KartaWerdyktu`: kryterium, podstawa z pakietu, dowód, zakres ważności).
 */
import { EtykietaWerdyktu, KartaWerdyktu } from '../wyniki/wzorzec/KartaWerdyktu';
import type { ReferenceComplianceCheck } from './api';
import './referencje.css';

export const SPRAWDZENIE_STRINGS = {
  wyjasnienie: 'Wyjaśnienie oceny',
} as const;

export interface SprawdzenieReferencyjneProps {
  readonly check: ReferenceComplianceCheck;
  readonly testid?: string;
  /** Element znany z kontekstu (właściwości elementu) — bez powtarzania jego nazwy. */
  readonly bezNazwyElementu?: boolean;
}

export function SprawdzenieReferencyjne({
  check,
  testid,
  bezNazwyElementu = false,
}: SprawdzenieReferencyjneProps) {
  const { ocena } = check;
  return (
    <div
      className="mvd-refspr"
      data-testid={testid}
      data-status={ocena.status_maszynowy}
    >
      <div className="mvd-refspr-wiersz">
        <EtykietaWerdyktu etykieta={ocena.etykieta} status={ocena.status_maszynowy} zwarta />
        {!bezNazwyElementu && (
          <span className="mvd-refspr-element">{ocena.przedmiot.nazwa_pl}</span>
        )}
        <span className="mvd-refspr-tresc">{check.message_pl}</span>
      </div>
      <details className="mvd-refspr-szczegol">
        <summary>{SPRAWDZENIE_STRINGS.wyjasnienie}</summary>
        <KartaWerdyktu rekord={ocena} />
      </details>
    </div>
  );
}
