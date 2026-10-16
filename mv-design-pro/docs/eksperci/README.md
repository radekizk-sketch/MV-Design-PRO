# Rada Techniczna MV-DESIGN PRO — 240 specjalizacji

**Status:** implementacja pomocniczej warstwy kompetencyjnej; nie zastępuje kanonów, ekspertyz uprawnionych osób ani solverów.

## Zakres

Rejestr `rejestr_240.json`: 30 grup × 8 specjalizacji. Każdy rekord ma ID `E001..E240`, odpowiedzialność, słowa aktywujące, punkty kontroli, typy dowodów, powiązania między grupami i obowiązek sprawdzania źródeł. Grupy `G01..G30` odnoszą się do pełnego spektrum elektroenergetyki i elektrotechniki. Liczba rekordów **nie** oznacza liczby uruchamianych agentów ani wykonanych recenzji.

### Aktywacja

Z katalogu głównego repozytorium:

```bash
python mv-design-pro/scripts/rada_ekspercka.py --check
python mv-design-pro/scripts/rada_ekspercka.py "Dobór kabla SN 15 kV i żyły powrotnej"
python mv-design-pro/scripts/rada_ekspercka.py "Nastawy EAZ zwarcia doziemne CT VT"
python mv-design-pro/scripts/rada_ekspercka.py "NC RfG WOS moduł typu B"
python -m unittest discover -s mv-design-pro/scripts -p 'test_rada_ekspercka.py' -v
```

Odpowiedź JSON zawiera profil, eksperta prowadzącego, specjalistów i niezależnego recenzenta; są to **wskazania kompetencji**, nie opinie. Mechanizm jest deterministyczny, bez połączeń sieciowych i bez naruszania modelu ENM.

W Claude Code użyj `/rada-ekspercka` lub poleć zadanie branżowe, które uruchomi umiejętność na podstawie opisu. Dla niezależnej kontroli wybierz subagenta `recenzent-elektroenergetyczny`.

### Ograniczenia

Kwalifikator stosuje jawne profile sygnałów. Może nie rozpoznać wieloznacznych poleceń i wtedy oddaje `WYMAGA_KWALIFIKACJI`; nie podszywa się pod model semantyczny. Wynik należy zweryfikować inżyniersko. Zespół może skorygować skład na podstawie faktycznego zakresu i konsekwencji technicznych. Nie istnieje automatyczna integracja z aplikacją ani wymuszanie norm przez CLI; jest to rozszerzenie procesu pracy Claude Code.

### Hierarchia

`CLAUDE.md` → obowiązujący kanon i rejestr konfliktów → dokumenty domenowe → umiejętność Rady → kwalifikator → konkretna karta zadaniowa. Formalna hierarchia repozytorium pozostaje bez zmian; to wskazówka kolejności stosowania funkcji Rady, a nie nowy porządek pierwszeństwa dokumentów.

**B-01** i **B-02** pozostają w mocy. Interfejs i formularze są oceniane dopiero przez pryzmat poprawności pracy projektanta, obliczeń, aparatury i EAZ.

### Dowód wdrożenia

Testy automatyczne walidują strukturę i dobór. Nie potwierdzają uruchomienia Claude Code, działania subagenta ani poprawności merytorycznej obliczeń. Te wymagają osobnych testów w rzeczywistej sesji i konkretnych wyników numerycznych. Zobacz `STANDARD_WERYFIKACJI.md`.
