/*
 * EkranAnalizAkademickich — okno „Analizy akademickie" (ui2/wyniki/akademickie).
 *
 * Domyka wiersz „Pakiet akademicki V12.6" inwentarza (◐): CZTERNAŚCIE rodzajów analiz
 * kontraktu `V126AnalysisType` miało jedną powierzchnię zastaną `V126AcademicSurface`
 * (334 wiersze, ZERO testów) osiągalną tylko przez ekrany E-40…E-50, a dwa rodzaje
 * (`neutral_earthing_design`, `earth_fault_detection`) nie miały żadnego wejścia.
 *
 * Okno jest PARAMETRYZOWANE RODZAJEM, a nie powielone czternaście razy — decyzja
 * z pomiaru kontraktu: wszystkie rodzaje dzielą identyczne koperty odpowiedzi
 * (`AcademicAnalysisResultV1`, `AcademicWhiteBoxTraceV1`, `AcademicProofPackV1`,
 * `AcademicReportV1`), a różnią się wyłącznie zawartością słownika `result` i
 * zestawem parametrów wejściowych. Jedyny rodzaj z DODATKOWYM kontraktem —
 * `ssci_impedance` (`…/stability`, werdykt Nyquista) — zachowuje własne okno
 * „Stabilność SSCI"; to okno kieruje do niego zamiast duplikować werdykt.
 *
 * Naprawy wobec powierzchni zastanej (klasa, nie instancja):
 *  - ślad, dowód i raport BEZ zaszytych limitów (`slice(0,8)` / `slice(0,3)`);
 *  - wynik spłaszczany W CAŁOŚCI (`slice(0,18)/(0,8)/(0,6)` gubiło do 11 pól);
 *  - lista rodzajów Z KATALOGU backendu, nie z kopii kontraktu w kodzie ekranu;
 *  - ZERO zaszytych danych wejściowych (koniec fabrykowanego silnika 630 kW);
 *  - kolory wyłącznie przez tokeny `--mvd-*`;
 *  - świeżość z JEDNEGO źródła (`useSwiezoscWynikow` — wspólny kontrakt E15.2).
 *
 * Zero fizyki w UI: wszystkie wielkości pochodzą z solvera; okno je porządkuje.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import './akademickie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useAppStateStore } from '../../../ui/app-state';
import { useShellStore } from '../../shell/useShellStore';
import { opisSwiezosci, useSwiezoscWynikow } from '../../freshness';
import { PrzyciskAkcjiStanu, useAkcjaPrzejdzDoPrzypadkow } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';
import {
  pobierzDowod,
  pobierzKatalog,
  pobierzRaport,
  pobierzRodzajeAnaliz,
  pobierzSlad,
  pobierzWynik,
  utworzPrzebieg,
  type OdpowiedzWyniku,
  type OdpowiedzSladu,
  type PakietDowodu,
  type PrzebiegAkademicki,
  type RaportAnalizy,
  type RodzajAnalizy,
} from './api';
import { katalogRodzaju } from './katalog';
import {
  krokiDowoduDoWidoku,
  krokiSladuDoWidoku,
  licznikMetrykRaportu,
  pogrupujWynik,
  sekcjeRaportuDoWidoku,
  splaszczWynik,
} from './model';
import {
  MAPA_WIARYGODNOSCI,
  NAZWY_BRAKUJACYCH_POL,
  NAZWY_PARAMETROW,
  NAZWY_WARTOSCI,
  PREZENTACJA,
  SCIEZKA_BRAKOW,
  SCIEZKA_WIARYGODNOSCI,
  odczytaj,
  type TabelaObiektow,
} from './prezentacja';
import { maParametry, zbudujParametry, type StanPol, type WierszListy } from './parametry';
import { FormularzParametrow } from './FormularzParametrow';
import { useNazwaObiektu } from './useNazwaObiektu';
import {
  AKADEMICKIE_STRINGS as S,
  etykietaRodzaju,
  etykietaStanuPrzebiegu,
  fmtWartosc,
  opisRodzaju,
  type IstotnoscStanu,
} from './strings';

// ---------------------------------------------------------------------------
// Panele stanu
// ---------------------------------------------------------------------------

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
  akcja,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
  akcja?: AkcjaStanuZerowego;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-akad-stan mvd-akad-stan--blad' : 'mvd-akad-stan'}
      data-testid={testid}
    >
      <p className="mvd-akad-stan-title">{komunikat}</p>
      {opis && <p className="mvd-akad-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

function Zwijana({
  tytul,
  licznik,
  opis,
  testid,
  pokaz,
  ukryj,
  domyslnieOtwarte,
  children,
}: {
  tytul: string;
  licznik: string;
  opis?: string;
  testid: string;
  pokaz: string;
  ukryj: string;
  domyslnieOtwarte?: boolean;
  children: React.ReactNode;
}) {
  const [otwarte, setOtwarte] = useState(domyslnieOtwarte === true);
  return (
    <section className="mvd-akad-sekcja" data-testid={testid}>
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{tytul}</h3>
        <span className="mvd-akad-licznik mvd-num" data-testid={`${testid}-licznik`}>
          {licznik}
        </span>
        <button
          type="button"
          className="mvd-akad-btn-wtorny"
          aria-expanded={otwarte}
          data-testid={`${testid}-przelacz`}
          onClick={() => setOtwarte((stan) => !stan)}
        >
          {otwarte ? ukryj : pokaz}
        </button>
      </div>
      {opis && <p className="mvd-akad-opis">{opis}</p>}
      {otwarte && children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// EKRAN INŻYNIERSKI — werdykt · wielkości · obiekty · wiarygodność
// ---------------------------------------------------------------------------

/** Chip werdyktu (istotność steruje wyłącznie kolorem tokenowym). */
function Chip({ tekst, istotnosc, testid }: { tekst: string; istotnosc: IstotnoscStanu; testid?: string }) {
  return (
    <span className={`mvd-akad-chip mvd-akad-chip--${istotnosc}`} data-testid={testid}>
      {tekst}
    </span>
  );
}

