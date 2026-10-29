import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import {
  SwitchgearFamilyPicker,
  type SwitchgearFamily,
} from '../SwitchgearFamilyPicker';

function makeFamily(overrides: Partial<SwitchgearFamily> = {}): SwitchgearFamily {
  return {
    switchgear_family_ref: 'DEMO__FAMILY',
    manufacturer_ref: 'DEMO',
    family_name: 'Demo Family',
    series_name: null,
    network_voltages_kv: [15],
    um_classes_kv: [17.5],
    insulation_type: 'air',
    medium_lacznikow: 'PROZNIA',
    // Pola WYLICZANE backendu — przychodzą z każdą odpowiedzią (front nie zna reguły).
    gaz_fluorowany: false,
    dopuszczona_do_budowania: true,
    powod_blokady_pl: null,
    dopuszczona_do_nowych_pol: true,
    powod_blokady_nowych_pol_pl: null,
    construction_type: 'RMU',
    status: 'verified',
    source_refs: ['catalog:demo'],
    notes_pl: null,
    ...overrides,
  };
}

describe('SwitchgearFamilyPicker', () => {
  it('bez producenta — pokazuje komunikat o wyborze producenta', () => {
    const { container } = render(
      <SwitchgearFamilyPicker
        families={[]}
        manufacturerRef={null}
        manufacturerRequiresCatalog={false}
        onSelect={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-testid="switchgear-family-picker-no-manufacturer"]'),
    ).not.toBeNull();
  });

  it('producent requires_catalog — pokazuje fallback komunikat', () => {
    const { container } = render(
      <SwitchgearFamilyPicker
        families={[]}
        manufacturerRef="ZPUE_WLOSZCZOWA"
        manufacturerRequiresCatalog
        onSelect={() => {}}
      />,
    );
    const fallback = container.querySelector('[data-testid="switchgear-family-picker-fallback"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute('data-manufacturer-ref')).toBe('ZPUE_WLOSZCZOWA');
    expect(fallback?.textContent).toContain('szablonu kanonicznego ogólnego');
  });

  it('renderuje listę rodzin gdy producent ma verified katalog', () => {
    const families: SwitchgearFamily[] = [
      makeFamily({
        switchgear_family_ref: 'DEMO__A',
        family_name: 'Family A',
        series_name: 'A1',
        construction_type: 'RMU',
      }),
      makeFamily({
        switchgear_family_ref: 'DEMO__B',
        family_name: 'Family B',
        construction_type: 'wysuwna',
        network_voltages_kv: [15, 20],
        um_classes_kv: [17.5, 24],
      }),
    ];
    const { container } = render(
      <SwitchgearFamilyPicker
        families={families}
        manufacturerRef="DEMO"
        manufacturerRequiresCatalog={false}
        onSelect={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-testid="switchgear-family-picker"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="switchgear-family-picker-option-DEMO__A"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="switchgear-family-picker-option-DEMO__B"]'),
    ).not.toBeNull();
  });

  it('onSelect wywoływany z family_ref przy kliknięciu', () => {
    const onSelect = vi.fn();
    const families: SwitchgearFamily[] = [makeFamily({ switchgear_family_ref: 'F1' })];
    const { container } = render(
      <SwitchgearFamilyPicker
        families={families}
        manufacturerRef="DEMO"
        manufacturerRequiresCatalog={false}
        onSelect={onSelect}
      />,
    );
    const button = container.querySelector(
      '[data-testid="switchgear-family-picker-option-F1"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('F1');
  });

  it('rodzina requires_catalog jest pokazana, ale NIE jest klikalna', () => {
    // Zakaz martwego klika (2026-08-14): backend odmawia budowania na rodzinie
    // bez potwierdzonej karty katalogowej, więc UI nie może jej oferować jako
    // wyboru. Rodzina zostaje widoczna (wiedza o portfolio producenta), lecz
    // nieaktywna i z powodem — nie znika po cichu.
    const onSelect = vi.fn();
    const families: SwitchgearFamily[] = [
      makeFamily({ switchgear_family_ref: 'DEMO__OK', status: 'repo_verified' }),
      makeFamily({
        switchgear_family_ref: 'DEMO__BEZ_KARTY',
        family_name: 'Rodzina bez karty',
        status: 'requires_catalog',
        dopuszczona_do_budowania: false,
        powod_blokady_pl: 'Rodzina wymaga karty katalogowej producenta.',
        dopuszczona_do_nowych_pol: false,
        powod_blokady_nowych_pol_pl: 'Rodzina wymaga karty katalogowej producenta.',
      }),
    ];
    const { container } = render(
      <SwitchgearFamilyPicker
        families={families}
        manufacturerRef="DEMO"
        manufacturerRequiresCatalog={false}
        onSelect={onSelect}
      />,
    );

    const bezKarty = container.querySelector(
      '[data-testid="switchgear-family-picker-option-DEMO__BEZ_KARTY"]',
    ) as HTMLButtonElement;
    expect(bezKarty).not.toBeNull();
    expect(bezKarty.getAttribute('data-buildable')).toBe('false');
    expect(bezKarty.disabled).toBe(true);
    expect(
      container.querySelector(
        '[data-testid="switchgear-family-picker-blocked-DEMO__BEZ_KARTY"]',
      )?.textContent,
    ).toContain('karty katalogowej');

    // Klik w ścieżce natywnej nie może wywołać wyboru.
    bezKarty.click();
    expect(onSelect).not.toHaveBeenCalled();

    const ok = container.querySelector(
      '[data-testid="switchgear-family-picker-option-DEMO__OK"]',
    ) as HTMLButtonElement;
    expect(ok.getAttribute('data-buildable')).toBe('true');
    ok.click();
    expect(onSelect).toHaveBeenCalledWith('DEMO__OK');
  });

  it('same rodziny requires_catalog — fallback zamiast listy martwych opcji', () => {
    const { container } = render(
      <SwitchgearFamilyPicker
        families={[
          makeFamily({
            switchgear_family_ref: 'DEMO__X',
            status: 'requires_catalog',
            dopuszczona_do_budowania: false,
            powod_blokady_pl: 'Rodzina wymaga karty katalogowej producenta.',
            dopuszczona_do_nowych_pol: false,
            powod_blokady_nowych_pol_pl: 'Rodzina wymaga karty katalogowej producenta.',
          }),
        ]}
        manufacturerRef="DEMO"
        manufacturerRequiresCatalog={false}
        onSelect={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-testid="switchgear-family-picker-fallback"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="switchgear-family-picker"]')).toBeNull();
  });

  it('selectedRef oznacza wybraną rodzinę (data-selected="true")', () => {
    const families: SwitchgearFamily[] = [
      makeFamily({ switchgear_family_ref: 'F1' }),
      makeFamily({ switchgear_family_ref: 'F2' }),
    ];
    const { container } = render(
      <SwitchgearFamilyPicker
        families={families}
        manufacturerRef="DEMO"
        manufacturerRequiresCatalog={false}
        selectedRef="F2"
        onSelect={() => {}}
      />,
    );
    expect(
      container
        .querySelector('[data-testid="switchgear-family-picker-option-F1"]')
        ?.getAttribute('data-selected'),
    ).toBe('false');
    expect(
      container
        .querySelector('[data-testid="switchgear-family-picker-option-F2"]')
        ?.getAttribute('data-selected'),
    ).toBe('true');
  });

  it('rodzina z SF₆: w nowym polu niewybieralna z powodem backendu, w polu istniejącym — wybieralna', () => {
    const powod = 'Rozdzielnica Demo SF6 wykorzystuje gaz fluorowany (SF₆). Akcja naprawcza: wybierz wykonanie bez gazów fluorowanych.';
    const families: SwitchgearFamily[] = [
      makeFamily({ switchgear_family_ref: 'DEMO__AIR' }),
      makeFamily({
        switchgear_family_ref: 'DEMO__SF6',
        family_name: 'Demo SF6',
        insulation_type: 'sf6',
        medium_lacznikow: 'SF6',
        gaz_fluorowany: true,
        dopuszczona_do_nowych_pol: false,
        powod_blokady_nowych_pol_pl: powod,
      }),
    ];
    for (const [stan, wybieralna] of [[null, false], ['PROJEKTOWANY', false], ['ISTNIEJACY', true]] as const) {
      const onSelect = vi.fn();
      const { container, unmount } = render(
        <SwitchgearFamilyPicker
          families={families}
          manufacturerRef="DEMO"
          manufacturerRequiresCatalog={false}
          stanObiektu={stan}
          onSelect={onSelect}
        />,
      );
      const sf6 = container.querySelector(
        '[data-testid="switchgear-family-picker-option-DEMO__SF6"]',
      ) as HTMLButtonElement;
      expect(sf6.disabled).toBe(!wybieralna);
      const blokada = container.querySelector('[data-testid="switchgear-family-picker-blocked-DEMO__SF6"]');
      expect(blokada?.textContent ?? null).toBe(wybieralna ? null : powod);
      sf6.click();
      expect(onSelect).toHaveBeenCalledTimes(wybieralna ? 1 : 0);
      unmount();
    }
  });
});
