const RANKING_TARGETS = {
  rise: "riseRanking",
  fall: "fallRanking",
  volume: "volumeRanking",
  value: "valueRanking",
};

let portfolioCache = null;

let rankingCache = [];
let marketCache = [];
let marketDataPromise = null;
let selectedStock = null;
let portfolioVersion = 0;

function onAuthReady() {
  loadMarketSummary();
  loadAllRankings();
  bindSearch();
  bindTradeControls();
  loadPortfolioState();
  renderPortfolioState();
}

async function loadPortfolioState() {
  if (!currentUser || !window.db) {
    portfolioCache = null;
    renderPortfolioState();
    return;
  }
  const requestVersion = portfolioVersion;
  const { data, error } = await db.rpc("stock_arena_get_portfolio");
  if (requestVersion !== portfolioVersion) return;
  if (error) {
    console.error("포트폴리오 조회 실패:", error);
    setTradeStatus(formatSupabaseTradeError(error));
    return;
  }
  portfolioCache = data;
  syncPortfolioPrices(marketCache);
  renderPortfolioState();
}

async function loadPublicIndexSummary() {
  const response = await fetch("/api/market-summary", { headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "시장 지수 API 요청 실패");
  return payload.indexes || {};
}

function normalizePublicMarketItem(item) {
  const code = item.code || item.srtnCd || item.shtCd || item.stkCd || item.stockCode || item.isinCd || "";
  const name = item.name || item.itmsNm || item.stockName || item.stockNm || "종목명";
  const price = Number(item.price ?? item.clpr ?? item.close ?? item.lastPrice ?? 0);
  const change = Number(item.change ?? item.vs ?? 0);
  const changeRate = Number(item.changeRate ?? item.fltRt ?? item.prdy_ctrt ?? 0);
  const volume = Number(item.volume ?? item.acmlVol ?? item.trqu ?? 0);
  const tradingValue = Number(item.tradingValue ?? item.trPrc ?? item.acmlTrPbmn ?? item.dealAmt ?? 0);
  const tradeDate = item.tradeDate || item.basDt || item.date || "20260621";

  return {
    code: String(code),
    name: String(name),
    sector: normalizeMarketCategory(item.sector || item.mrktCtg || item.category),
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changeRate: Number.isFinite(changeRate) ? changeRate : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    tradingValue: Number.isFinite(tradingValue) ? tradingValue : 0,
    tradeDate,
    updatedAt: tradeDate,
  };
}

function normalizeMarketCategory(value) {
  const category = String(value || "").trim().toUpperCase();
  return ["KOSPI", "KOSDAQ", "KONEX"].includes(category) ? category : "기타";
}

function buildSyntheticTrend(basePrice, variation = 0.03) {
  const points = [];
  for (let i = 0; i < 20; i += 1) {
    const wave = Math.sin(i / 2.7) * basePrice * variation;
    const slope = (i - 9) * basePrice * 0.0012;
    points.push(Math.round(basePrice + wave + slope + (Math.random() - 0.5) * basePrice * 0.008));
  }
  return points;
}

function getTrendPoints(stock) {
  const base = Number(stock?.price || 0);
  if (!base) return [0, 1, 2, 3, 4, 5];
  return buildSyntheticTrend(base, stock.changeRate >= 0 ? 0.024 : 0.03);
}

function renderSparkline(stock, targetId, isPositive) {
  const svg = document.getElementById(targetId);
  if (!svg) return;

  const values = getTrendPoints(stock);
  const width = 300;
  const height = 120;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values.map(function (value, index) {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 14) - 7;
    return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
  }).join(" ");

  svg.innerHTML = '<path d="' + path + '" fill="none" stroke="' + (isPositive ? "#1dd08f" : "#ff5d73") + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>';
}

