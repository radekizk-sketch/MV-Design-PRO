/**
 * miniSldStationPreview — generator mini-SLD stacji do preview (Etap 4 z planu).
 *
 * "Preview 'mini-SLD' stacji real-time podczas wyborów"
 *
 * Generuje uproszczone bloki SVG dla:
 * - Kabel SN przyłączeniowy
 * - Rozdzielnica SN (sekcje + pola)
 * - Transformator SN/nN
 * - Rozdzielnica nN
 *
 * Wszystko jako lista SldBlock z koordynatami (x, y, width, height) + label.
 */

export type StationKind = 'terminal' | 'branch' | 'sectional' | 'pass_through';
export type BlockType = 'cable' | 'bus' | 'bay' | 'transformer' | 'nn_switchgear' | 'load' | 'der';

export interface SldBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  voltageKv?: number;
}

export interface MiniSldInput {
  stationKind: StationKind;
  snVoltageKv: number;
  nnVoltageKv: number | null;
  bayCount: number;
  hasDer: boolean;
  transformerRatedMva: number | null;
}

const BLOCK_WIDTH = 60;
const BLOCK_HEIGHT = 40;
const SPACING = 20;
const Y_BUS = 50;
const Y_BAY = 100;
const Y_TRAFO = 180;
const Y_NN = 260;

export function buildMiniSld({
  stationKind,
  snVoltageKv,
  nnVoltageKv,
  bayCount,
  hasDer,
  transformerRatedMva,
}: MiniSldInput): SldBlock[] {
  const blocks: SldBlock[] = [];
  const startX = 20;

  // Kabel SN wejściowy
  blocks.push({
    id: 'cable-in',
    type: 'cable',
    x: startX,
    y: Y_BUS - BLOCK_HEIGHT,
    width: BLOCK_WIDTH,
    height: BLOCK_HEIGHT,
    label: `Kabel SN ${snVoltageKv} kV`,
    voltageKv: snVoltageKv,
  });

  // Rozdzielnica SN — szyna
  const busWidth = Math.max(120, bayCount * (BLOCK_WIDTH + SPACING));
  blocks.push({
    id: 'bus-sn',
    type: 'bus',
    x: startX + BLOCK_WIDTH + SPACING,
    y: Y_BUS,
    width: busWidth,
    height: 10,
    label: `Szyna SN ${snVoltageKv} kV`,
    voltageKv: snVoltageKv,
  });

  // Pola SN
  for (let i = 0; i < bayCount; i++) {
    const x = startX + BLOCK_WIDTH + SPACING + i * (BLOCK_WIDTH + SPACING);
    blocks.push({
      id: `bay-${i}`,
      type: 'bay',
      x,
      y: Y_BAY,
      width: BLOCK_WIDTH,
      height: BLOCK_HEIGHT,
      label: `Pole ${i + 1}`,
      voltageKv: snVoltageKv,
    });
  }

  // Pole sprzęgłowe gdy sectional
  if (stationKind === 'sectional' && bayCount > 1) {
    blocks.push({
      id: 'coupler',
      type: 'bay',
      x: startX + BLOCK_WIDTH + SPACING + busWidth / 2 - BLOCK_WIDTH / 2,
      y: Y_BAY,
      width: BLOCK_WIDTH,
      height: BLOCK_HEIGHT,
      label: 'Sprzęgło',
      voltageKv: snVoltageKv,
    });
  }

  // Transformator
  if (transformerRatedMva) {
    blocks.push({
      id: 'transformer',
      type: 'transformer',
      x: startX + BLOCK_WIDTH * 2,
      y: Y_TRAFO,
      width: BLOCK_WIDTH,
      height: BLOCK_HEIGHT,
      label: `${transformerRatedMva} MVA ${snVoltageKv}/${nnVoltageKv ?? '?'} kV`,
      voltageKv: snVoltageKv,
    });

    // Strona nN
    if (nnVoltageKv) {
      blocks.push({
        id: 'bus-nn',
        type: 'bus',
        x: startX + BLOCK_WIDTH,
        y: Y_NN,
        width: 200,
        height: 10,
        label: `Szyna nN ${nnVoltageKv} kV`,
        voltageKv: nnVoltageKv,
      });

      blocks.push({
        id: 'load-nn',
        type: 'load',
        x: startX + BLOCK_WIDTH,
        y: Y_NN + BLOCK_HEIGHT,
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT,
        label: 'Odbiory nN',
        voltageKv: nnVoltageKv,
      });

      if (hasDer) {
        blocks.push({
          id: 'der-nn',
          type: 'der',
          x: startX + BLOCK_WIDTH + 120,
          y: Y_NN + BLOCK_HEIGHT,
          width: BLOCK_WIDTH,
          height: BLOCK_HEIGHT,
          label: 'DER (PV/BESS)',
          voltageKv: nnVoltageKv,
        });
      }
    }
  }

  return blocks;
}

export function computeBoundingBox(blocks: SldBlock[]): {
  width: number;
  height: number;
} {
  if (blocks.length === 0) return { width: 200, height: 200 };
  const maxX = Math.max(...blocks.map((b) => b.x + b.width));
  const maxY = Math.max(...blocks.map((b) => b.y + b.height));
  return { width: maxX + 20, height: maxY + 20 };
}

export function describeStation(input: MiniSldInput): string {
  const kindLabel = {
    terminal: 'końcowa (1 wejście, brak kontynuacji)',
    branch: 'rozgałęźna (odgałęzienie z magistrali)',
    sectional: 'sekcyjna (2 sekcje z sprzęgłem)',
    pass_through: 'przelotowa (wpięcie w istniejącą magistralę)',
  }[input.stationKind];
  const der = input.hasDer ? ' + DER' : '';
  return `Stacja ${kindLabel} · ${input.snVoltageKv}/${input.nnVoltageKv ?? '?'} kV · ${input.bayCount} pól SN${der}`;
}
