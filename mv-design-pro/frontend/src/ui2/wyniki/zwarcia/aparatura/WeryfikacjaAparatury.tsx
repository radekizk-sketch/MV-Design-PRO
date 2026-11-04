/**
 * WeryfikacjaAparatury — OGNIWO ŁAŃCUCHA „wynik zwarciowy → wytrzymałość aparatury pól
 * stacji" (karty KD-4, KD-6; prezentacja tabelaryczna — karta APARATURA-TABELA).
 *
 * DLACZEGO TABELA. Właściciel ocenił poprzedni ekran (trzy duże karty pól, dziewięć rekordów
 * z etykietami, akapity założeń w pierwszym planie) jako przegadany. Inżynier potrzebuje
 * jednego spojrzenia: pole → liczby → zapasy wytrzymałości. Dlatego:
 *  - jedno pole = jeden wiersz; natywny przycisk z `aria-expanded` (klik w wiersz, Enter,
 *    spacja) rozwija porównanie Parametr | Obliczony | Aparat | Zapas trzech kryteriów;
 *  - prądy ip, Ith, Ib stoją nad tabelą RAZ, wyłącznie gdy backend podał je jednakowe dla
 *    wszystkich pól; inaczej idą do wierszy (ekran porównuje liczby backendu, nie liczy);
 *  - założenia, wartości robocze, podstawy limitów, przedmiot, kompletność dowodu i pełne
 *    wyjaśnienia kryteriów (`KartaWerdyktu`, wzory z `*_latex`) są w „Szczegółach obliczeń”;
 *  - wiersze neutralne; kolor wyłącznie przy wartości wymagającej uwagi (zapas ujemny, brak
 *    zapasu albo limitu, czas wyłączenia nieustalony).
 *
 * SKĄD LICZBY. Każda komórka porównania czyta rekord K TEGO pola (`ocenaRodzaju`): wynik,
 * limit i margines z backendu (`wytrzymalosc_aparatury_pol.py`) — nigdy kopia innego pola
 * i nigdy liczba policzona tutaj. Czas wyłączenia pola T_k i czas znamionowy T_kr aparatu
 * pochodzą z `czas_wylaczenia.t_clearing_s` i `znamiona.i_th_duration_s`.
 *
 * GRANICA KONTRAKTU WERDYKTU. Ten plik nie czyta statusu maszynowego rekordu i nie pokazuje
 * etykiet statusu (przypięte testem źródła). Status, etykieta i kompletność dowodu żyją
 * w rekordzie i w karcie werdyktu w szczegółach — tabela pokazuje liczby i ich braki.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';

import './aparatura.css';
import { useAppStateStore } from '../../../../ui/app-state';
import { MathInline } from '../../../../ui/proof/MathRenderer';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { TekstZWzorami } from '../../../kreatory/rama';
import { KartaWerdyktu } from '../../wzorzec';
import type { OcenaKryterium } from '../../wzorzec/werdykt';
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
import { APARATURA_STRINGS as T } from './strings';

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
  /** Nazwa wybranego punktu w języku ekranu (wskazuje stację). */
  readonly punktNazwa: string;
  /** Przejście do konfiguracji stacji (akcja naprawcza stanu zerowego). */
  readonly onOtworzKonfiguracjeStacji?: (stationRef: string) => void;
  /** „Parametry aparatu” aparatu z modelu → kreator edycji parametrów aparatu. */
  readonly onParametryAparatu?: (aparatRef: string, aparatNazwa: string) => void;
}

/** Wyróżnienie komórki: `null` = neutralna. */
type Uwaga = 'ujemny' | 'brak' | null;

const NAZWA_KRYTERIUM: Readonly<Record<RodzajKryteriumAparatu, string>> = {
  dynamiczna: T.kryteriumSzczytowy,
  cieplna: T.kryteriumCieplny,
  wylaczanie: T.kryteriumWylaczalny,
};

const KOLUMNA_ZAPASU: Readonly<Record<RodzajKryteriumAparatu, string>> = {
  dynamiczna: T.kolZapasSzczytowy,
  cieplna: T.kolZapasCieplny,
  wylaczanie: T.kolZapasWylaczalny,
};

function liczba(wartosc: number | null | undefined, rodzaj: RodzajWielkosci): string {
  return wartosc === null || wartosc === undefined ? T.kreska : formatujWielkosc(wartosc, rodzaj);
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
  if (m === null) {
    return {
      tekst: T.brakZapasu,
      uwaga: 'brak',
      tytul: rekord.margines?.powod_pl ?? rekord.wyjasnienie.czego_brakuje.join('; '),
    };
  }
  return { tekst: formatujWielkosc(m.wartosc, 'zapas'), uwaga: m.wartosc < 0 ? 'ujemny' : null };
}

function opisZrodla(pole: PoleWytrzymalosci): string {
  return pole.zrodlo === 'model' ? T.zrodloModel : T.zrodloKonfiguracja;
}

