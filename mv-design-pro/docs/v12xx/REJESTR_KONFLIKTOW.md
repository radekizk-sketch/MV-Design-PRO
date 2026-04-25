# Rejestr konfliktow V12.xx

Status: aktywny  
Cel: jawne rozstrzyganie sprzecznosci miedzy promptem, dokumentami aktywnymi, archiwum i kodem

## Regula pierwszenstwa

1. Najnowsze polecenie uzytkownika.
2. Kanon V12.xx w `docs/v12xx/KANON_V12_XX.md`.
3. Zasada SLD jako osi systemu.
4. Zasada ENM jako jedynego zrodla prawdy.
5. Zasada wyniku z uzasadnieniem.
6. Zasada 100% polskiego UI.
7. Aktywne dokumenty V12.5 wymienione w indeksie kanonicznym.
8. Dokumenty historyczne i archiwalne.

## Tabela konfliktow

| Kod | Konflikt | Zrodla | Decyzja | Wplyw na architekture | Wplyw na migracje | Koszt |
|---|---|---|---|---|---|---|
| V12K-001 | Aktywny kanon V12.5 w indeksie vs finalny kanon V12.xx | `INDEX_KANONICZNY.md`, plan V12.xx | `docs/v12xx/` staje sie nadrzednym kanonem kierunkowym. V12.5 zostaje fundamentem przejsciowym. | Indeks ma wskazywac V12.xx jako warstwe nadrzedna. | M0 identyfikuje zaleznosci V12.5. | niski |
| V12K-002 | Katalog `docs/spec` zawiera luki historyczne, ale nie jest aktywnym kanonem | Archiwum, audyty spec-vs-code | Kazde uzycie tresci z katalogu `docs/spec` wymaga wpisu konfliktu i decyzji. | Zmniejsza ryzyko drugiego kanonu. | M0 oznacza materialy historyczne. | niski |
| V12K-003 | Obecne `enm_version=1.0` vs wymagane ENM v2.0 | Kod ENM, plan V12.xx | ENM v2.0 powstaje przez migracje M0->M4. | Dodaje byty wariantow, migawek lacznikowych, profili i automatyki. | M1 projekcja, M2 single-write, M3 odciecie, M4 czyszczenie. | wysoki |
| V12K-004 | Lokalny stan formularzy vs ENM jako prawda | UI, plan V12.xx | Draft UI jest nietrwalym stanem roboczym. Tylko walidowany zapis trafia do ENM. | Formularze dostaja kontrakt draft vs committed. | M0 znajduje formularze z ryzykiem lokalnej prawdy. | sredni |
| V12K-005 | Wariant pracy vs migawka stanow lacznikowych | Plan V12.xx, obecne przypadki | Wariant jest scenariuszem, migawka lacznikowa jest wykonawczym stanem obliczenia. | Wynik referencjonuje oba byty. | Migracja rozdziela pola i adaptery. | sredni |
| V12K-006 | Trzy solvery rozplywu jako rownorzedne vs jeden wynik kanoniczny | Wymaganie NR/GS/FD | Newton-Raphson jest kanoniczny; GS diagnostyczny; FD wydajnosciowy przy warunkach stosowalnosci. | Result contract zawiera solver mode i applicability. | Testy porownawcze w M2. | sredni |
| V12K-007 | Dark SCADA ekranowy vs raporty i wydruki | UI, raporty | Ekran ma dark SCADA, eksport ma jasny techniczny motyw. | Wspolna semantyka kolorow, osobne renderery. | Brak migracji danych. | niski |
| V12K-008 | Automatyka jako dodatek do przekaznika vs byt pierwszej klasy | Material EAZ, obecny model | Automatyka jest osobnym modelem domenowym. | ENM v2.0, UI i raporty dostaja modele SPZ/SZR/SCO/FDIR i slady zadzialan. | M2 wprowadza zapis do ENM v2. | wysoki |
| V12K-009 | Wynik oparty tylko o `catalog_ref` vs reprodukowalnosc po zmianie katalogu | Katalogi, raporty | Kazdy run ma snapshot katalogowy i zmaterializowane parametry. | Result contract i raport zawieraja hash katalogu. | M1 generuje snapshoty przy nowych runach. | sredni |
| V12K-010 | Severity rozproszone w domenach vs jeden slownik blokad | Walidacje, raporty | Wspolny slownik severity jest kanoniczny. | Gotowosc i raport uzywaja jednej taksonomii. | M2 mapuje stare severity do nowego slownika. | sredni |
