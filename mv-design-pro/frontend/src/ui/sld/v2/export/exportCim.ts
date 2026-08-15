/**
 * exportCim — eksport modelu sieci do IEC 61970/61968 CIM (Common Information Model).
 *
 * CIM jest standardem semantycznym dla wymiany modeli sieci energetycznych
 * między systemami EMS/SCADA/DMS. Format JSON-LD lub RDF/XML.
 *
 * Implementacja: minimalny CIM 17v36 (RDF/XML) z klasami:
 *  - Substation
 *  - VoltageLevel
 *  - Bay
 *  - ACLineSegment (kable/linie)
 *  - PowerTransformer
 *  - Breaker / Disconnector
 *  - SynchronousMachine / EnergyConsumer
 *
 * BINDING: PL w komentarzach.
 */

export interface CimSubstation {
  readonly mrid: string;
  readonly name: string;
}

export interface CimVoltageLevel {
  readonly mrid: string;
  readonly name: string;
  readonly substation_mrid: string;
  readonly baseVoltage_kv: number;
}

export interface CimBay {
  readonly mrid: string;
  readonly name: string;
  readonly voltageLevel_mrid: string;
}

export interface CimAcLineSegment {
  readonly mrid: string;
  readonly name: string;
  readonly length_m: number;
  readonly r_ohm: number;
  readonly x_ohm: number;
  readonly b_us?: number;
}

export interface CimPowerTransformer {
  readonly mrid: string;
  readonly name: string;
  readonly substation_mrid: string;
  readonly ratedS_mva: number;
  readonly hv_kv: number;
  readonly lv_kv: number;
}

export interface CimBreaker {
  readonly mrid: string;
  readonly name: string;
  readonly bay_mrid: string;
  readonly normalOpen: boolean;
}

export interface CimExportInput {
  readonly substations: readonly CimSubstation[];
  readonly voltageLevels: readonly CimVoltageLevel[];
  readonly bays: readonly CimBay[];
  readonly acLineSegments: readonly CimAcLineSegment[];
  readonly powerTransformers: readonly CimPowerTransformer[];
  readonly breakers: readonly CimBreaker[];
  readonly modelMrid?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generuje CIM 17v36 RDF/XML jako string.
 *
 * Każdy obiekt = klasa CIM (np. cim:Substation) z rdf:ID = mRID
 * (Master Resource Identifier). Relacje cross-class przez rdf:resource.
 *
 * Konwencja PSE/Tauron: mRID = UUID v4.
 */
export function generateCimRdfXml(input: CimExportInput): string {
  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<rdf:RDF');
  xml.push('  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"');
  xml.push('  xmlns:cim="http://iec.ch/TC57/CIM100#"');
  xml.push('  xmlns:md="http://iec.ch/TC57/61970-552/ModelDescription/1#">');

  if (input.modelMrid) {
    xml.push(`  <md:FullModel rdf:about="urn:uuid:${escapeXml(input.modelMrid)}">`);
    xml.push('    <md:Model.profile>http://iec.ch/TC57/ns/CIM/CoreEquipment-EU/3.0</md:Model.profile>');
    xml.push('  </md:FullModel>');
  }

  for (const sub of input.substations) {
    xml.push(`  <cim:Substation rdf:ID="${escapeXml(sub.mrid)}">`);
    xml.push(`    <cim:IdentifiedObject.name>${escapeXml(sub.name)}</cim:IdentifiedObject.name>`);
    xml.push('  </cim:Substation>');
  }

  for (const vl of input.voltageLevels) {
    xml.push(`  <cim:VoltageLevel rdf:ID="${escapeXml(vl.mrid)}">`);
    xml.push(`    <cim:IdentifiedObject.name>${escapeXml(vl.name)}</cim:IdentifiedObject.name>`);
    xml.push(`    <cim:VoltageLevel.Substation rdf:resource="#${escapeXml(vl.substation_mrid)}"/>`);
    xml.push(`    <cim:VoltageLevel.BaseVoltage>${vl.baseVoltage_kv}</cim:VoltageLevel.BaseVoltage>`);
    xml.push('  </cim:VoltageLevel>');
  }

  for (const bay of input.bays) {
    xml.push(`  <cim:Bay rdf:ID="${escapeXml(bay.mrid)}">`);
    xml.push(`    <cim:IdentifiedObject.name>${escapeXml(bay.name)}</cim:IdentifiedObject.name>`);
    xml.push(`    <cim:Bay.VoltageLevel rdf:resource="#${escapeXml(bay.voltageLevel_mrid)}"/>`);
    xml.push('  </cim:Bay>');
  }

  for (const seg of input.acLineSegments) {
    xml.push(`  <cim:ACLineSegment rdf:ID="${escapeXml(seg.mrid)}">`);
    xml.push(`    <cim:IdentifiedObject.name>${escapeXml(seg.name)}</cim:IdentifiedObject.name>`);
    xml.push(`    <cim:Conductor.length>${seg.length_m}</cim:Conductor.length>`);
    xml.push(`    <cim:ACLineSegment.r>${seg.r_ohm}</cim:ACLineSegment.r>`);
    xml.push(`    <cim:ACLineSegment.x>${seg.x_ohm}</cim:ACLineSegment.x>`);
    if (seg.b_us !== undefined) {
      xml.push(`    <cim:ACLineSegment.bch>${seg.b_us}</cim:ACLineSegment.bch>`);
    }
    xml.push('  </cim:ACLineSegment>');
  }

  for (const pt of input.powerTransformers) {
    xml.push(`  <cim:PowerTransformer rdf:ID="${escapeXml(pt.mrid)}">`);
    xml.push(`    <cim:IdentifiedObject.name>${escapeXml(pt.name)}</cim:IdentifiedObject.name>`);
    // S9-6: pusty identyfikator kontenera = model NIE zna przynależności.
    // Referencja `rdf:resource="#"` byłaby wskaźnikiem donikąd (plik
    // formalnie kompletny, semantycznie zepsuty), więc wiersz jest pomijany —
    // obiekt zostaje, zmyślonego rodzica nie dorabiamy.
    if (pt.substation_mrid) {
      xml.push(`    <cim:PowerTransformer.Substation rdf:resource="#${escapeXml(pt.substation_mrid)}"/>`);
    }
    xml.push(`    <cim:PowerTransformer.ratedS>${pt.ratedS_mva * 1e6}</cim:PowerTransformer.ratedS>`);
    xml.push('  </cim:PowerTransformer>');
  }

  for (const cb of input.breakers) {
    xml.push(`  <cim:Breaker rdf:ID="${escapeXml(cb.mrid)}">`);
    xml.push(`    <cim:IdentifiedObject.name>${escapeXml(cb.name)}</cim:IdentifiedObject.name>`);
    // S9-6: patrz komentarz przy transformatorze — łącznik spoza pola
    // (model bez pól SN) wychodzi BEZ kontenera, nie z pustą referencją.
    if (cb.bay_mrid) {
      xml.push(`    <cim:Equipment.EquipmentContainer rdf:resource="#${escapeXml(cb.bay_mrid)}"/>`);
    }
    xml.push(`    <cim:Switch.normalOpen>${cb.normalOpen}</cim:Switch.normalOpen>`);
    xml.push('  </cim:Breaker>');
  }

  xml.push('</rdf:RDF>');
  return xml.join('\n');
}

export function downloadCimXml(input: CimExportInput, filename: string): void {
  const xml = generateCimRdfXml(input);
  const blob = new Blob([xml], { type: 'application/rdf+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xml') ? filename : `${filename}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
