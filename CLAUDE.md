# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**StrengthCast: Machine Learning-Based Concrete Compressive Strength Prediction**, with the tagline "Know the strength before you pour." Use this branding in user-facing text: README, UI header, page title and API title. It's a decision-support tool for preliminary concrete mix design and quality assessment. It predicts compressive strength (MPa) from mix composition and curing age. Planned user-facing features:

- Enter mix parameters and get a predicted strength in MPa
- Compare alternative mix designs side by side
- Sensitivity analysis: how changing one ingredient affects predicted strength

Predictions supplement laboratory compression testing and do not replace it. User-facing output should say so.

## Current state

The project is a git repo (`.gitignore` excludes `frontend/dist`, `node_modules`, caches and venvs, and keeps data and models). `requirements.txt` (pinned, includes lightgbm and xgboost for the two served models) and `frontend/package.json` are the only dependency manifests.

Layout (project root): `backend/` (FastAPI code, plus `backend/Data/` and `backend/ML/`), `frontend/`, `docs/images/` (README screenshots + demo GIF). There is no automated test suite (the old `tests/` folder was removed on request).

- `backend/Data/Concrete_Data.xls`: the original UCI file (do not overwrite)
- `backend/Data/concrete_data.csv`: written by `01_Data_Loading.ipynb` from the .xls, with short snake_case columns (`cement, slag, fly_ash, water, superplasticizer, coarse_aggregate, fine_aggregate, age, strength`). `02`–`04` read it. `04_DataSplit` renames `slag` → `blast_furnace_slag` and `strength` → `compressive_strength` in `ML/data/splits.csv`, the names the models and the app use.
- `backend/Data/concrete_data_folds.csv` and `concrete_data_zscore_cleaned.csv` are leftovers used only by the notebooks in `ML/archive/`.
- The app serves **two models** from `05_Model.ipynb`, and the user switches between them in the UI. Neither is "the" model: the narrative is that each has an advantage (constrained = physically consistent curves for what-if/sensitivity; unconstrained = lowest error). Don't frame one as chosen over the other.
  - `backend/ML/models/concrete_strength_model_v3.joblib`: physics-constrained LightGBM (test R² 0.944, RMSE 3.73; new mixes R² 0.900, RMSE 5.07; passes the physics check)
  - `backend/ML/models/concrete_strength_model_v3_unconstrained.joblib`: unconstrained XGBoost (test R² 0.953, RMSE 3.40; new mixes R² 0.909, RMSE 4.84; 43 mixes with a falling age curve). XGBoost rather than LightGBM because it is better on new mixes (grouped CV), though LightGBM leads on CV.
  - Each bundle is a dict with these keys:
    - `pipeline`: `ConcreteFeatures` (from `ML/features.py`) → scaler → tuned regressor learning √strength; takes the 8 raw inputs
    - `features`: required column order
    - `feature_ranges`: training min/max per feature, for flagging extrapolation
    - `metrics` (`cv_R2`, `cv_RMSE`, `test_R2`, `test_RMSE`, `test_MAE`, `new_mix_grouped_cv_R2`, `new_mix_grouped_cv_RMSE`), `model_name`, `constrained`, `best_params`
  - Older bundles (`concrete_strength_model.joblib`, `_v2`) are kept for switching back.
- `backend/ML/`: numbered Jupyter notebooks (`01_Data_Loading.ipynb` … `04_DataSplit` (split + CV folds + engineered features → `ML/data/splits.csv`), `05_Model`) that form the pipeline in order; earlier versions live in `ML/archive/`. They use paths relative to `ML/` (`../Data/...`), which still resolve because `ML/` and `Data/` are siblings inside `backend/`.

## Application (project root)

This is the web UI. A FastAPI backend serves both the JSON API and the static frontend from one process.

- `backend/model_service.py` holds all model logic:
  - `backend/` is not a package: the server runs from inside it (`uvicorn app:app`), so `app.py` uses `from model_service import ...`. Scripts that import the backend from elsewhere must put `backend/` on `sys.path`
  - loads bundles straight from `backend/ML/models/`; `MODELS` at the top of the file maps each key (`constrained`, `unconstrained`) to a file and label, and `DEFAULT_MODEL` is `constrained` (no copying after retraining). `load_services()` returns one `ModelService` per bundle that exists; a missing unconstrained file is skipped
  - runs predict, age-curve and sensitivity
  - checks inputs against training ranges and the 2200–2600 kg/m³ density window, plus w/b outside 0.235–0.90 and a workability warning for w/b < 0.35 with no superplasticizer (`WB_RANGE`, `WB_DRY_NO_SP`; sent in `/api/meta` and mirrored in `frontend/src/lib/mix.js`)
  - defines the presets (real 28-day mixes from the dataset)
