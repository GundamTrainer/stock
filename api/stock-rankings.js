import { PublicDataError, fetchPublicStockData, normalizePublicStockItem } from "./stock-data.js";

const SORTERS = {
  rise: function (a, b) {
    return Number(b.changeRate || 0) - Number(a.changeRate || 0);
  },
  fall: function (a, b) {
    return Number(a.changeRate || 0) - Number(b.changeRate || 0);
  },
  volume: function (a, b) {
    return Number(b.volume || 0) - Number(a.volume || 0);
  },
  value: function (a, b) {
    return Number(b.tradingValue || 0) - Number(a.tradingValue || 0);
  },
};
const ASSET_TYPES = new Set(["stocks", "securities", "preemptiveRights", "rightCertificates"]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 요청만 허용됩니다.", code: "METHOD_NOT_ALLOWED" });
  }

  const type = String(req.query.type || "rise").trim().toLowerCase();
  if (!SORTERS[type]) {
    return res.status(400).json({ error: "지원하지 않는 순위 타입입니다.", code: "INVALID_RANKING_TYPE" });
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
      pageNo: 1,
      numOfRows: 1000,
      beginBasDt: basDt(beginDate),
      endBasDt: basDt(endDate),
      assetType,
    });

    const latestByCode = new Map();
    rawItems.map(function (row) { return normalizePublicStockItem(row, ""); })
      .filter(function (item) { return !!item && item.code; })
      .sort(function (a, b) { return String(b.tradeDate).localeCompare(String(a.tradeDate)); })
      .forEach(function (item) {
        if (!latestByCode.has(item.code)) latestByCode.set(item.code, item);
      });

    const items = Array.from(latestByCode.values())
      .sort(SORTERS[type])
      .slice(0, 10)
      .map(function (item, index) {
        return {
          rank: index + 1,
          code: item.code,
          name: item.name,
          price: item.price,
          change: item.change,
          changeRate: item.changeRate,
          volume: item.volume,
          tradingValue: item.tradingValue,
          tradeDate: item.tradeDate || item.updatedAt,
        };
      });

    return res.status(200).json({
      type,
      asset: assetType,
      updatedAt: items[0] ? items[0].tradeDate : "",
      source: "금융위원회 주식시세정보",
      items,
    });
  } catch (error) {
    if (error instanceof PublicDataError) {
      return res.status(error.statusCode || 502).json({
        error: error.message || "최근 거래일 시장 데이터를 불러오지 못했습니다.",
        code: error.code || "PUBLIC_DATA_ERROR",
      });
    }

    return res.status(500).json({
      error: "서버 내부 오류가 발생했습니다.",
      code: "RANKING_INTERNAL_ERROR",
    });
  }
}
