import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppShell } from '../AppShell';
import { useShellStore } from '../useShellStore';
import { SHELL_STRINGS } from '../strings';
import { App } from '../../../App';
// Karta FAB-J: `AppRoot` (pod `App`) czyta snapshot audytu 2 przez React Query —
// produkcja dostaje `QueryClientProvider` w `main.tsx`; test montujący pełne
// drzewo dostaje go tym samym helperem co pozostałe testy korzenia aplikacji.
import { renderWithQueryClient } from '../../../test/queryClientTestUtils';
import { useThemeModeStore } from '../../theme/themeMode';

// Kanwa SLD (ciężki komponent canvas) jest atrapowana — ten test sprawdza
// sterownik motywu (wrapper App + html[data-theme]), nie silnik SLD.
vi.mock('../../../ui/sld/v3/canvas/SldCanvasV3Workspace', () => ({
  SldCanvasV3Workspace: () => null,
}));

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

describe('Powłoka — landmarki ARIA', () => {
  beforeEach(resetShell);

  it('udostępnia role nav / main / status, a complementary po rozwinięciu inspektora', () => {
    // K11-A: inspektor bez zawartości startuje ZWINIĘTY (atrybut `hidden`
    // zdejmuje go z drzewa dostępności) — landmark complementary pojawia się
    // z zawartością/rozwinięciem. INTENCJA bez zmian: powłoka udostępnia
    // wszystkie cztery landmarki.
    render(<AppShell />);
    expect(screen.getByRole('navigation', { name: SHELL_STRINGS.spacesHeading })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: SHELL_STRINGS.workspaceLabel })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
    expect(screen.getByRole('complementary', { name: SHELL_STRINGS.inspectorHeading })).toBeInTheDocument();
  });
});

describe('Powłoka — ścieżka klawiatury', () => {
  beforeEach(resetShell);

  it('Tab przechodzi przez kluczowe elementy sterujące (bez myszy)', async () => {
    const user = userEvent.setup();
    render(<AppShell backendStatus="error" />);

    (document.body as HTMLElement).focus();
    const reached = new Set<Element>();
    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      if (document.activeElement && document.activeElement !== document.body) {
        reached.add(document.activeElement);
      }
    }

    const testIds = [...reached]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => id != null);

    // Elementy trzech pasów (projektu, narzędzi, stanu) i nawigacji są osiągalne
    // z klawiatury. Pozycje menu „Widok" (motyw, szczegóły audytowe) są osiągalne
    // przez przycisk menu i strzałki (wzorzec ARIA menu button).
    expect(testIds).toContain('mvd-view-menu');
    expect(testIds).toContain('mvd-reconnect');
    expect(testIds).toContain('mvd-status-model');
    expect(testIds).toContain('mvd-status-gotowosc');
    expect(testIds).toContain('mvd-status-run');

    const navReached = [...reached].some(
      (el) => el.tagName === 'BUTTON' && el.textContent?.includes('Projekt'),
    );
    expect(navReached).toBe(true);
  });

  it('kluczowe przyciski są fokusowalne (brak tabindex=-1)', () => {
    render(<AppShell backendStatus="error" />);
    for (const id of ['mvd-view-menu', 'mvd-reconnect', 'mvd-status-gotowosc', 'mvd-status-run']) {
      expect(screen.getByTestId(id).getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('menu Widok: Enter otwiera, strzałki przenoszą fokus, Escape zamyka i oddaje fokus', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const przycisk = screen.getByTestId('mvd-view-menu');
    przycisk.focus();
    await user.keyboard('{Enter}');
    expect(przycisk).toHaveAttribute('aria-expanded', 'true');
    // K2b §0.4: pierwsza pozycja menu Widok to tryb widoku schematu.
    expect(document.activeElement).toBe(screen.getByTestId('mvd-tryb-widoku-schematu'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByTestId('mvd-theme-toggle'));
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByTestId('mvd-reset-layout'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(przycisk);
  });

  it('„Zapisz" nie istnieje (model zapisują operacje domenowe — brak martwego kliku)', () => {
    render(<AppShell onCalculate={() => undefined} />);
    expect(screen.queryByTestId('mvd-save')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zapisz' })).not.toBeInTheDocument();
  });
});

describe('Powłoka — przełącznik motywu (jeden sterownik)', () => {
  beforeEach(() => {
    resetShell();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
    useThemeModeStore.setState({ mode: 'dark_scada' });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useThemeModeStore.setState({ mode: 'dark_scada' });
  });

  it('natywny klik w przełącznik zmienia html[data-theme] i wrapper App RAZEM', async () => {
    const user = userEvent.setup();
    const { container } = renderWithQueryClient(<App />);

    // Start: tryb dyspozytorski — html[data-theme] i wrapper zgodne.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark_scada');
    expect(container.querySelector('.mv-dark-scada')).not.toBeNull();
    expect(container.querySelector('.mv-light-technical')).toBeNull();

    // Realna ścieżka użytkownika: natywny klik w menu „Widok", potem w pozycję motywu.
    await user.click(screen.getByTestId('mvd-view-menu'));
    await user.click(screen.getByTestId('mvd-theme-toggle'));

    // Po przełączeniu OBA sterowniki idą razem (brak mieszanki motywów).
    expect(document.documentElement.getAttribute('data-theme')).toBe('light_technical');
    expect(container.querySelector('.mv-light-technical')).not.toBeNull();
    expect(container.querySelector('.mv-dark-scada')).toBeNull();
  });
});

describe('Powłoka — kontrast tokenów ≥ AA', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'ui2', 'theme', 'tokens.css'), 'utf8');

  function tokenValue(theme: string, name: string): string {
    const block = css.match(new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{([^}]*)\\}`))![1];
    return block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))![1].trim();
  }

  function luminance(hex: string): number {
    const clean = hex.replace('#', '');
    const ch = [0, 2, 4].map((i) => {
      const s = parseInt(clean.slice(i, i + 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function ratio(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  for (const theme of ['light_technical', 'dark_scada']) {
    it(`${theme}: tekst na tle ≥ 4.5`, () => {
      expect(ratio(tokenValue(theme, '--mvd-bg'), tokenValue(theme, '--mvd-ink'))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
