const STOCK_SAMPLE_DATA = [
  { code: "005930", name: "삼성전자", price: 73200, change: 1500, changeRate: 2.09, open: 71300, high: 73500, low: 70900, volume: 15400000, tradingValue: 1124000000000, updatedAt: "2026-06-21" },
  { code: "000660", name: "SK하이닉스", price: 194500, change: -3200, changeRate: -1.62, open: 198800, high: 199900, low: 193600, volume: 8400000, tradingValue: 1630000000000, updatedAt: "2026-06-21" },
  { code: "035420", name: "NAVER", price: 251500, change: 4800, changeRate: 1.95, open: 246500, high: 253000, low: 245900, volume: 2700000, tradingValue: 678000000000, updatedAt: "2026-06-21" },
  { code: "051910", name: "LG화학", price: 578000, change: 9300, changeRate: 1.64, open: 569100, high: 581200, low: 566800, volume: 750000, tradingValue: 432000000000, updatedAt: "2026-06-21" },
  { code: "035720", name: "카카오", price: 56800, change: 1200, changeRate: 2.16, open: 55500, high: 57000, low: 55200, volume: 13200000, tradingValue: 749000000000, updatedAt: "2026-06-21" },
];

let currentStock = null;
let activePeriod = "1d";
let activeAssetType = "stocks";

function onAuthReady() {
  // Public stock detail data is loaded independently of login state.
}

function getStockCodeFromQuery() {
  return new URLSearchParams(window.location.search).get("code") || "005930";
}

function getPublicStockFallback(code) {
  return STOCK_SAMPLE_DATA.find(function (item) { return String(item.code) === String(code); }) || STOCK_SAMPLE_DATA[0];
}

async function loadStockDetails() {
  const code = getStockCodeFromQuery();
  try {
    const response = await fetch("/api/stock-price?code=" + encodeURIComponent(code) + "&asset=" + encodeURIComponent(activeAssetType));
    if (!response.ok) throw new Error("quote api unavailable");
    currentStock = await response.json();
  } catch (error) {
    currentStock = activeAssetType === "stocks" ? await loadBrowserQuote(code) || getPublicStockFallback(code) : null;
  }
  if (currentStock) {
    renderStockHeader(currentStock);
    renderPriceDetail(currentStock);
  } else {
    const message = document.getElementById("stockChartMessage");
    if (message) message.textContent = "선택한 V2 데이터 유형에서 이 종목을 찾지 못했습니다. 유형별 종목 코드로 다시 시도해 주세요.";
  }
  bindPeriodButtons();
  bindAssetTypePicker();
  loadStockHistory(activePeriod);
}

async function loadBrowserQuote(code) {
  const apiKey = (window.PUBLIC_DATA_GO_KR_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    const url = new URL("https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo");
    url.search = new URLSearchParams({ serviceKey: apiKey, resultType: "json", pageNo: "1", numOfRows: "10", ISU_CD: code }).toString();
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    const raw = payload?.response?.body?.items?.item || payload?.response?.body?.item || [];
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    return {
      code: item.shtCd || item.stkCd || item.isinCd || code,
      name: item.itmsNm || item.stockName || "종목",
      price: Number(item.clpr || item.close || item.price || 0),
      change: Number(item.vs || item.change || 0),
      changeRate: Number(item.fltRt || item.changeRate || 0),
      open: Number(item.mkp || item.open || 0),
      high: Number(item.hipr || item.high || 0),
      low: Number(item.lopr || item.low || 0),
      volume: Number(item.acmlVol || item.volume || 0),
      tradingValue: Number(item.acmlTrPbmn || item.tradingValue || 0),
      updatedAt: item.basDt || new Date().toLocaleDateString("ko-KR"),
    };
  } catch (error) {
    return null;
  }
}