async function loadPublicMarketData() {
  if (marketCache.length) {
    return marketCache;
  }
  if (!marketDataPromise) {
    marketDataPromise = (async function () {
      const response = await fetch("/api/stock-list");
      let payload = {};
      try { payload = await response.json(); } catch (error) { /* Report a stable API message below. */ }
      if (!response.ok) throw new Error(payload.error || "금융위 V2 종목 목록 API 요청 실패 (" + response.status + ")");
      marketCache = (payload.items || []).map(normalizePublicMarketItem).filter(function (item) {
        return item.code && item.name && item.price > 0;
      });
      if (!marketCache.length) throw new Error("금융위 V2 종목 목록에서 거래 가능한 종목이 없습니다.");
      syncPortfolioPrices(marketCache);
      return marketCache;
    })();
  }
  try {
    return await marketDataPromise;
  } finally {
    marketDataPromise = null;
  }
}

function syncPortfolioPrices(items) {
  if (!portfolioCache || !portfolioCache.holdings || !items || !items.length) return;
  const prices = new Map(items.map(function (item) { return [String(item.code), Number(item.price)]; }));
  Object.values(portfolioCache.holdings).forEach(function (holding) {
    const latestPrice = prices.get(String(holding.code));
    if (Number.isFinite(latestPrice) && latestPrice > 0) holding.price = latestPrice;
  });
  renderPortfolioState();
}

