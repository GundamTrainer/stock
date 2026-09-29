const KNOWN_MARKETS = ["KOSPI", "KOSDAQ", "KONEX"];

function onAuthReady() {
  loadPublicMarketData().then(function (items) {
    const params = new URLSearchParams(location.search);
    const requestedMarket = params.get("sector") || "전체";
    const availableMarkets = getAvailableMarkets(items);
    const activeMarket = requestedMarket === "전체" || availableMarkets.includes(requestedMarket) ? requestedMarket : "전체";
    renderCatalogTabs(activeMarket, availableMarkets);
    bindCatalogSearch(items);
    renderCatalog(items, activeMarket, "");
  }).catch(function (error) {
    const grid = document.getElementById("catalogGrid");
    if (grid) grid.innerHTML = '<div class="ranking-state is-error">' + escapeCatalogValue(error.message || "주식 데이터를 불러오지 못했습니다.") + '</div>';
  });
}

function getAvailableMarkets(items) {
  const presentMarkets = new Set(items.map(function (item) { return item.sector; }));
  const known = KNOWN_MARKETS.filter(function (market) { return presentMarkets.has(market); });
  const other = Array.from(presentMarkets).filter(function (market) { return market && !KNOWN_MARKETS.includes(market); }).sort();
  return known.concat(other);
}

function renderCatalogTabs(activeMarket, availableMarkets) {
  const tabs = document.getElementById("catalogTabs");
  if (!tabs) return;
  tabs.innerHTML = ["전체"].concat(availableMarkets).map(function (market) {
    return '<button type="button" class="sector-tab ' + (market === activeMarket ? "active" : "") + '" data-market="' + market + '">' + market + '</button>';
  }).join("");
  tabs.querySelectorAll("button").forEach(function (button) {
    button.addEventListener("click", function () {
      tabs.querySelectorAll("button").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      renderCatalog(marketCache, button.dataset.market, document.getElementById("catalogSearch").value);
    });
  });
}

function bindCatalogSearch(items) {
  const input = document.getElementById("catalogSearch");
  if (!input) return;
  input.addEventListener("input", function () {
    const active = document.querySelector("#catalogTabs .active");
    renderCatalog(items, active ? active.dataset.market : "전체", input.value);
  });
}

function renderCatalog(items, sector, keyword) {
  const grid = document.getElementById("catalogGrid");
  const count = document.getElementById("catalogCount");
  if (!grid) return;
  const normalized = String(keyword || "").trim().toLowerCase();
  const matches = items.filter(function (item) {
    const sectorMatch = sector === "전체" || item.sector === sector;
    const textMatch = !normalized || [item.name, item.code, item.sector].some(function (value) {
      return String(value || "").toLowerCase().includes(normalized);
    });
    return sectorMatch && textMatch;
  });
  if (count) count.textContent = matches.length + "개 종목";
  grid.innerHTML = matches.map(function (item) {
    return '<a class="stock-catalog-card stock-hover" href="./stock.html?code=' + encodeURIComponent(item.code) + '"><div class="stock-card-top"><span class="stock-sector">' + escapeCatalogValue(item.sector || "시장") + '</span><b class="' + getChangeClass(item.changeRate) + '">' + formatRate(item.changeRate) + '</b></div><strong>' + escapeCatalogValue(item.name) + '</strong><small>' + escapeCatalogValue(item.code) + '</small><div class="stock-card-price">' + formatPrice(item.price) + '<span>원</span></div><div class="stock-card-foot"><span>거래량 ' + formatVolume(item.volume) + '</span><span>상세 보기 →</span></div></a>';
  }).join("") || '<div class="ranking-state is-empty">조건에 맞는 종목이 없습니다.</div>';
}

function escapeCatalogValue(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}
