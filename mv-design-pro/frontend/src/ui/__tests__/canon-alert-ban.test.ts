// @vitest-environment node
/**
 * Canon Guard: alert() / confirm() / prompt() BAN
 *
 * BINDING RULE:
 * - No blocking browser popups in source code
 * - alert(), confirm(), prompt() are FORBIDDEN
 * - window.alert, window.confirm, window.prompt are FORBIDDEN
 * - Use inline notification system (NotificationToast) instead
 *
 * This test scans ALL TypeScript source files (excluding tests and node_modules)
 * to ensure no alert/confirm/prompt calls exist.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '..', '..');

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'e2e') {
        continue;
      }
      results.push(...getAllTsFiles(fullPath));
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Check for alert/confirm/prompt in non-comment, non-string-literal-reference lines.
 */
function findForbiddenCalls(filePath: string): { line: number; content: string; call: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: { line: number; content: string; call: string }[] = [];

  const FORBIDDEN_PATTERNS = [
    { pattern: /\balert\s*\(/, call: 'alert()' },
    { pattern: /\bconfirm\s*\(/, call: 'confirm()' },
    { pattern: /\bprompt\s*\(/, call: 'prompt()' },
    { pattern: /window\.alert\s*\(/, call: 'window.alert()' },
    { pattern: /window\.confirm\s*\(/, call: 'window.confirm()' },
    { pattern: /window\.prompt\s*\(/, call: 'window.prompt()' },
  ];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }
    // Skip import statements
    if (trimmed.startsWith('import ')) {
      return;
    }

    for (const { pattern, call } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({ line: index + 1, content: trimmed, call });
      }
    }
  });

  return violations;
}

describe('Canon Guard: alert/confirm/prompt BAN', () => {
  it('should have zero alert()/confirm()/prompt() calls in source files', () => {
    const files = getAllTsFiles(SRC_DIR);
    const allViolations: { file: string; line: number; content: string; call: string }[] = [];

    for (const filePath of files) {
      const violations = findForbiddenCalls(filePath);
      for (const v of violations) {
        allViolations.push({
          file: path.relative(SRC_DIR, filePath),
          ...v,
        });
      }
    }

    if (allViolations.length > 0) {
      const messages = allViolations
        .map((v) => `  ${v.file}:${v.line} [${v.call}]: ${v.content}`)
        .join('\n');
      expect.fail(
        `Found ${allViolations.length} forbidden blocking popup call(s):\n${messages}\n\n` +
          'Use notify() from ui/notifications/store instead of alert/confirm/prompt.'
      );
    }

    expect(allViolations).toHaveLength(0);
  });
});
