import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../SettingsPanel';

describe('SettingsPanel storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('loadSettings zwraca defaults gdy storage pusty', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('saveSettings persistuje do localStorage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light_technical', precision: 4 });
    const loaded = loadSettings();
    expect(loaded.theme).toBe('light_technical');
    expect(loaded.precision).toBe(4);
  });

  it('loadSettings merge defaults z partial storage', () => {
    window.localStorage.setItem('mvdp.settings', JSON.stringify({ theme: 'light_technical' }));
    const loaded = loadSettings();
    expect(loaded.theme).toBe('light_technical');
    expect(loaded.precision).toBe(DEFAULT_SETTINGS.precision);
    expect(loaded.language).toBe(DEFAULT_SETTINGS.language);
  });

  it('loadSettings odporne na corrupted JSON', () => {
    window.localStorage.setItem('mvdp.settings', 'not-json{');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('SettingsPanel UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(<SettingsPanel isOpen={false} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="settings-panel"]')).toBeNull();
  });

  it('renderuje 4 sekcje (Wygląd, Jednostki, Język, Profil)', () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Wygląd')).toBeInTheDocument();
    expect(screen.getByText('Format jednostek')).toBeInTheDocument();
    expect(screen.getByText('Język interfejsu')).toBeInTheDocument();
    expect(screen.getByText('Profil użytkownika')).toBeInTheDocument();
  });

  it('przełącza theme przez button', () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('settings-theme-light'));
    const lightBtn = screen.getByTestId('settings-theme-light');
    expect(lightBtn.className).toContain('border-blue-500');
  });

  it('save persistuje + wywołuje onChange', () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<SettingsPanel isOpen onClose={onClose} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('settings-precision'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('settings-username'), { target: { value: 'Test User' } });
    fireEvent.click(screen.getByTestId('settings-save'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      precision: 4,
      userName: 'Test User',
    }));
    expect(onClose).toHaveBeenCalled();
    expect(loadSettings().precision).toBe(4);
  });

  it('reset przywraca defaults (bez zapisu do storage)', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light_technical' });
    render(<SettingsPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('settings-reset'));
    const darkBtn = screen.getByTestId('settings-theme-dark');
    expect(darkBtn.className).toContain('border-blue-500');
  });

  it('EN język pokazuje warning "w przygotowaniu"', () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('settings-language'), { target: { value: 'EN' } });
    expect(screen.getByText(/Tłumaczenie angielskie jeszcze nieukończone/)).toBeInTheDocument();
  });
});
