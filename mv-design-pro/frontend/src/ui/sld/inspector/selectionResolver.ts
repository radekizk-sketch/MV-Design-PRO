/**
 * Selection Resolver â€” mapowanie selekcji SLD â†’ ENM SelectionRef.
 *
 * Funkcja resolveSelectionRef() tworzy SelectionRef z klikniÄ™tego symbolu SLD,
 * umoĹĽliwiajÄ…c nawigacjÄ™ do odpowiedniego elementu i wyĹ›wietlenie
 * wĹ‚aĹ›ciwoĹ›ci ENM w inspektorze.
 *
 * DETERMINIZM: Ten sam symbol + ENM â†’ identyczny SelectionRef.
 * BINDING: Etykiety PL, bez nazw kodowych.
 */

import type { SelectionRef, EnergyNetworkModel } from '../../../types/enm';
import type { WizardSurfaceStepId } from '../../../types/fixActionSurface';
import { formatGeneratorTypeLabelPl } from '../../shared/generatorTypeLabels';
import { formatStationTypeLabelPl } from '../../shared/stationTypeLabels';
import { isConnectionNodeLikeId } from '../../common/connectionNode';

// =============================================================================
// TYPY
// =============================================================================

/**
 * Typ elementu SLD â€” uĹĽywany przez inspektor.
 */
export type SldElementType =
  | 'Bus'
  | 'LineBranch'
  | 'TransformerBranch'
  | 'Switch'
  | 'Source'
  | 'Load'
  | 'STATION'
  | 'GENERATOR';

/**
 * Rozszerzone dane selekcji z powiÄ…zaniem do ENM.
 */
export interface ResolvedSelection {
  /** Referencja do elementu ENM */
  selectionRef: SelectionRef;

  /** Kategoria elementu w procesie budowy */
  buildCategoryHint: string | null;

  /** Nazwa elementu (z ENM, nie z SLD) */
  enmName: string | null;

  /** Sekcje wĹ‚aĹ›ciwoĹ›ci ENM do wyĹ›wietlenia */
  enmProperties: EnmPropertySection[];
}

/**
 * Sekcja wĹ‚aĹ›ciwoĹ›ci z ENM.
 */
export interface EnmPropertySection {
  /** ID sekcji */
  id: string;
  /** Etykieta (PL) */
  label: string;
  /** Pola wĹ‚aĹ›ciwoĹ›ci */
  fields: EnmPropertyField[];
}

/**
 * Pole wĹ‚aĹ›ciwoĹ›ci z ENM.
 */
export interface EnmPropertyField {
  /** Klucz pola */
  key: string;
  /** Etykieta (PL) */
  label: string;
  /** WartoĹ›Ä‡ */
  value: string | number | boolean | null;
  /** Jednostka (opcjonalna) */
  unit?: string;
}

// =============================================================================
// MAPOWANIE SLD â†’ ENM element_type
// =============================================================================



const SLD_TO_ENM_TYPE: Record<SldElementType, SelectionRef['element_type']> = {
  Bus: 'bus',
  LineBranch: 'branch',
  TransformerBranch: 'transformer',
  Switch: 'branch',
  Source: 'source',
  Load: 'load',
  STATION: 'substation',
  GENERATOR: 'generator',
};

const BUILD_CATEGORY_TO_WIZARD_STEP_ID: Partial<Record<string, WizardSurfaceStepId>> = {
  source: 'punkt-zasilania-gpz',
  trunk: 'galezie-linie-kable',
  station: 'struktura-szyn-i-sekcji',
  transformer: 'transformatory',
  switch: 'struktura-szyn-i-sekcji',
  load: 'odbiorniki-i-zrodla',
  oze: 'odbiorniki-i-zrodla',
};

/**
 * Etykiety typĂłw elementĂłw ENM po polsku.
 */
export const ENM_ELEMENT_TYPE_LABELS_PL: Record<SelectionRef['element_type'], string> = {
  bus: 'Szyna',
  branch: 'GaĹ‚Ä…Ĺş',
  transformer: 'Transformator',
  source: 'ĹąrĂłdĹ‚o',
  load: 'Odbiornik',
  generator: 'Generator',
  substation: 'Stacja',
  bay: 'Pole',
  junction: 'WÄ™zeĹ‚ T',
  corridor: 'Magistrala',
  measurement: 'Pomiar',
  protection_assignment: 'Przypisanie zabezpieczenia',
};

