/**
 * UI-02b JEDEN-INSPEKTOR — sekcje obiektu z kanwy NAD oknem technicznym, które idzie za
 * selekcją.
 *
 * Klik obiektu na schemacie daje selekcję, a synchronizacja selekcji
 * (`navigation/useUrlSelectionSync.ts`) otwiera w prawym panelu okno techniczne obiektu
 * (stacja E-13, odcinek E-12, pole/łącznik E-11, źródło GPZ E-10, ZK SN E-14, słup E-15).
 * Prawy inspektor (`ui2/legacy/LegacyInspektor.tsx`) pokazuje wtedy NAD tym oknem te same
 * sekcje obiektu co bez okna (`PanelElementuKanwy`: działania z rejestru menu kanwy, wyniki,
 * stan aparatu, formularz układu PV/BESS/FW po upuszczeniu z palety). Okno otwarte jawnym
 * działaniem użytkownika (formularz operacji, „Otwórz konfigurator stacji") stoi samo.
 *
 * Każde działanie występuje w inspektorze RAZ: okno techniczne chowa swój przycisk, gdy
 * pasek nad nim pokazuje tę samą pozycję rejestru dla tego samego obiektu
 * (`useDzialaniaPaskaNadOknem`). Oba miejsca czytają JEDEN warunek (`usePanelNadOknem`).
 */
import { useMemo } from 'react';

import { oknoOtwarteZSelekcji } from '../../navigation/useUrlSelectionSync';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useStanPaneluElementu, type StanPaneluElementu } from './stanPaneluElementu';

const BRAK_DZIALAN: ReadonlySet<string> = new Set();

/** Czy stan panelu ma cokolwiek do pokazania (obiekt kanwy, działania albo szkic układu). */
export function panelMaTresc(stan: StanPaneluElementu | null): stan is StanPaneluElementu {
  return Boolean(stan && (stan.dane || stan.temat || stan.szkicDer));
}

/** Sekcje obiektu z kanwy do pokazania nad aktywnym oknem technicznym — albo `null`. */
export function usePanelNadOknem(): StanPaneluElementu | null {
  const aktywna = useNetworkBuildStore((state) => state.activeSurface);
  const stan = useStanPaneluElementu();
  if (!aktywna || aktywna.openMode === 'expand_workspace' || !oknoOtwarteZSelekcji(aktywna)) {
    return null;
  }
  return panelMaTresc(stan) ? stan : null;
}

/**
 * Identyfikatory działań rejestru, które pasek nad oknem pokazuje dla obiektu `ref`
 * (dostępne i niedostępne z przyczyną). Pusty zbiór, gdy paska nad oknem nie ma albo
 * dotyczy innego obiektu — wtedy okno pokazuje własne przyciski.
 */
export function useDzialaniaPaskaNadOknem(ref: string | null | undefined): ReadonlySet<string> {
  const stan = usePanelNadOknem();
  return useMemo(() => {
    if (!stan?.temat || !ref || stan.temat.modelRef !== ref) return BRAK_DZIALAN;
    return new Set(stan.akcje.map((akcja) => akcja.id));
  }, [ref, stan]);
}
