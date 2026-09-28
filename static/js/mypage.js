// 내 정보 페이지 전용 코드

function onAuthReady() {
  document.getElementById("myEmail").textContent = currentUser.email;
  loadMyPosts();
  loadTradingJournal();
}

async function loadTradingJournal() {
  const target = document.getElementById("tradeRecords");
  const { data, error } = await db.from("stock_arena_trades").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: true }).limit(500);
  if (error) {
    console.error("거래 기록을 불러오지 못했습니다:", error);
    if (target) target.innerHTML = '<tr><td colspan="7">Supabase 거래 스키마를 설정하면 계정별 거래 기록이 표시됩니다.</td></tr>';
    return;
  }
  const history = data || [];
  const bought = history.filter(function (trade) { return trade.mode === "buy"; }).reduce(function (sum, trade) { return sum + Number(trade.total || 0); }, 0);
  const sold = history.filter(function (trade) { return trade.mode === "sell"; }).reduce(function (sum, trade) { return sum + Number(trade.total || 0); }, 0);
  const profit = history.reduce(function (sum, trade) { return sum + Number(trade.realized_profit || 0); }, 0);
  const levels = [{ name: "BRONZE", title: "브론즈 투자자", threshold: 0 }, { name: "SILVER", title: "실버 투자자", threshold: 100000 }, { name: "GOLD", title: "골드 투자자", threshold: 500000 }, { name: "PLATINUM", title: "플래티넘 투자자", threshold: 1500000 }, { name: "MASTER", title: "마스터 투자자", threshold: 5000000 }];
  let current = levels[0];
  let next = levels[1];
  levels.forEach(function (level, index) { if (profit >= level.threshold) { current = level; next = levels[index + 1] || null; } });
  const progress = next ? Math.min(100, Math.max(0, ((profit - current.threshold) / (next.threshold - current.threshold)) * 100) || 0) : 100;
  const badge = document.getElementById("rankBadge");
  badge.className = "rank-badge rank-" + current.name.toLowerCase();
  badge.setAttribute("aria-label", current.title);
  badge.querySelector("span").textContent = current.name;
  document.getElementById("rankTitle").textContent = current.title;
  document.getElementById("rankDescription").textContent = next ? "꾸준한 기록과 리스크 관리로 다음 단계에 도전하세요." : "최고 등급에 도달했습니다.";
  document.getElementById("rankProgressBar").style.width = progress + "%";
  document.getElementById("rankNext").textContent = next ? "다음 등급까지 " + formatRankWon(Math.max(0, next.threshold - profit)) : "최고 등급 달성";
  document.getElementById("totalBought").textContent = formatRankWon(bought);
  document.getElementById("totalSold").textContent = formatRankWon(sold);
  document.getElementById("totalProfit").textContent = formatRankWon(profit);
  renderTradeRecords(history);
  renderTradingHistoryChart(history);
}

function renderTradeRecords(history) {
  const target = document.getElementById("tradeRecords");
  const count = document.getElementById("tradeRecordCount");
  if (count) count.textContent = history.length.toLocaleString("ko-KR") + "건";
  if (!target) return;
  if (!history.length) {
    target.innerHTML = '<tr><td colspan="7">아직 매매 기록이 없습니다. 시장 페이지에서 모의 거래를 시작해 보세요.</td></tr>';
    return;
  }
  target.innerHTML = history.slice().reverse().map(function (trade) {
    const row = document.createElement("tr");
    const values = [
      new Date(trade.created_at).toLocaleString("ko-KR"),
      trade.mode === "buy" ? "매수" : "매도",
      trade.stock_name + " · " + trade.stock_code,
      Number(trade.quantity).toLocaleString("ko-KR") + "주",
      formatRankWon(Number(trade.price)),
      formatRankWon(Number(trade.total)),
      trade.mode === "sell" ? formatRankWon(Number(trade.realized_profit || 0)) : "—",
    ];
    values.forEach(function (value, index) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 1) cell.className = trade.mode === "buy" ? "trade-buy" : "trade-sell";
      if (index === 6 && trade.mode === "sell") cell.classList.add(Number(trade.realized_profit) >= 0 ? "profit-positive" : "profit-negative");
      row.appendChild(cell);
    });
    return row.outerHTML;
  }).join("");
}

function renderTradingHistoryChart(history) {
  const svg = document.getElementById("tradingHistoryChart");
  const empty = document.getElementById("historyChartEmpty");
  if (!svg) return;
  const sells = history.filter(function (trade) { return trade.mode === "sell"; });
  if (!sells.length) {
    svg.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  let cumulative = 0;
  const values = [0].concat(sells.map(function (trade) {
    cumulative += Number(trade.realized_profit || 0);
    return cumulative;
  }));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const width = 900;
  const height = 180;
  const points = values.map(function (value, index) {
    return { x: (index / Math.max(values.length - 1, 1)) * width, y: height - ((value - min) / range) * (height - 24) - 12 };
  });
  const path = points.map(function (point, index) { return (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1); }).join(" ");
  const zeroY = height - ((0 - min) / range) * (height - 24) - 12;
  svg.innerHTML = '<line x1="0" y1="' + zeroY + '" x2="900" y2="' + zeroY + '" class="history-zero-line"/><path d="' + path + '" class="history-profit-line"/><circle cx="' + points[points.length - 1].x + '" cy="' + points[points.length - 1].y + '" r="5" class="history-profit-dot"/>';
}

function formatRankWon(value) {
  return (value < 0 ? "-" : "") + "₩" + Math.abs(Math.round(value)).toLocaleString("ko-KR");
}

async function loadMyPosts() {
  // eq 로 조건을 걸어서 내 글만 가져옵니다.
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("읽기 실패:", error);
    return;
  }

  document.getElementById("myCount").textContent = data.length;

  document.getElementById("myList").innerHTML = data
    .map(function (p) {
      const when = new Date(p.created_at).toLocaleString("ko-KR");
      return (
        "<li>" + p.content +
        '<span class="when">' + when + "</span>" +
        '<button onclick="deletePost(' + p.id + ')">삭제</button></li>'
      );
    })
    .join("");
}

async function deletePost(id) {
  const { error } = await db.from("posts").delete().eq("id", id);

  if (error) {
    console.error("삭제 실패:", error);
    return;
  }
  loadMyPosts();
}