function nazwaAparatu(pole: PoleWytrzymalosci): string {
  return pole.aparat_etykieta ?? pole.aparat_nazwa ?? pole.aparat_catalog_ref;
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

/** Porównanie trzech kryteriów pola — każda liczba z rekordu K TEGO pola. */
function Porownanie({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const tk = pole.czas_wylaczenia.t_clearing_s;
  const tkr = pole.znamiona?.i_th_duration_s ?? null;
  return (
    <table
      className="mvd-apar-porownanie"
      data-testid={`mvd-zwarcia-aparatura-porownanie-${pole.pole}`}
    >
      <thead>
        <tr>
          <th scope="col">{T.porownanieParametr}</th>
          <th scope="col">{T.porownanieObliczony}</th>
          <th scope="col">{T.porownanieAparat}</th>
          <th scope="col">{T.porownanieZapas}</th>
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
                {rodzaj === 'cieplna' && (
                  <span className="mvd-apar-czasy-odniesienia">
                    <span
                      data-testid={`mvd-zwarcia-aparatura-tk-${pole.pole}`}
                      data-uwaga={tk === null ? 'brak' : undefined}
                    >
                      {T.czasTk} ={' '}
                      {tk === null ? T.nieustalony : `${formatujWielkosc(tk, 'czas')} ${T.jednS}`}
                    </span>
                    {' · '}
                    <span data-testid={`mvd-zwarcia-aparatura-tkr-${pole.pole}`}>
                      {T.czasTkr} ={' '}
                      {tkr === null ? T.kreska : `${formatujWielkosc(tkr, 'czas')} ${T.jednS}`}
                    </span>
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

function opisPochodzenia(w: WartoscParametruAparatu): string {
  if (w.pochodzenie === 'KATALOG') return T.pochodzenieKatalog;
  if (w.pochodzenie === 'PROPOZYCJA') return T.pochodzeniePropozycja;
  if (w.pochodzenie === 'PROJEKTANT') return T.pochodzenieProjektant;
  return T.pochodzenieBrak;
}

/** Parametry aparatu z backendu w stałej kolejności: czas własny, I_k, t_k, I_p. */
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
 * Szczegóły obliczeń pola: ocena backendu, aparat i źródło, prądy punktu zabudowy (z t_b
 * i jego pochodzeniem), rozbicie czasu wyłączenia z założeniami, parametry aparatu z
 * pochodzeniem i wartościami roboczymi oraz pełna karta werdyktu KAŻDEGO kryterium.
 */
function SzczegolyObliczen({ pole, id }: { readonly pole: PoleWytrzymalosci; readonly id: string }) {
  const prady = pole.prady_pola;
  const czas = pole.czas_wylaczenia;
  const parametry = parametryPola(pole);
  const zrodloCzasu =
    czas.zrodlo === 'nastawy_pola'
      ? T.czasZNastaw
      : czas.zrodlo === 'konfiguracja'
        ? T.czasZKonfiguracji
        : T.nieustalony;
  const opisTb = prady.tb_zrodlo?.opis_pl ?? null;
  return (
    <div
      className="mvd-apar-szczegoly"
      id={id}
      data-testid={`mvd-zwarcia-aparatura-szczegoly-${pole.pole}`}
    >
      <section>
        <h5 className="mvd-apar-szczegoly-tytul">{T.szczegolyOcena}</h5>
        <p className="mvd-apar-komunikat" data-testid={`mvd-zwarcia-aparatura-komunikat-${pole.pole}`}>
          {pole.komunikat_pl}
        </p>
        <p className="mvd-apar-zrodlo" data-testid={`mvd-zwarcia-aparatura-zrodlo-${pole.pole}`}>
          {T.szczegolyAparat}: {nazwaAparatu(pole)} · {opisZrodla(pole)}
        </p>
      </section>

      <section
        data-testid={`mvd-zwarcia-aparatura-prady-${pole.pole}`}
        data-punkt-ref={prady.punkt_ref ?? ''}
      >
        <h5 className="mvd-apar-szczegoly-tytul">{T.pradyPola}</h5>
        <dl className="mvd-apar-czas-pola">
          <div>
            <dt>{T.pradyPunkt}</dt>
            <dd>{prady.punkt_nazwa ?? T.kreska}</dd>
          </div>
          <div>
            <dt>{T.pradyUn}</dt>
            <dd className="mvd-num">{liczba(prady.un_kv, 'prad')}</dd>
          </div>
          <div>
            <dt>{T.pradyIk}</dt>
            <dd className="mvd-num">{liczba(prady.ik_ka, 'prad')}</dd>
          </div>
          <div>
            <dt>{T.kolIp}</dt>
            <dd className="mvd-num">{liczba(prady.ip_ka, 'prad')}</dd>
          </div>
          <div>
            <dt>{T.kolIth}</dt>
            <dd className="mvd-num">{liczba(prady.ith_ka, 'prad')}</dd>
          </div>
          <div>
            <dt>{T.kolIb}</dt>
            <dd className="mvd-num" data-testid={`mvd-zwarcia-aparatura-ib-${pole.pole}`}>
              {liczba(prady.ib_ka, 'prad')}
            </dd>
          </div>
          <div>
            <dt>{T.pradyIdc}</dt>
            <dd className="mvd-num">{liczba(prady.i_dc_ka, 'prad')}</dd>
          </div>
          <div>
            <dt>{T.pradyTb}</dt>
            <dd className="mvd-num" data-testid={`mvd-zwarcia-aparatura-tb-${pole.pole}`}>
              {prady.tb_s === null ? T.pradyTbBrak : formatujWielkosc(prady.tb_s, 'czas')}
            </dd>
          </div>
        </dl>
        {opisTb !== null && <p className="mvd-apar-czas-zalozenie">{opisTb}</p>}
        {prady.powod_pl !== null && <p className="mvd-apar-czas-powod">{prady.powod_pl}</p>}
      </section>

      <section
        data-testid={`mvd-zwarcia-aparatura-czas-szczegoly-${pole.pole}`}
        data-zrodlo-czasu={czas.zrodlo ?? 'nieustalony'}
      >
        <h5 className="mvd-apar-szczegoly-tytul">{T.czasTytul}</h5>
        <dl className="mvd-apar-czas-pola">
          <div>
            <dt>
              <TekstZWzorami tekst={T.czasSuma} />
            </dt>
            <dd className="mvd-num">
              {czas.t_clearing_s === null
                ? T.nieustalony
                : formatujWielkosc(czas.t_clearing_s, 'czas')}
            </dd>
          </div>
          <div>
            <dt>{T.czasCzlonNastawczy}</dt>
            <dd className="mvd-num">{liczba(czas.czlon_nastawczy_s, 'czas')}</dd>
          </div>
          <div>
            <dt>{T.czasWlasny}</dt>
            <dd className="mvd-num">{liczba(czas.czas_wlasny_wylacznika_s, 'czas')}</dd>
          </div>
          <div>
            <dt>{T.czasZrodlo}</dt>
            <dd>{zrodloCzasu}</dd>
          </div>
        </dl>
        <p className="mvd-apar-czas-powod">{czas.powod_pl}</p>
        {czas.zalozenia_pl.map((zalozenie) => (
          <p className="mvd-apar-czas-zalozenie" key={zalozenie}>
            {T.czasZalozenie} {zalozenie}
          </p>
        ))}
      </section>

      {parametry.length > 0 && (
        <section data-testid={`mvd-zwarcia-aparatura-parametry-${pole.pole}`}>
          <h5 className="mvd-apar-szczegoly-tytul">{T.parametryTytul}</h5>
          <ul className="mvd-apar-parametry">
            {parametry.map((w) => (
              <li
                key={w.parametr}
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
                {w.wartosc_robocza && (
                  <span
                    className="mvd-apar-parametr-robocza"
                    data-testid={`mvd-zwarcia-aparatura-robocza-${pole.pole}-${w.parametr}`}
                  >
                    {T.etykietaRobocza}
                  </span>
                )}
                <span className="mvd-apar-parametr-pochodzenie">{opisPochodzenia(w)}</span>
                {w.wartosc_robocza && <p className="mvd-apar-czas-zalozenie">{w.opis_zrodla_pl}</p>}
                {w.wartosc === null && w.powod_braku_pl !== null && (
                  <p className="mvd-apar-czas-powod">{w.powod_braku_pl}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pole.oceny.length > 0 && (
        <section data-testid={`mvd-zwarcia-aparatura-oceny-${pole.pole}`}>
          <h5 className="mvd-apar-szczegoly-tytul">{T.kryteriaTytul}</h5>
          <div className="mvd-apar-oceny">
            {pole.oceny.map((ocena) => (
              <KartaWerdyktu key={ocena.kryterium_id} rekord={ocena} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
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
          <td colSpan={liczbaKolumn}>
            <Porownanie pole={pole} />
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
              <dt>{T.kolIp}</dt>
              <dd className="mvd-num">{liczba(pierwsze.ip_ka, 'prad')}</dd>
            </div>
            <div>
              <dt>{T.kolIth}</dt>
              <dd className="mvd-num">{liczba(pierwsze.ith_ka, 'prad')}</dd>
            </div>
            <div>
              <dt>{T.kolIb}</dt>
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
                <th scope="col">{T.kolIp}</th>
                <th scope="col">{T.kolIth}</th>
                <th scope="col">{T.kolIb}</th>
              </>
            )}
            <th scope="col">{T.kolTk}</th>
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
  punktNazwa,
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
        <div>
          <h3 className="mvd-apar-tytul" data-testid="mvd-zwarcia-aparatura-tytul">
            {T.tytul}
            {stacje.length > 0 && (
              <>
                {' — '}
                <span className="mvd-apar-punkt">{nazwyStacji}</span>
              </>
            )}
          </h3>
          <p className="mvd-apar-cel" data-testid="mvd-zwarcia-aparatura-punkt">
            {T.punktWskazuje} „{punktNazwa}” {T.punktWskazujeOpis}
          </p>
        </div>
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