/**
 * Werdykt analizy — CYTAT pola statusu z odpowiedzi solvera. Zero ocen w UI:
 * dla werdyktu zbiorczego okno zlicza wystąpienia wartości statusu (jak licznik
 * wierszy tabeli), a nie porównuje liczb z progiem.
 */
function PanelWerdyktu({ rodzaj, payload }: { rodzaj: string; payload: unknown }) {
  const projekt = PREZENTACJA[rodzaj as RodzajAnalizy];
  if (!projekt) return null;
  const w = projekt.werdykt;

  let tresc: React.ReactNode;
  if (w.rodzaj === 'pojedynczy') {
    // Pierwsza OBECNA ścieżka wygrywa (dobór uziemienia melduje werdykt pod
    // innym kluczem, gdy danych wejściowych brakuje) — zero podstawiania.
    const surowa = w.sciezki
      .map((sciezka) => odczytaj(payload, sciezka))
      .find((wartosc) => typeof wartosc === 'string');
    const wpis = typeof surowa === 'string' ? w.mapa[surowa] : undefined;
    tresc = wpis ? (
      <Chip tekst={wpis.tekst} istotnosc={wpis.istotnosc} testid="mvd-akad-werdykt-chip" />
    ) : (
      <Chip tekst={S.werdyktBrak} istotnosc="neutral" testid="mvd-akad-werdykt-chip" />
    );
  } else if (w.rodzaj === 'zbiorczy') {
    const tablica = odczytaj(payload, w.sciezkaTablicy);
    const elementy = Array.isArray(tablica) ? tablica : [];
    const spelnione = elementy.filter(
      (element) => String(odczytaj(element, w.kluczStatusu)) === w.wartoscSpelniona,
    ).length;
    const wszystkieSpelnione = elementy.length > 0 && spelnione === elementy.length;
    tresc =
      elementy.length === 0 ? (
        <Chip tekst={S.werdyktBrak} istotnosc="neutral" testid="mvd-akad-werdykt-chip" />
      ) : (
        <Chip
          tekst={S.werdyktZbiorczy(spelnione, elementy.length, w.obiektyDopelniacz)}
          istotnosc={wszystkieSpelnione ? 'ok' : 'err'}
          testid="mvd-akad-werdykt-chip"
        />
      );
  } else {
    const wartosc = odczytaj(payload, w.sciezka);
    tresc =
      wartosc === undefined || wartosc === null ? (
        <Chip tekst={S.werdyktBrak} istotnosc="neutral" testid="mvd-akad-werdykt-chip" />
      ) : (
        <Chip
          tekst={`${fmtWartosc(wartosc)} ${w.jednostka} — ${S.werdyktWartosc}`}
          istotnosc="neutral"
          testid="mvd-akad-werdykt-chip"
        />
      );
  }

  return (
    <section className="mvd-akad-sekcja mvd-akad-werdykt" data-testid="mvd-akad-werdykt">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.werdyktTytul}</h3>
        {tresc}
      </div>
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.kryteriumEtykieta}</span>
          <span className="mvd-akad-wiersz-wartosc">{projekt.kryterium}</span>
        </div>
        {projekt.norma !== undefined && (
          <div className="mvd-akad-wiersz">
            <span className="mvd-akad-wiersz-etyk">{S.normaEtykieta}</span>
            <span className="mvd-akad-wiersz-wartosc">{projekt.norma}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Wielkości główne — liczba + jednostka + (gdy solver ją zwraca) odniesienie. */
function PanelWielkosci({ rodzaj, payload }: { rodzaj: string; payload: unknown }) {
  const projekt = PREZENTACJA[rodzaj as RodzajAnalizy];
  if (!projekt) return null;
  const obecne = projekt.wielkosciGlowne.filter((pole) => {
    const wartosc = odczytaj(payload, pole.sciezka);
    return wartosc !== undefined && wartosc !== null;
  });
  if (obecne.length === 0) return null;

  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-wielkosci">
      <h3 className="mvd-akad-sekcja-tytul">{S.wielkosciTytul}</h3>
      <p className="mvd-akad-opis">{S.wielkosciOpis}</p>
      <div className="mvd-akad-wiersze">
        {obecne.map((pole) => {
          const wartosc = odczytaj(payload, pole.sciezka);
          const odniesienie =
            pole.odniesienieSciezka === undefined
              ? undefined
              : odczytaj(payload, pole.odniesienieSciezka);
          return (
            <div className="mvd-akad-wiersz" key={pole.sciezka}>
              <span className="mvd-akad-wiersz-etyk">{pole.etykieta}</span>
              <span className="mvd-akad-wiersz-wartosc mvd-num">
                {fmtPole(wartosc)}
                {pole.jednostka !== undefined && ` ${pole.jednostka}`}
                {odniesienie !== undefined && odniesienie !== null && (
                  <span className="mvd-akad-odniesienie">
                    {` (${pole.odniesienieEtykieta ?? S.odniesienieDomyslne}: ${fmtWartosc(odniesienie)}`}
                    {pole.jednostka !== undefined && ` ${pole.jednostka}`}
                    {')'}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Formatuje wartość do postaci widocznej dla projektanta: wartości słownikowe
 * solvera (kody metod, sposobów uziemienia, celów optymalizacji) przechodzą
 * przez słownik polski; reszta — przez wspólny formater liczb.
 */
function fmtPole(wartosc: unknown): string {
  if (typeof wartosc === 'string' && NAZWY_WARTOSCI[wartosc] !== undefined) {
    return NAZWY_WARTOSCI[wartosc];
  }
  return fmtWartosc(wartosc);
}

/** Tabela obiektów analizy — obiekty nazwane tak, jak nazywa je schemat. */
function PanelObiektow({
  tabela,
  payload,
  nazwaObiektu,
}: {
  tabela: TabelaObiektow;
  payload: unknown;
  nazwaObiektu: (ref: string) => string;
}) {
  /**
   * Etykieta obiektu wiersza. Dla rankingu niepewności referencja niesie
   * DODATKOWO klucz parametru (`<ref>.<parametr>`) — rozbijamy ją, żeby wiersz
   * mówił „transformator TR1 · napięcie zwarcia", a nie pokazywał ścieżki klucza.
   */
  const etykietaWiersza = (surowa: string): string => {
    if (!tabela.refZParametrem) return nazwaObiektu(surowa);
    const granica = surowa.lastIndexOf('.');
    if (granica < 0) return nazwaObiektu(surowa);
    const ref = surowa.slice(0, granica);
    const parametr = surowa.slice(granica + 1);
    return `${nazwaObiektu(ref)} · ${NAZWY_PARAMETROW[parametr] ?? parametr}`;
  };
  const surowa = odczytaj(payload, tabela.sciezka);
  const wiersze = Array.isArray(surowa) ? surowa : [];
  return (
    <section className="mvd-akad-sekcja" data-testid={`mvd-akad-obiekty-${tabela.sciezka}`}>
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{tabela.tytul}</h3>
        <span className="mvd-akad-licznik mvd-num">{S.wynikPozycji(wiersze.length)}</span>
      </div>
      {wiersze.length === 0 ? (
        <p className="mvd-akad-opis">{S.obiektyBrak}</p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela">
            <thead>
              <tr>
                <th>{tabela.etykietaRef}</th>
                {tabela.kolumny.map((kolumna) => (
                  <th key={kolumna.klucz}>
                    {kolumna.etykieta}
                    {kolumna.jednostka !== undefined && ` [${kolumna.jednostka}]`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wiersze.map((wiersz, indeks) => {
                const ref = String(odczytaj(wiersz, tabela.kluczRef) ?? '');
                return (
                  <tr key={`${ref}:${indeks}`}>
                    <td>{etykietaWiersza(ref)}</td>
                    {tabela.kolumny.map((kolumna) => {
                      const wartosc = odczytaj(wiersz, kolumna.klucz);
                      if (kolumna.mapaStatusu !== undefined) {
                        const wpis = kolumna.mapaStatusu[String(wartosc)];
                        return (
                          <td key={kolumna.klucz}>
                            {wpis ? (
                              <Chip tekst={wpis.tekst} istotnosc={wpis.istotnosc} />
                            ) : (
                              S.kreska
                            )}
                          </td>
                        );
                      }
                      // Kolumna referencyjna (np. szyna przyłączenia silnika) też
                      // dostaje nazwę ze schematu — inaczej surowy ref wracałby
                      // bokiem, w innej kolumnie tej samej tabeli.
                      const czyRef = kolumna.klucz.endsWith('_ref');
                      return (
                        <td key={kolumna.klucz} className={czyRef ? undefined : 'mvd-num'}>
                          {czyRef ? nazwaObiektu(String(wartosc ?? '')) : fmtPole(wartosc)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Uczciwy stan niekompletny — solver melduje brak danych zamiast fabrykować
 * werdykt. Panel pokazuje JEGO komunikat (już po polsku) i listę brakujących
 * danych nazwanych po ludzku, a nie kluczami kontraktu.
 */
function PanelBrakow({ payload }: { payload: unknown }) {
  const komunikat = odczytaj(payload, SCIEZKA_BRAKOW.komunikat);
  const braki = odczytaj(payload, SCIEZKA_BRAKOW.brakujacePola);
  const listaBrakow = Array.isArray(braki) ? braki.map(String) : [];
  if (typeof komunikat !== 'string' && listaBrakow.length === 0) return null;
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-braki">
      <h3 className="mvd-akad-sekcja-tytul">{S.brakiTytul}</h3>
      {typeof komunikat === 'string' && <p className="mvd-akad-opis">{komunikat}</p>}
      {listaBrakow.length > 0 && (
        <>
          <p className="mvd-akad-opis">{S.brakiLista}</p>
          <ul className="mvd-akad-naruszenia" data-testid="mvd-akad-braki-lista">
            {listaBrakow.map((pole) => (
              <li key={pole}>{NAZWY_BRAKUJACYCH_POL[pole] ?? pole}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Wiarygodność wyniku — blok `sanity` solvera (kontrola granic fizycznych). */
function PanelWiarygodnosci({ payload }: { payload: unknown }) {
  const status = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.status);
  if (typeof status !== 'string') return null;
  const wpis = MAPA_WIARYGODNOSCI[status];
  const lacznie = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.sprawdzenLacznie);
  const zdane = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.sprawdzenZdanych);
  const naruszeniaSurowe = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.naruszenia);
  const naruszenia = Array.isArray(naruszeniaSurowe) ? naruszeniaSurowe : [];
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-wiarygodnosc">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.wiarygodnoscTytul}</h3>
        <Chip
          tekst={wpis?.tekst ?? status}
          istotnosc={wpis?.istotnosc ?? 'neutral'}
          testid="mvd-akad-wiarygodnosc-chip"
        />
        {typeof lacznie === 'number' && typeof zdane === 'number' && (
          <span className="mvd-akad-licznik mvd-num">{S.wiarygodnoscSprawdzen(zdane, lacznie)}</span>
        )}
      </div>
      <p className="mvd-akad-opis">{S.wiarygodnoscOpis}</p>
      {naruszenia.length > 0 && (
        <ul className="mvd-akad-naruszenia" data-testid="mvd-akad-wiarygodnosc-naruszenia">
          {naruszenia.map((naruszenie, indeks) => (
            <li key={indeks}>{String(odczytaj(naruszenie, 'detail_pl') ?? S.kreska)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Zapis techniczny odpowiedzi solvera — ZWINIĘTY, jawnie opisany jako materiał
 * audytowy. Pełne spłaszczenie zostaje (karta V126-OKNA: limit ma wynikać
 * z danych), ale przestaje udawać ekran projektanta: nazwy pól są tu nazwami
 * kontraktu obliczeniowego i tak są podpisane.
 */
function PanelZapisuTechnicznego({ wynik }: { wynik: OdpowiedzWyniku }) {
  const wiersze = useMemo(() => splaszczWynik(wynik.result.result), [wynik]);
  const grupy = useMemo(() => pogrupujWynik(wiersze), [wiersze]);

  return (
    <Zwijana
      tytul={S.surowyTytul}
      opis={S.surowyOpis}
      licznik={S.wynikLiczbaPol(wiersze.length)}
      testid="mvd-akad-wynik"
      pokaz={S.surowyPokaz}
      ukryj={S.surowyUkryj}
    >
      {wiersze.length === 0 ? (
        <p className="mvd-akad-opis">{S.wynikPusty}</p>
      ) : (
        <div data-mvd-zapis-techniczny="1">
          {grupy.map((grupa) => (
            <div
              className="mvd-akad-grupa"
              key={grupa.klucz}
              data-testid={`mvd-akad-grupa-${grupa.klucz}`}
            >
              <h4 className="mvd-akad-grupa-tytul">{grupa.klucz}</h4>
              <div className="mvd-akad-wiersze">
                {grupa.wiersze.map((wiersz) => (
                  <div className="mvd-akad-wiersz" key={wiersz.sciezka}>
                    <span className="mvd-akad-wiersz-etyk">{wiersz.sciezka}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">
                      {fmtWartosc(wiersz.wartosc)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX — komplet kroków
// ---------------------------------------------------------------------------

function PanelSladu({ slad }: { slad: OdpowiedzSladu }) {
  const kroki = krokiSladuDoWidoku(slad.steps);
  return (
    <Zwijana
      tytul={S.sladTytul}
      opis={S.sladOpis}
      licznik={S.sladKrokow(kroki.length)}
      testid="mvd-akad-slad"
      pokaz={S.sladPokaz}
      ukryj={S.sladUkryj}
    >
      {kroki.length === 0 ? (
        <p className="mvd-akad-opis">{S.sladPusty}</p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela">
            <thead>
              <tr>
                <th>{S.sladKolKrok}</th>
                <th>{S.sladKolWzor}</th>
                <th>{S.sladKolPodstawienie}</th>
                <th>{S.sladKolWynik}</th>
                <th>{S.sladKolJednostka}</th>
              </tr>
            </thead>
            <tbody>
              {kroki.map((krok) => (
                <tr key={krok.proof_ref} data-testid={`mvd-akad-slad-krok-${krok.step}`}>
                  <td className="mvd-num">{krok.step}</td>
                  <td className="mvd-num">{krok.formula}</td>
                  <td>{krok.substitution}</td>
                  <td className="mvd-num">{krok.result_pl ?? S.kreska}</td>
                  <td>{krok.unit_check}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Dowód — komplet kroków pakietu
// ---------------------------------------------------------------------------

function PanelDowodu({ dowod }: { dowod: PakietDowodu }) {
  const kroki = krokiDowoduDoWidoku(dowod.steps);
  return (
    <Zwijana
      tytul={S.dowodTytul}
      opis={S.dowodOpis}
      licznik={S.sladKrokow(kroki.length)}
      testid="mvd-akad-dowod"
      pokaz={S.dowodPokaz}
      ukryj={S.dowodUkryj}
    >
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodId}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.proof_id}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodOdcisk}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.proof_hash}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodKrokow}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.trace_step_count}</span>
        </div>
      </div>
      {kroki.length === 0 ? (
        <p className="mvd-akad-opis">{S.dowodPusty}</p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela">
            <thead>
              <tr>
                <th>{S.sladKolKrok}</th>
                <th>{S.sladKolWzor}</th>
                <th>{S.sladKolPodstawienie}</th>
                <th>{S.sladKolWynik}</th>
                <th>{S.sladKolJednostka}</th>
              </tr>
            </thead>
            <tbody>
              {kroki.map((krok) => (
                <tr key={krok.proof_ref} data-testid={`mvd-akad-dowod-krok-${krok.ordinal}`}>
                  <td className="mvd-num">{krok.ordinal}</td>
                  <td className="mvd-num">{krok.formula ?? S.kreska}</td>
                  <td>{krok.substitution ?? S.kreska}</td>
                  <td className="mvd-num">{krok.result_pl ?? S.kreska}</td>
                  <td>{krok.unit_check ?? S.kreska}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Raport — komplet sekcji i metryk
// ---------------------------------------------------------------------------

function PanelRaportu({ raport }: { raport: RaportAnalizy }) {
  const sekcje = sekcjeRaportuDoWidoku(raport);
  return (
    <Zwijana
      tytul={S.raportTytul}
      opis={S.raportOpis}
      licznik={`${S.raportSekcji(sekcje.length)} · ${S.raportMetryk(licznikMetrykRaportu(raport))}`}
      testid="mvd-akad-raport"
      pokaz={S.raportPokaz}
      ukryj={S.raportUkryj}
    >
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportId}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{raport.report_id}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportOdcisk}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{raport.report_hash}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportPolityka}</span>
          <span className="mvd-akad-wiersz-wartosc">{raport.export_policy}</span>
        </div>
      </div>
      {sekcje.length === 0 ? (
        <p className="mvd-akad-opis">{S.raportPusty}</p>
      ) : (
        sekcje.map((sekcja) => (
          <div className="mvd-akad-grupa" key={sekcja.section_id} data-testid={`mvd-akad-raport-sekcja-${sekcja.section_id}`}>
            <h4 className="mvd-akad-grupa-tytul">{sekcja.title}</h4>
            <div className="mvd-akad-wiersze">
              {sekcja.metrics.map((metryka) => (
                <div className="mvd-akad-wiersz" key={`${sekcja.section_id}:${metryka.label}`}>
                  <span className="mvd-akad-wiersz-etyk">{metryka.label}</span>
                  <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(metryka.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Dane odniesienia (katalog V12.6)
// ---------------------------------------------------------------------------

type StanKatalogu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly pozycje: readonly { sciezka: string; wartosc: unknown }[] };

function PanelKatalogu({ namespace }: { namespace: string }) {
  const [stan, setStan] = useState<StanKatalogu>({ rodzaj: 'idle' });
  const [otwarte, setOtwarte] = useState(false);

  const wczytaj = useCallback(() => {
    setStan({ rodzaj: 'ladowanie' });
    pobierzKatalog(namespace)
      .then((odpowiedz) => {
        const pozycje = splaszczWynik(odpowiedz.items).map((wiersz) => ({
          sciezka: wiersz.sciezka,
          wartosc: wiersz.wartosc,
        }));
        setStan({ rodzaj: 'gotowe', pozycje });
      })
      .catch((err: unknown) => {
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.katalogBlad });
      });
  }, [namespace]);

  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-katalog">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.katalogTytul}</h3>
        <button
          type="button"
          className="mvd-akad-btn-wtorny"
          aria-expanded={otwarte}
          data-testid="mvd-akad-katalog-przelacz"
          onClick={() => {
            const nastepny = !otwarte;
            setOtwarte(nastepny);
            if (nastepny && stan.rodzaj === 'idle') wczytaj();
          }}
        >
          {otwarte ? S.katalogUkryj : S.katalogPokaz}
        </button>
      </div>
      {otwarte && (
        <>
          <p className="mvd-akad-opis">{S.katalogOpis}</p>
          {stan.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.katalogLadowanie}</p>}
          {stan.rodzaj === 'blad' && (
            <StanPanel
              komunikat={S.katalogBlad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-akad-katalog-blad"
            />
          )}
          {stan.rodzaj === 'gotowe' && (
            <div className="mvd-akad-wiersze">
              {stan.pozycje.map((pozycja) => (
                <div className="mvd-akad-wiersz" key={pozycja.sciezka}>
                  <span className="mvd-akad-wiersz-etyk">{pozycja.sciezka}</span>
                  <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(pozycja.wartosc)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stany zasobów
// ---------------------------------------------------------------------------

interface KompletArtefaktow {
  readonly przebieg: PrzebiegAkademicki;
  readonly wynik: OdpowiedzWyniku;
  readonly slad: OdpowiedzSladu;
  readonly dowod: PakietDowodu;
  readonly raport: RaportAnalizy;
}

type StanBiegu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: KompletArtefaktow };

type StanRodzajow =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly kody: readonly string[] };

// ---------------------------------------------------------------------------
// Okno
// ---------------------------------------------------------------------------

export interface EkranAnalizAkademickichProps {
  readonly trybZaawansowania: AdvancementMode;
  /** Rodzaj wybrany z góry (wejście z ekranu trasowego) — użytkownik może go zmienić. */
  readonly rodzajPoczatkowy?: RodzajAnalizy;
}

export function EkranAnalizAkademickich({
  trybZaawansowania,
  rodzajPoczatkowy,
}: EkranAnalizAkademickichProps) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const akcjaPrzypadki = useAkcjaPrzejdzDoPrzypadkow();
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');
  const swiezosc = useSwiezoscWynikow();
  // Most ref → nazwa obiektu ze schematu (jedno źródło nazw z migawką ENM).
  const nazwaObiektu = useNazwaObiektu();

  const [rodzaje, setRodzaje] = useState<StanRodzajow>({ rodzaj: 'ladowanie' });
  const [wybrany, setWybrany] = useState<string>(rodzajPoczatkowy ?? '');
  const [stan, setStan] = useState<StanBiegu>({ rodzaj: 'idle' });

  const [pola, setPola] = useState<StanPol>({});
  const [uziom, setUziom] = useState<StanPol>({});
  const [metody, setMetody] = useState<readonly string[]>([]);
  const [wiersze, setWiersze] = useState<readonly WierszListy[]>([]);
  const [parametryOtwarte, setParametryOtwarte] = useState(false);

  const wczytajRodzaje = useCallback(() => {
    setRodzaje({ rodzaj: 'ladowanie' });
    pobierzRodzajeAnaliz()
      .then((kody) => {
        setRodzaje({ rodzaj: 'gotowe', kody });
        setWybrany((biezacy) => {
          if (biezacy !== '' && kody.includes(biezacy)) return biezacy;
          return kody[0] ?? '';
        });
      })
      .catch((err: unknown) => {
        setRodzaje({
          rodzaj: 'blad',
          komunikat: err instanceof Error ? err.message : S.rodzajeBlad,
        });
      });
  }, []);

  // Bez aktywnego przypadku okno nie ma czego uruchomić, więc NIE pyta backendu
  // o katalog rodzajów — stan zerowy jest w pełni lokalny (wzór `EkranSsci`).
  // V126-JEZYK: za bramą opracowania okno też milczy — brama zamyka również
  // ruch sieciowy, nie tylko rysunek (inaczej „ukryte" okno dalej pyta backend).
  useEffect(() => {
    if (activeCaseId === null || !trybEkspercki) return;
    wczytajRodzaje();
  }, [activeCaseId, trybEkspercki, wczytajRodzaje]);

  // Zmiana rodzaju zeruje wynik i formularz — parametry jednego rodzaju nie mogą
  // wyciec do żądania innego (klucze są rozłączne wg kontraktu solvera).
  const zmienRodzaj = (kod: string) => {
    setWybrany(kod);
    setStan({ rodzaj: 'idle' });
    setPola({});
    setUziom({});
    setMetody([]);
    setWiersze([]);
  };

  const uruchom = () => {
    if (activeCaseId === null || wybrany === '') return;
    const rodzajBiegu = wybrany as RodzajAnalizy;
    const parametry = zbudujParametry({ rodzaj: wybrany, pola, uziom, metody, wiersze });
    setStan({ rodzaj: 'ladowanie' });
    utworzPrzebieg(activeCaseId, rodzajBiegu, parametry)
      .then(async (przebieg) => {
        const [wynik, slad, dowod, raport] = await Promise.all([
          pobierzWynik(przebieg.run_id, rodzajBiegu),
          pobierzSlad(przebieg.run_id, rodzajBiegu),
          pobierzDowod(przebieg.run_id, rodzajBiegu),
          pobierzRaport(przebieg.run_id, rodzajBiegu),
        ]);
        setStan({ rodzaj: 'gotowe', dane: { przebieg, wynik, slad, dowod, raport } });
      })
      .catch((err: unknown) => {
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.blad });
      });
  };

  // V126-JEZYK: brama opracowania. Poza trybem eksperckim okno NIE renderuje
  // treści analizy — projektant na torze podstawowym nie ogląda pakietu, którego
  // część rodzajów nie ma jeszcze werdyktu z kryterium. Brama jest w oknie
  // (a nie tylko w pasku zakładek), bo wejść do zdolności są DWA: zakładka
  // warsztatu Wyników i powierzchnia trasowa E-40…E-50.
  if (!trybEkspercki) {
    return (
      <div className="mvd-akad" data-testid="mvd-akad-ekran">
        <header className="mvd-akad-naglowek">
          <h2 className="mvd-akad-tytul">{S.tytul}</h2>
        </header>
        <StanPanel
          komunikat={S.bramaTytul}
          opis={`${S.bramaOpis} ${S.bramaJakWejsc}`}
          wariant="info"
          testid="mvd-akad-brama-opracowania"
        />
      </div>
    );
  }

  // Bez aktywnego przypadku — uczciwa instrukcja z akcją (bez wołań API).
  if (activeCaseId === null) {
    return (
      <div className="mvd-akad" data-testid="mvd-akad-ekran">
        <header className="mvd-akad-naglowek">
          <h2 className="mvd-akad-tytul">{S.tytul}</h2>
          <p className="mvd-akad-opis">{S.opisWstep}</p>
        </header>
        <StanPanel
          komunikat={S.brakPrzypadku}
          opis={S.brakPrzypadkuOpis}
          wariant="info"
          testid="mvd-akad-brak-przypadku"
          akcja={akcjaPrzypadki}
        />
      </div>
    );
  }

  const namespaceKatalogu = wybrany === '' ? null : katalogRodzaju(wybrany);
  const rodzajMaParametry = wybrany !== '' && maParametry(wybrany);

  return (
    <div className="mvd-akad" data-testid="mvd-akad-ekran">
      <header className="mvd-akad-naglowek">
        <h2 className="mvd-akad-tytul">{S.tytul}</h2>
        <p className="mvd-akad-opis">{S.opisWstep}</p>
        <p className="mvd-akad-swiezosc" data-testid="mvd-akad-swiezosc">
          {S.swiezoscEtykieta}: <span className="mvd-num">{opisSwiezosci(swiezosc)}</span>
        </p>
      </header>

      <section className="mvd-akad-sekcja" data-testid="mvd-akad-wybor">
        <h3 className="mvd-akad-sekcja-tytul">{S.wyborTytul}</h3>
        <p className="mvd-akad-opis">{S.wyborOpis}</p>
        {rodzaje.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.rodzajeLadowanie}</p>}
        {rodzaje.rodzaj === 'blad' && (
          <StanPanel
            komunikat={S.rodzajeBlad}
            opis={rodzaje.komunikat}
            wariant="blad"
            testid="mvd-akad-rodzaje-blad"
            akcja={{ etykieta: S.rodzajePonow, onKlik: wczytajRodzaje }}
          />
        )}
        {rodzaje.rodzaj === 'gotowe' && rodzaje.kody.length === 0 && (
          <StanPanel
            komunikat={S.rodzajeBrak}
            opis={S.rodzajeBrakOpis}
            wariant="info"
            testid="mvd-akad-rodzaje-brak"
            akcja={{ etykieta: S.rodzajePonow, onKlik: wczytajRodzaje }}
          />
        )}
        {rodzaje.rodzaj === 'gotowe' && rodzaje.kody.length > 0 && (
          <label className="mvd-akad-pole" htmlFor="mvd-akad-rodzaj">
            <span className="mvd-akad-pole-etyk">{S.wyborEtykieta}</span>
            <select
              id="mvd-akad-rodzaj"
              className="mvd-akad-pole-kontrolka"
              value={wybrany}
              data-testid="mvd-akad-rodzaj"
              onChange={(zdarzenie) => zmienRodzaj(zdarzenie.target.value)}
            >
              {rodzaje.kody.map((kod) => (
                <option key={kod} value={kod}>
                  {etykietaRodzaju(kod)}
                </option>
              ))}
            </select>
          </label>
        )}
        {wybrany !== '' && PREZENTACJA[wybrany as RodzajAnalizy] !== undefined && (
          <div className="mvd-akad-cel" data-testid="mvd-akad-cel">
            <span className="mvd-akad-wiersz-etyk">{S.celTytul}</span>
            <p className="mvd-akad-cel-tresc">{PREZENTACJA[wybrany as RodzajAnalizy].pytanie}</p>
          </div>
        )}
        {wybrany !== '' && <p className="mvd-akad-opis">{opisRodzaju(wybrany)}</p>}
        {wybrany === 'ssci_impedance' && (
          <div className="mvd-akad-odeslanie" data-testid="mvd-akad-odeslanie-ssci">
            <p className="mvd-akad-opis">{S.odeslanieSsci}</p>
            <button
              type="button"
              className="mvd-akad-btn-wtorny"
              data-testid="mvd-akad-przejdz-ssci"
              onClick={() => setWynikiTab('ssci')}
            >
              {etykietaRodzaju('ssci_impedance')}
            </button>
          </div>
        )}
      </section>

      {wybrany !== '' && (
        <section className="mvd-akad-sekcja" data-testid="mvd-akad-uruchomienie">
          <div className="mvd-akad-sekcja-naglowek">
            <h3 className="mvd-akad-sekcja-tytul">{S.parametryTytul}</h3>
            {rodzajMaParametry && (
              <button
                type="button"
                className="mvd-akad-btn-wtorny"
                aria-expanded={parametryOtwarte}
                data-testid="mvd-akad-parametry-przelacz"
                onClick={() => setParametryOtwarte((otwarte) => !otwarte)}
              >
                {parametryOtwarte ? S.parametryUkryj : S.parametryPokaz}
              </button>
            )}
          </div>
          {!rodzajMaParametry && <p className="mvd-akad-opis">{S.parametryBrak}</p>}
          {rodzajMaParametry && parametryOtwarte && (
            <FormularzParametrow
              rodzaj={wybrany}
              pola={pola}
              uziom={uziom}
              metody={metody}
              wiersze={wiersze}
              onPole={(klucz, wartosc) => setPola((stanPol) => ({ ...stanPol, [klucz]: wartosc }))}
              onUziom={(klucz, wartosc) => setUziom((stanPol) => ({ ...stanPol, [klucz]: wartosc }))}
              onMetoda={(metoda, wlaczona) =>
                setMetody((lista) =>
                  wlaczona ? [...lista, metoda] : lista.filter((pozycja) => pozycja !== metoda),
                )
              }
              onWiersz={(indeks, klucz, wartosc) =>
                setWiersze((lista) =>
                  lista.map((wiersz, i) => (i === indeks ? { ...wiersz, [klucz]: wartosc } : wiersz)),
                )
              }
              onDodajWiersz={() => setWiersze((lista) => [...lista, {}])}
              onUsunWiersz={(indeks) =>
                setWiersze((lista) => lista.filter((_, i) => i !== indeks))
              }
            />
          )}
          <p className="mvd-akad-opis">{S.uruchomOpis}</p>
          <button
            type="button"
            className="mvd-akad-btn"
            onClick={uruchom}
            disabled={stan.rodzaj === 'ladowanie'}
            data-testid="mvd-akad-uruchom"
          >
            {stan.rodzaj === 'gotowe' || stan.rodzaj === 'blad' ? S.uruchomPonownie : S.uruchom}
          </button>
        </section>
      )}

      {stan.rodzaj === 'ladowanie' && (
        <StanPanel komunikat={S.ladowanie} wariant="info" testid="mvd-akad-ladowanie" />
      )}
      {stan.rodzaj === 'blad' && (
        <StanPanel komunikat={S.blad} opis={stan.komunikat} wariant="blad" testid="mvd-akad-blad" />
      )}

      {stan.rodzaj === 'gotowe' && (
        <div data-testid="mvd-akad-wyniki">
          <section className="mvd-akad-sekcja" data-testid="mvd-akad-przebieg">
            <div className="mvd-akad-wiersze">
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.statusPrzebiegu}</span>
                <span className="mvd-akad-wiersz-wartosc">
                  {etykietaStanuPrzebiegu(stan.dane.przebieg.status)}
                </span>
              </div>
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.odcisk}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">
                  {stan.dane.przebieg.deterministic_hash}
                </span>
              </div>
              {/* V126-JEZYK: po bramie opracowania całe okno jest ekspercke,
                  więc drugi warunek `trybEkspercki` tutaj byłby MARTWY (zawsze
                  prawdziwy) — identyfikatory techniczne renderują się wprost. */}
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.runId}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.przebieg.run_id}</span>
              </div>
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.wersjaSolwera}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">
                  {stan.dane.wynik.result.solver_version}
                </span>
              </div>
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.odciskWejscia}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">
                  {stan.dane.wynik.result.input_hash}
                </span>
              </div>
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.utworzono}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.wynik.created_at}</span>
              </div>
            </div>
          </section>

          {/* EKRAN INŻYNIERSKI (V126-JEZYK): werdykt z kryterium → wielkości
              z jednostkami → obiekty nazwane jak na schemacie → wiarygodność
              → następny krok. Zapis techniczny i ślad zostają, ale ZWINIĘTE. */}
          <PanelWerdyktu rodzaj={wybrany} payload={stan.dane.wynik.result.result} />
          <PanelWielkosci rodzaj={wybrany} payload={stan.dane.wynik.result.result} />
          {(PREZENTACJA[wybrany as RodzajAnalizy]?.tabele ?? []).map((tabela) => (
            <PanelObiektow
              key={tabela.sciezka}
              tabela={tabela}
              payload={stan.dane.wynik.result.result}
              nazwaObiektu={nazwaObiektu}
            />
          ))}
          <PanelBrakow payload={stan.dane.wynik.result.result} />
          <PanelWiarygodnosci payload={stan.dane.wynik.result.result} />
          {PREZENTACJA[wybrany as RodzajAnalizy] !== undefined && (
            <section className="mvd-akad-sekcja" data-testid="mvd-akad-nastepny-krok">
              <h3 className="mvd-akad-sekcja-tytul">{S.nastepnyKrokTytul}</h3>
              <p className="mvd-akad-opis">
                {PREZENTACJA[wybrany as RodzajAnalizy].nastepnyKrok}
              </p>
            </section>
          )}
          <PanelSladu slad={stan.dane.slad} />
          <PanelDowodu dowod={stan.dane.dowod} />
          <PanelRaportu raport={stan.dane.raport} />
          <PanelZapisuTechnicznego wynik={stan.dane.wynik} />
        </div>
      )}

      {namespaceKatalogu !== null && <PanelKatalogu namespace={namespaceKatalogu} />}
    </div>
  );
}
