<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>에코그래픽스 | 1개부터 만드는 셀프 인쇄물 제작</title>
<meta name="description" content="명함부터 스티커, 전단지까지 — 당일발송 셀프 인쇄물 제작 전문 에코그래픽스.">

<style>
  *{ box-sizing:border-box; }
  body{
    margin:0;
    font-family:sans-serif;
    color:#222;
    background:#fff;
  }
  a{ color:inherit; text-decoration:none; }

  .section{
    max-width:1080px;
    margin:0 auto;
    padding:22px 20px;
  }

  /* ---------- 상품 사진 블록 (열 개수는 관리자에서 블록별로 지정) ---------- */
  .product-grid{
    display:grid;
    gap:12px;
  }
  .product-photo-card{
    display:flex;
    flex-direction:column;
    border-radius:12px;
    overflow:hidden;
    background:#fff;
  }
  .product-photo-card .ppc-image{
    aspect-ratio:1/1;
    background:#f2f2f2;
    border-radius:12px;
    overflow:hidden;
  }
  .product-photo-card .ppc-image img{
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
  }
  .product-photo-card .ppc-info{
    padding:8px 2px 0;
  }
  .product-photo-card .ppc-label{
    font-size:12.5px;
    font-weight:600;
    color:#333;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .product-photo-card .ppc-price{
    margin-top:2px;
    font-size:14px;
    font-weight:800;
    color:#142230;
  }

  /* ---------- 미니사진 블록 (열 개수·모양은 블록별로 지정) ---------- */
  .mini-grid{
    display:grid;
    gap:8px;
  }
  .mini-photo-card{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:6px;
    text-align:center;
  }
  .mini-photo-card .mpc-shape{
    width:100%;
    aspect-ratio:1/1;
    overflow:hidden;
    background:#f2f2f2;
    border:1px solid #eee;
  }
  .mini-photo-card .mpc-shape img{
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
  }
  /* 모양 3종 */
  .mini-grid.shape-circle .mpc-shape{ border-radius:50%; }
  .mini-grid.shape-square .mpc-shape{ border-radius:10px; }
  .mini-grid.shape-hexagon .mpc-shape{
    border-radius:0;
    border:none;
    clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%);
  }
  .mini-photo-card .mpc-label{
    font-size:11px;
    font-weight:600;
    color:#444;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    width:100%;
  }

  .grid-empty{
    grid-column:1/-1;
    padding:28px 16px;
    text-align:center;
    color:#aaa;
    font-size:12.5px;
    border:1px dashed #ddd;
    border-radius:12px;
  }

  /* ---------- 더보기(펼치기) 버튼: 15블록 이후는 접어두고 눌러야 더 나옴 ---------- */
  #loadMoreWrap{
    display:none;
    text-align:center;
    padding:10px 20px 30px;
  }
  #loadMoreBtn{
    appearance:none;
    border:1px solid #ddd;
    background:#fafafa;
    color:#333;
    font-size:13.5px;
    font-weight:700;
    padding:12px 28px;
    border-radius:999px;
    cursor:pointer;
  }
  #loadMoreBtn:hover{ background:#f2f2f2; }

  /* 모바일에서는: 상품사진 = 좌우 2개씩 줄바꿈, 미니사진 = 항상 2줄이 되도록
     (줄당 개수는 JS에서 --mobile-cols로 계산해 넣어줌) 열 개수를 다시 잡음.
     열이 줄어드는 만큼 원/사진 크기는 자동으로 커짐. */
  @media (max-width:640px){
    .product-grid{
      grid-template-columns:repeat(2, 1fr) !important;
    }
    .mini-grid{
      grid-template-columns:repeat(var(--mobile-cols, 5), 1fr) !important;
      gap:6px;
    }
    .mini-grid .mpc-label{ font-size:10px; }
    .section{ padding-left:12px; padding-right:12px; }
  }
</style>
</head>
<body>

<div id="header-container"></div>

<!-- 관리자 페이지(myadmin_banners.html)에서 만든 순서 그대로, 상품사진/미니사진 블록이
     위→아래 순서로 여기 그려집니다. 블록 순서·열 개수·모양은 전부 관리자에서 지정 —
     이 파일은 다시 손 댈 필요 없음. -->
<div id="homeBlocksContainer"></div>
<div id="loadMoreWrap">
    <button id="loadMoreBtn" type="button">더보기</button>
</div>

<div id="footer-container"></div>

<script>
    fetch('../includes/header.html')
        .then(r => r.text())
        .then(d => {
            const container = document.getElementById('header-container');
            container.innerHTML = d;
            const scripts = container.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                newScript.textContent = oldScript.textContent;
                document.body.appendChild(newScript);
            });
        });

    fetch('../includes/footer.html')
        .then(r => r.text())
        .then(d => {
            const container = document.getElementById('footer-container');
            container.innerHTML = d;
            const scripts = container.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                document.body.appendChild(newScript);
            });
        });
</script>

