from __future__ import annotations

import json
from pathlib import Path

import torch

from predict import build_model


# 把訓練好的 PyTorch 權重匯出成瀏覽器可用的 ONNX 模型與設定檔。
def main() -> None:
    checkpoint_path = Path("artifacts/best_model.pt")
    if not checkpoint_path.exists():
        raise FileNotFoundError("artifacts/best_model.pt not found. Train the model first.")

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    class_names = checkpoint["class_names"]
    image_size = int(checkpoint["image_size"])

    model = build_model(class_names)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    export_dir = Path("web")
    export_dir.mkdir(parents=True, exist_ok=True)

    dummy_input = torch.randn(1, 3, image_size, image_size)
    onnx_path = export_dir / "pokemon-role-classifier.onnx"
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path.as_posix(),
        input_names=["input"],
        output_names=["logits"],
        opset_version=17,
    )

    config = {
        "classNames": class_names,
        "imageSize": image_size,
        "inputName": "input",
        "outputName": "logits",
        "normalizeMean": [0.485, 0.456, 0.406],
        "normalizeStd": [0.229, 0.224, 0.225],
    }
    (export_dir / "model-config.json").write_text(
        json.dumps(config, indent=2),
        encoding="utf-8",
    )

    print(f"Exported ONNX model to {onnx_path}")
    print(f"Exported config to {export_dir / 'model-config.json'}")


# 允許這個檔案直接從命令列執行。
if __name__ == "__main__":
    main()
