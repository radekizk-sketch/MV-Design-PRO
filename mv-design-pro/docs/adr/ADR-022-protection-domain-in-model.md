# ADR-022: Domena zabezpieczeń w modelu — IED, funkcje, grupy nastaw, trip matrix; jedna fizyka; TCC jako projekcja

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; wariant D-34 werdyktu właściciela: domena zabezpieczeń jako warstwa ASSET modelu ENM addytywnie, przypadek wybiera grupę nastaw albo nakłada override jako deltę scenariusza rozwiązywaną w `EffectiveNetworkSnapshot` — Core Rule #4 doprecyzowana, nie złamana; klasa blokad V11 `relay.*`/`field.*` zdjęta jedną kartą (V12K-342); `ProtectionCapabilityRegistry` pierwszym artefaktem (W4-0 po PROT-LTI albo na literale „LTI”, O-69); rozszerzenia solverów (67/67N, 87T, admitancyjne) PLANNED, poza v1)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`

## Kontekst
Nastawy poza modelem w ścieżce użytkownika (kreator bez nastaw, zapis do ENM zablokowany, nastawy w przypadku i w body żądania), fantomowe nastawy w szufladzie SLD, 5 implementacji fizyki IDMT (3 poza solverem), brak IED/trip matrix/logiki, 67 bez modelu kierunku, katalog przekaźników z fikcyjnymi kartami, trace = jeden aparat po porządku identyfikatorów (A4-01…08, A4-13).

## Decyzja
`ProtectionDevice` (IED z katalogu), `ProtectionFunction` (kod ANSI, wejścia z rdzeni CT/uzwojeń VT, kierunek i polaryzacja), `SettingGroup` (1–4, rewizjonowane), `TripMatrix` (stopień → aparaty, CBF), `Interlock`, `SpzScheme`, `CtCore` — w warstwie ASSET modelu; przypadek/scenariusz **wybiera grupę lub nakłada override** (delta). Jedna fizyka krzywych w `network_model/solvers/protection_*` (rozszerzona o kierunkowość, kryteria admitancyjne, 87T, funkcje progowe); TCC i koordynacja to projekcje modelu i aktywnych biegów; `trace_protection` per element (SN+nN, FUSE/MCB/gG jako aparaty wyłączające) wyznaczany z kierunku przepływu.

## Konsekwencje
- Rewizja Core Rule #4 (Case = parametry): nastawy bazowe są danymi assetu; przypadek nadal nie mutuje modelu (delta).
- Kasacja duplikatów fizyki, łańcucha PR-26…31, `validate_selectivity`, fantomu w szufladzie; katalog IED bez „ACME/REX".
- Klasa atrybutów PROTECTION_SETTINGS w grafie zależności (zmiana nastawy nie unieważnia rozpływu).

## Alternatywy odrzucone
- Nastawy wyłącznie w przypadku (dzisiejsze rozwiązanie): raport, SLD i koordynacja czytają różne prawdy.

## Aktualizacja 2026-11-04 — wdrożenie jednej struktury (karta OCHRONA-JEDNO-ZRODLO)
Dyrektywa właściciela 2026-11-04: jedna konfiguracja zabezpieczeń w całym systemie; zmiana nastawy w karcie pola aktualizuje obliczenia, schemat, ocenę wytrzymałości i raport bez kopii; model obsługuje od razu wszystkie funkcje, w tym ziemnozwarciowe.

**Jedna struktura w ENM** — sterownik pola `ProtectionAssignment` (`backend/src/enm/models.py`): `bay_ref` (najwyżej jeden sterownik na pole; sterownik wyłącznika liniowego bez pola), `catalog_ref` (wyrób z katalogu `protection-device`) rozdzielony od `charakterystyki_ref` (profil charakterystyk analitycznych), `prad_znamionowy_wejscia_a` (1 A / 5 A), `wejscia` (`ct_ref`, `vt_ref`, `i0_uklad` Holmgreen/Ferranti z `i0_ct_ref`, `u0_uklad` z `u0_vt_ref`, `ct_strony_2_refs` dla 87T/87L), `funkcje` (`ref`, `kod` z rejestru, `wlaczona`), `grupy_nastaw` 1–4 (`funkcja_ref` → nastawy `klucz`/`wartosc`/`pochodzenie`), `aktywna_grupa`, `macierz_wyzwolen` (`funkcja_ref` → `aparat_refs`, `pobudza_spz`). Dawne pola (`Bay.protection_codes`, `Bay.protection_ref`, `ProtectionAssignment.breaker_ref`, `device_type`, `settings`, `Bay.protection_config`) skasowane bez warstwy zgodności; archiwum projektu w wersji 4.0.0; fikstury, szablony i harness wygenerowane na nowo. Przypadek wybiera grupę albo nakłada override jako delta scenariusza w `EffectiveNetworkSnapshot`: `OperatingScenario.protection_groups` (sterownik → grupa 1–4) i `protection_overrides` (sterownik → funkcja → nastawa ze schematu rejestru), nakładane przez `apply_scenario` na świeżą migawkę (model bazowy bez zmian), sprawdzane tą samą regułą zapisu `bledy_sterownika` (sprzeczność = scenariusz nie przystaje, 422), w treści i hashu scenariusza wyłącznie, gdy niepuste. Zapis: `POST /api/scenariusze-laczeniowe/study-cases/{case_id}`; bieg ze scenariuszem liczy t_b na migawce efektywnej, a ocena wytrzymałości aparatury tego biegu czyta czas wyłączenia pól z TEJ SAMEJ migawki (koperta biegu → `apply_scenario`; scenariusz biegu nieobecny w magazynie = 409, nigdy cichy powrót do modelu bazowego) — `backend/tests/api/test_przypadek_zabezpieczen_scenariusz_api.py`. Aktywna grupa jest polem wymaganym: brak to sprzeczność zapisu, nie zastępcza grupa 1.

