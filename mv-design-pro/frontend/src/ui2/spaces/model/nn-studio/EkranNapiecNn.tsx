/**
 * Zakładka NAPIĘCIA — profil napięcia wzdłuż trasy nN (karta P0.9, plan F §2).
 * Czyta `GET /api/quality/voltage-profile?run_id=&worst_nn=true` (P0.4) —
 * dekompozycja ΔU per odcinek na trasie źródło (SLACK)→najgorsza szyna nN,
 * z GOTOWEGO wyniku rozpływu mocy. Zero fizyki w UI — wyłącznie odczyt.
 */

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { fetchVoltageProfile, type SciezkiProfiluNn } from './nnSiteApi';
import { NN_STUDIO_STRINGS as T } from './strings';

function fmtKv(v: number): string {
  return `${v.toFixed(3).replace('.', ',')} kV`;
}
function fmtPct(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} %`;
}

type Stan =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly sciezka: SciezkiProfiluNn | null };

export function EkranNapiecNn() {
  const runId = usePowerFlowResultsStore((s) => s.runHeader?.id ?? null);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'ladowanie' });

  useEffect(() => {
    if (!runId) {
      setStan({ rodzaj: 'gotowe', sciezka: null });
      return;
    }
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    fetchVoltageProfile(runId, { worstNn: true })
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', sciezka: dane.segmenty ?? null });
      })
      .catch((e: unknown) => {
        if (!anulowane) setStan({ rodzaj: 'blad', komunikat: e instanceof Error ? e.message : 'Błąd' });
      });
    return () => {
      anulowane = true;
    };
  }, [runId]);

  if (!runId) {
    return (
      <div data-testid="mvd-nn-studio-napiecia-brak-rozplywu">
        <p className="mvd-nn-studio-info">{T.napieciaBrakRozplywu}</p>
        <p className="mvd-nn-studio-info">{T.napieciaBrakRozplywuAkcja}</p>
      </div>
    );
  }
  if (stan.rodzaj === 'ladowanie') {
    return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-napiecia-ladowanie">Wczytywanie…</p>;
  }
  if (stan.rodzaj === 'blad') {
    return <p className="mvd-nn-studio-blad" data-testid="mvd-nn-studio-napiecia-blad">{stan.komunikat}</p>;
  }
  if (!stan.sciezka || stan.sciezka.segments.length === 0) {
    return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-napiecia-brak-segmentow">{T.napieciaBrakSegmentow}</p>;
  }

  const sciezka = stan.sciezka;
  const dane = sciezka.segments.map((s) => ({ etykieta: s.to_bus, deltaU: s.delta_u_percent }));
  const sumaDeltaU = sciezka.segments.reduce((acc, s) => acc + s.delta_u_percent, 0);

  return (
    <div data-testid="mvd-nn-studio-napiecia">
      <p className="mvd-nn-studio-cel">{T.napieciaCelJednymZdaniem}</p>
      <BarChart width={720} height={260} data={dane} margin={{ top: 12, right: 20, left: 8, bottom: 40 }}>
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="etykieta"
          tick={{ fill: 'var(--mvd-muted)', fontSize: 10 }}
          stroke="var(--mvd-line)"
          angle={-30}
          textAnchor="end"
          height={60}
          label={{ value: T.napieciaOsX, position: 'insideBottom', offset: -4, fill: 'var(--mvd-muted)', fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtPct(v)}
          width={72}
        />
        <Tooltip formatter={(v: number) => fmtPct(v)} />
        <Bar dataKey="deltaU" name={T.napieciaKolDeltaUProc} fill="var(--mvd-accent)" isAnimationActive={false} />
      </BarChart>

      <table className="mvd-nn-studio-tabela-prosta" data-testid="mvd-nn-studio-napiecia-tabela">
        <thead>
          <tr>
            <th>{T.napieciaKolDo}</th>
            <th>U</th>
            <th>{T.napieciaKolDeltaU}</th>
            <th>{T.napieciaKolDeltaUProc}</th>
          </tr>
        </thead>
        <tbody>
          {sciezka.segments.map((s) => (
            <tr key={s.branch_id} data-testid="mvd-nn-studio-napiecia-wiersz">
              <td>{s.to_bus}</td>
              <td className="mvd-num">{fmtKv(s.u_to_kv)}</td>
              <td className="mvd-num">{fmtKv(s.delta_u_kv)}</td>
              <td className="mvd-num">{fmtPct(s.delta_u_percent)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>{T.napieciaSumaryczne}</td>
            <td className="mvd-num" data-testid="mvd-nn-studio-napiecia-suma">{fmtPct(sumaDeltaU)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
