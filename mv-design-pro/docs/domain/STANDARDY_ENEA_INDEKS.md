# Standardy ENEA Operator — indeks dokumentów źródłowych i plików wiedzy

Status: **BINDING** (dyrektywa właściciela 2026-11-12, Zasada nr 5 w `CLAUDE.md`; karta ENEA-WIEDZA
2026-11-13, grupa C). Indeks wymienia wszystkie 25 standardów technicznych opublikowanych na stronie
standardów ENEA Operator i IRiESD (razem 26 pozycji, w tym jedna wersja zastąpiona), z metryką
pobranego pliku, pełnym skrótem SHA-256 i plikiem wiedzy w `mv-design-pro/docs/domain/`, który dany
dokument odwzorowuje. PDF-y NIE są w repozytorium (prawa ENEA); skrót SHA-256 pozwala potwierdzić,
że plik wiedzy opisuje właśnie tę wersję.

Strona źródłowa (dostęp 2026-11-13):
https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji ,
IRiESD: https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd .

## 1. Dokumenty, wersje i pliki wiedzy

Kolumna „Plik wiedzy”: pliki grupy C istnieją w tej wersji repozytorium; pliki grup A i B (stacje
SN/nN i ZKSN; linie i przyłącza) powstają w równoległych kartach tej samej partii — nazwy podane
w nawiasie kwadratowym są nazwami roboczymi z drzew tych kart i podlegają uzgodnieniu przy scalaniu
partii (sesja główna aktualizuje ten indeks razem ze scaleniem).

