const BOARD_STORAGE_KEY = "stock_arena_board_posts_v1";

function getBoardPosts() {
  try {
    const value = localStorage.getItem(BOARD_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveBoardPosts(posts) {
  localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(posts));
}

function setComposerIdentity() {
  const avatar = document.getElementById("composerAvatar");
  const name = document.getElementById("composerName");
  if (avatar && currentUser) {
    avatar.textContent = (currentUser.email || "U").slice(0, 1).toUpperCase();
  }
  if (name) {
    name.textContent = currentUser ? (currentUser.email || "사용자").split("@")[0] : "사용자";
  }
}

function onAuthReady() {
  setComposerIdentity();
  loadPosts();
}

async function loadPosts() {
  const list = document.getElementById("list");
  if (!list) return;

  try {
    if (window.db && typeof window.db.from === "function") {
      const { data, error } = await db
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && Array.isArray(data) && data.length > 0) {
        renderPosts(data);
        return;
      }
    }
  } catch (error) {
    console.warn("Supabase 게시판 연결이 비활성 상태라 로컬 포스트를 사용합니다.", error);
  }

  renderPosts(getBoardPosts());
}

function renderPosts(items) {
  const list = document.getElementById("list");
  if (!list) return;

  if (!items.length) {
    list.innerHTML = '<div class="community-post"><div class="post-content">아직 작성된 종목토론이 없습니다. 첫 메시지를 남겨보세요.</div></div>';
    return;
  }

  list.innerHTML = items.map(function (post) {
    const userName = post.nickname || "사용자";
    const content = post.content || "";
    const createdAt = post.created_at || new Date().toISOString();
    const isMine = currentUser && post.user_id === currentUser.id;
    const deleteBtn = isMine ? '<button type="button" onclick="deletePost(' + (post.id || 0) + ')">삭제</button>' : "";

    return '<article class="community-post"><div class="post-head"><div class="post-user"><div class="avatar">' + (userName.slice(0, 1) || "U").toUpperCase() + '</div><strong>' + userName + '</strong></div><span class="post-time">' + new Date(createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + '</span></div><div class="post-content">' + escapeHtml(content) + '</div><div class="post-actions"><span>반응 0</span><span>공유 0</span>' + deleteBtn + '</div></article>';
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function addPost() {
  const box = document.getElementById("content");
  const content = (box ? box.value.trim() : "");
  if (!content) return;

  const nickname = currentUser ? (currentUser.email || "사용자").split("@")[0] : "익명의 투자자";

  try {
    if (window.db && typeof window.db.from === "function") {
      const { error } = await db.from("posts").insert({
        content: content,
        nickname: nickname,
        user_id: currentUser ? currentUser.id : null,
      });

      if (!error) {
        box.value = "";
        loadPosts();
        return;
      }
      console.warn("Supabase 저장 실패, 로컬 저장으로 대체합니다.", error);
    }
  } catch (error) {
    console.warn("DB 게시 등록 실패, 로컬 저장으로 전환합니다.", error);
  }

  const posts = getBoardPosts();
  posts.unshift({
    id: Date.now(),
    nickname: nickname,
    content: content,
    created_at: new Date().toISOString(),
    user_id: currentUser ? currentUser.id : null,
  });
  saveBoardPosts(posts);
  box.value = "";
  renderPosts(posts);
}

async function deletePost(id) {
  try {
    if (window.db && typeof window.db.from === "function") {
      const { error } = await db.from("posts").delete().eq("id", id);
      if (!error) {
        loadPosts();
        return;
      }
      console.warn("Supabase 삭제 실패, 로컬 삭제로 대체합니다.", error);
    }
  } catch (error) {
    console.warn("DB 삭제 실패, 로컬 삭제로 전환합니다.", error);
  }

  const posts = getBoardPosts().filter(function (post) {
    return Number(post.id) !== Number(id);
  });
  saveBoardPosts(posts);
  renderPosts(posts);
}

async function polish() {
  const content = document.getElementById("content").value.trim();
  if (!content) return;

  const btn = document.getElementById("aiBtn");
  const box = document.getElementById("aiBox");

  if (btn) btn.disabled = true;
  if (box) box.textContent = "문장을 다듬는 중...";

  try {
    const text = await askAI("다음 문장을 투자자 커뮤니티 톤으로 자연스럽게 정리해줘. 1문장으로만 답해줘: " + content);
    if (box) box.textContent = text;
  } catch (error) {
    const fallback = content.replace(/\s+/g, " ").trim();
    if (box) box.textContent = "AI 보조 문구: " + fallback + " — 시장 관찰 포인트가 분명합니다.";
  } finally {
    if (btn) btn.disabled = false;
  }
}
