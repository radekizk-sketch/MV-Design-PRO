# Wspólne zasady wznowienia kart po restarcie kontenera (2026-10-22)

Poprzedni wykonawca tej karty zginął przy restarcie kontenera. Jego niezacommitowana praca jest w worktree: przejrzyj ją przez
`git status` i `git diff`, oceń krytycznie względem karty i NIE cofaj tego, co poprawne.

**Pamięć i dysk są ciasne.** Kontener ma 15 GB RAM i OOM zabijał już workery pytest oraz vitest.
- Biegi testów poprzednika uruchomione przez `setsid` mogą nadal trwać.
- Zanim cokolwiek uruchomisz, sprawdź `ps -eo pid,etime,args`, `readlink /proc/<pid>/cwd` oraz logi i pliki rc w katalogu logów karty.
- Jeśli bieg poprzednika dotyczy tego samego stanu drzewa (nic od niego nie zmieniłeś), poczekaj na jego rc i użyj wyniku. Wolno Ci też zabić go po PID (`kill <pid>`; nigdy `pkill -f`) i uruchomić od nowa.
- Nigdy nie uruchamiaj dwóch pełnych biegów naraz.
- Backend uruchamiaj z `-n 2 --dist loadfile`.
- Vitest uruchamiaj tylko w swojej sesji, z `--pool forks --poolOptions.forks.maxForks=2`; jeśli konfiguracja to nadpisuje, użyj zmiennej środowiskowej lub flagi właściwej dla repo.
- `--basetemp` ustawiaj w katalogu logów karty i usuwaj go po biegu osobnym poleceniem, nigdy wewnątrz `bash -c`.

**Uruchamianie biegów.**
- Długie biegi: `setsid nohup bash -c "...; echo \$? > plik.rc" &`, z wyjściem do pliku.
- Do kontekstu bierz tylko podsumowanie i kody wyjścia.
- Czekaj pętlą `until [ -s plik.rc ]` z timeoutem Bash 600000 ms, w kolejnych wywołaniach.

**Venv:** `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-qcn8twMl-py3.11/bin/python`.
