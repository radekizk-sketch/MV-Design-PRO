import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyInspectorPanel } from '../EmptyInspectorPanel';
import { INSPECTOR_TABS, getVisibleInspectorTabs } from '../inspectorTabRegistry';

describe('inspector-tabs - karta techniczna', () => {
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

  it('stan bez zaznaczenia pokazuje kartę techniczną bez pustych pól', () => {
    render(<EmptyInspectorPanel selectedElement={null} />);
    expect(screen.queryByText('Karta semantyczna')).not.toBeInTheDocument();
    expect(screen.getByText('Karta techniczna')).toBeInTheDocument();
    expect(screen.getByText('Wybór układu')).toBeInTheDocument();
    expect(screen.getByText(/Zaznacz GPZ/)).toBeInTheDocument();
    expect(screen.queryByText('Brak wyboru')).not.toBeInTheDocument();
    expect(screen.queryByText('Nazwa')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('zaznaczenie aparatu nie pokazuje surowych referencji ENM w głównej karcie', () => {
    const { container } = render(
      <EmptyInspectorPanel
        selectedElement={{
          id: 'gpz/abc/bay/001/001#ct',
          type: 'Measurement',
          name: 'Przekładnik prądowy — gpz/abc/bay/001/001#ct',
        }}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).toContain('Przekładnik prądowy');
    expect(text).toContain('Układ pomiarowy');
    expect(text).not.toContain('gpz/abc');
    expect(text).not.toContain('Identyfikator techniczny');
  });
});
