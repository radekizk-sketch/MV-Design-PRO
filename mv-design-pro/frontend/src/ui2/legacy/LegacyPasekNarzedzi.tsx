/**
 * LegacyPasekNarzedzi (karta E1.7c) — pasek przepływu pracy PRZENIESIONY
 * z AppShellV12 (kasacja starej ramy) wraz z modalami, których funkcje
 * musi zachować nowa powłoka (zero utraty funkcji):
 * - WorkflowContextStrip (faza projektu, kontrola techniczna, następny krok),
 * - GlobalSearch (wyszukiwanie w modelu sieci),
 * - MassReviewPanel (przegląd zbiorczy / gotowość),
 * - ProjectMetadataModal (metadane projektu + zapis do API),
 * - historia wersji układu (powierzchnia E-09).
 *
 * Jak w starej ramie: pasek renderuje się wyłącznie w trybie edycji modelu.
 */

import { useCallback, useState } from 'react';

import { useActiveMode } from '../../ui/app-state';
import { useAppStateStore } from '../../ui/app-state/store';
import { WorkflowContextStrip } from '../../ui/shell/WorkflowContextStrip';
import { GlobalSearch } from '../../ui/network-build/GlobalSearch';
import { MassReviewPanel } from '../../ui/network-build/mass-review';
import { ProjectMetadataModal } from '../../ui/network-build/ProjectMetadataModal';
import type { ProjectMetadata } from '../../ui/network-build/ProjectMetadataModal';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { navigateToCatalog } from '../../ui/navigation/routes';
import { updateProject } from '../../ui/projects/api';
import { notify } from '../../ui/notifications/store';

export function LegacyPasekNarzedzi() {
  const activeMode = useActiveMode();
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const setActiveProject = useAppStateStore((s) => s.setActiveProject);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [massReviewOpen, setMassReviewOpen] = useState(false);
  const [projectMetadataOpen, setProjectMetadataOpen] = useState(false);

  const handleProjectMetadataSave = useCallback(
    async (metadata: ProjectMetadata) => {
      if (!activeProjectId) {
        const message = 'Wybierz projekt przed zapisem metadanych.';
        notify(message, 'warning');
        throw new Error(message);
      }
      try {
        const updated = await updateProject(activeProjectId, {
          name: metadata.projectName.trim(),
          description: metadata.description.trim() || null,
        });
        setActiveProject(updated.id, updated.name);
        notify(`Zapisano metadane projektu "${updated.name}".`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nie udało się zapisać metadanych projektu.';
        notify(message, 'error');
        throw error;
      }
    },
    [activeProjectId, setActiveProject],
  );

  if (activeMode !== 'MODEL_EDIT') {
    return null;
  }

  return (
    <>
      <WorkflowContextStrip
        onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
        onOpenCatalogBrowser={navigateToCatalog}
        onOpenMassReview={() => setMassReviewOpen(true)}
        onOpenProjectMetadata={() => setProjectMetadataOpen(true)}
        onOpenSnapshotHistory={() => openRouteSurface('E-09', {
          titlePl: 'Historia i audyt',
          entityRef: null,
          subjectKind: 'analysis_run',
          subjectRef: null,
        })}
      />
      <GlobalSearch isOpen={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      <MassReviewPanel isOpen={massReviewOpen} onClose={() => setMassReviewOpen(false)} initialTab="readiness" />
      <ProjectMetadataModal
        isOpen={projectMetadataOpen}
        onClose={() => setProjectMetadataOpen(false)}
        metadata={{ projectName: activeProjectName?.trim() ? activeProjectName : '' }}
        onSave={handleProjectMetadataSave}
      />
    </>
  );
}
