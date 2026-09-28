# 프로젝트 구조 안내

```
my-project/
│
├─ index.html                 홈 (로그인 화면)
│
├─ pages/                     ★ 새 페이지는 전부 여기에
│  ├─ board.html                게시판
│  ├─ mypage.html               내 정보
│  └─ _새페이지_템플릿.html      복사해서 쓰는 빈 페이지
│
├─ assets/                    ★ 화면에 쓰는 재료는 전부 여기에
│  ├─ css/
│  │  └─ style.css              공용 디자인 (모든 페이지가 함께 씀)
│  ├─ js/
│  │  ├─ common.js              연결·로그인·메뉴 (모든 페이지가 함께 씀)
│  │  ├─ home.js                홈 전용
│  │  ├─ board.js               게시판 전용
│  │  └─ mypage.js              내 정보 전용
│  └─ img/
│     └─ logo.svg               이미지는 여기에 넣기
│
├─ api/
│  └─ ai.js                  서버 함수 (브라우저로 안 내려감. API 키가 있는 곳)
│
├─ .gitignore                깃에 올리지 않을 파일 목록
├─ .env.example              필요한 키 이름 견본 (올라가도 안전)
└─ .env.local                진짜 키 ★ 직접 만들어야 하고, 깃에 안 올라갑니다
```

## 키를 두는 곳

| 장소 | 누가 볼 수 있나 | 여기에 둘 것 |
|---|---|---|
| `index.html`, `assets/` | **전 세계** | Supabase Publishable key |
| GitHub 저장소 | 저장소를 볼 수 있는 사람 | 코드만. 키는 없음 |
| `.env.local` (내 컴퓨터) | 나만 | `GROQ_API_KEY`, `DATA_GO_KR_API_KEY` |
| Vercel 환경변수 | 나만 | 위 서버 키와 같은 값 |

`.env.local` 은 깃에 안 올라가므로 **Vercel에는 따로 등록해야 합니다.**
Settings → Environment Variables 에 넣고 **Redeploy** 까지 해야 반영됩니다.

## 실제 실행 방법

이 프로젝트의 `/api/*` 경로는 정적 파일 서버로는 동작하지 않습니다.
브라우저에서 직접 `index.html` 을 열면 `/api/stock-price`, `/api/stock-rankings` 같은 서버 엔드포인트가 존재하지 않아
"시장 데이터를 확인하지 못했습니다" 상태가 계속 뜹니다.

이 작업공간에는 Node.js/Vercel CLI가 설치되어 있지 않아, 기본 테스트 서버로는 `/api` 호출이 404가 됩니다. Python 로컬 API 서버를 실행할 수 있습니다:

```bash
cd "C:/Users/USER/Desktop/GundamTrainer/stock"
py dev_server.py
```

그 다음 `http://127.0.0.1:8001`을 엽니다. 서버는 루트 `.env.local`의 Groq·금융위 API 키를 읽고, 환경 파일 URL은 외부에 제공하지 않습니다. 키가 읽혔는지는 `/api/health`에서 값이 아닌 설정 여부만 확인할 수 있습니다.

금융위 시세는 다음 V2 서비스들을 사용합니다:

- `stocks` → `getStockPriceInfo_V2`
- `securities` → `getSecuritiesPriceInfo_V2`
- `preemptiveRights` → `getPreemptiveRightSecuritiesPriceInfo_V2`
- `rightCertificates` → `getPreemptiveRightCertificatePriceInfo_V2`

상세 차트의 금융상품 선택에서 유형을 바꿀 수 있고, 서버 목록 API는 `?asset=securities`처럼 선택합니다. 인증키는 코드나 브라우저에 넣지 않습니다.

홈 Stock Chat Bot은 질문에 맞는 금융위 V2 종목 목록과 상승·하락·거래대금 순위, 관심 종목별 최근 이력을 서버에서 받아 Groq에 전달합니다. “수익증권”, “신주인수권증권”, “신주인수권증서” 질문은 해당 V2 자료를 선택하고, 기본 질문은 주식 자료를 분석합니다. Groq는 전달된 공개데이터 범위 안에서만 대화/분석하며, 시세 API가 실패하면 근거 없이 분석을 이어가지 않습니다.

로컬 V2 주식 시세/이력 응답은 확인되었지만 Groq는 HTTP 403을 반환할 수 있습니다. 이 경우 Groq 콘솔에서 키가 활성 상태인지, API 사용 프로젝트/조직과 `openai/gpt-oss-20b` 모델 접근 권한을 확인하세요. HTTP 401은 키 불일치, 429는 사용량 한도 문제입니다.

운영과 동일한 Vercel Function 실행을 원하면 Node.js와 Vercel CLI를 설치한 뒤 `vercel dev`를 사용할 수 있습니다. 배포 환경에서는 Vercel에 API 키를 별도로 등록해야 합니다.

> 참고: `python -m http.server` 는 정적 페이지만 제공하므로 API 호출은 동작하지 않습니다.

Supabase 키를 안 숨기는 건 실수가 아닙니다. 공개를 전제로 만들어진 키이고,
권한은 DB의 RLS 정책이 따로 막습니다.

## 모의 매매 데이터 설정

