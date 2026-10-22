/**
 * Wartości projektanta parametrów zwarciowych maszyny wirującej (karta PODSTAWA-Q, zasada nr 4).
 *
 * PO CO. Tabliczka generatora synchronicznego albo maszyny asynchronicznej nie zawsze podaje
 * x″d, cos φ, liczbę par biegunów p, krotność I_LR/I_rM i sprawność η — obliczenie zwarciowe
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
  | { readonly rodzaj: 'propozycja'; readonly wartosc: number; readonly rodzajZrodla: string };

/**
 * Co obliczenie przyjmie, gdy pole projektanta jest puste: liczba z tabliczki elementu
 * (`materialized_params`) albo propozycja rejestru. Odczyt, nie rozstrzygnięcie — dana tabliczki
 * spoza zakresu bramy zostanie odrzucona przez backend (ślad biegu nazywa powód).
 */
export function zrodloParametruMaszyny(
  tabliczka: Readonly<Record<string, unknown>> | null | undefined,
  opis: ParametrMaszynyRejestru,
): ZrodloParametruMaszyny {
  const zTabliczki = tabliczka?.[opis.parametr];
  if (typeof zTabliczki === 'number' && Number.isFinite(zTabliczki)) {
    return { rodzaj: 'tabliczka', wartosc: zTabliczki };
  }
  return {
    rodzaj: 'propozycja',
    wartosc: opis.propozycja.wartosc,
    rodzajZrodla: opis.propozycja.rodzaj_zrodla,
  };
}
