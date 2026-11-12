/**
 * K6 (Z-12) — render karty technicznej obiektu (`ui/sld/shared/kartaTechnicznaElementu.ts`)
 * w prawym inspektorze. Sekcje w kolejności pracy projektanta; brak danej = opis braku z modelu
 * (`WierszKarty.brakPl`: czego brakuje i jak to uzupełnić; brak z edycją jest przyciskiem);
 * źródło danych przy danych tabliczki i znamionowych. Tabele (pola rozdzielnicy, przyłączenia,
 * aparaty pola) mają jeden wiersz na obiekt z nagłówkiem kolumn; tabela zwarta mieści się
 * w szerokości inspektora (komórki zawijają się, liczby nie — jednostka w nagłówku), inna przewija
 * się w poziomie z pierwszą kolumną przy krawędzi (`ui2/theme/komponenty.css`). Podpis tabeli
 * tylko wtedy, gdy sekcja ma więcej niż jedną tabelę — inaczej powtarzałby tytuł sekcji. Wiersz
 * z celem (aparat pola) otwiera kartę tego obiektu (szczegóły na żądanie).
 * Zmiana wartości wyłącznie operacją domenową (kreator edycji parametrów),
 * a przycisk „Zmień" pojawia się tylko w trybie edycji modelu.
 */
import { useEffect, useRef, type JSX, type ReactNode } from 'react';

import { TekstZWzorami, tekstBezWzorow } from '../../../ui2/kreatory/rama/tekstZWzorami';

