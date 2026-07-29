/*
 * EkranWniosku — okno „Wniosek OSD" (karta W-707 / E13). Domyka strumień OZE:
 * kompletuje wniosek o określenie warunków przyłączenia z GOTOWYCH wyników
 * (rozpływ + zwarcie + bieg NC RfG) przez `POST /api/oze-analysis/osd-application`.
 *
 * Formularz: wybór zakończonego przebiegu rozpływu i zwarciowego (rejestr biegów,
 * filtry rodzaju jak „Jakość wyników"/„Zgodność powykonawcza"), węzeł
 * przyłączenia, identyfikacja (nazwa projektu wymagana) oraz żądanie NC RfG 1:1
 * z ostatnim zakończonym biegiem (`ncRfgStore.ostatnieWejscia`, wzorzec
 * certyfikatu P39c). Bez zakończonego biegu NC RfG / bez przebiegów / bez węzła /
 * bez nazwy projektu → przycisk nieaktywny z uczciwym tytułem PL.
 *
 * Wynik: sekcje wniosku (bilans mocy, zwarcia punktu, zgodność NC RfG) w tabelach
 * i opisach PL, adnotacje `zalozenia_pl` zawsze widoczne, odciski sekcji w trybie
 * eksperckim. Braki 422 → uczciwa lista PL („wniosek nie może powstać"). „Pobierz
 * DOCX" zapisuje `wniosek-osd-<data>.docx`.
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko prezentuje. Wszystkie
 * wielkości i werdykty pochodzą WYŁĄCZNIE z backendu; dane biegu NC RfG czytane
 * read-only ze wspólnego store'u; zero mutacji modelu, zero fizyki.
 */

import { useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import {
  pobierzWniosek,
  pobierzWniosekDocx,
  WniosekBrakiError,
  type WidokWniosku,
  type ZadanieWniosku,
} from '../api';
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
  statusWalidacjiWniosekPL,
  WNIOSEK_STRINGS as T,
} from './strings';

import './wniosek.css';

