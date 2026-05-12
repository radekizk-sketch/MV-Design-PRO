import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import {
  BayTemplatePicker,
  type CompleteMvBayTemplateSummary,
} from '../BayTemplatePicker';

function makeTemplate(
  overrides: Partial<CompleteMvBayTemplateSummary> = {},
): CompleteMvBayTemplateSummary {
  return {
    template_ref: 'CANONICAL_FALLBACK__LINE_OUT',
    manufacturer_ref: null,
    switchgear_family_ref: null,
    bay_kind: 'liniowe_odplywowe',
    bay_role: 'OUT',
    source_status: 'canonical_fallback',
    source_refs: [],
    version: '1.0',
    hash: '0'.repeat(64),
    notes_pl: null,
    ...overrides,
  };
}

const CANONICAL_FALLBACK_TEN: CompleteMvBayTemplateSummary[] = [
  makeTemplate({
    template_ref: 'CANONICAL_FALLBACK__LINE_IN',
    bay_kind: 'liniowe_doplywowe',
    bay_role: 'IN',
  }),
  makeTemplate({
    template_ref: 'CANONICAL_FALLBACK__LINE_OUT',
    bay_kind: 'liniowe_odplywowe',
    bay_role: 'OUT',
  }),
  makeTemplate({
    template_ref: 'CANONICAL_FALLBACK__TRANSFORMER',
    bay_kind: 'transformatorowe',
    bay_role: 'TR',
  }),
];

describe('BayTemplatePicker', () => {
  it('renderuje listę szablonów z badge source_status', () => {
    const { container } = render(
      <BayTemplatePicker templates={CANONICAL_FALLBACK_TEN} onSelect={() => {}} />,
    );
    expect(container.querySelector('[data-testid="bay-template-picker"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="bay-template-picker-option-CANONICAL_FALLBACK__LINE_IN"]'),
    ).not.toBeNull();
  });

  it('canonical_fallback szablon ma badge "Szablon kanoniczny ogólny (fallback)"', () => {
    const { container } = render(
      <BayTemplatePicker templates={CANONICAL_FALLBACK_TEN} onSelect={() => {}} />,
    );
    const badge = container.querySelector(
      '[data-testid="bay-template-picker-badge-CANONICAL_FALLBACK__LINE_OUT"]',
    );
    expect(badge?.textContent).toContain('Szablon kanoniczny ogólny');
  });

  it('official_catalog szablon ma badge "Oficjalny katalog producenta"', () => {
    const templates = [
      makeTemplate({
        template_ref: 'ZPUE__ROTOBLOK__LINE_OUT',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        source_status: 'official_catalog',
        source_refs: ['catalog:zpue_rotoblok_2026.pdf'],
      }),
    ];
    const { container } = render(<BayTemplatePicker templates={templates} onSelect={() => {}} />);
    const badge = container.querySelector(
      '[data-testid="bay-template-picker-badge-ZPUE__ROTOBLOK__LINE_OUT"]',
    );
    expect(badge?.textContent).toContain('Oficjalny katalog producenta');
  });

  it('bayKindFilter zawęża listę', () => {
    const { container } = render(
      <BayTemplatePicker
        templates={CANONICAL_FALLBACK_TEN}
        bayKindFilter="transformatorowe"
        onSelect={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-testid="bay-template-picker-option-CANONICAL_FALLBACK__TRANSFORMER"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="bay-template-picker-option-CANONICAL_FALLBACK__LINE_IN"]'),
    ).toBeNull();
  });

  it('empty state — pokazuje komunikat gdy filtr nie pasuje', () => {
    const { container } = render(
      <BayTemplatePicker
        templates={CANONICAL_FALLBACK_TEN}
        bayKindFilter="pv"
        onSelect={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="bay-template-picker-empty"]')).not.toBeNull();
  });

  it('onSelect wywoływany z template_ref', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <BayTemplatePicker templates={CANONICAL_FALLBACK_TEN} onSelect={onSelect} />,
    );
    const btn = container.querySelector(
      '[data-testid="bay-template-picker-option-CANONICAL_FALLBACK__TRANSFORMER"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith('CANONICAL_FALLBACK__TRANSFORMER');
  });

  it('selectedRef oznacza wybrany szablon', () => {
    const { container } = render(
      <BayTemplatePicker
        templates={CANONICAL_FALLBACK_TEN}
        selectedRef="CANONICAL_FALLBACK__LINE_OUT"
        onSelect={() => {}}
      />,
    );
    expect(
      container
        .querySelector('[data-testid="bay-template-picker-option-CANONICAL_FALLBACK__LINE_OUT"]')
        ?.getAttribute('data-selected'),
    ).toBe('true');
  });

  it('manufacturer_ref widoczny w opcji gdy ustawiony', () => {
    const templates = [
      makeTemplate({
        template_ref: 'ZPUE__BAY1',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        source_status: 'canonical_fallback',
      }),
    ];
    const { container } = render(<BayTemplatePicker templates={templates} onSelect={() => {}} />);
    const option = container.querySelector(
      '[data-testid="bay-template-picker-option-ZPUE__BAY1"]',
    );
    expect(option?.textContent).toContain('ZPUE_WLOSZCZOWA');
  });
});
