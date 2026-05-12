/**
 * ManufacturerPicker — testy komponentu wyboru producenta rozdzielnicy SN.
 *
 * Sprawdza:
 * - render 4 startowych producentów,
 * - badge "Wymaga uzupełnienia katalogu" dla requires_catalog,
 * - blocker hint dla zablokowanych (`requires_catalog` / `deprecated`),
 * - selekcja przez onSelect,
 * - empty state.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import type { Manufacturer } from '../manufacturer';
import { ManufacturerPicker } from '../ManufacturerPicker';

function makeManufacturer(overrides: Partial<Manufacturer>): Manufacturer {
  return {
    manufacturer_ref: 'TEST',
    name: 'Test Co.',
    normalized_code: 'TEST',
    country: 'PL',
    status: 'requires_catalog',
    source_refs: [],
    notes_pl: null,
    ...overrides,
  };
}

const STARTING_FOUR: Manufacturer[] = [
  makeManufacturer({
    manufacturer_ref: 'ZPUE_WLOSZCZOWA',
    name: 'ZPUE S.A. (Włoszczowa)',
    notes_pl: 'Wymaga uzupełnienia katalogu producenta.',
  }),
  makeManufacturer({
    manufacturer_ref: 'ELEKTROMETAL',
    name: 'Elektrometal Energetyka S.A.',
  }),
  makeManufacturer({
    manufacturer_ref: 'ABB',
    name: 'ABB Ltd.',
    country: 'CH',
  }),
  makeManufacturer({
    manufacturer_ref: 'SIEMENS',
    name: 'Siemens AG',
    country: 'DE',
  }),
];

describe('ManufacturerPicker', () => {
  it('renderuje 4 startowych producentów', () => {
    const { container } = render(
      <ManufacturerPicker manufacturers={STARTING_FOUR} onSelect={() => {}} />,
    );
    const list = container.querySelector('[data-testid="manufacturer-picker"]');
    expect(list).not.toBeNull();
    expect(
      container.querySelector('[data-testid="manufacturer-picker-option-ZPUE_WLOSZCZOWA"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="manufacturer-picker-option-ABB"]'),
    ).not.toBeNull();
  });

  it('pokazuje badge "Wymaga uzupełnienia katalogu" dla requires_catalog', () => {
    const { container } = render(
      <ManufacturerPicker manufacturers={STARTING_FOUR} onSelect={() => {}} />,
    );
    const badge = container.querySelector(
      '[data-testid="manufacturer-picker-status-ZPUE_WLOSZCZOWA"]',
    );
    expect(badge?.textContent).toContain('Wymaga uzupełnienia katalogu');
  });

  it('pokazuje hint blocker dla wszystkich requires_catalog producentów', () => {
    const { container } = render(
      <ManufacturerPicker manufacturers={STARTING_FOUR} onSelect={() => {}} />,
    );
    for (const m of STARTING_FOUR) {
      const blocker = container.querySelector(
        `[data-testid="manufacturer-picker-blocked-${m.manufacturer_ref}"]`,
      );
      expect(blocker, `${m.manufacturer_ref} brak blocker hint`).not.toBeNull();
      expect(blocker?.textContent).toContain('szablon kanoniczny');
    }
  });

  it('verified producent NIE pokazuje blocker hint', () => {
    const verified: Manufacturer = makeManufacturer({
      manufacturer_ref: 'VERIFIED_VENDOR',
      name: 'Verified Vendor',
      status: 'verified',
      source_refs: ['catalog:vendor_2026.pdf'],
    });
    const { container } = render(
      <ManufacturerPicker manufacturers={[verified]} onSelect={() => {}} />,
    );
    expect(
      container.querySelector('[data-testid="manufacturer-picker-blocked-VERIFIED_VENDOR"]'),
    ).toBeNull();
    const badge = container.querySelector(
      '[data-testid="manufacturer-picker-status-VERIFIED_VENDOR"]',
    );
    expect(badge?.textContent).toContain('Katalog zweryfikowany');
  });

  it('wybór producenta wywołuje onSelect z manufacturer_ref', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ManufacturerPicker manufacturers={STARTING_FOUR} onSelect={onSelect} />,
    );
    const button = container.querySelector(
      '[data-testid="manufacturer-picker-option-ABB"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('ABB');
  });

  it('selectedRef oznacza wybranego producenta (data-selected="true")', () => {
    const { container } = render(
      <ManufacturerPicker
        manufacturers={STARTING_FOUR}
        selectedRef="SIEMENS"
        onSelect={() => {}}
      />,
    );
    const selected = container.querySelector(
      '[data-testid="manufacturer-picker-option-SIEMENS"]',
    );
    expect(selected?.getAttribute('data-selected')).toBe('true');
    const other = container.querySelector(
      '[data-testid="manufacturer-picker-option-ABB"]',
    );
    expect(other?.getAttribute('data-selected')).toBe('false');
  });

  it('empty state — pokazuje komunikat gdy brak producentów', () => {
    const { container } = render(
      <ManufacturerPicker manufacturers={[]} onSelect={() => {}} />,
    );
    expect(container.querySelector('[data-testid="manufacturer-picker-empty"]')).not.toBeNull();
  });
});
