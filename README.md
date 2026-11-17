# StrengthCast

### Machine Learning-Based Concrete Compressive Strength Prediction

> ***Know the strength before you pour.***

StrengthCast is a machine-learning decision-support tool for preliminary concrete mix design.
You enter the amount of each ingredient and the curing age, and the app predicts the 150 mm cube
compressive strength in MPa. It then plays the result out as a virtual lab test: the ingredients go
into a mixer, the concrete is cast and cured, and the cube is crushed in a compression machine until
it fails at the predicted load.

![Demo: a mix is charged, mixed, cast, cured and crushed in the compression machine](docs/images/demo.gif)

> [!IMPORTANT]
> Predictions are estimates for **preliminary** mix design and quality assessment. They supplement
> laboratory compression testing and **do not replace it**. Always verify with physical tests before
> using a mix in construction.

---

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [How it works](#how-it-works)
- [Model performance](#model-performance)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [API](#api)
- [Retraining or switching the model](#retraining-or-switching-the-model)
- [Limitations](#limitations)
- [Dataset and credits](#dataset-and-credits)

---

## Features

- **Mix designer.** Set each of the 7 ingredients with a slider or by typing a value (kg per m³ of
  concrete), and pick a curing age from 3 to 365 days. Each ingredient icon grows or shrinks with its amount.
- **Presets from real mixes.** Five 28-day mixes taken from the dataset: Standard, High strength,
  Slag blend, Fly-ash blend and Lean mix.
- **Animated virtual test.** Charge → Mix → Cast → Cure → Test. The console shows load (kN) and stress
  (MPa) on an LCD and a dial with a peak-hold needle. The cube cracks and fails in the classic hourglass
  shape at the predicted load (failure load in kN = MPa × 22.5 for a 150 mm cube).
- **Live derived values.** Water/cement and water/binder ratios, total binder and total mass update as you type.
- **Input checks.** The app still predicts, but it tells you when not to trust the number blindly:
  - any ingredient or age outside the training data range is flagged as an extrapolation;
  - a total mass outside the realistic 2200–2600 kg/m³ window is flagged;
  - a **water/binder ratio** outside the training range (0.235–0.90) is flagged. Every ingredient can be in
    range while the combination is not;
  - a **dry mix without superplasticizer** (w/b below 0.35 with no SP) gets a workability warning. Such a mix may be
    too stiff to place and compact, so its real strength would fall, but the model assumes full compaction and would
    keep predicting more strength as water drops. The w/b value turns orange when either w/b check fires.
- **Uncertainty.** Every prediction carries ± the model's test RMSE (3.73 MPa). Hovering the model chip in the
  header also shows the larger error for brand-new mix designs (5.07 MPa).
- **Test log and comparison.** Every cube you test is logged. Tick two or more to compare them side by
  side, with differences shown against the first.
- **Strength vs age.** For the latest cube, the predicted strength development from 3 to 365 days with
  its error band.
- **Sensitivity analysis.** For the latest cube, one small chart per input, each sweeping that input across
  its training range while the others stay fixed. Steeper charts mean that input matters more for this mix.
- **Live estimate** (optional). The predicted strength updates while you drag the sliders, without running
  the animation.

## Screenshots

**Main screen after a test.** The stage on the left shows the failed cube and the console reading; the mix
panel on the right holds the inputs.

![Main screen](docs/images/app-overview.png)

**Comparing two tested mixes**

![Comparison of two mixes](docs/images/compare.png)

**Strength development with curing age**

![Strength vs age chart](docs/images/strength-vs-age.png)

**Sensitivity of predicted strength to each input**

![Sensitivity analysis](docs/images/sensitivity.png)

**Workability warning.** The Standard mix with water cut to 135 kg and no superplasticizer (w/b 0.34).

![Workability warning for a dry mix without superplasticizer](docs/images/workability-warning.png)

## How it works

### Architecture

![StrengthCast high-level architecture](docs/StrengthCast.png)

The app has three parts:

- **Client (web browser):** the React app where you design the mix, watch the virtual test and explore the results.
- **Server (FastAPI):** checks the inputs and runs the trained model. The same server also hosts the web page itself.
- **Offline ML pipeline:** Jupyter notebooks that train the model and save it as a `.joblib` file, which the
  server loads once at startup.

Editable source: [`docs/StrengthCast.drawio`](docs/StrengthCast.drawio). Open it in
[diagrams.net](https://app.diagrams.net) or the VS Code Draw.io extension.

### Request flow

1. The frontend sends the 8 raw inputs: 7 ingredients in kg/m³ plus age in days.
2. The backend loads the trained pipeline once at startup and checks the inputs against the training
   ranges, the density window and the water/binder checks.
3. The pipeline's first step (`ConcreteFeatures`) derives the engineered features, so training and serving
   always run the same code.
4. The prediction comes back **before** the animation starts; the animation only reveals it.

### ML pipeline

The notebooks in [`backend/ML/`](backend/ML) form the pipeline and are run in order. See
[`backend/ML/README.md`](backend/ML/README.md) for details.

| Notebook | Purpose |
|---|---|
| `01_Data_Loading` | Load and inspect the raw data (1030 rows, including 25 exact duplicates, so 1005 unique rows from 428 mix designs are used) |
| `02_EDA` | Distributions, correlations, multicollinearity (VIF), strength vs age. Findings: [`docs/EDA_and_Outlier_Insights.md`](docs/EDA_and_Outlier_Insights.md) |
| `03_OutlierDetection` | IQR and z-score checks. All rows are kept: the flagged ones are real high-performance or edge-of-range mixes |
| `04_DataSplit` | Dedupe → 80/20 train/test split and 5 CV folds (stratified by curing age) → engineered features |
| `05_Model` | Baselines (raw vs engineered) → Optuna tuning of the top 3 → physics constraints → test set → new-mix check → save |

Key modelling choices:

- **Engineered features:** `log(age)` (straightens the fast-early-gain-then-plateau curve),
  water/binder ratio (the strongest single predictor, r ≈ −0.77 at 28 days), water/cement ratio and total binder.
- **Physics constraints:** the model is monotonically constrained so that predicted strength can only
  rise with age and cement, and only fall with water.
- **√strength target:** the model learns √strength, and its output is clipped at 0 before squaring, so
  predicted strength can never be negative.

## Model performance

Selected model: **LightGBM**, tuned, with engineered features and physics monotonic constraints
(`backend/ML/models/concrete_strength_model_v3.joblib`, refit on all 1,005 rows after evaluation).

| Metric | Value |
|---|---|
| Test R² (held-out 20%) | **0.944** |
| Test RMSE | 3.73 MPa |
| Test MAE | 2.53 MPa |
| 5-fold CV R² | 0.928 |
| 5-fold CV RMSE | 4.35 MPa |
| Test predictions within ±5 / ±10 MPa | 87% / 97% |
| **Brand-new mix designs** (grouped-by-mix CV) | R² 0.900 · RMSE 5.07 MPa · MAE 3.59 MPa |

The test split is by row, stratified by age, so the test score means "known mix, new curing age": 74% of test
rows are mixes the model saw at another age. For a brand-new mix design, the grouped-by-mix score is the better
guide: there every row of a mix stays on one side of the split, so the mix is never seen at any age
(`05_Model`, section 6.2). The app's model chip shows both error figures on hover.

**How the model was chosen** ([`05_Model`](backend/ML/05_Model.ipynb)):

1. **Baselines.** 11 models with default parameters, each on raw and engineered features, scored on 5 CV folds.
   Engineered features improved every model; the boosting models led.
2. **Tuning.** The top 3 (LightGBM, HistGradientBoosting, XGBoost) were tuned with Optuna on the same folds.
3. **Physics constraints.** The tuned unconstrained models failed the physics check (strength falling with age
   in 43–56 mixes; more cement lowering strength somewhere in every mix). The constrained models were re-baselined
   and re-tuned, and all pass it.
4. **Selection** by CV RMSE among models that pass the physics check, then scored once on the test set.
5. **New-mix check.** Grouped-by-mix CV on all 1,005 rows, then the selected model is refit on all rows and saved.

| Model (engineered features) | Stage | CV R² | CV RMSE | Test R² | Test RMSE | Physics check |
|---|---|---|---|---|---|---|
| Linear Regression | baseline | 0.808 | 7.16 | 0.800 | 7.01 | – |
| KNN | baseline | 0.836 | 6.61 | 0.861 | 5.84 | – |
| SVR | baseline | 0.893 | 5.35 | 0.899 | 4.98 | – |
| Random Forest | baseline | 0.901 | 5.11 | 0.930 | 4.16 | – |
| Extra Trees | baseline | 0.901 | 5.10 | 0.929 | 4.19 | – |
| Gradient Boosting | baseline | 0.904 | 5.04 | 0.923 | 4.35 | – |
| XGBoost | baseline | 0.907 | 4.94 | 0.953 | 3.42 | – |
| LightGBM | baseline | 0.918 | 4.64 | 0.945 | 3.67 | – |
| XGBoost | tuned | 0.927 | 4.36 | 0.953 | 3.40 | fails |
| LightGBM | tuned | 0.931 | 4.21 | 0.953 | 3.41 | fails |
| XGBoost | tuned + constrained | 0.926 | 4.38 | 0.940 | 3.86 | passes |
| **LightGBM** | **tuned + constrained (selected)** | **0.928** | **4.35** | **0.944** | **3.73** | **passes** |

The unconstrained LightGBM is about 0.3 MPa more accurate on the row split, but on **brand-new mix designs**
(grouped-by-mix CV) the two are tied: R² 0.903 / RMSE 5.02 MPa unconstrained against 0.900 / 5.07 MPa constrained,
a gap smaller than the ±0.5 MPa spread between folds. Its extra accuracy comes from mixes it has already seen.
Its age curves and sensitivity sweeps contradict concrete physics, and the app shows exactly those views, so the
constraints were kept.

## Tech stack

| Layer | Tools |
|---|---|
| ML | Python 3.10, pandas, NumPy, scikit-learn, LightGBM, XGBoost, Jupyter |
| Backend | FastAPI, Pydantic, Uvicorn, joblib |
| Frontend | React 18, Vite 5. No UI or chart libraries: charts and the animation are hand-written SVG |

## Project structure

```
.
├── backend/
│   ├── app.py               FastAPI app: /api routes + serves the built frontend at /
│   ├── model_service.py     Model loading, predict, age curve, sensitivity, input checks, presets
│   ├── Data/                Dataset (raw .xls, CSV, fold split)
│   └── ML/
│       ├── 01_…05_*.ipynb   Training pipeline notebooks
│       ├── features.py      Feature engineering shared by training and serving
│       ├── data/            splits.csv: train/test split, CV folds and engineered features
│       ├── models/          Trained model bundles + metrics (loaded by the app)
│       └── archive/         Earlier notebook versions
├── frontend/
│   ├── index.html
│   ├── vite.config.js       Dev server on :5173, proxies /api to :8000
│   └── src/
│       ├── App.jsx          State, mix & test flow, test log, tabs, warnings
│       ├── lib/stage.js     SVG animation: mixer, mould, curing tank, compression machine, console
│       ├── lib/mix.js       Derived values and instant client-side warnings
│       └── components/      MixPanel, IngredientIcon, StageView, TestLog, Analysis, charts, Tooltip
├── docs/
│   ├── StrengthCast.drawio  Architecture diagram (editable source) + StrengthCast.png export
│   ├── EDA_and_Outlier_Insights.md   Cell-by-cell findings of 02_EDA and 03_OutlierDetection
│   └── images/              README screenshots and demo GIF
└── requirements.txt
```

## Getting started

### Prerequisites

- Python 3.10
- Node.js 18 or newer (for building the frontend)

### 1. Install the Python dependencies

```bash
python -m venv .venv
# Windows (PowerShell):  .venv\Scripts\Activate.ps1
# Windows (Git Bash):    source .venv/Scripts/activate
# macOS / Linux:         source .venv/bin/activate
pip install -r requirements.txt
```

The library versions are pinned because the saved model is a pickled scikit-learn/LightGBM pipeline,
which needs compatible versions to load.

### 2. Build the frontend

```bash
cd frontend
npm install
npm run build        # writes frontend/dist, which the backend serves
cd ..
```

### 3. Run the app

```bash
cd backend
uvicorn app:app --reload
```

Open **http://127.0.0.1:8000**. FastAPI's interactive API docs are at http://127.0.0.1:8000/docs.

### Frontend development (hot reload)

Keep the backend running, then in a second terminal:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` calls to the backend on port 8000. After frontend changes,
run `npm run build` again so that the backend serves the new version.

## API

Every POST body is one flat JSON object: the 7 ingredients in kg/m³ plus `age` in days.

```json
{
  "cement": 397, "blast_furnace_slag": 0, "fly_ash": 0, "water": 185.7,
  "superplasticizer": 0, "coarse_aggregate": 1040.6, "fine_aggregate": 734.3, "age": 28
}
```

| Method | Path | Returns |
|---|---|---|
| GET | `/api/meta` | Input ranges and steps, ages, presets, model metrics, density window, w/b range and dry-mix threshold |
| POST | `/api/predict` | `strength_mpa`, `low_mpa` / `high_mpa` (± test RMSE), `failure_load_kn`, derived ratios, `warnings` |
| POST | `/api/age-curve` | `[{ "age": …, "strength_mpa": … }]` for 3–365 days |
| POST | `/api/sensitivity` | For each input, a sweep across its training range with the others held fixed |
| GET | `/api/health` | Status and model name |

Out-of-range inputs are still predicted, but the response includes warnings. Missing fields, or a zero or
negative cement or water value, are rejected with a 422 error.

## Retraining or switching the model

1. Run the notebooks in `backend/ML/` in order. `05_Model.ipynb` saves the bundle to `backend/ML/models/`
   (currently `concrete_strength_model_v3.joblib`).
2. The backend loads models straight from that folder. To use a different file, change `MODEL_FILE` at the
   top of [`backend/model_service.py`](backend/model_service.py).
3. Restart the server.

## Limitations

- **Trained on 1,005 mixes.** Predictions are only meaningful inside the ranges of that data
  (for example cement 102–540 kg/m³, water 121.75–247 kg/m³, age 1–365 days). The app flags anything outside them.
- **No physical properties beyond the mix.** Cement type, aggregate shape and grading, curing temperature,
  compaction and admixture chemistry are not inputs, so two mixes with the same proportions can still differ in reality.
- **Full compaction is assumed.** The dataset has no workability (slump) data, so the model cannot tell when a
  mix is too dry to place. Because of the physics constraint it always predicts more strength for less water.
  Real high-strength concrete reaches low w/b with superplasticizer: every training mix below w/b 0.28 uses it.
  The app warns when w/b is below 0.35 without superplasticizer.
- **Sensitivity curves show model behaviour.** Changing one ingredient while holding the others fixed can
  produce mixes that wouldn't exist in practice, and tree models give stepped curves. Read the trend, not each step.
- **Age 1 day is not offered**, because the data has only 2 one-day samples.

## Dataset and credits

The data is the **Concrete Compressive Strength** dataset from the UCI Machine Learning Repository
(1,030 samples, 8 inputs, strength in MPa), donated by Prof. I-Cheng Yeh.
