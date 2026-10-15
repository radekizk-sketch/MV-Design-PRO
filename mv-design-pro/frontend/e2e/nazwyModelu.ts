/**
 * Nazwa elementu modelu dla speców (karta #145).
 *
 * Ekrany wyników nazywają elementy mostem nazw (`ui2/wyniki/wzorzec/useNazwaObiektu`) —
 * nazwą z migawki modelu, także gdy wynik niesie identyfikator GRAFU
 * (`uuid5(NAMESPACE_DNS, ref_id)`). Spec, który klika albo sprawdza element po
 * identyfikatorze, przestał go widzieć na ekranie; ten helper czyta nazwę z TEGO SAMEGO
 * modelu, który widzi ekran:
 * - `nazwaElementu` — z fikstury migawki, którą harness zasiewa scenę (nie literał w specu);
 * - `nazwaWMigawce` — z dowolnej migawki modelu (np. odczytanej w specu z realnego backendu).
 * Identyfikator grafu tłumaczy produkcyjne lustro reguły backendu
 * (`ui/topology/identyfikatorGrafu.ts`, parytet z `enm/mapping.py::ref_to_graph_id`
 * pilnowany testem `mostNazw.test.ts`) — to samo, czego używa most nazw ekranu.
 * Brak nazwy to błąd specu (scena bez modelu albo zła fikstura), nie cichy fallback.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { identyfikatorGrafu } from '../src/ui/topology/identyfikatorGrafu';

const FIXTURY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/harness-fixtures/generated',
);

function fikstura(nazwa: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURY_DIR, `${nazwa}.json`), 'utf-8'));
}

/** Nazwa elementu o `ref` (`ref_id`, `id` albo identyfikator grafu) w modelu `migawka`. */
export function nazwaWMigawce(migawka: unknown, ref: string, opisMigawki: string): string {
  const znalezione: string[] = [];
  const szukaj = (wezel: unknown): void => {
    if (Array.isArray(wezel)) {
      wezel.forEach(szukaj);
      return;
    }
    if (wezel !== null && typeof wezel === 'object') {
      const obiekt = wezel as Record<string, unknown>;
      const refModelu = typeof obiekt.ref_id === 'string' ? obiekt.ref_id : null;
      const pasuje =
        refModelu === ref
        || obiekt.id === ref
        || (refModelu !== null && identyfikatorGrafu(refModelu) === ref);
      if (pasuje && typeof obiekt.name === 'string' && obiekt.name !== '') {
        znalezione.push(obiekt.name);
      }
      Object.values(obiekt).forEach(szukaj);
    }
  };
  szukaj(migawka);
  if (znalezione.length === 0) {
    throw new Error(`Model ${opisMigawki} nie nazywa elementu „${ref}".`);
  }
  return znalezione[0];
}

/** Nazwa elementu `ref` (albo identyfikatora grafu) z fikstury migawki `plikMigawki`. */
export function nazwaElementu(plikMigawki: string, ref: string): string {
  return nazwaWMigawce(fikstura(plikMigawki), ref, `z fikstury „${plikMigawki}"`);
}
