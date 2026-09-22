const RANKING_TARGETS = {
  rise: "riseRanking",
  fall: "fallRanking",
  volume: "volumeRanking",
  value: "valueRanking",
};

const PORTFOLIO_STORAGE_KEY = "stock_arena_portfolio_v1";
const TRADE_HISTORY_STORAGE_KEY = "stock_arena_trade_history_v1";

const PUBLIC_MARKET_ITEMS = [
  { code: "005930", name: "삼성전자", sector: "디스플레이", price: 73200, change: 1500, changeRate: 2.09, volume: 15400000, tradingValue: 1124000000000, tradeDate: "20260621" },
  { code: "000660", name: "SK하이닉스", sector: "디스플레이", price: 194500, change: -3200, changeRate: -1.62, volume: 8400000, tradingValue: 1630000000000, tradeDate: "20260621" },
  { code: "035420", name: "NAVER", sector: "출판·플랫폼", price: 251500, change: 4800, changeRate: 1.95, volume: 2700000, tradingValue: 678000000000, tradeDate: "20260621" },
  { code: "051910", name: "LG화학", sector: "화학", price: 578000, change: 9300, changeRate: 1.64, volume: 750000, tradingValue: 432000000000, tradeDate: "20260621" },
  { code: "207940", name: "삼성바이오로직스", sector: "생명과학", price: 795000, change: -11000, changeRate: -1.36, volume: 620000, tradingValue: 492000000000, tradeDate: "20260621" },
  { code: "068270", name: "셀트리온", sector: "생명과학", price: 176500, change: 2300, changeRate: 1.32, volume: 4600000, tradingValue: 812000000000, tradeDate: "20260621" },
  { code: "035720", name: "카카오", sector: "게임·콘텐츠", price: 56800, change: 1200, changeRate: 2.16, volume: 13200000, tradingValue: 749000000000, tradeDate: "20260621" },
  { code: "012330", name: "현대모비스", sector: "자동차", price: 255500, change: 3400, changeRate: 1.35, volume: 2500000, tradingValue: 639000000000, tradeDate: "20260621" },
  { code: "033780", name: "KT&G", sector: "소비재", price: 102800, change: -1200, changeRate: -1.15, volume: 3900000, tradingValue: 401000000000, tradeDate: "20260621" },
  { code: "090430", name: "아모레퍼시픽", sector: "소비재", price: 171200, change: 2600, changeRate: 1.54, volume: 2400000, tradingValue: 410000000000, tradeDate: "20260621" },
  { code: "066570", name: "LG전자", sector: "전자·가전", price: 120500, change: -900, changeRate: -0.74, volume: 5400000, tradingValue: 651000000000, tradeDate: "20260621" },
  { code: "055550", name: "신한지주", sector: "금융", price: 45200, change: 580, changeRate: 1.30, volume: 8100000, tradingValue: 366000000000, tradeDate: "20260621" },
];

let rankingCache = [];
let marketCache = [];
let selectedStock = null;

function getPortfolioState() {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) {
      return { cash: 10000000, holdings: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      cash: Number(parsed.cash || 10000000),
      holdings: parsed.holdings || {},
    };
  } catch (error) {
    return { cash: 10000000, holdings: {} };
  }
}

function savePortfolioState(state) {
  localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(state));
}

function saveTradeHistory(mode, stock, qty, total) {
  let history = [];
  try { history = JSON.parse(localStorage.getItem(TRADE_HISTORY_STORAGE_KEY) || "[]"); } catch (error) { history = []; }
  history.push({ mode, code: stock.code, name: stock.name, qty, total, createdAt: new Date().toISOString() });
  localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-200)));
}

function onAuthReady() {
  loadMarketSummary();
  loadAllRankings();
  bindSearch();
  bindTradeControls();
  renderPortfolioState();
}

function getPublicApiKey() {
  return (window.PUBLIC_DATA_GO_KR_API_KEY || "").trim();
}

function buildIndexRequestUrl(endpoint, params) {
  const apiKey = getPublicApiKey();
  if (!apiKey) {
    throw new Error("PUBLIC_DATA_GO_KR_API_KEY missing");
  }

  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    serviceKey: apiKey,
    resultType: "json",
    pageNo: "1",
    numOfRows: "5",
    ...params,
  }).toString();
  return url.toString();
}

async function loadPublicIndexSummary() {
  const endpoint = window.PUBLIC_DATA_GO_KR_INDEX_URL || "https://apis.data.go.kr/1160100/service/GetIndexInfoService/getIndexInfo";
  const indexNames = ["KOSPI", "KOSDAQ"];

  const results = await Promise.all(indexNames.map(async function (label) {
    const response = await fetch(buildIndexRequestUrl(endpoint, { IDX_NM: label }), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(label + " index fetch failed: " + response.status);
    }

    const payload = await response.json();
    const items = payload?.response?.body?.items?.item || payload?.response?.body?.item || [];
    const item = Array.isArray(items) ? items[0] : items;
    if (!item) {
      return null;
    }

    const value = Number(item.clpr ?? item.close ?? item.idxClpr ?? 0);
    const changeRate = Number(item.fltRt ?? item.changeRate ?? 0);

    return {
      label,
      value: Number.isFinite(value) ? value : 0,
      changeRate: Number.isFinite(changeRate) ? changeRate : 0,
      updatedAt: item.basDt || new Date().toISOString().slice(0, 10),
      name: item.idxNm || label,
    };
  }));

  const map = {};
  results.forEach(function (entry) {
    if (!entry) return;
    map[entry.label] = entry;
  });

  return map;
}

