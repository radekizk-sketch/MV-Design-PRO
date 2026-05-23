/**
 * Projects module exports.
 */
export * from './api';
export {
  RecentProjectsCard,
  loadRecentProjects,
  saveRecentProject,
  clearRecentProjects,
} from './RecentProjectsCard';
export type { RecentProject } from './RecentProjectsCard';
export {
  validateProjectMetadata,
  describePhase,
  listPhases,
  PROJECT_PHASES,
} from './projectMetadataValidator';
export type {
  ProjectMetadata,
  ProjectPhase,
  ProjectMetadataValidation,
} from './projectMetadataValidator';
