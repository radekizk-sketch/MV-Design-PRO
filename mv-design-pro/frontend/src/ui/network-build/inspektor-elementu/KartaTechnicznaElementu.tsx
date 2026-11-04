/**
 * K6 (Z-12) — render karty technicznej obiektu (`ui/sld/shared/kartaTechnicznaElementu.ts`)
 * w prawym inspektorze. Sekcje w kolejności pracy projektanta; brak danej = „brak danych";
 * źródło danych przy danych tabliczki i znamionowych. Tabele (pola rozdzielnicy, przyłączenia,
 * aparaty pola) mają jeden zwarty wiersz na obiekt z nagłówkiem kolumn; kolumny poza szerokością
 * inspektora przewija się w poziomie (obszar tabeli przyjmuje fokus klawiatury), pierwsza kolumna
 * zostaje przy krawędzi (`ui2/theme/komponenty.css`). Dzięki temu karta stacji przy 1440×900
 * mieści identyfikację, tabelę pól i transformator na pierwszym ekranie inspektora.
 * Zmiana wartości wyłącznie operacją domenową (kreator edycji parametrów),
 * a przycisk „Zmień" pojawia się tylko w trybie edycji modelu.
 */
import { useEffect, useRef, type JSX } from 'react';

import {
  BRAK_DANYCH_PL,
  type AkcjaWierszaKarty,
  type CelAkcjiKarty,
  type EdycjaWiersza,
  type KartaTechniczna,
  type SekcjaKarty,
  type TabelaKarty,
  type WierszKarty,
} from '../../sld/shared/kartaTechnicznaElementu';

function WierszDanych({
  wiersz,
  onEdytuj,
}: {
  readonly wiersz: WierszKarty;
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
}): JSX.Element {
  const brak = wiersz.wartosc === null;
  const edycja = onEdytuj && wiersz.edycja ? wiersz.edycja : null;
  return (
    <div className="mvd-kt-wiersz" data-testid={`inspektor-karta-pole-${wiersz.klucz}`} data-brak={brak ? 'true' : 'false'}>
      <dt className="mvd-kt-etykieta">{wiersz.etykieta}</dt>
      <dd className="mvd-kt-wartosc">
        <span className={brak ? 'mvd-kt-brak' : undefined} data-testid={`inspektor-karta-wartosc-${wiersz.klucz}`}>
          {wiersz.wartosc ?? BRAK_DANYCH_PL}
        </span>
        {wiersz.lista && wiersz.lista.length > 0 && (
          <ul className="mvd-kt-lista" data-testid={`inspektor-karta-lista-${wiersz.klucz}`}>
            {wiersz.lista.map((pozycja, i) => (
              <li key={`${i}-${pozycja}`}>{pozycja}</li>
            ))}
          </ul>
        )}
        {wiersz.zrodloPl && <span className="mvd-kt-zrodlo-wiersza">źródło: {wiersz.zrodloPl}</span>}
        {edycja && (
          <button
            type="button"
            className="mvd-btn mvd-kt-zmien"
            data-testid={`inspektor-karta-zmien-${wiersz.klucz}`}
            aria-label={`Zmień: ${wiersz.etykieta}`}
            onClick={() => onEdytuj?.(edycja)}
          >
            Zmień
          </button>
        )}
      </dd>
    </div>
  );
}

/** Obsługa akcji wiersza tabeli: `null` — akcja tego celu niedostępna (np. operacja modelu poza
 *  trybem edycji) i przycisku nie ma (bez atrapy). */
export type ObslugaAkcjiKarty = (cel: CelAkcjiKarty) => (() => void) | null;

