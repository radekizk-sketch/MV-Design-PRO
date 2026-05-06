/**
 * BuildSidebar — lewy panel z 4 sekcjami (PR-13).
 *
 * Brief 2 §4 + brief 1 §13 (Dock projektanta).
 * Sekcje: Nawigator modelu / Budowa sieci / Warstwy / Gotowość obliczeń.
 */

import { useState } from 'react';

import { BuilderSection, type BuilderSectionProps } from './BuilderSection';
import { LayersSection, type LayersSectionProps } from './LayersSection';
import { NavigatorSection, type NavigatorSectionProps } from './NavigatorSection';
import { ReadinessSection, type ReadinessSectionProps } from './ReadinessSection';

export type BuildSidebarTabId = 'nawigator' | 'budowa' | 'warstwy' | 'gotowosc';

export interface BuildSidebarProps {
  readonly navigator: NavigatorSectionProps;
  readonly builder: BuilderSectionProps;
  readonly layers: LayersSectionProps;
  readonly readiness: ReadinessSectionProps;
  readonly defaultTab?: BuildSidebarTabId;
}

const TAB_LABELS: Record<BuildSidebarTabId, string> = {
  nawigator: 'Nawigator',
  budowa: 'Budowa',
  warstwy: 'Warstwy',
  gotowosc: 'Gotowość',
};

export function BuildSidebar(props: BuildSidebarProps): JSX.Element {
  const { navigator, builder, layers, readiness, defaultTab = 'nawigator' } = props;
  const [activeTab, setActiveTab] = useState<BuildSidebarTabId>(defaultTab);

  return (
    <aside
      data-testid="build-sidebar"
      className="flex h-full flex-col bg-scada-panel"
    >
      <div
        data-testid="build-sidebar-tabs"
        role="tablist"
        aria-label="Sekcje budowy modelu"
        className="flex shrink-0 border-b border-scada-border bg-scada-surface"
      >
        {(Object.keys(TAB_LABELS) as BuildSidebarTabId[]).map((tab) => (
          <button
            key={tab}
            data-testid={`build-sidebar-tab-${tab}`}
            data-active={activeTab === tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={
              'flex-1 px-2 py-2 text-xs font-medium transition-colors '
              + (activeTab === tab
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        data-testid={`build-sidebar-content-${activeTab}`}
        className="flex-1 overflow-y-auto"
      >
        {activeTab === 'nawigator' && <NavigatorSection {...navigator} />}
        {activeTab === 'budowa' && <BuilderSection {...builder} />}
        {activeTab === 'warstwy' && <LayersSection {...layers} />}
        {activeTab === 'gotowosc' && <ReadinessSection {...readiness} />}
      </div>
    </aside>
  );
}
