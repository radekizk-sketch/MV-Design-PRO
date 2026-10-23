# Karta MU-INTERPOLACJA — współczynniki μ i q dla t_min pomiędzy węzłami normy (B-01, delegowane architektowi)

Worktree: `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/mu`
(gałąź `claude/mv-design-pro-twin-audit-u4lhy0-mu`, baza = czubek partii 13 z kartą TB-WARTOSC-ROBOCZA).
Jeden commit lokalny, BEZ push. Autor radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`, stopka:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

Po karcie TB-WARTOSC-ROBOCZA t_b przychodzi z pól lokalnych, więc w praktyce trafiają wartości
pomiędzy węzłami krzywych μ i q z IEC 60909-0 (t_min = 0,02 / 0,05 / 0,1 / ≥0,25 s), np. 0,2 s.
Dziś `machine_sc_iec60909.py:52–61` bierze węzeł najbliższy z progami w połowie przedziałów.
Dla t_b ∈ (0,175; 0,25) daje to krzywą 0,25 s, czyli μ mniejsze i I_b mniejsze niż wynika z
interpolacji — wynik niezachowawczy dla doboru aparatury (I_b ≤ I_cu). Przypina to test
`test_machine_sc_iec60909.py:398–418`.

## Rozstrzygnięcie architekta (§0 — wiążące)

1. Między sąsiednimi węzłami μ i q liczysz **liniowo w t_min** wartości krzywych obu węzłów
   (interpolacja wartości μ, q, nie współczynników a, b, c). Taką interpolację dopuszcza
   IEC 60909-0 przy opisie krzywych μ i q. Zanim zakodujesz, sprawdź dokładne brzmienie
   i numer punktu normy i zacytuj je w docstringu oraz w śladzie White Box. Jeśli norma
   mówi co innego, zatrzymaj się i zamelduj.
2. Poza zakresem: t_min ≤ 0,02 s → krzywa 0,02 s; t_min ≥ 0,25 s → krzywa 0,25 s, tak jak dziś.
3. W węzłach (0,02 / 0,05 / 0,1 / 0,25 s) wynik ma być **bit w bit** jak dziś. Pokaż to testem
   na korpusie golden: zmieniają się tylko wiersze z t_b spoza węzłów; dla każdego z nich wypisz
   różnicę I_b i μ.
4. Ślad White Box kroków μ i q niesie: oba węzły, obie wartości węzłowe, wagę interpolacji
   i wynik. Dowód SC3F (`proof_generator._create_sc3f_step_machine_mu/_q`) pokazuje to samo
   w LaTeX. Jedna funkcja liczy, dowód tylko czyta ślad — bez drugiej implementacji.
5. Test `:398–418`, który przypina regułę najbliższego węzła, przepisz do nowego kanonu.
   Zachowaj intencję w komentarzu: wybór krzywej jest deterministyczny i przypięty.

## Testy (iloczyn cech)

{μ, q} × {t_min w węźle, między węzłami (np. 0,03 / 0,07 / 0,2 s), poniżej 0,02 s, powyżej
0,25 s} × {maszyna synchroniczna, asynchroniczna}. Do tego monotoniczność μ(t_min) przy stałym
I″/I_r oraz sonda ręczna dla t = 0,2 s i I″/I_r ≈ 7,25 (liczby ręczne wobec solvera w meldunku).
Iniekcje: wróć do reguły najbliższego węzła; zamień wagi interpolacji — testy mają czerwienieć.

## Granice

- FROZEN API wyników tylko addytywnie.
- Nie ruszaj rozstrzygania t_b (karta TB).
- Fikstury i golden regeneruj wyłącznie generatorami repo i wypisz różnice.
- Odcisk rdzenia odśwież w `scripts/guard_references/solver_hashes.json` z opisem w
  `scripts/rdzenie_b01.py`.
- Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`.
- Zakaz: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
- pytest z `-n 2` (pamięć). Długie biegi odłączaj od powłoki (`setsid nohup`), a wynik zapisuj
  do pliku z sentinelem RC.

## Kryterium ukończenia

Wszystkie poniższe zielone, z kodami wyjścia łapanymi bezpośrednio i logami w
`scratchpad/mup/`:
- testy celowane: solvery zwarciowe, proof_engine, wytrzymałość aparatury, API dowodu;
- komplet guardów pythonem z venv;
- samotesty guardów;
- `eksport_fixtur_harnessu.py --sprawdz`.

Pełną regresję wykona integrator. Meldunek zawiera: cytat normy, sondę liczbową, liczbę
zmienionych wierszy golden z największą różnicą I_b oraz wyniki iniekcji.
