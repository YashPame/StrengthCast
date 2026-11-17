# EDA and Outlier Detection: Insights, Cell by Cell

This document walks through `backend/ML/02_EDA.ipynb` and `backend/ML/03_OutlierDetection.ipynb` one cell at a time. For each cell it says what the code does and what we learned. It ends with a summary of how these findings shaped the model and the app.

Some numbers only appear in plots (heatmaps, curves). Those were recomputed from the same data so they can be quoted here, and they are marked *(from plot)*.

**Units:** ingredients are in kg per m³ of concrete, age is in days, and strength is in MPa.

---

## Part 1: `02_EDA.ipynb` (Exploratory Data Analysis)

The EDA runs on the **raw 1030 rows**, before duplicates are removed. Column names here are the short raw ones (`slag`, `strength`). Later notebooks use `blast_furnace_slag` and `compressive_strength`.

### Cell 1: Imports and display settings
Loads pandas, numpy, matplotlib and seaborn, and makes pandas show every column.
**Insight:** none (setup only).

### Cell 2: Load data, `df.head()`
The first rows show the dataset layout: 7 ingredients, `age`, and `strength`.
**Insight:**
- Rows 0 and 1 are the **same mix** (540 cement, 162 water, 28 days) except for coarse aggregate (1040 vs 1055), yet their strengths are 80.0 and 61.9 MPa. A 15 kg change in aggregate cannot explain an 18 MPa difference, so this is **lab-to-lab or batch scatter**. The dataset contains a level of noise that no model can remove.
- Rows 2 and 3 are one mix tested at 270 and 365 days. **Each mix can appear several times at different ages.**

### Cell 3: Shape and data types
1030 rows × 9 columns. Every column is numeric (`age` is an integer, the rest are floats).
**Insight:** no text or category columns, so no encoding is needed. Every column can go straight into a model.

### Cell 4: Missing values
0 missing values in every column.
**Insight:** no imputation is needed.

### Cell 5: Duplicate rows
There are **25 exact duplicate rows**. One mix (362.6 cement, 189 slag, 164.9 water, 11.6 SP) appears **4 times at 3 days with exactly the same strength, 35.301171 MPa**, and again repeated at 7 and 28 days.
**Insight:**
- Identical strength to 6 decimal places cannot come from separate cubes, because real repeat tests always vary a little. These are **data-entry copies**, not genuine repeat tests.
- They must be dropped **before** the train/test split. Otherwise the same row can land in both train and test and inflate the test score. → 1005 unique rows remain (done in `03` and `04`).

### Cell 6: `describe()` summary statistics

| Column | Mean | Median | Min | Max | Note |
|---|---|---|---|---|---|
| cement | 281 | 273 | 102 | 540 | wide spread |
| slag | 74 | **22** | 0 | 359 | median far below mean |
| fly_ash | 54 | **0** | 0 | 200 | over half the rows have none |
| water | 182 | 185 | 122 | 247 | narrow spread (std 21) |
| superplasticizer | 6.2 | 6.35 | 0 | 32.2 | many zeros |
| coarse_aggregate | 973 | 968 | 801 | 1145 | symmetric |
| fine_aggregate | 774 | 780 | 594 | 993 | symmetric |
| age | 46 | **28** | 1 | 365 | heavily right-skewed |
| strength | 35.8 | 34.4 | 2.3 | 82.6 | roughly symmetric |

**Insight:**
- These min/max values became the **valid input ranges** for the app. Anything outside them is flagged as extrapolation.
- Slag, fly ash and SP have many zeros: they are optional ingredients, not always present.
- The median age is 28 days, the standard test age.

### Cell 7: Distinct ages and samples per age
There are only **14 distinct ages**: 1, 3, 7, 14, 28, 56, 90, 91, 100, 120, 180, 270, 360, 365.

| Age | 1 | 3 | 7 | 14 | **28** | 56 | 90 | 91 | 100 | 120 | 180 | 270 | 360 | 365 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rows | **2** | 134 | 126 | 62 | **425** | 91 | 54 | 22 | 52 | **3** | 26 | 13 | 6 | 14 |

