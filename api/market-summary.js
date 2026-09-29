const DEFAULT_INDEX_URL = "https://apis.data.go.kr/1160100/service/GetIndexInfoService/getIndexInfo";

function cleanApiKey(value) {
  let key = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (/%[0-9a-f]{2}/i.test(key)) {
    try { key = decodeURIComponent(key); } catch (error) { /* Keep the original key when it is not valid encoded text. */ }
  }
  return key;
}

function findIndexItem(payload) {
  const root = payload?.response?.body?.items?.item || payload?.response?.body?.item || payload?.items?.item || payload?.item;
  return Array.isArray(root) ? root[0] : root || null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 요청만 허용됩니다.", code: "METHOD_NOT_ALLOWED" });
  }

  const apiKey = cleanApiKey(process.env.DATA_GO_KR_API_KEY);
  if (!apiKey) {
    return res.status(500).json({
      error: "서버에 DATA_GO_KR_API_KEY 환경변수가 없습니다. Vercel 프로젝트 환경 변수에 등록한 뒤 재배포하세요.",
      code: "DATA_GO_KR_API_KEY_MISSING",
    });
  }

  const endpoint = process.env.DATA_GO_KR_INDEX_URL || DEFAULT_INDEX_URL;
  const indexes = {};
  try {
    await Promise.all(["KOSPI", "KOSDAQ"].map(async function (label) {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        serviceKey: apiKey,
        resultType: "json",
        pageNo: "1",
        numOfRows: "5",
        IDX_NM: label,
      }).toString();
      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      const header = payload?.response?.header;
      if (header?.resultCode && String(header.resultCode) !== "00") {
        throw new Error(header.resultMsg || "공공데이터 응답 오류");
      }
      const item = findIndexItem(payload);
      if (!item) return;
      const value = Number(item.clpr ?? item.close ?? item.idxClpr ?? 0);
      const changeRate = Number(item.fltRt ?? item.changeRate ?? 0);
      indexes[label] = {
        value: Number.isFinite(value) ? value : 0,
        changeRate: Number.isFinite(changeRate) ? changeRate : 0,
        updatedAt: item.basDt || new Date().toISOString().slice(0, 10),
        name: item.idxNm || label,
      };
    }));
  } catch (error) {
    console.error("Market summary API request failed:", error && error.message);
    return res.status(502).json({
      error: "시장 지수 API 요청에 실패했습니다. DATA_GO_KR_API_KEY와 data.go.kr 활용 승인을 확인하세요.",
      code: "MARKET_SUMMARY_FETCH_FAILED",
    });
  }

  return res.status(200).json({ indexes });
}
