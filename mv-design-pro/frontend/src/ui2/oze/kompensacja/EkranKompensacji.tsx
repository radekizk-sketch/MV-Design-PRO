/*
 * EkranKompensacji — okno „Dobór kompensacji" (karta U4 P42 / D8, strumień OZE).
 * Wybór węzła (ze snapshotu — wzorzec `obszar/EkranObszaruPQ`) + przebiegu rozpływu
 * (LOAD_FLOW/DONE — `wybierzPrzebiegRozplywu`) + wymaganego cosφ min + przełącznika
 * scenariusza nocnego → JAWNY bieg `GET /api/oze-analysis/compensation-sizing` →
 * prezentacja:
 *   1. nota rozdziału DWÓCH cosφ (punktu vs przekroju) + konwencja kanoniczna znaku,
 *   2. stan wyjściowy punktu (baseline) z OBOMA cosφ rozdzielonymi (dzień/noc),
 *   3. tabela kandydatów na wzorcu `TabelaWynikow` — kolumna decyzyjna = cosφ punktu
 *      kompensowanego (werdykt `spelnia`, tag tokenowy), cosφ przekroju informacyjnie,
 *   4. werdykt doboru (pierwszy spełniający lub uczciwy „brak doboru" z powodem PL),
 *   5. rozwijany ślad WHITE BOX (reużyty `SladAnalizy` z pulpitu).
 *
 * Zero fizyki, zero ocen lokalnych — wielkości, werdykty i powody pochodzą WYŁĄCZNIE
 * z backendu. Identyfikatory (bus_ref, input_hash, trace_id) wyłącznie w trybie
 * eksperckim.
 *
 * WIĄŻĄCY WYMÓG WŁAŚCICIELA (V12K-040, opcja B): „cosφ punktu kompensowanego" (dobór)
 * i „cosφ przekroju sieciowego" (informacyjne) prezentowane pod jednoznacznie różnymi
 * nazwami; dobór sterowany WYŁĄCZNIE cosφ punktu.
 */

import { useEffect, useMemo, useState } from 'react';
import './kompensacja.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore, selectBusOptions } from '../../../ui/topology/snapshotStore';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import { SladAnalizy } from '../pulpit';
import {
  pobierzDoborKompensacji,
  type WidokDoboruKompensacji,
  type ZapytanieDoboruKompensacji,
} from '../api';
import { wybierzPrzebiegRozplywu } from '../zdolnosc/zdolnoscModel';
import {
  kolumnyTabeliKompensacji,
  krokiSladuKompensacji,
  wierszeTabeliKompensacji,
} from './kompensacjaModel';
import { KOMPENSACJA_STRINGS as T, fmtCosfiKomp, fmtKvKomp, fmtMvarKomp } from './strings';

const DOMYSLNY_COSFI_MIN = 0.95;