<script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
    import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyBzHogA2iaUQqOOsNVL55stsdMH8lCQ4Ek",
        authDomain: "ecogr-636c6.firebaseapp.com",
        projectId: "ecogr-636c6",
        storageBucket: "ecogr-636c6.firebasestorage.app",
        messagingSenderId: "95745358447",
        appId: "1:95745358447:web:94cde53f6b36e6be95eb9a"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    function esc(s) {
        return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    // 예전에는 외부(http로 시작하는) 링크를 새 탭(target="_blank")으로 열었지만,
    // 지금은 내부/외부 상관없이 전부 같은 창(셀프)에서 열리도록 통일함.
    function itemLink(it){
        return '';
    }

    // 숫자만 입력했으면 "12,000원"처럼 자동으로 콤마+단위를 붙이고,
    // "1,000원부터"처럼 직접 텍스트를 입력했으면 그대로 보여줌
    function formatPrice(price){
        if(!price) return '';
        const trimmed = String(price).trim();
        if(/^\d+$/.test(trimmed)) return Number(trimmed).toLocaleString() + '원';
        return trimmed;
    }

    function renderProductBlock(block, idx){
        const cols = block.columns || 4;
        const items = Array.isArray(block.items) ? block.items : [];
        const cardsHtml = items.length
            ? items.map(it => `
                <a href="${esc(it.linkUrl || '#')}" class="product-photo-card" ${itemLink(it)}>
                    <div class="ppc-image"><img src="${esc(it.imageUrl)}" alt="${esc(it.label || '')}"></div>
                    ${(it.label || it.price) ? `
                    <div class="ppc-info">
                        ${it.label ? `<div class="ppc-label">${esc(it.label)}</div>` : ''}
                        ${it.price ? `<div class="ppc-price">${esc(formatPrice(it.price))}</div>` : ''}
                    </div>` : ''}
                </a>`).join('')
            : '<div class="grid-empty">등록된 사진이 없습니다.</div>';
        return `
        <div class="section" data-block-idx="${idx}">
            <div class="product-grid" style="grid-template-columns:repeat(${cols}, 1fr);">${cardsHtml}</div>
        </div>`;
    }

    function renderMiniBlock(block, idx){
        const cols = block.columns || 10;
        const shape = ['circle', 'square', 'hexagon'].includes(block.shape) ? block.shape : 'circle';
        const items = Array.isArray(block.items) ? block.items : [];
        // 모바일에서는 무조건 2줄이 되도록, 한 줄당 개수를 아이템 수의 절반(올림)으로 계산
        const mobileCols = Math.max(1, Math.ceil(items.length / 2)) || 5;
        const cardsHtml = items.length
            ? items.map(it => `
                <a href="${esc(it.linkUrl || '#')}" class="mini-photo-card" ${itemLink(it)}>
                    <span class="mpc-shape"><img src="${esc(it.imageUrl)}" alt="${esc(it.label || '')}"></span>
                    ${it.label ? `<span class="mpc-label">${esc(it.label)}</span>` : ''}
                </a>`).join('')
            : '<div class="grid-empty">등록된 사진이 없습니다.</div>';
        return `
        <div class="section" data-block-idx="${idx}">
            <div class="mini-grid shape-${shape}" style="grid-template-columns:repeat(${cols}, 1fr); --mobile-cols:${mobileCols};">${cardsHtml}</div>
        </div>`;
    }

    // ---------- 15블록씩 "더보기"로 펼치기 ----------
    // 검색엔진(구글) 크롤러가 페이지를 읽을 때는 전체 블록이 이미 DOM에 다 들어있어야
    // 인식하기 좋으므로, 여기서는 "안 보이는 블록을 나중에 새로 불러오는" 방식이 아니라
    // 처음부터 전부 렌더링해두고 CSS(display:none)로만 접어둔다. 그래서 15블록 이후도
    // 검색엔진에는 그대로 노출되고, 사람 눈에는 "더보기"를 눌러야 나오는 방식이 된다.
    const BLOCKS_PER_PAGE = 15;
    let totalBlocksCount = 0;
    let visibleBlocksCount = 0;

    function updateLoadMoreUI(){
        const wrap = document.getElementById('loadMoreWrap');
        const btn = document.getElementById('loadMoreBtn');
        if (visibleBlocksCount >= totalBlocksCount) {
            wrap.style.display = 'none';
            return;
        }
        const remaining = totalBlocksCount - visibleBlocksCount;
        btn.textContent = `더보기 (남은 섹션 ${remaining}개)`;
        wrap.style.display = 'block';
    }

    function applyBlockVisibility(container){
        container.querySelectorAll('[data-block-idx]').forEach(sec => {
            const idx = parseInt(sec.dataset.blockIdx, 10);
            sec.style.display = idx < visibleBlocksCount ? '' : 'none';
        });
        updateLoadMoreUI();
    }

    document.getElementById('loadMoreBtn').addEventListener('click', () => {
        visibleBlocksCount = Math.min(visibleBlocksCount + BLOCKS_PER_PAGE, totalBlocksCount);
        applyBlockVisibility(document.getElementById('homeBlocksContainer'));
    });

    async function loadHomeBlocks(){
        const container = document.getElementById('homeBlocksContainer');
        try {
            const snap = await getDocs(query(collection(db, 'homeBlocks'), orderBy('order', 'asc')));
            if (snap.empty) {
                container.innerHTML = '<div class="section"><div class="grid-empty">등록된 섹션이 없습니다. 관리자 페이지에서 추가해주세요.</div></div>';
                return;
            }
            container.innerHTML = snap.docs.map((d, idx) => {
                const block = d.data();
                return block.type === 'miniPhotos' ? renderMiniBlock(block, idx) : renderProductBlock(block, idx);
            }).join('');

            totalBlocksCount = snap.docs.length;
            visibleBlocksCount = Math.min(BLOCKS_PER_PAGE, totalBlocksCount);
            applyBlockVisibility(container);
        } catch (err) {
            console.error('홈 화면 블록을 불러오지 못했습니다:', err);
            container.innerHTML = '<div class="section"><div class="grid-empty">불러오지 못했습니다.</div></div>';
        }
    }

    loadHomeBlocks();
</script>

</body>
</html>