**Insight:**
- 41% of the rows are at 28 days. The model is most reliable there.
- **Age 1 has only 2 rows** and age 120 only 3. The model cannot learn these well, which is why **age 1 is left out of the app**.
- Age is effectively a set of discrete test days, not a continuous variable.

### Cell 8: Water/cement ratio
w/c ranges from **0.27 to 1.88** (mean 0.75, median 0.68). Its correlation with strength is **−0.50**.
**Insight:**
- w/c is roughly as strong as cement alone (r 0.50), but on the opposite side: more water per kg of cement means weaker concrete.
- **A w/c of 1.88 would be impossible in plain cement concrete.** It only happens because some mixes use very little cement and a lot of slag or fly ash, so w/c is misleading for blended mixes. This motivated the **w/b ratio** (Cell 21).

### Cell 9: Full statistics table, IQR outlier counts and skewness

| Column | IQR outliers | Skewness |
|---|---|---|
| cement | 0 | 0.51 |
| slag | 2 | 0.80 |
| fly_ash | 0 | 0.54 |
| water | 9 | 0.07 |
| superplasticizer | 10 | 0.91 |
| coarse_aggregate | 0 | −0.04 |
| fine_aggregate | 5 | −0.25 |
| **age** | **59** | **3.27** |
| strength | 4 | 0.42 |

**Insight:**
- **Age is the only strongly skewed column** (3.27). Its 59 "outliers" are simply every row tested at 180, 270, 360 or 365 days, which are real long-term tests. Skewness this strong points to a **log(age)** transform.
- The 4 strength outliers are all real high-strength mixes (80.0–82.6 MPa) with high cement or superplasticizer and low water. They are not errors.
- The ingredients are only mildly skewed (all below 1), so no transform is needed for them.

### Cell 10: Histogram + boxplot for every column *(plots)*
**Insight:**
- Slag, fly ash and SP each show a **large spike at 0** and then a spread of non-zero values. They are effectively "absent or present, then how much". This led to the with/without analysis in Cells 11–12.
- Age shows a tall bar at 28 days, smaller bars at 3, 7 and 56, and a long thin tail to 365.
- Strength looks roughly bell-shaped with a slight right tail. The target needs no transform for EDA, though the model later learns √strength so its predictions can never be negative.

### Cell 11: Strength with vs without slag, fly ash and SP

| Ingredient | Rows without (%) | Mean without | Mean with | Difference |
|---|---|---|---|---|
| slag | 466 (45%) | 31.7 | 39.3 | **+7.6** |
| fly_ash | 566 (55%) | 36.8 | 34.7 | **−2.1** |
| superplasticizer | 379 (37%) | 29.5 | 39.5 | **+10.0** |

Split by age *(recomputed)*:

| Ingredient | ≤ 7 days (with − without) | 28 days | ≥ 56 days |
|---|---|---|---|
| slag | +6.8 | +7.2 | +11.2 |
| fly_ash | −1.0 | **−5.4** | **−2.3** |
| superplasticizer | +11.9 | +6.4 | +11.4 |

**Insight:**
- **Fly ash** mixes are weaker at 28 days, but the gap shrinks at 56 days and later. That fits fly ash's slow (pozzolanic) reaction: it catches up over time.
- **Superplasticizer** doesn't add strength directly. SP mixes use **less water** (173 vs 196 kg on average; w/b 0.42 vs 0.55). The SP benefit is really a **lower water content**.
- **Slag** mixes look stronger, but this is partly **confounding**: slag mixes in this dataset tend to come from series with low w/b. These are raw group averages, not cause and effect.

### Cell 12: Boxplots of strength with vs without each ingredient *(plot)*
A visual version of Cell 11.
**Insight:** the with/without boxes overlap heavily. None of these three ingredients on its own decides strength.

### Cell 13: Age as an ordered category
Builds an ordered category for plotting (14 levels).
**Insight:** setup for the age plots. Treating age as a category spaces the points evenly, so the early ages are not squashed together.

