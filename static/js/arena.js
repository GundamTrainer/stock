const ARENA_CONFIG = {
  stockCode: "005930",
  refreshMs: 15000,
  maxHistory: 18,
  bodyWidth: 22,
  bodyPadding: 8,
  characterSpeed: 0.78,
};

const PUBLIC_SAMPLE_STOCK = {
  code: "005930",
  name: "삼성전자",
  price: 73200,
  change: 1500,
  changeRate: 2.09,
  open: 71300,
  high: 73500,
  low: 70900,
  volume: 15400000,
  tradingValue: 1124000000000,
  updatedAt: "2026-06-21 15:30",
};

let arenaState = {
  lastSnapshot: null,
  direction: "flat",
  motionLock: false,
  isRunning: true,
  isError: false,
  lastUpdatedAt: null,
  lastChangeRate: 0,
};

function onAuthReady() {
  initArenaPage();
}

async function fetchPublicMarketSnapshot(code) {
  const apiKey = (window.PUBLIC_DATA_GO_KR_API_KEY || "").trim();

  if (apiKey) {
    try {
      const url = new URL("https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo");
      url.search = new URLSearchParams({
        serviceKey: apiKey,
        resultType: "json",
        pageNo: "1",
        numOfRows: "10",
        ISU_CD: code,
      }).toString();

      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("public-data-status-" + response.status);

      const payload = await response.json();
      const items = payload?.response?.body?.items?.item || payload?.response?.body?.item || [];
      const item = Array.isArray(items) ? items[0] : items;
      if (item) {
        return normalizeArenaSnapshot({
          code: item.isinCd || item.shtCd || code,
          name: item.itmsNm || item.stockName || "종목",
          price: item.clpr || item.close || item.price || 0,
          change: item.vs || item.change || 0,
          changeRate: item.fltRt || item.changeRate || 0,
          open: item.mkp || item.open || 0,
          high: item.hipr || item.high || 0,
          low: item.lopr || item.low || 0,
          volume: item.acmlVol || item.volume || 0,
          tradingValue: item.acmlTrPbmn || item.tradingValue || 0,
          updatedAt: item.basDt || new Date().toLocaleString("ko-KR"),
        });
      }
    } catch (error) {
      console.warn("공공데이터 포털 연결 실패, 샘플 데이터를 사용합니다.", error);
    }
  }

  return normalizeArenaSnapshot(PUBLIC_SAMPLE_STOCK);
}

function initArenaPage() {
  const refreshButton = document.getElementById("refreshArena");
  if (refreshButton) {
    refreshButton.addEventListener("click", function () {
      loadArenaSnapshot(true);
    });
  }

  loadArenaSnapshot(false);
  window.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      arenaState.isRunning = false;
    } else if (!arenaState.isError) {
      arenaState.isRunning = true;
      loadArenaSnapshot(false);
    }
  });

  window.addEventListener("resize", renderArenaFrame);
}

