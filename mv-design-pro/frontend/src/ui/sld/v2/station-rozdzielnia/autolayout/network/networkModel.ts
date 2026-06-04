/**
 * E3 NETWORK AUTO-LAYOUT — the read-only network MODEL (input to the network layout engine).
 *
 * E3 is the SCALE layer on top of E2 (the per-station layout): it places a whole radial MV
 * network — GPZ → trunk magistrala → lateral feeders → ~53 stations — in voltage bands and lets
 * each station be drawn by E2. This model is DISTILLED from the SAME backend ENM the solver runs
 * (sldNetwork53.ts, generated) — never a parallel hand-built representation. The engine turns it
 * into deterministic GEOMETRY; a thin renderer draws it with the E0/E1 canon symbols.
 */

/** GPZ — the 110/15 kV main supply substation at the head of the network. */
export interface NetworkGpz {
  readonly id: string; // "GPZ"
  readonly name: string;
  readonly hv_kv: number; // 110
  readonly sn_kv: number; // 15
}

/** One MV/LV station in the radial tree: a connection on the 15 kV feeder + its 15/0,4 transformer. */
export interface NetworkStation {
  readonly id: string; // stable "S01".."S53"
  readonly name: string;
  readonly kind: 'trunk' | 'lateral';
  readonly depth: number; // bus-hop distance from the GPZ (tie-break / info)
  readonly parent: string | null; // upstream STATION id (null ⇒ hangs off the GPZ)
  readonly sn_kv: number; // 15
  readonly nn_kv: number; // 0.4
  readonly trafo_mva: number | null;
  readonly der: readonly string[]; // gen_type tags on this station's nN bus (pv_inverter, bess, …)
  readonly nop_downstream: boolean; // this station heads the normally-open stub
}

/** A feeder segment parent→child (or GPZ→trunk-head). `open` ⇒ the normally-open sectionalizer. */
export interface NetworkEdge {
  readonly from: string; // station id or "GPZ"
  readonly to: string;
  readonly open: boolean;
}

/** The full read-only network the engine lays out. */
export interface SldNetworkModel {
  readonly schema: 'sld_network_model_v1';
  readonly gpz: NetworkGpz;
  readonly stations: readonly NetworkStation[];
  readonly edges: readonly NetworkEdge[];
  readonly nop_station: string | null;
  readonly voltages: readonly number[]; // distinct kV, descending (110, 15, 0.4)
  readonly source_hash: string; // backend ENM snapshot hash (provenance)
}
