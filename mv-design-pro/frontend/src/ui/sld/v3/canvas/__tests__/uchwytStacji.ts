/**
 * Uchwyt STACJI na kanwie jednej sceny (karta SLD-SKALA-I-NAWIGACJA R1).
 *
 * Jedna scena nie ma zwiniętego symbolu stacji widoku ogólnego — stację wskazuje obrys
 * trafienia napisu identyfikacji `<ref>#name-row-0` (warstwa `sld-v3-trafienia`, klasa
 * `etykieta`). Helper jest JEDYNYM miejscem tej reguły w testach kanwy: zmiana adresu
 * uchwytu stacji zmienia się tu, nie w każdym pliku.
 */
import type { SceneV3 } from '../../scene/buildScene';

/** Sufiks refu właściciela wiersza nazwy stacji w paśmie nazw. */
export const WIERSZ_NAZWY_STACJI = '#name-row-0';

function obrysyEtykiet(container: ParentNode): readonly Element[] {
  return [...container.querySelectorAll('[data-hit-role="obrys"][data-hit-klasa="etykieta"]')];
}

/** Obrys trafienia napisu identyfikacji stacji `ref` albo `null`, gdy kadr go nie rysuje. */
export function uchwytNazwyStacjiLubNull(container: ParentNode, ref: string): Element | null {
  return obrysyEtykiet(container).find((n) => n.getAttribute('data-hit-owner-ref') === `${ref}${WIERSZ_NAZWY_STACJI}`) ?? null;
}

/** Obrys trafienia napisu identyfikacji stacji `ref`; brak uchwytu to błąd testu. */
export function uchwytNazwyStacji(container: ParentNode, ref: string): Element {
  const el = uchwytNazwyStacjiLubNull(container, ref);
  if (!el) throw new Error(`brak uchwytu napisu stacji ${ref}`);
  return el;
}

/** Stacje z uchwytem trafienia w bieżącym kadrze, w kolejności obejścia sceny. */
export function stacjeZUchwytem(container: ParentNode, scene: SceneV3): { readonly ref: string; readonly el: Element }[] {
  const obrysy = obrysyEtykiet(container);
  return scene.meta.stationTraversalOrder.flatMap((ref) => {
    const el = obrysy.find((n) => n.getAttribute('data-hit-owner-ref') === `${ref}${WIERSZ_NAZWY_STACJI}`);
    return el ? [{ ref, el }] : [];
  });
}

/** Pierwsza stacja z uchwytem w kadrze; brak — błąd testu (kadr bez napisu stacji). */
export function pierwszaStacjaZUchwytem(container: ParentNode, scene: SceneV3): { readonly ref: string; readonly el: Element } {
  const [pierwsza] = stacjeZUchwytem(container, scene);
  if (!pierwsza) throw new Error('kadr nie rysuje napisu identyfikacji żadnej stacji');
  return pierwsza;
}

/**
 * Obrys trafienia OBSZARU stacji `ref` (R6: cel trafienia, gdy aparaty i pola stacji są na
 * ekranie poniżej progu rozpoznawalności — `hitAreas.celTrafienia`) albo `null`, gdy w tym
 * kadrze celem są aparaty lub pola.
 */
export function uchwytObszaruStacjiLubNull(container: ParentNode, ref: string): Element | null {
  return (
    [...container.querySelectorAll('[data-hit-role="obrys"][data-hit-klasa="stacja"]')].find(
      (n) => n.getAttribute('data-hit-owner-ref') === ref,
    ) ?? null
  );
}

/** Pierwsza stacja (kolejność obejścia sceny) z obrysem OBSZARU w bieżącym kadrze; brak — błąd
 *  testu (w kadrze przeglądu każda stacja jest celem trafienia). */
export function pierwszyObszarStacji(container: ParentNode, scene: SceneV3): { readonly ref: string; readonly el: Element } {
  for (const ref of scene.meta.stationTraversalOrder) {
    const el = uchwytObszaruStacjiLubNull(container, ref);
    if (el) return { ref, el };
  }
  throw new Error('kadr nie ma obszaru trafienia żadnej stacji');
}