async function loadMarketSummary() {
  const status = document.getElementById("marketStatus");
  const updated = document.getElementById("marketUpdated");
  if (status) status.textContent = "공공데이터 기반 시장";
  if (updated) updated.textContent = "기준 시각 확인 중";

  try {
    const indexes = await loadPublicIndexSummary();
    const kospi = indexes.KOSPI || {
      value: 0,
      changeRate: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    const kosdaq = indexes.KOSDAQ || {
      value: 0,
      changeRate: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    const stock = {
      code: "KOSPI",
      name: "KOSPI",
      price: Number(kospi.value || 0),
      changeRate: Number(kospi.changeRate || 0),
      updatedAt: kospi.updatedAt || new Date().toISOString().slice(0, 10),
      kosdaqValue: Number(kosdaq.value || 0),
      kosdaqChangeRate: Number(kosdaq.changeRate || 0),
      kosdaqUpdatedAt: kosdaq.updatedAt || new Date().toISOString().slice(0, 10),
    };

    renderSummary(stock);
  } catch (error) {
    console.error("시장 시세를 불러오지 못했습니다:", error);
    const backup = {
      code: "KOSPI",
      name: "KOSPI",
      price: 75000,
      changeRate: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
      kosdaqValue: 22000,
      kosdaqChangeRate: 0,
      kosdaqUpdatedAt: new Date().toISOString().slice(0, 10),
    };
    renderSummary(backup);
  }
}

async function loadAllRankings() {
  const results = await Promise.allSettled(
    Object.keys(RANKING_TARGETS).map(function (type) {
      return loadRanking(type);
    })
  );

  results.forEach(function (result, index) {
    if (result.status === "rejected") {
      const errorMessage = result.reason && result.reason.message
        ? result.reason.message
        : "공공데이터 기반 시장 정보를 확인하지 못했습니다.";
      showError(RANKING_TARGETS[Object.keys(RANKING_TARGETS)[index]], errorMessage);
    }
  });

  try {
    const items = await loadPublicMarketData();
    if (items.length && !selectedStock) {
      setSelectedStock(items[0]);
    }
  } catch (error) {
    console.error("시장 종목 데이터를 불러오지 못했습니다:", error);
  }
}

async function loadRanking(type) {
  const targetId = RANKING_TARGETS[type];
  showLoading(targetId);

  try {
    const items = await loadPublicMarketData();
    const ranking = buildRankings(items, type);
    rankingCache = ranking;
    renderRanking(targetId, ranking);
    return ranking;
  } catch (error) {
    console.error(type + " 시장 순위를 불러오지 못했습니다:", error);
    showError(targetId, error.message || "금융위원회 V2 시세 API에 연결할 수 없습니다.");
    throw error;
  }
}

function buildRankings(items, type) {
  const copy = [...items];
  const sorted = copy.sort(function (a, b) {
    if (type === "rise") return Number(b.changeRate || 0) - Number(a.changeRate || 0);
    if (type === "fall") return Number(a.changeRate || 0) - Number(b.changeRate || 0);
    if (type === "volume") return Number(b.volume || 0) - Number(a.volume || 0);
    return Number(b.tradingValue || 0) - Number(a.tradingValue || 0);
  });

  return sorted.slice(0, 10).map(function (item, index) {
    return {
      rank: index + 1,
      code: item.code,
      name: item.name,
      sector: item.sector,
      price: item.price,
      change: item.change,
      changeRate: item.changeRate,
      volume: item.volume,
      tradingValue: item.tradingValue,
      updatedAt: item.updatedAt || item.tradeDate,
    };
  });
}

function renderSummary(stock) {
  const status = document.getElementById("marketStatus");
  const updated = document.getElementById("marketUpdated");
  if (status) status.textContent = "공공데이터 기반 시장";
  if (updated) updated.textContent = stock.updatedAt ? "기준 " + stock.updatedAt : "기준 시각 확인 필요";

  const kospiItem = {
    value: Number(stock.price || 0),
    changeRate: Number(stock.changeRate || 0),
  };
  const kosdaqItem = {
    value: Number(stock.kosdaqValue || stock.price || 0),
    changeRate: Number(stock.kosdaqChangeRate || 0),
  };

  renderSummaryValue("kospi", kospiItem);
  renderSummaryValue("kosdaq", kosdaqItem);
  renderPortfolioState();
}

function renderSummaryValue(prefix, item) {
  const value = document.getElementById(prefix + "Value");
  const change = document.getElementById(prefix + "Change");
  if (!item) {
    if (value) value.textContent = "-";
    if (change) change.textContent = "데이터 없음";
    return;
  }
  if (value) value.textContent = item.value == null ? "-" : formatPrice(item.value);
  if (change) change.textContent = item.changeRate == null ? "-" : formatRate(item.changeRate);
}

function renderRanking(targetId, items) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!items.length) {
    showEmpty(targetId, "표시할 시장 데이터가 없습니다.");
    return;
  }

  target.innerHTML = "";
  items.slice(0, 10).forEach(function (item, index) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "ranking-item";
    link.style.textAlign = "left";
    link.style.width = "100%";
    link.addEventListener("click", function () {
      setSelectedStock(item);
      const search = document.getElementById("stockSearch");
      if (search) search.value = item.name;
    });

    const rank = document.createElement("span");
    rank.className = "ranking-rank";
    rank.textContent = String(item.rank || index + 1).padStart(2, "0");
    const name = document.createElement("strong");
    name.textContent = item.name || "종목명 없음";
    const code = document.createElement("small");
    code.textContent = item.code || "코드 없음";
    const price = document.createElement("span");
    price.textContent = item.price == null ? "-" : formatPrice(item.price);
    const rate = document.createElement("b");
    rate.className = getChangeClass(item.changeRate);
    rate.textContent = item.changeRate == null ? "-" : formatRate(item.changeRate);

    const identity = document.createElement("span");
    identity.className = "ranking-identity";
    identity.append(name, code);
    link.append(rank, identity, price, rate);
    target.appendChild(link);
  });
}

