/**
 * Declarative runtime gating for the single public shell.
 *
 * Public runtime exposes only two effective shell states:
 * - MODEL_EDIT
 * - RESULT_VIEW
 */

import { type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useActiveMode } from '../app-state';
import { normalizeOperatingMode, type RuntimeOperatingMode } from '../operatingMode';
import { notify } from '../notifications/store';
import type { OperatingMode } from '../types';

interface ModeGateProps {
  allowedModes: Array<OperatingMode | RuntimeOperatingMode>;
  children: ReactNode;
  fallback?: ReactNode;
  showBlockedMessage?: boolean;
  blockedMessage?: string;
}

interface BlockedOverlayProps {
  children: ReactNode;
  blocked: boolean;
  message?: string;
  onBlockedClick?: () => void;
}

function normalizeAllowedModes(
  modes: Array<OperatingMode | RuntimeOperatingMode>,
): RuntimeOperatingMode[] {
  return Array.from(new Set(modes.map(normalizeOperatingMode)));
}

function getDefaultBlockedMessage(mode: RuntimeOperatingMode): string {
  return mode === 'RESULT_VIEW'
    ? 'Akcja niedostępna w analizie i wynikach'
    : '';
}

export function ModeGate({
  allowedModes,
  children,
  fallback = null,
  showBlockedMessage = false,
  blockedMessage,
}: ModeGateProps) {
  const mode = useActiveMode();
  const isAllowed = normalizeAllowedModes(allowedModes).includes(mode);

  if (isAllowed) {
    return <>{children}</>;
  }

  if (showBlockedMessage) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm italic text-gray-500">
        {blockedMessage || getDefaultBlockedMessage(mode)}
      </div>
    );
  }

  return <>{fallback}</>;
}

export function BlockedOverlay({
  children,
  blocked,
  message = 'Akcja niedostępna w analizie i wynikach',
  onBlockedClick,
}: BlockedOverlayProps) {
  const handleClick = () => {
    if (!blocked) {
      return;
    }
    if (onBlockedClick) {
      onBlockedClick();
      return;
    }
    notify(message, 'warning');
  };

  return (
    <div className="relative">
      {children}
      {blocked && (
        <div
          onClick={handleClick}
          className={clsx(
            'absolute inset-0 z-10 flex cursor-not-allowed items-center justify-center',
            'bg-gray-100/60'
          )}
          title={message}
        >
          <span className="pointer-events-none max-w-[90%] select-none rounded border border-gray-300 bg-white/90 px-3 py-1.5 text-center text-xs text-gray-600 shadow-sm">
            {message}
          </span>
        </div>
      )}
    </div>
  );
}

export function ModelEditGate({
  children,
  fallback,
  showBlockedMessage = false,
}: Omit<ModeGateProps, 'allowedModes'>) {
  return (
    <ModeGate
      allowedModes={['MODEL_EDIT']}
      fallback={fallback}
      showBlockedMessage={showBlockedMessage}
      blockedMessage="Edycja modelu zablokowana. Wróć do powierzchni modelu sieci."
    >
      {children}
    </ModeGate>
  );
}

export function CaseConfigGate({
  children,
  fallback,
  showBlockedMessage = false,
}: Omit<ModeGateProps, 'allowedModes'>) {
  return (
    <ModeGate
      allowedModes={['MODEL_EDIT']}
      fallback={fallback}
      showBlockedMessage={showBlockedMessage}
      blockedMessage="Warunki obliczeń są niedostępne w analizie i wynikach."
    >
      {children}
    </ModeGate>
  );
}

export function ResultViewGate({
  children,
  fallback,
}: Omit<ModeGateProps, 'allowedModes' | 'showBlockedMessage'>) {
  return <ModeGate allowedModes={['RESULT_VIEW']} fallback={fallback}>{children}</ModeGate>;
}

export default ModeGate;
