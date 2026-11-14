"""
クラシック有力馬データベース バリデーションスクリプト

2027年世代データ・2026年バックテストデータ・スナップショット・JS出力の
整合性をチェックし、Error / Warning をレポートする。
"""

import json
import re
import sys
from pathlib import Path

VALID_SEXES = {"牡", "牝", "セ"}
VALID_SOURCES = {
    "事前評価(血統/価格)",
    "戦績評価(重賞/OP/新馬)",
    "両方(事前+戦績)",
}
VALID_STATUSES = {
    "重賞勝馬",
    "OP・1勝クラス勝馬",
    "重賞・OP好走",
    "新馬・未勝利勝馬",
    "出走済(未勝利)",
    "未出走",
    "未調査",
}
VALID_TC = {"美浦", "栗東", "海外", "地方", None}


def validate_horse_record(h: dict, expected_birth_year: int | None = None, prefix: str = "") -> tuple[list[str], list[str]]:
    """1頭分のレコードを検証し、(errors, warnings) を返す。"""
    errors: list[str] = []
    warnings: list[str] = []
    label = f"{prefix}{h.get('name', '(名前なし)')}({h.get('netkeiba_id', '?')})"

    # 1. ID・URL・基本属性
    nid = str(h.get("netkeiba_id") or "")
    if not re.fullmatch(r"\d{10}", nid):
        errors.append(f"[{label}] netkeiba_id が10桁の数字ではありません: {nid!r}")

    url = h.get("netkeiba_url") or ""
    expected_url = f"https://db.netkeiba.com/horse/{nid}/"
    if nid and url != expected_url:
        errors.append(f"[{label}] netkeiba_url が ID と不一致です: {url!r} != {expected_url!r}")

    if not h.get("name"):
        errors.append(f"[{label}] name が空です")

    if h.get("sex") not in VALID_SEXES:
        errors.append(f"[{label}] sex が不正です: {h.get('sex')!r}")

    if expected_birth_year is not None and h.get("birth_year") != expected_birth_year:
        errors.append(f"[{label}] birth_year が {expected_birth_year} ではありません: {h.get('birth_year')!r}")

    if h.get("training_center") not in VALID_TC:
        warnings.append(f"[{label}] training_center が想定外の値です: {h.get('training_center')!r}")

    if h.get("selection_source") not in VALID_SOURCES:
        errors.append(f"[{label}] selection_source が不正です: {h.get('selection_source')!r}")

    status = h.get("race_status")
    if status not in VALID_STATUSES:
        errors.append(f"[{label}] race_status が不正です: {status!r}")

    # 2. 出走数・勝利数・戦績の整合性
    starts = h.get("starts")
    wins = h.get("wins")
    results = h.get("major_results") or ""

    if wins is not None and wins > 0 and (starts is None or starts <= 0):
        errors.append(f"[{label}] wins={wins} なのに starts={starts!r} です")

    if starts is not None and starts < 0:
        errors.append(f"[{label}] starts が負の値です: {starts}")
    if wins is not None and wins < 0:
        errors.append(f"[{label}] wins が負の値です: {wins}")

    if starts is not None and wins is not None and wins > starts:
        errors.append(f"[{label}] wins({wins}) が starts({starts}) を超えています")

    if starts is not None and starts > 0 and wins is None:
        errors.append(f"[{label}] starts={starts} なのに wins=None です")

    # 3. race_status と starts/wins/major_results の整合性
    if status == "未出走":
        if (starts or 0) > 0 or (wins or 0) > 0:
            errors.append(f"[{label}] race_status='未出走' なのに starts={starts}, wins={wins}")
    elif status == "出走済(未勝利)":
        if (wins or 0) > 0:
            errors.append(f"[{label}] race_status='出走済(未勝利)' なのに wins={wins}")
        if starts is None or starts <= 0:
            errors.append(f"[{label}] race_status='出走済(未勝利)' なのに starts={starts!r}")
    elif status in {"重賞勝馬", "OP・1勝クラス勝馬", "新馬・未勝利勝馬"}:
        if (wins or 0) <= 0:
            errors.append(f"[{label}] race_status={status!r} なのに wins={wins!r}")
        if "1着" not in results:
            warnings.append(f"[{label}] race_status={status!r} ですが major_results に '1着' の記載がありません: {results!r}")

    if status == "重賞勝馬":
        segments = [s.strip() for s in results.split("、") if s.strip()]
        has_graded_win = any(
            "1着" in seg and any(g in seg for g in ("G1", "GI", "G2", "GII", "G3", "GIII", "Jpn"))
            for seg in segments
        )
        if not has_graded_win:
            errors.append(f"[{label}] race_status='重賞勝馬' ですが major_results に重賞1着が見つかりません: {results!r}")

    # 4. 勝利数と major_results 内 '1着' 記載数のチェック（スコア計算の網羅確認）
    if wins is not None and wins >= 2:
        win_segs = sum(1 for seg in results.split("、") if "1着" in seg)
        if win_segs < wins:
            warnings.append(
                f"[{label}] wins={wins} ですが major_results 内の '1着' 記載が {win_segs} 件です（未勝利/新馬の1着記載漏れでスコア差が出る可能性）: {results!r}"
            )

    return errors, warnings


