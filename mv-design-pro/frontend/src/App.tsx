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
 *
 * WYSOKOŚĆ POWŁOKI (K11-B, naprawa długu zastanego u źródła — Zero-Debt).
 * Wrapper miał `min-h-screen` (SAMO `min-height`), więc łańcuch wysokości
 * powłoki nie miał żadnej definitywnej podstawy: `.mvd-app-obszar`/`.mvd-app`
 * deklarują `height: 100%`, co wobec rodzica o wysokości `auto` degeneruje się
 * do `auto` — powłoka ROSŁA do wysokości treści. Zmierzone na żywej aplikacji
 * (okno 1600×900, przestrzeń Schemat): dokument 1124 px, czyli 224 px POZA
 * oknem, a `body { overflow: hidden }` (index.css) odbiera możliwość
 * przewinięcia — nadmiar był renderowany i NIEOSIĄGALNY. Skutek: kanwa SLD
 * traciła dolne 179 px rysunku, a doki „Dowody inżynierskie" (lewy-dolny) i
 * „Warstwy" (prawy-dolny) leżały w całości poniżej krawędzi okna — realne
 * funkcje, których użytkownik nie mógł kliknąć. `h-screen` (definitywne
 * `100vh`) daje łańcuchowi podstawę; regiony przewijalne (`.mvd-center`)
 * przewijają się WEWNĄTRZ okna, zamiast je rozpychać.
 */
export function App() {
  const mode = useThemeModeStore((s) => s.mode);

  if (mode === 'light_technical') {
    return (
      <div className="mv-light-technical h-screen" data-ui-theme="light-technical">
        <AppRoot />
      </div>
    );
  }

  return (
    <div className="mv-dark-scada h-screen" data-ui-theme="dark-scada">
      <AppRoot />
    </div>
  );
}
