import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyInspectorPanel } from '../EmptyInspectorPanel';
import { INSPECTOR_TABS, getVisibleInspectorTabs } from '../inspectorTabRegistry';

describe('inspector-tabs - Inspektor techniczny', () => {
  it('rejestr ma dziewięć kanonicznych zakładek', () => {
    expect(INSPECTOR_TABS.map((tab) => tab.label)).toEqual([
      'Identyfikacja',
      'Parametry',
      'Katalog',
      'Wyniki',
      'Uzasadnienie',
      'Gotowość',
      'Zabezpieczenia',
      'Automatyka',
      'Historia',
    ]);
  });

  it('dla pola SN pokazuje zakładki zabezpieczeń i automatyki', () => {
    const tabs = getVisibleInspectorTabs('BaySN').map((tab) => tab.label);
    expect(tabs).toContain('Zabezpieczenia');
    expect(tabs).toContain('Automatyka');
    expect(tabs).toContain('Wyniki');
  });

  it('stan braku wyboru nie pokazuje pustych zakładek specjalistycznych', () => {
    render(<EmptyInspectorPanel selectedElement={null} />);
    expect(screen.getByText('Inspektor techniczny')).toBeInTheDocument();
    expect(screen.getByText('Wybierz obiekt techniczny')).toBeInTheDocument();
    expect(screen.getByText(/Brak zaznaczenia nie oznacza braku modelu/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Identyfikacja' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gotowość' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Historia' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Zabezpieczenia' })).not.toBeInTheDocument();
  });
});
