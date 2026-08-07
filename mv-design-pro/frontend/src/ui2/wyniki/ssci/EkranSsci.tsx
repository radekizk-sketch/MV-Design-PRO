/*
 * EkranSsci — okno „Stabilność SSCI" (ekran wyników ui2/wyniki/ssci). Domyka lukę
 * B1 audytu: analiza SSCI (kryterium impedancyjne Nyquista, Sun 2011 / Wen 2016)
 * miała backend bez UI. Ekran dobiera przebieg SSCI przez utworzenie przebiegu
 * `ssci_impedance` na committed ENM aktywnego przypadku (wzór doboru z
 * `ui2/wyniki/akademickie`), a następnie pobiera werdykt:
 *   `POST /api/cases/{case_id}/runs/v126/ssci_impedance` → `run_id`
 *   `GET  /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability`
 * i prezentuje:
 *   1. chip werdyktu z istotnością (stabilny / ryzyko SSCI / niestabilny / brak danych),
 *   2. uzasadnienie (`why_pl`) wprost z backendu,
 *   3. metryki (max|L|, margines różnicy faz Δφ, częstotliwość winna, odległość od −1,
 *      okrążenia, rezystancja ujemna),
 *   4. panel proweniencji (najgorsza jakość pól karty falownika),
 *   5. uczciwy stan zerowy „brak przekształtnika/DER = brak danych",
 *   6. ślad WHITE BOX w trybie eksperckim.
 *
 * Zero fizyki, zero ocen lokalnych — werdykt, metryki i flagi pochodzą WYŁĄCZNIE
 * z backendu. Bez aktywnego przypadku → uczciwa instrukcja (bez wołań API).
 */

import { useState } from 'react';
import './ssci.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useAppStateStore } from '../../../ui/app-state';
import {
  fetchStabilnoscSsci,
  utworzPrzebiegSsci,
  type KrokWhiteBox,
  type WidokStabilnosciSsci,
} from './api';
import { etykietaWerdyktu, istotnoscWerdyktu, naMetryki } from './model';
import { akcjaNaprawcza, useAkcjaPrzejdzDoPrzypadkow, usePoprawWModelu } from '../wzorzec';
import { SSCI_STRINGS as S, fmtGain, fmtStopnie, type IstotnoscStanu } from './strings';

// ---------------------------------------------------------------------------
// Elementy wspólne (chip, tag, panel stanu)
// ---------------------------------------------------------------------------

