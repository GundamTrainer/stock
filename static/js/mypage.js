// 내 정보 페이지 전용 코드

function onAuthReady() {
  document.getElementById("myEmail").textContent = currentUser.email;
  loadMyPosts();
  renderTradingRank();
}

function renderTradingRank() {
  let state = { cash: 10000000, holdings: {} };
  let history = [];
  try { state = JSON.parse(localStorage.getItem("stock_arena_portfolio_v1") || '{"cash":10000000,"holdings":{}}'); } catch (error) { state = { cash: 10000000, holdings: {} }; }
  try { history = JSON.parse(localStorage.getItem("stock_arena_trade_history_v1") || "[]"); } catch (error) { history = []; }
  const bought = history.filter(function (trade) { return trade.mode === "buy"; }).reduce(function (sum, trade) { return sum + trade.total; }, 0);
  const sold = history.filter(function (trade) { return trade.mode === "sell"; }).reduce(function (sum, trade) { return sum + trade.total; }, 0);
  const holdingsValue = Object.values(state.holdings || {}).reduce(function (sum, holding) { return sum + Number(holding.price || 0) * Number(holding.qty || 0); }, 0);
  const profit = sold + holdingsValue - bought;
  const levels = [{ name: "BRONZE", title: "브론즈 투자자", threshold: 0 }, { name: "SILVER", title: "실버 투자자", threshold: 100000 }, { name: "GOLD", title: "골드 투자자", threshold: 500000 }, { name: "PLATINUM", title: "플래티넘 투자자", threshold: 1500000 }, { name: "MASTER", title: "마스터 투자자", threshold: 5000000 }];
  let current = levels[0];
  let next = levels[1];
  levels.forEach(function (level, index) { if (profit >= level.threshold) { current = level; next = levels[index + 1] || null; } });
  const progress = next ? Math.min(100, Math.max(0, ((profit - current.threshold) / (next.threshold - current.threshold)) * 100) || 0) : 100;
  document.getElementById("rankBadge").textContent = current.name;
  document.getElementById("rankTitle").textContent = current.title;
  document.getElementById("rankDescription").textContent = next ? "꾸준한 기록과 리스크 관리로 다음 단계에 도전하세요." : "최고 등급에 도달했습니다.";
  document.getElementById("rankProgressBar").style.width = progress + "%";
  document.getElementById("rankNext").textContent = next ? "다음 등급까지 " + formatRankWon(Math.max(0, next.threshold - profit)) : "최고 등급 달성";
  document.getElementById("totalBought").textContent = formatRankWon(bought);
  document.getElementById("totalSold").textContent = formatRankWon(sold);
  document.getElementById("totalProfit").textContent = formatRankWon(profit);
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
