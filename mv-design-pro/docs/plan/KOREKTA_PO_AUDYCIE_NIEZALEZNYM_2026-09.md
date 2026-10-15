# KOREKTA PO AUDYCIE NIEZALEŻNYM — WARSTWA DYNAMICZNA

**Autor:** Claude Opus 5 (Principal Dynamic Simulation Engineer / Numerical Methods
Engineer / Software Verification Engineer)
**Gałąź:** `claude/max-dynamic-audit-kzbivg`
**Punkt wyjścia:** `85084102` = `b55cd086` (HEAD audytowany) + dwa commity przeglądu cienia
**Zakres:** §1–§21 audytu niezależnego oraz P1-B55-01…04 przeglądu cienia właściciela

---

## 0. NIEWZRUSZALNE GRANICE STATUSU

Ta transza **nie podniosła i nie mogła podnieść** żadnej z osi:

| Oś | Stan | Zmiana w tej transzy |
|---|---|---|
| PHYSICALLY VALIDATED | **NIE** | brak — i nie ma drogi bez danych z obiektu |
| PRODUCTION READY | **NIE** | brak |
| REGULATORY EVIDENCE READY | **NIE** | brak |
| VALIDATED SIMULATION | **NIE** | brak |
| Dowód NC RfG / WOS | **NIE** | brak |

Porównanie z niezależną implementacją TYCH SAMYCH RÓWNAŃ (poziom N1) **nie jest
walidacją fizyczną**. Dane z pola, z certyfikowanego modelu producenta albo
z niezależnego modelu wyższej klasy pozostają wymagane.

Transza podniosła jedno: **odporność na fałszywy pozytyw**. Zamknęła drogi,
którymi dawało się dojść do wyniku wyglądającego na dowód bez wykonania pomiaru.

---

## 0a. UWAGA O PRZEBIEGU PRAC — utrata pierwszego podejścia

Pierwsze wykonanie tej transzy (pięć commitów, 2026-09-13/14) **przepadło wraz
z odzyskanym kontenerem sesji**: commity istniały wyłącznie lokalnie i nigdy nie
zostały wypchnięte. Przyczyna jest metodyczna, nie losowa — odkładanie pushu „do
czasu pełnej kwalifikacji" przy pracy w kontenerze efemerycznym to ta sama klasa
co `git checkout` kasujący niezacommitowaną pracę, tylko piętro wyżej.

Wnioski wdrożone w tym podejściu:
1. **Push po każdym commicie**, nie po całej transzy.
2. Każda naprawa **odtworzona wykonywalnie od nowa**, nie przepisana z pamięci —
   liczby w tym dokumencie pochodzą z biegów na bieżącym kontenerze.
3. Niezależne potwierdzenie: odtworzone liczby §1 zgadzają się **co do bitu**
   z kontrprzykładem przeglądu cienia (`1.012071499245066` / `0.0`), co jest
   mocniejszym dowodem poprawności odtworzenia niż pamięć autora.

---

## 1. Macierz zamknięcia — słownik klas ZAMKNIĘTY

Dozwolone klasy (§18 audytu): `IMPLEMENTED_AND_TESTED`,
`IMPLEMENTED_WITH_KNOWN_LIMITATION`, `PROTOTYPED_WITH_MEASUREMENTS`,
`MODEL_FORM_DECISION_REQUIRED`, `BLOCKED_BY_EXTERNAL_REFERENCE`,
`NOT_REPRODUCED`, `REJECTED`.

