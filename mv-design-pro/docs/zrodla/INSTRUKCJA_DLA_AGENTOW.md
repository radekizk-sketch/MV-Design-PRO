# Instrukcja źródłowa dla Opusa / Fable / Codexa

**Użyj tego dokumentu przed każdą recenzją lub modyfikacją dotyczącą GPZ, H4/H5, torów 110 kV i automatyki SZR.**

1. Przeczytaj \`rejestr_zrodel.json\` i \`GPZ_H5_ZRODLA_I_REGULY.md\`. Następnie odczytaj aktualny istniejący dokument wykonawczy \`docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10.md\` — nie twórz drugiego planu.
2. Spróbuj lokalnego pobrania źródeł przez \`python scripts/pobierz_zrodla_techniczne.py --all\`; sprawdź \`--verify\`. Jeżeli 403/WAF, użyj oficjalnego PDF w przeglądarce albo pliku udostępnionego w sesji. Zakaz zastępowania niedostępnego pliku nieautoryzowanym skanem.
3. Rozróżniaj **POTWIERDZONE W PDF** (wersja, konkretna strona/załącznik) od **HIPOTEZY** i **WNIOSEK Z MODELU**; nie podpisuj cytatu literalnego bez rzeczywistego odczytania oryginału.
4. Każdy wymóg mapuj: \`ID źródła → sekcja/rysunek → ENM (plik:linia) → SLD (plik:linia) → solver → przypadek odbioru\`. Nie przyjmuj tylko geometrycznych asercji ekranu.
5. Dołęga, druk s. 60, rys. 3.37 = strona 59 lokalnego PDF (251 stron). Wykorzystuj **omówienie własnymi słowami**, bez kopiowania skanu do repo.
6. Nie pobieraj materiałów z zeszytów niepublicznych 4–6 bez formalnego uprawnienia; na stronie ENEA wskazano ograniczenie udostępniania tych zeszytów.
7. Dla GPZ normalnie z rozdzielonymi torami 110 kV i SN nie zakładaj zwarcia sekcji tylko dlatego, że wykonawca chce zobaczyć wszystkie transformatory w solverze.
8. Nie utożsamiaj dwóch linii 110 kV z niezależnymi źródłami systemowymi. Wymagaj jawnego modelu upstream i bilansu przy wariantach z zamkniętym sprzęgłem.
9. Właściciel zatwierdza B-01/B-02; źródła i biblioteka nie są zgodą na ingerencję w chroniony solver.
10. Pliki pod \`docs/zrodla/pobrane/\` oraz \`docs/zrodla/lokalne/\` są prywatnymi materiałami pomocniczymi i **nie wolno ich dodawać do commitu**.

**Wynik audytu:** tabela konkretnych rozbieżności, krótkie wnioski i dowody. Brak źródła = status NIEZWERYFIKOWANE, nie „zgodne z ENEA”.