async function loadArenaSnapshot(forceRefresh) {
  const errorBox = document.getElementById("arenaError");
  const refreshButton = document.getElementById("refreshArena");

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  if (errorBox) {
    errorBox.hidden = true;
  }

  try {
    const snapshot = await fetchPublicMarketSnapshot(ARENA_CONFIG.stockCode);
    const previous = arenaState.lastSnapshot;

    arenaState.lastSnapshot = snapshot;
    arenaState.lastUpdatedAt = snapshot.updatedAt || new Date().toLocaleString("ko-KR");
    arenaState.isError = false;
    arenaState.isRunning = true;

    if (previous) {
      const previousRate = Number(previous.changeRate || 0);
      const nextRate = Number(snapshot.changeRate || 0);
      const previousPrice = Number(previous.price || 0);
      const nextPrice = Number(snapshot.price || 0);

      if (nextRate !== previousRate || nextPrice !== previousPrice) {
        arenaState.direction = nextRate > previousRate ? "up" : nextRate < previousRate ? "down" : "flat";
        arenaState.motionLock = true;
        arenaState.lastChangeRate = nextRate;
      } else {
        arenaState.motionLock = false;
      }
    } else {
      arenaState.direction = snapshot.changeRate >= 0 ? "up" : "down";
      arenaState.motionLock = true;
      arenaState.lastChangeRate = Number(snapshot.changeRate || 0);
    }

    renderTicker(snapshot);
    renderArenaFrame();
  } catch (error) {
    console.error("Arena market data unavailable:", error);
    arenaState.isError = true;
    arenaState.isRunning = false;
    arenaState.motionLock = false;

    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = "데이터를 불러오지 못해 캐릭터를 정지했습니다.";
    }

    renderErrorState();
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

function normalizeArenaSnapshot(payload) {
  return {
    code: payload.code || ARENA_CONFIG.stockCode,
    name: payload.name || "삼성전자",
    price: Number(payload.price ?? 0),
    change: Number(payload.change ?? 0),
    changeRate: Number(payload.changeRate ?? 0),
    open: Number(payload.open ?? 0),
    high: Number(payload.high ?? 0),
    low: Number(payload.low ?? 0),
    volume: Number(payload.volume ?? 0),
    tradingValue: Number(payload.tradingValue ?? 0),
    updatedAt: payload.updatedAt || new Date().toLocaleString("ko-KR"),
  };
}

function renderTicker(snapshot) {
  const stockName = document.getElementById("arenaStockName");
  const currentPrice = document.getElementById("arenaCurrentPrice");
  const changeRate = document.getElementById("arenaChangeRate");
  const updatedAt = document.getElementById("arenaUpdatedAt");
  const openValue = document.getElementById("arenaOpen");
  const highValue = document.getElementById("arenaHigh");
  const lowValue = document.getElementById("arenaLow");
  const closeValue = document.getElementById("arenaClose");

  if (stockName) stockName.textContent = snapshot.name;
  if (currentPrice) currentPrice.textContent = formatWon(snapshot.price);
  if (changeRate) {
    changeRate.textContent = formatRate(snapshot.changeRate);
    changeRate.classList.toggle("up", snapshot.changeRate > 0);
    changeRate.classList.toggle("down", snapshot.changeRate < 0);
    changeRate.classList.toggle("flat", snapshot.changeRate === 0);
  }
  if (updatedAt) updatedAt.textContent = snapshot.updatedAt;
  if (openValue) openValue.textContent = formatWon(snapshot.open);
  if (highValue) highValue.textContent = formatWon(snapshot.high);
  if (lowValue) lowValue.textContent = formatWon(snapshot.low);
  if (closeValue) closeValue.textContent = formatWon(snapshot.price);
}

function renderErrorState() {
  const canvas = document.getElementById("arenaCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f5f3ec";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#1f2328";
  ctx.font = "600 24px sans-serif";
  ctx.fillText("데이터 연결 실패", 46, 120);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#60656b";
  ctx.fillText("공공데이터 연결 상태를 확인한 뒤 다시 시도해 주세요.", 46, 156);
}

function renderArenaFrame() {
  const canvas = document.getElementById("arenaCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const snapshot = arenaState.lastSnapshot;
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6f4ee";
  ctx.fillRect(0, 0, width, height);

  drawArenaGround(ctx, width, height);

  if (!snapshot || arenaState.isError) {
    renderErrorState();
    return;
  }

  drawCandleTower(ctx, snapshot, width, height);
  drawCharacters(ctx, width, height, snapshot);
}

function drawArenaGround(ctx, width, height) {
  const groundY = height - 42;

  ctx.fillStyle = "#dfe8df";
  ctx.fillRect(0, groundY, width, height - groundY);

  ctx.strokeStyle = "#b6c7b7";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawCandleTower(ctx, snapshot, width, height) {
  const baseY = height - 70;
  const bodyTop = baseY - 120;
  const bodyBottom = baseY;
  const x = width * 0.63;
  const openY = mapPriceToY(snapshot.open, snapshot.low, snapshot.high, bodyTop, bodyBottom);
  const closeY = mapPriceToY(snapshot.price, snapshot.low, snapshot.high, bodyTop, bodyBottom);
  const highY = mapPriceToY(snapshot.high, snapshot.low, snapshot.high, bodyTop, bodyBottom);
  const lowY = mapPriceToY(snapshot.low, snapshot.low, snapshot.high, bodyTop, bodyBottom);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 16);
  const bodyY = Math.min(openY, closeY);

  const isUp = snapshot.price >= snapshot.open;

  ctx.strokeStyle = "#1d2430";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, highY);
  ctx.lineTo(x, lowY);
  ctx.stroke();

  ctx.fillStyle = isUp ? "#2dbb70" : "#ee7d62";
  ctx.fillRect(x - 20, bodyY, 40, bodyHeight);
  ctx.strokeStyle = "#1d2430";
  ctx.strokeRect(x - 20, bodyY, 40, bodyHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 14px sans-serif";
  ctx.fillText(snapshot.name, x - 60, height - 22);
}

function drawCharacters(ctx, width, height, snapshot) {
  const isUp = snapshot.changeRate >= 0;
  const leftBase = width * 0.18;
  const rightBase = width * 0.80;

  if (!arenaState.isRunning || arenaState.isError || !arenaState.motionLock) {
    drawStaticCharacter(ctx, leftBase, height - 100, isUp ? "#2dbb70" : "#d7d7d9");
    drawStaticCharacter(ctx, rightBase, height - 100, isUp ? "#ef8d52" : "#d7d7d9");
    return;
  }

  const t = performance.now() / 1000;
  const swing = Math.sin(t * 2.2) * 8;
  const offset = arenaState.direction === "up" ? 10 : arenaState.direction === "down" ? -10 : 0;

  drawCharacter(ctx, leftBase + offset, height - 100 + swing, isUp ? "#2dbb70" : "#d7d7d9");
  drawCharacter(ctx, rightBase - offset, height - 100 + swing, isUp ? "#ef8d52" : "#d7d7d9");
}

function drawCharacter(ctx, x, y, color) {
  ctx.fillStyle = "#182127";
  ctx.fillRect(x - 15, y - 24, 30, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x - 14, y - 12, 28, 20);
  ctx.fillStyle = "#f7f9f4";
  ctx.fillRect(x - 10, y - 8, 20, 10);
  ctx.fillStyle = "#182127";
  ctx.fillRect(x - 4, y + 8, 5, 18);
  ctx.fillRect(x + 5, y + 8, 5, 18);
  ctx.fillRect(x - 12, y + 18, 6, 10);
  ctx.fillRect(x + 8, y + 18, 6, 10);
}

function drawStaticCharacter(ctx, x, y, color) {
  ctx.fillStyle = "#182127";
  ctx.fillRect(x - 15, y - 24, 30, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x - 14, y - 12, 28, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 10, y - 8, 20, 10);
}

function mapPriceToY(value, minValue, maxValue, topY, bottomY) {
  if (maxValue === minValue) {
    return (topY + bottomY) / 2;
  }
  return (bottomY - ((value - minValue) / (maxValue - minValue)) * (bottomY - topY));
}

function formatWon(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString("ko-KR") + "원";
}

function formatRate(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }
  const sign = Number(value) > 0 ? "+" : "";
  return sign + Number(value).toFixed(2) + "%";
}

(function startArenaLoop() {
  const tick = function () {
    if (!arenaState.isError && arenaState.isRunning) {
      renderArenaFrame();
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();

setInterval(function () {
  if (!document.hidden && !arenaState.isError) {
    loadArenaSnapshot(false);
  }
}, ARENA_CONFIG.refreshMs);
