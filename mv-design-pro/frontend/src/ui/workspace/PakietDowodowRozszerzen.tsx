/**
 * Pakiet dowodów walidacji rozszerzeń stacji — prezentacja pakietu złożonego przez BACKEND
 * (`POST /api/v1/projects/{id}/audit2-station-config/_validate-all`, karta PROOFPACK-KONTRAKT).
 *
 * Ekran niczego nie liczy i niczego nie składa: pokazuje dla każdej stacji w zakresie jej
 * nazwę z modelu, dowody z polską nazwą rodzaju i jawne braki danych z przyczyną. Rodzaj
 * bez danych nie znika i nie wygląda na spełniony.
 */

import type {
  Audit2ProjectProofPackResponse,
  Audit2ProofPackResponse,
} from '../network-build/station-der';
import { auditProofPackStatus } from './routerPureHelpers';

function PakietStacji({ pakiet }: { pakiet: Audit2ProofPackResponse }): JSX.Element {
  const status = auditProofPackStatus(pakiet);
  return (
    <div
      data-testid="audit2-pakiet-stacji"
      data-station-name={pakiet.station_nazwa}
      className="space-y-1 rounded border border-slate-200 bg-white p-2"
    >
      <div className="text-xs">
        <strong>{pakiet.station_nazwa}</strong>{' '}
        <span data-testid="audit2-pakiet-status" className={status.className}>
          {status.label}
        </span>{' '}
        · {pakiet.proof_count} dowodów, {pakiet.fail_count} pozycji kontroli,{' '}
        {pakiet.braki_danych.length} braków danych.
      </div>
      {pakiet.proofs.map((dowod) => (
        <div
          key={dowod.proof_id}
          data-testid="audit2-proof"
          data-proof-type={dowod.proof_type}
          className={
            'rounded border px-2 py-1 text-[11px] '
            + (dowod.pass_status
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-rose-300 bg-rose-50 text-rose-800')
          }
        >
          <span className="font-medium">{dowod.rodzaj_pl}</span>: {dowod.summary_pl}
        </div>
      ))}
      {pakiet.braki_danych.map((brak, indeks) => (
        <div
          key={`${brak.proof_type}-${indeks}`}
          data-testid="audit2-brak-danych"
          data-proof-type={brak.proof_type}
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
        >
          <span className="font-medium">{brak.rodzaj_pl}</span> — brak danych: {brak.przyczyna_pl}
        </div>
      ))}
    </div>
  );
}

export function PakietDowodowProjektu({
  dane,
}: {
  dane: Audit2ProjectProofPackResponse;
}): JSX.Element {
  if (dane.per_station.length === 0) {
    return (
      <div data-testid="audit2-proof-result" className="mt-3 text-xs text-slate-600">
        Projekt nie ma stacji w modelu ani zapisanych konfiguracji stacji — pakiet jest pusty.
      </div>
    );
  }
  return (
    <div data-testid="audit2-proof-result" className="mt-3 space-y-2">
      {dane.per_station.map((pakiet) => (
        <PakietStacji key={pakiet.station_id} pakiet={pakiet} />
      ))}
    </div>
  );
}