**Rejestr funkcji generyczny** — `network_model/catalog/funkcje_eaz.py` (`FunkcjaEaz` ze schematem nastaw `SchematNastawy`, wejściami wymaganymi i opcjonalnymi oraz ewaluatorem `ocena`) i lustro frontu `ui/shared/slownikFunkcjiEaz.json` (parytet testem). Walidacja zapisu (`enm/nastawy_zabezpieczen.py`), operacje (`update_protection_settings`, `add_relay`), odczyt pola, karta pola, edytor nastaw E-27 i blok przekaźnika na schemacie czytają rejestr; funkcja dopisana wyłącznie do rejestru przechodzi przez model, API, kartę pola i schemat (`backend/tests/api/test_funkcja_tylko_w_rejestrze_api.py`, `frontend/src/ui/shared/__tests__/funkcjaTylkoWRejestrze.test.tsx`).

**Czas wyłączenia** — t_k pola = czas zadziałania z nastaw sterownika TEGO pola (rdzeń IEC 60255 przez `ocena_nadpradowa.czas_urzadzenia`) + czas własny wyłącznika z macierzy wyzwoleń (karta katalogowa albo wartość robocza 0,06 s z jawnym źródłem, zasada nr 4). Pole bez czynnego sterownika: czas nieustalony z powodem; ręczny czas z konfiguracji stacji w widoku wytrzymałości skasowany.

**Funkcje bez ewaluatora** (ziemnozwarciowe 50N/51N/67N/Yo>/Go>/59N, kierunkowe 67/32, różnicowe 87T/87L, odległościowe 21, 46, 49, automatyka, blokady, technologiczne) — modelowane w pełni (nastawy ze schematu, wejścia 3I0/3U0), a ocena zwraca je w `funkcje_nieoceniane` z powodem (status nie oceniono); widoczne w edytorze nastaw i w raporcie koordynacji (sekcja „Funkcje bez oceny"). Ewaluatory ziemnozwarciowe — osobna karta solvera (wymaga rozkładu 3I0 w sieci izolowanej i kompensowanej, którego dziś nie ma).

## Aktualizacja 2026-11-05 — czas trwania zwarcia i delty przypadku (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN)

- Wybór zabezpieczeń przypadku (grupa nastaw albo nadpisanie) jest deltą scenariusza rozstrzyganą
  w `EffectiveNetworkSnapshot`; nastawy BAZOWE zostają danymi ENM. Rewizja wyboru wchodzi do
  opcji biegu, a predykat świeżości biegu porównuje ją z bieżącą rewizją wyboru przypadku.
- Czas trwania zwarcia do oceny cieplnej SN ma JEDNO rozstrzygnięcie
  (`network_model.catalog.wartosci_robocze.rozstrzygnij_czas_trwania_zwarcia`): wartość
  projektanta na łączniku pola albo wyłączniku chroniącym (`czas_wylaczenia_zwarcia_s`) > czas
  z nastaw zabezpieczenia i czasu własnego wyłącznika > czas cieplny przypadku, gdy przypadek go
  jawnie podaje (wyłącznie przewody) > wartość robocza 1 s (IEC 62271-1 §4.7, `ESTIMATED`,
  kompletność dowodu `NIEPELNY`). Przypisanie zabezpieczenia NIE jest wymagane do oceny cieplnej —
  jego brak zmienia źródło czasu, nie blokuje oceny; kody gotowości z nastaw zostają wyłącznie
  przy zabezpieczeniu przypisanym, którego nastawy nie dają czasu.
- Ten sam atrybut aparatu niesie rodzaj obwodu nN (`rodzaj_obwodu_nn`) — jedna klasyfikacja dla
  I²t i werdyktu SWZ. Oba atrybuty są poza odciskiem modelu, gdy nie mają wartości.