// ---------------------------------------------------------------------------
// Stan pobierania (jawny bieg: idle / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokDoboruKompensacji };

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
      className={wariant === 'blad' ? 'mvd-komp-stan mvd-komp-stan--blad' : 'mvd-komp-stan'}
      data-testid={testid}
    >
      <p className="mvd-komp-stan-title">{komunikat}</p>
      {opis && <p className="mvd-komp-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nota: rozdział dwóch cosφ + konwencja kanoniczna znaku (założenia doboru)
// ---------------------------------------------------------------------------

function NotaCosfi({ konwencja }: { konwencja: string }) {
  return (
    <section className="mvd-komp-nota" data-testid="mvd-komp-nota">
      <span className="mvd-komp-nota-tytul">{T.notaCosfiTytul}</span>
      <p className="mvd-komp-nota-wiersz mvd-komp-nota-wiersz--punktu" data-testid="mvd-komp-nota-punktu">
        {T.notaCosfiPunktu}
      </p>
      <p className="mvd-komp-nota-wiersz" data-testid="mvd-komp-nota-przekroju">
        {T.notaCosfiPrzekroju}
      </p>
      <p className="mvd-komp-nota-konwencja" data-testid="mvd-komp-nota-konwencja">
        <strong>{T.notaKonwencjaTytul}: </strong>
        <code>{konwencja}</code>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wynik: nota + założenia + baseline + tabela + werdykt doboru + ślad
// ---------------------------------------------------------------------------

function WynikKompensacji({
  dane,
  trybZaawansowania,
}: {
  dane: WidokDoboruKompensacji;
  trybZaawansowania: AdvancementMode;
}) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const [sladWidoczny, setSladWidoczny] = useState(false);

  const uwzglednijNoc = dane.parameters.uwzglednij_noc;
  const kolumny = useMemo(() => kolumnyTabeliKompensacji(uwzglednijNoc), [uwzglednijNoc]);
  const wiersze = useMemo(
    () => wierszeTabeliKompensacji(dane.candidates, uwzglednijNoc),
    [dane.candidates, uwzglednijNoc],
  );
  const kroki = useMemo(() => krokiSladuKompensacji(dane.whitebox), [dane.whitebox]);

  return (
    <div data-testid="mvd-komp-wynik">
      <NotaCosfi konwencja={dane.whitebox.konwencja_kanoniczna} />

      <dl className="mvd-komp-zalozenia" data-testid="mvd-komp-zalozenia">
        <div className="mvd-komp-zal-para">
          <dt>{T.zalWezel}</dt>
          <dd>{dane.parameters.bus_name ?? dane.parameters.bus_ref}</dd>
        </div>
        <div className="mvd-komp-zal-para">
          <dt>{T.zalNapiecie}</dt>
          <dd className="mvd-num">
            {fmtKvKomp(dane.parameters.bus_voltage_kv)} {T.jednKv}
          </dd>
        </div>
        <div className="mvd-komp-zal-para">
          <dt>{T.zalCosfiMin}</dt>
          <dd className="mvd-num">{fmtCosfiKomp(dane.parameters.cos_phi_min)}</dd>
        </div>
        <div className="mvd-komp-zal-para">
          <dt>{T.zalScenariuszNoc}</dt>
          <dd data-testid="mvd-komp-zal-noc">
            {uwzglednijNoc ? T.zalScenariuszNocTak : T.zalScenariuszNocNie}
          </dd>
        </div>
        <div className="mvd-komp-zal-para">
          <dt>{T.zalLiczbaKandydatow}</dt>
          <dd className="mvd-num">{dane.whitebox.candidate_count}</dd>
        </div>
        {trybEkspercki && (
          <>
            <div className="mvd-komp-zal-para">
              <dt>{T.zalPrzebieg}</dt>
              <dd className="mvd-num">{dane.context.trace_id}</dd>
            </div>
            <div className="mvd-komp-zal-para" data-testid="mvd-komp-eksp-hash">
              <dt>{T.zalIdentyfikatorSkrot}</dt>
              <dd className="mvd-num">{dane.input_hash}</dd>
            </div>
          </>
        )}
      </dl>

      <section className="mvd-komp-baseline" data-testid="mvd-komp-baseline">
        <p className="mvd-komp-sekcja-tytul">{T.baselineTytul}</p>
        <dl className="mvd-komp-baseline-siatka">
          <div className="mvd-komp-baseline-para mvd-komp-baseline-para--decyzja">
            <dt>{T.baselineCosfiPunktuDzien}</dt>
            <dd className="mvd-num" data-testid="mvd-komp-baseline-punktu-dzien">
              {fmtCosfiKomp(dane.baseline.cosfi_punktu_dzien)}
            </dd>
          </div>
          {uwzglednijNoc && (
            <div className="mvd-komp-baseline-para mvd-komp-baseline-para--decyzja">
              <dt>{T.baselineCosfiPunktuNoc}</dt>
              <dd className="mvd-num" data-testid="mvd-komp-baseline-punktu-noc">
                {fmtCosfiKomp(dane.baseline.cosfi_punktu_noc)}
              </dd>
            </div>
          )}
          <div className="mvd-komp-baseline-para">
            <dt>{T.baselineCosfiPrzekrojuDzien}</dt>
            <dd className="mvd-num" data-testid="mvd-komp-baseline-przekroju-dzien">
              {fmtCosfiKomp(dane.baseline.cosfi_przekroju_dzien)}
            </dd>
          </div>
          {uwzglednijNoc && (
            <div className="mvd-komp-baseline-para">
              <dt>{T.baselineCosfiPrzekrojuNoc}</dt>
              <dd className="mvd-num" data-testid="mvd-komp-baseline-przekroju-noc">
                {fmtCosfiKomp(dane.baseline.cosfi_przekroju_noc)}
              </dd>
            </div>
          )}
        </dl>
        <p className="mvd-komp-komentarz">{T.baselineKomentarz}</p>
      </section>

      <p className="mvd-komp-sekcja-tytul">{T.tabelaTytul}</p>
      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
      />

      {dane.dobor !== null ? (
        <section className="mvd-komp-dobor" data-testid="mvd-komp-dobor">
          <p className="mvd-komp-dobor-naglowek">{T.doborNaglowekOk}</p>
          <dl className="mvd-komp-dobor-siatka">
            <div className="mvd-komp-dobor-para">
              <dt>{T.kolRekord}</dt>
              <dd data-testid="mvd-komp-dobor-nazwa">{dane.dobor.name}</dd>
            </div>
            <div className="mvd-komp-dobor-para">
              <dt>{T.doborMoc}</dt>
              <dd className="mvd-num">
                {fmtMvarKomp(dane.dobor.rated_mvar)} {T.jednMvar}
              </dd>
            </div>
            <div className="mvd-komp-dobor-para">
              <dt>{T.doborNapiecie}</dt>
              <dd className="mvd-num">
                {fmtKvKomp(dane.dobor.rated_kv)} {T.jednKv}
              </dd>
            </div>
            <div className="mvd-komp-dobor-para">
              <dt>{T.doborCosfiPunktuDzien}</dt>
              <dd className="mvd-num" data-testid="mvd-komp-dobor-punktu-dzien">
                {fmtCosfiKomp(dane.dobor.cosfi_punktu_dzien)}
              </dd>
            </div>
            {uwzglednijNoc && (
              <div className="mvd-komp-dobor-para">
                <dt>{T.doborCosfiPunktuNoc}</dt>
                <dd className="mvd-num">{fmtCosfiKomp(dane.dobor.cosfi_punktu_noc)}</dd>
              </div>
            )}
            <div className="mvd-komp-dobor-para">
              <dt>{T.doborCosfiPrzekrojuDzien}</dt>
              <dd className="mvd-num" data-testid="mvd-komp-dobor-przekroju-dzien">
                {fmtCosfiKomp(dane.dobor.cosfi_przekroju_dzien)}
              </dd>
            </div>
            {uwzglednijNoc && (
              <div className="mvd-komp-dobor-para">
                <dt>{T.doborCosfiPrzekrojuNoc}</dt>
                <dd className="mvd-num">{fmtCosfiKomp(dane.dobor.cosfi_przekroju_noc)}</dd>
              </div>
            )}
          </dl>
          <p className="mvd-komp-komentarz">{T.doborPodstawa}</p>
        </section>
      ) : (
        <section className="mvd-komp-dobor mvd-komp-dobor--brak" data-testid="mvd-komp-brak-doboru">
          <p className="mvd-komp-dobor-naglowek">{T.brakDoboruTytul}</p>
          <p className="mvd-komp-dobor-powod" data-testid="mvd-komp-powod-braku">
            {dane.powod_braku ?? T.kreska}
          </p>
        </section>
      )}

      <div className="mvd-komp-slad-blok">
        <button
          type="button"
          className="mvd-komp-slad-btn"
          aria-expanded={sladWidoczny}
          onClick={() => setSladWidoczny((s) => !s)}
          data-testid="mvd-komp-slad-otworz"
        >
          {sladWidoczny ? T.sladUkryj : T.sladPokaz}
        </button>
        {sladWidoczny && (
          <div className="mvd-oze" data-testid="mvd-komp-slad">
            <span className="mvd-komp-slad-tytul">{T.sladTytul}</span>
            <SladAnalizy kroki={kroki} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Dobór kompensacji"
// ---------------------------------------------------------------------------

export interface EkranKompensacjiProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranKompensacji({ trybZaawansowania }: EkranKompensacjiProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = useMemo(() => wybierzPrzebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const opcjeWezlow = useMemo(() => selectBusOptions(snapshot), [snapshot]);

  const [wybranyWezel, setWybranyWezel] = useState('');
  const [cosPhiMin, setCosPhiMin] = useState(DOMYSLNY_COSFI_MIN);
  const [uwzglednijNoc, setUwzglednijNoc] = useState(false);

  const [zapytanie, setZapytanie] = useState<ZapytanieDoboruKompensacji | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

  // Zmiana przebiegu unieważnia poprzedni wynik (stale-result guard).
  useEffect(() => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  }, [runId]);

  // Jawny bieg doboru.
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzDoborKompensacji(zapytanie)
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

  // Zmiana doboru węzła/parametrów unieważnia poprzedni wynik.
  const unewaznij = () => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };

  const mozliwyBieg = runId !== null && wybranyWezel !== '';

  const uruchom = () => {
    if (runId === null || wybranyWezel === '') return;
    setZapytanie({ runId, busRef: wybranyWezel, cosPhiMin, uwzglednijNoc });
  };

  return (
    <div className="mvd-komp" data-testid="mvd-komp-ekran">
      <header className="mvd-komp-naglowek">
        <h2 className="mvd-komp-tytul">{T.tytul}</h2>
        <p className="mvd-komp-opis">{T.opisWstep}</p>
      </header>

      {runId === null ? (
        <StanPanel
          komunikat={T.brakPrzebiegu}
          opis={T.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-komp-brak-przebiegu"
        />
      ) : opcjeWezlow.length === 0 ? (
        <StanPanel
          komunikat={T.brakWezlow}
          opis={T.brakWezlowOpis}
          wariant="info"
          testid="mvd-komp-brak-wezlow"
        />
      ) : (
        <>
          <section className="mvd-komp-parametry" data-testid="mvd-komp-parametry">
            <div className="mvd-komp-param">
              <label htmlFor="mvd-komp-wezel">{T.paramWezel}</label>
              <select
                id="mvd-komp-wezel"
                value={wybranyWezel}
                onChange={(e) => {
                  setWybranyWezel(e.target.value);
                  unewaznij();
                }}
                data-testid="mvd-komp-wezel"
              >
                <option value="">{T.paramWezelWybierz}</option>
                {opcjeWezlow.map((o) => (
                  <option key={o.ref_id} value={o.ref_id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <p className="mvd-komp-param-opis">{T.paramWezelOpis}</p>
            </div>

            <div className="mvd-komp-param">
              <label htmlFor="mvd-komp-cosfi">{T.paramCosfiMin}</label>
              <input
                id="mvd-komp-cosfi"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={cosPhiMin}
                onChange={(e) => {
                  setCosPhiMin(Number(e.target.value));
                  unewaznij();
                }}
                data-testid="mvd-komp-cosfi"
              />
              <p className="mvd-komp-param-opis">{T.paramCosfiMinOpis}</p>
            </div>

            <div className="mvd-komp-param-przelacznik">
              <input
                id="mvd-komp-noc"
                type="checkbox"
                checked={uwzglednijNoc}
                onChange={(e) => {
                  setUwzglednijNoc(e.target.checked);
                  unewaznij();
                }}
                data-testid="mvd-komp-noc"
              />
              <label htmlFor="mvd-komp-noc">{T.paramNoc}</label>
            </div>

            <button
              type="button"
              className="mvd-komp-oblicz"
              onClick={uruchom}
              disabled={!mozliwyBieg}
              data-testid="mvd-komp-oblicz"
            >
              {zapytanie === null ? T.przyciskOblicz : T.przyciskPrzelicz}
            </button>
          </section>

          {stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={T.idle}
              opis={T.idleOpis}
              wariant="info"
              testid="mvd-komp-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel komunikat={T.ladowanie} wariant="info" testid="mvd-komp-ladowanie" />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={T.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-komp-blad"
            />
          ) : (
            <WynikKompensacji dane={stan.dane} trybZaawansowania={trybZaawansowania} />
          )}
        </>
      )}
    </div>
  );
}
