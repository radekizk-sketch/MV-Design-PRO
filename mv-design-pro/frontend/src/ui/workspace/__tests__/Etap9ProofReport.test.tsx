/**
 * Testy Etapu 9 — ProofSurface (E-36) + ReportSurface (E-25/E-37).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQueryClient as render } from '../../../test/queryClientTestUtils';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  type WorkspaceSurfaceDescriptor,
} from '../types';

const PROOF_SURFACE: WorkspaceSurfaceDescriptor = {
  surfaceId: 'proof-test',
  screenCode: 'E-36',
  titlePl: 'Uzasadnienie inżynierskie',
  entityRef: null,
  entityType: null,
  routeState: { payload: {} } as never,
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
  saveMode: 'edit',
  hasUnsavedChanges: false,
  tabId: null,
} as never;

const REPORT_SURFACE: WorkspaceSurfaceDescriptor = {
  ...PROOF_SURFACE,
  surfaceId: 'report-test',
  screenCode: REPORT_SURFACE_SCREEN_CODE,
  titlePl: 'Raport',
} as never;

describe('Etap 9 — ProofSurface + ReportSurface', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: PROOF_SURFACE });
  });

  describe('ProofSurface (E-36)', () => {
    it('renderuje 12 typów Proof Pack z polskimi etykietami', () => {
      render(<WorkspaceSurfaceRouter region="main" />);
      expect(screen.getByTestId('proof-surface')).toBeInTheDocument();
      expect(screen.getByTestId('proof-pack-list')).toBeInTheDocument();

      const expectedTypes = [
        'SC3F_IEC60909',
        'SC1F_IEC60909',
        'SC2F_IEC60909',
        'SC2FG_IEC60909',
        'VDROP',
        'LOAD_FLOW_VOLTAGE',
        'Q_U_REGULATION',
        'EQUIPMENT_PROOF',
        'LOAD_CURRENTS_OVERLOAD',
        'LOSSES_ENERGY',
        'PROTECTION_OVERCURRENT',
        'EARTHING_GROUND_FAULT_SN',
      ];
      for (const type of expectedTypes) {
        expect(screen.getByTestId(`proof-pack-${type}`)).toBeInTheDocument();
      }
    });

    it('zawiera polskie nagłówki "Uzasadnienie inżynierskie obliczeń"', () => {
      render(<WorkspaceSurfaceRouter region="main" />);
      expect(screen.getByText(/Uzasadnienie inżynierskie obliczeń/)).toBeInTheDocument();
      expect(screen.getByText(/Wzór → Dane → Podstawienie → Wynik/)).toBeInTheDocument();
    });

    it('wymienia formaty eksportu JSON/LaTeX/PDF/DOCX', () => {
      render(<WorkspaceSurfaceRouter region="main" />);
      expect(screen.getByText(/JSON · LaTeX · PDF · DOCX/)).toBeInTheDocument();
    });
  });

  describe('ReportSurface (E-25/E-37)', () => {
    beforeEach(() => {
      useNetworkBuildStore.setState({ activeSurface: REPORT_SURFACE });
    });

    it('pokazuje status "zablokowany" gdy brak activeRunId', () => {
      useAppStateStore.getState().setActiveRun(null);
      render(<WorkspaceSurfaceRouter region="main" />);
      const status = screen.getByTestId('report-status');
      expect(status).toHaveAttribute('data-report-status', 'zablokowany');
      expect(status.textContent).toContain('uruchom obliczenia');
    });

    it('pokazuje status "częściowy" gdy run aktywny ale readiness niegotowy', () => {
      useAppStateStore.getState().setActiveRun('run-123');
      useSnapshotStore.setState({
        readiness: { ready: false, blockers: [{ code: 'a', message_pl: 'A', element_ref: null, severity: 'BLOCKER' }], warnings: [] },
      });
      render(<WorkspaceSurfaceRouter region="main" />);
      const status = screen.getByTestId('report-status');
      expect(status).toHaveAttribute('data-report-status', 'czesciowy');
    });

    it('pokazuje status "gotowy" gdy run aktywny i readiness ready=true', () => {
      useAppStateStore.getState().setActiveRun('run-123');
      useSnapshotStore.setState({
        readiness: { ready: true, blockers: [], warnings: [] },
      });
      render(<WorkspaceSurfaceRouter region="main" />);
      const status = screen.getByTestId('report-status');
      expect(status).toHaveAttribute('data-report-status', 'gotowy');
      expect(status.textContent).toContain('Raport gotowy');
    });

    it('ukrywa techniczny sufiks zakresu w kontekście raportu', () => {
      useAppStateStore.getState().setActiveProject('project-1', 'Projekt przemyslowy mp9g6fu5');
      useAppStateStore
        .getState()
        .setActiveCase('case-1', 'Przypadek 50 szablonow mp9g6fu5', 'ShortCircuitCase', 'FRESH');
      useAppStateStore.getState().setActiveRun('run-123');
      useSnapshotStore.setState({
        readiness: { ready: true, blockers: [], warnings: [] },
      });

      render(<WorkspaceSurfaceRouter region="main" />);

      const text = screen.getByTestId('report-surface').textContent ?? '';
      expect(text).toContain('Projekt przemyslowy');
      expect(text).toContain('Zakres 50 szablonow');
      expect(text).not.toMatch(/mp9g6fu5|Przypadek/);
    });

    it('eksport PDF/DOCX jest zablokowany gdy raport nie gotowy', () => {
      useAppStateStore.getState().setActiveRun(null);
      render(<WorkspaceSurfaceRouter region="main" />);
      const pdfBtn = screen.getByTestId('report-export-pdf') as HTMLButtonElement;
      expect(pdfBtn.disabled).toBe(true);
    });

    it('eksport PDF/DOCX jest aktywny gdy raport gotowy', () => {
      useAppStateStore.getState().setActiveRun('run-123');
      useSnapshotStore.setState({
        readiness: { ready: true, blockers: [], warnings: [] },
      });
      render(<WorkspaceSurfaceRouter region="main" />);
      const pdfBtn = screen.getByTestId('report-export-pdf') as HTMLButtonElement;
      expect(pdfBtn.disabled).toBe(false);
    });

    it('zawiera polskie etykiety zakresu (Cała sieć / ciąg / stacja / pole / źródło)', () => {
      render(<WorkspaceSurfaceRouter region="main" />);
      expect(screen.getByText('Cała sieć')).toBeInTheDocument();
      expect(screen.getByText('Wybrany ciąg')).toBeInTheDocument();
      expect(screen.getByText('Wybrane źródło')).toBeInTheDocument();
    });
  });

  it('Aliases ANALYSIS_SURFACE_SCREEN_CODE i REPORT_SURFACE_SCREEN_CODE są obecne', () => {
    expect(ANALYSIS_SURFACE_SCREEN_CODE).toBeTruthy();
    expect(REPORT_SURFACE_SCREEN_CODE).toBeTruthy();
  });
});
