/**
 * „Co unieważniło wynik tego przypadku" — lista zmian z werdyktu backendu (CV-2-W).
 *
 * Znacznik świeżości mówił projektantowi TYLKO tyle, że wynik jest nieaktualny.
 * Żeby zdecydować, czy przeliczać, musiał sam odtworzyć z pamięci, co zrobił
 * między biegiem a chwilą obecną. Ten komponent pokazuje przyczynę zdaniem
 * z backendu (`result_status_reason_pl`) i listę rewizji modelu powstałych po
 * biegu (`zmiany_od_biegu`): operacja, jej opis z kanonu, dotknięte elementy.
 *
 * ZERO INTERPRETACJI: komponent niczego nie liczy i nie tłumaczy. Wszystkie
 * teksty pochodzą z odpowiedzi API (`api/study_cases.py` → `FreshnessVerdict`),
 * łącznie z przyczyną „katalog zmieniony", która nie ma listy zmian modelu i
 * której jedynym wyjaśnieniem jest właśnie zdanie z serwera.
 *
 * ODRĘBNOŚĆ OD `PanelCoSieZmienilo`: tamten panel opisuje świeżość POJEDYNCZEGO
 * PRZEBIEGU i czyta dziennik zmian osobnym zapytaniem (ma znaczniki czasu i
 * przejście do elementu). Tutaj dane przychodzą już w odpowiedzi z przypadkiem —
 * dodatkowe zapytanie byłoby drugim źródłem tej samej prawdy.
 */

import './zmiany.css';

import type { StatusWynikowPrzypadku } from '../../ui/study-cases/types';

export interface ListaZmianOdBieguProps {
  /** Werdykt świeżości przypadku — dokładnie tak, jak przyszedł z backendu. */
  readonly status: StatusWynikowPrzypadku;
}

export function ListaZmianOdBiegu({ status }: ListaZmianOdBieguProps): JSX.Element {
  const { result_status_reason_pl: przyczyna, zmiany_od_biegu: zmiany } = status;

  return (
    <section className="mvd-zmiany" data-testid="mvd-status-wynikow-przyczyna">
      <p className="mvd-zmiany-podsumowanie">{przyczyna}</p>
      {status.rewizja_biegu != null && status.rewizja_biezaca != null && (
        <p className="mvd-zmiany-meta" data-testid="mvd-status-wynikow-rewizje">
          Wynik z rewizji <span className="mvd-num">{status.rewizja_biegu}</span>, model na
          rewizji <span className="mvd-num">{status.rewizja_biezaca}</span>.
        </p>
      )}
      {zmiany.length > 0 && (
        <>
          <h4 className="mvd-zmiany-tytul">Co się zmieniło od tego wyniku</h4>
          <ol className="mvd-zmiany-lista">
            {zmiany.map((zmiana) => (
              <li
                key={zmiana.rewizja}
                className="mvd-zmiany-wpis"
                data-testid={`mvd-status-zmiana-${zmiana.rewizja}`}
              >
                <p className="mvd-zmiany-opis">
                  <span className="mvd-num">rew. {zmiana.rewizja}</span>
                  {' · '}
                  {zmiana.opis_pl}
                </p>
                {zmiana.elementy.length > 0 && (
                  <ul className="mvd-zmiany-elementy">
                    {zmiana.elementy.map((ref) => (
                      <li key={ref}>
                        <span className="mvd-zmiany-element" data-nieklikalny="true">
                          <span className="mvd-mono">{ref}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
