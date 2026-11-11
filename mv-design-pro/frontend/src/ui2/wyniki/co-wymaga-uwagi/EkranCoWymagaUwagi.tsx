/*
 * EKRAN „Co wymaga uwagi" (karta A1 / V12K-098, FLOW etap E6; K6 / H-5 pkt 3+5).
 *
 * Skonsolidowany rejestr przekroczeń ze WSZYSTKICH źródeł dostępnych bez
 * zgadywania: rozpływ mocy (napięcia szyn, zbieżność) + werdykt projektowy
 * backendu (kryteria z biegów rozpływu, zwarć i z modelu). Jedno miejsce,
 * w którym inżynier analiz widzi każdy problem sieci z akcją naprawczą „Popraw
 * w modelu" (reużycie `usePoprawWModelu`, F-E6.1 — selekcja + zoom SLD +
 * „Schemat"), a pozycje bez elementu modelu — z adresem okna diagnostyki.
 *
 * FLOW §0: cel jednym zdaniem · uczciwe stany zerowe (brak przebiegu ≠ sieć
 * w normie) · JAWNY następny krok w KAŻDYM stanie zerowym (K6 / H-5):
 *   - brak przebiegu → „Uruchom obliczenie rozpływu" (ten sam tor co „Oblicz"),
 *   - sieć w normie → „Domknij dokumentację" albo „Porównaj warianty".
 * ZERO fizyki — ekran czyta gotowe werdykty.
 */

import { useRejestrPrzekroczen, wniosekPustejListy, type Przekroczenie } from './model';
import {
  PrzyciskAkcjiStanu,
  akcjaNaprawcza,
  useAkcjaOtworzDokumentacje,
  useAkcjaPorownajWarianty,
  useAkcjaUruchomObliczenie,
  usePoprawWModelu,
} from '../wzorzec';
import { useShellStore } from '../../shell/useShellStore';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { CO_WYMAGA_UWAGI_STRINGS as T } from './strings';
import './coWymagaUwagi.css';

