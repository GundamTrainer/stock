import { PublicDataError, fetchPublicStockData, normalizeHistoryItems } from "./stock-data.js";

const PERIOD_MAP = {
  "1d": { calendarDays: 5, rows: 5 },
  "1w": { calendarDays: 16, rows: 10 },
  "1m": { calendarDays: 45, rows: 30 },
  "1y": { calendarDays: 400, rows: 250 },
};
const ASSET_TYPES = new Set(["stocks", "securities", "preemptiveRights", "rightCertificates"]);

function formatBasDt(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 요청만 허용됩니다.", code: "METHOD_NOT_ALLOWED" });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "종목코드는 숫자 6자리여야 합니다.", code: "INVALID_STOCK_CODE" });
  }

  const requestedPeriod = String(req.query.period || "1m").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PERIOD_MAP, requestedPeriod)) {
    return res.status(400).json({ error: "기간은 1d, 1w, 1m, 1y 중 하나여야 합니다.", code: "INVALID_PERIOD" });
  }
  const period = requestedPeriod;
  const assetType = String(req.query.asset || "stocks").trim();
  if (!ASSET_TYPES.has(assetType)) {
    return res.status(400).json({ error: "지원하지 않는 자산 데이터 유형입니다.", code: "INVALID_ASSET_TYPE" });
  }
  const calendarDays = PERIOD_MAP[period].calendarDays;
  const requestedRows = PERIOD_MAP[period].rows;
  const endDate = new Date();
  const beginDate = new Date(endDate);
  beginDate.setUTCDate(beginDate.getUTCDate() - calendarDays);

  try {
    const pageCount = Math.ceil(requestedRows / 100);
    const rawPages = await Promise.all(Array.from({ length: pageCount }, function (_, index) {
      return fetchPublicStockData({
        code,
        pageNo: 1,
        numOfRows: Math.min(100, requestedRows - index * 100),
        beginBasDt: formatBasDt(beginDate),
        endBasDt: formatBasDt(endDate),
        assetType,
      });
    }));
    const rawItems = rawPages.flat();
    const items = normalizeHistoryItems(rawItems)
      .filter(function (item) { return item.code === code && item.date && item.close > 0; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
    if (!items.length) {
      return res.status(404).json({
        error: "최근 거래일 시세를 찾을 수 없습니다.",
        code: "PUBLIC_DATA_NO_HISTORY",
      });
    }

    return res.status(200).json({
      code,
      period,
      asset: assetType,
      beginBasDt: formatBasDt(beginDate),
      endBasDt: formatBasDt(endDate),
      isRealtime: false,
      source: "금융위원회 주식시세정보",
      items,
    });
  } catch (error) {
    if (error instanceof PublicDataError) {
      return res.status(error.statusCode || 502).json({
        error: error.code === "PUBLIC_DATA_FETCH_FAILED"
          ? "금융위원회 V2 주식시세 이력 API 호출 실패(HTTP 403 등). data.go.kr 활용신청 승인, API 서비스 상태, DATA_GO_KR_API_KEY를 확인하세요."
          : error.message,
        code: error.code || "PUBLIC_DATA_ERROR",
      });
    }

    return res.status(500).json({
      error: "내부 서버 오류가 발생했습니다.",
      code: "HISTORY_INTERNAL_ERROR",
    });
  }
}
