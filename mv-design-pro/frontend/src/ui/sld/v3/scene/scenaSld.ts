/**
 * JEDNA scena na (migawkę modelu, poziom szczegółu) — pamięć podręczna
 * `buildSceneV3` współdzielona przez kanwę i jej przestrzeń roboczą (karta K2).
 *
 * PO CO. Kanwa (`SldCanvasV3`) liczy sceny trzech poziomów szczegółu, a przestrzeń
 * robocza (`SldCanvasV3Workspace`) budowała z TEJ SAMEJ migawki własne kopie:
 * scenę aktywnego poziomu (legenda, nawigator), scenę L0 nawigatora i scenę
 * przy każdym puszczeniu przycisku lasso. Kadrowanie celów (stacja, pole, tor)
 * potrzebuje w przestrzeni roboczej wszystkich trzech poziomów, żeby rozstrzygnąć,
 * czy cel jest narysowany — kolejne kopie byłyby czystym kosztem bez nowej treści.
 *
 * `buildSceneV3` jest czystą, deterministyczną funkcją migawki i poziomu, a scena
 * jest niezmienna (typy `readonly`), więc wynik można współdzielić. Klucz to OBIEKT
 * migawki (`WeakMap`): magazyn migawki podmienia obiekt przy każdej zmianie modelu,
 * więc nowa migawka zawsze dostaje nową scenę, a stara znika razem z migawką.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from './buildScene';

const SCENY = new WeakMap<EnergyNetworkModel, Map<SceneLod, SceneV3>>();

export function scenaSld(snapshot: EnergyNetworkModel, lod: SceneLod): SceneV3 {
  let poziomy = SCENY.get(snapshot);
  if (!poziomy) {
    poziomy = new Map();
    SCENY.set(snapshot, poziomy);
  }
  const zapamietana = poziomy.get(lod);
  if (zapamietana) return zapamietana;
  const scena = buildSceneV3(snapshot, lod);
  poziomy.set(lod, scena);
  return scena;
}

/** Sceny wszystkich trzech poziomów szczegółu tej samej migawki. */
export function scenyWszystkichPoziomow(
  snapshot: EnergyNetworkModel,
): Readonly<Record<SceneLod, SceneV3>> {
  return { 0: scenaSld(snapshot, 0), 1: scenaSld(snapshot, 1), 2: scenaSld(snapshot, 2) };
}
