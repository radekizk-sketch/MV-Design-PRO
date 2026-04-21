import React, { useMemo } from 'react';
import type { GpzFieldAnnotationV1 } from './core/layoutResult';
import { computeBayLayout } from './core/bayRenderer';
import { JunctionDot } from './symbols/JunctionDot';
import { CANONICAL_VOLTAGE_COLORS } from './sldCanonicalStyle';
import { CanonicalFieldBlockSvg } from './FieldBlockRenderer';

export interface GpzFieldBlockRendererProps {
  field: GpzFieldAnnotationV1;
  color?: string;
  showTechnicalLabels?: boolean;
}

export const GpzFieldBlockRenderer: React.FC<GpzFieldBlockRendererProps> = ({
  field,
  color = CANONICAL_VOLTAGE_COLORS.SN,
  showTechnicalLabels = false,
}) => {
  const block = field.detail ?? null;

  const bounds = useMemo(
    () => ({
      x: field.axisX - 28,
      y: field.busTap.y - 10,
      width: 56,
      height: Math.max(field.segmentStart.y - field.busTap.y + 20, 70),
    }),
    [field.axisX, field.busTap.y, field.segmentStart.y],
  );

  const layout = useMemo(
    () => (block ? computeBayLayout(block, bounds) : null),
    [block, bounds],
  );
  if (!block || !layout) {
    return null;
  }
  const cableExitPoint = layout.bays[0]?.cableExitPoint ?? field.segmentStart;

  return (
    <g
      data-sld-role="gpz-feeder-field"
      data-field-id={field.fieldId}
      data-element-id={field.fieldId}
      data-element-type="BaySN"
      data-element-name={field.designation}
    >
      <CanonicalFieldBlockSvg
        detail={block}
        layout={layout}
        color={color}
        resolveDeviceVisual={() => ({ label: field.designation })}
        showCableExitMarkers={false}
      />

      <JunctionDot x={cableExitPoint.x} y={field.segmentStart.y} color={color} />

      <text
        x={field.axisX + bounds.width / 2 + 10}
        y={field.busTap.y + 22}
        className="sld-label-iec-designation"
      >
        {field.designation}
      </text>
      {showTechnicalLabels && (
        <text
          x={field.axisX + bounds.width / 2 + 10}
          y={field.busTap.y + 36}
          className="sld-label-params"
        >
          Głowica pola liniowego GPZ
        </text>
      )}
    </g>
  );
};
