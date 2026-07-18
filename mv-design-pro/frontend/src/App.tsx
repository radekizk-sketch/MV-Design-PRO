import { AppRoot } from './ui2/AppRoot';
import { useThemeModeStore } from './ui2/theme/themeMode';

/**
 * Korzeń motywu powłoki (kanon V12.xx).
 *
 * Cienki wrapper aplikujący kanoniczny motyw ekranowy na całą powłokę. Cała
 * logika orkiestracji pozostaje w AppRoot — App odpowiada WYŁĄCZNIE za aktywację
 * motywu na wrapperze DOM.
 *
 * JEDEN STEROWNIK: wrapper czyta ten sam `useThemeModeStore`, co `data-theme`
 * na `<html>` (publikowany przez `applyThemeMode` w AppShell). Dzięki temu
 * powłoka, warstwa legacy (klasy Tailwind) i kanwa SLD są spójne w obu trybach —
 * nie ma już dwóch niezależnych sterowników mieszających motywy na jednym ekranie.
 *
 *   dark_scada       → `mv-dark-scada` (remap jasnych klas Tailwind na ciemne),
 *   light_technical  → `mv-light-technical` (legacy Tailwind jest natywnie jasny;
 *                      klasa ustawia tylko spójne tło/color-scheme, BEZ remapu).
 */
export function App() {
  const mode = useThemeModeStore((s) => s.mode);

  if (mode === 'light_technical') {
    return (
      <div className="mv-light-technical min-h-screen" data-ui-theme="light-technical">
        <AppRoot />
      </div>
    );
  }

  return (
    <div className="mv-dark-scada min-h-screen" data-ui-theme="dark-scada">
      <AppRoot />
    </div>
  );
}
