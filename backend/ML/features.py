"""Feature engineering shared by training (notebooks) and serving (the saved pipeline).

The saved model pipeline starts with ``ConcreteFeatures``, so it takes the 8 raw inputs the
app sends (``RAW_FEATURES``) and derives everything else itself. Training and serving can't
drift apart, because they run the same code.

Import this module as ``ML.features`` (with ``backend/`` on ``sys.path``), not as ``features``.
The pickled pipeline stores the module path, and only ``ML.features`` resolves both from the
notebooks and from the app, which runs from inside ``backend/``.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

# Raw inputs, in the order (and with the names) the app sends them
RAW_FEATURES = ["cement", "blast_furnace_slag", "fly_ash", "water", "superplasticizer",
                "coarse_aggregate", "fine_aggregate", "age"]
INGREDIENTS = RAW_FEATURES[:-1]
TARGET = "compressive_strength"

# Columns the regressor actually sees. Raw age is replaced by log(age).
# Every derived column that contains cement or water is monotonically constrained (below), so the
# model is *guaranteed* to give more strength for more cement / less water / longer curing.
# SCM fraction, superplasticizer/binder and aggregate/binder were tried too; they also contain cement
# but have no safe direction, and with them adding cement lowered strength somewhere in 7 of 10 mixes.
MODEL_FEATURES = INGREDIENTS + [
    "log_age",           # straightens the curing curve (fast early gain, then a plateau)
    "water_binder",      # strongest single predictor (EDA: r = -0.62, -0.77 at 28 d)
    "water_cement",      # classic Abrams ratio
    "total_binder",      # cement + slag + fly ash
]

# Physically known directions (+1 = strength rises with the feature, -1 = it falls),
# used as monotonic constraints. Everything else is left free (0).
MONOTONE_DIRECTIONS = {"log_age": 1, "cement": 1, "total_binder": 1,
                       "water": -1, "water_binder": -1, "water_cement": -1}


def add_features(X: pd.DataFrame) -> pd.DataFrame:
    """Return the MODEL_FEATURES columns derived from the raw inputs."""
    X = pd.DataFrame(X, columns=RAW_FEATURES).astype(float)
    binder = X["cement"] + X["blast_furnace_slag"] + X["fly_ash"]
    out = X[INGREDIENTS].copy()
    out["log_age"] = np.log(X["age"].clip(lower=1.0))
    out["water_binder"] = X["water"] / binder
    out["water_cement"] = X["water"] / X["cement"]
    out["total_binder"] = binder
    return out[MODEL_FEATURES]


def monotone_vector(columns=MODEL_FEATURES) -> list[int]:
    return [MONOTONE_DIRECTIONS.get(c, 0) for c in columns]


def sqrt_inverse(p):
    """Inverse of the sqrt target transform. Clipping at 0 before squaring keeps strength >= 0
    and preserves the monotonic constraints (a non-decreasing input stays non-decreasing)."""
    return np.clip(p, 0.0, None) ** 2


class ConcreteFeatures(BaseEstimator, TransformerMixin):
    """Stateless pipeline step: raw mix (8 columns) -> MODEL_FEATURES."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        return add_features(X)

    def get_feature_names_out(self, input_features=None):
        return np.array(MODEL_FEATURES, dtype=object)
