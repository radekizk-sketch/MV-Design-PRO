/**
 * Ekran „Badania regulacji OLTC" (V12K-046, H2) — warstwa prezentacji.
 *
 * Konfiguruje i uruchamia badanie OLTC na aktywnym przypadku (kontrakt H1:
 * solver_input:{oltc_study,...} → run → global_results.oltc_*), a wynik rysuje
 * na wykresach/tabelach. ZERO fizyki — liczy backend.
 */

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { PoleLiczbowe, PoleTekstowe, PoleWyboru } from '../../kreatory/rama';
import {
  komunikatyKodow,
  pobierzRejestrGotowosci,
  type WpisRejestruGotowosci,
} from '../../kryteria/rejestrGotowosci';
import { SladWywodu } from '../wzorzec';
import {
  fmtDopuszczalna,
  fmtKv,
  fmtLiczbaPrzelaczen,
  fmtMw,
  fmtPozycja,
  opisKryterium,
  PARAMETRY_DOMYSLNE,
  uruchomBadanie,
  type CelOptymalizacji,
  type ParametryBadania,
  type RodzajBadania,
  type WynikBadania,
} from './oltcBadaniaModel';
import { OLTC_BADANIA_STRINGS as T } from './strings';
import { WykresProfilChart } from './WykresProfilChart';
import { WykresSweepChart } from './WykresSweepChart';
import './oltc.css';

