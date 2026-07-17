import { AppRoot } from './ui2/AppRoot';

/**
 * Korzeń motywu dark-SCADA (kanon V12.xx).
 *
 * Cienki wrapper aplikujący kanoniczny motyw ekranowy dark-SCADA na całą
 * powłokę. Cała logika orkiestracji pozostaje w AppRoot — App odpowiada
 * WYŁĄCZNIE za aktywację motywu (markery `mv-dark-scada` + `data-ui-theme`).
 */
export function App() {
  return (
    <div className="mv-dark-scada min-h-screen" data-ui-theme="dark-scada">
      <AppRoot />
    </div>
  );
}
