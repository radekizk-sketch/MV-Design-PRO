import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { DerPccVariantInfo } from '../DerPccVariantInfo';

describe('DerPccVariantInfo', () => {
  it('connectionVariant=null prowadzi do wyboru wariantu PCC bez terminów technicznych', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant={null}
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info-missing"]');
    expect(node).not.toBeNull();
    expect(node?.textContent).toContain('Wybierz wariant przyłączenia PCC');
    expect(node?.textContent).not.toMatch(/generator|connection_variant|blocker/i);
  });

  it('nn_side + stacja przyłączenia daje wariant skonfigurowany', () => {
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
    expect(req?.textContent).toContain('Stacja przyłączenia');
    expect(req?.textContent).toContain('wybrano w układzie');
    expect(req?.textContent).not.toContain('st-001');
  });

  it('nn_side bez stacji przyłączenia pokazuje akcję konfiguracji', () => {
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
    expect(req?.textContent).toContain('Stacja przyłączenia');
    expect(req?.textContent).toContain('wybierz w konfiguracji DER');
  });

  it('block_transformer + transformator blokowy daje wariant skonfigurowany', () => {
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
    expect(req?.textContent).toContain('Transformator blokowy');
    expect(req?.textContent).not.toContain('blocking_transformer_ref');
  });

  it('block_transformer bez transformatora blokowego wymaga konfiguracji', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="block_transformer"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('false');
    expect(node?.textContent).toContain('Do konfiguracji');
  });

  it('DEDICATED_MV_CONNECTION jest skonfigurowany bez dodatkowych powiązań', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="DEDICATED_MV_CONNECTION"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('true');
    expect(
      container.querySelector('[data-testid="der-pcc-variant-info-req-station_ref"]'),
    ).toBeNull();
  });

  it('LV_BEHIND_STATION_TRANSFORMER wymaga stacji przyłączenia', () => {
    const { container } = render(
      <DerPccVariantInfo
        connectionVariant="LV_BEHIND_STATION_TRANSFORMER"
        stationRef={null}
        blockingTransformerRef={null}
      />,
    );
    const node = container.querySelector('[data-testid="der-pcc-variant-info"]');
    expect(node?.getAttribute('data-complete')).toBe('false');
    expect(node?.textContent).toContain('Po stronie nN za transformatorem stacji');
  });

  it('ma polskie etykiety wariantów dla każdej opcji', () => {
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
      expect(node, `${v}: komponent wariantu PCC nie został wyrenderowany`).not.toBeNull();
      expect(node?.textContent?.length ?? 0).toBeGreaterThan(20);
      expect(node?.textContent).not.toMatch(/station_ref|blocking_transformer_ref|legacy|blocker/i);
      unmount();
    }
  });
});
