/**
 * Zakładka ARKUSZ — arkusz obliczeń obwodów nN klasy projektu wykonawczego
 * (karta ARKUSZ-NN, docs/nn/ARKUSZ_OBLICZEN_NN_2026-08.md). Czyta
 * `GET /enm/nn-circuit-sheet` (agregator backendu — czysta kompozycja
 * istniejących dostawców, zero fizyki tu i tam). Jeden wiersz PER ODPŁYW
 * rozdzielnicy/stacji; wiersz rozwijalny pokazuje rozkład współczynników k
 * ułożenia, dekompozycję ΔU per odcinek i dowody kryteriów (i)/(ii)/SWZ.
 *
 * Bieg rozpływu/zwarciowy są OPCJONALNE parametry żądania (backend ich nie
 * wykrywa automatycznie — żaden ekran nN STUDIO nie ma dziś „ostatniego
 * biegu"; wzorzec identyczny z `EkranDoboruNn.tsx`: pola wejściowe zamiast
 * zgadywania). Bez nich kolumny zależne od biegu (Ib „z rozpływu", ΔU,
 * Ik″max, I²t) niosą uczciwy trzeci stan „brak danych" — stan zerowy z
 * jawną instrukcją (podaj run_id biegu powyżej), zero fabrykowanej liczby.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../../ui/app-state';
import { KreatorSiatka, PoleLiczbowe, PoleTekstowe } from '../../../kreatory/rama';
import { EdytowalnaTabela, type KolumnaEdytowalna } from '../../../shared';
import { etykietaStanu, fmtLiczba, fmtProcent, fmtStan } from './arkuszFormat';
import { budujCsvArkusza, pobierzCsv } from './arkuszCsv';
import { fetchNnCircuitSheet, type ArkuszWiersz, type WidokArkuszaNn } from './nnSiteApi';
import { NN_STUDIO_STRINGS as T } from './strings';

type Stan =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokArkuszaNn };

const APARAT_TYP_PL: Record<string, string> = {
  MCB: 'MCB',
  FUSE_SWITCH: 'Rozłącznik + wkładka gG',
  MCCB: 'Wyłącznik nN (MCCB)',
};

function opisAparatu(w: ArkuszWiersz): string {
  return fmtStan(w.aparat, (a) => {
    const typ = APARAT_TYP_PL[a.kind] ?? a.kind;
    return a.klasa_mcb ? `${typ} ${a.klasa_mcb}` : typ;
  });
}

function opisPrzewodu(w: ArkuszWiersz): string {
  return fmtStan(w.przewod, (p) => p.nazwa || p.catalog_ref || p.branch_ref);
}

function opisKryterium(k: ArkuszWiersz['kryterium_i_ib_in_iz']): string {
  return fmtStan(k, (v) => v.status);
}

function budujKolumny(): KolumnaEdytowalna<ArkuszWiersz>[] {
  return [
    { klucz: 'nr', etykieta: T.arkuszKolNr, mono: true, odczyt: (w) => String(w.nr), sortKey: (w) => w.nr },
    { klucz: 'wyszczegolnienie', etykieta: T.arkuszKolWyszczegolnienie, odczyt: (w) => w.wyszczegolnienie },
    {
      klucz: 'pi',
      etykieta: T.arkuszKolPi,
      jednostka: 'kW',
      mono: true,
      odczyt: (w) => fmtLiczba(w.obciazenie.p_mw * 1000, 2),
      sortKey: (w) => w.obciazenie.p_mw,
    },
    {
      klucz: 'cosfi',
      etykieta: T.arkuszKolCosFi,
      mono: true,
      odczyt: (w) => (w.obciazenie.cos_phi !== null ? fmtLiczba(w.obciazenie.cos_phi, 2) : '—'),
      sortKey: (w) => w.obciazenie.cos_phi ?? -1,
    },
    { klucz: 'fazy', etykieta: T.arkuszKolFazy, mono: true, odczyt: (w) => String(w.obciazenie.fazy) },
    {
      klucz: 'ib',
      etykieta: T.arkuszKolIb,
      jednostka: 'A',
      mono: true,
      odczyt: (w) => `${fmtStan(w.ib, (v) => fmtLiczba(v, 1))} (${w.zrodlo_ib})`,
      sortKey: (w) => w.ib.wartosc ?? -1,
    },
    { klucz: 'aparat', etykieta: T.arkuszKolZabezpieczenie, odczyt: opisAparatu },
    {
      klucz: 'in',
      etykieta: T.arkuszKolIn,
      jednostka: 'A',
      mono: true,
      odczyt: (w) => fmtStan(w.aparat, (a) => fmtLiczba(a.in_a, 0)),
      sortKey: (w) => w.aparat.wartosc?.in_a ?? -1,
    },
    {
      klucz: 'n',
      etykieta: T.arkuszKolNastawaN,
      mono: true,
      odczyt: (w) => fmtStan(w.aparat, (a) => (a.nastawa_n !== null ? fmtLiczba(a.nastawa_n, 2) : '—')),
    },
    {
      klucz: 'ir',
      etykieta: T.arkuszKolIr,
      jednostka: 'A',
      mono: true,
      odczyt: (w) => fmtStan(w.aparat, (a) => (a.ir_a !== null ? fmtLiczba(a.ir_a, 0) : '—')),
      sortKey: (w) => w.aparat.wartosc?.ir_a ?? -1,
    },
    {
      klucz: 'zapas',
      etykieta: T.arkuszKolZapas,
      jednostka: '%',
      mono: true,
      odczyt: (w) => fmtStan(w.zapas_zabezpieczenia_procent, (v) => fmtLiczba(v, 1)),
      sortKey: (w) => w.zapas_zabezpieczenia_procent.wartosc ?? -999,
      ostrzezenie: (w) => !((w.zapas_zabezpieczenia_procent.wartosc ?? 1) >= 0),
    },
    {
      klucz: 'iz',
      etykieta: T.arkuszKolIz,
      jednostka: 'A',
      mono: true,
      odczyt: (w) => fmtStan(w.iz, (v) => fmtLiczba(v.iz_prime_a, 0)),
      sortKey: (w) => w.iz.wartosc?.iz_prime_a ?? -1,
    },
    {
      klucz: 'k2',
      etykieta: T.arkuszKolK2,
      mono: true,
      odczyt: (w) => fmtStan(w.k2_i2, (v) => (v.k2 !== null ? fmtLiczba(v.k2, 2) : '—')),
    },
    {
      klucz: 'i2',
      etykieta: T.arkuszKolI2,
      jednostka: 'A',
      mono: true,
      odczyt: (w) => fmtStan(w.k2_i2, (v) => (v.i2_a !== null ? fmtLiczba(v.i2_a, 1) : '—')),
    },
    { klucz: 'przewod', etykieta: T.arkuszKolPrzewod, odczyt: opisPrzewodu },
    {
      klucz: 'przekroj',
      etykieta: T.arkuszKolPrzekroj,
      jednostka: 'mm²',
      mono: true,
      odczyt: (w) => fmtStan(w.przewod, (p) => (p.przekroj_mm2 !== null ? fmtLiczba(p.przekroj_mm2, 0) : '—')),
    },
    {
      klucz: 'gamma',
      etykieta: T.arkuszKolGamma,
      jednostka: 'MS/m',
      mono: true,
      odczyt: (w) => fmtStan(w.przewod, (p) => (p.gamma_ms_m !== null ? fmtLiczba(p.gamma_ms_m, 0) : '—')),
    },
    { klucz: 'kryt1', etykieta: T.arkuszKolKryt1, odczyt: (w) => opisKryterium(w.kryterium_i_ib_in_iz) },
    { klucz: 'kryt2', etykieta: T.arkuszKolKryt2, odczyt: (w) => opisKryterium(w.kryterium_ii_i2_iz) },
    {
      klucz: 'dlugosc',
      etykieta: T.arkuszKolDlugosc,
      jednostka: 'm',
      mono: true,
      odczyt: (w) => fmtStan(w.dlugosc_m, (v) => fmtLiczba(v, 0)),
      sortKey: (w) => w.dlugosc_m.wartosc ?? -1,
    },
    {
      klucz: 'deltau',
      etykieta: T.arkuszKolDeltaU,
      jednostka: '%',
      mono: true,
      odczyt: (w) => fmtStan(w.delta_u, (v) => fmtProcent(v.calkowity_procent, 2)),
      sortKey: (w) => w.delta_u.wartosc?.calkowity_procent ?? -1,
    },
    {
      klucz: 'ikmax',
      etykieta: T.arkuszKolIkMax,
      jednostka: 'kA',
      mono: true,
      odczyt: (w) => fmtStan(w.ik_max, (v) => fmtLiczba(v, 2)),
    },
    {
      klucz: 'ikmin',
      etykieta: T.arkuszKolIkMin,
      jednostka: 'A',
      mono: true,
      odczyt: (w) => fmtStan(w.ik_min, (v) => fmtLiczba(v, 0)),
    },
    { klucz: 'swz', etykieta: T.arkuszKolSwz, odczyt: (w) => opisKryterium(w.swz) },
    {
      klucz: 'i2t',
      etykieta: T.arkuszKolI2t,
      odczyt: (w) => fmtStan(w.i2t, (v) => (v.wytrzymuje ? T.arkuszWytrzymuje : T.arkuszNieWytrzymuje)),
    },
    {
      klucz: 'dobor',
      etykieta: T.arkuszKolDobor,
      odczyt: (w) => fmtStan(w.status_doboru, (v) => (v.kwalifikuje_sie ? T.doborTak : T.doborNie)),
    },
    {
      klucz: 'szczegoly',
      etykieta: T.arkuszKolSzczegoly,
      sortowalna: false,
      odczyt: () => T.arkuszAkcjaSzczegoly,
      edytor: { rodzaj: 'akcja', etykietaAkcji: T.arkuszAkcjaSzczegoly },
    },
  ];
}

function SzczegolyWiersza({ wiersz, onZamknij }: { wiersz: ArkuszWiersz; onZamknij: () => void }) {
  return (
    <div className="mvd-nn-studio-arkusz-szczegoly" data-testid="mvd-nn-studio-arkusz-szczegoly">
      <div className="mvd-nn-studio-arkusz-szczegoly-naglowek">
        <h3>{T.arkuszSzczegolyTytul}: {wiersz.wyszczegolnienie}</h3>
        <button type="button" onClick={onZamknij} data-testid="mvd-nn-studio-arkusz-szczegoly-zamknij">
          {T.arkuszZamknij}
        </button>
      </div>

      <h4>{T.arkuszSzczegolyRozkladK}</h4>
      {wiersz.iz.status === 'OK' && wiersz.iz.wartosc ? (
        <table className="mvd-nn-studio-tabela-prosta" data-testid="mvd-nn-studio-arkusz-rozklad-k">
          <thead>
            <tr>
              <th>{T.arkuszKolPrzewod}</th>
              <th>Iz katalogowe [A]</th>
              <th>Iz′ [A]</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {wiersz.iz.wartosc.segmenty.map((s) => (
              <tr key={s.branch_ref}>
                <td>{s.branch_ref}</td>
                <td className="mvd-num">{s.iz_katalogowe_a !== null ? fmtLiczba(s.iz_katalogowe_a, 0) : '—'}</td>
                <td className="mvd-num">{s.iz_prime_a !== null ? fmtLiczba(s.iz_prime_a, 0) : '—'}</td>
                <td>{s.status === 'OK' ? (s.reason_pl ?? 'OK') : etykietaStanu(s.status as 'brak danych' | 'nierozstrzygalne')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mvd-nn-studio-info">{wiersz.iz.reason_pl ?? T.arkuszBrakDanychSzczegolow}</p>
      )}

      <h4>{T.arkuszSzczegolyDeltaU}</h4>
      {wiersz.delta_u.status === 'OK' && wiersz.delta_u.wartosc ? (
        <table className="mvd-nn-studio-tabela-prosta" data-testid="mvd-nn-studio-arkusz-odcinki-deltau">
          <thead>
            <tr>
              <th>{T.arkuszKolPrzewod}</th>
              <th>ΔU [kV]</th>
              <th>ΔU [%]</th>
            </tr>
          </thead>
          <tbody>
            {wiersz.delta_u.wartosc.odcinkowe.map((o) => (
              <tr key={o.branch_ref}>
                <td>{o.branch_ref}</td>
                <td className="mvd-num">{o.delta_u_kv !== null ? fmtLiczba(o.delta_u_kv, 4) : '—'}</td>
                <td className="mvd-num">{o.delta_u_percent !== null ? fmtLiczba(o.delta_u_percent, 3) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mvd-nn-studio-info">{wiersz.delta_u.reason_pl ?? T.arkuszBrakDanychSzczegolow}</p>
      )}

      <h4>{T.arkuszSzczegolyDowodyKryteriow}</h4>
      <ul className="mvd-nn-studio-arkusz-dowody">
        <li>
          <strong>{T.arkuszKolKryt1}:</strong>{' '}
          {wiersz.kryterium_i_ib_in_iz.status === 'OK' && wiersz.kryterium_i_ib_in_iz.wartosc
            ? wiersz.kryterium_i_ib_in_iz.zrodlo_pl
            : wiersz.kryterium_i_ib_in_iz.reason_pl ?? T.arkuszBrakDanychSzczegolow}
        </li>
        <li>
          <strong>{T.arkuszKolKryt2}:</strong>{' '}
          {wiersz.kryterium_ii_i2_iz.status === 'OK' && wiersz.kryterium_ii_i2_iz.wartosc
            ? wiersz.kryterium_ii_i2_iz.zrodlo_pl
            : wiersz.kryterium_ii_i2_iz.reason_pl ?? T.arkuszBrakDanychSzczegolow}
        </li>
        <li>
          <strong>{T.arkuszKolSwz}:</strong>{' '}
          {wiersz.swz.status === 'OK' && wiersz.swz.wartosc
            ? wiersz.swz.zrodlo_pl
            : wiersz.swz.reason_pl ?? T.arkuszBrakDanychSzczegolow}
        </li>
      </ul>
    </div>
  );
}

export function EkranArkuszaNn({ stationRef }: { stationRef: string | null }) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [loadFlowRunId, setLoadFlowRunId] = useState('');
  const [shortCircuitRunId, setShortCircuitRunId] = useState('');
  const [faultDurationS, setFaultDurationS] = useState<number | null>(null);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'ladowanie' });
  const [wybranyOdplyw, setWybranyOdplyw] = useState<string | null>(null);

  const kolumny = useMemo(() => budujKolumny(), []);

  const wczytaj = useCallback(() => {
    if (!activeCaseId || !stationRef) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    fetchNnCircuitSheet(activeCaseId, stationRef, {
      loadFlowRunId: loadFlowRunId.trim() || undefined,
      shortCircuitRunId: shortCircuitRunId.trim() || undefined,
      faultDurationS: faultDurationS ?? undefined,
    })
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((e: unknown) => {
        if (!anulowane) setStan({ rodzaj: 'blad', komunikat: e instanceof Error ? e.message : T.arkuszBladDanych });
      });
    return () => {
      anulowane = true;
    };
  }, [activeCaseId, stationRef, loadFlowRunId, shortCircuitRunId, faultDurationS]);

  useEffect(() => {
    setWybranyOdplyw(null);
    return wczytaj();
  }, [activeCaseId, stationRef]);

  const wiersze = stan.rodzaj === 'gotowe' && stan.dane.status === 'OK' ? stan.dane.wiersze : [];
  const wierszWybrany = wiersze.find((w) => w.feeder_root_branch_ref === wybranyOdplyw) ?? null;

  const onAkcja = (wiersz: ArkuszWiersz, klucz: string) => {
    if (klucz === 'szczegoly') setWybranyOdplyw(wiersz.feeder_root_branch_ref);
  };

  const onEksportujCsv = () => {
    if (wiersze.length === 0) return;
    const tresc = budujCsvArkusza(kolumny, wiersze);
    const znacznikCzasu = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    pobierzCsv(tresc, `arkusz_obliczen_nn_${stationRef ?? 'stacja'}_${znacznikCzasu}.csv`);
  };

  return (
    <div data-testid="mvd-nn-studio-arkusz">
      <p className="mvd-nn-studio-cel">{T.arkuszCelJednymZdaniem}</p>

      <KreatorSiatka kolumny={3}>
        <PoleTekstowe
          etykieta={T.arkuszPoleLoadFlowRunId}
          wartosc={loadFlowRunId}
          onZmiana={setLoadFlowRunId}
          placeholder={T.arkuszPoleRunIdPlaceholder}
          pomoc={T.arkuszPoleLoadFlowRunIdPomoc}
          testid="mvd-nn-studio-arkusz-load-flow-run-id"
        />
        <PoleTekstowe
          etykieta={T.arkuszPoleShortCircuitRunId}
          wartosc={shortCircuitRunId}
          onZmiana={setShortCircuitRunId}
          placeholder={T.arkuszPoleRunIdPlaceholder}
          pomoc={T.arkuszPoleShortCircuitRunIdPomoc}
          testid="mvd-nn-studio-arkusz-short-circuit-run-id"
        />
        <PoleLiczbowe
          etykieta={T.arkuszPoleFaultDurationS}
          jednostka="s"
          wartosc={faultDurationS}
          onZmiana={setFaultDurationS}
          min={0}
          testid="mvd-nn-studio-arkusz-fault-duration"
        />
      </KreatorSiatka>

      <div className="mvd-nn-studio-arkusz-akcje">
        <button
          type="button"
          className="mvd-nn-studio-btn-glowny"
          onClick={wczytaj}
          disabled={!activeCaseId || !stationRef}
          data-testid="mvd-nn-studio-arkusz-odswiez"
        >
          {T.arkuszOdswiez}
        </button>
        <button
          type="button"
          onClick={onEksportujCsv}
          disabled={wiersze.length === 0}
          data-testid="mvd-nn-studio-arkusz-eksport-csv"
        >
          {T.arkuszEksportCsv}
        </button>
      </div>

      {stan.rodzaj === 'ladowanie' ? (
        <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-arkusz-ladowanie">
          Wczytywanie…
        </p>
      ) : null}
      {stan.rodzaj === 'blad' ? (
        <p className="mvd-nn-studio-blad" data-testid="mvd-nn-studio-arkusz-blad">
          {stan.komunikat}
        </p>
      ) : null}
      {stan.rodzaj === 'gotowe' && stan.dane.status === 'brak danych' ? (
        <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-arkusz-brak-danych">
          {stan.dane.reason_pl ?? T.arkuszBrakDanych}
        </p>
      ) : null}
      {stan.rodzaj === 'gotowe' && stan.dane.status === 'OK' && wiersze.length === 0 ? (
        <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-arkusz-brak-odplywow">
          {T.arkuszBrakOdplywow}
        </p>
      ) : null}
      {(loadFlowRunId.trim() === '' || shortCircuitRunId.trim() === '') && wiersze.length > 0 ? (
        <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-arkusz-podpowiedz-biegu">
          {T.arkuszPodpowiedzBiegu}
        </p>
      ) : null}

      {wiersze.length > 0 ? (
        <EdytowalnaTabela
          kolumny={kolumny}
          wiersze={wiersze}
          kluczWiersza={(w) => w.feeder_root_branch_ref}
          onEdytuj={() => {
            /* Arkusz jest tylko do odczytu — brak kolumn edytowalnych (edytor
               ustawiony wyłącznie dla kolumny akcji „Szczegóły"). */
          }}
          onAkcja={onAkcja}
          tekstPusty={T.arkuszBrakOdplywow}
          testid="mvd-nn-studio-arkusz-tabela"
        />
      ) : null}

      {wierszWybrany ? (
        <SzczegolyWiersza wiersz={wierszWybrany} onZamknij={() => setWybranyOdplyw(null)} />
      ) : null}
    </div>
  );
}
