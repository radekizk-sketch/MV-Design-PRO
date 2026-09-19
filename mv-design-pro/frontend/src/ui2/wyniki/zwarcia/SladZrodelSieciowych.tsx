/*
 * Sekcja „Źródła sieciowe (Z_Q)" (CV-4.3 K6/K7) — ślad WHITE BOX wyprowadzenia
 * impedancji zastępczej źródeł sieciowych zasilających bieg (IEC 60909-0:2016
 * §6.2.1 eq. 6: Z_Q = c·U_nQ²/S″_kQ). Dane WPROST z `ShortCircuitResults.zrodla_sieciowe`
 * (`enm/mapping.py::build_grid_source_trace`, addytywne pole biegu — nie per punkt
 * zwarcia). Reużywa tabelę wspólnego wzorca (`TabelaWynikow`).
 *
 * Uczciwy stan (zero fabrykacji): pole nieobecne = starszy wynik bez śladu albo
 * bieg bez źródła sieciowego (sieć zasilana wyłącznie generatorami/maszynami) —
 * backend NIGDY nie wysyła pustą tablicę (klucz dopisywany tylko, gdy ślad
 * niepusty), więc oba przypadki dają ten sam uczciwy komunikat.
 *
 * Zero fizyki, zero mutacji, zero wołań API z tego pliku.
 */

import type { ZrodloSiecioweSlad } from '../../../ui/results-inspector/types';
import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaWynikow } from '../wzorzec';
import { ZWARCIA_STRINGS } from './strings';
import { KLUCZ_ZRODLA_SIECIOWE, KOLUMNY_ZRODEL_SIECIOWYCH, naWierszeZrodelSieciowych } from './zwarciaModel';

export interface SladZrodelSieciowychProps {
  /** Ślad źródeł sieciowych biegu; `undefined` = starszy wynik / bieg bez źródła sieciowego. */
  zrodlaSieciowe: readonly ZrodloSiecioweSlad[] | undefined;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

export function SladZrodelSieciowych({
  zrodlaSieciowe,
  trybZaawansowania,
  onOtworzDowod,
}: SladZrodelSieciowychProps) {
  const wiersze = zrodlaSieciowe ?? [];

  return (
    <section
      className="mvd-zwarcia-zrodla"
      data-testid="mvd-zwarcia-zrodla"
      aria-label={ZWARCIA_STRINGS.zrodlaTytul}
    >
      <h3 className="mvd-zwarcia-wklady-tytul">{ZWARCIA_STRINGS.zrodlaTytul}</h3>
      {wiersze.length === 0 ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-zrodla-brak">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.zrodlaNiedostepne}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.zrodlaNiedostepneOpis}</p>
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.zrodlaOpis}</p>
          <TabelaWynikow
            kolumny={KOLUMNY_ZRODEL_SIECIOWYCH}
            wiersze={naWierszeZrodelSieciowych(wiersze)}
            onOtworzDowod={onOtworzDowod}
            trybZaawansowania={trybZaawansowania}
            kluczWiersza={KLUCZ_ZRODLA_SIECIOWE}
          />
        </>
      )}
    </section>
  );
}
