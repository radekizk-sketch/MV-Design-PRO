/**
 * Klient biegu oceny zabezpieczeń (`protection_sn`) — urządzenia i nastawy z modelu,
 * prądy przekaźników z rozpływu zwarciowego wskazanego biegu (karta
 * BIEG-ZABEZPIECZEN-Z-MODELU). Trasy: `backend/src/api/protection_runs.py`.
 *
 * Kształt odpowiedzi 1:1 z `ProtectionResultResponse` (oceny z rekordem werdyktu
 * wyjaśnialnego, odmowy z brakami i akcjami naprawczymi, pominięte z przyczyną, świeżość).
 * ZERO fizyki: klient przenosi dane, nic nie liczy.
 */

import type { OcenaKryterium } from '../wzorzec/werdykt';
import type {
  OdmowaUrzadzenia,
  PominieteUrzadzenie,
} from '../../../ui/protection-coordination/types';
import type { WiarygodnoscOceny } from '../../../ui/protection-comparison/types';

/** Ocena urządzenia modelu w punkcie zwarcia jego strefy. */
export interface OcenaUrzadzeniaWPunkcie {
  device_id: string;
  nazwa_urzadzenia_pl: string;
  device_type_ref: string | null;
  protected_element_ref: string;
  fault_target_id: string;
  nazwa_punktu_pl: string;
  i_fault_a: number | null;
  i_pickup_a: number | null;
  t_trip_s: number | null;
  trip_state: 'TRIPS' | 'NO_TRIP';
  stopien_decydujacy: string | null;
  curve_kind: string | null;
  krotnosc_m: number | null;
  margin_percent: number | null;
  wiarygodnosc: WiarygodnoscOceny;
  wiarygodnosc_powod_pl: string;
  notes_pl: string;
  /** Stopnie urządzenia w tym punkcie (ślad: próg, charakterystyka, czas z rdzenia). */
  stopnie: StopienOceny[];
  ocena: OcenaKryterium;
}

/** Stopień w śladzie oceny punktu — pola czytane przez ekran (reszta to ślad White Box). */
export interface StopienOceny {
  funkcja: string;
  etykieta_pl: string;
  zadziala: boolean;
  t_s: number | null;
}

export interface PodsumowanieOceny {
  total_evaluations: number;
  trips_count: number;
  no_trip_count: number;
  unreliable_count: number;
  refused_devices_count: number;
  skipped_devices_count: number;
  min_trip_time_s: number | null;
  max_trip_time_s: number | null;
}

export interface WynikOcenyZabezpieczen {
  run_id: string;
  sc_run_id: string;
  protection_case_id: string;
  evaluations: OcenaUrzadzeniaWPunkcie[];
  odmowy: OdmowaUrzadzenia[];
  pominiete: PominieteUrzadzenie[];
  summary: PodsumowanieOceny;
  created_at: string;
  result_status: 'NONE' | 'FRESH' | 'OUTDATED';
  result_status_reason_pl: string;
}

interface OdpowiedzBiegu {
  id: string;
  status: 'CREATED' | 'RUNNING' | 'FINISHED' | 'FAILED';
  error_message: string | null;
}

async function tekstBledu(odpowiedz: Response, prefiks: string): Promise<string> {
  const tresc = (await odpowiedz.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof tresc?.detail === 'string' && tresc.detail.trim()
    ? tresc.detail
    : `${prefiks} (HTTP ${odpowiedz.status}).`;
}

/**
 * Utwórz i wykonaj bieg oceny zabezpieczeń na wskazanym biegu zwarciowym. Zwraca
 * identyfikator zakończonego biegu; bieg nieudany → błąd z komunikatem backendu.
 */
export async function uruchomOceneZabezpieczen(
  projectId: string,
  caseId: string,
  scRunId: string,
): Promise<string> {
  const utworzony = await fetch(`/api/projects/${encodeURIComponent(projectId)}/protection-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sc_run_id: scRunId, protection_case_id: caseId }),
  });
  if (!utworzony.ok) {
    throw new Error(await tekstBledu(utworzony, 'Nie udało się utworzyć biegu oceny'));
  }
  const bieg = (await utworzony.json()) as OdpowiedzBiegu;
  const wykonany = await fetch(`/api/protection-runs/${encodeURIComponent(bieg.id)}/execute`, {
    method: 'POST',
  });
  if (!wykonany.ok) {
    throw new Error(await tekstBledu(wykonany, 'Nie udało się wykonać biegu oceny'));
  }
  const wynik = (await wykonany.json()) as OdpowiedzBiegu;
  // Słownik statusu biegu kanonicznego (CREATED/RUNNING/FINISHED/FAILED).
  if (wynik.status !== 'FINISHED') {
    throw new Error(wynik.error_message ?? `Bieg oceny zakończył się statusem ${wynik.status}.`);
  }
  return wynik.id;
}

/** Wynik zakończonego biegu oceny zabezpieczeń (z polami świeżości). */
export async function pobierzWynikOcenyZabezpieczen(
  runId: string,
): Promise<WynikOcenyZabezpieczen> {
  const odpowiedz = await fetch(`/api/protection-runs/${encodeURIComponent(runId)}/results`);
  if (!odpowiedz.ok) {
    throw new Error(await tekstBledu(odpowiedz, 'Nie udało się wczytać wyniku oceny'));
  }
  return (await odpowiedz.json()) as WynikOcenyZabezpieczen;
}

