/*
 * EkranKrzywych — okno „Krzywe zdolności P–Q" (karta P41 / strumień OZE).
 * Dobór typu falownika z katalogu konwerterów (`GET /api/catalog/converter-types`;
 * typy bez krzywej producenta widoczne ze stanem „brak krzywej producenta" —
 * bieg zablokowany z uczciwym komunikatem) + operatora OSD z katalogu NC RfG
 * (`GET /api/ncrfg-tests/catalog`) → JAWNY bieg `GET /api/oze-analysis/pq-coverage`
 * → prezentacja:
 *   1. wykres P–Q (pasmo producenta + nakładka wymagania operatora),
 *   2. tabela punktów na wzorcu `TabelaWynikow` (margines + tag statusu),
 *   3. werdykt całości PL + rozwijany ślad WHITE BOX (reużyty `SladAnalizy` z pulpitu).
 *
 * Zero fizyki, zero ocen lokalnych — pokrycie, marginesy i werdykt pochodzą
 * WYŁĄCZNIE z backendu. Identyfikatory (catalog_item_id, operator_id) wyłącznie
 * w trybie eksperckim; nazwy PL typów/operatorów na pierwszym planie.
 */

import { useEffect, useMemo, useState } from 'react';
import './krzywe.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import { SladAnalizy } from '../pulpit';
import { useAppStateStore } from '../../../ui/app-state';
import { notify } from '../../../ui/notifications/store';
import {
  HVRT_CURVE_CATALOG,
  LVRT_CURVE_CATALOG,
  PF_CURVE_CATALOG,
  selectAllDers,
  useStationDerStore,
} from '../../../ui/network-build/station-der';
import {
  DerPersistenceApiError,
  patchDerCatalogBindings,
  type DerCatalogBindingsRequest,
} from '../../../ui/sld/v2/canvas/derPersistenceApi';
import {
  pobierzKatalogKlasNcRfg,
  pobierzKonwertery,
  pobierzPokryciePQ,
  type WidokPokryciaPQ,
  type ZapytaniePokryciaPQ,
} from '../api';
import { WykresPQChart } from './WykresPQChart';
import {
  istotnoscWerdyktuPQ,
  kolumnyTabeliPQ,
  krokiSladuPQ,
  opcjeOperatorowPQ,
  opcjeTypowPQ,
  punktyWykresuPQ,
  wierszeTabeliPQ,
  type OpcjaOperatoraPQ,
  type OpcjaTypuPQ,
} from './krzyweModel';
import { KRZYWE_STRINGS, fmtMWPQ, fmtMvarPQ, fmtPctPQ } from './strings';

// ---------------------------------------------------------------------------
// Stan pobierania (jawny bieg: idle / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu<T> =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: T };