### Cell 14: Strength by age (count, mean, median, std, min, max)

| Age | 1 | 3 | 7 | 14 | 28 | 56 | 90 | **91** | 100 | 120 | 180 | 270 | 360 | 365 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Mean MPa | 9.5 | 19.0 | 26.1 | 28.8 | 36.8 | 51.9 | **40.5** | **69.8** | 47.7 | 39.7 | 41.7 | 51.3 | 40.7 | 43.6 |

**Insight (important):**
- Strength rises fast in the first 28 days: about 19 → 37 MPa from 3 to 28 days.
- **After 56 days the averages zig-zag.** The 90-day mean is 40.5 but the 91-day mean is 69.8, and 360 days is lower than 270 days.
- This is **not real**: concrete doesn't lose strength with age. Different ages were tested on **different sets of mixes** *(recomputed)*:
  - The 22 rows at **91 days** are 17 high-performance mixes (average 392 cement, 15 SP, 158 water).
  - The 54 rows at **90 days** are ordinary mixes (284 cement, no SP, 201 water).
- **Raw age averages mix up the effect of age with the effect of mix composition.** This is a key reason the final model uses **monotonic constraints**: without them it can learn these false dips (see `05_Model`, section 4).

Following **the same mix** across ages gives the true curve *(recomputed)*:

| Same-mix comparison | Mixes | Average ratio |
|---|---|---|
| 3 d / 28 d | 122 | 0.44 |
| 7 d / 28 d | 115 | 0.64 |
| 56 d / 28 d | 84 | 1.18 |

These match the textbook values: 7-day strength is about 65% of 28-day, and there is a further 15–20% gain by 56 days.

### Cell 15: Sample count per age *(bar chart)*
**Insight:** the same counts as Cell 7, drawn as a chart. It shows clearly how much the data depends on 28 days, and how thin the data is at 1, 120 and 360 days.

### Cell 16: Boxplot of strength by age *(plot)*
**Insight:**
- Spread is large at every age (for example, 28-day strength runs from 8.5 to 81.8 MPa). **Age alone explains only part of strength**, and the mix explains the rest.
- The narrow, high box at 91 days confirms that this group is a special subset (Cell 14).

### Cell 17: Mean strength vs age (real days and as a category) *(plot)*
**Insight:**
- On a real day scale the curve rises steeply and then flattens: a **logarithmic shape**. That supports using **log(age)** as a feature.
- On the category scale the post-56-day zig-zag (the composition effect) is easy to see.

### Cell 18: Correlation heatmap (Pearson) *(plot)*
Key pairs *(from plot)*:

| Pair | r | Meaning |
|---|---|---|
| water – superplasticizer | **−0.66** | SP replaces water (a water reducer) |
| water – fine_aggregate | −0.45 | drier mixes use more sand |
| cement – fly_ash | −0.40 | fly ash replaces cement |
| fly_ash – superplasticizer | +0.38 | fly-ash mixes often also use SP |
| cement – strength | +0.50 | strongest single ingredient |
| age – (any ingredient) | below 0.3 | age is independent of the mix design |

**Insight:** the ingredients **trade off against each other**. Adding one usually means less of another, because the mix must fill 1 m³.

### Cell 19: Pearson vs Spearman correlation with strength

| Feature | Pearson | Spearman | Gap |
|---|---|---|---|
| cement | 0.498 | 0.478 | −0.02 |
| superplasticizer | 0.366 | 0.348 | −0.02 |
| **age** | **0.329** | **0.596** | **+0.27** |
| slag | 0.135 | 0.162 | +0.03 |
| fly_ash | −0.106 | −0.078 | +0.03 |
| coarse_aggregate | −0.165 | −0.184 | −0.02 |
| fine_aggregate | −0.167 | −0.180 | −0.01 |
| water | −0.290 | −0.308 | −0.02 |