| § | Zarzut | Klasa | Dowód wykonywalny |
|---|---|---|---|
| 1 | `delta_y` liczone wobec punktu już nadpisanego | **IMPLEMENTED_AND_TESTED** | odtworzone: faktyczne `1.012071499245066` vs raportowane `0.0` (per szyna GEN 0,0 / SYS 0,0); po naprawie `1.012071499245066`. `reinicjalizacja.py::_napiecia_odniesienia` jako funkcja CZYSTA, migawka przed mutacją |
| 2 | Re-inicjalizacja nietransakcyjna | **IMPLEMENTED_AND_TESTED** | odtworzone: topologia wycofana, `_v_zatwierdzone` rozjechane o `1.012071499245066`; po naprawie `0.0` |
| 3 | Brak zbieżności Newtona podawany jako nieistnienie | **IMPLEMENTED_AND_TESTED** | mutacja M-AUD-03 **ZABITA** (`1 failed, 30 passed`); przedtem PRZEŻYWAŁA komplet 30 testów |
| 9 | Proweniencja dowodu; łańcuch niezamykalny | **IMPLEMENTED_AND_TESTED** | rekonstrukcja z zewnątrz `43919a22be64…` vs bieg `bea5edf91b51…`; 6/6 miejsc `PrzypadekWalidacji` syntetycznych; po naprawie łańcuch bieg → pomiar → przypadek → dowód domyka się |
| 11 | Tożsamość zwarcia nieinjektywna | **IMPLEMENTED_AND_TESTED** | odtworzone: admitancje `-3.3333j` i `-20j` dzieliły `zwarcie:B:0.5`, zdjęcie jednego usuwało OBA; po naprawie drugie przeżywa |
| 13 | Kontrakty typów — liczba i przyczyna | **IMPLEMENTED_AND_TESTED** | **33 błędy w 8 plikach → 0 w 34**. Dokument przekazania podawał „21 w sześciu", a jego własne liczby cząstkowe sumowały się do 36 |
| — | P1-B55-03: kampania zależna od opcjonalnego ANDES | **IMPLEMENTED_AND_TESTED** | przed: cały plik sondy `M-KON-04` dawał `1 skipped`; po rozdziale plików **18 sond biegnie bez ANDES**, 1 skipped dotyczy wyłącznie części wzorcowej |

Pozycje w toku (uzupełniane w miarę domykania): §4, §5, §6, §8, §10, §12, §14,
§15, §16, §17 oraz P1-B55-02 i P2-B55-04.

---

## 2. Defekty znalezione PRZY OKAZJI odtwarzania zarzutów

### 2.1 Łańcuch dowodowy był strukturalnie NIEZAMYKALNY (§9)

`WynikDynamiczny` niósł wyłącznie `odcisk_scenariusza: str`; obiekt
`TozsamoscScenariusza` powstawał w prywatnej metodzie silnika i był natychmiast
zamieniany na skrót. Jego pole `parametry` to `_wejscie_zagadnienia()` — migawka
`x0`/`v0`/modeli, niedostępna z wyniku.

**Zmierzone:** najlepsza rekonstrukcja z zewnątrz `43919a22be64…` wobec
`bea5edf91b51…` z biegu. Skoro `DowodWalidacji` żąda, by
`pomiar.odcisk_scenariusza` był wśród `{p.scenariusz.odcisk}` przypadków, a
`PrzypadekWalidacji` wymaga OBIEKTU — **żaden dowód nie dawał się złożyć
z prawdziwego biegu**. Wszystkie sześć miejsc budujących `PrzypadekWalidacji`
w repozytorium to przebiegi syntetyczne.

Naprawa: `WynikDynamiczny.scenariusz` niesie OBIEKT; `__post_init__` odrzuca
niespójną parę (skrót, obiekt). `to_dict()` bez zmian, więc `odcisk_wyniku()`
istniejących biegów się nie rusza — potwierdzone: odcisk po naprawie nadal
`bea5edf91b51…`.

### 2.2 Deklaracja bramkowania ANDES była nieprawdziwa (P1-B55-03)

Nagłówek `test_wzorzec_trajektoria.py` twierdził, że `importorskip("andes")`
„obejmuje wyłącznie testy WYMAGAJĄCE wzorca", a sondy kontraktu przebiegu „NIE
są pomijane". `importorskip` na poziomie modułu przerywa jego import, więc
pomijane były WSZYSTKIE testy pliku — pozycja wywołania nie ma znaczenia.

Naprawa jest MECHANIZMEM, nie poprawką nagłówka: rozdział na
`test_wzorzec_trajektoria.py` (16 sond bez ANDES, obowiązkowych) i
`test_wzorzec_trajektoria_andes.py` (11 wymagających wzorca).

---

## 3. Pozycje decyzyjne właściciela modelu

Uzupełniane wraz z domykaniem §5, §12B i §15 — każda z pomiarem, żadna
rozstrzygnięta przez autora transzy (§21 audytu tego zabrania).

---

## 4. Czego ta transza NIE zrobiła

1. **Nie wybrała postaci żadnego ogranicznika** — §21 audytu tego zabrania.
2. **Nie podniosła żadnego statusu dowodowego** — patrz §0.
3. **Nie tknęła produkcyjnego `src/`** — cała praca w `backend/research/`,
   odizolowana strukturalnie (`research_isolation_guard`).
