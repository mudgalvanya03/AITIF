import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, learning_curve, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report, accuracy_score,
    confusion_matrix, roc_curve, auc,
    precision_recall_curve, average_precision_score
)
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.patches as mpatches
import joblib
import warnings
warnings.filterwarnings("ignore")

# ─── Config ──────────────────────────────────────────────────────────────────

DATASET_PATH = "../data/ml-dataset/dataset.csv"
MODEL_PATH   = "healing_model.pkl"
CHARTS_PATH  = "model_diagnostics.png"

# Dead features — zero variance in dataset (always 1 or always 0)
DROP_FEATURES = ["tagMatch", "idMatch"]

# ─── Load & Prepare ──────────────────────────────────────────────────────────

print("\n" + "="*55)
print("   AITIF Healing Model Training")
print("="*55 + "\n")

data = pd.read_csv(DATASET_PATH)

print(f"Dataset loaded:    {len(data)} rows")
print(f"Features dropped:  {DROP_FEATURES}  (zero variance — dead features)")

X = data.drop(columns=["chosen"] + DROP_FEATURES)
y = data["chosen"]

feature_names = list(X.columns)

print(f"Features used:     {feature_names}")
print(f"\nLabel distribution:")
print(f"  chosen=1:  {y.sum()} ({y.mean()*100:.1f}%)")
print(f"  chosen=0:  {(y==0).sum()} ({(1-y.mean())*100:.1f}%)")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"\nTrain: {len(X_train)}   Test: {len(X_test)}")

# ─── Model ───────────────────────────────────────────────────────────────────

model = RandomForestClassifier(
    n_estimators=300,
    max_depth=12,
    min_samples_split=4,
    min_samples_leaf=2,
    class_weight="balanced",   # handles remaining class imbalance
    random_state=42,
    n_jobs=-1
)

print("\nTraining model...")
model.fit(X_train, y_train)
print("Training complete.\n")

# ─── Predictions ─────────────────────────────────────────────────────────────

train_preds  = model.predict(X_train)
test_preds   = model.predict(X_test)
test_proba   = model.predict_proba(X_test)[:, 1]
train_proba  = model.predict_proba(X_train)[:, 1]

train_acc = accuracy_score(y_train, train_preds)
test_acc  = accuracy_score(y_test,  test_preds)
gap       = train_acc - test_acc

print("="*55)
print("MODEL PERFORMANCE")
print("="*55)
print(classification_report(y_test, test_preds))
print(f"Train accuracy:  {train_acc:.4f}")
print(f"Test  accuracy:  {test_acc:.4f}")
print(f"Gap (overfit?):  {gap:.4f}  ", end="")
if gap < 0.03:
    print("✓ Well-fitted")
elif gap < 0.07:
    print("⚠ Slight overfit")
else:
    print("❌ Overfitting")

