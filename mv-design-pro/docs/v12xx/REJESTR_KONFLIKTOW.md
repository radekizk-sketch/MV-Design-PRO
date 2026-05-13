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
| V12K-011 | `CLAUDE.md` + `SYSTEM_SPEC.md` + `PLANS.md` wskazywaly `docs/spec/` jako SOURCE OF TRUTH (priorytet 1), co lamie V12K-001 (V12.xx jest kanonem nadrzednym) | `CLAUDE.md` (do 2026-05-13), `SYSTEM_SPEC.md` v4.0, `PLANS.md` v5.0 | Zaktualizowano hierarchie 2026-05-13: V12.xx wygrywa, `docs/spec/` formalnie ARCHIWALNE. `CLAUDE.md`, `SYSTEM_SPEC.md`, `PLANS.md` zaktualizowane do v4.1 / v5.1. Pointery do `docs/spec/` oznaczone jako "ARCHIVAL" w SYSTEM_SPEC § 0.1. | Brak — czysta aktualizacja meta-dokumentow. | M0 nie wymagana — zmiana czysto tekstowa. | niski |
| V12K-012 | Audyty zamkniete (24+ plikow w `docs/audit/` + 9 w `docs/audits/` duplikacie) blokuja nawigacje aktywnego kanonu | Inwentaryzacja `DOC_INVENTORY_2026-05.md` | Fizyczne przeniesienie do `docs/audit/archive/2026-05/`. Aktywne audyty pozostaja w `docs/audit/`. Duplikat `docs/audits/` skonsolidowany do `docs/audit/`. | Brak — archiwum jest tylko porzadkujace. | M0 dokumentuje archiwizacje. | niski |
| V12K-013 | Frontend SLD odbierany jako "atrapa z klockow" mimo kompletu features (3 rownolegle pipeline'y, brak port-based routing, brak LOD, brak eksportu) | Audyt `AUDYT_BRAKI_2026-05.md` § 7 | Stworzenie `SLD_INDUSTRIAL_SPEC_v1.md` + `PLAN_SLD_REWORK.md` (fazy F1-F5). Konsolidacja `GpzSwitchgearRenderer.tsx` (3392 linii) + `GpzCanonicalRenderer.tsx`. Implementacja port-based routing, LOD, eksportu, ring/double busbar primitives. | UI klasy przemyslowej (ETAP/DIgSILENT/ABB grade). | F1: biblioteka symboli IEC 60617; F2: layout engine z port routing; F3: LOD + warstwy; F4: overlay redesign; F5: visual regression w CI. | wysoki |
| V12K-014 | Protection blokowane na poziomie solver_input (stub SI-100 w `eligibility.py:169`) — bramka P0 dla pelnego E2E | Audyt `AUDYT_BRAKI_2026-05.md` § 8 | Implementacja protection-input-builder oparta o `protection_engine_v1.py`. Usuniecie stuba SI-100. | UI Protection nieblokujace, pelne E2E. | Plan E2E § 3.2. | sredni |
| V12K-015 | Proof packs `VDROP` + `Earthing/Ground Fault SN` brakuje (enum zdefiniowany w `ProofType`, brak implementacji w `packs/`) | Audyt `AUDYT_BRAKI_2026-05.md` § 6 | Implementacja `packs/vdrop.py` + `packs/earthing_ground_fault_sn.py`. Bramka audyt2 grounding + dobor przewodow. | Raport koncowy kompletny. | Plan E2E § 3.4. | sredni |
