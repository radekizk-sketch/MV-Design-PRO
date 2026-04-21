/**
 * Test: Brak nazw kodowych w UI
 *
 * BINDING RULE:
 * - Nazwy kodowe P11, P14, P17 nigdy nie sa pokazywane w UI.
 * - Tylko komentarze dokumentacyjne dla deweloperow moga zawierac te nazwy.
 * - Ten test sprawdza, czy w widocznych stringach UI nie ma tych nazw.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROOF_DIR = path.join(__dirname, '..');
const RESULTS_INSPECTOR_DIR = path.join(__dirname, '..', '..', 'results-inspector');

// Regex dla nazw kodowych - wyklucza komentarze
const CODENAME_REGEX = /['"`].*?(P11|P14|P17).*?['"`]/g; // no-codenames-ignore

// Pliki do sprawdzenia
const UI_FILES = [
  path.join(PROOF_DIR, 'TraceViewer.tsx'),
  path.join(PROOF_DIR, 'TraceToc.tsx'),
  path.join(PROOF_DIR, 'TraceStepView.tsx'),
  path.join(PROOF_DIR, 'TraceMetadataPanel.tsx'),
  path.join(PROOF_DIR, 'MathRenderer.tsx'),
  path.join(PROOF_DIR, 'traceUrlState.ts'),
  path.join(PROOF_DIR, 'index.ts'),
  path.join(PROOF_DIR, 'export', 'exportTraceJsonl.ts'),
  path.join(PROOF_DIR, 'export', 'exportTracePdf.ts'),
  path.join(PROOF_DIR, 'export', 'index.ts'),
  path.join(RESULTS_INSPECTOR_DIR, 'types.ts'),
];

describe('UI Codenames Check', () => {
  it('should not contain codenames in UI-visible strings', () => { // no-codenames-ignore
    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of UI_FILES) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
          return;
        }

        const matches = line.match(CODENAME_REGEX);
        if (matches) {
          violations.push({
            file: path.basename(filePath),
            line: index + 1,
            content: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const violationMessages = violations
        .map((violation) => `  ${violation.file}:${violation.line}: ${violation.content}`)
        .join('\n');

      expect.fail(
        `Found codenames in UI-visible strings:\n${violationMessages}\n\n` +
          'These codenames should never appear in user-facing UI. Use Polish labels instead.',
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('should use Polish labels for trace-related UI elements', () => {
    const typesPath = path.join(RESULTS_INSPECTOR_DIR, 'types.ts');
    if (fs.existsSync(typesPath)) {
      const content = fs.readFileSync(typesPath, 'utf-8');
      expect(content).toContain("TRACE: 'Ślad obliczeń'");
    }
  });

  it('should not expose internal keys like "Proof Engine" in UI labels', () => {
    const forbiddenTerms = ['Proof Engine', 'proof_engine', 'ProofEngine'];

    for (const filePath of UI_FILES) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      for (const term of forbiddenTerms) {
        const stringPattern = new RegExp(`['"\`].*?${term}.*?['"\`]`, 'gi');
        const matches = content.match(stringPattern);

        if (matches) {
          const nonCommentMatches = matches.filter((match) => {
            const index = content.indexOf(match);
            const lineStart = content.lastIndexOf('\n', index) + 1;
            const lineContent = content.substring(lineStart, index);
            return !lineContent.trim().startsWith('//') && !lineContent.trim().startsWith('*');
          });

          expect(nonCommentMatches).toHaveLength(0);
        }
      }
    }
  });
});
