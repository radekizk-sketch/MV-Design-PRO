/**
 * UI-02b JEDEN-INSPEKTOR — kontekst kliknięcia kanwy dla prawego inspektora.
 *
 * Kanwa SLD nie otwiera żadnego własnego panelu szczegółów. Klik elementu robi dwie
 * rzeczy: zaznacza obiekt (globalny `useSelectionStore` — JEDYNA prawda o tym, CO jest
 * wskazane) i zapisuje tu, JAK kanwa ten obiekt zaadresowała: rodzaj obiektu sceny
 * (`elementKind`), ref właściciela symbolu, ref pojedynczego urządzenia (`deviceRef`)
 * i temat menu (`CanvasMenuSubject`, rozstrzygnięty TYM SAMYM wywołaniem co menu
 * kontekstowe). Inspektor czyta ten kontekst WYŁĄCZNIE wtedy, gdy `selekcjaId` jest
 * równe id bieżącej selekcji — wskazanie z drzewa, wyszukiwarki albo adresu nigdy nie
 * dostaje cudzego kontekstu (para zapis/odczyt z jednego klucza).
 *
 * Szkic DER: upuszczenie układu PV/BESS/FW z palety na stację zaznacza stację i zapisuje
 * szkic; inspektor tej stacji pokazuje formularz DER z zapisem do backendu. Szkic znika
 * po zapisie, po „Anuluj" i przy każdym nowym kontekście innego obiektu.
 */
import { create } from 'zustand';

import type { PreviewElementKind } from '../v3/compose/preview';
import type { CanvasMenuSubject } from '../v3/canvas/canvasMenuSubject';
import type { RolaSymboluLacznika } from '../v2/model/stanAparatowPola';

export interface KontekstElementuKanwy {
  /** Id selekcji globalnej, której dotyczy kontekst (klucz odczytu). */
  readonly selekcjaId: string;
  /** Rodzaj obiektu sceny v3; `undefined` = obiekt bez rodzaju w modelu. */
  readonly elementKind: PreviewElementKind | undefined;
  /** Ref właściciela symbolu (stacja, pole, gałąź, punkt odgałęźny…). */
  readonly ref: string;
  /** Ref pojedynczego urządzenia aparatu (ścieżka danych sceny), gdy znany. */
  readonly deviceRef?: string;
  /** Rola klikniętego symbolu łącznika bez `deviceRef` (`SldElementClickMeta.rolaLacznika`). */
  readonly rolaLacznika?: RolaSymboluLacznika;
  /** Temat menu z `resolveCanvasMenuSubject`; `null` = obiekt bez operacji domenowych. */
  readonly temat: CanvasMenuSubject | null;
  /** Kanwa w trybie podglądu — wykonawca akcji blokuje wtedy wstawianie i usuwanie. */
  readonly tylkoOdczyt: boolean;
}

export type RodzajSzkicuDer = 'PV' | 'BESS' | 'FW';

export interface SzkicDer {
  readonly stationRef: string;
  readonly derKind: RodzajSzkicuDer;
}

interface StanKontekstuElementu {
  readonly kontekst: KontekstElementuKanwy | null;
  readonly szkicDer: SzkicDer | null;
  /** Nowy kontekst kliknięcia; szkic DER innej stacji jest porzucany. */
  readonly ustawKontekst: (kontekst: KontekstElementuKanwy) => void;
  readonly ustawSzkicDer: (szkic: SzkicDer) => void;
  readonly wyczyscSzkicDer: () => void;
  readonly wyczysc: () => void;
}

export const useKontekstElementuKanwy = create<StanKontekstuElementu>((set) => ({
  kontekst: null,
  szkicDer: null,
  ustawKontekst: (kontekst) =>
    set((stan) => ({
      kontekst,
      szkicDer: stan.szkicDer && stan.szkicDer.stationRef === kontekst.selekcjaId ? stan.szkicDer : null,
    })),
  ustawSzkicDer: (szkic) => set({ szkicDer: szkic }),
  wyczyscSzkicDer: () => set({ szkicDer: null }),
  wyczysc: () => set({ kontekst: null, szkicDer: null }),
}));

/** Kontekst dla bieżącej selekcji albo `null` (klucz `selekcjaId` z jednego źródła). */
export function kontekstDlaSelekcji(
  kontekst: KontekstElementuKanwy | null,
  selekcjaId: string | null,
): KontekstElementuKanwy | null {
  if (!kontekst || selekcjaId === null) return null;
  return kontekst.selekcjaId === selekcjaId ? kontekst : null;
}
