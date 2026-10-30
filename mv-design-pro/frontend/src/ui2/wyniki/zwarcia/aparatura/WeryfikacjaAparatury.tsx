/**
 * WeryfikacjaAparatury — OGNIWO ŁAŃCUCHA „wynik zwarciowy → wytrzymałość
 * aparatury" (karta KD-4; tor Z MODELU — karta KD-6 poz. 2-3).
 *
 * DLACZEGO. Karta K7-B wpięła w konfigurator stacji sekcję werdyktu
 * wytrzymałości (I_dyn / I_th) liczonego przez backend, a KD-4 dołożyła
 * przejście z wyniku zwarciowego. Odbiór KD-4 nazwał jednak dług: aparat brał
 * się WYŁĄCZNIE z ręcznie zapisanej konfiguracji stacji, więc pole, którego
 * inżynier nie skonfigurował, nie istniało dla oceny — mimo że model wie, jaka
 * pozycja katalogu APARAT_SN w nim stoi. KD-6 domyka to ogniwo: werdykty
 * powstają dla WSZYSTKICH pól stacji z aparatami z modelu, a konfiguracja
 * pozostaje nadrzędna tam, gdzie inżynier jej użył (każdy wiersz mówi, skąd
 * wziął aparat).
 *
 * PRĄDY PER POLE (karta WYTRZYMALOSC-PRAD-POLA): do końcówki jedzie stacja i ZAPISANY bieg,
 * nie liczby wybranego punktu. Każdy wiersz pokazuje prądy SWOJEGO punktu zabudowy oraz trzy
 * rekordy werdyktu wyjaśnialnego (dynamiczny, cieplny, zdolności wyłączania — karta
 * SC-IB-ITH-ZRODLA: rekord nazywa porównaną wielkość Ib albo I″k i jej normę) jedyną kartą
 * werdyktu — status zawsze z wynikiem, limitem, marginesem i przyczyną braku.
 *
 * ZERO FIZYKI W PREZENTACJI: ten plik nic nie porównuje i nie skaluje — składa
 * wejścia i pokazuje `message_pl` backendu. Trzy stany werdyktu (wytrzymuje /
 * nie wytrzymuje / NIEUSTALONE) są odwzorowane 1:1 z sekcji K7-B: „nieustalone"
 * to brak podstawy, a nie ocena negatywna.
 *
 * WARTOŚCI ROBOCZE (zasada nr 4, V12K-351): brak danej karty aparatu (czas własny, I_p, t_k)
 * nie zatrzymuje oceny — backend przyjmuje wartość roboczą z jawnym źródłem. Wiersz pola
 * pokazuje każdy parametr z pochodzeniem; wartość robocza ma etykietę „wartość robocza”, opis
 * źródła i wpływu oraz akcję „Zmień wartość”, która otwiera kreator edycji parametrów aparatu
 * (zapis na elemencie modelu, przeliczenie). Bez banerów — status i kompletność dowodu niesie
 * karta werdyktu (dane przyjęte w szczegółach kryterium).
 */

import { useEffect, useState } from 'react';

import './aparatura.css';
import { useAppStateStore } from '../../../../ui/app-state';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { KartaWerdyktu } from '../../wzorzec';
import { EtykietaWerdyktu } from '../../wzorzec/KartaWerdyktu';
import { fmtCzas, fmtKA, fmtLiczba } from '../strings';
import {
  pobierzWytrzymaloscAparatury,
  type PoleWytrzymalosci,
  type WartoscParametruAparatu,
} from './api';
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
  /** Nazwa punktu w języku ekranu (nagłówek sekcji). */
  readonly punktNazwa: string;
  /** Przejście do konfiguracji stacji (akcja naprawcza stanu zerowego). */
  readonly onOtworzKonfiguracjeStacji?: (stationRef: string) => void;
  /** „Zmień wartość” parametru aparatu z modelu → kreator edycji parametrów aparatu. */
  readonly onZmienWartosc?: (aparatRef: string, aparatNazwa: string, parametr: string) => void;
}

/** Etykieta źródła aparatu — inżynier musi wiedzieć, co ocenia. */
function opisZrodla(pole: PoleWytrzymalosci): string {
  return pole.zrodlo === 'model' ? T.zrodloModel : T.zrodloKonfiguracja;
}

/** Prąd z backendu albo uczciwa kreska. */
function kiloampery(wartosc: number | null): string {
  return wartosc === null ? T.kreska : `${fmtKA(wartosc)} ${T.jednKA}`;
}

