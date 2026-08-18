/**
 * ===================================================================
 * 포트원(PortOne) V2 웹훅 수신 코드 — 기존 Worker에 추가하세요
 * ===================================================================
 *
 * [사전 준비 - 아래 3개 값을 관리자콘솔에서 찾아 채워주세요]
 *
 * 1) PORTONE_WEBHOOK_SECRET
 *    - 관리자콘솔 > 결제 연동 > 연동 관리 > 결제알림(Webhook) 관리 > 웹훅버전(V2)
 *    - Endpoint URL 등록하면 옆에 "Webhook Secret" 이 보여요 (whsec_ 로 시작)
 *
 * 2) PORTONE_API_SECRET
 *    - 관리자콘솔 > 결제 연동 > 연동 관리 > 식별코드 · API Keys
 *    - "V2 API Keys" 섹션의 Secret Key
 *
 * 3) FIREBASE_PROJECT_ID
 *    - payment.html 에 이미 있는 값: "ecogr-636c6"
 *
 * 실제 값은 Worker 코드에 직접 쓰지 말고,
 * Cloudflare 대시보드 > Worker > Settings > Variables 에서
 * 환경변수(Secret)로 등록해서 env.PORTONE_WEBHOOK_SECRET 형태로 쓰는 걸 추천해요.
 * (아래 코드는 env.XXX 로 이미 그렇게 되어 있습니다)
 * ===================================================================
 */

// 기존 worker의 fetch 핸들러 안에서, 아래처럼 라우팅을 분기해주세요.
// 예: export default { async fetch(request, env) { const url = new URL(request.url);
//        if (url.pathname === "/webhook") return handleWebhook(request, env);
//        ... 기존 로직 ... } }

async function handleWebhook(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.text();

  // ---- 1. 웹훅 서명 검증 (포트원 V2는 Svix 표준 방식) ----
  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return new Response("Missing headers", { status: 400 });
  }

  const isValid = await verifyWebhookSignature(
    env.PORTONE_WEBHOOK_SECRET,
    webhookId,
    webhookTimestamp,
    body,
    webhookSignature
  );

  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // ---- 2. 이벤트 파싱 ----
  const event = JSON.parse(body);

  // 결제 완료 이벤트만 처리 (그 외 타입은 무시하고 200 응답)
  if (event.type !== "Transaction.Paid") {
    return new Response("ignored", { status: 200 });
  }

  const paymentId = event.data.paymentId;

  // ---- 3. 포트원 API로 실제 결제 상세 조회 (금액, 결제수단 등) ----
  const paymentRes = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: `PortOne ${env.PORTONE_API_SECRET}` },
    }
  );

  if (!paymentRes.ok) {
    console.error("결제 조회 실패", await paymentRes.text());
    return new Response("payment lookup failed", { status: 500 });
  }

  const payment = await paymentRes.json();

  // ---- 4. Firestore에 기록 (관리자 페이지가 이걸 실시간으로 봄) ----
  await saveToFirestore(env.FIREBASE_PROJECT_ID, {
    paymentId: paymentId,
    amount: payment.amount?.total ?? 0,
    payMethod: payment.method?.type ?? "UNKNOWN",
    orderName: payment.orderName ?? "",
    status: payment.status ?? "PAID",
    paidAt: payment.paidAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  return new Response("ok", { status: 200 });
}

// Svix 표준 서명 검증 (HMAC-SHA256)
async function verifyWebhookSignature(secret, id, timestamp, body, signatureHeader) {
  const secretBytes = base64Decode(secret.replace("whsec_", ""));
  const signedContent = `${id}.${timestamp}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent)
  );

  const expectedSig = base64Encode(new Uint8Array(sigBuffer));

  // signatureHeader 는 "v1,base64sig v1,base64sig2 ..." 형태로 여러 개 올 수 있음
  const candidates = signatureHeader.split(" ").map((s) => s.split(",")[1]);
  return candidates.includes(expectedSig);
}

function base64Decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Firestore REST API로 문서 추가 (기존 규칙이 열려있다는 전제 - payment.html과 동일한 조건)
async function saveToFirestore(projectId, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/webhook_payments`;

  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number") fields[key] = { integerValue: value };
    else fields[key] = { stringValue: String(value) };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    console.error("Firestore 저장 실패", await res.text());
  }
}
