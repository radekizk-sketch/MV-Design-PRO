import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../AppShell';
import {
  useShellStore,
  clampLeftWidth,
  clampRightWidth,
  clampBottomHeight,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_MIN,
  RIGHT_MAX,
  RAIL_WIDTH,
  LEFT_DEFAULT,
  RIGHT_DEFAULT,
  BOTTOM_MIN,
  BOTTOM_MAX,
  BOTTOM_DEFAULT,
} from '../useShellStore';
import { SHELL_STRINGS } from '../strings';

function resetShell() {
  localStorage.clear();
  useShellStore.setState({
    activeSpace: 'projekt',
    szczegolyAudytowe: false,
    bottomPanelOpen: false,
    bottomPanelTab: 'problemy',
    layoutBySpace: {},
  });
}

describe('useShellStore — granice szerokości (kontrakt UI-02, karta K1 POWLOKA)', () => {
  beforeEach(resetShell);

  it('lewy panel: 220–260 px, domyślnie 240', () => {
    expect([LEFT_MIN, LEFT_DEFAULT, LEFT_MAX]).toEqual([220, 240, 260]);
    expect(clampLeftWidth(50)).toBe(LEFT_MIN);
    expect(clampLeftWidth(999)).toBe(LEFT_MAX);
    expect(clampLeftWidth(250)).toBe(250);
    expect(clampLeftWidth(Number.NaN)).toBe(LEFT_DEFAULT);
  });

  it('inspektor: 340 px minimum, domyślnie 360 (w paśmie 340–420), przeciąganie do 560', () => {
    expect([RIGHT_MIN, RIGHT_DEFAULT, RIGHT_MAX]).toEqual([340, 360, 560]);
    expect(RIGHT_DEFAULT).toBeLessThanOrEqual(420);
    expect(clampRightWidth(100)).toBe(RIGHT_MIN);
    expect(clampRightWidth(999)).toBe(RIGHT_MAX);
    expect(clampRightWidth(400)).toBe(400);
    expect(clampRightWidth(Number.POSITIVE_INFINITY)).toBe(RIGHT_DEFAULT);
  });

  it('panel dolny: wysokość regulowana w granicach', () => {
    expect(BOTTOM_MIN).toBeLessThan(BOTTOM_DEFAULT);
    expect(BOTTOM_DEFAULT).toBeLessThan(BOTTOM_MAX);
    expect(clampBottomHeight(10)).toBe(BOTTOM_MIN);
    expect(clampBottomHeight(5000)).toBe(BOTTOM_MAX);
    expect(clampBottomHeight(Number.NaN)).toBe(BOTTOM_DEFAULT);
  });

  it('zapis z dawnymi granicami (lewy 200–320, inspektor 280) jest przycinany przy odczycie', () => {
    useShellStore.setState({
      layoutBySpace: {
        model: { leftWidth: 320, rightWidth: 280, leftCollapsed: false, rightCollapsed: false },
        projekt: { leftWidth: 200, rightWidth: 900, leftCollapsed: true, rightCollapsed: true },
      },
    });
    expect(useShellStore.getState().getLayout('model')).toMatchObject({ leftWidth: 260, rightWidth: 340 });
    expect(useShellStore.getState().getLayout('projekt')).toMatchObject({ leftWidth: 220, rightWidth: 560 });
  });
});

describe('useShellStore — trwałość układu per przestrzeń (mock storage)', () => {
  beforeEach(resetShell);

  it('zapamiętuje szerokość osobno dla każdej przestrzeni i zapisuje do storage', () => {
    const store = useShellStore.getState();
    store.setLeftWidth('model', 250);
    expect(useShellStore.getState().getLayout('model').leftWidth).toBe(250);
    // inna przestrzeń pozostaje domyślna
    expect(useShellStore.getState().getLayout('projekt').leftWidth).toBe(LEFT_DEFAULT);

    const persisted = localStorage.getItem('mvd-shell-ui-local') ?? '';
    expect(persisted).toContain('250');
    expect(persisted).toContain('model');
  });

  it('„Przywróć układ domyślny" przywraca domyślny układ przestrzeni', () => {
    const store = useShellStore.getState();
    store.setLeftWidth('projekt', 255);
    store.toggleRightCollapsed('projekt');
    expect(useShellStore.getState().getLayout('projekt').leftWidth).toBe(255);

    useShellStore.getState().resetLayout('projekt');
    const layout = useShellStore.getState().getLayout('projekt');
    expect(layout.leftWidth).toBe(LEFT_DEFAULT);
    expect(layout.rightWidth).toBe(RIGHT_DEFAULT);
    // K11-A (SLD-first): domyślnie inspektor ZWINIĘTY — pusty panel nie zabiera
    // przestrzeni roboczej (otwiera go zawartość: selekcja/powierzchnia panelowa).
    expect(layout.rightCollapsed).toBe(true);
  });
});

