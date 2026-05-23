import { describe, expect, it } from 'vitest';
import { generateDxf } from '../exportDxf';
import { generateIec61850Scd } from '../exportIec61850';
import { generateCimRdfXml } from '../exportCim';

describe('generateDxf', () => {
  it('generuje pusty DXF gdy brak entities', () => {
    const dxf = generateDxf({ title: 'Test', lines: [], texts: [] });
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('zawiera AutoCAD 2010 (AC1024) marker', () => {
    const dxf = generateDxf({ title: 'Test', lines: [], texts: [] });
    expect(dxf).toContain('AC1024');
  });

  it('LINE entities z X/Y koordynatami (Y odwrócone dla DXF)', () => {
    const dxf = generateDxf({
      title: 'Test',
      lines: [{ x1: 0, y1: 100, x2: 200, y2: 100 }],
      texts: [],
    });
    expect(dxf).toContain('LINE');
    expect(dxf).toMatch(/0\n[^]+?20\n-100/);
  });

  it('TEXT entities z opisem', () => {
    const dxf = generateDxf({
      title: 'Test',
      lines: [],
      texts: [{ x: 50, y: 50, text: 'GPZ' }],
    });
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('GPZ');
  });
});

describe('generateIec61850Scd', () => {
  it('generuje minimalny SCD XML', () => {
    const scd = generateIec61850Scd({ substations: [] });
    expect(scd).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(scd).toContain('<SCL');
    expect(scd).toContain('</SCL>');
  });

  it('renderuje Substation > VoltageLevel > Bay > Equipment hierarchy', () => {
    const scd = generateIec61850Scd({
      substations: [
        {
          name: 'GPZ-A',
          voltageLevels: [
            {
              name: 'SN 15 kV',
              voltage_kv: 15,
              bays: [
                {
                  name: 'Pole 1',
                  equipment: [
                    { name: 'CB-1', type: 'CBR' },
                    { name: 'DS-1', type: 'DIS' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(scd).toContain('<Substation name="GPZ-A">');
    expect(scd).toContain('<VoltageLevel name="SN 15 kV">');
    expect(scd).toContain('<Voltage unit="V" multiplier="k">15</Voltage>');
    expect(scd).toContain('<Bay name="Pole 1"');
    expect(scd).toContain('<ConductingEquipment name="CB-1" type="CBR"');
    expect(scd).toContain('<ConductingEquipment name="DS-1" type="DIS"');
  });

  it('escape XML znaków specjalnych w nazwach', () => {
    const scd = generateIec61850Scd({
      substations: [{ name: 'GPZ <Test>', voltageLevels: [] }],
    });
    expect(scd).toContain('GPZ &lt;Test&gt;');
  });
});

describe('generateCimRdfXml', () => {
  it('generuje minimalny RDF/XML', () => {
    const cim = generateCimRdfXml({
      substations: [],
      voltageLevels: [],
      bays: [],
      acLineSegments: [],
      powerTransformers: [],
      breakers: [],
    });
    expect(cim).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(cim).toContain('<rdf:RDF');
    expect(cim).toContain('xmlns:cim="http://iec.ch/TC57/CIM100#"');
  });

  it('renderuje Substation z mRID', () => {
    const cim = generateCimRdfXml({
      substations: [{ mrid: 'sub-uuid-1', name: 'GPZ-A' }],
      voltageLevels: [],
      bays: [],
      acLineSegments: [],
      powerTransformers: [],
      breakers: [],
    });
    expect(cim).toContain('<cim:Substation rdf:ID="sub-uuid-1">');
    expect(cim).toContain('<cim:IdentifiedObject.name>GPZ-A</cim:IdentifiedObject.name>');
  });

  it('renderuje ACLineSegment z impedancją', () => {
    const cim = generateCimRdfXml({
      substations: [],
      voltageLevels: [],
      bays: [],
      acLineSegments: [
        { mrid: 'line-1', name: 'Kabel SN-1', length_m: 500, r_ohm: 0.5, x_ohm: 0.3 },
      ],
      powerTransformers: [],
      breakers: [],
    });
    expect(cim).toContain('<cim:ACLineSegment rdf:ID="line-1">');
    expect(cim).toContain('<cim:Conductor.length>500</cim:Conductor.length>');
    expect(cim).toContain('<cim:ACLineSegment.r>0.5</cim:ACLineSegment.r>');
    expect(cim).toContain('<cim:ACLineSegment.x>0.3</cim:ACLineSegment.x>');
  });

  it('PowerTransformer ratedS przeliczone do W (MVA × 1e6)', () => {
    const cim = generateCimRdfXml({
      substations: [],
      voltageLevels: [],
      bays: [],
      acLineSegments: [],
      powerTransformers: [
        { mrid: 'tr-1', name: 'T1', substation_mrid: 'sub-1', ratedS_mva: 16, hv_kv: 110, lv_kv: 15 },
      ],
      breakers: [],
    });
    expect(cim).toContain('<cim:PowerTransformer.ratedS>16000000</cim:PowerTransformer.ratedS>');
  });

  it('Breaker.normalOpen poprawnie serializuje boolean', () => {
    const cim = generateCimRdfXml({
      substations: [],
      voltageLevels: [],
      bays: [],
      acLineSegments: [],
      powerTransformers: [],
      breakers: [{ mrid: 'cb-1', name: 'CB-1', bay_mrid: 'bay-1', normalOpen: false }],
    });
    expect(cim).toContain('<cim:Switch.normalOpen>false</cim:Switch.normalOpen>');
  });
});
