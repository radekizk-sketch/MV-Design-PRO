import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldBlockRenderer } from '../FieldBlockRenderer';
import { buildStationCadLayout } from '../SldStationLayoutEngine';
import type { StationFieldAnnotationV1 } from '../core/layoutResult';
import {
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
  DeviceTypeV1,
  EmbeddingRoleV1,
  FieldRoleV1,
} from '../core/fieldDeviceContracts';
import { buildStationBlockDetailFromConfig } from '../core/canonicalFieldDetail';

function device(deviceId: string, fieldId: string, deviceType: DeviceTypeV1) {
  return {
    deviceId: `${fieldId}-${deviceId}`,
    deviceType,
    electricalRole: DeviceElectricalRoleV1.POWER_PATH,
    powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
  };
}

function station(
  stationId: string,
  embeddingRole: EmbeddingRoleV1,
  stationType: StationFieldAnnotationV1['stationType'],
  roles: FieldRoleV1[],
): StationFieldAnnotationV1 {
  const detail = buildStationBlockDetailFromConfig({
    stationId,
    stationName: stationId,
    embeddingRole,
    busSectionCount: 1,
    fields: roles.map((role, index) => {
      const fieldId = `${stationId}-field-${index + 1}`;
      return {
        fieldId,
        fieldRole: role,
        busSectionId: 'bus-section-1',
        devices: [
          device('q2', fieldId, DeviceTypeV1.DS),
          device('q1', fieldId, DeviceTypeV1.CB),
        ],
      };
    }),
  });

  return {
    stationId,
    stationType,
    hasOZE: false,
    ozeType: null,
    apparatus: [
      {
        designation: 'Q1',
        symbolType: 'CB',
        label: 'Wyłącznik',
        parameters: { In: 630 },
        position: { x: 300, y: 180 },
      },
    ],
    nnBusbar: {
      voltageKV: 0.4,
      feeders: [
        {
          designation: 'odp-1',
          type: 'load',
          power_kW: 120,
          cosPhi: 0.95,
          additionalParams: {},
        },
      ],
    },
    protection: [],
    detail,
  };
}

describe('SldStationLayoutEngine', () => {
  it('układa stację przelotową z kontynuacją SN przez pole wyjściowe', () => {
    const field = station('station-inline', EmbeddingRoleV1.TRUNK_INLINE, 'TYPE_B', [
      FieldRoleV1.LINE_IN,
      FieldRoleV1.TRANSFORMER_SN_NN,
      FieldRoleV1.LINE_OUT,
    ]);

    const layout = buildStationCadLayout(field);

    expect(layout.hasSnContinuation).toBe(true);
    expect(layout.lineOutField?.role).toBe(FieldRoleV1.LINE_OUT);
    expect(layout.transformerField?.role).toBe(FieldRoleV1.TRANSFORMER_SN_NN);
    expect(layout.nnBus.y).toBeGreaterThan(layout.transformer?.y ?? 0);
  });

  it('układa stację końcową bez dalszego portu SN za stroną nN', () => {
    const field = station('station-leaf', EmbeddingRoleV1.TRUNK_LEAF, 'TYPE_A', [
      FieldRoleV1.LINE_IN,
      FieldRoleV1.TRANSFORMER_SN_NN,
    ]);

    const layout = buildStationCadLayout(field);

    expect(layout.hasSnContinuation).toBe(false);
    expect(layout.lineOutField).toBeNull();
    expect(layout.transformer).not.toBeNull();
  });
});

describe('FieldBlockRenderer CAD SN/nN', () => {
  it('renderuje stację przelotową z osobną szyną SN, transformatorem i szyną nN', () => {
    const field = station('station-inline', EmbeddingRoleV1.TRUNK_INLINE, 'TYPE_B', [
      FieldRoleV1.LINE_IN,
      FieldRoleV1.TRANSFORMER_SN_NN,
      FieldRoleV1.LINE_OUT,
    ]);

    const { container } = render(
      <svg>
        <FieldBlockRenderer field={field} showTechnicalLabels />
      </svg>,
    );

    expect(screen.getByTestId('station-cad-station-inline')).toBeInTheDocument();
    expect(screen.getByTestId('station-sn-bus-station-inline')).toHaveAttribute('data-voltage-domain', 'SN');
    expect(screen.getByTestId('station-sn-continuation-station-inline')).toHaveAttribute('data-voltage-domain', 'SN');
    expect(screen.getByTestId('station-transformer-station-inline')).toHaveAttribute('data-voltage-domain', 'SN-NN');
    expect(screen.getByTestId('station-nn-bus-station-inline')).toHaveAttribute('data-voltage-domain', 'NN');
    expect(container.querySelector('[data-sld-port-role="BAY_SN_OUT"]')).not.toBeNull();
    expect(container.querySelector('[data-sld-port-role="LV_FEEDER_OUT"]')).not.toBeNull();
  });

  it('renderuje stację końcową bez kontynuacji SN za szyną nN', () => {
    const field = station('station-leaf', EmbeddingRoleV1.TRUNK_LEAF, 'TYPE_A', [
      FieldRoleV1.LINE_IN,
      FieldRoleV1.TRANSFORMER_SN_NN,
    ]);

    const { container } = render(
      <svg>
        <FieldBlockRenderer field={field} />
      </svg>,
    );

    expect(screen.getByTestId('station-cad-station-leaf')).toBeInTheDocument();
    expect(screen.queryByTestId('station-sn-continuation-station-leaf')).not.toBeInTheDocument();
    expect(screen.getByTestId('station-nn-bus-station-leaf')).toHaveAttribute('data-voltage-domain', 'NN');
    expect(container.querySelector('[data-sld-port-role="BAY_SN_OUT"]')).toBeNull();
  });
});
