/*
 * Żądanie zakładki przestrzeni „Model sieci” zgłoszone spoza niej (karta GPZ-H5-APARATURA).
 *
 * Kreator źródła zasilania buduje GPZ z równoważnikiem na szynach SN; GPZ z transformatorami
 * 110/SN w modelu (układ H5) buduje szablon stacji z galerii „Szablony stacji”. Akcja
 * kreatora przechodzi do przestrzeni „Model sieci” i zgłasza tu zakładkę, a `ModelWarsztat`
 * ją otwiera i zużywa żądanie — także gdy montuje się dopiero po przejściu przestrzeni.
 */

import { create } from 'zustand';

/** Zakładki przestrzeni „Model sieci” otwierane spoza niej. */
export type ZadanaZakladkaModelu = 'szablony';

interface StanZadaniaZakladki {
  zadanie: ZadanaZakladkaModelu | null;
  zglos: (zakladka: ZadanaZakladkaModelu) => void;
  zuzyj: () => void;
}

export const useZadanieZakladkiModelu = create<StanZadaniaZakladki>((set) => ({
  zadanie: null,
  zglos: (zakladka) => set({ zadanie: zakladka }),
  zuzyj: () => set({ zadanie: null }),
}));