| Nr | Dokument | Wersja | Obowiązuje od | Uchwała Zarządu | Stron | SHA-256 | Plik wiedzy |
|----|----------|--------|---------------|-----------------|-------|---------|-------------|
| 1 | Stacje 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN | 02.2023-2 | 02.04.2024 | 148/2023, zm. 7/2024 | 99 | `467547d5b32bdad0534208f3870484f48663a862368b49b27c6ce92f164ba488` | `STANDARD_ENEA_GPZ_Z1.md` |
| 2 | Stacje 110 kV, Zeszyt 2 — stacje jednotransformatorowe 110 kV/SN | 09.2022 | 01.01.2023 | 364/2022 | 16 | `9e53bf353c6b8a76f819188758ec03e1322c136d95dac83037ab5b45e3c9caad` | `STANDARD_ENEA_GPZ_Z2.md` |
| 3 | Stacje 110 kV, Zeszyt 3 — rozdzielnie sieciowe 110 kV | 09.2022 | 01.01.2023 | 364/2022 | 14 | `bb4d19afb0973802c1b7a1245c89399e819c946399772b7c728314fcfcec4ad2` | `STANDARD_ENEA_RS110_Z3.md` |
| 4 | Stacje 110 kV, Zeszyt 7 — rozwiązania konstrukcyjno-budowlane | 05.2024 | 01.01.2025 | 280/2024 | 25 | `57816ef98d1ff6719022a2c59bb983b3be0d0acb4cce247153f64220a6c8bc29` | `STANDARD_ENEA_GPZ_Z7.md` |
| 5 | Napowietrzna aparatura WN prądu przemiennego | 09.2022-2 | 02.04.2024 | 364/2022, zm. 7/2024 | 22 | `6f9f19cdb0806e09d6ec90ba93756e358dda9621c397524d66b3e0936c8dfa34` | `STANDARD_ENEA_APARATURA_WN.md` |
| 6 | Elektroenergetyczne linie napowietrzne i kablowe 110 kV | 06.2026 | 01.10.2026 | 299/2026 | 49 | `8aacbe4ab5bbd8094363003227c4316f7c1c700eaff8dd5b71d90e827b85670e` | `STANDARD_ENEA_LINIE_110KV.md` |
| 6z | Linie napowietrzne i kablowe 110 kV — wersja ZASTĄPIONA przez pozycję 6 | 01.2024 | 01.07.2024 | 112/2024 | 47 | `c3fae7b690128a25ebdd7fb3e85fb211a405336af3b2095729e17fffef2ef98d` | brak osobnego pliku — odnotowana w `STANDARD_ENEA_LINIE_110KV.md` (porównanie wartości kluczowych) |
| 7 | Stacje SN, Zeszyt 1 — stacje kompaktowe prefabrykowane SN/nn do 630 kVA oraz złącza/szafy kablowe SN | 06.2024 | 01.01.2025 | 372/2024 | 37 | `063b53724cc97a20e530f15f9b56fd8c070dcf3c46d5282a78703e2685837d28` | grupa A [`STANDARD_ENEA_SN_Z1_KOMPAKTOWE_ZKSN.md`] |
| 8 | Stacje SN, Zeszyt 2 — stacje kompaktowe SN/nn do 400 kVA uproszczone | 06.2024 | 01.01.2025 | 372/2024 | 19 | `981d710a63f9f942e34da32217391244184a60f81bdb1f7a9c4f794a63f55cd3` | grupa A [`STANDARD_ENEA_SN_Z2_UPROSZCZONE.md`] |
| 9 | Stacje SN, Zeszyt 3 — stacje słupowe SN/nn | 06.2021-2 | 02.04.2024 | 211/2021, zm. 7/2024 | 76 | `230de3063c6825630c2b25e0c42c276f5234d9ca1d1fb3bd03e7a3be17c5558e` | grupa A [`STANDARD_ENEA_SN_Z3_SLUPOWE.md`] |
| 10 | Stacje SN, Zeszyt 4 — moduł bilansujący systemu AMI (skan bez warstwy tekstowej) | nieustalona (skan) | nieustalona | nieustalona | 17 | `2b3735afc6c6ef0661599483669735b580123d3f194b05d59f19aa6e733a306f` | grupa A (odczyt wzrokowy) |
| 11 | Stacje SN, Zeszyt 6 — stacje wnętrzowe SN/nn w budynkach | 10.2023 | 01.03.2024 | 495/2023 | 17 | `aa0e10c792096c8381767828f062af7ee6d04745b6bff2efb84daa7946b8e647` | grupa A |
| 12 | Linie i stacje SN — Telemechanika (zastępuje Zeszyt 5 SN) | 12.2025 | 01.02.2026 | 8/2026 | 18 | `d995de385055be9c1d23728bd07f53146e777c299dc57445f3297b9236d8f612` | grupa A |
| 13 | Katalog standardowych sygnałów, pomiarów i sterowań telemechaniki obiektowej | zmiana z 04.05.2022 | 16.05.2022 | zatwierdzenie Dyrektora Departamentu Zarządzania Ruchem | 40 | `eb4ae8cc6f81c18b186e056848925520db537e5dbb66bf6bc74c1763a877e3c7` | grupa A (część dotycząca stacji i ZKSN) |
| 14 | Elektroenergetyczne linie napowietrzne SN | 01.2026 | 16.03.2026 | 76/2026 | 331 | `f1b097e5aa8e8cd264a94acd73147bbeed66012c0f8ecb125f4cb6b300aabf11` | grupa B [`STANDARD_ENEA_LINIE_NAPOWIETRZNE_SN.md`] |
| 15 | Elektroenergetyczne linie kablowe SN | 03.2026 | 01.07.2026 | 202/2026 | 70 | `a4f4f474720a24fc421988eb0a7fbdaa25f887175ae3ca59d055407aec804afe` | grupa B [`STANDARD_ENEA_LINIE_KABLOWE_SN.md`] |
| 16 | Pomiary i diagnostyka linii kablowych WN i SN | 02.2026 | 01.07.2026 | 203/2026 | 19 | `3ac5c2847e6de9d049a47b87f650af338aae7bd3e6e669369f3e863f32b21b8c` | grupa B |
| 17 | Elektroenergetyczne linie kablowe nN | 05.2025 | 01.10.2025 | 310/2025 | 65 | `7329a3d063ca08a2460c107014b16937529a12e83db79ca0e048cb1cde1071a9` | grupa B |
| 18 | Elektroenergetyczne linie napowietrzne nN | 09.2025 | 01.04.2026 | 33/2026 | 15 | `d30db11fe4d95a7a2dc4d440d1981326b698c5ad17897f0dc453b8df0093d4e1` | grupa B |
| 19 | Elektroenergetyczna sieć kablowa nN 0,4 kV — wytyczne projektowania i budowy (skan) | nieustalona (skan) | nieustalona | nieustalona | 10 | `a06b4d8a07eb3df97360258105a0079196d1f299da60c5a2ba95ebf29b7428ee` | grupa B (odczyt wzrokowy) |
| 20 | Szafy kablowe oraz złącza kablowe nN z układem pomiarowo-rozliczeniowym | 08.2023 | 01.02.2024 | 5/2024 | 32 | `aa2c11895bc05624ae3f525386a1c03e9c49102eba848966ba6f3ca9742930d2` | grupa B |
| 21 | Układy pomiarowe energii elektrycznej | 05.2022-2 | 02.04.2024 | 179/2022, zm. 7/2024 | 36 | `3d514abf3f507176e158d165a59195c88cbfee90419105d5c30a0d2522e69db6` | grupa B |
| 22 | Ochrona przed porażeniem prądem elektrycznym w sieci SN | 05.2025 | 01.10.2025 | 311/2025 | 22 | `45887d39610ef8a75a637fa2f2475917bb7fd9019b2135fe8ba2ca7a4b8aa405` | grupa B |
| 23 | Budowa układów uziomowych w sieci dystrybucyjnej | 05.2025 | 01.10.2025 | 311/2025 | 17 | `82733e56bf33ad0611f420266f3da930ef15ab1255853a826ae4a0a00a02a606` | grupa B |
| 24 | Tablice i znaki bezpieczeństwa oraz tablice identyfikacyjne (skan) | nieustalona (skan) | nieustalona | nieustalona | 19 | `db8ea6a1707e126d83d33b9bf39a9e59994d0986b6e026f18c7a99b48a75880d` | grupa B (spis i oznaczenia na schemacie) |
| 25 | Instrukcja Ruchu i Eksploatacji Sieci Dystrybucyjnej (tekst ujednolicony) | 2.3 z kartami aktualizacji do nr 45/2026 | karta 45/2026 od 05.10.2026 (stopka tekstu: 19.10.2026) | zatwierdzenie Prezesa URE (IRiESD I.1.15; nie uchwała Zarządu) | 342 | `b63c4b97298b67aa90383f1b81028fe29de96f3f100c45b645bca66e2d1b4711` | `STANDARD_ENEA_IRIESD_MAPA.md` (wyłącznie mapa rozdziałów technicznych) |

