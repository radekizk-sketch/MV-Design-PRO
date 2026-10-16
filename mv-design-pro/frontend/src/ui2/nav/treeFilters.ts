/*
 * Filtrowanie drzewa kontekstowego (karta E1.2 §4, kryterium akceptacji 2).
 * Filtr „tylko z problemami" musi zachować przodków dopasowanych węzłów —
 * inaczej problem głęboko w drzewie byłby niewidoczny po zwinięciu ścieżki.
 */

import type { WezelDrzewa } from './treeModel';

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

/** Zastosowanie filtrów drzewa (dziś: „tylko z problemami"). */
export function zastosujFiltry(
  wezly: WezelDrzewa[],
  opcje: { filtrProblemy: boolean },
): WezelDrzewa[] {
  return opcje.filtrProblemy ? filtrujProblemy(wezly) : wezly;
}