function bindSearch() {
  const input = document.getElementById("stockSearch");
  const status = document.getElementById("searchStatus");
  if (!input) return;
  input.addEventListener("input", function () {
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) {
      status.textContent = "시장 데이터에서 종목을 검색할 수 있습니다.";
      renderSearchResults([]);
      return;
    }

    const matches = (marketCache.length ? marketCache : rankingCache).filter(function (item) {
      const name = String(item.name || "").toLowerCase();
      const sector = String(item.sector || "").toLowerCase();
      return name.includes(keyword) || sector.includes(keyword) || String(item.code || "").includes(keyword) || getKoreanInitials(name).includes(keyword);
    });

    if (matches.length) {
      status.textContent = matches.length + "개 종목이 검색되었습니다.";
      renderSearchResults(matches.slice(0, 8));
      return;
    }

    status.textContent = "검색 결과가 없습니다. 다른 종목 명칭을 입력해 보세요.";
    renderSearchResults([]);
  });
}

function getKoreanInitials(value) {
  const initials = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  return String(value).split("").map(function (char) {
    const code = char.charCodeAt(0) - 44032;
    return code >= 0 && code <= 11171 ? initials[Math.floor(code / 588)] : char;
  }).join("");
}

function renderSearchResults(items) {
  const target = document.getElementById("searchResults");
  if (!target) return;
  target.innerHTML = "";
  items.forEach(function (item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-item";
    button.innerHTML = "<span><strong>" + item.name + "</strong><small>" + (item.code || "") + " · " + (item.sector || "시장") + "</small></span><b class=\"" + getChangeClass(item.changeRate) + "\">" + formatRate(item.changeRate) + "</b>";
    button.addEventListener("click", function () {
      setSelectedStock(item);
      const input = document.getElementById("stockSearch");
      if (input) input.value = item.name;
      target.innerHTML = "";
    });
    target.appendChild(button);
  });
}

function setSelectedStock(item) {
  if (!item) return;

  selectedStock = {
    ...item,
    open: Number(item.price || 0) * (1 - (Number(item.changeRate || 0) / 100 || 0.015)),
    high: Number(item.price || 0) * (1 + Math.abs(Number(item.changeRate || 0)) / 120),
    low: Number(item.price || 0) * (1 - Math.abs(Number(item.changeRate || 0)) / 120),
    volume: Number(item.volume || 0),
    tradingValue: Number(item.tradingValue || 0),
    updatedAt: item.updatedAt || new Date().toISOString().slice(0, 10),
  };

  const nameElement = document.getElementById("detailStockName");
  const codeElement = document.getElementById("detailStockCode");
  const priceElement = document.getElementById("detailPrice");
  const rateElement = document.getElementById("detailRate");
  const stockPriceInput = document.getElementById("tradePrice");
  const detail1D = document.getElementById("detail1D");
  const detail1W = document.getElementById("detail1W");
  const detail1M = document.getElementById("detail1M");

  if (nameElement) nameElement.textContent = selectedStock.name;
  if (codeElement) codeElement.textContent = selectedStock.code;
  const sectorElement = document.getElementById("detailSector");
  if (sectorElement) sectorElement.textContent = selectedStock.sector || "시장 분류 확인 중";
  if (priceElement) priceElement.textContent = formatPrice(selectedStock.price) + "원";
  if (stockPriceInput) stockPriceInput.value = formatPrice(selectedStock.price);
  if (rateElement) {
    rateElement.textContent = formatRate(selectedStock.changeRate);
    rateElement.className = "stock-detail-rate" + (selectedStock.changeRate >= 0 ? "" : " down");
  }

  if (detail1D) detail1D.textContent = formatRate(selectedStock.changeRate);
  if (detail1W) detail1W.textContent = formatRate((selectedStock.changeRate || 0) * 4.1);
  if (detail1M) detail1M.textContent = formatRate((selectedStock.changeRate || 0) * 8.7);

  const detailLink = document.getElementById("detailLink");
  if (detailLink) detailLink.href = "./stock.html?code=" + encodeURIComponent(selectedStock.code);

  renderSparkline(selectedStock, "detailChart", Number(selectedStock.changeRate || 0) >= 0);
  renderPortfolioState();
  setTradeStatus("종목이 선택되었습니다. 매수/매도 수량을 입력하세요.");
}

