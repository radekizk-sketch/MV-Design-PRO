# IRiESD ENEA Operator — mapa rozdziałów technicznych (bez przenoszenia treści)

Status: **BINDING jako mapa** (dyrektywa właściciela 2026-11-12; karta ENEA-WIEDZA 2026-11-13, grupa C).
Źródło: ENEA Operator, „Instrukcja Ruchu i Eksploatacji Sieci Dystrybucyjnej” (tekst ujednolicony),
wersja 2.3, z kartami aktualizacji do nr 45/2026 włącznie (karta 45/2026 obowiązuje od 05.10.2026;
stopka tekstu ujednoliconego: obowiązuje od 19.10.2026), 342 strony, URL:
https://www.operator.enea.pl/media/5188/iriesdtj-od-19102026pdf.pdf ,
SHA-256 pliku zaczyna się od `b63c4b97` i kończy na `4711` (pełny skrót w `STANDARDY_ENEA_INDEKS.md`).
PDF NIE jest w repozytorium.

## 1. Zakres i zasada tego pliku

IRiESD jest instrukcją ruchu, nie standardem technicznym. Ten plik jest wyłącznie mapą: dla każdego
rozdziału technicznego jedno zdanie o treści i numery punktów, żeby opis w produkcie mógł podać
podstawę numerem. Wymagania nie są tu przepisywane; produkt cytujący IRiESD podaje numer punktu
i wersję 2.3 z kartą 45/2026. Jedynymi treściami odnotowanymi wprost są punkty sprzeczne albo
uzupełniające wobec standardów technicznych ENEA (sekcja 3), bo bez nich mapa standardów byłaby
myląca.

## 2. Mapa rozdziałów

