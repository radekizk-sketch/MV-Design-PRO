/**
 * JEDNA scena na migawkę modelu — pamięć podręczna `buildSceneV3` współdzielona przez kanwę
 * i jej przestrzeń roboczą (karta K2; karta SLD-SKALA-I-NAWIGACJA R1).
 *
 * PO CO. Kanwa (`SldCanvasV3`), przestrzeń robocza (`SldCanvasV3Workspace`: legenda,
 * nawigator, lasso, kadrowanie celów) i eksport czytają TĘ SAMĄ scenę. Scena ma jedną
 * geometrię świata niezależną od skali kamery (R1), więc na migawkę przypada dokładnie jedna
 * scena — kolejne kopie byłyby czystym kosztem bez nowej treści.
 *
 * `buildSceneV3` jest czystą, deterministyczną funkcją migawki, a scena jest niezmienna (typy
 * `readonly`), więc wynik można współdzielić. Klucz to OBIEKT migawki (`WeakMap`): magazyn
 * migawki podmienia obiekt przy każdej zmianie modelu, więc nowa migawka zawsze dostaje nową
 * scenę, a stara znika razem z migawką.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSceneV3, type SceneV3 } from './buildScene';

const SCENY = new WeakMap<EnergyNetworkModel, SceneV3>();

export function scenaSld(snapshot: EnergyNetworkModel): SceneV3 {
  const zapamietana = SCENY.get(snapshot);
  if (zapamietana) return zapamietana;
  const scena = buildSceneV3(snapshot);
  SCENY.set(snapshot, scena);
  return scena;
}
