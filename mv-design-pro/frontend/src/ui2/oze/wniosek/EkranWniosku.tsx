/*
 * EkranWniosku — okno „Wniosek OSD" (karta W-707 / E13; kontrakt V2 — karta AB-1a Pakiet D2
 * §5). Domyka strumień OZE: kompletuje wniosek o określenie warunków przyłączenia z GOTOWYCH
 * wyników (rozpływ + zwarcie) i z oceny zgodności NC RfG ZATWIERDZONEGO modelu przypadku
 * przez `POST /api/oze-analysis/osd-application?case_id=`.
 *
 * Formularz: wybór zakończonego przebiegu rozpływu i zwarciowego (rejestr biegów), węzeł
 * przyłączenia, identyfikacja (nazwa projektu wymagana) i operator (profil wymagań NC RfG —
 * z modelu, gdy moduły wskazują jednego; inaczej jawny wybór bez wartości domyślnej). Bez
 * aktywnego przypadku / operatora / przebiegów / węzła / nazwy projektu → przycisk nieaktywny
 * z uczciwym tytułem PL.
 *
 * Wynik: sekcje wniosku (bilans mocy, zwarcia punktu, zgodność NC RfG — sekcje modułów
 * z rekordami wymagań przez `KartaWerdyktu`), `zalozenia_pl` zawsze widoczne, odciski
 * w informacjach audytowych (tryb ekspercki). Odpowiedź 422 z brakami to ekran „czego
 * brakuje do wniosku" (braki tekstowe + rekordy W + źródła pominięte). „Pobierz DOCX/PDF"
 * zapisuje `wniosek-osd-<data>.<format>`.
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko prezentuje. Wszystkie wielkości
 * i rekordy pochodzą WYŁĄCZNIE z backendu; zero mutacji modelu, zero fizyki, zero map
 * status → tekst i zero liczników.
 */

import { useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { selectBusOptions, useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { etykietaPrzebieguWyniku } from '../../wyniki/wzorzec/strings';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import { useNazwaObiektu } from '../../wyniki/wzorzec/useNazwaObiektu';
import {
  BrakiWnioskuError,
  pobierzPlikWniosku,
  pobierzWniosek,
  type FormatDokumentu,
} from '../ncrfg/api';
import {
  BrakiDokumentu,
  OpisDokumentuWarstwy,
  SekcjaModuluDokumentu,
} from '../ncrfg/komponenty';
import { operatorEfektywny, operatorZModelu } from '../ncrfg/operator';
import type { BrakiWniosku, WidokWniosku, ZadanieWniosku } from '../ncrfg/typy';
import { WyborOperatora } from '../ncrfg/WyborOperatora';
import { useNcRfgStore } from '../ncRfgStore';
import {
  domyslnyPrzebieg,
  powodBlokadyWniosku,
  przebiegiRozplywu,
  przebiegiZwarciowe,
  zbudujZadanieWniosku,
} from './model';
import {
  fmtLiczbaWniosku,
  fmtZJednostkaWniosku,
  nazwaPlikuWniosku,
  WNIOSEK_STRINGS as T,
} from './strings';

import './wniosek.css';

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

export interface EkranWnioskuProps {
  /** Tryb zaawansowania — odciski sekcji widoczne w trybie eksperckim. */
  readonly trybZaawansowania: AdvancementMode;
}

export function EkranWniosku({ trybZaawansowania }: EkranWnioskuProps): JSX.Element {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const rozplywy = useMemo(() => przebiegiRozplywu(runs), [runs]);
  const zwarcia = useMemo(() => przebiegiZwarciowe(runs), [runs]);

  // Operator (profil wymagań NC RfG) — z modelu albo jawny wybór (wspólny store z macierzą).
  const ders = useStationDerStore((state) => selectAllDers(state));
  const zModelu = useMemo(() => operatorZModelu(ders), [ders]);
  const katalog = useNcRfgStore((s) => s.katalog);
  const operatorWybor = useNcRfgStore((s) => s.operatorWybor);
  const ustawOperator = useNcRfgStore((s) => s.ustawOperator);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const operatorId = operatorEfektywny(zModelu, operatorWybor);

  // Identyfikacja domyślna z aktywnego projektu/przypadku (read-only, jednorazowo).
  const nazwaProjektuBazowa = useAppStateStore((s) => s.activeProjectName);
  const nazwaPrzypadkuBazowa = useAppStateStore((s) => s.activeCaseName);
  // Aktywny przypadek — zgodność NC RfG i dowód certyfikatu serwer wyprowadza z jego modelu.
  const aktywnyPrzypadek = useAppStateStore((s) => s.activeCaseId);

  // Karta #145: szyna przyłączenia wybierana z listy szyn modelu po nazwie (ten sam
  // dobór co kompensacja mocy biernej) — projektant nie wpisuje referencji.
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const opcjeSzyn = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const [pfRunId, setPfRunId] = useState<string | null>(null);
  const [scRunId, setScRunId] = useState<string | null>(null);
  const [busRef, setBusRef] = useState('');
  const [nazwaProjektu, setNazwaProjektu] = useState(() => nazwaProjektuBazowa ?? '');
  const [nazwaPrzypadku, setNazwaPrzypadku] = useState(() => nazwaPrzypadkuBazowa ?? '');
  const [wnioskodawca, setWnioskodawca] = useState('');
  const [adres, setAdres] = useState('');

  const [widok, setWidok] = useState<WidokWniosku | null>(null);
  const [braki, setBraki] = useState<BrakiWniosku | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [plikLadowanie, setPlikLadowanie] = useState<FormatDokumentu | null>(null);

  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

  // Domyślny wybór przebiegów (preferuje aktywny, inaczej ostatni z listy).
  useEffect(() => {
    setPfRunId((biezacy) =>
      biezacy && rozplywy.some((r) => r.id === biezacy)
        ? biezacy
        : domyslnyPrzebieg(rozplywy, activeRunId),
    );
  }, [rozplywy, activeRunId]);
  useEffect(() => {
    setScRunId((biezacy) =>
      biezacy && zwarcia.some((r) => r.id === biezacy)
        ? biezacy
        : domyslnyPrzebieg(zwarcia, activeRunId),
    );
  }, [zwarcia, activeRunId]);

  const powodBlokady = powodBlokadyWniosku({
    caseId: aktywnyPrzypadek,
    operatorId,
    pfRunId,
    scRunId,
    busRef,
    nazwaProjektu,
  });

  // Każda zmiana wejścia unieważnia poprzedni podgląd (stale-result guard).
  const unewaznij = (): void => {
    setWidok(null);
    setBraki(null);
    setBlad(null);
  };

  const zbudujZadanie = (): ZadanieWniosku | null => {
    if (powodBlokady !== null || pfRunId === null || scRunId === null || operatorId === null) {
      return null;
    }
    return zbudujZadanieWniosku({
      pfRunId,
      scRunId,
      busRef,
      identyfikacja: { nazwaProjektu, nazwaPrzypadku, wnioskodawca, adres },
      operatorId,
    });
  };

  const obsluzBlad = (err: unknown): void => {
    if (err instanceof BrakiWnioskuError) {
      setWidok(null);
      setBlad(null);
      setBraki(err.braki);
    } else {
      setBraki(null);
      setBlad(err instanceof Error ? err.message : T.bladTytul);
    }
  };

  const generuj = async (): Promise<void> => {
    const zadanie = zbudujZadanie();
    if (!zadanie || aktywnyPrzypadek === null) return;
    setLadowanie(true);
    setBlad(null);
    setBraki(null);
    try {
      setWidok(await pobierzWniosek(zadanie, aktywnyPrzypadek));
    } catch (err) {
      obsluzBlad(err);
    } finally {
      setLadowanie(false);
    }
  };

  const pobierzPlik = async (format: FormatDokumentu): Promise<void> => {
    const zadanie = zbudujZadanie();
    if (!zadanie || aktywnyPrzypadek === null) return;
    setPlikLadowanie(format);
    setBlad(null);
    try {
      const blob = await pobierzPlikWniosku(zadanie, aktywnyPrzypadek, format);
      zapiszBlob(blob, nazwaPlikuWniosku(new Date(), format));
    } catch (err) {
      obsluzBlad(err);
    } finally {
      setPlikLadowanie(null);
    }
  };

  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  return (
    <div className="mvd-wniosek" data-testid="mvd-wniosek-ekran">
      <header className="mvd-wniosek-head">
        <h3 className="mvd-wniosek-tytul">{T.tytul}</h3>
        <p className="mvd-wniosek-sub">{T.podtytul}</p>
      </header>

      <div className="mvd-wniosek-formularz">
        <section className="mvd-wniosek-sekcja">
          <h4 className="mvd-wniosek-sekcja-tytul">{T.sekcjaPrzebiegi}</h4>
          <div className="mvd-wniosek-pola">
            <label className="mvd-wniosek-pole">
              <span>{T.przebiegRozplywu}</span>
              <select
                value={pfRunId ?? ''}
                onChange={(e) => {
                  setPfRunId(e.target.value || null);
                  unewaznij();
                }}
                disabled={rozplywy.length === 0}
                data-testid="mvd-wniosek-pf"
              >
                {rozplywy.length === 0 ? (
                  <option value="">{T.przebiegBrakRozplywu}</option>
                ) : (
                  rozplywy.map((r) => (
                    <option key={r.id} value={r.id}>
                      {etykietaPrzebieguWyniku(r)}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="mvd-wniosek-pole">
              <span>{T.przebiegZwarciowy}</span>
              <select
                value={scRunId ?? ''}
                onChange={(e) => {
                  setScRunId(e.target.value || null);
                  unewaznij();
                }}
                disabled={zwarcia.length === 0}
                data-testid="mvd-wniosek-sc"
              >
                {zwarcia.length === 0 ? (
                  <option value="">{T.przebiegBrakZwarcia}</option>
                ) : (
                  zwarcia.map((r) => (
                    <option key={r.id} value={r.id}>
                      {etykietaPrzebieguWyniku(r)}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </section>

        <section className="mvd-wniosek-sekcja">
          <h4 className="mvd-wniosek-sekcja-tytul">{T.sekcjaPunkt}</h4>
          <label className="mvd-wniosek-pole mvd-wniosek-pole--szerokie">
            <span>{T.wezel}</span>
            <select
              value={busRef}
              onChange={(e) => {
                setBusRef(e.target.value);
                unewaznij();
              }}
              data-testid="mvd-wniosek-wezel"
            >
              <option value="">{opcjeSzyn.length === 0 ? T.wezelBrak : T.wezelWybierz}</option>
              {opcjeSzyn.map((szyna) => (
                <option key={szyna.ref_id} value={szyna.ref_id}>
                  {szyna.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mvd-wniosek-pole-opis">{T.wezelOpis}</p>
        </section>

        <section className="mvd-wniosek-sekcja">
          <h4 className="mvd-wniosek-sekcja-tytul">{T.sekcjaIdentyfikacja}</h4>
          <div className="mvd-wniosek-pola">
            <label className="mvd-wniosek-pole">
              <span>{T.nazwaProjektu}</span>
              <input
                type="text"
                value={nazwaProjektu}
                onChange={(e) => {
                  setNazwaProjektu(e.target.value);
                  unewaznij();
                }}
                data-testid="mvd-wniosek-projekt"
              />
            </label>
            <label className="mvd-wniosek-pole">
              <span>
                {T.nazwaPrzypadku} <em className="mvd-wniosek-opc">({T.poleOpcjonalne})</em>
              </span>
              <input
                type="text"
                value={nazwaPrzypadku}
                onChange={(e) => {
                  setNazwaPrzypadku(e.target.value);
                  unewaznij();
                }}
                data-testid="mvd-wniosek-przypadek"
              />
            </label>
            <label className="mvd-wniosek-pole">
              <span>
                {T.wnioskodawca} <em className="mvd-wniosek-opc">({T.poleOpcjonalne})</em>
              </span>
              <input
                type="text"
                value={wnioskodawca}
                onChange={(e) => {
                  setWnioskodawca(e.target.value);
                  unewaznij();
                }}
                data-testid="mvd-wniosek-wnioskodawca"
              />
            </label>
            <label className="mvd-wniosek-pole">
              <span>
                {T.adres} <em className="mvd-wniosek-opc">({T.poleOpcjonalne})</em>
              </span>
              <input
                type="text"
                value={adres}
                onChange={(e) => {
                  setAdres(e.target.value);
                  unewaznij();
                }}
                data-testid="mvd-wniosek-adres"
              />
            </label>
          </div>
          <p className="mvd-wniosek-pole-opis">{T.nazwaProjektuOpis}</p>
        </section>

        <section className="mvd-wniosek-sekcja">
          <h4 className="mvd-wniosek-sekcja-tytul">{T.sekcjaNcRfg}</h4>
          <p className="mvd-wniosek-pole-opis">{T.ncRfgZModelu}</p>
          <WyborOperatora
            zModelu={zModelu}
            operatorzy={katalog?.operators ?? null}
            wybor={operatorWybor}
            onWybor={(wybor) => {
              ustawOperator(wybor);
              unewaznij();
            }}
            etykieta={T.operator}
            testid="mvd-wniosek-operator"
          />
        </section>
      </div>

      <div className="mvd-wniosek-akcje">
        <button
          type="button"
          className="mvd-btn mvd-btn-glowny"
          onClick={() => void generuj()}
          disabled={powodBlokady !== null || ladowanie}
          title={powodBlokady ?? T.blokadaAktywny}
          data-testid="mvd-wniosek-generuj"
        >
          {widok ? T.generujPonownie : T.generuj}
        </button>
      </div>

      {ladowanie ? (
        <p className="mvd-wniosek-ladowanie" data-testid="mvd-wniosek-ladowanie">
          {T.ladowanie}
        </p>
      ) : null}

      {blad ? (
        <div className="mvd-wniosek-blad" data-testid="mvd-wniosek-blad">
          <strong>{T.bladTytul}:</strong> {blad}
        </div>
      ) : null}

      {braki ? (
        <div className="mvd-wniosek-braki" data-testid="mvd-wniosek-braki">
          <h4>{T.brakiTytul}</h4>
          <BrakiDokumentu
            komunikat={braki.komunikat}
            brakiTekstowe={braki.braki}
            braki={braki.braki_ncrfg}
            zdania={braki.braki_ncrfg_pl}
            pominietePl={braki.pominiete_pl}
            testid="mvd-wniosek-braki-lista"
          />
        </div>
      ) : null}

      {widok ? (
        <WynikWniosku
          widok={widok}
          trybEkspercki={trybEkspercki}
          onPobierz={(format) => void pobierzPlik(format)}
          plikLadowanie={plikLadowanie}
        />
      ) : null}
    </div>
  );
}

interface WynikWnioskuProps {
  readonly widok: WidokWniosku;
  readonly trybEkspercki: boolean;
  readonly onPobierz: (format: FormatDokumentu) => void;
  readonly plikLadowanie: FormatDokumentu | null;
}

function WynikWniosku({
  widok,
  trybEkspercki,
  onPobierz,
  plikLadowanie,
}: WynikWnioskuProps): JSX.Element {
  const bilans = widok.bilans_mocy;
  const zwarcia = widok.zwarcia_punkt_przylaczenia;
  const zgodnosc = widok.zgodnosc_nc_rfg;
  const identyfikacja = widok.identyfikacja;
  // Karta #145: węzeł przyłączenia nazwany z modelu, nie referencją.
  const nazwaObiektu = useNazwaObiektu();

  return (
    <section className="mvd-wniosek-wynik" data-testid="mvd-wniosek-wynik">
      <div className="mvd-wniosek-wynik-head">
        <div>
          <h4 className="mvd-wniosek-wynik-tytul">{widok.tytul}</h4>
          <p className="mvd-wniosek-wynik-projekt">
            {identyfikacja.projekt}
            {identyfikacja.przypadek ? ` · ${identyfikacja.przypadek}` : ''}
            {' · '}
            {nazwaObiektu(identyfikacja.wezel_przylaczenia)}
          </p>
          {identyfikacja.wnioskodawca ? (
            <p className="mvd-wniosek-wynik-meta">{identyfikacja.wnioskodawca}</p>
          ) : null}
          {identyfikacja.adres_przylaczenia ? (
            <p className="mvd-wniosek-wynik-meta">{identyfikacja.adres_przylaczenia}</p>
          ) : null}
        </div>
        <div className="mvd-wniosek-pobierz">
          <button
            type="button"
            className="mvd-btn mvd-btn-glowny"
            onClick={() => onPobierz('docx')}
            disabled={plikLadowanie !== null}
            data-testid="mvd-wniosek-pobierz-docx"
          >
            {T.pobierzDocx}
          </button>
          <button
            type="button"
            className="mvd-btn"
            onClick={() => onPobierz('pdf')}
            disabled={plikLadowanie !== null}
            data-testid="mvd-wniosek-pobierz-pdf"
          >
            {T.pobierzPdf}
          </button>
        </div>
      </div>

      {/* Sekcja 1 — bilans mocy: wartości z rozpływu. Kody statusu walidacji energetycznej
          (`bilans_q_status`, `straty_status`) i liczności `podsumowanie_walidacji` backend
          podaje bez rekordu wyjaśnienia — pierwszy plan ich nie pokazuje (werdykt bez
          wyjaśnienia jest zakazany); luka backendu zgłoszona w meldunku karty D2. */}
      <div className="mvd-wniosek-sek" data-testid="mvd-wniosek-bilans">
        <h5 className="mvd-wniosek-sek-tytul">{T.bilansTytul}</h5>
        <dl className="mvd-wniosek-dl">
          <div>
            <dt>{T.bilansMocZrodel}</dt>
            <dd className="mvd-num">
              {fmtZJednostkaWniosku(bilans.moc_zainstalowana_zrodel_mva, T.jednMVA)}
            </dd>
          </div>
          <div>
            <dt>{T.bilansMocWPunkcie}</dt>
            <dd className="mvd-num">
              {fmtZJednostkaWniosku(bilans.moc_zainstalowana_w_punkcie_mva, T.jednMVA)}
            </dd>
          </div>
          <div>
            <dt>{T.bilansLiczbaWezlow}</dt>
            <dd className="mvd-num">{bilans.liczba_wezlow_ze_zrodlami}</dd>
          </div>
          <div>
            <dt>{T.bilansObciazenie}</dt>
            <dd className="mvd-num">
              {fmtZJednostkaWniosku(bilans.obciazenie_najwyzsze_pct, T.jednProcent)}
              {bilans.obciazenie_element ? ` (${bilans.obciazenie_element})` : ''}
            </dd>
          </div>
          <div>
            <dt>{T.bilansWspMocy}</dt>
            <dd className="mvd-num">{fmtLiczbaWniosku(bilans.wspolczynnik_mocy_slack, 3)}</dd>
          </div>
          <div>
            <dt>{T.bilansStraty}</dt>
            <dd className="mvd-num">{fmtZJednostkaWniosku(bilans.straty_pct, T.jednProcent)}</dd>
          </div>
        </dl>
      </div>

      {/* Sekcja 2 — zwarcia w punkcie przyłączenia */}
      <div className="mvd-wniosek-sek" data-testid="mvd-wniosek-zwarcia">
        <h5 className="mvd-wniosek-sek-tytul">{T.zwarciaTytul}</h5>
        <table className="mvd-wniosek-tabela">
          <tbody>
            <tr>
              <th scope="row">{T.zwarciaWezel}</th>
              <td>{zwarcia.nazwa_wezla}</td>
            </tr>
            <tr>
              <th scope="row">{T.zwarciaIkss}</th>
              <td className="mvd-num">{fmtZJednostkaWniosku(zwarcia.ik_ss_ka, T.jednKA)}</td>
            </tr>
            <tr>
              <th scope="row">{T.zwarciaSk}</th>
              <td className="mvd-num">{fmtZJednostkaWniosku(zwarcia.sk_mva, T.jednMVA)}</td>
            </tr>
            <tr>
              <th scope="row">{T.zwarciaIp}</th>
              <td className="mvd-num">{fmtZJednostkaWniosku(zwarcia.ip_ka, T.jednKA)}</td>
            </tr>
            <tr>
              <th scope="row">{T.zwarciaIth}</th>
              <td className="mvd-num">{fmtZJednostkaWniosku(zwarcia.ith_ka, T.jednKA)}</td>
            </tr>
            <tr>
              <th scope="row">{T.zwarciaRodzaj}</th>
              <td>{zwarcia.rodzaj_zwarcia ?? T.kreska}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sekcja 3 — zgodność NC RfG (sekcje modułów, rekordy wymagań — bez agregatu). */}
      <div className="mvd-wniosek-sek" data-testid="mvd-wniosek-zgodnosc">
        <h5 className="mvd-wniosek-sek-tytul">{T.zgodnoscTytul}</h5>
        <dl className="mvd-wniosek-dl">
          <div>
            <dt>{T.zgodnoscProcedura}</dt>
            <dd>
              <OpisDokumentuWarstwy
                dokument={zgodnosc.procedura}
                testid="mvd-wniosek-zgodnosc-procedura"
              />
            </dd>
          </div>
        </dl>
        {zgodnosc.moduly.map((sekcja) => (
          <SekcjaModuluDokumentu
            key={sekcja.der_ref}
            sekcja={sekcja}
            testid={`mvd-wniosek-modul-${sekcja.der_ref}`}
          />
        ))}
        <p className="mvd-wniosek-odeslanie">{zgodnosc.odeslanie_pl}</p>
      </div>

      {/* Założenia i źródła (zawsze widoczne) */}
      <div className="mvd-wniosek-sek" data-testid="mvd-wniosek-zalozenia">
        <h5 className="mvd-wniosek-sek-tytul">{T.zalozeniaTytul}</h5>
        <ul className="mvd-wniosek-zalozenia">
          {widok.zalozenia_pl.map((pozycja, indeks) => (
            <li key={indeks}>{pozycja}</li>
          ))}
        </ul>
      </div>

      <InformacjeAudytowe
        trybEkspercki={trybEkspercki}
        testid="mvd-wniosek-odciski"
        wiersze={[
          { etykieta: T.odciskWejscia, wartosc: widok.input_hash },
          { etykieta: T.przebiegRozplywu, wartosc: widok.zrodla.pf_run_id },
          { etykieta: T.przebiegZwarciowy, wartosc: widok.zrodla.sc_run_id },
          {
            etykieta: T.odciskWejsciaNcRfg,
            wartosc: zgodnosc.odcisk_wejscia_nc_rfg_sha256,
          },
          ...Object.entries(widok.odciski_sekcji_sha256).map(([nazwa, odcisk]) => ({
            etykieta: `${T.odciskiTytul}: ${nazwa}`,
            wartosc: odcisk,
          })),
        ]}
      />
    </section>
  );
}
