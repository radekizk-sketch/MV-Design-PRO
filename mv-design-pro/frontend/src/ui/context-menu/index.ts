/**
 * Context Menu module exports.
 *
 * K5-A: martwa ścieżka menu (EngineeringContextMenu + actionMenuBuilders +
 * actionRouting + catalogGate) USUNIĘTA — jedyna żywa ścieżka menu SLD to
 * SLD_MENU_REGISTRY (`sld/v2/command/SldCommandService`) renderowany przez
 * `SldContextMenuController` z wykonawcą `sld/shared/sldActionExecutor`.
 * Zdolność bramki katalogowej żyje w `ui/catalog/elementCatalogRegistry`
 * (`requiresCatalogBinding`) — patrz `useCatalogAssignment`.
 */
export { ContextMenu } from './ContextMenu';

export {
  buildContextMenuActions,
  buildBusContextMenu,
  buildNetworkModelContextMenu,
  getContextMenuHeader,
} from './actions';
