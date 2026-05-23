/**
 * exportIec61850 — eksport modelu sieci do IEC 61850 SCD (System Configuration Description).
 *
 * SCD jest standardem dla integracji z systemami SCADA (ABB MicroSCADA,
 * Siemens SICAM, Schneider Saitel, GE EnerVista). Plik XML opisuje:
 *  - Substation (struktura fizyczna: VoltageLevel, Bay, ConductingEquipment)
 *  - IED (Intelligent Electronic Devices - relay, RTU)
 *  - DataType templates
 *  - Communication (LDevice, LNodes)
 *
 * Implementacja: minimalny SCD 6 z poziomem Substation + Bay (LNodeType
 * referencje pominięte - zostawione dla późniejszej iteracji).
 *
 * BINDING: 100% PL w komentarzach.
 */

export interface Iec61850Bay {
  readonly name: string;
  readonly desc?: string;
  readonly equipment: readonly Iec61850Equipment[];
}

export interface Iec61850Equipment {
  readonly name: string;
  readonly type: 'CBR' | 'DIS' | 'CTR' | 'VTR' | 'PTR' | 'GEN' | 'LOD';
  readonly desc?: string;
}

export interface Iec61850VoltageLevel {
  readonly name: string;
  readonly voltage_kv: number;
  readonly bays: readonly Iec61850Bay[];
}

export interface Iec61850Substation {
  readonly name: string;
  readonly desc?: string;
  readonly voltageLevels: readonly Iec61850VoltageLevel[];
}

export interface Iec61850ExportInput {
  readonly substations: readonly Iec61850Substation[];
  /** Identyfikator projektu - jako nameRef w SCD. */
  readonly projectId?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generuje minimalny IEC 61850 SCD jako XML string.
 *
 * Wersja: IEC 61850-6 Ed. 2 (2009).
 * Mapping wewnętrzny → SCL:
 *   GPZ/Stacja           → Substation
 *   Sekcje GPZ           → VoltageLevel (per napięcie)
 *   Pole SN              → Bay
 *   Wyłącznik / Odłącznik → ConductingEquipment (CBR/DIS)
 *   CT / VT              → ConductingEquipment (CTR/VTR)
 *   Transformator        → ConductingEquipment (PTR)
 *   Generator / Load     → ConductingEquipment (GEN/LOD)
 */
export function generateIec61850Scd(input: Iec61850ExportInput): string {
  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B">');
  xml.push('  <Header id="' + escapeXml(input.projectId ?? 'mv-design-pro') + '" nameStructure="IEDName"/>');

  for (const sub of input.substations) {
    xml.push(`  <Substation name="${escapeXml(sub.name)}"${sub.desc ? ` desc="${escapeXml(sub.desc)}"` : ''}>`);
    for (const vl of sub.voltageLevels) {
      xml.push(`    <VoltageLevel name="${escapeXml(vl.name)}">`);
      xml.push(`      <Voltage unit="V" multiplier="k">${vl.voltage_kv}</Voltage>`);
      for (const bay of vl.bays) {
        xml.push(`      <Bay name="${escapeXml(bay.name)}"${bay.desc ? ` desc="${escapeXml(bay.desc)}"` : ''}>`);
        for (const eq of bay.equipment) {
          const descAttr = eq.desc ? ` desc="${escapeXml(eq.desc)}"` : '';
          xml.push(`        <ConductingEquipment name="${escapeXml(eq.name)}" type="${eq.type}"${descAttr}/>`);
        }
        xml.push('      </Bay>');
      }
      xml.push('    </VoltageLevel>');
    }
    xml.push('  </Substation>');
  }

  xml.push('</SCL>');
  return xml.join('\n');
}

export function downloadIec61850Scd(input: Iec61850ExportInput, filename: string): void {
  const scd = generateIec61850Scd(input);
  const blob = new Blob([scd], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.scd') ? filename : `${filename}.scd`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
