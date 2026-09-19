import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  fetchPrzegladWiarygodnosci,
  getCatalogErrorMessage,
  type PrzegladWiarygodnosci,
} from './api';

/**
 * Sekcja „Pozycje do przeglądu" przeglądarki biblioteki typów.
 *
 * PO CO. Część reguł katalogu opisuje relacje TYPOWE, nie konieczne: R0 ≥ R1,
 * P0 < Pk, Icw ≤ Icu, 0 < R/X < 1, 0 < i0 % < 10. Egzekwowanie ich twardo
 * odrzuciłoby pierwszy poprawny rekord spoza dotychczasowego zbioru, a
 * przemilczenie zostawiłoby błąd importu (zamienione kolumny) bez żadnego
 * sygnału. Ta sekcja jest trzecią drogą: backend liczy odstępstwa i podaje je
 * projektantowi jako sygnał do obejrzenia karty producenta.
 *
 * ZERO FIZYKI W UI. Komponent nie liczy niczego — wszystkie liczby, progi,
 * nazwy reguł i uzasadnienia przychodzą z `GET /api/catalog/przeglad-wiarygodnosci`.
 *
 * UCZCIWY STAN ZEROWY. „Brak pozycji do przeglądu" pokazujemy RAZEM z liczbą
 * faktycznie policzonych sprawdzeń i liczbą pozycji pominiętych (z powodem) —
 * bez tego zieleń byłaby nierozróżnialna od „reguły nie dało się policzyć".
 */
export function PozycjeDoPrzegladu() {
  const [przeglad, setPrzeglad] = useState<PrzegladWiarygodnosci | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ladowanie, setLadowanie] = useState(true);
  const [rozwiniete, setRozwiniete] = useState(false);

  useEffect(() => {
    let przerwane = false;
    setLadowanie(true);
    setBlad(null);
    fetchPrzegladWiarygodnosci()
      .then((wynik) => {
        if (przerwane) return;
        setPrzeglad(wynik);
        setLadowanie(false);
      })
      .catch((error: unknown) => {
        if (przerwane) return;
        setBlad(getCatalogErrorMessage(error));
        setLadowanie(false);
      });
    return () => {
      przerwane = true;
    };
  }, []);

  if (ladowanie) {
    return (
      <section
        className="border-b border-gray-200 bg-white px-6 py-3"
        data-testid="pozycje-do-przegladu"
      >
        <p className="text-sm text-gray-500">Liczenie pozycji do przeglądu...</p>
      </section>
    );
  }

  if (blad !== null) {
    return (
      <section
        className="border-b border-gray-200 bg-white px-6 py-3"
        data-testid="pozycje-do-przegladu"
      >
        <p className="text-sm font-medium text-red-700">Pozycje do przeglądu</p>
        <p className="text-sm text-red-600" data-testid="pozycje-do-przegladu-blad">
          {blad}
        </p>
      </section>
    );
  }

  if (przeglad === null) {
    return null;
  }

  const policzone = przeglad.rodziny.reduce(
    (suma, rodzina) => suma + rodzina.pokrycie.reduce((s, p) => s + p.policzone, 0),
    0,
  );
  const pominiete = przeglad.rodziny.reduce(
    (suma, rodzina) => suma + rodzina.pokrycie.reduce((s, p) => s + p.pominiete, 0),
    0,
  );
  const maOdstepstwa = przeglad.liczba_odstepstw > 0;

  return (
    <section
      className="border-b border-gray-200 bg-white px-6 py-3"
      data-testid="pozycje-do-przegladu"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Pozycje do przeglądu</h2>
          <p className="mt-1 text-xs text-gray-600" data-testid="pozycje-do-przegladu-podsumowanie">
            {maOdstepstwa
              ? `${przeglad.liczba_odstepstw} pozycji odbiega od relacji typowych dla swojej rodziny.`
              : 'Brak pozycji odbiegających od relacji typowych.'}{' '}
            Sprawdzeń policzonych: {policzone}; pominiętych (reguła nie ma zastosowania):{' '}
            {pominiete}.
          </p>
          <p className="mt-1 text-xs italic text-gray-500">
            To jest sygnał do przeglądu karty producenta, nie odmowa — pozycja pozostaje dostępna
            do doboru.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRozwiniete((poprzednie) => !poprzednie)}
          data-testid="pozycje-do-przegladu-przelacz"
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
        >
          {rozwiniete ? 'Zwiń szczegóły' : 'Pokaż szczegóły'}
        </button>
      </div>

      {rozwiniete ? (
        <div className="mt-3 space-y-4" data-testid="pozycje-do-przegladu-szczegoly">
          <div className="space-y-2">
            {przeglad.rodziny.map((rodzina) => (
              <div
                key={rodzina.rodzina}
                className={clsx(
                  'rounded-md border px-3 py-2',
                  rodzina.liczba_odstepstw > 0
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 bg-gray-50',
                )}
                data-testid={`pozycje-do-przegladu-rodzina-${rodzina.rodzina}`}
              >
                <p className="text-xs font-semibold text-gray-800">
                  {rodzina.etykieta_pl} — pozycji: {rodzina.liczba_pozycji}, do przeglądu:{' '}
                  {rodzina.liczba_odstepstw}
                </p>
                {rodzina.pokrycie.map((pokrycie) => (
                  <p key={pokrycie.kod} className="mt-1 text-xs text-gray-600">
                    {pokrycie.kod}: policzono {pokrycie.policzone}, pominięto {pokrycie.pominiete}
                    {pokrycie.pominiete > 0 ? ` (${pokrycie.powod_pominiecia})` : ''}
                  </p>
                ))}
                {rodzina.odstepstwa.map((odstepstwo) => (
                  <p
                    key={`${odstepstwo.kod}-${odstepstwo.pozycja_id}`}
                    className="mt-1 text-xs text-amber-900"
                    data-testid={`pozycje-do-przegladu-odstepstwo-${odstepstwo.pozycja_id}`}
                  >
                    <span className="font-mono">{odstepstwo.kod}</span> · {odstepstwo.pozycja_id} ·{' '}
                    {odstepstwo.regula}: {odstepstwo.opis_wartosci}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Reguły przeglądu
            </h3>
            {przeglad.reguly.map((regula) => (
              <p
                key={regula.kod}
                className="mt-1 text-xs text-gray-600"
                data-testid={`pozycje-do-przegladu-regula-${regula.kod}`}
              >
                <span className="font-mono">{regula.kod}</span> · {regula.nazwa} — podstawa:{' '}
                {regula.podstawa}. {regula.uzasadnienie}
              </p>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Rodziny poza przeglądem
            </h3>
            {przeglad.rodziny_bez_regul.map((rodzina) => (
              <p
                key={rodzina.rodzina}
                className="mt-1 text-xs text-gray-500"
                data-testid={`pozycje-do-przegladu-bez-regul-${rodzina.rodzina}`}
              >
                <span className="font-mono">{rodzina.rodzina}</span> — {rodzina.powod}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
