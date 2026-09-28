import { PublicDataError, fetchPublicStockData, normalizeHistoryItems } from "./stock-data.js";

const PERIOD_MAP = {
  "1d": 1,
  "1w": 7,
  "1m": 30,
  "1y": 250,
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 요청만 허용됩니다.", code: "METHOD_NOT_ALLOWED" });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "종목코드는 숫자 6자리여야 합니다.", code: "INVALID_STOCK_CODE" });
  }

  const period = String(req.query.period || "3m").trim().toLowerCase();
  const maxRows = PERIOD_MAP[period] || PERIOD_MAP["1m"];

  try {
    const pages = Math.ceil(maxRows / 100);
    const pageResults = await Promise.all(Array.from({ length: pages }, function (_, index) {
      return fetchPublicStockData({ code, pageNo: index + 1, numOfRows: 100 });
    }));
    const items = pageResults.flat()
      .map(function (row) { return normalizeHistoryItems([row])[0]; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); })
      .slice(0, maxRows);
    if (!items.length) {
      return res.status(404).json({
        error: "최근 거래일 시세를 찾을 수 없습니다.",
        code: "PUBLIC_DATA_NO_HISTORY",
      });
    }

    return res.status(200).json({
      code,
      period,
      isRealtime: false,
      source: "금융위원회 주식시세정보",
      items,
    });
  } catch (error) {
    if (error instanceof PublicDataError) {
      return res.status(error.statusCode || 502).json({
        error: "과거 시세를 불러오지 못했습니다.",
        code: error.code || "PUBLIC_DATA_ERROR",
      });
    }

    return res.status(500).json({
      error: "내부 서버 오류가 발생했습니다.",
      code: "HISTORY_INTERNAL_ERROR",
    });
  }
}
