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

// 把角色名稱轉成更直覺的中文顯示。
const roleLabelMap = {
  attack: "攻擊",
  defense: "防禦",
  support: "輔助",
};

// 載入 ONNX 模型與前處理設定。
async function loadModel() {
  statusText.textContent = "模型載入中...";
  modelConfig = await fetch("./web/model-config.json").then((response) => response.json());
  session = await ort.InferenceSession.create("./web/pokemon-role-classifier.onnx", {
    executionProviders: ["wasm"],
  });
  statusText.textContent = "模型已就緒，可以開始分析。";
  predictButton.disabled = false;
}

// 讀取使用者上傳的圖片並顯示預覽。
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

// 將圖片畫到 canvas，再轉成模型需要的 tensor。
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

// 將模型輸出的 logits 轉成機率。
function softmax(values) {
  const maxValue = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - maxValue));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

// 把推論結果渲染到畫面上。
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

// 執行瀏覽器端推論。
async function runPrediction() {
  if (!selectedImage || !session || !modelConfig) {
    return;
  }

  try {
    predictButton.disabled = true;
    statusText.textContent = "分析中...";

    const inputTensor = await imageToTensor(selectedImage);
    const outputs = await session.run({ [modelConfig.inputName]: inputTensor });
    const logits = Array.from(outputs[modelConfig.outputName].data);
    const probabilities = softmax(logits);

    renderResults(probabilities);
    statusText.textContent = "分析完成。";
  } catch (error) {
    console.error(error);
    statusText.textContent = "分析失敗，請確認模型檔與網站部署設定。";
  } finally {
    predictButton.disabled = false;
  }
}

imageInput.addEventListener("change", handleImageChange);
predictButton.addEventListener("click", runPrediction);
loadModel().catch((error) => {
  console.error(error);
  statusText.textContent = "模型載入失敗，請確認網站能讀取 ONNX 檔案。";
});
