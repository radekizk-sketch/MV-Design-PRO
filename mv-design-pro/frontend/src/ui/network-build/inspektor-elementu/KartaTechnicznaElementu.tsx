/**
 * K6 (Z-12) — render karty technicznej obiektu (`ui/sld/shared/kartaTechnicznaElementu.ts`)
 * w prawym inspektorze. Sekcje w kolejności pracy projektanta; brak danej = „brak danych";
 * źródło danych przy danych tabliczki i znamionowych. Tabele (pola rozdzielnicy, przyłączenia,
 * aparaty pola) mają jeden wiersz na obiekt z nagłówkiem kolumn; tabela zwarta mieści się
 * w szerokości inspektora (komórki zawijają się, liczby nie — jednostka w nagłówku), inna przewija
 * się w poziomie z pierwszą kolumną przy krawędzi (`ui2/theme/komponenty.css`). Podpis tabeli
 * tylko wtedy, gdy sekcja ma więcej niż jedną tabelę — inaczej powtarzałby tytuł sekcji. Wiersz
 * z celem (aparat pola) otwiera kartę tego obiektu (szczegóły na żądanie).
 * Zmiana wartości wyłącznie operacją domenową (kreator edycji parametrów),
 * a przycisk „Zmień" pojawia się tylko w trybie edycji modelu.
 */
import type { JSX } from 'react';

import {
  BRAK_DANYCH_PL,
  type CelWierszaTabeli,
  type EdycjaWiersza,
  type KartaTechniczna,
  type SekcjaKarty,
  type TabelaKarty,
  type WierszKarty,
} from '../../sld/shared/kartaTechnicznaElementu';
import { useNetworkBuildStore } from '../networkBuildStore';

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

