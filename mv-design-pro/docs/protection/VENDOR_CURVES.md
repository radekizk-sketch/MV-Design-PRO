# Protection Vendor Curves — P15a-EXT-VENDORS

**Status:** BINDING
**Version:** 1.0
**Phase:** P15a-EXT-VENDORS
**Base:** P15a FOUNDATION (IEC_IDMT_CANON.md)

---

## 1. Scope

This document defines the **vendor curve extension** for MV-DESIGN-PRO protection analysis.
All vendor curves MUST conform to this specification.

**BINDING:** Any deviation requires explicit approval and documentation update.

---

## 2. Architecture

### 2.1 Layer Model

```
┌─────────────────────────────────────────────────────────┐
│                    APPLICATION                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │        ProtectionEvaluationEngine               │   │
│  │  (manufacturer-agnostic, formula-based)         │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↑                               │
│                    parameters                           │
│                         │                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │           VendorCurveDefinition                 │   │
│  │  (manufacturer, origin, iec_variant, params)    │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↑                               │
│                    lookup                               │
│                         │                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │            VENDOR_CURVE_REGISTRY                │   │
│  │  (ABB, SIEMENS, SCHNEIDER, ETANGO, ...)        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Key Principle

**The engine does NOT know about manufacturers.**

- Engine receives: `curve_kind` + `curve_parameters` (A, B)
- Engine computes: trip time using IEC formula
- Manufacturer info is DATA for audit/traceability only

---

## 3. Curve Origin Types

| Origin | Description | IEC Mapping | Formula |
|--------|-------------|-------------|---------|
| `IEC_STANDARD` | Pure IEC 60255-151 curves | Yes | IEC |
| `DERIVED_VENDOR` | Vendor curve that maps to IEC | Yes | IEC |
| `VENDOR_NATIVE` | Vendor-specific formula | No | VENDOR |

---

## 4. Supported Manufacturers

### 4.1 ABB

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `ABB_SI` | ABB Standard Inverse | SI | ABB REF615 Technical Manual |
| `ABB_VI` | ABB Very Inverse | VI | ABB REF615 Technical Manual |
| `ABB_EI` | ABB Extremely Inverse | EI | ABB REF615 Technical Manual |

### 4.2 Siemens

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `SIEMENS_SI` | Siemens Standard Inverse | SI | Siemens 7SJ82 Manual |
| `SIEMENS_VI` | Siemens Very Inverse | VI | Siemens 7SJ82 Manual |
| `SIEMENS_EI` | Siemens Extremely Inverse | EI | Siemens 7SJ82 Manual |

### 4.3 Schneider Electric

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `SCHNEIDER_SI` | Schneider Standard Inverse | SI | Schneider Sepam Series 20 Manual |
| `SCHNEIDER_VI` | Schneider Very Inverse | VI | Schneider Sepam Series 20 Manual |
| `SCHNEIDER_EI` | Schneider Extremely Inverse | EI | Schneider Sepam Series 20 Manual |

### 4.4 Etango (Polish)

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `ETANGO_SI` | Etango Standard Inverse | SI | Etango EOP-2 User Manual |
| `ETANGO_VI` | Etango Very Inverse | VI | Etango EOP-2 User Manual |
| `ETANGO_EI` | Etango Extremely Inverse | EI | Etango EOP-2 User Manual |

### 4.5 Eaton

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `EATON_SI` | Eaton Standard Inverse | SI | Eaton Cooper Form 6 Recloser Manual |
| `EATON_VI` | Eaton Very Inverse | VI | Eaton Cooper Form 6 Recloser Manual |
| `EATON_EI` | Eaton Extremely Inverse | EI | Eaton Cooper Form 6 Recloser Manual |

### 4.6 GE

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `GE_SI` | GE Standard Inverse | SI | GE Multilin 750/760 Manual |
| `GE_VI` | GE Very Inverse | VI | GE Multilin 750/760 Manual |
| `GE_EI` | GE Extremely Inverse | EI | GE Multilin 750/760 Manual |

### 4.7 SEL (Schweitzer Engineering Laboratories)

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `SEL_SI` | SEL Standard Inverse | SI | SEL-751 Instruction Manual |
| `SEL_VI` | SEL Very Inverse | VI | SEL-751 Instruction Manual |
| `SEL_EI` | SEL Extremely Inverse | EI | SEL-751 Instruction Manual |

### 4.8 Generic IEC

| Curve Code | Display Name | IEC Variant | Source |
|------------|--------------|-------------|--------|
| `IEC_SI` | IEC Standard Inverse | SI | IEC 60255-151:2009 Table 1 |
| `IEC_VI` | IEC Very Inverse | VI | IEC 60255-151:2009 Table 1 |
| `IEC_EI` | IEC Extremely Inverse | EI | IEC 60255-151:2009 Table 1 |
| `IEC_LTI` | IEC Long-Time Inverse | LTI | ABB 1MRS756887 rev. Q, Tab. 1001 (praktyka BS 142 / IEC 255; nie IEEE C37.112) |

---

## 5. IEC Curve Constants (BINDING)

From IEC_IDMT_CANON.md:

| Variant | A | B |
|---------|------|------|
| SI | 0.14 | 0.02 |
| VI | 13.5 | 1.0 |
| EI | 80.0 | 2.0 |
| LTI | 120.0 | 1.0 |

---

## 6. Verification Status

| Status | Meaning |
|--------|---------|
| `VERIFIED` | Parameters verified against manufacturer datasheet |
| `UNVERIFIED` | Parameters not verified — use with caution |
| `DEPRECATED` | Curve is deprecated, newer version available |

**Policy:** All curves mapping to IEC have `VERIFIED` status.
Native vendor curves without datasheet confirmation have `UNVERIFIED` status.

---

## 7. Audit Trail

Every protection evaluation trace MUST include:

```json
{
  "step": "device_evaluation",
  "inputs": {
    "device_id": "relay-001",
    "fault_id": "bus-001",
    "i_fault_a": 500.0,
    "i_pickup_a": 100.0,
    "curve_kind": "very_inverse",
    "tms": 0.3,
    "curve_parameters": {"A": 13.5, "B": 1.0},
    "manufacturer": "SCHNEIDER",
    "vendor_curve_code": "SCHNEIDER_VI",
    "curve_origin": "DERIVED_VENDOR",
    "iec_variant": "VI",
    "source_reference": "Schneider Sepam Series 20 Manual",
    "verification_status": "VERIFIED"
  },
  "outputs": {
    "trip_state": "TRIPS",
    "t_trip_s": 1.125,
    "margin_percent": 400.0
  }
}
```

---

## 8. API Usage

### 8.1 Build Device from Vendor Curve

```python
from application.protection_analysis.engine import build_device_from_vendor_curve

