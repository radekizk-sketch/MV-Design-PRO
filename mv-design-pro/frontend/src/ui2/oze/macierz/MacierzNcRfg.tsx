/*
 * „Macierz wymogów NC RfG per moduł" (karta P39 / rejestr W-614) na kontrakcie V2
 * (karta AB-1a Pakiet D2 §2–§5).
 *
 * Wiersze = testy katalogu biegu (T01–T20, z podstawą w procedurze, zdolnością dowodową
 * i rodzajem twierdzenia), kolumny = moduły wytwórcze modelu, komórka = rekord `ocena`
 * (`OcenaKryterium`) testu z biegu „co-jeśli": plakietka etykiety z rekordu, szczegół przez
 * `KartaWerdyktu`. Obok: zgodność przypadku liczona z ZATWIERDZONEGO modelu (dowód certyfikatu
 * urządzenia wyprowadza serwer) i certyfikat zgodności z tego modelu.
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko prezentuje. Zero agregatów, liczników
 * i map status → tekst; dane DER czytane read-only ze store'a (`useStationDerStore`), formularz
 * biegu „co-jeśli" w stanie lokalnym okna (zero mutacji modelu). Operator nigdy nie jest
 * zgadywany (`ncrfg/operator.ts`). Jeden klient V2 (`ui2/oze/ncrfg/api`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { EtykietaWerdyktu } from '../../wyniki/wzorzec/KartaWerdyktu';
import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import { PrzyciskAkcjiStanu } from '../../wyniki/wzorzec/PrzyciskAkcjiStanu';
import { useAkcjaDodajZrodloOze } from '../../wyniki/wzorzec/akcjeStanuZerowego';
import {
  BrakiCertyfikatuError,
  pobierzCertyfikat,
  pobierzPlikCertyfikatu,
  pobierzWejsciaPrzypadkuNcRfg,
  type FormatDokumentu,
} from '../ncrfg/api';
import { ListaRekordowWymagan, NaglowekModuluNcRfg, OpisDokumentuWarstwy } from '../ncrfg/komponenty';
import { operatorEfektywny, operatorZModelu } from '../ncrfg/operator';
import type {
  BrakiCertyfikatu,
  WejsciaPrzypadkuNcRfg,
  WejscieModuluNcRfg,
  WidokCertyfikatu,
  ZadanieCertyfikatu,
} from '../ncrfg/typy';
import { WyborOperatora } from '../ncrfg/WyborOperatora';
import { useNcRfgStore } from '../ncRfgStore';
import { PanelModulu } from './PanelModulu';
import { PodgladCertyfikatu } from './PodgladCertyfikatu';
import { SekcjaZgodnosciPrzekrojowej } from './SekcjaZgodnosciPrzekrojowej';
import { SzczegolWerdyktu, nazwaRodzajuTwierdzenia } from './SzczegolWerdyktu';
import {
  etykietyObecne,
  mapujMacierz,
  ocenaWymaganModulu,
  wynikModulu,
  zbudujModuly,
  zbudujWejscieModulu,
  zbudujZadanieCertyfikatu,
  type BledyFormularza,
  type FormularzModulu,
  type OpisModulu,
} from './macierzModel';
import {
  MACIERZ_STRINGS,
  formatMoc,
  formatNapiecie,
  nazwaPlikuCertyfikatu,
} from './strings';

import './macierz.css';

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
  /** Tryb zaawansowania — odciski i identyfikatory w trybie eksperckim. */
  readonly trybZaawansowania: AdvancementMode;
  /**
   * Pre-selekcja modułu z deep-linku (akcja SLD „Pokaż zgodność przyłączeniową" niesie
   * kontekst DER). Dopasowanie po `derRef` ALBO po nazwie modułu. Nieznana wartość = brak
   * pre-selekcji (zero fabrykacji); żądanie jednorazowe — konsumpcja przez
   * `onPreselekcjaSkonsumowana`.
   */
  readonly preselekcjaModulu?: string | null;
  readonly onPreselekcjaSkonsumowana?: () => void;
}

