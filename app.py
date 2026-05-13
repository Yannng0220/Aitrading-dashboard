from __future__ import annotations

from pathlib import Path

import gradio as gr

from predict import predict_image


# 本地 Gradio 介面預設使用的模型權重路徑。
CHECKPOINT_PATH = "artifacts/best_model.pt"


# 包一層預測函式，讓 Gradio 可以直接處理上傳圖片。
def classify(image):
    if image is None:
        return "Please upload an image.", None
    if not Path(CHECKPOINT_PATH).exists():
        return "Checkpoint not found. Train the model first with train.py.", None

    result = predict_image(image, CHECKPOINT_PATH)
    text = (
        f"Predicted role: {result['predicted_role']}\n"
        f"Confidence: {result['confidence']:.4f}"
    )
    scores = {
        "attack": result.get("attack", 0.0),
        "defense": result.get("defense", 0.0),
        "support": result.get("support", 0.0),
    }
    return text, scores


# 建立一個簡單的本地介面，方便上傳圖片後直接查看結果。
demo = gr.Interface(
    fn=classify,
    inputs=gr.Image(type="filepath", label="Pokemon Image"),
    outputs=[
        gr.Textbox(label="Prediction"),
        gr.Label(label="Role Scores"),
    ],
    title="Pokemon Battle Role Classifier",
    description="Upload one Pokemon image to predict attack, defense, or support.",
)


# 允許這個檔案直接從命令列執行。
if __name__ == "__main__":
    demo.launch()
