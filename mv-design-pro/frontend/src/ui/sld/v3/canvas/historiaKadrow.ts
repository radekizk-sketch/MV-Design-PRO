/**
 * HISTORIA KADRÓW schematu — „Poprzedni widok" (karta K2, rozstrzygnięcie §0.4:
 * „bez utraty kontekstu").
 *
 * Każde POLECENIE widoku (kadr stacji, pola, toru, „Dopasuj widok", „Cały
 * arkusz", wskazanie z wyników albo z gotowości, dwuklik stacji, rozwinięcie
 * zwiniętego GPZ klikiem) odkłada na stos stan kamery SPRZED polecenia razem ze
 * ścieżką kontekstu, która go opisywała. „Poprzedni widok" zdejmuje wierzch
 * stosu i przywraca dokładnie ten kadr. Gesty kółka, przeciągnięcia
 * i przesuwania kadru w nawigatorze (ciągły ruch, nie polecenie) historii nie
 * zaśmiecają.
 *
 * K2b §0.3 — wpis niesie KOMPLET kontekstu widoku: kamerę (transformacja,
 * poziom szczegółu), ścieżkę, ZAZNACZENIE (elementy modelu z ich kontekstem
 * kliknięcia kanwy — inspektor powłoki wraca do tego samego obiektu) oraz
 * kurtynę kadru (refy rysunku celu, którego kadr wtedy obowiązywał). Powrót
 * („Poprzedni widok", poziom „Sieć" ścieżki) odtwarza wszystko naraz — sama
 * kamera bez zaznaczenia gubiła miejsce pracy projektanta (wada Z-02).
 *
 * Stos jest OGRANICZONY (`LIMIT_HISTORII_KADROW`): przy przepełnieniu wypada
 * najstarszy wpis. Moduł jest czysty i niezmienniczy (każda operacja zwraca nową
 * tablicę), więc testowalny bez Reacta.
 */
import type { SelectedElement } from '../../../types';
import type { KontekstElementuKanwy } from '../../shared/kontekstElementuKanwy';
import type { SceneLod } from '../scene/buildScene';
import type { ViewportTransform } from './camera';
import type { PoziomSciezki } from './zakresKadru';

export const LIMIT_HISTORII_KADROW = 20;

export interface WpisHistoriiKadru {
  readonly transform: ViewportTransform;
  readonly lod: SceneLod;
  /** Viewport kanwy, w którym `transform` obowiązywał — powrót przenosi kadr do
   *  bieżącego rozmiaru kanwy (akcja kamery 'przywroc'), zamiast kłaść stary
   *  transform na kanwę innej szerokości (dryf o pół inspektora, FIX-E2E-PELNE). */
  readonly viewportSize: { readonly width: number; readonly height: number };
  /** Ścieżka kontekstu, która opisywała ten kadr (`[]` = brak kontekstu). */
  readonly sciezka: readonly PoziomSciezki[];
  /** Zaznaczenie w chwili zapisu wpisu (refy modelu + kontekst kliknięcia). */
  readonly zaznaczenie: ZaznaczenieWidoku;
  /** Refy rysunku celu kadru, który wtedy obowiązywał (`null` = bez kurtyny). */
  readonly kurtyna: readonly string[] | null;
}

/** Zaznaczenie zapamiętane z widokiem: elementy selekcji (ref modelu, typ, nazwa)
 *  i kontekst kliknięcia kanwy, pod którym inspektor powłoki je adresował. */
export interface ZaznaczenieWidoku {
  readonly elementy: readonly SelectedElement[];
  readonly kontekst: KontekstElementuKanwy | null;
}

export const BEZ_ZAZNACZENIA: ZaznaczenieWidoku = { elementy: [], kontekst: null };

function toSamoZaznaczenie(a: ZaznaczenieWidoku, b: ZaznaczenieWidoku): boolean {
  return (
    a.elementy.length === b.elementy.length &&
    a.elementy.every((e, i) => e.id === b.elementy[i]!.id && e.type === b.elementy[i]!.type) &&
    (a.kontekst?.selekcjaId ?? null) === (b.kontekst?.selekcjaId ?? null) &&
    (a.kontekst?.ref ?? null) === (b.kontekst?.ref ?? null)
  );
}

function tenSamWidok(a: WpisHistoriiKadru, b: WpisHistoriiKadru): boolean {
  return (
    a.lod === b.lod &&
    a.transform.scale === b.transform.scale &&
    a.transform.translateX === b.transform.translateX &&
    a.transform.translateY === b.transform.translateY &&
    a.viewportSize.width === b.viewportSize.width &&
    a.viewportSize.height === b.viewportSize.height &&
    a.sciezka.length === b.sciezka.length &&
    a.sciezka.every((p, i) => p.cel === b.sciezka[i]!.cel && p.kontekst.join('|') === b.sciezka[i]!.kontekst.join('|')) &&
    toSamoZaznaczenie(a.zaznaczenie, b.zaznaczenie) &&
    (a.kurtyna ?? []).join('|') === (b.kurtyna ?? []).join('|') &&
    (a.kurtyna === null) === (b.kurtyna === null)
  );
}

export function dolozDoHistorii(
  stos: readonly WpisHistoriiKadru[],
  wpis: WpisHistoriiKadru,
  limit: number = LIMIT_HISTORII_KADROW,
): readonly WpisHistoriiKadru[] {
  const ostatni = stos[stos.length - 1];
  // Ten sam widok dwa razy z rzędu (np. dwa kliknięcia „Dopasuj widok") nie
  // tworzy drugiego wpisu — „Poprzedni widok" ma zawsze coś zmienić. „Ten sam"
  // = ta sama kamera, ścieżka, zaznaczenie i kurtyna (inne zaznaczenie przy tej
  // samej kamerze to inny widok — jego utrata byłaby utratą kontekstu).
  if (ostatni && tenSamWidok(ostatni, wpis)) {
    return stos;
  }
  const nowy = [...stos, wpis];
  return nowy.length > limit ? nowy.slice(nowy.length - limit) : nowy;
}

export function zdejmijZHistorii(
  stos: readonly WpisHistoriiKadru[],
): { readonly wpis: WpisHistoriiKadru; readonly stos: readonly WpisHistoriiKadru[] } | null {
  if (stos.length === 0) return null;
  return { wpis: stos[stos.length - 1], stos: stos.slice(0, -1) };
}

/**
 * K2b §0.3 — poziom „Sieć" ścieżki: wpis sprzed WEJŚCIA w cel (ostatni wpis
 * z pustą ścieżką) i stos bez niego oraz bez wpisów nad nim. `null` = takiego
 * wpisu nie ma (np. historia przepełniona) — wołający kadruje wtedy całą sieć.
 */
export function zdejmijDoWejscia(
  stos: readonly WpisHistoriiKadru[],
): { readonly wpis: WpisHistoriiKadru; readonly stos: readonly WpisHistoriiKadru[] } | null {
  for (let i = stos.length - 1; i >= 0; i -= 1) {
    if (stos[i]!.sciezka.length === 0) return { wpis: stos[i]!, stos: stos.slice(0, i) };
  }
  return null;
}
