import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DerConfiguratorSidebar } from '../DerConfiguratorSidebar';
import {
  DER_CONFIGURATOR_SECTIONS,
  type DerConfiguratorSectionId,
} from '../derConfiguratorContract';

describe('DerConfiguratorSidebar — 10-sekcyjna nawigacja DER', () => {
  it('renderuje wszystkie 10 sekcji', () => {
    render(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={() => {}}
        derKind="PV"
      />,
    );
    for (const section of DER_CONFIGURATOR_SECTIONS) {
      expect(screen.getByTestId(`der-section-${section.id}`)).toBeInTheDocument();
    }
  });

  it('Wyświetla typ DER w nagłówku (PV/BESS/FW)', () => {
    const { rerender } = render(
      <DerConfiguratorSidebar activeSection="ident" onSelectSection={() => {}} derKind="PV" />,
    );
    expect(screen.getByText(/☀ PV/)).toBeInTheDocument();

    rerender(
      <DerConfiguratorSidebar activeSection="ident" onSelectSection={() => {}} derKind="BESS" />,
    );
    expect(screen.getByText(/▣ BESS/)).toBeInTheDocument();

    rerender(
      <DerConfiguratorSidebar activeSection="ident" onSelectSection={() => {}} derKind="FW" />,
    );
    expect(screen.getByText(/⊛ FW/)).toBeInTheDocument();
  });

  it('Aktywna sekcja ma data-section-active="true"', () => {
    render(
      <DerConfiguratorSidebar
        activeSection="frt"
        onSelectSection={() => {}}
        derKind="PV"
      />,
    );
    const frt = screen.getByTestId('der-section-frt');
    expect(frt.getAttribute('data-section-active')).toBe('true');
    expect(frt.getAttribute('aria-current')).toBe('step');
  });

  it('Klik na sekcję wywołuje onSelectSection', () => {
    const handler = vi.fn();
    render(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={handler}
        derKind="PV"
      />,
    );
    fireEvent.click(screen.getByTestId('der-section-protection'));
    expect(handler).toHaveBeenCalledWith('protection');
  });

  it('Ukończone sekcje mają data-section-completed="true" i znak ✓', () => {
    const completed = new Set<DerConfiguratorSectionId>(['ident', 'params']);
    render(
      <DerConfiguratorSidebar
        activeSection="pcc"
        onSelectSection={() => {}}
        derKind="PV"
        completedSections={completed}
      />,
    );
    const ident = screen.getByTestId('der-section-ident');
    expect(ident.getAttribute('data-section-completed')).toBe('true');
    expect(ident.textContent).toContain('✓');
  });

  it('Sekcje z błędem mają data-section-error="true"', () => {
    const errors = new Set<DerConfiguratorSectionId>(['ncrfg']);
    render(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={() => {}}
        derKind="BESS"
        errorSections={errors}
      />,
    );
    const ncrfg = screen.getByTestId('der-section-ncrfg');
    expect(ncrfg.getAttribute('data-section-error')).toBe('true');
    expect(ncrfg.textContent).toContain('!');
  });

  it('density compact → szerokość 240px, comfortable → 320px', () => {
    const { container, rerender } = render(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={() => {}}
        derKind="PV"
        density="compact"
      />,
    );
    let nav = container.querySelector('[data-testid="der-configurator-sidebar"]');
    expect(nav?.className).toContain('w-[240px]');

    rerender(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={() => {}}
        derKind="PV"
        density="comfortable"
      />,
    );
    nav = container.querySelector('[data-testid="der-configurator-sidebar"]');
    expect(nav?.className).toContain('w-[320px]');
  });

  it('aria-label na navie — dostępność', () => {
    render(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={() => {}}
        derKind="PV"
      />,
    );
    expect(screen.getByRole('navigation', { name: /DER Configurator/ })).toBeInTheDocument();
  });

  it('data-der-kind atrybut na navie', () => {
    const { container } = render(
      <DerConfiguratorSidebar
        activeSection="ident"
        onSelectSection={() => {}}
        derKind="BESS"
      />,
    );
    const nav = container.querySelector('[data-testid="der-configurator-sidebar"]');
    expect(nav?.getAttribute('data-der-kind')).toBe('BESS');
  });
});
