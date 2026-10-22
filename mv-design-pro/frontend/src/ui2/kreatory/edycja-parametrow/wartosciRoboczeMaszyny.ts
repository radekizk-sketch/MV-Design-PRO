/**
 * Wartości projektanta parametrów zwarciowych maszyny wirującej (karta PODSTAWA-Q, zasada nr 4).
 *
 * PO CO. Tabliczka generatora synchronicznego albo maszyny asynchronicznej nie zawsze podaje
 * moc znamionową (S_rG, P_rM), x″d, cos φ, liczbę par biegunów p, krotność I_LR/I_rM i sprawność
 * η — obliczenie zwarciowe
 * (IEC 60909-0 §6.3/§6.7 i rozdz. 9) przyjmuje wtedy propozycję rejestru backendu
 * (`network_model/catalog/wartosci_robocze.py`, założenie inżynierskie) i niesie ją jako daną
 * przyjętą. Projektant nadaje własną wartość w `overrides` generatora; rodzinę, parametry, ich
 * opisy i propozycje podaje backend (`GET /api/catalog/maszyny-wirujace/wartosci-robocze`), a
 * bramą wartości jest operacja domenowa `update_element_parameters` — moduł nie zna zakresów.
 */

import type {
  ParametrMaszynyRejestru,
  RejestrMaszynWirujacych,
} from '../../../ui/catalog/types';

/**
 * Czy odpowiedź rejestru ma kształt kontraktu (`rodzaj_generatora` i `rodziny` jako słowniki,
 * rodziny jako listy). Odpowiedź innego kształtu to rejestr niedostępny — nie zgadujemy rodziny.
 */
export function czyRejestrMaszyn(odpowiedz: unknown): odpowiedz is RejestrMaszynWirujacych {
  if (typeof odpowiedz !== 'object' || odpowiedz === null || Array.isArray(odpowiedz)) return false;
  const { rodzaj_generatora: rodzaje, rodziny } = odpowiedz as Record<string, unknown>;
  if (typeof rodzaje !== 'object' || rodzaje === null || Array.isArray(rodzaje)) return false;
  if (typeof rodziny !== 'object' || rodziny === null || Array.isArray(rodziny)) return false;
  return Object.values(rodziny).every((lista) => Array.isArray(lista));
}

/** Parametry rodziny maszyny generatora (kolejność rejestru) albo `null` — to nie maszyna. */
export function parametryMaszynyGeneratora(
  rejestr: RejestrMaszynWirujacych | null,
  genType: string | null | undefined,
): readonly ParametrMaszynyRejestru[] | null {
  if (rejestr === null || !genType) return null;
  const rodzina = rejestr.rodzaj_generatora[genType];
  return rodzina ? (rejestr.rodziny[rodzina] ?? null) : null;
}

export type ZrodloParametruMaszyny =
  | { readonly rodzaj: 'tabliczka'; readonly wartosc: number }
  | { readonly rodzaj: 'wyznaczenie'; readonly opis: string }
  | { readonly rodzaj: 'propozycja'; readonly wartosc: number; readonly rodzajZrodla: string }
  | { readonly rodzaj: 'propozycja_elementu'; readonly regula: string; readonly rodzajZrodla: string };

function liczbaSkonczona(wartosc: unknown): wartosc is number {
  return typeof wartosc === 'number' && Number.isFinite(wartosc);
}

/**
 * Co obliczenie przyjmie, gdy pole projektanta jest puste: liczba z tabliczki elementu
 * (`materialized_params`), wyznaczenie z innej danej tabliczki (reguła rejestru, np. P_rM z S_rM),
 * propozycja rejestru albo propozycja zależna od elementu (reguła bez liczby — moduł nie liczy
 * jej sam: zero fizyki w UI). Odczyt, nie rozstrzygnięcie — dana tabliczki spoza zakresu bramy
 * zostanie odrzucona przez backend (ślad biegu nazywa powód).
 */
export function zrodloParametruMaszyny(
  tabliczka: Readonly<Record<string, unknown>> | null | undefined,
  opis: ParametrMaszynyRejestru,
): ZrodloParametruMaszyny {
  const zTabliczki = tabliczka?.[opis.parametr];
  if (liczbaSkonczona(zTabliczki)) {
    return { rodzaj: 'tabliczka', wartosc: zTabliczki };
  }
  const wyznaczenie = opis.wyznaczenie_z_tabliczki;
  if (wyznaczenie !== null && liczbaSkonczona(tabliczka?.[wyznaczenie.klucz_tabliczki])) {
    return { rodzaj: 'wyznaczenie', opis: wyznaczenie.opis_pl };
  }
  const { wartosc, rodzaj_zrodla: rodzajZrodla } = opis.propozycja;
  if (wartosc === null) {
    return { rodzaj: 'propozycja_elementu', regula: opis.propozycja.uzasadnienie_pl, rodzajZrodla };
  }
  return { rodzaj: 'propozycja', wartosc, rodzajZrodla };
}
