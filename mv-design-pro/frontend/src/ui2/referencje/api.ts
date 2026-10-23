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
  RekordBrakuPakietu,
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

/** Publiczny katalog ENEA — metadane, bez treści chronionych dokumentów. */
export interface EneaSourceDocument {
  id: string;
  title: string;
  family: 'standard' | 'iriesd';
  area: 'SN' | 'nN' | 'WN' | '110/SN';
  effective_from: string | null;
  effective_to: string | null;
  url: string | null;
  index_url: string;
  engineering_scope: string;
}

export interface EneaSourceCatalog {
  as_of: string;
  sources: EneaSourceDocument[];
}

/** Pełny pakiet referencyjny (HANDOFF §1.1, `GET /api/reference/packs/{pack_id}`). */
export interface ReferencePackFull extends ReferencePackSummary {
  field_profiles?: unknown;
  symbol_map?: unknown;
  cell_configurations?: ReferenceCellConfiguration[];
  station_rules?: ReferenceStationRule[];
  notes_pl?: string | null;
  source_catalog?: EneaSourceCatalog;
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

/** Dowód konkretnego punktu dokumentu, z datą i adresem oryginału. */
export interface EneaQuestionSource {
  source_id: string;
  title: string;
  section: string | null;
  page_pdf: number;
  page_printed: string | null;
  edition: string | null;
  effective_from: string | null;
  url: string;
  excerpt: string | null;
  sha256: string | null;
  provenance: 'indeks_lokalny_pdf' | 'karta_wymagania_zweryfikowana';
  verified_on?: string;
  needs_manual_interpretation: boolean;
}

export interface EneaQuestionAnswer {
  question: string;
  as_of: string;
  status: 'POTWIERDZONE_W_KARCIE' | 'ZNALEZIONO_FRAGMENTY' | 'BRAK_INDEKSU' | 'BRAK_POTWIERDZENIA';
  verdict: string | null;
  answer_pl: string;
  scope_pl: string;
  rule_id: string | null;
  sources: EneaQuestionSource[];
  suggested_documents: Array<{
    source_id: string;
    title: string;
    url: string;
    effective_from: string | null;
  }>;
  indexed_documents: number;
  catalog_documents: number;
  requires_review: boolean;
}

/** Pytanie kieruje do referencji, NIE do modelu generatywnego. */
export async function askEneaQuestion(
  question: string,
  asOf?: string,
): Promise<EneaQuestionAnswer> {
  const params = new URLSearchParams({ pytanie: question });
  if (asOf) params.set('data', asOf);
  const response = await fetch(API_BASE + '/reference/enea/pytanie?' + params.toString());
  if (!response.ok) {
    throw new Error('Błąd wyszukiwania wymagań ENEA: ' + response.status);
  }
  return (await response.json()) as EneaQuestionAnswer;
}
