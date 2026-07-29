/*
 * Sekcja „Wkłady do zwarcia" (karta E8.2; W-A F2 — wkłady PRO) — wkłady źródeł
 * do prądu w wybranym punkcie zwarcia. Reużywa tabelę wspólnego wzorca
 * (`TabelaWynikow`): źródło (PL), prąd wkładu [kA], udział [%] (liczony
 * PREZENTACYJNIE — patrz `naWierszeWkladow`), sortowanie po kolumnach (sortKey).
 *
 * Karta W-A F2 (punkt 5 karty właściciela):
 * - filtr tekstowy po nazwie źródła (czysta operacja prezentacyjna; udziały [%]
 *   liczone PRZED filtrem — filtrowanie ich nie zmienia),
 * - wykres udziałów procentowych (`WykresUdzialowChart`, poziome słupki),
 * - rozwinięcie wkładu: klik wiersza zwija/rozwija szczegół maszyny
 *   (typ PL, Ir, Ik"/Ir, μ, q, Ib — IEC 60909 §6.6) + wywód dyplomowy TEJ
 *   maszyny (`SladWywodu`, kroki {tekst, latex} z backendu). Wkład bez
 *   szczegółu → uczciwy stan „szczegóły niedostępne" (zero fabrykacji).
 *
 * Dane dostarcza endpoint rozbicia maszynowego (`zwarcia/api.ts`); `wklady`
 * przez props = nadpisanie testowe. Zero fizyki, zero mutacji.
 */

import { useState } from 'react';
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
import { WykresUdzialowChart } from './WykresUdzialowChart';
import {
  KLUCZ_WKLAD,
  KOLUMNY_WKLADOW,
  filtrujWierszeWkladow,
  naPozycjeSzczegoluWkladu,
  naSlupkiUdzialow,
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

/** Panel szczegółu maszynowego wybranego wkładu (karta W-A F2). */
function SzczegolWkladuPanel({ wklad }: { wklad: WkladZwarciowy }) {
  const szczegol = wklad.szczegol;
  return (
    <div className="mvd-zwarcia-wklad-szczegol" data-testid="mvd-zwarcia-wklad-szczegol">
      <h4 className="mvd-zwarcia-wklad-szczegol-tytul">
        {ZWARCIA_STRINGS.wkladSzczegolTytul}
        {': '}
        <span className="mvd-zwarcia-wklady-punkt">{wklad.zrodlo}</span>
      </h4>
      {!szczegol ? (
        <div
          className="mvd-zwarcia-wklady-brak"
          data-testid="mvd-zwarcia-wklad-szczegol-brak"
        >
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.wkladSzczegolBrak}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">
            {ZWARCIA_STRINGS.wkladSzczegolBrakOpis}
          </p>
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.wkladSzczegolOpis}</p>
          <dl className="mvd-zwarcia-bilans-siatka">
            {naPozycjeSzczegoluWkladu(szczegol).map((p) => (
              <div key={p.etykieta} className="mvd-zwarcia-bilans-poz">
                <dt>{p.etykieta}</dt>
                <dd className="mvd-num">
                  {p.wartosc}
                  {p.jednostka && p.wartosc !== ZWARCIA_STRINGS.kreska ? ` ${p.jednostka}` : ''}
                </dd>
              </div>
            ))}
          </dl>
          <SladWywodu kroki={szczegol.wywod} testIdPrefix="mvd-zwarcia-wklad-szczegol-slad" />
        </>
      )}
    </div>
  );
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
  const [filtr, setFiltr] = useState('');
  const [wybranyWklad, setWybranyWklad] = useState<string | null>(null);

  // Klik wiersza wkładu: ten sam wiersz → zwiń (toggle), inny → rozwiń.
  const przelaczWklad = (klucz: string) =>
    setWybranyWklad((poprzedni) => (poprzedni === klucz ? null : klucz));

  // Udział [%] liczony na PEŁNYM zbiorze (przed filtrem) — filtr nie zmienia udziałów.
  const wierszeWszystkie = wklady ? naWierszeWkladow(wklady) : [];
  const wiersze = filtrujWierszeWkladow(wierszeWszystkie, filtr);
  const filtrBezTrafien = wierszeWszystkie.length > 0 && wiersze.length === 0;
  const wybrany = wklady?.find((w) => w.id === wybranyWklad) ?? null;

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
          {wklady.length > 0 && (
            <div className="mvd-zwarcia-wklady-filtr">
              <label htmlFor="mvd-zwarcia-wklady-filtr-input">
                {ZWARCIA_STRINGS.wkladyFiltr}
              </label>
              <input
                id="mvd-zwarcia-wklady-filtr-input"
                data-testid="mvd-zwarcia-wklady-filtr"
                type="text"
                value={filtr}
                onChange={(e) => setFiltr(e.target.value)}
              />
            </div>
          )}
          {filtrBezTrafien ? (
            <p
              className="mvd-zwarcia-wklady-filtr-brak"
              data-testid="mvd-zwarcia-wklady-filtr-brak"
            >
              {ZWARCIA_STRINGS.wkladyFiltrBrak}
            </p>
          ) : (
            <TabelaWynikow
              kolumny={KOLUMNY_WKLADOW}
              wiersze={wiersze}
              onOtworzDowod={onOtworzDowod}
              trybZaawansowania={trybZaawansowania}
              kluczWiersza={KLUCZ_WKLAD}
              onWybierzWiersz={przelaczWklad}
              wybranyWiersz={wybranyWklad}
            />
          )}
          {wybrany && <SzczegolWkladuPanel wklad={wybrany} />}
          <WykresUdzialowChart slupki={naSlupkiUdzialow(wklady)} />
          {/* Scalenie F2+F3: wywod sekcyjny (z checklista walidacji IEC) ma
              pierwszenstwo; plaski SladWywodu = fallback starszych odpowiedzi. */}
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
