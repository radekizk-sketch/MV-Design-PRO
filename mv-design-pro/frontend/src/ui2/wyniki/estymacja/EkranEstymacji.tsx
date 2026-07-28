/*
 * EkranEstymacji — okno „Estymacja stanu (WLS)" (ekran wyników ui2/wyniki/estymacja).
 * Domyka zdolność estymacji stanu „do ostatniego klika": wybiera zakończony
 * przebieg rozpływu (wzorzec selektora z `EkranJakosci`), pobiera WYMAGANE wejścia
 * (`GET /api/quality/state-estimation/requirements` — mapa węzeł→indeks, slack,
 * minimalna liczba pomiarów), przyjmuje pomiary telemetryczne w edytorze wierszy
 * (typ / węzeł / wartość / σ / węzeł „do" gałęzi) i wykonuje estymację przez
 * `POST /api/quality/state-estimation`:
 *   1. chipy podsumowania (zbieżność, iteracje, χ², stopnie swobody),
 *   2. tabela estymowanego stanu węzłów (|V|, kąt) na wspólnym wzorcu,
 *   3. tabela rezyduów pomiarów z flagą podejrzenia (LNR),
 *   4. panel detekcji złych danych (test χ² + LNR),
 *   5. uczciwe braki (węzły bez pomiaru) i ślad WHITE BOX w trybie eksperckim.
 *
 * Zero fizyki, zero ocen lokalnych — |V|, kąty, rezydua, χ² i flagi pochodzą
 * WYŁĄCZNIE z backendu. Estymacja WYMAGA pomiarów (jak zgodność powykonawcza):
 * bez pomiarów obliczenie jest niemożliwe (422 PL z backendu) — NIE fabrykujemy
 * pseudo-pomiarów. Bez przebiegu rozpływu → uczciwa instrukcja (bez API).
 */

import { useEffect, useMemo, useState } from 'react';
import './estymacja.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { akcjaNaprawcza, EkranAnalizy, usePoprawWModelu } from '../wzorzec';
import { useSwiezoscNaglowka } from '../../freshness';
import {
  fetchWymaganiaEstymacji,
  postEstymacjaStanu,
  type EstymacjaZadanie,
  type KrokSladu,
  type MetaTypuPomiaru,
  type TypPomiaru,
  type WidokEstymacji,
  type WymaganiaEstymacji,
  type WezelWymagan,
} from './api';
import {
  KLUCZ_WIERSZA_POMIARY,
  KLUCZ_WIERSZA_WEZLY,
  KOLUMNY_POMIARY,
  KOLUMNY_WEZLY,
  WIERSZ_EDYTORA_DOMYSLNY,
  naWierszePomiarow,
  naWierszeWezlow,
  naZalozeniaEstymacji,
  przebiegRozplywuEstymacji,
  typPomiaruPL,
  wymagaWezlaJ,
  zbudujZadanie,
  type WierszEdytora,
} from './model';
import {
  ESTYMACJA_STRINGS as S,
  ZNACZNIK_SYNTETYCZNY,
  fmtDokladny,
  fmtKV,
  fmtRezyduum,
  istotnoscZbieznosci,
  type IstotnoscStanu,
} from './strings';

// ---------------------------------------------------------------------------
// Elementy wspólne (chip, tag, panel stanu)
// ---------------------------------------------------------------------------

function Chip({
  etykieta,
  wartosc,
  istotnosc,
  testid,
}: {
  etykieta: string;
  wartosc: string | number;
  istotnosc: IstotnoscStanu;
  testid?: string;
}) {
  return (
    <div
      className={`mvd-est-chip mvd-est-chip--${istotnosc}`}
      data-testid={testid ?? 'mvd-est-chip'}
    >
      <span className="mvd-est-chip-liczba mvd-num">{wartosc}</span>
      <span className="mvd-est-chip-etykieta">{etykieta}</span>
    </div>
  );
}

