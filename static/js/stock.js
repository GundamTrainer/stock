const STOCK_SAMPLE_DATA = [
  { code: "005930", name: "삼성전자", price: 73200, change: 1500, changeRate: 2.09, open: 71300, high: 73500, low: 70900, volume: 15400000, tradingValue: 1124000000000, updatedAt: "2026-06-21 15:30" },
  { code: "000660", name: "SK하이닉스", price: 194500, change: -3200, changeRate: -1.62, open: 198800, high: 199900, low: 193600, volume: 8400000, tradingValue: 1630000000000, updatedAt: "2026-06-21 15:30" },
  { code: "035420", name: "NAVER", price: 251500, change: 4800, changeRate: 1.95, open: 246500, high: 253000, low: 245900, volume: 2700000, tradingValue: 678000000000, updatedAt: "2026-06-21 15:30" },
  { code: "051910", name: "LG화학", price: 578000, change: 9300, changeRate: 1.64, open: 569100, high: 581200, low: 566800, volume: 750000, tradingValue: 432000000000, updatedAt: "2026-06-21 15:30" },
  { code: "035720", name: "카카오", price: 56800, change: 1200, changeRate: 2.16, open: 55500, high: 57000, low: 55200, volume: 13200000, tradingValue: 749000000000, updatedAt: "2026-06-21 15:30" },
];

function getStockCodeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code") || "005930";
}

function getPublicStockFallback(code) {
  return STOCK_SAMPLE_DATA.find(function (item) {
    return String(item.code) === String(code);
  }) || STOCK_SAMPLE_DATA[0];
}

function buildSparkline(values, isPositive) {
  const width = 320;
  const height = 110;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map(function (value, index) {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 10) - 4;
    return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
  }).join(" ");
}

function renderStockChart(stock) {
  const svg = document.getElementById("detailChart");
  if (!svg) return;

  const base = Number(stock.price || 0);
  const values = [];
  for (let i = 0; i < 24; i += 1) {
    const wave = Math.sin(i / 2.3) * base * 0.02;
    const slope = (i - 11) * base * 0.0009;
    values.push(Math.round(base + wave + slope + (Math.random() - 0.5) * base * 0.008));
  }

  svg.innerHTML = '<path d="' + buildSparkline(values, Number(stock.changeRate || 0) >= 0) + '" fill="none" stroke="' + (Number(stock.changeRate || 0) >= 0 ? '#1dd08f' : '#ff5d73') + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>';
}

async function loadStockDetails() {
  const code = getStockCodeFromQuery();
  try {
    const apiKey = (window.PUBLIC_DATA_GO_KR_API_KEY || "").trim();
    if (apiKey) {
      const url = new URL("https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo");
      url.search = new URLSearchParams({
        serviceKey: apiKey,
        resultType: "json",
        pageNo: "1",
        numOfRows: "10",
        ISU_CD: code,
      }).toString();

      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (response.ok) {
        const payload = await response.json();
        const items = payload?.response?.body?.items?.item || payload?.response?.body?.item || [];
        const item = Array.isArray(items) ? items[0] : items;
        if (item) {
          const stock = {
            code: item.isinCd || item.shtCd || code,
            name: item.itmsNm || item.stockName || "종목",
            price: Number(item.clpr || item.close || item.price || 0),
            change: Number(item.vs || item.change || 0),
            changeRate: Number(item.fltRt || item.changeRate || 0),
            open: Number(item.mkp || item.open || 0),
            high: Number(item.hipr || item.high || 0),
            low: Number(item.lopr || item.low || 0),
            volume: Number(item.acmlVol || item.volume || 0),
            tradingValue: Number(item.acmlTrPbmn || item.tradingValue || 0),
            updatedAt: item.basDt || new Date().toLocaleString("ko-KR"),
          };
          renderStockHeader(stock);
          renderPriceDetail(stock);
          return;
        }
      }
    }

    const fallback = getPublicStockFallback(code);
    renderStockHeader(fallback);
    renderPriceDetail(fallback);
  } catch (error) {
    console.error("종목 상세를 불러오지 못했습니다:", error);
    const fallback = getPublicStockFallback(code);
    renderStockHeader(fallback);
    renderPriceDetail(fallback);
  }
}

function renderStockHeader(stock) {
  const title = document.getElementById("stockTitle");
  const price = document.getElementById("stockCurrentPrice");
  const rate = document.getElementById("stockChangeRate");
  const updated = document.getElementById("stockUpdatedAt");

  if (title) title.textContent = stock.name || "종목 정보";
  if (price) price.textContent = stock.price == null ? "-" : Number(stock.price).toLocaleString("ko-KR") + "원";
  if (rate) {
    const value = stock.changeRate == null ? 0 : Number(stock.changeRate);
    rate.textContent = (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
    rate.className = value > 0 ? "up" : value < 0 ? "down" : "flat";
  }
  if (updated) updated.textContent = stock.updatedAt ? "기준: " + stock.updatedAt : "기준 시각 확인 필요";
}

function renderPriceDetail(stock) {
  const fields = [
    ["open", "시가"],
    ["high", "고가"],
    ["low", "저가"],
    ["price", "최근 종가"],
    ["volume", "거래량"],
    ["tradingValue", "거래대금"],
  ];

  fields.forEach(function ([key]) {
    const element = document.getElementById("detail-" + key);
    if (!element) return;
    const value = stock[key];
    element.textContent = value == null ? "-" : Number(value).toLocaleString("ko-KR");
  });

  renderStockChart(stock);
}

window.addEventListener("DOMContentLoaded", function () {
  loadStockDetails();
});
