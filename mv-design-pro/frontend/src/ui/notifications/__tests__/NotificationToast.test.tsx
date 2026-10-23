import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { PasekProjektu, type PasekProjektuProps } from '../../../ui2/shell/PasekProjektu';
import { PasekNarzedzi } from '../../../ui2/shell/PasekNarzedzi';
import { NotificationToast, ODSTEP_TOASTOW_PX } from '../NotificationToast';
import { useNotificationStore } from '../store';

describe('NotificationToast', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it('renders a typographic close button instead of a literal unicode escape', () => {
    useNotificationStore.getState().notify('Test ostrzeżenia', 'warning');

    render(<NotificationToast />);

    const closeButton = screen.getByRole('button', { name: 'Zamknij' });
    expect(closeButton).toHaveTextContent('×');
    expect(closeButton).not.toHaveTextContent('\\u00D7');
  });

  it('dismisses the notification when the close button is clicked', () => {
    useNotificationStore.getState().notify('Test informacji', 'info');

    render(<NotificationToast />);

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

/*
 * Karta GPZ-H5-SLD pkt 3e — komunikat nie zasłania „Oblicz". Iloczyn cech:
 *   strefy chronione {brak, pasek projektu, pasek projektu + pasek narzędzi}
 *   × zmiana wysokości paska po wyświetleniu komunikatu {nie, tak (zawinięcie na wąskim oknie)}.
 * Paski są PRAWDZIWYMI komponentami powłoki (atrybut strefy niesie produkt, nie test);
 * jsdom nie liczy układu, więc prostokąty pasków są podstawione — mierzona jest reguła
 * położenia, a kryterium to rozłączność prostokąta przycisku „Oblicz" i stosu komunikatów.
 */

function prostokat(top: number, bottom: number, left = 0, right = 1366): DOMRect {
  return { top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
}

function propsPaska(): PasekProjektuProps {
  return {
    info: {
      projectPresent: true,
      projectName: 'Sieć SN',
      caseName: 'Przypadek 1',
      znacznikWynikow: {
        status: 'NONE', etykieta: 'Brak wyników', przyczynaPl: null, rewizjaBiegu: null, rewizjaModelu: null,
        zmiany: [], cel: null, klikalny: false,
      },
    },
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
  } as PasekProjektuProps;
}

function przetnie(a: DOMRect, b: { top: number; bottom: number; left: number; right: number }): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

describe('NotificationToast — stos komunikatów pod paskami akcji (karta GPZ-H5-SLD pkt 3e)', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  const WARIANTY = [
    { nazwa: 'bez stref chronionych', paski: [] as const },
    { nazwa: 'pasek projektu', paski: ['projekt'] as const },
    { nazwa: 'pasek projektu + pasek narzędzi', paski: ['projekt', 'narzedzia'] as const },
  ];

  for (const wariant of WARIANTY) {
    for (const zawiniecie of [false, true]) {
      it(`${wariant.nazwa} × zawinięcie paska po komunikacie: ${zawiniecie ? 'tak' : 'nie'}`, () => {
        const maProjekt = (wariant.paski as readonly string[]).includes('projekt');
        const maNarzedzia = (wariant.paski as readonly string[]).includes('narzedzia');
        let dolProjektu = 44;
        render(
          <>
            {maProjekt && <PasekProjektu {...propsPaska()} />}
            {maNarzedzia && <PasekNarzedzi liczniki={null} projektOtwarty />}
          </>,
        );
        const oblicz = maProjekt ? screen.getByTestId('mvd-calculate') : null;
        const naglowek = maProjekt ? screen.getByTestId('active-case-bar') : null;
        const narzedzia = maNarzedzia ? screen.getByTestId('mvd-pasek-narzedzi') : null;
        // Strefę chronioną wyznacza atrybut PRODUKTU na paskach powłoki.
        if (naglowek) expect(naglowek.hasAttribute('data-toast-omija')).toBe(true);
        if (narzedzia) expect(narzedzia.hasAttribute('data-toast-omija')).toBe(true);
        naglowek && vi.spyOn(naglowek, 'getBoundingClientRect').mockImplementation(() => prostokat(0, dolProjektu));
        narzedzia && vi.spyOn(narzedzia, 'getBoundingClientRect').mockImplementation(() => prostokat(dolProjektu, dolProjektu + 36));
        // „Oblicz" w prawym końcu paska projektu — tam, gdzie dawniej stał stos `top-2 right-2`.
        const prostokatOblicz = () => prostokat(6, dolProjektu - 6, 1366 - 90, 1366 - 14);
        oblicz && vi.spyOn(oblicz, 'getBoundingClientRect').mockImplementation(prostokatOblicz);

        render(<NotificationToast />);
        act(() => {
          useNotificationStore.getState().notify('Dodano stację', 'success');
        });
        if (zawiniecie) {
          dolProjektu = 88;
          act(() => {
            window.dispatchEvent(new Event('resize'));
          });
        }
        const kontener = screen.getByTestId('notification-toast-container');
        const gora = Number.parseFloat(kontener.style.top);
        const prawa = Number.parseFloat(kontener.style.right);
        const oczekiwanyDol = !maProjekt ? 0 : maNarzedzia ? dolProjektu + 36 : dolProjektu;
        expect(gora).toBe(oczekiwanyDol + ODSTEP_TOASTOW_PX);
        expect(prawa).toBe(ODSTEP_TOASTOW_PX);
        // Kryterium: prostokąt stosu (przy prawej krawędzi, max-w-sm = 384 px) nie przecina „Oblicz".
        const stos = { top: gora, bottom: gora + 80, left: 1366 - prawa - 384, right: 1366 - prawa };
        if (oblicz) expect(przetnie(prostokatOblicz(), stos)).toBe(false);
      });
    }
  }
});
