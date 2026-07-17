/**
 * Klient Reference Engine V1 dla nowej powłoki (kontrakt koordynacyjny
 * `docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md` §1.1, spec WIĄŻĄCA
 * `docs/sld/REFERENCE_ENGINE_SPEC_V1.md`, ruling V12K-060).
 *
 * ZAKAZ DRUGIEJ DEFINICJI (HANDOFF §3.1): typy raportu zgodności i etykiety
 * rodzajów pakietów są REEKSPORTOWANE z kontraktu `ui/enm-inspector/types.ts`
 * (bajtowo zgodnego z wątkiem SLD) — ten moduł niczego nie definiuje po raz
 * drugi; dokłada wyłącznie klienta HTTP listy pakietów wg kontraktu §1.1.
 *
 * `score_percent = null` ⇒ prezentować DOKŁADNIE jako „nie dotyczy"
 * (nigdy 0% ani 100%) — HANDOFF §3.3.
 */

export type {
  ReferencePackKind,
  ReferenceComplianceCheck,
  ReferencePackComplianceReport,
  ReferenceComplianceReport,
} from '../../ui/enm-inspector/types';
export { REFERENCE_PACK_KIND_LABELS_PL } from '../../ui/enm-inspector/types';
export { fetchReferenceCompliance } from '../../ui/enm-inspector/api';

import type { ReferencePackKind } from '../../ui/enm-inspector/types';

const API_BASE = '/api';

/** Pozycja listy pakietów referencyjnych (HANDOFF §1.1, `GET /api/reference/packs`). */
export interface ReferencePackSummary {
  pack_id: string;
  kind: ReferencePackKind;
  name_pl: string;
  version: string;
  status: string;
  switchgear_family_ref: string | null;
  source_document_refs: string[];
}

/** Konfiguracja celki producenta (pakiet `cell_configurations` — HANDOFF §1.1/§2.4). */
export interface ReferenceCellConfiguration {
  cell_code: string;
  name_pl: string;
  /** Skład standardowy vs opcja — podpowiedzi formularza kreatora. */
  standard: boolean;
  apparatus: string[];
  notes_pl?: string | null;
}

/** Reguła stacyjna pakietu OSD (HANDOFF §2.7 — `implemented=false` prezentować
 * informacyjnie z powodem z `description_pl`, nie jako błąd). */
export interface ReferenceStationRule {
  rule_code: string;
  description_pl: string;
  implemented: boolean;
}

/** Pełny pakiet referencyjny (HANDOFF §1.1, `GET /api/reference/packs/{pack_id}`). */
export interface ReferencePackFull extends ReferencePackSummary {
  field_profiles?: unknown;
  symbol_map?: unknown;
  cell_configurations?: ReferenceCellConfiguration[];
  station_rules?: ReferenceStationRule[];
  notes_pl?: string | null;
}

/** Pobierz listę pakietów referencyjnych (opcjonalny filtr rodzaju). */
export async function fetchReferencePacks(
  kind?: ReferencePackKind,
): Promise<ReferencePackSummary[]> {
  const response = await fetch(`${API_BASE}/reference/packs`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania pakietów referencyjnych: ${response.statusText}`);
  }
  const packs = (await response.json()) as ReferencePackSummary[];
  return kind == null ? packs : packs.filter((p) => p.kind === kind);
}

/** Pobierz pełny pakiet referencyjny po identyfikatorze. */
export async function fetchReferencePack(packId: string): Promise<ReferencePackFull> {
  const response = await fetch(`${API_BASE}/reference/packs/${packId}`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania pakietu referencyjnego: ${response.statusText}`);
  }
  return (await response.json()) as ReferencePackFull;
}