**Insight:**
- **Age has a large gap** (0.33 vs 0.60): it has a strong, steady (monotonic) but **non-linear** link with strength. A straight-line model underuses age, which calls for a log transform.
- For every other feature Pearson ≈ Spearman, so their raw trends are close to linear.
- **Coarse and fine aggregate have weak links** (|r| < 0.2). They act mainly as filler.

### Cell 20: Scatter of each feature vs strength, with a curved trend line *(plot)*
**Insight:**
- Cement: a clear upward trend, but with a very wide band. At any cement content, strength varies by roughly 40 MPa, depending on water and age.
- Water: a downward trend.
- Age: a sharp rise, then a flat top (the log shape again).
- Slag, fly ash and aggregates: almost flat clouds.
- **No single ingredient predicts strength well on its own.** A non-linear, multi-feature model is needed.

### Cell 21: w/c, w/b and log(age) vs strength

| Feature | r with strength |
|---|---|
| water / cement | −0.501 |
| **water / binder** | **−0.623** |
| log(age) | +0.552 |

(binder = cement + slag + fly ash)

**Insight:**
- **The water/binder ratio is the strongest single predictor in the dataset**, stronger than cement (0.50) and stronger than w/c. Counting slag and fly ash as binder fixes the misleading w/c values of blended mixes.
- **log(age)** correlates better than raw age (0.55 vs 0.33), which confirms the transform.
- → Both became engineered features: `water_binder`, `water_cement`, `total_binder`, `log_age`.

### Cell 22: Cement vs strength, colored by age *(plot)*
**Insight:** at the same cement content, the old samples (yellow) sit far above the young ones (purple). Much of cement's "scatter" in Cell 20 is really age. **Age and mix must be modelled together.**

### Cell 23: Mean strength vs age for low, medium and high cement
Cement split into 3 equal groups: Low (102–214), Medium (214–321), High (321–540), about 343 rows each.

| Group | 3 d | 7 d | 28 d | 56 d |
|---|---|---|---|---|
| Low | 11.6 | 12.9 | 27.3 | 42.2 |
| Medium | 16.5 | 19.0 | 37.2 | 47.1 |
| High | 27.8 | 36.0 | 49.9 | 63.5 |

*(from plot)*

**Insight:**
- **More cement means higher strength at every age up to 56 days.** The three lines never cross in that range.
- Low-cement mixes start very slowly (12 MPa at 7 days) but more than triple by 56 days. Low-cement mixes are mostly slag and fly-ash blends, which gain strength late.
- After 56 days the lines get noisy again (the composition effect from Cell 14).

### Cell 24: Heatmap of cement level × age group

| Cement \ Age | Early (1–7) | Standard (14–28) | Late (56–365) |
|---|---|---|---|
| Low | 12.1 | 27.1 | 43.0 |
| Medium | 17.7 | 36.0 | 44.8 |
| High | 32.0 | 48.8 | 55.8 |

*(means from plot; every cell has 72–192 samples, so all are reliable)*

**Insight:**
- **High cement matters most early**: at early ages high-cement mixes are 2.6× stronger than low-cement ones (32.0 vs 12.1).
- **By late ages the gap narrows** (55.8 vs 43.0): low-cement blends catch up as the slag and fly ash keep reacting.
- **Cement and age interact.** A simple additive (linear) model can't capture this, but tree models can.

### Cell 25: Correlations at 28 days only (age effect removed)

| Feature | All ages | 28 days only |
|---|---|---|
| cement | 0.498 | **0.666** |
| superplasticizer | 0.366 | 0.213 |
| slag | 0.135 | 0.141 |
| coarse_aggregate | −0.165 | −0.120 |
| fine_aggregate | −0.167 | −0.138 |
| fly_ash | −0.106 | **−0.269** |
| water | −0.290 | **−0.399** |

At 28 days *(recomputed)*: w/c r = −0.655 and **w/b r = −0.769**.

**Insight:**
- Once age is held fixed, **the mix-design relationships get much clearer**: cement 0.50 → 0.67, water −0.29 → −0.40, **w/b −0.62 → −0.77**.
- Age differences were "hiding" the mix effects. This is why the model needs both age and mix features.
- **Fly ash becomes clearly negative at 28 days** (−0.27): fly ash slows early strength.
- **SP drops to 0.21**: its benefit is mostly indirect (it allows less water), which w/b already captures.