function TabelaDanych({
  tabela,
  idTytuluSekcji,
  zPodpisem,
  onOtworz,
}: {
  readonly tabela: TabelaKarty;
  /** Tytuł sekcji nazywa tabelę, gdy podpisu nie ma (jedyna tabela sekcji). */
  readonly idTytuluSekcji: string;
  readonly zPodpisem: boolean;
  readonly onOtworz: ((cel: CelWierszaTabeli) => void) | null;
}): JSX.Element {
  if (tabela.wiersze.length === 0) {
    return (
      <p className="mvd-kt-brak" data-testid={`inspektor-karta-tabela-${tabela.klucz}-pusta`}>
        {tabela.pustaPl}
      </p>
    );
  }
  const idPodpisu = zPodpisem ? `inspektor-karta-tabela-${tabela.klucz}-podpis` : idTytuluSekcji;
  return (
    <div className="mvd-kt-tabela-ramka">
      {zPodpisem && (
        <p id={idPodpisu} className="mvd-kt-podpis-tabeli" data-testid={`inspektor-karta-tabela-${tabela.klucz}-podpis`}>
          {tabela.podpis}
        </p>
      )}
      {/* Obszar przewijany w poziomie: fokus klawiatury (strzałki przewijają), nazwany podpisem.
          Tabela zwarta zawija komórki w szerokości inspektora — przewijanie zostaje zabezpieczeniem. */}
      <div
        className="mvd-kt-tabela-przewijanie"
        role="region"
        aria-labelledby={idPodpisu}
        tabIndex={0}
        data-testid={`inspektor-karta-tabela-${tabela.klucz}-przewijanie`}
      >
        <table
          className={tabela.zwarta ? 'mvd-kt-tabela mvd-kt-tabela-zwarta' : 'mvd-kt-tabela'}
          data-testid={`inspektor-karta-tabela-${tabela.klucz}`}
          data-zwarta={tabela.zwarta ? 'true' : 'false'}
          aria-labelledby={idPodpisu}
        >
          <thead>
            <tr>
              {tabela.kolumny.map((k) => (
                <th key={k.klucz} scope="col" className={k.liczbowa ? 'mvd-kt-liczba' : undefined}>
                  {k.etykieta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabela.wiersze.map((w) => (
              <tr key={w.klucz} data-testid={`inspektor-karta-wiersz-${tabela.klucz}`} data-klucz={w.klucz}>
                {tabela.kolumny.map((k, i) => {
                  const wartosc = w.komorki[k.klucz] ?? null;
                  const tekst = <span className={wartosc === null ? 'mvd-kt-brak' : undefined}>{wartosc ?? BRAK_DANYCH_PL}</span>;
                  const cel = i === 0 && onOtworz && w.cel ? w.cel : null;
                  return (
                    <td
                      key={k.klucz}
                      data-kolumna={k.klucz}
                      data-brak={wartosc === null ? 'true' : 'false'}
                      className={k.liczbowa ? 'mvd-kt-liczba' : undefined}
                    >
                      {cel ? (
                        <button
                          type="button"
                          className="mvd-kt-odnosnik"
                          data-testid={`inspektor-karta-otworz-${tabela.klucz}`}
                          title="Otwórz kartę aparatu"
                          onClick={() => onOtworz?.(cel)}
                        >
                          {tekst}
                        </button>
                      ) : (
                        tekst
                      )}
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

/**
 * „Konfiguruj GPZ” — przejście do JEDYNEGO edytora GPZ: konfiguratora GPZ (E-10) na karcie
 * „Sekcje SN” (deep-link `payload.defaultCard`, czytany przez `gpzDefaultCard`
 * w `GpzConfiguratorSurface.tsx`; ten sam mechanizm co akcje menu schematu w `sldActionExecutor`).
 */
function PrzyciskKonfiguratoraGpz({ zrodloGpzRef }: { readonly zrodloGpzRef: string }): JSX.Element {
  const openRouteSurface = useNetworkBuildStore((stan) => stan.openRouteSurface);
  return (
    <button
      type="button"
      className="mvd-btn mvd-kt-zmien"
      data-testid="inspektor-karta-konfiguruj-gpz"
      onClick={() =>
        openRouteSurface('E-10', {
          entityRef: zrodloGpzRef,
          subjectKind: 'helper_context',
          payload: { defaultCard: 'sections' },
        })
      }
    >
      Konfiguruj GPZ
    </button>
  );
}

function Sekcja({
  sekcja,
  onEdytuj,
  onOtworz,
}: {
  readonly sekcja: SekcjaKarty;
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  readonly onOtworz: ((cel: CelWierszaTabeli) => void) | null;
}): JSX.Element {
  const idNaglowka = `inspektor-karta-${sekcja.id}-tytul`;
  return (
    <section className="mvd-kt-sekcja" data-testid={`inspektor-karta-${sekcja.id}`} aria-labelledby={idNaglowka}>
      {sekcja.konfiguratorGpzRef && onEdytuj ? (
        <div className="mvd-kt-naglowek-sekcji">
          <h4 id={idNaglowka} className="mvd-kt-tytul">
            {sekcja.tytul}
          </h4>
          <PrzyciskKonfiguratoraGpz zrodloGpzRef={sekcja.konfiguratorGpzRef} />
        </div>
      ) : (
        <h4 id={idNaglowka} className="mvd-kt-tytul">
          {sekcja.tytul}
        </h4>
      )}
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
          {(sekcja.tabele ?? []).map((t, _i, tabele) => (
            <TabelaDanych key={t.klucz} tabela={t} idTytuluSekcji={idNaglowka} zPodpisem={tabele.length > 1} onOtworz={onOtworz} />
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
  onOtworz,
}: {
  readonly karta: KartaTechniczna;
  /** `null` — tryb bez edycji modelu (wyniki, tylko do odczytu): przyciski „Zmień" ukryte. */
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  /** Otwarcie karty obiektu z wiersza tabeli (aparat pola); brak — wiersze bez przejścia. */
  readonly onOtworz?: ((cel: CelWierszaTabeli) => void) | null;
}): JSX.Element {
  return (
    <div className="mvd-kt" data-testid="inspektor-karta" data-rodzaj-karty={karta.rodzaj}>
      {karta.sekcje.map((s) => (
        <Sekcja key={s.id} sekcja={s} onEdytuj={onEdytuj} onOtworz={onOtworz ?? null} />
      ))}
    </div>
  );
}
