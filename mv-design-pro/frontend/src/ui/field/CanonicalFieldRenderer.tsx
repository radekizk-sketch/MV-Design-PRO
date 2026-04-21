import { useMemo } from 'react';
import { BaySvgRenderer } from '../power-distribution/BaySvgRenderer';
import type { StationConfig } from '../power-distribution/types';
import { buildStationBlockDetailFromConfig } from '../sld/core/canonicalFieldDetail';

export type BayRenderContext =
  | 'widok_pelny'
  | 'widok_osadzony'
  | 'podglad_formularza'
  | 'inspektor';

interface RenderPreset {
  width: number;
  height: number;
  theme: 'light' | 'canonical-dark';
}

const RENDER_PRESETS: Record<BayRenderContext, RenderPreset> = {
  widok_pelny: {
    width: 320,
    height: 360,
    theme: 'canonical-dark',
  },
  widok_osadzony: {
    width: 240,
    height: 280,
    theme: 'canonical-dark',
  },
  podglad_formularza: {
    width: 360,
    height: 420,
    theme: 'light',
  },
  inspektor: {
    width: 300,
    height: 360,
    theme: 'canonical-dark',
  },
};

export interface CanonicalFieldRendererProps {
  config: StationConfig;
  renderContext: BayRenderContext;
  selectedFieldId?: string | null;
  selectedDeviceId?: string | null;
  onFieldClick?: (fieldId: string) => void;
  onDeviceClick?: (deviceId: string) => void;
  width?: number;
  height?: number;
}

export function CanonicalFieldRenderer({
  config,
  renderContext,
  selectedFieldId = null,
  selectedDeviceId = null,
  onFieldClick,
  onDeviceClick,
  width,
  height,
}: CanonicalFieldRendererProps) {
  const preset = RENDER_PRESETS[renderContext];
  const detail = useMemo(() => buildStationBlockDetailFromConfig(config), [config]);

  return (
    <BaySvgRenderer
      config={config}
      detail={detail}
      theme={preset.theme}
      width={width ?? preset.width}
      height={height ?? preset.height}
      selectedFieldId={selectedFieldId}
      selectedDeviceId={selectedDeviceId}
      onFieldClick={onFieldClick}
      onDeviceClick={onDeviceClick}
    />
  );
}