function bindTradeControls() {
  const buyBtn = document.getElementById("buyBtn");
  const sellBtn = document.getElementById("sellBtn");

  if (buyBtn) buyBtn.addEventListener("click", function () { executeTrade("buy"); });
  if (sellBtn) sellBtn.addEventListener("click", function () { executeTrade("sell"); });
}

function renderPortfolioState() {
  const balanceEl = document.getElementById("cashBalance");
  const portfolioList = document.getElementById("portfolioList");
  const portfolioValueEl = document.getElementById("portfolioValue");
  const portfolioSummaryEl = document.getElementById("portfolioSummary");
  const state = portfolioCache;

  if (!currentUser || !state) {
    if (balanceEl) balanceEl.textContent = currentUser ? "불러오는 중" : "로그인 필요";
    if (portfolioList) portfolioList.innerHTML = '<div class="holding-row"><div><strong>로그인 후 거래 내역을 저장할 수 있습니다.</strong></div></div>';
    if (portfolioValueEl) portfolioValueEl.textContent = "-";
    if (portfolioSummaryEl) portfolioSummaryEl.textContent = "계정 연결 대기";
    return;
  }

  if (balanceEl) balanceEl.textContent = formatWon(state.cash);

  const holdings = Object.values(state.holdings || {});
  let totalMarketValue = 0;
  const rows = holdings.map(function (holding) {
    const price = Number(holding.price || 0);
    const averagePrice = Number(holding.averagePrice || price);
    const value = price * Number(holding.qty || 0);
    const unrealizedProfit = (price - averagePrice) * Number(holding.qty || 0);
    totalMarketValue += value;
    return '<div class="holding-row"><div><strong>' + escapeMarketHtml(holding.name) + '</strong><small>' + holding.qty + '주 · 현재 ' + formatWon(price) + ' · 평균 ' + formatWon(averagePrice) + '</small></div><div><strong>' + formatWon(value) + '</strong><small class="' + (unrealizedProfit >= 0 ? 'profit-positive' : 'profit-negative') + '">평가손익 ' + formatSignedWon(unrealizedProfit) + '</small></div></div>';
  }).join("");

  if (portfolioList) {
    portfolioList.innerHTML = rows || '<div class="holding-row"><div><strong>보유 종목 없음</strong></div></div>';
  }

  const totalAssets = Number(state.cash || 0) + totalMarketValue;
  const invested = Object.values(state.holdings || {}).reduce(function (sum, holding) {
    return sum + Number(holding.averagePrice || holding.price || 0) * Number(holding.qty || 0);
  }, 0);
  const estimatedProfit = totalMarketValue - invested;
  const profitTodayEl = document.getElementById("profitToday");
  const lossTodayEl = document.getElementById("lossToday");
  if (profitTodayEl) profitTodayEl.textContent = formatWon(Math.max(estimatedProfit, 0));
  if (lossTodayEl) lossTodayEl.textContent = formatWon(Math.abs(Math.min(estimatedProfit, 0)));
  if (portfolioValueEl) portfolioValueEl.textContent = formatWon(totalAssets);
  if (portfolioSummaryEl) portfolioSummaryEl.textContent = holdings.length ? holdings.length + "개 종목 보유" : "보유 종목 없음";
}

