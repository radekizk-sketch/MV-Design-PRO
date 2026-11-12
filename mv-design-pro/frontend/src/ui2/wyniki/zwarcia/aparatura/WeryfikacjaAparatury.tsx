/**
 * WeryfikacjaAparatury — OGNIWO ŁAŃCUCHA „wynik zwarciowy → wytrzymałość aparatury pól
 * stacji" (karty KD-4, KD-6; prezentacja tabelaryczna — APARATURA-TABELA; szczegóły pola —
 * KD6-SZCZEGOLY, standard §10 kontraktu prezentacji inżynierskiej).
 *
 * UKŁAD. Jedno pole = jeden wiersz tabeli; natywny przełącznik z `aria-expanded` (klik
 * w wiersz, Enter, spacja) rozwija widok pola:
 *  - tabela kryteriów Kryterium | Prąd obliczony | Wartość znamionowa | Zapas (dynamiczne,
 *    cieplne, wyłączalne; warunek wzorem przy nazwie),
 *  - pod nią czas wyłączenia t_zab + t_wył = T_k z członów backendu; T_k jest zawsze liczbą
 *    (wartość projektanta > nastawy zabezpieczenia pola > wartość robocza 1 s wg IEC 62271-1
 *    §4.7) i ma pole edycji „przyjęty czas zwarcia [s]” — zapis to operacja modelu na łączniku
 *    pola i automatyczne przeliczenie (nowy bieg zwarciowy, ponowny odczyt oceny),
 *  - „Szczegóły obliczeń” — domyślnie zwinięte wyprowadzenie w kolejności dane wejściowe →
 *    wzory → podstawienia → wyniki pośrednie → wynik końcowy, z istniejących danych rekordu.
 * Każda informacja raz: podstawa normowa — wyłącznie z rekordu limitu; uzasadnienie czasu
 * własnego — raz, w danych czasu; ip, Ith, Ib — nad tabelą albo w wierszu, nie w szczegółach.
 *
 * Prądy ip, Ith, Ib stoją nad tabelą RAZ, wyłącznie gdy backend podał je jednakowe dla
 * wszystkich pól; inaczej idą do wierszy (ekran porównuje liczby backendu, nie liczy).
 *
 * SKĄD LICZBY. Każda liczba kryterium pochodzi z rekordu K TEGO pola (`ocenaRodzaju`): wynik,
 * limit i margines z backendu (`wytrzymalosc_aparatury_pol.py`) — nigdy kopia innego pola
 * i nigdy liczba policzona tutaj. Liczby, których backend nie obliczył, pokazujemy jako
 * nazwany brak, nigdy jako zero.
 *
 * GRANICA KONTRAKTU WERDYKTU (V12K-353). Dyrektywa właściciela 2026-11-04: widok nie pokazuje
 * niepewności, kompletności ani jakości dowodu, etykiet statusu ani karty werdyktu — dane
 * zostają w rekordzie i w API. Ten plik nie czyta statusu maszynowego, etykiety, niepewności
 * ani kompletności rekordu (przypięte testem źródła). Wartość robocza parametru aparatu
 * pozostaje oznaczona przy danej wejściowej (zasada nr 4).
 */

import { PrzyciskPokazNaSchemacie } from '../../../shared/PrzyciskPokazNaSchemacie';
import { elementNaSchemacie } from '../../../shell/zaznaczElementModelu';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import './aparatura.css';
import { useAppStateStore } from '../../../../ui/app-state';
import { MathInline } from '../../../../ui/proof/MathRenderer';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionAnalysisType } from '../../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { uruchomObliczenie } from '../../../spaces/obliczenia/uruchomObliczenie';
import type { OcenaKryterium, PodstawaWymagania } from '../../wzorzec/werdykt';
import {
  ocenaRodzaju,
  pobierzWytrzymaloscAparatury,
  RODZAJE_KRYTERIUM_APARATU,
  znacznikWerdyktu,
  type PoleWytrzymalosci,
  type RodzajKryteriumAparatu,
  type WartoscParametruAparatu,
  type ZrodloCzasuZwarcia,
} from './api';
import { formatujWielkosc, type RodzajWielkosci } from './format';
import {
  nazwaStacji,
  powodBrakuPodstawy,
  stacjeDlaPunktu,
  type PowodBrakuPodstawy,
} from './model';
import { APARATURA_STRINGS as T, LATEX } from './strings';

type Stan =
  | { readonly rodzaj: 'nieuruchomiona' }
  | { readonly rodzaj: 'pracuje' }
  | { readonly rodzaj: 'gotowe'; readonly wiersze: readonly PoleWytrzymalosci[] }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

export interface WeryfikacjaAparaturyProps {
  /** Wiersz WYNIKU wybranego punktu zwarcia — wskazuje stację (prądy pól niesie bieg). */
  readonly wiersz: ShortCircuitRow;
  /** Zapisany bieg zwarciowy ekranu — źródło prądów KAŻDEGO pola po stronie backendu. */
  readonly runId: string | null;
  /** Przejście do konfiguracji stacji (akcja naprawcza stanu zerowego). */
  readonly onOtworzKonfiguracjeStacji?: (stationRef: string) => void;
  /** „Parametry aparatu” aparatu z modelu → kreator edycji parametrów aparatu. */
  readonly onParametryAparatu?: (aparatRef: string, aparatNazwa: string) => void;
}

/** Wyróżnienie komórki: `null` = neutralna. */
type Uwaga = 'ujemny' | 'brak' | null;

const NAZWA_KRYTERIUM: Readonly<Record<RodzajKryteriumAparatu, string>> = {
  dynamiczna: T.kryteriumDynamiczne,
  cieplna: T.kryteriumCieplne,
  wylaczanie: T.kryteriumWylaczalne,
};

const KOLUMNA_ZAPASU: Readonly<Record<RodzajKryteriumAparatu, string>> = {
  dynamiczna: T.kolZapasDynamiczny,
  cieplna: T.kolZapasCieplny,
  wylaczanie: T.kolZapasWylaczalny,
};

/** Relacja limitu jako operator LaTeX (podstawienie liczb backendu do warunku). */
const OPERATOR_RELACJI: Readonly<Record<string, string>> = {
  NIE_WIECEJ: '\\le',
  NIE_MNIEJ: '\\ge',
};

function liczba(wartosc: number | null | undefined, rodzaj: RodzajWielkosci): string {
  return wartosc === null || wartosc === undefined ? T.kreska : formatujWielkosc(wartosc, rodzaj);
}

/** Liczba backendu w LaTeX (przecinek dziesiętny jako `{,}`, minus typograficzny jako `-`). */
function liczbaLatex(wartosc: number, rodzaj: RodzajWielkosci): string {
  return formatujWielkosc(wartosc, rodzaj).replace(',', '{,}').replace('−', '-');
}

