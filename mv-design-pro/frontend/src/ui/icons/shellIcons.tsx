/**
 * shellIcons — wspólne SVG ikony używane w AppShellV12 + CanonicalLayout V3.
 *
 * Wyekstrahowane z duplikatów (AppShellV12.tsx + CanonicalLayout.tsx +
 * CanonicalLayoutV3.tsx) — oszczędność ~150 LOC × 3 = ~450 LOC.
 */
import { clsx } from 'clsx';

export interface ShellIconProps {
  readonly className?: string;
}

export function IconChevronLeft({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-4 w-4', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      data-testid="icon-chevron-left"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function IconChevronRight({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-4 w-4', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      data-testid="icon-chevron-right"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconChevronDown({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-3 w-3', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      data-testid="icon-chevron-down"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export function IconClipboard({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-5 w-5', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      data-testid="icon-clipboard"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

export function IconPlay({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-3.5 w-3.5', className)}
      fill="currentColor"
      viewBox="0 0 24 24"
      data-testid="icon-play"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconSearch({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-3.5 w-3.5', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      data-testid="icon-search"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

export function IconGear({ className }: ShellIconProps): JSX.Element {
  return (
    <svg
      className={clsx('h-[18px] w-[18px]', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      data-testid="icon-gear"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
