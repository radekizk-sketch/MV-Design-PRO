/*
 * Wybór operatora (profilu wymagań NC RfG) — z modelu albo jawnie, nigdy domyślnie
 * (karta AB-1a Pakiet D2 §5; reguła w `operator.ts`). Wspólny dla macierzy, wniosku i pulpitu.
 */

import { opisWymaganegoWyboru, type OperatorZModelu } from './operator';
import type { ProfilOperatoraNcRfg } from './typy';

export interface WyborOperatoraProps {
  readonly zModelu: OperatorZModelu;
  /** Operatorzy z katalogu backendu; `null` — katalog jeszcze niewczytany. */
  readonly operatorzy: readonly ProfilOperatoraNcRfg[] | null;
  /** Jawny wybór projektanta (używany tylko, gdy model nie rozstrzyga). */
  readonly wybor: string | null;
  readonly onWybor: (operatorId: string | null) => void;
  readonly etykieta: string;
  readonly testid: string;
}

export function WyborOperatora({
  zModelu,
  operatorzy,
  wybor,
  onWybor,
  etykieta,
  testid,
}: WyborOperatoraProps): JSX.Element {
  if (zModelu.rodzaj === 'z_modelu') {
    const nazwa =
      operatorzy?.find((op) => op.operator_id === zModelu.operatorId)?.operator_name_pl ??
      zModelu.operatorId;
    return (
      <div className="mvd-oze-pole" data-testid={testid} data-zrodlo="model">
        <span>{etykieta}</span>
        <span data-testid={`${testid}-wartosc`}>{`${nazwa} (z modelu — profil NC RfG modułów)`}</span>
      </div>
    );
  }
  return (
    <label className="mvd-oze-pole" data-testid={testid} data-zrodlo="wybor">
      <span>{etykieta}</span>
      <select
        value={wybor ?? ''}
        onChange={(event) => onWybor(event.target.value === '' ? null : event.target.value)}
        disabled={operatorzy === null}
        data-testid={`${testid}-wybor`}
        title={opisWymaganegoWyboru(zModelu.powod)}
      >
        <option value="">— wybierz operatora —</option>
        {(operatorzy ?? []).map((op) => (
          <option key={op.operator_id} value={op.operator_id}>
            {op.operator_name_pl}
          </option>
        ))}
      </select>
      <span className="mvd-ncrfg-opis">{opisWymaganegoWyboru(zModelu.powod)}</span>
    </label>
  );
}
