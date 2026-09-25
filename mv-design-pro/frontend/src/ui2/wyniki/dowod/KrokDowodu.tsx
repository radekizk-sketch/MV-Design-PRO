/*
 * KROK DOWODU (karta E9.1 / W-608) — widok pojedynczego kroku śladu WHITE BOX
 * w kanonie pięciu pól: Wzór → Dane wejściowe → Podstawienie → Wynik → Uwagi.
 * Etykiety pól z `TRACE_FIELD_LABELS`; jednostki przy wartościach; pole nieobecne
 * w kroku → pole pominięte (zero atrap). Karta #145: węzły i gałęzie po NAZWIE z
 * modelu (most nazw wyników, także w tytule solvera), zapis techniczny (klucze bez
 * polskiej etykiety, identyfikatory, uwagi z nazwami funkcji rdzenia zamrożonego)
 * wyłącznie w „Informacjach audytowych" kroku. Matematyka renderowana blokowo przez
 * reużyty `MathBlock` z `ui/proof` (bez modyfikacji tamtego modułu).
 *
 * Powiązanie z modelem: krok z `element_id` → przycisk „Pokaż na schemacie"
 * emitujący selekcję na magistrali zdarzeń powłoki (`ui2/events`). Read-only,
 * zero fizyki, zero mutacji store'ów.
 */

import { TRACE_FIELD_LABELS } from '../../../ui/results-inspector/types';
import { MathBlock } from '../../../ui/proof';
import { emituj } from '../../events';
import type { AdvancementMode } from '../../shell/modeModel';
import { InformacjeAudytowe, useNazwaObiektu } from '../wzorzec';
import type { WierszInformacjiAudytowych } from '../wzorzec';
import { DOWOD_STRINGS } from './strings';
import { maZapisTechniczny } from './dowodModel';
import type { KrokDowoduModel, WartoscDowodu } from './dowodModel';

export interface KrokDowoduProps {
  krok: KrokDowoduModel;
  trybZaawansowania: AdvancementMode;
}

/**
 * Pierwszy plan kroku: wyłącznie wielkości z polską etykietą. Klucz nieznany
 * (etykieta === null — brak w słowniku śladu albo kod wartości spoza mapy) NIE jest
 * zgadywany ani pokazywany surowo: trafia do „Informacji audytowych" kroku (karta
 * #145 — zapis techniczny solvera wyłącznie tam, tryb ekspercki, sekcja zwinięta).
 */
function wielkosciPierwszegoPlanu(wielkosci: WartoscDowodu[]): WartoscDowodu[] {
  return wielkosci.filter((w) => w.etykieta !== null);
}

