from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt


REPORT_DATE = "2026-05-13"
REPO_URL = "https://github.com/Yannng0220/Aitrading-dashboard"
DEPLOY_URL = "https://4b1e4e1b.aitrading-dashboard.pages.dev"


def set_font(document: Document) -> None:
    style = document.styles["Normal"]
    style.font.name = "Microsoft JhengHei"
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft JhengHei")
    style.font.size = Pt(11)

    for style_name in ["Title", "Heading 1", "Heading 2", "Heading 3"]:
        style = document.styles[style_name]
        style.font.name = "Microsoft JhengHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft JhengHei")


def add_title(document: Document) -> None:
    title = document.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("寶可夢對戰定位分類網站專案介紹")
    run.bold = True
    run.font.size = Pt(20)
    run.font.name = "Microsoft JhengHei"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft JhengHei")

    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.add_run(f"專案日期：{REPORT_DATE}\n").italic = True
    subtitle.add_run(f"GitHub Repo：{REPO_URL}\n")
    subtitle.add_run(f"Cloudflare 網站：{DEPLOY_URL}")


def add_bullets(document: Document, items: list[str]) -> None:
    for item in items:
        document.add_paragraph(item, style="List Bullet")


def add_numbers(document: Document, items: list[str]) -> None:
    for item in items:
        document.add_paragraph(item, style="List Number")


def add_table(document: Document, headers: list[str], rows: list[tuple[str, ...]]) -> None:
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for index, header in enumerate(headers):
        table.rows[0].cells[index].text = header

    for values in rows:
        row = table.add_row().cells
        for index, value in enumerate(values):
            row[index].text = value