/** Symbol wielkości z jednostką w nagłówku kolumny: wzór + „[kA]”. */
function Symbol({ latex, jednostka }: { readonly latex: string; readonly jednostka?: string }) {
  return (
    <span className="mvd-apar-symbol">
      <MathInline latex={latex} />
      {jednostka !== undefined && <> {jednostka}</>}
    </span>
  );
}

/** Komórka z liczbą albo z nazwanym brakiem; `uwaga` steruje wyłącznie kolorem. */
function Komorka({
  children,
  uwaga = null,
  testId,
  tytul,
  zrodloCzasu,
}: {
  readonly children: ReactNode;
  readonly uwaga?: Uwaga;
  readonly testId?: string;
  readonly tytul?: string;
  readonly zrodloCzasu?: string;
}) {
  return (
    <td
      className="mvd-num mvd-apar-komorka"
      data-uwaga={uwaga ?? undefined}
      data-testid={testId}
      data-zrodlo-czasu={zrodloCzasu}
      title={tytul}
    >
      {children}
    </td>
  );
}

interface Zapas {
  readonly tekst: string;
  readonly uwaga: Uwaga;
  readonly tytul?: string;
}

/** Powód braku zapasu z rekordu (margines nieokreślony albo czego brakuje). */
function powodBrakuZapasu(rekord: OcenaKryterium): string {
  return rekord.margines?.powod_pl ?? rekord.wyjasnienie.czego_brakuje.join('; ');
}

/**
 * Zapas kryterium z rekordu backendu: liczba ze znakiem (ujemna — wyróżniona), „nie dotyczy”
 * (stosowalność z rekordu), „brak” z powodem w podpowiedzi albo „brak oceny”, gdy backend
 * rekordu nie zwrócił. Nigdy liczba z innego pola.
 */
function zapas(rekord: OcenaKryterium | null): Zapas {
  if (rekord === null) return { tekst: T.brakOceny, uwaga: 'brak' };
  if (!rekord.stosowalnosc.dotyczy) {
    return { tekst: T.nieDotyczy, uwaga: null, tytul: rekord.stosowalnosc.powod_pl };
  }
  const m = rekord.margines?.wartosc ?? null;
  if (m === null) return { tekst: T.brakZapasu, uwaga: 'brak', tytul: powodBrakuZapasu(rekord) };
  return { tekst: formatujWielkosc(m.wartosc, 'zapas'), uwaga: m.wartosc < 0 ? 'ujemny' : null };
}

function opisZrodla(pole: PoleWytrzymalosci): string {
  return pole.zrodlo === 'model' ? T.zrodloModel : T.zrodloKonfiguracja;
}

function nazwaAparatu(pole: PoleWytrzymalosci): string {
  return pole.aparat_etykieta ?? pole.aparat_nazwa ?? pole.aparat_catalog_ref;
}

/** Podstawa limitu jednym zdaniem: dokument, wydanie, jednostka redakcyjna (z rekordu limitu). */
function opisPodstawy(p: PodstawaWymagania): string {
  return [p.dokument, p.wydanie, p.jednostka_redakcyjna]
    .filter((x): x is string => x !== null && x !== '')
    .join(', ');
}

/** Czy backend podał dla wszystkich pól te same prądy (porównanie liczb, nie obliczenie). */
export function pradyJednakowe(pola: readonly PoleWytrzymalosci[]): boolean {
  if (pola.length === 0) return false;
  const [pierwsze, ...reszta] = pola;
  return reszta.every(
    (p) =>
      p.prady_pola.ip_ka === pierwsze.prady_pola.ip_ka &&
      p.prady_pola.ith_ka === pierwsze.prady_pola.ith_ka &&
      p.prady_pola.ib_ka === pierwsze.prady_pola.ib_ka,
  );
}

/** Etykieta źródła przyjętego czasu zwarcia pola (źródło z backendu, jedno słownictwo). */
export function etykietaZrodlaCzasu(zrodlo: ZrodloCzasuZwarcia): string {
  if (zrodlo === 'projektant') return T.czasProjektanta;
  if (zrodlo === 'nastawy_pola') return T.czasZNastaw;
  return T.czasRoboczy;
}

