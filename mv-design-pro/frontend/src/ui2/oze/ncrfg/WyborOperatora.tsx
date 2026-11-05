/*
 * Wybór operatora (profilu wymagań NC RfG) — z modelu albo jawnie, nigdy domyślnie
 * (karta AB-1a Pakiet D2 §5; reguła w `operator.ts`). Wspólny dla macierzy, wniosku i pulpitu.
 */

import { opisWymaganegoWyboru, type OperatorZModelu } from './operator';
import type { ProfilOperatoraNcRfg } from './typy';

/** Dopisek operatora rozstrzygniętego przez model (profil efektywny modułów). */
export const OPIS_Z_MODELU =
  '(z modelu — profil NC RfG modułów: własny albo operatora sieci z warunków przyłączenia)';
/** Dopisek profili różnych per moduł (każdy moduł oceniany wg swojego profilu). */
export const OPIS_PER_MODUL = '(z modelu — każdy moduł oceniany wg swojego profilu NC RfG)';

/** Stan odczytu katalogu operatorów — jedno źródło dla listy wyboru. */
export type OdczytKataloguOperatorow = 'wczytywanie' | 'blad' | 'gotowy';

export function stanOdczytuKatalogu(
  operatorzy: readonly ProfilOperatoraNcRfg[] | null,
  bladKatalogu: string | null,
): OdczytKataloguOperatorow {
  if (operatorzy !== null) return 'gotowy';
  return bladKatalogu ? 'blad' : 'wczytywanie';
}

/** Pierwsza (pusta) opcja listy — mówi, CZYM jest pusty wybór w każdym stanie odczytu. */
export const ETYKIETY_ODCZYTU_KATALOGU: Readonly<Record<OdczytKataloguOperatorow, string>> = {
  wczytywanie: '— odczyt katalogu operatorów… —',
  blad: '— katalog operatorów nieodczytany —',
  gotowy: '— wybierz operatora —',
};

export interface WyborOperatoraProps {
  readonly zModelu: OperatorZModelu;
  /** Operatorzy z katalogu backendu; `null` — katalog nieodczytany (w toku albo błąd). */
  readonly operatorzy: readonly ProfilOperatoraNcRfg[] | null;
  /**
   * Błąd odczytu katalogu (`ncRfgStore.bladKatalogu`). Rozstrzyga, czym jest
   * `operatorzy === null`: odczytem w toku (`null`) albo nieudanym odczytem — pusta
   * lista wyboru nie może wyglądać jak „brak operatorów" (odczyt ≠ brak danych).
   */
  readonly bladKatalogu: string | null;
  /** Jawny wybór projektanta (używany tylko, gdy model nie rozstrzyga). */
  readonly wybor: string | null;
  readonly onWybor: (operatorId: string | null) => void;
  readonly etykieta: string;
  readonly testid: string;
}

export function WyborOperatora({
  zModelu,
  operatorzy,
  bladKatalogu,
  wybor,
  onWybor,
  etykieta,
  testid,
}: WyborOperatoraProps): JSX.Element {
  const odczyt = stanOdczytuKatalogu(operatorzy, bladKatalogu);
  const nazwaOperatora = (operatorId: string): string =>
    operatorzy?.find((op) => op.operator_id === operatorId)?.operator_name_pl ?? operatorId;
  if (zModelu.rodzaj === 'z_modelu') {
    return (
      <div className="mvd-oze-pole" data-testid={testid} data-zrodlo="model">
        <span>{etykieta}</span>
        <span data-testid={`${testid}-wartosc`}>
          {`${nazwaOperatora(zModelu.operatorId)} ${OPIS_Z_MODELU}`}
        </span>
      </div>
    );
  }
  if (zModelu.rodzaj === 'per_modul') {
    // Profile efektywne różne per moduł (źródło przyłączone do sieci innego operatora):
    // ocena przypadku idzie bez wyboru — backend ocenia każdy moduł wg jego profilu.
    return (
      <div className="mvd-oze-pole" data-testid={testid} data-zrodlo="model-per-modul">
        <span>{etykieta}</span>
        <span data-testid={`${testid}-wartosc`}>
          {`${zModelu.operatorzy.map(nazwaOperatora).join(', ')} ${OPIS_PER_MODUL}`}
        </span>
      </div>
    );
  }
  return (
    <label className="mvd-oze-pole" data-testid={testid} data-zrodlo="wybor">
      <span>{etykieta}</span>
      <select
        value={wybor ?? ''}
        onChange={(event) => onWybor(event.target.value === '' ? null : event.target.value)}
        disabled={odczyt !== 'gotowy'}
        aria-busy={odczyt === 'wczytywanie'}
        data-odczyt={odczyt}
        data-testid={`${testid}-wybor`}
        title={opisWymaganegoWyboru(zModelu.powod)}
      >
        <option value="">{ETYKIETY_ODCZYTU_KATALOGU[odczyt]}</option>
        {(operatorzy ?? []).map((op) => (
          <option key={op.operator_id} value={op.operator_id}>
            {op.operator_name_pl}
          </option>
        ))}
      </select>
      <span className="mvd-ncrfg-opis">{opisWymaganegoWyboru(zModelu.powod)}</span>
      {odczyt === 'blad' ? (
        <span className="mvd-ncrfg-opis" role="alert" data-testid={`${testid}-blad-katalogu`}>
          {`Katalog operatorów nie został odczytany: ${bladKatalogu}`}
        </span>
      ) : null}
    </label>
  );
}
