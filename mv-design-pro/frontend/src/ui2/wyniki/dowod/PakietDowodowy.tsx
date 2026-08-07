/*
 * PAKIET DOWODOWY przebiegu (karta PACK-DOWODY) — sekcja okna „Dowód obliczeń".
 *
 * CO ZAMYKA. Ślad WHITE BOX i źródło `.tex` odpowiadają na pytanie „jak to
 * policzono". Do opracowania i archiwum inżynier potrzebuje ZAMKNIĘTEGO artefaktu:
 * dowodu w postaci danych, źródła dokumentu, wykazu plików z sumami kontrolnymi i
 * odcisku integralności — czyli pakietu. Pakiety istniały w backendzie bez ani
 * jednego konsumenta; ta sekcja jest tym konsumentem.
 *
 * ZERO FIZYKI, ZERO ZGADYWANIA RODZAJU: o tym, jaki pakiet się należy i czy w
 * ogóle, rozstrzyga SERWER na podstawie danych biegu (`.../pakiet-dowodowy/
 * dostepnosc`). Ekran nie mapuje własnej nazwy na rodzaj pakietu — pokazuje to,
 * co odpowiedział dostawca, razem z uczciwym powodem, gdy pakietu nie ma.
 *
 * ŚWIEŻOŚĆ Z JEDNEGO ŹRÓDŁA: znacznik „wyniki nieaktualne" bierzemy z
 * `useSwiezoscWynikow` (ui2/freshness) — tego samego kontraktu, który niesie
 * rewizję modelu. Sekcja NIE liczy świeżości osobno (reguła predykatów parami).
 */

import { useEffect, useState } from 'react';

import { opisSwiezosci, useSwiezoscWynikow } from '../../freshness';
import { PrzyciskAkcjiStanu } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';
import { DOWOD_STRINGS as T } from './strings';
import type { DostepnoscPakietu } from './pakietApi';
import { pobierzDostepnoscPakietu, pobierzPakiet, zapiszPakiet } from './pakietApi';

type StanDostepnosci =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'gotowe'; readonly dane: DostepnoscPakietu }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

type StanPobrania =
  | { readonly rodzaj: 'bezczynny' }
  | { readonly rodzaj: 'pobiera' }
  | { readonly rodzaj: 'pobrano'; readonly nazwaPliku: string }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

export interface PakietDowodowyProps {
  /** Przebieg, którego pakiet pobieramy. `null` = brak podstawy (sekcja milczy). */
  readonly runId: string | null;
  /**
   * Akcja stanu zerowego (K6 / H-5): realny następny krok, gdy pakietu nie ma.
   * Sterowana propsami jak reszta okna dowodu.
   */
  readonly akcjaBrak?: AkcjaStanuZerowego;
}