function normalizePublicMarketItem(item) {
  const code = item.code || item.isinCd || item.shtCd || item.stkCd || item.stockCode || "";
  const name = item.name || item.itmsNm || item.stockName || item.stockNm || "종목명";
  const price = Number(item.price ?? item.clpr ?? item.close ?? item.lastPrice ?? 0);
  const change = Number(item.change ?? item.vs ?? 0);
  const changeRate = Number(item.changeRate ?? item.fltRt ?? item.prdy_ctrt ?? 0);
  const volume = Number(item.volume ?? item.acmlVol ?? item.trqu ?? 0);
  const tradingValue = Number(item.tradingValue ?? item.acmlTrPbmn ?? item.dealAmt ?? 0);
  const tradeDate = item.tradeDate || item.basDt || item.date || "20260621";

  return {
    code: String(code),
    name: String(name),
    sector: String(item.sector || item.category || "시장"),
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changeRate: Number.isFinite(changeRate) ? changeRate : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    tradingValue: Number.isFinite(tradingValue) ? tradingValue : 0,
    tradeDate,
    updatedAt: tradeDate,
  };
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

  const apiKey = getPublicApiKey();
  if (apiKey) {
    try {
      const url = new URL("https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo");
      url.search = new URLSearchParams({
        serviceKey: apiKey,
        resultType: "json",
        pageNo: "1",
        numOfRows: "100",
      }).toString();

      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("public-data-status-" + response.status);
      const payload = await response.json();
      const items = payload?.response?.body?.items?.item || payload?.response?.body?.item || [];
      const normalized = (Array.isArray(items) ? items : [items]).map(normalizePublicMarketItem).filter(function (item) {
        return item.code && item.name;
      });
      if (normalized.length) {
        marketCache = normalized;
        return marketCache;
      }
    } catch (error) {
      console.warn("공공데이터포털 연결에 실패해 로컬 샘플 데이터를 사용합니다.", error);
    }
  }

  marketCache = PUBLIC_MARKET_ITEMS.map(function (item) {
    return {
      ...item,
      updatedAt: item.tradeDate,
    };
  });
  return marketCache;
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
      showError(RANKING_TARGETS[Object.keys(RANKING_TARGETS)[index]], "공공데이터 기반 시장 정보를 확인하지 못했습니다.");
    }
  });

  const items = await loadPublicMarketData();
  if (items.length && !selectedStock) {
    setSelectedStock(items[0]);
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
    showError(targetId, "공공데이터 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
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
  const state = getPortfolioState();

  if (balanceEl) balanceEl.textContent = formatWon(state.cash);

  const holdings = Object.values(state.holdings || {});
  let totalMarketValue = 0;
  const rows = holdings.map(function (holding) {
    const price = Number(holding.price || 0);
    const value = price * Number(holding.qty || 0);
    totalMarketValue += value;
    return '<div class="holding-row"><div><strong>' + holding.name + '</strong><small>' + holding.qty + '주</small></div><div><strong>' + formatWon(value) + '</strong></div></div>';
  }).join("");

  if (portfolioList) {
    portfolioList.innerHTML = rows || '<div class="holding-row"><div><strong>보유 종목 없음</strong></div></div>';
  }

  const totalAssets = state.cash + totalMarketValue;
  const invested = Object.values(state.holdings || {}).reduce(function (sum, holding) {
    return sum + Number(holding.price || 0) * Number(holding.qty || 0);
  }, 0);
  const estimatedProfit = totalMarketValue - invested;
  const profitTodayEl = document.getElementById("profitToday");
  const lossTodayEl = document.getElementById("lossToday");
  if (profitTodayEl) profitTodayEl.textContent = formatWon(Math.max(estimatedProfit, 0));
  if (lossTodayEl) lossTodayEl.textContent = formatWon(Math.abs(Math.min(estimatedProfit, 0)));
  if (portfolioValueEl) portfolioValueEl.textContent = formatWon(totalAssets);
  if (portfolioSummaryEl) portfolioSummaryEl.textContent = holdings.length ? holdings.length + "개 종목 보유" : "보유 종목 없음";
}

function executeTrade(mode) {
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

  const state = getPortfolioState();

  if (mode === "buy") {
    const total = qty * price;
    if (state.cash < total) {
      setTradeStatus("현금이 부족합니다. 수량을 줄여 보세요.");
      return;
    }
    const current = state.holdings[selectedStock.code] || { code: selectedStock.code, name: selectedStock.name, qty: 0, price: 0 };
    current.qty += qty;
    current.price = price;
    state.holdings[selectedStock.code] = current;
    state.cash -= total;
    saveTradeHistory(mode, selectedStock, qty, total);
    savePortfolioState(state);
    renderPortfolioState();
    setTradeStatus(selectedStock.name + "을(를) " + qty + "주 매수했습니다.");
    return;
  }

  const current = state.holdings[selectedStock.code];
  if (!current || current.qty < qty) {
    setTradeStatus("보유 수량이 부족합니다.");
    return;
  }
  current.qty -= qty;
  state.cash += qty * price;
  saveTradeHistory(mode, selectedStock, qty, qty * price);

  if (current.qty <= 0) {
    delete state.holdings[selectedStock.code];
  } else {
    state.holdings[selectedStock.code] = current;
  }

  savePortfolioState(state);
  renderPortfolioState();
  setTradeStatus(selectedStock.name + "을(를) " + qty + "주 매도했습니다.");
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
