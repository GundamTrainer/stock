let currentStock = null;
let activePeriod = "1d";
let activeAssetType = "stocks";

function onAuthReady() {
  // Public stock detail data is loaded independently of login state.
}

function getStockCodeFromQuery() {
  return new URLSearchParams(window.location.search).get("code") || "005930";
}

async function loadStockDetails() {
  const code = getStockCodeFromQuery();
  try {
    const response = await fetch("/api/stock-price?code=" + encodeURIComponent(code) + "&asset=" + encodeURIComponent(activeAssetType));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "시세 API 요청 실패");
    currentStock = payload;
  } catch (error) {
    currentStock = null;
    const message = document.getElementById("stockChartMessage");
    if (message) message.textContent = error.message || "시세를 불러오지 못했습니다.";
  }
  if (currentStock) {
    renderStockHeader(currentStock);
    renderPriceDetail(currentStock);
  } else {
    const message = document.getElementById("stockChartMessage");
    if (message && !message.textContent) message.textContent = "선택한 V2 데이터 유형에서 이 종목을 찾지 못했습니다. 유형별 종목 코드로 다시 시도해 주세요.";
  }
  bindPeriodButtons();
  bindAssetTypePicker();
  loadStockHistory(activePeriod);
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
