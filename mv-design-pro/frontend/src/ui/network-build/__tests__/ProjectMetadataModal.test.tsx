import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectMetadataModal } from '../ProjectMetadataModal';

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
});
