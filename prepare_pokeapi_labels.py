from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


# API 連線、檔名解析與角色名稱的核心常數。
BASE_URL = "https://pokeapi.co/api/v2"
USER_AGENT = "Mozilla/5.0 (PokemonRoleClassifier/1.0)"
ROLE_NAMES = ["attack", "defense", "support"]
FILENAME_PATTERN = re.compile(r"^(\d+)(.*)$")
VARIANT_ALIASES = {
    "f": "female",
}

# 依特性將寶可夢傾向分到攻擊、防禦或輔助的規則群組。
ATTACK_ABILITIES = {
    "adaptability",
    "aerilate",
    "analytic",
    "blaze",
    "chlorophyll",
    "competitive",
    "defiant",
    "download",
    "guts",
    "huge-power",
    "hustle",
    "iron-fist",
    "moxie",
    "overgrow",
    "pixilate",
    "protean",
    "pure-power",
    "scrappy",
    "sheer-force",
    "sniper",
    "solar-power",
    "strong-jaw",
    "swarm",
    "technician",
    "tinted-lens",
    "torrent",
    "tough-claws",
}
DEFENSE_ABILITIES = {
    "battle-armor",
    "filter",
    "fluffy",
    "fur-coat",
    "ice-body",
    "iron-barbs",
    "levitate",
    "marvel-scale",
    "multiscale",
    "natural-cure",
    "poison-heal",
    "regenerator",
    "rock-head",
    "rough-skin",
    "sand-stream",
    "shell-armor",
    "solid-rock",
    "stamina",
    "sturdy",
    "thick-fat",
    "volt-absorb",
    "water-absorb",
}
SUPPORT_ABILITIES = {
    "chlorophyll",
    "competitive",
    "dancer",
    "drizzle",
    "friend-guard",
    "harvest",
    "healer",
    "intimidate",
    "levitate",
    "lightning-rod",
    "magic-bounce",
    "magician",
    "moody",
    "natural-cure",
    "prankster",
    "pressure",
    "serene-grace",
    "storm-drain",
    "synchronize",
    "telepathy",
    "trace",
}

# 依屬性做小幅度加權，讓分類更接近對戰直覺。
ATTACK_TYPES = {"dark", "dragon", "electric", "fighting", "fire", "flying"}
DEFENSE_TYPES = {"bug", "ground", "rock", "steel", "water"}
SUPPORT_TYPES = {"fairy", "ghost", "grass", "normal", "poison", "psychic"}

# 用招式特徵判斷輸出手、坦克或功能型寶可夢。
SUPPORT_MOVES = {
    "aromatherapy",
    "baton-pass",
    "follow-me",
    "gravity",
    "heal-bell",
    "heal-pulse",
    "healing-wish",
    "helping-hand",
    "leech-seed",
    "light-screen",
    "life-dew",
    "lunar-dance",
    "magic-coat",
    "memento",
    "mist",
    "moonlight",
    "parting-shot",
    "perish-song",
    "quick-guard",
    "rain-dance",
    "reflect",
    "safeguard",
    "spore",
    "sticky-web",
    "stun-spore",
    "sunny-day",
    "tailwind",
    "teeter-dance",
    "thunder-wave",
    "toxic-spikes",
    "trick",
    "trick-room",
    "wide-guard",
    "wish",
    "will-o-wisp",
    "yawn",
}
DEFENSE_MOVES = {
    "amnesia",
    "baneful-bunker",
    "body-press",
    "calm-mind",
    "coil",
    "cosmic-power",
    "cotton-guard",
    "curse",
    "defend-order",
    "defense-curl",
    "destiny-bond",
    "dragon-tail",
    "haze",
    "iron-defense",
    "kings-shield",
    "leech-seed",
    "milk-drink",
    "moonlight",
    "recover",
    "rest",
    "roar",
    "roost",
    "shore-up",
    "slack-off",
    "soft-boiled",
    "spikes",
    "stealth-rock",
    "substitute",
    "whirlwind",
    "wish",
}
ATTACK_MOVES = {
    "agility",
    "belly-drum",
    "bulk-up",
    "calm-mind",
    "close-combat",
    "dragon-dance",
    "earthquake",
    "extreme-speed",
    "fiery-dance",
    "flare-blitz",
    "focus-blast",
    "hone-claws",
    "hydro-pump",
    "ice-beam",
    "leaf-storm",
    "mach-punch",
    "nasty-plot",
    "outrage",
    "overheat",
    "play-rough",
    "power-up-punch",
    "psychic",
    "quiver-dance",
    "rock-polish",
    "shell-smash",
    "shift-gear",
    "spore",
    "swords-dance",
    "tail-glow",
    "thunderbolt",
    "u-turn",
    "vacuum-wave",
}


