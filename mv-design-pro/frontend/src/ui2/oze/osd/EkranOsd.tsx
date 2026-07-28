/*
 * EkranOsd — okno „Odpowiedź na polecenia OSD" (karta U4 P40 / strumień OZE).
 * Dobór źródła (generator ze snapshotu — recon D7: `source_ref` = `generators[].ref_id`)
 * + rodzaju polecenia (ograniczenie P / zadana Q / zadany cosφ / odpowiedź
 * częstotliwościowa LFSM-O/U) + parametrów polecenia (formularz z hintami PL
 * i wartościami wstępnymi) → JAWNY bieg `GET /api/oze-analysis/osd-response` →
 * prezentacja:
 *   1. karty porównania przed/po (P/Q źródła + straty sieci) z deltami,
 *   2. tabela napięć węzłów na wzorcu `TabelaWynikow` (U przed/po, ΔU) — BEZ tagów
 *      (odpowiedź nie niesie flagi naruszenia pasma; zero oceny lokalnej),
 *   3. rozwijany ślad WHITE BOX (reużyty `SladAnalizy`, adapter jak P30/P41);
 *      identyfikatory (źródło, przebieg, hash) wyłącznie w trybie eksperckim.
 *
 * Zero fizyki, zero ocen lokalnych — nastawy, napięcia i straty pochodzą WYŁĄCZNIE
 * z backendu. Delty nastawu źródła to arytmetyka prezentacji (po − przed).
 */

import { useEffect, useMemo, useState } from 'react';
import './osd.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { TabelaWynikow } from '../../wyniki/wzorzec';
// Zasada wywodów KaTeX: wzory w opisach parametrów renderuje TekstZWzorami (MathInline).
import { TekstZWzorami } from '../../kreatory/rama';
import { SladAnalizy } from '../pulpit';
import {
  pobierzOdpowiedzOsd,
  type CharakterMocyBiernej,
  type RodzajPoleceniaOsd,
  type WidokOdpowiedziOsd,
  type ZapytanieOdpowiedziOsd,
} from '../api';
import { wybierzPrzebiegRozplywu } from '../zdolnosc/zdolnoscModel';
import {
  kartyPorownaniaOsd,
  kolumnyTabeliOsd,
  krokiSladuOsd,
  opcjeZrodel,
  poleParametrowOsd,
  wierszeTabeliOsd,
  type OpcjaZrodlaOsd,
} from './osdModel';
import { OSD_STRINGS, etykietaPoleceniaOsd } from './strings';

const DOMYSLNY_LIMIT_P_PCT = 60;
const DOMYSLNA_Q_MVAR = 0;
const DOMYSLNY_COSFI = 0.95;
const DOMYSLNY_CHARAKTER: CharakterMocyBiernej = 'podwzbudny';
const DOMYSLNA_CZESTOTLIWOSC_HZ = 50.2;
const DOMYSLNY_DROOP_PCT = 5;
const DOMYSLNA_STREFA_MARTWA_HZ = 0.2;

const POLECENIA: readonly RodzajPoleceniaOsd[] = [
  'ograniczenie_p',
  'moc_bierna',
  'cosfi',
  'lfsm_o',
  'lfsm_u',
];

