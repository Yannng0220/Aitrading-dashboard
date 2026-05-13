from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset


# 訓練與預測共用的角色名稱與類別編號。
ROLE_NAMES = ["attack", "defense", "support"]
ROLE_TO_INDEX = {name: index for index, name in enumerate(ROLE_NAMES)}


# 讀取標籤 CSV 後回傳的資料摘要物件。
@dataclass
class LabelSummary:
    total_rows: int
    usable_rows: int
    class_counts: dict[str, int]


# 載入標籤、標準化角色文字，並轉成模型可用的數字類別。
def load_labels(csv_path: str | Path) -> tuple[pd.DataFrame, LabelSummary]:
    dataframe = pd.read_csv(csv_path)
    if "image_path" not in dataframe.columns or "role" not in dataframe.columns:
        raise ValueError("labels.csv must contain 'image_path' and 'role' columns.")

    dataframe["role"] = dataframe["role"].fillna("").astype(str).str.strip().str.lower()
    usable = dataframe[dataframe["role"].isin(ROLE_TO_INDEX)].copy()
    usable["label"] = usable["role"].map(ROLE_TO_INDEX)

    counts = usable["role"].value_counts().to_dict()
    summary = LabelSummary(
        total_rows=len(dataframe),
        usable_rows=len(usable),
        class_counts={name: int(counts.get(name, 0)) for name in ROLE_NAMES},
    )
    return usable.reset_index(drop=True), summary


# PyTorch 資料集類別，負責回傳圖片與標籤配對。
class PokemonRoleDataset(Dataset):
    def __init__(self, dataframe: pd.DataFrame, transform=None) -> None:
        self.dataframe = dataframe.reset_index(drop=True)
        self.transform = transform

    def __len__(self) -> int:
        return len(self.dataframe)

    # 讀取單張圖片、轉成 RGB，並套用前處理。
    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        row = self.dataframe.iloc[index]
        image = Image.open(Path(row["image_path"])).convert("RGB")
        if self.transform is not None:
            image = self.transform(image)
        return image, int(row["label"])