매수·매도 내역과 잔액은 로그인 계정별 Supabase 테이블에 저장됩니다. 한 번만 설정하면 됩니다:

1. Supabase 대시보드에서 **SQL Editor**를 엽니다.
2. 이 저장소의 [supabase/stock-arena-trading.sql](supabase/stock-arena-trading.sql) 전체 내용을 실행합니다.
3. 로그인 상태에서 오늘의 시장 페이지에서 거래합니다. 잔액·보유 종목·거래 기록은 RPC 트랜잭션으로 원자적으로 저장됩니다.

화면에 `거래 RPC가 없습니다`가 나오면 SQL이 아직 실행되지 않았거나 함수 스키마 캐시가 갱신되지 않은 것입니다. `permission denied`는 SQL의 권한/RLS 적용을 확인하고, 로그인 오류는 다시 로그인합니다.

새 거래부터 Supabase에 저장됩니다. 이전 버전에서 브라우저 `localStorage`에만 저장한 매매 기록은 계정 데이터로 자동 이전되지 않습니다.

## 규칙 1 — 주소는 항상 `/` 로 시작

```html
<!-- 맞음 -->
<link rel="stylesheet" href="/assets/css/style.css">
<script src="/assets/js/common.js"></script>
<img src="/assets/img/logo.svg">

<!-- 틀림 -->
<link rel="stylesheet" href="assets/css/style.css">
<script src="../assets/js/common.js"></script>
```

`/` 없이 쓰면 `index.html`에서는 되는데 `pages/board.html`에서는 깨집니다.
폴더 깊이가 달라지기 때문입니다.
**`/` 로 시작하면 어느 폴더에서든 똑같이 동작합니다.**

## 규칙 2 — 페이지마다 JS 파일 하나

`common.js` 는 모두가 함께 쓰고, 각 페이지는 자기 JS만 추가로 부릅니다.

한 파일에 다 넣지 마세요. 나눠두면 Copilot에게
"board.js의 addPost 함수 고쳐줘"처럼 좁게 지시할 수 있어서 **크레딧이 훨씬 덜 듭니다.**

## 규칙 3 — `onAuthReady()` 안에서 시작

로그인 확인이 끝나면 `common.js` 가 이 함수를 자동으로 불러줍니다.

```js
function onAuthReady() {
  // 여기서부터 currentUser, db, askAI 를 쓸 수 있습니다.
}
```

로그인 확인 전에 DB를 부르면 내 정보가 아직 없어서 실패합니다.

---

# 새 페이지 만드는 법 (4단계)

**1.** `pages/_새페이지_템플릿.html` 을 복사해서 새 이름으로 저장
```
pages/gallery.html
```

**2.** `assets/js/gallery.js` 를 만들고 안에 이렇게 씁니다
```js
function onAuthReady() {
  // 여기에 이 페이지가 할 일
}
```

**3.** `gallery.html` 맨 아래 script 주소를 바꿉니다
```html
<script src="/assets/js/gallery.js"></script>
```

**4.** `assets/js/common.js` 의 `MENU` 에 한 줄 추가
```js
{ name: "갤러리", url: "/pages/gallery.html" },
```

메뉴, 로그인 유지, DB 연결, AI 호출이 전부 그대로 따라옵니다.

---

# 바로 쓸 수 있는 것들

`common.js` 를 부른 페이지라면 어디서든 씁니다.

| 이름 | 하는 일 |
|---|---|
| `db` | Supabase. `db.from("posts").select("*")` 처럼 사용 |
| `currentUser` | 지금 로그인한 사람. `currentUser.email`, `currentUser.id` |
| `askAI(프롬프트)` | AI에게 물어보기. `await askAI("...")` |
| `signOut()` | 로그아웃 |

```js
// 예시
async function onAuthReady() {
  const { data, error } = await db.from("posts").select("*");
  if (error) { console.error(error); return; }

  const 요약 = await askAI("이 글들을 한 줄로 요약해줘: " + JSON.stringify(data));
  console.log(요약);
}
```

---

# 자주 나는 문제

| 증상 | 원인 |
|---|---|
| 새 페이지에서 디자인이 다 깨짐 | 주소에 `/` 를 안 붙임 (규칙 1) |
| `supabase is not defined` | CDN script 가 common.js 뒤에 있음 |
| `currentUser is null` | `onAuthReady()` 밖에서 코드를 실행함 (규칙 3) |
| 새 페이지가 메뉴에 안 보임 | `common.js` 의 `MENU` 에 안 넣음 |
| 커밋했는데 화면이 그대로 | 브라우저 캐시. `Ctrl+Shift+R` |
| AI만 404 | Live Server로 열었음. 배포 주소나 `vercel dev` 에서 확인 |
| 금융위 시세 API 403 | data.go.kr에서 금융위원회 주식시세정보 API 활용 신청 승인 상태와 `.env.local`의 `DATA_GO_KR_API_KEY` 값을 확인 |

> **참고:** Git은 빈 폴더를 저장하지 않습니다.
> `assets/img/` 에 파일이 하나도 없으면 GitHub에 폴더가 안 올라갑니다.
> `logo.svg` 를 지우지 말고 두세요.
