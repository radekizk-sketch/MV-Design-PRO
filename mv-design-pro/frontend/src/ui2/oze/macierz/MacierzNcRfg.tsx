/*
 * „Macierz wymogów NC RfG per moduł" (karta P39 / rejestr W-614).
 *
 * Interaktywna macierz zgodności PTPiREE dla WSZYSTKICH modułów wytwórczych
 * projektu naraz: wiersze = wymogi/testy z katalogu procedury, kolumny = moduły
 * (PV/BESS/FW), komórka = werdykt z odpowiedzi solvera. Podsumowanie per moduł
 * i per projekt.
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko prezentuje. Werdykty
 * pochodzą WYŁĄCZNIE z `NcRfgRunResult`; dane DER czytane read-only ze store'a
 * (`useStationDerStore`), zdolności edytowane w stanie lokalnym okna (zero
 * mutacji modelu). Bieg uruchamiany jawnym przyciskiem. Klient API reużyty
 * z `ui/ncrfg-tests/api` — bez własnego klienta.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { type NcRfgVerdict } from '../../../ui/ncrfg-tests/api';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import {
  CertyfikatBrakiError,
  pobierzCertyfikat,
  pobierzCertyfikatDocx,
  type WidokCertyfikatu,
  type ZadanieCertyfikatu,
} from '../api';
import { useNcRfgStore } from '../ncRfgStore';
import { PanelModulu } from './PanelModulu';
import { SzczegolWerdyktu } from './SzczegolWerdyktu';
import {
  mapujMacierz,
  podsumowanieModulu,
  podsumowanieProjektu,
  zbudujModuly,
  zbudujWejscieModulu,
  type KluczNumeryczny,
  type KluczZdolnosci,
  type KomorkaMacierzy,
  type NumeryczneModulu,
  type OpisModulu,
  type PochodzenieDanej,
  type ZdolnosciModulu,
} from './macierzModel';
import {
  ETYKIETY_STATUSU_MODULU,
  ETYKIETY_WERDYKTU,
  KLASA_WERDYKTU,
  MACIERZ_STRINGS,
  formatMoc,
  formatNapiecie,
  nazwaPlikuCertyfikatu,
} from './strings';

import { PrzyciskAkcjiStanu, useAkcjaDodajZrodloOze } from '../../wyniki/wzorzec';
import './macierz.css';

interface EdycjaModulu {
  readonly zdolnosci: ZdolnosciModulu;
  readonly pochodzenie: Record<KluczZdolnosci, PochodzenieDanej>;
  readonly numeryczne: NumeryczneModulu;
}

const LEGENDA: readonly NcRfgVerdict[] = ['pass', 'fail', 'no_data', 'not_required'];

/** Braki kompletności certyfikatu (bramka 422 — uczciwa lista po polsku). */
interface BrakiCertyfikatu {
  readonly komunikat: string;
  readonly braki: readonly string[];
}

