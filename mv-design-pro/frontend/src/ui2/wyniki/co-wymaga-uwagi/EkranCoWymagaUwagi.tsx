/*
 * EKRAN „Co wymaga uwagi" (karta A1 / V12K-098, FLOW etap E6).
 *
 * Skonsolidowany rejestr przekroczeń ze WSZYSTKICH analiz trzymających wynik
 * w synchronicznym store (bieżąco: rozpływ mocy — napięcia szyn). Jedno miejsce,
 * w którym inżynier analiz widzi każdy problem sieci z akcją naprawczą „Popraw
 * w modelu" (reużycie `usePoprawWModelu`, F-E6.1 — selekcja + zoom SLD + „Schemat").
 *
 * FLOW §0: cel jednym zdaniem · uczciwe stany zerowe (brak przebiegu ≠ sieć
 * w normie) · jawny następny krok. ZERO fizyki — czyta gotowe werdykty.
 */

import { useRejestrPrzekroczen } from './model';
import { usePoprawWModelu } from '../wzorzec';
import { CO_WYMAGA_UWAGI_STRINGS as T } from './strings';
import './coWymagaUwagi.css';

export function EkranCoWymagaUwagi() {
  const { przekroczenia, maPrzebieg } = useRejestrPrzekroczen();
  const poprawWModelu = usePoprawWModelu();

  return (
    <section className="mvd-cwu" data-testid="mvd-cwu">
      <header className="mvd-cwu-head">
        <h2 className="mvd-cwu-title">{T.tytul}</h2>
        <p className="mvd-cwu-cel">{T.cel}</p>
      </header>

      {!maPrzebieg && (
        <div className="mvd-cwu-pusty" data-testid="mvd-cwu-brak-przebiegu">
          <p className="mvd-cwu-pusty-glowny">{T.brakPrzebiegu}</p>
          <p className="mvd-cwu-pusty-krok">{T.brakPrzebieguKrok}</p>
        </div>
      )}

      {maPrzebieg && przekroczenia.length === 0 && (
        <div className="mvd-cwu-pusty mvd-cwu-ok" data-testid="mvd-cwu-w-normie">
          <p className="mvd-cwu-pusty-glowny">{T.siecWNormie}</p>
          <p className="mvd-cwu-pusty-krok">{T.siecWNormieKrok}</p>
        </div>
      )}

      {przekroczenia.length > 0 && (
        <>
          <p className="mvd-cwu-podsumowanie" data-testid="mvd-cwu-podsumowanie">
            {T.podsumowanie(przekroczenia.length)}
          </p>
          <ul className="mvd-cwu-lista" data-testid="mvd-cwu-lista">
            {przekroczenia.map((p) => (
              <li key={p.klucz} className="mvd-cwu-pozycja" data-testid="mvd-cwu-pozycja">
                <span className="mvd-cwu-analiza">{p.analizaPL}</span>
                <span className="mvd-cwu-element mvd-num">{p.elementNazwa}</span>
                <span className="mvd-cwu-opis">{p.opis}</span>
                <span className="mvd-cwu-wartosc mvd-num">{p.wartosc}</span>
                <button
                  type="button"
                  className="mvd-cwu-popraw"
                  data-testid="mvd-cwu-popraw"
                  title={T.poprawWModeluOpis}
                  onClick={() => poprawWModelu(p.elementRef, p.elementTyp, p.elementNazwa)}
                >
                  {T.poprawWModelu}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
