/**
 * Karta GPZ-PARYTET (rozstrzygnięcie §0 pkt 2): oznaczenie uzwojeń transformatora
 * dwuuzwojeniowego wyprowadzone WYŁĄCZNIE z grupy połączeń zapisanej w modelu
 * (`Transformer.vector_group`, notacja IEC 60076-1: litera wielka = uzwojenie górnego
 * napięcia, mała = dolnego, `N`/`n` = wyprowadzony punkt neutralny, liczba = przesunięcie
 * fazowe w godzinach zegara 0…11).
 *
 * Funkcja jest czystym rozbiorem zapisu — nie zgaduje grupy z innych danych (napięć,
 * mocy, roli). Brak zapisu albo zapis spoza notacji daje stan jawny (`brak` /
 * `nierozpoznane`), który glif rysuje znakiem „?" w obu okręgach uzwojeń.
 */

export type RodzajUzwojenia = 'trojkat' | 'gwiazda' | 'zygzak';

export interface Uzwojenie {
  readonly rodzaj: RodzajUzwojenia;
  /** Wyprowadzony punkt neutralny (`N` po stronie górnej, `n` po dolnej). */
  readonly punktNeutralny: boolean;
}

export type UzwojeniaTransformatora =
  | {
      readonly stan: 'znane';
      /** Uzwojenie strony górnego napięcia (u transformatora GPZ: strona WN). */
      readonly gorne: Uzwojenie;
      /** Uzwojenie strony dolnego napięcia (u transformatora GPZ: strona SN). */
      readonly dolne: Uzwojenie;
      /** Przesunięcie fazowe w godzinach zegara (0…11). */
      readonly godzina: number;
    }
  | { readonly stan: 'brak' }
  | { readonly stan: 'nierozpoznane'; readonly zapis: string };

const RODZAJ: Readonly<Record<string, RodzajUzwojenia>> = {
  D: 'trojkat',
  Y: 'gwiazda',
  Z: 'zygzak',
};

const ZAPIS_GRUPY = /^([DYZ])(N?)([dyz])(n?)(\d{1,2})$/;

/** Rozbiór zapisu grupy połączeń (np. „Dyn11", „YNd11", „Yyn0", „Yzn11"). */
export function uzwojeniaZGrupyPolaczen(grupa: string | null | undefined): UzwojeniaTransformatora {
  const zapis = (grupa ?? '').trim();
  if (zapis === '') return { stan: 'brak' };
  const dopasowanie = ZAPIS_GRUPY.exec(zapis);
  if (!dopasowanie) return { stan: 'nierozpoznane', zapis };
  const [, gornaLitera, gornyN, dolnaLitera, dolnyN, godzinaTekst] = dopasowanie;
  const godzina = Number(godzinaTekst);
  if (!Number.isInteger(godzina) || godzina < 0 || godzina > 11) return { stan: 'nierozpoznane', zapis };
  return {
    stan: 'znane',
    gorne: { rodzaj: RODZAJ[gornaLitera], punktNeutralny: gornyN === 'N' },
    dolne: { rodzaj: RODZAJ[dolnaLitera.toUpperCase()], punktNeutralny: dolnyN === 'n' },
    godzina,
  };
}
