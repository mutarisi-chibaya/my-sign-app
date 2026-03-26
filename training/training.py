"""
train_model.py
────────────────────────────────────────────────────────────────
Trains a stacked Bidirectional LSTM on the landmarks CSV produced
by record_landmarks.py and saves a .keras model file.

Output:
  models/best_model.keras   ← best val_accuracy checkpoint
  models/final_model.keras  ← model after all epochs
  models/label_map.txt      ← index → gloss mapping
────────────────────────────────────────────────────────────────
"""

import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing   import LabelEncoder
from sklearn.utils            import class_weight

import tensorflow as tf
from tensorflow.keras import layers, callbacks

# ── CONFIG ────────────────────────────────────────────────────
CSV_PATH = "data/landmarks_augmented.csv"  # ← was landmarks.csv
OUTPUT_DIR      = "models"
SEQUENCE_LENGTH = 30
TOTAL_COORDS    = 1662          # 33*4 + 21*3*2 + 468*3

EPOCHS          = 80
BATCH_SIZE      = 32
LEARNING_RATE   = 1e-3
VAL_SPLIT       = 0.15
TEST_SPLIT      = 0.10
DROPOUT         = 0.4
PATIENCE        = 15


# ── data loading ─────────────────────────────────────────────
def load_data(csv_path: str):
    print(f"[INFO] Loading data from '{csv_path}' ...")
    df = pd.read_csv(csv_path)

    glosses  = df["gloss"].values
    features = df.drop(columns=["gloss"]).values.astype(np.float32)

    expected = SEQUENCE_LENGTH * TOTAL_COORDS
    if features.shape[1] != expected:
        raise ValueError(
            f"CSV has {features.shape[1]} feature columns but expected {expected}. "
            f"Check SEQUENCE_LENGTH and TOTAL_COORDS match record_landmarks.py."
        )

    X = features.reshape(len(features), SEQUENCE_LENGTH, TOTAL_COORDS)

    le = LabelEncoder()
    y  = le.fit_transform(glosses)

    print(f"[INFO] {len(X)} samples | {len(le.classes_)} classes")
    print(f"[INFO] Classes: {list(le.classes_)}")
    return X, y, le


# ── augmentation ─────────────────────────────────────────────
def augment_sequence(seq: np.ndarray) -> np.ndarray:
    aug = seq.copy()

    # small gaussian noise
    aug += np.random.normal(0, 0.005, aug.shape).astype(np.float32)

    # random frame drop-and-repeat
    if np.random.rand() < 0.3:
        i = np.random.randint(1, len(aug))
        aug[i] = aug[i - 1]

    # random speed jitter (resample frames)
    if np.random.rand() < 0.3:
        t       = len(aug)
        indices = np.sort(np.random.choice(t, t, replace=True))
        aug     = aug[indices]

    return aug


def make_dataset(X, y, augment=False, batch_size=32):
    ds = tf.data.Dataset.from_tensor_slices((X, y))

    if augment:
        def aug_fn(x, lbl):
            x = tf.numpy_function(augment_sequence, [x], tf.float32)
            x.set_shape([SEQUENCE_LENGTH, TOTAL_COORDS])
            return x, lbl
        ds = ds.map(aug_fn, num_parallel_calls=tf.data.AUTOTUNE)

    return (ds
            .shuffle(buffer_size=len(X), reshuffle_each_iteration=True)
            .batch(batch_size)
            .prefetch(tf.data.AUTOTUNE))


# ── model ────────────────────────────────────────────────────
def build_model(n_classes: int) -> tf.keras.Model:
    inp = layers.Input(shape=(SEQUENCE_LENGTH, TOTAL_COORDS), name="sequence_input")

    x = layers.Bidirectional(
            layers.LSTM(256, return_sequences=True, dropout=DROPOUT, recurrent_dropout=0.1),
            name="bilstm_1")(inp)
    x = layers.LayerNormalization()(x)

    x = layers.Bidirectional(
            layers.LSTM(128, return_sequences=True, dropout=DROPOUT, recurrent_dropout=0.1),
            name="bilstm_2")(x)
    x = layers.LayerNormalization()(x)

    x = layers.Bidirectional(
            layers.LSTM(64, return_sequences=False, dropout=DROPOUT),
            name="bilstm_3")(x)
    x = layers.LayerNormalization()(x)

    x   = layers.Dense(256, activation="relu")(x)
    x   = layers.Dropout(DROPOUT)(x)
    x   = layers.Dense(128, activation="relu")(x)
    x   = layers.Dropout(DROPOUT / 2)(x)
    out = layers.Dense(n_classes, activation="softmax", name="predictions")(x)

    model = tf.keras.Model(inputs=inp, outputs=out, name="sign_lstm")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(LEARNING_RATE),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


# ── main ─────────────────────────────────────────────────────
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    best_path  = os.path.join(OUTPUT_DIR, "best_model.keras")
    final_path = os.path.join(OUTPUT_DIR, "final_model.keras")
    map_path   = os.path.join(OUTPUT_DIR, "label_map.txt")

    # 1. load & split
    X, y, le = load_data(CSV_PATH)
    n_classes = len(le.classes_)

    X_tmp, X_test, y_tmp, y_test = train_test_split(
        X, y, test_size=TEST_SPLIT, stratify=y, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(
        X_tmp, y_tmp,
        test_size=VAL_SPLIT / (1 - TEST_SPLIT),
        stratify=y_tmp, random_state=42)

    print(f"[INFO] Train {len(X_train)} | Val {len(X_val)} | Test {len(X_test)}")

    # 2. class weights (handles imbalanced word counts)
    cw = class_weight.compute_class_weight(
        "balanced", classes=np.unique(y_train), y=y_train)
    class_weights = dict(enumerate(cw))

    # 3. datasets
    train_ds = make_dataset(X_train, y_train, augment=True,  batch_size=BATCH_SIZE)
    val_ds   = make_dataset(X_val,   y_val,   augment=False, batch_size=BATCH_SIZE)
    test_ds  = make_dataset(X_test,  y_test,  augment=False, batch_size=BATCH_SIZE)

    # 4. build
    model = build_model(n_classes)
    model.summary()

    # 5. callbacks
    cb_list = [
        callbacks.ModelCheckpoint(
            filepath=best_path,
            monitor="val_accuracy",
            save_best_only=True,
            verbose=1,
        ),
        callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=PATIENCE,
            restore_best_weights=True,
            verbose=1,
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=7,
            min_lr=1e-6,
            verbose=1,
        ),
        callbacks.TensorBoard(
            log_dir=os.path.join(OUTPUT_DIR, "logs"),
            histogram_freq=1,
        ),
    ]

    # 6. train
    print("\n[INFO] Training ...\n")
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        class_weight=class_weights,
        callbacks=cb_list,
    )

    # 7. test evaluation
    print("\n[INFO] Evaluating on test set ...")
    loss, acc = model.evaluate(test_ds, verbose=0)
    print(f"[RESULT] Test accuracy : {acc*100:.2f}%")
    print(f"[RESULT] Test loss     : {loss:.4f}")

    # 8. save
    model.save(final_path)
    print(f"\n[INFO] Final model → '{final_path}'")
    print(f"[INFO] Best  model → '{best_path}'")

    # 9. label map
    with open(map_path, "w") as f:
        for i, gloss in enumerate(le.classes_):
            f.write(f"{i},{gloss}\n")
    print(f"[INFO] Label map   → '{map_path}'")


if __name__ == "__main__":
    main()