/** Zapisz blob jako plik do pobrania (mechanika przeglądarkowa). */
function zapiszBlob(blob: Blob, nazwa: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface MacierzNcRfgProps {
  /** Tryb zaawansowania — odcisk deterministyczny widoczny w trybie eksperckim. */
  readonly trybZaawansowania: AdvancementMode;
  /**
   * Pre-selekcja modułu z deep-linku (P-1: akcja SLD „Pokaż zgodność
   * przyłączeniową" niesie kontekst DER). Dopasowanie po `derRef` (id
   * przyłączenia) ALBO po nazwie modułu (wspólny klucz kreatora DER dla
   * generatora ENM). Nieznana wartość = brak pre-selekcji (zero fabrykacji);
   * żądanie jednorazowe — konsumpcja przez `onPreselekcjaSkonsumowana`
   * (wzorzec `EkranKompensacji.preselekcjaWezla`).
   */
  readonly preselekcjaModulu?: string | null;
  /** Wywoływane po konsumpcji żądania pre-selekcji (także nieznanego refu). */
  readonly onPreselekcjaSkonsumowana?: () => void;
}

export function MacierzNcRfg({
  trybZaawansowania,
  preselekcjaModulu = null,
  onPreselekcjaSkonsumowana,
}: MacierzNcRfgProps): JSX.Element {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const opisyBazowe = useMemo(() => zbudujModuly(ders), [ders]);
  // K6 / H-5: stan zerowy strumienia OZE prowadzi do dodania modulu wytworczego.
  const akcjaZrodlo = useAkcjaDodajZrodloOze();

  // Stan biegu NC RfG — wspólny store (widoczny również w pulpicie instalacji OZE).
  const katalog = useNcRfgStore((s) => s.katalog);
  const bladKatalogu = useNcRfgStore((s) => s.bladKatalogu);
  const operatorId = useNcRfgStore((s) => s.operatorId);
  const status = useNcRfgStore((s) => s.status);
  const wynik = useNcRfgStore((s) => s.wynik);
  const bladBiegu = useNcRfgStore((s) => s.bladBiegu);
  const ostatnieWejscia = useNcRfgStore((s) => s.ostatnieWejscia);
  const wynikiFrt = useNcRfgStore((s) => s.wynikiFrt);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const ustawOperator = useNcRfgStore((s) => s.ustawOperator);
  const przeprowadzTesty = useNcRfgStore((s) => s.przeprowadzTesty);

  // Identyfikacja projektu/przypadku do certyfikatu (read-only ze store'u aplikacji).
  const nazwaProjektu = useAppStateStore((s) => s.activeProjectName);
  const nazwaPrzypadku = useAppStateStore((s) => s.activeCaseName);
  // Aktywny przypadek → backend dopina do certyfikatu dowód certyfikacji PTPiREE
  // z tabliczek urządzeń modelu (bez niego dokument nie ma sekcji dowodu).
  const aktywnyPrzypadek = useAppStateStore((s) => s.activeCaseId);

  const [edycje, setEdycje] = useState<Record<string, EdycjaModulu>>({});
  // Stan podglądu certyfikatu zgodności (widok, braki 422 lub błąd — rozłącznie).
  const [certyfikat, setCertyfikat] = useState<WidokCertyfikatu | null>(null);
  const [certBraki, setCertBraki] = useState<BrakiCertyfikatu | null>(null);
  const [certBlad, setCertBlad] = useState<string | null>(null);
  const [certLadowanie, setCertLadowanie] = useState(false);
  const [docxLadowanie, setDocxLadowanie] = useState(false);
  const [wybranaKomorka, setWybranaKomorka] = useState<{ derRef: string; testId: string } | null>(
    null,
  );
  const [wybranyModul, setWybranyModul] = useState<string>('');

  // Katalog wymogów — pobranie jednorazowe do wspólnego store'a.
  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

  // Domyślny wybór modułu do panelu.
  useEffect(() => {
    if (!wybranyModul && opisyBazowe[0]) setWybranyModul(opisyBazowe[0].derRef);
  }, [opisyBazowe, wybranyModul]);

  // Pre-selekcja modułu z deep-linku (P-1) — żądanie jednorazowe: dopasowanie
  // po derRef albo nazwie, konsumpcja również przy nieznanym refie (żaden
  // kontekst nie zalega); wzorzec `EkranKompensacji`.
  const skonsumowanaPreselekcja = useRef<string | null>(null);
  useEffect(() => {
    if (preselekcjaModulu === null || preselekcjaModulu === '') {
      skonsumowanaPreselekcja.current = null;
      return;
    }
    if (preselekcjaModulu === skonsumowanaPreselekcja.current) return; // już skonsumowane
    if (opisyBazowe.length === 0) return; // poczekaj na moduły ze store'a
    const dopasowany = opisyBazowe.find(
      (opis) => opis.derRef === preselekcjaModulu || opis.nazwa === preselekcjaModulu,
    );
    if (dopasowany) {
      setWybranyModul(dopasowany.derRef);
      setWybranaKomorka(null);
    }
    skonsumowanaPreselekcja.current = preselekcjaModulu;
    onPreselekcjaSkonsumowana?.();
  }, [preselekcjaModulu, opisyBazowe, onPreselekcjaSkonsumowana]);

  // Efektywne opisy = bazowe z modelu + edycje lokalne okna (zero mutacji modelu).
  const opisy = useMemo<OpisModulu[]>(
    () =>
      opisyBazowe.map((opis) => {
        const edycja = edycje[opis.derRef];
        if (!edycja) return opis;
        return {
          ...opis,
          zdolnosci: edycja.zdolnosci,
          pochodzenieZdolnosci: edycja.pochodzenie,
          numeryczne: edycja.numeryczne,
        };
      }),
    [opisyBazowe, edycje],
  );

  const opisWybrany = opisy.find((o) => o.derRef === wybranyModul) ?? opisy[0] ?? null;

  const wiersze = useMemo(
    () => mapujMacierz(katalog, wynik, opisy),
    [katalog, wynik, opisy],
  );
  const podsumProjektu = useMemo(() => podsumowanieProjektu(opisy, wynik), [opisy, wynik]);

  const gotoweDoBiegu = opisy.filter((o) => o.powodBlokady === null);
  const powodBlokadyBiegu =
    opisy.length === 0
      ? MACIERZ_STRINGS.brakModulow
      : gotoweDoBiegu.length === 0
        ? MACIERZ_STRINGS.brakModulowOpis
        : status === 'running'
          ? MACIERZ_STRINGS.wTrakcie
          : null;

  const zmienZdolnosc = (derRef: string, klucz: KluczZdolnosci, wartosc: boolean): void => {
    const opis = opisy.find((o) => o.derRef === derRef);
    if (!opis) return;
    setEdycje((current) => {
      const poprzednia: EdycjaModulu = current[derRef] ?? {
        zdolnosci: opis.zdolnosci,
        pochodzenie: { ...opis.pochodzenieZdolnosci },
        numeryczne: opis.numeryczne,
      };
      return {
        ...current,
        [derRef]: {
          ...poprzednia,
          zdolnosci: { ...poprzednia.zdolnosci, [klucz]: wartosc },
          pochodzenie: { ...poprzednia.pochodzenie, [klucz]: 'deklarowane' },
        },
      };
    });
  };

  const zmienParametr = (derRef: string, klucz: KluczNumeryczny, wartosc: string): void => {
    const opis = opisy.find((o) => o.derRef === derRef);
    if (!opis) return;
    setEdycje((current) => {
      const poprzednia: EdycjaModulu = current[derRef] ?? {
        zdolnosci: opis.zdolnosci,
        pochodzenie: { ...opis.pochodzenieZdolnosci },
        numeryczne: opis.numeryczne,
      };
      return {
        ...current,
        [derRef]: {
          ...poprzednia,
          numeryczne: { ...poprzednia.numeryczne, [klucz]: wartosc },
        },
      };
    });
  };

  const przeprowadz = async (): Promise<void> => {
    const wejscia = gotoweDoBiegu
      .map((opis) => zbudujWejscieModulu(opis, operatorId))
      .filter((m): m is NonNullable<typeof m> => m !== null);
    await przeprowadzTesty(wejscia, katalog?.procedure_version);
  };

  // Certyfikat dostępny wyłącznie z zakończonego biegu (zero martwych klików).
  const certyfikatDostepny =
    status === 'ready' && wynik !== null && ostatnieWejscia !== null && ostatnieWejscia.length > 0;

  const liczbaTestowCertyfikatu = certyfikat
    ? certyfikat.moduly.reduce((suma, modul) => suma + modul.testy.length, 0)
    : 0;

  // Żądanie 1:1 z danymi, które wyprodukowały wynik (`ostatnieWejscia`).
  const zbudujZadanieCertyfikatu = (): ZadanieCertyfikatu | null => {
    if (!wynik || !ostatnieWejscia || ostatnieWejscia.length === 0) return null;
    return {
      run_request: { modules: ostatnieWejscia, procedure_version: wynik.procedure_version },
      nazwa_projektu: nazwaProjektu?.trim() ? nazwaProjektu : MACIERZ_STRINGS.projektBezNazwy,
      nazwa_przypadku: nazwaPrzypadku ?? null,
    };
  };

  const obsluzBladCertyfikatu = (err: unknown): void => {
    if (err instanceof CertyfikatBrakiError) {
      setCertyfikat(null);
      setCertBlad(null);
      setCertBraki({ komunikat: err.message, braki: err.braki });
    } else {
      setCertBraki(null);
      setCertBlad(err instanceof Error ? err.message : MACIERZ_STRINGS.certyfikatBlad);
    }
  };

  const generujCertyfikat = async (): Promise<void> => {
    const zadanie = zbudujZadanieCertyfikatu();
    if (!zadanie) return;
    setCertLadowanie(true);
    setCertBlad(null);
    setCertBraki(null);
    try {
      setCertyfikat(await pobierzCertyfikat(zadanie, aktywnyPrzypadek));
    } catch (err) {
      obsluzBladCertyfikatu(err);
    } finally {
      setCertLadowanie(false);
    }
  };

  const pobierzDocx = async (): Promise<void> => {
    const zadanie = zbudujZadanieCertyfikatu();
    if (!zadanie) return;
    setDocxLadowanie(true);
    setCertBlad(null);
    try {
      const blob = await pobierzCertyfikatDocx(zadanie, aktywnyPrzypadek);
      zapiszBlob(blob, nazwaPlikuCertyfikatu(new Date()));
    } catch (err) {
      obsluzBladCertyfikatu(err);
    } finally {
      setDocxLadowanie(false);
    }
  };

  const zamknijCertyfikat = (): void => {
    setCertyfikat(null);
    setCertBraki(null);
    setCertBlad(null);
  };

  const komorkaSzczegolu: KomorkaMacierzy | null = wybranaKomorka
    ? (wiersze
        .find((w) => w.test.test_id === wybranaKomorka.testId)
        ?.komorki.find((k) => k.derRef === wybranaKomorka.derRef) ?? null)
    : null;
  const nazwaModuluSzczegolu =
    opisy.find((o) => o.derRef === wybranaKomorka?.derRef)?.nazwa ?? null;

  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  return (
    <div className="mvd-oze" data-testid="mvd-oze-macierz-ncrfg">
      <header className="mvd-oze-head">
        <div className="mvd-oze-head-main">
          <h3 className="mvd-oze-title">{MACIERZ_STRINGS.tytul}</h3>
          <p className="mvd-oze-sub">{MACIERZ_STRINGS.podtytul}</p>
        </div>
        <div className="mvd-oze-head-akcje">
          <div className="mvd-oze-pola">
            <label className="mvd-oze-pole">
              <span>{MACIERZ_STRINGS.operator}</span>
              <select
                value={operatorId}
                onChange={(event) => ustawOperator(event.target.value)}
                data-testid="mvd-oze-operator"
              >
                {(katalog?.operators ?? [{ operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '' }]).map(
                  (op) => (
                    <option key={op.operator_id} value={op.operator_id}>
                      {op.operator_name_pl}
                    </option>
                  ),
                )}
              </select>
            </label>
            {katalog ? (
              <div className="mvd-oze-pole">
                <span>{MACIERZ_STRINGS.wersjaProcedury}</span>
                <span>{katalog.procedure_version}</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="mvd-btn mvd-btn-glowny"
            onClick={() => void przeprowadz()}
            disabled={Boolean(powodBlokadyBiegu)}
            title={powodBlokadyBiegu ?? MACIERZ_STRINGS.przeprowadz}
            data-testid="mvd-oze-przeprowadz"
          >
            {status === 'running' ? MACIERZ_STRINGS.wTrakcie : MACIERZ_STRINGS.przeprowadz}
          </button>
          <button
            type="button"
            className="mvd-btn"
            onClick={() => void generujCertyfikat()}
            disabled={!certyfikatDostepny || certLadowanie}
            title={
              certyfikatDostepny
                ? MACIERZ_STRINGS.certyfikatTytulAktywny
                : MACIERZ_STRINGS.certyfikatTytulNieaktywny
            }
            data-testid="mvd-oze-certyfikat-przycisk"
          >
            {MACIERZ_STRINGS.certyfikatPrzycisk}
          </button>
          {trybEkspercki && wynik ? (
            <div className="mvd-oze-odcisk" data-testid="mvd-oze-odcisk">
              {MACIERZ_STRINGS.odcisk}: {wynik.deterministic_hash}
            </div>
          ) : null}
        </div>
      </header>

      {bladKatalogu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-blad-katalogu">
          {MACIERZ_STRINGS.bladKatalogu}: {bladKatalogu}
        </div>
      ) : null}
      {bladBiegu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-blad-biegu">
          {MACIERZ_STRINGS.bladBiegu}: {bladBiegu}
        </div>
      ) : null}

      {certyfikat || certBraki || certBlad || certLadowanie ? (
        <section className="mvd-oze-cert" data-testid="mvd-oze-certyfikat">
          <div className="mvd-oze-cert-head">
            <h4 className="mvd-oze-cert-tytul">{MACIERZ_STRINGS.certyfikatNaglowek}</h4>
            <button
              type="button"
              className="mvd-btn"
              onClick={zamknijCertyfikat}
              data-testid="mvd-oze-cert-zamknij"
            >
              {MACIERZ_STRINGS.certyfikatZamknij}
            </button>
          </div>

          {certLadowanie ? (
            <p data-testid="mvd-oze-cert-ladowanie">{MACIERZ_STRINGS.certyfikatLadowanie}</p>
          ) : null}

          {certBlad ? (
            <div className="mvd-oze-blad" data-testid="mvd-oze-cert-blad">
              {MACIERZ_STRINGS.certyfikatBlad}: {certBlad}
            </div>
          ) : null}

          {certBraki ? (
            <div className="mvd-oze-cert-braki" data-testid="mvd-oze-cert-braki">
              <h5>{MACIERZ_STRINGS.certyfikatBrakiTytul}</h5>
              <p>{certBraki.komunikat}</p>
              <ul>
                {certBraki.braki.map((brak, indeks) => (
                  <li key={indeks}>{brak}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {certyfikat ? (
            <div className="mvd-oze-cert-widok" data-testid="mvd-oze-cert-widok">
              <div
                className={`mvd-oze-cert-werdykt ${
                  certyfikat.werdykt_zbiorczy.status === 'zgodny'
                    ? 'mvd-oze-werdykt-ok'
                    : 'mvd-oze-werdykt-err'
                }`}
                data-testid="mvd-oze-cert-werdykt"
              >
                {certyfikat.werdykt_zbiorczy.etykieta_pl}
              </div>
              <dl className="mvd-oze-cert-meta">
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatProjekt}</dt>
                  <dd>{certyfikat.identyfikacja.projekt}</dd>
                </div>
                {certyfikat.identyfikacja.przypadek ? (
                  <div>
                    <dt>{MACIERZ_STRINGS.certyfikatPrzypadek}</dt>
                    <dd>{certyfikat.identyfikacja.przypadek}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatProcedura}</dt>
                  <dd>{certyfikat.identyfikacja.procedura}</dd>
                </div>
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatNarzedzie}</dt>
                  <dd>{certyfikat.identyfikacja.wersja_narzedzia}</dd>
                </div>
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatModuly}</dt>
                  <dd className="mvd-oze-num">{certyfikat.werdykt_zbiorczy.liczba_modulow}</dd>
                </div>
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatModulyZgodne}</dt>
                  <dd className="mvd-oze-num">{certyfikat.werdykt_zbiorczy.modulow_zgodnych}</dd>
                </div>
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatModulyNiezgodne}</dt>
                  <dd className="mvd-oze-num">{certyfikat.werdykt_zbiorczy.modulow_niezgodnych}</dd>
                </div>
                <div>
                  <dt>{MACIERZ_STRINGS.certyfikatTesty}</dt>
                  <dd className="mvd-oze-num">{liczbaTestowCertyfikatu}</dd>
                </div>
              </dl>

              {/* Dowód certyfikacji PTPiREE per moduł — dokument składany
                  u operatora musi pokazywać, NA CO powołuje się deklaracja
                  zgodności. Wartości WPROST z tabliczki urządzenia w modelu;
                  brak tabliczki to jawny stan zerowy, nie puste pola. */}
              {certyfikat.moduly.some((modul) => modul.dowod_certyfikatu) ? (
                <div className="mvd-oze-cert-dowody" data-testid="mvd-oze-cert-dowody">
                  <h5>{MACIERZ_STRINGS.certyfikatDowodTytul}</h5>
                  <ul>
                    {certyfikat.moduly.map((modul) => {
                      const dowod = modul.dowod_certyfikatu;
                      if (!dowod) return null;
                      const etykieta = modul.der_name || modul.der_ref;
                      return dowod.stan_pl ? (
                        <li
                          key={modul.der_ref}
                          className="mvd-oze-cert-dowod mvd-oze-cert-dowod--brak"
                          data-testid={`mvd-oze-cert-dowod-brak-${modul.der_ref}`}
                        >
                          {etykieta}: {dowod.stan_pl}
                        </li>
                      ) : (
                        <li
                          key={modul.der_ref}
                          className="mvd-oze-cert-dowod"
                          data-testid={`mvd-oze-cert-dowod-${modul.der_ref}`}
                        >
                          {etykieta}: {MACIERZ_STRINGS.certyfikatDowodNumer}{' '}
                          {dowod.numer_dokumentu ?? '—'}
                          {dowod.wersja_wipwc
                            ? ` · ${MACIERZ_STRINGS.certyfikatDowodWipwc} ${dowod.wersja_wipwc}`
                            : ''}
                          {dowod.data_akceptacji
                            ? ` · ${MACIERZ_STRINGS.certyfikatDowodData} ${dowod.data_akceptacji}`
                            : ''}
                          {dowod.warunek_waznosci
                            ? ` · ${MACIERZ_STRINGS.certyfikatDowodWarunek}: ${dowod.warunek_waznosci}`
                            : ''}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <button
                type="button"
                className="mvd-btn mvd-btn-glowny"
                onClick={() => void pobierzDocx()}
                disabled={docxLadowanie}
                data-testid="mvd-oze-cert-pobierz-docx"
              >
                {MACIERZ_STRINGS.certyfikatPobierzDocx}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {opisy.length === 0 ? (
        <section className="mvd-oze-info" data-testid="mvd-oze-pusty">
          <h4>{MACIERZ_STRINGS.brakModulow}</h4>
          <p>{MACIERZ_STRINGS.brakModulowOpis}</p>
          {/* K6 / H-5: bez modułu wytwórczego nie ma czego testować —
              stan zerowy otwiera formularz źródła OZE na kanwie schematu. */}
          <PrzyciskAkcjiStanu akcja={akcjaZrodlo} testid="mvd-oze-pusty" />
        </section>
      ) : (
        <div className="mvd-oze-uklad">
          <div className="mvd-oze-macierz-wrap" data-testid="mvd-oze-macierz-tabela">
            <table className="mvd-oze-macierz">
              <thead>
                <tr>
                  <th className="mvd-oze-col-test">{MACIERZ_STRINGS.naglowekTestu}</th>
                  {opisy.map((opis) => (
                    <th key={opis.derRef} className="mvd-oze-modul-h">
                      <button
                        type="button"
                        className="mvd-oze-komorka"
                        onClick={() => {
                          setWybranyModul(opis.derRef);
                          setWybranaKomorka(null);
                        }}
                        aria-pressed={wybranyModul === opis.derRef}
                        data-testid={`mvd-oze-modul-${opis.derRef}`}
                      >
                        <span className="mvd-oze-modul-nazwa">
                          {opis.nazwa} · {opis.rodzaj}
                        </span>
                      </button>
                      <div className="mvd-oze-modul-meta mvd-oze-num">
                        {formatMoc(opis.mocKw)} · {formatNapiecie(opis.napiecieKv)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wiersze.length === 0 ? (
                  <tr>
                    <td colSpan={opisy.length + 1} className="mvd-oze-komorka-pusta">
                      {MACIERZ_STRINGS.brakBieguOpis}
                    </td>
                  </tr>
                ) : (
                  wiersze.map((wiersz) => (
                    <tr key={wiersz.test.test_id} data-testid="mvd-oze-wiersz">
                      <td className="mvd-oze-col-test">
                        <div className="mvd-oze-test-nazwa">{wiersz.test.ability_pl}</div>
                        <div className="mvd-oze-test-podstawa">{wiersz.test.procedure_basis_pl}</div>
                      </td>
                      {wiersz.komorki.map((komorka) => (
                        <td key={komorka.derRef}>
                          {komorka.stan === 'wynik' && komorka.werdykt ? (
                            <button
                              type="button"
                              className={`mvd-oze-komorka ${KLASA_WERDYKTU[komorka.werdykt]}`}
                              onClick={() =>
                                setWybranaKomorka({
                                  derRef: komorka.derRef,
                                  testId: komorka.testId,
                                })
                              }
                              aria-pressed={
                                wybranaKomorka?.derRef === komorka.derRef &&
                                wybranaKomorka?.testId === komorka.testId
                              }
                              data-testid="mvd-oze-komorka-wynik"
                            >
                              {ETYKIETY_WERDYKTU[komorka.werdykt]}
                            </button>
                          ) : komorka.stan === 'brak_danych_modul' ? (
                            <button
                              type="button"
                              className="mvd-oze-komorka mvd-oze-werdykt-warn"
                              onClick={() =>
                                setWybranaKomorka({
                                  derRef: komorka.derRef,
                                  testId: komorka.testId,
                                })
                              }
                              data-testid="mvd-oze-komorka-brak-danych"
                            >
                              {ETYKIETY_WERDYKTU.no_data}
                            </button>
                          ) : (
                            <span
                              className="mvd-oze-komorka-pusta"
                              data-testid="mvd-oze-komorka-brak-biegu"
                            >
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mvd-oze-legenda" data-testid="mvd-oze-legenda">
              <span>{MACIERZ_STRINGS.legenda}:</span>
              {LEGENDA.map((werdykt) => (
                <span key={werdykt} className="mvd-oze-legenda-poz">
                  <span className={`mvd-oze-legenda-znak ${KLASA_WERDYKTU[werdykt]}`} />
                  {ETYKIETY_WERDYKTU[werdykt]}
                </span>
              ))}
            </div>

            <div className="mvd-oze-podsum" data-testid="mvd-oze-podsum-projektu">
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduly}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.liczbaModulow}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleZgodne}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.zgodne}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleNiezgodne}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.niezgodne}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleBrakDanych}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.brakDanych}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.wymogiSpelnione}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">
                  {podsumProjektu.spelnioneRazem} / {podsumProjektu.wymaganeRazem}
                </span>
              </div>
            </div>

            <div className="mvd-oze-podsum" data-testid="mvd-oze-podsum-moduly">
              {opisy.map((opis) => {
                const p = podsumowanieModulu(opis, wynik);
                // K5-B (H-3 pkt 4): wynik walidacji FRT/HVRT zapisany z okna
                // „Walidacja modelu falownika" — ta sama tożsamość modułu
                // (der.id), werdykt z biegu solvera trajektorii.
                const frt = wynikiFrt[opis.derRef];
                // Dowód certyfikatu PTPiREE z tabliczki urządzenia w modelu
                // (certificate_evidence biegu) — brak numeru dokumentu to
                // uczciwy stan zerowy, nie wartość dopowiedziana.
                const dowod =
                  wynik?.certificate_evidence.find((d) => d.der_ref === opis.derRef) ?? null;
                return (
                  <div key={opis.derRef} className="mvd-oze-podsum-poz">
                    <span className="mvd-oze-podsum-etyk">
                      {opis.nazwa} · {ETYKIETY_STATUSU_MODULU[p.overallStatus] ?? p.overallStatus}
                      {p.moduleType ? (
                        <span
                          className="mvd-oze-podsum-klasa"
                          data-testid={`mvd-oze-podsum-modul-klasa-${opis.derRef}`}
                        >
                          {' · '}
                          {MACIERZ_STRINGS.klasaModulu}: {p.moduleType}
                        </span>
                      ) : null}
                      {frt?.lvrt ? (
                        <span
                          className={`mvd-oze-podsum-frt mvd-oze-podsum-frt--${frt.lvrt.istotnosc}`}
                          data-testid={`mvd-oze-frt-lvrt-${opis.derRef}`}
                        >
                          {' · '}
                          {MACIERZ_STRINGS.wynikFrtLvrt}: {frt.lvrt.tekst}
                        </span>
                      ) : null}
                      {frt?.hvrt ? (
                        <span
                          className={`mvd-oze-podsum-frt mvd-oze-podsum-frt--${frt.hvrt.istotnosc}`}
                          data-testid={`mvd-oze-frt-hvrt-${opis.derRef}`}
                        >
                          {' · '}
                          {MACIERZ_STRINGS.wynikFrtHvrt}: {frt.hvrt.tekst}
                        </span>
                      ) : null}
                      {dowod ? (
                        dowod.document_number ? (
                          <span
                            className="mvd-oze-podsum-dowod"
                            data-testid={`mvd-oze-dowod-${opis.derRef}`}
                          >
                            {' · '}
                            {MACIERZ_STRINGS.dowodCertyfikatu}: {dowod.document_number}
                            {dowod.wipwc_version ? ` · WiPWC ${dowod.wipwc_version}` : ''}
                            {dowod.acceptance_date ? ` · ${dowod.acceptance_date}` : ''}
                          </span>
                        ) : (
                          <span
                            className="mvd-oze-podsum-dowod mvd-oze-podsum-dowod--brak"
                            data-testid={`mvd-oze-dowod-brak-${opis.derRef}`}
                          >
                            {' · '}
                            {MACIERZ_STRINGS.dowodCertyfikatuBrak}
                          </span>
                        )
                      ) : null}
                    </span>
                    <span className="mvd-oze-podsum-wart mvd-oze-num">
                      {p.passCount} / {p.requiredCount}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SzczegolWerdyktu
              komorka={komorkaSzczegolu}
              nazwaModulu={nazwaModuluSzczegolu}
              slad={wynik?.white_box_trace ?? []}
            />
            {opisWybrany ? (
              <PanelModulu
                opis={opisWybrany}
                zdolnosci={opisWybrany.zdolnosci}
                pochodzenie={opisWybrany.pochodzenieZdolnosci}
                numeryczne={opisWybrany.numeryczne}
                onZmienZdolnosc={(klucz, wartosc) =>
                  zmienZdolnosc(opisWybrany.derRef, klucz, wartosc)
                }
                onZmienParametr={(klucz, wartosc) =>
                  zmienParametr(opisWybrany.derRef, klucz, wartosc)
                }
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