export function EkranBadanOltc({
  klientRejestru = pobierzRejestrGotowosci,
}: {
  /** Wstrzykiwany klient kanonicznego rejestru kodów gotowości (domyślnie: końcówka API). */
  klientRejestru?: typeof pobierzRejestrGotowosci;
} = {}) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [params, setParams] = useState<ParametryBadania>(PARAMETRY_DOMYSLNE);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<WynikBadania | null>(null);
  const [rejestr, setRejestr] = useState<ReadonlyMap<string, WpisRejestruGotowosci> | null>(null);

  // Treść kodów gotowości pochodzi WYŁĄCZNIE z kanonu (bez własnej tablicy w UI).
  useEffect(() => {
    let aktywne = true;
    klientRejestru()
      .then((mapa) => {
        if (aktywne) setRejestr(mapa);
      })
      .catch(() => {
        // Brak rejestru = brak zdań dla kodów; readout wartości działa dalej.
        if (aktywne) setRejestr(null);
      });
    return () => {
      aktywne = false;
    };
  }, [klientRejestru]);

  const opis =
    params.rodzaj === 'sweep' ? T.opisSweep : params.rodzaj === 'annual_profile' ? T.opisProfil : T.opisOptim;

  async function onUruchom() {
    if (!activeCaseId) {
      setBlad(T.brakZakresu);
      return;
    }
    setLadowanie(true);
    setBlad(null);
    try {
      const w = await uruchomBadanie(activeCaseId, params);
      setWynik(w);
    } catch (e) {
      setBlad(e instanceof Error ? e.message : T.bladDomyslny);
      setWynik(null);
    } finally {
      setLadowanie(false);
    }
  }

  function ustawKrok(index: number, patch: Partial<{ label: string; load_scale: number }>) {
    setParams((p) => ({
      ...p,
      profil: p.profil.map((k, i) => (i === index ? { ...k, ...patch } : k)),
    }));
  }

  return (
    <section className="mvd-oltc" data-testid="mvd-oltc-badania">
      <header className="mvd-oltc-naglowek">
        <h2 className="mvd-oltc-tytul">{T.tytul}</h2>
        <p className="mvd-oltc-cel">{T.cel}</p>
      </header>

      <div className="mvd-oltc-konfiguracja">
        <PoleWyboru
          etykieta={T.rodzajBadania}
          wartosc={params.rodzaj}
          onZmiana={(v) => setParams((p) => ({ ...p, rodzaj: v as RodzajBadania }))}
          opcje={T.rodzaje}
          pomoc={opis}
          testid="mvd-oltc-rodzaj"
        />

        {params.rodzaj === 'optimize' ? (
          <div className="mvd-oltc-param-siatka">
            <PoleWyboru
              etykieta={T.celOptymalizacji}
              wartosc={params.cel}
              onZmiana={(v) => setParams((p) => ({ ...p, cel: v as CelOptymalizacji }))}
              opcje={T.cele}
              testid="mvd-oltc-cel"
            />
            {params.cel !== 'minimize_losses' ? (
              <PoleLiczbowe
                etykieta={T.napiecieCel}
                jednostka="kV"
                wartosc={params.napiecieCelKv}
                onZmiana={(v) => setParams((p) => ({ ...p, napiecieCelKv: v }))}
                krok={0.1}
                testid="mvd-oltc-napiecie-cel"
              />
            ) : null}
          </div>
        ) : null}

        {params.rodzaj === 'annual_profile' ? (
          <div className="mvd-oltc-profil" data-testid="mvd-oltc-profil-edytor">
            <h3 className="mvd-oltc-podtytul">{T.profilTytul}</h3>
            {params.profil.map((krok, index) => (
              <div key={index} className="mvd-oltc-profil-wiersz">
                <PoleTekstowe
                  etykieta={T.profilKrok}
                  wartosc={krok.label}
                  onZmiana={(v) => ustawKrok(index, { label: v })}
                  testid={`mvd-oltc-profil-etykieta-${index}`}
                />
                <PoleLiczbowe
                  etykieta={T.profilSkala}
                  wartosc={krok.load_scale}
                  onZmiana={(v) => ustawKrok(index, { load_scale: v ?? 0 })}
                  krok={0.1}
                  testid={`mvd-oltc-profil-skala-${index}`}
                />
                <button
                  type="button"
                  className="mvd-oltc-usun"
                  onClick={() =>
                    setParams((p) => ({ ...p, profil: p.profil.filter((_u, i) => i !== index) }))
                  }
                  data-testid={`mvd-oltc-profil-usun-${index}`}
                >
                  {T.profilUsun}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="mvd-oltc-dodaj"
              onClick={() =>
                setParams((p) => ({
                  ...p,
                  profil: [...p.profil, { label: `Krok ${p.profil.length + 1}`, load_scale: 1.0 }],
                }))
              }
              data-testid="mvd-oltc-profil-dodaj"
            >
              {T.profilDodaj}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="mvd-oltc-uruchom"
          onClick={onUruchom}
          disabled={ladowanie}
          data-testid="mvd-oltc-uruchom"
        >
          {ladowanie ? T.uruchamianie : T.uruchom}
        </button>
        {blad ? (
          <p className="mvd-oltc-blad" data-testid="mvd-oltc-blad">
            {blad}
          </p>
        ) : null}
      </div>

      <div className="mvd-oltc-wyniki">
        {!wynik ? (
          <p className="mvd-oltc-stan-zerowy" data-testid="mvd-oltc-stan-zerowy">
            {T.stanZerowy}
          </p>
        ) : null}

        {wynik?.sweep ? <WynikSweep wynik={wynik.sweep} /> : null}
        {wynik?.profil ? <WynikProfilu wynik={wynik.profil} /> : null}
        {wynik?.optymalizacja ? (
          <WynikOptymalizacji wynik={wynik.optymalizacja} rejestr={rejestr} />
        ) : null}
      </div>
    </section>
  );
}

function WynikSweep({ wynik }: { wynik: NonNullable<WynikBadania['sweep']> }) {
  return (
    <div data-testid="mvd-oltc-wynik-sweep">
      <WykresSweepChart punkty={wynik.points} />
      <div className="mvd-oltc-tabela-wrap">
        <table className="mvd-oltc-tabela">
          <thead>
            <tr>
              <th>{T.sweepTabelaPozycja}</th>
              <th>{T.sweepTabelaPrzekladnia}</th>
              <th>{T.sweepTabelaU}</th>
              <th>{T.sweepTabelaStraty}</th>
              <th>{T.sweepTabelaUmin}</th>
              <th>{T.sweepTabelaUmax}</th>
            </tr>
          </thead>
          <tbody>
            {wynik.points.map((p) => (
              <tr key={p.position}>
                <td>{fmtPozycja(p.position)}</td>
                <td>{p.tap_ratio.toFixed(4)}</td>
                <td>{fmtKv(p.controlled_bus_kv)}</td>
                <td>{fmtMw(p.losses_mw)}</td>
                <td>{fmtKv(p.min_bus_kv)}</td>
                <td>{fmtKv(p.max_bus_kv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Ślad obliczeń na żądanie — wywód {tekst, latex} z backendu (zasada KaTeX). */}
      <SladWywodu kroki={wynik.wywod ?? []} testIdPrefix="mvd-oltc-sweep-slad" />
    </div>
  );
}

function WynikProfilu({ wynik }: { wynik: NonNullable<WynikBadania['profil']> }) {
  const branchId = wynik.steps[0] ? Object.keys(wynik.steps[0].positions)[0] ?? '' : '';
  return (
    <div data-testid="mvd-oltc-wynik-profil">
      <WykresProfilChart kroki={wynik.steps} branchId={branchId} />
      <p className="mvd-oltc-podsumowanie">
        {T.profilPrzelaczenia(wynik.total_switch_count)} · {T.profilPozaPasmem(wynik.steps_outside_deadband)}
      </p>
      <div className="mvd-oltc-tabela-wrap">
        <table className="mvd-oltc-tabela">
          <thead>
            <tr>
              <th>{T.profilTabelaKrok}</th>
              <th>{T.profilTabelaSkala}</th>
              <th>{T.profilTabelaPozycja}</th>
              <th>{T.profilTabelaU}</th>
              <th>{T.profilTabelaPrzel}</th>
              <th>{T.profilTabelaPasmo}</th>
            </tr>
          </thead>
          <tbody>
            {wynik.steps.map((k) => (
              <tr key={k.index}>
                <td>{k.label}</td>
                <td>{k.load_scale.toFixed(2)}</td>
                <td>{fmtPozycja(k.positions[branchId])}</td>
                <td>{fmtKv(k.controlled_bus_kv[branchId])}</td>
                <td>{k.switch_count}</td>
                <td>{k.within_deadband[branchId] ? T.tak : T.nie}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Ślad obliczeń na żądanie — wywód {tekst, latex} z backendu (zasada KaTeX). */}
      <SladWywodu kroki={wynik.wywod ?? []} testIdPrefix="mvd-oltc-profil-slad" />
    </div>
  );
}

function WynikOptymalizacji({
  wynik,
  rejestr,
}: {
  wynik: NonNullable<WynikBadania['optymalizacja']>;
  rejestr: ReadonlyMap<string, WpisRejestruGotowosci> | null;
}) {
  const kryterium = opisKryterium(wynik.feasibility_criterion);
  const braki = komunikatyKodow(wynik.readiness_codes ?? [], rejestr);
  return (
    <div data-testid="mvd-oltc-wynik-optymalizacja">
      <h3 className="mvd-oltc-podtytul">{T.optimTytul}</h3>
      <div className="mvd-oltc-kpi">
        <span>
          {T.optimNajlepsza}:{' '}
          <strong>
            {wynik.best_position === null ? T.optimBrakPozycji : fmtPozycja(wynik.best_position)}
          </strong>
        </span>
        <span>
          {T.optimStart}: <strong>{fmtPozycja(wynik.initial_position)}</strong>
        </span>
        <span>
          {T.optimPrzelaczenia}: <strong>{fmtLiczbaPrzelaczen(wynik.switch_count)}</strong>
        </span>
      </div>
      {/* Kryterium, które zdecydowało o werdykcie — wartość + źródło (WHITE BOX). */}
      <p className="mvd-oltc-kryterium" data-testid="mvd-oltc-kryterium">
        {T.kryteriumTytul}: <strong>{kryterium.tresc}</strong>
        {kryterium.zrodlo ? (
          <span className="mvd-oltc-kryterium-zrodlo">
            {' · '}
            {T.kryteriumZrodlo}: {kryterium.zrodlo}
          </span>
        ) : null}
      </p>
      {braki.length > 0 ? (
        <ul className="mvd-oltc-braki" data-testid="mvd-oltc-kryterium-braki">
          {braki.map((tekst) => (
            <li key={tekst}>{tekst}</li>
          ))}
        </ul>
      ) : null}
      <div className="mvd-oltc-tabela-wrap">
        <table className="mvd-oltc-tabela">
          <thead>
            <tr>
              <th>{T.optimTabelaPozycja}</th>
              <th>{T.optimTabelaStraty}</th>
              <th>{T.optimTabelaU}</th>
              <th>{T.optimTabelaOdchylka}</th>
              <th>{T.optimTabelaKryterium}</th>
              <th>{T.optimTabelaDopuszczalna}</th>
            </tr>
          </thead>
          <tbody>
            {wynik.candidates.map((c) => (
              <tr
                key={c.position}
                className={c.position === wynik.best_position ? 'mvd-oltc-wiersz-najlepszy' : undefined}
                data-testid={c.position === wynik.best_position ? 'mvd-oltc-najlepszy' : undefined}
              >
                <td>{fmtPozycja(c.position)}</td>
                <td>{fmtMw(c.losses_mw)}</td>
                <td>{fmtKv(c.controlled_bus_kv)}</td>
                <td>{c.voltage_deviation_kv == null ? '—' : fmtKv(c.voltage_deviation_kv)}</td>
                <td>{c.objective_value.toFixed(4)}</td>
                <td>{fmtDopuszczalna(c.feasible)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Ślad obliczeń na żądanie — wywód {tekst, latex} z backendu (zasada KaTeX). */}
      <SladWywodu kroki={wynik.wywod ?? []} testIdPrefix="mvd-oltc-optim-slad" />
    </div>
  );
}
