"""Local Stock Arena server for Windows when Node/Vercel CLI is unavailable.

Run: py dev_server.py
This server only binds to 127.0.0.1 and never serves local environment files.
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_STOCK_URL = "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"


def load_local_env() -> None:
    """Load root env files without ever printing their contents."""
    for filename in (".env.local", "env.local"):
        path = ROOT / filename
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name, value = name.strip(), value.strip()
            if name and name not in os.environ:
                os.environ[name] = value.strip("\"'")


load_local_env()


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def as_number(value, default=0):
    try:
        return float(str(value if value is not None else default).replace(",", ""))
    except (ValueError, TypeError):
        return default


def api_items(payload):
    body = (payload.get("response") or {}).get("body") or payload.get("body") or payload
    items = body.get("items", body.get("item", [])) if isinstance(body, dict) else []
    if isinstance(items, dict):
        items = items.get("item", items)
    return items if isinstance(items, list) else ([items] if items else [])


def normalize_stock(row):
    raw_code = str(row.get("srtnCd") or row.get("shtCd") or row.get("stkCd") or row.get("stockCode") or row.get("code") or "")
    if not re.fullmatch(r"\d{6}", raw_code):
        isin = str(row.get("isinCd") or "")
        raw_code = isin[3:9] if isin.startswith("KR") and len(isin) >= 9 and isin[3:9].isdigit() else raw_code
    return {
        "code": raw_code,
        "name": str(row.get("itmsNm") or row.get("stockName") or row.get("stockNm") or row.get("name") or raw_code),
        "price": as_number(row.get("clpr", row.get("close", row.get("price", 0)))),
        "change": as_number(row.get("vs", row.get("change", 0))),
        "changeRate": as_number(row.get("fltRt", row.get("changeRate", row.get("prdy_ctrt", 0)))),
        "open": as_number(row.get("mkp", row.get("open", 0))),
        "high": as_number(row.get("hipr", row.get("high", 0))),
        "low": as_number(row.get("lopr", row.get("low", 0))),
        "volume": as_number(row.get("acmlVol", row.get("trqu", row.get("volume", 0)))),
        "tradingValue": as_number(row.get("acmlTrPbmn", row.get("tradingValue", row.get("dealAmt", 0)))),
        "tradeDate": str(row.get("basDt") or row.get("tradeDate") or row.get("date") or ""),
        "updatedAt": str(row.get("basDt") or row.get("tradeDate") or row.get("date") or ""),
        "isRealtime": False,
    }


def fetch_public_page(page_no: int, rows: int, code: str = ""):
    key = urllib.parse.unquote(os.environ.get("DATA_GO_KR_API_KEY", "").strip().strip("\"'"))
    if not key:
        raise RuntimeError("DATA_GO_KR_API_KEY가 설정되지 않았습니다. 루트 .env.local에 키를 입력하세요.")
    base = os.environ.get("DATA_GO_KR_BASE_URL", "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService").rstrip("/")
    params = {"serviceKey": key, "resultType": "json", "pageNo": str(page_no), "numOfRows": str(rows)}
    if code:
        params.update({"ISU_CD": code, "STK_CD": code, "isinCd": code, "stockCode": code})
    url = base + "/getStockPriceInfo?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "StockArenaLocal/1.0"})
    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))
    header = (payload.get("response") or {}).get("header") or {}
    if header.get("resultCode") and str(header["resultCode"]) != "00":
        raise RuntimeError("공공데이터포털 응답 오류: " + str(header.get("resultMsg") or header["resultCode"]))
    return api_items(payload)


def public_data_error(error):
    if isinstance(error, urllib.error.HTTPError) and error.code == 403:
        return "금융위원회 시세 API가 HTTP 403을 반환했습니다. data.go.kr 활용 신청 승인/서비스 상태와 루트 .env.local의 DATA_GO_KR_API_KEY 값을 확인하세요."
    if isinstance(error, urllib.error.HTTPError):
        return "금융위원회 시세 API 요청 실패 (HTTP %s). 키 승인과 사용량을 확인하세요." % error.code
    if isinstance(error, urllib.error.URLError):
        return "금융위원회 시세 API에 연결할 수 없습니다. 인터넷 연결과 방화벽을 확인하세요."
    return str(error)


def fetch_stock_rows(code: str, count: int):
    pages = max(1, (count + 99) // 100)
    results = []
    # Keep outbound work small and deterministic; requests are sequential to respect provider quotas.
    for page in range(1, pages + 1):
        results.extend(fetch_public_page(page, min(100, count - len(results)), code))
        if len(results) >= count:
            break
    return results[:count]


class Handler(BaseHTTPRequestHandler):
    server_version = "StockArenaLocal/1.0"

    def log_message(self, fmt, *args):
        # Do not log full URLs: query parameters may contain provider service keys.
        print("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        route = parsed.path.rstrip("/") or "/"
        if route == "/api/health":
            return send_json(self, 200, {
                "ok": True,
                "groqConfigured": bool(os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_API_TEST")),
                "stockDataConfigured": bool(os.environ.get("DATA_GO_KR_API_KEY")),
            })
        if route == "/api/stock-rankings":
            return self.stock_rankings(query)
        if route == "/api/stock-price":
            return self.stock_price(query)
        if route == "/api/stock-history":
            return self.stock_history(query)
        self.serve_static(route)

    def do_POST(self):
        route = urllib.parse.urlsplit(self.path).path.rstrip("/")
        if route != "/api/ai":
            return send_json(self, 404, {"error": "API 경로를 찾을 수 없습니다."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 16000:
                return send_json(self, 400, {"error": "분석 요청 크기를 확인해 주세요."})
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            prompt = payload.get("prompt") if isinstance(payload, dict) else None
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 12000:
                return send_json(self, 400, {"error": "분석 요청은 1~12,000자여야 합니다."})
            key = (os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_API_TEST") or "").strip()
            if not key:
                return send_json(self, 500, {"error": "GROQ_API_KEY가 없습니다. 루트 .env.local의 변수 이름과 값을 확인하세요."})
            body = json.dumps({
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.35,
                "max_completion_tokens": 1800,
            }).encode("utf-8")
            request = urllib.request.Request(GROQ_URL, data=body, headers={
                "Content-Type": "application/json", "Authorization": "Bearer " + key,
            }, method="POST")
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
            return send_json(self, 200, {"text": result["choices"][0]["message"]["content"]})
        except urllib.error.HTTPError as error:
            status = error.code
            if status == 401:
                message = "Groq가 API 키를 거부했습니다. GROQ_API_KEY 값과 키 상태를 확인하세요."
            elif status == 404:
                message = "Groq 모델을 사용할 수 없습니다. 모델 이름 또는 계정 접근 권한을 확인하세요."
            else:
                message = "Groq 요청 실패 (HTTP %s). 계정 사용량과 요청 형식을 확인하세요." % status
            return send_json(self, 502, {"error": message})
        except urllib.error.URLError:
            return send_json(self, 502, {"error": "Groq 서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요."})
        except (ValueError, KeyError, TimeoutError) as error:
            return send_json(self, 502, {"error": "AI 응답을 처리하지 못했습니다: " + str(error)})
        except Exception as error:
            return send_json(self, 500, {"error": str(error)})

    def stock_rankings(self, query):
        kind = (query.get("type") or ["rise"])[0]
        sorters = {
            "rise": lambda item: -item["changeRate"],
            "fall": lambda item: item["changeRate"],
            "volume": lambda item: -item["volume"],
            "value": lambda item: -item["tradingValue"],
        }
        if kind not in sorters:
            return send_json(self, 400, {"error": "지원하지 않는 순위 유형입니다."})
        try:
            items = [normalize_stock(row) for row in fetch_public_page(1, 100)]
            items = [item for item in items if item["code"] and item["name"]]
            items.sort(key=sorters[kind])
            for index, item in enumerate(items[:10], 1):
                item["rank"] = index
            return send_json(self, 200, {"type": kind, "source": "금융위원회 주식시세정보", "updatedAt": items[0]["tradeDate"] if items else "", "items": items[:10]})
        except Exception as error:
            return send_json(self, 502, {"error": public_data_error(error)})

    def stock_price(self, query):
        code = (query.get("code") or [""])[0]
        if not re.fullmatch(r"\d{6}", code):
            return send_json(self, 400, {"error": "종목코드는 숫자 6자리여야 합니다."})
        try:
            rows = fetch_stock_rows(code, 10)
            matches = [normalize_stock(row) for row in rows]
            match = next((item for item in matches if item["code"] == code), matches[0] if matches else None)
            if not match:
                return send_json(self, 404, {"error": "최근 거래일 시세를 찾을 수 없습니다."})
            match["source"] = "금융위원회 주식시세정보"
            return send_json(self, 200, match)
        except Exception as error:
            return send_json(self, 502, {"error": public_data_error(error)})

    def stock_history(self, query):
        code = (query.get("code") or [""])[0]
        period = (query.get("period") or ["1m"])[0].lower()
        rows_by_period = {"1d": 1, "1w": 7, "1m": 30, "1y": 250}
        if not re.fullmatch(r"\d{6}", code):
            return send_json(self, 400, {"error": "종목코드는 숫자 6자리여야 합니다."})
        if period not in rows_by_period:
            return send_json(self, 400, {"error": "기간은 1d, 1w, 1m, 1y 중 하나여야 합니다."})
        try:
            rows = fetch_stock_rows(code, rows_by_period[period])
            items = []
            for row in rows:
                stock = normalize_stock(row)
                items.append({
                    "date": stock["tradeDate"], "open": stock["open"], "high": stock["high"],
                    "low": stock["low"], "close": stock["price"], "volume": stock["volume"],
                })
            items.sort(key=lambda item: item["date"], reverse=True)
            if not items:
                return send_json(self, 404, {"error": "최근 거래일 이력이 없습니다."})
            return send_json(self, 200, {"code": code, "period": period, "isRealtime": False, "source": "금융위원회 주식시세정보", "items": items})
        except Exception as error:
            return send_json(self, 502, {"error": public_data_error(error)})

    def serve_static(self, route):
        relative = urllib.parse.unquote(route).lstrip("/") or "index.html"
        parts = Path(relative).parts
        if any(part.startswith(".") or part.lower() in {"env.local", "node_modules", "__pycache__"} for part in parts):
            return send_json(self, 404, {"error": "파일을 찾을 수 없습니다."})
        path = (ROOT / relative).resolve()
        if ROOT not in path.parents and path != ROOT:
            return send_json(self, 404, {"error": "파일을 찾을 수 없습니다."})
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file():
            return send_json(self, 404, {"error": "파일을 찾을 수 없습니다."})
        content = path.read_bytes()
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in {"application/javascript", "application/json"}:
            mime += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def main():
    port = int(os.environ.get("PORT", "8001"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Stock Arena local API server: http://127.0.0.1:%s" % port)
    print("Configured keys: /api/health (only true/false shown; values stay private)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLocal server stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