export function EkranCoWymagaUwagi() {
  const rejestr = useRejestrPrzekroczen();
  const { przekroczenia } = rejestr;
  // Jeden wniosek stanu zerowego z jednego źródła (`wniosekPustejListy`).
  const wniosek = wniosekPustejListy(rejestr);
  const poprawWModelu = usePoprawWModelu();
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  // K6 / H-5: stan zerowy „brak przebiegu" uruchamia bieg rozpływu — to on
  // zasila rejestr przekroczeń napięć i bilansów.
  const akcjaBiegu = useAkcjaUruchomObliczenie('LOAD_FLOW');
  // K6 / H-5 pkt 3: sukces („sieć w normie") ma DWA jawne następne kroki.
  const akcjaDokumentacji = useAkcjaOtworzDokumentacje();
  const akcjaPorownania = useAkcjaPorownajWarianty();

  const otworzDiagnostyke = (pozycja: Przekroczenie) => {
    if (!pozycja.zakladkaWynikow) return;
    setWynikiTab(pozycja.zakladkaWynikow);
    przejdzDoPrzestrzeni('wyniki');
  };

  return (
    <section className="mvd-cwu" data-testid="mvd-cwu">
      <header className="mvd-cwu-head">
        <h2 className="mvd-cwu-title">{T.tytul}</h2>
        <p className="mvd-cwu-cel">{T.cel}</p>
      </header>

      {wniosek === 'brak_przebiegu' && (
        <div className="mvd-cwu-pusty" data-testid="mvd-cwu-brak-przebiegu">
          <p className="mvd-cwu-pusty-glowny">{T.brakPrzebiegu}</p>
          <p className="mvd-cwu-pusty-krok">{T.brakPrzebieguKrok}</p>
          <PrzyciskAkcjiStanu akcja={akcjaBiegu} testid="mvd-cwu-brak-przebiegu" />
        </div>
      )}

      {wniosek === 'ocena_wczytywanie' && (
        <div className="mvd-cwu-pusty" data-testid="mvd-cwu-ocena-wczytywanie" aria-busy="true">
          <p className="mvd-cwu-pusty-glowny">{T.ocenaWczytywanie}</p>
          <p className="mvd-cwu-pusty-krok">{T.ocenaWczytywanieKrok}</p>
        </div>
      )}

      {wniosek === 'ocena_blad' && (
        <div className="mvd-cwu-pusty" data-testid="mvd-cwu-ocena-blad" role="alert">
          <p className="mvd-cwu-pusty-glowny">{T.ocenaBlad}</p>
          <p className="mvd-cwu-pusty-krok">{T.ocenaBladKrok}</p>
        </div>
      )}

      {wniosek === 'brak_kryteriow' && (
        <div className="mvd-cwu-pusty" data-testid="mvd-cwu-brak-kryteriow">
          <p className="mvd-cwu-pusty-glowny">{T.brakKryteriow}</p>
          <p className="mvd-cwu-pusty-krok">{T.brakKryteriowKrok}</p>
          <PrzyciskAkcjiStanu akcja={akcjaBiegu} testid="mvd-cwu-brak-kryteriow" />
        </div>
      )}

      {wniosek === 'w_normie' && (
        <div className="mvd-cwu-pusty mvd-cwu-ok" data-testid="mvd-cwu-w-normie">
          <p className="mvd-cwu-pusty-glowny">{T.siecWNormie}</p>
          <p className="mvd-cwu-pusty-krok">{T.siecWNormieKrok}</p>
          <div className="mvd-cwu-pusty-akcje">
            <PrzyciskAkcjiStanu akcja={akcjaDokumentacji} testid="mvd-cwu-w-normie-dokumentacja" />
            <PrzyciskAkcjiStanu akcja={akcjaPorownania} testid="mvd-cwu-w-normie-porownanie" />
          </div>
        </div>
      )}

      {przekroczenia.length > 0 && (
        <>
          <p className="mvd-cwu-podsumowanie" data-testid="mvd-cwu-podsumowanie">
            {T.podsumowanie(przekroczenia.length)}
          </p>
          {/* Lista z samego rozpływu, gdy werdykt projektowy jeszcze się czyta albo
              się nie wczytał — jawnie NIEPEŁNA (bez kryteriów z biegów i modelu). */}
          {rejestr.odczytOceny !== null && (
            <p
              className="mvd-cwu-pusty-krok"
              data-testid="mvd-cwu-lista-niepelna"
              data-odczyt={rejestr.odczytOceny}
              aria-busy={rejestr.odczytOceny === 'wczytywanie'}
            >
              {rejestr.odczytOceny === 'wczytywanie' ? T.listaNiepelnaWczytywanie : T.listaNiepelnaBlad}
            </p>
          )}
          <ul className="mvd-cwu-lista" data-testid="mvd-cwu-lista">
            {przekroczenia.map((p) => (
              <li key={p.klucz} className="mvd-cwu-pozycja" data-testid="mvd-cwu-pozycja">
                <span className="mvd-cwu-analiza">{p.analizaPL}</span>
                <span className="mvd-cwu-element mvd-num">{p.elementNazwa}</span>
                <span className="mvd-cwu-opis">{p.opis}</span>
                <span className="mvd-cwu-wartosc mvd-num">{p.wartosc}</span>
                {/* K1 / F-E6.3: etykieta i akcja z rejestru akcji naprawczych —
                    kontekstowe per rodzaj przekroczenia pozycji rejestru.
                    K6: pozycja bez elementu modelu dostaje adres okna
                    diagnostyki (zamiast przycisku prowadzącego donikąd). */}
                {p.elementRef && p.elementTyp ? (
                  <button
                    type="button"
                    className="mvd-cwu-popraw"
                    data-testid="mvd-cwu-popraw"
                    title={akcjaNaprawcza(p.rodzaj).opis}
                    onClick={() =>
                      poprawWModelu(
                        p.elementRef as string,
                        p.elementTyp as NonNullable<Przekroczenie['elementTyp']>,
                        p.elementNazwa,
                        p.rodzaj,
                      )
                    }
                  >
                    {akcjaNaprawcza(p.rodzaj).etykieta}
                  </button>
                ) : p.zakladkaWynikow ? (
                  <button
                    type="button"
                    className="mvd-cwu-popraw"
                    data-testid="mvd-cwu-diagnostyka"
                    title={T.otworzDiagnostykeOpis}
                    onClick={() => otworzDiagnostyke(p)}
                  >
                    {T.otworzDiagnostyke}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
