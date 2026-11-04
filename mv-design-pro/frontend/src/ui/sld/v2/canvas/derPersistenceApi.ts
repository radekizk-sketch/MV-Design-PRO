/**
 * Zapis źródła OZE i jego wiązań katalogowych — JEDNA droga zapisu (karta
 * JEDNA-SCIEZKA-EDYCJI): operacje domenowe `add_converter_source` i
 * `set_der_catalog_bindings` przez `POST /api/cases/{caseId}/enm/domain-ops`
 * (`ui/topology/domainApi.ts`, jedyne miejsce budowy adresu). Dawne końcówki
 * `POST …/generators` i `PATCH …/generators/{ref}/bindings` z własnym tłumaczem ładunku
 * skasowano: ustalenie szyny nN stacji, transformator dedykowany z katalogu TRAFO_SN_NN,
 * weryfikacja deklarowanego modułu NC RfG i bateria BESS są cechami operacji.
 *
 * Moduł jest cienkim, typowanym adapterem: nazwy pól to nazwy pól operacji (sprawdzane
 * statycznie wobec `AddConverterSourcePayload`), a odmowa operacji (HTTP 200 z `error`)
 * i odmowa bramy katalogowej (HTTP 422) wracają jako `DerPersistenceApiError` z kodem
 * i zdaniem backendu.
 */
import type {
  DeklaracjeModulu,
  DomainOpResponseV1,
  NastawyZabezpieczenModulu,
} from '../../../../types/enm';
import type { AddConverterSourcePayload } from '../../../../types/domainOps';
import {
  DomainApiError,
  domainOpsEndpoint,
  executeDomainOp,
  executeDomainOpPreview,
} from '../../../topology/domainApi';

export type DerKind = 'PV' | 'BESS' | 'FW';
/**
 * Karta FAB-K (§0 R3): DOKŁADNIE dwa warianty operacji `add_converter_source` — wybór
 * POZIOMU przyłączenia (nN vs SN przez transformator dedykowany); dla `block_transformer`
 * PUNKT przyłączenia SN to osobne pole `sn_connection_bus_ref`.
 */
export type DerConnectionVariant = 'nn_side' | 'block_transformer';
export type NcRfgModule = 'A' | 'B' | 'C' | 'D';

/** Ładunek operacji `add_converter_source` wysyłany przez kreatory źródła OZE. */
export interface DerGeneratorConfigRequest {
  readonly station_ref: string;
  readonly source_technology: DerKind;
  readonly power_setpoint_mw: number;
  readonly connection_variant: DerConnectionVariant;
  readonly catalog_ref: string;
  /** Brak = szyna rozdzielnicy nN stacji ustalona przez operację z modelu. */
  readonly bus_nn_ref?: string | null;
  /** Nowy transformator dedykowany: identyfikator typu z katalogu TRAFO_SN_NN. */
  readonly block_transformer_catalog_ref?: string | null;
  /**
   * Karta FAB-K (§0 R3): punkt przyłączenia SN — szyna ISTNIEJĄCA w modelu,
   * WYMAGANA dla nowego transformatora dedykowanego (`generator.sn_connection_bus_missing`).
   */
  readonly sn_connection_bus_ref?: string | null;
  /** Karta FAB-K (§0 R2): pakiet baterii BESS z katalogu `BATERIA_BESS`. */
  readonly battery_catalog_ref?: string | null;
  readonly source_name?: string;
  readonly quantity?: number;
  /** Klasyfikacja backendu (`/api/ncrfg-tests/modul`); `null` = poniżej progu istotności. */
  readonly nc_rfg_module?: NcRfgModule | null;
  /**
   * Plan AB O-50 pkt 5: pola NC RfG modułu zapisywane razem z wytwórcą (ten sam pisarz
   * `add_converter_source`). Typy ścisłe backendu: status art. 4 wyłącznie logiczny,
   * data wyłącznie `RRRR-MM-DD`.
   */
  readonly modul_istniejacy?: boolean | null;
  readonly data_umowy_przylaczeniowej?: string | null;
  readonly nastawy_zabezpieczen?: NastawyZabezpieczenModulu | null;
  readonly deklaracje_modulu?: DeklaracjeModulu | null;
}

/** Każde pole ładunku kreatora jest polem operacji — literówka nie skompiluje się. */
type ZgodnoscZOperacja = DerGeneratorConfigRequest extends Partial<AddConverterSourcePayload>
  ? true
  : never;
export const LADUNEK_KREATORA_TO_POLA_OPERACJI: ZgodnoscZOperacja = true;

/**
 * Werdykt PRÓBY zapisu DER (`dry_run: true` tej samej operacji co zapis). `przyjeta` —
 * backend zapisałby konfigurację; `odmowa` — kod i zdanie backendu (te same co przy zapisie,
 * np. `converter.transformer_capacity_exceeded` z kontroli mocy O-53). Front nie liczy progu.
 */
export type WerdyktProbyDer =
  | { readonly stan: 'przyjeta' }
  | { readonly stan: 'odmowa'; readonly kod: string | null; readonly komunikat: string };

export class DerPersistenceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
    public readonly endpoint: string,
    message: string,
    public readonly code?: string | null,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeDerApiMessage(message: string, status: number): string {
  const withoutEndpoint = message
    .replace(/\s*\(\/api\/[^)]*\)\s*/g, ' ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\b(?:stn|gpz|seg)\/[^\s)]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return withoutEndpoint || `Nie udało się zapisać konfiguracji DER. Kod odpowiedzi: ${status}.`;
}