### Cell 26: Multicollinearity (correlated pairs and VIF)
Only one pair has |r| > 0.5: **water – superplasticizer (−0.66)**.

| Feature | VIF |
|---|---|
| cement | 7.49 |
| slag | 7.28 |
| fine_aggregate | 7.01 |
| water | 7.00 |
| fly_ash | 6.17 |
| coarse_aggregate | 5.08 |
| superplasticizer | 2.97 |
| age | 1.12 |

(VIF: 1 = independent, 5–10 = moderate, above 10 = serious.)

**Insight:**
- The raw ingredients have **moderate multicollinearity (VIF 5–7.5)**, even though no single pair is strongly correlated. The reason *(recomputed)* is that **the ingredients nearly add up to a constant**: the total mass is 2344 ± 65 kg/m³ (2195–2551), because every mix must fill 1 m³. Any ingredient can be roughly predicted from the others.
- **Age is independent** (VIF 1.1).
- Replacing `cement` and `water` with the single **w/b ratio** brings **every VIF under 2.4** *(recomputed)*.
- `total_binder` = cement + slag + fly ash exactly, so **a linear model must not include all four**. Tree models are not harmed by this.
- The near-constant total mass is also why the app checks a **2200–2600 kg/m³ density window**.

### Cells 27–28: empty

---

## Part 2: `03_OutlierDetection.ipynb`

### Cell 1 (markdown): Purpose
Find extreme values with the IQR and z-score rules, then decide whether any rows should be removed.

### Cell 2: Imports
**Insight:** none (setup only).

### Cell 3: Load data and drop duplicates
1030 → **1005 rows** after dropping the 25 exact duplicates.
**Insight:** everything from here on, including modelling, uses these 1005 unique rows.

### Cell 4: Boxplot of each column *(plot)*
**Insight:** points beyond the whiskers show up mostly in **age** (the long-term tests), **superplasticizer** (a few very high doses), **water** (both ends) and a few **slag** and **strength** values. Cement, fly ash and coarse aggregate have none.

### Cell 5: IQR method (outside Q1 − 1.5·IQR to Q3 + 1.5·IQR)

| Column | Outliers |
|---|---|
| slag | 2 |
| water | 15 |
| superplasticizer | 10 |
| fine_aggregate | 5 |
| age | 59 |
| strength | 8 |

**Insight:** IQR is a **sensitive** rule: it flags anything outside a fairly tight band. Age dominates because all the 180–365-day tests fall above the 129.5-day limit.

### Cell 6: Z-score method (|z| > 3)

| Column | Outliers |
|---|---|
| slag | 4 |
| water | 2 |
| superplasticizer | 10 |
| age | 33 |

**Insight:** the z-score rule is **stricter**, flagging only values more than 3 standard deviations from the mean. **No strength value is a z-score outlier**: the target itself is clean.

### Cell 7: Comparing the two methods

| Method | Outlier values | Rows affected |
|---|---|---|
| IQR | 99 | 94 (9.4%) |
| Z-score | 49 | 49 (4.9%) |

**Insight:**
- Removing every IQR outlier would throw away almost **1 in 10 rows**, which is too costly for a 1005-row dataset.
- Both methods agree on **superplasticizer (10)**. Those are the most clearly extreme values.

### Cell 8: Rows flagged by z-score, excluding age
Age is excluded on purpose because long-term tests are real data, not errors. **16 rows** are flagged.

**Insight:** looking at the actual rows:
- 10 rows are **2 high-performance mixes** (469 cement + 117 slag, and 531 cement), each tested at 3, 7, 28, 56 and 91 days. They have very low water (138–142 kg) and **very high SP (28–32 kg)**.
- 4 rows are 2 mixes at the **slag maximum** (342–359 kg).
- 2 rows are near-identical mixes at the **water maximum** (247 kg).