function ListaWielkosci({
  wielkosci,
  testId,
  nazwaObiektu,
}: {
  wielkosci: WartoscDowodu[];
  testId: string;
  nazwaObiektu: (ref: string) => string;
}) {
  return (
    <dl className="mvd-dowod-wielkosci" data-testid={testId}>
      {wielkosci.map((w) => (
        <div className="mvd-dowod-wielkosc" key={w.klucz} data-testid="mvd-dowod-wielkosc">
          <dt className="mvd-dowod-wielkosc-etykieta">{w.etykieta}</dt>
          <dd className="mvd-dowod-wielkosc-wartosc mvd-num">
            {w.latex !== undefined ? (
              <MathBlock latex={w.latex} />
            ) : w.odnosnik !== undefined ? (
              nazwaObiektu(w.odnosnik)
            ) : (
              w.wartosc
            )}
            {w.jednostka && <span className="mvd-dowod-unit">{w.jednostka}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tytuł kroku z nazwami elementów w miejscu identyfikatorów wpisanych przez solver. */
function tytulZNazwami(krok: KrokDowoduModel, nazwaObiektu: (ref: string) => string): string {
  return krok.odnosnikiTytulu.reduce(
    (tytul, odnosnik) => tytul.split(odnosnik).join(nazwaObiektu(odnosnik)),
    krok.tytul,
  );
}

/** Wiersze „Informacji audytowych" kroku — zapis techniczny solvera poza pierwszym planem. */
function wierszeAudytuKroku(krok: KrokDowoduModel): WierszInformacjiAudytowych[] {
  const wiersze: WierszInformacjiAudytowych[] = [];
  if (krok.odnosnikiTytulu.length > 0) {
    wiersze.push({ etykieta: DOWOD_STRINGS.audytTytulSolvera, wartosc: krok.tytul });
  }
  [...krok.dane, ...krok.wynik].forEach((w) => {
    if (w.etykieta === null) {
      const jednostka = w.jednostka ? ` ${w.jednostka}` : '';
      wiersze.push({ etykieta: DOWOD_STRINGS.audytKlucz(w.klucz), wartosc: `${w.wartosc}${jednostka}` });
    } else if (w.odnosnik !== undefined) {
      wiersze.push({ etykieta: DOWOD_STRINGS.audytIdentyfikator(w.etykieta), wartosc: w.odnosnik });
    }
  });
  if (krok.uwagi && maZapisTechniczny(krok.uwagi)) {
    wiersze.push({ etykieta: DOWOD_STRINGS.audytUwagaSolvera, wartosc: krok.uwagi });
  }
  // Etykieta jest kluczem wiersza listy — ten sam klucz pojawia się w danych i wyniku
  // tylko jako ta sama wielkość, więc pierwsze wystąpienie wystarcza.
  return wiersze.filter(
    (wiersz, i) => wiersze.findIndex((inny) => inny.etykieta === wiersz.etykieta) === i,
  );
}

export function KrokDowodu({ krok, trybZaawansowania }: KrokDowoduProps) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const nazwaObiektu = useNazwaObiektu();
  const dane = wielkosciPierwszegoPlanu(krok.dane);
  const wynik = wielkosciPierwszegoPlanu(krok.wynik);
  const uwagiNaPierwszymPlanie = krok.uwagi && !maZapisTechniczny(krok.uwagi) ? krok.uwagi : null;
  const nazwa = (ref: string) => nazwaObiektu(ref);

  const pokazNaSchemacie = () => {
    if (krok.elementId) {
      emituj({ typ: 'selekcja', obiektId: krok.elementId, zrodlo: 'dowod' });
    }
  };

  return (
    <article className="mvd-dowod-krok" data-testid="mvd-dowod-krok">
      <header className="mvd-dowod-krok-head">
        <span className="mvd-dowod-krok-numer mvd-num" aria-hidden="true">
          {krok.numer}
        </span>
        <h3 className="mvd-dowod-krok-tytul">{tytulZNazwami(krok, nazwa)}</h3>
        {krok.elementId && (
          <button
            type="button"
            className="mvd-btn"
            onClick={pokazNaSchemacie}
            data-mvd-action="selekcja"
            data-testid="mvd-dowod-pokaz-na-schemacie"
          >
            {DOWOD_STRINGS.pokazNaSchemacie}
          </button>
        )}
      </header>

      {/* Wzór */}
      {krok.wzorLatex && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-wzor">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.formula_latex}</h4>
          <div className="mvd-dowod-latex">
            <MathBlock latex={krok.wzorLatex} />
          </div>
        </section>
      )}

      {/* Dane wejściowe */}
      {dane.length > 0 && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-dane">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.inputs}</h4>
          <ListaWielkosci wielkosci={dane} testId="mvd-dowod-dane" nazwaObiektu={nazwa} />
        </section>
      )}

      {/* Podstawienie — LaTeX gdy solver/rejestr go niesie; inaczej opis metody
          prozą (karta V12.7 §0.1: proza NIGDY nie idzie przez MathBlock). */}
      {krok.podstawienie && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-podstawienie">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.substitution}</h4>
          <div className="mvd-dowod-latex">
            <MathBlock latex={krok.podstawienie} />
          </div>
        </section>
      )}
      {!krok.podstawienie && krok.podstawienieTekst && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-podstawienie-tekst">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.substitution}</h4>
          <p className="mvd-dowod-uwagi">{krok.podstawienieTekst}</p>
        </section>
      )}

      {/* Wynik */}
      {wynik.length > 0 && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-wynik">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.result}</h4>
          <ListaWielkosci wielkosci={wynik} testId="mvd-dowod-wynik" nazwaObiektu={nazwa} />
        </section>
      )}

      {/* Uwagi */}
      {uwagiNaPierwszymPlanie && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-uwagi">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.notes}</h4>
          <p className="mvd-dowod-uwagi">{uwagiNaPierwszymPlanie}</p>
        </section>
      )}

      <InformacjeAudytowe
        wiersze={wierszeAudytuKroku(krok)}
        trybEkspercki={trybEkspercki}
        testid="mvd-dowod-krok-informacje-audytowe"
      />
    </article>
  );
}