device = build_device_from_vendor_curve(
    device_id="relay-001",
    protected_element_ref="bus-001",
    i_pickup_a=100.0,
    tms=0.3,
    vendor_curve_code="ABB_SI",
)
```

### 8.2 List Supported Curves

```python
from application.protection_analysis.engine import list_supported_vendor_curves

curves = list_supported_vendor_curves()
# ['IEC_SI', 'IEC_VI', 'IEC_EI', 'IEC_LTI', 'ABB_SI', ...]
```

### 8.3 Get Vendor Curve Definition

```python
from domain.protection_vendors import get_vendor_curve

curve = get_vendor_curve("SIEMENS_EI")
# VendorCurveDefinition(
#     curve_code="SIEMENS_EI",
#     manufacturer=Manufacturer.SIEMENS,
#     ...
# )
```

---

## 9. Adding New Vendors

To add a new manufacturer or curve:

1. Edit `domain/protection_vendors.py`
2. Use `_register_iec_derived_curve()` for IEC-mapped curves
3. Use `_register_native_curve()` for vendor-native formulas
4. Add tests in `tests/test_protection_analysis.py`
5. Update this documentation

**Example:**

```python
_register_iec_derived_curve(
    curve_code="NEWVENDOR_SI",
    manufacturer=Manufacturer.OTHER,  # or add new enum value
    display_name="NewVendor Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="NewVendor Relay Manual v1.0",
    verification_status=VerificationStatus.VERIFIED,
    notes="NewVendor IEC-compliant SI curve",
)
```

---

## 10. Parity Guarantee

**All `DERIVED_VENDOR` curves produce IDENTICAL trip times to their IEC variants.**

This is enforced by:
1. Using `IEC_CURVE_CONSTANTS` for parameter lookup
2. Automated parity tests in `TestVendorIecParity`

---

## 11. Future Extensions (P15b+)

- Custom manufacturer curves with non-IEC formulas
- IEEE C37.112 US curves (Moderately Inverse, etc.)
- Fuse curves
- MCB/MCCB curves

---

## 12. References

1. IEC 60255-151:2009 — IDMT curves
2. IEEE C37.112-2018 — US inverse-time curves
3. ABB REF615 Technical Manual
4. Siemens 7SJ82 Manual
5. Schneider Sepam Series 20 Manual
6. GE Multilin 750/760 Manual
7. SEL-751 Instruction Manual
8. Eaton Cooper Form 6 Recloser Manual
9. Etango EOP-2 User Manual

---

## 13. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-30 | P15a-EXT Team | Initial vendor curves specification |
