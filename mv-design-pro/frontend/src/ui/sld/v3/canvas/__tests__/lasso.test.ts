/**
 * F12-B pkt 5 (docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md §F12, spec §10.1
 * ARCH-4 — „LassoSelector — selekcja obszarem"): testy CZYSTEJ funkcji
 * hit-testu `symbolsInLassoRect` (`SldCanvasV3Workspace.tsx`).
 *
 * METODOLOGIA (patrz `sldCanvasV3.test.tsx` sekcja „F8a k3"): jsdom w tym
 * środowisku testowym NIE implementuje `PointerEvent` jako konstruktora —
 * symulacja realnego Shift+drag przez `fireEvent.pointerDown/Move/Up` na
 * DOM nie niesie `clientX/clientY/pointerId`. Pokrycie tego zadania jest
 * więc — zgodnie z tym samym precedensem metodologicznym — SKUPIONE na
 * czystej funkcji hit-testu (testowalnej w pełni bez DOM/PointerEvent);
 * wiring DOM (`handleLassoPointerDown/Move/Up`, nakładka
 * `sld-v3-lasso-capture` w `SldCanvasV3Workspace.tsx`) jest udokumentowany
 * w kodzie produkcyjnym (komentarze przy stanie `shiftHeld`/`lassoRect`) i
 * NIE ma dodatkowego pokrycia DOM w tej dostawie — ta sama luka metodologiczna
 * co pan/pinch kamery v3 (`camera.test.ts` pokrywa WYŁĄCZNIE czyste funkcje,
 * zero testu DOM pointera, patrz `sldCanvasV3.test.tsx` nagłówek sekcji k3).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { IDENTITY_TRANSFORM, type ViewportTransform } from '../camera';
import type { LassoRect } from '../../../v2/canvas/LassoSelector';
import { symbolsInLassoRect } from '../SldCanvasV3Workspace';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

function rectAround(centerX: number, centerY: number, halfSize: number): LassoRect {
  return { x: centerX - halfSize, y: centerY - halfSize, width: 2 * halfSize, height: 2 * halfSize };
}

describe('symbolsInLassoRect — F12-B pkt 5: hit-test czysty (worldToScreen po SYMBOL_DEFS)', () => {
  it('trafia symbol, którego środek bboxa (world) wpada w rect (IDENTITY_TRANSFORM ⇒ world===screen)', () => {
    const scene = buildSceneV3(enm, 0);
    const target = scene.symbols.find((s) => s.meta?.ownerRef && s.meta.elementKind === 'station');
    expect(target).toBeTruthy();
    const def = SYMBOL_DEFS[target!.symbolId];
    const centerX = target!.x + def.width / 2;
    const centerY = target!.y + def.height / 2;

    const hits = symbolsInLassoRect(scene, rectAround(centerX, centerY, 4), IDENTITY_TRANSFORM);

    expect(hits.some((h) => h.ownerRef === target!.meta!.ownerRef && h.elementKind === 'station')).toBe(true);
  });

  it('NIE trafia symboli spoza rect', () => {
    const scene = buildSceneV3(enm, 0);
    // Rect daleko poza bboxem sceny (scena zaczyna się blisko origin, dodatnie
    // współrzędne — punkt (-100000,-100000) jest poza jakąkolwiek geometrią).
    const hits = symbolsInLassoRect(scene, rectAround(-100000, -100000, 10), IDENTITY_TRANSFORM);
    expect(hits).toHaveLength(0);
  });

  it('rect obejmujący CAŁY bbox sceny trafia WIELE symboli z unikalnymi ownerRef (deduplikacja)', () => {
    const scene = buildSceneV3(enm, 0);
    const bigRect: LassoRect = {
      x: scene.bbox.x - 10,
      y: scene.bbox.y - 10,
      width: scene.bbox.width + 20,
      height: scene.bbox.height + 20,
    };
    const hits = symbolsInLassoRect(scene, bigRect, IDENTITY_TRANSFORM);

    const symbolsWithIdentity = scene.symbols.filter((s) => s.meta?.ownerRef && s.meta.elementKind);
    const uniqueOwnerRefs = new Set(symbolsWithIdentity.map((s) => s.meta!.ownerRef));
    expect(hits.length).toBe(uniqueOwnerRefs.size);
    // Zero duplikatów ownerRef w wyniku.
    expect(new Set(hits.map((h) => h.ownerRef)).size).toBe(hits.length);
  });

  it('pomija symbole bez ownerRef/elementKind (adnotacje bez identyfikatora domenowego) — zero zgadywania', () => {
    const scene = buildSceneV3(enm, 0);
    const bareSymbol = { symbolId: scene.symbols[0].symbolId, x: 500, y: 500 };
    const sceneWithBareSymbol = { ...scene, symbols: [...scene.symbols, bareSymbol] };
    const def = SYMBOL_DEFS[bareSymbol.symbolId];
    const centerX = bareSymbol.x + def.width / 2;
    const centerY = bareSymbol.y + def.height / 2;

    const hits = symbolsInLassoRect(sceneWithBareSymbol, rectAround(centerX, centerY, 4), IDENTITY_TRANSFORM);

    expect(hits.every((h) => h.ownerRef !== undefined)).toBe(true);
  });

  it('respektuje transform (scale+translate) — worldToScreen mapuje world→screen przed testem trafienia', () => {
    const scene = buildSceneV3(enm, 0);
    const target = scene.symbols.find((s) => s.meta?.ownerRef && s.meta.elementKind === 'station');
    expect(target).toBeTruthy();
    const def = SYMBOL_DEFS[target!.symbolId];
    const worldCenterX = target!.x + def.width / 2;
    const worldCenterY = target!.y + def.height / 2;

    const transform: ViewportTransform = { scale: 2, translateX: 50, translateY: -30 };
    const screenX = worldCenterX * 2 + 50;
    const screenY = worldCenterY * 2 - 30;

    // Rect w screen-space (kamera oddalona/przesunięta) — punkt WORLD ten sam,
    // ale rect musi być zbudowany wokół pozycji EKRANOWEJ, nie world.
    const hitsAtScreenPos = symbolsInLassoRect(scene, rectAround(screenX, screenY, 4), transform);
    expect(hitsAtScreenPos.some((h) => h.ownerRef === target!.meta!.ownerRef)).toBe(true);

    // Ten sam rect (world-space współrzędne) pod IDENTITY_TRANSFORM nie trafia
    // (bo world center ≠ screen center po transformacji) — dowód, że funkcja
    // faktycznie stosuje `transform`, nie ignoruje go.
    const hitsIgnoringTransform = symbolsInLassoRect(scene, rectAround(worldCenterX, worldCenterY, 4), transform);
    expect(hitsIgnoringTransform.some((h) => h.ownerRef === target!.meta!.ownerRef)).toBe(false);
  });
});