function extractApiError(detail: unknown, status: number): { message: string; code: string | null } {
  const root = isRecord(detail) && 'detail' in detail ? detail.detail : detail;
  const payload = isRecord(root) ? root : isRecord(detail) ? detail : null;
  const message = readString(payload?.message_pl)
    ?? readString(payload?.message)
    ?? readString(payload?.error)
    ?? readString(root)
    ?? `Błąd API ${status}`;
  const code = readString(payload?.code) ?? readString(payload?.error_code);
  return {
    code,
    message: sanitizeDerApiMessage(message, status),
  };
}

function bladDer(caseId: string, error: unknown): unknown {
  if (!(error instanceof DomainApiError)) return error;
  const extracted = extractApiError(error.detail, error.status);
  return new DerPersistenceApiError(
    error.status,
    error.detail,
    domainOpsEndpoint(caseId),
    extracted.message,
    extracted.code ?? error.code ?? null,
  );
}

async function wykonajOperacjeDer(
  caseId: string,
  operacja: 'add_converter_source' | 'set_der_catalog_bindings',
  ladunek: Record<string, unknown>,
): Promise<DomainOpResponseV1> {
  let odpowiedz: DomainOpResponseV1;
  try {
    odpowiedz = await executeDomainOp(caseId, operacja, ladunek);
  } catch (error) {
    throw bladDer(caseId, error);
  }
  if (odpowiedz.error) {
    // Odmowa operacji: HTTP 200 z kodem i zdaniem backendu, model bez zmian.
    throw new DerPersistenceApiError(
      200,
      odpowiedz,
      domainOpsEndpoint(caseId),
      sanitizeDerApiMessage(odpowiedz.error, 200),
      odpowiedz.error_code ?? null,
    );
  }
  return odpowiedz;
}

/** Zapisz źródło OZE w modelu (operacja `add_converter_source`). */
export async function zapiszZrodloOze(
  caseId: string,
  body: DerGeneratorConfigRequest,
): Promise<DomainOpResponseV1> {
  return wykonajOperacjeDer(caseId, 'add_converter_source', { ...body });
}

/**
 * Wiązania katalogowe i profile zgodności wytwórcy wybierane PO jego utworzeniu
 * (V12K-238, pomiar V12K-237).
 *
 * POMINIĘCIE ≠ `null`. Pole nieobecne w obiekcie zostawia wiązanie w modelu bez zmian,
 * a jawne `null` je USUWA (reguła gotowości znów widzi brak danej). Dlatego nie wolno
 * wysyłać tu pełnego obiektu z `null`-ami dla pól, których użytkownik nie dotknął —
 * skasowałoby to jego wcześniejsze wybory.
 *
 * Karta FAB-L: `fault_current_data_ref` USUNIĘTE z tego kontraktu — pole nie miało
 * ŻADNEGO konsumenta solvera (κ i składowe symetryczne liczy WYŁĄCZNIE IEC 60909).
 */
export interface DerCatalogBindingsRequest {
  readonly protection_catalog_ref?: string | null;
  readonly ct_catalog_ref?: string | null;
  readonly vt_catalog_ref?: string | null;
  readonly dynamic_model_ref?: string | null;
  readonly nc_rfg_profile_ref?: string | null;
  readonly lvrt_curve_ref?: string | null;
  readonly hvrt_curve_ref?: string | null;
  readonly pf_curve_ref?: string | null;
  /** Karta FAB-L: tryby pracy magazynu — lista, nie skalar (jak backendowe pole). */
  readonly bess_operation_mode_refs?: readonly string[] | null;
}

/** Zapisz wiązania wytwórcy w modelu (operacja `set_der_catalog_bindings`). */
export async function zapiszWiazaniaDer(
  caseId: string,
  generatorRef: string,
  body: DerCatalogBindingsRequest,
): Promise<DomainOpResponseV1> {
  return wykonajOperacjeDer(caseId, 'set_der_catalog_bindings', {
    ...body,
    generator_ref: generatorRef,
  });
}

/**
 * Próba zapisu DER — ta sama operacja, te same reguły i odmowy co `zapiszZrodloOze`,
 * a model zostaje bez zmian (`dry_run`, odpowiedź bez migawki). Odmowa operacji
 * (HTTP 200 z `error`) i odmowa bramy katalogowej (HTTP 422) wracają jako werdykt; błąd
 * transportu i inne kody HTTP — wyjątkiem.
 */
export async function probaZapisuDer(
  caseId: string,
  body: DerGeneratorConfigRequest,
  options: { signal?: AbortSignal } = {},
): Promise<WerdyktProbyDer> {
  let odpowiedz;
  try {
    odpowiedz = await executeDomainOpPreview(caseId, 'add_converter_source', { ...body }, {
      signal: options.signal,
    });
  } catch (error) {
    const blad = bladDer(caseId, error);
    if (blad instanceof DerPersistenceApiError && blad.status === 422) {
      return { stan: 'odmowa', kod: blad.code ?? null, komunikat: blad.message };
    }
    throw blad;
  }
  if (odpowiedz.error) {
    return {
      stan: 'odmowa',
      kod: odpowiedz.error_code ?? null,
      komunikat: sanitizeDerApiMessage(odpowiedz.error, 200),
    };
  }
  return { stan: 'przyjeta' };
}
