/**
 * semanticValidator — walidator semantyczny operacji projektowych SN.
 *
 * Pierwszy plaster command-busu projektowego. Sprawdza dopuszczalność
 * operacji zanim trafi ona do snapshot-store / backendu. Walidator NIE
 * mutuje modelu, NIE wykonuje fizyki i NIE pisze do magazynu.
 *
 * Kontekst inżynierski (skrót, pełny opis: STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD §1, §3, §4):
 *
 *  - kabel SN może wychodzić wyłącznie z pola liniowego rozdzielnicy SN
 *    (GPZ, stacja SN/nN, ZKSN). ZKSN jest cable-only.
 *  - linia napowietrzna SN może wychodzić z węzła napowietrznego (słup),
 *    przejścia kablowo-napowietrznego, albo z pola liniowego rozdzielnicy
 *    przygotowanego pod wyprowadzenie napowietrzne.
 *  - słup rozgałęźny to węzeł linii napowietrznej; nie jest rozdzielnicą
 *    kablową i nie wystawia pola kablowego.
 *
 * @public
 */

export type TrunkBranchKind = 'cable_sn' | 'overhead_line_sn';

/**
 * Klasa terminala/portu źródłowego, z którego wyprowadzany jest odcinek SN.
 *
 *  - pole_liniowe_kablowe_gpz: pole liniowe SN w GPZ przygotowane na kabel
 *  - pole_liniowe_kablowe_stacja: pole liniowe SN w stacji SN/nN
 *  - pole_liniowe_kablowe_zksn: pole liniowe SN w ZKSN (cable-only)
 *  - pole_liniowe_napowietrzne_gpz: pole linii napowietrznej w GPZ
 *  - pole_liniowe_napowietrzne_stacja: pole linii napowietrznej w stacji SN/nN
 *  - slup: słup linii napowietrznej (zwykły lub rozgałęźny)
 *  - przejscie_kablowo_napowietrzne: głowica/maszty przejścia K/N
 */
export type TrunkOriginKind =
  | 'pole_liniowe_kablowe_gpz'
  | 'pole_liniowe_kablowe_stacja'
  | 'pole_liniowe_kablowe_zksn'
  | 'pole_liniowe_napowietrzne_gpz'
  | 'pole_liniowe_napowietrzne_stacja'
  | 'slup'
  | 'przejscie_kablowo_napowietrzne';

export interface TrunkSegmentOriginInput {
  readonly branchKind: TrunkBranchKind;
  readonly originKind: TrunkOriginKind;
}

export type SemanticValidationCode =
  | 'CABLE_FROM_POLE'
  | 'CABLE_FROM_OVERHEAD_BAY'
  | 'OVERHEAD_FROM_ZKSN_CABLE_BAY'
  | 'OVERHEAD_FROM_CABLE_BAY';

export interface SemanticValidationOk {
  readonly ok: true;
}

export interface SemanticValidationError {
  readonly ok: false;
  readonly code: SemanticValidationCode;
  /** Komunikat do interfejsu, po polsku technicznym. */
  readonly messagePl: string;
  /** Sugerowana akcja naprawcza dla projektanta. */
  readonly suggestedFixPl: string;
}

export type SemanticValidationResult = SemanticValidationOk | SemanticValidationError;

const CABLE_LINE_BAYS: ReadonlySet<TrunkOriginKind> = new Set([
  'pole_liniowe_kablowe_gpz',
  'pole_liniowe_kablowe_stacja',
  'pole_liniowe_kablowe_zksn',
]);

const OVERHEAD_LINE_BAYS: ReadonlySet<TrunkOriginKind> = new Set([
  'pole_liniowe_napowietrzne_gpz',
  'pole_liniowe_napowietrzne_stacja',
]);

/**
 * Sprawdza poprawność źródła wyprowadzenia odcinka magistrali SN.
 *
 *  - cable_sn z pola kablowego (GPZ/stacja/ZKSN) -> ok
 *  - cable_sn ze słupa lub pola napowietrznego  -> błąd
 *  - overhead_line_sn ze słupa lub przejścia K/N  -> ok
 *  - overhead_line_sn z pola napowietrznego GPZ/stacji -> ok
 *  - overhead_line_sn z pola kablowego (w tym ZKSN) -> błąd
 *
 * Reguła ZKSN cable-only: ZKSN ma wyłącznie pola kablowe; linia
 * napowietrzna nie może z niego wychodzić bez przejścia K/N na słupie.
 */
export function validateTrunkSegmentOrigin(
  input: TrunkSegmentOriginInput,
): SemanticValidationResult {
  const { branchKind, originKind } = input;

  if (branchKind === 'cable_sn') {
    if (originKind === 'slup') {
      return {
        ok: false,
        code: 'CABLE_FROM_POLE',
        messagePl: 'Kabel SN nie może wychodzić ze słupa linii napowietrznej.',
        suggestedFixPl:
          'Zastosuj przejście kablowo-napowietrzne na słupie albo poprowadź dalej linię napowietrzną.',
      };
    }
    if (OVERHEAD_LINE_BAYS.has(originKind) || originKind === 'przejscie_kablowo_napowietrzne') {
      return {
        ok: false,
        code: 'CABLE_FROM_OVERHEAD_BAY',
        messagePl: 'Kabel SN nie może wychodzić z pola napowietrznego ani z przejścia K/N.',
        suggestedFixPl:
          'Wyprowadź kabel z pola liniowego kablowego SN (GPZ, stacja SN/nN, ZKSN).',
      };
    }
    return { ok: true };
  }

  // overhead_line_sn
  if (originKind === 'pole_liniowe_kablowe_zksn') {
    return {
      ok: false,
      code: 'OVERHEAD_FROM_ZKSN_CABLE_BAY',
      messagePl:
        'Linia napowietrzna nie może wychodzić bezpośrednio z ZKSN — ZKSN ma wyłącznie pola kablowe.',
      suggestedFixPl:
        'Doprowadź kabel z ZKSN do słupa z przejściem kablowo-napowietrznym i z niego wyprowadź linię napowietrzną.',
    };
  }
  if (CABLE_LINE_BAYS.has(originKind)) {
    return {
      ok: false,
      code: 'OVERHEAD_FROM_CABLE_BAY',
      messagePl:
        'Linia napowietrzna nie może wychodzić z pola kablowego SN bez przejścia kablowo-napowietrznego.',
      suggestedFixPl:
        'Skonfiguruj pole liniowe napowietrzne w stacji albo zastosuj przejście K/N na słupie.',
    };
  }

  // slup / przejscie_kablowo_napowietrzne / pole napowietrzne -> ok
  return { ok: true };
}