/** Braki kompletności wniosku (bramka 422 — uczciwa lista po polsku). */
interface BrakiWniosku {
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

export interface EkranWnioskuProps {
  /** Tryb zaawansowania — odciski sekcji widoczne w trybie eksperckim. */
  readonly trybZaawansowania: AdvancementMode;
}

export function EkranWniosku({ trybZaawansowania }: EkranWnioskuProps): JSX.Element {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const rozplywy = useMemo(() => przebiegiRozplywu(runs), [runs]);
  const zwarcia = useMemo(() => przebiegiZwarciowe(runs), [runs]);

  // Bieg NC RfG — wspólny store (widoczny również w macierzy i certyfikacie).
  const wynikNcRfg = useNcRfgStore((s) => s.wynik);
  const ostatnieWejscia = useNcRfgStore((s) => s.ostatnieWejscia);
  const statusNcRfg = useNcRfgStore((s) => s.status);

  // Identyfikacja domyślna z aktywnego projektu/przypadku (read-only, jednorazowo).
  const nazwaProjektuBazowa = useAppStateStore((s) => s.activeProjectName);
  const nazwaPrzypadkuBazowa = useAppStateStore((s) => s.activeCaseName);

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
  const [docxLadowanie, setDocxLadowanie] = useState(false);

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

  const maBiegNcRfg =
    statusNcRfg === 'ready' &&
    wynikNcRfg !== null &&
    ostatnieWejscia !== null &&
    ostatnieWejscia.length > 0;

  const powodBlokady = powodBlokadyWniosku({
    pfRunId,
    scRunId,
    busRef,
    nazwaProjektu,
    maBiegNcRfg,
  });

  // Każda zmiana wejścia unieważnia poprzedni podgląd (stale-result guard).
  const unewaznij = (): void => {
    setWidok(null);
    setBraki(null);
    setBlad(null);
  };

  const zbudujZadanie = (): ZadanieWniosku | null => {
    if (powodBlokady !== null || pfRunId === null || scRunId === null || !ostatnieWejscia) {
      return null;
    }
    return zbudujZadanieWniosku({
      pfRunId,
      scRunId,
      busRef,
      identyfikacja: { nazwaProjektu, nazwaPrzypadku, wnioskodawca, adres },
      modules: ostatnieWejscia,
      procedureVersion: wynikNcRfg?.procedure_version,
    });
  };

  const obsluzBlad = (err: unknown): void => {
    if (err instanceof WniosekBrakiError) {
      setWidok(null);
      setBlad(null);
      setBraki({ komunikat: err.message, braki: err.braki });
    } else {
      setBraki(null);
      setBlad(err instanceof Error ? err.message : T.bladTytul);
    }
  };

  const generuj = async (): Promise<void> => {
    const zadanie = zbudujZadanie();
    if (!zadanie) return;
    setLadowanie(true);
    setBlad(null);
    setBraki(null);
    try {
      setWidok(await pobierzWniosek(zadanie));
    } catch (err) {
      obsluzBlad(err);
    } finally {
      setLadowanie(false);
    }
  };

  const pobierzDocx = async (): Promise<void> => {
    const zadanie = zbudujZadanie();
    if (!zadanie) return;
    setDocxLadowanie(true);
    setBlad(null);
    try {
      const blob = await pobierzWniosekDocx(zadanie);
      zapiszBlob(blob, nazwaPlikuWniosku(new Date()));
    } catch (err) {
      obsluzBlad(err);
    } finally {
      setDocxLadowanie(false);
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
                      {r.id}
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
                      {r.id}
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
            <input
              type="text"
              value={busRef}
              placeholder={T.wezelPlaceholder}
              onChange={(e) => {
                setBusRef(e.target.value);
                unewaznij();
              }}
              data-testid="mvd-wniosek-wezel"
            />
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
          <p className="mvd-wniosek-pole-opis">{T.ncRfgZBiegu}</p>
          {maBiegNcRfg && ostatnieWejscia ? (
            <p className="mvd-wniosek-ncrfg-meta" data-testid="mvd-wniosek-ncrfg-meta">
              {T.ncRfgLiczbaModulow}:{' '}
              <span className="mvd-num">{ostatnieWejscia.length}</span>
            </p>
          ) : null}
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
          <p>{braki.komunikat}</p>
          <ul>
            {braki.braki.map((brak, indeks) => (
              <li key={indeks}>{brak}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {widok ? (
        <WynikWniosku widok={widok} trybEkspercki={trybEkspercki} onPobierzDocx={pobierzDocx} docxLadowanie={docxLadowanie} />
      ) : null}
    </div>
  );
}

interface WynikWnioskuProps {
  readonly widok: WidokWniosku;
  readonly trybEkspercki: boolean;
  readonly onPobierzDocx: () => void;
  readonly docxLadowanie: boolean;
}

function WynikWniosku({
  widok,
  trybEkspercki,
  onPobierzDocx,
  docxLadowanie,
}: WynikWnioskuProps): JSX.Element {
  const bilans = widok.bilans_mocy;
  const zwarcia = widok.zwarcia_punkt_przylaczenia;
  const zgodnosc = widok.zgodnosc_nc_rfg;
  const identyfikacja = widok.identyfikacja;
  const pw = bilans.podsumowanie_walidacji;

  return (
    <section className="mvd-wniosek-wynik" data-testid="mvd-wniosek-wynik">
      <div className="mvd-wniosek-wynik-head">
        <div>
          <h4 className="mvd-wniosek-wynik-tytul">{widok.tytul}</h4>
          <p className="mvd-wniosek-wynik-projekt">
            {identyfikacja.projekt}
            {identyfikacja.przypadek ? ` · ${identyfikacja.przypadek}` : ''}
            {' · '}
            {identyfikacja.wezel_przylaczenia}
          </p>
          {identyfikacja.wnioskodawca ? (
            <p className="mvd-wniosek-wynik-meta">{identyfikacja.wnioskodawca}</p>
          ) : null}
          {identyfikacja.adres_przylaczenia ? (
            <p className="mvd-wniosek-wynik-meta">{identyfikacja.adres_przylaczenia}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="mvd-btn mvd-btn-glowny"
          onClick={onPobierzDocx}
          disabled={docxLadowanie}
          data-testid="mvd-wniosek-pobierz-docx"
        >
          {T.pobierzDocx}
        </button>
      </div>

      {/* Sekcja 1 — bilans mocy */}
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
            <dd className="mvd-num">
              {fmtLiczbaWniosku(bilans.wspolczynnik_mocy_slack, 3)}
              {' · '}
              {statusWalidacjiWniosekPL(bilans.bilans_q_status)}
            </dd>
          </div>
          <div>
            <dt>{T.bilansStraty}</dt>
            <dd className="mvd-num">
              {fmtZJednostkaWniosku(bilans.straty_pct, T.jednProcent)}
              {' · '}
              {statusWalidacjiWniosekPL(bilans.straty_status)}
            </dd>
          </div>
        </dl>
        <div className="mvd-wniosek-walidacja" data-testid="mvd-wniosek-walidacja">
          <span className="mvd-wniosek-walidacja-etyk">{T.bilansWalidacja}:</span>
          <span>
            {T.bilansSpelnione} <span className="mvd-num">{pw.spelnione}</span>
          </span>
          <span>
            {T.bilansOstrzezenia} <span className="mvd-num">{pw.ostrzezenia}</span>
          </span>
          <span>
            {T.bilansNiespelnione} <span className="mvd-num">{pw.niespelnione}</span>
          </span>
          <span>
            {T.bilansNieobliczone} <span className="mvd-num">{pw.nieobliczone}</span>
          </span>
        </div>
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

      {/* Sekcja 3 — zgodność NC RfG */}
      <div className="mvd-wniosek-sek" data-testid="mvd-wniosek-zgodnosc">
        <h5 className="mvd-wniosek-sek-tytul">{T.zgodnoscTytul}</h5>
        <div
          className={`mvd-wniosek-werdykt ${
            zgodnosc.status === 'zgodny' ? 'mvd-wniosek-werdykt-ok' : 'mvd-wniosek-werdykt-err'
          }`}
          data-testid="mvd-wniosek-werdykt"
        >
          {zgodnosc.etykieta_pl}
        </div>
        <dl className="mvd-wniosek-dl">
          <div>
            <dt>{T.zgodnoscModuly}</dt>
            <dd className="mvd-num">{zgodnosc.liczba_modulow}</dd>
          </div>
          <div>
            <dt>{T.zgodnoscZgodne}</dt>
            <dd className="mvd-num">{zgodnosc.modulow_zgodnych}</dd>
          </div>
          <div>
            <dt>{T.zgodnoscNiezgodne}</dt>
            <dd className="mvd-num">{zgodnosc.modulow_niezgodnych}</dd>
          </div>
          <div>
            <dt>{T.zgodnoscProcedura}</dt>
            <dd>{zgodnosc.procedura}</dd>
          </div>
        </dl>
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

      {trybEkspercki ? (
        <dl className="mvd-wniosek-odciski" data-testid="mvd-wniosek-odciski">
          <div>
            <dt>{T.odciskWejscia}</dt>
            <dd className="mvd-num">{widok.input_hash}</dd>
          </div>
          {Object.entries(widok.odciski_sekcji_sha256).map(([nazwa, odcisk]) => (
            <div key={nazwa}>
              <dt>
                {T.odciskiTytul}: {nazwa}
              </dt>
              <dd className="mvd-num">{odcisk}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