function connectionVariantLabel(connectionVariant: string | null | undefined): string {
  switch (connectionVariant) {
    case 'nn_side':
      return 'Strona nN stacji';
    case 'block_transformer':
      return 'Transformator blokowy';
    default:
      return connectionVariant ?? 'â€”';
  }
}

// =============================================================================
// GĹĂ“WNA FUNKCJA
// =============================================================================

/**
 * RozwiÄ…ĹĽ selekcjÄ™ SLD na referencjÄ™ ENM.
 *
 * Mapuje symbol SLD â†’ element ENM â†’ krok kreatora â†’ wĹ‚aĹ›ciwoĹ›ci ENM.
 *
 * @param elementId - ID elementu z symbolu SLD (symbol.elementId)
 * @param sldElementType - Typ elementu SLD (symbol.elementType)
 * @param enm - EnergyNetworkModel
 * @returns ResolvedSelection z powiÄ…zaniem do ENM, lub null jeĹ›li brak mapowania
 */
export function resolveSelectionRef(
  elementId: string,
  sldElementType: SldElementType,
  enm: EnergyNetworkModel
): ResolvedSelection | null {
  // BoundaryNode nie moĹĽe byÄ‡ eksponowane w SLD/inspektorze.
  if (isConnectionNodeLikeId(elementId)) {
    if (sldElementType === 'Source') {
      const fallbackSource =
        enm.sources.find((src) => src.ref_id === 'source_grid' || src.id === 'source_grid') ?? enm.sources[0];
      if (fallbackSource) {
        return resolveSelectionRef(fallbackSource.ref_id, 'Source', enm);
      }
    }
    return null;
  }

  // 1. ZnajdĹş ref_id elementu w ENM
  const enmRefId = findEnmRefId(elementId, sldElementType, enm);
  if (!enmRefId || isConnectionNodeLikeId(enmRefId)) return null;

  // 2. Mapuj na typ ENM
  const enmType = SLD_TO_ENM_TYPE[sldElementType];

  // 3. Mapuj kategoriÄ™ budowy
  const buildCategoryHint = mapElementToBuildCategory(sldElementType);

  // 4. Zbuduj SelectionRef
  const selectionRef: SelectionRef = {
    elementId: enmRefId,
    element_type: enmType,
    wizard_step_hint: buildCategoryHint,
    wizard_step_id: buildCategoryHint
      ? BUILD_CATEGORY_TO_WIZARD_STEP_ID[buildCategoryHint] ?? null
      : null,
  };

  // 5. Pobierz nazwÄ™ z ENM
  const enmName = findEnmElementName(enmRefId, enm);

  // 6. Zbuduj wĹ‚aĹ›ciwoĹ›ci ENM
  const enmProperties = buildEnmProperties(enmRefId, sldElementType, enm);

  return {
    selectionRef,
    buildCategoryHint,
    enmName,
    enmProperties,
  };
}

/**
 * Mapuje typ elementu SLD na kategoriÄ™ procesu budowy sieci.
 * Deterministyczne: ten sam typ â†’ ta sama kategoria.
 */
function mapElementToBuildCategory(sldElementType: SldElementType): string {
  switch (sldElementType) {
    case 'Source':
      return 'source';
    case 'Bus':
    case 'LineBranch':
      return 'trunk';
    case 'STATION':
      return 'station';
    case 'TransformerBranch':
      return 'transformer';
    case 'Switch':
      return 'switch';
    case 'Load':
      return 'load';
    case 'GENERATOR':
      return 'oze';
    default:
      return 'unknown';
  }
}

// =============================================================================
// INTERNALS
// =============================================================================

/**
 * ZnajdĹş ref_id elementu ENM po ID symbolu SLD.
 */