# Cross-validation
cv_scores = cross_val_score(model, X, y, cv=5, scoring="accuracy", n_jobs=-1)
print(f"\nCross-val (5-fold): {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

# Feature importance
importance = pd.Series(model.feature_importances_, index=feature_names)
importance = importance.sort_values(ascending=False)
print("\nFeature Importance:")
for feat, score in importance.items():
    bar = "█" * int(score * 50)
    print(f"  {feat:<22} {score:.4f}  {bar}")

# Save model
joblib.dump(model, MODEL_PATH)
print(f"\nModel saved → {MODEL_PATH}")

# ─── Learning curve data (for overfit/underfit plot) ─────────────────────────

print("\nComputing learning curves (this takes ~30s)...")
train_sizes, train_scores, val_scores = learning_curve(
    RandomForestClassifier(
        n_estimators=100, max_depth=12, class_weight="balanced",
        random_state=42, n_jobs=-1
    ),
    X, y,
    train_sizes=np.linspace(0.1, 1.0, 10),
    cv=5,
    scoring="accuracy",
    n_jobs=-1
)

train_mean = train_scores.mean(axis=1)
train_std  = train_scores.std(axis=1)
val_mean   = val_scores.mean(axis=1)
val_std    = val_scores.std(axis=1)

# ─── ROC curve ───────────────────────────────────────────────────────────────

fpr, tpr, _ = roc_curve(y_test, test_proba)
roc_auc      = auc(fpr, tpr)

# Precision-Recall curve
precision, recall, _ = precision_recall_curve(y_test, test_proba)
ap_score = average_precision_score(y_test, test_proba)

# Confusion matrix
cm = confusion_matrix(y_test, test_preds)

# PCA scatter (2D projection of feature space)
pca = PCA(n_components=2, random_state=42)
X_pca = pca.fit_transform(X_test)

# ─── PLOT ────────────────────────────────────────────────────────────────────

fig = plt.figure(figsize=(20, 24))
fig.patch.set_facecolor("#0f1117")

gs = gridspec.GridSpec(4, 3, figure=fig, hspace=0.45, wspace=0.35)

DARK_BG    = "#1a1d27"
ACCENT1    = "#00d4ff"   # cyan
ACCENT2    = "#ff6b6b"   # red
ACCENT3    = "#51cf66"   # green
ACCENT4    = "#ffd43b"   # yellow
GRID_COLOR = "#2a2d3a"
TEXT_COLOR = "#e0e0e0"

def style_ax(ax, title):
    ax.set_facecolor(DARK_BG)
    ax.set_title(title, color=TEXT_COLOR, fontsize=11, fontweight="bold", pad=10)
    ax.tick_params(colors=TEXT_COLOR, labelsize=8)
    ax.xaxis.label.set_color(TEXT_COLOR)
    ax.yaxis.label.set_color(TEXT_COLOR)
    for spine in ax.spines.values():
        spine.set_edgecolor(GRID_COLOR)
    ax.grid(color=GRID_COLOR, linestyle="--", linewidth=0.5, alpha=0.7)

# ── 1. LEARNING CURVE (overfit / underfit diagnostic) ────────────────────────
ax1 = fig.add_subplot(gs[0, :2])
style_ax(ax1, "① Learning Curve  —  Overfit / Underfit Diagnostic")

n_samples = train_sizes * len(X_train)

ax1.plot(n_samples, train_mean, color=ACCENT1, lw=2, marker="o", markersize=5, label="Train accuracy")
ax1.fill_between(n_samples, train_mean - train_std, train_mean + train_std, alpha=0.15, color=ACCENT1)

ax1.plot(n_samples, val_mean, color=ACCENT2, lw=2, marker="s", markersize=5, label="Cross-val accuracy")
ax1.fill_between(n_samples, val_mean - val_std, val_mean + val_std, alpha=0.15, color=ACCENT2)

# Annotate the gap at the final point
final_gap = train_mean[-1] - val_mean[-1]
ax1.annotate(
    f"Gap = {final_gap:.3f}",
    xy=(n_samples[-1], (train_mean[-1] + val_mean[-1]) / 2),
    xytext=(n_samples[-1] * 0.75, (train_mean[-1] + val_mean[-1]) / 2),
    color=ACCENT4, fontsize=9,
    arrowprops=dict(arrowstyle="->", color=ACCENT4, lw=1.2)
)

# Zones
ax1.axhspan(0.95, 1.01, alpha=0.05, color=ACCENT3, label="Ideal zone (>0.95)")
ax1.set_ylim(0.5, 1.02)
ax1.set_xlabel("Training samples")
ax1.set_ylabel("Accuracy")
ax1.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=9)

# Diagnosis label
if final_gap < 0.03:
    diag_text, diag_color = "✓  WELL FITTED", ACCENT3
elif final_gap < 0.07:
    diag_text, diag_color = "⚠  SLIGHT OVERFIT", ACCENT4
else:
    diag_text, diag_color = "❌  OVERFITTING", ACCENT2

ax1.text(0.02, 0.08, diag_text, transform=ax1.transAxes,
         color=diag_color, fontsize=13, fontweight="bold",
         bbox=dict(boxstyle="round,pad=0.4", facecolor=DARK_BG, edgecolor=diag_color, alpha=0.8))

# ── 2. TRAIN vs TEST ACCURACY BAR ────────────────────────────────────────────
ax2 = fig.add_subplot(gs[0, 2])
style_ax(ax2, "② Train vs Test Accuracy")

bars = ax2.bar(["Train", "Test", "CV Mean"],
               [train_acc, test_acc, cv_scores.mean()],
               color=[ACCENT1, ACCENT2, ACCENT3], width=0.5, edgecolor=DARK_BG)

for bar, val in zip(bars, [train_acc, test_acc, cv_scores.mean()]):
    ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.005,
             f"{val:.3f}", ha="center", color=TEXT_COLOR, fontsize=10, fontweight="bold")

ax2.set_ylim(0, 1.1)
ax2.set_ylabel("Accuracy")
ax2.axhline(y=0.9, color=ACCENT4, linestyle="--", lw=1, alpha=0.6, label="0.90 target")
ax2.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=8)

# ── 3. FEATURE IMPORTANCE ────────────────────────────────────────────────────
ax3 = fig.add_subplot(gs[1, :2])
style_ax(ax3, "③ Feature Importance  —  What the Model Relies On")

