/**
 * CEL GESTU DWUKLIKU = element pod PIERWSZYM klikiem gestu (karta FIX-E2E-PELNE).
 *
 * Defekt zmierzony natywnym dwuklikiem w żywej aplikacji (spec `parytety-fala2` L-11):
 * pierwszy klik w wartość z dowodem w tabeli wyników zaznacza wiersz, zaznaczenie
 * elementu rozwija inspektor powłoki (`useInspektorZaZawartoscia`), obszar roboczy
 * zwęża się i tabela przepływa — drugi klik i `dblclick` trafiają w inną komórkę albo
 * w inny wiersz. Wywód się nie otwierał, a drugi klik potrafił zaznaczyć INNY wiersz.
 * Ta sama klasa co gest wieloklikowy kanwy SLD (`SldCanvasV3`, „CEL GESTU WIELOKLIKU"),
 * gdzie pierwszy klik w stację otwiera inspektor i przesuwa rysunek.
 *
 * Reguła (jedno źródło prawdy dla OBU zdarzeń gestu): klik z `detail ≤ 1` w element
 * gestu zapisuje jego cel; drugi klik (`detail ≥ 2`) i `dblclick`, które wylądowały POZA
 * tym elementem (przesunął się albo został zastąpiony przy ponownym renderze), słuchacz
 * na `window` w fazie przechwytywania zatrzymuje, zanim dotrą do innego węzła, a `dblclick`
 * wykonuje akcję celu gestu. Zdarzenie w samym elemencie idzie zwykłą drogą (jego
 * `onDoubleClick`). `detail` liczy przeglądarka wg ustawień systemu (czas, odległość) —
 * hook nie ma własnego progu czasu. Klik z `detail ≤ 1` gdzie indziej kończy gest.
 */
import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';

interface Gest<T> {
  readonly cel: T;
  readonly element: Element;
}

/**
 * Zwraca funkcję, którą element gestu woła w `onClick` (rozpoczęcie gestu). `onDwuklik`
 * dostaje cel gestu, gdy `dblclick` wylądował poza elementem, w którym gest się zaczął.
 */
export function useCelGestuDwukliku<T>(
  onDwuklik: (cel: T) => void,
): (cel: T, zdarzenie: ReactMouseEvent<Element>) => void {
  const gest = useRef<Gest<T> | null>(null);
  const onDwuklikRef = useRef(onDwuklik);
  onDwuklikRef.current = onDwuklik;

  useEffect(() => {
    const wElemencieGestu = (zdarzenie: MouseEvent): boolean => {
      const biezacy = gest.current;
      return biezacy !== null && zdarzenie.target instanceof Node && biezacy.element.contains(zdarzenie.target);
    };
    const naKlik = (zdarzenie: MouseEvent) => {
      if (gest.current === null) return;
      if (zdarzenie.detail <= 1) {
        // Nowy gest gdzie indziej (albo klik klawiaturą) kończy bieżący.
        if (!wElemencieGestu(zdarzenie)) gest.current = null;
        return;
      }
      if (!wElemencieGestu(zdarzenie)) {
        zdarzenie.stopPropagation();
        zdarzenie.preventDefault();
      }
    };
    const naDwuklik = (zdarzenie: MouseEvent) => {
      const biezacy = gest.current;
      if (biezacy === null) return;
      const wElemencie = wElemencieGestu(zdarzenie);
      gest.current = null;
      // W samym elemencie gestu: zwykła droga (jego `onDoubleClick`).
      if (wElemencie) return;
      zdarzenie.stopPropagation();
      zdarzenie.preventDefault();
      onDwuklikRef.current(biezacy.cel);
    };
    window.addEventListener('click', naKlik, true);
    window.addEventListener('dblclick', naDwuklik, true);
    return () => {
      window.removeEventListener('click', naKlik, true);
      window.removeEventListener('dblclick', naDwuklik, true);
    };
  }, []);

  return useCallback((cel: T, zdarzenie: ReactMouseEvent<Element>) => {
    if (zdarzenie.detail <= 1) gest.current = { cel, element: zdarzenie.currentTarget };
  }, []);
}
