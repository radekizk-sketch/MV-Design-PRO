import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from '../AppShell';
import {
  useShellStore,
  clampLeftWidth,
  clampRightWidth,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_MIN,
  RIGHT_MAX,
  RAIL_WIDTH,
  LEFT_DEFAULT,
} from '../useShellStore';
import { SHELL_STRINGS } from '../strings';

function resetShell() {
  localStorage.clear();
  useShellStore.setState({
    activeSpace: 'projekt',
    advancementMode: 'basic',
    bottomPanelOpen: false,
    bottomPanelTab: 'problemy',
    layoutBySpace: {},
  });
}

describe('useShellStore — granice szerokości', () => {
  it('lewy panel: 200–320 px', () => {
    expect(clampLeftWidth(50)).toBe(LEFT_MIN);
    expect(clampLeftWidth(999)).toBe(LEFT_MAX);
    expect(clampLeftWidth(260)).toBe(260);
  });

  it('prawy panel: 280–560 px', () => {
    expect(clampRightWidth(100)).toBe(RIGHT_MIN);
    expect(clampRightWidth(999)).toBe(RIGHT_MAX);
    expect(clampRightWidth(400)).toBe(400);
  });
});

describe('useShellStore — trwałość układu per przestrzeń (mock storage)', () => {
  beforeEach(resetShell);

  it('zapamiętuje szerokość osobno dla każdej przestrzeni i zapisuje do storage', () => {
    const store = useShellStore.getState();
    store.setLeftWidth('model', 300);
    expect(useShellStore.getState().getLayout('model').leftWidth).toBe(300);
    // inna przestrzeń pozostaje domyślna
    expect(useShellStore.getState().getLayout('projekt').leftWidth).toBe(LEFT_DEFAULT);

    const persisted = localStorage.getItem('mvd-shell-ui-local') ?? '';
    expect(persisted).toContain('300');
    expect(persisted).toContain('model');
  });

  it('„Przywróć układ domyślny" przywraca domyślny układ przestrzeni', () => {
    const store = useShellStore.getState();
    store.setLeftWidth('projekt', 310);
    store.toggleRightCollapsed('projekt');
    expect(useShellStore.getState().getLayout('projekt').leftWidth).toBe(310);

    useShellStore.getState().resetLayout('projekt');
    const layout = useShellStore.getState().getLayout('projekt');
    expect(layout.leftWidth).toBe(LEFT_DEFAULT);
    // K11-A (SLD-first): domyślnie inspektor ZWINIĘTY — pusty panel nie zabiera
    // przestrzeni roboczej (otwiera go zawartość: selekcja/powierzchnia panelowa).
    expect(layout.rightCollapsed).toBe(true);
  });
});

describe('AppShell — zwijanie/rozwijanie paneli', () => {
  beforeEach(resetShell);

  it('przycisk zwija lewy panel do listwy ikon 48 px z dymkami', () => {
    const { container } = render(<AppShell />);
    expect(container.querySelector('.mvd-nav')).not.toBeNull();

    fireEvent.click(screen.getByTestId('mvd-toggle-left'));

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

  it('przycisk i skrót Ctrl+I przełączają prawy panel (inspektor)', () => {
    // K11-A: start ZWINIĘTY (pusty inspektor nie zabiera przestrzeni) —
    // intencja testu bez zmian: przycisk i Ctrl+I przełączają widoczność.
    render(<AppShell />);
    expect(screen.getByTestId('mvd-inspector')).toHaveAttribute('hidden');
    fireEvent.click(screen.getByTestId('mvd-toggle-right'));
    expect(screen.getByTestId('mvd-inspector')).not.toHaveAttribute('hidden');
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
    expect(screen.getByTestId('mvd-inspector')).toHaveAttribute('hidden');
  });

  it('„Przywróć układ domyślny" z menu Widok resetuje szerokość', () => {
    useShellStore.getState().setLeftWidth('projekt', 300);
    render(<AppShell />);
    expect(screen.getByTestId('mvd-body').style.gridTemplateColumns).toContain('300px');

    fireEvent.click(screen.getByTestId('mvd-view-menu'));
    fireEvent.click(screen.getByTestId('mvd-reset-layout'));

    expect(screen.getByTestId('mvd-body').style.gridTemplateColumns).toContain(`${LEFT_DEFAULT}px`);
  });

  it('przełączanie przestrzeni skrótami 1–7 zmienia aktywną przestrzeń', () => {
    render(<AppShell />);
    fireEvent.keyDown(window, { key: '6' });
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(screen.getByText(SHELL_STRINGS.spacesHeading)).toBeInTheDocument();
  });
});
