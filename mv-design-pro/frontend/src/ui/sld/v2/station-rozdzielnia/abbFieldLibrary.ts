/**
 * Authoritative ABB UniSwitch field-type library for the SN switchgear station
 * (rozdzielnia SN) v2 renderer.
 *
 * This module is the SINGLE source that maps a switchgear field (its canonical
 * role + its apparatus stack) to an ABB UniSwitch cell type, and the SINGLE
 * place where each cell type declares which symbol primitives it draws and at
 * which detail level. The renderer and geometry both consume this module — no
 * other place may map symbols to field types.
 *
 * The cell-type set is CLOSED and taken verbatim from the ABB UniSwitch catalog
 * §4 "Rodzaje pól". Apparatus kinds are the ENM BayPrimaryDevice vocabulary
 * (subset relevant to the SN single-line view).
 *
 * Layer: presentation contract only — NO physics, NO model mutation.
 */

import type { StationApparatus, StationFieldRole } from "./contract";
import type { StationDetailLevel } from "./geometry";

/**
 * Closed set of ABB UniSwitch cell types (catalog §4 "Rodzaje pól").
 *
 * - SDC  — Pole z rozłącznikiem (line cell: 3-pos switch + CT + cable head)
 * - SDF  — Pole z rozłącznikiem i bezpiecznikami (transformer cell: 3-pos + fuses + ES)
 * - CBC  — Pole z wyłącznikiem (breaker cell: CB + 3-pos switch + CT + cable head)
 * - DBC  — Pole bezpośredniego zasilania szyn (direct busbar in-feed, no switching)
 * - BRC  — Pole wzniosu szynowego (bus riser: 3-pos switch + riser)
 * - SEC  — Pole sekcjonujące (sectionaliser: 3-pos switch)
 * - SBC  — Pole sekcjonujące z wyłącznikiem (sectionaliser with breaker)
 * - SMC  — Pole sprzęgłowe (coupler = CBC cell + BRC cell across two sections)
 * - SDM_V — Pole pomiaru napięcia (voltage metering: VT + fuses)
 * - SDM_C — Pole pomiaru prądu (current metering: CT only)
 */
export type AbbCellType =
  | "SDC"
  | "SDF"
  | "CBC"
  | "DBC"
  | "BRC"
  | "SEC"
  | "SBC"
  | "SMC"
  | "SDM_V"
  | "SDM_C";

/** Per-cell-type catalog metadata. */
export interface AbbCellTypeMeta {
  /** Catalog cell-type code. */
  code: AbbCellType;
  /** Polish catalog name ("Rodzaj pola"). */
  namePl: string;
  /** Short Polish description of the cell function. */
  functionPl: string;
  /**
   * Ordered apparatus kinds the cell carries from busbar downward. This is the
   * canonical ABB stack; the actual field may carry a subset (e.g. optional VT).
   */
  apparatusOrder: StationApparatus[];
  /** Canonical field roles this cell type fulfils. */
  roles: StationFieldRole[];
}

/**
 * The CLOSED cell-type catalog. Apparatus order and roles are anchored 1:1 to
 * the ABB UniSwitch catalog §4 facts.
 */
export const ABB_CELL_LIBRARY: Record<AbbCellType, AbbCellTypeMeta> = {
  SDC: {
    code: "SDC",
    namePl: "Pole z rozłącznikiem",
    functionPl: "Pole liniowe z rozłącznikiem trzypołożeniowym",
    apparatusOrder: ["LOAD_SWITCH", "CT", "CABLE_HEAD"],
    roles: ["LINIA_IN", "LINIA_OUT", "LINIA_ODG"],
  },
  SDF: {
    code: "SDF",
    namePl: "Pole z rozłącznikiem i bezpiecznikami",
    functionPl: "Pole transformatorowe z bezpiecznikami WN",
    apparatusOrder: ["LOAD_SWITCH", "FUSE", "ES", "CABLE_HEAD"],
    roles: ["TRANSFORMATOROWE"],
  },
  CBC: {
    code: "CBC",
    namePl: "Pole z wyłącznikiem",
    functionPl: "Pole z wyłącznikiem i rozłącznikiem trzypołożeniowym",
    apparatusOrder: ["CB", "LOAD_SWITCH", "CT", "CABLE_HEAD"],
    roles: ["LINIA_IN", "LINIA_OUT", "LINIA_ODG", "TRANSFORMATOROWE"],
  },
  DBC: {
    code: "DBC",
    namePl: "Pole bezpośredniego zasilania szyn",
    functionPl: "Bezpośrednie zasilanie szyn (bez aparatury łączeniowej)",
    apparatusOrder: ["CABLE_HEAD"],
    roles: ["LINIA_IN"],
  },
  BRC: {
    code: "BRC",
    namePl: "Pole wzniosu szynowego",
    functionPl: "Wznios szynowy z rozłącznikiem trzypołożeniowym",
    apparatusOrder: ["LOAD_SWITCH"],
    roles: ["SPRZEGLO"],
  },
  SEC: {
    code: "SEC",
    namePl: "Pole sekcjonujące",
    functionPl: "Sekcjonowanie szyn rozłącznikiem trzypołożeniowym",
    apparatusOrder: ["LOAD_SWITCH"],
    roles: ["SPRZEGLO"],
  },
  SBC: {
    code: "SBC",
    namePl: "Pole sekcjonujące z wyłącznikiem",
    functionPl: "Sekcjonowanie szyn z wyłącznikiem i rozłącznikiem",
    apparatusOrder: ["CB", "LOAD_SWITCH"],
    roles: ["SPRZEGLO"],
  },
  SMC: {
    code: "SMC",
    namePl: "Pole sprzęgłowe",
    functionPl: "Sprzęgło: pole z wyłącznikiem (CBC) + pole wzniosu szynowego (BRC)",
    apparatusOrder: ["CB", "LOAD_SWITCH"],
    roles: ["SPRZEGLO"],
  },
  SDM_V: {
    code: "SDM_V",
    namePl: "Pole pomiaru napięcia",
    functionPl: "Pomiar napięcia (przekładniki VT + bezpieczniki)",
    apparatusOrder: ["VT", "FUSE"],
    roles: ["POMIAROWE"],
  },
  SDM_C: {
    code: "SDM_C",
    namePl: "Pole pomiaru prądu",
    functionPl: "Pomiar prądu (przekładniki CT)",
    apparatusOrder: ["CT"],
    roles: ["POMIAROWE"],
  },
};

