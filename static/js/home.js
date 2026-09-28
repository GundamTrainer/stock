let homeMarketContext = null;
let homeConversation = [];

function onAuthReady() {
  const loginBox = document.getElementById("loginBox");
  const welcomeBox = document.getElementById("welcomeBox");
  const hello = document.getElementById("hello");
  if (loginBox && welcomeBox) {
    loginBox.hidden = Boolean(currentUser);
    welcomeBox.hidden = !currentUser;
    if (currentUser && hello) hello.textContent = currentUser.email.split("@")[0] + "님, 환영합니다.";
  }
  loadHomeTicker();
  bindStockBot();
}

async function loadHomeTicker() {
  const target = document.getElementById("homeTicker");
  if (!target) return;
  try {
    const response = await fetch("/api/stock-rankings?type=value");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "시장 데이터를 불러오지 못했습니다.");
    const stocks = (payload.items || []).slice(0, 6);
    if (!stocks.length) throw new Error("시장 종목 정보가 없습니다.");
    const cards = stocks.map(function (stock) {
      const price = Number(stock.price || 0);
      const positive = Number(stock.changeRate || 0) >= 0;
      const y1 = positive ? 29 : 13;
      const y2 = positive ? 12 : 29;
      const path = "M3 " + y1 + " L37 " + y2;
      return '<a class="ticker-card" href="./pages/stock.html?code=' + encodeURIComponent(stock.code) + '">' +
        '<span class="ticker-company"><strong>' + escapeHomeText(stock.name) + '</strong><small>' + escapeHomeText(stock.code) + '</small></span>' +
        '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="' + path + '" fill="none" stroke="' + (positive ? "#00c98a" : "#ed6473") + '" stroke-width="2.5" stroke-linecap="round"/><circle cx="37" cy="' + y2 + '" r="2.5" fill="' + (positive ? "#00c98a" : "#ed6473") + '"/></svg>' +
        '<span class="ticker-quote"><b>' + price.toLocaleString("ko-KR") + '원</b><small class="' + (positive ? "up" : "down") + '">' + (positive ? "+" : "") + Number(stock.changeRate || 0).toFixed(2) + '%</small></span></a>';
    }).join("");
    const duplicateCards = cards.replace(/<a /g, '<a tabindex="-1" ');
    target.innerHTML = '<div class="ticker-track"><div class="ticker-group">' + cards + '</div><div class="ticker-group" aria-hidden="true">' + duplicateCards + '</div></div>';
    target.dataset.updatedAt = payload.updatedAt || "";
  } catch (error) {
    target.innerHTML = '<p class="ticker-empty">' + escapeHomeText(error.message || "시장 시세 API 연결 후 종목 흐름이 표시됩니다.") + '</p>';
  }
}

