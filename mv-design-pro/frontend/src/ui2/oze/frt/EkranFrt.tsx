/*
 * EkranFrt — okno „Walidacja modelu falownika" (trajektorie FRT/HVRT, karta U4 P38).
 * Dobór modułu DER z modelu (`useStationDerStore`/`selectAllDers` — wzorzec
 * `ui2/oze/pulpit`; `der_ref` = typ przekształtnika modułu), operatora OSD z katalogu
 * NC RfG (`GET /api/ncrfg-tests/catalog`) i rodzaju testu (LVRT/HVRT) → JAWNY bieg
 * `GET /api/oze-analysis/frt-trajectories` → prezentacja:
 *   1. rekord oceny z backendu („Ocena niewykonana": zdanie, braki, akcja naprawcza),
 *   2. wykres trajektorii U(t) na tle obwiedni WYMAGANEJ (informacja, opis z backendu),
 *   3. tabela scenariuszy (echo zapadu + etykieta oceny),
 *   4. zwinięta sekcja audytowa pól solvera pod nagłówkiem z backendu.
 *
 * UCZCIWOŚĆ (2026-09-23): trajektoria jest zadana profilem wejściowym, a kryterium
 * utrzymania wobec tego samego profilu jest tautologią — okno nie wystawia werdyktu ani
 * koloru ok/err. Zero fizyki, zero ocen lokalnych. Identyfikatory (typ przekształtnika,
 * operator, klucze scenariuszy) wyłącznie w „Informacjach audytowych" (tryb ekspercki,
 * zwinięte) — pierwszy plan niesie nazwy (karta #145).
 */

import { useEffect, useMemo, useState } from 'react';
import './frt.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { isModeAtLeast } from '../../shell/modeModel';
import { InformacjeAudytowe, SladWywodu, TabelaWynikow } from '../../wyniki/wzorzec';
import { OcenaNiewykonana, SekcjaAudytowa } from '../../wyniki/wzorzec/OcenaNiewykonana';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { notify } from '../../../ui/notifications/store';
import { useNcRfgStore } from '../ncRfgStore';
import { pobierzKatalogNcRfg } from '../ncrfg/api';
import {
  pobierzTrajektorieFrt,
  type RodzajTestuFrt,
  type WidokTrajektoriiFrt,
  type ZapytanieTrajektoriiFrt,
} from '../api';
import { WykresTrajektoriiChart } from './WykresTrajektoriiChart';
import { SekcjaSekwencjiZapadow } from './SekcjaSekwencjiZapadow';
import {
  informacjeAudytoweFrt,
  kolumnyAudytuFrt,
  kolumnyTabeliFrt,
  opcjeModulowFrt,
  opcjeOperatorowFrt,
  punktyObwiedniFrt,
  punktyTrajektoriiFrt,
  wierszeAudytuFrt,
  wierszeTabeliFrt,
  type OpcjaModuluFrt,
  type OpcjaOperatoraFrt,
} from './frtModel';
import {
  FRT_STRINGS,
  etykietaStatusuFrt,
  fmtPuFrt,
} from './strings';
import { PrzyciskAkcjiStanu, useAkcjaDodajZrodloOze } from '../../wyniki/wzorzec';
import type { AkcjaStanuZerowego } from '../../wyniki/wzorzec';