| Rozdział | Punkty | Treść (jedno zdanie) | Miejsce w produkcie, którego dotyczy |
|----------|--------|----------------------|--------------------------------------|
| I.5 | I.5.1–I.5.6 | Rejestr magazynów energii prowadzony przez ENEA Operator: co podlega wpisowi, termin wpisu, magazyn w jednostce wytwórczej, jawność rejestru, obowiązek zgłaszania zmian. | Magazyn energii w modelu ENM (dane rejestrowe — informacja w raporcie). |
| II.1 | II.1.1–II.1.44 | Zasady przyłączania: procedura, wniosek i jego załączniki (II.1.7), ekspertyza wpływu (II.1.8), treść i terminy warunków przyłączenia (II.1.9–II.1.11), uzgodnienia z OSP (II.1.14–II.1.16), odmowa i jej skutki (II.1.17–II.1.19), umowa o przyłączenie (II.1.20–II.1.21), mikroinstalacje (II.1.22–II.1.25), kontrole (II.1.27–II.1.28), dane do analiz (II.1.33), prosumenci zbiorowi i wirtualni (II.1.38–II.1.44). | Wniosek do OSD i warunki przyłączenia (`application/analyses/wniosek_osd.py`), ekspertyza wpływu przyłączenia. |
| II.4.1 | II.4.1.1–II.4.1.8 | Wymagania ogólne dla przyłączanych urządzeń, instalacji i sieci oraz zasady dla urządzeń istniejących i odstępstw technologicznych. | Ocena zgodności przyłączenia (ogólnie). |
| II.4.2 | II.4.2.1–II.4.2.2 | Wymagania dla urządzeń odbiorców przyłączanych do 110 kV, SN i nN oraz warunki stosowania automatyki przez odbiorców. | Odbiory w modelu ENM. |
| II.4.3 | II.4.3.1–II.4.3.3 | Wymagania dla jednostek wytwórczych: odesłanie do wymagań ogólnego stosowania (NC RfG) i wymagania dla jednostek innych niż objęte kodeksem. | Ocena zgodności NC RfG (`application/ncrfg_compliance`). |
| II.4.4 | II.4.4.1–II.4.4.8 | Połączenia międzysystemowe i linie bezpośrednie: warunki budowy, wyposażenie, czasowe wyłączenie, brak wpływu na sieć. | Nie modelowane (informacja). |
| II.4.5.1 | II.4.5.1.1–II.4.5.1.19 | Wymagania ogólne EAZ: czasy działania, koordynacja nastaw przez ENEA Operator, selektywność, zabezpieczenia podstawowe i rezerwowe, źródła napięcia pomocniczego, kontrola ciągłości obwodów, rejestratory, sygnalizacje. | Dobór nastaw i selektywność (`application/protection_settings/engine.py`). |
| II.4.5.2 | II.4.5.2.1–II.4.5.2.6 | EAZ sieci 110 kV: linie 110 kV, rozwiązania po stronie 110 kV w GPO, szyny zbiorcze, lokalna rezerwa wyłącznikowa, łączniki szyn. | Informacja (strona 110 kV jest równoważnikiem obliczeniowym — decyzja właściciela 2026-11-12). |
| II.4.5.3 | II.4.5.3.1–II.4.5.3.2 | EAZ transformatorów 110 kV/SN/SN oraz transformatorów o górnym napięciu SN. | Pole transformatora w GPZ, nastawy zabezpieczeń transformatora. |
| II.4.5.4 | II.4.5.4.1–II.4.5.4.7 | EAZ sieci SN: wymagania ogólne z zalecanymi współczynnikami czułości i nastawami (II.4.5.4.1), pola linii bez generacji, z generacją i wyłącznie z generacją (II.4.5.4.2), pola potrzeb własnych i uziemiające z dławikiem albo rezystorem (II.4.5.4.3), baterie kondensatorów (II.4.5.4.4), łączniki szyn (II.4.5.4.5), pola pomiaru napięcia (II.4.5.4.6), automatyki rozdzielni SN: SCO, SPZ/SCO, LRW, zabezpieczenie szyn, SZR (II.4.5.4.7). | Dobór nastaw SN, szablony pól GPZ (`network_model/catalog/bay_templates.py`), `STANDARD_ENEA_GPZ_Z1.md` E-19…E-22 i E-38…E-52. |
| II.4.5.5 | II.4.5.5.1–… | EAZ jednostek wytwórczych: zakaz przyłączania jednostek wyposażonych wyłącznie w zabezpieczenia wbudowane i wymagane funkcje zabezpieczeń. | Pole OZE w GPZ i w stacji SN, ocena zgodności przyłączenia źródła. |
| II.4.5.6 | II.4.5.6.x | Wybrane zagadnienia eksploatacji EAZ. | Informacja. |
| II.4.6 | II.4.6.1–II.4.6.10 | Nadzór i telemechanika: stacje bezobsługowe, systemy stacyjne i dyspozytorskie, zakres telemechaniki rozdzielni 110 kV i SN, porty i protokoły, wymiana danych z OSP. | Informacja (telemechanika nie jest modelowana obliczeniowo). |
| II.4.7 | II.4.7.1–II.4.7.4 | Układy pomiarowo-rozliczeniowe: wymagania ogólne i kategorie A, B, C. | Pole pomiaru rozliczeniowego (Zeszyt 2 E2-10, „Układy pomiarowe energii elektrycznej”). |
| II.4.8 | II.4.8.1–II.4.8.3 | Systemy teletransmisyjne: utrzymanie infrastruktury, współpraca z sąsiednimi operatorami, dostosowanie infrastruktury. | Informacja. |
| II.4.9 | II.4.9.1 | Urządzenia kontroli synchronizmu przy łączeniach. | Informacja (łączenie źródeł i sieci). |
| II.5 | II.5.1–II.5.5 | Dane przekazywane do ENEA Operator: zakres (II.5.1), stan istniejący — węzły, linie, transformatory, jednostki wytwórcze (II.5.2), prognozy (II.5.3), dane pomiarowe stanu pracy (II.5.4), zdalne pozyskiwanie danych (II.5.5). | Eksport danych modelu do wniosku i do OSD (dane linii, transformatorów, źródeł). |
| IV.8 | IV.8.1–IV.8.3 | Optymalizacja pracy sieci z wykorzystaniem magazynowania energii u użytkowników (obowiązuje do 31.12.2027): postanowienia ogólne, wymagania techniczne, katalog produktów. | Magazyn energii (informacja w raporcie). |

