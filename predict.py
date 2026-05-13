from __future__ import annotations

import argparse
from pathlib import Path

import torch
from PIL import Image
from torchvision import models, transforms


# 載入訓練好的權重檔。
def load_checkpoint(checkpoint_path: str | Path) -> dict:
    checkpoint_path = Path(checkpoint_path)
    if not checkpoint_path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")
    return torch.load(checkpoint_path, map_location="cpu", weights_only=False)


# 重建與訓練相同的模型架構。
def build_model(class_names: list[str], architecture: str = "resnet18") -> torch.nn.Module:
    if architecture == "resnet18":
        model = models.resnet18(weights=None)
        in_features = model.fc.in_features
        model.fc = torch.nn.Linear(in_features, len(class_names))
        return model

    if architecture == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(weights=None)
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = torch.nn.Linear(in_features, len(class_names))
        return model

    raise ValueError(f"Unsupported architecture: {architecture}")


# 建立與驗證時相同的前處理。
def build_transform(image_size: int) -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


# 對單張圖片做預測。
@torch.no_grad()
def predict_image(image_path: str | Path, checkpoint_path: str | Path) -> dict[str, float]:
    checkpoint = load_checkpoint(checkpoint_path)
    class_names = checkpoint["class_names"]
    image_size = int(checkpoint["image_size"])
    architecture = checkpoint.get("architecture", "resnet18")

    model = build_model(class_names, architecture=architecture)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    transform = build_transform(image_size)
    image = Image.open(image_path).convert("RGB")
    tensor = transform(image).unsqueeze(0)

    logits = model(tensor)
    probabilities = torch.softmax(logits, dim=1)[0]
    predicted_index = int(probabilities.argmax().item())

    result = {
        "predicted_role": class_names[predicted_index],
        "confidence": float(probabilities[predicted_index].item()),
    }
    for class_name, probability in zip(class_names, probabilities.tolist()):
        result[class_name] = float(probability)
    return result


# 提供簡單命令列介面。
def main() -> None:
    parser = argparse.ArgumentParser(description="Predict Pokemon role from one image.")
    parser.add_argument("image", help="Path to image file.")
    parser.add_argument("--checkpoint", default="artifacts/best_model.pt", help="Checkpoint path.")
    args = parser.parse_args()

    result = predict_image(args.image, args.checkpoint)
    print(f"Predicted role: {result['predicted_role']}")
    print(f"Confidence: {result['confidence']:.4f}")
    for class_name in ["attack", "defense", "support"]:
        print(f"{class_name}: {result.get(class_name, 0.0):.4f}")


if __name__ == "__main__":
    main()
