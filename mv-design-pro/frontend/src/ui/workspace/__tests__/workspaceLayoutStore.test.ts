/**
 * WorkspaceLayoutStore (R55) — testy jednostkowe.
 *
 * Weryfikuje:
 * - Domyślny stan initializacji
 * - Akcje setLeftCollapsed / setRightCollapsed
 * - Akcje setLeftWidth / setRightWidth (z klampingiem)
 * - Akcję setSldViewport (z klampingiem zoom)
 * - Akcję toggleLeftSection
 * - Akcję resetLayout
 * - Invarianty: leftWidth ∈ [220, 480], rightWidth ∈ [280, 760], zoom ∈ [0.1, 8.0]
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceLayoutStore } from '../workspaceLayoutStore';

function getState() {
  return useWorkspaceLayoutStore.getState();
}

describe('WorkspaceLayoutStore — inicjalizacja', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('ma domyślne wartości po inicjalizacji', () => {
    const s = getState();
    expect(s.leftCollapsed).toBe(false);
    expect(s.rightCollapsed).toBe(false);
    expect(s.leftWidth).toBe(280);
    expect(s.rightWidth).toBe(360);
    expect(s.sldViewport).toEqual({ x: 0, y: 0, zoom: 1.0 });
    expect(s.activeWorkflowStep).toBe('');
    expect(s.expandedLeftSections).toEqual({});
    expect(s.selectedElementId).toBeNull();
  });
});

describe('WorkspaceLayoutStore — panel collapsed', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('setLeftCollapsed(true) zwija lewy panel', () => {
    getState().setLeftCollapsed(true);
    expect(getState().leftCollapsed).toBe(true);
  });

  it('setRightCollapsed(true) zwija prawy panel', () => {
    getState().setRightCollapsed(true);
    expect(getState().rightCollapsed).toBe(true);
  });

  it('setLeftCollapsed(false) rozija lewy panel', () => {
    getState().setLeftCollapsed(true);
    getState().setLeftCollapsed(false);
    expect(getState().leftCollapsed).toBe(false);
  });

  it('setRightCollapsed(false) rozija prawy panel', () => {
    getState().setRightCollapsed(true);
    getState().setRightCollapsed(false);
    expect(getState().rightCollapsed).toBe(false);
  });
});

describe('WorkspaceLayoutStore — width clamping', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('setLeftWidth klampuje do [220, 480]', () => {
    getState().setLeftWidth(100);
    expect(getState().leftWidth).toBe(220);

    getState().setLeftWidth(9999);
    expect(getState().leftWidth).toBe(480);

    getState().setLeftWidth(350);
    expect(getState().leftWidth).toBe(350);
  });

  it('setRightWidth klampuje do [280, 760]', () => {
    getState().setRightWidth(0);
    expect(getState().rightWidth).toBe(280);

    getState().setRightWidth(9999);
    expect(getState().rightWidth).toBe(760);

    getState().setRightWidth(500);
    expect(getState().rightWidth).toBe(500);
  });

  it('setLeftWidth na granicy min jest dopuszczalne (220)', () => {
    getState().setLeftWidth(220);
    expect(getState().leftWidth).toBe(220);
  });

  it('setLeftWidth na granicy max jest dopuszczalne (480)', () => {
    getState().setLeftWidth(480);
    expect(getState().leftWidth).toBe(480);
  });
});

describe('WorkspaceLayoutStore — sldViewport', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('setSldViewport aktualizuje x/y/zoom', () => {
    getState().setSldViewport({ x: 100, y: 200, zoom: 2.5 });
    expect(getState().sldViewport).toEqual({ x: 100, y: 200, zoom: 2.5 });
  });

  it('setSldViewport aktualizuje tylko podane pola (partial update)', () => {
    getState().setSldViewport({ x: 50 });
    const s = getState().sldViewport;
    expect(s.x).toBe(50);
    expect(s.y).toBe(0);  // domyślna
    expect(s.zoom).toBe(1.0);  // domyślna
  });

  it('setSldViewport klampuje zoom do [0.1, 8.0]', () => {
    getState().setSldViewport({ zoom: 0.001 });
    expect(getState().sldViewport.zoom).toBe(0.1);

    getState().setSldViewport({ zoom: 99 });
    expect(getState().sldViewport.zoom).toBe(8.0);
  });

  it('setSldViewport zoom na granicy 0.1 jest akceptowane', () => {
    getState().setSldViewport({ zoom: 0.1 });
    expect(getState().sldViewport.zoom).toBe(0.1);
  });

  it('setSldViewport zoom na granicy 8.0 jest akceptowane', () => {
    getState().setSldViewport({ zoom: 8.0 });
    expect(getState().sldViewport.zoom).toBe(8.0);
  });
});

describe('WorkspaceLayoutStore — expandedLeftSections', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('toggleLeftSection otwiera sekcję gdy była zamknięta', () => {
    getState().toggleLeftSection('model-sieci');
    expect(getState().expandedLeftSections['model-sieci']).toBe(true);
  });

  it('toggleLeftSection zamyka sekcję gdy była otwarta', () => {
    getState().toggleLeftSection('model-sieci');
    getState().toggleLeftSection('model-sieci');
    expect(getState().expandedLeftSections['model-sieci']).toBe(false);
  });

  it('setExpandedLeftSections zastępuje cały obiekt', () => {
    getState().setExpandedLeftSections({ 'a': true, 'b': false });
    expect(getState().expandedLeftSections).toEqual({ 'a': true, 'b': false });
  });
});

describe('WorkspaceLayoutStore — selectedElementId', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('setSelectedElementId ustawia id', () => {
    getState().setSelectedElementId('bus-001');
    expect(getState().selectedElementId).toBe('bus-001');
  });

  it('setSelectedElementId(null) kasuje zaznaczenie', () => {
    getState().setSelectedElementId('bus-001');
    getState().setSelectedElementId(null);
    expect(getState().selectedElementId).toBeNull();
  });
});

describe('WorkspaceLayoutStore — resetLayout', () => {
  it('resetLayout przywraca domyślny stan po zmianach', () => {
    const s = getState();
    s.setLeftCollapsed(true);
    s.setRightWidth(600);
    s.setSldViewport({ zoom: 3.0 });
    s.setSelectedElementId('some-id');
    s.toggleLeftSection('abc');

    s.resetLayout();

    const after = getState();
    expect(after.leftCollapsed).toBe(false);
    expect(after.rightWidth).toBe(360);
    expect(after.sldViewport).toEqual({ x: 0, y: 0, zoom: 1.0 });
    expect(after.selectedElementId).toBeNull();
    expect(after.expandedLeftSections).toEqual({});
  });
});

describe('WorkspaceLayoutStore — activeWorkflowStep', () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.getState().resetLayout();
  });

  it('setActiveWorkflowStep aktualizuje krok', () => {
    getState().setActiveWorkflowStep('E-13');
    expect(getState().activeWorkflowStep).toBe('E-13');
  });

  it('setActiveWorkflowStep pusty string czyści', () => {
    getState().setActiveWorkflowStep('E-13');
    getState().setActiveWorkflowStep('');
    expect(getState().activeWorkflowStep).toBe('');
  });
});
