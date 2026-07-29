/*
 * EkranFrt — okno „Walidacja modelu falownika" (trajektorie FRT/HVRT, karta U4 P38).
 * Dobór modułu DER z modelu (`useStationDerStore`/`selectAllDers` — wzorzec
 * `ui2/oze/pulpit`; `der_ref` = typ przekształtnika modułu), operatora OSD z katalogu
 * NC RfG (`GET /api/ncrfg-tests/catalog`) i rodzaju testu (LVRT/HVRT) → JAWNY bieg
 * `GET /api/oze-analysis/frt-trajectories` → prezentacja:
 *   1. wykres trajektorii U(t) na tle obwiedni profilu (+ serie P(t)/Iq(t)),
 *   2. tabela scenariuszy na wzorcu `TabelaWynikow` (tagi + marginesy),
 *   3. werdykt całości PL (prezentacyjna agregacja najgorszego werdyktu scenariusza).
 *
 * Zero fizyki, zero ocen lokalnych — trajektorie, marginesy i werdykty pochodzą
 * WYŁĄCZNIE z backendu. Identyfikatory (der_ref, operator_id, scenario_id) wyłącznie
 * w trybie eksperckim; nazwy PL modułów/operatorów na pierwszym planie.
 */

import { useEffect, useMemo, useState } from 'react';
import './frt.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { isModeAtLeast } from '../../shell/modeModel';
import { SladWywodu, TabelaWynikow } from '../../wyniki/wzorzec';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import {
  pobierzKatalogKlasNcRfg,
  pobierzTrajektorieFrt,
  type RodzajTestuFrt,
  type WidokTrajektoriiFrt,
  type ZapytanieTrajektoriiFrt,
} from '../api';
import { WykresTrajektoriiChart } from './WykresTrajektoriiChart';
import { SekcjaSekwencjiZapadow } from './SekcjaSekwencjiZapadow';
import {
  kolumnyTabeliFrt,
  opcjeModulowFrt,
  opcjeOperatorowFrt,
  punktyObwiedniFrt,
  punktyTrajektoriiFrt,
  werdyktCalosciFrt,
  wierszeTabeliFrt,
  type OpcjaModuluFrt,
  type OpcjaOperatoraFrt,
} from './frtModel';
import {
  FRT_STRINGS,
  etykietaStatusuFrt,
  fmtPuFrt,
} from './strings';

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
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-frt-stan mvd-frt-stan--blad' : 'mvd-frt-stan'}
      data-testid={testid}
    >
      <p className="mvd-frt-stan-title">{komunikat}</p>
      {opis && <p className="mvd-frt-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wynik: werdykt + założenia + wykres + tabela + identyfikatory eksperckie
// ---------------------------------------------------------------------------

function WynikTrajektorii({
  dane,
  trybZaawansowania,
}: {
  dane: WidokTrajektoriiFrt;
  trybZaawansowania: AdvancementMode;
}) {
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  const werdykt = useMemo(() => werdyktCalosciFrt(dane), [dane]);
  const obwiednia = useMemo(() => punktyObwiedniFrt(dane), [dane]);
  const kolumny = useMemo(() => kolumnyTabeliFrt(), []);
  const wiersze = useMemo(() => wierszeTabeliFrt(dane), [dane]);

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
      <div
        className={`mvd-frt-werdykt mvd-frt-werdykt--${werdykt.istotnosc}`}
        data-testid="mvd-frt-werdykt"
      >
        <span className="mvd-frt-werdykt-tytul">{werdykt.tekst}</span>
        <span className="mvd-frt-werdykt-opis">{FRT_STRINGS.werdyktOpisAgregacja}</span>
      </div>

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
        <div className="mvd-frt-zal-para">
          <dt>{FRT_STRINGS.zalozeniaStatusSolvera}</dt>
          <dd>{etykietaStatusuFrt(dane.status_solvera)}</dd>
        </div>
      </dl>

      <div className="mvd-frt-wykres-blok">
        <WykresTrajektoriiChart trajektoria={trajektoria} obwiednia={obwiednia} />
      </div>

      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
      />

      {/* Ślad obliczeń na żądanie per scenariusz — wywód {tekst, latex} z backendu
          (zasada KaTeX 2026-07-22); pusta lista = uczciwy brak przycisku. */}
      {dane.scenariusze.map((scenariusz, indeks) => (
        <SladWywodu
          key={scenariusz.scenario_id}
          kroki={scenariusz.wywod ?? []}
          testIdPrefix={`mvd-frt-slad-${indeks}`}
        />
      ))}

      {trybEkspercki && (
        <dl className="mvd-frt-eksp" data-testid="mvd-frt-eksp">
          <div className="mvd-frt-eksp-para">
            <dt>{FRT_STRINGS.ekspModulId}</dt>
            <dd className="mvd-num">{dane.modul_der.id}</dd>
          </div>
          <div className="mvd-frt-eksp-para">
            <dt>{FRT_STRINGS.ekspOperatorId}</dt>
            <dd className="mvd-num">{dane.operator.id}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Walidacja modelu falownika"
// ---------------------------------------------------------------------------

export interface EkranFrtProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranFrt({ trybZaawansowania }: EkranFrtProps) {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const moduly = useMemo<OpcjaModuluFrt[]>(() => opcjeModulowFrt(ders), [ders]);

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
    pobierzKatalogKlasNcRfg()
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
          ) : (
            <WynikTrajektorii dane={stan.dane} trybZaawansowania={trybZaawansowania} />
          )}

          <SekcjaSekwencjiZapadow
            derRef={derRef}
            operatorId={wybranyOperator}
            trybZaawansowania={trybZaawansowania}
          />
        </>
      ) : null}
    </div>
  );
}
