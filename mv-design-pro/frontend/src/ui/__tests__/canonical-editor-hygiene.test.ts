import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
}

describe('canonical editor hygiene', () => {
  it('CaseManager wraca do kanonicznej trasy edytora', () => {
    const source = read('src/ui/case-manager/CaseManager.tsx');
    expect(source.includes('window.location.hash = ROUTES.SLD.hash')).toBe(true);
    expect(source.includes("window.location.hash = ''")).toBe(false);
    expect(source.includes("window.location.hash = '#sld'")).toBe(false);
  });

  it('ProjectTree nie rozdziela runow na lokalne hashe wynikowe', () => {
    const source = read('src/ui/project-tree/ProjectTree.tsx');
    expect(source.includes("window.location.hash = '#protection-results'")).toBe(false);
    expect(source.includes("window.location.hash = '#power-flow-results'")).toBe(false);
    expect(source.includes("window.location.hash = '#short-circuit-results'")).toBe(false);
  });

  it('PowerFactoryLayout podpina katalog w tym samym shellu co drzewo projektu', () => {
    const source = read('src/ui/layout/PowerFactoryLayout.tsx');
    expect(source.includes("leftPanelMode = useState<'build' | 'catalog' | 'tree'>('catalog')")).toBe(false);
    expect(source.includes("const [leftPanelMode, setLeftPanelMode] = useState<'build' | 'catalog' | 'tree'>('catalog');")).toBe(true);
    expect(source.includes('onCatalogBrowse={() => handleOpenCatalogPanel()}')).toBe(true);
  });

  it('App kieruje wyniki do jednego kanonicznego workspace', () => {
    const source = read('src/App.tsx');
    expect(source.includes("if (route === '#results-workspace')")).toBe(false);
    expect(source.includes("if (route === '#results')")).toBe(true);
    expect(source.includes('<ResultsWorkspacePage />')).toBe(true);
    expect(source.includes('?run=${run.id}&mode=run')).toBe(true);
    expect(source.includes('?run=${activeRunId}&mode=run')).toBe(true);
  });

  it('glowne baryly nie wystawiaja legacy ekranow jako domyslnego API produktu', () => {
    const wizardSource = read('src/ui/wizard/index.ts');
    const inspectorSource = read('src/ui/results-inspector/index.ts');
    expect(wizardSource.includes("export { WizardPage } from './WizardPage';")).toBe(false);
    expect(inspectorSource.includes("export { ResultsInspectorPage } from './ResultsInspectorPage';")).toBe(false);
    expect(inspectorSource.includes('LegacyResultsInspectorPage')).toBe(true);
  });

  it('ProcessPanel przekazuje pelny kontekst do operacji SN', () => {
    const source = read('src/ui/network-build/ProcessPanel.tsx');
    expect(source.includes('availableBranchPorts={availableBranchPorts}')).toBe(true);
    expect(source.includes('defaultSegmentRef={defaultSegmentRef}')).toBe(true);
    expect(source.includes('ringCandidateCount')).toBe(false);
  });

  it('RunViewPanel laczy wynik z elementem modelu zamiast pozostawac bierna tabela', () => {
    const source = read('src/ui/results-workspace/RunViewPanel.tsx');
    expect(source.includes('resolveSelectedElementFromSnapshot')).toBe(true);
    expect(source.includes('Kliknij wiersz, aby wskazac element')).toBe(true);
  });

  it('NOP ma dedykowany formularz zamiast przechodzic przez flow domykania ringu', () => {
    const source = read('src/ui/network-build/OperationFormRouter.tsx');
    expect(source.includes("case 'set_normal_open_point':")).toBe(true);
    expect(source.includes('return <SetNormalOpenPointForm />')).toBe(true);
  });
});
