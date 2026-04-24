import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
}

describe('SLD canonical hygiene', () => {
  it('App.tsx nie używa demo-path dla głównych widoków SLD', () => {
    const app = read('src/App.tsx');
    expect(app.includes('<SldEditorPage useDemo={true} />')).toBe(false);
    expect(app.includes('<SLDViewPage useDemo={true} />')).toBe(false);
  });

  it('aktywny route SLD nie importuje statycznego ekranu inzynierskiego', () => {
    const app = read('src/App.tsx');
    const sldIndex = read('src/ui/sld/index.ts');
    const staticScreenName = 'Engineering' + 'SldScreen';
    const staticModelName = 'canonical' + 'SnSldModel';
    const staticSymbolsName = 'canonical' + 'SnSldSymbols';

    expect(app.includes(staticScreenName)).toBe(false);
    expect(sldIndex.includes(staticScreenName)).toBe(false);
    expect(sldIndex.includes(staticModelName)).toBe(false);
    expect(sldIndex.includes(staticSymbolsName)).toBe(false);
    expect(app.includes('<SldEditorPage useDemo={false} />')).toBe(true);
  });

  it('SldEditorPage korzysta z projektora ENM -> SLD zamiast statycznej topologii runtime', () => {
    const page = read('src/ui/sld/SldEditorPage.tsx');
    expect(page.includes('projectEnmSnapshotToSld')).toBe(true);
    expect(page.includes('const enmProjection = useMemo(')).toBe(true);
  });

  it('critical-run-flow E2E nie mockuje backend API przez page.route', () => {
    const critical = read('e2e/critical-run-flow.spec.ts');
    expect(critical.includes('page.route(')).toBe(false);
  });

  it('SLDViewCanvas nie używa legacy useAutoLayout fallback', () => {
    const canvas = read('src/ui/sld/SLDViewCanvas.tsx');
    expect(canvas.includes('useAutoLayout')).toBe(false);
  });

  it('SLDView nie mapuje source field menu do legacy aliasu pola zrodlowego nN', () => {
    const sldView = read('src/ui/sld/SLDView.tsx');
    const legacySourceFieldOp = 'add_nn_source' + '_field';
    expect(sldView.includes(`add_source_field: '${legacySourceFieldOp}'`)).toBe(false);
    expect(sldView.includes(`add_source_field_nn: '${legacySourceFieldOp}'`)).toBe(false);
  });

  it('aktywny runtime SLD korzysta z jednej bramy ukladu bez bezposredniego wyboru legacy strategy', () => {
    const snapshotProjection = read('src/ui/sld/enmSnapshotToSldSymbols.ts');
    const layoutPipeline = read('src/ui/sld/core/layoutPipeline.ts');

    expect(snapshotProjection.includes("strategy: 'legacy'")).toBe(false);
    expect(snapshotProjection.includes('computeLayout(')).toBe(true);
    expect(layoutPipeline.includes('export function computeActiveRuntimeLayout(')).toBe(false);
  });
});