imp_sorted = importance.sort_values(ascending=True)
colors = [ACCENT3 if v > 0.15 else ACCENT1 if v > 0.08 else ACCENT4 if v > 0.03 else ACCENT2
          for v in imp_sorted.values]
bars = ax3.barh(imp_sorted.index, imp_sorted.values, color=colors, edgecolor=DARK_BG, height=0.6)

for bar, val in zip(bars, imp_sorted.values):
    ax3.text(val + 0.003, bar.get_y() + bar.get_height()/2,
             f"{val:.3f}", va="center", color=TEXT_COLOR, fontsize=9)

ax3.set_xlabel("Importance Score")
legend_patches = [
    mpatches.Patch(color=ACCENT3, label="Strong (>0.15)"),
    mpatches.Patch(color=ACCENT1, label="Good (0.08–0.15)"),
    mpatches.Patch(color=ACCENT4, label="Weak (0.03–0.08)"),
    mpatches.Patch(color=ACCENT2, label="Dead (<0.03)"),
]
ax3.legend(handles=legend_patches, facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=8, loc="lower right")

# ── 4. CONFUSION MATRIX ──────────────────────────────────────────────────────
ax4 = fig.add_subplot(gs[1, 2])
style_ax(ax4, "④ Confusion Matrix")

im = ax4.imshow(cm, interpolation="nearest", cmap="Blues")
ax4.set_xticks([0, 1])
ax4.set_yticks([0, 1])
ax4.set_xticklabels(["Pred: 0\n(wrong)", "Pred: 1\n(correct)"], color=TEXT_COLOR)
ax4.set_yticklabels(["True: 0", "True: 1"], color=TEXT_COLOR)

thresh = cm.max() / 2
for i in range(2):
    for j in range(2):
        ax4.text(j, i, f"{cm[i,j]}",
                 ha="center", va="center", fontsize=14, fontweight="bold",
                 color="white" if cm[i,j] > thresh else "black")

ax4.set_xlabel("Predicted label")
ax4.set_ylabel("True label")

tn, fp, fn, tp = cm.ravel()
ax4.set_title(f"④ Confusion Matrix\nTP={tp}  FP={fp}  FN={fn}  TN={tn}",
              color=TEXT_COLOR, fontsize=10, fontweight="bold", pad=10)

# ── 5. ROC CURVE ─────────────────────────────────────────────────────────────
ax5 = fig.add_subplot(gs[2, 0])
style_ax(ax5, f"⑤ ROC Curve  (AUC = {roc_auc:.3f})")

ax5.plot(fpr, tpr, color=ACCENT1, lw=2, label=f"AUC = {roc_auc:.3f}")
ax5.plot([0,1], [0,1], color=GRID_COLOR, lw=1.5, linestyle="--", label="Random classifier")
ax5.fill_between(fpr, tpr, alpha=0.1, color=ACCENT1)
ax5.set_xlabel("False Positive Rate")
ax5.set_ylabel("True Positive Rate")
ax5.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=9)

auc_color = ACCENT3 if roc_auc > 0.9 else ACCENT4 if roc_auc > 0.75 else ACCENT2
ax5.text(0.55, 0.15, f"AUC = {roc_auc:.3f}", color=auc_color,
         fontsize=14, fontweight="bold", transform=ax5.transAxes)

# ── 6. PRECISION-RECALL CURVE ────────────────────────────────────────────────
ax6 = fig.add_subplot(gs[2, 1])
style_ax(ax6, f"⑥ Precision-Recall  (AP = {ap_score:.3f})")

ax6.plot(recall, precision, color=ACCENT3, lw=2, label=f"AP = {ap_score:.3f}")
ax6.fill_between(recall, precision, alpha=0.1, color=ACCENT3)
ax6.axhline(y=y.mean(), color=ACCENT2, linestyle="--", lw=1.5,
            label=f"Baseline ({y.mean():.2f})")
ax6.set_xlabel("Recall")
ax6.set_ylabel("Precision")
ax6.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=9)

# ── 7. PROBABILITY DISTRIBUTION ──────────────────────────────────────────────
ax7 = fig.add_subplot(gs[2, 2])
style_ax(ax7, "⑦ Predicted Probability Distribution")

prob_pos = test_proba[y_test == 1]
prob_neg = test_proba[y_test == 0]

