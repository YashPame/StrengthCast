"""Loads the trained model bundle and wraps prediction, age-curve and sensitivity logic.

The bundle (produced by backend/ML/05_Model.ipynb) contains a fitted sklearn Pipeline
(feature engineering from ML/features.py -> regressor), so the 8 raw mix values go straight in.
Unpickling it imports ML.features, which resolves because the app runs from inside backend/.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

# The model is loaded straight from the ML notebooks' output folder (backend/ML/models).
# To switch models, change MODEL_FILE to another bundle saved in that folder.
MODEL_DIR = Path(__file__).resolve().parent / "ML" / "models"
MODEL_FILE = "concrete_strength_model_v3.joblib"
MODEL_PATH = MODEL_DIR / MODEL_FILE

# Test ages present in the training data. Predictions between them are interpolation by the trees.
AGES = [1, 3, 7, 14, 28, 56, 90, 91, 100, 120, 180, 270, 360, 365]
# Ages offered in the UI and used for curves. 1 day is excluded: only 2 training rows exist there,
# so the model cannot tell it apart from 3 days. Odd one-off series ages (91, 100, 120, 360) are skipped.
UI_AGES = [3, 7, 14, 28, 56, 90, 180, 270, 365]
SPARSE_AGES = {1: "Only 2 training samples exist at 1 day; the prediction is effectively the 3-day value."}

# 150 mm cube: loaded area 22,500 mm^2 -> 1 MPa = 22.5 kN
CUBE_AREA_MM2 = 150 * 150

# Realistic fresh-concrete density window (kg/m^3)
DENSITY_RANGE = (2200.0, 2600.0)

# Water/binder (binder = cement + slag + fly ash) checks. Each ingredient can be inside its own range
# while the combination is not, so w/b is checked on its own:
# - WB_RANGE: w/b span of the training data (0.235-0.90); outside it the prediction is an extrapolation.
# - Below WB_DRY_NO_SP without superplasticizer the mix is likely too stiff to compact. Only 15 of the
#   378 training rows without SP go below 0.35. The model assumes full compaction and cannot see this.
WB_RANGE = (0.235, 0.90)
WB_DRY_NO_SP = 0.35

FEATURE_INFO = {
    "cement":             {"label": "Cement",             "unit": "kg/m³", "step": 1.0},
    "blast_furnace_slag": {"label": "Blast furnace slag", "unit": "kg/m³", "step": 1.0},
    "fly_ash":            {"label": "Fly ash",            "unit": "kg/m³", "step": 1.0},
    "water":              {"label": "Water",              "unit": "kg/m³", "step": 0.5},
    "superplasticizer":   {"label": "Superplasticizer",   "unit": "kg/m³", "step": 0.1},
    "coarse_aggregate":   {"label": "Coarse aggregate",   "unit": "kg/m³", "step": 1.0},
    "fine_aggregate":     {"label": "Fine aggregate",     "unit": "kg/m³", "step": 1.0},
    "age":                {"label": "Curing age",         "unit": "days",  "step": 1.0},
}

# Real 28-day mixes from Data/concrete_data.csv (measured strength in comments)
PRESETS = {
    "standard": {"label": "Standard", "mix": {  # 33.1 MPa
        "cement": 397.0, "blast_furnace_slag": 0.0, "fly_ash": 0.0, "water": 185.7,
        "superplasticizer": 0.0, "coarse_aggregate": 1040.6, "fine_aggregate": 734.3, "age": 28}},
    "high_strength": {"label": "High strength", "mix": {  # 78.8 MPa
        "cement": 451.0, "blast_furnace_slag": 0.0, "fly_ash": 0.0, "water": 165.0,
        "superplasticizer": 11.25, "coarse_aggregate": 1030.0, "fine_aggregate": 745.0, "age": 28}},
    "slag_blend": {"label": "Slag blend", "mix": {  # 37.9 MPa
        "cement": 166.0, "blast_furnace_slag": 260.0, "fly_ash": 0.0, "water": 183.0,
        "superplasticizer": 13.0, "coarse_aggregate": 859.0, "fine_aggregate": 827.0, "age": 28}},
    "fly_ash_blend": {"label": "Fly-ash blend", "mix": {  # 32.7 MPa
        "cement": 251.37, "blast_furnace_slag": 0.0, "fly_ash": 118.27, "water": 188.45,
        "superplasticizer": 6.35, "coarse_aggregate": 1028.4, "fine_aggregate": 757.73, "age": 28}},
    "lean": {"label": "Lean mix", "mix": {  # 8.5 MPa
        "cement": 158.0, "blast_furnace_slag": 0.0, "fly_ash": 195.0, "water": 220.0,
        "superplasticizer": 11.0, "coarse_aggregate": 898.0, "fine_aggregate": 713.0, "age": 28}},
}
DEFAULT_PRESET = "standard"


@dataclass
class ModelService:
    pipeline: object
    features: list[str]
    ranges: dict[str, dict[str, float]]
    metrics: dict[str, float]
    model_name: str

    @classmethod
    def load(cls, path: Path = MODEL_PATH) -> "ModelService":
        bundle = joblib.load(path)
        return cls(
            pipeline=bundle["pipeline"],
            features=list(bundle["features"]),
            ranges=bundle["feature_ranges"],
            metrics=bundle["metrics"],
            model_name=bundle["model_name"],
        )

    @property
    def rmse(self) -> float:
        return float(self.metrics["test_RMSE"])

    # ------------------------------------------------------------------ helpers
    def _frame(self, rows: list[dict[str, float]]) -> pd.DataFrame:
        return pd.DataFrame(rows, columns=self.features).astype(float)

    def _predict_rows(self, rows: list[dict[str, float]]) -> np.ndarray:
        # Strength can't be negative; clip in case of extreme extrapolation
        return np.clip(self.pipeline.predict(self._frame(rows)), 0.0, None)

    @staticmethod
    def derived(mix: dict[str, float]) -> dict[str, float | None]:
        binder = mix["cement"] + mix["blast_furnace_slag"] + mix["fly_ash"]
        total = sum(mix[k] for k in FEATURE_INFO if k != "age")
        return {
            "water_cement_ratio": mix["water"] / mix["cement"] if mix["cement"] > 0 else None,
            "water_binder_ratio": mix["water"] / binder if binder > 0 else None,
            "total_binder": binder,
            "total_mass": total,
        }

    def warnings(self, mix: dict[str, float]) -> list[dict[str, str]]:
        out = []
        for f in self.features:
            lo, hi = self.ranges[f]["min"], self.ranges[f]["max"]
            v = mix[f]
            if v < lo or v > hi:
                out.append({
                    "field": f, "level": "warning",
                    "message": f"{FEATURE_INFO[f]['label']} = {v:g} is outside the training range "
                               f"({lo:g}–{hi:g}); the prediction is an extrapolation.",
                })
        if mix["age"] in SPARSE_AGES:
            out.append({"field": "age", "level": "info", "message": SPARSE_AGES[mix["age"]]})
        elif mix["age"] not in AGES and self.ranges["age"]["min"] <= mix["age"] <= self.ranges["age"]["max"]:
            out.append({"field": "age", "level": "info",
                        "message": f"Age {mix['age']:g} d was not a tested age; nearest tested ages are used implicitly."})
        d = self.derived(mix)
        total = d["total_mass"]
        if not DENSITY_RANGE[0] <= total <= DENSITY_RANGE[1]:
            out.append({"field": "total_mass", "level": "warning",
                        "message": f"Total mass {total:.0f} kg/m³ is outside the realistic "
                                   f"{DENSITY_RANGE[0]:.0f}–{DENSITY_RANGE[1]:.0f} kg/m³ range for concrete."})
        wb = d["water_binder_ratio"]
        if wb is not None:
            if not WB_RANGE[0] <= wb <= WB_RANGE[1]:
                out.append({"field": "water_binder_ratio", "level": "warning",
                            "message": f"Water/binder ratio {wb:.2f} is outside the training range "
                                       f"({WB_RANGE[0]:.2f}–{WB_RANGE[1]:.2f}); the prediction is an extrapolation."})
            if wb < WB_DRY_NO_SP and mix["superplasticizer"] == 0:
                out.append({"field": "water_binder_ratio", "level": "warning",
                            "message": f"Water/binder ratio {wb:.2f} with no superplasticizer: this mix may be "
                                       f"too stiff to place and compact. The model assumes full compaction, so the "
                                       f"prediction may be optimistic. Add superplasticizer or more water."})
        return out

    # ------------------------------------------------------------------ public API
    def predict(self, mix: dict[str, float]) -> dict:
        strength = float(self._predict_rows([mix])[0])
        return {
            "strength_mpa": strength,
            "low_mpa": max(strength - self.rmse, 0.0),
            "high_mpa": strength + self.rmse,
            "rmse_mpa": self.rmse,
            "failure_load_kn": strength * CUBE_AREA_MM2 / 1000.0,
            "derived": self.derived(mix),
            "warnings": self.warnings(mix),
        }

    def age_curve(self, mix: dict[str, float]) -> list[dict[str, float]]:
        rows = [{**mix, "age": a} for a in UI_AGES]
        preds = self._predict_rows(rows)
        return [{"age": a, "strength_mpa": float(p)} for a, p in zip(UI_AGES, preds)]

    def sensitivity(self, mix: dict[str, float], points: int = 25) -> dict:
        """Vary one feature across its training range, holding the others at the current mix."""
        base = float(self._predict_rows([mix])[0])
        out = {}
        for f in self.features:
            if f == "age":
                xs = np.array(UI_AGES, dtype=float)
            else:
                xs = np.linspace(self.ranges[f]["min"], self.ranges[f]["max"], points)
            preds = self._predict_rows([{**mix, f: float(x)} for x in xs])
            out[f] = {"x": xs.round(3).tolist(), "strength_mpa": preds.round(3).tolist(), "current": mix[f]}
        return {"base_strength_mpa": base, "features": out}

    def meta(self) -> dict:
        features = []
        for f in self.features:
            features.append({
                "name": f, **FEATURE_INFO[f],
                "min": self.ranges[f]["min"], "max": self.ranges[f]["max"],
                "default": PRESETS[DEFAULT_PRESET]["mix"][f],
            })
        return {
            "model_name": self.model_name,
            "features": features,
            "ages": UI_AGES,
            "presets": PRESETS,
            "default_preset": DEFAULT_PRESET,
            "metrics": self.metrics,
            "cube_area_mm2": CUBE_AREA_MM2,
            "density_range": DENSITY_RANGE,
            "wb_range": WB_RANGE,
            "wb_dry_no_sp": WB_DRY_NO_SP,
        }
