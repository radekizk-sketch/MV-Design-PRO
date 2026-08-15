/**
 * KARTA S9-10 — spłata długu `S9-4-DLUG-INSPEKTOR`: klik w aparat niesie ref
 * POJEDYNCZEGO urządzenia (`SldElementClickMeta.deviceRef`), a inspektor
 * (szuflada szczegółów) pokazuje TEN aparat — dwa aparaty jednego pola
 * przestają dawać jedną treść (audyt P-2: „inspektor pokazał jeden i ten sam
 * opis na 8 klików w różne obiekty").
 *
 * Zero-Debt pkt 5: kliki NATYWNE (`userEvent`, pełna sekwencja pointer/
 * mouse/click) w węzeł warstwy trafień — ten sam węzeł, który w przeglądarce
 * faktycznie łapie zdarzenie. Iloczyn cech: {dwa aparaty JEDNEGO pola} ×
 * {kanwa → meta kliku, warstwa trafień → atrybut audytu, Workspace →
 * treść inspektora}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { buildW1MatrixFixture } from '../../scene/__tests__/fixtures/w1MatrixVariants';
import { HIT_ATTR } from '../hitAreas';
import { SldCanvasV3 } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

const here = dirname(fileURLToPath(import.meta.url));
const gpzDataPathEnm = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'gpzProtectionDataPath.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const substrateEnm = (
  JSON.parse(
    readFileSync(
      resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
      'utf8',
    ),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

afterEach(() => cleanup());
beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
});

/** Para aparatów JEDNEGO pola z RÓŻNYMI `deviceRef` — cecha, w której defekt
 *  się chował (wspólny `ownerRef`, przed S9-10 również wspólna treść). */
function paraAparatowJednegoPola(scene: SceneV3) {
  const wgPola = new Map<string, { testId: string; deviceRef: string }[]>();
  for (const s of scene.symbols) {
    if (s.meta?.elementKind !== 'apparatus' || !s.meta.deviceRef || !s.meta.testId || !s.meta.ownerRef) continue;
    const lista = wgPola.get(s.meta.ownerRef) ?? [];
    lista.push({ testId: s.meta.testId, deviceRef: s.meta.deviceRef });
    wgPola.set(s.meta.ownerRef, lista);
  }
  for (const [pole, aparaty] of wgPola) {
    const rozne = aparaty.filter((a, i) => aparaty.findIndex((b) => b.deviceRef === a.deviceRef) === i);
    if (rozne.length >= 2) return { pole, a: rozne[0], b: rozne[1] };
  }
  return null;
}

function uchwytObrysu(container: HTMLElement, testId: string): Element {
  const wezel = container.querySelector(`[${HIT_ATTR.for}="${CSS.escape(testId)}"][${HIT_ATTR.role}="obrys"]`);
  expect(wezel, `uchwyt obrysu ${testId}`).toBeTruthy();
  return wezel!;
}

describe('S9-10 — klik w aparat niesie deviceRef (kanwa)', () => {
  it('dwa aparaty JEDNEGO pola: kliki natywne niosą RÓŻNE deviceRef przy wspólnym ownerRef', async () => {
    const { enm } = buildW1MatrixFixture();
    const scene = buildSceneV3(enm, 2);
    const para = paraAparatowJednegoPola(scene);
    expect(para, 'fixtura W1 ma pole z ≥ 2 różnymi refami aparatów').toBeTruthy();

    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={1322} height={696} lodOverride={2} onElementClick={onElementClick} />,
    );

    await user.click(uchwytObrysu(container, para!.a.testId));
    await user.click(uchwytObrysu(container, para!.b.testId));

    expect(onElementClick).toHaveBeenCalledTimes(2);
    const [metaA, metaB] = [onElementClick.mock.calls[0][1], onElementClick.mock.calls[1][1]];
    expect(metaA.ownerRef).toBe(para!.pole);
    expect(metaB.ownerRef).toBe(para!.pole);
    expect(metaA.deviceRef).toBe(para!.a.deviceRef);
    expect(metaB.deviceRef).toBe(para!.b.deviceRef);
    expect(metaA.deviceRef).not.toBe(metaB.deviceRef);
  });

  it('warstwa trafień niesie atrybut audytu data-hit-device-ref (weryfikacja w WYRENDEROWANYM drzewie)', () => {
    const { enm } = buildW1MatrixFixture();
    const scene = buildSceneV3(enm, 2);
    const para = paraAparatowJednegoPola(scene);
    expect(para).toBeTruthy();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={1322} height={696} lodOverride={2} onElementClick={() => {}} />,
    );
    expect(uchwytObrysu(container, para!.a.testId).getAttribute(HIT_ATTR.deviceRef)).toBe(para!.a.deviceRef);
    expect(uchwytObrysu(container, para!.b.testId).getAttribute(HIT_ATTR.deviceRef)).toBe(para!.b.deviceRef);
  });

  it('GPZ (ta sama klasa, druga kompozycja): klik w aparat pola GPZ niesie deviceRef', async () => {
    const scene = buildSceneV3(gpzDataPathEnm, 2);
    const aparat = scene.symbols.find(
      (s) => s.meta?.elementKind === 'apparatus' && s.meta.deviceRef && s.meta.testId,
    );
    expect(aparat, 'scena GPZ ścieżki danych ma aparat z deviceRef').toBeTruthy();
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3
        snapshot={gpzDataPathEnm}
        width={1322}
        height={696}
        lodOverride={2}
        onElementClick={onElementClick}
      />,
    );
    await user.click(uchwytObrysu(container, aparat!.meta!.testId!));
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick.mock.calls[0][1].deviceRef).toBe(aparat!.meta!.deviceRef);
  });
});

