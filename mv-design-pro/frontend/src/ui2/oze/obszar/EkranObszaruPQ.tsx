/*
 * EkranObszaruPQ — okno „Obszar bezpiecznej pracy P–Q" (karta P30 / strumień OZE).
 * Wybór węzła (ze snapshotu — wzorzec `zdolnosc/EkranZdolnosci`) + przebiegu
 * rozpływu (LOAD_FLOW/DONE — `wybierzPrzebiegRozplywu`) + parametrów siatki →
 * JAWNY bieg `GET /api/oze-analysis/pq-area` → prezentacja:
 *   1. wykres obszaru (dopuszczalne pasmo Q(P) + opcjonalna nakładka krzywej
 *      producenta wybranego typu falownika z katalogu konwerterów),
 *   2. tabela wierzchołków na wzorcu `TabelaWynikow` (Q dop. min/max, granice PL,
 *      tag przy braku pasma),
 *   3. założenia (parametry siatki + liczba biegów; hash tylko ekspercko) +
 *      rozwijany ślad zredukowany (reużyty `SladAnalizy` z pulpitu, adapter jak P41).
 *
 * Zero fizyki, zero ocen lokalnych — pasma pracy, kryteria i liczby biegów
 * pochodzą WYŁĄCZNIE z backendu. Nakładka producenta to DANE KATALOGOWE (pq_curve),
 * nie fizyka. Identyfikatory (bus_ref, input_hash) wyłącznie w trybie eksperckim.
 */

import { useEffect, useMemo, useState } from 'react';
import './obszar.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore, selectBusOptions } from '../../../ui/topology/snapshotStore';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import { SladAnalizy } from '../pulpit';
import { opcjeTypowPQ, type OpcjaTypuPQ } from '../krzywe/krzyweModel';
import {
  pobierzKonwertery,
  pobierzObszarPQ,
  type RekordKonwertera,
  type WidokObszaruPQ,
  type ZapytanieObszaruPQ,
} from '../api';
import { wybierzPrzebiegRozplywu } from '../zdolnosc/zdolnoscModel';
import { WykresObszaruChart } from './WykresObszaruChart';
import {
  kolumnyTabeliObszaru,
  krokiSladuObszar,
  punktyObszaru,
  wierszeTabeliObszaru,
} from './obszarModel';
import { OBSZAR_STRINGS, fmtMWObszar, fmtMvarObszar } from './strings';

const DOMYSLNY_STEP_P_MW = 0.5;
const DOMYSLNY_STEP_Q_MVAR = 0.25;
const DOMYSLNY_MAX_STEPS_P = 20;
const DOMYSLNY_MAX_STEPS_Q = 16;