/** Czas trwania zwarcia pola T_k z backendu — zawsze liczba ze źródłem (pakiet 8). */
function KomorkaCzasu({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const czas = pole.czas_wylaczenia;
  return (
    <Komorka
      testId={`mvd-zwarcia-aparatura-czas-${pole.pole}`}
      tytul={czas.podstawa_pl}
      zrodloCzasu={czas.zrodlo}
    >
      {formatujWielkosc(czas.t_clearing_s, 'czas')}
    </Komorka>
  );
}

/** Tabela kryteriów pola — każda liczba z rekordu K TEGO pola. */
function TabelaKryteriow({ pole }: { readonly pole: PoleWytrzymalosci }) {
  return (
    <table
      className="mvd-apar-porownanie"
      data-testid={`mvd-zwarcia-aparatura-porownanie-${pole.pole}`}
    >
      <thead>
        <tr>
          <th scope="col">{T.kolKryterium}</th>
          <th scope="col">{T.kolObliczony}</th>
          <th scope="col">{T.kolZnamionowa}</th>
          <th scope="col">{T.kolZapas}</th>
        </tr>
      </thead>
      <tbody>
        {RODZAJE_KRYTERIUM_APARATU.map((rodzaj) => {
          const rekord = ocenaRodzaju(pole, rodzaj);
          const z = zapas(rekord);
          const dotyczy = rekord?.stosowalnosc.dotyczy ?? true;
          const limit = rekord?.limit?.wartosc ?? null;
          const id = `${pole.pole}-${rodzaj}`;
          return (
            <tr key={rodzaj} data-testid={`mvd-zwarcia-aparatura-kryterium-${id}`}>
              <th scope="row" className="mvd-apar-kryterium">
                <span>{NAZWA_KRYTERIUM[rodzaj]}</span>
                {rekord !== null && rekord.kryterium.warunek_latex.trim() !== '' && (
                  <span className="mvd-apar-warunek">
                    <MathInline latex={rekord.kryterium.warunek_latex} />
                  </span>
                )}
                {rodzaj === 'cieplna' && pole.komunikat_cieplny_pl && (
                  // Zdanie backendu przy liczbach wiersza („Spełnione dla t = 1 s”) — czas, dla
                  // którego porównanie zaszło (dyrektywa właściciela, pakiet 8 karty
                  // EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN). Komórki liczbowe bez zmian.
                  <span
                    className="mvd-apar-komunikat-cieplny"
                    data-testid={`mvd-zwarcia-aparatura-komunikat-cieplny-${pole.pole}`}
                  >
                    {pole.komunikat_cieplny_pl}
                  </span>
                )}
              </th>
              <Komorka testId={`mvd-zwarcia-aparatura-obliczony-${id}`}>
                {liczba(rekord?.wynik?.wartosc.wartosc, 'prad')}
              </Komorka>
              <Komorka
                testId={`mvd-zwarcia-aparatura-aparat-${id}`}
                uwaga={dotyczy && limit === null ? 'brak' : null}
              >
                {dotyczy ? liczba(limit?.wartosc, 'prad') : T.nieDotyczy}
              </Komorka>
              <Komorka testId={`mvd-zwarcia-aparatura-zapas-${id}`} uwaga={z.uwaga} tytul={z.tytul}>
                {z.tekst}
              </Komorka>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Składnik sumy czasu: liczba backendu albo kreska, gdy członu nie ma (czas spoza nastaw). */
function SkladnikCzasu({ wartosc, testId }: { readonly wartosc: number | null; readonly testId: string }) {
  return (
    <span className="mvd-num" data-testid={testId}>
      {wartosc === null ? T.kreska : formatujWielkosc(wartosc, 'czas')}
    </span>
  );
}

/** Zakres przyjętego czasu zwarcia — ten sam co walidacja operacji modelu (0; 5] s. */
export function czasZwarciaWZakresie(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v <= 5;
}

/**
 * Pole edycji „przyjęty czas zwarcia [s]” przy T_k. Zapis = operacja modelu
 * `update_element_parameters` (`czas_wylaczenia_zwarcia_s` na łączniku pola), po niej
 * automatyczne przeliczenie (`onZapisano`). Wartość startowa = czas, którego użyła ocena.
 */
function PrzyjetyCzasZwarcia({
  pole,
  onZapisz,
  pracuje,
}: {
  readonly pole: PoleWytrzymalosci;
  readonly onZapisz: (lacznikRef: string, czasS: number) => void;
  readonly pracuje: boolean;
}) {
  const czas = pole.czas_wylaczenia;
  const inputId = useId();
  const [tekst, setTekst] = useState(String(czas.t_clearing_s));
  useEffect(() => setTekst(String(czas.t_clearing_s)), [czas.t_clearing_s]);
  const wartosc = Number(tekst.replace(',', '.'));
  const poprawny = czasZwarciaWZakresie(wartosc);
  if (czas.wylacznik_czasu_ref === null) {
    return (
      <span className="mvd-apar-czas-zrodlo" data-testid={`mvd-zwarcia-aparatura-czas-brak-lacznika-${pole.pole}`}>
        {' '}
        · {T.brakLacznikaPola}
      </span>
    );
  }
  const lacznik = czas.wylacznik_czasu_ref;
  return (
    <span className="mvd-apar-czas-edycja">
      {' '}
      <label htmlFor={inputId}>{T.przyjetyCzas}</label>{' '}
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={0}
        max={5}
        step={0.01}
        className="mvd-apar-czas-pole mvd-num"
        data-testid={`mvd-zwarcia-aparatura-przyjety-czas-${pole.pole}`}
        value={tekst}
        aria-invalid={!poprawny}
        title={poprawny ? czas.podstawa_pl : T.czasPoza}
        onChange={(e) => setTekst(e.target.value)}
      />{' '}
      <button
        type="button"
        className="mvd-apar-akcja mvd-apar-akcja--wtorna"
        data-testid={`mvd-zwarcia-aparatura-zapisz-czas-${pole.pole}`}
        disabled={pracuje || !poprawny || wartosc === czas.t_clearing_s}
        onClick={() => onZapisz(lacznik, wartosc)}
      >
        {pracuje ? T.przeliczanie : T.zapiszCzas}
      </button>
    </span>
  );
}

/**
 * Czas wyłączenia pola pod tabelą: t_zab + t_wył = T_k [s]. Każda wartość z backendu
 * (`czlon_nastawczy_s`, `czas_wlasny_wylacznika_s`, `t_clearing_s`); człony są tylko przy
 * czasie z nastaw — przy wartości projektanta i roboczej T_k stoi sam, ze źródłem.
 */
function CzasWylaczenia({
  pole,
  onZapiszCzas,
  pracuje,
}: {
  readonly pole: PoleWytrzymalosci;
  readonly onZapiszCzas?: (lacznikRef: string, czasS: number) => void;
  readonly pracuje: boolean;
}) {
  const czas = pole.czas_wylaczenia;
  const zNastaw = czas.zrodlo === 'nastawy_pola';
  return (
    <p
      className="mvd-apar-czas-linia"
      data-testid={`mvd-zwarcia-aparatura-czas-szczegoly-${pole.pole}`}
      data-zrodlo-czasu={czas.zrodlo}
    >
      <span className="mvd-apar-czas-etykieta">
        {T.czasWylaczenia}{' '}
        <MathInline
          latex={zNastaw ? `${LATEX.tzab_latex} + ${LATEX.twyl_latex} = ${LATEX.tk_latex}` : LATEX.tk_latex}
        />{' '}
        {T.jednS}:
      </span>{' '}
      {zNastaw && (
        <>
          <SkladnikCzasu wartosc={czas.czlon_nastawczy_s} testId={`mvd-zwarcia-aparatura-tzab-${pole.pole}`} />
          {' + '}
          <SkladnikCzasu
            wartosc={czas.czas_wlasny_wylacznika_s}
            testId={`mvd-zwarcia-aparatura-twyl-${pole.pole}`}
          />
          {' = '}
        </>
      )}
      <SkladnikCzasu wartosc={czas.t_clearing_s} testId={`mvd-zwarcia-aparatura-tk-${pole.pole}`} />
      <span
        className="mvd-apar-czas-zrodlo"
        data-testid={`mvd-zwarcia-aparatura-czas-zrodlo-${pole.pole}`}
        title={czas.podstawa_pl}
      >
        {' '}
        · {etykietaZrodlaCzasu(czas.zrodlo)}
      </span>
      {onZapiszCzas && <PrzyjetyCzasZwarcia pole={pole} onZapisz={onZapiszCzas} pracuje={pracuje} />}
    </p>
  );
}

function opisPochodzenia(w: WartoscParametruAparatu): string {
  if (w.pochodzenie === 'KATALOG') return T.pochodzenieKatalog;
  if (w.pochodzenie === 'PROPOZYCJA') return T.pochodzeniePropozycja;
  if (w.pochodzenie === 'PROJEKTANT') return T.pochodzenieProjektant;
  return T.pochodzenieBrak;
}

/** Parametry aparatu z backendu w stałej kolejności: czas własny, I_th, t_th (T_kr), I_dyn. */
function parametryPola(pole: PoleWytrzymalosci): WartoscParametruAparatu[] {
  const wartosci = pole.znamiona?.wartosci ?? {};
  return [
    pole.czas_wylaczenia.czas_wlasny,
    wartosci.i_th_ka,
    wartosci.i_th_duration_s,
    wartosci.i_dyn_ka,
  ].filter((w): w is WartoscParametruAparatu => w !== null && w !== undefined);
}

/**
 * Parametr aparatu: wartość, pochodzenie, znacznik wartości roboczej. Pełny opis źródła
 * wartości roboczej jest podpowiedzią znacznika (karta KD6-SZCZEGOLY pkt 4: prosto, każda
 * informacja raz — podstawy znamion stoją raz pod listą parametrów).
 */
function Parametr({ pole, w }: { readonly pole: PoleWytrzymalosci; readonly w: WartoscParametruAparatu }) {
  return (
    <li
      className="mvd-apar-parametr"
      data-testid={`mvd-zwarcia-aparatura-parametr-${pole.pole}-${w.parametr}`}
      data-pochodzenie={w.pochodzenie ?? 'brak'}
      data-wartosc-robocza={String(w.wartosc_robocza)}
    >
      <span className="mvd-apar-parametr-nazwa">{w.nazwa_pl}</span>
      <span className="mvd-num">
        {w.wartosc === null
          ? T.kreska
          : `${formatujWielkosc(w.wartosc, w.jednostka === 's' ? 'czas' : 'prad')} ${w.jednostka}`}
      </span>
      <span className="mvd-apar-parametr-pochodzenie">{opisPochodzenia(w)}</span>
      {w.wartosc_robocza && (
        <span
          className="mvd-apar-parametr-robocza"
          data-testid={`mvd-zwarcia-aparatura-robocza-${pole.pole}-${w.parametr}`}
          title={w.opis_zrodla_pl}
        >
          {T.etykietaRobocza}
        </span>
      )}
      {w.wartosc === null && w.powod_braku_pl !== null && (
        <p className="mvd-apar-opis">{w.powod_braku_pl}</p>
      )}
    </li>
  );
}

function Krok({
  tytul,
  testId,
  children,
}: {
  readonly tytul: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="mvd-apar-krok" data-testid={testId}>
      <h5 className="mvd-apar-krok-tytul">{tytul}</h5>
      {children}
    </section>
  );
}

/**
 * Czas wyłączenia pola jednym zdaniem (karta KD6-SZCZEGOLY pkt 4): skąd t_zab i skąd t_wył —
 * zdania backendu (`opis_czlonu_pl`, `opis_czasu_wlasnego_pl`); pełny powód i założenia są
 * podpowiedzią. Czas projektanta albo roboczy: zdanie podstawy z backendu (`podstawa_pl`).
 */
function OpisCzasu({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const czas = pole.czas_wylaczenia;
  const testId = `mvd-zwarcia-aparatura-czas-opis-${pole.pole}`;
  if (czas.zrodlo !== 'nastawy_pola' || !czas.opis_czlonu_pl || !czas.opis_czasu_wlasnego_pl) {
    return (
      <p className="mvd-apar-opis" data-testid={testId} title={czas.powod_pl}>
        {T.zrodloCzasu}: {czas.podstawa_pl}
      </p>
    );
  }
  return (
    <p className="mvd-apar-opis" data-testid={testId} title={[czas.powod_pl, ...czas.zalozenia_pl].join(' ')}>
      <MathInline latex={LATEX.tzab_latex} /> {czas.opis_czlonu_pl}; <MathInline latex={LATEX.twyl_latex} />{' '}
      {czas.opis_czasu_wlasnego_pl}.
    </p>
  );
}

/**
 * Podstawy znamion raz, krótko: z rekordu limitu każdego kryterium (dokument, wydanie, jednostka),
 * kryteria o tej samej podstawie zebrane w jeden wpis (każda informacja raz).
 */
function PodstawyZnamion({
  pole,
  rekordy,
}: {
  readonly pole: PoleWytrzymalosci;
  readonly rekordy: readonly { rodzaj: RodzajKryteriumAparatu; rekord: OcenaKryterium | null }[];
}) {
  // Krótka lista „kryterium → źródło” (uwaga właściciela do zrzutu KD6): każda podstawa raz,
  // kryteria o wspólnej podstawie w jednej pozycji, symbol kryterium z `warunek_latex`
  // rekordu przez MathRenderer — proza podstawy z backendu nazywa wielkości słowami.
  const grupy = new Map<string, { rodzaj: RodzajKryteriumAparatu; warunek: string }[]>();
  for (const { rodzaj, rekord } of rekordy) {
    if (!rekord?.limit) continue;
    const opis = opisPodstawy(rekord.limit.podstawa);
    grupy.set(opis, [...(grupy.get(opis) ?? []), { rodzaj, warunek: rekord.kryterium.warunek_latex }]);
  }
  if (grupy.size === 0) return null;
  return (
    <div className="mvd-apar-podstawy" data-testid={`mvd-zwarcia-aparatura-podstawy-${pole.pole}`}>
      <span className="mvd-apar-wzor-nazwa">{T.podstawy}</span>
      <ul className="mvd-apar-podstawy-lista">
        {[...grupy].map(([opis, kryteria], i) => (
          <li
            key={opis}
            data-testid={`mvd-zwarcia-aparatura-podstawa-${pole.pole}-${i}`}
            data-kryteria={kryteria.map((k) => k.rodzaj).join(' ')}
          >
            {kryteria.map((k, j) => (
              <span key={k.rodzaj} className="mvd-apar-symbol">
                {j > 0 ? ', ' : ''}
                {NAZWA_KRYTERIUM[k.rodzaj]} <MathInline latex={k.warunek} />
              </span>
            ))}{' '}
            → {opis}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Jedna wartość pośrednia: symbol = liczba jednostka, albo nazwany brak (`brak`). */
function Posrednia({
  latex,
  wartosc,
  rodzaj,
  jednostka,
  testId,
  dopisek,
  brak = T.kreska,
}: {
  readonly brak?: string;
  readonly latex: string;
  readonly wartosc: number | null | undefined;
  readonly rodzaj: RodzajWielkosci;
  readonly jednostka: string;
  readonly testId: string;
  readonly dopisek?: ReactNode;
}) {
  const bezLiczby = wartosc === null || wartosc === undefined;
  return (
    <div>
      <dt>
        <MathInline latex={latex} />
      </dt>
      <dd className="mvd-num" data-testid={testId} data-uwaga={bezLiczby ? 'brak' : undefined}>
        {wartosc === null || wartosc === undefined ? brak : `${formatujWielkosc(wartosc, rodzaj)}${jednostka ? ` ${jednostka}` : ''}`}
        {bezLiczby ? null : dopisek}
      </dd>
    </div>
  );
}

/**
 * Wyniki pośrednie wyłącznie z liczb backendu: κ, m, n i T_k biegu (wiersz biegu), dopuszczalny
 * prąd cieplny przy T_k pola (limit rekordu cieplnego, jądro K7-B) oraz człony czasu wyłączenia.
 */
function WynikiPosrednie({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const w = pole.prady_pola.wyprowadzenie;
  const czas = pole.czas_wylaczenia;
  const cieplna = ocenaRodzaju(pole, 'cieplna');
  const id = (k: string) => `mvd-zwarcia-aparatura-posrednia-${pole.pole}-${k}`;
  return (
    <dl className="mvd-apar-dane">
      <Posrednia latex={LATEX.kappa_latex} wartosc={w?.kappa} rodzaj="wspolczynnik" jednostka="" testId={id('kappa')} brak={T.kreska} />
      <Posrednia latex={LATEX.m_latex} wartosc={w?.m_factor} rodzaj="wspolczynnik" jednostka="" testId={id('m')} brak={T.kreska} />
      <Posrednia latex={LATEX.n_latex} wartosc={w?.n_factor} rodzaj="wspolczynnik" jednostka="" testId={id('n')} brak={T.kreska} />
      <Posrednia
        latex={LATEX.tkBiegu_latex}
        wartosc={w?.tk_biegu_s}
        rodzaj="czas"
        jednostka="s"
        testId={id('tk-biegu')} brak={T.kreska}
        dopisek={
          <span className="mvd-apar-opis-inline">
            {' '}
            ({T.tkBiegu} <MathInline latex={LATEX.ith_latex} />)
          </span>
        }
      />
      {cieplna?.stosowalnosc.dotyczy !== false && (
        <Posrednia
          latex={LATEX.ithDop_latex}
          wartosc={cieplna?.limit?.wartosc?.wartosc}
          rodzaj="prad"
          jednostka="kA"
          testId={id('ith-dop')}
        />
      )}
      <Posrednia latex={LATEX.tzab_latex} wartosc={czas.czlon_nastawczy_s} rodzaj="czas" jednostka="s" testId={id('tzab')} />
      <Posrednia latex={LATEX.twyl_latex} wartosc={czas.czas_wlasny_wylacznika_s} rodzaj="czas" jednostka="s" testId={id('twyl')} />
      <Posrednia latex={LATEX.tk_latex} wartosc={czas.t_clearing_s} rodzaj="czas" jednostka="s" testId={id('tk')} />
    </dl>
  );
}

/**
 * Szczegóły obliczeń pola (domyślnie zwinięte): dane wejściowe → wzory → podstawienia →
 * wyniki pośrednie → wynik końcowy. Wyłącznie istniejące dane rekordu i widoku pola. Bez
 * komunikatu słownego backendu (`komunikat_pl`): powtarza liczby tabeli i niesie zdanie
 * o kompletności dowodu, którego widok nie pokazuje (V12K-353).
 */
function SzczegolyObliczen({ pole, id }: { readonly pole: PoleWytrzymalosci; readonly id: string }) {
  const prady = pole.prady_pola;
  const parametry = parametryPola(pole);
  const rekordy = RODZAJE_KRYTERIUM_APARATU.map((rodzaj) => ({
    rodzaj,
    rekord: ocenaRodzaju(pole, rodzaj),
  }));
  const definicjeZapasu = [
    ...new Set(
      rekordy
        .map(({ rekord }) => rekord?.margines?.definicja_latex ?? null)
        .filter((d): d is string => d !== null && d.trim() !== ''),
    ),
  ];
  const opisTb = prady.tb_zrodlo?.opis_pl ?? null;
  const zPradow = prady.wyprowadzenie?.wzory ?? {};
  const wzory: { klucz: string; nazwa: string; latex: string | undefined }[] = [
    { klucz: 'ip', nazwa: T.wzorIp, latex: zPradow.ip },
    { klucz: 'ith', nazwa: T.wzorIth, latex: zPradow.ith },
    { klucz: 'ib', nazwa: T.wzorIb, latex: zPradow.ib },
    { klucz: 'limit-cieplny', nazwa: T.wzorLimitu, latex: pole.wzor_limitu_cieplnego_latex },
    ...definicjeZapasu.map((latex, i) => ({ klucz: `zapas-${i}`, nazwa: T.zapasDefinicja, latex })),
  ];
  const wzoryZBackendu = wzory.flatMap((w) =>
    w.latex !== undefined && w.latex.trim() !== '' ? [{ ...w, latex: w.latex }] : [],
  );
  return (
    <div
      className="mvd-apar-szczegoly"
      id={id}
      data-testid={`mvd-zwarcia-aparatura-szczegoly-${pole.pole}`}
    >
      <Krok tytul={T.krokDane} testId={`mvd-zwarcia-aparatura-dane-${pole.pole}`}>
        <p className="mvd-apar-zrodlo" data-testid={`mvd-zwarcia-aparatura-zrodlo-${pole.pole}`}>
          {T.aparat}: {nazwaAparatu(pole)} · {opisZrodla(pole)}
        </p>
        <dl
          className="mvd-apar-dane"
          data-testid={`mvd-zwarcia-aparatura-prady-${pole.pole}`}
          data-punkt-ref={prady.punkt_ref ?? ''}
        >
          <div>
            <dt>{T.punktZabudowy}</dt>
            <dd>{prady.punkt_nazwa ?? T.kreska}</dd>
          </div>
          <div>
            <dt>
              <Symbol latex={LATEX.un_latex} jednostka="[kV]" />
            </dt>
            <dd className="mvd-num">{liczba(prady.un_kv, 'prad')}</dd>
          </div>
          <div>
            <dt>
              <Symbol latex={LATEX.ik_latex} jednostka={T.jednKa} />
            </dt>
            <dd className="mvd-num" data-testid={`mvd-zwarcia-aparatura-ik-${pole.pole}`}>
              {liczba(prady.ik_ka, 'prad')}
            </dd>
          </div>
          <div>
            <dt>
              <Symbol latex={LATEX.idc_latex} jednostka={T.jednKa} />
            </dt>
            <dd className="mvd-num">{liczba(prady.i_dc_ka, 'prad')}</dd>
          </div>
          <div>
            {/* t_b — chwila przerwania prądu wg IEC 60909-0 (I_b, i_DC(t_b)), nie czas trwania
                zwarcia T_k pola: nazwana słowem, żeby symbolu nie mylić z T_k (karta KD6). */}
            <dt>
              {T.czasPrzerwania} <Symbol latex={LATEX.tb_latex} jednostka={T.jednS} />
            </dt>
            {/* Pochodzenie t_b (backend) jako podpowiedź: jego treść powtarza uzasadnienie czasu
                wyłączenia pola, które stoi niżej raz (dyrektywa 2026-11-04 pkt 4). */}
            <dd
              className="mvd-num"
              data-testid={`mvd-zwarcia-aparatura-tb-${pole.pole}`}
              title={opisTb ?? undefined}
            >
              {prady.tb_s === null ? T.tbNiePodano : formatujWielkosc(prady.tb_s, 'czas')}
            </dd>
          </div>
        </dl>
        {prady.powod_pl !== null && <p className="mvd-apar-opis">{prady.powod_pl}</p>}
        <OpisCzasu pole={pole} />
        {parametry.length > 0 && (
          <ul className="mvd-apar-parametry" data-testid={`mvd-zwarcia-aparatura-parametry-${pole.pole}`}>
            {parametry.map((w) => (
              <Parametr key={w.parametr} pole={pole} w={w} />
            ))}
          </ul>
        )}
        <PodstawyZnamion pole={pole} rekordy={rekordy} />
      </Krok>

      <Krok tytul={T.krokWzory} testId={`mvd-zwarcia-aparatura-wzory-${pole.pole}`}>
        {wzoryZBackendu.map(({ klucz, nazwa, latex }) => (
          <p className="mvd-apar-wzor" key={klucz} data-testid={`mvd-zwarcia-aparatura-wzor-${pole.pole}-${klucz}`}>
            <span className="mvd-apar-wzor-nazwa">{nazwa}:</span> <MathInline latex={latex} />
          </p>
        ))}
      </Krok>

      <Krok tytul={T.krokPodstawienia} testId={`mvd-zwarcia-aparatura-podstawienia-${pole.pole}`}>
        {rekordy.map(({ rodzaj, rekord }) => (
          <p className="mvd-apar-wzor" key={rodzaj} data-testid={`mvd-zwarcia-aparatura-podstawienie-${pole.pole}-${rodzaj}`}>
            <span className="mvd-apar-wzor-nazwa">{NAZWA_KRYTERIUM[rodzaj]}:</span>{' '}
            <Podstawienie rekord={rekord} />
          </p>
        ))}
      </Krok>

      <Krok tytul={T.krokPosrednie} testId={`mvd-zwarcia-aparatura-posrednie-${pole.pole}`}>
        <WynikiPosrednie pole={pole} />
      </Krok>

      <Krok tytul={T.krokWynik} testId={`mvd-zwarcia-aparatura-wynik-${pole.pole}`}>
        {rekordy.map(({ rodzaj, rekord }) => {
          const z = zapas(rekord);
          const liczbowy = rekord?.stosowalnosc.dotyczy === true && rekord.margines?.wartosc != null;
          return (
            <p className="mvd-apar-wzor" key={rodzaj} data-testid={`mvd-zwarcia-aparatura-wynik-${pole.pole}-${rodzaj}`}>
              <span className="mvd-apar-wzor-nazwa">{NAZWA_KRYTERIUM[rodzaj]}:</span>{' '}
              <span className="mvd-num" data-uwaga={z.uwaga ?? undefined}>
                {z.tekst}
                {liczbowy ? ' kA' : ''}
              </span>
              {z.tytul ? <span className="mvd-apar-opis-inline"> — {z.tytul}</span> : null}
            </p>
          );
        })}
      </Krok>
    </div>
  );
}

/**
 * Podstawienie liczb backendu do warunku: x = wynik ≤ x_lim = limit [kA]. Bez liczby, gdy
 * którejś strony backend nie obliczył (pkt 7 dyrektywy: nie pokazuj wyniku nieobliczonego).
 */
function Podstawienie({ rekord }: { readonly rekord: OcenaKryterium | null }) {
  if (rekord === null) return <span data-uwaga="brak">{T.brakOceny}</span>;
  if (!rekord.stosowalnosc.dotyczy) return <span>{T.nieDotyczy}</span>;
  const wynik = rekord.wynik;
  const limit = rekord.limit?.wartosc ?? null;
  // Powód braku stoi raz — w wyniku końcowym.
  if (wynik === null || limit === null) return <span data-uwaga="brak">{T.kreska}</span>;
  const operator = OPERATOR_RELACJI[rekord.kryterium.relacja] ?? '\\le';
  const latex =
    `${wynik.symbol_latex} = ${liczbaLatex(wynik.wartosc.wartosc, 'prad')}\\ \\mathrm{kA}` +
    ` \\; ${operator} \\; ${liczbaLatex(limit.wartosc, 'prad')}\\ \\mathrm{kA}`;
  return <MathInline latex={latex} />;
}

/** Wiersz pola: natywny przełącznik rozwinięcia (klik w wiersz, Enter, spacja) + rozwinięcie. */
function WierszPola({
  pole,
  pradyWWierszach,
  liczbaKolumn,
  onParametryAparatu,
  onZapiszCzas,
  przeliczanie,
}: {
  readonly pole: PoleWytrzymalosci;
  readonly pradyWWierszach: boolean;
  readonly liczbaKolumn: number;
  readonly onParametryAparatu?: WeryfikacjaAparaturyProps['onParametryAparatu'];
  readonly onZapiszCzas?: (lacznikRef: string, czasS: number) => void;
  readonly przeliczanie: boolean;
}) {
  const [rozwiniety, setRozwiniety] = useState(false);
  const [szczegoly, setSzczegoly] = useState(false);
  const idRozwiniecia = useId();
  const idSzczegolow = useId();
  const prady = pole.prady_pola;
  const aparatRef = pole.zrodlo === 'model' ? pole.aparat_ref : null;
  return (
    <>
      <tr
        className="mvd-apar-wiersz"
        data-testid={`mvd-zwarcia-aparatura-pole-${pole.pole}`}
        // Znacznik maszynowy werdyktu jądra: 'true' / 'false' / 'nieustalone' (filtry, testy).
        data-withstand-ok={znacznikWerdyktu(pole)}
        data-zrodlo={pole.zrodlo}
        data-rozwiniety={String(rozwiniety)}
        // Klik w dowolne miejsce wiersza = ten sam przełącznik co przycisk w pierwszej komórce
        // (klawiatura obsługuje przycisk natywnie: Enter i spacja).
        onClick={(zdarzenie) => {
          if ((zdarzenie.target as HTMLElement).closest('button') !== null) return;
          setRozwiniety((stan) => !stan);
        }}
      >
        <th scope="row" className="mvd-apar-pole">
          <button
            type="button"
            className="mvd-apar-przelacz"
            aria-expanded={rozwiniety}
            aria-controls={rozwiniety ? idRozwiniecia : undefined}
            data-testid={`mvd-zwarcia-aparatura-rozwin-${pole.pole}`}
            onClick={() => setRozwiniety((stan) => !stan)}
          >
            <span className="mvd-apar-przelacz-znak" aria-hidden="true">
              {rozwiniety ? '▾' : '▸'}
            </span>
            {pole.pole}
          </button>
        </th>
        <td className="mvd-apar-aparat">{nazwaAparatu(pole)}</td>
        {pradyWWierszach && (
          <>
            <Komorka testId={`mvd-zwarcia-aparatura-ip-${pole.pole}`}>
              {liczba(prady.ip_ka, 'prad')}
            </Komorka>
            <Komorka testId={`mvd-zwarcia-aparatura-ith-${pole.pole}`}>
              {liczba(prady.ith_ka, 'prad')}
            </Komorka>
            <Komorka testId={`mvd-zwarcia-aparatura-ib-wiersz-${pole.pole}`}>
              {liczba(prady.ib_ka, 'prad')}
            </Komorka>
          </>
        )}
        <KomorkaCzasu pole={pole} />
        {RODZAJE_KRYTERIUM_APARATU.map((rodzaj) => {
          const z = zapas(ocenaRodzaju(pole, rodzaj));
          return (
            <Komorka
              key={rodzaj}
              uwaga={z.uwaga}
              tytul={z.tytul}
              testId={`mvd-zwarcia-aparatura-zapas-wiersz-${pole.pole}-${rodzaj}`}
            >
              {z.tekst}
            </Komorka>
          );
        })}
      </tr>
      {rozwiniety && (
        <tr className="mvd-apar-rozwiniecie" id={idRozwiniecia}>
          <td colSpan={liczbaKolumn} data-testid={`mvd-zwarcia-aparatura-rozwiniecie-${pole.pole}`}>
            <TabelaKryteriow pole={pole} />
            <CzasWylaczenia pole={pole} onZapiszCzas={onZapiszCzas} pracuje={przeliczanie} />
            <div className="mvd-apar-akcje-pola">
              {/* Jedna droga wejścia na schemat (karta SLD-SKALA-I-NAWIGACJA, część W):
                  aparat pola — gdy jest na schemacie; inaczej pole (zatoka). */}
              <PrzyciskPokazNaSchemacie
                elementRef={elementNaSchemacie(pole.aparat_ref) ? pole.aparat_ref : pole.pole_ref}
                zrodlo="weryfikacja-aparatury"
                className="mvd-apar-akcja mvd-apar-akcja--wtorna"
                testId={`mvd-zwarcia-aparatura-pokaz-${pole.pole}`}
              />
              {aparatRef !== null && onParametryAparatu && (
                <button
                  type="button"
                  className="mvd-apar-akcja mvd-apar-akcja--wtorna"
                  data-testid={`mvd-zwarcia-aparatura-parametry-aparatu-${pole.pole}`}
                  onClick={() => onParametryAparatu(aparatRef, pole.aparat_nazwa ?? aparatRef)}
                >
                  {T.parametryAparatu}
                </button>
              )}
              <button
                type="button"
                className="mvd-apar-akcja mvd-apar-akcja--wtorna"
                aria-expanded={szczegoly}
                aria-controls={szczegoly ? idSzczegolow : undefined}
                data-testid={`mvd-zwarcia-aparatura-szczegoly-przelacz-${pole.pole}`}
                onClick={() => setSzczegoly((stan) => !stan)}
              >
                {szczegoly ? T.szczegolyUkryj : T.szczegolyPokaz}
              </button>
            </div>
            {szczegoly && <SzczegolyObliczen pole={pole} id={idSzczegolow} />}
          </td>
        </tr>
      )}
    </>
  );
}

function TabelaPol({
  pola,
  onParametryAparatu,
  onZapiszCzas,
  przeliczanie,
}: {
  readonly pola: readonly PoleWytrzymalosci[];
  readonly onParametryAparatu?: WeryfikacjaAparaturyProps['onParametryAparatu'];
  readonly onZapiszCzas?: (lacznikRef: string, czasS: number) => void;
  readonly przeliczanie: boolean;
}) {
  const wspolne = pradyJednakowe(pola);
  const pierwsze = pola[0]?.prady_pola ?? null;
  // Pole, Aparat, (ip, Ith, Ib), Tk, trzy zapasy.
  const liczbaKolumn = 2 + (wspolne ? 0 : 3) + 1 + RODZAJE_KRYTERIUM_APARATU.length;
  return (
    <>
      {wspolne && pierwsze !== null && (
        <div className="mvd-apar-prady-wspolne" data-testid="mvd-zwarcia-aparatura-prady-wspolne">
          <span className="mvd-apar-prady-wspolne-tytul">{T.pradyWspolne}</span>
          <dl>
            <div>
              <dt>
                <Symbol latex={LATEX.ip_latex} jednostka={T.jednKa} />
              </dt>
              <dd className="mvd-num">{liczba(pierwsze.ip_ka, 'prad')}</dd>
            </div>
            <div>
              <dt>
                <Symbol latex={LATEX.ith_latex} jednostka={T.jednKa} />
              </dt>
              <dd className="mvd-num">{liczba(pierwsze.ith_ka, 'prad')}</dd>
            </div>
            <div>
              <dt>
                <Symbol latex={LATEX.ib_latex} jednostka={T.jednKa} />
              </dt>
              <dd className="mvd-num">{liczba(pierwsze.ib_ka, 'prad')}</dd>
            </div>
          </dl>
        </div>
      )}
      <table className="mvd-apar-tabela" data-testid="mvd-zwarcia-aparatura-werdykty">
        <thead>
          <tr>
            <th scope="col">{T.kolPole}</th>
            <th scope="col">{T.kolAparat}</th>
            {!wspolne && (
              <>
                <th scope="col" data-testid="mvd-zwarcia-aparatura-kol-ip">
                  <Symbol latex={LATEX.ip_latex} jednostka={T.jednKa} />
                </th>
                <th scope="col">
                  <Symbol latex={LATEX.ith_latex} jednostka={T.jednKa} />
                </th>
                <th scope="col">
                  <Symbol latex={LATEX.ib_latex} jednostka={T.jednKa} />
                </th>
              </>
            )}
            <th scope="col">
              <Symbol latex={LATEX.tk_latex} jednostka={T.jednS} />
            </th>
            {RODZAJE_KRYTERIUM_APARATU.map((rodzaj) => (
              <th scope="col" key={rodzaj}>
                {KOLUMNA_ZAPASU[rodzaj]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pola.map((pole) => (
            <WierszPola
              key={`${pole.pole_ref ?? pole.pole}::${pole.aparat_ref ?? pole.aparat_catalog_ref}`}
              pole={pole}
              pradyWWierszach={!wspolne}
              liczbaKolumn={liczbaKolumn}
              onParametryAparatu={onParametryAparatu}
              onZapiszCzas={onZapiszCzas}
              przeliczanie={przeliczanie}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

export function WeryfikacjaAparatury({
  wiersz,
  runId,
  onOtworzKonfiguracjeStacji,
  onParametryAparatu,
}: WeryfikacjaAparaturyProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'nieuruchomiona' });
  const [powod, setPowod] = useState<PowodBrakuPodstawy | null>(null);
  const [przeliczanie, setPrzeliczanie] = useState(false);
  const [bladZapisu, setBladZapisu] = useState<string | null>(null);
  // Bieg, z którego pochodzi pokazana ocena. JEDEN predykat świeżości: ocena jest aktualna,
  // gdy jej bieg jest biegiem ekranu (`runId`) albo biegiem przeliczenia po zapisie czasu —
  // każda inna zmiana biegu ekranu (albo punktu zwarcia) unieważnia ocenę.
  const biegOceny = useRef<string | null>(null);

  const stacje = stacjeDlaPunktu(snapshot, wiersz);
  const nazwyStacji = stacje.map((ref) => nazwaStacji(snapshot, ref)).join(', ');

  // Zmiana punktu zwarcia albo biegu unieważnia poprzedni werdykt (inaczej ekran
  // pokazywałby ocenę aparatury INNEGO punktu albo innego biegu).
  const punkt = useRef(wiersz.target_id);
  useEffect(() => {
    const zmianaPunktu = punkt.current !== wiersz.target_id;
    punkt.current = wiersz.target_id;
    if (!zmianaPunktu && runId !== null && runId === biegOceny.current) return;
    biegOceny.current = null;
    setStan({ rodzaj: 'nieuruchomiona' });
    setPowod(null);
  }, [wiersz.target_id, runId]);

  const sprawdz = async (bieg: string | null = biegOceny.current ?? runId) => {
    setStan({ rodzaj: 'pracuje' });
    try {
      const zebrane: PoleWytrzymalosci[] = [];
      if (caseId && bieg) {
        for (const stationRef of stacje) {
          // ZAPISANY BIEG, nie liczby: prąd każdego pola backend bierze z wiersza tego
          // biegu dla punktu zabudowy pola.
          const widok = await pobierzWytrzymaloscAparatury(caseId, {
            station_ref: stationRef,
            short_circuit_run_id: bieg,
          });
          zebrane.push(...widok.pola);
        }
      }
      biegOceny.current = bieg;

      const brak = powodBrakuPodstawy({ runId: bieg, stacje, liczbaPol: zebrane.length });
      setPowod(brak);
      setStan({ rodzaj: 'gotowe', wiersze: brak === null ? zebrane : [] });
    } catch (error) {
      setStan({
        rodzaj: 'blad',
        komunikat: error instanceof Error ? error.message : T.blad,
      });
    }
  };

  /**
   * Zapis przyjętego czasu zwarcia pola: operacja modelu na łączniku pola, potem automatyczne
   * przeliczenie biegiem tego samego rodzaju co bieg ekranu i ponowny odczyt oceny z nowego
   * biegu (ocena aparatury liczy z migawki biegu, więc sam zapis modelu jej nie zmienia).
   */
  const zapiszCzas = async (lacznikRef: string, czasS: number) => {
    if (!caseId) return;
    setPrzeliczanie(true);
    setBladZapisu(null);
    try {
      const wynik = await useSnapshotStore.getState().executeDomainOperation(
        caseId,
        'update_element_parameters',
        { element_ref: lacznikRef, parameters: { czas_wylaczenia_zwarcia_s: czasS } },
      );
      if (wynik === null || wynik.error) {
        setBladZapisu(wynik?.error ?? useSnapshotStore.getState().error ?? T.blad);
        return;
      }
      const biezacy = useExecutionRunsStore.getState().runs.find((r) => r.id === (biegOceny.current ?? runId));
      const rodzaj: ExecutionAnalysisType = biezacy?.analysis_type ?? 'SC_3F';
      let nowy: string | null = null;
      const ok = await uruchomObliczenie(rodzaj, undefined, (b) => {
        nowy = b.id;
      });
      if (ok && nowy !== null) {
        biegOceny.current = nowy;
        await sprawdz(nowy);
      }
    } finally {
      setPrzeliczanie(false);
    }
  };

  const komunikatBraku = (p: PowodBrakuPodstawy): string =>
    p === 'brak-biegu'
      ? T.brakBiegu
      : p === 'punkt-poza-stacja'
        ? T.punktPozaStacja
        : T.brakAparatury;

  const liczbaPol = stan.rodzaj === 'gotowe' ? stan.wiersze.length : null;

  return (
    <section className="mvd-apar" data-testid="mvd-zwarcia-aparatura">
      <header className="mvd-apar-glowa">
        <h3 className="mvd-apar-tytul" data-testid="mvd-zwarcia-aparatura-tytul">
          {T.tytul}
          {stacje.length > 0 && (
            <>
              {' — '}
              <span className="mvd-apar-punkt">{nazwyStacji}</span>
            </>
          )}
        </h3>
        <button
          type="button"
          className="mvd-apar-akcja"
          data-testid="mvd-zwarcia-aparatura-sprawdz"
          disabled={stan.rodzaj === 'pracuje'}
          onClick={() => void sprawdz()}
        >
          {stan.rodzaj === 'pracuje'
            ? T.pracuje
            : stan.rodzaj === 'nieuruchomiona'
              ? T.akcja
              : T.akcjaPonow}
        </button>
      </header>

      <dl className="mvd-apar-wejscia" data-testid="mvd-zwarcia-aparatura-wejscia">
        <div>
          <dt>{T.wejscieStacja}</dt>
          {/* Strefa pierwszoplanowa mówi NAZWĄ stacji; ref modelu zostaje
              maszynowym atrybutem (podpowiedź i asercje), nie napisem. */}
          <dd
            data-testid="mvd-zwarcia-aparatura-stacje"
            data-stacje-ref={stacje.join(',')}
            title={stacje.join(', ')}
          >
            {stacje.length === 0 ? T.kreska : nazwyStacji}
          </dd>
        </div>
        <div>
          <dt>{T.wejsciePola}</dt>
          <dd className="mvd-num">{liczbaPol === null ? T.kreska : String(liczbaPol)}</dd>
        </div>
      </dl>

      {stan.rodzaj === 'blad' && (
        <p className="mvd-apar-blad" data-testid="mvd-zwarcia-aparatura-blad">
          {T.blad} {stan.komunikat} {T.bladUwaga}
        </p>
      )}

      {stan.rodzaj === 'gotowe' && powod !== null && (
        <div className="mvd-apar-brak" data-testid="mvd-zwarcia-aparatura-brak" data-powod={powod}>
          <p>{caseId ? komunikatBraku(powod) : T.brakPrzypadku}</p>
          {powod === 'brak-aparatury' && stacje.length > 0 && (
            <button
              type="button"
              className="mvd-apar-akcja mvd-apar-akcja--wtorna"
              data-testid="mvd-zwarcia-aparatura-konfiguruj"
              onClick={() => onOtworzKonfiguracjeStacji?.(stacje[0])}
            >
              {T.brakAparaturyAkcja}
            </button>
          )}
        </div>
      )}

      {stan.rodzaj === 'gotowe' && powod === null && (
        <>
          {bladZapisu !== null && (
            <p className="mvd-apar-blad" data-testid="mvd-zwarcia-aparatura-blad-czasu">
              {T.bladZapisuCzasu} {bladZapisu}
            </p>
          )}
          <TabelaPol
            pola={stan.wiersze}
            onParametryAparatu={onParametryAparatu}
            onZapiszCzas={caseId ? (ref, t) => void zapiszCzas(ref, t) : undefined}
            przeliczanie={przeliczanie}
          />
        </>
      )}

      <p className="mvd-apar-norma">{T.norma}</p>
    </section>
  );
}
