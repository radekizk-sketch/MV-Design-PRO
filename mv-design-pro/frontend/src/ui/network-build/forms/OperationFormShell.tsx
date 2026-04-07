import type { ReactNode } from 'react';

interface OperationFormShellProps {
  title: string;
  description: string;
  submitLabel: string;
  submitDisabled?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

export function OperationFormShell({
  title,
  description,
  submitLabel,
  submitDisabled = false,
  error = null,
  onCancel,
  onSubmit,
  children,
}: OperationFormShellProps) {
  return (
    <div className="flex h-full flex-col bg-white" data-testid="operation-form-shell">
      <div className="border-b border-chrome-200 bg-chrome-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-chrome-800">{title}</h3>
        <p className="mt-1 text-[11px] text-chrome-500">{description}</p>
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

      <div className="flex items-center justify-end gap-2 border-t border-chrome-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-chrome-300 bg-white px-3 py-1.5 text-xs font-medium text-chrome-700 hover:bg-chrome-50"
        >
          Anuluj
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="rounded bg-ind-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-ind-700 disabled:cursor-not-allowed disabled:bg-chrome-300"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export default OperationFormShell;
