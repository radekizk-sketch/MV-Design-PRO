import { describe, expect, it } from 'vitest';
import {
  buildMiniSld,
  computeBoundingBox,
  describeStation,
  type MiniSldInput,
} from '../miniSldStationPreview';

const baseInput: MiniSldInput = {
  stationKind: 'terminal',
  snVoltageKv: 15,
  nnVoltageKv: 0.4,
  bayCount: 2,
  hasDer: false,
  transformerRatedMva: 0.63,
};

describe('buildMiniSld', () => {
  it('zawiera kabel SN + szyna SN + pola + transformator + szyna nN + load', () => {
    const blocks = buildMiniSld(baseInput);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('cable');
    expect(types.filter((t) => t === 'bus').length).toBeGreaterThanOrEqual(2);
    expect(types).toContain('transformer');
    expect(types).toContain('load');
  });

  it('liczba pól = bayCount', () => {
    const blocks = buildMiniSld(baseInput);
    const bays = blocks.filter((b) => b.type === 'bay');
    expect(bays).toHaveLength(2);
  });

  it('sectional dodaje pole sprzęgłowe', () => {
    const blocks = buildMiniSld({
      ...baseInput,
      stationKind: 'sectional',
      bayCount: 3,
    });
    const coupler = blocks.find((b) => b.id === 'coupler');
    expect(coupler).toBeDefined();
    expect(coupler?.label).toBe('Sprzęgło');
  });

  it('hasDer=true dodaje blok DER', () => {
    const blocks = buildMiniSld({ ...baseInput, hasDer: true });
    expect(blocks.some((b) => b.type === 'der')).toBe(true);
  });

  it('brak transformator gdy null', () => {
    const blocks = buildMiniSld({ ...baseInput, transformerRatedMva: null });
    expect(blocks.some((b) => b.type === 'transformer')).toBe(false);
    expect(blocks.some((b) => b.type === 'load')).toBe(false);
  });

  it('label transformatora ma format X MVA Un1/Un2 kV', () => {
    const blocks = buildMiniSld(baseInput);
    const trafo = blocks.find((b) => b.type === 'transformer');
    expect(trafo?.label).toContain('0.63 MVA');
    expect(trafo?.label).toContain('15/0.4 kV');
  });

  it('voltageKv zachowuje poziom napięcia', () => {
    const blocks = buildMiniSld(baseInput);
    const busSn = blocks.find((b) => b.id === 'bus-sn');
    const busNn = blocks.find((b) => b.id === 'bus-nn');
    expect(busSn?.voltageKv).toBe(15);
    expect(busNn?.voltageKv).toBe(0.4);
  });
});

describe('computeBoundingBox', () => {
  it('puste blocks → fallback 200x200', () => {
    expect(computeBoundingBox([])).toEqual({ width: 200, height: 200 });
  });

  it('liczy szerokość + wysokość z paddingiem 20', () => {
    const blocks = buildMiniSld(baseInput);
    const bbox = computeBoundingBox(blocks);
    expect(bbox.width).toBeGreaterThan(0);
    expect(bbox.height).toBeGreaterThan(200); // przy transformatorze
  });
});

describe('describeStation', () => {
  it('terminal description', () => {
    const desc = describeStation(baseInput);
    expect(desc).toContain('końcowa');
    expect(desc).toContain('15/0.4 kV');
    expect(desc).toContain('2 pól');
  });

  it('z DER → "+ DER"', () => {
    const desc = describeStation({ ...baseInput, hasDer: true });
    expect(desc).toContain('+ DER');
  });
});