describe('S9-10 — inspektor pokazuje KLIKNIĘTY aparat (Workspace, realna ścieżka)', () => {
  it('dwa aparaty jednego pola dają DWIE RÓŻNE treści szuflady (przed S9-10: jedna)', async () => {
    const { enm } = buildW1MatrixFixture();
    const scene = buildSceneV3(enm, 2);
    const para = paraAparatowJednegoPola(scene);
    expect(para).toBeTruthy();

    useSnapshotStore.setState({ snapshot: enm });
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1322} height={696} lodOverride={2} />);

    const trescSzuflady = (): string => {
      const label = container.querySelector('[data-testid="sld-v2-detail-drawer-label"]');
      expect(label, 'szuflada szczegółów otwarta po kliku w aparat').toBeTruthy();
      return label!.textContent ?? '';
    };

    await user.click(uchwytObrysu(container, para!.a.testId));
    const trescA = trescSzuflady();
    await user.click(uchwytObrysu(container, para!.b.testId));
    const trescB = trescSzuflady();

    // Etykieta szuflady pochodzi z refu URZĄDZENIA (ogon refu), więc dwa
    // aparaty jednego pola MUSZĄ dać różne treści — dokładnie ta
    // rozróżnialność, której audyt P-2 nie zastał.
    expect(trescA).not.toBe(trescB);
    expect(trescA).toContain(para!.a.deviceRef.split('/').pop()!);
    expect(trescB).toContain(para!.b.deviceRef.split('/').pop()!);
  });
});

describe('S9-10 — klik w ETYKIETĘ otwiera panel właściciela (drugie ogniwo długu S9-4-DLUG-INSPEKTOR)', () => {
  /**
   * Rejestr (dług S9-4-DLUG-INSPEKTOR): „wszystkie 1137 etykiet niesie ref
   * KOMPOZYTOWY (…#name-row-N itd.) — budowniczy panelu szczegółów nie
   * rozwiązuje kompozytu i panel się NIE OTWIERA". Pomiar S9-10 potwierdził
   * (klik w etykietę nazwy stacji → drawer null). Naprawa: kotwicę modelu
   * rozstrzyga TEN SAM moduł co menu kontekstowe (`resolveCanvasMenuSubject`,
   * jedno źródło prawdy) — ślepe zdejmowanie sufiksu byłoby fabrykacją
   * (podpis przęsła kotwiczy się na STACJI, nie na opisywanym odcinku).
   * Iloczyn cech: {właściciel etykiety: stacja, aparat} × {klik natywny}.
   */
  it('etykieta NAZWY STACJI (ref kompozytowy #name-row) otwiera szufladę z treścią stacji', async () => {
    useSnapshotStore.setState({ snapshot: substrateEnm });
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1322} height={696} lodOverride={2} />);
    const etykieta = container.querySelector(
      `[${HIT_ATTR.role}="obrys"][${HIT_ATTR.klasa}="etykieta"][${HIT_ATTR.ownerRef}*="#name-row"]`,
    );
    expect(etykieta, 'kanwa ma uchwyt etykiety nazwy stacji').toBeTruthy();
    const wlascicielRef = (etykieta!.getAttribute(HIT_ATTR.ownerRef) ?? '').split('#')[0];
    await user.click(etykieta!);
    const label = container.querySelector('[data-testid="sld-v2-detail-drawer-label"]');
    expect(label, 'szuflada otwarta po kliku w etykietę (przed S9-10: null)').toBeTruthy();
    // Treść należy do WŁAŚCICIELA etykiety — stacji o refie sprzed sufiksu
    // (nazwa stacji z modelu, nie ogon kompozytu).
    const stacja = (substrateEnm.substations ?? []).find(
      (s) => s.ref_id === wlascicielRef || s.id === wlascicielRef,
    );
    expect(stacja, 'właściciel etykiety istnieje w modelu').toBeTruthy();
    expect(label!.textContent ?? '').not.toBe('');
  });

  it('etykieta APARATU otwiera szufladę (kotwica pola z tematu menu, nie ślepy sufiks)', async () => {
    useSnapshotStore.setState({ snapshot: substrateEnm });
    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1322} height={696} lodOverride={2} />);
    // PROPORCJE (2026-08-07): kadr dopasowania sieci 53 stacji ma skalę 0,101 —
    // na takim oddaleniu oznaczniki aparatu NIE SĄ rysowane (sufit proporcji:
    // napis trzykrotnie wyższy od symbolu, który opisuje, byłby szyldem, nie
    // rysunkiem). Test sprawdza ROZWIĄZYWANIE KOTWICY etykiety aparatu, więc
    // musi stać na kadrze ROBOCZYM — projektant dojeżdża tam TAK SAMO jak w
    // aplikacji: natywnym kółkiem myszy (ścieżka realna, nie wymuszony stan).
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    for (let i = 0; i < 40; i += 1) {
      fireEvent.wheel(svg, { clientX: 1322 / 2, clientY: 696 / 2, deltaY: -140 });
    }
    // Etykieta, której temat menu kotwiczy się na POLU (aparat) — bierzemy
    // pierwszą etykietę o refie kompozytowym wskazującym pole sn_field.
    const etykieta = Array.from(
      container.querySelectorAll(`[${HIT_ATTR.role}="obrys"][${HIT_ATTR.klasa}="etykieta"]`),
    ).find((el) => (el.getAttribute(HIT_ATTR.ownerRef) ?? '').match(/\/sn_field\/\d+#/));
    expect(etykieta, 'kanwa ma etykietę zakotwiczoną w polu SN').toBeTruthy();
    await user.click(etykieta!);
    const label = container.querySelector('[data-testid="sld-v2-detail-drawer-label"]');
    expect(label, 'szuflada otwarta po kliku w etykietę aparatu').toBeTruthy();
  });
});
