/**
 * Model ekranu „Zabezpieczenia i automatyka" (E-27, realny dostawca ui2).
 *
 * ZERO fizyki, ZERO fabrykacji: buduje wiersze przeglądu wyłącznie z gotowego
 * read-modelu pola (`useFieldReadModel` → `/api/cases/:id/enm/field-view`,
 * `application/field_read_model.py`). Każdy sterownik to `BayProtectionControlUnit`
 * z ENM (`enm/models.py`); pokazujemy DOKŁADNIE to, co niesie model — brak danych
 * to uczciwe „nie skonfigurowano", nie zmyślona wartość.
 *
 * Świadomie NIE reużywamy `protection-coordination/AutomationPanel`: wymaga on
 * typów `AutomationConfig` (SPZ/SZR/SCO/FDIR z polami cykli/stopni), których ENM
 * `BayProtectionControlUnit`/`SpzState` NIE niesie — mapowanie wymagałoby
 * fabrykacji brakujących pól. Zamiast tego własna tabela w tokenach --mvd-*.
 */

import type { FieldReadModelItem } from '../../../ui/field/useFieldReadModel';
import type { BayProtectionControlUnit, SpzState } from '../../../types/enm';

/** Wiersz sekcji ZABEZPIECZENIA — pole z (ewentualnym) przypisaniem zabezpieczeń. */
export interface WierszZabezpieczenia {
  readonly bayRef: string;
  readonly bayName: string;
  /** Model/urządzenie zabezpieczeniowe z ENM (null → brak przypisania). */
  readonly urzadzenie: string | null;
  /** Kody funkcji zabezpieczeniowych (ANSI/IEC), np. 50, 51, 50N. */
  readonly funkcje: readonly string[];
  readonly maZabezpieczenie: boolean;
  /** Szablon pola producenta (Reference Engine) — null gdy pole uniwersalne. */
  readonly szablon: string | null;
  /** Rodzina rozdzielnicy producenta — null gdy bez producenta. */
  readonly rodzina: string | null;
}

/** Cecha automatyki z `automation_features` (chip on/off). */
export interface CechaAutomatyki {
  readonly klucz: string;
  readonly etykieta: string;
  readonly aktywna: boolean;
}

/** Uczciwy widok stanu SPZ z ENM `SpzState`. */
export interface SpzWidok {
  readonly aktywny: boolean;
  readonly probySzybkie: number;
  readonly probyWolne: number;
  readonly stanEtykieta: string;
  readonly zablokowany: boolean;
  readonly powodBlokady: string | null;
}

/** Wiersz sekcji AUTOMATYKA — sterownik polowy (`BayProtectionControlUnit`). */
export interface Sterownik {
  readonly bayRef: string;
  readonly bayName: string;
  readonly unitRef: string;
  readonly urzadzenie: string | null;
  readonly cechy: readonly CechaAutomatyki[];
  /** null → SPZ nie skonfigurowany w modelu. */
  readonly spz: SpzWidok | null;
}

/** Etykiety PL cech automatyki (klucze `automation_features` z read-modelu). */
export const ETYKIETY_CECH: Record<string, string> = {
  synchrocheck_enabled: 'Kontrola synchronizmu (25)',
  arc_protection_enabled: 'Zabezpieczenie łukoochronne',
  breaker_failure_enabled: 'Układ LRW (50BF)',
};

/** Etykiety PL stanu SPZ (`SpzState.state`). */
export const ETYKIETY_STANU_SPZ: Record<SpzState['state'], string> = {
  gotowe: 'Gotowe',
  w_trakcie: 'W trakcie',
  zakonczone: 'Zakończone',
  odstawione: 'Odstawione',
};

function protectionConfig(item: FieldReadModelItem): BayProtectionControlUnit | null {
  return item.canonical_model.base_model.protection_config ?? null;
}

/** Wiersze sekcji ZABEZPIECZENIA (wszystkie pola; braki jawne). */
export function buildWierszeZabezpieczen(
  fields: readonly FieldReadModelItem[],
): WierszZabezpieczenia[] {
  return fields
    .map((item): WierszZabezpieczenia => {
      const config = protectionConfig(item);
      const funkcje = config
        ? config.functions
            .map((fn) => fn.code)
            .filter((code): code is string => typeof code === 'string' && code.trim() !== '')
        : [];
      const base = item.canonical_model.base_model;
      return {
        bayRef: item.bay_ref,
        bayName: item.bay_name || item.bay_ref,
        urzadzenie: config?.model ?? null,
        funkcje,
        maZabezpieczenie: config !== null,
        szablon: base.bay_template_ref ?? null,
        rodzina: base.switchgear_family_ref ?? null,
      };
    })
    .sort((a, b) => a.bayRef.localeCompare(b.bayRef));
}

function buildCechy(features: Record<string, boolean>): CechaAutomatyki[] {
  return Object.keys(features)
    .sort((a, b) => a.localeCompare(b))
    .map((klucz) => ({
      klucz,
      etykieta: ETYKIETY_CECH[klucz] ?? klucz,
      aktywna: features[klucz] === true,
    }));
}

function buildSpz(spz: SpzState | null | undefined): SpzWidok | null {
  if (!spz) {
    return null;
  }
  return {
    aktywny: spz.enabled === true,
    probySzybkie: spz.fast_attempts_max,
    probyWolne: spz.slow_attempts_max,
    stanEtykieta: ETYKIETY_STANU_SPZ[spz.state] ?? ETYKIETY_STANU_SPZ.odstawione,
    zablokowany: spz.blocked === true,
    powodBlokady: spz.blocked_reason ?? null,
  };
}

/** Wiersze sekcji AUTOMATYKA (tylko pola ze sterownikiem `BayProtectionControlUnit`). */
export function buildSterowniki(fields: readonly FieldReadModelItem[]): Sterownik[] {
  return fields
    .map((item): Sterownik | null => {
      const config = protectionConfig(item);
      if (!config) {
        return null;
      }
      return {
        bayRef: item.bay_ref,
        bayName: item.bay_name || item.bay_ref,
        unitRef: config.unit_ref,
        urzadzenie: config.model ?? null,
        cechy: buildCechy(config.automation_features ?? {}),
        spz: buildSpz(config.spz),
      };
    })
    .filter((row): row is Sterownik => row !== null)
    .sort((a, b) => a.bayRef.localeCompare(b.bayRef));
}
