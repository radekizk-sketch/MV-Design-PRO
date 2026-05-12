# SLD CAD Interaction Spec

**Status:** binding for SLD V2 editing interactions

## 1. CAD Modes

SLD supports these modes:

- review,
- network build,
- geometry edit,
- port edit,
- label edit,
- results analysis,
- anonymized view,
- diagnostics.

## 2. Required Interactions

Viewport:

- pan,
- zoom to cursor,
- fit to view,
- fit selected,
- center selected,
- zoom to feeder path,
- preserve viewport when side panels open or close.

Grid and snap:

- show/hide grid,
- snap to grid,
- snap to compatible port,
- snap to feeder corridor,
- snap to endpoint,
- zoom-aware tolerance,
- visual snap preview.

Routing:

- orthogonal route by default,
- add/remove bend point,
- lock route,
- switch auto/manual route,
- preserve locked route during auto-layout.

Ports:

- normal mode hides port clutter,
- selected/edit mode shows anchors,
- hover explains compatibility,
- incompatible target is visible but blocked.

## 3. Safe Topology Editing

Moving geometry must not silently change topology.

Allowed:

- move station and connected route anchors,
- move label without changing topology,
- move bend point without changing endpoints,
- lock route and label positions.

Destructive operations require a preview:

- remove station,
- split segment,
- replace object in segment,
- disconnect endpoint.

## 4. Menus

Field menu must open real actions for:

- wyprowadź ciąg główny,
- rozpocznij odgałęzienie,
- skonfiguruj aparaturę,
- skonfiguruj przekładniki,
- skonfiguruj zabezpieczenia,
- pokaż wyniki,
- pokaż uzasadnienie inżynierskie.

Segment menu must open real actions for:

- edytuj odcinek,
- wstaw stację,
- wstaw ZK SN,
- wstaw słup,
- wstaw łącznik sekcyjny,
- świadomy split,
- pokaż wyniki.

Disabled actions must show the reason.

## 5. Current Implementation Hook Points

- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
- `frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx`
- `frontend/src/ui/sld/v2/command/SldCommandService.ts`
- `frontend/src/ui/context-menu/SldContextMenuController.tsx`
- `frontend/src/ui/network-build/networkBuildStore.ts`

## 6. Test Requirements

- every visible menu item opens a surface, operation form, or disabled reason,
- right-click GPZ bay opens bay menu,
- click GPZ bay selects `BaySN`,
- split command opens explicit split/insert form context,
- SLD viewport is not reset by operation form opening.
