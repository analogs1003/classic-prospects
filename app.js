(function () {
  "use strict";

  const generations = window.CLASSIC_GENERATIONS || {};
  const generationKeys = Object.keys(generations).sort((a, b) => Number(b) - Number(a));

  const state = {
    genKey: generationKeys[0] || "2027",
    tab: "all",
    search: "",
    source: "all",
    status: "all",
    tc: "all",
    sortBy: "score",
    scoredHorses: [],
    snapshots: {},
    snapshotDates: [],
  };

  // DOM elements
  const genSelect = document.getElementById("generation-select");
  const pageTitle = document.getElementById("page-title");
  const seasonSubtitle = document.getElementById("season-subtitle");
  const updatedAtEl = document.getElementById("updated-at");

  const statTotal = document.getElementById("stat-total");
  const statSexSplit = document.getElementById("stat-sex-split");
  const statGraded = document.getElementById("stat-graded");
  const statMultiWin = document.getElementById("stat-multi-win");
  const statWinners = document.getElementById("stat-winners");
  const statUnraced = document.getElementById("stat-unraced");

  const searchInput = document.getElementById("search-input");
  const filterSource = document.getElementById("filter-source");
  const filterStatus = document.getElementById("filter-status");
  const filterTc = document.getElementById("filter-tc");
  const sortBySelect = document.getElementById("sort-by");
  const resetFiltersBtn = document.getElementById("reset-filters");
  const resultCount = document.getElementById("result-count");
  const tbody = document.getElementById("ranking-tbody");
  const emptyState = document.getElementById("empty-state");

  // Modal elements
  const modal = document.getElementById("horse-modal");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalClose = document.getElementById("modal-close");
  const modalBadges = document.getElementById("modal-badges");
  const modalName = document.getElementById("modal-name");
  const modalFoal = document.getElementById("modal-foal");
  const modalScoreBar = document.getElementById("modal-score-bar");
  const modalGrid = document.getElementById("modal-grid");
  const modalResults = document.getElementById("modal-results");
  const modalPedigree = document.getElementById("modal-pedigree");
  const modalHistory = document.getElementById("modal-history");
  const modalNetkeiba = document.getElementById("modal-netkeiba");

  /**
   * 戦績・血統/価格データからクラシック指数(スコア)を計算する
   */
  function calculateScore(horse) {
    let perfPt = 0;
    let prePt = 0;
    const status = horse.race_status || "";
    const results = horse.major_results || "";
    const wins = Number(horse.wins || 0);

    // 1. 戦績ポイント（レース単位で合算）
    const segments = results
      .split("、")
      .map((s) => s.trim())
      .filter(Boolean);
    let parsedAny = false;

    for (const seg of segments) {
      if (seg.includes("1着")) {
        parsedAny = true;
        if (seg.includes("G1") || seg.includes("GI")) {
          perfPt += 120;
          if (
            seg.includes("日本ダービー") ||
            seg.includes("オークス") ||
            seg.includes("皐月賞") ||
            seg.includes("桜花賞")
          ) {
            perfPt += 20;
          }
        } else if (seg.includes("G2") || seg.includes("GII")) {
          perfPt += 75;
        } else if (seg.includes("G3") || seg.includes("GIII")) {
          perfPt += 55;
        } else if (seg.includes("(L")) {
          perfPt += 39;
        } else if (
          seg.includes("(OP") ||
          seg.includes("(1勝") ||
          seg.includes("1勝クラス")
        ) {
          perfPt += 35;
        } else if (seg.includes("新馬") || seg.includes("未勝利")) {
          perfPt += 18;
        } else {
          perfPt += 18;
        }
      } else if (seg.includes("2着")) {
        parsedAny = true;
        if (seg.includes("G1") || seg.includes("GI")) {
          perfPt += 45;
        } else if (seg.includes("G2") || seg.includes("GII")) {
          perfPt += 20;
        } else if (seg.includes("G3") || seg.includes("GIII")) {
          perfPt += 12;
        } else if (
          seg.includes("(L") ||
          seg.includes("(OP") ||
          seg.includes("(1勝")
        ) {
          perfPt += 10;
        } else if (seg.includes("新馬") || seg.includes("未勝利")) {
          perfPt += 6;
        } else {
          perfPt += 5;
        }
      } else if (seg.includes("3着")) {
        parsedAny = true;
        if (seg.includes("G1") || seg.includes("GI")) {
          perfPt += 30;
        } else if (seg.includes("G2") || seg.includes("GII")) {
          perfPt += 10;
        } else if (seg.includes("G3") || seg.includes("GIII")) {
          perfPt += 6;
        } else if (seg.includes("新馬") || seg.includes("未勝利")) {
          perfPt += 3;
        } else {
          perfPt += 2;
        }
      }
    }

    if (!parsedAny) {
      if (status === "OP・1勝クラス勝馬") {
        perfPt += 35;
      } else if (status === "重賞・OP好走") {
        perfPt += 26;
      } else if (status === "新馬・未勝利勝馬") {
        perfPt += 18;
      } else if (status === "出走済(未勝利)") {
        perfPt += 4;
      }
    }

    // 複数勝利ボーナス
    if (wins >= 2) {
      perfPt += (wins - 1) * 10;
    }

    // 圧勝・高指数・クラシック王道距離ボーナス
    if (results.includes("7馬身差") || results.includes("高指数")) {
      perfPt += 5;
    } else if (results.includes("3馬身差") || results.includes("2馬身差")) {
      perfPt += 3;
    }

    // 2. 事前評価ポイント
    const price = Number(horse.price_man_yen || 0);
    if (price >= 30000) prePt += 14;
    else if (price >= 20000) prePt += 11;
    else if (price >= 10000) prePt += 8;
    else if (price >= 6000) prePt += 6;
    else if (price > 0) prePt += 4;

    if (horse.selection_source !== "戦績評価(重賞/OP/新馬)") {
      prePt += 6;
    }
    if (horse.selection_source === "両方(事前+戦績)") {
      prePt += 4;
    }

    return {
      total: perfPt + prePt,
      perfPt,
      prePt,
    };
  }

  function initGenerationSelector() {
    genSelect.innerHTML = "";
    generationKeys.forEach((key) => {
      const gen = generations[key];
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = gen.season_label;
      genSelect.appendChild(opt);
    });
    genSelect.value = state.genKey;
  }

  function loadGeneration(key) {
    state.genKey = key;
    const gen = generations[key];
    if (!gen) return;

    pageTitle.textContent = `${gen.generation_id} クラシック有力馬ランキング`;
    seasonSubtitle.textContent = `${gen.season_label} ／ ${gen.period_label}`;
    updatedAtEl.textContent = gen.updated_at || "--";

    state.snapshots = gen.snapshots || {};
    state.snapshotDates = Object.keys(state.snapshots).sort();

    state.scoredHorses = (gen.horses || []).map((h) => ({
      ...h,
      score: calculateScore(h),
    }));

    updateStats();
    render();
  }

  function getRankDiffHtml(horseId) {
    if (state.snapshotDates.length < 2) return "";
    const prevDate = state.snapshotDates[state.snapshotDates.length - 2];
    const currDate = state.snapshotDates[state.snapshotDates.length - 1];
    const prevSnap = state.snapshots[prevDate]?.[horseId];
    const currSnap = state.snapshots[currDate]?.[horseId];
    if (!currSnap) return "";
    if (!prevSnap) return `<span class="rank-diff diff-new">NEW</span>`;
    const diff = prevSnap.rank - currSnap.rank;
    if (diff > 0) return `<span class="rank-diff diff-up">▲${diff}</span>`;
    if (diff < 0) return `<span class="rank-diff diff-down">▼${Math.abs(diff)}</span>`;
    return `<span class="rank-diff diff-same">−</span>`;
  }

  function updateStats() {
    const all = state.scoredHorses;
    const colts = all.filter((h) => h.sex === "牡").length;
    const fillies = all.filter((h) => h.sex === "牝").length;
    const graded = all.filter((h) => h.race_status === "重賞勝馬").length;
    const multiWin = all.filter((h) => Number(h.wins || 0) >= 2).length;
    const winners = all.filter((h) => Number(h.wins || 0) >= 1).length;
    const unraced = all.filter((h) => h.race_status === "未出走").length;

    statTotal.textContent = `${all.length}頭`;
    statSexSplit.textContent = `牡 ${colts} / 牝 ${fillies}`;
    statGraded.textContent = `${graded}頭`;
    statMultiWin.textContent = `${multiWin}頭`;
    statWinners.textContent = `${winners}頭`;
    statUnraced.textContent = unraced;
  }

  function getFilteredAndSorted() {
    const q = state.search.trim().toLowerCase();

    let list = state.scoredHorses.filter((h) => {
      if (state.tab === "colt" && h.sex !== "牡") return false;
      if (state.tab === "filly" && h.sex !== "牝") return false;
      if (state.tab === "unraced" && h.race_status !== "未出走") return false;

      if (state.source !== "all" && h.selection_source !== state.source) return false;
      if (state.status !== "all" && h.race_status !== state.status) return false;
      if (state.tc !== "all" && h.training_center !== state.tc) return false;

      if (q) {
        const hay = [
          h.name,
          h.foal_name,
          h.sire,
          h.dam,
          h.bms,
          h.trainer,
          h.owner,
          h.breeder,
          h.major_results,
          h.pedigree_note,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (state.sortBy === "score") {
        if (b.score.total !== a.score.total) return b.score.total - a.score.total;
        const winDiff = Number(b.wins || 0) - Number(a.wins || 0);
        if (winDiff !== 0) return winDiff;
        return Number(b.price_man_yen || 0) - Number(a.price_man_yen || 0);
      }
      if (state.sortBy === "wins") {
        const winDiff = Number(b.wins || 0) - Number(a.wins || 0);
        if (winDiff !== 0) return winDiff;
        return b.score.total - a.score.total;
      }
      if (state.sortBy === "price") {
        const pDiff = Number(b.price_man_yen || 0) - Number(a.price_man_yen || 0);
        if (pDiff !== 0) return pDiff;
        return b.score.total - a.score.total;
      }
      if (state.sortBy === "name") {
        return a.name.localeCompare(b.name, "ja");
      }
      return 0;
    });

    return list;
  }

  function sourceBadgeHtml(source) {
    if (source === "両方(事前+戦績)") {
      return `<span class="badge badge-both">両方 (事前＋戦績)</span>`;
    }
    if (source === "戦績評価(重賞/OP/新馬)") {
      return `<span class="badge badge-perf">戦績評価</span>`;
    }
    return `<span class="badge badge-pre">事前評価</span>`;
  }

  function statusClass(status) {
    if (status === "重賞勝馬") return "status-graded";
    if (status === "OP・1勝クラス勝馬") return "status-op";
    if (status === "重賞・OP好走") return "status-placed";
    if (status === "新馬・未勝利勝馬") return "status-maiden";
    return "status-unraced";
  }

  function formatRecord(h) {
    if (h.starts === null || h.starts === undefined) {
      if (h.wins !== null && h.wins !== undefined) return `-戦${h.wins}勝`;
      return "未調査";
    }
    return `${h.starts}戦${h.wins || 0}勝`;
  }

  function formatPrice(price) {
    if (!price) return "-";
    if (price >= 10000) {
      return `${(price / 10000).toFixed(2).replace(/\.00$/, "")}億円`;
    }
    return `${price.toLocaleString()}万円`;
  }

  function render() {
    const list = getFilteredAndSorted();
    resultCount.textContent = list.length;

    if (list.length === 0) {
      tbody.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    let lastScore = null;
    let currentRank = 0;
    tbody.innerHTML = list
      .map((h, idx) => {
        let rank = idx + 1;
        if (state.sortBy === "score") {
          if (h.score.total !== lastScore) {
            currentRank = idx + 1;
            lastScore = h.score.total;
          }
          rank = currentRank;
        }
        const rankClass = rank <= 3 ? `rank-${rank}` : "";
        const sexClass = h.sex === "牡" ? "sex-colt" : "sex-filly";
        const mainText = h.major_results || h.pedigree_note || "-";
        const subText = h.major_results ? (h.selection_category || "") : "";

        return `
          <tr data-id="${h.netkeiba_id}">
            <td class="col-rank">
              <span class="rank-badge ${rankClass}">${rank}</span>
              ${state.sortBy === "score" && state.tab === "all" ? getRankDiffHtml(h.netkeiba_id) : ""}
            </td>
            <td class="col-score">
              <span class="score-pill">${h.score.total}</span>
            </td>
            <td>
              <div class="horse-name">${escapeHtml(h.name)}</div>
              <div class="horse-pedigree">
                父 <span>${escapeHtml(h.sire)}</span> ／ 母 ${escapeHtml(h.dam)}（母父 ${escapeHtml(h.bms)}）
              </div>
            </td>
            <td class="col-meta">
              <span class="sex-badge ${sexClass}">${escapeHtml(h.sex)}2</span>
              <span class="tc-text">${escapeHtml(h.training_center)}・${escapeHtml(h.trainer)}</span>
            </td>
            <td class="col-source">
              ${sourceBadgeHtml(h.selection_source)}
              <div class="status-pill ${statusClass(h.race_status)}">${escapeHtml(h.race_status)}</div>
            </td>
            <td class="col-record">
              <span class="record-main">${formatRecord(h)}</span>
            </td>
            <td>
              <div class="results-text">${escapeHtml(mainText)}</div>
              ${subText ? `<div class="results-sub">${escapeHtml(subText)}</div>` : ""}
            </td>
            <td class="col-price price-cell">
              ${formatPrice(h.price_man_yen)}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function openModal(netkeibaId) {
    const horse = state.scoredHorses.find((h) => h.netkeiba_id === netkeibaId);
    if (!horse) return;

    const sexClass = horse.sex === "牡" ? "sex-colt" : "sex-filly";
    modalBadges.innerHTML = `
      <span class="sex-badge ${sexClass}">${escapeHtml(horse.sex)}2</span>
      ${sourceBadgeHtml(horse.selection_source)}
      <span class="badge badge-pre">${escapeHtml(horse.race_status)}</span>
    `;
    modalName.textContent = horse.name;
    modalFoal.textContent = `${horse.foal_name || "-"} ／ netkeiba ID: ${horse.netkeiba_id}`;

    modalScoreBar.innerHTML = `
      <span>クラシック指数: <strong style="color: var(--gold); font-size: 18px;">${horse.score.total} pt</strong></span>
      <span>内訳: 戦績 <strong>${horse.score.perfPt} pt</strong> ＋ 事前評価 <strong>${horse.score.prePt} pt</strong></span>
    `;

    const details = [
      ["父", horse.sire],
      ["母", horse.dam],
      ["母父", horse.bms],
      ["調教師", `${horse.trainer} (${horse.training_center})`],
      ["馬主", horse.owner],
      ["生産者", horse.breeder],
      ["生年月日", horse.birth_date],
      ["毛色", horse.coat_color],
      ["取引・募集", `${horse.market_type || "-"} (${formatPrice(horse.price_man_yen)})`],
      ["通算戦績", formatRecord(horse)],
    ];

    modalGrid.innerHTML = details
      .map(
        ([label, val]) => `
        <div class="detail-item">
          <span class="label">${escapeHtml(label)}</span>
          <span class="val">${escapeHtml(val || "-")}</span>
        </div>
      `
      )
      .join("");

    modalResults.textContent = horse.major_results || "（出走情報・主要戦績の登録なし）";
    modalPedigree.textContent = horse.pedigree_note || "-";

    if (state.snapshotDates.length > 0) {
      const historyHtml = state.snapshotDates
        .slice()
        .reverse()
        .map((date) => {
          const rec = state.snapshots[date]?.[horse.netkeiba_id];
          if (!rec) return "";
          const sexLabel = horse.sex === "牡" ? "牡馬" : "牝馬";
          const recordStr =
            rec.starts !== null && rec.starts !== undefined
              ? `${rec.starts}戦${rec.wins || 0}勝`
              : rec.wins
              ? `${rec.wins}勝`
              : "未出走";
          return `
            <div class="history-row">
              <span class="history-date">${escapeHtml(date)}</span>
              <span class="history-rank">総合 ${rec.rank}位 (${sexLabel}${rec.sex_rank}位)</span>
              <span class="history-score">${rec.score} pt</span>
              <span class="history-status">${escapeHtml(rec.race_status)} / ${recordStr}</span>
            </div>
          `;
        })
        .filter(Boolean)
        .join("");
      modalHistory.innerHTML = historyHtml || '<span class="history-status">履歴データなし</span>';
    } else {
      modalHistory.innerHTML = '<span class="history-status">履歴データなし</span>';
    }

    modalNetkeiba.href = horse.netkeiba_url || `https://db.netkeiba.com/horse/${horse.netkeiba_id}/`;

    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Event listeners
  genSelect.addEventListener("change", (e) => loadGeneration(e.target.value));

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      render();
    });
  });

  searchInput.addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  filterSource.addEventListener("change", (e) => {
    state.source = e.target.value;
    render();
  });

  filterStatus.addEventListener("change", (e) => {
    state.status = e.target.value;
    render();
  });

  filterTc.addEventListener("change", (e) => {
    state.tc = e.target.value;
    render();
  });

  sortBySelect.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    render();
  });

  resetFiltersBtn.addEventListener("click", () => {
    state.search = "";
    state.source = "all";
    state.status = "all";
    state.tc = "all";
    state.sortBy = "score";
    searchInput.value = "";
    filterSource.value = "all";
    filterStatus.value = "all";
    filterTc.value = "all";
    sortBySelect.value = "score";
    render();
  });

  tbody.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (row) openModal(row.dataset.id);
  });

  modalBackdrop.addEventListener("click", closeModal);
  modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  // Initialize
  initGenerationSelector();
  if (state.genKey && generations[state.genKey]) {
    loadGeneration(state.genKey);
  } else {
    seasonSubtitle.textContent = "データファイル (data/classic_2027_prospects.js) が読み込めませんでした。";
  }
})();

