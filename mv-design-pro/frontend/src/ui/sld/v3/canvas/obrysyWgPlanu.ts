/**
 * OBRYSY ETYKIET WEDŁUG PLANU — ramka bloku przekaźnika i tło pola GPZ liczone na kanwie
 * z prostokątów NARYSOWANYCH etykiet (`LabelRenderPlan.drawn`), nie ze slotów sceny.
 *
 * KLASA DEFEKTU. Scena (deterministyczna, bez skali kamery) liczy oba obrysy ze slotów etykiet
 * w piśmie naturalnym: ramka bloku = okrąg ∪ wiersze bloku + margines
 * (`compose/gpz.ts::ramkaBlokuPrzekaznika`), tło pola = symbole ∪ przekaźniki ∪ etykiety pola
 * + margines (`compose/gpzAdnotacje.ts::panelePolGpz`). Plan etykiet kanwy zmienia jednak
 * pismo zależnie od skali: podłoga opisów celu kadru (K2b §0.2 (b), 13 px ekranu) i podłoga
 * czytelności (S9-7) POWIĘKSZAJĄ pismo, a plan może też przenieść etykietę na stronę
 * zastępczą albo jej nie narysować. Obrys ze slotu sceny przestaje wtedy obejmować tusz —
 * pomiar e2e (kadr pola Z.11.1, skala 1,48 px/j.św., pismo t4 podniesione z 8 do 8,81 j.św.):
 * wiersz „81O · 81R · ZS · 50BF · 79" wychodził 8,1 px poza prawą krawędź ramki bloku
 * i 2,3 px poza tło pola. Dopóki szerokość wiersza szacowano z zapasem 0,62 em, zapas
 * maskował rozjazd; tabela posuwów kroju (decyzja architekta §11.7 pkt 7) go odsłoniła.
 *
 * ROZSTRZYGNIĘCIE. Obrys rysowany na kanwie jest funkcją TEGO SAMEGO planu, który rysuje tekst:
 *  · ramka bloku — `ramkaBlokuPrzekaznika` (ta sama funkcja co scena) z okręgu i NARYSOWANYCH
 *    wierszy z listy członków sceny (`PreviewElementMeta.wierszeBlokuPrzekaznika`); żaden wiersz
 *    nienarysowany ⇒ brak ramki (ramka obejmuje blok, a bloku bez wierszy nie ma — ta sama
 *    reguła, którą scena stosuje dla układu bez wierszy);
 *  · tło pola — `panelePolGpz` (ta sama funkcja co scena) z tła sceny pomniejszonego o margines
 *    (obrys elementów sceny), NARYSOWANYCH etykiet z listy członków (`PanelPolaGpz.etykiety`)
 *    i ramek bloków przekaźników pola wg planu. Tło nie kurczy się poniżej obrysu sceny:
 *    etykieta ukryta progiem czytelności nie przesuwa krawędzi tła przy każdym kroku zoomu.
 * W piśmie naturalnym oba obrysy są identyczne ze sceną (test `obrysyWgPlanu.test.ts`).
 *
 * Moduł czysty: zero React, zero DOM, zero fizyki.
 */
import { ramkaBlokuPrzekaznika } from '../compose/gpz';
import { panelePolGpz, type PanelPolaGpz } from '../compose/gpzAdnotacje';
import type { PreviewSymbol } from '../compose/preview';
import { GRID, type V3Rect } from '../core/grid';
import type { PlannedLabel } from './labelLegibility';

/** Margines tła pola — ta sama wartość, którą `panelePolGpz` dokłada do obrysu elementów. */
const MARGINES_TLA_POLA = GRID / 2;

/** Prostokąty narysowanych etykiet wg `ownerRef` (etykieta może mieć kilka wierszy planu). */
function narysowaneWgWlasciciela(drawn: readonly PlannedLabel[]): ReadonlyMap<string, readonly V3Rect[]> {
  const mapa = new Map<string, V3Rect[]>();
  for (const p of drawn) {
    const lista = mapa.get(p.label.ownerRef);
    if (lista) lista.push(p.rect);
    else mapa.set(p.label.ownerRef, [p.rect]);
  }
  return mapa;
}

/**
 * Ramki bloków przekaźników wg planu: indeks symbolu sceny → ramka (względem lewego górnego
 * rogu okręgu, jak `ramkaBlokuPrzekaznika`) albo `undefined`, gdy żaden wiersz bloku nie jest
 * narysowany. Mapa obejmuje WYŁĄCZNIE symbole, którym scena dała ramkę.
 */
export function ramkiBlokowWgPlanu(
  symbols: readonly PreviewSymbol[],
  drawn: readonly PlannedLabel[],
): ReadonlyMap<number, V3Rect | undefined> {
  const narysowane = narysowaneWgWlasciciela(drawn);
  const wynik = new Map<number, V3Rect | undefined>();
  symbols.forEach((symbol, index) => {
    if (!symbol.meta?.ramkaBlokuPrzekaznika) return;
    const wiersze = (symbol.meta.wierszeBlokuPrzekaznika ?? []).flatMap((ref) => narysowane.get(ref) ?? []);
    wynik.set(index, wiersze.length > 0 ? ramkaBlokuPrzekaznika(symbol.x, symbol.y, wiersze) : undefined);
  });
  return wynik;
}

/**
 * Tła pól GPZ wg planu: obrys sceny ∪ narysowane etykiety pola ∪ ramki bloków przekaźników pola
 * wg planu — każdy z marginesem `panelePolGpz`. Kolejność i role bez zmian.
 */
export function paneleWgPlanu(
  panele: readonly PanelPolaGpz[],
  symbols: readonly PreviewSymbol[],
  ramki: ReadonlyMap<number, V3Rect | undefined>,
  drawn: readonly PlannedLabel[],
): readonly PanelPolaGpz[] {
  const narysowane = narysowaneWgWlasciciela(drawn);
  const m = MARGINES_TLA_POLA;
  return panele.map((panel) => {
    const obrysSceny: V3Rect = {
      x: panel.rect.x + m,
      y: panel.rect.y + m,
      width: panel.rect.width - 2 * m,
      height: panel.rect.height - 2 * m,
    };
    const etykiety = panel.etykiety.flatMap((ref) =>
      (narysowane.get(ref) ?? []).map((rect) => ({ bayRef: panel.bayRef, rect, ownerRef: ref })),
    );
    const ramkiPola: { bayRef: string; rect: V3Rect }[] = [];
    symbols.forEach((symbol, index) => {
      const ramka = ramki.get(index);
      if (ramka && symbol.meta?.ownerRef === panel.bayRef) {
        ramkiPola.push({ bayRef: panel.bayRef, rect: { ...ramka, x: symbol.x + ramka.x, y: symbol.y + ramka.y } });
      }
    });
    const [poPlanie] = panelePolGpz(
      [{ bayRef: panel.bayRef, rola: panel.rola }],
      [{ bayRef: panel.bayRef, rect: obrysSceny }, ...ramkiPola, ...etykiety],
    );
    return { ...poPlanie, etykiety: panel.etykiety };
  });
}
