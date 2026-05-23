import type React from 'react';
import { StationBlockLayoutSvg } from '../field/StationBlockLayoutSvg';
import type { StationBlockDetailV1 } from '../sld/core/fieldDeviceContracts';
import { computeBayLayout } from '../sld/core/bayRenderer';

export interface BaySvgRendererProps {
  readonly detail: StationBlockDetailV1;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly theme?: 'canonical-dark' | 'export-light';
}

export const BaySvgRenderer: React.FC<BaySvgRendererProps> = ({
  detail,
  x = 0,
  y = 0,
  width = 120,
  height = 140,
  theme = 'canonical-dark',
}) => {
  const layout = computeBayLayout(detail, { x, y, width, height });
  const exportLight = theme === 'export-light';
  return (
    <StationBlockLayoutSvg
      detail={detail}
      layout={layout}
      palette={{
        surface: exportLight ? '#ffffff' : '#0f172a',
        outline: exportLight ? '#111827' : '#64748b',
        text: exportLight ? '#111827' : '#e5e7eb',
      }}
    />
  );
};