function hasKind(kinds: readonly StationApparatus[], kind: StationApparatus): boolean {
  return kinds.includes(kind);
}

function hasAnySwitching(kinds: readonly StationApparatus[]): boolean {
  return hasKind(kinds, "CB") || hasKind(kinds, "LOAD_SWITCH") || hasKind(kinds, "DS");
}

/**
 * Deterministically classify a field into an ABB cell type from its canonical
 * role and apparatus stack. Anchored 1:1 to the catalog §4 facts:
 *
 * - TRANSFORMATOROWE + FUSE      → SDF
 * - TRANSFORMATOROWE + CB        → CBC
 * - LINIA_* + CB                 → CBC, else (with a switch) → SDC
 * - LINIA_IN with no switching   → DBC (direct busbar in-feed)
 * - SPRZEGLO                     → SMC (coupler = CBC + BRC cells)
 * - POMIAROWE: VT only           → SDM_V; CT only → SDM_C
 *
 * The classification is total over the closed role set; an explicit fallback to
 * SDC keeps the function deterministic for any line-like field.
 */
export function classifyAbbCellType(
  role: StationFieldRole,
  apparatusKinds: readonly StationApparatus[],
): AbbCellType {
  switch (role) {
    case "TRANSFORMATOROWE":
      if (hasKind(apparatusKinds, "FUSE")) return "SDF";
      if (hasKind(apparatusKinds, "CB")) return "CBC";
      return "SDF";
    case "LINIA_IN":
    case "LINIA_OUT":
    case "LINIA_ODG":
      if (hasKind(apparatusKinds, "CB")) return "CBC";
      if (!hasAnySwitching(apparatusKinds)) return "DBC";
      return "SDC";
    case "SPRZEGLO":
      return "SMC";
    case "POMIAROWE":
      if (hasKind(apparatusKinds, "VT")) return "SDM_V";
      return "SDM_C";
    default:
      return "SDC";
  }
}

/**
 * A symbol the renderer draws for a cell, named by the apparatus kind plus its
 * role in the IEC designation scheme (Q1 breaker, Q2 bus disconnector, etc.).
 */
export interface AbbSymbolDescriptor {
  /** Apparatus kind drawn (drives which primitive the component picks). */
  kind: StationApparatus;
  /** IEC device designation (e.g. "Q1", "Q2", "Q9", "T1"). */
  designation: string;
  /**
   * Whether this apparatus is the three-position load-break switch (rozłącznik
   * trzypołożeniowy). When true the renderer uses the 3-position symbol and the
   * earthing position is integral to this device.
   */
  threePosition: boolean;
}

/**
 * IEC designation for an apparatus kind given its order in the stack. ABB cells
 * conventionally label the breaker Q1, the bus switch/disconnector Q2, the
 * earthing switch Q9, instrument transformers T-series.
 */
function designate(kind: StationApparatus, indexOfKind: number): string {
  switch (kind) {
    case "CB":
      return "Q1";
    case "LOAD_SWITCH":
      return "Q2";
    case "DS":
      return "Q2";
    case "ES":
      return "Q9";
    case "CT":
      return indexOfKind === 0 ? "T1" : `T${indexOfKind + 1}`;
    case "VT":
      return "T5";
    case "FUSE":
      return "F1";
    case "CABLE_HEAD":
      return "W1";
    case "TRANSFORMER_DEVICE":
      return "TR";
    default:
      return "";
  }
}

/**
 * The three-position load-break switch is the ABB signature apparatus. In the
 * single-line view it is the LOAD_SWITCH slot of every UniSwitch cell.
 */
function isThreePosition(kind: StationApparatus): boolean {
  return kind === "LOAD_SWITCH";
}

/**
 * Produce the ordered symbol descriptors a cell draws at a given detail level.
 *
 * Detail GROWS WITHIN the cell:
 *   far    → primary switching apparatus only (1 symbol)
 *   closer → switching + first instrument transformer (2 symbols)
 *   close  → full apparatus stack
 *
 * The apparatus list passed in is the field's actual stack (already a subset of
 * the catalog apparatusOrder), so optional devices (e.g. VT) are honoured.
 */
export function abbSymbolDescriptors(
  apparatus: readonly StationApparatus[],
  level: StationDetailLevel,
): AbbSymbolDescriptor[] {
  let visible: readonly StationApparatus[];
  if (level === "far") {
    visible = apparatus.slice(0, 1);
  } else if (level === "closer") {
    visible = apparatus.slice(0, 2);
  } else {
    visible = apparatus;
  }
  const seen: Record<string, number> = {};
  return visible.map((kind) => {
    const idxOfKind = seen[kind] ?? 0;
    seen[kind] = idxOfKind + 1;
    return {
      kind,
      designation: designate(kind, idxOfKind),
      threePosition: isThreePosition(kind),
    };
  });
}

/** Convenience: catalog metadata for a cell type. */
export function abbCellMeta(cellType: AbbCellType): AbbCellTypeMeta {
  return ABB_CELL_LIBRARY[cellType];
}