- `backend/app.py` holds the pydantic `Mix` model (one flat body: 7 ingredients + `age`) and the routes (`/api/meta`, `/api/predict`, `/api/age-curve`, `/api/sensitivity`, `/api/health`). The POST routes take `?model=<key>` (default `constrained`; unknown → 422), and `/api/meta` adds `models` (key, label, model_name, constrained, metrics) and `default_model`. It serves the built `frontend/dist` at `/`.
- `frontend/` is React 18 + Vite (plain JSX). The only libraries are react and react-dom. Charts and the animation are hand-written SVG. The design was ported from the earlier vanilla-JS version in `ApplicationOld/`.
  - `src/App.jsx`: state, the mix & test flow, test log, tabs, warnings (client warnings while editing; server warnings after a test, until the next edit), and the header model toggle (`modelKey`; each test stores the model it used, shown on its card, in the comparison table and in the analysis tabs)
  - `src/lib/stage.js`: the imperative `Stage` class (charge → mix → cast → cure → test). `components/StageView.jsx` wraps it: React renders an empty `<svg id="stage">` and the class owns everything inside it. During the Charge step it flies clones of the panel's ingredient icons into the drum, so `MixPanel` passes the icon elements up through `iconRefs`.
  - `components/`: `MixPanel`, `IngredientIcon` (each icon has a `.mat` group scaled by amount), `TestLog` (cards + comparison table), `Analysis` (age and sensitivity tabs), `charts.jsx` (LineChart/BarChart sized with ResizeObserver), `Tooltip`
  - `src/styles.css` was copied as-is from the old app, and the components rely on its class names (`.stage-card`, `.panel-card`, `.drawer`, `.flyer`, …).
  - FastAPI serves `frontend/dist`, so run `npm run build` after frontend changes, then restart uvicorn if `dist` did not exist when it started. Alternatively use `npm run dev` (port 5173, proxies `/api` to 8000).
- The prediction is fetched **before** the animation starts; the animation only reveals it. Failure load in kN = MPa × 22.5 (150 mm cube).
- Slider limits, presets and ages all come from `/api/meta`. Don't hard-code them in JS.
- Age 1 day is left out of the UI and curves on purpose (only 2 training rows; the model treats it as 3 days).

## Environment & commands

A shared virtualenv lives outside the project at `../python-env` (Python 3.10; pandas, jupyter, scikit-learn stack available).

```bash
source ../python-env/Scripts/activate          # Git Bash
..\python-env\Scripts\Activate.ps1             # PowerShell
# Run a notebook headlessly (from backend/ML/), using the venv's kernel:
../../../python-env/Scripts/python.exe -c "import nbformat; from nbclient import NotebookClient; f='02_EDA.ipynb'; nb=nbformat.read(f, as_version=4); NotebookClient(nb, timeout=600, kernel_name='python3', resources={'metadata': {'path': '.'}}).execute(); nbformat.write(nb, f)"
```

Application (run from the project root):

```bash
(cd frontend && npm install && npm run build)                            # build UI into frontend/dist
(cd backend && ../../python-env/Scripts/python.exe -m uvicorn app:app --reload)   # http://127.0.0.1:8000
```

The venv does not have `nbconvert`. The `jupyter nbconvert` on PATH comes from the system Python (`C:\python310`), whose kernel lacks matplotlib and seaborn. Don't use it.

## Dataset: `backend/Data/concrete_data.csv`

1030 rows × 9 columns, with no missing values and **25 exact duplicate rows** (deduplicate before splitting so the same row can't land in both train and test). It matches the UCI Concrete Compressive Strength dataset, so the standard units apply: ingredients are in kg per m³ of mix, age is in days and strength is in MPa.

| Column | Range |
|---|---|
| `cement` | 102 – 540 |
| `blast_furnace_slag` | 0 – 359.4 |
| `fly_ash` | 0 – 200.1 |
| `water` | 121.75 – 247 |
| `superplasticizer` | 0 – 32.2 |
| `coarse_aggregate` | 801 – 1145 |
| `fine_aggregate` | 594 – 992.6 |
| `age` | 1 – 365 (14 distinct values: 1, 3, 7, 14, 28, 56, 90, 91, 100, 120, 180, 270, 360, 365) |
| `compressive_strength` | 2.33 – 82.60 (**target**) |

Modeling notes:
- Many rows share the same mix and differ only in `age`. A random row split leaks mix information into the test set, so consider a grouped split by mix (all ingredient columns) when estimating generalization to *new* mix designs.
- Strength depends strongly and non-linearly on `age` (fast early gain, then a plateau). Use features such as `log(age)` and the water-to-binder ratio (`water / (cement + slag + fly_ash)`).
- EDA findings (`02_EDA.ipynb`): water/binder ratio is the strongest single feature (r ≈ −0.62 overall, −0.77 at 28 days), stronger than w/c or raw cement. The raw ingredients have VIF 5–7.5. `total_binder` is an exact linear combination of cement + slag + fly ash, so a linear model must not include all four. Replacing `cement` and `water` with one ratio brings every VIF under 3.
- Valid inputs for prediction, comparison and sensitivity analysis are bounded by the ranges above. Flag inputs outside them as extrapolation instead of predicting silently.
