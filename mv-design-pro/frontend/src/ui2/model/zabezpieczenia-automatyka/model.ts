/**
 * Model ekranu „Zabezpieczenia i automatyka" (E-27).
 *
 * Karta OCHRONA-JEDNO-ZRODLO (ADR-022): JEDNA struktura zabezpieczeń w modelu — sterownik
 * (`ProtectionAssignment`) z funkcjami rejestru, grupami nastaw 1–4 i macierzą wyzwoleń. Automatyka
 * (SPZ 79, SZR, LRW 50BF, SCO, kontrola synchronizmu 25…) to funkcje TEGO SAMEGO sterownika, więc
 * ekran ma jedną tabelę: sterownik = wiersz (pole albo wyłącznik liniowy), funkcje, grupa
 * aktywna, SPZ z nastaw funkcji 79. Dawna druga struktura (`protection_config` pola z cechami
 * automatyki i stanem SPZ) jest skasowana.
 *
 * ZERO fizyki, ZERO fabrykacji: wiersze wyłącznie z modelu (rekordy pól read modelu pola
 * i sterowniki migawki); brak danych to jawne „bez sterownika", nie zmyślona wartość.
 */

import type { FieldReadModelItem } from '../../../ui/field/useFieldReadModel';
import type { EnergyNetworkModel, ProtectionAssignment } from '../../../types/enm';
import {
  kodyFunkcjiSterownika,
  nastawyFunkcji,
  nazwaUrzadzeniaSterownika,
  numerGrupyEfektywnej,
  sterowniki,
  wylacznikSterownika,
} from '../../../ui/shared/sterownikZabezpieczen';

/** Stan SPZ z funkcji 79 sterownika (włączenie i liczba cykli aktywnej grupy). */
export interface SpzWidok {
  readonly wlaczone: boolean;
  /** Liczba cykli z nastaw grupy aktywnej; `null` — nastawa niezapisana. */
  readonly cykle: number | null;
}

/** Wiersz tabeli E-27 — pole rozdzielni albo wyłącznik liniowy ze sterownikiem. */
export interface WierszZabezpieczenia {
  /** Klucz wiersza: referencja pola albo sterownika wyłącznika liniowego. */
  readonly klucz: string;
  /** Pole rozdzielni (`null` — sterownik wyłącznika liniowego bez pola). */
  readonly bayRef: string | null;
  readonly nazwa: string;
  /** Sterownik zabezpieczeń (`null` — pole bez sterownika). */
  readonly sterownikRef: string | null;
  readonly urzadzenie: string | null;
  /** Kody włączonych funkcji sterownika w kolejności zapisu. */
  readonly funkcje: readonly string[];
  readonly aktywnaGrupa: number | null;
  /** SPZ (funkcja 79) — `null`, gdy sterownik jej nie ma. */
  readonly spz: SpzWidok | null;
  /** Szablon pola producenta (Reference Engine) — `null` gdy pole uniwersalne albo brak pola. */
  readonly szablon: string | null;
  readonly rodzina: string | null;
}

function spzSterownika(sterownik: ProtectionAssignment): SpzWidok | null {
  const funkcja = sterownik.funkcje.find((f) => f.kod === '79');
  if (!funkcja) return null;
  const cykle = nastawyFunkcji(sterownik, funkcja.ref).liczba_cykli;
  return { wlaczone: funkcja.wlaczona !== false, cykle: typeof cykle === 'number' ? cykle : null };
}

function zSterownika(sterownik: ProtectionAssignment | null) {
  return {
    sterownikRef: sterownik?.ref_id ?? null,
    urzadzenie: sterownik ? nazwaUrzadzeniaSterownika(sterownik) : null,
    funkcje: kodyFunkcjiSterownika(sterownik),
    aktywnaGrupa: sterownik ? numerGrupyEfektywnej(sterownik) : null,
    spz: sterownik ? spzSterownika(sterownik) : null,
  };
}

/**
 * Wiersze tabeli: każde pole read modelu (sterownik pola z odczytu pola — ten sam rekord co
 * `protection_assignments`) i każdy sterownik wyłącznika liniowego (sterownik bez pola z migawki).
 * Kolejność deterministyczna: pola po referencji, potem wyłączniki liniowe po referencji.
 */
export function buildWierszeZabezpieczen(
  fields: readonly FieldReadModelItem[],
  migawka: Partial<Pick<EnergyNetworkModel, 'protection_assignments' | 'branches'>> | null | undefined,
): WierszZabezpieczenia[] {
  const pola = fields
    .map((item): WierszZabezpieczenia => {
      const base = item.canonical_model.base_model;
      return {
        klucz: item.bay_ref,
        bayRef: item.bay_ref,
        nazwa: item.bay_name || item.bay_ref,
        ...zSterownika(base.zabezpieczenie ?? null),
        szablon: base.bay_template_ref ?? null,
        rodzina: base.switchgear_family_ref ?? null,
      };
    })
    .sort((a, b) => a.klucz.localeCompare(b.klucz));
  const liniowe = sterowniki(migawka)
    .filter((s) => !s.bay_ref)
    .map((s): WierszZabezpieczenia => {
      const wylacznik = wylacznikSterownika(s);
      const galaz = wylacznik ? (migawka?.branches ?? []).find((b) => b.ref_id === wylacznik) : undefined;
      return {
        klucz: s.ref_id,
        bayRef: null,
        nazwa: galaz?.name?.trim() || s.name || s.ref_id,
        ...zSterownika(s),
        szablon: null,
        rodzina: null,
      };
    });
  return [...pola, ...liniowe];
}