// ---------------------------------------------------------------------------
// Stan pobierania (jawny bieg: idle / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu<T> =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: T };

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
  /* K6 / H-5: slot akcji stanu zerowego — realny następny krok (bieg obliczeń,
     nawigacja, formularz operacji). Brak akcji = panel czysto informacyjny. */
  akcja?: AkcjaStanuZerowego;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-frt-stan mvd-frt-stan--blad' : 'mvd-frt-stan'}
      data-testid={testid}
    >
      <p className="mvd-frt-stan-title">{komunikat}</p>
      {opis && <p className="mvd-frt-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wynik: ocena + założenia + wykres + tabela + audyt + informacje audytowe
// ---------------------------------------------------------------------------

function WynikTrajektorii({
  dane,
  trybZaawansowania,
  onOtworzDowod,
}: {
  dane: WidokTrajektoriiFrt;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}) {
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  const obwiednia = useMemo(() => punktyObwiedniFrt(dane), [dane]);
  const kolumny = useMemo(() => kolumnyTabeliFrt(), []);
  const wiersze = useMemo(() => wierszeTabeliFrt(dane), [dane]);
  const kolumnyAudytu = useMemo(() => kolumnyAudytuFrt(), []);
  const wierszeAudytu = useMemo(() => wierszeAudytuFrt(dane), [dane]);
  const informacjeAudytowe = useMemo(() => informacjeAudytoweFrt(dane), [dane]);

  // Serie trajektorii — pierwszy scenariusz odpowiedzi (bieg per rodzaj testu).
  const pierwszy = dane.scenariusze[0];
  const trajektoria = useMemo(
    () => (pierwszy ? punktyTrajektoriiFrt(pierwszy) : []),
    [pierwszy],
  );

  const rodzajEtykieta =
    dane.test_kind === 'lvrt' ? FRT_STRINGS.rodzajLvrt : FRT_STRINGS.rodzajHvrt;

  return (
    <div data-testid="mvd-frt-wynik">
      {dane.ocena && <OcenaNiewykonana ocena={dane.ocena} testid="mvd-frt-ocena" />}

      <dl className="mvd-frt-zalozenia" data-testid="mvd-frt-zalozenia">
        <div className="mvd-frt-zal-para">
          <dt>{FRT_STRINGS.zalozeniaModul}</dt>
          <dd>{dane.modul_der.nazwa}</dd>
        </div>
        <div className="mvd-frt-zal-para">
          <dt>{FRT_STRINGS.zalozeniaOperator}</dt>
          <dd>{dane.operator.nazwa}</dd>
        </div>
        <div className="mvd-frt-zal-para">
          <dt>{FRT_STRINGS.zalozeniaRodzaj}</dt>
          <dd>{rodzajEtykieta}</dd>
        </div>
        <div className="mvd-frt-zal-para">
          <dt>{FRT_STRINGS.zalozeniaPmax}</dt>
          <dd className="mvd-num">
            {fmtPuFrt(dane.modul_der.pmax_mw)} MW
          </dd>
        </div>
        <div className="mvd-frt-zal-para">
          <dt>{FRT_STRINGS.zalozeniaUn}</dt>
          <dd className="mvd-num">{fmtPuFrt(dane.modul_der.un_kv)} kV</dd>
        </div>
        {dane.ocena_dowodowa && (
          <div className="mvd-frt-zal-para" data-testid="mvd-frt-ocena-dowodowa">
            <dt>{FRT_STRINGS.zalozeniaPodstawa}</dt>
            <dd>{dane.ocena_dowodowa.tier_pl ?? dane.ocena_dowodowa.tier}</dd>
          </div>
        )}
      </dl>

      <div className="mvd-frt-wykres-blok">
        <WykresTrajektoriiChart trajektoria={trajektoria} obwiednia={obwiednia} />
        {dane.obwiednia_profilu && (
          <p className="mvd-frt-pole-opis" data-testid="mvd-frt-obwiednia-opis">
            {dane.obwiednia_profilu.opis}
          </p>
        )}
      </div>

      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={onOtworzDowod}
        trybZaawansowania={trybZaawansowania}
      />

      {dane.sekcja_audytowa_pl && (
        <SekcjaAudytowa naglowek={dane.sekcja_audytowa_pl} testid="mvd-frt-audyt">
          <dl className="mvd-frt-zalozenia">
            <div className="mvd-frt-zal-para">
              <dt>{FRT_STRINGS.audytStatusSolvera}</dt>
              <dd>{etykietaStatusuFrt(dane.status_solvera)}</dd>
            </div>
          </dl>
          <TabelaWynikow
            kolumny={kolumnyAudytu}
            wiersze={wierszeAudytu}
            onOtworzDowod={onOtworzDowod}
            trybZaawansowania={trybZaawansowania}
          />
        </SekcjaAudytowa>
      )}

      {/* Ślad obliczeń na żądanie per scenariusz — wywód {tekst, latex} z backendu
          (zasada KaTeX 2026-07-22); pusta lista = uczciwy brak przycisku. */}
      {dane.scenariusze.map((scenariusz, indeks) => (
        <SladWywodu
          key={scenariusz.scenario_id}
          kroki={scenariusz.wywod ?? []}
          testIdPrefix={`mvd-frt-slad-${indeks}`}
        />
      ))}

      <InformacjeAudytowe
        wiersze={informacjeAudytowe}
        trybEkspercki={trybEkspercki}
        testid="mvd-frt-informacje-audytowe"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Walidacja modelu falownika"
// ---------------------------------------------------------------------------

export interface EkranFrtProps {
  trybZaawansowania: AdvancementMode;
  /** 2× klik na wartości z dowodem → zakładka „Dowód obliczeń" (wzorzec wspólny,
   * `ui2/wyniki/wzorzec`). Realny dostawca z rodzica (`WynikiWarsztat`), nie
   * zaślepka — wpięty też do zagnieżdżonej `SekcjaSekwencjiZapadow`. */
  onOtworzDowod: (ref: string) => void;
}

export function EkranFrt({ trybZaawansowania, onOtworzDowod }: EkranFrtProps) {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const moduly = useMemo<OpcjaModuluFrt[]>(() => opcjeModulowFrt(ders), [ders]);
  // K6 / H-5: stan zerowy strumienia OZE prowadzi do dodania modulu wytworczego.
  const akcjaZrodlo = useAkcjaDodajZrodloOze();

  const [operatorzy, setOperatorzy] = useState<StanZasobu<OpcjaOperatoraFrt[]>>({
    rodzaj: 'idle',
  });
  const [wybranyModul, setWybranyModul] = useState('');
  const [wybranyOperator, setWybranyOperator] = useState('');
  const [rodzajTestu, setRodzajTestu] = useState<RodzajTestuFrt>('lvrt');

  const [zapytanie, setZapytanie] = useState<ZapytanieTrajektoriiFrt | null>(null);
  const [stan, setStan] = useState<StanZasobu<WidokTrajektoriiFrt>>({ rodzaj: 'idle' });

  // Wczytanie katalogu operatorów (raz, przy montażu).
  useEffect(() => {
    let anulowane = false;
    setOperatorzy({ rodzaj: 'ladowanie' });
    pobierzKatalogNcRfg()
      .then((katalog) => {
        if (anulowane) return;
        setOperatorzy({ rodzaj: 'gotowe', dane: opcjeOperatorowFrt(katalog.operators) });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setOperatorzy({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Jawny bieg trajektorii.
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzTrajektorieFrt(zapytanie)
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

  const opcjaWybranegoModulu = useMemo(
    () => moduly.find((m) => m.derId === wybranyModul) ?? null,
    [moduly, wybranyModul],
  );

  // Zmiana doboru unieważnia poprzedni wynik (stale-result guard).
  const unewaznij = () => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };
  const zmienModul = (id: string) => {
    setWybranyModul(id);
    unewaznij();
  };
  const zmienOperator = (id: string) => {
    setWybranyOperator(id);
    unewaznij();
  };
  const zmienRodzaj = (rodzaj: RodzajTestuFrt) => {
    setRodzajTestu(rodzaj);
    unewaznij();
  };

  const modulBezTypu =
    opcjaWybranegoModulu !== null && opcjaWybranegoModulu.derRef === null;
  const derRef = opcjaWybranegoModulu?.derRef ?? null;
  const mozliwyBieg = derRef !== null && wybranyOperator !== '';

  const uruchom = () => {
    if (!mozliwyBieg || derRef === null) return;
    setZapytanie({ derRef, operatorId: wybranyOperator, testKind: rodzajTestu });
  };

  return (
    <div className="mvd-frt" data-testid="mvd-frt-ekran">
      <header className="mvd-frt-naglowek">
        <h2 className="mvd-frt-tytul">{FRT_STRINGS.tytul}</h2>
        <p className="mvd-frt-opis">{FRT_STRINGS.opisWstep}</p>
      </header>

      {moduly.length === 0 ? (
        <StanPanel
          komunikat={FRT_STRINGS.brakModulow}
          opis={FRT_STRINGS.brakModulowOpis}
          wariant="info"
          testid="mvd-frt-brak-modulow"
          akcja={akcjaZrodlo}
        />
      ) : operatorzy.rodzaj === 'ladowanie' ? (
        <StanPanel
          komunikat={FRT_STRINGS.ladowanieKatalogu}
          wariant="info"
          testid="mvd-frt-katalog-ladowanie"
        />
      ) : operatorzy.rodzaj === 'blad' ? (
        <StanPanel
          komunikat={FRT_STRINGS.bladKatalogu}
          opis={operatorzy.komunikat}
          wariant="blad"
          testid="mvd-frt-katalog-blad"
        />
      ) : operatorzy.rodzaj === 'gotowe' ? (
        <>
          <section className="mvd-frt-dobor" data-testid="mvd-frt-dobor">
            <div className="mvd-frt-pole">
              <label htmlFor="mvd-frt-modul">{FRT_STRINGS.wyborModul}</label>
              <select
                id="mvd-frt-modul"
                value={wybranyModul}
                onChange={(e) => zmienModul(e.target.value)}
                data-testid="mvd-frt-modul"
              >
                <option value="">{FRT_STRINGS.opcjaWybierz}</option>
                {moduly.map((m) => (
                  <option key={m.derId} value={m.derId}>
                    {m.etykieta}
                  </option>
                ))}
              </select>
              <p className="mvd-frt-pole-opis">{FRT_STRINGS.wyborModulPodpowiedz}</p>
            </div>

            <div className="mvd-frt-pole">
              <label htmlFor="mvd-frt-operator">{FRT_STRINGS.wyborOperator}</label>
              <select
                id="mvd-frt-operator"
                value={wybranyOperator}
                onChange={(e) => zmienOperator(e.target.value)}
                data-testid="mvd-frt-operator"
              >
                <option value="">{FRT_STRINGS.opcjaWybierz}</option>
                {operatorzy.dane.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etykieta}
                  </option>
                ))}
              </select>
              <p className="mvd-frt-pole-opis">{FRT_STRINGS.wyborOperatorPodpowiedz}</p>
            </div>

            <div className="mvd-frt-pole">
              <label htmlFor="mvd-frt-rodzaj">{FRT_STRINGS.wyborRodzaj}</label>
              <select
                id="mvd-frt-rodzaj"
                value={rodzajTestu}
                onChange={(e) => zmienRodzaj(e.target.value as RodzajTestuFrt)}
                data-testid="mvd-frt-rodzaj"
              >
                <option value="lvrt">{FRT_STRINGS.rodzajLvrt}</option>
                <option value="hvrt">{FRT_STRINGS.rodzajHvrt}</option>
              </select>
              <p className="mvd-frt-pole-opis">{FRT_STRINGS.wyborRodzajPodpowiedz}</p>
            </div>

            <button
              type="button"
              className="mvd-frt-oblicz"
              onClick={uruchom}
              disabled={!mozliwyBieg}
              data-testid="mvd-frt-oblicz"
            >
              {zapytanie === null ? FRT_STRINGS.przyciskOblicz : FRT_STRINGS.przyciskPrzelicz}
            </button>
          </section>

          {modulBezTypu ? (
            <StanPanel
              komunikat={FRT_STRINGS.modulBezTypuTytul}
              opis={FRT_STRINGS.modulBezTypuOpis}
              wariant="blad"
              testid="mvd-frt-modul-bez-typu"
            />
          ) : stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={FRT_STRINGS.brakWyniku}
              opis={FRT_STRINGS.brakWynikuOpis}
              wariant="info"
              testid="mvd-frt-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel
              komunikat={FRT_STRINGS.ladowanie}
              wariant="info"
              testid="mvd-frt-ladowanie"
            />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={FRT_STRINGS.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-frt-blad"
            />
          ) : stan.dane.status_solvera === 'blocked' ? (
            // Karta S-4: brak modelu dynamicznego solvera FROZEN mapowany NA
            // GRANICY na `blocked` — panel dedykowany (uczciwy stan zerowy),
            // zamiast próby narysowania wykresu/tabeli z pustych danych.
            <StanPanel
              komunikat={FRT_STRINGS.brakModeluTytul}
              opis={
                stan.dane.missing_fields_pl && stan.dane.missing_fields_pl.length > 0
                  ? stan.dane.missing_fields_pl.join(' ')
                  : FRT_STRINGS.brakModeluOpis
              }
              wariant="blad"
              testid="mvd-frt-brak-modelu"
            />
          ) : (
            <>
              <WynikTrajektorii
                dane={stan.dane}
                trybZaawansowania={trybZaawansowania}
                onOtworzDowod={onOtworzDowod}
              />
              {/* K5-B (H-3 pkt 4): pętla ocena → zgodność. Klucz = id modułu
                  DER (`wybranyModul`) — ta sama tożsamość co kolumny macierzy
                  NC RfG (`zbudujModuly` → der.id). Zapisywany jest STAN OCENY z
                  rekordu backendu (etykieta + semantyka), nie werdykt z UI. */}
              {stan.dane.ocena && (
                <button
                  type="button"
                  className="mvd-frt-oblicz"
                  title={FRT_STRINGS.zapiszWynikOpis}
                  onClick={() => {
                    const ocena = stan.dane.ocena;
                    if (!ocena) return;
                    useNcRfgStore.getState().zapiszWynikFrt(wybranyModul, {
                      testKind: stan.dane.test_kind,
                      tekst: ocena.etykieta.etykieta_pl,
                      istotnosc: ocena.etykieta.semantyka,
                      operatorId: stan.dane.operator.id,
                    });
                    notify(FRT_STRINGS.zapiszWynikZapisano, 'success');
                  }}
                  data-testid="mvd-frt-zapisz-wynik"
                >
                  {FRT_STRINGS.zapiszWynik}
                </button>
              )}
            </>
          )}

          <SekcjaSekwencjiZapadow
            derRef={derRef}
            operatorId={wybranyOperator}
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={onOtworzDowod}
          />
        </>
      ) : null}
    </div>
  );
}
