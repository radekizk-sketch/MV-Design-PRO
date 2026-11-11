import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
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
  RIGHT_WIDE,
  efektywnaSzerokoscInspektora,
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

  // K6 (Z-13): przeciąganie i klawiatura w paśmie UI-02 340–420 px; 560 px wyłącznie jako
  // jawny tryb szeroki (osobne pole układu, nie wartość szerokości z uchwytu).
  it('inspektor: 340–420 px (domyślnie 360), tryb szeroki 560 px wyłącznie jawnym poleceniem', () => {
    expect([RIGHT_MIN, RIGHT_DEFAULT, RIGHT_MAX, RIGHT_WIDE]).toEqual([340, 360, 420, 560]);
    expect(clampRightWidth(100)).toBe(RIGHT_MIN);
    expect(clampRightWidth(999)).toBe(RIGHT_MAX);
    expect(clampRightWidth(560)).toBe(RIGHT_MAX);
    expect(clampRightWidth(400)).toBe(400);
    expect(clampRightWidth(Number.POSITIVE_INFINITY)).toBe(RIGHT_DEFAULT);
    expect(efektywnaSzerokoscInspektora({ rightWidth: 400, rightWide: false })).toBe(400);
    expect(efektywnaSzerokoscInspektora({ rightWidth: 900, rightWide: false })).toBe(RIGHT_MAX);
    expect(efektywnaSzerokoscInspektora({ rightWidth: 360, rightWide: true })).toBe(RIGHT_WIDE);
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
        model: { leftWidth: 320, rightWidth: 280, leftCollapsed: false, rightCollapsed: false, rightWide: false },
        projekt: { leftWidth: 200, rightWidth: 900, leftCollapsed: true, rightCollapsed: true, rightWide: false },
      },
    });
    expect(useShellStore.getState().getLayout('model')).toMatchObject({ leftWidth: 260, rightWidth: 340 });
    // Dawny zapis 900 px (granica 560) NIE daje trybu szerokiego — przycięcie do 420.
    expect(useShellStore.getState().getLayout('projekt')).toMatchObject({ leftWidth: 220, rightWidth: 420, rightWide: false });
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

  // K6 (Z-13): iloczyn cech — polecenie {przycisk nagłówka, menu Widok} × stan {zwykły,
  // szeroki} × przestrzeń {bieżąca, inna} × zmiana z uchwytu {przeciąganie, klawiatura}.
  it.each(['przycisk', 'menu'] as const)(
    'tryb szeroki (%s): 560 px i powrót tym samym poleceniem, zapis per przestrzeń',
    async (polecenie) => {
      const user = userEvent.setup();
      useShellStore.getState().setRightCollapsed('projekt', false);
      useShellStore.getState().setRightWidth('projekt', 400);
      render(<AppShell />);
      const kolumny = () => screen.getByTestId('mvd-body').style.gridTemplateColumns;
      const wykonaj = async () => {
        if (polecenie === 'przycisk') {
          await user.click(screen.getByTestId('mvd-inspector-szeroki'));
        } else {
          await user.click(screen.getByTestId('mvd-view-menu'));
          await user.click(screen.getByTestId('mvd-toggle-right-wide'));
        }
      };
      expect(kolumny()).toMatch(/ 400px$/);
      expect(screen.getByTestId('mvd-inspector-szeroki')).toHaveAttribute('aria-pressed', 'false');
      await wykonaj();
      expect(kolumny()).toMatch(/ 560px$/);
      expect(screen.getByTestId('mvd-inspector-szeroki')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('mvd-inspector')).toHaveAttribute('data-szeroki', 'true');
      expect(useShellStore.getState().getLayout('projekt').rightWide).toBe(true);
      expect(useShellStore.getState().getLayout('model').rightWide).toBe(false);
      expect(localStorage.getItem('mvd-shell-ui-local') ?? '').toContain('"rightWide":true');
      await wykonaj();
      // Powrót do szerokości sprzed trybu szerokiego (pole szerokości nietknięte).
      expect(kolumny()).toMatch(/ 400px$/);
      expect(useShellStore.getState().getLayout('projekt').rightWide).toBe(false);
    },
  );

  it('tryb szeroki włączony przy zwiniętym inspektorze otwiera go; menu pokazuje stan', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    expect(screen.getByTestId('mvd-inspector')).toHaveAttribute('hidden');
    await user.click(screen.getByTestId('mvd-view-menu'));
    expect(screen.getByTestId('mvd-toggle-right-wide')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByTestId('mvd-toggle-right-wide'));
    expect(screen.getByTestId('mvd-inspector')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('mvd-body').style.gridTemplateColumns).toMatch(/ 560px$/);
    await user.click(screen.getByTestId('mvd-view-menu'));
    expect(screen.getByTestId('mvd-toggle-right-wide')).toHaveAttribute('aria-checked', 'true');
  });

  it.each(['przeciaganie', 'klawiatura'] as const)(
    'zmiana z uchwytu (%s) nie wychodzi poza 420 px i kończy tryb szeroki',
    (zrodlo) => {
      useShellStore.getState().setRightCollapsed('projekt', false);
      render(<AppShell />);
      const uchwyt = screen.getByTestId('mvd-handle-right');
      // jsdom nie ma `PointerEvent` (fireEvent gubi `clientX`), więc ruch wskaźnika to
      // `MouseEvent` o typie `pointermove` — natywne przeciąganie ćwiczy e2e
      // `inspektor-karta-techniczna.spec.ts` (mysz Playwrighta na realnym uchwycie).
      const przesun = (clientX: number) =>
        act(() => {
          window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
        });
      const chwyc = (clientX: number) =>
        act(() => {
          uchwyt.dispatchEvent(new MouseEvent('pointerdown', { clientX, bubbles: true }));
        });
      const kolumny = () => screen.getByTestId('mvd-body').style.gridTemplateColumns;
      if (zrodlo === 'przeciaganie') {
        chwyc(1000);
        przesun(400);
        fireEvent.pointerUp(window);
      } else {
        for (let i = 0; i < 20; i += 1) fireEvent.keyDown(uchwyt, { key: 'ArrowLeft' });
      }
      expect(kolumny()).toMatch(/ 420px$/);
      fireEvent.click(screen.getByTestId('mvd-inspector-szeroki'));
      expect(kolumny()).toMatch(/ 560px$/);
      if (zrodlo === 'przeciaganie') {
        chwyc(1000);
        przesun(900);
        fireEvent.pointerUp(window);
      } else {
        fireEvent.keyDown(uchwyt, { key: 'ArrowLeft' });
      }
      expect(kolumny()).toMatch(/ 420px$/);
      expect(useShellStore.getState().getLayout('projekt').rightWide).toBe(false);
    },
  );

  it('przełączanie przestrzeni skrótami 1–7 zmienia aktywną przestrzeń', () => {
    render(<AppShell />);
    fireEvent.keyDown(window, { key: '6' });
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(screen.getByText(SHELL_STRINGS.spacesHeading)).toBeInTheDocument();
  });
});