Liczba stron z `pdfinfo` pobranego pliku. Pozycje 10, 19 i 24 to skany bez warstwy tekstowej —
wersji, daty i uchwały nie da się ustalić bez odczytu wzrokowego; odczyt należy do grup A i B.
Na stronie standardów nie ma osobnego standardu przyłączania OZE i magazynów energii ani standardu
zabezpieczeń sieci SN poza §26 Zeszytu 1 110 kV — podstawą dla nich jest IRiESD II.4.3, II.4.5.4
i II.4.5.5 oraz `STANDARD_ENEA_GPZ_Z1.md` E-38…E-52.

Zeszyt 1 standardu 110 kV wymienia w spisie serii także Zeszyt 4 „Systemy ochrony technicznej”,
Zeszyt 5 „Węzeł teletransmisyjny” i Zeszyt 6 „Telemechanika”; żaden z nich nie występuje na publicznej
stronie standardów (inwentarz pobrania 2026-11-13), więc produkt nie ma dla nich pliku wiedzy
(`STANDARD_ENEA_GPZ_Z1.md` E-57). Uzupełnieniem dla telemechaniki GPZ jest IRiESD II.4.6.

## 2. Obiekt sieci → dokument i punkt

Mapa zweryfikowana grepem numerów punktów w tekście pobranych plików (2026-11-13). Punkty
dokumentów grup A i B są tu adresem źródła; treść wymagań należy do ich plików wiedzy.