// ---------------------------------------------------------------------------
// Stan pobierania (jawny bieg: idle / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokOdpowiedziOsd };

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
      className={wariant === 'blad' ? 'mvd-osd-stan mvd-osd-stan--blad' : 'mvd-osd-stan'}
      data-testid={testid}
    >
      <p className="mvd-osd-stan-title">{komunikat}</p>
      {opis && <p className="mvd-osd-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wynik: karty porównania + tabela napięć + rozwijany ślad + identyfikatory
// ---------------------------------------------------------------------------

function WynikOsd({
  dane,
  trybZaawansowania,
}: {
  dane: WidokOdpowiedziOsd;
  trybZaawansowania: AdvancementMode;
}) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const [sladWidoczny, setSladWidoczny] = useState(false);

  const karty = useMemo(() => kartyPorownaniaOsd(dane), [dane]);
  const kolumny = useMemo(() => kolumnyTabeliOsd(), []);
  const wiersze = useMemo(() => wierszeTabeliOsd(dane), [dane]);
  const kroki = useMemo(() => krokiSladuOsd(dane), [dane]);

  return (
    <div data-testid="mvd-osd-wynik">
      <dl className="mvd-osd-zalozenia" data-testid="mvd-osd-zalozenia">
        <div className="mvd-osd-zal-para">
          <dt>{OSD_STRINGS.zalZrodlo}</dt>
          <dd>{dane.source.name ?? dane.source.ref_id}</dd>
        </div>
        <div className="mvd-osd-zal-para">
          <dt>{OSD_STRINGS.zalWezelZrodla}</dt>
          <dd>{dane.source.bus_name ?? dane.source.bus_ref}</dd>
        </div>
        <div className="mvd-osd-zal-para">
          <dt>{OSD_STRINGS.zalPolecenie}</dt>
          <dd>{etykietaPoleceniaOsd(dane.parameters.command)}</dd>
        </div>
        {trybEkspercki && (
          <>
            <div className="mvd-osd-zal-para">
              <dt>{OSD_STRINGS.zalIdentyfikatorZrodla}</dt>
              <dd className="mvd-num">{dane.source.ref_id}</dd>
            </div>
            <div className="mvd-osd-zal-para">
              <dt>{OSD_STRINGS.zalPrzebieg}</dt>
              <dd className="mvd-num">{dane.context.run_id}</dd>
            </div>
            <div className="mvd-osd-zal-para" data-testid="mvd-osd-eksp-hash">
              <dt>{OSD_STRINGS.zalIdentyfikatorSkrot}</dt>
              <dd className="mvd-num">{dane.input_hash}</dd>
            </div>
          </>
        )}
      </dl>

      <p className="mvd-osd-porownanie-tytul">{OSD_STRINGS.porownanieTytul}</p>
      <div className="mvd-osd-karty" data-testid="mvd-osd-karty">
        {karty.map((karta) => (
          <div key={karta.klucz} className="mvd-osd-karta" data-testid={`mvd-osd-karta-${karta.klucz}`}>
            <span className="mvd-osd-karta-etyk">{karta.etykieta}</span>
            <div className="mvd-osd-karta-wiersze">
              <div className="mvd-osd-karta-para">
                <span>{OSD_STRINGS.porownaniePrzed}</span>
                <span className="mvd-num">
                  {karta.przed} {karta.jednostka}
                </span>
              </div>
              <div className="mvd-osd-karta-para">
                <span>{OSD_STRINGS.porownaniePo}</span>
                <span className="mvd-num">
                  {karta.po} {karta.jednostka}
                </span>
              </div>
              <div className="mvd-osd-karta-para">
                <span>{OSD_STRINGS.porownanieDelta}</span>
                <span className="mvd-num mvd-osd-karta-delta" data-testid={`mvd-osd-delta-${karta.klucz}`}>
                  {karta.delta} {karta.jednostka}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mvd-osd-porownanie-komentarz">{OSD_STRINGS.porownanieKomentarz}</p>

      <p className="mvd-osd-tabela-tytul">{OSD_STRINGS.tabelaTytul}</p>
      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
      />

      <div className="mvd-osd-slad-blok">
        <button
          type="button"
          className="mvd-osd-slad-btn"
          aria-expanded={sladWidoczny}
          onClick={() => setSladWidoczny((s) => !s)}
          data-testid="mvd-osd-slad-otworz"
        >
          {sladWidoczny ? OSD_STRINGS.sladUkryj : OSD_STRINGS.sladPokaz}
        </button>
        {sladWidoczny && (
          <div className="mvd-oze" data-testid="mvd-osd-slad">
            <span className="mvd-osd-slad-tytul">{OSD_STRINGS.sladTytul}</span>
            <SladAnalizy kroki={kroki} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Odpowiedź na polecenia OSD"
// ---------------------------------------------------------------------------

export interface EkranOsdProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranOsd({ trybZaawansowania }: EkranOsdProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = useMemo(() => wybierzPrzebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const zrodla = useMemo<OpcjaZrodlaOsd[]>(() => opcjeZrodel(snapshot), [snapshot]);

  const [wybraneZrodlo, setWybraneZrodlo] = useState('');
  const [polecenie, setPolecenie] = useState<RodzajPoleceniaOsd>('ograniczenie_p');
  const [limitP, setLimitP] = useState(DOMYSLNY_LIMIT_P_PCT);
  const [qMvar, setQMvar] = useState(DOMYSLNA_Q_MVAR);
  const [cosPhi, setCosPhi] = useState(DOMYSLNY_COSFI);
  const [charakter, setCharakter] = useState<CharakterMocyBiernej>(DOMYSLNY_CHARAKTER);
  const [czestotliwosc, setCzestotliwosc] = useState(DOMYSLNA_CZESTOTLIWOSC_HZ);
  const [droop, setDroop] = useState(DOMYSLNY_DROOP_PCT);
  const [strefaMartwa, setStrefaMartwa] = useState(DOMYSLNA_STREFA_MARTWA_HZ);

  const [zapytanie, setZapytanie] = useState<ZapytanieOdpowiedziOsd | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

  const pola = useMemo(() => new Set(poleParametrowOsd(polecenie)), [polecenie]);

  // Zmiana przebiegu unieważnia poprzedni wynik (stale-result guard).
  useEffect(() => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  }, [runId]);

  // Jawny bieg symulacji.
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzOdpowiedzOsd(zapytanie)
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

  // Zmiana doboru/polecenia/parametrów unieważnia poprzedni wynik.
  const unewaznij = () => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };

  const mozliwyBieg = runId !== null && wybraneZrodlo !== '';

  const uruchom = () => {
    if (runId === null || wybraneZrodlo === '') return;
    setZapytanie({
      runId,
      sourceRef: wybraneZrodlo,
      command: polecenie,
      pLimitPct: pola.has('limitP') ? limitP : undefined,
      qMvar: pola.has('q') ? qMvar : undefined,
      cosPhi: pola.has('cosfi') ? cosPhi : undefined,
      qCharakter: pola.has('charakter') ? charakter : undefined,
      frequencyHz: pola.has('czestotliwosc') ? czestotliwosc : undefined,
      droopPct: pola.has('droop') ? droop : undefined,
      deadbandHz: pola.has('strefaMartwa') ? strefaMartwa : undefined,
    });
  };

  return (
    <div className="mvd-osd" data-testid="mvd-osd-ekran">
      <header className="mvd-osd-naglowek">
        <h2 className="mvd-osd-tytul">{OSD_STRINGS.tytul}</h2>
        <p className="mvd-osd-opis">{OSD_STRINGS.opisWstep}</p>
      </header>

      {runId === null ? (
        <StanPanel
          komunikat={OSD_STRINGS.brakPrzebiegu}
          opis={OSD_STRINGS.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-osd-brak-przebiegu"
        />
      ) : zrodla.length === 0 ? (
        <StanPanel
          komunikat={OSD_STRINGS.brakZrodel}
          opis={OSD_STRINGS.brakZrodelOpis}
          wariant="info"
          testid="mvd-osd-brak-zrodel"
        />
      ) : (
        <>
          <section className="mvd-osd-parametry" data-testid="mvd-osd-parametry">
            <div className="mvd-osd-param">
              <label htmlFor="mvd-osd-zrodlo">{OSD_STRINGS.wyborZrodlo}</label>
              <select
                id="mvd-osd-zrodlo"
                value={wybraneZrodlo}
                onChange={(e) => {
                  setWybraneZrodlo(e.target.value);
                  unewaznij();
                }}
                data-testid="mvd-osd-zrodlo"
              >
                <option value="">{OSD_STRINGS.wyborZrodloWybierz}</option>
                {zrodla.map((o) => (
                  <option key={o.refId} value={o.refId}>
                    {o.etykieta}
                  </option>
                ))}
              </select>
              <p className="mvd-osd-param-opis">{OSD_STRINGS.wyborZrodloOpis}</p>
            </div>

            <div className="mvd-osd-param">
              <label htmlFor="mvd-osd-polecenie">{OSD_STRINGS.wyborPolecenie}</label>
              <select
                id="mvd-osd-polecenie"
                value={polecenie}
                onChange={(e) => {
                  setPolecenie(e.target.value as RodzajPoleceniaOsd);
                  unewaznij();
                }}
                data-testid="mvd-osd-polecenie"
              >
                {POLECENIA.map((p) => (
                  <option key={p} value={p}>
                    {etykietaPoleceniaOsd(p)}
                  </option>
                ))}
              </select>
              <p className="mvd-osd-param-opis">{OSD_STRINGS.wyborPolecenieOpis}</p>
            </div>

            {pola.has('limitP') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-limit-p">{OSD_STRINGS.paramLimitP}</label>
                <div className="mvd-osd-param-pole">
                  <input
                    id="mvd-osd-limit-p"
                    type="number"
                    min={0}
                    step={1}
                    value={limitP}
                    onChange={(e) => {
                      setLimitP(Number(e.target.value));
                      unewaznij();
                    }}
                    data-testid="mvd-osd-limit-p"
                  />
                  <span className="mvd-osd-param-jedn">{OSD_STRINGS.jednProc}</span>
                </div>
                <p className="mvd-osd-param-opis">{OSD_STRINGS.paramLimitPOpis}</p>
              </div>
            )}

            {pola.has('q') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-q">{OSD_STRINGS.paramQ}</label>
                <div className="mvd-osd-param-pole">
                  <input
                    id="mvd-osd-q"
                    type="number"
                    step={0.1}
                    value={qMvar}
                    onChange={(e) => {
                      setQMvar(Number(e.target.value));
                      unewaznij();
                    }}
                    data-testid="mvd-osd-q"
                  />
                  <span className="mvd-osd-param-jedn">{OSD_STRINGS.jednMvar}</span>
                </div>
                <p className="mvd-osd-param-opis">{OSD_STRINGS.paramQOpis}</p>
              </div>
            )}

            {pola.has('cosfi') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-cosfi">{OSD_STRINGS.paramCosfi}</label>
                <div className="mvd-osd-param-pole">
                  <input
                    id="mvd-osd-cosfi"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={cosPhi}
                    onChange={(e) => {
                      setCosPhi(Number(e.target.value));
                      unewaznij();
                    }}
                    data-testid="mvd-osd-cosfi"
                  />
                </div>
                <p className="mvd-osd-param-opis"><TekstZWzorami tekst={OSD_STRINGS.paramCosfiOpis} /></p>
              </div>
            )}

            {pola.has('charakter') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-charakter">{OSD_STRINGS.paramCharakter}</label>
                <select
                  id="mvd-osd-charakter"
                  value={charakter}
                  onChange={(e) => {
                    setCharakter(e.target.value as CharakterMocyBiernej);
                    unewaznij();
                  }}
                  data-testid="mvd-osd-charakter"
                >
                  <option value="nadwzbudny">{OSD_STRINGS.charakterNadwzbudny}</option>
                  <option value="podwzbudny">{OSD_STRINGS.charakterPodwzbudny}</option>
                </select>
                <p className="mvd-osd-param-opis">{OSD_STRINGS.paramCharakterOpis}</p>
              </div>
            )}

            {pola.has('czestotliwosc') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-czestotliwosc">{OSD_STRINGS.paramCzestotliwosc}</label>
                <div className="mvd-osd-param-pole">
                  <input
                    id="mvd-osd-czestotliwosc"
                    type="number"
                    min={0}
                    step={0.1}
                    value={czestotliwosc}
                    onChange={(e) => {
                      setCzestotliwosc(Number(e.target.value));
                      unewaznij();
                    }}
                    data-testid="mvd-osd-czestotliwosc"
                  />
                  <span className="mvd-osd-param-jedn">{OSD_STRINGS.jednHz}</span>
                </div>
                <p className="mvd-osd-param-opis">{OSD_STRINGS.paramCzestotliwoscOpis}</p>
              </div>
            )}

            {pola.has('droop') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-droop">{OSD_STRINGS.paramDroop}</label>
                <div className="mvd-osd-param-pole">
                  <input
                    id="mvd-osd-droop"
                    type="number"
                    min={0}
                    step={0.5}
                    value={droop}
                    onChange={(e) => {
                      setDroop(Number(e.target.value));
                      unewaznij();
                    }}
                    data-testid="mvd-osd-droop"
                  />
                  <span className="mvd-osd-param-jedn">{OSD_STRINGS.jednProc}</span>
                </div>
                <p className="mvd-osd-param-opis">{OSD_STRINGS.paramDroopOpis}</p>
              </div>
            )}

            {pola.has('strefaMartwa') && (
              <div className="mvd-osd-param">
                <label htmlFor="mvd-osd-strefa">{OSD_STRINGS.paramStrefaMartwa}</label>
                <div className="mvd-osd-param-pole">
                  <input
                    id="mvd-osd-strefa"
                    type="number"
                    min={0}
                    step={0.05}
                    value={strefaMartwa}
                    onChange={(e) => {
                      setStrefaMartwa(Number(e.target.value));
                      unewaznij();
                    }}
                    data-testid="mvd-osd-strefa"
                  />
                  <span className="mvd-osd-param-jedn">{OSD_STRINGS.jednHz}</span>
                </div>
                <p className="mvd-osd-param-opis">{OSD_STRINGS.paramStrefaMartwaOpis}</p>
              </div>
            )}

            <button
              type="button"
              className="mvd-osd-oblicz"
              onClick={uruchom}
              disabled={!mozliwyBieg}
              data-testid="mvd-osd-oblicz"
            >
              {zapytanie === null ? OSD_STRINGS.przyciskOblicz : OSD_STRINGS.przyciskPrzelicz}
            </button>
          </section>

          {stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={OSD_STRINGS.idle}
              opis={OSD_STRINGS.idleOpis}
              wariant="info"
              testid="mvd-osd-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel komunikat={OSD_STRINGS.ladowanie} wariant="info" testid="mvd-osd-ladowanie" />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={OSD_STRINGS.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-osd-blad"
            />
          ) : (
            <WynikOsd dane={stan.dane} trybZaawansowania={trybZaawansowania} />
          )}
        </>
      )}
    </div>
  );
}
