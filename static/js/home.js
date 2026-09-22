function onAuthReady() {
  const loginBox = document.getElementById("loginBox");
  const welcomeBox = document.getElementById("welcomeBox");
  const hello = document.getElementById("hello");
  if (!loginBox || !welcomeBox) return;

  loginBox.hidden = Boolean(currentUser);
  welcomeBox.hidden = !currentUser;
  if (currentUser && hello) {
    hello.textContent = currentUser.email.split("@")[0] + "님, 환영합니다.";
  }
  bindAIRecommendation();
}

function bindAIRecommendation() {
  const button = document.getElementById("aiRecommendBtn");
  if (!button || button.dataset.bound) return;
  button.dataset.bound = "true";
  button.addEventListener("click", async function () {
    const status = document.getElementById("aiRecommendationStatus");
    const result = document.getElementById("aiRecommendationResult");
    button.disabled = true;
    if (status) status.textContent = "시장 데이터를 읽고 AI가 분석하는 중...";
    try {
      const prompt = "한국 주식 학습용 대시보드의 오늘의 시장 브리핑을 작성해줘. 삼성전자, SK하이닉스, NAVER, LG화학, 삼성바이오로직스, 카카오를 대상으로 상승 가능성이 상대적으로 높은 종목 2개와 하락 위험이 큰 종목 1개를 고르고, 각 이유를 한 문장씩 설명해줘. 확정적 표현과 투자 권유는 금지하고 마지막에 학습용 예측이라는 문구를 붙여줘.";
      const text = await askAI(prompt);
      if (result) result.textContent = text;
      if (status) status.textContent = "Groq 분석 완료 · " + new Date().toLocaleTimeString("ko-KR");
    } catch (error) {
      if (result) result.textContent = "상승 관찰: 삼성전자, 카카오 · 변동성 주의: SK하이닉스. 외부 AI 연결 전에는 샘플 데이터 기준의 학습용 요약만 표시합니다.";
      if (status) status.textContent = "로컬 샘플 요약 표시 · API 연결 필요";
    } finally {
      button.disabled = false;
    }
  });
}
