# Karta MENU-KANON — kanon menu kontekstowego SLD na żywej ścieżce (V12K-351)

**Worktree:** `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/menu`
- gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-menu-kanon`
- baza: czubek `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` po scaleniu W5-C
- `frontend/node_modules`: dowiązanie do `scratchpad/wt/szybkie/mv-design-pro/frontend/node_modules`
  (nie commituj)

Commit lokalny bez push. Autor radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`, stopka:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

`docs/v12xx/SLD_CAD_ENGINE_V12.md` opisuje menu kontekstowe SLD:
- ścieżka: `contextMenuRegistry.ts` → `actionMenuBuilders.ts` → `actionRouting.ts`;
- stała kolejność sekcji: Otwórz, Edytuj, Dodaj, Analizuj, Wyniki, Uzasadnienie, Raport, Operacje, Usuń;
- rejestry per obiekt: pole SN, odcinek SN, stacja SN/nN, źródło i przyłączenie.

`actionMenuBuilders.ts` i `actionRouting.ts` skasowała karta K5-A. `ui/context-menu/contextMenuRegistry.ts`
ma wyłącznie konsumentów testowych. Kanon opisuje więc ścieżkę, której nie ma. Zgodność z kanonem
przypinają dziś testy martwego modułu, czyli deklaracja bez pokrycia produktu.

Jedyna żywa ścieżka menu to `SLD_MENU_REGISTRY` (`ui/sld/v2/command/SldCommandService`), renderowany
przez `ui/context-menu/SldContextMenuController.tsx` z wykonawcą `ui/sld/shared/sldActionExecutor`.

## Rozstrzygnięcie architekta (§0, wiążące)

1. **Kanon wiąże treść, nie nazwę pliku.** Kolejność sekcji i zestaw akcji per obiekt mają obowiązywać
   na żywej ścieżce `SLD_MENU_REGISTRY`.
   - Zrób inwentarz trzech zbiorów: akcje martwego rejestru, akcje żywego rejestru i zakres z tabeli
     kanonu, per obiekt.
   - Brakującą akcję dokładasz do żywego rejestru tylko wtedy, gdy ma realną operację backendu albo
     realne przejście nawigacyjne (reguła phantom).
   - Akcji bez realnej operacji nie dokładasz. Wpisujesz ją do meldunku z uzasadnieniem
     i z brakującym ogniwem łańcucha. Jeśli backend ma operację, a brakuje tylko UI, wepnij ją.
2. **Martwe kasujesz na amen.** Kasujesz `contextMenuRegistry.ts`, jego testy, które pilnują martwego
   modułu, oraz nieużywane eksporty `actions.ts` i `ui/index.ts`. Przed kasacją sprawdź grepem
   konsumentów produkcyjnych. Testy przepinasz na żywy rejestr z zachowaniem intencji.
3. **Kanon menu.** W `docs/v12xx/SLD_CAD_ENGINE_V12.md` zmieniasz wiersze modułów i sekcję
   „Kanoniczne menu kontekstowe” na żywą ścieżkę. Dopisujesz notę rozstrzygnięcia z odwołaniem
   do V12K-351.
4. **Rejestr konfliktów.** Do `docs/v12xx/REJESTR_KONFLIKTOW.md` dodajesz wiersz V12K-351 w formacie
   sąsiednich wierszy.
5. **Testy jako iloczyn cech.** Test kanonu obejmuje:
   - {pole SN, odcinek SN, stacja SN/nN, źródło} × {kolejność sekcji, każda akcja ma wykonawcę,
     Usuń na końcu};
   - na żywym `SLD_MENU_REGISTRY`;
   - co najmniej jeden e2e na realnym backendzie z NATYWNYM prawym kliknięciem w element kanwy SLD
     v3 i kliknięciem akcji, która zmienia model.

   Iniekcje: zamień kolejność dwóch sekcji, usuń wykonawcę jednej akcji. Testy mają czerwienieć.

## Granice

- Nie ruszaj `ui/sld/v3/scene/buildScene.ts`, `ui2/wyniki/zwarcia/**` ani backendu poza ewentualnym
  wpięciem istniejącej operacji.
- FROZEN API wyników bez zmian.
- Zakaz: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
- Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`.
- Dysk jest ciasny (~2 GB): logi w `scratchpad/menu/`, bez kopii `node_modules`.

## Kryterium ukończenia

Wszystkie poniższe zielone, z kodami wyjścia łapanymi bezpośrednio:
- tsc;
- eslint dotkniętych plików;
- vitest `src/ui/context-menu src/ui/sld`;
- guardy: `dead_click_guard`, `dialog_completeness_guard`, `interaction_matrix_guard`, `docs_guard`,
  `v12xx_canon_guard`, `no_codenames_guard`, `vulture_guard` oraz ich samotesty;
- nowy e2e na realnym backendzie (`PLAYWRIGHT_BACKEND_PYTHON=/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-qcn8twMl-py3.11/bin/python
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node ./scripts/playwright-run-real.mjs <spec>`).

Meldunek zawiera:
- tabelę inwentarza trzech zbiorów;
- listę akcji dołożonych i pominiętych z uzasadnieniem;
- wyniki iniekcji;
- hash commitu.
