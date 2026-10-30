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
import { EtykietaWerdyktu, KartaWerdyktu } from '../../ui2/wyniki/wzorzec/KartaWerdyktu';

/**
 * Pakiet jednej stacji. Karta WERDYKT-MIGRACJA-190: ekran nie wydaje własnego werdyktu
 * pakietu („Weryfikacja pozytywna” / „Wymaga sprawdzenia” z flagi `all_pass`) i nie koloruje
 * dowodu z flagi `pass_status` — każdy dowód pokazuje etykietę SWOJEGO rekordu W
 * (`EtykietaWerdyktu`), zdanie rekordu i pełny rekord do rozwinięcia (`KartaWerdyktu`).
 * Agregat nie zastępuje składników; brak danych jest osobną pozycją, nigdy zgodnością.
 */
function PakietStacji({ pakiet }: { pakiet: Audit2ProofPackResponse }): JSX.Element {
  return (
    <div
      data-testid="audit2-pakiet-stacji"
      data-station-name={pakiet.station_nazwa}
      className="space-y-1 rounded border border-slate-200 bg-white p-2"
    >
      <div className="text-xs" data-testid="audit2-pakiet-naglowek">
        <strong>{pakiet.station_nazwa}</strong> · {pakiet.proof_count} dowodów,{' '}
        {pakiet.braki_danych.length} braków danych.
      </div>
      {pakiet.proofs.map((dowod) => (
        <div
          key={dowod.proof_id}
          data-testid="audit2-proof"
          data-proof-type={dowod.proof_type}
          data-status={dowod.wymaganie.status_maszynowy}
          className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-800"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{dowod.rodzaj_pl}</span>
            <EtykietaWerdyktu
              etykieta={dowod.wymaganie.etykieta}
              status={dowod.wymaganie.status_maszynowy}
              testid="audit2-proof-etykieta"
              zwarta
            />
          </div>
          <div className="mt-0.5">{dowod.wymaganie.wyjasnienie.zdanie_pl}</div>
          <details data-testid="audit2-proof-rekord" className="mt-1">
            <summary className="cursor-pointer text-slate-600">Pełny rekord dowodu</summary>
            <div className="mt-1">
              <KartaWerdyktu rekord={dowod.wymaganie} naglowek={dowod.rodzaj_pl} />
            </div>
          </details>
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
