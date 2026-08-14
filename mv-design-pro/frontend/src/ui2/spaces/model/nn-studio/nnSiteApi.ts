/*
 * Klient danych nN STUDIO (karta P0.9) — czyta ISTNIEJĄCE, gotowe endpointy
 * backendu (P0.6/P0.7): pętla zwarcia per odpływ, werdykt SWZ, dobór aparatu,
 * profil napięć. ZERO fizyki tutaj — wyłącznie `fetch` + mapowanie 1:1 kształtu
 * JSON na typy TS (te same kontrakty co `SekcjaPetlaZwarcia.tsx`, `api.ts`
 * `jakosc/`), zero interpretacji liczb.
 */

// --- Pętla zwarcia per odpływ (`GET /enm/fault-loop-feeders`) ---

export interface KomponentPetliNn {
  readonly label: string;
  readonly r_ohm: number;
  readonly x_ohm: number;
  readonly magnitude_ohm: number;
}

export interface WynikPetliNn {
  readonly z_loop_ohm: { readonly re: number; readonly im: number; readonly magnitude: number };
  readonly ik_min_a: number;
  readonly ik_max_a: number;
  readonly components: readonly KomponentPetliNn[];
}

export interface PunktOdplywuNn {
  readonly bus_ref: string;
  readonly hop_count: number;
  readonly status: 'OK' | 'brak danych';
  readonly fault_loop: WynikPetliNn | null;
  readonly reason_pl: string | null;
}

export interface OdplywNn {
  readonly feeder_root_branch_ref: string;
  readonly points: readonly PunktOdplywuNn[];
  readonly worst_point_bus_ref: string | null;
}

export interface WidokOdplywowNn {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly station_ref?: string;
  readonly station_name?: string;
  readonly network_system?: string;
  readonly reason_pl?: string | null;
  readonly missing_data?: readonly string[];
  readonly transformer_ref?: string;
  readonly nn_bus_ref?: string;
  readonly feeders: readonly OdplywNn[];
}

export async function fetchFeederFaultLoop(caseId: string, stationRef: string): Promise<WidokOdplywowNn> {
  const url = `/api/cases/${encodeURIComponent(caseId)}/enm/fault-loop-feeders?station_ref=${encodeURIComponent(stationRef)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Zapytanie o pętlę zwarcia odpływów nie powiodło się: ${r.status}`);
  return r.json() as Promise<WidokOdplywowNn>;
}

// --- Werdykt SWZ (`GET /enm/swz`) ---

export interface WerdyktSwz {
  readonly status: 'spełnia' | 'nie spełnia' | 'nierozstrzygalne';
  readonly przyczyna_pl: string;
  readonly ik1_min_a: number;
  readonly ia_wymagane_a: number | null;
  readonly t_wymagany_s: number | null;
  readonly margines: number | null;
  readonly rodzaj_obwodu: string | null;
  readonly pasmo_u0: string | null;
}

export interface WidokSwz {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly station_ref?: string;
  readonly bus_ref?: string;
  readonly breaker_ref?: string;
  readonly reason_pl?: string | null;
  readonly missing_data?: readonly string[];
  readonly swz?: WerdyktSwz;
}

export async function fetchSwz(
  caseId: string,
  stationRef: string,
  busRef: string,
  breakerRef: string,
): Promise<WidokSwz> {
  const url =
    `/api/cases/${encodeURIComponent(caseId)}/enm/swz?station_ref=${encodeURIComponent(stationRef)}`
    + `&bus_ref=${encodeURIComponent(busRef)}&breaker_ref=${encodeURIComponent(breakerRef)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Zapytanie o SWZ nie powiodło się: ${r.status}`);
  return r.json() as Promise<WidokSwz>;
}

// --- Dobór aparatu nN (`GET /enm/nn-device-selection`) ---

export interface KryteriumDoboru {
  readonly nazwa: string;
  readonly status: 'spełnia' | 'nie spełnia' | 'nierozstrzygalne';
  readonly uzasadnienie_pl: string;
  readonly wartosci: Record<string, unknown>;
}

export interface KandydatDoboru {
  readonly id: string;
  readonly nazwa: string;
  readonly kind: 'MCB' | 'FUSE_SWITCH' | 'MCCB';
  readonly in_a: number;
  readonly zdolnosc_wylaczania_ka: number | null;
  readonly klasa_mcb: string | null;
  readonly fuse_breaking_capacity_ka: number | null;
  readonly manufacturer: string | null;
}

export interface WynikKandydataDoboru {
  readonly kandydat: KandydatDoboru;
  readonly kryteria: readonly KryteriumDoboru[];
  readonly kwalifikuje_sie: boolean;
}

export interface WidokDoboruNn {
  readonly status: 'OK' | 'brak danych';
  readonly station_ref?: string;
  readonly bus_ref?: string;
  readonly missing_data?: readonly string[];
  readonly reason_pl?: string | null;
  readonly dobor?: {
    readonly ib_a: number;
    readonly iz_prime_a: number;
    readonly ik_max_ka: number | null;
    readonly ik1_min_a: number;
    readonly u0_v: number;
    readonly kandydaci: readonly WynikKandydataDoboru[];
    readonly rekomendacja: KandydatDoboru | null;
    readonly deterministic_signature: string;
  };
}

export async function fetchDeviceSelection(
  caseId: string,
  stationRef: string,
  busRef: string,
  ibA: number,
  izPrimeA: number,
  ikMaxKa: number | null,
): Promise<WidokDoboruNn> {
  const params = new URLSearchParams({
    station_ref: stationRef,
    bus_ref: busRef,
    ib_a: String(ibA),
    iz_prime_a: String(izPrimeA),
  });
  if (ikMaxKa !== null) params.set('ik_max_ka', String(ikMaxKa));
  const url = `/api/cases/${encodeURIComponent(caseId)}/enm/nn-device-selection?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Zapytanie o dobór aparatu nie powiodło się: ${r.status}`);
  return r.json() as Promise<WidokDoboruNn>;
}

// --- Profil napięć + dekompozycja ΔU (`GET /api/quality/voltage-profile`) ---

export interface SegmentProfiluNn {
  readonly branch_id: string;
  readonly from_bus: string;
  readonly to_bus: string;
  readonly u_from_kv: number;
  readonly u_to_kv: number;
  readonly delta_u_kv: number;
  readonly delta_u_percent: number;
}

export interface SciezkiProfiluNn {
  readonly node_id: string;
  readonly source_id: string;
  readonly u_source_kv: number;
  readonly u_node_kv: number;
  readonly segments: readonly SegmentProfiluNn[];
}

export interface WidokProfiluNapiec {
  readonly segmenty?: SciezkiProfiluNn;
  readonly [klucz: string]: unknown;
}

export async function fetchVoltageProfile(
  runId: string,
  opts: { nodeRef?: string; worstNn?: boolean } = {},
): Promise<WidokProfiluNapiec> {
  const params = new URLSearchParams({ run_id: runId });
  if (opts.nodeRef) params.set('node_ref', opts.nodeRef);
  if (opts.worstNn) params.set('worst_nn', 'true');
  const url = `/api/quality/voltage-profile?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Zapytanie o profil napięć nie powiodło się: ${r.status}`);
  return r.json() as Promise<WidokProfiluNapiec>;
}
