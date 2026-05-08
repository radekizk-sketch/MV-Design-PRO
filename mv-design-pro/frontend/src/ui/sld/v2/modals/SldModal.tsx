/**
 * SldModal — kanoniczny shell dla wszystkich modali SLD V2 (R14).
 *
 * Akcept Inv 14 (Polski Język UI): wszystkie etykiety po polsku.
 * Akcept Inv 8 (Deterministic): brak RNG, brak Date.now() w renderze.
 * A11y: role="dialog" + aria-labelledby + Escape closes.
 *
 * Reuse: BayConfigModal, TransformerEditModal, CouplerEditModal,
 * AddSectionModal, ShowMeasurementsModal, etc.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { COLOR_BG, COLOR_PANEL, COLOR_PANEL_RAISED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, FONT_SANS, FONT_SIZES } from '../theme/tokens';

export interface SldModalProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly onClose: () => void;
  readonly onConfirm?: () => void;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly confirmDisabled?: boolean;
  readonly children: ReactNode;
  readonly width?: number;
}

export function SldModal(props: SldModalProps): JSX.Element | null {
  const {
    isOpen, title, subtitle, onClose, onConfirm,
    confirmLabel = 'Zatwierdź',
    cancelLabel = 'Anuluj',
    confirmDisabled = false,
    children, width = 480,
  } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = `sld-modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (onConfirm && !confirmDisabled) {
        e.preventDefault();
        onConfirm();
      }
    }
  }, [onClose, onConfirm, confirmDisabled]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    /* Auto-focus pierwszego input po otwarciu (a11y) */
    const firstInput = dialogRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    );
    firstInput?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="sld-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        data-testid="sld-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLOR_BG,
          border: `1px solid ${COLOR_PANEL_RAISED}`,
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          width,
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            background: COLOR_PANEL,
            borderBottom: `1px solid ${COLOR_PANEL_RAISED}`,
          }}
        >
          <div
            id={titleId}
            data-testid="sld-modal-title"
            style={{
              fontFamily: FONT_SANS,
              fontSize: FONT_SIZES.switchgearParams,
              fontWeight: 700,
              color: COLOR_TEXT_PRIMARY,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                marginTop: 4,
                fontFamily: FONT_SANS,
                fontSize: FONT_SIZES.bayLabel,
                color: COLOR_TEXT_SECONDARY,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            padding: 16,
            overflowY: 'auto',
            flex: 1,
            color: COLOR_TEXT_PRIMARY,
            fontFamily: FONT_SANS,
            fontSize: FONT_SIZES.bayLabel,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            background: COLOR_PANEL,
            borderTop: `1px solid ${COLOR_PANEL_RAISED}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            data-testid="sld-modal-cancel"
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: 'transparent',
              border: `1px solid ${COLOR_PANEL_RAISED}`,
              color: COLOR_TEXT_SECONDARY,
              borderRadius: 2,
              cursor: 'pointer',
              fontFamily: FONT_SANS,
              fontSize: FONT_SIZES.bayLabel,
            }}
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              data-testid="sld-modal-confirm"
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              style={{
                padding: '6px 16px',
                background: confirmDisabled ? '#3A3A3A' : '#2D6FBA',
                border: 'none',
                color: confirmDisabled ? '#888' : '#FFF',
                borderRadius: 2,
                cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                fontFamily: FONT_SANS,
                fontSize: FONT_SIZES.bayLabel,
                fontWeight: 600,
              }}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
   FormField — kanoniczny formField wrapper (label + input)
   ============================================================================= */

export interface FormFieldProps {
  readonly label: string;
  readonly required?: boolean;
  readonly errorPl?: string;
  readonly hintPl?: string;
  readonly children: ReactNode;
}

export function FormField(props: FormFieldProps): JSX.Element {
  const { label, required, errorPl, hintPl, children } = props;
  return (
    <div data-testid="sld-form-field" style={{ marginBottom: 12 }}>
      <label
        style={{
          display: 'block',
          marginBottom: 4,
          fontWeight: 600,
          color: COLOR_TEXT_PRIMARY,
        }}
      >
        {label}
        {required && <span style={{ color: '#FF4040', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hintPl && !errorPl && (
        <div style={{ marginTop: 2, fontSize: 11, color: COLOR_TEXT_SECONDARY }}>
          {hintPl}
        </div>
      )}
      {errorPl && (
        <div data-testid="sld-form-field-error" style={{ marginTop: 2, fontSize: 11, color: '#FF4040' }}>
          {errorPl}
        </div>
      )}
    </div>
  );
}