function Tag({ tekst, istotnosc, testid }: { tekst: string; istotnosc: IstotnoscStanu; testid?: string }) {
  return (
    <span className={`mvd-ssci-tag mvd-ssci-tag--${istotnosc}`} data-testid={testid ?? 'mvd-ssci-tag'}>
      {tekst}
    </span>
  );
}
import { PrzyciskAkcjiStanu } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';

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
      className={wariant === 'blad' ? 'mvd-ssci-stan mvd-ssci-stan--blad' : 'mvd-ssci-stan'}
      data-testid={testid}
    >
      <p className="mvd-ssci-stan-title">{komunikat}</p>
      {opis && <p className="mvd-ssci-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip werdyktu + identyfikacja przekształtnika/węzła
// ---------------------------------------------------------------------------

function ChipWerdyktu({ dane }: { dane: WidokStabilnosciSsci }) {
  const w = dane.verdict;
  const istotnosc = istotnoscWerdyktu(w.verdict);
  const poprawWModelu = usePoprawWModelu();
  // F-K4 (znalezisko Z4): ryzyko/brak stabilności podsynchronicznej prowadzi do
  // SZYNY przyłączenia przekształtnika w modelu. Węzeł, bo to on jest elementem
  // modelu wskazanym przez kontrakt werdyktu (`bus_ref`); `converter_ref` nie
  // jest identyfikatorem elementu grafu, więc nawigacja po nim byłaby zgadywaniem.
  const wezel = w.bus_ref;
  const decyzja = w.is_risk && Boolean(wezel);
  return (
    <section className="mvd-ssci-werdykt" data-testid="mvd-ssci-werdykt">
      <div className="mvd-ssci-werdykt-glowny">
        <span className="mvd-ssci-werdykt-etyk">{S.werdyktTytul}</span>
        <span
          className={`mvd-ssci-chip mvd-ssci-chip--${istotnosc}`}
          data-testid="mvd-ssci-chip-werdykt"
        >
          {etykietaWerdyktu(w.verdict)}
        </span>
        {w.converter_ref && (
          <span className="mvd-ssci-werdykt-meta">
            {S.chipPrzekształtnik}: {w.converter_ref}
          </span>
        )}
        {w.bus_ref && (
          <span className="mvd-ssci-werdykt-meta">
            {S.chipWezel}: {w.bus_ref}
          </span>
        )}
        {decyzja && (
          <button
            type="button"
            className="mvd-ssci-popraw"
            data-testid="mvd-ssci-popraw"
            title={akcjaNaprawcza('stabilnosc-ssci').opis}
            onClick={() => poprawWModelu(wezel as string, 'Bus', wezel as string, 'stabilnosc-ssci')}
          >
            {akcjaNaprawcza('stabilnosc-ssci').etykieta}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Metryki kryterium impedancyjnego (grid)
// ---------------------------------------------------------------------------

function PanelMetryk({ dane }: { dane: WidokStabilnosciSsci }) {
  const metryki = naMetryki(dane.verdict);
  return (
    <section className="mvd-ssci-metryki" data-testid="mvd-ssci-metryki">
      <h3 className="mvd-ssci-sekcja-tytul">{S.metrykiTytul}</h3>
      <div className="mvd-ssci-metryki-grid">
        {metryki.map((m) => (
          <div
            key={m.klucz}
            className={`mvd-ssci-metryka mvd-ssci-metryka--${m.istotnosc}`}
            data-testid={`mvd-ssci-metryka-${m.klucz}`}
          >
            <span className="mvd-ssci-metryka-etyk">{m.etykieta}</span>
            <span className="mvd-ssci-metryka-wartosc mvd-num">{m.wartosc}</span>
            {m.opis && <span className="mvd-ssci-metryka-opis">{m.opis}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel proweniencji (najgorsza jakość pól karty)
// ---------------------------------------------------------------------------

function PanelProweniencji({ dane }: { dane: WidokStabilnosciSsci }) {
  const prov = dane.verdict.provenance;
  if (!prov) return null;
  const istotnosc: IstotnoscStanu = prov.is_estimated ? 'warn' : 'ok';
  return (
    <section className="mvd-ssci-prov" data-testid="mvd-ssci-prov">
      <h3 className="mvd-ssci-sekcja-tytul">{S.provTytul}</h3>
      <div className="mvd-ssci-prov-row">
        <span className="mvd-ssci-prov-etyk">{S.provJakosc}</span>
        <Tag
          tekst={`${prov.worst_quality_label_pl} · ${prov.is_estimated ? S.provSzacowana : S.provPotwierdzona}`}
          istotnosc={istotnosc}
          testid="mvd-ssci-prov-tag"
        />
      </div>
      <p className="mvd-ssci-prov-tag-pl">{prov.tag_pl}</p>
      {prov.consumed_fields.length > 0 && (
        <p className="mvd-ssci-prov-pola">
          {S.provPolaZrodlowe}: {prov.consumed_fields.join(', ')}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Uczciwy stan zerowy — brak danych (brak przekształtnika/DER)
// ---------------------------------------------------------------------------

function PanelBrakow({ dane }: { dane: WidokStabilnosciSsci }) {
  const missing = dane.verdict.missing_data;
  if (missing.length === 0) return null;
  return (
    <section className="mvd-ssci-braki" data-testid="mvd-ssci-braki">
      <h3 className="mvd-ssci-sekcja-tytul">{S.brakiTytul}</h3>
      <p className="mvd-ssci-pole-opis">{S.brakiOpis}</p>
      <p className="mvd-num mvd-ssci-braki-lista">
        {S.brakiPola}: {missing.join(', ')}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX (tryb ekspercki)
// ---------------------------------------------------------------------------

function SladSsci({ kroki }: { kroki: readonly KrokWhiteBox[] }) {
  const [widoczny, setWidoczny] = useState(false);
  if (kroki.length === 0) return null;
  return (
    <div className="mvd-ssci-slad-blok" data-testid="mvd-ssci-slad-blok">
      <button
        type="button"
        className="mvd-ssci-slad-btn"
        aria-expanded={widoczny}
        onClick={() => setWidoczny((s) => !s)}
        data-testid="mvd-ssci-slad-otworz"
      >
        {widoczny ? S.sladUkryj : S.sladPokaz}
      </button>
      {widoczny && (
        <div data-testid="mvd-ssci-slad">
          <span className="mvd-ssci-slad-tytul">{S.sladTytul}</span>
          <table className="mvd-ssci-slad-tabela">
            <thead>
              <tr>
                <th>{S.sladKolSymbol}</th>
                <th>{S.sladKolPodstawienie}</th>
                <th>{S.sladKolWynik}</th>
                <th>{S.sladKolJednostka}</th>
              </tr>
            </thead>
            <tbody>
              {kroki.map((k) => (
                <tr key={k.symbol}>
                  <td className="mvd-num">{k.symbol}</td>
                  <td>{k.substitution_pl}</td>
                  <td>{k.result_pl}</td>
                  <td>{k.unit_check_pl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prezentacja werdyktu
// ---------------------------------------------------------------------------

function WynikSsci({
  dane,
  trybEkspercki,
}: {
  dane: WidokStabilnosciSsci;
  trybEkspercki: boolean;
}) {
  const w = dane.verdict;
  return (
    <div data-testid="mvd-ssci-wynik">
      <ChipWerdyktu dane={dane} />

      <section className="mvd-ssci-dlaczego" data-testid="mvd-ssci-dlaczego">
        <h3 className="mvd-ssci-sekcja-tytul">{S.dlaczegoTytul}</h3>
        <p className="mvd-ssci-dlaczego-tresc">{w.why_pl}</p>
      </section>

      {w.missing_data.length > 0 ? (
        <PanelBrakow dane={dane} />
      ) : (
        <PanelMetryk dane={dane} />
      )}

      <PanelProweniencji dane={dane} />

      {trybEkspercki && w.white_box.length > 0 && <SladSsci kroki={w.white_box} />}

      {trybEkspercki && (
        <dl className="mvd-ssci-eksp" data-testid="mvd-ssci-eksp">
          <div className="mvd-ssci-eksp-para">
            <dt>{S.ekspAnalizaId}</dt>
            <dd className="mvd-num">{dane.analysis_id}</dd>
          </div>
          <div className="mvd-ssci-eksp-para">
            <dt>{S.ekspProgGain}</dt>
            <dd className="mvd-num">{fmtGain(dane.gain_crossover_mag)}</dd>
          </div>
          <div className="mvd-ssci-eksp-para">
            <dt>{S.ekspProgRyzyko}</dt>
            <dd className="mvd-num">{fmtStopnie(dane.pm_risk_deg)}</dd>
          </div>
          <div className="mvd-ssci-eksp-para">
            <dt>{S.ekspProgNiestabilny}</dt>
            <dd className="mvd-num">{fmtStopnie(dane.pm_unstable_deg)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zasób werdyktu — jawne stany
// ---------------------------------------------------------------------------

type StanWerdyktu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokStabilnosciSsci };

// ---------------------------------------------------------------------------
// Okno „Stabilność SSCI"
// ---------------------------------------------------------------------------

export interface EkranSsciProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranSsci({ trybZaawansowania }: EkranSsciProps) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  // K6 / H-5: bez aktywnego zakresu obliczeń jedyny sensowny krok to jego wybór.
  const akcjaPrzypadki = useAkcjaPrzejdzDoPrzypadkow();
  const trybEkspercki = trybZaawansowania === 'expert';

  const [stan, setStan] = useState<StanWerdyktu>({ rodzaj: 'idle' });
  const [runId, setRunId] = useState<string | null>(null);

  const uruchom = () => {
    if (activeCaseId === null) return;
    setStan({ rodzaj: 'ladowanie' });
    setRunId(null);
    utworzPrzebiegSsci(activeCaseId)
      .then((przebieg) => {
        setRunId(przebieg.run_id);
        return fetchStabilnoscSsci(przebieg.run_id);
      })
      .then((dane) => {
        setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        const komunikat = err instanceof Error ? err.message : S.blad;
        setStan({ rodzaj: 'blad', komunikat });
      });
  };

  // Bez aktywnego przypadku — uczciwa instrukcja (bez wołań API).
  if (activeCaseId === null) {
    return (
      <div className="mvd-ssci" data-testid="mvd-ssci-ekran">
        <header className="mvd-ssci-naglowek">
          <h2 className="mvd-ssci-tytul">{S.tytul}</h2>
          <p className="mvd-ssci-opis">{S.opisWstep}</p>
        </header>
        <StanPanel
          komunikat={S.brakPrzypadku}
          opis={S.brakPrzypadkuOpis}
          wariant="info"
          testid="mvd-ssci-brak-przypadku"
          akcja={akcjaPrzypadki}
        />
      </div>
    );
  }

  return (
    <div className="mvd-ssci" data-testid="mvd-ssci-ekran">
      <header className="mvd-ssci-naglowek">
        <h2 className="mvd-ssci-tytul">{S.tytul}</h2>
        <p className="mvd-ssci-opis">{S.opisWstep}</p>
        {trybEkspercki && runId && (
          <span className="mvd-ssci-run mvd-num" aria-label={S.runId}>
            {runId}
          </span>
        )}
      </header>

      <section className="mvd-ssci-akcja-sekcja">
        <p className="mvd-ssci-pole-opis">{S.uruchomOpis}</p>
        <div className="mvd-ssci-akcje">
          <button
            type="button"
            className="mvd-ssci-oblicz"
            onClick={uruchom}
            disabled={stan.rodzaj === 'ladowanie'}
            data-testid="mvd-ssci-uruchom"
          >
            {stan.rodzaj === 'gotowe' || stan.rodzaj === 'blad' ? S.uruchomPonownie : S.uruchom}
          </button>
        </div>
      </section>

      {stan.rodzaj === 'ladowanie' && (
        <StanPanel komunikat={S.ladowanie} wariant="info" testid="mvd-ssci-ladowanie" />
      )}
      {stan.rodzaj === 'blad' && (
        <StanPanel komunikat={S.blad} opis={stan.komunikat} wariant="blad" testid="mvd-ssci-blad" />
      )}
      {stan.rodzaj === 'gotowe' && <WynikSsci dane={stan.dane} trybEkspercki={trybEkspercki} />}
    </div>
  );
}
