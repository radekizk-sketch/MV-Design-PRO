/**
 * WeryfikacjaAparatury — OGNIWO ŁAŃCUCHA „wynik zwarciowy → wytrzymałość aparatury pól
 * stacji" (karty KD-4, KD-6; prezentacja tabelaryczna — APARATURA-TABELA; szczegóły pola —
 * KD6-SZCZEGOLY, standard §10 kontraktu prezentacji inżynierskiej).
 *
 * UKŁAD. Jedno pole = jeden wiersz tabeli; natywny przełącznik z `aria-expanded` (klik
 * w wiersz, Enter, spacja) rozwija widok pola:
 *  - tabela kryteriów Kryterium | Prąd obliczony | Wartość znamionowa | Zapas (dynamiczne,
 *    cieplne, wyłączalne; warunek wzorem przy nazwie),
 *  - pod nią czas wyłączenia t_zab + t_wył = T_k z członów backendu (brak członu =
 *    „nieustalony”, bez liczby zastępczej i bez t_b innego pola),
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

import { useEffect, useId, useState, type ReactNode } from 'react';

import './aparatura.css';
import { useAppStateStore } from '../../../../ui/app-state';
import { MathInline } from '../../../../ui/proof/MathRenderer';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { OcenaKryterium, PodstawaWymagania } from '../../wzorzec/werdykt';
import {
  ocenaRodzaju,
  pobierzWytrzymaloscAparatury,
  RODZAJE_KRYTERIUM_APARATU,
  znacznikWerdyktu,
  type PoleWytrzymalosci,
  type RodzajKryteriumAparatu,
  type WartoscParametruAparatu,
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

/** Czas wyłączenia pola T_k (z backendu) albo jawne „nieustalony” — bez liczby. */
function KomorkaCzasu({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const czas = pole.czas_wylaczenia;
  const t = czas.t_clearing_s;
  return (
    <Komorka
      uwaga={t === null ? 'brak' : null}
      testId={`mvd-zwarcia-aparatura-czas-${pole.pole}`}
      tytul={czas.powod_pl}
      zrodloCzasu={czas.zrodlo ?? 'nieustalony'}
    >
      {t === null ? T.nieustalony : formatujWielkosc(t, 'czas')}
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

/** Składnik sumy czasu: liczba backendu albo „nieustalony” (wyróżniony). */
function SkladnikCzasu({ wartosc, testId }: { readonly wartosc: number | null; readonly testId: string }) {
  return (
    <span className="mvd-num" data-testid={testId} data-uwaga={wartosc === null ? 'brak' : undefined}>
      {wartosc === null ? T.nieustalony : formatujWielkosc(wartosc, 'czas')}
    </span>
  );
}

/**
 * Czas wyłączenia pola pod tabelą: t_zab + t_wył = T_k [s]. Każda wartość z backendu
 * (`czlon_nastawczy_s`, `czas_wlasny_wylacznika_s`, `t_clearing_s`); brak = „nieustalony”.
 */
function CzasWylaczenia({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const czas = pole.czas_wylaczenia;
  const zrodlo =
    czas.zrodlo === 'nastawy_pola'
      ? T.czasZNastaw
      : czas.zrodlo === 'konfiguracja'
        ? T.czasZKonfiguracji
        : null;
  return (
    <p
      className="mvd-apar-czas-linia"
      data-testid={`mvd-zwarcia-aparatura-czas-szczegoly-${pole.pole}`}
      data-zrodlo-czasu={czas.zrodlo ?? 'nieustalony'}
    >
      <span className="mvd-apar-czas-etykieta">
        {T.czasWylaczenia} <MathInline latex={`${LATEX.tzab_latex} + ${LATEX.twyl_latex} = ${LATEX.tk_latex}`} />{' '}
        {T.jednS}:
      </span>{' '}
      <SkladnikCzasu wartosc={czas.czlon_nastawczy_s} testId={`mvd-zwarcia-aparatura-tzab-${pole.pole}`} />
      {' + '}
      <SkladnikCzasu
        wartosc={czas.czas_wlasny_wylacznika_s}
        testId={`mvd-zwarcia-aparatura-twyl-${pole.pole}`}
      />
      {' = '}
      <SkladnikCzasu wartosc={czas.t_clearing_s} testId={`mvd-zwarcia-aparatura-tk-${pole.pole}`} />
      {zrodlo !== null && <span className="mvd-apar-czas-zrodlo"> · {zrodlo}</span>}
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

/** Parametr aparatu: wartość, pochodzenie, znacznik wartości roboczej; opis źródła raz. */
function Parametr({
  pole,
  w,
  opisWZalozeniach,
}: {
  readonly pole: PoleWytrzymalosci;
  readonly w: WartoscParametruAparatu;
  readonly opisWZalozeniach: boolean;
}) {
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
        >
          {T.etykietaRobocza}
        </span>
      )}
      {w.wartosc_robocza && !opisWZalozeniach && <p className="mvd-apar-opis">{w.opis_zrodla_pl}</p>}
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
 * Szczegóły obliczeń pola (domyślnie zwinięte): dane wejściowe → wzory → podstawienia →
 * wyniki pośrednie → wynik końcowy. Wyłącznie istniejące dane rekordu i widoku pola. Bez
 * komunikatu słownego backendu (`komunikat_pl`): powtarza liczby tabeli i niesie zdanie
 * o kompletności dowodu, którego widok nie pokazuje (V12K-353).
 */
function SzczegolyObliczen({ pole, id }: { readonly pole: PoleWytrzymalosci; readonly id: string }) {
  const prady = pole.prady_pola;
  const czas = pole.czas_wylaczenia;
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
            <dt>
              <Symbol latex={LATEX.tb_latex} jednostka={T.jednS} />
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
        <p className="mvd-apar-opis" data-testid={`mvd-zwarcia-aparatura-czas-opis-${pole.pole}`}>
          {T.zrodloCzasu}: {czas.powod_pl}
        </p>
        {czas.zalozenia_pl.map((zalozenie) => (
          <p className="mvd-apar-opis" key={zalozenie}>
            {zalozenie}
          </p>
        ))}
        {parametry.length > 0 && (
          <ul className="mvd-apar-parametry" data-testid={`mvd-zwarcia-aparatura-parametry-${pole.pole}`}>
            {parametry.map((w) => (
              <Parametr
                key={w.parametr}
                pole={pole}
                w={w}
                // Uzasadnienie wartości roboczej raz: jeśli niesie je już założenie czasu
                // wyłączenia (czas własny), parametr go nie powtarza.
                opisWZalozeniach={czas.zalozenia_pl.some((z) => z.includes(w.opis_zrodla_pl))}
              />
            ))}
          </ul>
        )}
      </Krok>

      <Krok tytul={T.krokWzory} testId={`mvd-zwarcia-aparatura-wzory-${pole.pole}`}>
        {definicjeZapasu.map((definicja) => (
          <p className="mvd-apar-wzor" key={definicja}>
            {T.zapasDefinicja}: <MathInline latex={definicja} />
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
        {rekordy.map(({ rodzaj, rekord }) =>
          rekord?.limit ? (
            <p className="mvd-apar-opis" key={rodzaj} data-testid={`mvd-zwarcia-aparatura-limit-${pole.pole}-${rodzaj}`}>
              <span className="mvd-apar-wzor-nazwa">{NAZWA_KRYTERIUM[rodzaj]}:</span>{' '}
              {rekord.limit.zakres_stosowalnosci_pl ? `${rekord.limit.zakres_stosowalnosci_pl}; ` : ''}
              {T.podstawa} {opisPodstawy(rekord.limit.podstawa)}
            </p>
          ) : null,
        )}
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
}: {
  readonly pole: PoleWytrzymalosci;
  readonly pradyWWierszach: boolean;
  readonly liczbaKolumn: number;
  readonly onParametryAparatu?: WeryfikacjaAparaturyProps['onParametryAparatu'];
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
            <CzasWylaczenia pole={pole} />
            <div className="mvd-apar-akcje-pola">
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
}: {
  readonly pola: readonly PoleWytrzymalosci[];
  readonly onParametryAparatu?: WeryfikacjaAparaturyProps['onParametryAparatu'];
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

  const stacje = stacjeDlaPunktu(snapshot, wiersz);
  const nazwyStacji = stacje.map((ref) => nazwaStacji(snapshot, ref)).join(', ');

  // Zmiana punktu zwarcia albo biegu unieważnia poprzedni werdykt (inaczej ekran
  // pokazywałby ocenę aparatury INNEGO punktu albo innego biegu).
  useEffect(() => {
    setStan({ rodzaj: 'nieuruchomiona' });
    setPowod(null);
  }, [wiersz.target_id, runId]);

  const sprawdz = async () => {
    setStan({ rodzaj: 'pracuje' });
    try {
      const zebrane: PoleWytrzymalosci[] = [];
      if (caseId && runId) {
        for (const stationRef of stacje) {
          // ZAPISANY BIEG, nie liczby: prąd każdego pola backend bierze z wiersza tego
          // biegu dla punktu zabudowy pola.
          const widok = await pobierzWytrzymaloscAparatury(caseId, {
            station_ref: stationRef,
            short_circuit_run_id: runId,
          });
          zebrane.push(...widok.pola);
        }
      }

      const brak = powodBrakuPodstawy({ runId, stacje, liczbaPol: zebrane.length });
      setPowod(brak);
      setStan({ rodzaj: 'gotowe', wiersze: brak === null ? zebrane : [] });
    } catch (error) {
      setStan({
        rodzaj: 'blad',
        komunikat: error instanceof Error ? error.message : T.blad,
      });
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
        <TabelaPol pola={stan.wiersze} onParametryAparatu={onParametryAparatu} />
      )}

      <p className="mvd-apar-norma">{T.norma}</p>
    </section>
  );
}
