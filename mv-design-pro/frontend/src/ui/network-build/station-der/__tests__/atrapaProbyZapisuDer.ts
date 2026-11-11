/**
 * Atrapa werdyktu backendu dla PRÓBY zapisu DER (`dry_run` końcówki `POST …/generators`).
 *
 * Kreator DER nie liczy progu mocy transformatora — pyta backend próbą zapisu tej samej
 * konfiguracji (`probaZapisuDer.ts`). Testy interfejsu potrzebują więc atrapy, która odpowiada
 * jak backend: kontrola mocy O-53 (`domain.generator_validation.sprawdz_moc_transformatora`)
 * dla JEDNEJ pozycji przy k_j = k_obc = 1 — S_n,TR ≥ S_n,jedn · n, gdzie transformatorem jest
 * transformator dedykowany wskazany w zadaniu albo (wariant nN) transformatory stacji zasilające
 * jej szynę nN. Odmowa: 422 z kodem `converter.transformer_capacity_exceeded` i zdaniem
 * nazywającym moc transformatora i moc źródła. Zapis właściwy (bez `dry_run`) zwraca `null` —
 * obsługuje go dalsza część atrapy pliku testowego.
 *
 * Pełny iloczyn reguły (grupa źródeł, k_j, k_obc, tory tworzenia i przypisania) ma backend:
 * `backend/tests/enm/test_kontrola_mocy_zrodla_o53.py`; tu wyłącznie tor kreatora.
 */

export interface UrzadzenieAtrapy {
  readonly id: string;
  readonly sn_mva?: number;
}

export interface DaneAtrapyProby {
  readonly urzadzenia: readonly UrzadzenieAtrapy[];
  readonly transformatoryDedykowane: ReadonlyArray<Record<string, unknown>>;
  /** Migawka modelu, z której atrapa czyta transformatory stacji (wariant nN). */
  readonly migawka: () => Record<string, unknown> | null | undefined;
}

export const KOD_ODMOWY_MOCY = 'converter.transformer_capacity_exceeded';

function lista(wartosc: unknown): Record<string, unknown>[] {
  return Array.isArray(wartosc) ? (wartosc as Record<string, unknown>[]) : [];
}

function mocTransformatorowStacjiMva(
  migawka: Record<string, unknown> | null | undefined,
  stacjaRef: unknown,
): number | null {
  if (!migawka) return null;
  const stacja = lista(migawka.substations).find((s) => s.ref_id === stacjaRef);
  if (!stacja) return null;
  const szyny = new Map(lista(migawka.buses).map((b) => [b.ref_id, Number(b.voltage_kv)]));
  const refy = new Set(lista(stacja.transformer_refs as unknown));
  const busRefs = new Set(lista(stacja.bus_refs as unknown));
  const zasilajace = lista(migawka.transformers).filter(
    (t) =>
      refy.has(t.ref_id as never)
      && busRefs.has(t.lv_bus_ref as never)
      && (szyny.get(t.lv_bus_ref) ?? Number.NaN) <= 1
      && typeof t.sn_mva === 'number',
  );
  if (zasilajace.length === 0) return null;
  return zasilajace.reduce((suma, t) => suma + Number(t.sn_mva), 0);
}

export function odpowiedzProbyZapisuDer(
  url: string,
  init: RequestInit | undefined,
  dane: DaneAtrapyProby,
): Response | null {
  if (!url.includes('/generators') || init?.method !== 'POST') return null;
  const cialo = JSON.parse(String(init.body)) as Record<string, unknown>;
  if (cialo.dry_run !== true) return null;
  const urzadzenie = dane.urzadzenia.find((u) => u.id === cialo.catalog_ref);
  const wymaganaMva = (urzadzenie?.sn_mva ?? 0) * Number(cialo.quantity ?? 1);
  const dedykowany = dane.transformatoryDedykowane.find(
    (t) => t.id === cialo.block_transformer_catalog_ref,
  );
  const mocTransformatoraMva = dedykowany
    ? Number(dedykowany.sn_kva) / 1000
    : cialo.connection_variant === 'nn_side'
      ? mocTransformatorowStacjiMva(dane.migawka(), cialo.station_ref)
      : null;
  if (mocTransformatoraMva !== null && mocTransformatoraMva + 1e-9 < wymaganaMva) {
    return new Response(
      JSON.stringify({
        detail: {
          code: KOD_ODMOWY_MOCY,
          message_pl:
            `Moc transformatora ${Math.round(mocTransformatoraMva * 1000)} kVA jest mniejsza `
            + `od mocy źródeł ${Math.round(wymaganaMva * 1000)} kVA.`,
        },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return new Response(JSON.stringify({ dry_run: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