import {
  BRAK_DANYCH_PL,
  ID_SEKCJI_KATALOGU,
  type AkcjaWiersza,
  type AkcjaWierszaKarty,
  type CelAkcjiKarty,
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
  onAkcja,
}: {
  readonly wiersz: WierszKarty;
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  readonly onAkcja: ((akcja: AkcjaWiersza) => void) | null;
}): JSX.Element {
  const brak = wiersz.wartosc === null;
  const edycja = onEdytuj && wiersz.edycja ? wiersz.edycja : null;
  const akcja = onAkcja && wiersz.akcja ? wiersz.akcja : null;
  const tekstBraku = wiersz.brakPl ?? BRAK_DANYCH_PL;
  return (
    <div className="mvd-kt-wiersz" data-testid={`inspektor-karta-pole-${wiersz.klucz}`} data-brak={brak ? 'true' : 'false'}>
      <dt className="mvd-kt-etykieta"><TekstZWzorami tekst={wiersz.etykieta} /></dt>
      <dd className="mvd-kt-wartosc">
        {brak && edycja ? (
          // Brak z edycją jest akcją: opis braku („bez numeru dyspozytorskiego — nadaj numer”)
          // otwiera kreator edycji tego parametru — zamiast opisu i osobnego „Zmień”.
          <button
            type="button"
            className="mvd-kt-odnosnik mvd-kt-brak mvd-kt-brak-akcja"
            data-testid={`inspektor-karta-zmien-${wiersz.klucz}`}
            aria-label={`Uzupełnij: ${tekstBezWzorow(wiersz.etykieta)}`}
            onClick={() => onEdytuj?.(edycja)}
          >
            <span data-testid={`inspektor-karta-wartosc-${wiersz.klucz}`}>{tekstBraku}</span>
          </button>
        ) : (
          <span className={brak ? 'mvd-kt-brak' : undefined} data-testid={`inspektor-karta-wartosc-${wiersz.klucz}`}>
            {wiersz.wartosc ?? tekstBraku}
          </span>
        )}
        {wiersz.zrodloPl && <span className="mvd-kt-zrodlo-wiersza">źródło: {wiersz.zrodloPl}</span>}
        {edycja && !brak && (
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
        {akcja && (
          <button
            type="button"
            className="mvd-btn mvd-kt-zmien"
            data-testid={`inspektor-karta-akcja-${wiersz.klucz}`}
            onClick={() => onAkcja?.(akcja)}
          >
            {akcja.etykietaPl}
          </button>
        )}
      </dd>
      {/* Lista pozycji pod parą etykieta–liczba, na całą szerokość karty: liczba stoi w wierszu
          etykiety, pozycje niżej (bez samotnej liczby w osobnej linii). */}
      {wiersz.lista && wiersz.lista.length > 0 && (
        <dd className="mvd-kt-lista-pozycje">
          <ul className="mvd-kt-lista" data-testid={`inspektor-karta-lista-${wiersz.klucz}`}>
            {wiersz.lista.map((pozycja, i) => (
              <li key={`${i}-${pozycja}`}>{pozycja}</li>
            ))}
          </ul>
        </dd>
      )}
    </div>
  );
}

/** Obsługa akcji wiersza tabeli: `null` — akcja tego celu niedostępna (np. operacja modelu poza
 *  trybem edycji) i przycisku nie ma (bez atrapy). */
export type ObslugaAkcjiKarty = (cel: CelAkcjiKarty) => (() => void) | null;

function TabelaDanych({
  tabela,
  idTytuluSekcji,
  zPodpisem,
  onOtworz,
  onAkcjaKarty,
}: {
  readonly tabela: TabelaKarty;
  /** Tytuł sekcji nazywa tabelę, gdy podpisu nie ma (jedyna tabela sekcji). */
  readonly idTytuluSekcji: string;
  readonly zPodpisem: boolean;
  readonly onOtworz: ((cel: CelWierszaTabeli) => void) | null;
  readonly onAkcjaKarty: ObslugaAkcjiKarty | null;
}): JSX.Element {
  if (tabela.wiersze.length === 0) {
    return (
      <p className="mvd-kt-brak" data-testid={`inspektor-karta-tabela-${tabela.klucz}-pusta`}>
        {tabela.pustaPl}
      </p>
    );
  }
  const idPodpisu = zPodpisem ? `inspektor-karta-tabela-${tabela.klucz}-podpis` : idTytuluSekcji;
  const kolumnaAkcji =
    onAkcjaKarty !== null && tabela.wiersze.some((w) => w.akcja && onAkcjaKarty(w.akcja.cel) !== null);
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
                  <TekstZWzorami tekst={k.etykieta} />
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
              <tr key={w.klucz} data-testid={`inspektor-karta-wiersz-${tabela.klucz}`} data-klucz={w.klucz}>
                {tabela.kolumny.map((k, i) => {
                  // Kolumna objęta komórką poprzedniej (`WierszTabeli.polaczone`) — bez własnej komórki.
                  if (w.polaczone?.includes(k.klucz)) return null;
                  let rozpietosc = 1;
                  while (w.polaczone?.includes(tabela.kolumny[i + rozpietosc]?.klucz ?? '')) rozpietosc += 1;
                  const wartosc = w.komorki[k.klucz] ?? null;
                  const tekst = <span className={wartosc === null ? 'mvd-kt-brak' : undefined}>{wartosc ?? BRAK_DANYCH_PL}</span>;
                  const cel = i === 0 && onOtworz && w.cel ? w.cel : null;
                  return (
                    <td
                      key={k.klucz}
                      colSpan={rozpietosc > 1 ? rozpietosc : undefined}
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
                {kolumnaAkcji && (
                  <td data-kolumna="akcja">
                    <PrzyciskAkcji akcja={w.akcja} onAkcja={onAkcjaKarty} opisWiersza={w.komorki[tabela.kolumny[0]?.klucz ?? ''] ?? w.klucz} />
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
  onOtworz,
  onAkcja,
  onAkcjaKarty,
  wyrozniona,
}: {
  readonly sekcja: SekcjaKarty;
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  readonly onOtworz: ((cel: CelWierszaTabeli) => void) | null;
  readonly onAkcja: ((akcja: AkcjaWiersza) => void) | null;
  readonly onAkcjaKarty: ObslugaAkcjiKarty | null;
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
                <WierszDanych key={w.klucz} wiersz={w} onEdytuj={onEdytuj} onAkcja={onAkcja} />
              ))}
            </dl>
          )}
          {(sekcja.tabele ?? []).map((t, _i, tabele) => (
            <TabelaDanych
              key={t.klucz}
              tabela={t}
              idTytuluSekcji={idNaglowka}
              zPodpisem={tabele.length > 1}
              onOtworz={onOtworz}
              onAkcjaKarty={onAkcjaKarty}
            />
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
  onAkcja,
  onAkcjaKarty = null,
  sekcjaWyrozniona = null,
  przedKatalogiem = null,
}: {
  readonly karta: KartaTechniczna;
  /** Stany i wyniki obiektu — renderowane po parametrach i połączeniach, przed sekcją „Katalog”
   *  (karta INSPEKTOR-I-NAWIGACJA, kolejność paneli 1–6). */
  readonly przedKatalogiem?: ReactNode;
  /** `null` — tryb bez edycji modelu (wyniki, tylko do odczytu): przyciski „Zmień" ukryte. */
  readonly onEdytuj: ((edycja: EdycjaWiersza) => void) | null;
  /** Otwarcie karty obiektu z wiersza tabeli (aparat pola); brak — wiersze bez przejścia. */
  readonly onOtworz?: ((cel: CelWierszaTabeli) => void) | null;
  /** Operacja usuwająca brak (np. „dodaj zabezpieczenie”) — tylko w trybie edycji modelu. */
  readonly onAkcja?: ((akcja: AkcjaWiersza) => void) | null;
  /** Akcje wierszy tabel (przejście do nastaw: ekran E-27 albo operacja modelu); `null` — bez
   *  przycisków. */
  readonly onAkcjaKarty?: ObslugaAkcjiKarty | null;
  /** Id sekcji, do której prowadzi kliknięty obiekt rysunku (`null` — żadna). */
  readonly sekcjaWyrozniona?: string | null;
}): JSX.Element {
  const sekcja = (s: SekcjaKarty) => (
    <Sekcja
      key={s.id}
      sekcja={s}
      onEdytuj={onEdytuj}
      onOtworz={onOtworz ?? null}
      onAkcja={onEdytuj ? onAkcja ?? null : null}
      onAkcjaKarty={onAkcjaKarty}
      wyrozniona={s.id === sekcjaWyrozniona}
    />
  );
  return (
    <div
      className="mvd-kt"
      data-testid="inspektor-karta"
      data-rodzaj-karty={karta.rodzaj}
      data-element-ref={karta.elementRef}
      data-stacja-ref={karta.stacjaRef ?? undefined}
      data-stacja-nazwa={karta.stacjaNazwa ?? undefined}
    >
      {karta.sekcje.filter((s) => s.id !== ID_SEKCJI_KATALOGU).map(sekcja)}
      {przedKatalogiem}
      {karta.sekcje.filter((s) => s.id === ID_SEKCJI_KATALOGU).map(sekcja)}
    </div>
  );
}
