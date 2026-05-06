/**
 * PR-8b — Testy BayConfigurator + 6 reguł walidacji.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BayConfigurator } from '../BayConfigurator';
import { validateBay, type BayValidationContext } from '../bayValidation';

const VALID_LINE_IN_CTX: BayValidationContext = {
  bayRole: 'IN',
  designation: 'Pole F-01',
  hasOutgoingRun: true,
  isReserveSlot: false,
  hasOutflowPort: true,
  couplerSectionRefs: [],
};

const VALID_TR_CTX: BayValidationContext = {
  bayRole: 'TR',
  designation: 'Pole TR',
  hasOutgoingRun: false,
  isReserveSlot: false,
  transformerConnectedRef: 'tr_1',
  hasOutflowPort: true,
  couplerSectionRefs: [],
};

const VALID_DER_CTX: BayValidationContext = {
  bayRole: 'OZE',
  designation: 'Pole PV',
  hasOutgoingRun: false,
  isReserveSlot: false,
  derAttachmentPointPl: 'szyna SN',
  derKind: 'PV',
  hasOutflowPort: true,
  couplerSectionRefs: [],
};

describe('bayValidation — Reguła R1 (pole liniowe wymaga wyprowadzenia)', () => {
  it('OK gdy pole liniowe ma wyprowadzenie', () => {
    const result = validateBay(VALID_LINE_IN_CTX);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('OK gdy pole liniowe jest oznaczone jako rezerwowe (bez wyprowadzenia)', () => {
    const result = validateBay({ ...VALID_LINE_IN_CTX, hasOutgoingRun: false, isReserveSlot: true });
    expect(result.valid).toBe(true);
  });

  it('Błąd R1 gdy pole liniowe nie ma wyprowadzenia ani statusu rezerwowe', () => {
    const result = validateBay({ ...VALID_LINE_IN_CTX, hasOutgoingRun: false, isReserveSlot: false });
    expect(result.valid).toBe(false);
    expect(result.errors[0].ruleId).toBe('R1');
    expect(result.errors[0].descriptionPl).toContain('wyprowadzenia');
  });
});

describe('bayValidation — Reguła R2 (pole TR wymaga transformatora)', () => {
  it('OK gdy pole TR ma transformator', () => {
    const result = validateBay(VALID_TR_CTX);
    expect(result.valid).toBe(true);
  });

  it('Błąd R2 gdy pole TR bez transformatora', () => {
    const result = validateBay({ ...VALID_TR_CTX, transformerConnectedRef: null });
    expect(result.valid).toBe(false);
    expect(result.errors[0].ruleId).toBe('R2');
  });
});

describe('bayValidation — Reguła R3 (pole DER wymaga punktu przyłączenia + typu)', () => {
  it('OK gdy DER ma attachmentPoint i kind', () => {
    const result = validateBay(VALID_DER_CTX);
    expect(result.valid).toBe(true);
  });

  it('Błąd R3 gdy DER bez attachmentPoint', () => {
    const result = validateBay({ ...VALID_DER_CTX, derAttachmentPointPl: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'R3' && e.descriptionPl.includes('punktu przyłączenia'))).toBe(true);
  });

  it('Błąd R3 gdy DER bez kind', () => {
    const result = validateBay({ ...VALID_DER_CTX, derKind: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'R3' && e.descriptionPl.includes('typu'))).toBe(true);
  });
});

describe('bayValidation — Reguła R4 (pole pomiarowe NIE udaje liniowego)', () => {
  it('OK gdy pole pomiarowe NIE ma portu odpływu', () => {
    const result = validateBay({
      bayRole: 'MEASUREMENT',
      designation: 'Pole pom.',
      hasOutgoingRun: false,
      isReserveSlot: false,
      hasOutflowPort: false,
      couplerSectionRefs: [],
    });
    expect(result.valid).toBe(true);
  });

  it('Błąd R4 gdy pole pomiarowe MA port odpływu (zakaz udawania liniowego)', () => {
    const result = validateBay({
      bayRole: 'MEASUREMENT',
      designation: 'Pole pom.',
      hasOutgoingRun: false,
      isReserveSlot: false,
      hasOutflowPort: true,
      couplerSectionRefs: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].ruleId).toBe('R4');
    expect(result.errors[0].descriptionPl).toContain('zakaz udawania');
  });
});

describe('bayValidation — Reguła R5 (sprzęgło wymaga 2 sekcji szyn)', () => {
  it('OK gdy sprzęgło ma 2 sekcje', () => {
    const result = validateBay({
      bayRole: 'COUPLER',
      designation: 'Sprzęgło',
      hasOutgoingRun: false,
      isReserveSlot: false,
      hasOutflowPort: false,
      couplerSectionRefs: ['sec_1', 'sec_2'],
    });
    expect(result.valid).toBe(true);
  });

  it('Błąd R5 gdy sprzęgło ma tylko 1 sekcję', () => {
    const result = validateBay({
      bayRole: 'COUPLER',
      designation: 'Sprzęgło',
      hasOutgoingRun: false,
      isReserveSlot: false,
      hasOutflowPort: false,
      couplerSectionRefs: ['sec_1'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].ruleId).toBe('R5');
  });

  it('Błąd R5 gdy sprzęgło ma 0 sekcji', () => {
    const result = validateBay({
      bayRole: 'COUPLER',
      designation: 'Sprzęgło',
      hasOutgoingRun: false,
      isReserveSlot: false,
      hasOutflowPort: false,
      couplerSectionRefs: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].ruleId).toBe('R5');
  });
});

describe('bayValidation — Reguła R6 (rezerwowe NIE może mieć aktywnego odcinka)', () => {
  it('OK gdy rezerwowe bez odcinka', () => {
    const result = validateBay({
      ...VALID_LINE_IN_CTX,
      hasOutgoingRun: false,
      isReserveSlot: true,
    });
    expect(result.valid).toBe(true);
  });

  it('Błąd R6 gdy rezerwowe ma aktywny odcinek', () => {
    const result = validateBay({
      ...VALID_LINE_IN_CTX,
      hasOutgoingRun: true,
      isReserveSlot: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'R6')).toBe(true);
  });
});

describe('BayConfigurator — UI', () => {
  it('renderuje 8 sekcji z polskimi etykietami', () => {
    render(
      <BayConfigurator
        bayId="b1"
        designation="Pole F-01"
        bayContext={VALID_LINE_IN_CTX}
      />,
    );
    expect(screen.getByText('Dane podstawowe')).toBeInTheDocument();
    expect(screen.getByText('Aparatura pierwotna')).toBeInTheDocument();
    expect(screen.getByText('Przekładniki')).toBeInTheDocument();
    expect(screen.getByText('Zabezpieczenia')).toBeInTheDocument();
    expect(screen.getByText('Pomiary')).toBeInTheDocument();
    expect(screen.getByText('Połączenia (porty)')).toBeInTheDocument();
    expect(screen.getByText('Podgląd SLD')).toBeInTheDocument();
    expect(screen.getByText('Obliczenia')).toBeInTheDocument();
  });

  it('header pokazuje ✓ gdy walidacja OK', () => {
    render(
      <BayConfigurator
        bayId="b1"
        designation="Pole F-01"
        bayContext={VALID_LINE_IN_CTX}
      />,
    );
    expect(screen.getByTestId('bay-validation-status')).toHaveTextContent(/zgodne/);
  });

  it('header pokazuje liczbę błędów + banner gdy walidacja NIE OK', () => {
    render(
      <BayConfigurator
        bayId="b1"
        designation="Pole F-01"
        bayContext={{ ...VALID_LINE_IN_CTX, hasOutgoingRun: false, isReserveSlot: false }}
      />,
    );
    expect(screen.getByTestId('bay-validation-status')).toHaveTextContent(/błędów/);
    expect(screen.getByTestId('bay-validation-errors')).toBeInTheDocument();
    expect(screen.getByTestId('bay-error-R1')).toBeInTheDocument();
  });

  it('przełączanie sekcji zmienia content', () => {
    render(
      <BayConfigurator
        bayId="b1"
        designation="Pole F-01"
        bayContext={VALID_LINE_IN_CTX}
        children={{
          basic: <div>Basic content</div>,
          'primary-equipment': <div>Equipment content</div>,
        }}
      />,
    );
    expect(screen.getByText('Basic content')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bay-section-tab-primary-equipment'));
    expect(screen.getByText('Equipment content')).toBeInTheDocument();
    expect(screen.queryByText('Basic content')).not.toBeInTheDocument();
  });

  it('pusta sekcja pokazuje "Brak danych"', () => {
    render(
      <BayConfigurator
        bayId="b1"
        designation="Pole F-01"
        bayContext={VALID_LINE_IN_CTX}
      />,
    );
    expect(screen.getByText(/Brak danych/)).toBeInTheDocument();
  });
});
