/*
 * Sekcja „Wkłady do zwarcia" (karta E8.2) — wkłady źródeł do prądu w wybranym
 * punkcie zwarcia. Reużywa tabelę wspólnego wzorca (`TabelaWynikow`): źródło (PL),
 * prąd wkładu [kA], udział [%] (liczony PREZENTACYJNIE — patrz `naWierszeWkladow`).
 *
 * Dane wkładów NIE są dziś w kontrakcie wyników zwarciowych (read-only) — sekcja
 * przyjmuje je PRZEZ PROPS. Gdy `wklady` brak (`null`) → widoczny stan „dane
 * wkładów niedostępne w tym przebiegu" (TODO-KARTA delty backendowej w
 * `zwarciaModel.ts`). Zero fizyki, zero mutacji.
 */

import type { AdvancementMode } from '../../shell/modeModel';
import {
  SladSekcyjny,
  SladWywodu,
  TabelaWynikow,
  type KrokWywodu,
  type PozycjaWalidacji,
  type SekcjaWywodu,
} from '../wzorzec';
import { ZWARCIA_STRINGS } from './strings';
import {
  KLUCZ_WKLAD,
  KOLUMNY_WKLADOW,
  naWierszeWkladow,
  type WkladZwarciowy,
} from './zwarciaModel';

export interface WkladyZwarcioweProps {
  /** Nazwa wybranego punktu zwarcia (nagłówek sekcji, pierwszy plan). */
  punktNazwa: string;
  /** Wkłady źródeł dla wybranego punktu; `null` = dane niedostępne w przebiegu. */
  wklady: WkladZwarciowy[] | null;
  /**
   * Wywód {tekst, latex} z backendu (zasada KaTeX 2026-07-22) — ślad obliczeń
   * na żądanie pod tabelą wkładów. Pusta lista → przycisk śladu nie renderuje się.
   */
  wywod?: readonly KrokWywodu[];
  /**
   * Wywód SEKCYJNY z backendu (ZWARCIA-PRO F3 pkt 8) — ta sama treść co `wywod`,
   * pogrupowana w rozwijane sekcje z odwołaniem normowym. Gdy obecny (niepusty),
   * renderowany jest `SladSekcyjny`; inaczej płaski `SladWywodu` (starsze odpowiedzi).
   */
  wywodSekcje?: readonly SekcjaWywodu[];
  /** Checklista walidacji metody IEC (pkt 10) — sekcja na końcu wywodu sekcyjnego. */
  walidacjaIec?: readonly PozycjaWalidacji[];
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

export function WkladyZwarciowe({
  punktNazwa,
  wklady,
  wywod = [],
  wywodSekcje = [],
  walidacjaIec = [],
  trybZaawansowania,
  onOtworzDowod,
}: WkladyZwarcioweProps) {
  return (
    <section className="mvd-zwarcia-wklady" data-testid="mvd-zwarcia-wklady" aria-label={ZWARCIA_STRINGS.wkladyTytul}>
      <h3 className="mvd-zwarcia-wklady-tytul">
        {ZWARCIA_STRINGS.wkladyTytul}
        {': '}
        <span className="mvd-zwarcia-wklady-punkt">{punktNazwa}</span>
      </h3>
      {wklady === null ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-wklady-brak">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.wkladyNiedostepne}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.wkladyNiedostepneOpis}</p>
        </div>
      ) : (
        <>
          <TabelaWynikow
            kolumny={KOLUMNY_WKLADOW}
            wiersze={naWierszeWkladow(wklady)}
            onOtworzDowod={onOtworzDowod}
            trybZaawansowania={trybZaawansowania}
            kluczWiersza={KLUCZ_WKLAD}
          />
          {wywodSekcje.length > 0 ? (
            <SladSekcyjny
              sekcje={wywodSekcje}
              walidacja={
                walidacjaIec.length > 0
                  ? { tytul: ZWARCIA_STRINGS.walidacjaTytul, pozycje: walidacjaIec }
                  : undefined
              }
              testIdPrefix="mvd-zwarcia-wklady-slad"
            />
          ) : (
            <SladWywodu kroki={wywod} testIdPrefix="mvd-zwarcia-wklady-slad" />
          )}
        </>
      )}
    </section>
  );
}
