const CATALOG_SECTORS = ["전체", "화학", "생명과학", "디스플레이", "출판·플랫폼", "게임·콘텐츠", "자동차", "소비재", "전자·가전", "금융"];

function onAuthReady() {
  loadPublicMarketData().then(function (items) {
    const params = new URLSearchParams(location.search);
    renderCatalogTabs(params.get("sector") || "전체");
    bindCatalogSearch(items);
    renderCatalog(items, params.get("sector") || "전체", "");
  });
}

function renderCatalogTabs(activeSector) {
  const tabs = document.getElementById("catalogTabs");
  if (!tabs) return;
  tabs.innerHTML = CATALOG_SECTORS.map(function (sector) {
    return '<button type="button" class="sector-tab ' + (sector === activeSector ? "active" : "") + '" data-sector="' + sector + '">' + sector + '</button>';
  }).join("");
  tabs.querySelectorAll("button").forEach(function (button) {
    button.addEventListener("click", function () {
      tabs.querySelectorAll("button").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      renderCatalog(marketCache, button.dataset.sector, document.getElementById("catalogSearch").value);
    });
  });
}

function bindCatalogSearch(items) {
  const input = document.getElementById("catalogSearch");
  if (!input) return;
  input.addEventListener("input", function () {
    const active = document.querySelector("#catalogTabs .active");
    renderCatalog(items, active ? active.dataset.sector : "전체", input.value);
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