function Tag({ tekst, istotnosc }: { tekst: string; istotnosc: IstotnoscStanu }) {
  return (
    <span className={`mvd-est-tag mvd-est-tag--${istotnosc}`} data-testid="mvd-est-tag">
      {tekst}
    </span>
  );
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
      className={wariant === 'blad' ? 'mvd-est-stan mvd-est-stan--blad' : 'mvd-est-stan'}
      data-testid={testid}
    >
      <p className="mvd-est-stan-title">{komunikat}</p>
      {opis && <p className="mvd-est-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel „Wymagane wejścia" (mapa węzeł→indeks, slack, min. pomiarów)
// ---------------------------------------------------------------------------

function PanelWymagan({
  wym,
  trybEkspercki,
}: {
  wym: WymaganiaEstymacji;
  trybEkspercki: boolean;
}) {
  return (
    <section className="mvd-est-wymagania" data-testid="mvd-est-wymagania">
      <h3 className="mvd-est-sekcja-tytul">{S.wymaganiaTytul}</h3>
      <dl className="mvd-est-wym-dane">
        <div className="mvd-est-wym-para">
          <dt>{S.wymBazaMocy}</dt>
          <dd className="mvd-num">
            {fmtRezyduum(wym.base_mva)} {S.jednMva}
          </dd>
        </div>
        <div className="mvd-est-wym-para">
          <dt>{S.wymWezelBilansujacy}</dt>
          <dd>{wym.slack_bus_ref}</dd>
        </div>
        <div className="mvd-est-wym-para">
          <dt>{S.wymLiczbaWezlow}</dt>
          <dd className="mvd-num">{wym.n_buses}</dd>
        </div>
        <div className="mvd-est-wym-para">
          <dt>{S.wymLiczbaStanow}</dt>
          <dd className="mvd-num">{wym.n_states}</dd>
        </div>
        <div className="mvd-est-wym-para">
          <dt>{S.wymMinPomiarow}</dt>
          <dd className="mvd-num" data-testid="mvd-est-min-pomiarow">
            {wym.min_measurements}
          </dd>
        </div>
      </dl>
      <p className="mvd-est-wym-note">{wym.note_pl}</p>
      <details className="mvd-est-wym-wezly">
        <summary>{S.wymWezlyTytul}</summary>
        <table className="mvd-est-wym-tabela" data-testid="mvd-est-wym-tabela">
          <thead>
            <tr>
              <th>{S.wymKolWezel}</th>
              {trybEkspercki && <th>{S.wymKolIndeks}</th>}
              <th className="mvd-est-th-prawo">{S.wymKolNapiecie}</th>
              <th>{S.wymKolRola}</th>
            </tr>
          </thead>
          <tbody>
            {wym.buses.map((b) => (
              <tr key={b.bus_ref}>
                <td>{b.name ?? b.bus_ref}</td>
                {trybEkspercki && <td className="mvd-num">{b.index}</td>}
                <td className="mvd-num mvd-est-td-prawo">
                  {b.voltage_kv !== null ? `${fmtKV(b.voltage_kv)} ${S.jednKV}` : S.kreska}
                </td>
                <td>{b.is_slack ? S.rolaSlack : S.rolaZwykly}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Edytor pomiarów (typ / węzeł / wartość / σ / węzeł „do")
// ---------------------------------------------------------------------------

function OpcjeWezlow({ buses }: { buses: readonly WezelWymagan[] }) {
  return (
    <>
      <option value="">{S.pomiarWezelPusty}</option>
      {buses.map((b) => (
        <option key={b.bus_ref} value={b.bus_ref}>
          {b.name ? `${b.name} (${b.bus_ref})` : b.bus_ref}
        </option>
      ))}
    </>
  );
}

interface EdytorProps {
  wiersze: WierszEdytora[];
  onWiersze: (aktualizacja: (poprz: WierszEdytora[]) => WierszEdytora[]) => void;
  buses: readonly WezelWymagan[];
  typy: readonly MetaTypuPomiaru[];
  alfa: string;
  onAlfa: (v: string) => void;
  progLnr: string;
  onProgLnr: (v: string) => void;
}

function Edytor({
  wiersze,
  onWiersze,
  buses,
  typy,
  alfa,
  onAlfa,
  progLnr,
  onProgLnr,
}: EdytorProps) {
  return (
    <div className="mvd-est-formularz">
      <section className="mvd-est-sekcja">
        <h3 className="mvd-est-sekcja-tytul">{S.pomiaryTytul}</h3>
        <p className="mvd-est-pole-opis">{S.pomiaryOpis}</p>
        <div className="mvd-est-edytor" data-testid="mvd-est-edytor">
          {wiersze.map((w, i) => {
            const flow = wymagaWezlaJ(w.meas_type, typy);
            return (
              <div key={i} className="mvd-est-wiersz" data-testid="mvd-est-wiersz">
                <div className="mvd-est-pole">
                  <label htmlFor={`mvd-est-typ-${i}`}>{S.pomiarTyp}</label>
                  <select
                    id={`mvd-est-typ-${i}`}
                    value={w.meas_type}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) =>
                          j === i ? { ...x, meas_type: e.target.value as TypPomiaru } : x,
                        ),
                      )
                    }
                    data-testid={`mvd-est-typ-${i}`}
                  >
                    {typy.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label_pl}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mvd-est-pole">
                  <label htmlFor={`mvd-est-wezel-${i}`}>{S.pomiarWezel}</label>
                  <select
                    id={`mvd-est-wezel-${i}`}
                    value={w.bus_ref}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) => (j === i ? { ...x, bus_ref: e.target.value } : x)),
                      )
                    }
                    data-testid={`mvd-est-wezel-${i}`}
                  >
                    <OpcjeWezlow buses={buses} />
                  </select>
                </div>
                <div className="mvd-est-pole">
                  <label htmlFor={`mvd-est-wartosc-${i}`}>{S.pomiarWartosc}</label>
                  <input
                    id={`mvd-est-wartosc-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={w.value}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      )
                    }
                    data-testid={`mvd-est-wartosc-${i}`}
                  />
                </div>
                <div className="mvd-est-pole">
                  <label htmlFor={`mvd-est-sigma-${i}`}>{S.pomiarSigma}</label>
                  <input
                    id={`mvd-est-sigma-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={w.sigma}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) => (j === i ? { ...x, sigma: e.target.value } : x)),
                      )
                    }
                    data-testid={`mvd-est-sigma-${i}`}
                  />
                </div>
                <div className="mvd-est-pole">
                  <label htmlFor={`mvd-est-wezelj-${i}`}>{S.pomiarWezelJ}</label>
                  <select
                    id={`mvd-est-wezelj-${i}`}
                    value={w.bus_j_ref}
                    disabled={!flow}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) => (j === i ? { ...x, bus_j_ref: e.target.value } : x)),
                      )
                    }
                    data-testid={`mvd-est-wezelj-${i}`}
                  >
                    {flow ? (
                      <OpcjeWezlow buses={buses} />
                    ) : (
                      <option value="">{S.pomiarWezelJNiedotyczy}</option>
                    )}
                  </select>
                </div>
                <button
                  type="button"
                  className="mvd-est-usun"
                  onClick={() =>
                    onWiersze((poprz) =>
                      poprz.length <= 1 ? poprz : poprz.filter((_, j) => j !== i),
                    )
                  }
                  disabled={wiersze.length <= 1}
                  aria-label={S.pomiarUsunAria}
                  data-testid={`mvd-est-usun-${i}`}
                >
                  {S.pomiarUsun}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="mvd-est-dodaj"
            onClick={() => onWiersze((poprz) => [...poprz, WIERSZ_EDYTORA_DOMYSLNY])}
            data-testid="mvd-est-dodaj"
          >
            {S.pomiarDodaj}
          </button>
        </div>
      </section>

      <section className="mvd-est-sekcja">
        <h3 className="mvd-est-sekcja-tytul">{S.parametryTytul}</h3>
        <p className="mvd-est-pole-opis">{S.parametryOpis}</p>
        <div className="mvd-est-parametry">
          <div className="mvd-est-pole">
            <label htmlFor="mvd-est-alfa">{S.paramAlfa}</label>
            <input
              id="mvd-est-alfa"
              type="text"
              inputMode="decimal"
              value={alfa}
              onChange={(e) => onAlfa(e.target.value)}
              data-testid="mvd-est-alfa"
            />
          </div>
          <div className="mvd-est-pole">
            <label htmlFor="mvd-est-prog-lnr">{S.paramProgLnr}</label>
            <input
              id="mvd-est-prog-lnr"
              type="text"
              inputMode="decimal"
              value={progLnr}
              onChange={(e) => onProgLnr(e.target.value)}
              data-testid="mvd-est-prog-lnr"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel detekcji złych danych (test χ² + LNR)
