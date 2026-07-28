/**
 * Macierz analiz na ekranie wytwórcy — prezentacja (karta E21-2, audyt E-21 P5/P10).
 *
 * Zastępuje czternaście wierszy „oś: zakres kompletny / zakres do przeliczenia", które
 * nie odpowiadały na żadne pytanie projektanta. Każdy wiersz mówi teraz: po co analiza
 * jest wymagana, czego brakuje (z powodem i miejscem naprawy), jaki jest stan wyniku,
 * kiedy liczono ostatnio i CO ZROBIĆ dalej.
 *
 * ZERO REGUŁY: układ wierszy i werdykty przychodzą z `zlozMacierzAnaliz`, ta sekcja
 * wyłącznie je pokazuje.
 */

import { dzialaniePl, stanWynikuPl, type WierszMacierzy } from './macierzAnaliz';

export interface MacierzAnalizSekcjaProps {
  readonly wiersze: readonly WierszMacierzy[];
  /** Wywoływane działaniem wiersza; wołający wie, gdzie prowadzi każdy krok. */
  readonly onDzialanie?: (wiersz: WierszMacierzy) => void;
}

function statusPl(status: WierszMacierzy['status']): string {
  switch (status) {
    case 'ready':
      return 'dane kompletne';
    case 'partial':
      return 'dane niepełne';
    case 'blocked':
      return 'dane brakujące';
    case 'not_applicable':
      return 'nie dotyczy';
    case 'no_module':
      return 'poza bieżącym modułem';
  }
}

export function MacierzAnalizSekcja({
  wiersze,
  onDzialanie,
}: MacierzAnalizSekcjaProps): JSX.Element {
  return (
    <section className="space-y-3" data-testid="macierz-analiz">
      <div>
        <h3 className="text-sm font-semibold text-scada-text">Analizy i ich wymagania</h3>
        <p className="text-xs text-scada-muted">
          Dla każdej analizy: po co jest wymagana, czego brakuje, jaki jest stan wyniku
          i jaki jest następny krok.
        </p>
      </div>

      <div className="space-y-2">
        {wiersze.map((wiersz) => {
          const os = String(wiersz.axis);
          return (
          <article
            key={os}
            className="border-b border-scada-border/60 pb-2"
            data-testid={`macierz-wiersz-${os}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-scada-text">{wiersz.label_pl}</span>
              <span
                className="text-xs text-scada-muted"
                data-testid={`macierz-status-${os}`}
              >
                {statusPl(wiersz.status)} · {stanWynikuPl(wiersz.stanWyniku)}
              </span>
            </div>
            <p className="text-xs text-scada-muted">{wiersz.powod_pl}</p>

            {wiersz.blokady.length > 0 && (
              <ul className="mt-1 space-y-0.5" data-testid={`macierz-braki-${os}`}>
                {wiersz.blokady.map((blokada) => (
                  <li key={blokada.code} className="text-xs text-scada-grounded">
                    {blokada.message_pl}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-3">
              {wiersz.ostatnieLiczenie !== null && (
                <span
                  className="text-xs text-scada-muted"
                  data-testid={`macierz-ostatnie-${os}`}
                >
                  ostatnie obliczenie: {wiersz.ostatnieLiczenie}
                </span>
              )}
              {wiersz.dzialanie !== 'brak' && (
                <button
                  type="button"
                  className="min-h-[44px] rounded border border-scada-border px-3 py-2 text-xs text-scada-text hover:bg-scada-surface"
                  onClick={() => onDzialanie?.(wiersz)}
                  data-testid={`macierz-dzialanie-${os}`}
                >
                  {dzialaniePl(wiersz.dzialanie)}
                </button>
              )}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