/** Stan odczytu wejść modułów z zatwierdzonego modelu przypadku (`GET …/wejscia`). */
type StanWejscModelu =
  | { readonly stan: 'brak' }
  | { readonly stan: 'ladowanie' }
  | { readonly stan: 'gotowe'; readonly wejscia: WejsciaPrzypadkuNcRfg }
  | { readonly stan: 'blad'; readonly komunikat: string };

export function MacierzNcRfg({
  trybZaawansowania,
  preselekcjaModulu = null,
  onPreselekcjaSkonsumowana,
}: MacierzNcRfgProps): JSX.Element {
  const ders = useStationDerStore((state) => selectAllDers(state));
  // Tożsamość stanu modułów modelu do zależności efektów: rekord store'a ma stałą referencję,
  // dopóki model się nie zmieni (lista `selectAllDers` powstaje na nowo przy każdym renderze).
  const stanModulow = useStationDerStore((state) => state.ders);
  const akcjaZrodlo = useAkcjaDodajZrodloOze();
  // Stan biegu — wspólny store (widoczny również w pulpicie instalacji OZE).
  const katalog = useNcRfgStore((s) => s.katalog);
  const bladKatalogu = useNcRfgStore((s) => s.bladKatalogu);
  const operatorWybor = useNcRfgStore((s) => s.operatorWybor);
  const status = useNcRfgStore((s) => s.status);
  const wynik = useNcRfgStore((s) => s.wynik);
  const bladBiegu = useNcRfgStore((s) => s.bladBiegu);
  const wynikiFrt = useNcRfgStore((s) => s.wynikiFrt);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const ustawOperator = useNcRfgStore((s) => s.ustawOperator);
  const przeprowadzTesty = useNcRfgStore((s) => s.przeprowadzTesty);

  const nazwaProjektu = useAppStateStore((s) => s.activeProjectName);
  const nazwaPrzypadku = useAppStateStore((s) => s.activeCaseName);
  const aktywnyPrzypadek = useAppStateStore((s) => s.activeCaseId);

  const zModelu = useMemo(() => operatorZModelu(ders), [ders]);
  const operatorId = operatorEfektywny(zModelu, operatorWybor);

  // Formularz wstępny biegu „co-jeśli" = wejścia modułów złożone z ZATWIERDZONEGO modelu
  // przypadku przez most backendu (jeden odczyt; klient niczego z modelu nie wyprowadza sam).
  const [stanWejsc, setStanWejsc] = useState<StanWejscModelu>({ stan: 'brak' });
  const wejsciaModelu = stanWejsc.stan === 'gotowe' ? stanWejsc.wejscia : null;
  const opisyBazowe = useMemo(() => zbudujModuly(ders, wejsciaModelu), [ders, wejsciaModelu]);
  const nazwyModulow = useMemo(
    () => Object.fromEntries(opisyBazowe.map((opis) => [opis.derRef, opis.nazwa])),
    [opisyBazowe],
  );

  const [formularze, setFormularze] = useState<Record<string, FormularzModulu>>({});
  const [bledy, setBledy] = useState<Record<string, BledyFormularza>>({});
  const [certyfikat, setCertyfikat] = useState<WidokCertyfikatu | null>(null);
  const [certBraki, setCertBraki] = useState<BrakiCertyfikatu | null>(null);
  const [certBlad, setCertBlad] = useState<string | null>(null);
  const [certLadowanie, setCertLadowanie] = useState(false);
  const [plikLadowanie, setPlikLadowanie] = useState<FormatDokumentu | null>(null);
  const [wybranaKomorka, setWybranaKomorka] = useState<{ derRef: string; testId: string } | null>(
    null,
  );
  const [wybranyModul, setWybranyModul] = useState<string>('');
  const [filtr, setFiltr] = useState<string>('');

  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

  // Każdy nowy odczyt wejść (przypadek, operator albo model zmienione) startuje formularz od
  // danych modelu — deklaracje lokalne okna dotyczyły poprzednich wejść.
  useEffect(() => {
    setFormularze({});
    setBledy({});
    if (aktywnyPrzypadek === null || operatorId === null) {
      setStanWejsc({ stan: 'brak' });
      return;
    }
    let aktualny = true;
    setStanWejsc({ stan: 'ladowanie' });
    pobierzWejsciaPrzypadkuNcRfg(aktywnyPrzypadek, operatorId).then(
      (wejscia) => {
        if (aktualny) setStanWejsc({ stan: 'gotowe', wejscia });
      },
      (err: unknown) => {
        if (aktualny) {
          setStanWejsc({
            stan: 'blad',
            komunikat: err instanceof Error ? err.message : MACIERZ_STRINGS.bladWejsc,
          });
        }
      },
    );
    return () => {
      aktualny = false;
    };
  }, [aktywnyPrzypadek, operatorId, stanModulow]);

  useEffect(() => {
    if (!wybranyModul && opisyBazowe[0]) setWybranyModul(opisyBazowe[0].derRef);
  }, [opisyBazowe, wybranyModul]);

  // Pre-selekcja modułu z deep-linku — żądanie jednorazowe (wzorzec `EkranKompensacji`).
  const skonsumowanaPreselekcja = useRef<string | null>(null);
  useEffect(() => {
    if (preselekcjaModulu === null || preselekcjaModulu === '') {
      skonsumowanaPreselekcja.current = null;
      return;
    }
    if (preselekcjaModulu === skonsumowanaPreselekcja.current) return;
    if (opisyBazowe.length === 0) return;
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

  // Efektywne opisy = bazowe z modelu + formularz lokalny okna (zero mutacji modelu).
  const opisy = useMemo<OpisModulu[]>(
    () =>
      opisyBazowe.map((opis) => {
        const formularz = formularze[opis.derRef];
        return formularz ? { ...opis, formularz } : opis;
      }),
    [opisyBazowe, formularze],
  );
  const opisWybrany = opisy.find((o) => o.derRef === wybranyModul) ?? opisy[0] ?? null;

  const definicje = wynik?.test_catalog ?? katalog?.tests ?? [];
  const wiersze = useMemo(() => mapujMacierz(definicje, wynik, opisy), [definicje, wynik, opisy]);
  const opcjeFiltra = useMemo(() => etykietyObecne(wynik), [wynik]);
  const filtrAktywny = filtr !== '' && opcjeFiltra.some((o) => o.etykieta.etykieta_pl === filtr);
  const wierszeWidoczne = filtrAktywny
    ? wiersze.filter((w) =>
        w.komorki.some(
          (k) => k.stan === 'wynik' && k.wynik.ocena.etykieta.etykieta_pl === filtr,
        ),
      )
    : wiersze;

  const gotoweDoBiegu = opisy.filter((o) => o.powodBlokady === null);
  const powodBlokadyBiegu =
    opisy.length === 0
      ? MACIERZ_STRINGS.brakModulow
      : aktywnyPrzypadek === null
        ? MACIERZ_STRINGS.brakPrzypadkuWejsc
        : operatorId === null
          ? MACIERZ_STRINGS.brakOperatora
          : stanWejsc.stan === 'ladowanie'
            ? MACIERZ_STRINGS.wczytywanieWejsc
            : stanWejsc.stan === 'blad'
              ? MACIERZ_STRINGS.bladWejsc
              : gotoweDoBiegu.length === 0
                ? MACIERZ_STRINGS.brakModulowGotowych
                : status === 'running'
                  ? MACIERZ_STRINGS.wTrakcie
                  : null;

  const zmienFormularz = (derRef: string, formularz: FormularzModulu): void => {
    setFormularze((biezace) => ({ ...biezace, [derRef]: formularz }));
    setBledy((biezace) => {
      if (!(derRef in biezace)) return biezace;
      const { [derRef]: _usuniety, ...reszta } = biezace;
      return reszta;
    });
  };

  const przeprowadz = async (): Promise<void> => {
    if (operatorId === null) return;
    const wejscia: WejscieModuluNcRfg[] = [];
    const noweBledy: Record<string, BledyFormularza> = {};
    for (const opis of gotoweDoBiegu) {
      const wynikWejscia = zbudujWejscieModulu(opis, operatorId);
      if (wynikWejscia.stan === 'ok') wejscia.push(wynikWejscia.wejscie);
      else if (wynikWejscia.stan === 'blad') noweBledy[opis.derRef] = wynikWejscia.bledy;
    }
    setBledy(noweBledy);
    const pierwszyZBledem = Object.keys(noweBledy)[0];
    if (pierwszyZBledem !== undefined) {
      setWybranyModul(pierwszyZBledem);
      return;
    }
    await przeprowadzTesty(wejscia);
  };

  const modulyZBledem = opisy.filter((o) => o.derRef in bledy).map((o) => o.nazwa);

  // Certyfikat — WYŁĄCZNIE z zatwierdzonego modelu przypadku (case_id) i operatora.
  const certyfikatDostepny = aktywnyPrzypadek !== null && operatorId !== null;

  const zadanieCertyfikatu = (): ZadanieCertyfikatu | null => {
    if (operatorId === null) return null;
    return zbudujZadanieCertyfikatu({
      nazwaProjektu,
      nazwaPrzypadku,
      operatorId,
      nazwaZastepcza: MACIERZ_STRINGS.projektBezNazwy,
    });
  };

  const obsluzBladCertyfikatu = (err: unknown): void => {
    if (err instanceof BrakiCertyfikatuError) {
      setCertyfikat(null);
      setCertBlad(null);
      setCertBraki(err.braki);
    } else {
      setCertBraki(null);
      setCertBlad(err instanceof Error ? err.message : MACIERZ_STRINGS.certyfikatBlad);
    }
  };

  const generujCertyfikat = async (): Promise<void> => {
    const zadanie = zadanieCertyfikatu();
    if (!zadanie || aktywnyPrzypadek === null) return;
    setCertLadowanie(true);
    setCertBlad(null);
    setCertBraki(null);
    setCertyfikat(null);
    try {
      setCertyfikat(await pobierzCertyfikat(zadanie, aktywnyPrzypadek));
    } catch (err) {
      obsluzBladCertyfikatu(err);
    } finally {
      setCertLadowanie(false);
    }
  };

  const pobierzPlik = async (format: FormatDokumentu): Promise<void> => {
    const zadanie = zadanieCertyfikatu();
    if (!zadanie || aktywnyPrzypadek === null) return;
    setPlikLadowanie(format);
    setCertBlad(null);
    try {
      const blob = await pobierzPlikCertyfikatu(zadanie, aktywnyPrzypadek, format);
      zapiszBlob(blob, nazwaPlikuCertyfikatu(new Date(), format));
    } catch (err) {
      obsluzBladCertyfikatu(err);
    } finally {
      setPlikLadowanie(null);
    }
  };

  const zamknijCertyfikat = (): void => {
    setCertyfikat(null);
    setCertBraki(null);
    setCertBlad(null);
  };

  const komorkaSzczegolu = wybranaKomorka
    ? (wiersze
        .find((w) => w.test.test_id === wybranaKomorka.testId)
        ?.komorki.find((k) => k.derRef === wybranaKomorka.derRef) ?? null)
    : null;
  const definicjaSzczegolu =
    definicje.find((d) => d.test_id === wybranaKomorka?.testId) ?? null;
  const nazwaModuluSzczegolu =
    opisy.find((o) => o.derRef === wybranaKomorka?.derRef)?.nazwa ?? null;

  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');
  const wynikWybranego = opisWybrany ? wynikModulu(wynik, opisWybrany.derRef) : null;
  const ocenaWybranego = opisWybrany ? ocenaWymaganModulu(wynik, opisWybrany.derRef) : null;

  return (
    <div className="mvd-oze" data-testid="mvd-oze-macierz-ncrfg">
      <header className="mvd-oze-head">
        <div className="mvd-oze-head-main">
          <h3 className="mvd-oze-title">{MACIERZ_STRINGS.tytul}</h3>
          <p className="mvd-oze-sub">{MACIERZ_STRINGS.podtytul}</p>
        </div>
        <div className="mvd-oze-head-akcje">
          <div className="mvd-oze-pola">
            <WyborOperatora
              zModelu={zModelu}
              operatorzy={katalog?.operators ?? null}
              wybor={operatorWybor}
              onWybor={ustawOperator}
              etykieta={MACIERZ_STRINGS.operator}
              testid="mvd-oze-operator"
            />
            {katalog ? (
              <div className="mvd-oze-pole">
                <span>{MACIERZ_STRINGS.wersjaProcedury}</span>
                <OpisDokumentuWarstwy
                  dokument={katalog.procedure_version}
                  testid="mvd-oze-wersja-procedury"
                />
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
          {wynik ? (
            <InformacjeAudytowe
              trybEkspercki={trybEkspercki}
              testid="mvd-oze-odcisk"
              wiersze={[
                { etykieta: MACIERZ_STRINGS.odciskBiegu, wartosc: wynik.deterministic_hash },
                { etykieta: MACIERZ_STRINGS.odciskWejsciaBiegu, wartosc: wynik.input_hash },
                { etykieta: MACIERZ_STRINGS.wersjaSolvera, wartosc: wynik.solver_version },
              ]}
            />
          ) : null}
        </div>
      </header>

      <p className="mvd-oze-info mvd-oze-opis-biegu" data-testid="mvd-oze-opis-biegu">
        {MACIERZ_STRINGS.opisBiegu}
      </p>

      {bladKatalogu ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-blad-katalogu">
          {MACIERZ_STRINGS.bladKatalogu}: {bladKatalogu}
        </div>
      ) : null}
      {stanWejsc.stan === 'blad' ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-blad-wejsc">
          {MACIERZ_STRINGS.bladWejsc}: {stanWejsc.komunikat}
        </div>
      ) : null}
      {bladBiegu ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-blad-biegu">
          {MACIERZ_STRINGS.bladBiegu}: {bladBiegu}
        </div>
      ) : null}
      {modulyZBledem.length > 0 ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-bledy-formularza">
          {MACIERZ_STRINGS.bledyFormularza}: {modulyZBledem.join(', ')}
        </div>
      ) : null}

      <SekcjaZgodnosciPrzekrojowej
        caseId={aktywnyPrzypadek}
        operatorId={operatorId}
        nazwyModulow={nazwyModulow}
        trybEkspercki={trybEkspercki}
        onWybierzModul={(derRef) => {
          setWybranyModul(derRef);
          setWybranaKomorka(null);
        }}
      />

      {certyfikat || certBraki || certBlad || certLadowanie ? (
        <PodgladCertyfikatu
          widok={certyfikat}
          braki={certBraki}
          blad={certBlad}
          ladowanie={certLadowanie}
          plikLadowanie={plikLadowanie}
          trybEkspercki={trybEkspercki}
          onPobierz={(format) => void pobierzPlik(format)}
          onZamknij={zamknijCertyfikat}
        />
      ) : null}

      {opisy.length === 0 ? (
        <section className="mvd-oze-info" data-testid="mvd-oze-pusty">
          <h4>{MACIERZ_STRINGS.brakModulow}</h4>
          <p>{MACIERZ_STRINGS.brakModulowOpis}</p>
          <PrzyciskAkcjiStanu akcja={akcjaZrodlo} testid="mvd-oze-pusty" />
        </section>
      ) : (
        <div className="mvd-oze-uklad">
          <div className="mvd-oze-macierz-wrap" data-testid="mvd-oze-macierz-tabela">
            {opcjeFiltra.length > 0 ? (
              <label className="mvd-oze-pole mvd-oze-filtr">
                <span>{MACIERZ_STRINGS.filtr}</span>
                <select
                  value={filtrAktywny ? filtr : ''}
                  onChange={(event) => setFiltr(event.target.value)}
                  data-testid="mvd-oze-filtr"
                >
                  <option value="">{MACIERZ_STRINGS.filtrWszystkie}</option>
                  {opcjeFiltra.map((opcja) => (
                    <option key={opcja.etykieta.etykieta_pl} value={opcja.etykieta.etykieta_pl}>
                      {opcja.etykieta.etykieta_pl}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <table className="mvd-oze-macierz">
              <thead>
                <tr>
                  <th className="mvd-oze-col-test">{MACIERZ_STRINGS.naglowekTestu}</th>
                  {opisy.map((opis) => {
                    const wynikKolumny = wynikModulu(wynik, opis.derRef);
                    const frt = wynikiFrt[opis.derRef];
                    return (
                      <th key={opis.derRef} className="mvd-oze-modul-h">
                        <button
                          type="button"
                          className="mvd-oze-komorka"
                          onClick={() => {
                            setWybranyModul(opis.derRef);
                            setWybranaKomorka(null);
                          }}
                          aria-pressed={opisWybrany?.derRef === opis.derRef}
                          title={MACIERZ_STRINGS.pokazModul}
                          data-testid={`mvd-oze-modul-${opis.derRef}`}
                        >
                          <span className="mvd-oze-modul-nazwa">
                            {opis.nazwa} · {opis.rodzaj}
                          </span>
                        </button>
                        <div className="mvd-oze-modul-meta mvd-oze-num">
                          {formatMoc(opis.mocKw)} · {formatNapiecie(opis.napiecieKv)}
                        </div>
                        {wynikKolumny ? (
                          <div
                            className="mvd-oze-modul-meta"
                            data-testid={`mvd-oze-modul-klasa-${opis.derRef}`}
                          >
                            {wynikKolumny.klasyfikacja.modul !== null
                              ? `${MACIERZ_STRINGS.klasaModulu} ${wynikKolumny.klasyfikacja.modul}`
                              : MACIERZ_STRINGS.ponizejProgu}
                          </div>
                        ) : null}
                        {/* Stan zapisany przez okno FRT: wyłącznie tekst tego okna — macierz nie
                            tłumaczy jego istotności na kolor (mapa w kliencie byłaby werdyktem
                            lakonicznym). */}
                        {frt?.lvrt ? (
                          <div className="mvd-oze-modul-meta" data-testid={`mvd-oze-frt-lvrt-${opis.derRef}`}>
                            {MACIERZ_STRINGS.wynikFrtLvrt}:{' '}
                            <span data-testid={`mvd-oze-frt-lvrt-tekst-${opis.derRef}`}>{frt.lvrt.tekst}</span>
                          </div>
                        ) : null}
                        {frt?.hvrt ? (
                          <div className="mvd-oze-modul-meta" data-testid={`mvd-oze-frt-hvrt-${opis.derRef}`}>
                            {MACIERZ_STRINGS.wynikFrtHvrt}:{' '}
                            <span data-testid={`mvd-oze-frt-hvrt-tekst-${opis.derRef}`}>{frt.hvrt.tekst}</span>
                          </div>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {wierszeWidoczne.length === 0 ? (
                  <tr>
                    <td colSpan={opisy.length + 1} className="mvd-oze-komorka-pusta">
                      {MACIERZ_STRINGS.brakBieguOpis}
                    </td>
                  </tr>
                ) : (
                  wierszeWidoczne.map((wiersz) => (
                    <tr key={wiersz.test.test_id} data-testid="mvd-oze-wiersz">
                      <td className="mvd-oze-col-test">
                        <div className="mvd-oze-test-nazwa">
                          {wiersz.test.test_id} · {wiersz.test.ability_pl}
                        </div>
                        <div className="mvd-oze-test-podstawa">{wiersz.test.procedure_basis_pl}</div>
                        <div className="mvd-oze-test-podstawa">
                          {MACIERZ_STRINGS.rodzajTwierdzenia}:{' '}
                          {nazwaRodzajuTwierdzenia(wiersz.test.rodzaj_twierdzenia)}
                          {/* Karta #145: identyfikator zdolności dowodowej jest metadaną —
                              wyłącznie w „Informacjach audytowych" oceny komórki. */}
                        </div>
                      </td>
                      {wiersz.komorki.map((komorka) => (
                        <td key={komorka.derRef}>
                          {komorka.stan === 'wynik' ? (
                            filtrAktywny && komorka.wynik.ocena.etykieta.etykieta_pl !== filtr ? (
                              <span
                                className="mvd-oze-komorka-pusta"
                                data-testid="mvd-oze-komorka-poza-filtrem"
                              >
                                ·
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="mvd-oze-komorka"
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
                                <EtykietaWerdyktu
                                  etykieta={komorka.wynik.ocena.etykieta}
                                  status={komorka.wynik.ocena.status_maszynowy}
                                />
                              </button>
                            )
                          ) : komorka.stan === 'brak_danych_modul' ? (
                            <button
                              type="button"
                              className="mvd-oze-komorka"
                              onClick={() =>
                                setWybranaKomorka({
                                  derRef: komorka.derRef,
                                  testId: komorka.testId,
                                })
                              }
                              data-testid="mvd-oze-komorka-brak-danych"
                            >
                              {MACIERZ_STRINGS.brakWyniku}
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
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SzczegolWerdyktu
              komorka={komorkaSzczegolu}
              definicja={definicjaSzczegolu}
              nazwaModulu={nazwaModuluSzczegolu}
              slad={wynik?.white_box_trace ?? []}
              trybEkspercki={trybEkspercki}
            />
            {opisWybrany ? (
              <>
                <section
                  className="mvd-oze-panel"
                  data-testid="mvd-oze-wynik-modulu"
                  aria-label={MACIERZ_STRINGS.wynikModuluTytul}
                >
                  <h4>
                    {MACIERZ_STRINGS.wynikModuluTytul}: {opisWybrany.nazwa}
                  </h4>
                  {wynikWybranego ? (
                    <>
                      <NaglowekModuluNcRfg
                        modul={wynikWybranego}
                        testid={`mvd-oze-wynik-modulu-naglowek-${opisWybrany.derRef}`}
                      />
                      <span className="mvd-oze-panel-etyk">
                        {MACIERZ_STRINGS.wymaganiaModuluTytul}
                      </span>
                      <ListaRekordowWymagan
                        rekordy={ocenaWybranego?.wymagania ?? []}
                        testid={`mvd-oze-wymagania-${opisWybrany.derRef}`}
                      />
                    </>
                  ) : (
                    <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-wynik-modulu-brak">
                      {wynik ? MACIERZ_STRINGS.wynikModuluBrak : MACIERZ_STRINGS.brakBieguOpis}
                    </p>
                  )}
                </section>
                <PanelModulu
                  opis={opisWybrany}
                  formularz={opisWybrany.formularz}
                  bledy={bledy[opisWybrany.derRef] ?? {}}
                  onZmienFormularz={(formularz) => zmienFormularz(opisWybrany.derRef, formularz)}
                />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
