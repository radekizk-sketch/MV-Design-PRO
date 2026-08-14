import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import type { Manufacturer } from '../manufacturer';
import { SwitchgearTemplateStepper } from '../SwitchgearTemplateStepper';
import type { SwitchgearFamily } from '../SwitchgearFamilyPicker';
import type { CompleteMvBayTemplateSummary } from '../BayTemplatePicker';

const ZPUE_REQUIRES_CATALOG: Manufacturer = {
  manufacturer_ref: 'ZPUE_WLOSZCZOWA',
  name: 'ZPUE S.A.',
  normalized_code: 'ZPUE',
  country: 'PL',
  status: 'requires_catalog',
  source_refs: [],
  notes_pl: null,
};

const VERIFIED_VENDOR: Manufacturer = {
  manufacturer_ref: 'VERIFIED_X',
  name: 'Verified X',
  normalized_code: 'VX',
  country: 'CH',
  status: 'verified',
  source_refs: ['catalog:vx_2026.pdf'],
  notes_pl: null,
};

const VERIFIED_FAMILY: SwitchgearFamily = {
  switchgear_family_ref: 'VX__SERIES_A',
  manufacturer_ref: 'VERIFIED_X',
  family_name: 'Series A',
  series_name: 'A1',
  voltage_levels: [15],
  insulation_type: 'sf6',
  construction_type: 'RMU',
  status: 'verified',
  source_refs: ['catalog:vx_2026.pdf'],
  notes_pl: null,
};

