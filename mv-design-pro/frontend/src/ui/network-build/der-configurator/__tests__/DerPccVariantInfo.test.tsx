import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { DerPccVariantInfo } from '../DerPccVariantInfo';

describe('DerPccVariantInfo', () => {
  it('connectionVariant=null → komunikat blocker generator.connection_variant_missing', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant={null}
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info-missing"]');
    expect(node).not.toBeNull();
    expect(node?.textContent).toContain('generator.connection_variant_missing');
  });

  it('nn_side + station_ref → wariant kompletny', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="nn_side"
        stationRef="st-001"
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('true');
    expect(node?.getAttribute('data-variant')).toBe('nn_side');
    const req = container.querySelector('[data-testid="der-pcc-variant-info-req-station_ref"]');
    expect(req?.getAttribute('data-present')).toBe('true');
    expect(req?.textContent).toContain('st-001');
  });

  it('nn_side bez station_ref → wariant niekompletny + amber badge', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="nn_side"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('false');
    const req = container.querySelector('[data-testid="der-pcc-variant-info-req-station_ref"]');
    expect(req?.getAttribute('data-present')).toBe('false');
    expect(req?.textContent).toContain('wymagana');
  });

  it('block_transformer + blocking_transformer_ref → kompletny', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="block_transformer"
        stationRef={null}
        blockingTransformerRef="tr-blok-001"
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('true');
    const req = container.querySelector(
      '[data-testid="der-pcc-variant-info-req-blocking_transformer_ref"]',
    );
    expect(req?.getAttribute('data-present')).toBe('true');
  });

  it('block_transformer bez blocking_transformer_ref → niekompletny', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="block_transformer"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('false');
  });

  it('DEDICATED_MV_CONNECTION → kompletny bez dodatkowych refs', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="DEDICATED_MV_CONNECTION"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('true');
    // Brak wymagań referencji.
    expect(
      container.querySelector('[data-testid="der-pcc-variant-info-req-station_ref"]'),
    ).toBeNull();
  });

  it('LV_BEHIND_STATION_TRANSFORMER wymaga station_ref', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="LV_BEHIND_STATION_TRANSFORMER"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('false');
  });

  it('polskie etykiety wariantów dla każdej opcji', () => {
    const variants = [
      'nn_side',
      'LV_BEHIND_STATION_TRANSFORMER',
      'block_transformer',
      'DEDICATED_MV_CONNECTION',
      'SOURCE_CONNECTION_STATION',
    ] as const;
    for (const v of variants) {
      const { container, unmount } = render(
        <DerPccVariantInfo
          connectionVariant={v}
          stationRef="st-001"
          blockingTransformerRef="tr-001"
        />,
      );
      const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
      expect(node, `${v}: brak komponentu`).not.toBeNull();
      // Tytuł zawsze ma polskie litery (zawiera spacje + frazy PL).
      expect(node?.textContent?.length ?? 0).toBeGreaterThan(20);
      unmount();
    }
  });
});
