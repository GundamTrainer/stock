import { PublicDataError, fetchPublicStockData, normalizePublicStockItem } from "./stock-data.js";

const ASSET_TYPES = new Set(["stocks", "securities", "preemptiveRights", "rightCertificates"]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 요청만 허용됩니다.", code: "METHOD_NOT_ALLOWED" });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: "종목코드는 숫자 6자리여야 합니다.",
      code: "INVALID_STOCK_CODE",
    });
  }
  const assetType = String(req.query.asset || "stocks").trim();
  if (!ASSET_TYPES.has(assetType)) {
    return res.status(400).json({ error: "지원하지 않는 자산 데이터 유형입니다.", code: "INVALID_ASSET_TYPE" });
  }

  try {
    const endDate = new Date();
    const beginDate = new Date(endDate);
    beginDate.setUTCDate(beginDate.getUTCDate() - 10);
    const basDt = function (date) { return date.toISOString().slice(0, 10).replace(/-/g, ""); };
    const rawItems = await fetchPublicStockData({
      code,
      pageNo: 1,
      numOfRows: 10,
      beginBasDt: basDt(beginDate),
      endBasDt: basDt(endDate),
      assetType,
    });

    const normalized = rawItems.map(function (row) { return normalizePublicStockItem(row, ""); })
      .find(function (row) { return row.code === code; });
    if (!normalized) {
      return res.status(404).json({
        error: "해당 종목의 최근 거래일 데이터를 찾을 수 없습니다.",
        code: "PUBLIC_DATA_NO_MATCH",
      });
    }
    return res.status(200).json({
      code: normalized.code || code,
      name: normalized.name,
      price: normalized.price,
      change: normalized.change,
      changeRate: normalized.changeRate,
      open: normalized.open,
      high: normalized.high,
      low: normalized.low,
      volume: normalized.volume,
      tradingValue: normalized.tradingValue,
      tradeDate: normalized.tradeDate,
      updatedAt: normalized.updatedAt,
      isRealtime: false,
      source: "금융위원회 주식시세정보",
      asset: assetType,
    });
  } catch (error) {
    if (error instanceof PublicDataError) {
      return res.status(error.statusCode || 502).json({
        error: error.code === "PUBLIC_DATA_FETCH_FAILED"
          ? "금융위원회 V2 주식시세 API 호출 실패(HTTP 403 등). data.go.kr 활용신청과 DATA_GO_KR_API_KEY를 확인하세요."
          : error.message,
        code: error.code || "PUBLIC_DATA_ERROR",
      });
    }

    return res.status(500).json({
      error: "서버 내부 오류가 발생했습니다.",
      code: "STOCK_PRICE_INTERNAL_ERROR",
    });
  }
}
