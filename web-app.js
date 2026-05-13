import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js";

const imageInput = document.getElementById("imageInput");
const predictButton = document.getElementById("predictButton");
const previewImage = document.getElementById("previewImage");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const statusText = document.getElementById("statusText");
const winnerRole = document.getElementById("winnerRole");
const winnerConfidence = document.getElementById("winnerConfidence");
const scoreList = document.getElementById("scoreList");

let session = null;
let modelConfig = null;
let selectedImage = null;

// 角色名稱對照表。
const roleLabelMap = {
  attack: "攻擊",
  defense: "防禦",
  support: "輔助",
};

// 顯示狀態文字。
function setStatus(message) {
  statusText.textContent = message;
}

// 載入 ONNX 模型與相關設定。
async function loadModel() {
  setStatus("模型載入中...");

  // 明確指定 wasm 檔位置，避免 onnxruntime-web 在自訂網域下找錯路徑。
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
  ort.env.wasm.numThreads = 1;

  modelConfig = await fetch("./web/model-config.json").then((response) => {
    if (!response.ok) {
      throw new Error(`無法讀取 model-config.json，HTTP ${response.status}`);
    }
    return response.json();
  });

  session = await ort.InferenceSession.create("./web/pokemon-role-classifier.onnx", {
    executionProviders: ["wasm"],
  });

  setStatus("模型已就緒，可以開始分析。");
  predictButton.disabled = false;
}

// 讀取使用者圖片並顯示預覽。
function handleImageChange(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  selectedImage = file;
  const previewUrl = URL.createObjectURL(file);
  previewImage.src = previewUrl;
  previewImage.hidden = false;
  previewPlaceholder.hidden = true;
}

// 將圖片前處理成模型可用的 tensor。
async function imageToTensor(file) {
  const bitmap = await createImageBitmap(file);
  const { imageSize, normalizeMean, normalizeStd } = modelConfig;

  const canvas = document.createElement("canvas");
  canvas.width = imageSize;
  canvas.height = imageSize;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, imageSize, imageSize);

  const { data } = context.getImageData(0, 0, imageSize, imageSize);
  const floatData = new Float32Array(1 * 3 * imageSize * imageSize);

  for (let y = 0; y < imageSize; y += 1) {
    for (let x = 0; x < imageSize; x += 1) {
      const pixelIndex = (y * imageSize + x) * 4;
      const tensorIndex = y * imageSize + x;

      const red = data[pixelIndex] / 255;
      const green = data[pixelIndex + 1] / 255;
      const blue = data[pixelIndex + 2] / 255;

      floatData[tensorIndex] = (red - normalizeMean[0]) / normalizeStd[0];
      floatData[imageSize * imageSize + tensorIndex] =
        (green - normalizeMean[1]) / normalizeStd[1];
      floatData[2 * imageSize * imageSize + tensorIndex] =
        (blue - normalizeMean[2]) / normalizeStd[2];
    }
  }

  return new ort.Tensor("float32", floatData, [1, 3, imageSize, imageSize]);
}

// 將 logits 轉成機率。
function softmax(values) {
  const maxValue = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - maxValue));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

// 將推論結果顯示到頁面上。
function renderResults(probabilities) {
  const scores = modelConfig.classNames.map((className, index) => ({
    className,
    probability: probabilities[index],
  }));
  scores.sort((left, right) => right.probability - left.probability);

  const winner = scores[0];
  winnerRole.textContent = roleLabelMap[winner.className] ?? winner.className;
  winnerConfidence.textContent = `信心值: ${(winner.probability * 100).toFixed(2)}%`;

  scoreList.innerHTML = "";
  for (const score of scores) {
    const item = document.createElement("div");
    item.className = "score-item";

    const meta = document.createElement("div");
    meta.className = "score-meta";
    meta.innerHTML = `
      <span>${roleLabelMap[score.className] ?? score.className}</span>
      <span>${(score.probability * 100).toFixed(2)}%</span>
    `;

    const bar = document.createElement("div");
    bar.className = "score-bar";
    const fill = document.createElement("div");
    fill.style.width = `${score.probability * 100}%`;
    bar.appendChild(fill);

    item.append(meta, bar);
    scoreList.appendChild(item);
  }
}

// 執行推論。
async function runPrediction() {
  if (!selectedImage || !session || !modelConfig) {
    return;
  }

  try {
    predictButton.disabled = true;
    setStatus("分析中...");

    const inputTensor = await imageToTensor(selectedImage);
    const outputs = await session.run({ [modelConfig.inputName]: inputTensor });
    const logits = Array.from(outputs[modelConfig.outputName].data);
    const probabilities = softmax(logits);

    renderResults(probabilities);
    setStatus("分析完成。");
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`分析失敗：${detail}`);
  } finally {
    predictButton.disabled = false;
  }
}

imageInput.addEventListener("change", handleImageChange);
predictButton.addEventListener("click", runPrediction);

loadModel().catch((error) => {
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  setStatus(`模型載入失敗：${detail}`);
});