interface KatalogPQ {
  readonly typy: OpcjaTypuPQ[];
  readonly operatorzy: OpcjaOperatoraPQ[];
}

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-krzywe-stan mvd-krzywe-stan--blad' : 'mvd-krzywe-stan'}
      data-testid={testid}
    >
      <p className="mvd-krzywe-stan-title">{komunikat}</p>
      {opis && <p className="mvd-krzywe-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wynik: werdykt + wykres + tabela + rozwijany ślad
// ---------------------------------------------------------------------------

function WynikPokrycia({
  dane,
  trybZaawansowania,
}: {
  dane: WidokPokryciaPQ;
  trybZaawansowania: AdvancementMode;
}) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const [sladWidoczny, setSladWidoczny] = useState(false);

  const punkty = useMemo(() => punktyWykresuPQ(dane), [dane]);
  const kolumny = useMemo(() => kolumnyTabeliPQ(), []);
  const wiersze = useMemo(() => wierszeTabeliPQ(dane), [dane]);
  const kroki = useMemo(() => krokiSladuPQ(dane), [dane]);
  const istotnosc = istotnoscWerdyktuPQ(dane);

  return (
    <div data-testid="mvd-krzywe-wynik">
      <div
        className={`mvd-krzywe-werdykt mvd-krzywe-werdykt--${istotnosc}`}
        data-testid="mvd-krzywe-werdykt"
      >
        <span className="mvd-krzywe-werdykt-tytul">
          {dane.werdykt.pokryty
            ? KRZYWE_STRINGS.werdyktPokryte
            : KRZYWE_STRINGS.werdyktNiepokryte}
        </span>
        <span className="mvd-krzywe-werdykt-opis">{dane.werdykt.opis_pl}</span>
      </div>

      <dl className="mvd-krzywe-zalozenia" data-testid="mvd-krzywe-zalozenia">
        <div className="mvd-krzywe-zal-para">
          <dt>{KRZYWE_STRINGS.zalozeniaTyp}</dt>
          <dd>{dane.typ_katalogowy.nazwa}</dd>
        </div>
        <div className="mvd-krzywe-zal-para">
          <dt>{KRZYWE_STRINGS.zalozeniaOperator}</dt>
          <dd>{dane.operator.nazwa}</dd>
        </div>
        <div className="mvd-krzywe-zal-para">
          <dt>{KRZYWE_STRINGS.zalozeniaPn}</dt>
          <dd className="mvd-num">
            {fmtMWPQ(dane.wymaganie.pn_mw)} {KRZYWE_STRINGS.jednMW}
          </dd>
        </div>
        <div className="mvd-krzywe-zal-para">
          <dt>{KRZYWE_STRINGS.zalozeniaUdzialQ}</dt>
          <dd className="mvd-num">
            {fmtPctPQ(dane.operator.udzial_q_min_pct_pn)}
            {KRZYWE_STRINGS.rozdzielaczPasma}
            {fmtPctPQ(dane.operator.udzial_q_max_pct_pn)} {KRZYWE_STRINGS.jednPct}
          </dd>
        </div>
        <div className="mvd-krzywe-zal-para">
          <dt>{KRZYWE_STRINGS.zalozeniaWymaganie}</dt>
          <dd className="mvd-num">
            {fmtMvarPQ(dane.wymaganie.q_wymagane_min_mvar)}
            {KRZYWE_STRINGS.rozdzielaczPasma}
            {fmtMvarPQ(dane.wymaganie.q_wymagane_max_mvar)} {KRZYWE_STRINGS.jednMvar}
          </dd>
        </div>
      </dl>

      <div className="mvd-krzywe-wykres-blok">
        <WykresPQChart
          punkty={punkty}
          wymaganieMin={dane.wymaganie.q_wymagane_min_mvar}
          wymaganieMax={dane.wymaganie.q_wymagane_max_mvar}
        />
      </div>

      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
      />

      <div className="mvd-krzywe-slad-blok">
        <button
          type="button"
          className="mvd-krzywe-slad-btn"
          aria-expanded={sladWidoczny}
          onClick={() => setSladWidoczny((s) => !s)}
          data-testid="mvd-krzywe-slad-otworz"
        >
          {sladWidoczny ? KRZYWE_STRINGS.sladUkryj : KRZYWE_STRINGS.sladPokaz}
        </button>
        {sladWidoczny && (
          <div className="mvd-oze" data-testid="mvd-krzywe-slad">
            <span className="mvd-krzywe-slad-tytul">{KRZYWE_STRINGS.sladTytul}</span>
            <SladAnalizy kroki={kroki} />
          </div>
        )}
      </div>

      {trybEkspercki && (
        <dl className="mvd-krzywe-eksp" data-testid="mvd-krzywe-eksp">
          <div className="mvd-krzywe-eksp-para">
            <dt>{KRZYWE_STRINGS.ekspTypId}</dt>
            <dd className="mvd-num">{dane.typ_katalogowy.id}</dd>
          </div>
          <div className="mvd-krzywe-eksp-para">
            <dt>{KRZYWE_STRINGS.ekspOperatorId}</dt>
            <dd className="mvd-num">{dane.operator.id}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// K5-B (H-3 pkt 2): akcja wyjściowa — przypisanie krzywych zgodności (P(f) /
// LVRT / HVRT) do wiązań modułu DER w modelu sieci. Zapis kanoniczną operacją
// `set_der_catalog_bindings` (PATCH .../generators/{ref}/bindings), pominięcie
// ≠ null: wysyłane są WYŁĄCZNIE pola z wybraną krzywą. Katalogi krzywych to
// REUŻYCIE list kreatora DER (station-der/catalogs) — jedna prawda wyboru.
// ---------------------------------------------------------------------------

function SekcjaWiazanKrzywych() {
  const ders = useStationDerStore((s) => selectAllDers(s));
  const updateDerProfiles = useStationDerStore((s) => s.updateDerProfiles);
  const projectId = useAppStateStore((s) => s.activeProjectId);
  const caseId = useAppStateStore((s) => s.activeCaseId);

  const [wybranyModul, setWybranyModul] = useState('');
  const [pfRef, setPfRef] = useState('');
  const [lvrtRef, setLvrtRef] = useState('');
  const [hvrtRef, setHvrtRef] = useState('');
  const [zapisywanie, setZapisywanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const modul = ders.find((d) => d.id === wybranyModul) ?? null;
  const kontekstKompletny = Boolean(projectId && caseId);

  const zapisz = async () => {
    if (!modul || !projectId || !caseId) return;
    const zmiany: DerCatalogBindingsRequest = {
      ...(pfRef ? { pf_curve_ref: pfRef } : {}),
      ...(lvrtRef ? { lvrt_curve_ref: lvrtRef } : {}),
      ...(hvrtRef ? { hvrt_curve_ref: hvrtRef } : {}),
    };
    if (Object.keys(zmiany).length === 0) {
      setBlad(KRZYWE_STRINGS.wiazaniaZadnaZmiana);
      return;
    }
    setZapisywanie(true);
    setBlad(null);
    try {
      await patchDerCatalogBindings(projectId, caseId, modul.id, zmiany);
      // Synchronizacja rekordu warsztatu — reguła gotowości i macierz NC RfG
      // widzą nowe krzywe bez odświeżania strony (wzorzec DerSurfaces.poZapisie).
      updateDerProfiles(modul.id, {
        ...(pfRef ? { pf_curve_ref: pfRef } : {}),
        ...(lvrtRef ? { lvrt_curve_ref: lvrtRef } : {}),
        ...(hvrtRef ? { hvrt_curve_ref: hvrtRef } : {}),
      });
      notify(KRZYWE_STRINGS.wiazaniaZapisano, 'success');
    } catch (err) {
      setBlad(
        err instanceof DerPersistenceApiError
          ? err.message
          : KRZYWE_STRINGS.wiazaniaBladZapisu,
      );
    } finally {
      setZapisywanie(false);
    }
  };

  return (
    <section className="mvd-krzywe-wiazania" data-testid="mvd-krzywe-wiazania">
      <p className="mvd-krzywe-wiazania-tytul">{KRZYWE_STRINGS.wiazaniaTytul}</p>
      <p className="mvd-krzywe-wiazania-opis">{KRZYWE_STRINGS.wiazaniaOpis}</p>

      {ders.length === 0 ? (
        <p className="mvd-krzywe-wiazania-brak" data-testid="mvd-krzywe-wiazania-brak-modulow">
          {KRZYWE_STRINGS.wiazaniaBrakModulow}
        </p>
      ) : (
        <>
          <div className="mvd-krzywe-pole">
            <label htmlFor="mvd-krzywe-wiazania-modul">{KRZYWE_STRINGS.wiazaniaModul}</label>
            <select
              id="mvd-krzywe-wiazania-modul"
              value={wybranyModul}
              onChange={(e) => {
                setWybranyModul(e.target.value);
                setBlad(null);
              }}
              data-testid="mvd-krzywe-wiazania-modul"
            >
              <option value="">{KRZYWE_STRINGS.opcjaWybierz}</option>
              {ders.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.der_kind}
                </option>
              ))}
            </select>
            <p className="mvd-krzywe-pole-opis">{KRZYWE_STRINGS.wiazaniaModulPodpowiedz}</p>
          </div>

          {modul !== null && (
            <>
              <div className="mvd-krzywe-pole">
                <label htmlFor="mvd-krzywe-wiazania-pf">{KRZYWE_STRINGS.wiazaniaKrzywaPf}</label>
                <select
                  id="mvd-krzywe-wiazania-pf"
                  value={pfRef}
                  onChange={(e) => setPfRef(e.target.value)}
                  data-testid="mvd-krzywe-wiazania-pf"
                >
                  <option value="">{KRZYWE_STRINGS.wiazaniaBezZmiany}</option>
                  {PF_CURVE_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label_pl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mvd-krzywe-pole">
                <label htmlFor="mvd-krzywe-wiazania-lvrt">{KRZYWE_STRINGS.wiazaniaKrzywaLvrt}</label>
                <select
                  id="mvd-krzywe-wiazania-lvrt"
                  value={lvrtRef}
                  onChange={(e) => setLvrtRef(e.target.value)}
                  data-testid="mvd-krzywe-wiazania-lvrt"
                >
                  <option value="">{KRZYWE_STRINGS.wiazaniaBezZmiany}</option>
                  {LVRT_CURVE_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label_pl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mvd-krzywe-pole">
                <label htmlFor="mvd-krzywe-wiazania-hvrt">{KRZYWE_STRINGS.wiazaniaKrzywaHvrt}</label>
                <select
                  id="mvd-krzywe-wiazania-hvrt"
                  value={hvrtRef}
                  onChange={(e) => setHvrtRef(e.target.value)}
                  data-testid="mvd-krzywe-wiazania-hvrt"
                >
                  <option value="">{KRZYWE_STRINGS.wiazaniaBezZmiany}</option>
                  {HVRT_CURVE_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label_pl}
                    </option>
                  ))}
                </select>
              </div>

              {!kontekstKompletny && (
                <p
                  className="mvd-krzywe-wiazania-brak"
                  data-testid="mvd-krzywe-wiazania-brak-kontekstu"
                >
                  {KRZYWE_STRINGS.wiazaniaBrakKontekstu}
                </p>
              )}

              <button
                type="button"
                className="mvd-krzywe-oblicz"
                onClick={() => void zapisz()}
                disabled={!kontekstKompletny || zapisywanie}
                data-testid="mvd-krzywe-wiazania-zapisz"
              >
                {KRZYWE_STRINGS.wiazaniaZapisz}
              </button>

              {blad !== null && (
                <p className="mvd-krzywe-wiazania-blad" data-testid="mvd-krzywe-wiazania-blad">
                  {blad}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Okno „Krzywe zdolności P–Q"
// ---------------------------------------------------------------------------

export interface EkranKrzywychProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranKrzywych({ trybZaawansowania }: EkranKrzywychProps) {
  const [katalog, setKatalog] = useState<StanZasobu<KatalogPQ>>({ rodzaj: 'idle' });
  const [wybranyTyp, setWybranyTyp] = useState('');
  const [wybranyOperator, setWybranyOperator] = useState('');

  const [zapytanie, setZapytanie] = useState<ZapytaniePokryciaPQ | null>(null);
  const [stan, setStan] = useState<StanZasobu<WidokPokryciaPQ>>({ rodzaj: 'idle' });

  // Wczytanie katalogu typów i operatorów (raz, przy montażu).
  useEffect(() => {
    let anulowane = false;
    setKatalog({ rodzaj: 'ladowanie' });
    Promise.all([pobierzKonwertery(), pobierzKatalogKlasNcRfg()])
      .then(([rekordy, katalogNcRfg]) => {
        if (anulowane) return;
        setKatalog({
          rodzaj: 'gotowe',
          dane: {
            typy: opcjeTypowPQ(rekordy),
            operatorzy: opcjeOperatorowPQ(katalogNcRfg.operators),
          },
        });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setKatalog({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Jawny bieg pokrycia.
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzPokryciePQ(zapytanie)
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setStan({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  const opcjaWybranegoTypu = useMemo(() => {
    if (katalog.rodzaj !== 'gotowe') return null;
    return katalog.dane.typy.find((t) => t.id === wybranyTyp) ?? null;
  }, [katalog, wybranyTyp]);

  // Zmiana doboru unieważnia poprzedni wynik (stale-result guard).
  const zmienTyp = (id: string) => {
    setWybranyTyp(id);
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };
  const zmienOperator = (id: string) => {
    setWybranyOperator(id);
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };

  const typBezKrzywej = opcjaWybranegoTypu !== null && !opcjaWybranegoTypu.maKrzywa;
  const mozliwyBieg =
    wybranyTyp !== '' && wybranyOperator !== '' && opcjaWybranegoTypu?.maKrzywa === true;

  const uruchom = () => {
    if (!mozliwyBieg) return;
    setZapytanie({ catalogItemId: wybranyTyp, operatorId: wybranyOperator });
  };

  return (
    <div className="mvd-krzywe" data-testid="mvd-krzywe-ekran">
      <header className="mvd-krzywe-naglowek">
        <h2 className="mvd-krzywe-tytul">{KRZYWE_STRINGS.tytul}</h2>
        <p className="mvd-krzywe-opis">{KRZYWE_STRINGS.opisWstep}</p>
      </header>

      {katalog.rodzaj === 'ladowanie' ? (
        <StanPanel
          komunikat={KRZYWE_STRINGS.ladowanieKatalogu}
          wariant="info"
          testid="mvd-krzywe-katalog-ladowanie"
        />
      ) : katalog.rodzaj === 'blad' ? (
        <StanPanel
          komunikat={KRZYWE_STRINGS.bladKatalogu}
          opis={katalog.komunikat}
          wariant="blad"
          testid="mvd-krzywe-katalog-blad"
        />
      ) : katalog.rodzaj === 'gotowe' ? (
        <>
          <section className="mvd-krzywe-dobor" data-testid="mvd-krzywe-dobor">
            <div className="mvd-krzywe-pole">
              <label htmlFor="mvd-krzywe-typ">{KRZYWE_STRINGS.wyborTyp}</label>
              <select
                id="mvd-krzywe-typ"
                value={wybranyTyp}
                onChange={(e) => zmienTyp(e.target.value)}
                data-testid="mvd-krzywe-typ"
              >
                <option value="">{KRZYWE_STRINGS.opcjaWybierz}</option>
                {katalog.dane.typy.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etykieta}
                  </option>
                ))}
              </select>
              <p className="mvd-krzywe-pole-opis">{KRZYWE_STRINGS.wyborTypPodpowiedz}</p>
            </div>

            <div className="mvd-krzywe-pole">
              <label htmlFor="mvd-krzywe-operator">{KRZYWE_STRINGS.wyborOperator}</label>
              <select
                id="mvd-krzywe-operator"
                value={wybranyOperator}
                onChange={(e) => zmienOperator(e.target.value)}
                data-testid="mvd-krzywe-operator"
              >
                <option value="">{KRZYWE_STRINGS.opcjaWybierz}</option>
                {katalog.dane.operatorzy.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etykieta}
                  </option>
                ))}
              </select>
              <p className="mvd-krzywe-pole-opis">{KRZYWE_STRINGS.wyborOperatorPodpowiedz}</p>
            </div>

            <button
              type="button"
              className="mvd-krzywe-oblicz"
              onClick={uruchom}
              disabled={!mozliwyBieg}
              data-testid="mvd-krzywe-oblicz"
            >
              {zapytanie === null
                ? KRZYWE_STRINGS.przyciskOblicz
                : KRZYWE_STRINGS.przyciskPrzelicz}
            </button>
          </section>

          {typBezKrzywej ? (
            <StanPanel
              komunikat={KRZYWE_STRINGS.typBezKrzywej}
              opis={KRZYWE_STRINGS.typBezKrzywejOpis}
              wariant="blad"
              testid="mvd-krzywe-typ-bez-krzywej"
            />
          ) : stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={KRZYWE_STRINGS.brakWyniku}
              opis={KRZYWE_STRINGS.brakWynikuOpis}
              wariant="info"
              testid="mvd-krzywe-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel
              komunikat={KRZYWE_STRINGS.ladowanie}
              wariant="info"
              testid="mvd-krzywe-ladowanie"
            />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={KRZYWE_STRINGS.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-krzywe-blad"
            />
          ) : (
            <>
              <WynikPokrycia dane={stan.dane} trybZaawansowania={trybZaawansowania} />
              {/* Akcja wyjściowa PO biegu — dopiero zweryfikowana krzywa ma
                  sens jako profil zgodności modułu. */}
              <SekcjaWiazanKrzywych />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