function TabelaDanych({
  tabela,
  onAkcja,
}: {
  readonly tabela: TabelaKarty;
  readonly onAkcja: ObslugaAkcjiKarty | null;
}): JSX.Element {
  if (tabela.wiersze.length === 0) {
    return (
      <p className="mvd-kt-brak" data-testid={`inspektor-karta-tabela-${tabela.klucz}-pusta`}>
        {tabela.pustaPl}
      </p>
    );
  }
  const idPodpisu = `inspektor-karta-tabela-${tabela.klucz}-podpis`;
  const kolumnaAkcji = onAkcja !== null && tabela.wiersze.some((w) => w.akcja && onAkcja(w.akcja.cel) !== null);
  return (
    <div className="mvd-kt-tabela-ramka">
      <p id={idPodpisu} className="mvd-kt-podpis-tabeli">
        {tabela.podpis}
      </p>
      {/* Obszar przewijany w poziomie: fokus klawiatury (strzałki przewijają), nazwany podpisem. */}
      <div
        className="mvd-kt-tabela-przewijanie"
        role="region"
        aria-labelledby={idPodpisu}
        tabIndex={0}
        data-testid={`inspektor-karta-tabela-${tabela.klucz}-przewijanie`}
      >
        <table className="mvd-kt-tabela" data-testid={`inspektor-karta-tabela-${tabela.klucz}`} aria-labelledby={idPodpisu}>
          <thead>
            <tr>
              {tabela.kolumny.map((k) => (
                <th key={k.klucz} scope="col">
                  {k.etykieta}
                </th>
              ))}
              {kolumnaAkcji && (
                <th scope="col">
                  <span className="sr-only">Przejście</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {tabela.wiersze.map((w) => (
              <tr key={w.klucz} data-testid={`inspektor-karta-wiersz-${tabela.klucz}`} data-klucz-wiersza={w.klucz}>
                {tabela.kolumny.map((k) => {
                  const wartosc = w.komorki[k.klucz] ?? null;
                  return (
                    <td key={k.klucz} data-kolumna={k.klucz} data-brak={wartosc === null ? 'true' : 'false'}>
                      <span className={wartosc === null ? 'mvd-kt-brak' : undefined}>{wartosc ?? BRAK_DANYCH_PL}</span>
                    </td>
                  );
                })}
                {kolumnaAkcji && (
                  <td data-kolumna="akcja">
                    <PrzyciskAkcji akcja={w.akcja} onAkcja={onAkcja} opisWiersza={w.komorki[tabela.kolumny[0]?.klucz ?? ''] ?? w.klucz} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabela.zrodloPl && <p className="mvd-kt-zrodlo">{tabela.zrodloPl}</p>}
    </div>
  );
}

function PrzyciskAkcji({
  akcja,
  onAkcja,
  opisWiersza,
}: {
  readonly akcja: AkcjaWierszaKarty | undefined;
  readonly onAkcja: ObslugaAkcjiKarty | null;
  readonly opisWiersza: string;
}): JSX.Element | null {
  const wykonaj = akcja && onAkcja ? onAkcja(akcja.cel) : null;
  if (!akcja || !wykonaj) return null;
  return (
    <button
      type="button"
      className="mvd-btn mvd-kt-zmien"
      data-testid="inspektor-karta-akcja-wiersza"
      data-cel={akcja.cel.rodzaj === 'ekran' ? akcja.cel.kodEkranu : akcja.cel.operacja}
      aria-label={`${akcja.etykietaPl}: ${opisWiersza}`}
      onClick={wykonaj}
    >
      {akcja.etykietaPl}
    </button>
  );
}

function Sekcja({
  sekcja,
  onEdytuj,
  onAkcja,
  wyrozniona,
}: {
  readonly sekcja: SekcjaKarty;
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  readonly onAkcja: ObslugaAkcjiKarty | null;
  readonly wyrozniona: boolean;
}): JSX.Element {
  const idNaglowka = `inspektor-karta-${sekcja.id}-tytul`;
  const ref = useRef<HTMLElement>(null);
  // Wejście z obiektu rysunku przypisanego do sekcji (blok przekaźnika → „Zabezpieczenia
  // i automatyka"): sekcja przewinięta do widoku i oznaczona; fokus na nagłówku sekcji.
  useEffect(() => {
    if (!wyrozniona || !ref.current) return;
    ref.current.scrollIntoView?.({ block: 'start' });
    ref.current.focus({ preventScroll: true });
  }, [wyrozniona]);
  return (
    <section
      ref={ref}
      className="mvd-kt-sekcja"
      data-testid={`inspektor-karta-${sekcja.id}`}
      data-wyrozniona={wyrozniona ? 'true' : undefined}
      tabIndex={wyrozniona ? -1 : undefined}
      aria-labelledby={idNaglowka}
    >
      <h4 id={idNaglowka} className="mvd-kt-tytul">
        {sekcja.tytul}
      </h4>
      {sekcja.pustaPl ? (
        <p className="mvd-kt-brak" data-testid={`inspektor-karta-${sekcja.id}-pusta`}>
          {sekcja.pustaPl}
        </p>
      ) : (
        <>
          {sekcja.wiersze.length > 0 && (
            <dl className="mvd-kt-wiersze">
              {sekcja.wiersze.map((w) => (
                <WierszDanych key={w.klucz} wiersz={w} onEdytuj={onEdytuj} />
              ))}
            </dl>
          )}
          {(sekcja.tabele ?? []).map((t) => (
            <TabelaDanych key={t.klucz} tabela={t} onAkcja={onAkcja} />
          ))}
          {sekcja.zrodloPl && (
            <p className="mvd-kt-zrodlo" data-testid={`inspektor-karta-${sekcja.id}-zrodlo`}>
              Źródło danych: {sekcja.zrodloPl}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function KartaTechnicznaElementu({
  karta,
  onEdytuj,
  onAkcja = null,
  sekcjaWyrozniona = null,
}: {
  readonly karta: KartaTechniczna;
  /** `null` — tryb bez edycji modelu (wyniki, tylko do odczytu): przyciski „Zmień" ukryte. */
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  /** Akcje wierszy tabel (przejście do nastaw); `null` — bez przycisków. */
  readonly onAkcja?: ObslugaAkcjiKarty | null;
  /** Id sekcji, do której prowadzi kliknięty obiekt rysunku (`null` — żadna). */
  readonly sekcjaWyrozniona?: string | null;
}): JSX.Element {
  return (
    <div className="mvd-kt" data-testid="inspektor-karta" data-rodzaj-karty={karta.rodzaj}>
      {karta.sekcje.map((s) => (
        <Sekcja key={s.id} sekcja={s} onEdytuj={onEdytuj} onAkcja={onAkcja} wyrozniona={s.id === sekcjaWyrozniona} />
      ))}
    </div>
  );
}