bins = np.linspace(0, 1, 30)
ax7.hist(prob_neg, bins=bins, alpha=0.65, color=ACCENT2, label="chosen=0 (wrong)",  density=True)
ax7.hist(prob_pos, bins=bins, alpha=0.65, color=ACCENT3, label="chosen=1 (correct)", density=True)
ax7.axvline(x=0.5, color=ACCENT4, linestyle="--", lw=1.5, label="Decision boundary")
ax7.set_xlabel("Predicted probability")
ax7.set_ylabel("Density")
ax7.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=8)

# Good separation = model works. Overlap = model struggles.
separation = abs(prob_pos.mean() - prob_neg.mean())
sep_text = "Good separation ✓" if separation > 0.3 else "Weak separation ⚠"
sep_color = ACCENT3 if separation > 0.3 else ACCENT4
ax7.text(0.05, 0.92, sep_text, transform=ax7.transAxes,
         color=sep_color, fontsize=9, fontweight="bold")

# ── 8. SCATTER: PCA projection of feature space ──────────────────────────────
ax8 = fig.add_subplot(gs[3, :2])
style_ax(ax8, "⑧ Feature Space Scatter  —  PCA Projection (2D)")

correct_mask   = (test_preds == y_test.values)
incorrect_mask = ~correct_mask

# Correct predictions
ax8.scatter(X_pca[correct_mask & (y_test.values==1), 0],
            X_pca[correct_mask & (y_test.values==1), 1],
            c=ACCENT3, s=18, alpha=0.6, label="Correct: chosen=1", marker="o")
ax8.scatter(X_pca[correct_mask & (y_test.values==0), 0],
            X_pca[correct_mask & (y_test.values==0), 1],
            c=ACCENT1, s=18, alpha=0.4, label="Correct: chosen=0", marker="o")

# Misclassified
ax8.scatter(X_pca[incorrect_mask, 0],
            X_pca[incorrect_mask, 1],
            c=ACCENT2, s=40, alpha=0.9, label="Misclassified", marker="X", zorder=5)

ax8.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]*100:.1f}% variance)")
ax8.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]*100:.1f}% variance)")
ax8.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=9, markerscale=1.5)

total_var = sum(pca.explained_variance_ratio_) * 100
ax8.text(0.02, 0.05, f"PCA captures {total_var:.1f}% of variance",
         transform=ax8.transAxes, color=TEXT_COLOR, fontsize=8, alpha=0.7)

# ── 9. CROSS-VALIDATION SCORES ───────────────────────────────────────────────
ax9 = fig.add_subplot(gs[3, 2])
style_ax(ax9, "⑨ Cross-Validation (5-Fold)")

fold_labels = [f"Fold {i+1}" for i in range(len(cv_scores))]
bar_colors  = [ACCENT3 if s > 0.9 else ACCENT4 if s > 0.8 else ACCENT2 for s in cv_scores]
bars = ax9.bar(fold_labels, cv_scores, color=bar_colors, edgecolor=DARK_BG, width=0.6)

for bar, val in zip(bars, cv_scores):
    ax9.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.005,
             f"{val:.3f}", ha="center", color=TEXT_COLOR, fontsize=9, fontweight="bold")

ax9.axhline(y=cv_scores.mean(), color=ACCENT1, linestyle="--", lw=1.5,
            label=f"Mean = {cv_scores.mean():.3f}")
ax9.axhspan(cv_scores.mean() - cv_scores.std(),
            cv_scores.mean() + cv_scores.std(),
            alpha=0.1, color=ACCENT1, label=f"±1 std = {cv_scores.std():.3f}")

ax9.set_ylim(0.5, 1.05)
ax9.set_ylabel("Accuracy")
ax9.legend(facecolor=DARK_BG, labelcolor=TEXT_COLOR, fontsize=8)

# Consistency check
if cv_scores.std() < 0.02:
    cv_text, cv_color = "Stable ✓", ACCENT3
elif cv_scores.std() < 0.05:
    cv_text, cv_color = "Acceptable ⚠", ACCENT4
else:
    cv_text, cv_color = "Unstable ❌", ACCENT2

ax9.text(0.05, 0.08, cv_text, transform=ax9.transAxes,
         color=cv_color, fontsize=11, fontweight="bold")

# ── Title ─────────────────────────────────────────────────────────────────────
fig.suptitle(
    f"AITIF Healing Model — Diagnostic Report\n"
    f"Train Acc: {train_acc:.3f}  |  Test Acc: {test_acc:.3f}  |  "
    f"AUC: {roc_auc:.3f}  |  CV: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}",
    color=TEXT_COLOR, fontsize=14, fontweight="bold", y=0.98
)

plt.savefig(CHARTS_PATH, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
print(f"\nDiagnostic charts saved → {CHARTS_PATH}")
plt.show()

print("\n--- Training Complete ---\n")