function renderStockHeader(stock) {
  const title = document.getElementById("stockTitle");
  const price = document.getElementById("stockCurrentPrice");
  const rate = document.getElementById("stockChangeRate");
  const updated = document.getElementById("stockUpdatedAt");
  if (title) title.textContent = stock.name || "종목 정보";
  if (price) price.textContent = formatStockNumber(stock.price) + "원";
  if (rate) {
    const value = Number(stock.changeRate || 0);
    rate.textContent = (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
    rate.className = "change-tag " + (value > 0 ? "up" : value < 0 ? "down" : "flat");
  }
  if (updated) updated.textContent = (stock.isRealtime === false ? "거래일 종가 · " : "기준 · ") + (stock.updatedAt || stock.tradeDate || "기준 시각 확인 필요");
}

function renderPriceDetail(stock) {
  [
    ["open", stock.open], ["high", stock.high], ["low", stock.low], ["price", stock.price],
    ["volume", stock.volume], ["tradingValue", stock.tradingValue],
  ].forEach(function (entry) {
    const element = document.getElementById("detail-" + entry[0]);
    if (element) element.textContent = entry[1] == null ? "-" : formatStockNumber(entry[1]);
  });
}

function bindPeriodButtons() {
  document.querySelectorAll(".stock-range-tabs button").forEach(function (button) {
    button.addEventListener("click", function () {
      activePeriod = button.dataset.period;
      document.querySelectorAll(".stock-range-tabs button").forEach(function (item) {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      loadStockHistory(activePeriod);
    });
  });
}

function bindAssetTypePicker() {
  const picker = document.getElementById("stockAssetType");
  if (!picker || picker.dataset.bound) return;
  picker.dataset.bound = "true";
  picker.addEventListener("change", function () {
    activeAssetType = picker.value;
    loadStockDetails();
  });
}

async function loadStockHistory(period) {
  const code = getStockCodeFromQuery();
  const message = document.getElementById("stockChartMessage");
  if (message) message.textContent = "거래일 가격 이력을 불러오는 중입니다…";
  const svg = document.getElementById("stockHistoryChart");
  if (svg) svg.innerHTML = "";
  try {
    const response = await fetch("/api/stock-history?code=" + encodeURIComponent(code) + "&period=" + encodeURIComponent(period) + "&asset=" + encodeURIComponent(activeAssetType));
    if (!response.ok) throw new Error("history endpoint unavailable");
    const payload = await response.json();
    renderStockHistory(payload.items || [], period);
  } catch (error) {
    if (message) message.textContent = "가격 이력을 불러오지 못했습니다. Vercel API와 DATA_GO_KR_API_KEY 설정을 확인해 주세요. 임의의 그래프는 표시하지 않습니다.";
    const range = document.getElementById("chartDateRange");
    const change = document.getElementById("stockRangeChange");
    if (range) range.textContent = "이력 데이터 없음";
    if (change) change.textContent = "—";
  }
}

function renderStockHistory(items, period) {
  const svg = document.getElementById("stockHistoryChart");
  const message = document.getElementById("stockChartMessage");
  const dateLabel = document.getElementById("chartDateRange");
  const latestLabel = document.getElementById("chartLastPrice");
  const changeLabel = document.getElementById("stockRangeChange");
  if (!svg || !items.length) {
    if (message) message.textContent = "선택한 기간의 거래일 이력이 없습니다.";
    return;
  }
  const days = items.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  let points;
  if (period === "1d") {
    const daily = days[days.length - 1];
    points = [{ date: daily.date, label: "시가", close: Number(daily.open || daily.close) }, { date: daily.date, label: "종가", close: Number(daily.close || daily.open) }];
  } else {
    points = days.map(function (day) { return { date: day.date, label: day.date, close: Number(day.close || 0) }; }).filter(function (point) { return point.close > 0; });
  }
  if (!points.length) {
    if (message) message.textContent = "차트에 표시할 종가 데이터가 없습니다.";
    return;
  }
  const values = points.map(function (point) { return point.close; });
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const padding = Math.max((max - min) * 0.15, max * 0.003, 1);
  const low = min - padding;
  const high = max + padding;
  const chartW = 900;
  const chartH = 280;
  const chartTop = 12;
  const pointsXY = points.map(function (point, index) {
    return { x: 18 + (index / Math.max(points.length - 1, 1)) * (chartW - 36), y: chartTop + (1 - ((point.close - low) / (high - low))) * chartH, point: point };
  });
  const path = pointsXY.map(function (point, index) { return (index ? "L" : "M") + point.x.toFixed(2) + " " + point.y.toFixed(2); }).join(" ");
  const area = path + " L " + pointsXY[pointsXY.length - 1].x + " " + (chartTop + chartH) + " L " + pointsXY[0].x + " " + (chartTop + chartH) + " Z";
  const first = values[0];
  const last = values[values.length - 1];
  const change = first ? ((last - first) / first) * 100 : 0;
  const color = change >= 0 ? "#19bd8b" : "#ec6374";
  const grid = [0, 1, 2, 3].map(function (index) { const y = chartTop + (chartH / 3) * index; return '<line x1="18" y1="' + y + '" x2="882" y2="' + y + '" class="stock-chart-gridline"/>'; }).join("");
  const dates = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];
  const labels = dates.map(function (point, index) { return '<text x="' + [18, 450, 882][index] + '" y="314" text-anchor="' + ["start", "middle", "end"][index] + '" class="stock-chart-label">' + formatStockDate(point.date, point.label) + '</text>'; }).join("");
  svg.innerHTML = '<defs><linearGradient id="historyFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' + grid + '<path d="' + area + '" fill="url(#historyFill)"/><path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' + pointsXY.map(function (point) { return '<circle cx="' + point.x + '" cy="' + point.y + '" r="2.8" fill="' + color + '"><title>' + formatStockDate(point.point.date, point.point.label) + ' ' + formatStockNumber(point.point.close) + '원</title></circle>'; }).join("") + labels;
  if (message) message.hidden = true;
  if (dateLabel) dateLabel.textContent = formatStockDate(points[0].date, "") + " — " + formatStockDate(points[points.length - 1].date, "") + " · " + points.length + "개 관측값";
  if (latestLabel) latestLabel.textContent = formatStockNumber(last) + "원";
  if (changeLabel) {
    changeLabel.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    changeLabel.className = change >= 0 ? "up" : "down";
  }
}

function formatStockNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatStockDate(value, fallback) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  if (digits.length >= 8) return digits.slice(0, 4) + "." + digits.slice(4, 6) + "." + digits.slice(6, 8);
  return String(fallback || value || "");
}

window.addEventListener("DOMContentLoaded", loadStockDetails);
