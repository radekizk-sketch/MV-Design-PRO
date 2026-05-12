/**
 * DerConfigurator — integracja DerPccVariantInfo na zakładce "Tor przyłączenia".
 *
 * Sprawdza:
 * - PCC widget pojawia się TYLKO na zakładce topology gdy podano propsy PCC,
 * - kompletny wariant (np. nn_side + station_ref) → data-complete="true",
 * - brak connectionVariant → blocker komunikat,
 * - children.topology nadpisuje widget (custom override).
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { DerConfigurator } from '../DerConfigurator';

describe('DerConfigurator — integracja PCC widget', () => {
  it('PCC widget widoczny TYLKO na zakładce topology', () => {
    const { container } = render(
      <DerConfigurator
        derId="pv1"
        derKind="PV"
        connectionVariant="nn_side"
        stationRef="st-001"
        defaultCard="topology"
      />,
    );
    expect(container.querySelector('[data-testid="der-pcc-variant-info"]')).not.toBeNull();
  });

  it('PCC widget NIE pokazuje się na innych zakładkach', () => {
    const { container } = render(
      <DerConfigurator
        derId="pv1"
        derKind="PV"
        connectionVariant="nn_side"
        stationRef="st-001"
        defaultCard="basic"
      />,
    );
    expect(container.querySelector('[data-testid="der-pcc-variant-info"]')).toBeNull();
  });

  it('nn_side + station_ref → wariant kompletny w widget', () => {
    const { container } = render(
      <DerConfigurator
        derId="pv1"
        derKind="PV"
        connectionVariant="nn_side"
        stationRef="st-001"
        defaultCard="topology"
      />,
    );
    const widget = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(widget?.getAttribute('data-complete')).toBe('true');
    expect(widget?.getAttribute('data-variant')).toBe('nn_side');
  });

  it('connectionVariant=null → komunikat blocker na zakładce topology', () => {
    const { container } = render(
      <DerConfigurator
        derId="pv1"
        derKind="PV"
        connectionVariant={null}
        defaultCard="topology"
      />,
    );
    expect(
      container.querySelector('[data-testid="der-pcc-variant-info-missing"]'),
    ).not.toBeNull();
  });

  it('przełączenie zakładki na topology → widget się pojawia', () => {
    const { container } = render(
      <DerConfigurator
        derId="bess1"
        derKind="BESS"
        connectionVariant="block_transformer"
        blockingTransformerRef="tr-blok-001"
        defaultCard="basic"
      />,
    );
    expect(container.querySelector('[data-testid="der-pcc-variant-info"]')).toBeNull();

    const topologyTab = container.querySelector(
      '[data-testid="der-card-tab-topology"]',
    ) as HTMLButtonElement;
    fireEvent.click(topologyTab);

    const widget = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(widget).not.toBeNull();
    expect(widget?.getAttribute('data-variant')).toBe('block_transformer');
    expect(widget?.getAttribute('data-complete')).toBe('true');
  });

  it('custom children.topology nadpisuje widget (override)', () => {
    const { container } = render(
      <DerConfigurator
        derId="pv1"
        derKind="PV"
        connectionVariant="nn_side"
        stationRef="st-001"
        defaultCard="topology"
      >
        {{
          topology: <div data-testid="custom-topology-card">Custom content</div>,
        }}
      </DerConfigurator>,
    );
    expect(container.querySelector('[data-testid="custom-topology-card"]')).not.toBeNull();
    // Widget nadal się może pojawić nad customem, ale custom musi być widoczny.
    expect(container.querySelector('[data-testid="custom-topology-card"]')?.textContent).toBe(
      'Custom content',
    );
  });

  it('brak PCC propsów (legacy use) → widget NIE pokazuje się', () => {
    const { container } = render(
      <DerConfigurator derId="pv1" derKind="PV" defaultCard="topology" />,
    );
    expect(container.querySelector('[data-testid="der-pcc-variant-info"]')).toBeNull();
    // Default card (lista wskazówek) nadal się pokazuje.
    expect(
      container.querySelector('[data-testid="der-card-engineering-guidance"]'),
    ).not.toBeNull();
  });

  it('block_transformer bez blocking_transformer_ref → niekompletny widget', () => {
    const { container } = render(
      <DerConfigurator
        derId="bess1"
        derKind="BESS"
        connectionVariant="block_transformer"
        defaultCard="topology"
      />,
    );
    const widget = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(widget?.getAttribute('data-complete')).toBe('false');
  });
});
