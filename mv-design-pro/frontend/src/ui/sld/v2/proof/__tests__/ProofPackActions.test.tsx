import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProofPackActions } from '../ProofPackActions';

describe('ProofPackActions', () => {
  it('status=not_generated: button "Wygeneruj"', () => {
    render(<ProofPackActions status="not_generated" onGenerate={vi.fn()} />);
    expect(screen.getByTestId('proof-action-generate')).toBeTruthy();
    expect(screen.queryByTestId('proof-action-show')).toBeNull();
  });

  it('button Wygeneruj wywołuje onGenerate', () => {
    const onGenerate = vi.fn();
    render(<ProofPackActions status="not_generated" onGenerate={onGenerate} />);
    fireEvent.click(screen.getByTestId('proof-action-generate'));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('status=generating: spinner', () => {
    render(<ProofPackActions status="generating" onGenerate={vi.fn()} />);
    expect(screen.getByTestId('proof-action-generating')).toBeTruthy();
    expect(screen.getByText(/Generowanie/)).toBeTruthy();
  });

  it('status=generated: Pokaż + Eksportuj', () => {
    render(<ProofPackActions status="generated" onGenerate={vi.fn()} onShow={vi.fn()} onExport={vi.fn()} />);
    expect(screen.getByTestId('proof-action-show')).toBeTruthy();
    expect(screen.getByTestId('proof-action-export')).toBeTruthy();
  });

  it('status=stale: Pokaż + Wygeneruj ponownie', () => {
    render(
      <ProofPackActions
        status="stale"
        onGenerate={vi.fn()}
        onShow={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByTestId('proof-action-regenerate')).toBeTruthy();
    expect(screen.getByText(/Pokaż \(przeterminowany\)/)).toBeTruthy();
  });

  it('Eksportuj otwiera menu z 4 formatami', () => {
    render(<ProofPackActions status="generated" onGenerate={vi.fn()} onShow={vi.fn()} onExport={vi.fn()} />);
    fireEvent.click(screen.getByTestId('proof-action-export'));
    expect(screen.getByTestId('proof-export-menu')).toBeTruthy();
    expect(screen.getByTestId('proof-export-pdf')).toBeTruthy();
    expect(screen.getByTestId('proof-export-latex')).toBeTruthy();
    expect(screen.getByTestId('proof-export-json')).toBeTruthy();
    expect(screen.getByTestId('proof-export-docx')).toBeTruthy();
  });

  it('Wybór formatu wywołuje onExport', () => {
    const onExport = vi.fn();
    render(<ProofPackActions status="generated" onGenerate={vi.fn()} onExport={onExport} />);
    fireEvent.click(screen.getByTestId('proof-action-export'));
    fireEvent.click(screen.getByTestId('proof-export-pdf'));
    expect(onExport).toHaveBeenCalledWith('pdf');
  });

  it('role=toolbar + aria-label dla a11y', () => {
    render(<ProofPackActions status="not_generated" onGenerate={vi.fn()} />);
    const toolbar = screen.getByTestId('proof-pack-actions');
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    expect(toolbar.getAttribute('aria-label')).toBeTruthy();
  });

  it('button Eksportuj disabled gdy brak onExport', () => {
    render(<ProofPackActions status="generated" onGenerate={vi.fn()} onShow={vi.fn()} />);
    const btn = screen.getByTestId('proof-action-export') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
