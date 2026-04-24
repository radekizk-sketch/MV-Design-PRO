import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('legacy public api cut', () => {
  it('removes the public wizard barrel from the active UI surface', () => {
    const wizardIndexPath = join(__dirname, '..', 'wizard', 'index.ts');
    expect(existsSync(wizardIndexPath)).toBe(false);
  });

  it('keeps legacy panel routers out of the network-build public barrel', () => {
    const networkBuildIndexPath = join(__dirname, '..', 'network-build', 'index.ts');
    const source = readFileSync(networkBuildIndexPath, 'utf-8');

    expect(source).not.toContain("export { OperationFormRouter }");
    expect(source).not.toContain('ActiveOperationForm');
    expect(source).not.toContain('ActiveObjectCard');
  });

  it('does not keep legacy surface type declarations in the active store', () => {
    const networkBuildStorePath = join(__dirname, '..', 'network-build', 'networkBuildStore.ts');
    const source = readFileSync(networkBuildStorePath, 'utf-8');

    expect(source).not.toContain('export type ActiveOperationForm =');
    expect(source).not.toContain('export type ActiveObjectCard =');
    expect(source).not.toContain('export type ActiveInspectorPanel =');
  });

  it('does not branch workspace routing directly on legacy delegates', () => {
    const surfaceRouterPath = join(__dirname, '..', 'workspace', 'WorkspaceSurfaceRouter.tsx');
    const source = readFileSync(surfaceRouterPath, 'utf-8');

    expect(source).not.toContain("delegate === 'operation_form'");
    expect(source).not.toContain("delegate === 'object_card'");
    expect(source).not.toContain("delegate === 'read_only_panel'");
  });
});
