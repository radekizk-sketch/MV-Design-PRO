# Zero-Debt Rule (BINDING — dyrektywa właściciela, 2026-07-17)

<!-- Przeniesione 1:1 z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11). Reguła bez `paths`:
     ładuje się przy starcie każdej sesji razem z CLAUDE.md. -->

Każdy wykryty defekt, dług techniczny, bug lub brak naprawiasz **end-to-end,
od razu, bez pytania o pozwolenie** — dotyczy to również znalezisk ubocznych
(guard czerwony na HEAD, wykluczony test, martwy kod, nieaktualny dokument,
workflow CI, który nigdy się nie wykonał, niespójność danych szablonu).

Zasady wykonania:
1. **Wykluczenie ≠ naprawa.** Nie wolno maskować długu (exclude w konfigu
   testów, `continue-on-error`, skip, komentarz „do naprawy później").
   Nowe wykluczenie wymaga uzasadnienia w commicie i wpisu długu w execplanie.
   **Każdy NAPOTKANY błąd naprawiasz — także pre-existing, nie tylko własny
   (dyrektywa właściciela 2026-07-21: „masz naprawiać wszystkie napotkane
   błędy").** Błąd typów/lint/test/guard, który zobaczyłeś przy swojej pracy
   (nawet jeśli był w repo przed Twoją zmianą), naprawiasz u źródła w tej samej
   kolejce — nie wolno go pominąć argumentem „był wcześniej" ani „poza moim
   zakresem". Jedyny wyjątek to dług nienaprawialny w bieżącej sesji (pkt 4) —
   wtedy wpis do execplanu z pomiarem i planem, nigdy cicho.
2. **Naprawa u źródła.** Test czerwony z powodu regresji komponentu ⇒ napraw
   komponent, nie asercję. Test czerwony z powodu zmiany kanonu ⇒ przepisz
   test do obecnego kanonu z zachowaniem intencji (i zapisz intencję w
   komentarzu).
3. **Weryfikacja end-to-end przed commitem**: pełna regresja właściwego
   stosu, kody wyjścia łapane BEZPOŚREDNIO (nigdy `cmd | tail; echo $?` —
   pipe zwraca kod ostatniego członu); pętle oczekiwania bez samodopasowania
   `pgrep -f` (sentinel w pliku wyników zamiast wzorca tekstowego procesu).
4. **Dług nienaprawialny w bieżącej sesji** (wymaga decyzji produktowej,
   danych, których nie ma, albo przekracza sesję) — wpis do execplanu z
   pomiarem, przyczyną i planem, nigdy cicho.
5. **Test maskujący defekt produktu = dwa defekty** (dyrektywa właściciela,
   2026-07-17). Gdy test „przechodzi" tylko dzięki obejściu realnej ścieżki
   użytkownika (syntetyczny `dispatchEvent` zamiast natywnego klika,
   wymuszony stan store zamiast interakcji, sztuczny fixture omijający
   walidację) — naprawiasz OBA: defekt produktu u źródła ORAZ test, żeby
   ćwiczył realną ścieżkę (inaczej regresja naprawy będzie niewykrywalna).
   Precedens: martwy lewy klik w elementy kanwy SLD (capture-on-pointerdown
   przekierowywał click na tło) był latami niewidoczny, bo wszystkie specy
   klikały syntetycznie. Nowy test interakcji ZAWSZE zaczyna od ścieżki
   natywnej; syntetyczny event wymaga uzasadnienia w komentarzu.