/** Prądy pola z wiersza biegu dla JEGO punktu zabudowy (albo powód braku z backendu). */
function PradyPola({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const prady = pole.prady_pola;
  return (
    <div
      className="mvd-apar-czas"
      data-testid={`mvd-zwarcia-aparatura-prady-${pole.pole}`}
      data-punkt-ref={prady.punkt_ref ?? ''}
    >
      <dl className="mvd-apar-czas-pola">
        <div>
          <dt>{T.pradyPunkt}</dt>
          <dd>{prady.punkt_nazwa ?? T.kreska}</dd>
        </div>
        <div>
          <dt>{T.pradyIp}</dt>
          <dd className="mvd-num">{kiloampery(prady.ip_ka)}</dd>
        </div>
        <div>
          <dt>{T.pradyIth}</dt>
          <dd className="mvd-num">{kiloampery(prady.ith_ka)}</dd>
        </div>
        {/* Karta SC-IB-ITH-ZRODLA: wielkości kryterium wyłączania z TEGO SAMEGO wiersza
            biegu — Ib (prąd wyłączeniowy symetryczny), iDC(tb) informacyjnie i tb biegu. */}
        <div>
          <dt>{T.pradyIb}</dt>
          <dd className="mvd-num" data-testid={`mvd-zwarcia-aparatura-ib-${pole.pole}`}>
            {kiloampery(prady.ib_ka)}
          </dd>
        </div>
        <div>
          <dt>{T.pradyIdc}</dt>
          <dd className="mvd-num">{kiloampery(prady.i_dc_ka)}</dd>
        </div>
        <div>
          <dt>{T.pradyTb}</dt>
          <dd className="mvd-num" data-testid={`mvd-zwarcia-aparatura-tb-${pole.pole}`}>
            {prady.tb_s === null ? T.pradyTbBrak : sekundy(prady.tb_s)}
          </dd>
        </div>
      </dl>
      {prady.powod_pl !== null && <p className="mvd-apar-czas-powod">{prady.powod_pl}</p>}
    </div>
  );
}

/** Sekunda z backendu albo uczciwa kreska (prezentacja NIC nie dolicza). */
function sekundy(wartosc: number | null): string {
  return wartosc === null ? T.kreska : `${fmtCzas(wartosc)} ${T.jednS}`;
}

/**
 * Rozbicie czasu wyłączenia (WHITE BOX): suma i OBA człony osobno, źródło oraz
 * założenia przyjęte przy braku danej. Liczby pochodzą wprost z odpowiedzi —
 * ekran ich nie sumuje, bo suma jest częścią wyprowadzenia, nie prezentacji.
 */
function RozbicieCzasu({ pole }: { readonly pole: PoleWytrzymalosci }) {
  const czas = pole.czas_wylaczenia;
  const zrodlo =
    czas.zrodlo === 'nastawy_pola'
      ? T.czasZNastaw
      : czas.zrodlo === 'konfiguracja'
        ? T.czasZKonfiguracji
        : T.czasNieustalony;
  return (
    <div
      className="mvd-apar-czas"
      data-testid={`mvd-zwarcia-aparatura-czas-${pole.pole}`}
      data-zrodlo-czasu={czas.zrodlo ?? 'nieustalony'}
    >
      <dl className="mvd-apar-czas-pola">
        <div>
          <dt>{T.czasSuma}</dt>
          <dd className="mvd-num">{sekundy(czas.t_clearing_s)}</dd>
        </div>
        <div>
          <dt>{T.czasCzlonNastawczy}</dt>
          <dd className="mvd-num">{sekundy(czas.czlon_nastawczy_s)}</dd>
        </div>
        <div>
          <dt>{T.czasWlasny}</dt>
          <dd className="mvd-num">{sekundy(czas.czas_wlasny_wylacznika_s)}</dd>
        </div>
        <div>
          <dt>{T.czasZrodlo}</dt>
          <dd>{zrodlo}</dd>
        </div>
      </dl>
      <p className="mvd-apar-czas-powod">{czas.powod_pl}</p>
      {czas.zalozenia_pl.map((zalozenie) => (
        <p className="mvd-apar-czas-zalozenie" key={zalozenie}>
          {T.czasZalozenie} {zalozenie}
        </p>
      ))}
    </div>
  );
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

function opisPochodzenia(w: WartoscParametruAparatu): string {
  if (w.pochodzenie === 'KATALOG') return T.pochodzenieKatalog;
  if (w.pochodzenie === 'PROPOZYCJA') return T.pochodzeniePropozycja;
  if (w.pochodzenie === 'PROJEKTANT') return T.pochodzenieProjektant;
  return T.pochodzenieBrak;
}

/**
 * Parametry aparatu użyte w ocenie — każda liczba z pochodzeniem; wartość robocza z etykietą,
 * opisem źródła i wpływu (tekst backendu) oraz akcją „Zmień wartość” dla aparatu z modelu.
 */
function ParametryAparatu({
  pole,
  onZmienWartosc,
}: {
  readonly pole: PoleWytrzymalosci;
  readonly onZmienWartosc?: WeryfikacjaAparaturyProps['onZmienWartosc'];
}) {
  const parametry = parametryPola(pole);
  if (parametry.length === 0) return null;
  const aparatRef = pole.zrodlo === 'model' ? pole.aparat_ref : null;
  return (
    <div className="mvd-apar-czas" data-testid={`mvd-zwarcia-aparatura-parametry-${pole.pole}`}>
      <span className="mvd-apar-parametry-tytul">{T.parametryTytul}</span>
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
              {w.wartosc === null ? T.kreska : `${fmtLiczba(w.wartosc, 3)} ${w.jednostka}`}
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
            {aparatRef !== null && w.pochodzenie !== null && onZmienWartosc && (
              <button
                type="button"
                className="mvd-apar-akcja mvd-apar-akcja--wtorna"
                data-testid={`mvd-zwarcia-aparatura-zmien-${pole.pole}-${w.parametr}`}
                onClick={() =>
                  onZmienWartosc(aparatRef, pole.aparat_nazwa ?? aparatRef, w.parametr)
                }
              >
                {T.zmienWartosc}
              </button>
            )}
            {w.wartosc_robocza && <p className="mvd-apar-czas-zalozenie">{w.opis_zrodla_pl}</p>}
            {w.wartosc === null && w.powod_braku_pl !== null && (
              <p className="mvd-apar-czas-powod">{w.powod_braku_pl}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeryfikacjaAparatury({
  wiersz,
  runId,
  punktNazwa,
  onOtworzKonfiguracjeStacji,
  onZmienWartosc,
}: WeryfikacjaAparaturyProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'nieuruchomiona' });
  const [powod, setPowod] = useState<PowodBrakuPodstawy | null>(null);

  const stacje = stacjeDlaPunktu(snapshot, wiersz);

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
          <h3 className="mvd-apar-tytul">
            {T.tytul} — <span className="mvd-apar-punkt">{punktNazwa}</span>
          </h3>
          <p className="mvd-apar-cel">{T.cel}</p>
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
          <dt>{T.wejsciePrady}</dt>
          <dd data-testid="mvd-zwarcia-aparatura-prady">
            {runId === null ? T.kreska : T.wejsciePradyOpis}
            <span className="mvd-apar-zrodlo">{T.zrodloPradow}</span>
          </dd>
        </div>
        <div>
          <dt>{T.wejscieStacja}</dt>
          {/* Strefa pierwszoplanowa mówi NAZWĄ stacji; ref modelu zostaje
              maszynowym atrybutem (podpowiedź i asercje), nie napisem. */}
          <dd
            data-testid="mvd-zwarcia-aparatura-stacje"
            data-stacje-ref={stacje.join(',')}
            title={stacje.join(', ')}
          >
            {stacje.length === 0
              ? T.kreska
              : stacje.map((ref) => nazwaStacji(snapshot, ref)).join(', ')}
          </dd>
        </div>
        <div>
          <dt>{T.wejsciePola}</dt>
          <dd className="mvd-num">
            {liczbaPol === null ? T.kreska : String(liczbaPol)}
            <span className="mvd-apar-zrodlo">{T.zrodloAparatu}</span>
          </dd>
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
        <ul className="mvd-apar-werdykty" data-testid="mvd-zwarcia-aparatura-werdykty">
          {stan.wiersze.map((w) => (
            <li
              key={`${w.pole_ref ?? w.pole}::${w.aparat_ref ?? w.aparat_catalog_ref}`}
              className="mvd-apar-werdykt"
              data-testid={`mvd-zwarcia-aparatura-pole-${w.pole}`}
              // Status maszynowy rekordu W albo `brak-danych` (aparat spoza katalogu, brak
              // prądu pola) — kolor niesie etykieta rekordu, nie znacznik prezentacji.
              data-status={w.wymaganie?.status_maszynowy ?? 'brak-danych'}
              data-zrodlo={w.zrodlo}
            >
              <span className="mvd-apar-pole mvd-num">{w.pole}</span>
              {w.wymaganie !== null && (
                <EtykietaWerdyktu
                  etykieta={w.wymaganie.etykieta}
                  status={w.wymaganie.status_maszynowy}
                  testid={`mvd-zwarcia-aparatura-etykieta-${w.pole}`}
                  zwarta
                />
              )}
              <span className="mvd-apar-komunikat">{w.komunikat_pl}</span>
              <span
                className="mvd-apar-zrodlo"
                data-testid={`mvd-zwarcia-aparatura-zrodlo-${w.pole}`}
              >
                {opisZrodla(w)}
                {w.aparat_etykieta ? ` · ${w.aparat_etykieta}` : ''}
              </span>
              <PradyPola pole={w} />
              <RozbicieCzasu pole={w} />
              <ParametryAparatu pole={w} onZmienWartosc={onZmienWartosc} />
              {/* Rekordy K w JEDNYM bloku na całą szerokość wiersza — jako luźne elementy
                  wiersza flex kurczyły się do szerokości kilku znaków (zrzut KD-6). */}
              <div className="mvd-apar-oceny" data-testid={`mvd-zwarcia-aparatura-oceny-${w.pole}`}>
                {w.oceny.map((ocena) => (
                  <KartaWerdyktu key={ocena.kryterium_id} rekord={ocena} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mvd-apar-norma">{T.norma}</p>
    </section>
  );
}