// ---------------------------------------------------------------------------

function PanelZlychDanych({
  dane,
  typy,
}: {
  dane: WidokEstymacji;
  typy: readonly MetaTypuPomiaru[];
}) {
  const bad = dane.bad_data;
  const poprawWModelu = usePoprawWModelu();
  const chiIstotnosc: IstotnoscStanu = bad.chi_square_flag ? 'err' : 'ok';
  const lnrIstotnosc: IstotnoscStanu = bad.lnr_flag ? 'err' : 'ok';
  return (
    <section className="mvd-est-bad" data-testid="mvd-est-bad">
      <h3 className="mvd-est-sekcja-tytul">{S.badTytul}</h3>
      <div className="mvd-est-bad-row">
        <span className="mvd-est-bad-etyk">{S.badTestChi}</span>
        <Tag
          tekst={bad.chi_square_flag ? S.badTestChiWykryto : S.badTestChiBrak}
          istotnosc={chiIstotnosc}
        />
        <span className="mvd-est-bad-liczby mvd-num">
          {S.badChiWartosc}: {fmtDokladny(bad.chi_square_value)} · {S.badChiProg}:{' '}
          {fmtDokladny(bad.chi_square_threshold)}
        </span>
      </div>
      <div className="mvd-est-bad-row">
        <span className="mvd-est-bad-etyk">{S.badLnr}</span>
        <Tag
          tekst={bad.lnr_flag ? S.badLnrPrzekroczony : S.badLnrOk}
          istotnosc={lnrIstotnosc}
        />
        <span className="mvd-est-bad-liczby mvd-num">
          {fmtRezyduum(bad.largest_normalized_residual)} · {S.badLnrProg}:{' '}
          {fmtRezyduum(bad.lnr_threshold)}
        </span>
      </div>
      {bad.lnr_measurement ? (
        <p className="mvd-est-bad-podejrzany" data-testid="mvd-est-podejrzany">
          {S.badPodejrzany}: {typPomiaruPL(bad.lnr_measurement.meas_type, typy)} ·{' '}
          {bad.lnr_measurement.bus_ref}
          {bad.lnr_measurement.bus_j_ref ? ` → ${bad.lnr_measurement.bus_j_ref}` : ''}
          {/* F-K4 (znalezisko Z4): odrzucony pomiar prowadzi do SZYNY, w ktorej go
              wykonano — inaczej projektant wie, ze cos jest zle, i nie ma stad
              drogi do miejsca. Przycisk tylko przy przekroczonym progu LNR. */}
          {bad.lnr_flag && (
            <button
              type="button"
              className="mvd-est-popraw"
              data-testid="mvd-est-popraw"
              title={akcjaNaprawcza('zle-dane-pomiarowe').opis}
              onClick={() =>
                poprawWModelu(
                  bad.lnr_measurement!.bus_ref,
                  'Bus',
                  bad.lnr_measurement!.bus_ref,
                  'zle-dane-pomiarowe',
                )
              }
            >
              {akcjaNaprawcza('zle-dane-pomiarowe').etykieta}
            </button>
          )}
        </p>
      ) : (
        <p className="mvd-est-bad-podejrzany mvd-est-bad-podejrzany--brak">
          {S.badBrakPodejrzanego}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX (tryb ekspercki) — skalary per iteracja + nota o macierzach
// ---------------------------------------------------------------------------

function SladWls({ kroki }: { kroki: readonly KrokSladu[] }) {
  const [widoczny, setWidoczny] = useState(false);
  if (kroki.length === 0) return null;
  return (
    <div className="mvd-est-slad-blok" data-testid="mvd-est-slad-blok">
      <button
        type="button"
        className="mvd-est-slad-btn"
        aria-expanded={widoczny}
        onClick={() => setWidoczny((s) => !s)}
        data-testid="mvd-est-slad-otworz"
      >
        {widoczny ? S.sladUkryj : S.sladPokaz}
      </button>
      {widoczny && (
        <div data-testid="mvd-est-slad">
          <span className="mvd-est-slad-tytul">{S.sladTytul}</span>
          <table className="mvd-est-slad-tabela">
            <thead>
              <tr>
                <th>{S.sladKolIteracja}</th>
                <th className="mvd-est-th-prawo">{S.sladKolChi}</th>
                <th className="mvd-est-th-prawo">{S.sladKolMaxRez}</th>
                <th className="mvd-est-th-prawo">{S.sladKolNormKroku}</th>
              </tr>
            </thead>
            <tbody>
              {kroki.map((k) => (
                <tr key={k.iteration}>
                  <td className="mvd-num">{k.iteration}</td>
                  <td className="mvd-num mvd-est-td-prawo">{fmtDokladny(k.objective_j)}</td>
                  <td className="mvd-num mvd-est-td-prawo">{fmtDokladny(k.max_abs_residual)}</td>
                  <td className="mvd-num mvd-est-td-prawo">{fmtDokladny(k.step_norm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mvd-est-slad-nota">{S.sladMacierze}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prezentacja wyniku estymacji
// ---------------------------------------------------------------------------

function WynikEstymacji({
  dane,
  runId,
  typy,
  trybZaawansowania,
  onOtworzDowod,
}: {
  dane: WidokEstymacji;
  runId: string;
  typy: readonly MetaTypuPomiaru[];
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}) {
  const trybEkspercki = trybZaawansowania === 'expert';
  // V12K-264/265: znacznik swiezosci + panel przyczyn z JEDNEJ derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);
  const wezleZbioru = new Set<string>();
  dane.missing_data.forEach((m) => m.bus_refs.forEach((r) => wezleZbioru.add(r)));
  const brakiWezlow = [...wezleZbioru];

  return (
    <div data-testid="mvd-est-wynik">
      <div className="mvd-est-podsumowanie" data-testid="mvd-est-podsumowanie">
        <Chip
          etykieta={S.podsumZbieznosc}
          wartosc={dane.converged ? S.zbieznyTak : S.zbieznyNie}
          istotnosc={istotnoscZbieznosci(dane.converged)}
          testid="mvd-est-chip-zbieznosc"
        />
        <Chip etykieta={S.podsumIteracje} wartosc={dane.iterations} istotnosc="neutral" />
        <Chip
          etykieta={S.podsumChi}
          wartosc={fmtDokladny(dane.objective_j)}
          istotnosc={dane.bad_data.chi_square_flag ? 'err' : 'ok'}
          testid="mvd-est-chip-chi"
        />
        <Chip etykieta={S.podsumStopnie} wartosc={dane.degrees_of_freedom} istotnosc="neutral" />
        <Chip etykieta={S.podsumPomiary} wartosc={dane.m_measurements} istotnosc="neutral" />
        <Chip etykieta={S.podsumStany} wartosc={dane.n_states} istotnosc="neutral" />
      </div>

      {dane.validation_status.includes(ZNACZNIK_SYNTETYCZNY) && (
        <section
          className="mvd-est-baner mvd-est-baner--warn"
          data-testid="mvd-est-baner-syntetyczny"
          role="note"
        >
          <h3 className="mvd-est-baner-tytul">{S.banerSyntetycznyTytul}</h3>
          <p className="mvd-est-baner-opis">{S.banerSyntetycznyOpis}</p>
        </section>
      )}

      <PanelZlychDanych dane={dane} typy={typy} />

      <EkranAnalizy
        naglowek={{ analizaPL: S.wezlyTytul, runId, ...swiezosc }}
        zalozenia={naZalozeniaEstymacji(dane)}
        kolumny={KOLUMNY_WEZLY}
        wiersze={naWierszeWezlow(dane.buses)}
        onOtworzDowod={onOtworzDowod}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_WEZLY}
      />

      <section className="mvd-est-pomiary-wynik" data-testid="mvd-est-pomiary-wynik">
        <h3 className="mvd-est-sekcja-tytul">{S.pomiaryWynikTytul}</h3>
        <EkranAnalizy
          // Druga tabela TEGO SAMEGO przebiegu — ta sama para rewizji (V12K-265).
          naglowek={{ analizaPL: S.pomiaryWynikTytul, runId, ...swiezosc }}
          zalozenia={[]}
          kolumny={KOLUMNY_POMIARY}
          wiersze={naWierszePomiarow(dane.measurements, typy)}
          onOtworzDowod={onOtworzDowod}
          trybZaawansowania={trybZaawansowania}
          kluczWiersza={KLUCZ_WIERSZA_POMIARY}
        />
      </section>

      {brakiWezlow.length > 0 && (
        <section className="mvd-est-braki" data-testid="mvd-est-braki">
          <h3 className="mvd-est-sekcja-tytul">{S.brakiTytul}</h3>
          <p className="mvd-est-pole-opis">{S.brakiOpis}</p>
          <p className="mvd-num mvd-est-braki-lista">{brakiWezlow.join(', ')}</p>
        </section>
      )}

      {trybEkspercki && dane.white_box && <SladWls kroki={dane.white_box} />}

      {trybEkspercki && (
        <dl className="mvd-est-eksp" data-testid="mvd-est-eksp">
          <div className="mvd-est-eksp-para">
            <dt>{S.ekspEstymateId}</dt>
            <dd className="mvd-num">{dane.estimate_id}</dd>
          </div>
          <div className="mvd-est-eksp-para">
            <dt>{S.ekspWersjaSolvera}</dt>
            <dd className="mvd-num">{dane.solver_version}</dd>
          </div>
          <div className="mvd-est-eksp-para">
            <dt>{S.ekspWalidacja}</dt>
            <dd className="mvd-num">{dane.validation_status}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zasób wymagań (GET) i estymacji (POST) — jawne stany
// ---------------------------------------------------------------------------

type StanWymagan =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WymaganiaEstymacji };

type StanEstymacji =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokEstymacji };

// ---------------------------------------------------------------------------
// Okno „Estymacja stanu (WLS)"
// ---------------------------------------------------------------------------

export interface EkranEstymacjiProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

export function EkranEstymacji({ trybZaawansowania, onOtworzDowod }: EkranEstymacjiProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  // Wybór przebiegu rozpływu (źródło Y-bus) — wspólny helper `model.ts`, nie
  // duplikat inline (Zero-Debt §5: inline dryfujący od helpera byłby niewidoczny
  // dla testu helpera).
  const przebieg = useMemo(
    () => przebiegRozplywuEstymacji(runs, activeRunId),
    [runs, activeRunId],
  );
  const runId = przebieg?.id ?? null;
  const trybEkspercki = trybZaawansowania === 'expert';

  const [stanWym, setStanWym] = useState<StanWymagan>({ rodzaj: 'ladowanie' });
  const [wiersze, setWiersze] = useState<WierszEdytora[]>([WIERSZ_EDYTORA_DOMYSLNY]);
  const [alfa, setAlfa] = useState('');
  const [progLnr, setProgLnr] = useState('');
  const [bledy, setBledy] = useState<readonly string[]>([]);
  const [zapytanie, setZapytanie] = useState<EstymacjaZadanie | null>(null);
  const [stanEst, setStanEst] = useState<StanEstymacji>({ rodzaj: 'idle' });

  // Pobranie wymaganych wejść przy zmianie przebiegu (mapa węzeł→indeks).
  useEffect(() => {
    if (!runId) return;
    let anulowane = false;
    setStanWym({ rodzaj: 'ladowanie' });
    setWiersze([WIERSZ_EDYTORA_DOMYSLNY]);
    setBledy([]);
    setZapytanie(null);
    setStanEst({ rodzaj: 'idle' });
    fetchWymaganiaEstymacji(runId)
      .then((dane) => {
        if (!anulowane) setStanWym({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : S.wymaganiaBlad;
        setStanWym({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, [runId]);

  // Jawny bieg estymacji (POST).
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStanEst({ rodzaj: 'ladowanie' });
    postEstymacjaStanu(zapytanie)
      .then((dane) => {
        if (!anulowane) setStanEst({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : S.blad;
        setStanEst({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  const unewaznij = () => {
    setZapytanie(null);
    setStanEst({ rodzaj: 'idle' });
  };

  const wymGotowe = stanWym.rodzaj === 'gotowe' ? stanWym.dane : null;

  const uruchom = () => {
    if (runId === null || wymGotowe === null) return;
    const wynik = zbudujZadanie({
      runId,
      wiersze,
      alfa,
      progLnr,
      typy: wymGotowe.measurement_types,
      includeTrace: trybEkspercki,
    });
    if (!wynik.ok) {
      setBledy(wynik.bledy);
      unewaznij();
      return;
    }
    setBledy([]);
    setZapytanie(wynik.zadanie);
  };

  // Bez przebiegu rozpływu — uczciwa instrukcja (bez wołań API).
  if (!przebieg) {
    return (
      <div className="mvd-est" data-testid="mvd-est-ekran">
        <header className="mvd-est-naglowek">
          <h2 className="mvd-est-tytul">{S.tytul}</h2>
          <p className="mvd-est-opis">{S.opisWstep}</p>
        </header>
        <StanPanel
          komunikat={S.brakPrzebiegu}
          opis={S.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-est-brak-przebiegu"
        />
      </div>
    );
  }

  return (
    <div className="mvd-est" data-testid="mvd-est-ekran">
      <header className="mvd-est-naglowek">
        <h2 className="mvd-est-tytul">{S.tytul}</h2>
        <p className="mvd-est-opis">{S.opisWstep}</p>
        {trybEkspercki && (
          <span className="mvd-est-run mvd-num" aria-label={S.runId}>
            {przebieg.id}
          </span>
        )}
      </header>

      {stanWym.rodzaj === 'ladowanie' && (
        <StanPanel
          komunikat={S.wymaganiaLadowanie}
          wariant="info"
          testid="mvd-est-wymagania-ladowanie"
        />
      )}
      {stanWym.rodzaj === 'blad' && (
        <StanPanel
          komunikat={S.wymaganiaBlad}
          opis={stanWym.komunikat}
          wariant="blad"
          testid="mvd-est-wymagania-blad"
        />
      )}

      {wymGotowe && (
        <>
          <PanelWymagan wym={wymGotowe} trybEkspercki={trybEkspercki} />

          <Edytor
            wiersze={wiersze}
            onWiersze={(aktualizacja) => {
              setWiersze(aktualizacja);
              unewaznij();
            }}
            buses={wymGotowe.buses}
            typy={wymGotowe.measurement_types}
            alfa={alfa}
            onAlfa={(v) => {
              setAlfa(v);
              unewaznij();
            }}
            progLnr={progLnr}
            onProgLnr={(v) => {
              setProgLnr(v);
              unewaznij();
            }}
          />

          <div className="mvd-est-akcje">
            <button
              type="button"
              className="mvd-est-oblicz"
              onClick={uruchom}
              data-testid="mvd-est-estymuj"
            >
              {zapytanie === null ? S.estymuj : S.estymujPonownie}
            </button>
          </div>

          {bledy.length > 0 && (
            <div className="mvd-est-bledy" data-testid="mvd-est-bledy">
              <p className="mvd-est-bledy-tytul">{S.bledyTytul}</p>
              <ul className="mvd-est-bledy-lista">
                {bledy.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {stanEst.rodzaj === 'ladowanie' && (
            <StanPanel komunikat={S.ladowanie} wariant="info" testid="mvd-est-ladowanie" />
          )}
          {stanEst.rodzaj === 'blad' && (
            <StanPanel
              komunikat={S.blad}
              opis={stanEst.komunikat}
              wariant="blad"
              testid="mvd-est-blad"
            />
          )}
          {stanEst.rodzaj === 'gotowe' && (
            <WynikEstymacji
              dane={stanEst.dane}
              runId={przebieg.id}
              typy={wymGotowe.measurement_types}
              trybZaawansowania={trybZaawansowania}
              onOtworzDowod={onOtworzDowod}
            />
          )}
        </>
      )}
    </div>
  );
}
