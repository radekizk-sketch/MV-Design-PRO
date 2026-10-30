/**
 * Wspólny predykat testów odczepów aparatów bocznych pola (rozstrzygnięcie architekta KD-5,
 * 2026-10-30): aparaty boczne wspólnej kotwicy wiszą na JEDNYM przewodzie poziomym złożonym
 * z odcinków stykających się końcami (`compose/apparatusSequence.ts::odcinkiOdczepowBocznych`)
 * — odcinek dalszego aparatu zaczyna się na porcie bliższego, nie nakłada się na niego.
 * Węzeł przyłączenia każdego odczepu leży więc na WĘŹLE POLA: na osi toru głównego albo na
 * końcu innego odczepu tego samego pola, z którego łańcuch prowadzi do osi.
 */
interface Punkt {
  readonly x: number;
  readonly y: number;
}

interface OdcinekOdczepu {
  readonly points: readonly Punkt[];
}

/** `true`, gdy łańcuch odczepów pola prowadzi od startu `odczep` do osi toru `osX`. */
export function odczepZaczynaSieNaWezlePola(
  odczep: OdcinekOdczepu,
  odczepyPola: readonly OdcinekOdczepu[],
  osX: number,
): boolean {
  let punkt = odczep.points[0];
  const odwiedzone = new Set<string>();
  while (punkt && punkt.x !== osX) {
    const klucz = `${punkt.x},${punkt.y}`;
    if (odwiedzone.has(klucz)) return false;
    odwiedzone.add(klucz);
    const poprzedni = odczepyPola.find((inny) => {
      const koniec = inny.points[inny.points.length - 1];
      return inny !== odczep && koniec != null && koniec.x === punkt!.x && koniec.y === punkt!.y;
    });
    if (!poprzedni) return false;
    punkt = poprzedni.points[0];
  }
  return punkt != null;
}
