import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectMetadataModal, PROJECT_PHASE_LABELS_PL } from '../ProjectMetadataModal';

describe('ProjectMetadataModal', () => {
  it('nie zamyka okna i pokazuje błąd, gdy zapis metadanych nie powiedzie się', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('Serwer API nie zapisał metadanych.'));

    render(
      <ProjectMetadataModal
        isOpen
        onClose={onClose}
        metadata={{ projectName: 'Sieć testowa' }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId('project-metadata-save'));

    await waitFor(() => {
      expect(screen.getByTestId('project-metadata-save-error')).toHaveTextContent(
        'Serwer API nie zapisał metadanych.',
      );
    });
    expect(screen.getByRole('dialog', { name: 'Metadane projektu' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-metadata-save')).toBeEnabled();

    fireEvent.change(screen.getByTestId('project-metadata-name'), {
      target: { value: 'Sieć testowa po korekcie' },
    });
    expect(screen.queryByTestId('project-metadata-save-error')).not.toBeInTheDocument();
  });

  it('zamyka okno po poprawnym zapisie metadanych', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectMetadataModal
        isOpen
        onClose={onClose}
        metadata={{ projectName: 'Sieć testowa' }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId('project-metadata-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renderuje pola Inwestor i Faza projektu (wymagane dla OSD)', () => {
    render(
      <ProjectMetadataModal
        isOpen
        onClose={vi.fn()}
        metadata={{ projectName: 'Test' }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByTestId('project-metadata-investor')).toBeInTheDocument();
    expect(screen.getByTestId('project-metadata-phase')).toBeInTheDocument();
  });

  it('Faza projektu zawiera 4 opcje PB/PW/PR/PK', () => {
    render(
      <ProjectMetadataModal
        isOpen
        onClose={vi.fn()}
        metadata={{ projectName: 'Test' }}
        onSave={vi.fn()}
      />,
    );
    const phaseSelect = screen.getByTestId('project-metadata-phase') as HTMLSelectElement;
    const optionValues = Array.from(phaseSelect.options).map((o) => o.value);
    expect(optionValues).toContain('PB');
    expect(optionValues).toContain('PW');
    expect(optionValues).toContain('PR');
    expect(optionValues).toContain('PK');
    expect(Object.keys(PROJECT_PHASE_LABELS_PL)).toEqual(['PB', 'PW', 'PR', 'PK']);
  });

  it('zapisuje metadane z investor i phase', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectMetadataModal
        isOpen
        onClose={vi.fn()}
        metadata={{ projectName: 'Test' }}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByTestId('project-metadata-investor'), {
      target: { value: 'PGE Dystrybucja Sp. z o.o.' },
    });
    fireEvent.change(screen.getByTestId('project-metadata-phase'), {
      target: { value: 'PB' },
    });
    fireEvent.click(screen.getByTestId('project-metadata-save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          investor: 'PGE Dystrybucja Sp. z o.o.',
          phase: 'PB',
        }),
      );
    });
  });
});