### Cell 9: A closer look at the flagged rows

| Check | Result |
|---|---|
| Flagged rows | 16 |
| Distinct mixes among them | **6** |
| Largest \|z\| of their strength | **2.18** (not an outlier) |
| SP max, all rows | 32.2 |
| SP max if removed | **23.4** |
| w/b of flagged rows | median **0.27** (min 0.24) |

**Insight:**
- The 16 rows are only **6 real mixes** measured at several ages. Removing them deletes whole mix designs, not stray points.
- Their strengths are **normal**: their inputs are unusual but their outputs aren't. A typo or measurement error would normally produce a strange strength as well.
- **Very low w/b (0.24–0.27) physically needs a high SP dose**, or the concrete couldn't be placed. The "extreme" SP and the "extreme" low water **belong together**: this is consistent high-performance concrete, not an error.

### Cell 10 (markdown): Decision: keep every row
**Reasons:**
1. **They are valid data**: high-performance mixes, or mixes at the edge of the design space. They are not errors.
2. **Removing them shrinks the valid range**: the SP limit would drop from 32.2 to 23.4 kg/m³, so genuine high-performance mixes would become "extrapolation" in the app.
3. **Removing them hurts accuracy**: grouped-by-mix CV R² was 0.903 with all 1005 rows against **0.897** after removal.
4. **Tree models aren't sensitive to extreme inputs**: they split on thresholds, so a large value doesn't pull the fit the way it does in linear regression.

→ `04_DataSplit` and `05_Model` use **all 1005 de-duplicated rows**. This notebook writes nothing to disk.

### Cells 11–12: empty

---

## Part 3: Summary: how these insights shaped the project

| # | Insight | Where it came from | What we did |
|---|---|---|---|
| 1 | 25 exact duplicate rows (copies, not repeat tests) | EDA 5, Outlier 3 | Dropped before splitting → 1005 rows |
| 2 | Each mix is tested at several ages (only 428 distinct mixes) | EDA 2, 14 | Grouped-by-mix CV to measure accuracy on **new** mixes |
| 3 | Age is skewed (3.27), and its link with strength is non-linear (Spearman 0.60 vs Pearson 0.33) | EDA 9, 17, 19 | Use **log(age)** as a feature |
| 4 | **w/b is the strongest predictor** (−0.62 overall, −0.77 at 28 days) | EDA 21, 25 | Engineered `water_binder`, `water_cement`, `total_binder` |
| 5 | w/c is misleading for slag and fly-ash mixes (up to 1.88) | EDA 8 | The app shows both w/c and w/b; w/b is the one to trust for blends |
| 6 | Raw age averages zig-zag because different mixes were tested at different ages | EDA 14, 23 | **Monotonic constraints** (age ↑, cement ↑, water ↓) in the final model |
| 7 | Cement and age interact (cement helps most early, blends catch up late) | EDA 23, 24 | Use tree models (LightGBM), which capture interactions |
| 8 | Raw ingredients have VIF 5–7.5 because the total mass is nearly constant | EDA 26 | Trees for the final model; never all four of `total_binder` + 3 binders in a linear model; the app checks 2200–2600 kg/m³ |
| 9 | SP's benefit comes through lower water | EDA 11, 18, 25 | SP left unconstrained in the model; its effect is captured via w/b |
| 10 | Fly ash lowers 28-day strength, but the gap shrinks later | EDA 11, 25 | Fly ash left unconstrained (no single correct direction) |
| 11 | Only 2 rows at age 1 and 3 at age 120 | EDA 7 | Age 1 removed from the app's ages and curves |
| 12 | Training min/max of each column | EDA 6 | Used as the app's valid input ranges, with an extrapolation warning outside them |
| 13 | Outlier-flagged rows are real high-performance or edge-of-range mixes | Outlier 8–10 | **Keep all rows** (removing them lowers R² and shrinks the SP range) |
| 14 | Identical mixes can differ by about 18 MPa (row 0 vs 1) | EDA 2 | Accept irreducible noise; the app states predictions supplement lab testing |