| Obiekt sieci w produkcie | Dokument (nr z tabeli 1) | Punkty | Plik wiedzy |
|--------------------------|--------------------------|--------|-------------|
| GPZ dwutransformatorowy 110 kV/SN — układ, aparatura SN, parametry znamionowe | 1 | §8.2 (tab. 4, tab. 5), §9.1, §10.1, §13 | `STANDARD_ENEA_GPZ_Z1.md` |
| Zabezpieczenia i automatyka pól SN w GPZ | 1; 25 | Z1 §26.9, §26.10; IRiESD II.4.5.4 | `STANDARD_ENEA_GPZ_Z1.md`, `STANDARD_ENEA_IRIESD_MAPA.md` |
| Telemechanika GPZ | 1; 25 | Z1 §30; IRiESD II.4.6 | `STANDARD_ENEA_GPZ_Z1.md`, `STANDARD_ENEA_IRIESD_MAPA.md` |
| Rozdzielnia 110 kV GPZ (informacyjnie — równoważnik obliczeniowy, decyzja właściciela 2026-11-12) | 1; 5 | Z1 §9–§12, §23, §26.6–§26.7, §26.11; WN §5–§12 | `STANDARD_ENEA_GPZ_Z1.md`, `STANDARD_ENEA_APARATURA_WN.md` |
| GPZ jednotransformatorowy 110 kV/SN | 2 | §4, §5, Z.1–Z.11 | `STANDARD_ENEA_GPZ_Z2.md` |
| Rozdzielnia sieciowa 110 kV i granice obwodów wtórnych przy przyłączaniu podmiotu | 3 | §4, §5, §6.1, §6.2 | `STANDARD_ENEA_RS110_Z3.md` |
| Stanowisko transformatora, budynek GPZ, zespół uziemiający (moc docelowa, strefy pożarowe) | 4 | §4, §5.1, §5.2.8 | `STANDARD_ENEA_GPZ_Z7.md` |
| Linia napowietrzna 110 kV (przewód, odgromowy OPGW, uziemienie słupów) | 6 | §4.1, §4.2, §4.6, §4.7 | `STANDARD_ENEA_LINIE_110KV.md` |
| Linia kablowa 110 kV (kabel, głowice, ograniczniki) | 6; 5 | §5.1, §5.2, §5.4, §5.9; WN §11 | `STANDARD_ENEA_LINIE_110KV.md`, `STANDARD_ENEA_APARATURA_WN.md` |
| Stacja SN/nN kompaktowa do 630 kVA | 7 | §4 | grupa A |
| Złącze/szafa kablowa SN (ZKSN), złącze pomiarowe SN | 7; 12; 21; 22 | Z1 SN §5 (§5.2, §5.3, §5.4, §5.5.1, §5.5.3, §5.7, §5.9.8, rys. 4a–4j); Telemechanika §6.7.2; Układy pomiarowe; Ochrona przed porażeniem §9.1–§9.2 | grupa A, grupa B |
| Stacja SN/nN uproszczona do 400 kVA | 8 | całość | grupa A |
| Stacja słupowa SN/nN | 9 | całość | grupa A |
| Moduł bilansujący AMI w stacji SN/nN | 10 | całość (skan) | grupa A |
| Stacja SN/nN wnętrzowa w budynku | 11 | całość | grupa A |
| Telemechanika stacji SN/nN, ZKSN i łączników na liniach SN | 12; 13 | Telemechanika §6; Katalog sygnałów | grupa A |
| Linia napowietrzna SN, słup z rozłącznikiem, słup z pomiarem pośrednim | 14 | §4 (w tym §4.9), załączniki 1–3 | grupa B |
| Linia kablowa SN (dobór kabli, osprzęt) | 15 | §4.4, §5, załącznik O-1, album A-1 | grupa B |
| Badania linii kablowych SN i WN | 16 | całość | grupa B |
| Linia kablowa nN | 17 | załącznik A-1 §4 | grupa B |
| Linia napowietrzna nN | 18 | całość | grupa B |
| Sieć kablowa nN 0,4 kV | 19 | całość (skan) | grupa B |
| Złącze i szafa kablowa nN, złącze z mikroinstalacją | 20 | §8.4 | grupa B |
| Układy pomiarowe odbiorców i wytwórców, mikroinstalacje, pomiar pośredni w ZKSN i na słupie SN | 21 | §6.3, §6.4, §6.5 | grupa B |
| Ochrona przeciwporażeniowa stacji SN/nN, ZKSN, słupa z aparaturą | 22 | §6.4, §9.1, §9.2 | grupa B |
| Uziemienia wszystkich obiektów (w tym słupów linii 110 kV — Linie 110 kV §4.6) | 23 | całość | grupa B |
| Oznaczenia obiektów | 24 | całość (skan) | grupa B |
| Przyłączenie podmiotu, wniosek, warunki przyłączenia | 25 | II.1 | `STANDARD_ENEA_IRIESD_MAPA.md` |
| Jednostka wytwórcza (OZE) — wymagania i EAZ | 25 | II.4.3, II.4.5.5 | `STANDARD_ENEA_IRIESD_MAPA.md` |
| Magazyn energii | 25 | I.5, IV.8 | `STANDARD_ENEA_IRIESD_MAPA.md` |
| Dane przekazywane operatorowi (węzły, linie, transformatory, źródła) | 25 | II.5 | `STANDARD_ENEA_IRIESD_MAPA.md` |

## 3. Rozbieżności wersji w kodzie produktu

| Miejsce (względem `mv-design-pro/backend/src/`) | Opis |
|------------------------------------------------|------|
| `reference_engine/packs/osd_enea/pack.json:8` | Pakiet referencyjny ENEA cytuje Zeszyt 1 SN w wersji 09.2021-2 (obowiązującej od 02.04.2024), a obowiązuje wersja 06.2024 od 01.01.2025 (pozycja 7). Odwołanie jest nieaktualne — do poprawy w karcie wpięcia profilu ENEA razem z treścią reguł pakietu. |
| `network_model/catalog/hv_overhead_conductor_catalog.py:3`–`:8` | Zgodne: cytuje Linie 110 kV w wersji 06.2026 (pozycja 6). |
