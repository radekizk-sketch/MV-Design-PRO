// @vitest-environment node
/**
 * Kontrakt rejestru skrótów Pomocy (karta K2): rejestr NIE obiecuje skrótów,
 * których aplikacja nie obsługuje. Mapa niżej wskazuje pliki obsługi każdego wpisu, a test
 * czyta ich ŹRÓDŁO i szuka warunku na tym klawiszu — wpis bez obsługi albo
 * obsługa usunięta bez zdjęcia wpisu daje czerwień.
 *
 * Wzorce są celowo konkretne (warunek na `key`, nie samo słowo w komentarzu):
 * komentarz „F przybliża" nie jest obsługą.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { KEYBOARD_SHORTCUTS } from '../keyboardShortcuts';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const SCHEMAT = 'ui/sld/v3/canvas/SldCanvasV3Workspace.tsx';
const POWLOKA = 'ui2/shell/AppShell.tsx';
const RAMA = 'ui2/legacy/LegacyChrome.tsx';
const HISTORIA = 'ui/history/UndoRedoButtons.tsx';

/** Pliki obsługi (względem `src/`) i warunek obsługi klawisza — jeden wpis na akcję rejestru. */
const OBSLUGA: Readonly<Record<string, { readonly pliki: readonly string[]; readonly wzorzec: RegExp }>> = {
  dopasuj_zakres: { pliki: [SCHEMAT], wzorzec: /event\.key === 'f' \|\| event\.key === 'F'/ },
  dopasuj_siec: { pliki: [SCHEMAT], wzorzec: /if \(event\.shiftKey\) kadrujCel\('siec'/ },
  poprzedni_widok: { pliki: [SCHEMAT], wzorzec: /event\.altKey\)\s*\{\s*if \(event\.key === 'ArrowLeft'\)/ },
  zaznacz_obszar: { pliki: [SCHEMAT], wzorzec: /if \(!event\.shiftKey \|\| event\.button !== 0\) return;/ },
  szukaj: { pliki: [POWLOKA], wzorzec: /\(event\.key === 'k' \|\| event\.key === 'K'\)/ },
  anuluj: { pliki: [POWLOKA, SCHEMAT], wzorzec: /event\.key (===|!==) 'Escape'/ },
  przestrzen_pracy: { pliki: [POWLOKA], wzorzec: /Number\.parseInt\(event\.key, 10\)/ },
  panel_lewy: { pliki: [POWLOKA], wzorzec: /\(event\.key === 'b' \|\| event\.key === 'B'\)/ },
  panel_prawy: { pliki: [POWLOKA], wzorzec: /\(event\.key === 'i' \|\| event\.key === 'I'\)/ },
  przypnij_inspektor: { pliki: ['ui2/inspector/InspectorPanel.tsx'], wzorzec: /e\.key\.toLowerCase\(\) !== 'p'/ },
  cofnij: { pliki: [HISTORIA], wzorzec: /event\.key === 'z' && !event\.shiftKey/ },
  ponow: { pliki: [HISTORIA], wzorzec: /event\.ctrlKey && event\.key === 'y'/ },
  pomoc: { pliki: [RAMA], wzorzec: /e\.key === 'F1'/ },
  ustawienia: { pliki: [RAMA], wzorzec: /e\.key === ',' && \(e\.ctrlKey \|\| e\.metaKey\)/ },
};

describe('rejestr skrótów Pomocy — każdy wpis ma realną obsługę', () => {
  it('identyfikatory akcji są unikalne, a tabela wzorców pokrywa DOKŁADNIE rejestr', () => {
    const ids = KEYBOARD_SHORTCUTS.map((s) => s.action_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(OBSLUGA).sort());
  });

  for (const skrot of KEYBOARD_SHORTCUTS) {
    it(`${skrot.keys} (${skrot.action_id}): każdy plik obsługi zawiera warunek na tym klawiszu`, () => {
      const { pliki, wzorzec } = OBSLUGA[skrot.action_id];
      expect(pliki.length).toBeGreaterThan(0);
      for (const plik of pliki) {
        const sciezka = resolve(src, plik);
        expect(existsSync(sciezka), `plik obsługi ${plik} istnieje`).toBe(true);
        expect(readFileSync(sciezka, 'utf8')).toMatch(wzorzec);
      }
    });
  }
});
