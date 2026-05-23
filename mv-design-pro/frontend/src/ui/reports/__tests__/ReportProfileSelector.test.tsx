import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportProfileSelector } from '../ReportProfileSelector';

const defaultProps = {
  projectName: 'GPZ_Test',
  caseName: 'Wariant_Bazowy',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ReportProfileSelector', () => {
  it('renderuje 4 profile w select', () => {
    render(<ReportProfileSelector {...defaultProps} />);
    const select = screen.getByTestId('report-profile-select');
    expect(select).toBeTruthy();
    expect(select.querySelectorAll('option')).toHaveLength(4);
  });

  it('default profile = osd', () => {
    render(<ReportProfileSelector {...defaultProps} />);
    const select = screen.getByTestId('report-profile-select') as HTMLSelectElement;
    expect(select.value).toBe('osd');
  });

  it('zmiana profilu zmienia defaultowe sekcje', () => {
    render(<ReportProfileSelector {...defaultProps} />);
    // OSD default: trace=false
    expect((screen.getByTestId('section-trace') as HTMLInputElement).checked).toBe(false);
    // Switch to audit
    fireEvent.change(screen.getByTestId('report-profile-select'), {
      target: { value: 'audit' },
    });
    // Audit default: trace=true
    expect((screen.getByTestId('section-trace') as HTMLInputElement).checked).toBe(true);
  });

  it('preview nazwy pliku zawiera projekt + case + profil + datę', () => {
    render(<ReportProfileSelector {...defaultProps} />);
    const preview = screen.getByTestId('report-filename-preview').textContent;
    expect(preview).toContain('GPZ_Test');
    expect(preview).toContain('Wariant_Bazowy');
    expect(preview).toContain('osd');
    expect(preview).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(preview).toMatch(/\.pdf$/);
  });

  it('zmiana formatu na docx aktualizuje rozszerzenie', () => {
    render(<ReportProfileSelector {...defaultProps} />);
    fireEvent.change(screen.getByTestId('report-format-select'), {
      target: { value: 'docx' },
    });
    const preview = screen.getByTestId('report-filename-preview').textContent;
    expect(preview).toMatch(/\.docx$/);
  });

  it('onConfirm wywołane z config + fileName', () => {
    const onConfirm = vi.fn();
    render(<ReportProfileSelector {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('report-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [config, fileName] = onConfirm.mock.calls[0];
    expect(config.profile).toBe('osd');
    expect(config.format).toBe('pdf');
    expect(fileName).toContain('GPZ_Test');
  });

  it('onCancel wywołane po kliknięciu Anuluj', () => {
    const onCancel = vi.fn();
    render(<ReportProfileSelector {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('report-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('aria-modal + aria-labelledby dla a11y', () => {
    render(<ReportProfileSelector {...defaultProps} />);
    const dialog = screen.getByTestId('report-profile-selector');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });
});
