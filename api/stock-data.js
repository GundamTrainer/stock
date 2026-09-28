const DEFAULT_BASE_URL = "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService";

export class PublicDataError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = "PublicDataError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getBaseUrl() {
  return (process.env.DATA_GO_KR_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickFirst(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return null;
}

export function extractItemsFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const possibleRoots = [
    payload.response && payload.response.body && payload.response.body.items,
    payload.response && payload.response.body && payload.response.body.item,
    payload.body && payload.body.items,
    payload.body && payload.body.item,
    payload.items,
    payload.item,
    payload.response && payload.response.items,
    payload.response && payload.response.item,
  ];

  for (const root of possibleRoots) {
    if (!root) continue;
    if (Array.isArray(root)) return root;
    if (Array.isArray(root.item)) return root.item;
    if (root.item) return Array.isArray(root.item) ? root.item : [root.item];
    return [root];
  }

  return [];
}

export function normalizePublicStockItem(item, fallbackCode) {
  let code = pickFirst(item, ["srtnCd", "shtCd", "stkCd", "stockCode", "code", "ISU_CD", "STK_CD", "isinCd"]) || fallbackCode || "";
  if (/^KR\d{10}$/.test(String(code))) {
    code = String(code).slice(3, 9);
  }
  const name = pickFirst(item, ["itmsNm", "isnm", "stockName", "stockNm", "name", "korIsnm", "nm"]) || "";
  const tradeDate = pickFirst(item, ["basDt", "stdDt", "tradeDate", "date", "trdDt"]) || "";
  const price = parseNumber(pickFirst(item, ["clpr", "close", "lastPrice", "stck_prpr", "price", "curPrice", "mkp"]));
  const open = parseNumber(pickFirst(item, ["mkp", "open", "oprc", "stck_oprc", "openingPrice"]));
  const high = parseNumber(pickFirst(item, ["hipr", "high", "stck_hgpr", "max", "highPrice"]));
  const low = parseNumber(pickFirst(item, ["lopr", "low", "stck_lwpr", "min", "lowPrice"]));
  const volume = parseNumber(pickFirst(item, ["acmlVol", "trqu", "volume", "acml_vol", "tradeQty", "vol"]));
  const tradingValue = parseNumber(pickFirst(item, ["acmlTrPbmn", "tradingValue", "value", "dealAmt", "trvAmt", "amt"]));
  const change = parseNumber(pickFirst(item, ["vs", "change", "prdy_vrss", "diff", "delta"]));
  const changeRate = parseNumber(pickFirst(item, ["fltRt", "changeRate", "prdy_ctrt", "chgRate", "fluctuationRate", "rate"]));

  return {
    code: String(code),
    name: String(name || code || "종목명 없음"),
    price: price === null ? 0 : price,
    change: change === null ? 0 : change,
    changeRate: changeRate === null ? 0 : changeRate,
    open: open === null ? 0 : open,
    high: high === null ? 0 : high,
    low: low === null ? 0 : low,
    volume: volume === null ? 0 : volume,
    tradingValue: tradingValue === null ? 0 : tradingValue,
    tradeDate: String(tradeDate || ""),
    updatedAt: String(tradeDate || new Date().toISOString().slice(0, 10)),
    isRealtime: false,
    source: "금융위원회 주식시세정보",
  };
}

export function normalizeHistoryItems(items) {
  return (Array.isArray(items) ? items : []).map(function (row) {
    const date = pickFirst(row, ["basDt", "tradeDate", "stdDt", "date", "trdDt"]) || "";
    return {
      date: String(date),
      open: parseNumber(pickFirst(row, ["mkp", "open", "oprc", "stck_oprc"])) || 0,
      high: parseNumber(pickFirst(row, ["hipr", "high", "stck_hgpr"])) || 0,
      low: parseNumber(pickFirst(row, ["lopr", "low", "stck_lwpr"])) || 0,
      close: parseNumber(pickFirst(row, ["clpr", "close", "stck_prpr"])) || 0,
      volume: parseNumber(pickFirst(row, ["acmlVol", "volume", "tradeQty", "vol"])) || 0,
    };
  });
}

export async function fetchPublicStockData(options = {}) {
  const code = typeof options.code === "string" ? options.code : "";
  const pageNo = options.pageNo || 1;
  const numOfRows = options.numOfRows || 10;
  const period = options.period || "";
  const tradeDate = options.tradeDate || "";

  const rawApiKey = process.env.DATA_GO_KR_API_KEY;
  if (!rawApiKey) {
    throw new PublicDataError("DATA_GO_KR_API_KEY 환경변수가 없습니다.", 500, "DATA_GO_KR_API_KEY_MISSING");
  }
  let apiKey = String(rawApiKey).trim().replace(/^['"]|['"]$/g, "");
  if (/%[0-9a-f]{2}/i.test(apiKey)) {
    try { apiKey = decodeURIComponent(apiKey); } catch (error) { /* Keep the provided key if it is not valid percent encoding. */ }
  }

  const baseUrl = getBaseUrl();
  const params = new URLSearchParams({
    serviceKey: apiKey,
    resultType: "json",
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });

  if (code) {
    params.set("ISU_CD", code);
    params.set("STK_CD", code);
    params.set("isinCd", code);
    params.set("stockCode", code);
  }

  if (tradeDate) {
    params.set("BAS_DT", tradeDate);
    params.set("STD_DT", tradeDate);
    params.set("tradeDate", tradeDate);
  }

  if (period) {
    params.set("period", period);
  }

  const url = `${baseUrl}/getStockPriceInfo?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new PublicDataError("공공데이터포털 요청 제한을 초과했습니다.", 429, "PUBLIC_DATA_RATE_LIMIT");
    }

    if (!response.ok) {
      throw new PublicDataError("공공데이터포털 호출에 실패했습니다.", 502, "PUBLIC_DATA_FETCH_FAILED");
    }

    const payload = await response.json();
    const header = payload && payload.response ? payload.response.header : null;
    const resultCode = header ? header.resultCode : null;
    const resultMsg = header ? header.resultMsg : "";

    if (resultCode && String(resultCode) !== "00") {
      throw new PublicDataError(resultMsg || "공공데이터포털에서 데이터를 제공하지 않습니다.", 502, "PUBLIC_DATA_RESULT_ERROR");
    }

    const items = extractItemsFromPayload(payload);
    if (!items || items.length === 0) {
      throw new PublicDataError("공공데이터포털에서 조회 결과를 찾지 못했습니다.", 404, "PUBLIC_DATA_NO_RESULTS");
    }

    return items;
  } catch (error) {
    if (error instanceof PublicDataError) {
      throw error;
    }
    if (error && error.name === "AbortError") {
      throw new PublicDataError("공공데이터포털 응답 시간이 초과했습니다.", 504, "PUBLIC_DATA_TIMEOUT");
    }
    throw new PublicDataError("공공데이터포털 응답을 처리하는 중 오류가 발생했습니다.", 502, "PUBLIC_DATA_PARSE_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
