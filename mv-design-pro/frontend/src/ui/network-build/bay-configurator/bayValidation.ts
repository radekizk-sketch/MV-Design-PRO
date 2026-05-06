/**
 * Walidacja pola SN — 6 reguł briefa 2 §9 (PR-8b).
 *
 * Reguła R1: Pole liniowe wymaga wyprowadzenia kabla/linii (lub status rezerwowe).
 * Reguła R2: Pole transformatorowe wymaga połączenia z transformatorem.
 * Reguła R3: Pole DER (PV/BESS/FW) wymaga jasnego punktu przyłączenia.
 * Reguła R4: Pole pomiarowe NIE udaje liniowego (brak portu odpływu).
 * Reguła R5: Pole sprzęgłowe wymaga 2 sekcji szyn (porty sn_coupler × 2).
 * Reguła R6: Pole rezerwowe NIE może mieć aktywnego odcinka.
 */

export type BayRoleForValidation =
  | 'IN'
  | 'OUT'
  | 'TR'
  | 'COUPLER'
  | 'FEEDER'
  | 'MEASUREMENT'
  | 'OZE';

export interface BayValidationContext {
  readonly bayRole: BayRoleForValidation;
  readonly designation: string;
  readonly hasOutgoingRun: boolean;          // R1, R6
  readonly isReserveSlot: boolean;           // R1, R6
  readonly transformerConnectedRef?: string | null;  // R2
  readonly derAttachmentPointPl?: string | null;     // R3
  readonly derKind?: 'PV' | 'BESS' | 'FW' | null;    // R3
  readonly hasOutflowPort: boolean;          // R4
  readonly couplerSectionRefs: readonly string[];    // R5
}

export interface BayValidationError {
  readonly ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
  readonly descriptionPl: string;
  readonly fixActionPl?: string;
}

export interface BayValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BayValidationError[];
}

export function validateBay(ctx: BayValidationContext): BayValidationResult {
  const errors: BayValidationError[] = [];

  // R1: Pole liniowe wymaga wyprowadzenia (chyba że rezerwowe)
  const isLineBay = ctx.bayRole === 'IN' || ctx.bayRole === 'OUT' || ctx.bayRole === 'FEEDER';
  if (isLineBay && !ctx.hasOutgoingRun && !ctx.isReserveSlot) {
    errors.push({
      ruleId: 'R1',
      descriptionPl:
        'Pole liniowe wymaga wyprowadzenia kabla SN lub linii napowietrznej, '
        + 'lub musi być oznaczone jako pole rezerwowe.',
      fixActionPl: 'Wyprowadź ciąg / oznacz jako rezerwowe',
    });
  }

  // R2: Pole transformatorowe wymaga transformatora
  if (ctx.bayRole === 'TR' && !ctx.transformerConnectedRef) {
    errors.push({
      ruleId: 'R2',
      descriptionPl: 'Pole transformatorowe nie ma podłączonego transformatora SN/nN.',
      fixActionPl: 'Wybierz transformator z katalogu lub utwórz nowy',
    });
  }

  // R3: Pole DER wymaga punktu przyłączenia
  if (ctx.bayRole === 'OZE') {
    if (!ctx.derAttachmentPointPl) {
      errors.push({
        ruleId: 'R3',
        descriptionPl: 'Pole DER wymaga jasno określonego punktu przyłączenia (port pola lub szyna nN).',
        fixActionPl: 'Wskaż punkt przyłączenia',
      });
    }
    if (!ctx.derKind) {
      errors.push({
        ruleId: 'R3',
        descriptionPl: 'Pole DER nie ma określonego typu źródła (PV / BESS / FW).',
        fixActionPl: 'Wybierz typ źródła',
      });
    }
  }

  // R4: Pole pomiarowe NIE może mieć portu odpływu (zakaz udawania liniowego)
  if (ctx.bayRole === 'MEASUREMENT' && ctx.hasOutflowPort) {
    errors.push({
      ruleId: 'R4',
      descriptionPl:
        'Pole pomiarowe nie może mieć portu odpływu — to pole boczne tylko z VT. '
        + 'Brief 2 §9 reguła 4 (zakaz udawania pola liniowego).',
      fixActionPl: 'Usuń port odpływu lub zmień typ pola na liniowe',
    });
  }

  // R5: Pole sprzęgłowe wymaga 2 sekcji szyn (porty sn_coupler × 2)
  if (ctx.bayRole === 'COUPLER' && ctx.couplerSectionRefs.length < 2) {
    errors.push({
      ruleId: 'R5',
      descriptionPl:
        `Sprzęgło sekcyjne wymaga 2 sekcji szyn — obecnie podpięte ${ctx.couplerSectionRefs.length}.`,
      fixActionPl: 'Dodaj drugą sekcję szyn lub usuń sprzęgło',
    });
  }

  // R6: Pole rezerwowe NIE może mieć aktywnego odcinka
  if (ctx.isReserveSlot && ctx.hasOutgoingRun) {
    errors.push({
      ruleId: 'R6',
      descriptionPl:
        'Pole oznaczone jako rezerwowe nie może mieć aktywnego odcinka. '
        + 'Zmień typ pola na liniowe lub usuń odcinek.',
      fixActionPl: 'Zmień typ na liniowe / usuń odcinek',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