## 3. Punkty sprzeczne albo uzupełniające wobec standardów technicznych ENEA

| Nr | Punkt IRiESD | Standard techniczny | Opis |
|----|--------------|---------------------|------|
| LI-01 | II.4.5.4.7.1 ppkt 1 | Zeszyt 1 §26.9.3 (`STANDARD_ENEA_GPZ_Z1.md` E-42, L-04) | IRiESD: SCO nie uruchamia się w liniach z przyłączonymi jednostkami wytwórczymi i nie instaluje w rozdzielniach SN GPO; Zeszyt 1 przewiduje SCO także w polach linii z generacją. Sprzeczność. |
| LI-02 | II.4.5.4.7.1 ppkt 2 | Zeszyt 1 §26.10.6 (E-50, L-05) | IRiESD: SPZ/SCO tylko w uzgodnieniu z ENEA Operator; Zeszyt 1 opisuje funkcję bez tego warunku.  Warunek dotyczy automatyki SPZ/SCO rozdzielni, nie SPZ (ANSI 79) wyłącznika liniowego — ten poza GPZ reguluje decyzja właściciela 2026-11-14 (`STANDARD_ENEA_LINIE_NAPOWIETRZNE_SN.md` §3 pkt 5). |
| LI-03 | II.4.5.4.2.1 ppkt 3 | Zeszyt 1 §26.10.1 (E-45, L-06) | IRiESD: automatyka wielokrotnego SPZ z programowaniem i blokowaniem dla pól linii napowietrznych i napowietrzno-kablowych SN; Zeszyt 1 mówi o SPZ jedno- albo dwukrotnym. |
| LI-04 | II.4.5.4.7.1 ppkt 4 | Zeszyt 1 §26.9.9 (E-19) | IRiESD uzupełnia: zabezpieczenie szyn zbiorczych SN (różnicowe poprzeczne albo nadprądowo-logiczne) działa w czasie nie dłuższym niż 0,3 s i wyłącza także linie z elektrowniami lokalnymi. |
| LI-05 | II.4.5.4.7.1 ppkt 3 i 5, II.4.5.4.7.2 | Zeszyt 1 §13, §26.10.2, §26.10.5 (E-35, E-46, E-49) | IRiESD uzupełnia: LRW wyłącza także linie z elektrowniami lokalnymi; SZR zakazany w rozdzielniach SN GPO; przy jednostkach wytwórczych SZR z kontrolą napięcia szczątkowego (zalecane) albo wyłączenie linii z generacją przed załączeniem rezerwy. |

Hierarchia: IRiESD zatwierdza Prezes URE, standardy techniczne są dokumentami wewnętrznymi
operatora. Przy sprzeczności LI-01 produkt nie wybiera strony — zapis idzie do rejestru konfliktów
przy wpięciu automatyki i do decyzji architekta.

## 4. Mapa wdrożenia — miejsca w kodzie (stan `main` 2026-11-13, odczyt bez edycji)

Ścieżki względem `mv-design-pro/backend/src/`.

| Punkt | Miejsce w kodzie | Stan |
|-------|------------------|------|
| II.4.5.4.2.1 ppkt 3 | `application/protection_settings/engine.py:98`–`:99` | Sprzeczne: SPZ włączony domyślnie dla każdego pola liniowego, także kablowego; IRiESD i Zeszyt 1 wiążą SPZ z liniami napowietrznymi i napowietrzno-kablowymi. |
| II.4.5.4.7.1 ppkt 4 | `application/protection_settings/engine.py` | Do wpięcia: kryterium 0,3 s dla zabezpieczenia szyn SN nie jest oceniane. |
| II.1.7–II.1.9 | `application/analyses/wniosek_osd.py` | Do wpięcia jako podstawa numeryczna w opisie wniosku. |
