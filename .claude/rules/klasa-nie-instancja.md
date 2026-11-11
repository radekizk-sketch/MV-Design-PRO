# Reguła KLASA, NIE INSTANCJA (BINDING — wniosek z przeglądu 2026-08-01)

<!-- Przeniesione 1:1 z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11). Reguła bez `paths`:
     ładuje się przy starcie każdej sesji razem z CLAUDE.md. Odwołania „CLAUDE.md, KLASA NIE
     INSTANCJA pkt N" w komentarzach guardów i testów wskazują ten plik. -->

Przegląd kodu fali audytu (`docs/audit/PRZEGLAD_FALI_2026-08-01.md`) wykrył
**jeden błąd metodyczny powtórzony cztery razy w czterech niezależnych kartach**:
naprawiono INSTANCJĘ defektu nazwaną w audycie, a nie jego KLASĘ. Za każdym razem
zbiór, na którym działa nowy mechanizm, okazał się inny niż zbiór, na którym
powinien: rozdzielano szerzej niż doklejano z powrotem (wielomian ZIP), bramkowano
transformator, ale nie źródło nN ani aparat pola (brama katalogowa), blokowano
jeden z czterech cykli zapisu (współbieżność), wycofywano model, ale nie dziennik.
Wszystkie cztery przeszły pełną regresję, komplet guardów i iniekcje — bo iniekcje
sprawdzały ścieżkę, którą ktoś przewidział.

Dlatego każda karta naprawcza MUSI zawierać:

1. **Inwentarz klasy przed naprawą.** Wypisz WSZYSTKIE miejsca/ścieżki/elementy
   dzielące ten sam mechanizm — nie tylko to z audytu. Inwentarz idzie do meldunku
   i do wpisu rejestru. Miejsce świadomie zostawione poza naprawą wymaga
   uzasadnienia merytorycznego (nie „poza zakresem karty").
2. **Test jako ILOCZYN CECH, nie przykład z karty.** Nowe testy pokrywają iloczyn
   cech, w którym defekt mógłby się schować (np. „czułość częstotliwościowa ×
   generacja na szynie", „ten sam obiekt × awaria zapisu dziennika", „operacja A ×
   operacja B równolegle"), a nie tylko scenariusz opisany w karcie. Zanim uznasz
   pokrycie za wystarczające, wypisz cechy i sprawdź grepem, czy ich kombinacja
   występuje w testach.
3. **Predykaty parami.** Gdy kod dzieli zbiór na dwie części i składa je z powrotem
   (rozdziel/dołóż, zablokuj/zwolnij, zapisz/wycofaj), warunek WEJŚCIA i WYJŚCIA
   musi pochodzić z JEDNEGO źródła prawdy. Dwa niezależne warunki, które „dziś się
   zgadzają", są defektem oczekującym na dane brzegowe.
4. **Deklaracja bez testu = fałszywa pewność.** Każde mocne zdanie w docstringu,
   rejestrze albo dokumencie („operacja meldująca błąd nie zostawia żadnego skutku",
   „lista ZAMKNIĘTA — każde nowe miejsce to naruszenie") musi mieć PRZYPIĘTY test.
   Obietnica bez testu jest groźniejsza niż sam defekt, bo wyłącza czujność.
5. **Uczciwość w obrębie jednego pliku.** Jeśli karta zakazuje wzorca (zaszyty próg,
   ciche zero, domysł), przeszukaj CAŁY moduł, w którym pracujesz — zostawienie tego
   samego wzorca w sąsiedniej funkcji jest naruszeniem tej samej karty.
