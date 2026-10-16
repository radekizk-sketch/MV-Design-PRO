/*
 * Pasek projektu (karta K1 POWLOKA) — testy jako ILOCZYN CECH, klik natywny.
 *
 * Cechy, w których mógłby się schować defekt:
 *   * „Oblicz": bieg {trwa, nie trwa} × blokada {brak, BRAK_ZAKRESU, BLOKADA_GOTOWOSCI}
 *     — stan przycisku, przyczyna w podpowiedzi i w treści dostępnej, skutek kliku;
 *   * projekt {otwarty z menu, otwarty bez akcji, brak} — nazwa, menu projektu;
 *   * menu „Widok": każda pozycja × skutek (motyw, szczegóły audytowe, trzy panele, reset)
 *     — stan zaznaczenia odpowiada stanowi powłoki, skrót opisany przy pozycji;
 *   * znacznik wyników {FRESH, OUTDATED, NONE} × cel kliku.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PasekProjektu, type PasekProjektuProps } from '../PasekProjektu';
import { SHELL_STRINGS } from '../strings';
import type { ShellCaseInfo } from '../shellStatus';
import type { CelZnacznikaWynikow, StatusZnacznikaWynikow, ZnacznikSwiezosci } from '../znacznikSwiezosci';
import type { BlokadaObliczen } from '../../spaces/obliczenia/uruchomObliczenie';

const NAZWA = 'Sieć SN Gmina Przykładowa — rozbudowa magistrali 15 kV';

function znacznik(
  status: StatusZnacznikaWynikow,
  cel: CelZnacznikaWynikow,
  przyczynaPl: string | null,
): ZnacznikSwiezosci {
  return {
    status,
    etykieta: SHELL_STRINGS.resultsNone,
    przyczynaPl,
    rewizjaBiegu: null,
    rewizjaModelu: null,
    zmiany: [],
    cel,
    klikalny: cel !== null,
  };
}

function info(over: Partial<ShellCaseInfo> = {}): ShellCaseInfo {
  return {
    projectPresent: true,
    projectName: NAZWA,
    caseName: 'Zwarcia maks.',
    znacznikWynikow: znacznik('NONE', null, null),
    ...over,
  };
}

function props(over: Partial<PasekProjektuProps> = {}): PasekProjektuProps {
  return {
    info: info(),
    themeMode: 'dark_scada',
    onThemeToggle: vi.fn(),
    szczegolyAudytowe: false,
    onToggleSzczegolyAudytowe: vi.fn(),
    leftCollapsed: false,
    rightCollapsed: true,
    bottomOpen: false,
    onToggleLeft: vi.fn(),
    onToggleRight: vi.fn(),
    onToggleBottom: vi.fn(),
    onResetLayout: vi.fn(),
    onCalculate: vi.fn(),
    blokadaObliczen: null,
    biegTrwa: false,
    ...over,
  };
}

const BLOKADY: ReadonlyArray<[string, BlokadaObliczen | null]> = [
  ['brak blokady', null],
  ['brak zakresu', { rodzaj: 'BRAK_ZAKRESU', komunikat: 'Wybierz aktywny zakres obliczeń.' }],
  [
    'blokada gotowości',
    { rodzaj: 'BLOKADA_GOTOWOSCI', komunikat: 'Szyna SN-2 nie ma napięcia znamionowego.' },
  ],
];

describe('Pasek projektu — „Oblicz": bieg × blokada', () => {
  for (const biegTrwa of [false, true]) {
    for (const [opis, blokada] of BLOKADY) {
      it(`bieg ${biegTrwa ? 'trwa' : 'nie trwa'} × ${opis}`, async () => {
        const user = userEvent.setup();
        const p = props({ biegTrwa, blokadaObliczen: blokada, opisBiegu: 'Liczy się' });
        render(<PasekProjektu {...p} />);
        const przycisk = screen.getByTestId('mvd-calculate');
        const przyczyna = screen.getByTestId('mvd-calculate-przyczyna');

        const oczekiwanyStan = biegTrwa ? 'trwa' : blokada ? 'zablokowane' : 'gotowe';
        expect(przycisk).toHaveAttribute('data-stan', oczekiwanyStan);
        expect(przycisk).toHaveAttribute('aria-disabled', String(oczekiwanyStan !== 'gotowe'));
        expect(przycisk).toHaveAttribute('aria-busy', String(biegTrwa));
        // Przyczyna jest TREŚCIĄ DOSTĘPNĄ przycisku, nie tylko dymkiem.
        expect(przycisk.getAttribute('aria-describedby')).toBe(przyczyna.id);
        expect(przycisk).toHaveAccessibleDescription(przycisk.getAttribute('title') ?? '');

        if (biegTrwa) {
          expect(przycisk).toHaveTextContent(SHELL_STRINGS.calculating);
          expect(przyczyna).toHaveTextContent('Liczy się');
        } else {
          expect(przycisk).toHaveTextContent(SHELL_STRINGS.calculate);
          expect(przyczyna).toHaveTextContent(blokada?.komunikat ?? SHELL_STRINGS.calculateHint);
        }

        await user.click(przycisk);
        // Trwający bieg: drugi start z paska jest niemożliwy. Blokada: klik woła tor
        // wykonania, który odmawia startu TYM SAMYM zdaniem (jeden predykat).
        expect(p.onCalculate).toHaveBeenCalledTimes(biegTrwa ? 0 : 1);
      });
    }
  }

  it('bez akcji obliczeń przycisk nie istnieje (zero martwego kliku)', () => {
    render(<PasekProjektu {...props({ onCalculate: undefined })} />);
    expect(screen.queryByTestId('mvd-calculate')).not.toBeInTheDocument();
  });

  it('„Zapisz" nie istnieje w pasku projektu', () => {
    render(<PasekProjektu {...props()} />);
    expect(screen.queryByRole('button', { name: 'Zapisz' })).not.toBeInTheDocument();
  });
});

describe('Pasek projektu — projekt i zakres', () => {
  it('nazwa projektu w całości w treści, dostępnej nazwie i podpowiedzi menu projektu', async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const onOpenProjectMetadata = vi.fn();
    render(<PasekProjektu {...props({ onOpenProject, onOpenProjectMetadata })} />);
    const nazwa = screen.getByTestId('mvd-projekt-nazwa');
    expect(nazwa).toHaveTextContent(NAZWA);
    expect(nazwa).toHaveAccessibleName(`Projekt ${NAZWA}`);
    expect(nazwa.getAttribute('title')).toContain(NAZWA);

    await user.click(nazwa);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      SHELL_STRINGS.changeProject,
      SHELL_STRINGS.projectMetadata,
    ]);
    await user.click(screen.getByTestId('mvd-projekt-metadane'));
    expect(onOpenProjectMetadata).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('projekt bez akcji: nazwa statyczna, bez menu', () => {
    render(<PasekProjektu {...props()} />);
    const nazwa = screen.getByTestId('mvd-projekt-nazwa');
    expect(nazwa.tagName).toBe('SPAN');
    expect(nazwa).toHaveTextContent(NAZWA);
  });

  it('brak projektu: komunikat i „Otwórz projekt", bez zakresu i znacznika wyników', async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    render(
      <PasekProjektu
        {...props({
          info: info({ projectPresent: false, projectName: null, caseName: null }),
          onOpenProject,
        })}
      />,
    );
    expect(screen.getByText(SHELL_STRINGS.noProject)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-projekt-przypadek')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-projekt-wyniki')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-open-project'));
    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });

  it('zakres obliczeń: klik otwiera warianty; bez akcji — etykieta statyczna', async () => {
    const user = userEvent.setup();
    const onOpenVariants = vi.fn();
    const { rerender } = render(<PasekProjektu {...props({ onOpenVariants })} />);
    await user.click(screen.getByTestId('mvd-projekt-przypadek'));
    expect(onOpenVariants).toHaveBeenCalledTimes(1);
    rerender(<PasekProjektu {...props()} />);
    expect(screen.getByTestId('mvd-projekt-przypadek').tagName).toBe('SPAN');
  });

  for (const [status, cel] of [
    ['FRESH', 'wyniki'],
    ['OUTDATED', 'obliczenia'],
    ['NONE', null],
  ] as const) {
    it(`znacznik wyników ${status} → cel ${cel ?? 'brak'}`, async () => {
      const user = userEvent.setup();
      const onOtworzWyniki = vi.fn();
      const onPrzejdzDoObliczen = vi.fn();
      render(
        <PasekProjektu
          {...props({
            info: info({
              znacznikWynikow: znacznik(status, cel, 'Przyczyna z serwera.'),
            }),
            onOtworzWyniki,
            onPrzejdzDoObliczen,
          })}
        />,
      );
      const chip = screen.getByTestId('mvd-projekt-wyniki');
      expect(chip).toHaveAttribute('data-status', status);
      expect(chip.getAttribute('title')).toContain('Przyczyna z serwera.');
      if (cel === null) {
        expect(chip.tagName).toBe('SPAN');
        return;
      }
      await user.click(chip);
      expect(onOtworzWyniki).toHaveBeenCalledTimes(cel === 'wyniki' ? 1 : 0);
      expect(onPrzejdzDoObliczen).toHaveBeenCalledTimes(cel === 'obliczenia' ? 1 : 0);
    });
  }
});

describe('Pasek projektu — menu „Widok": pozycja × skutek', () => {
  const POZYCJE = [
    ['mvd-theme-toggle', 'onThemeToggle'],
    ['mvd-szczegoly-audytowe', 'onToggleSzczegolyAudytowe'],
    ['mvd-toggle-left', 'onToggleLeft'],
    ['mvd-toggle-right', 'onToggleRight'],
    ['mvd-toggle-bottom', 'onToggleBottom'],
    ['mvd-reset-layout', 'onResetLayout'],
  ] as const;

  it('kolejność pozycji: motyw, szczegóły audytowe, trzy panele, reset', async () => {
    const user = userEvent.setup();
    render(<PasekProjektu {...props()} />);
    await user.click(screen.getByTestId('mvd-view-menu'));
    const menu = screen.getByRole('menu', { name: SHELL_STRINGS.viewMenu });
    const ids = [...menu.querySelectorAll('[role^="menuitem"]')].map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(ids).toEqual(POZYCJE.map(([id]) => id));
  });

  for (const [testId, akcja] of POZYCJE) {
    it(`${testId} woła ${akcja} i zamyka menu`, async () => {
      const user = userEvent.setup();
      const p = props();
      render(<PasekProjektu {...p} />);
      await user.click(screen.getByTestId('mvd-view-menu'));
      await user.click(screen.getByTestId(testId));
      expect(p[akcja]).toHaveBeenCalledTimes(1);
      for (const [, inna] of POZYCJE) {
        if (inna !== akcja) expect(p[inna]).not.toHaveBeenCalled();
      }
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  }

  for (const szczegoly of [false, true]) {
    for (const [lewy, prawy, dolny] of [
      [false, true, false],
      [true, false, true],
    ] as const) {
      it(`zaznaczenie odpowiada stanowi: szczegóły ${szczegoly}, lewy zwinięty ${lewy}, inspektor zwinięty ${prawy}, dolny ${dolny}`, async () => {
        const user = userEvent.setup();
        render(
          <PasekProjektu
            {...props({
              szczegolyAudytowe: szczegoly,
              leftCollapsed: lewy,
              rightCollapsed: prawy,
              bottomOpen: dolny,
            })}
          />,
        );
        await user.click(screen.getByTestId('mvd-view-menu'));
        expect(screen.getByTestId('mvd-szczegoly-audytowe')).toHaveAttribute('aria-checked', String(szczegoly));
        expect(screen.getByTestId('mvd-toggle-left')).toHaveAttribute('aria-checked', String(!lewy));
        expect(screen.getByTestId('mvd-toggle-right')).toHaveAttribute('aria-checked', String(!prawy));
        expect(screen.getByTestId('mvd-toggle-bottom')).toHaveAttribute('aria-checked', String(dolny));
        // Motyw i reset to polecenia, nie przełączniki.
        expect(screen.getByTestId('mvd-theme-toggle')).toHaveAttribute('role', 'menuitem');
        expect(screen.getByTestId('mvd-reset-layout')).toHaveAttribute('role', 'menuitem');
      });
    }
  }

  it('motyw pokazuje bieżącą wartość, skróty paneli są opisane przy pozycjach', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PasekProjektu {...props({ themeMode: 'dark_scada' })} />);
    await user.click(screen.getByTestId('mvd-view-menu'));
    const ciemny = screen.getByTestId('mvd-theme-toggle').textContent;
    expect(screen.getByTestId('mvd-toggle-left')).toHaveTextContent('Ctrl+B');
    expect(screen.getByTestId('mvd-toggle-right')).toHaveTextContent('Ctrl+I');
    rerender(<PasekProjektu {...props({ themeMode: 'light_technical' })} />);
    expect(screen.getByTestId('mvd-theme-toggle').textContent).not.toBe(ciemny);
  });

  it('klik poza menu zamyka je bez wywołania akcji', async () => {
    const user = userEvent.setup();
    const p = props();
    render(
      <div>
        <PasekProjektu {...p} />
        <p data-testid="poza">poza</p>
      </div>,
    );
    await user.click(screen.getByTestId('mvd-view-menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('poza'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    for (const [, akcja] of POZYCJE) expect(p[akcja]).not.toHaveBeenCalled();
  });
});