// ---------------------------------------------------------------------------
// Stan pobierania (jawny bieg: idle / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokObszaruPQ };

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
      className={wariant === 'blad' ? 'mvd-obszar-stan mvd-obszar-stan--blad' : 'mvd-obszar-stan'}
      data-testid={testid}
    >
      <p className="mvd-obszar-stan-title">{komunikat}</p>
      {opis && <p className="mvd-obszar-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wynik: wykres + tabela + założenia + rozwijany ślad
// ---------------------------------------------------------------------------

function WynikObszaru({
  dane,
  trybZaawansowania,
  krzywaProducenta,
}: {
  dane: WidokObszaruPQ;
  trybZaawansowania: AdvancementMode;
  krzywaProducenta?: readonly (readonly [number, number, number])[];
}) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const [sladWidoczny, setSladWidoczny] = useState(false);

  const punkty = useMemo(() => punktyObszaru(dane.vertices, krzywaProducenta), [dane, krzywaProducenta]);
  const kolumny = useMemo(() => kolumnyTabeliObszaru(), []);
  const wiersze = useMemo(() => wierszeTabeliObszaru(dane), [dane]);
  const kroki = useMemo(() => krokiSladuObszar(dane), [dane]);
  const zNakladka = (krzywaProducenta?.length ?? 0) > 0;

  if (dane.vertices.length === 0) {
    return (
      <StanPanel
        komunikat={OBSZAR_STRINGS.brakWierzcholkow}
        wariant="info"
        testid="mvd-obszar-brak-wierzcholkow"
      />
    );
  }

  return (
    <div data-testid="mvd-obszar-wynik">
      <dl className="mvd-obszar-zalozenia" data-testid="mvd-obszar-zalozenia">
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalWezel}</dt>
          <dd>{dane.bus_name ?? dane.bus_ref}</dd>
        </div>
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalGeneracja}</dt>
          <dd className="mvd-num">
            {fmtMWObszar(dane.existing_generation.p_mw)} {OBSZAR_STRINGS.jednMW}
            {' / '}
            {fmtMvarObszar(dane.existing_generation.q_mvar)} {OBSZAR_STRINGS.jednMvar}
          </dd>
        </div>
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalStepP}</dt>
          <dd className="mvd-num">
            {fmtMWObszar(dane.parameters.step_p_mw)} {OBSZAR_STRINGS.jednMW}
          </dd>
        </div>
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalStepQ}</dt>
          <dd className="mvd-num">
            {fmtMvarObszar(dane.parameters.step_q_mvar)} {OBSZAR_STRINGS.jednMvar}
          </dd>
        </div>
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalMaxP}</dt>
          <dd className="mvd-num">{dane.parameters.max_steps_p}</dd>
        </div>
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalMaxQ}</dt>
          <dd className="mvd-num">{dane.parameters.max_steps_q}</dd>
        </div>
        <div className="mvd-obszar-zal-para">
          <dt>{OBSZAR_STRINGS.zalBiegi}</dt>
          <dd className="mvd-num" data-testid="mvd-obszar-biegi">
            {dane.total_runs} / {dane.parameters.max_total_runs}
          </dd>
        </div>
        {trybEkspercki && (
          <>
            <div className="mvd-obszar-zal-para">
              <dt>{OBSZAR_STRINGS.zalPrzebieg}</dt>
              <dd className="mvd-num">{dane.context.trace_id}</dd>
            </div>
            <div className="mvd-obszar-zal-para" data-testid="mvd-obszar-eksp-hash">
              <dt>{OBSZAR_STRINGS.zalIdentyfikatorSkrot}</dt>
              <dd className="mvd-num">{dane.input_hash}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="mvd-obszar-wykres-blok">
        <WykresObszaruChart punkty={punkty} zNakladkaProducenta={zNakladka} />
      </div>

      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
      />

      <div className="mvd-obszar-slad-blok">
        <button
          type="button"
          className="mvd-obszar-slad-btn"
          aria-expanded={sladWidoczny}
          onClick={() => setSladWidoczny((s) => !s)}
          data-testid="mvd-obszar-slad-otworz"
        >
          {sladWidoczny ? OBSZAR_STRINGS.sladUkryj : OBSZAR_STRINGS.sladPokaz}
        </button>
        {sladWidoczny && (
          <div className="mvd-oze" data-testid="mvd-obszar-slad">
            <span className="mvd-obszar-slad-tytul">{OBSZAR_STRINGS.sladTytul}</span>
            <SladAnalizy kroki={kroki} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Obszar bezpiecznej pracy P–Q"
// ---------------------------------------------------------------------------

export interface EkranObszaruPQProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranObszaruPQ({ trybZaawansowania }: EkranObszaruPQProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = useMemo(() => wybierzPrzebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const opcjeWezlow = useMemo(() => selectBusOptions(snapshot), [snapshot]);

  const [wybranyWezel, setWybranyWezel] = useState('');
  const [stepP, setStepP] = useState(DOMYSLNY_STEP_P_MW);
  const [stepQ, setStepQ] = useState(DOMYSLNY_STEP_Q_MVAR);
  const [maxP, setMaxP] = useState(DOMYSLNY_MAX_STEPS_P);
  const [maxQ, setMaxQ] = useState(DOMYSLNY_MAX_STEPS_Q);

  // Katalog typów falowników — do opcjonalnej nakładki krzywej producenta.
  const [rekordy, setRekordy] = useState<RekordKonwertera[]>([]);
  const [wybranyTyp, setWybranyTyp] = useState('');

  const [zapytanie, setZapytanie] = useState<ZapytanieObszaruPQ | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

  const opcjeTypow = useMemo<OpcjaTypuPQ[]>(() => opcjeTypowPQ(rekordy), [rekordy]);
  const krzywaProducenta = useMemo(() => {
    const rekord = rekordy.find((r) => r.id === wybranyTyp);
    return rekord?.pq_curve;
  }, [rekordy, wybranyTyp]);

  // Wczytanie katalogu konwerterów (raz, przy montażu); błąd → brak nakładki.
  useEffect(() => {
    let anulowane = false;
    pobierzKonwertery()
      .then((dane) => {
        if (!anulowane) setRekordy(dane);
      })
      .catch(() => {
        if (!anulowane) setRekordy([]);
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Zmiana przebiegu unieważnia poprzedni wynik (stale-result guard).
  useEffect(() => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  }, [runId]);

  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzObszarPQ(zapytanie)
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

  const mozliwyBieg = runId !== null && wybranyWezel !== '';

  const uruchom = () => {
    if (runId === null || wybranyWezel === '') return;
    setZapytanie({
      runId,
      busRef: wybranyWezel,
      stepPMw: stepP,
      stepQMvar: stepQ,
      maxStepsP: maxP,
      maxStepsQ: maxQ,
    });
  };

  return (
    <div className="mvd-obszar" data-testid="mvd-obszar-ekran">
      <header className="mvd-obszar-naglowek">
        <h2 className="mvd-obszar-tytul">{OBSZAR_STRINGS.tytul}</h2>
        <p className="mvd-obszar-opis">{OBSZAR_STRINGS.opisWstep}</p>
      </header>

      {runId === null ? (
        <StanPanel
          komunikat={OBSZAR_STRINGS.brakPrzebiegu}
          opis={OBSZAR_STRINGS.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-obszar-brak-przebiegu"
        />
      ) : (
        <>
          <section className="mvd-obszar-parametry" data-testid="mvd-obszar-parametry">
            <div className="mvd-obszar-param">
              <label htmlFor="mvd-obszar-wezel">{OBSZAR_STRINGS.paramWezel}</label>
              <select
                id="mvd-obszar-wezel"
                value={wybranyWezel}
                onChange={(e) => setWybranyWezel(e.target.value)}
                data-testid="mvd-obszar-wezel"
              >
                <option value="">{OBSZAR_STRINGS.paramWezelWybierz}</option>
                {opcjeWezlow.map((o) => (
                  <option key={o.ref_id} value={o.ref_id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <p className="mvd-obszar-param-opis">{OBSZAR_STRINGS.paramWezelOpis}</p>
            </div>

            <div className="mvd-obszar-param">
              <label htmlFor="mvd-obszar-step-p">{OBSZAR_STRINGS.paramStepP}</label>
              <div className="mvd-obszar-param-pole">
                <input
                  id="mvd-obszar-step-p"
                  type="number"
                  min={0}
                  step={0.1}
                  value={stepP}
                  onChange={(e) => setStepP(Number(e.target.value))}
                  data-testid="mvd-obszar-step-p"
                />
                <span className="mvd-obszar-param-jedn">{OBSZAR_STRINGS.jednMW}</span>
              </div>
              <p className="mvd-obszar-param-opis">{OBSZAR_STRINGS.paramStepPOpis}</p>
            </div>

            <div className="mvd-obszar-param">
              <label htmlFor="mvd-obszar-step-q">{OBSZAR_STRINGS.paramStepQ}</label>
              <div className="mvd-obszar-param-pole">
                <input
                  id="mvd-obszar-step-q"
                  type="number"
                  min={0}
                  step={0.05}
                  value={stepQ}
                  onChange={(e) => setStepQ(Number(e.target.value))}
                  data-testid="mvd-obszar-step-q"
                />
                <span className="mvd-obszar-param-jedn">{OBSZAR_STRINGS.jednMvar}</span>
              </div>
              <p className="mvd-obszar-param-opis">{OBSZAR_STRINGS.paramStepQOpis}</p>
            </div>

            <div className="mvd-obszar-param">
              <label htmlFor="mvd-obszar-max-p">{OBSZAR_STRINGS.paramMaxP}</label>
              <div className="mvd-obszar-param-pole">
                <input
                  id="mvd-obszar-max-p"
                  type="number"
                  min={1}
                  step={1}
                  value={maxP}
                  onChange={(e) => setMaxP(Number(e.target.value))}
                  data-testid="mvd-obszar-max-p"
                />
              </div>
              <p className="mvd-obszar-param-opis">{OBSZAR_STRINGS.paramMaxPOpis}</p>
            </div>

            <div className="mvd-obszar-param">
              <label htmlFor="mvd-obszar-max-q">{OBSZAR_STRINGS.paramMaxQ}</label>
              <div className="mvd-obszar-param-pole">
                <input
                  id="mvd-obszar-max-q"
                  type="number"
                  min={1}
                  step={1}
                  value={maxQ}
                  onChange={(e) => setMaxQ(Number(e.target.value))}
                  data-testid="mvd-obszar-max-q"
                />
              </div>
              <p className="mvd-obszar-param-opis">{OBSZAR_STRINGS.paramMaxQOpis}</p>
            </div>

            <div className="mvd-obszar-param">
              <label htmlFor="mvd-obszar-typ">{OBSZAR_STRINGS.paramNakladka}</label>
              <select
                id="mvd-obszar-typ"
                value={wybranyTyp}
                onChange={(e) => setWybranyTyp(e.target.value)}
                data-testid="mvd-obszar-typ"
              >
                <option value="">{OBSZAR_STRINGS.paramNakladkaBrak}</option>
                {opcjeTypow.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etykieta}
                  </option>
                ))}
              </select>
              <p className="mvd-obszar-param-opis">{OBSZAR_STRINGS.paramNakladkaOpis}</p>
            </div>

            <button
              type="button"
              className="mvd-obszar-oblicz"
              onClick={uruchom}
              disabled={!mozliwyBieg}
              data-testid="mvd-obszar-oblicz"
            >
              {zapytanie === null
                ? OBSZAR_STRINGS.przyciskOblicz
                : OBSZAR_STRINGS.przyciskPrzelicz}
            </button>
          </section>

          {stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={OBSZAR_STRINGS.brakWezla}
              opis={OBSZAR_STRINGS.brakWezlaOpis}
              wariant="info"
              testid="mvd-obszar-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel
              komunikat={OBSZAR_STRINGS.ladowanie}
              wariant="info"
              testid="mvd-obszar-ladowanie"
            />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={OBSZAR_STRINGS.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-obszar-blad"
            />
          ) : (
            <WynikObszaru
              dane={stan.dane}
              trybZaawansowania={trybZaawansowania}
              krzywaProducenta={krzywaProducenta}
            />
          )}
        </>
      )}
    </div>
  );
}
