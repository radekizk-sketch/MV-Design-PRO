/**
 * Zgodność aparatu pola SN z rodziną rozdzielnicy i z kartą katalogową pola.
 *
 * Oba predykaty czytają WYŁĄCZNIE dane backendu, bez własnego słownika rodzajów:
 *  · `family_apparatus_kind` pozycji katalogu APARAT_SN — rzut `device_kind` na słownik
 *    rodzin (`apparatus_vocabulary.FAMILY_APPARATUS_FOR_CATALOG_DEVICE_KIND`; `null` =
 *    aparat spoza celek rozdzielnicy, np. reklozer słupowy),
 *  · `allowed_apparatus_kinds` rodziny rozdzielnicy (karta producenta),
 *  · `device_instances` / `base_template.devices` karty pola (skład pola z katalogu).
 *
 * Zero fizyki: to porównanie etykiet słownikowych, nie ocena techniczna aparatu.
 */

import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';

/**
 * Czy aparat o rodzaju `rodzajRodziny` należy do oferty rodziny. Rodzina bez listy
 * dopuszczonych rodzajów nie zawęża (parytet z `canonical_fallback.py` backendu);
 * aparat spoza słownika celek (`null`) nie należy do żadnej rodziny z listą.
 */
export function rodzajAparatuWRodzinie(
  rodzajRodziny: string | null | undefined,
  dopuszczone: readonly string[] | undefined,
): boolean {
  if (!dopuszczone || dopuszczone.length === 0) return true;
  return rodzajRodziny != null && dopuszczone.includes(rodzajRodziny);
}

/** Pozycja katalogu APARAT_SN z rzutami końcówki katalogu potrzebnymi do oferty rodziny. */
interface AparatOferty {
  readonly manufacturer_ref?: string | null;
  readonly family_apparatus_kind?: string | null;
  readonly interchangeable_across_families?: boolean;
}

/** Rodzina rozdzielnicy: producent i rodzaje aparatów dopuszczone kartą producenta. */
interface RodzinaOferty {
  readonly manufacturer_ref: string;
  readonly allowed_apparatus_kinds?: readonly string[];
}

/**
 * Czy aparat należy do oferty rodziny: rodzaj dopuszczony kartą rodziny ORAZ producent
 * rodziny albo komponent wymienny między rodzinami (wkładki bezpiecznikowe). Ten sam
 * predykat przypina test końcówki katalogu (`test_katalog_aparatow_sn_rodzina.py`);
 * używają go kreator stacji SN/nN i kreator pola SN.
 */
export function aparatWOfercieRodziny(aparat: AparatOferty, rodzina: RodzinaOferty): boolean {
  return (
    rodzajAparatuWRodzinie(aparat.family_apparatus_kind, rodzina.allowed_apparatus_kinds)
    && (aparat.manufacturer_ref === rodzina.manufacturer_ref
      || aparat.interchangeable_across_families === true)
  );
}

/** Rodzaje kanonicznego składu pola (`BayTemplate.devices.kind`) → słownik rodzin. */
const GLOWNY_Z_UKLADU_KANONICZNEGO: Readonly<Record<string, string>> = {
  CB: 'circuit_breaker',
  FUSE: 'fuse_set',
};

/**
 * Główny aparat łączeniowy karty pola w słowniku rodzin: wyłącznik, a bez niego zestaw
 * bezpiecznikowy, a bez niego rozłącznik. Odłączniki szynowe/liniowe i uziemniki nie są
 * aparatem głównym. `null` = karta bez aparatu głównego (np. pole pomiarowe).
 */
export function glownyAparatKarty(szablon: CompleteMvBayTemplateSummary): string | null {
  const instancje = szablon.device_instances ?? [];
  const rodzaje = new Set<string>(
    instancje.length > 0
      ? instancje.map((d) => d.apparatus_kind)
      : szablon.base_template.devices
          .map((d) => GLOWNY_Z_UKLADU_KANONICZNEGO[d.kind])
          .filter((r): r is string => Boolean(r)),
  );
  for (const rodzaj of ['circuit_breaker', 'fuse_set', 'switch_disconnector']) {
    if (rodzaje.has(rodzaj)) return rodzaj;
  }
  return null;
}

/**
 * Czy karta pola pasuje do aparatu o rodzaju `rodzajRodziny`: główny aparat karty ten
 * sam, co wskazany aparat (pole z rozłącznikiem bezpiecznikowym nie dostaje karty
 * z wyłącznikiem). Brak aparatu głównego karty albo nieznany rodzaj aparatu — brak
 * podstawy do sprzeciwu.
 */
export function kartaZgodnaZAparatem(
  szablon: CompleteMvBayTemplateSummary,
  rodzajRodziny: string | null | undefined,
): boolean {
  if (rodzajRodziny == null) return true;
  const glowny = glownyAparatKarty(szablon);
  return glowny === null || glowny === rodzajRodziny;
}