describe('AppShell — zwijanie/rozwijanie paneli', () => {
  beforeEach(resetShell);

  it('pozycja „Panel nawigacji" menu Widok zwija lewy panel do listwy ikon 48 px z dymkami', async () => {
    const user = userEvent.setup();
    const { container } = render(<AppShell />);
    expect(container.querySelector('.mvd-nav')).not.toBeNull();

    await user.click(screen.getByTestId('mvd-view-menu'));
    expect(screen.getByTestId('mvd-toggle-left')).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByTestId('mvd-toggle-left'));

    const rail = container.querySelector('.mvd-rail');
    expect(rail).not.toBeNull();
    const railButtons = container.querySelectorAll('.mvd-rail-btn');
    expect(railButtons).toHaveLength(7);
    expect(railButtons[0].getAttribute('title')).toContain('Projekt');
    expect(railButtons[0].getAttribute('title')).toContain('(1)');
    expect(RAIL_WIDTH).toBe(48);
    expect(screen.getByTestId('mvd-body').style.gridTemplateColumns).toContain('48px');
  });

  it('skrót Ctrl+B zwija lewy panel', () => {
    const { container } = render(<AppShell />);
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(container.querySelector('.mvd-rail')).not.toBeNull();
  });

  it('2× klik na uchwycie zwija lewy panel', () => {
    const { container } = render(<AppShell />);
    fireEvent.doubleClick(screen.getByTestId('mvd-handle-left'));
    expect(container.querySelector('.mvd-rail')).not.toBeNull();
  });

  it('pozycja menu Widok i skrót Ctrl+I przełączają prawy panel (inspektor)', async () => {
    // K11-A: start ZWINIĘTY (pusty inspektor nie zabiera przestrzeni) —
    // intencja testu bez zmian: polecenie i Ctrl+I przełączają widoczność.
    const user = userEvent.setup();
    render(<AppShell />);
    expect(screen.getByTestId('mvd-inspector')).toHaveAttribute('hidden');
    await user.click(screen.getByTestId('mvd-view-menu'));
    // Skrót klawiszowy jest opisany przy pozycji (§9 kontraktu UIUX).
    expect(screen.getByTestId('mvd-toggle-right')).toHaveTextContent('Ctrl+I');
    await user.click(screen.getByTestId('mvd-toggle-right'));
    expect(screen.getByTestId('mvd-inspector')).not.toHaveAttribute('hidden');
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
    expect(screen.getByTestId('mvd-inspector')).toHaveAttribute('hidden');
  });

  it('„Przywróć układ domyślny" z menu Widok resetuje szerokość', async () => {
    const user = userEvent.setup();
    useShellStore.getState().setLeftWidth('projekt', 225);
    render(<AppShell />);
    expect(screen.getByTestId('mvd-body').style.gridTemplateColumns).toContain('225px');

    await user.click(screen.getByTestId('mvd-view-menu'));
    await user.click(screen.getByTestId('mvd-reset-layout'));

    expect(screen.getByTestId('mvd-body').style.gridTemplateColumns).toContain(`${LEFT_DEFAULT}px`);
  });

  it('przełączanie przestrzeni skrótami 1–7 zmienia aktywną przestrzeń', () => {
    render(<AppShell />);
    fireEvent.keyDown(window, { key: '6' });
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(screen.getByText(SHELL_STRINGS.spacesHeading)).toBeInTheDocument();
  });
});
