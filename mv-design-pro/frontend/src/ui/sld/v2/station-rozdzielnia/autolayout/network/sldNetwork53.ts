/**
 * GENERATED — do not edit by hand. The COMPACT 53-station SLD network model, distilled from the
 * backend ENM substrate (backend/tests/reference_networks/sld_substrate_52s.py) by
 * application/reference_networks/sld_network_model.py. Regenerate:
 *   cd backend && poetry run python scripts/emit_sld_network_fixture.py
 * It is the read-only INPUT to the E3 network auto-layout — the SAME source the backend solves.
 */
import type { SldNetworkModel } from './networkModel';

export const SLD_NETWORK_53: SldNetworkModel = {
  "edges": [
    {
      "from": "GPZ",
      "open": false,
      "to": "S01"
    },
    {
      "from": "S01",
      "open": false,
      "to": "S02"
    },
    {
      "from": "S01",
      "open": false,
      "to": "S05"
    },
    {
      "from": "S02",
      "open": false,
      "to": "S03"
    },
    {
      "from": "S03",
      "open": false,
      "to": "S04"
    },
    {
      "from": "S05",
      "open": false,
      "to": "S06"
    },
    {
      "from": "S05",
      "open": false,
      "to": "S07"
    },
    {
      "from": "S06",
      "open": false,
      "to": "S08"
    },
    {
      "from": "S06",
      "open": false,
      "to": "S10"
    },
    {
      "from": "S07",
      "open": false,
      "to": "S09"
    },
    {
      "from": "S08",
      "open": false,
      "to": "S12"
    },
    {
      "from": "S08",
      "open": false,
      "to": "S17"
    },
    {
      "from": "S09",
      "open": false,
      "to": "S11"
    },
    {
      "from": "S10",
      "open": false,
      "to": "S13"
    },
    {
      "from": "S12",
      "open": false,
      "to": "S15"
    },
    {
      "from": "S13",
      "open": false,
      "to": "S14"
    },
    {
      "from": "S15",
      "open": false,
      "to": "S16"
    },
    {
      "from": "S16",
      "open": false,
      "to": "S18"
    },
    {
      "from": "S17",
      "open": false,
      "to": "S19"
    },
    {
      "from": "S17",
      "open": false,
      "to": "S21"
    },
    {
      "from": "S19",
      "open": false,
      "to": "S20"
    },
    {
      "from": "S20",
      "open": false,
      "to": "S22"
    },
    {
      "from": "S21",
      "open": false,
      "to": "S23"
    },
    {
      "from": "S21",
      "open": false,
      "to": "S24"
    },
    {
      "from": "S23",
      "open": false,
      "to": "S25"
    },
    {
      "from": "S23",
      "open": false,
      "to": "S30"
    },
    {
      "from": "S24",
      "open": false,
      "to": "S26"
    },
    {
      "from": "S25",
      "open": false,
      "to": "S27"
    },
    {
      "from": "S26",
      "open": false,
      "to": "S28"
    },
    {
      "from": "S27",
      "open": false,
      "to": "S29"
    },
    {
      "from": "S30",
      "open": false,
      "to": "S31"
    },
    {
      "from": "S30",
      "open": false,
      "to": "S34"
    },
    {
      "from": "S31",
      "open": false,
      "to": "S32"
    },
    {
      "from": "S32",
      "open": false,
      "to": "S33"
    },
    {
      "from": "S33",
      "open": false,
      "to": "S35"
    },
    {
      "from": "S34",
      "open": false,
      "to": "S36"
    },
    {
      "from": "S34",
      "open": false,
      "to": "S37"
    },
    {
      "from": "S36",
      "open": false,
      "to": "S38"
    },
    {
      "from": "S36",
      "open": false,
      "to": "S39"
    },
    {
      "from": "S37",
      "open": false,
      "to": "S40"
    },
    {
      "from": "S38",
      "open": false,
      "to": "S43"
    },
    {
      "from": "S38",
      "open": false,
      "to": "S48"
    },
    {
      "from": "S39",
      "open": false,
      "to": "S42"
    },
    {
      "from": "S40",
      "open": false,
      "to": "S41"
    },
    {
      "from": "S41",
      "open": false,
      "to": "S44"
    },
    {
      "from": "S42",
      "open": false,
      "to": "S45"
    },
    {
      "from": "S43",
      "open": true,
      "to": "S46"
    },
    {
      "from": "S45",
      "open": false,
      "to": "S47"
    },
    {
      "from": "S46",
      "open": false,
      "to": "S49"
    },
    {
      "from": "S48",
      "open": false,
      "to": "S50"
    },
    {
      "from": "S50",
      "open": false,
      "to": "S51"
    },
    {
      "from": "S51",
      "open": false,
      "to": "S52"
    },
    {
      "from": "S52",
      "open": false,
      "to": "S53"
    }
  ],
  "gpz": {
    "hv_kv": 110.0,
    "id": "GPZ",
    "name": "GPZ Referencyjny 15 kV",
    "sections": [
      {
        "feeders": [
          {
            "name": "Pole liniowe GPZ",
            "to": "S01",
            "to_name": "Stacja T1"
          }
        ],
        "name": "Sekcja 1",
        "order": 0
      }
    ],
    "sn_kv": 15.0,
    "transformers": [
      {
        "id": "wn_sn",
        "mva": 25.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0
      }
    ]
  },
  "nop_station": "S46",
  "schema": "sld_network_model_v1",
  "source_hash": "b0e7518ed3736ea476a702eb79804f94460b8488b3de7b1ea3e8e5938410007c",
  "stations": [
    {
      "depth": 2,
      "der": [
        "pv_inverter"
      ],
      "id": "S01",
      "kind": "trunk",
      "name": "Stacja T1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": null,
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 4,
      "der": [],
      "id": "S02",
      "kind": "lateral",
      "name": "Stacja L1-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S01",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 5,
      "der": [],
      "id": "S03",
      "kind": "lateral",
      "name": "Stacja L1-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S02",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 6,
      "der": [],
      "id": "S04",
      "kind": "lateral",
      "name": "Stacja L1-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S03",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 6,
      "der": [
        "bess"
      ],
      "id": "S05",
      "kind": "trunk",
      "name": "Stacja T8",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S01",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 7,
      "der": [
        "bess"
      ],
      "id": "S06",
      "kind": "trunk",
      "name": "Stacja T11",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S05",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 8,
      "der": [],
      "id": "S07",
      "kind": "lateral",
      "name": "Stacja L8-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S05",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 8,
      "der": [
        "bess"
      ],
      "id": "S08",
      "kind": "trunk",
      "name": "Stacja T2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S06",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 9,
      "der": [],
      "id": "S09",
      "kind": "lateral",
      "name": "Stacja L8-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S07",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 9,
      "der": [],
      "id": "S10",
      "kind": "lateral",
      "name": "Stacja L11-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S06",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 10,
      "der": [],
      "id": "S11",
      "kind": "lateral",
      "name": "Stacja L8-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S09",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 10,
      "der": [],
      "id": "S12",
      "kind": "lateral",
      "name": "Stacja L2-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S08",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 10,
      "der": [],
      "id": "S13",
      "kind": "lateral",
      "name": "Stacja L11-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S10",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 11,
      "der": [],
      "id": "S14",
      "kind": "lateral",
      "name": "Stacja L11-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S13",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 11,
      "der": [],
      "id": "S15",
      "kind": "lateral",
      "name": "Stacja L2-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S12",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 12,
      "der": [],
      "id": "S16",
      "kind": "lateral",
      "name": "Stacja L2-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S15",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 12,
      "der": [
        "wind_inverter"
      ],
      "id": "S17",
      "kind": "trunk",
      "name": "Stacja T3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S08",
      "sn_kv": 15.0,
      "trafo_mva": 2.5
    },
    {
      "depth": 13,
      "der": [],
      "id": "S18",
      "kind": "lateral",
      "name": "Stacja L2-4",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S16",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 14,
      "der": [],
      "id": "S19",
      "kind": "lateral",
      "name": "Stacja L3-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S17",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 15,
      "der": [],
      "id": "S20",
      "kind": "lateral",
      "name": "Stacja L3-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S19",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 16,
      "der": [
        "wind_inverter"
      ],
      "id": "S21",
      "kind": "trunk",
      "name": "Stacja T9",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S17",
      "sn_kv": 15.0,
      "trafo_mva": 2.5
    },
    {
      "depth": 16,
      "der": [],
      "id": "S22",
      "kind": "lateral",
      "name": "Stacja L3-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S20",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 17,
      "der": [
        "pv_inverter"
      ],
      "id": "S23",
      "kind": "trunk",
      "name": "Stacja T4",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S21",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 18,
      "der": [],
      "id": "S24",
      "kind": "lateral",
      "name": "Stacja L9-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S21",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 19,
      "der": [],
      "id": "S25",
      "kind": "lateral",
      "name": "Stacja L4-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S23",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 19,
      "der": [],
      "id": "S26",
      "kind": "lateral",
      "name": "Stacja L9-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S24",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 20,
      "der": [],
      "id": "S27",
      "kind": "lateral",
      "name": "Stacja L4-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S25",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 20,
      "der": [],
      "id": "S28",
      "kind": "lateral",
      "name": "Stacja L9-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S26",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 21,
      "der": [],
      "id": "S29",
      "kind": "lateral",
      "name": "Stacja L4-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S27",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 22,
      "der": [
        "bess"
      ],
      "id": "S30",
      "kind": "trunk",
      "name": "Stacja T5",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S23",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 24,
      "der": [],
      "id": "S31",
      "kind": "lateral",
      "name": "Stacja L5-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S30",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 25,
      "der": [],
      "id": "S32",
      "kind": "lateral",
      "name": "Stacja L5-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S31",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 26,
      "der": [],
      "id": "S33",
      "kind": "lateral",
      "name": "Stacja L5-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S32",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 26,
      "der": [
        "pv_inverter"
      ],
      "id": "S34",
      "kind": "trunk",
      "name": "Stacja T10",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S30",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 27,
      "der": [],
      "id": "S35",
      "kind": "lateral",
      "name": "Stacja L5-4",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S33",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 27,
      "der": [
        "wind_inverter"
      ],
      "id": "S36",
      "kind": "trunk",
      "name": "Stacja T12",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S34",
      "sn_kv": 15.0,
      "trafo_mva": 2.5
    },
    {
      "depth": 28,
      "der": [],
      "id": "S37",
      "kind": "lateral",
      "name": "Stacja L10-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S34",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 28,
      "der": [
        "wind_inverter"
      ],
      "id": "S38",
      "kind": "trunk",
      "name": "Stacja T6",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S36",
      "sn_kv": 15.0,
      "trafo_mva": 2.5
    },
    {
      "depth": 29,
      "der": [
        "bess",
        "pv_inverter"
      ],
      "id": "S39",
      "kind": "lateral",
      "name": "Stacja L12-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S36",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 29,
      "der": [],
      "id": "S40",
      "kind": "lateral",
      "name": "Stacja L10-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S37",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 30,
      "der": [],
      "id": "S41",
      "kind": "lateral",
      "name": "Stacja L10-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S40",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 30,
      "der": [
        "bess",
        "pv_inverter"
      ],
      "id": "S42",
      "kind": "lateral",
      "name": "Stacja L12-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S39",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 30,
      "der": [],
      "id": "S43",
      "kind": "lateral",
      "name": "Stacja L6-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S38",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 31,
      "der": [],
      "id": "S44",
      "kind": "lateral",
      "name": "Stacja L10-4",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S41",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 31,
      "der": [
        "bess",
        "pv_inverter"
      ],
      "id": "S45",
      "kind": "lateral",
      "name": "Stacja L12-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S42",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 31,
      "der": [],
      "id": "S46",
      "kind": "lateral",
      "name": "Stacja L6-2",
      "nn_kv": 0.4,
      "nop_downstream": true,
      "parent": "S43",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 32,
      "der": [
        "bess",
        "pv_inverter"
      ],
      "id": "S47",
      "kind": "lateral",
      "name": "Stacja L12-4",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S45",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 33,
      "der": [
        "pv_inverter"
      ],
      "id": "S48",
      "kind": "trunk",
      "name": "Stacja T7",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S38",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 34,
      "der": [],
      "id": "S49",
      "kind": "lateral",
      "name": "Stacja L6-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S46",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 35,
      "der": [],
      "id": "S50",
      "kind": "lateral",
      "name": "Stacja L7-1",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S48",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 36,
      "der": [],
      "id": "S51",
      "kind": "lateral",
      "name": "Stacja L7-2",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S50",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 37,
      "der": [],
      "id": "S52",
      "kind": "lateral",
      "name": "Stacja L7-3",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S51",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    },
    {
      "depth": 38,
      "der": [],
      "id": "S53",
      "kind": "lateral",
      "name": "Stacja L7-4",
      "nn_kv": 0.4,
      "nop_downstream": false,
      "parent": "S52",
      "sn_kv": 15.0,
      "trafo_mva": 0.63
    }
  ],
  "voltages": [
    110.0,
    15.0,
    0.4
  ]
};
