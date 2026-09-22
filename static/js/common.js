// =========================================================
// 모든 페이지가 함께 쓰는 파일
// 새 페이지를 만들어도 이 파일만 불러오면 로그인과 메뉴가 그대로 이어집니다.
// =========================================================

// ---------------------------------------------------------
// 1. Supabase 연결
// ---------------------------------------------------------
// Supabase 대시보드 > Settings > API Keys 에서 복사해오시면 돼요
// 이 두 값은 공개돼도 ㄱㅊ음
const SUPABASE_URL = "https://ohutruqgqnxmfdirstvw.supabase.co";
const SUPABASE_KEY = "sb_publishable_A3QiVHthVM25z1lfpAqvVg_Q6aWV6vV";

// (*참고 : CDN이 supabase 라는 이름을 이미 쓰고 있으믐로 우리가 만드는 것은 db 라고 부를 예정)

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 지금 로그인한 사람 (로그인 안 했으면 null)
let currentUser = null;

// ---------------------------------------------------------
// 2. 메뉴  ★ 만약 새 페이지 만들게 되시면 여기에 한 줄만 추가하주세요!!!!! ★
// ---------------------------------------------------------

const MENU = [
{ name: "홈", url: "./index.html" },
{ name: "오늘의 시장", url: "./pages/market.html" },
{ name: "종목 토론", url: "./pages/board.html" },
{ name: "내 정보", url: "./pages/mypage.html" },
];

function resolveSitePath(targetPath) {
  const currentPath = (location.pathname || "/").replace(/\\/g, "/");
  const isNested = currentPath.includes("/pages/");
  const cleanTarget = String(targetPath).replace(/^\/+/, "");
  return isNested ? "../" + cleanTarget : "./" + cleanTarget;
}

function renderNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;

  const here = (location.pathname || "/").replace(/\\/g, "/");

  const links = MENU.map(function (m) {
    const href = resolveSitePath(m.url);
    const expected = m.url.replace(/^\.\//, "/");
    const isHere = here === expected || here.endsWith(expected);
    return '<a href="' + href + '"' + (isHere ? ' class="on"' : "") + ">" + m.name + "</a>";
  }).join("");

  const me = currentUser
    ? "<span>" + currentUser.email + "</span>" +
      ' <button onclick="signOut()">로그아웃</button>'
    : '<a href="' + resolveSitePath("./index.html") + '">로그인</a>';

  const brand =
    '<a class="brand" href="' + resolveSitePath("./index.html") + '" aria-label="Stock Arena 홈">' +
      '<span class="brand-mark" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M3 17l5-5 3 3 4-6 6 4"/><path d="M3 21h18"/>' +
        '</svg>' +
      '</span>' +
      '<span><span class="brand-name">STOCK <span>ARENA</span></span>' +
      '<span class="brand-sub">MARKET // TERMINAL</span></span>' +
    '</a>';

  nav.innerHTML = brand +
                  '<div class="menu">' + links + "</div>" +
                  '<div class="me">' + me + "</div>";
}

