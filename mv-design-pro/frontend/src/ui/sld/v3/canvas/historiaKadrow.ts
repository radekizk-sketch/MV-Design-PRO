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
 * Stos jest OGRANICZONY (`LIMIT_HISTORII_KADROW`): przy przepełnieniu wypada
 * najstarszy wpis. Moduł jest czysty i niezmienniczy (każda operacja zwraca nową
 * tablicę), więc testowalny bez Reacta.
 */
import type { SceneLod } from '../scene/buildScene';
import type { ViewportTransform } from './camera';
import type { PoziomSciezki } from './zakresKadru';

export const LIMIT_HISTORII_KADROW = 20;

export interface WpisHistoriiKadru {
  readonly transform: ViewportTransform;
  readonly lod: SceneLod;
  /** Ścieżka kontekstu, która opisywała ten kadr (`[]` = brak kontekstu). */
  readonly sciezka: readonly PoziomSciezki[];
}

export function dolozDoHistorii(
  stos: readonly WpisHistoriiKadru[],
  wpis: WpisHistoriiKadru,
  limit: number = LIMIT_HISTORII_KADROW,
): readonly WpisHistoriiKadru[] {
  const ostatni = stos[stos.length - 1];
  // Ten sam kadr dwa razy z rzędu (np. dwa kliknięcia „Dopasuj widok") nie
  // tworzy drugiego wpisu — „Poprzedni widok" ma zawsze coś zmienić.
  if (
    ostatni &&
    ostatni.lod === wpis.lod &&
    ostatni.transform.scale === wpis.transform.scale &&
    ostatni.transform.translateX === wpis.transform.translateX &&
    ostatni.transform.translateY === wpis.transform.translateY
  ) {
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
