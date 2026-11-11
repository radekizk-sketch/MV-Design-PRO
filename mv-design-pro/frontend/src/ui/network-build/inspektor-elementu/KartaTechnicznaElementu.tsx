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
import type { JSX } from 'react';

import { TekstZWzorami, tekstBezWzorow } from '../../../ui2/kreatory/rama/tekstZWzorami';

import {
  BRAK_DANYCH_PL,
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
      <dt className="mvd-kt-etykieta"><TekstZWzorami tekst={wiersz.etykieta} /></dt>
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
            aria-label={`Zmień: ${tekstBezWzorow(wiersz.etykieta)}`}
            onClick={() => onEdytuj?.(edycja)}
          >
            Zmień
          </button>
        )}
      </dd>
    </div>
  );
}

function TabelaDanych({ tabela }: { readonly tabela: TabelaKarty }): JSX.Element {
  if (tabela.wiersze.length === 0) {
    return (
      <p className="mvd-kt-brak" data-testid={`inspektor-karta-tabela-${tabela.klucz}-pusta`}>
        {tabela.pustaPl}
      </p>
    );
  }
  const idPodpisu = `inspektor-karta-tabela-${tabela.klucz}-podpis`;
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
                  <TekstZWzorami tekst={k.etykieta} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabela.wiersze.map((w) => (
              <tr key={w.klucz} data-testid={`inspektor-karta-wiersz-${tabela.klucz}`}>
                {tabela.kolumny.map((k) => {
                  const wartosc = w.komorki[k.klucz] ?? null;
                  return (
                    <td key={k.klucz} data-kolumna={k.klucz} data-brak={wartosc === null ? 'true' : 'false'}>
                      <span className={wartosc === null ? 'mvd-kt-brak' : undefined}>{wartosc ?? BRAK_DANYCH_PL}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabela.zrodloPl && <p className="mvd-kt-zrodlo">{tabela.zrodloPl}</p>}
    </div>
  );
}

function Sekcja({
  sekcja,
  onEdytuj,
}: {
  readonly sekcja: SekcjaKarty;
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
}): JSX.Element {
  const idNaglowka = `inspektor-karta-${sekcja.id}-tytul`;
  return (
    <section className="mvd-kt-sekcja" data-testid={`inspektor-karta-${sekcja.id}`} aria-labelledby={idNaglowka}>
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
            <TabelaDanych key={t.klucz} tabela={t} />
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
}: {
  readonly karta: KartaTechniczna;
  /** `null` — tryb bez edycji modelu (wyniki, tylko do odczytu): przyciski „Zmień" ukryte. */
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
}): JSX.Element {
  return (
    <div className="mvd-kt" data-testid="inspektor-karta" data-rodzaj-karty={karta.rodzaj}>
      {karta.sekcje.map((s) => (
        <Sekcja key={s.id} sekcja={s} onEdytuj={onEdytuj} />
      ))}
    </div>
  );
}
