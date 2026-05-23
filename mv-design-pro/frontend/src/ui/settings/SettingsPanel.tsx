/**
 * SettingsPanel — globalny panel ustawień użytkownika.
 *
 * Sekcje:
 *  1. Wygląd - theme switcher (dark_scada / light_technical)
 *  2. Jednostki - precyzja wyświetlania (2/3/4 miejsca po przecinku)
 *  3. Język - PL (default), EN (przygotowanie do i18n)
 *  4. Profil użytkownika - nazwa + SEP D/E
 *
 * Persistowane w localStorage pod kluczem `mvdp.settings`.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useEffect, useState } from 'react';

type ThemeMode = 'dark_scada' | 'light_technical';
type DisplayPrecision = 2 | 3 | 4;
type Language = 'PL' | 'EN';

export interface UserSettings {
  theme: ThemeMode;
  precision: DisplayPrecision;
  language: Language;
  userName: string;
  userSep: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark_scada',
  precision: 3,
  language: 'PL',
  userName: '',
  userSep: '',
};

const SETTINGS_KEY = 'mvdp.settings';

export function loadSettings(): UserSettings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SETTINGS_KEY) : null;
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {
    // ignore - storage not available (incognito, quota)
  }
}

export interface SettingsPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onChange?: (settings: UserSettings) => void;
}

export function SettingsPanel({ isOpen, onClose, onChange }: SettingsPanelProps): JSX.Element | null {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());

  useEffect(() => {
    if (isOpen) setSettings(loadSettings());
  }, [isOpen]);

  const update = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(settings);
    onChange?.(settings);
    onClose();
  }, [settings, onChange, onClose]);

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  if (!isOpen) return null;

  const inputClass = 'w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-blue-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="settings-panel"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ustawienia"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">Ustawienia użytkownika</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Zamknij ustawienia"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Wygląd */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Wygląd
            </legend>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Motyw</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update('theme', 'dark_scada')}
                  className={`flex-1 rounded border px-3 py-2 text-[11px] ${
                    settings.theme === 'dark_scada'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-gray-200 text-gray-600'
                  }`}
                  data-testid="settings-theme-dark"
                >
                  Ciemny (SCADA)
                </button>
                <button
                  type="button"
                  onClick={() => update('theme', 'light_technical')}
                  className={`flex-1 rounded border px-3 py-2 text-[11px] ${
                    settings.theme === 'light_technical'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-gray-200 text-gray-600'
                  }`}
                  data-testid="settings-theme-light"
                >
                  Jasny (Techniczny)
                </button>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">
                Ciemny: SCADA operatorska. Jasny: dla wydruków i raportów PDF.
              </p>
            </div>
          </fieldset>

          {/* Jednostki */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Format jednostek
            </legend>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">
                Precyzja (miejsca po przecinku)
              </label>
              <select
                value={settings.precision}
                onChange={(e) => update('precision', Number(e.target.value) as DisplayPrecision)}
                className={inputClass}
                data-testid="settings-precision"
              >
                <option value={2}>2 miejsca (np. 15.75 kV)</option>
                <option value={3}>3 miejsca (np. 15.750 kV)</option>
                <option value={4}>4 miejsca (np. 15.7500 kV)</option>
              </select>
            </div>
          </fieldset>

          {/* Język */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Język interfejsu
            </legend>
            <div>
              <select
                value={settings.language}
                onChange={(e) => update('language', e.target.value as Language)}
                className={inputClass}
                data-testid="settings-language"
              >
                <option value="PL">Polski (PL)</option>
                <option value="EN">English (EN) - w przygotowaniu</option>
              </select>
              {settings.language === 'EN' && (
                <p className="mt-1 text-[10px] text-amber-700">
                  Tłumaczenie angielskie jeszcze nieukończone. PL pozostaje domyślne dla raportów OSD.
                </p>
              )}
            </div>
          </fieldset>

          {/* Profil */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Profil użytkownika
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Imię i nazwisko</label>
                <input
                  type="text"
                  value={settings.userName}
                  onChange={(e) => update('userName', e.target.value)}
                  className={inputClass}
                  placeholder="Jan Kowalski"
                  data-testid="settings-username"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Uprawnienia SEP
                  <span className="ml-1 text-blue-400 cursor-help" title="Numer uprawnień SEP D (dozór) lub E (eksploatacja). Auto-wypełnione w raporcie OSD.">
                    ⓘ
                  </span>
                </label>
                <input
                  type="text"
                  value={settings.userSep}
                  onChange={(e) => update('userSep', e.target.value)}
                  className={inputClass}
                  placeholder="SEP D nr 12345"
                  data-testid="settings-user-sep"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-500">
              Dane profilu są używane jako default w polach Projektant / Sprawdzający w wniosku OSD.
            </p>
          </fieldset>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={handleReset}
            className="mr-auto px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
            data-testid="settings-reset"
          >
            Resetuj
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
            data-testid="settings-save"
          >
            Zapisz
          </button>
        </footer>
      </div>
    </div>
  );
}