function escapeHomeText(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function bindStockBot() {
  const launcher = document.getElementById("stockBotLauncher");
  const panel = document.getElementById("stockBotPanel");
  const close = document.getElementById("stockBotClose");
  const form = document.getElementById("stockBotForm");
  const input = document.getElementById("stockBotInput");
  if (!launcher || !panel || launcher.dataset.bound) return;
  launcher.dataset.bound = "true";

  function setOpen(open) {
    launcher.setAttribute("aria-expanded", String(open));
    panel.setAttribute("aria-hidden", String(!open));
    panel.classList.toggle("is-open", open);
    if (open) input.focus();
  }
  launcher.addEventListener("click", function () { setOpen(true); });
  close.addEventListener("click", function () { setOpen(false); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    appendBotMessage(question, "user-message");
    input.value = "";
    const button = document.getElementById("aiRecommendBtn");
    const status = document.getElementById("aiRecommendationStatus");
    button.disabled = true;
    if (status) status.textContent = "시장 데이터 분석 중";
    const pending = appendBotMessage("시장 지표와 추세 데이터를 확인하고 있습니다…", "bot-message is-pending");
    try {
      if (!homeMarketContext) homeMarketContext = await loadHomeMarketContext();
      const prompt = buildHomeAnalysisPrompt(question, homeMarketContext);
      const answer = await askAI(prompt);
      pending.textContent = answer;
      pending.classList.remove("is-pending");
      homeConversation.push({ question: question, answer: answer });
      homeConversation = homeConversation.slice(-5);
      if (status) status.textContent = "데이터 기준 " + homeMarketContext.asOf + " · 학습용 분석";
    } catch (error) {
      pending.textContent = "분석 오류: " + (error.message || "Groq API 키, 시장 데이터 API, 서버 실행 상태를 확인해 주세요.");
      pending.classList.remove("is-pending");
      if (status) status.textContent = "분석 연결을 확인해 주세요";
    } finally {
      button.disabled = false;
    }
  });
}

function appendBotMessage(text, className) {
  const messages = document.getElementById("aiRecommendationResult");
  const item = document.createElement("p");
  item.className = className;
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

async function loadHomeMarketContext() {
  const types = ["rise", "fall", "value"];
  const responses = await Promise.all(types.map(async function (type) {
    const response = await fetch("/api/stock-rankings?type=" + type);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "시장 순위 API에 연결할 수 없습니다.");
    return payload;
  }));
  const rankings = {};
  types.forEach(function (type, index) { rankings[type] = responses[index].items || []; });
  const candidates = [];
  ["rise", "fall", "value"].forEach(function (type) {
    rankings[type].slice(0, 2).forEach(function (stock) {
      if (stock.code && !candidates.some(function (item) { return item.code === stock.code; })) candidates.push(stock);
    });
  });
  const histories = await Promise.all(candidates.slice(0, 5).map(async function (stock) {
    try {
      const response = await fetch("/api/stock-history?code=" + encodeURIComponent(stock.code) + "&period=1m");
      if (!response.ok) return { code: stock.code, items: [] };
      const payload = await response.json();
      return { code: stock.code, items: payload.items || [] };
    } catch (error) {
      return { code: stock.code, items: [] };
    }
  }));
  const tradeDate = Object.values(rankings).flat().map(function (stock) { return String(stock.tradeDate || ""); }).filter(Boolean).sort().pop();
  return {
    asOf: tradeDate ? tradeDate.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3") : "기준 시각 확인 필요",
    source: responses.map(function (entry) { return entry.source || "금융위원회 주식시세정보"; })[0],
    rankings: rankings,
    histories: histories,
  };
}

function buildHomeAnalysisPrompt(question, context) {
  const data = [];
  ["rise", "fall", "value"].forEach(function (type) {
    data.push(type.toUpperCase() + " TOP: " + context.rankings[type].slice(0, 5).map(function (stock) {
      return stock.name + "(" + stock.code + ") 종가 " + Number(stock.price || 0) + "원, 일간 " + Number(stock.changeRate || 0).toFixed(2) + "%, 거래량 " + Number(stock.volume || 0) + ", 거래대금 " + Number(stock.tradingValue || 0);
    }).join("; "));
  });
  const trends = context.histories.map(function (entry) {
    const stock = ["rise", "fall", "value"].flatMap(function (type) { return context.rankings[type]; }).find(function (item) { return item.code === entry.code; });
    const closes = entry.items.map(function (item) { return Number(item.close || item.clpr || 0); }).filter(Boolean);
    if (!stock || closes.length < 2) return stock ? stock.name + ": 한 달 가격 이력 부족" : "";
    const ordered = closes.slice().reverse();
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const short = ordered.slice(-5);
    const mean = short.reduce(function (sum, value) { return sum + value; }, 0) / short.length;
    const high = Math.max.apply(null, ordered);
    const low = Math.min.apply(null, ordered);
    return stock.name + ": 최근 관측 " + ordered.length + "개, 첫 관측 " + first + "원 → 최근 " + last + "원(" + (((last - first) / first) * 100).toFixed(2) + "%), 최근 5개 종가 평균 " + Math.round(mean) + "원, 관측 고저폭 " + (((high - low) / low) * 100).toFixed(2) + "%";
  }).filter(Boolean);

  return [
    "역할: 금융시장 데이터 분석가. 아래는 " + context.asOf + " 기준 " + context.source + "의 공개 종가/거래 데이터이며 실시간 시세가 아닐 수 있다.",
    "사용자 질문: " + question,
    "이전 대화: " + (homeConversation.length ? homeConversation.slice(-3).map(function (turn) { return "사용자: " + turn.question + " / 분석가: " + turn.answer; }).join("\n") : "첫 질문"),
    "시장 스냅샷: " + data.join("\n"),
    "최근 가격 추세 분석(표본 종목): " + (trends.join("\n") || "충분한 일별 이력 없음"),
    "주의: 순위 목록은 제공 API에서 조회된 일부 종목 표본이며 전체 시장의 상승/하락 종목 수나 시장 폭 통계가 아니다.",
    "다음 항목을 한국어로 면밀하고 구체적으로 작성: 1) 시장 분위기와 상승/하락 종목 폭 2) 주목 종목 최대 3개의 당일 움직임·거래량/거래대금 근거 및 최근 추세 3) 상승 재료로 해석 가능한 점과 데이터만으로 확인할 수 없는 요인 4) 변동성·유동성·급락/추격매수 위험 5) 조건부 전략(분할 진입, 관망 조건, 손절/익절 원칙을 제시하되 관측되지 않은 가격 수준은 만들지 말 것) 6) 다음 거래일에 확인할 지표와 시나리오 7) 분석 한계.",
    "규칙: 제공된 숫자만 근거로 삼고 추세 데이터가 없으면 없다고 밝혀라. 뉴스·실적·수급 원인을 추측으로 단정하지 말 것. 매수/매도를 권유하거나 수익을 보장하지 말고, 자료 기준 시각과 투자 조언이 아닌 학습용 분석임을 마지막에 표시하라.",
  ].join("\n\n");
}