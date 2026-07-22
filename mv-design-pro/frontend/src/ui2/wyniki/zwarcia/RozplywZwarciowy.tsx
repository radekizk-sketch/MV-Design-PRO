/*
 * Sekcja „Rozpływ prądu zwarciowego" (karta W-C, ZWARCIA-PRO F4 pkt 2) —
 * wkłady źródeł falownikowych do prądów w gałęziach dla wybranego punktu
 * zwarcia. Dane WPROST z wiersza kanonicznego
 * (`ShortCircuitRow.branch_contributions` — delta backendu pkt 1 karty W-C:
 * FROZEN solver z opcją addytywną + projekcja `_sc_rozplyw_galeziowy`).
 * Reużywa tabelę wspólnego wzorca (`TabelaWynikow`).
 *
 * Uczciwe stany (zero fabrykacji):
 * - `flows === null` → starszy wynik bez pola (kontrakt addytywny) — komunikat,
 * - `flows.length === 0` → policzono, brak wkładów falownikowych; kontrakt
 *   solvera nie niesie rozpływu Thevenina (GAP zapisany w `zwarciaModel.ts` 1a).
 * Zero fizyki, zero mutacji, zero wołań API.
 */

import type { ShortCircuitBranchFlow } from '../../../ui/results-inspector/types';
import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaWynikow } from '../wzorzec';
import { ZWARCIA_STRINGS } from './strings';
import { KLUCZ_ROZPLYW, KOLUMNY_ROZPLYWU, naWierszeRozplywu } from './zwarciaModel';

export interface RozplywZwarciowyProps {
  /** Nazwa wybranego punktu zwarcia (nagłówek sekcji, pierwszy plan). */
  punktNazwa: string;
  /** Wpisy rozpływu z wiersza kanonicznego; `null` = starszy wynik bez pola. */
  flows: ShortCircuitBranchFlow[] | null;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

export function RozplywZwarciowy({
  punktNazwa,
  flows,
  trybZaawansowania,
  onOtworzDowod,
}: RozplywZwarciowyProps) {
  return (
    <section
      className="mvd-zwarcia-rozplyw"
      data-testid="mvd-zwarcia-rozplyw"
      aria-label={ZWARCIA_STRINGS.rozplywTytul}
    >
      <h3 className="mvd-zwarcia-wklady-tytul">
        {ZWARCIA_STRINGS.rozplywTytul}
        {': '}
        <span className="mvd-zwarcia-wklady-punkt">{punktNazwa}</span>
      </h3>
      {flows === null ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-brak">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywNiedostepny}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywNiedostepnyOpis}</p>
        </div>
      ) : flows.length === 0 ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-pusty">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywBrakWkladow}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywBrakWkladowOpis}</p>
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.rozplywOpis}</p>
          <TabelaWynikow
            kolumny={KOLUMNY_ROZPLYWU}
            wiersze={naWierszeRozplywu(flows)}
            onOtworzDowod={onOtworzDowod}
            trybZaawansowania={trybZaawansowania}
            kluczWiersza={KLUCZ_ROZPLYW}
          />
        </>
      )}
    </section>
  );
}
