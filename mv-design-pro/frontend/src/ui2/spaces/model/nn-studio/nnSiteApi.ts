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

// --- Arkusz obliczeń obwodów nN (`GET /enm/nn-circuit-sheet`, karta ARKUSZ-NN) ---

/**
 * Stan CZTEROWARTOŚCIOWY jednej wielkości wiersza arkusza — kształt 1:1 z
 * backendu (`application/analyses/nn_circuit_sheet.py::_wartosc/_brak/
 * _nie_dotyczy/_nierozstrzygalne`). Puste komórki nie istnieją: każde pole
 * niesie ALBO `wartosc` (status='OK') ALBO `reason_pl` (pozostałe statusy).
 */
export interface ArkuszWartosc<T> {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy' | 'nierozstrzygalne';
  readonly wartosc: T | null;
  readonly zrodlo_pl: string | null;
  readonly reason_pl: string | null;
}

export interface ArkuszObciazenie {
  readonly p_mw: number;
  readonly q_mvar: number;
  readonly s_mva: number;
  readonly cos_phi: number | null;
  readonly fazy: number;
  readonly liczba_odbiorow: number;
}

export interface ArkuszAparat {
  readonly kind: 'MCB' | 'FUSE_SWITCH' | 'MCCB';
  readonly nazwa: string;
  readonly in_a: number;
  readonly klasa_mcb: string | null;
  readonly nastawa_n: number | null;
  readonly ir_a: number | null;
}

export interface ArkuszIz {
  readonly iz_prime_a: number;
  readonly iz_katalogowe_a: number;
  readonly rozklad: Record<string, number> | null;
  readonly branch_ref_decydujacy: string;
  readonly segmenty: readonly {
    readonly branch_ref: string;
    readonly iz_katalogowe_a: number | null;
    readonly iz_prime_a: number | null;
    readonly status: string;
    readonly reason_pl: string | null;
  }[];
}

export interface ArkuszPrzewod {
  readonly branch_ref: string;
  readonly nazwa: string;
  readonly catalog_ref: string | null;
  readonly material: string | null;
  readonly przekroj_mm2: number | null;
  readonly gamma_ms_m: number | null;
}

export interface ArkuszKryterium {
  readonly status: 'spełnia' | 'nie spełnia' | 'nierozstrzygalne';
  readonly wartosci: Record<string, unknown>;
}

export interface ArkuszDeltaUOdcinek {
  readonly branch_ref: string;
  readonly delta_u_kv: number | null;
  readonly delta_u_percent: number | null;
}

export interface ArkuszDeltaU {
  readonly odcinkowe: readonly ArkuszDeltaUOdcinek[];
  readonly calkowity_kv: number;
  readonly calkowity_procent: number;
}

export interface ArkuszI2t {
  readonly wytrzymuje: boolean;
  readonly i2t_a2s: number | null;
  readonly i2t_dopuszczalne_a2s: number | null;
  readonly margines_procent: number | null;
  readonly prad_dopuszczalny_a: number | null;
}

export interface ArkuszStatusDoboru {
  readonly kwalifikuje_sie: boolean;
  readonly kryteria: readonly { readonly nazwa: string; readonly status: string; readonly uzasadnienie_pl: string }[];
}

export interface ArkuszWiersz {
  readonly nr: number;
  readonly wyszczegolnienie: string;
  readonly feeder_root_branch_ref: string;
  readonly worst_point_bus_ref: string;
  readonly worst_point_zrodlo: string;
  readonly obciazenie: ArkuszObciazenie;
  readonly ib: ArkuszWartosc<number>;
  readonly zrodlo_ib: 'rozpływ' | 'tabliczka';
  readonly aparat: ArkuszWartosc<ArkuszAparat>;
  readonly zapas_zabezpieczenia_procent: ArkuszWartosc<number>;
  readonly iz: ArkuszWartosc<ArkuszIz>;
  readonly k2_i2: ArkuszWartosc<{ readonly k2: number | null; readonly i2_a: number | null }>;
  readonly przewod: ArkuszWartosc<ArkuszPrzewod>;
  readonly kryterium_i_ib_in_iz: ArkuszWartosc<ArkuszKryterium>;
  readonly kryterium_ii_i2_iz: ArkuszWartosc<ArkuszKryterium>;
  readonly dlugosc_m: ArkuszWartosc<number>;
  readonly delta_u: ArkuszWartosc<ArkuszDeltaU>;
  readonly ik_max: ArkuszWartosc<number>;
  readonly ik_min: ArkuszWartosc<number>;
  readonly swz: ArkuszWartosc<ArkuszKryterium>;
  readonly i2t: ArkuszWartosc<ArkuszI2t>;
  readonly status_doboru: ArkuszWartosc<ArkuszStatusDoboru>;
  /** Provenance TEGO wiersza (identyczna z `WidokArkuszaNn.provenance` — karta
   *  ARKUSZ-NN wymaga wpisu PER WIERSZ, nie tylko raz na cały arkusz). */
  readonly provenance: ArkuszProvenance;
}

export interface ArkuszProvenance {
  readonly load_flow_run_id: string | null;
  readonly short_circuit_run_id: string | null;
  readonly fault_duration_s: number | null;
  readonly rewizja_modelu: string;
  readonly swiezosc: {
    readonly load_flow_aktualny: boolean | null;
    readonly short_circuit_aktualny: boolean | null;
  };
}

export interface WidokArkuszaNn {
  readonly status: 'OK' | 'brak danych';
  readonly station_ref?: string;
  readonly station_name?: string;
  readonly network_system?: string;
  readonly wiersze: readonly ArkuszWiersz[];
  readonly missing_data?: readonly string[];
  readonly reason_pl?: string | null;
  readonly provenance?: ArkuszProvenance;
}

export async function fetchNnCircuitSheet(
  caseId: string,
  stationRef: string,
  opts: { loadFlowRunId?: string; shortCircuitRunId?: string; faultDurationS?: number } = {},
): Promise<WidokArkuszaNn> {
  const params = new URLSearchParams({ station_ref: stationRef });
  if (opts.loadFlowRunId) params.set('load_flow_run_id', opts.loadFlowRunId);
  if (opts.shortCircuitRunId) params.set('short_circuit_run_id', opts.shortCircuitRunId);
  if (opts.faultDurationS !== undefined) params.set('fault_duration_s', String(opts.faultDurationS));
  const url = `/api/cases/${encodeURIComponent(caseId)}/enm/nn-circuit-sheet?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const detail = await r.json().catch(() => null) as { detail?: string } | null;
    throw new Error(detail?.detail || `Zapytanie o arkusz obliczeń nie powiodło się: ${r.status}`);
  }
  return r.json() as Promise<WidokArkuszaNn>;
}
