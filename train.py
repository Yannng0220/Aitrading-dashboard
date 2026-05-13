from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from torch import nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import models, transforms

from dataset import ROLE_NAMES, PokemonRoleDataset, load_labels


# 解析模型訓練參數。
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a Pokemon role classifier.")
    parser.add_argument("--labels", default="labels.csv", help="Path to labels CSV.")
    parser.add_argument("--epochs", type=int, default=8, help="Number of training epochs.")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size.")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate.")
    parser.add_argument("--image-size", type=int, default=224, help="Input image size.")
    parser.add_argument("--output-dir", default="artifacts", help="Checkpoint folder.")
    parser.add_argument("--val-size", type=float, default=0.2, help="Validation split ratio.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument(
        "--architecture",
        default="mobilenet_v3_small",
        choices=["mobilenet_v3_small", "resnet18"],
        help="Backbone architecture.",
    )
    return parser.parse_args()


# 定義訓練與驗證的影像前處理。
def build_transforms(image_size: int) -> tuple[transforms.Compose, transforms.Compose]:
    normalize = transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    )

    train_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(10),
            transforms.ColorJitter(
                brightness=0.1,
                contrast=0.1,
                saturation=0.1,
                hue=0.02,
            ),
            transforms.ToTensor(),
            normalize,
        ]
    )

    eval_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            normalize,
        ]
    )

    return train_transform, eval_transform


# 建立分類模型。
def build_model(num_classes: int, architecture: str) -> nn.Module:
    if architecture == "resnet18":
        model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, num_classes)
        return model

    if architecture == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(
            weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
        )
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = nn.Linear(in_features, num_classes)
        return model

    raise ValueError(f"Unsupported architecture: {architecture}")


# 讓少數類別在 loss 中有更高權重。
def build_weighted_loss(labels: list[int], device: torch.device) -> nn.Module:
    counts = torch.bincount(torch.tensor(labels), minlength=len(ROLE_NAMES)).float()
    weights = counts.sum() / counts.clamp(min=1.0)
    return nn.CrossEntropyLoss(weight=weights.to(device))


# 讓少數類別在抽樣時更常被看到。
def build_weighted_sampler(labels: list[int]) -> WeightedRandomSampler:
    counts = torch.bincount(torch.tensor(labels), minlength=len(ROLE_NAMES)).float()
    class_weights = counts.sum() / counts.clamp(min=1.0)
    sample_weights = class_weights[torch.tensor(labels)].double()
    return WeightedRandomSampler(
        weights=sample_weights,
        num_samples=len(sample_weights),
        replacement=True,
    )


# 執行一個 epoch，可用於訓練或驗證。
def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer | None,
    device: torch.device,
) -> tuple[float, float]:
    is_training = optimizer is not None
    model.train(is_training)

    total_loss = 0.0
    total_correct = 0
    total_samples = 0

    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device)

        with torch.set_grad_enabled(is_training):
            logits = model(images)
            loss = criterion(logits, labels)

            if is_training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        predictions = logits.argmax(dim=1)
        total_loss += loss.item() * images.size(0)
        total_correct += (predictions == labels).sum().item()
        total_samples += images.size(0)

    return total_loss / max(total_samples, 1), total_correct / max(total_samples, 1)


# 收集驗證預測結果。
@torch.no_grad()
def evaluate_predictions(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> tuple[list[int], list[int]]:
    model.eval()
    all_predictions: list[int] = []
    all_labels: list[int] = []

    for images, labels in loader:
        images = images.to(device)
        logits = model(images)
        all_predictions.extend(logits.argmax(dim=1).cpu().tolist())
        all_labels.extend(labels.tolist())

    return all_predictions, all_labels


# 執行完整訓練流程。
def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)

    labels_df, summary = load_labels(args.labels)
    if summary.usable_rows == 0:
        raise ValueError("No usable labels found in labels CSV.")

    if min(summary.class_counts.values()) < 2:
        raise ValueError(f"Each class needs at least 2 samples. Counts: {summary.class_counts}")

    print(
        json.dumps(
            {
                "total_rows": summary.total_rows,
                "usable_rows": summary.usable_rows,
                "class_counts": summary.class_counts,
                "architecture": args.architecture,
            },
            indent=2,
        )
    )

    if "split" in labels_df.columns and labels_df["split"].isin(["train", "test"]).all():
        train_df = labels_df[labels_df["split"] == "train"].copy()
        val_df = labels_df[labels_df["split"] == "test"].copy()
    else:
        train_df, val_df = train_test_split(
            labels_df,
            test_size=args.val_size,
            random_state=args.seed,
            stratify=labels_df["label"],
        )

    train_transform, eval_transform = build_transforms(args.image_size)
    train_dataset = PokemonRoleDataset(train_df, transform=train_transform)
    val_dataset = PokemonRoleDataset(val_df, transform=eval_transform)

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        sampler=build_weighted_sampler(train_df["label"].tolist()),
        num_workers=0,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(len(ROLE_NAMES), args.architecture).to(device)
    criterion = build_weighted_loss(train_df["label"].tolist(), device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output_dir / "best_model.pt"

    best_val_accuracy = -1.0
    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = run_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = run_epoch(model, val_loader, criterion, None, device)
        print(
            f"epoch={epoch:02d} "
            f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
        )

        if val_acc > best_val_accuracy:
            best_val_accuracy = val_acc
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "class_names": ROLE_NAMES,
                    "image_size": args.image_size,
                    "architecture": args.architecture,
                },
                checkpoint_path,
            )

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    predictions, labels = evaluate_predictions(model, val_loader, device)
    report = classification_report(
        labels,
        predictions,
        target_names=ROLE_NAMES,
        digits=4,
        zero_division=0,
    )
    print(report)

    report_path = output_dir / "classification_report.txt"
    report_path.write_text(report, encoding="utf-8")
    print(f"Best checkpoint saved to: {checkpoint_path}")
    print(f"Classification report saved to: {report_path}")


if __name__ == "__main__":
    main()