def build_document() -> Document:
    document = Document()
    set_font(document)
    add_title(document)

    document.add_heading("一、專案簡介", level=1)
    document.add_paragraph(
        "本專案是一個結合 AI 影像分類、資料自動標註與網站部署的實作系統。使用者只要上傳一張寶可夢圖片，系統就會判斷該角色在對戰中偏向攻擊、 防禦或輔助。"
    )
    document.add_paragraph(
        "系統先利用 PokéAPI 自動建立訓練標籤，再用 PyTorch 訓練影像分類模型，最後把模型匯出成 ONNX，讓推論能直接在瀏覽器中執行，不需要 Python 後端。"
    )

    document.add_heading("二、專案目標", level=1)
    add_bullets(
        document,
        [
            "建立一個能根據寶可夢圖片判斷對戰定位的 AI 模型。",
            "利用 PokéAPI 自動產生標籤，降低人工標註成本。",
            "將模型部署到網站前端，讓使用者可以直接在瀏覽器中操作。",
            "完成從資料整理、模型訓練到網站展示的完整 AI 應用流程。",
        ],
    )

    document.add_heading("三、系統功能", level=1)
    add_bullets(
        document,
        [
            "上傳 JPG、PNG、WebP 格式的寶可夢圖片。",
            "即時顯示圖片預覽。",
            "在瀏覽器中載入 ONNX 模型進行推論。",
            "輸出 attack、defense、support 三個類別的機率。",
            "顯示最可能的分類結果與信心值。",
        ],
    )

    document.add_heading("四、技術架構", level=1)
    add_table(
        document,
        ["模組", "使用技術"],
        [
            ("資料來源", "PokéAPI"),
            ("資料處理與訓練", "Python、Pandas、PyTorch、Torchvision"),
            ("模型架構", "MobileNetV3 Small"),
            ("模型匯出", "ONNX"),
            ("瀏覽器推論", "ONNX Runtime Web"),
            ("網站前端", "HTML、CSS、JavaScript"),
            ("網站部署", "Cloudflare Pages"),
        ],
    )

    document.add_heading("五、資料集資訊", level=1)
    document.add_paragraph("本專案使用 819 張寶可夢圖片，並依照 80% 訓練集、20% 測試集切分。")
    add_table(
        document,
        ["項目", "數量", "說明"],
        [
            ("總圖片數", "819", "所有寶可夢圖片總數"),
            ("attack", "239", "偏輸出型角色"),
            ("defense", "332", "偏坦克或高耐久角色"),
            ("support", "248", "偏功能型或輔助角色"),
            ("train", "655", "訓練集，約 80%"),
            ("test", "164", "測試集，約 20%"),
        ],
    )

    document.add_heading("六、自動標註方法", level=1)
    document.add_paragraph(
        "原始圖片本身沒有對戰定位標籤，因此本專案先利用 PokéAPI 取得寶可夢的種族值、特性、屬性與招式資料，再透過規則加權方式，自動推算每張圖片較接近的角色類型。"
    )
    add_bullets(
        document,
        [
            "根據圖片檔名解析圖鑑編號與型態。",
            "向 PokéAPI 查詢對應寶可夢資料。",
            "讀取 stats、abilities、types、moves。",
            "計算 attack、defense、support 三種分數。",
            "將最高分對應的類別寫入 labels.csv。",
        ],
    )

    document.add_heading("七、模型訓練流程", level=1)
    add_numbers(
        document,
        [
            "讀取 labels.csv 與對應圖片。",
            "將圖片縮放至 224 × 224，並進行 Normalize 標準化。",
            "使用 MobileNetV3 Small 進行三分類訓練。",
            "搭配 class-weighted loss 與 balanced sampler，降低類別不平衡影響。",
            "保存驗證表現最佳的模型權重到 artifacts/best_model.pt。",
            "匯出成瀏覽器可使用的 ONNX 模型。",
        ],
    )

    document.add_heading("八、模型評估結果", level=1)
    document.add_paragraph("目前測試集的分類結果如下：")
    add_table(
        document,
        ["類別", "Precision", "Recall", "F1-score", "Support"],
        [
            ("attack", "0.5455", "0.7500", "0.6316", "48"),
            ("defense", "0.6757", "0.3788", "0.4854", "66"),
            ("support", "0.5410", "0.6600", "0.5946", "50"),
        ],
    )
    document.add_paragraph("整體 accuracy：0.5732（約 57.32%）")
    document.add_paragraph(
        "這代表模型已經能對三種類型做出有效區分，但未來仍可透過增加資料量、強化標籤規則與調整模型結構來持續提升。"
    )

    document.add_heading("九、網站部署方式", level=1)
    document.add_paragraph(
        "本專案將 ONNX 模型與前端頁面一起部署到 Cloudflare Pages。部署後，網站會在使用者的瀏覽器中直接載入模型並完成推論，因此不需要伺服器端 Python 環境。"
    )
    add_numbers(
        document,
        [
            "使用者上傳寶可夢圖片。",
            "前端先顯示預覽，並將圖片縮放到 224 × 224。",
            "依照 model-config.json 進行標準化。",
            "使用 ONNX Runtime Web 載入 web/pokemon-role-classifier.onnx。",
            "取得三個類別的 logits，轉成 softmax 機率。",
            "顯示最終分類結果與信心值。",
        ],
    )

    document.add_heading("十、流程圖（文字版）", level=1)
    document.add_heading("1. 整體系統流程", level=2)
    document.add_paragraph(
        "寶可夢圖片資料集 → PokéAPI 自動標註 → labels.csv → MobileNetV3 Small 訓練 → best_model.pt → 匯出 ONNX → Cloudflare Pages 網站載入模型 → 使用者上傳圖片 → 瀏覽器端推論 → 顯示 attack / defense / support"
    )
    document.add_heading("2. 自動標註流程", level=2)
    document.add_paragraph(
        "圖片檔名解析 → 取得圖鑑編號與型態 → 查詢 PokéAPI → 讀取 stats / abilities / types / moves → 規則加權評分 → 選取最高分 → 寫入 labels.csv"
    )
    document.add_heading("3. 模型訓練流程", level=2)
    document.add_paragraph(
        "labels.csv + 圖片 → 影像前處理 → MobileNetV3 Small → 三分類輸出 → loss 計算 → 權重更新 → 保存最佳模型"
    )
    document.add_heading("4. 網頁推論流程", level=2)
    document.add_paragraph(
        "上傳圖片 → 顯示預覽 → 圖片縮放與標準化 → ONNX 模型推論 → softmax 機率 → 顯示最終定位與分數條"
    )

    document.add_heading("十一、重要檔案說明", level=1)
    add_table(
        document,
        ["檔案名稱", "用途說明"],
        [
            ("prepare_pokeapi_labels.py", "根據 PokéAPI 自動產生角色標籤與 train/test 切分"),
            ("dataset.py", "定義 PyTorch Dataset，負責載入圖片與標籤"),
            ("train.py", "模型訓練主程式，使用 MobileNetV3 Small 完成三分類訓練"),
            ("predict.py", "單張圖片的本機預測程式"),
            ("export_web_model.py", "將 PyTorch 模型匯出成 ONNX 網頁模型"),
            ("index.html", "網站主頁"),
            ("web-app.js", "前端推論邏輯，負責讀圖、前處理、ONNX 推論與顯示結果"),
            ("styles.css", "網站版面與視覺樣式"),
            ("web/model-config.json", "模型輸入大小、類別名稱與正規化參數設定"),
            ("web/pokemon-role-classifier.onnx", "提供瀏覽器執行的 ONNX 模型"),
            ("Pokemon_Role_Classifier_Project_Report.docx", "專案介紹 Word 報告"),
        ],
    )

    document.add_heading("十二、專案亮點", level=1)
    add_bullets(
        document,
        [
            "完成從資料整理、自動標註、模型訓練到網站部署的完整流程。",
            "模型可直接在瀏覽器端執行，不依賴 Python 後端。",
            "使用 Cloudflare Pages 部署，方便直接公開展示。",
            "適合作為 AI 專題、作品集或剪報報告主題。",
        ],
    )

    document.add_heading("十三、目前限制", level=1)
    add_bullets(
        document,
        [
            "標籤是依照規則推論產生，不是官方直接提供的對戰定位。",
            "資料量仍有限，不同畫風與構圖可能影響模型判斷。",
            "系統只看圖片，不會分析實際配招、個體值或隊伍搭配。",
            "首次進站時仍需要載入 ONNX 模型，會有少量等待時間。",
        ],
    )

    document.add_heading("十四、未來改進方向", level=1)
    add_bullets(
        document,
        [
            "增加更多寶可夢圖片與不同畫風資料。",
            "優化 PokéAPI 自動標註規則，提高標籤品質。",
            "加入非寶可夢圖片辨識，避免模型硬分三類。",
            "嘗試多模型比較或特徵融合，提高準確率。",
            "擴充更多角色類別，例如速度型、坦克型、特殊輸出型。",
        ],
    )

    document.add_heading("十五、簡報口頭介紹範例", level=1)
    document.add_paragraph(
        "本專案是一個寶可夢圖片定位分類系統。使用者上傳一張寶可夢圖片後，系統會判斷它在對戰中較偏向攻擊、防禦或輔助。專案先透過 PokéAPI 取得寶可夢的種族值、特性、屬性與招式資料，自動建立訓練標籤，再使用 MobileNetV3 Small 進行影像分類訓練。訓練完成後，模型被轉為 ONNX 格式，部署到 Cloudflare Pages，讓整個推論流程可以直接在瀏覽器中完成，不需要 Python 後端。這個專案的重點在於完成了從資料、模型到網站部署的完整 AI 應用流程。"
    )

    document.add_heading("十六、附錄資訊", level=1)
    add_bullets(
        document,
        [
            f"GitHub Repo：{REPO_URL}",
            f"Cloudflare 網站：{DEPLOY_URL}",
            "模型輸入尺寸：224 × 224",
            "模型輸出類別：attack、defense、support",
            "網站前端模型：web/pokemon-role-classifier.onnx",
        ],
    )

    return document


def main() -> None:
    output_path = Path("Pokemon_Role_Classifier_Project_Report.docx")
    document = build_document()
    document.save(output_path)
    print(output_path.resolve())


if __name__ == "__main__":
    main()
