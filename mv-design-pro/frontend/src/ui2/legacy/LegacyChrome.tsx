/**
 * LegacyChrome (karta E1.7c) — funkcje globalne PRZENIESIONE ze starej ramy
 * (App.tsx + AppShellV12) po jej kasacji. Zero nowej semantyki:
 * - powiadomienia (NotificationToast) — notify() z warstw legacy nadal widoczne,
 * - panele globalne: Pomoc (F1), Ustawienia (Ctrl+,), Samouczek (?tour=1),
 * - obsługa klawiatury stosu dialogów (ESC / Cmd+ESC),
 * - synchronizacja trybu pracy → nakładki wyników (V12OverlayModeController),
 * - skróty cofnij/ponów (Ctrl+Z / Ctrl+Y) — bezgłowe,
 * - hak testowy E2E `__mvdpOpenOperationForm` (wyłącznie DEV).
 */

import { useEffect, useState } from 'react';

import { NotificationToast } from '../../ui/notifications/NotificationToast';
import { HelpPanel } from '../../ui/help';
import { SettingsPanel } from '../../ui/settings';
import { installDialogKeyboardHandler } from '../../ui/shared/DialogManager';
import { OnboardingTour, isOnboardingCompleted } from '../../ui/onboarding/OnboardingTour';
import { getCurrentSearchParams } from '../../ui/navigation';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { V12OverlayModeController } from '../../ui/shell/V12OverlayModeController';
import { UndoRedoButtons } from '../../ui/history/UndoRedoButtons';

export function LegacyChrome() {
  // Globalne panele UX (G7 Help, G8 Settings, G5 Onboarding) — dawny App.tsx.
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);

  // Onboarding nie otwiera się automatycznie jako modal na kanwie projektowej,
  // bo blokował kliknięcia w SLD/CAD i testy przepływu inżyniera. Można go
  // uruchomić jawnie przez parametr #...?tour=1.
  useEffect(() => {
    const syncTourState = () => {
      const shouldOpen = getCurrentSearchParams().get('tour') === '1' && !isOnboardingCompleted();
      setOnboardingOpen(shouldOpen);
    };
    syncTourState();
    window.addEventListener('hashchange', syncTourState);
    return () => window.removeEventListener('hashchange', syncTourState);
  }, []);

  // Globalny F1 → Pomoc, Ctrl+, → Ustawienia (dawny App.tsx).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // G3 dostawy: globalny dialog stack keyboard handler (ESC zamyka top dialog,
  // Cmd/Ctrl+ESC zamyka wszystkie dialogi z DialogManager) — dawny App.tsx.
  useEffect(() => installDialogKeyboardHandler(), []);

  // E2E hook (tylko DEV/test) — pozwala testom otworzyć dowolny formularz
  // operacji domenowej bez kruchego łańcucha context-menu (dawny AppShellV12).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __mvdpOpenOperationForm?: typeof openOperationForm }).__mvdpOpenOperationForm =
      openOperationForm;
    return () => {
      delete (window as unknown as { __mvdpOpenOperationForm?: unknown }).__mvdpOpenOperationForm;
    };
  }, [openOperationForm]);

  return (
    <>
      {/* Synchronizacja tryb pracy → widoczność nakładek (bezgłowa, dawny AppShellV12). */}
      <V12OverlayModeController />
      {/* Skróty cofnij/ponów (Ctrl+Z/Y) — bezgłowe (dawny AppShellV12). */}
      <div className="sr-only" aria-hidden="true"><UndoRedoButtons /></div>
      <NotificationToast />
      <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OnboardingTour isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </>
  );
}