function findEnmRefId(
  elementId: string,
  sldElementType: SldElementType,
  enm: EnergyNetworkModel
): string | null {
  // Szukaj po elementId (ktĂłry moĹĽe byÄ‡ ref_id lub id)
  switch (sldElementType) {
    case 'Bus': {
      const bus = enm.buses.find((b) => b.ref_id === elementId || b.id === elementId);
      return bus?.ref_id ?? null;
    }
    case 'LineBranch':
    case 'Switch': {
      const branch = enm.branches.find((b) => b.ref_id === elementId || b.id === elementId);
      return branch?.ref_id ?? null;
    }
    case 'TransformerBranch': {
      const trafo = enm.transformers.find((t) => t.ref_id === elementId || t.id === elementId);
      return trafo?.ref_id ?? null;
    }
    case 'Source': {
      const src = enm.sources.find((s) => s.ref_id === elementId || s.id === elementId);
      return src?.ref_id ?? null;
    }
    case 'Load': {
      const load = enm.loads.find((l) => l.ref_id === elementId || l.id === elementId);
      return load?.ref_id ?? null;
    }
    case 'STATION': {
      const sub = enm.substations.find((s) => s.ref_id === elementId || s.id === elementId);
      return sub?.ref_id ?? null;
    }
    case 'GENERATOR': {
      const gen = enm.generators.find((g) => g.ref_id === elementId || g.id === elementId);
      return gen?.ref_id ?? null;
    }
    default:
      return null;
  }
}

/**
 * ZnajdĹş nazwÄ™ elementu ENM.
 */
function findEnmElementName(refId: string, enm: EnergyNetworkModel): string | null {
  for (const collection of [
    enm.buses,
    enm.branches,
    enm.transformers,
    enm.sources,
    enm.loads,
    enm.generators,
    enm.substations,
    enm.bays,
    enm.junctions,
    enm.corridors,
  ]) {
    const found = collection.find((el) => el.ref_id === refId);
    if (found) return found.name;
  }
  return null;
}

/**
 * Zbuduj sekcje wĹ‚aĹ›ciwoĹ›ci ENM dla inspektora.
 */
