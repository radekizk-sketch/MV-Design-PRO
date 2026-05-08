/**
 * SldModals — testy 3 critical modali (R14):
 *   - SldModal (shell)
 *   - BayConfigModal
 *   - TransformerEditModal
 *   - CouplerEditModal
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup } from '@testing-library/react';

import { SldModal, FormField } from '../SldModal';
import { BayConfigModal, type BayConfigData } from '../BayConfigModal';
import { TransformerEditModal, type TransformerData } from '../TransformerEditModal';
import { CouplerEditModal, type CouplerData } from '../CouplerEditModal';

describe('SldModal — shell', () => {
  it('Brak renderu gdy isOpen=false', () => {
    const { container } = render(
      <SldModal isOpen={false} title="Test" onClose={vi.fn()}>
        <div>Content</div>
      </SldModal>,
    );
    expect(container.querySelector('[data-testid="sld-modal-dialog"]')).toBeNull();
    cleanup();
  });

  it('Renderuje gdy isOpen=true', () => {
    const { container } = render(
      <SldModal isOpen={true} title="Test Modal" onClose={vi.fn()}>
        <div>Body content</div>
      </SldModal>,
    );
    const dialog = container.querySelector('[data-testid="sld-modal-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    cleanup();
  });

  it('Klik backdrop → onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SldModal isOpen={true} title="Test" onClose={onClose}>
        <div />
      </SldModal>,
    );
    const backdrop = container.querySelector('[data-testid="sld-modal-backdrop"]') as Element;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
  });

  it('Klik wewnątrz dialogu NIE zamyka modal', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SldModal isOpen={true} title="Test" onClose={onClose}>
        <div />
      </SldModal>,
    );
    const dialog = container.querySelector('[data-testid="sld-modal-dialog"]') as Element;
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it('Escape → onClose', () => {
    const onClose = vi.fn();
    render(
      <SldModal isOpen={true} title="Test" onClose={onClose}>
        <div />
      </SldModal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
  });

  it('Cancel button → onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SldModal isOpen={true} title="Test" onClose={onClose}>
        <div />
      </SldModal>,
    );
    const cancelBtn = container.querySelector('[data-testid="sld-modal-cancel"]') as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
  });

  it('Confirm button → onConfirm gdy podany', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <SldModal isOpen={true} title="Test" onClose={vi.fn()} onConfirm={onConfirm}>
        <div />
      </SldModal>,
    );
    const confirmBtn = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledOnce();
    cleanup();
  });

  it('Confirm disabled → klik nie wywołuje onConfirm', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <SldModal isOpen={true} title="Test" onClose={vi.fn()} onConfirm={onConfirm} confirmDisabled>
        <div />
      </SldModal>,
    );
    const confirmBtn = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
    cleanup();
  });

  it('FormField pokazuje label + required asterisk + error', () => {
    const { container, getByText } = render(
      <FormField label="Numer" required errorPl="Błąd walidacji">
        <input />
      </FormField>,
    );
    expect(getByText('Numer')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-form-field-error"]')?.textContent).toBe('Błąd walidacji');
    cleanup();
  });

  it('FormField pokazuje hint gdy brak errorPl', () => {
    const { container } = render(
      <FormField label="Numer" hintPl="Wskazówka">
        <input />
      </FormField>,
    );
    expect(container.textContent).toContain('Wskazówka');
    cleanup();
  });
});

describe('BayConfigModal', () => {
  const initial: BayConfigData = {
    bayRef: 'bay-test',
    bayNumber: '10',
    feederName: 'PST1',
    fieldRole: 'LINE_OUT',
    destinationLabel: 'STAROŁĘCKA 42',
    controlMode: 'remote',
  };

  it('Renderuje 5 pól formularza', () => {
    const { container } = render(
      <BayConfigModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="bay-config-number"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="bay-config-feeder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="bay-config-role"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="bay-config-destination"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="bay-config-control"]')).toBeTruthy();
    cleanup();
  });

  it('Zmiana bay number → state aktualizowany', () => {
    const { container } = render(
      <BayConfigModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const input = container.querySelector('[data-testid="bay-config-number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '23/1' } });
    expect(input.value).toBe('23/1');
    cleanup();
  });

  it('Pusty bay number → walidacja blokuje confirm', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <BayConfigModal isOpen initial={initial} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    const input = container.querySelector('[data-testid="bay-config-number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    const confirmBtn = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.click(confirmBtn);
    expect(onSubmit).not.toHaveBeenCalled();
    cleanup();
  });

  it('Confirm wywołuje onSubmit z aktualnymi danymi', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <BayConfigModal isOpen initial={initial} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    const feederInput = container.querySelector('[data-testid="bay-config-feeder"]') as HTMLInputElement;
    fireEvent.change(feederInput, { target: { value: 'NEW1' } });
    const confirmBtn = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feederName: 'NEW1' }));
    cleanup();
  });

  it('6 polskich opcji w roli pola', () => {
    const { container } = render(
      <BayConfigModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const select = container.querySelector('[data-testid="bay-config-role"]') as HTMLSelectElement;
    expect(select.options.length).toBe(6);
    expect(select.options[0].text).toContain('Liniowe');
    cleanup();
  });
});

describe('TransformerEditModal', () => {
  const initial: TransformerData = {
    transformerRef: 'tr-1',
    designation: 'TR1',
    snMva: 25,
    uhvKv: 110,
    ulvKv: 15,
    vectorGroup: 'YNd11',
    catalogRef: null,
  };

  it('Renderuje 5 pól + select katalog', () => {
    const { container } = render(
      <TransformerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="tr-edit-designation"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tr-edit-sn-mva"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tr-edit-uhv"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tr-edit-ulv"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tr-edit-vector-group"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tr-edit-catalog-ref"]')).toBeTruthy();
    cleanup();
  });

  it('Sn ≤ 0 → walidacja blokuje confirm', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <TransformerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    const sn = container.querySelector('[data-testid="tr-edit-sn-mva"]') as HTMLInputElement;
    fireEvent.change(sn, { target: { value: '0' } });
    const confirmBtn = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    cleanup();
  });

  it('uHV ≤ uLV → walidacja blokuje', () => {
    const { container } = render(
      <TransformerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const ulv = container.querySelector('[data-testid="tr-edit-ulv"]') as HTMLInputElement;
    fireEvent.change(ulv, { target: { value: '120' } });
    const confirmBtn = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    cleanup();
  });

  it('Vector group wybór z 11 opcji + bez wskazania', () => {
    const { container } = render(
      <TransformerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const select = container.querySelector('[data-testid="tr-edit-vector-group"]') as HTMLSelectElement;
    expect(select.options.length).toBe(12); // 11 vector groups + "bez wskazania"
    cleanup();
  });
});

describe('CouplerEditModal', () => {
  const initial: CouplerData = {
    couplerId: 'cpl-1',
    designation: 'SP-1',
    leftSectionId: 'S1',
    rightSectionId: 'S2',
    closedState: 'open',
    autoMode: 'manual',
    comment: '',
  };

  it('Renderuje 3 pola formularza', () => {
    const { container } = render(
      <CouplerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="coupler-edit-state"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="coupler-edit-auto-mode"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="coupler-edit-comment"]')).toBeTruthy();
    cleanup();
  });

  it('Stan closed → hint "POŁĄCZONE elektrycznie"', () => {
    const { container, rerender } = render(
      <CouplerEditModal isOpen initial={{ ...initial, closedState: 'closed' }} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.textContent).toContain('POŁĄCZONE elektrycznie');
    rerender(
      <CouplerEditModal isOpen initial={{ ...initial, closedState: 'open' }} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    cleanup();
  });

  it('Tryb SZR/SP/manual w select', () => {
    const { container } = render(
      <CouplerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const select = container.querySelector('[data-testid="coupler-edit-auto-mode"]') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['manual', 'sp', 'szr']);
    cleanup();
  });

  it('Komentarz operatora w textarea', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <CouplerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    const textarea = container.querySelector('[data-testid="coupler-edit-comment"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'SZR aktywny w nocy' } });
    const confirm = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    fireEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ comment: 'SZR aktywny w nocy' }));
    cleanup();
  });

  it('Info box o invalidacji wyników (Inv 4)', () => {
    const { container } = render(
      <CouplerEditModal isOpen initial={initial} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.textContent).toContain('Inv 4 — Case Immutability Rule');
    cleanup();
  });
});
