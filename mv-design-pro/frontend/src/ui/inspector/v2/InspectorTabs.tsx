/**
 * InspectorTabs v2 — composition root inspectora z 11 zakładkami (PR-7).
 *
 * Brief 2 §5 — sticky header + breadcrumb dwukierunkowy + 11 tabs + walidacja inline.
 */

import { useState, useMemo } from 'react';

import {
  type ElementTypeForInspector,
  type InspectorTabId,
  visibleTabsFor,
} from './inspectorTabs';
import { InspectorStickyHeader, type StickyHeaderProps } from './InspectorStickyHeader';
import { InspectorBreadcrumb, type BreadcrumbItem } from './InspectorBreadcrumb';

export interface InspectorTabsProps {
  /** Typ wybranego obiektu (steruje widocznością zakładek). */
  readonly elementType: ElementTypeForInspector;
  /** Header sticky props. */
  readonly headerProps: StickyHeaderProps;
  /** Breadcrumb (Projekt > GPZ > ... > obiekt). */
  readonly breadcrumb: readonly BreadcrumbItem[];
  /** Mapa kontentu zakładek per ID. */
  readonly tabContent: Partial<Record<InspectorTabId, React.ReactNode>>;
  /** Default aktywna zakładka. */
  readonly defaultTab?: InspectorTabId;
  readonly onTabChange?: (tab: InspectorTabId) => void;
}

export function InspectorTabs(props: InspectorTabsProps): JSX.Element {
  const { elementType, headerProps, breadcrumb, tabContent, defaultTab, onTabChange } = props;
  const visibleTabs = useMemo(() => visibleTabsFor(elementType), [elementType]);

  const [activeTab, setActiveTab] = useState<InspectorTabId>(
    defaultTab ?? visibleTabs[0]?.id ?? 'podstawowe',
  );

  const handleTabClick = (tab: InspectorTabId) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <div
      data-testid="inspector-tabs-v2"
      data-element-type={elementType}
      className="flex h-full flex-col bg-scada-panel"
    >
      {/* Sticky header */}
      <InspectorStickyHeader {...headerProps} />

      {/* Breadcrumb (dwukierunkowy) */}
      <InspectorBreadcrumb items={breadcrumb} />

      {/* Tabs nav */}
      <div
        data-testid="inspector-tabs-nav"
        className="flex shrink-0 overflow-x-auto border-b border-scada-border bg-scada-surface"
        role="tablist"
        aria-label="Zakładki inspektora"
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`inspector-tab-${tab.id}`}
            data-active={activeTab === tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={
              'whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors '
              + (activeTab === tab.id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {tab.labelPl}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        data-testid={`inspector-tab-content-${activeTab}`}
        role="tabpanel"
        className="flex-1 overflow-y-auto p-3"
      >
        {tabContent[activeTab] ?? (
          <div className="text-sm text-scada-muted italic">
            Brak danych do wyświetlenia w tej zakładce.
          </div>
        )}
      </div>
    </div>
  );
}
