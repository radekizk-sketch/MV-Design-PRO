import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  LineSegmentInline,
  EMPTY_LINE_SEGMENT_DRAFT,
  SAMPLE_CABLE_CATALOG,
  computeLineSegmentParams,
  type LineSegmentInlineDraft,
} from '../LineSegmentInline';

describe('LineSegmentInline (E-12 R47)', () => {
  describe('computeLineSegmentParams (estymator IEC)', () => {
    it('Bez katalogu → wszystkie null', () => {
      const out = computeLineSegmentParams(EMPTY_LINE_SEGMENT_DRAFT);
      expect(out.rOhm).toBeNull();
      expect(out.xOhm).toBeNull();
      expect(out.imaxA).toBeNull();
    });

    it('XUHAKXS-3x120 + 1000m → R = 0.253 Ω, X = 0.122 Ω', () => {
      const draft: LineSegmentInlineDraft = {
        cableCatalogRef: 'XUHAKXS-3x120',
        lengthM: 1000,
        installation: 'ground',
        temperatureC: 30,
      };
      const out = computeLineSegmentParams(draft);
      expect(out.rOhm).toBeCloseTo(0.253, 3);
      expect(out.xOhm).toBeCloseTo(0.122, 3);
      expect(out.imaxA).toBeCloseTo(295, 0);
    });

    it('XUHAKXS-3x120 + 500m → R = 0.1265, połowa', () => {
      const out = computeLineSegmentParams({
        cableCatalogRef: 'XUHAKXS-3x120',
        lengthM: 500,
        installation: 'ground',
        temperatureC: 30,
      });
      expect(out.rOhm).toBeCloseTo(0.1265, 4);
    });

    it('Temperatura 60°C → Imax zredukowany przez współczynnik temperaturowy', () => {
      const at30 = computeLineSegmentParams({
        cableCatalogRef: 'XUHAKXS-3x120',
        lengthM: 100,
        installation: 'ground',
        temperatureC: 30,
      });
      const at60 = computeLineSegmentParams({
        cableCatalogRef: 'XUHAKXS-3x120',
        lengthM: 100,
        installation: 'ground',
        temperatureC: 60,
      });
      expect(at60.imaxA).toBeLessThan(at30.imaxA!);
      expect(at60.imaxA).toBeCloseTo(295 * Math.sqrt((90 - 60) / (90 - 30)), 0);
    });

    it('Temperatura ≥ 90°C (Tmax) → Imax = 0', () => {
      const out = computeLineSegmentParams({
        cableCatalogRef: 'XUHAKXS-3x120',
        lengthM: 100,
        installation: 'ground',
        temperatureC: 90,
      });
      expect(out.imaxA).toBe(0);
    });

    it('Catalog ma 5 typowych kabli SN', () => {
      expect(SAMPLE_CABLE_CATALOG.length).toBeGreaterThanOrEqual(5);
      const ids = SAMPLE_CABLE_CATALOG.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('LineSegmentInline UI', () => {
    it('Renderuje wszystkie wymagane pola', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      expect(screen.getByTestId('line-segment-inline')).toBeInTheDocument();
      expect(screen.getByTestId('line-cable-catalog')).toBeInTheDocument();
      expect(screen.getByTestId('line-length-m')).toBeInTheDocument();
      expect(screen.getByTestId('line-installation-radio')).toBeInTheDocument();
      expect(screen.getByTestId('line-installation-ground')).toBeInTheDocument();
      expect(screen.getByTestId('line-installation-channel')).toBeInTheDocument();
      expect(screen.getByTestId('line-installation-air')).toBeInTheDocument();
      expect(screen.getByTestId('line-temperature')).toBeInTheDocument();
      expect(screen.getByTestId('line-segment-preview')).toBeInTheDocument();
      expect(screen.getByTestId('line-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('line-confirm')).toBeInTheDocument();
    });

    it('Confirm disabled bez katalogu', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      const btn = screen.getByTestId('line-confirm') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('Wybór katalogu → preview pokazuje R/X/Imax', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      fireEvent.change(screen.getByTestId('line-cable-catalog'), { target: { value: 'XUHAKXS-3x120' } });
      expect(screen.getByTestId('line-r-ohm')).toBeInTheDocument();
      expect(screen.getByTestId('line-x-ohm')).toBeInTheDocument();
      expect(screen.getByTestId('line-imax-a')).toBeInTheDocument();
    });

    it('Confirm aktywny po wyborze katalogu, klik wywołuje onSave', async () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      fireEvent.change(screen.getByTestId('line-cable-catalog'), { target: { value: 'XUHAKXS-3x120' } });
      fireEvent.change(screen.getByTestId('line-length-m'), { target: { value: '450' } });
      const btn = screen.getByTestId('line-confirm') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      fireEvent.click(btn);
      expect(onSave).toHaveBeenCalled();
    });

    it('Zmiana ułożenia → radio select aktualizuje', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      const channelRadio = screen.getByTestId('line-installation-channel') as HTMLInputElement;
      fireEvent.click(channelRadio);
      expect(channelRadio.checked).toBe(true);
    });

    it('Cancel klik wywołuje onCancel', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      fireEvent.click(screen.getByTestId('line-cancel'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('Mode=edit → przycisk pokazuje "Zapisz zmiany"', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="edit" />);
      expect(screen.getByText(/Zapisz zmiany/)).toBeInTheDocument();
    });

    it('Mode=create → przycisk pokazuje "Utwórz odcinek"', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<LineSegmentInline initialDraft={EMPTY_LINE_SEGMENT_DRAFT} onSave={onSave} onCancel={onCancel} mode="create" />);
      expect(screen.getByText(/Utwórz odcinek/)).toBeInTheDocument();
    });
  });
});
