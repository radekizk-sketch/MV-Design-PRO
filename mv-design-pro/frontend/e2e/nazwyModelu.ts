/**
 * Nazwa elementu modelu dla speców zrzutów (karta #145).
 *
 * Ekrany wyników nazywają elementy mostem nazw (`ui2/wyniki/wzorzec/useNazwaObiektu`) —
 * nazwą z migawki modelu sceny, także gdy wynik niesie identyfikator GRAFU
 * (`uuid5(NAMESPACE_DNS, ref_id)`). Spec, który klika albo sprawdza element po
 * identyfikatorze, przestał go widzieć na ekranie; ten helper czyta nazwę z TEJ SAMEJ
 * fikstury migawki, którą harness zasiewa scenę (nie literał w specu), a identyfikator
 * grafu tłumaczy parami policzonymi przez backend (`identyfikatory_grafu.json`).
 * Brak nazwy to błąd specu (scena bez modelu albo zła fikstura), nie cichy fallback.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/harness-fixtures/generated',
);

function fikstura(nazwa: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURY_DIR, `${nazwa}.json`), 'utf-8'));
}

/** Mapa identyfikatora grafu → `ref_id` (pary policzone przez backend). */
function refZIdentyfikatoraGrafu(): Map<string, string> {
  const { pary } = fikstura('identyfikatory_grafu') as {
    pary: { ref_id: string; graph_id: string }[];
  };
  return new Map(pary.map((para) => [para.graph_id, para.ref_id]));
}

/** Nazwa elementu `ref` (albo identyfikatora grafu) z migawki `plikMigawki`. */
export function nazwaElementu(plikMigawki: string, ref: string): string {
  const refModelu = refZIdentyfikatoraGrafu().get(ref) ?? ref;
  const znalezione: string[] = [];
  const szukaj = (wezel: unknown): void => {
    if (Array.isArray(wezel)) {
      wezel.forEach(szukaj);
      return;
    }
    if (wezel !== null && typeof wezel === 'object') {
      const obiekt = wezel as Record<string, unknown>;
      if (
        (obiekt.ref_id === refModelu || obiekt.id === refModelu)
        && typeof obiekt.name === 'string'
        && obiekt.name !== ''
      ) {
        znalezione.push(obiekt.name);
      }
      Object.values(obiekt).forEach(szukaj);
    }
  };
  szukaj(fikstura(plikMigawki));
  if (znalezione.length === 0) {
    throw new Error(`Migawka „${plikMigawki}" nie nazywa elementu „${ref}" (${refModelu}).`);
  }
  return znalezione[0];
}
