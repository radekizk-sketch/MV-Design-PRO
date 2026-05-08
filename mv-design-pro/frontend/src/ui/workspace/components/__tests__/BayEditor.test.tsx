import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  BayEditor,
  BayEditorStandalone,
  EMPTY_BAY_DRAFT,
  analyzeBayDraft,
  type BayEditorDraft,
} from '../BayEditor';

describe('BayEditor (E-11 R47)', () => {
  function makeDraft(overrides: Partial<BayEditorDraft> = {}): BayEditorDraft {
    return { ...EMPTY_BAY_DRAFT, id: 'bay-test-1', ...overrides };
  }

  describe('analyzeBayDraft (walidacja)', () => {
    it('LINE_FULL bez CT → ctMissing=true', () => {
      const draft = makeDraft({ role: 'LINE_FULL', cbCatalogRef: 'CB1' });
      const v = analyzeBayDraft(draft);
      expect(v.ctMissing).toBe(true);
    });

    it('LINE_FULL z CT → ctMissing=false', () => {
      const draft = makeDraft({ role: 'LINE_FULL', cbCatalogRef: 'CB1', ctCatalogRef: 'CT1' });
      const v = analyzeBayDraft(draft);
      expect(v.ctMissing).toBe(false);
    });

    it('TR_FULL bez bezpieczników → fuseMissingForTr=true', () => {
      const draft = makeDraft({ role: 'TR_FULL', cbCatalogRef: 'CB1', ctCatalogRef: 'CT1', hasFuse: false });
      const v = analyzeBayDraft(draft);
      expect(v.fuseMissingForTr).toBe(true);
    });

    it('COUPLER bez CT → ctMissing=false (CT nie wymagany)', () => {
      const draft = makeDraft({ role: 'COUPLER', cbCatalogRef: 'CB1' });
      const v = analyzeBayDraft(draft);
      expect(v.ctMissing).toBe(false);
    });

    it('Bez CB → cbMissing=true', () => {
      const draft = makeDraft({ role: 'LINE_FULL' });
      const v = analyzeBayDraft(draft);
      expect(v.cbMissing).toBe(true);
    });
  });

  describe('BayEditor renderowanie i handlery', () => {
    it('Renderuje wszystkie wymagane pola dla LINE_FULL', () => {
      const onChange = vi.fn();
      render(<BayEditor index={0} bay={makeDraft({ role: 'LINE_FULL' })} onChange={onChange} testIdPrefix="bay-editor" />);
      expect(screen.getByTestId('bay-editor-0')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-role')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-cb-ref')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-cb-icu')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-ds-ref')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-ct-ref')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-ct-ratio')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-has-sa')).toBeInTheDocument();
    });

    it('Zmiana CB ref → onChange wywołane z patchem', () => {
      const onChange = vi.fn();
      render(<BayEditor index={0} bay={makeDraft()} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('wizard-bay-0-cb-ref'), { target: { value: 'ABB VD4' } });
      expect(onChange).toHaveBeenCalledWith({ cbCatalogRef: 'ABB VD4' });
    });

    it('Zmiana role na TR_FULL → renderuje pole bezpiecznikowe', () => {
      const onChange = vi.fn();
      const { rerender } = render(<BayEditor index={0} bay={makeDraft({ role: 'LINE_FULL' })} onChange={onChange} />);
      expect(screen.queryByTestId('wizard-bay-0-has-fuse')).not.toBeInTheDocument();
      rerender(<BayEditor index={0} bay={makeDraft({ role: 'TR_FULL' })} onChange={onChange} />);
      expect(screen.getByTestId('wizard-bay-0-has-fuse')).toBeInTheDocument();
    });

    it('Zmiana role na MEASUREMENT → renderuje pole VT', () => {
      const onChange = vi.fn();
      const { rerender } = render(<BayEditor index={0} bay={makeDraft({ role: 'LINE_FULL' })} onChange={onChange} />);
      expect(screen.queryByTestId('wizard-bay-0-has-vt')).not.toBeInTheDocument();
      rerender(<BayEditor index={0} bay={makeDraft({ role: 'MEASUREMENT' })} onChange={onChange} />);
      expect(screen.getByTestId('wizard-bay-0-has-vt')).toBeInTheDocument();
    });

    it('LINE_FULL bez CT → renderuje blocker badge', () => {
      const onChange = vi.fn();
      render(<BayEditor index={0} bay={makeDraft({ role: 'LINE_FULL', cbCatalogRef: 'CB' })} onChange={onChange} />);
      expect(screen.getByTestId('wizard-bay-0-blocker-ct')).toBeInTheDocument();
    });

    it('onRemove obecny → przycisk Usuń wywołuje handler', () => {
      const onChange = vi.fn();
      const onRemove = vi.fn();
      render(<BayEditor index={0} bay={makeDraft()} onChange={onChange} onRemove={onRemove} />);
      fireEvent.click(screen.getByTestId('wizard-bay-0-remove'));
      expect(onRemove).toHaveBeenCalled();
    });

    it('onRemove nieobecny → brak przycisku Usuń', () => {
      const onChange = vi.fn();
      render(<BayEditor index={0} bay={makeDraft()} onChange={onChange} />);
      expect(screen.queryByTestId('wizard-bay-0-remove')).not.toBeInTheDocument();
    });
  });

  describe('BayEditorStandalone (R47)', () => {
    it('Renderuje BayEditor z footer Cancel/Save', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<BayEditorStandalone initialDraft={makeDraft({ cbCatalogRef: 'CB', ctCatalogRef: 'CT' })} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByTestId('bay-editor-standalone')).toBeInTheDocument();
      expect(screen.getByTestId('bay-editor-standalone-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('bay-editor-standalone-save')).toBeInTheDocument();
    });

    it('Save disabled gdy CT brak (LINE_FULL)', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<BayEditorStandalone initialDraft={makeDraft({ role: 'LINE_FULL', cbCatalogRef: 'CB' })} onSave={onSave} onCancel={onCancel} />);
      const btn = screen.getByTestId('bay-editor-standalone-save') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('Save aktywny gdy CB+CT obecne, klik wywołuje onSave', async () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<BayEditorStandalone initialDraft={makeDraft({ role: 'LINE_FULL', cbCatalogRef: 'CB', ctCatalogRef: 'CT' })} onSave={onSave} onCancel={onCancel} />);
      const btn = screen.getByTestId('bay-editor-standalone-save') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      fireEvent.click(btn);
      expect(onSave).toHaveBeenCalled();
    });

    it('Cancel klik wywołuje onCancel', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();
      render(<BayEditorStandalone initialDraft={makeDraft()} onSave={onSave} onCancel={onCancel} />);
      fireEvent.click(screen.getByTestId('bay-editor-standalone-cancel'));
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