export function PakietDowodowy({ runId, akcjaBrak }: PakietDowodowyProps) {
  const [stan, setStan] = useState<StanDostepnosci>({ rodzaj: 'ladowanie' });
  const [punkt, setPunkt] = useState<string | null>(null);
  const [pobranie, setPobranie] = useState<StanPobrania>({ rodzaj: 'bezczynny' });
  const swiezosc = useSwiezoscWynikow();

  useEffect(() => {
    if (!runId) return;
    const kontroler = new AbortController();
    setStan({ rodzaj: 'ladowanie' });
    setPunkt(null);
    setPobranie({ rodzaj: 'bezczynny' });
    void (async () => {
      try {
        const dane = await pobierzDostepnoscPakietu(runId, kontroler.signal);
        if (kontroler.signal.aborted) return;
        setStan({ rodzaj: 'gotowe', dane });
        setPunkt(dane.punkty[0]?.target_id ?? null);
      } catch (error) {
        if (kontroler.signal.aborted) return;
        setStan({
          rodzaj: 'blad',
          komunikat: error instanceof Error ? error.message : T.pakietBlad,
        });
      }
    })();
    return () => kontroler.abort();
  }, [runId]);

  if (!runId) return null;

  if (stan.rodzaj === 'ladowanie') {
    return (
      <section className="mvd-dowod-pakiet" data-testid="mvd-dowod-pakiet-ladowanie">
        <p className="mvd-dowod-latex-opis">{T.pakietLadowanie}</p>
      </section>
    );
  }

  if (stan.rodzaj === 'blad') {
    return (
      <section className="mvd-dowod-pakiet" data-testid="mvd-dowod-pakiet-blad">
        <span className="mvd-dowod-zakres-etyk">{T.pakietEyebrow}</span>
        <p className="mvd-dowod-latex-uwaga">
          {T.pakietBlad} {stan.komunikat}
        </p>
      </section>
    );
  }

  const dane = stan.dane;

  if (!dane.dostepny) {
    return (
      <section className="mvd-dowod-pakiet" data-testid="mvd-dowod-pakiet-brak">
        <span className="mvd-dowod-zakres-etyk">{T.pakietEyebrow}</span>
        <p className="mvd-dowod-latex-opis" data-testid="mvd-dowod-pakiet-powod">
          {dane.powod_pl ?? T.pakietBrakOgolny}
        </p>
        <PrzyciskAkcjiStanu akcja={akcjaBrak} testid="mvd-dowod-pakiet-brak" />
      </section>
    );
  }

  const pobierz = async () => {
    setPobranie({ rodzaj: 'pobiera' });
    try {
      const pakiet = await pobierzPakiet(runId, punkt);
      zapiszPakiet(pakiet);
      setPobranie({ rodzaj: 'pobrano', nazwaPliku: pakiet.nazwaPliku });
    } catch (error) {
      setPobranie({
        rodzaj: 'blad',
        komunikat: error instanceof Error ? error.message : T.pakietBlad,
      });
    }
  };

  const wieleP = dane.punkty.length > 1;

  return (
    <section className="mvd-dowod-pakiet" data-testid="mvd-dowod-pakiet">
      <div className="mvd-dowod-latex-glowa">
        <div>
          <span className="mvd-dowod-zakres-etyk">{T.pakietEyebrow}</span>
          <p className="mvd-dowod-latex-opis" data-testid="mvd-dowod-pakiet-rodzaj">
            {dane.rodzaj_pl}
          </p>
          <p className="mvd-dowod-latex-opis">{T.pakietOpis}</p>
        </div>
        <div className="mvd-dowod-latex-akcje">
          {wieleP && (
            <label className="mvd-dowod-pakiet-punkt">
              <span className="mvd-dowod-zakres-etyk">{T.pakietPunkt}</span>
              <select
                className="mvd-dowod-pakiet-wybor"
                data-testid="mvd-dowod-pakiet-punkt"
                value={punkt ?? ''}
                onChange={(zdarzenie) => {
                  setPunkt(zdarzenie.target.value);
                  setPobranie({ rodzaj: 'bezczynny' });
                }}
              >
                {dane.punkty.map((p) => (
                  <option key={p.target_id} value={p.target_id}>
                    {p.nazwa}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="mvd-dowod-zakres-btn"
            data-testid="mvd-dowod-pakiet-pobierz"
            disabled={pobranie.rodzaj === 'pobiera'}
            onClick={() => void pobierz()}
          >
            {pobranie.rodzaj === 'pobiera' ? T.pakietPobieranie : T.pakietPobierz}
          </button>
        </div>
      </div>

      {swiezosc.stan === 'nieaktualne' && (
        <p className="mvd-dowod-latex-uwaga" data-testid="mvd-dowod-pakiet-swiezosc">
          {`${T.pakietNieaktualne} (${opisSwiezosci(swiezosc)})`}
        </p>
      )}

      <ul className="mvd-dowod-pakiet-zawartosc" data-testid="mvd-dowod-pakiet-zawartosc">
        {dane.zawartosc_pl.map((pozycja) => (
          <li key={pozycja}>{pozycja}</li>
        ))}
      </ul>

      {pobranie.rodzaj === 'pobrano' && (
        <p className="mvd-dowod-latex-opis" data-testid="mvd-dowod-pakiet-pobrano">
          {`${T.pakietPobrano} ${pobranie.nazwaPliku}`}
        </p>
      )}
      {pobranie.rodzaj === 'blad' && (
        <p className="mvd-dowod-latex-uwaga" data-testid="mvd-dowod-pakiet-pobierz-blad">
          {T.pakietBlad} {pobranie.komunikat}
        </p>
      )}
    </section>
  );
}
