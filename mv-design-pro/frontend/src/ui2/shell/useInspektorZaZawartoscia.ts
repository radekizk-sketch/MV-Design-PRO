/*
 * K11-A (dyrektywa SLD-first 2026-07-30): inspektor podąża za ZAWARTOŚCIĄ.
 *
 * Prawy panel powłoki ma realną treść wyłącznie, gdy LegacyInspektor coś
 * pokaże: powierzchnię panelową (formularz operacji domenowej, openMode
 * 'replace_right_panel') albo kartę techniczną zaznaczonego elementu. Pusty
 * inspektor („Zaznacz obiekt…") zabierał 320 px przestrzeni roboczej schematu.
 *
 * Automat działa NA ZMIANĘ sygnału zawartości (nie w pętli): pojawienie się
 * zawartości rozwija panel, zniknięcie — zwija. Ręczne przełączenie uchwytem/
 * przyciskiem MIĘDZY zmianami sygnału jest respektowane (automat nie walczy
 * z użytkownikiem o ten sam stan zawartości).
 */

import { useEffect, useRef } from 'react';

import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../ui/selection/store';
import { useShellStore } from './useShellStore';

export function useInspektorZaZawartoscia(): void {
  const maPowierzchniePanelowa = useNetworkBuildStore(
    (state) => state.activeSurface != null && state.activeSurface.openMode !== 'expand_workspace',
  );
  const maSelekcje = useSelectionStore((state) => (state.selectedElements[0] ?? null) != null);
  const activeSpace = useShellStore((state) => state.activeSpace);
  const setRightCollapsed = useShellStore((state) => state.setRightCollapsed);

  const maZawartosc = maPowierzchniePanelowa || maSelekcje;
  // Klucz zastosowania obejmuje przestrzeń: wejście do innej przestrzeni też
  // ustala uczciwy stan jej panelu (układ jest per przestrzeń).
  const zastosowane = useRef<string | null>(null);

  useEffect(() => {
    const klucz = `${activeSpace}:${maZawartosc}`;
    // Pierwsze wywołanie ustala uczciwy stan startowy (pusty inspektor nie
    // zabiera przestrzeni także przy stanie zapisanym sprzed K11-A).
    if (zastosowane.current === klucz) return;
    zastosowane.current = klucz;
    setRightCollapsed(activeSpace, !maZawartosc);
  }, [maZawartosc, activeSpace, setRightCollapsed]);
}
