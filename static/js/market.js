const RANKING_TARGETS = {
  rise: "riseRanking",
  fall: "fallRanking",
  volume: "volumeRanking",
  value: "valueRanking",
};

const PUBLIC_MARKET_ITEMS = [
  { code: "005930", name: "삼성전자", price: 73200, change: 1500, changeRate: 2.09, volume: 15400000, tradingValue: 1124000000000, tradeDate: "20260621" },
  { code: "000660", name: "SK하이닉스", price: 194500, change: -3200, changeRate: -1.62, volume: 8400000, tradingValue: 1630000000000, tradeDate: "20260621" },
  { code: "035420", name: "NAVER", price: 251500, change: 4800, changeRate: 1.95, volume: 2700000, tradingValue: 678000000000, tradeDate: "20260621" },
  { code: "051910", name: "LG화학", price: 578000, change: 9300, changeRate: 1.64, volume: 750000, tradingValue: 432000000000, tradeDate: "20260621" },
  { code: "207940", name: "삼성바이오로직스", price: 795000, change: -11000, changeRate: -1.36, volume: 620000, tradingValue: 492000000000, tradeDate: "20260621" },
  { code: "068270", name: "셀트리온", price: 176500, change: 2300, changeRate: 1.32, volume: 4600000, tradingValue: 812000000000, tradeDate: "20260621" },
  { code: "035720", name: "카카오", price: 56800, change: 1200, changeRate: 2.16, volume: 13200000, tradingValue: 749000000000, tradeDate: "20260621" },
  { code: "012330", name: "현대모비스", price: 255500, change: 3400, changeRate: 1.35, volume: 2500000, tradingValue: 639000000000, tradeDate: "20260621" },
  { code: "033780", name: "KT&G", price: 102800, change: -1200, changeRate: -1.15, volume: 3900000, tradingValue: 401000000000, tradeDate: "20260621" },
  { code: "090430", name: "아모레퍼시픽", price: 171200, change: 2600, changeRate: 1.54, volume: 2400000, tradingValue: 410000000000, tradeDate: "20260621" },
  { code: "066570", name: "LG전자", price: 120500, change: -900, changeRate: -0.74, volume: 5400000, tradingValue: 651000000000, tradeDate: "20260621" },
  { code: "055550", name: "신한지주", price: 45200, change: 580, changeRate: 1.30, volume: 8100000, tradingValue: 366000000000, tradeDate: "20260621" },
];

let rankingCache = [];
let marketCache = [];

function onAuthReady() {
  loadMarketSummary();
  loadAllRankings();
  bindSearch();
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
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changeRate: Number.isFinite(changeRate) ? changeRate : 0,
    volume: Number.isFinite(volume) ? volume : 0,
    tradingValue: Number.isFinite(tradingValue) ? tradingValue : 0,
    tradeDate,
    updatedAt: tradeDate,
  };
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

function buildSummarySnapshot(items) {
  const first = items[0] || {};
  const snapshot = {
    code: first.code || "005930",
    name: first.name || "삼성전자",
    price: Number(first.price || 70000),
    change: Number(first.change || 0),
    changeRate: Number(first.changeRate || 0),
    updatedAt: first.updatedAt || new Date().toISOString().slice(0, 10),
  };
  return snapshot;
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

function renderSummaryError() {
  const status = document.getElementById("marketStatus");
  const updated = document.getElementById("marketUpdated");
  if (status) status.textContent = "시장 데이터 확인 불가";
  if (updated) updated.textContent = "공공데이터 연결 상태를 확인하세요";
  ["kospiChange", "kosdaqChange"].forEach(function (id) {
    const element = document.getElementById(id);
    if (element) element.textContent = "데이터 연결 오류";
  });
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
    const link = document.createElement("a");
    link.className = "ranking-item";
    link.href = "/pages/stock.html?code=" + encodeURIComponent(item.code);

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
      status.textContent = "공공데이터 기반 종목을 검색할 수 있습니다.";
      return;
    }
    const matches = rankingCache.filter(function (item) {
      return String(item.name || "").toLowerCase().includes(keyword) || String(item.code || "").includes(keyword);
    });
    status.textContent = matches.length
      ? matches.length + "개 종목이 시장 데이터에서 검색되었습니다."
      : "검색 결과가 없습니다. 공공데이터 기반 데이터는 표시됩니다.";
  });
}

function formatPrice(value) {
  return Number(value).toLocaleString("ko-KR");
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
