import type { RectangleV1 } from './layoutResult';
import type { StationBlockDetailV1 } from './fieldDeviceContracts';

export interface BayLayoutV1 {
  readonly fieldId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cableExitPoint: { readonly x: number; readonly y: number };
}

export interface StationBlockLayoutV1 {
  readonly bounds: RectangleV1;
  readonly busbarGeometry: {
    readonly x1: number;
    readonly x2: number;
    readonly y: number;
  };
  readonly bays: readonly BayLayoutV1[];
}

export function computeBayLayout(
  detail: StationBlockDetailV1,
  bounds: RectangleV1,
): StationBlockLayoutV1 {
  const fields = detail.fields.length > 0 ? detail.fields : [];
  const bayCount = Math.max(1, fields.length);
  const bayWidth = bounds.width / bayCount;
  const busbarY = bounds.y + 18;
  const bays = Array.from({ length: bayCount }, (_, index): BayLayoutV1 => {
    const field = fields[index];
    const x = bounds.x + index * bayWidth;
    const centerX = x + bayWidth / 2;
    return {
      fieldId: field?.id ?? `${detail.blockId}-bay-${index + 1}`,
      x,
      y: bounds.y + 28,
      width: bayWidth,
      height: Math.max(44, bounds.height - 34),
      cableExitPoint: {
        x: centerX,
        y: bounds.y + bounds.height - 8,
      },
    };
  });

  return {
    bounds,
    busbarGeometry: {
      x1: bounds.x + 8,
      x2: bounds.x + bounds.width - 8,
      y: busbarY,
    },
    bays,
  };
}

