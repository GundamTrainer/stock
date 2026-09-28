import { PublicDataError, fetchPublicStockData, normalizePublicStockItem } from "./stock-data.js";

const ASSET_TYPES = new Set(["stocks", "securities", "preemptiveRights", "rightCertificates"]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 요청만 허용됩니다.", code: "METHOD_NOT_ALLOWED" });
  }
  const assetType = String(req.query.asset || "stocks").trim();
  if (!ASSET_TYPES.has(assetType)) {
    return res.status(400).json({ error: "지원하지 않는 V2 금융상품 유형입니다.", code: "INVALID_ASSET_TYPE" });
  }

  const endDate = new Date();
  const beginDate = new Date(endDate);
  beginDate.setUTCDate(beginDate.getUTCDate() - 10);
  const formatDate = function (date) { return date.toISOString().slice(0, 10).replace(/-/g, ""); };

  try {
    const rawItems = await fetchPublicStockData({
      pageNo: 1,
      numOfRows: 1000,
      beginBasDt: formatDate(beginDate),
      endBasDt: formatDate(endDate),
      assetType,
    });
    const latestByCode = new Map();
    rawItems.map(function (row) { return normalizePublicStockItem(row, ""); })
      .filter(function (item) { return item.code && item.price > 0; })
      .sort(function (a, b) { return String(b.tradeDate).localeCompare(String(a.tradeDate)); })
      .forEach(function (item) {
        if (!latestByCode.has(item.code)) latestByCode.set(item.code, item);
      });
    const items = Array.from(latestByCode.values());
    return res.status(200).json({
      source: "금융위원회 V2 주식시세정보",
      asset: assetType,
      updatedAt: items[0]?.tradeDate || "",
      items,
    });
  } catch (error) {
    if (error instanceof PublicDataError) {
      return res.status(error.statusCode || 502).json({
        error: error.message || "금융위원회 V2 주식시세 API를 호출하지 못했습니다.",
        code: error.code || "PUBLIC_DATA_ERROR",
      });
    }
    return res.status(500).json({ error: "주식 목록을 불러오지 못했습니다.", code: "STOCK_LIST_INTERNAL_ERROR" });
  }
}
