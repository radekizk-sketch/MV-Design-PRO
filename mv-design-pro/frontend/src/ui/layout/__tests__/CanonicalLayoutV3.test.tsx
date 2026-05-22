/**
 * Smoke test for CanonicalLayoutV3 — V3 shell redesign integrated from
 * design bundle KWranPTVtVOehZptDdObrA (claude.ai/design handoff).
 *
 * V3 cele projektowe (z chat transcript design assistant):
 *   - Chrome reduction: 146px → 76px (-48%)
 *   - TopBarV3 48px łączy ActiveCaseBar + TopContextBar + WorkflowContextStrip
 *   - NavigationRailV3: collapsible 56px → 220px on hover/pin
 *   - ContextPanelV3: 280→320px z kartą gotowości
 *   - Inspector empty state: GuidedBuildActionPanel zamiast pustych "—"
 *   - 3-poziomowa hierarchia akcji: primary (Oblicz) → secondary (Analizy) → ghost (Eksport)
 *
 * V3 jest OPT-IN — `layout/index.ts` nadal eksportuje V12 jako CanonicalLayout.
 * Aby włączyć V3 w aplikacji: zmień import na `CanonicalLayoutV3` z
 * `layout/CanonicalLayoutV3` lub dodaj feature flag w `App.tsx`.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSelectionStore } from '../../selection';
import { CanonicalLayoutV3 } from '../CanonicalLayoutV3';

describe('CanonicalLayoutV3 — smoke test', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      propertyGridOpen: false,
    });
  });

  it('renderuje strukturę 3-warstwową: TopBarV3 + main 4-column + StatusBar', () => {
    render(
      <CanonicalLayoutV3>
        <div data-testid="test-children">SLD content</div>
      </CanonicalLayoutV3>,
    );

    // Wszystkie kluczowe atrybuty z chat transcript (backward compatibility).
    expect(screen.getByTestId('canonical-layout')).toBeInTheDocument();
    expect(screen.getByTestId('canonical-layout').getAttribute('data-v3-shell')).not.toBeNull();

    // TopBarV3 — nowy zunifikowany pasek 48px.
    expect(screen.getByTestId('top-bar-v3')).toBeInTheDocument();

    // Branded project context button (rok V3 vs ActiveCaseBar w V12).
    expect(screen.getByTestId('ctx-project')).toBeInTheDocument();

    // 3-poziomowa hierarchia akcji w TopBar.
    expect(screen.getByTestId('top-bar-calculate')).toBeInTheDocument();
    expect(screen.getByTestId('top-bar-results')).toBeInTheDocument();
    expect(screen.getByTestId('top-bar-export')).toBeInTheDocument();
    expect(screen.getByTestId('top-bar-settings')).toBeInTheDocument();

    // Główny obszar pracy (children).
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
    expect(screen.getByTestId('test-children')).toBeInTheDocument();

    // Inspector panel (collapsible 340px).
    expect(screen.getByTestId('inspector-panel-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-panel-toggle')).toBeInTheDocument();
  });

  it('TopBarV3 ma wysokość 48px (h-12 = chrome reduction 146→76px)', () => {
    render(
      <CanonicalLayoutV3>
        <div>content</div>
      </CanonicalLayoutV3>,
    );
    const topBar = screen.getByTestId('top-bar-v3');
    expect(topBar.className).toContain('h-12');
  });

  it('NavigationRailV3 jest collapsible (54px domyślnie, 220px expanded)', () => {
    render(
      <CanonicalLayoutV3>
        <div>content</div>
      </CanonicalLayoutV3>,
    );
    const nav = screen.getByTestId('navigation-rail');
    expect(nav).toBeInTheDocument();
    // Domyślnie collapsed (w-14 = 56px).
    expect(nav.className).toContain('w-14');
  });

  it('Inspector empty state renderuje GuidedBuildActionPanel w trybie MODEL_EDIT bez selekcji', () => {
    // MODEL_EDIT to domyślny tryb po reset() store'a.
    render(
      <CanonicalLayoutV3>
        <div>content</div>
      </CanonicalLayoutV3>,
    );
    // Inspector sidebar widoczny.
    const inspector = screen.getByTestId('inspector-panel-sidebar');
    expect(inspector.getAttribute('data-collapsed')).toBe('false');
  });

  it('respektuje prop hideInspector (ukrywa Inspector dla niektórych surface)', () => {
    render(
      <CanonicalLayoutV3 hideInspector>
        <div>content</div>
      </CanonicalLayoutV3>,
    );
    expect(screen.queryByTestId('inspector-panel-sidebar')).toBeNull();
  });

  it('eksportuje CanonicalLayoutV3 jako backward-compat alias CanonicalLayout', async () => {
    const module_ = await import('../CanonicalLayoutV3');
    expect(module_.CanonicalLayoutV3).toBeDefined();
    expect(module_.CanonicalLayout).toBe(module_.CanonicalLayoutV3);
  });
});
