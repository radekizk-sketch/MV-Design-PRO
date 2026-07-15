import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertySection } from '../PropertySection';
import { usePinStore } from '../pinStore';
import { INSPECTOR_STRINGS } from '../strings';
import { resetPinStore } from './fixtures';
import type { SekcjaWlasciwosci } from '../inspectorModel';

const zwykla: SekcjaWlasciwosci = {
  id: 'podstawowe',
  tytul: 'Podstawowe',
  wiersze: [{ etykieta: 'Napięcie', wartosc: { wartosc: 15, jednostka: 'kV' } }],
};

const zaawansowana: SekcjaWlasciwosci = {
  id: 'zaawansowane',
  tytul: 'Rozszerzone',
  zaawansowana: true,
  wiersze: [{ etykieta: 'Pola', wartosc: { wartosc: 8, jednostka: 'szt.' } }],
};

function renderSekcja(sekcja: SekcjaWlasciwosci, typObiektu = 'szyna') {
  return render(
    <PropertySection
      typObiektu={typObiektu}
      sekcja={sekcja}
      rewizjaModelu={215}
      onOtworzDowod={() => {}}
    />,
  );
}

describe('PropertySection — akordeon', () => {
  beforeEach(resetPinStore);

  it('sekcja zwykła: domyślnie rozwinięta (aria-expanded=true)', () => {
    renderSekcja(zwykla);
    expect(screen.getByRole('button', { name: /Podstawowe/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('sekcja „Zaawansowane": domyślnie zwinięta, nagłówek = „Zaawansowane"', () => {
    renderSekcja(zaawansowana);
    const toggle = screen.getByRole('button', { name: INSPECTOR_STRINGS.zaawansowane });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('klik nagłówka przełącza rozwinięcie', () => {
    renderSekcja(zaawansowana);
    const toggle = screen.getByRole('button', { name: INSPECTOR_STRINGS.zaawansowane });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('trwałość stanu PER TYP OBIEKTU (localStorage)', () => {
    const { unmount } = renderSekcja(zaawansowana, 'szyna');
    fireEvent.click(screen.getByRole('button', { name: INSPECTOR_STRINGS.zaawansowane }));
    expect(usePinStore.getState().isSectionOpen('szyna', 'zaawansowane', false)).toBe(true);
    // inny typ obiektu zachowuje własny (domyślny) stan
    expect(usePinStore.getState().isSectionOpen('linia', 'zaawansowane', false)).toBe(false);
    unmount();

    // po ponownym zamontowaniu sekcja dla „szyna" pozostaje rozwinięta
    renderSekcja(zaawansowana, 'szyna');
    expect(
      screen.getByRole('button', { name: INSPECTOR_STRINGS.zaawansowane }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('sekcja z błędem jest WYMUSZONA otwarta i nie daje się zwinąć', () => {
    const zBledem: SekcjaWlasciwosci = {
      ...zaawansowana,
      bledy: ['Brak przypisania typu katalogowego'],
    };
    renderSekcja(zBledem);
    const toggle = screen.getByRole('button', { name: INSPECTOR_STRINGS.zaawansowane });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toBeDisabled();
    expect(screen.getByText('Brak przypisania typu katalogowego')).toBeInTheDocument();
  });
});
