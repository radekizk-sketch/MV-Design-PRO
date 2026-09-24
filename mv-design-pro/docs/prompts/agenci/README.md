# Wykonawcy drzewa agentów

Definicje subagentów Claude Code dla drzewa agentów z `CLAUDE.md`: `explorer.md`, `worker.md`,
`researcher.md` (Opus 5.5, effort `medium`). Claude Code odkrywa subagenty z `.claude/agents/`;
skopiowanie tych plików tam wymaga zgody właściciela (zapis w `.claude/` zmienia konfigurację
harnessu). Do tego czasu sesja główna uruchamia wykonawcę narzędziem Agent z treścią
odpowiedniego pliku jako promptem.
