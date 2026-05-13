const imageInput = document.getElementById("imageInput");
const predictButton = document.getElementById("predictButton");
const previewImage = document.getElementById("previewImage");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const statusText = document.getElementById("statusText");
const winnerRole = document.getElementById("winnerRole");
const winnerConfidence = document.getElementById("winnerConfidence");
const scoreList = document.getElementById("scoreList");

const ort = globalThis.ort;
const ASSET_VERSION = "20260513-2";

const roleLabelMap = {
  attack: "攻擊",
  defense: "防禦",
  support: "輔助",
};

let session = null;
let modelConfig = null;
let selectedImage = null;

function setStatus(message) {
  statusText.textContent = message;
}

function withVersion(url) {
  return `${url}?v=${ASSET_VERSION}`;
}

async function fetchJson(url) {
  const response = await fetch(withVersion(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`無法讀取 ${url}，HTTP ${response.status}`);
  }
  return response.json();
}

async function loadModel() {
  setStatus("模型初始化中...");

  if (!ort) {
    throw new Error("找不到 ONNX Runtime 全域物件 ort");
  }
  if (!ort.env) {
    throw new Error("ONNX Runtime 缺少 env 設定");
  }

  ort.env.wasm = ort.env.wasm ?? {};
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
  ort.env.wasm.numThreads = 1;

  modelConfig = await fetchJson("./web/model-config.json");

  session = await ort.InferenceSession.create(
    withVersion("./web/pokemon-role-classifier.onnx"),
    {
      executionProviders: ["wasm"],
    },
  );

  setStatus("模型已就緒，請選擇圖片開始分析。");
  predictButton.disabled = false;
}

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

async function imageToTensor(file) {
  const bitmap = await createImageBitmap(file);
  const { imageSize, normalizeMean, normalizeStd } = modelConfig;

  const canvas = document.createElement("canvas");
  canvas.width = imageSize;
  canvas.height = imageSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("無法建立 Canvas 2D context");
  }

  context.drawImage(bitmap, 0, 0, imageSize, imageSize);
  const { data } = context.getImageData(0, 0, imageSize, imageSize);
  const floatData = new Float32Array(3 * imageSize * imageSize);

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

function softmax(values) {
  const maxValue = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - maxValue));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

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

    const label = document.createElement("span");
    label.textContent = roleLabelMap[score.className] ?? score.className;

    const value = document.createElement("span");
    value.textContent = `${(score.probability * 100).toFixed(2)}%`;

    meta.append(label, value);

    const bar = document.createElement("div");
    bar.className = "score-bar";

    const fill = document.createElement("div");
    fill.style.width = `${score.probability * 100}%`;
    bar.appendChild(fill);

    item.append(meta, bar);
    scoreList.appendChild(item);
  }
}

async function runPrediction() {
  if (!selectedImage || !session || !modelConfig) {
    return;
  }

  try {
    predictButton.disabled = true;
    setStatus("分析中...");

    const inputTensor = await imageToTensor(selectedImage);
    const outputs = await session.run({ [modelConfig.inputName]: inputTensor });
    const logitsTensor = outputs[modelConfig.outputName];

    if (!logitsTensor) {
      throw new Error(`找不到模型輸出 ${modelConfig.outputName}`);
    }

    const logits = Array.from(logitsTensor.data);
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
