/**
 * NetworkHierarchyTree — Iter 11 (per Projektant SN/WN audit blocker iter 3: 4.5/10 NO-GO):
 * "Hierarchia GPZ→Sekcja→Pole nie jest renderowana jako drzewo (brak tree-view;
 *  tylko płaski tekst kroków)"
 *
 * Pure presentational komponent renderujący hierarchię z buildHierarchy(enm)
 * jako collapsible tree-view (Polish labels 100%). Dla operatora SN/WN
 * podobny do PowerFactory data manager.
 *
 * INVARIANTS:
 * - Pure component (state visibility lokalny, no model mutation)
 * - NO physics, NO solver calls
 * - Polski 100%, zero codename'ów
 * - Deterministic ordering (per buildHierarchy sortowanie)
 *
 * Reference:
 * - frontend/src/ui/sld/v2/domain/HierarchyTree.ts (foundation buildHierarchy)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 4.2 (GPZ→Sekcja→Pole hierarchia)
 */

import { useState } from 'react';

import type { Bay, Gpz, Hierarchy, Section } from './HierarchyTree';

export interface NetworkHierarchyTreeProps {
  /** Wynik buildHierarchy(enm). */
  readonly hierarchy: Hierarchy;
  /** Optional callback gdy użytkownik kliknie node. */
  readonly onSelectNode?: (kind: 'gpz' | 'section' | 'bay', id: string) => void;
  /** Optional className zewnętrzny. */
  readonly className?: string;
}

/**
 * Tree-view hierarchii sieci (GPZ → Sekcja → Pole + CableRuns + DER).
 *
 * Layout:
 *   ▼ GPZ <name> (110/15 kV, Sk3=4000 MVA)
 *      ▼ Sekcja 1 (15 kV)
 *         • Pole Q01 (OUT)
 *         • Pole Q02 (IN)
 *      ▼ Sekcja 2 (15 kV)
 *         • ...
 *   ▼ Ciągi liniowe (3)
 *      • Run_1 — main_trunk (2 stacje)
 *   ▼ Źródła OZE (2)
 *      • PV-01 (PV)
 *      • BESS-01 (BESS)
 */
export function NetworkHierarchyTree({
  hierarchy,
  onSelectNode,
  className,
}: NetworkHierarchyTreeProps) {
  return (
    <section
      className={[
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-panel/95 p-2 text-[11px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Drzewo hierarchii sieci elektroenergetycznej"
      data-testid="sld-network-hierarchy-tree"
    >
      <header className="border-b border-scada-border pb-1">
        <span className="font-semibold uppercase tracking-wider text-scada-muted">
          Drzewo modelu sieci
        </span>
      </header>

      {hierarchy.gpz.length === 0 ? (
        <div
          className="px-1 py-2 text-center text-scada-muted"
          data-testid="sld-hierarchy-empty"
        >
          Brak modelu sieci — dodaj GPZ.
        </div>
      ) : (
        <ul className="flex flex-col gap-px">
          {hierarchy.gpz.map((gpz) => (
            <GpzNode key={gpz.id} gpz={gpz} onSelectNode={onSelectNode} />
          ))}
        </ul>
      )}

      {hierarchy.cableRuns.length > 0 && (
        <details
          className="mt-1 border-t border-scada-border pt-1"
          data-testid="sld-hierarchy-cable-runs"
        >
          <summary className="cursor-pointer font-semibold text-scada-text">
            Ciągi liniowe ({hierarchy.cableRuns.length})
          </summary>
          <ul className="ml-3 mt-1 flex flex-col gap-px">
            {hierarchy.cableRuns.map((run) => (
              <li key={run.id} className="text-scada-muted">
                • {run.name ?? run.id} ({run.runKind}, {run.stations.length} st.)
              </li>
            ))}
          </ul>
        </details>
      )}

      {hierarchy.derAttachments.length > 0 && (
        <details
          className="border-t border-scada-border pt-1"
          data-testid="sld-hierarchy-der"
        >
          <summary className="cursor-pointer font-semibold text-scada-text">
            Źródła OZE ({hierarchy.derAttachments.length})
          </summary>
          <ul className="ml-3 mt-1 flex flex-col gap-px">
            {hierarchy.derAttachments.map((der) => (
              <li key={der.id} className="text-scada-muted">
                • {der.name} ({der.kind})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function GpzNode({
  gpz,
  onSelectNode,
}: {
  gpz: Gpz;
  onSelectNode?: NetworkHierarchyTreeProps['onSelectNode'];
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => onSelectNode?.('gpz', gpz.id)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-scada-hover-nav"
        aria-expanded={open}
        data-testid={`sld-hierarchy-gpz-${gpz.id}`}
      >
        <span className="font-mono-eng text-[10px] text-scada-muted">
          {open ? '▼' : '▶'}
        </span>
        <span className="font-semibold">{gpz.name}</span>
        <span className="ml-auto font-mono-eng text-[10px] text-scada-muted">
          {gpz.voltageHighKv}/{gpz.voltageLowKv} kV
        </span>
      </button>
      {open && (
        <ul className="ml-3 flex flex-col gap-px">
          {gpz.sections.map((section) => (
            <SectionNode
              key={section.id}
              section={section}
              onSelectNode={onSelectNode}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SectionNode({
  section,
  onSelectNode,
}: {
  section: Section;
  onSelectNode?: NetworkHierarchyTreeProps['onSelectNode'];
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => onSelectNode?.('section', section.id)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-scada-hover-nav"
        aria-expanded={open}
        data-testid={`sld-hierarchy-section-${section.id}`}
      >
        <span className="font-mono-eng text-[10px] text-scada-muted">
          {open ? '▼' : '▶'}
        </span>
        <span>Sekcja {section.number}</span>
        <span className="ml-auto font-mono-eng text-[10px] text-scada-muted">
          {section.busVoltageKv} kV
        </span>
      </button>
      {open && (
        <ul className="ml-3 flex flex-col gap-px">
          {section.bays.map((bay) => (
            <BayNode key={bay.id} bay={bay} onSelectNode={onSelectNode} />
          ))}
        </ul>
      )}
    </li>
  );
}

function BayNode({
  bay,
  onSelectNode,
}: {
  bay: Bay;
  onSelectNode?: NetworkHierarchyTreeProps['onSelectNode'];
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectNode?.('bay', bay.id)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text"
        data-testid={`sld-hierarchy-bay-${bay.id}`}
      >
        <span className="font-mono-eng text-[10px]">•</span>
        <span>Pole {bay.designation}</span>
        <span className="ml-auto font-mono-eng text-[9px]">{bay.bayRole}</span>
      </button>
    </li>
  );
}