function buildEnmProperties(
  refId: string,
  sldElementType: SldElementType,
  enm: EnergyNetworkModel
): EnmPropertySection[] {
  const sections: EnmPropertySection[] = [];

  switch (sldElementType) {
    case 'Bus': {
      const bus = enm.buses.find((b) => b.ref_id === refId);
      if (!bus) break;
      sections.push({
        id: 'enm_bus',
        label: 'Parametry szyny (ENM)',
        fields: [
          { key: 'ref_id', label: 'Identyfikator', value: bus.ref_id },
          { key: 'voltage_kv', label: 'NapiÄ™cie znamionowe', value: bus.voltage_kv, unit: 'kV' },
          { key: 'phase_system', label: 'UkĹ‚ad fazowy', value: bus.phase_system },
          { key: 'zone', label: 'Strefa', value: bus.zone ?? 'â€”' },
        ],
      });
      break;
    }
    case 'LineBranch': {
      const branch = enm.branches.find((b) => b.ref_id === refId);
      if (!branch) break;
      const fields: EnmPropertyField[] = [
        { key: 'ref_id', label: 'Identyfikator', value: branch.ref_id },
        { key: 'from_bus_ref', label: 'Szyna od', value: branch.from_bus_ref },
        { key: 'to_bus_ref', label: 'Szyna do', value: branch.to_bus_ref },
        { key: 'status', label: 'Stan', value: branch.status === 'closed' ? 'ZamkniÄ™ta' : 'Otwarta' },
      ];
      if ('length_km' in branch) {
        fields.push({ key: 'length_km', label: 'DĹ‚ugoĹ›Ä‡', value: (branch as any).length_km, unit: 'km' });
      }
      if ('r_ohm_per_km' in branch) {
        fields.push({ key: 'r_ohm_per_km', label: 'Rezystancja', value: (branch as any).r_ohm_per_km, unit: 'Î©/km' });
      }
      if ('x_ohm_per_km' in branch) {
        fields.push({ key: 'x_ohm_per_km', label: 'Reaktancja', value: (branch as any).x_ohm_per_km, unit: 'Î©/km' });
      }
      sections.push({ id: 'enm_branch', label: 'Parametry gaĹ‚Ä™zi (ENM)', fields });
      break;
    }
    case 'TransformerBranch': {
      const trafo = enm.transformers.find((t) => t.ref_id === refId);
      if (!trafo) break;
      sections.push({
        id: 'enm_transformer',
        label: 'Parametry transformatora (ENM)',
        fields: [
          { key: 'ref_id', label: 'Identyfikator', value: trafo.ref_id },
          { key: 'sn_mva', label: 'Moc znamionowa', value: trafo.sn_mva, unit: 'MVA' },
          { key: 'uhv_kv', label: 'NapiÄ™cie WN', value: trafo.uhv_kv, unit: 'kV' },
          { key: 'ulv_kv', label: 'NapiÄ™cie nN', value: trafo.ulv_kv, unit: 'kV' },
          { key: 'uk_percent', label: 'NapiÄ™cie zwarcia', value: trafo.uk_percent, unit: '%' },
          { key: 'pk_kw', label: 'Straty obciÄ…ĹĽeniowe', value: trafo.pk_kw, unit: 'kW' },
          { key: 'vector_group', label: 'Grupa poĹ‚Ä…czeĹ„', value: trafo.vector_group ?? 'â€”' },
        ],
      });
      break;
    }
    case 'Source': {
      const src = enm.sources.find((s) => s.ref_id === refId);
      if (!src) break;
      const fields: EnmPropertyField[] = [
        { key: 'ref_id', label: 'Identyfikator', value: src.ref_id },
        { key: 'bus_ref', label: 'Szyna', value: src.bus_ref },
        { key: 'model', label: 'Model', value: src.model },
      ];
      if (src.sk3_mva != null) {
        fields.push({ key: 'sk3_mva', label: 'Moc zwarciowa Sk3', value: src.sk3_mva, unit: 'MVA' });
      }
      if (src.r_ohm != null) {
        fields.push({ key: 'r_ohm', label: 'Rezystancja', value: src.r_ohm, unit: 'Î©' });
      }
      if (src.x_ohm != null) {
        fields.push({ key: 'x_ohm', label: 'Reaktancja', value: src.x_ohm, unit: 'Î©' });
      }
      sections.push({ id: 'enm_source', label: 'Parametry ĹşrĂłdĹ‚a (ENM)', fields });
      break;
    }
    case 'Load': {
      const load = enm.loads.find((l) => l.ref_id === refId);
      if (!load) break;
      sections.push({
        id: 'enm_load',
        label: 'Parametry odbiornika (ENM)',
        fields: [
          { key: 'ref_id', label: 'Identyfikator', value: load.ref_id },
          { key: 'bus_ref', label: 'Szyna', value: load.bus_ref },
          { key: 'p_mw', label: 'Moc czynna', value: load.p_mw, unit: 'MW' },
          { key: 'q_mvar', label: 'Moc bierna', value: load.q_mvar, unit: 'Mvar' },
          { key: 'model', label: 'Model', value: load.model },
        ],
      });
      break;
    }
    case 'STATION': {
      const sub = enm.substations.find((s) => s.ref_id === refId);
      if (!sub) break;
      sections.push({
        id: 'enm_substation',
        label: 'Parametry stacji (ENM)',
        fields: [
          { key: 'ref_id', label: 'Identyfikator', value: sub.ref_id },
          { key: 'station_type', label: 'Typ topologiczny', value: formatStationTypeLabelPl(sub.station_type) },
          { key: 'bus_count', label: 'Liczba szyn', value: sub.bus_refs.length },
          { key: 'transformer_count', label: 'Liczba transformatorow', value: sub.transformer_refs.length },
        ],
      });
      break;
    }
    case 'GENERATOR': {
      const gen = enm.generators.find((g) => g.ref_id === refId);
      if (!gen) break;
      const fields: EnmPropertyField[] = [
        { key: 'ref_id', label: 'Identyfikator', value: gen.ref_id },
        { key: 'bus_ref', label: 'Szyna', value: gen.bus_ref },
        { key: 'p_mw', label: 'Moc czynna', value: gen.p_mw, unit: 'MW' },
        { key: 'gen_type', label: 'Typ generatora', value: gen.gen_type ?? 'â€”' },
      ];
      fields[3] = { key: 'gen_type', label: 'Rodzaj ĹşrĂłdĹ‚a', value: formatGeneratorTypeLabelPl(gen.gen_type) };
      if (gen.connection_variant) {
        fields.push({ key: 'connection_variant', label: 'Wariant przylaczenia', value: gen.connection_variant });
        fields[fields.length - 1] = { key: 'connection_variant', label: 'Wariant przyĹ‚Ä…czenia', value: connectionVariantLabel(gen.connection_variant) };
      }
      sections.push({ id: 'enm_generator', label: 'Parametry generatora (ENM)', fields });
      break;
    }
  }

  return sections;
}