# 自動產生標籤 CSV 時，每一列會保存的欄位結構。
@dataclass
class PokemonContext:
    image_path: str
    pokemon_key: str
    species_id: int
    variant: str
    pokemon_name: str
    role: str
    role_reason: str
    stats_json: str
    abilities_json: str
    types_json: str
    moves_json: str


# 解析命令列參數，控制自動標籤與 train/test 切分。
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Auto-label Pokemon images with attack/defense/support using PokéAPI."
    )
    parser.add_argument("--image-dir", default="pokemon_jpg", help="Image folder path.")
    parser.add_argument("--output", default="labels_auto.csv", help="Output CSV path.")
    parser.add_argument(
        "--test-size", type=float, default=0.2, help="Test split ratio. Default: 0.2"
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument(
        "--cache-dir",
        default=".pokeapi_cache",
        help="Local cache folder for PokéAPI responses.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.05,
        help="Delay between uncached API requests in seconds.",
    )
    return parser.parse_args()


# 從檔名像 150-mega-x.jpg 這種格式拆出圖鑑編號與型態。
def parse_name(stem: str) -> tuple[int, str]:
    match = FILENAME_PATTERN.match(stem)
    if not match:
        raise ValueError(f"Unexpected filename format: {stem}")

    species_id, suffix = match.groups()
    variant = suffix.lstrip("-") or "base"
    return int(species_id), variant


# 組出某個 API 資源在本地快取中的檔案路徑。
def get_cache_path(cache_dir: Path, resource: str, key: str) -> Path:
    safe_key = key.replace("/", "__")
    return cache_dir / resource / f"{safe_key}.json"


# 優先從本地快取讀取 JSON，沒有才向 PokéAPI 抓取。
def fetch_json(resource: str, key: str, cache_dir: Path, sleep_seconds: float) -> dict:
    cache_path = get_cache_path(cache_dir, resource, key)
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"{BASE_URL}/{resource}/{key}/"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    cache_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if sleep_seconds > 0:
        time.sleep(sleep_seconds)
    return payload


# 嘗試查詢某個寶可夢型態，若型態不存在就回傳 None。
def try_fetch_pokemon(name: str, cache_dir: Path, sleep_seconds: float) -> dict | None:
    try:
        return fetch_json("pokemon", name, cache_dir, sleep_seconds)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


# 建立可能的型態名稱，讓本地檔名能對應到 PokéAPI 命名。
def build_variant_candidates(species_name: str, default_name: str, variant: str) -> list[str]:
    if variant == "base":
        return [default_name, species_name]

    normalized_variant = VARIANT_ALIASES.get(variant, variant)
    candidates = [
        f"{species_name}-{normalized_variant}",
        default_name,
        species_name,
    ]

    if normalized_variant.endswith("-striped"):
        candidates.append(f"{species_name}-{normalized_variant.replace('-striped', '')}")

    return list(dict.fromkeys(candidates))


# 把單張圖片解析成真正要拿來標註的 PokéAPI 寶可夢資料。
def resolve_pokemon_record(
    species_id: int,
    variant: str,
    cache_dir: Path,
    sleep_seconds: float,
) -> tuple[str, dict]:
    if variant == "base":
        pokemon_data = fetch_json("pokemon", str(species_id), cache_dir, sleep_seconds)
        return pokemon_data["name"], pokemon_data

    species_data = fetch_json("pokemon-species", str(species_id), cache_dir, sleep_seconds)
    species_name = species_data["name"]
    default_variety = next(
        variety["pokemon"]["name"]
        for variety in species_data["varieties"]
        if variety["is_default"]
    )
    known_varieties = {variety["pokemon"]["name"] for variety in species_data["varieties"]}

    for candidate in build_variant_candidates(species_name, default_variety, variant):
        if candidate in known_varieties:
            return candidate, fetch_json("pokemon", candidate, cache_dir, sleep_seconds)

        pokemon_data = try_fetch_pokemon(candidate, cache_dir, sleep_seconds)
        if pokemon_data is not None:
            return candidate, pokemon_data

    return default_variety, fetch_json("pokemon", default_variety, cache_dir, sleep_seconds)


# 把種族值、特性、屬性與招式轉成 attack/defense/support 分數。
def score_role(pokemon_data: dict) -> tuple[str, str]:
    stats = {item["stat"]["name"]: int(item["base_stat"]) for item in pokemon_data["stats"]}
    abilities = [item["ability"]["name"] for item in pokemon_data["abilities"]]
    types = [item["type"]["name"] for item in pokemon_data["types"]]
    moves = [item["move"]["name"] for item in pokemon_data["moves"]]

    hp = stats.get("hp", 0)
    attack = stats.get("attack", 0)
    defense = stats.get("defense", 0)
    special_attack = stats.get("special-attack", 0)
    special_defense = stats.get("special-defense", 0)
    speed = stats.get("speed", 0)

    offense_peak = max(attack, special_attack)
    mixed_offense = min(attack, special_attack)
    balanced_bulk = min(defense, special_defense)
    support_move_count = len(set(moves) & SUPPORT_MOVES)
    defense_move_count = len(set(moves) & DEFENSE_MOVES)
    attack_move_count = len(set(moves) & ATTACK_MOVES)

    attack_score = 1.20 * offense_peak + 0.65 * speed + 0.20 * mixed_offense
    defense_score = 0.90 * hp + 1.00 * defense + 1.00 * special_defense - 0.15 * speed
    support_score = 0.75 * hp + 0.55 * speed + 0.45 * balanced_bulk + 0.20 * mixed_offense

    attack_score += 18 * len(set(abilities) & ATTACK_ABILITIES)
    defense_score += 18 * len(set(abilities) & DEFENSE_ABILITIES)
    support_score += 20 * len(set(abilities) & SUPPORT_ABILITIES)

    attack_score += 4 * len(set(types) & ATTACK_TYPES)
    defense_score += 4 * len(set(types) & DEFENSE_TYPES)
    support_score += 4 * len(set(types) & SUPPORT_TYPES)
    attack_score += 6 * attack_move_count
    defense_score += 6 * defense_move_count
    support_score += 8 * support_move_count

    if offense_peak >= 120 and speed >= 90:
        attack_score += 20
    if defense >= 110 or special_defense >= 110:
        defense_score += 15
    if hp >= 95 and speed >= 80 and offense_peak < 105:
        support_score += 10
    if abs(attack - special_attack) <= 20 and abs(defense - special_defense) <= 20:
        support_score += 12
    if (hp + defense + special_defense) >= (offense_peak + 140) and speed <= 90:
        defense_score += 10
    if support_move_count >= 6:
        support_score += 32
    elif support_move_count >= 3:
        support_score += 14
    if defense_move_count >= 4 and balanced_bulk >= 85:
        defense_score += 20
    if attack_move_count >= 4 and offense_peak >= 100:
        attack_score += 16
    if support_move_count >= 5 and offense_peak <= 110:
        support_score += 20
    if support_move_count >= 4 and balanced_bulk >= 80:
        support_score += 12
    if defense_move_count >= 4 and hp >= 85 and offense_peak <= 110:
        defense_score += 12
    if attack >= 125 or special_attack >= 125:
        attack_score += 16
    if speed >= 115 and offense_peak >= 95:
        attack_score += 12
    if hp >= 120 and balanced_bulk >= 90 and support_move_count >= 4:
        support_score += 20
    if "prankster" in abilities or "friend-guard" in abilities:
        support_score += 24
    if "regenerator" in abilities and support_move_count >= 2:
        support_score += 18
    if "serene-grace" in abilities and support_move_count >= 3:
        support_score += 12
    if offense_peak >= 105 and speed >= 95:
        attack_score += 20
        support_score -= 10
    if speed >= 115 and offense_peak >= 80:
        attack_score += 18
        support_score -= 16
    if (hp + defense + special_defense) <= 170 and speed >= 85:
        attack_score += 16
        defense_score -= 8
        support_score -= 12
    if hp >= 220 and support_move_count >= 8:
        support_score += 24
    if hp >= 140 and special_defense >= 120 and support_move_count >= 6:
        support_score += 18

    scores = {
        "attack": attack_score,
        "defense": defense_score,
        "support": support_score,
    }
    role = max(scores, key=scores.get)
    reason = (
        f"stats={stats}; abilities={abilities}; types={types}; "
        f"move_counts={{attack:{attack_move_count}, defense:{defense_move_count}, support:{support_move_count}}}; "
        f"scores={{attack:{attack_score:.1f}, defense:{defense_score:.1f}, support:{support_score:.1f}}}"
    )
    return role, reason


# 逐張圖片處理，查出對應寶可夢資料並組成 CSV 列資料。
def build_rows(image_dir: Path, cache_dir: Path, sleep_seconds: float) -> list[PokemonContext]:
    rows: list[PokemonContext] = []
    image_paths = sorted(image_dir.glob("*.jpg"))
    total = len(image_paths)

    for index, image_path in enumerate(image_paths, start=1):
        species_id, variant = parse_name(image_path.stem)
        pokemon_name, pokemon_data = resolve_pokemon_record(
            species_id=species_id,
            variant=variant,
            cache_dir=cache_dir,
            sleep_seconds=sleep_seconds,
        )
        role, reason = score_role(pokemon_data)
        rows.append(
            PokemonContext(
                image_path=image_path.as_posix(),
                pokemon_key=image_path.stem,
                species_id=species_id,
                variant=variant,
                pokemon_name=pokemon_name,
                role=role,
                role_reason=reason,
                stats_json=json.dumps(
                    {
                        item["stat"]["name"]: item["base_stat"]
                        for item in pokemon_data["stats"]
                    },
                    ensure_ascii=False,
                ),
                abilities_json=json.dumps(
                    [item["ability"]["name"] for item in pokemon_data["abilities"]],
                    ensure_ascii=False,
                ),
                types_json=json.dumps(
                    [item["type"]["name"] for item in pokemon_data["types"]],
                    ensure_ascii=False,
                ),
                moves_json=json.dumps(
                    [item["move"]["name"] for item in pokemon_data["moves"]],
                    ensure_ascii=False,
                ),
            )
        )
        if index % 50 == 0 or index == total:
            print(f"Processed {index}/{total}")

    return rows


# 建立固定比例的切分，同時盡量維持各類別分布平衡。
def assign_splits(dataframe: pd.DataFrame, test_size: float, seed: int) -> pd.DataFrame:
    train_index, test_index = train_test_split(
        dataframe.index,
        test_size=test_size,
        random_state=seed,
        stratify=dataframe["role"],
    )
    dataframe = dataframe.copy()
    dataframe["split"] = "train"
    dataframe.loc[test_index, "split"] = "test"
    return dataframe


# 執行完整自動標籤流程並輸出最終 CSV。
def main() -> None:
    args = parse_args()
    image_dir = Path(args.image_dir)
    if not image_dir.exists():
        raise FileNotFoundError(f"Image directory not found: {image_dir}")

    rows = build_rows(image_dir, Path(args.cache_dir), args.sleep)
    dataframe = pd.DataFrame([row.__dict__ for row in rows])
    dataframe = assign_splits(dataframe, test_size=args.test_size, seed=args.seed)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(output_path, index=False, encoding="utf-8")

    role_counts = dataframe["role"].value_counts().to_dict()
    split_counts = dataframe["split"].value_counts().to_dict()
    print(f"Saved labels to {output_path}")
    print(f"Role counts: {role_counts}")
    print(f"Split counts: {split_counts}")


# 允許這個檔案直接從命令列執行。
if __name__ == "__main__":
    main()