async function executeTrade(mode) {
  if (!currentUser) {
    setTradeStatus("거래 기록을 Supabase 계정에 저장하려면 먼저 로그인해 주세요.");
    return;
  }
  if (!selectedStock) {
    setTradeStatus("먼저 종목을 선택해 주세요.");
    return;
  }

  const qty = Number(document.getElementById("tradeQty")?.value || 0);
  const price = Number(selectedStock.price || 0);
  if (!qty || qty <= 0) {
    setTradeStatus("수량을 1 이상 입력해 주세요.");
    return;
  }

  setTradeStatus("Supabase에 거래를 저장하는 중...");
  let result;
  try {
    result = await db.rpc("stock_arena_execute_trade", {
      p_mode: mode,
      p_stock_code: String(selectedStock.code),
      p_stock_name: selectedStock.name,
      p_quantity: qty,
      p_price: price,
    });
  } catch (error) {
    console.error("거래 저장 요청을 완료하지 못했습니다:", error);
    setTradeStatus("Supabase 연결 실패: 인터넷 연결과 Supabase 프로젝트 상태를 확인하세요.");
    return;
  }
  const { data, error } = result;
  if (error) {
    console.error("거래 저장 실패:", error);
    setTradeStatus(formatSupabaseTradeError(error));
    return;
  }
  portfolioVersion += 1;
  portfolioCache = data;
  syncPortfolioPrices(marketCache);
  renderPortfolioState();
  setTradeStatus(selectedStock.name + " " + qty + "주 " + (mode === "buy" ? "매수" : "매도") + " 완료 · 계정에 저장됨");
}

function formatSupabaseTradeError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  if (message.includes("INSUFFICIENT_CASH")) return "현금이 부족합니다. 매수 수량을 줄여 주세요.";
  if (message.includes("INSUFFICIENT_SHARES")) return "보유 수량이 부족해 매도할 수 없습니다.";
  if (message.includes("AUTH_REQUIRED") || code === "PGRST301") return "로그인 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.";
  if (code === "PGRST202" || message.includes("stock_arena_execute_trade") || message.includes("stock_arena_get_portfolio")) {
    return "거래 RPC가 없습니다. Supabase SQL Editor에서 supabase/stock-arena-trading.sql 전체를 실행하고 1분 후 새로고침하세요.";
  }
  if (code === "42501" || message.toLowerCase().includes("permission denied")) {
    return "Supabase 권한 오류입니다. SQL 파일의 RLS 정책 및 authenticated 실행 권한이 적용됐는지 확인하세요.";
  }
  if (code === "42P01" || code === "42703") {
    return "Supabase 테이블/열이 없습니다. 최신 supabase/stock-arena-trading.sql 전체를 SQL Editor에서 다시 실행하세요.";
  }
  return "거래 저장 실패 [" + (code || "오류") + "]: " + (message || "Supabase SQL 및 연결을 확인하세요.");
}

function setTradeStatus(message) {
  const element = document.getElementById("tradeStatus");
  if (element) element.textContent = message;
}

function formatPrice(value) {
  return Number(value).toLocaleString("ko-KR");
}

function formatWon(value) {
  return "₩" + Number(value).toLocaleString("ko-KR");
}

function formatSignedWon(value) {
  const amount = Number(value);
  return (amount >= 0 ? "+" : "−") + "₩" + Math.abs(amount).toLocaleString("ko-KR");
}

function escapeMarketHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatVolume(value) {
  return value == null ? "-" : Number(value).toLocaleString("ko-KR");
}

function formatTradingValue(value) {
  return value == null ? "-" : Number(value).toLocaleString("ko-KR");
}

function formatRate(value) {
  const number = Number(value);
  return (number >= 0 ? "+" : "") + number.toFixed(2) + "%";
}

function getChangeClass(rate) {
  if (rate > 0) return "change-up";
  if (rate < 0) return "change-down";
  return "change-flat";
}

function showLoading(targetId) {
  const target = document.getElementById(targetId);
  if (target) {
    target.className = "ranking-state is-loading";
    target.textContent = "공공데이터를 불러오는 중";
  }
}

function showEmpty(targetId, message) {
  const target = document.getElementById(targetId);
  if (target) {
    target.className = "ranking-state is-empty";
    target.textContent = message;
  }
}

function showError(targetId, message) {
  const target = document.getElementById(targetId);
  if (target) {
    target.className = "ranking-state is-error";
    target.textContent = message;
  }
}
