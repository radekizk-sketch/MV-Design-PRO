/**
 * Rodzaje gałęzi modelu (`Branch.type`) — JEDNO źródło listy rodzajów gałęzi i ich podziału
 * na odcinki, łączniki i bezpiecznik.
 *
 * Moduł bez modelu sieci: warstwa domeny nN (`ui/sld/v3/lv-domain/**`) czyta stąd rodzaje
 * gałęzi bez importu `types/enm` (reguła R4 `scripts/lv_domain_projection_guard.py` — zero
 * rekonstrukcji topologii z ENM w UI). Unia `Branch` w `types/enm.ts` bierze stąd typy pól
 * `type` (`SwitchBranch`, `FuseBranch`), a zgodność rodzajów mapy z unią w obie strony
 * wymusza kompilacja (`RODZAJE_GALEZI_ZGODNE_Z_UNIA`). Parytet listy z backendem
 * (`enm.stan_normalny.RodzajGaleziLacznika`, `FuseBranch.type`) przypina wyrocznia harnessu
 * `rodzaje_wielkosci_zwarciowych_aparatury.json` (`rodzaje_galezi`, test
 * `ui/shared/__tests__/rodzajGalezi.test.ts`) i test backendu
 * `tests/enm/test_wyposazenie_pola_lustro_frontu.py`.
 */
export const KLASA_RODZAJU_GALEZI = {
  line_overhead: 'odcinek',
  cable: 'odcinek',
  switch: 'lacznik',
  breaker: 'lacznik',
  bus_coupler: 'lacznik',
  disconnector: 'lacznik',
  fuse: 'bezpiecznik',
} as const;

/** Rodzaj gałęzi modelu. */
export type RodzajGalezi = keyof typeof KLASA_RODZAJU_GALEZI;

type KlasaRodzajuGalezi = (typeof KLASA_RODZAJU_GALEZI)[RodzajGalezi];
type RodzajeKlasy<K extends KlasaRodzajuGalezi> = {
  [R in RodzajGalezi]: (typeof KLASA_RODZAJU_GALEZI)[R] extends K ? R : never;
}[RodzajGalezi];

/** Rodzaj gałęzi łącznika (`SwitchBranch.type`) — z pozycją normalną, bez bezpiecznika. */
export type RodzajGaleziLacznika = RodzajeKlasy<'lacznik'>;
/** Rodzaj gałęzi bezpiecznika (`FuseBranch.type`). */
export type RodzajGaleziBezpiecznika = RodzajeKlasy<'bezpiecznik'>;
/** Rodzaj gałęzi aparatu łączeniowego: łącznik albo bezpiecznik. */
export type RodzajGaleziAparatu = RodzajGaleziLacznika | RodzajGaleziBezpiecznika;

/** Wszystkie rodzaje gałęzi modelu, w kolejności słownika klas. */
export const RODZAJE_GALEZI: readonly RodzajGalezi[] = Object.keys(
  KLASA_RODZAJU_GALEZI,
) as RodzajGalezi[];

/** Rodzaje gałęzi łącznika — bez bezpiecznika. */
export const RODZAJE_GALEZI_LACZNIKA: readonly RodzajGaleziLacznika[] = RODZAJE_GALEZI.filter(
  (rodzaj) => KLASA_RODZAJU_GALEZI[rodzaj] === 'lacznik',
) as RodzajGaleziLacznika[];

/** Rodzaje gałęzi aparatu łączeniowego — łączniki i bezpiecznik. */
export const RODZAJE_GALEZI_APARATU: readonly RodzajGaleziAparatu[] = RODZAJE_GALEZI.filter(
  (rodzaj) => KLASA_RODZAJU_GALEZI[rodzaj] !== 'odcinek',
) as RodzajGaleziAparatu[];

/** Czy `rodzaj` (np. pole `type` rekordu migawki spoza typów) to rodzaj gałęzi modelu. */
export function jestRodzajemGalezi(rodzaj: unknown): rodzaj is RodzajGalezi {
  return typeof rodzaj === 'string' && Object.prototype.hasOwnProperty.call(KLASA_RODZAJU_GALEZI, rodzaj);
}

/** Czy `rodzaj` to rodzaj gałęzi aparatu (łącznik albo bezpiecznik). */
export function jestRodzajemGaleziAparatu(rodzaj: unknown): rodzaj is RodzajGaleziAparatu {
  return jestRodzajemGalezi(rodzaj) && KLASA_RODZAJU_GALEZI[rodzaj] !== 'odcinek';
}

/** Czy `rodzaj` to rodzaj gałęzi łącznika (bez bezpiecznika). */
export function jestRodzajemGaleziLacznika(rodzaj: unknown): rodzaj is RodzajGaleziLacznika {
  return jestRodzajemGalezi(rodzaj) && KLASA_RODZAJU_GALEZI[rodzaj] === 'lacznik';
}