// ---------------------------------------------------------
// FX: animated cyberpunk background (grid + particles + data streams)
// Injected once on every page. Respects prefers-reduced-motion.
// ---------------------------------------------------------
(function initArenaFX() {
  function build() {
    if (document.querySelector(".fx-root")) return;

    var root = document.createElement("div");
    root.className = "fx-root";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<canvas class="fx-canvas"></canvas>' +
      '<div class="fx-grid"></div>' +
      '<div class="fx-scan"></div>' +
      '<div class="fx-vignette"></div>';
    document.body.insertBefore(root, document.body.firstChild);

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    var canvas = root.querySelector(".fx-canvas");
    var ctx = canvas.getContext("2d");
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var streams = [];
    var lines = [];
    var COLORS = ["#00e5ff", "#2f7bff", "#a855f7", "#00ffa3"];

    function rand(a, b) { return a + Math.random() * (b - a); }

    function resize() {
      w = canvas.clientWidth = window.innerWidth;
      h = canvas.clientHeight = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      particles = [];
      var count = Math.min(90, Math.floor((w * h) / 22000));
      for (var i = 0; i < count; i++) {
        particles.push({
          x: rand(0, w), y: rand(0, h),
          vx: rand(-0.25, 0.25), vy: rand(-0.35, -0.05),
          r: rand(0.6, 2.1), a: rand(0.15, 0.7),
          c: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
      }
      streams = [];
      var scount = Math.max(6, Math.floor(w / 180));
      for (var j = 0; j < scount; j++) {
        streams.push({ x: rand(0, w), y: rand(-h, 0), len: rand(60, 180), speed: rand(1.2, 3.4), a: rand(0.05, 0.22) });
      }
      lines = [];
      for (var k = 0; k < 3; k++) {
        lines.push({ off: rand(0, 1000), amp: rand(24, 60), base: h * rand(0.35, 0.8), speed: rand(0.0006, 0.0016), c: COLORS[k % COLORS.length] });
      }
    }

    var t = 0;
    function frame() {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // animated background chart lines
      for (var li = 0; li < lines.length; li++) {
        var ln = lines[li];
        ctx.beginPath();
        for (var x = 0; x <= w; x += 14) {
          var y = ln.base
            + Math.sin((x * 0.008) + ln.off + t * ln.speed * 60) * ln.amp
            + Math.sin((x * 0.02) + t * ln.speed * 30) * (ln.amp * 0.4);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ln.c;
        ctx.globalAlpha = 0.08;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // falling data streams
      for (var si = 0; si < streams.length; si++) {
        var s = streams[si];
        var grad = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.len);
        grad.addColorStop(0, "rgba(0,229,255,0)");
        grad.addColorStop(1, "rgba(0,229,255," + s.a + ")");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y + s.len);
        ctx.stroke();
        s.y += s.speed;
        if (s.y > h) { s.y = rand(-h, -20); s.x = rand(0, w); }
      }

      // glowing particles + connections
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = rand(0, w); }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = p.a;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();

// ---------------------------------------------------------
// 3. 로그인 / 회원가입
// ---------------------------------------------------------

async function signUp() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await db.auth.signUp({ email, password });

  if (error) {
    console.error("가입 실패:", error);
    alert("가입 실패: " + error.message);
    return;
  }
  alert("가입 완료! 바로 로그인됩니다.");
}

async function signIn() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("로그인 실패:", error);
    alert("로그인 실패: " + error.message);
  }
}

async function signOut() {
  await db.auth.signOut();
  location.href = resolveSitePath("./index.html");
}

// ---------------------------------------------------------
// 4. 로그인 상태가 바뀔 때마다 자동 실행
// ---------------------------------------------------------
// 페이지를 처음 열 때도 한 번 실행되므로, 새로고침해도 로그인 유지됨
//
// ★★ 아래 pageReady를 지우면 로그인 화면 안뜨니까 꼭 남겨두기 ★★
//
// Supabase 는 첫 신호(INITIAL_SESSION)를 아주 빨리 보내서, 
// 이 파일 다음 줄에서 불러오는 페이지 전용 파일(home.js, board.js ...) 실행되기 전에 아래 콜백이 먼저 도는 일 발생
// 그러면 onAuthReady 아직 없어서 화면이 텅 빈 채로 남고, 페이지 스크립트가 모두 준비된 뒤에 실행되도록 한 번 기다리게 함

const pageReady = new Promise(function (resolve) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", resolve);
  } else {
    resolve();
  }
});

db.auth.onAuthStateChange(function (event, session) {
  currentUser = session ? session.user : null;

  pageReady.then(function () {
    renderNav();

    // <body data-require-auth="true"> 인 페이지는 로그인 안 하면 홈으로 보냅니다.
    if (!currentUser && document.body.dataset.requireAuth === "true") {
      location.href = resolveSitePath("./index.html");
      return;
    }

    // 각 페이지가 만들어 둔 준비 함수를 실행합니다.
    // 새 페이지에서도 onAuthReady 만 만들면 알아서 불립니다.
    if (typeof onAuthReady === "function") {
      onAuthReady();
    } else {
      // 있어야 할 함수가 없으면 조용히 넘어가지 말고 알려줍니다.
      console.warn(
        "onAuthReady 가 없습니다. 이 페이지의 전용 js(home.js, board.js ...)가 " +
        "제대로 불렸는지 확인하세요."
      );
    }
  });
});

// ---------------------------------------------------------
// 5. AI 부르기 (어느 페이지에서든 사용 가능)
// ---------------------------------------------------------
// 여기서 Groq를 직접 부르지 않는 것이 핵심입니다.
// 같은 사이트의 /api/ai 로만 요청하고, API 키는 서버에만 있습니다.

async function askAI(prompt) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("AI 호출 실패:", res.status, data.error);
    throw new Error(data.error);
  }
  return data.text;
}