def validate_collection(horses: list[dict], expected_birth_year: int | None = None, prefix: str = "") -> tuple[list[str], list[str]]:
    """馬リスト全体の重複チェックと各レコード検証を行う。"""
    errors: list[str] = []
    warnings: list[str] = []

    seen_ids: dict[str, str] = {}
    seen_names: dict[str, str] = {}

    for h in horses:
        nid = str(h.get("netkeiba_id") or "")
        name = str(h.get("name") or "")
        if nid in seen_ids:
            errors.append(f"{prefix}netkeiba_id 重複: {nid} ({seen_ids[nid]} / {name})")
        else:
            seen_ids[nid] = name

        if name in seen_names:
            errors.append(f"{prefix}馬名重複: {name} ({seen_names[name]} / {nid})")
        else:
            seen_names[name] = nid

        e, w = validate_horse_record(h, expected_birth_year=expected_birth_year, prefix=prefix)
        errors.extend(e)
        warnings.extend(w)

    return errors, warnings


def validate_all() -> int:
    import build_initial_db as b27
    import build_backtest_2026 as b26

    all_errors: list[str] = []
    all_warnings: list[str] = []

    # 1. 2027年世代 (build_initial_db.py のマージ済み結果)
    merged_27 = b27.build_merged_horses()
    e, w = validate_collection(merged_27, expected_birth_year=2024, prefix="[2027] ")
    all_errors.extend(e)
    all_warnings.extend(w)

    # 2. 生成済み JSON / JS / snapshots_2027.json の整合性
    data_dir = Path("data")
    json_path = data_dir / "classic_2027_prospects.json"
    snap_path = data_dir / "snapshots_2027.json"
    if json_path.exists():
        with open(json_path, encoding="utf-8") as f:
            json_horses = json.load(f)
        if len(json_horses) != len(merged_27):
            all_errors.append(
                f"[2027] {json_path} の頭数({len(json_horses)})が build_initial_db.py({len(merged_27)}) と一致しません（再生成が必要です）"
            )
    else:
        all_warnings.append(f"[2027] {json_path} が未生成です")

    if snap_path.exists():
        with open(snap_path, encoding="utf-8") as f:
            snaps = json.load(f)
        if not snaps:
            all_warnings.append(f"[2027] {snap_path} が空です")
        else:
            latest_date = sorted(snaps.keys())[-1]
            latest_ids = set(snaps[latest_date].keys())
            current_ids = {h["netkeiba_id"] for h in merged_27}
            missing_in_snap = current_ids - latest_ids
            if missing_in_snap:
                all_warnings.append(
                    f"[2027] 最新スナップショット({latest_date})に含まれない馬が {len(missing_in_snap)} 頭います（再生成を推奨）"
                )

    # 3. 2026年バックテスト世代 (全タイムライン時点 + 時系列逆行チェック)
    bt_dates = ["2025-11-08", "2025-12-28", "2026-05-31"]
    for d in bt_dates:
        day_list = []
        for h in b26.HORSES_2026:
            item = {k: v for k, v in h.items() if k != "timeline"}
            item.update(h["timeline"][d])
            day_list.append(item)
        e, w = validate_collection(day_list, expected_birth_year=2023, prefix=f"[2026:{d}] ")
        all_errors.extend(e)
        all_warnings.extend(w)

    for h in b26.HORSES_2026:
        prev_s, prev_w = -1, -1
        for d in bt_dates:
            tl = h["timeline"][d]
            s = tl.get("starts") or 0
            w_cnt = tl.get("wins") or 0
            if s < prev_s or w_cnt < prev_w:
                all_errors.append(
                    f"[2026] {h['name']} の戦績が時系列({d})で減少しています: starts {prev_s}->{s}, wins {prev_w}->{w_cnt}"
                )
            prev_s, prev_w = s, w_cnt

    # レポート出力
    print(f"=== バリデーション結果 ===")
    print(f"2027年世代チェック対象: {len(merged_27)} 頭")
    print(f"2026年世代チェック対象: {len(b26.HORSES_2026)} 頭 x {len(bt_dates)} 時点")
    print(f"Errors: {len(all_errors)} 件 / Warnings: {len(all_warnings)} 件")

    if all_errors:
        print("\n[ERROR]")
        for msg in all_errors:
            print(f"  - {msg}")

    if all_warnings:
        print("\n[WARNING]")
        for msg in all_warnings:
            print(f"  - {msg}")

    if not all_errors and not all_warnings:
        print("\nすべてのチェックを問題なく通過しました！")

    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(validate_all())
