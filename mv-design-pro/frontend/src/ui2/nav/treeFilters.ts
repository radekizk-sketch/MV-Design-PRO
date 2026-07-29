/*
 * Filtrowanie drzewa kontekstowego (karta E1.2 §4, kryterium akceptacji 2).
 * Filtr „tylko z problemami" musi zachować przodków dopasowanych węzłów —
 * inaczej problem głęboko w drzewie byłby niewidoczny po zwinięciu ścieżki.
 */

import { widocznyWTrybie, type TrybMin, type WezelDrzewa } from './treeModel';

function maProblem(wezel: WezelDrzewa): boolean {
  return wezel.liczniki.blokady > 0 || wezel.liczniki.ostrzezenia > 0;
}

/**
 * Zwraca poddrzewo ograniczone do węzłów mających problem lub mających
 * potomka z problemem (przodkowie dopasowanych węzłów są zachowani).
 * Węzły bez problemu i bez takich potomków są usuwane.
 */
export function filtrujProblemy(wezly: WezelDrzewa[]): WezelDrzewa[] {
  const wynik: WezelDrzewa[] = [];
  for (const wezel of wezly) {
    const dzieciPoFiltrze = filtrujProblemy(wezel.dzieci);
    if (maProblem(wezel) || dzieciPoFiltrze.length > 0) {
      wynik.push({ ...wezel, dzieci: dzieciPoFiltrze });
    }
  }
  return wynik;
}

/**
 * Usuwa węzły (i całe poddrzewa) wymagające trybu zaawansowania wyższego niż
 * `trybAktualny` — ukrycie zgodne z progresywnym odsłanianiem (SPEC_UKLAD_PANELI §2).
 */
export function filtrujTryb(wezly: WezelDrzewa[], trybAktualny: TrybMin): WezelDrzewa[] {
  const wynik: WezelDrzewa[] = [];
  for (const wezel of wezly) {
    if (!widocznyWTrybie(wezel.trybMin, trybAktualny)) continue;
    wynik.push({ ...wezel, dzieci: filtrujTryb(wezel.dzieci, trybAktualny) });
  }
  return wynik;
}

/** Zastosowanie obu filtrów w kolejności: tryb (widoczność), potem problemy. */
export function zastosujFiltry(
  wezly: WezelDrzewa[],
  opcje: { filtrProblemy: boolean; trybAktualny?: TrybMin },
): WezelDrzewa[] {
  let efekt = opcje.trybAktualny ? filtrujTryb(wezly, opcje.trybAktualny) : wezly;
  if (opcje.filtrProblemy) {
    efekt = filtrujProblemy(efekt);
  }
  return efekt;
}
