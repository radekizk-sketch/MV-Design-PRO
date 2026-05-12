import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyInspectorPanel } from '../EmptyInspectorPanel';
import { INSPECTOR_TABS, getVisibleInspectorTabs } from '../inspectorTabRegistry';

describe('inspector-tabs - Inspektor techniczny', () => {
  it('rejestr ma dziewiec kanonicznych zakladek', () => {
    expect(INSPECTOR_TABS.map((tab) => tab.id)).toEqual([
      'identyfikacja',
      'parametry',
      'katalog',
      'wyniki',
      'uzasadnienie',
      'gotowosc',
      'zabezpieczenia',
      'automatyka',
      'historia',
    ]);
  });

  it('dla pola SN pokazuje zakladki zabezpieczen i automatyki', () => {
    const tabs = getVisibleInspectorTabs('BaySN').map((tab) => tab.id);
    expect(tabs).toContain('zabezpieczenia');
    expect(tabs).toContain('automatyka');
    expect(tabs).toContain('wyniki');
  });

  it('stan braku wyboru pokazuje tylko inspektor techniczny bez karty semantycznej', () => {
    render(<EmptyInspectorPanel selectedElement={null} />);
    expect(screen.queryByText('Karta semantyczna')).not.toBeInTheDocument();
    expect(screen.getByText('Inspektor techniczny')).toBeInTheDocument();
    expect(screen.getByText('Brak wyboru')).toBeInTheDocument();
    expect(screen.getByText(/Wybierz GPZ/)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
