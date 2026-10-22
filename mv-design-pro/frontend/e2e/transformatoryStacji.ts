/**
 * Transformatory stacji SN/nN w migawce ENM budowanej przez spec e2e (karta R10-E2E-CZERWONE).
 *
 * Specy budujące sieć „GPZ → magistrala → stacja SN/nN" przypisują pozycję katalogu
 * TRAFO_SN_NN i dane 15/0,4 kV transformatorowi stacji. Szesnaście z nich robiło to w pętli
 * po WSZYSTKICH transformatorach migawki — także po transformatorze GPZ 110/15 kV
 * (`add_grid_source_sn` z `hv_voltage_kv`), który dostawał uzwojenia 15/0,4 kV między
 * szynami 110 kV i 15 kV. Spec opisywał sieć fizycznie niemożliwą, a backend do partii
 * integracji 11 to przyjmował; walidator E023 (napięcie znamionowe uzwojenia poza pasmem
 * szyny = blokada gotowości) odsłonił tę fabrykację — gotowość zostawała `false` na stałe.
 *
 * JEDNA reguła dla wszystkich speców: transformator stacji SN/nN to transformator, którego
 * strona dolnego napięcia leży na szynie nN (< 1 kV). Pusty wynik jest błędem speca (sieć
 * nie ma stacji SN/nN, której spec oczekuje), a nie cichym pominięciem przypisania.
 */
import { expect } from '@playwright/test';

/** Próg pasma nN (napięcie szyny < 1 kV) — ten sam, którym specy wybierają szynę nN stacji. */
const PROG_NN_KV = 1.0;

interface SzynaMigawki {
  readonly ref_id: string;
  readonly voltage_kv?: number | null;
}

interface TransformatorMigawki {
  readonly ref_id: string;
  readonly lv_bus_ref?: string | null;
}

interface MigawkaZTransformatorami<T extends TransformatorMigawki> {
  readonly buses?: readonly SzynaMigawki[] | null;
  readonly transformers?: readonly T[] | null;
}

export function transformatoryStacjiSnNn<T extends TransformatorMigawki>(
  migawka: MigawkaZTransformatorami<T> | null | undefined,
): T[] {
  const napiecieSzyny = new Map(
    (migawka?.buses ?? []).map((szyna) => [szyna.ref_id, szyna.voltage_kv ?? Number.NaN]),
  );
  const wynik = (migawka?.transformers ?? []).filter(
    (transformator) =>
      (napiecieSzyny.get(transformator.lv_bus_ref ?? '') ?? Number.NaN) < PROG_NN_KV,
  );
  expect(
    wynik.length,
    'migawka musi mieć transformator stacji SN/nN (strona dolna na szynie nN)',
  ).toBeGreaterThan(0);
  return wynik;
}