const CANONICAL_TEMPLATE: CompleteMvBayTemplateSummary = {
  template_ref: 'CANONICAL_FALLBACK__LINE_OUT',
  // Kompozycja aparatów pola — pole WYMAGANE kontraktu (`base_template.devices`).
    base_template: {
      template_id: 'bay_template_line_out',
      name: 'Pole liniowe wyjściowe',
      bay_role: 'OUT',
      devices: [
        { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM' },
        { kind: 'CB', designation_q: 'Q0', position: 1, placement: 'MIDSTREAM' },
        { kind: 'ES', designation_q: 'Q9', position: 4, placement: 'GROUND_BRANCH' },
        { kind: 'CABLE_HEAD', designation_q: 'GK', position: 5, placement: 'DOWNSTREAM' },
      ],
    },
  manufacturer_ref: null,
  switchgear_family_ref: null,
  bay_kind: 'liniowe_odplywowe',
  bay_role: 'OUT',
  source_status: 'canonical_fallback',
  source_refs: [],
  version: '1.0',
  hash: '0'.repeat(64),
  notes_pl: null,
};

describe('SwitchgearTemplateStepper', () => {
  it('start na zakładce manufacturer', () => {
    const { container } = render(
      <SwitchgearTemplateStepper
        manufacturers={[ZPUE_REQUIRES_CATALOG]}
        familiesByManufacturer={{}}
        templatesByContext={() => []}
        onApply={() => {}}
      />,
    );
    expect(
      container
        .querySelector('[data-testid="switchgear-template-stepper"]')
        ?.getAttribute('data-active-step'),
    ).toBe('manufacturer');
  });

  it('wybór producenta przechodzi do kroku family', () => {
    const { container } = render(
      <SwitchgearTemplateStepper
        manufacturers={[ZPUE_REQUIRES_CATALOG]}
        familiesByManufacturer={{}}
        templatesByContext={() => []}
        onApply={() => {}}
      />,
    );
    const btn = container.querySelector(
      '[data-testid="manufacturer-picker-option-ZPUE_WLOSZCZOWA"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container
        .querySelector('[data-testid="switchgear-template-stepper"]')
        ?.getAttribute('data-active-step'),
    ).toBe('family');
  });

  it('requires_catalog producent → komunikat fallback + przycisk skip', () => {
    const { container } = render(
      <SwitchgearTemplateStepper
        manufacturers={[ZPUE_REQUIRES_CATALOG]}
        familiesByManufacturer={{}}
        templatesByContext={() => [CANONICAL_TEMPLATE]}
        onApply={() => {}}
      />,
    );
    // Wybierz ZPUE
    fireEvent.click(
      container.querySelector(
        '[data-testid="manufacturer-picker-option-ZPUE_WLOSZCZOWA"]',
      ) as HTMLButtonElement,
    );
    // Family picker pokazuje fallback komunikat
    expect(
      container.querySelector('[data-testid="switchgear-family-picker-fallback"]'),
    ).not.toBeNull();
    // Przycisk "pomiń wybór rodziny" widoczny
    expect(
      container.querySelector('[data-testid="switchgear-template-stepper-skip-family"]'),
    ).not.toBeNull();
  });

  it('skip family → przechodzi do template', () => {
    const { container } = render(
      <SwitchgearTemplateStepper
        manufacturers={[ZPUE_REQUIRES_CATALOG]}
        familiesByManufacturer={{}}
        templatesByContext={() => [CANONICAL_TEMPLATE]}
        onApply={() => {}}
      />,
    );
    fireEvent.click(
      container.querySelector(
        '[data-testid="manufacturer-picker-option-ZPUE_WLOSZCZOWA"]',
      ) as HTMLButtonElement,
    );
    fireEvent.click(
      container.querySelector(
        '[data-testid="switchgear-template-stepper-skip-family"]',
      ) as HTMLButtonElement,
    );
    expect(
      container
        .querySelector('[data-testid="switchgear-template-stepper"]')
        ?.getAttribute('data-active-step'),
    ).toBe('template');
    expect(
      container.querySelector(
        '[data-testid="bay-template-picker-option-CANONICAL_FALLBACK__LINE_OUT"]',
      ),
    ).not.toBeNull();
  });

  it('pełny flow: producent → rodzina → szablon → preview → apply', () => {
    const onApply = vi.fn();
    const verifiedTemplate: CompleteMvBayTemplateSummary = {
      ...CANONICAL_TEMPLATE,
      template_ref: 'VX__SERIES_A__LINE_OUT',
      manufacturer_ref: 'VERIFIED_X',
      switchgear_family_ref: 'VX__SERIES_A',
      source_status: 'official_catalog',
      source_refs: ['catalog:vx_2026.pdf'],
    };
    const { container } = render(
      <SwitchgearTemplateStepper
        manufacturers={[VERIFIED_VENDOR]}
        familiesByManufacturer={{ VERIFIED_X: [VERIFIED_FAMILY] }}
        templatesByContext={() => [verifiedTemplate]}
        onApply={onApply}
      />,
    );

    // 1. Wybierz producenta
    fireEvent.click(
      container.querySelector(
        '[data-testid="manufacturer-picker-option-VERIFIED_X"]',
      ) as HTMLButtonElement,
    );
    // 2. Wybierz rodzinę
    fireEvent.click(
      container.querySelector(
        '[data-testid="switchgear-family-picker-option-VX__SERIES_A"]',
      ) as HTMLButtonElement,
    );
    // 3. Wybierz szablon
    fireEvent.click(
      container.querySelector(
        '[data-testid="bay-template-picker-option-VX__SERIES_A__LINE_OUT"]',
      ) as HTMLButtonElement,
    );
    // Sprawdź preview
    expect(
      container.querySelector('[data-testid="switchgear-template-stepper-preview"]'),
    ).not.toBeNull();
    // Apply
    fireEvent.click(
      container.querySelector(
        '[data-testid="switchgear-template-stepper-apply"]',
      ) as HTMLButtonElement,
    );
    expect(onApply).toHaveBeenCalledWith('VX__SERIES_A__LINE_OUT', {
      manufacturerRef: 'VERIFIED_X',
      switchgearFamilyRef: 'VX__SERIES_A',
      templateRef: 'VX__SERIES_A__LINE_OUT',
    });
  });

  it('nav: wszystkie kroki widoczne na pasku', () => {
    const { container } = render(
      <SwitchgearTemplateStepper
        manufacturers={[ZPUE_REQUIRES_CATALOG]}
        familiesByManufacturer={{}}
        templatesByContext={() => []}
        onApply={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-testid="switchgear-template-stepper-step-manufacturer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="switchgear-template-stepper-step-family"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="switchgear-template-stepper-step-template"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="switchgear-template-stepper-step-preview"]'),
    ).not.toBeNull();
  });
});
