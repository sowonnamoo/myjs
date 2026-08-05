(function(){
  "use strict";

  // 캔버스를 90도씩 회전(rotateCanvas90)시킨 누적 각도(0/90/180/270).
  // 오브젝트 선택 시 뜨는 P/T 미니버튼과 그 버튼을 눌러 여는 팝업창들이 이 값만큼 함께 회전 표시됨.
  window.EP = window.EP || {};
  EP.canvasRotationDeg = EP.canvasRotationDeg || 0;

  // 모바일 화면(좁은 폭) 여부를 어디서든 확인할 수 있는 공용 헬퍼.
  // 예전엔 기기 종류(UA)로 판별해서 <html class="ep-mobile-mode">를 붙이는 방식이었는데,
  // 이제는 순수하게 "화면 폭"만 보고 자동 판단함 — ecopro3.css의 @media(max-width:900px)와
  // 같은 기준(900px)이라 CSS가 모바일 UI를 보여주는 시점과 항상 정확히 일치함.
  // 오브젝트 선택 시 뜨는 주사위(M/P)·T·J·Z 미니버튼들을 모바일에서만 숨기는 데 씀
  // (ecopro3.js/c/m/j/z 등 여러 파일에서 공통으로 참조)
  EP.isMobileModeActive = function(){
    return window.innerWidth <= 900;
  };

  /* ============================================================
     1. URL 쿼리 파라미터 읽기
     예) editor.html?count=3&width=90&height=50&type=양면인쇄
     - count  : 디자인 건수 (없으면 1)
     - width / height : 캔버스 가로세로 비율(mm 등, 붉은 재단선 기준)
     - 값 중 어딘가에 "양면"이 포함되면 앞/뒤 양면 작업으로 처리
  ============================================================ */
  const urlParams = new URLSearchParams(window.location.search);
  const orderData = {};
  let hasDouble = false;
  for (const [key, value] of urlParams.entries()) {
    const decoded = decodeURIComponent(value);
    orderData[key] = decoded;
    if (decoded.includes('양면')) hasDouble = true;
  }
  const count = Math.max(1, parseInt(orderData.count, 10) || 1);
  const isDouble = hasDouble;
  let ratioW = parseInt(orderData.width, 10) || 16;
  let ratioH = parseInt(orderData.height, 10) || 9;

  /* ============================================================
     2. 캔버스 초기화 (쿼리의 가로:세로 비율에 맞춰 크기 결정)
  ============================================================ */
  const canvasWrap = document.getElementById('canvasWrap');
  const wrapRect = canvasWrap.getBoundingClientRect();
  const maxW = Math.min(wrapRect.width - 60, 900);
  let CANVAS_W = Math.max(320, Math.round(maxW));
  let CANVAS_H = Math.max(200, Math.round(CANVAS_W * (ratioH / ratioW)));

  const canvas = new fabric.Canvas('mainCanvas', {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    perPixelTargetFind: false // 투명한 부분(예: 자동누끼로 지운 배경)을 클릭해도 바운딩박스 기준으로 선택되게 함
  });

  /* ============================================================
     2b. 회전 핸들 커스텀 아이콘
     - 오브젝트(텍스트/도형/이미지) 선택 시 위쪽에 뜨는 회전 컨트롤을
       기본 원형 점 대신 빨간 곡선 화살표(양방향 회전) 아이콘으로 표시
  ============================================================ */
  (function setupCustomRotateIcon(){
    function drawArrowHead(ctx, angleRad, r, forward, color){
      ctx.save();
      ctx.rotate(angleRad);
      ctx.translate(r, 0);
      const dir = forward ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(0, dir * 8);
      ctx.lineTo(-5, dir * 1);
      ctx.lineTo(5, dir * 1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    function renderRotateIcon(ctx, left, top /*, styleOverride, fabricObject */){
      const red = '#e74c3c';
      const r = 8;
      const gapDeg = 55;
      const startDeg = 90 + gapDeg / 2;
      const endDeg = startDeg + (360 - gapDeg);
      const startRad = startDeg * Math.PI / 180;
      const endRad = endDeg * Math.PI / 180;

      ctx.save();
      ctx.translate(left, top);

      // 흰 배경 원 (아이콘 가독성용)
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#dfe4ea';
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = red;
      ctx.beginPath();
      ctx.arc(0, 0, r, startRad, endRad);
      ctx.stroke();

      drawArrowHead(ctx, startRad, r, false, red);
      drawArrowHead(ctx, endRad, r, true, red);

      ctx.restore();
    }

    // 모바일 최적화: 리사이즈 핸들·회전 핸들·T/주사위/J/Z 버튼 전부, 눈에 보이는 크기는 그대로 두고
    // "터치로 인식되는 범위"만 넉넉하게 넓힘(기본값 24px → 44px). 화면엔 안 보이지만 그 반경
    // 안에서는 어디를 눌러도 인식되므로, 손가락으로 정확히 맞추기 훨씬 편해짐(마우스는 영향 없음).
    fabric.Object.prototype.touchCornerSize = 44;

    const cu = fabric.controlsUtils || {};
    fabric.Object.prototype.controls.mtr = new fabric.Control({
      x: 0,
      y: 0.5,
      offsetY: 36,
      withConnection: true,
      cursorStyle: 'grab',
      cursorStyleHandler: cu.rotationStyleHandler,
      actionHandler: cu.rotationWithSnapping,
      actionName: 'rotate',
      render: renderRotateIcon
    });
  })();

  /* ============================================================
     2c. 텍스트 전용 "T" 버튼 컨트롤 → 글꼴/투명도 플로팅 패널
     - 텍스트(IText) 오브젝트를 선택하면 우측에 보라색 T 버튼이 뜨고,
       클릭하면 글꼴 선택 + 투명도 게이지가 있는 작은 패널이 근처에 나타남
  ============================================================ */
  (function setupTextFontControl(){
    function renderTButton(ctx, left, top, styleOverride, fabricObject){
      // 모바일에서도 T 버튼만은 예외적으로 보이게 함(요청에 따라) — 도형쪽 M/P/J/Z 등
      // 나머지 미니 버튼들은 계속 모바일에서 숨김 처리됨(각 파일의 isMobileModeActive 체크 유지).
      // 여러 개를 묶어 선택했거나(활성선택) 묶기로 그룹화한 경우: 텍스트뿐 아니라 이미지가 섞여 있어도
      // (정렬 기능은 이미지에도 필요하므로) 2개 이상의 유효한 오브젝트만 있으면 T 버튼을 보여줌
      if (fabricObject && (fabricObject.type === 'activeSelection' || fabricObject.type === 'group')) {
        const objs = fabricObject.getObjects().filter(o => !o.isGuide);
        if (objs.length < 2) return;
      }
      ctx.save();
      ctx.translate(left, top);
      ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#6c3ce0';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('T', 0, 1);
      ctx.restore();
    }

    const tControl = new fabric.Control({
      x: 0.5, y: -0.5,
      offsetX: 20, offsetY: -36,
      sizeX: 28, sizeY: 28, // 그려지는 원(반지름14=지름28) 전체가 클릭 영역이 되도록 맞춤(기본값은 이보다 작아서 글자 부분만 눌리는 것처럼 느껴졌음)
      cursorStyle: 'pointer',
      render: renderTButton,
      mouseUpHandler: function(eventData, transformData){
        const target = transformData && transformData.target;
        if (!target) return true;
        if (target.isEditing) target.exitEditing(); // 모바일에서 편집 상태가 남아있으면 필터가 안 그려지므로 확실히 빠져나옴
        if (!fontPopover.classList.contains('hidden')) { hideFontPopover(); return true; } // 이미 열려있으면 다시 눌렀을 때 닫힘(토글)
        openFontPopover(target);
        return true;
      }
    });

    // 텍스트(IText) 단일 선택에 T 버튼이 보이도록 별도 컨트롤셋 복제(다른 오브젝트엔 영향 없음)
    fabric.IText.prototype.controls = Object.assign({}, fabric.Object.prototype.controls, { tFont: tControl });
    // 여러 텍스트를 드래그로 묶어 선택했을 때도 T 버튼이 뜨도록 활성선택(그룹)에도 추가
    // (renderTButton 내부에서 전부 텍스트일 때만 실제로 그려짐)
    fabric.ActiveSelection.prototype.controls = Object.assign({}, fabric.ActiveSelection.prototype.controls, { tFont: tControl });
    // "묶기"로 만든 영구 그룹에도 동일하게 T 버튼 지원
    fabric.Group.prototype.controls = Object.assign({}, fabric.Group.prototype.controls, { tFont: tControl });
  })();

  /* ============================================================
     회전 가능한 플로팅 팝업(T 글꼴창 / P 필터창) 공용 유틸
     - 캔버스를 90도 회전(rotateCanvas90)시키면 이 팝업들도 같은 각도로 함께 회전 표시됨
     - 90/270도로 회전하면 화면에 실제로 보이는 가로·세로가 서로 뒤바뀌므로,
       화면 밖으로 나가지 않게 클램프할 땐 "회전된 뒤의 크기" 기준으로 계산해야 함
       (중심점은 회전해도 움직이지 않으므로, 중심점 기준으로 클램프한 뒤 좌상단 좌표로 환산)
  ============================================================ */
  function clampPopoverCenter(cx, cy, pw, ph, rotDeg){
    const d = ((rotDeg || 0) % 360 + 360) % 360;
    const vw = (d === 90 || d === 270) ? ph : pw; // 화면상 실제 가로폭
    const vh = (d === 90 || d === 270) ? pw : ph; // 화면상 실제 세로높이
    return {
      cx: Math.min(Math.max(vw / 2 + 8, cx), window.innerWidth - vw / 2 - 8),
      cy: Math.min(Math.max(vh / 2 + 8, cy), window.innerHeight - vh / 2 - 8)
    };
  }
  function clampPopoverRect(left, top, pw, ph, rotDeg){
    const c = clampPopoverCenter(left + pw / 2, top + ph / 2, pw, ph, rotDeg);
    return { left: c.cx - pw / 2, top: c.cy - ph / 2 };
  }
  function applyPopoverRotationStyle(el){
    el.style.transform = EP.canvasRotationDeg ? ('rotate(' + EP.canvasRotationDeg + 'deg)') : '';
  }
  EP.clampPopoverCenter = clampPopoverCenter;
  EP.clampPopoverRect = clampPopoverRect;
  EP.applyPopoverRotationStyle = applyPopoverRotationStyle;
  EP.rotatablePopovers = EP.rotatablePopovers || [];
  EP.registerRotatablePopover = function(el){ EP.rotatablePopovers.push(el); };

  /* ============================================================
     여러 필터 팝업(T 글꼴 / P 텍스트필터 / M 도형필터 / J 공통필터 / Z 이미지블렌드필터)이
     동시에 열려있을 때 서로 겹쳐서 뒤에 있는 창을 가리지 않도록, "이미 열려있는 다른 팝업과
     겹치면 그 옆으로 밀어서" 위치를 잡아주는 범용 유틸. 각 팝업 파일에서
     EP.registerFilterPopover(el)로 자기 팝업 엘리먼트를 등록해두면, 위치를 잡을 때
     EP.findNonOverlappingPosition(el, left, top, pw, ph)를 불러써서 자동으로 피해감.
  ============================================================ */
  EP.filterPopovers = EP.filterPopovers || [];
  EP.registerFilterPopover = function(el){ EP.filterPopovers.push(el); };
  EP.findNonOverlappingPosition = function(popoverEl, left, top, pw, ph){
    const others = EP.filterPopovers.filter(function(p){ return p && p !== popoverEl && !p.classList.contains('hidden'); });
    if (!others.length) return { left, top };
    function collidesWithAny(l, t){
      return others.some(function(o){
        const r = o.getBoundingClientRect();
        return !(l + pw <= r.left || l >= r.right || t + ph <= r.top || t >= r.bottom);
      });
    }
    if (!collidesWithAny(left, top)) return { left, top };
    // 겹치면: 지금 열려있는 다른 팝업들 중 가장 오른쪽 끝 바로 옆으로 붙여서 다시 시도.
    // 그래도 겹치면(팝업이 3개 이상 겹쳐있는 경우 등) 한 번 더 오른쪽으로 밀어서 재시도.
    for (let attempt = 0; attempt < others.length + 1; attempt++) {
      const rightmost = others.reduce(function(acc, o){ return Math.max(acc, o.getBoundingClientRect().right); }, left);
      left = rightmost + 12;
      if (!collidesWithAny(left, top)) break;
    }
    return { left, top };
  };

  // 캔버스 회전 버튼을 누른 그 순간, 지금 열려있는 팝업(들)도 즉시 같은 각도로 재배치
  EP.refreshRotatablePopovers = function(){
    EP.rotatablePopovers.forEach(function(el){
      if (!el) return;
      if (el.classList.contains('hidden')) { el.style.transform = ''; return; }
      const pw = el.offsetWidth, ph = el.offsetHeight;
      const curLeft = parseFloat(el.style.left) || 0;
      const curTop = parseFloat(el.style.top) || 0;
      const r = clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      applyPopoverRotationStyle(el);
    });
  };

  function makeDraggablePopover(el){
    let dragging = false, dcx = 0, dcy = 0; // 마우스 시작점 → 박스 "중심"까지의 오프셋(회전은 중심 기준이라 이렇게 재면 회전 상태에서도 어긋나지 않음)
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('select, input, textarea, button, .cmyk-picker, .cmyk-popover')) return;
      // 우측 하단 모서리(약 16px 이내)는 브라우저 기본 리사이즈 손잡이 영역일 수 있으므로,
      // 여기를 누르면 이동 드래그를 시작하지 않고 그대로 둬서 리사이즈가 우선되게 함
      const rr = el.getBoundingClientRect();
      if ((rr.right - e.clientX) < 16 && (rr.bottom - e.clientY) < 16) return;
      dragging = true;
      const r = rr; // 회전이 적용된 실제 화면상 사각형 기준
      dcx = e.clientX - (r.left + r.width / 2);
      dcy = e.clientY - (r.top + r.height / 2);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const pw = el.offsetWidth, ph = el.offsetHeight;
      const c = clampPopoverCenter(e.clientX - dcx, e.clientY - dcy, pw, ph, EP.canvasRotationDeg);
      el.style.left = (c.cx - pw / 2) + 'px';
      el.style.top = (c.cy - ph / 2) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  const fontPopover = document.getElementById('fontPopover');
  const floatingFontSelect = document.getElementById('floatingFontSelect');
  const floatingFontSizeInput = document.getElementById('floatingFontSizeInput');
  const floatingOpacityInput = document.getElementById('floatingOpacityInput');
  const colorGaugeInput = document.getElementById('colorGaugeInput');
  const fontColorSwatch = document.getElementById('fontColorSwatch');
  const fontPopoverMoreBtn = document.getElementById('fontPopoverMoreBtn');
  const fontPopoverMore = document.getElementById('fontPopoverMore');
  const boxGapPxInput = document.getElementById('boxGapPxInput');
  const letterSpacingGauge = document.getElementById('letterSpacingGauge');
  const groupToggleBtn = document.getElementById('groupToggleBtn');
  const floatingBoldBtn = document.getElementById('floatingBoldBtn');
  const floatingItalicBtn = document.getElementById('floatingItalicBtn');
  const floatingUnderlineBtn = document.getElementById('floatingUnderlineBtn');
  const floatingAlignLeftBtn = document.getElementById('floatingAlignLeftBtn');
  const floatingAlignCenterBtn = document.getElementById('floatingAlignCenterBtn');
  const floatingAlignRightBtn = document.getElementById('floatingAlignRightBtn');
  let fontPopoverTargets = []; // 이 미니 창이 현재 편집 중인 텍스트 목록(선택 해제와 무관하게 유지)

  function updateOpacityGaugeFill(v){
    floatingOpacityInput.style.setProperty('--fill', Math.round((v != null ? v : 1) * 100) + '%');
  }

  // 자간(글자 사이 간격)을 "픽셀" 감각으로 다루기 위한 변환
  // fabric의 charSpacing은 폰트 크기의 1/1000 단위이므로, 각 텍스트의 fontSize 기준으로 환산
  const LETTER_SPACING_MIN = -20, LETTER_SPACING_MAX = 100;
  function charSpacingToPx(cs, fontSize){
    return Math.round(((cs || 0) / 1000) * (fontSize || 40));
  }
  function pxToCharSpacing(px, fontSize){
    return Math.round((px / (fontSize || 40)) * 1000);
  }
  function updateLetterSpacingGaugeFill(px){
    const pct = ((px - LETTER_SPACING_MIN) / (LETTER_SPACING_MAX - LETTER_SPACING_MIN)) * 100;
    letterSpacingGauge.style.setProperty('--fill', Math.round(Math.max(0, Math.min(100, pct))) + '%');
  }

  function hideFontPopover(){
    fontPopover.classList.add('hidden');
    fontPopoverTargets = [];
    setFontPopoverMoreOpen(true);
  }

  // "더보기" 펼침/접기 상태 전환 (열림 상태에 따라 버튼 라벨도 함께 바뀜)
  function setFontPopoverMoreOpen(open){
    fontPopoverMore.classList.toggle('hidden', !open);
    fontPopoverMoreBtn.textContent = open ? '접기 ▴' : '더보기 ▾';
    fontPopoverMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function positionFontPopover(target){
    fontPopover.classList.remove('hidden');
    const pw = fontPopover.offsetWidth || 210;
    const ph = fontPopover.offsetHeight || 110;

    const br = target.getBoundingRect(true, true); // 캔버스 논리좌표(줌 반영 전)
    const canvasRect = canvas.upperCanvasEl.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.getWidth();
    const scaleY = canvasRect.height / canvas.getHeight();
    const z = canvas.getZoom();

    const objLeft = canvasRect.left + br.left * z * scaleX;
    const objTop = canvasRect.top + br.top * z * scaleY;
    const objW = br.width * z * scaleX;
    const objH = br.height * z * scaleY;

    let left = objLeft + objW / 2 - pw / 2;
    let top = objTop + objH + 14;
    if (top + ph > window.innerHeight - 8) top = objTop - ph - 14; // 아래 공간 부족하면 위쪽에 표시

    // P/M/J/Z 등 다른 필터 팝업이 이미 열려있어서 이 자리와 겹치면, 그 옆으로 자동으로 밀어서 배치
    const avoided = EP.findNonOverlappingPosition(fontPopover, left, top, pw, ph);
    left = avoided.left; top = avoided.top;

    const r2 = clampPopoverRect(left, top, pw, ph, EP.canvasRotationDeg);
    fontPopover.style.left = r2.left + 'px';
    fontPopover.style.top = r2.top + 'px';
    applyPopoverRotationStyle(fontPopover);
  }

  // 더보기 펼침/접기로 창 높이가 바뀔 때: 텍스트 아래(6시 방향)로 재배치하지 않고,
  // 현재 위치(사용자가 드래그해둔 자리 포함)를 그대로 유지한 채 화면 밖으로만 안 나가게 조정
  function clampFontPopoverToViewport(){
    const pw = fontPopover.offsetWidth || 210;
    const ph = fontPopover.offsetHeight || 110;
    const curLeft = parseFloat(fontPopover.style.left) || 0;
    const curTop = parseFloat(fontPopover.style.top) || 0;
    const r = clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
    fontPopover.style.left = r.left + 'px';
    fontPopover.style.top = r.top + 'px';
  }

  // 게이지 맨 좌측(0%): 흰색 → 빨강(M100 Y100) → 노랑(Y100) → 흰색(얇게)
  // 중간(12~84%): 기존 무지개 스펙트럼 / 우측(84~100%): 회색 → 검정
  const GAUGE_STOPS = [
    { p: 0,   hex: '#ffffff' },
    { p: 3,   hex: '#ff0000' },
    { p: 7,   hex: '#ffff00' },
    { p: 9,   hex: '#ffffff' },
    { p: 12,  hex: '#ff0000' },
    { p: 24,  hex: '#ff9900' },
    { p: 36,  hex: '#ffee00' },
    { p: 48,  hex: '#33cc33' },
    { p: 60,  hex: '#00cccc' },
    { p: 72,  hex: '#3366ff' },
    { p: 84,  hex: '#9933ff' },
    { p: 92,  hex: '#888888' },
    { p: 100, hex: '#000000' }
  ];
  const GAUGE_CORNER_POS = 3;  // "저 모서리지점" — 빨강
  const GAUGE_YELLOW_POS = 7;  // "노란색 좌표" — 노랑
  const GAUGE_TRIGGER_MIN = 75, GAUGE_TRIGGER_MAX = 203; // 기존 CMYK 피커 차단 구간(Hue)과 동일

  function gaugePosToHex(pct){
    pct = Math.max(0, Math.min(100, pct));
    let a = GAUGE_STOPS[0], b = GAUGE_STOPS[GAUGE_STOPS.length - 1];
    for (let i = 0; i < GAUGE_STOPS.length - 1; i++) {
      if (pct >= GAUGE_STOPS[i].p && pct <= GAUGE_STOPS[i + 1].p) { a = GAUGE_STOPS[i]; b = GAUGE_STOPS[i + 1]; break; }
    }
    const span = b.p - a.p || 1;
    const t = (pct - a.p) / span;
    const c1 = hexToRgb(a.hex), c2 = hexToRgb(b.hex);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const bl = Math.round(c1.b + (c2.b - c1.b) * t);
    return rgbToHex(r, g, bl);
  }

  // T 팝업이 편집할 대상: 드래그로 여러 오브젝트를 묶어 선택했거나 "묶기"로 그룹화한 경우엔 그 묶음 전체
  // (정렬 기능은 이미지에도 필요하므로 텍스트로 제한하지 않음), 묶지 않고 텍스트 하나만 선택한 경우엔 그 하나만.
  function textBoxesFromTarget(target){
    if (!target) return [];
    if (target.type === 'activeSelection' || target.type === 'group') {
      return target.getObjects().filter(o => !o.isGuide);
    }
    return (!target.isGuide && isTextObject(target)) ? [target] : [];
  }

  // P(필터)/주사위 전용: textBoxesFromTarget과 달리 단일 도형(사각형/원/삼각형/패스)도 대상에 포함시킴.
  // T(폰트) 팝업 쪽 로직에 영향 주지 않도록 별도 함수로 분리해둠.
  function qaTargetsFromTarget(target){
    if (!target) return [];
    if (target.type === 'activeSelection' || target.type === 'group') {
      return target.getObjects().filter(o => !o.isGuide);
    }
    if (target.isGuide) return [];
    return (isTextObject(target) || isShapeObject(target)) ? [target] : [];
  }

  function openFontPopover(target, opts){
    const boxes = textBoxesFromTarget(target);
    if (!boxes.length) return;
    const wasHidden = fontPopover.classList.contains('hidden');
    fontPopoverTargets = boxes; // 팝업이 붙잡을 텍스트 목록 (이후 선택이 풀려도 이 목록을 계속 편집)
    const anchor = boxes.find(isTextObject) || boxes[0]; // 초기값 표시 기준 (섞여 있으면 텍스트를 우선)
    floatingFontSelect.value = anchor.fontFamily || 'Pretendard';
    floatingFontSizeInput.value = Math.round(anchor.fontSize || 40);
    const v = anchor.opacity != null ? anchor.opacity : 1;
    floatingOpacityInput.value = v;
    updateOpacityGaugeFill(v);

    const curHex = toHex(anchor.fill) || '#222222';
    const rgb = hexToRgb(curHex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const inZone = hsv.h >= GAUGE_TRIGGER_MIN && hsv.h <= GAUGE_TRIGGER_MAX;
    colorGaugeInput.value = inZone ? GAUGE_YELLOW_POS : GAUGE_CORNER_POS;
    fontColorSwatch.value = curHex;

    // 정렬 옆 픽셀입력창: "정렬" 기능의 일부 — 묶어 선택한 텍스트 박스들 사이의 세로 간격을
    // 입력한 픽셀만큼 일정하게 맞추는 기능. 자간(글자 사이 간격)과는 완전히 다른 기능입니다.
    boxGapPxInput.value = currentBoxGapPx(boxes);

    // 자간 게이지: 위 픽셀입력창과 무관한 별개 기능. 드래그하는 대로 글자 사이 간격이 넓어지고 좁아짐.
    const startPx = Math.max(LETTER_SPACING_MIN, Math.min(LETTER_SPACING_MAX, charSpacingToPx(anchor.charSpacing, anchor.fontSize)));
    letterSpacingGauge.value = startPx;
    updateLetterSpacingGaugeFill(startPx);
    letterSpacingGauge.disabled = !boxes.some(isTextObject);
    letterSpacingGauge.title = '자간';
    floatingBoldBtn.classList.toggle('on', anchor.fontWeight === 'bold' || anchor.fontWeight >= 700);
    floatingItalicBtn.classList.toggle('on', anchor.fontStyle === 'italic');
    floatingUnderlineBtn.classList.toggle('on', !!anchor.underline);
    updateGroupToggleBtn();
    // 이제 더보기/접기 구분 없이 항상 펼친 상태로 둠(요청에 따라 토글 버튼 자체를 없앰)
    if (wasHidden) setFontPopoverMoreOpen(true);

    // T 버튼으로 처음 열 때만 텍스트 아래(6시 방향)에 배치하고,
    // 다른 텍스트를 클릭해서 대상이 바뀌는 경우엔 드래그해둔 자리 그대로 고정
    const reposition = !opts || opts.reposition !== false;
    if (reposition) {
      positionFontPopover(target);
    } else {
      fontPopover.classList.remove('hidden');
      clampFontPopoverToViewport();
    }
  }

  floatingFontSelect.addEventListener('change', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontFamily', 'fontWeight']); o.set('fontFamily', floatingFontSelect.value); });
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) fontFamilySelect.value = floatingFontSelect.value;
    canvas.requestRenderAll();
    forceFontReloadRedraw(boxes, floatingFontSelect.value);
    pushHistory();
  });

  floatingFontSizeInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const v = Math.max(10, parseInt(floatingFontSizeInput.value, 10) || 10);
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontSize']); o.set('fontSize', v); });
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) { fontSizeInput.value = v; fontSizeGauge.value = v; }
    canvas.requestRenderAll();
  });
  floatingFontSizeInput.addEventListener('change', () => {
    floatingFontSizeInput.value = Math.max(10, parseInt(floatingFontSizeInput.value, 10) || 10);
    pushHistory();
  });

  floatingOpacityInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets;
    if (!boxes.length) return;
    const v = parseFloat(floatingOpacityInput.value);
    boxes.forEach(o => o.set('opacity', v));
    updateOpacityGaugeFill(v);
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) opacityInput.value = v;
    canvas.requestRenderAll();
  });
  floatingOpacityInput.addEventListener('change', () => pushHistory());

  // 무지개 게이지: 드래그하면 그 위치의 색이 모든 텍스트 박스에 바로 적용됨
  colorGaugeInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets;
    if (!boxes.length) return;
    const hex = gaugePosToHex(parseFloat(colorGaugeInput.value));
    boxes.forEach(o => o.set('fill', hex));
    fontColorSwatch.value = hex;
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) textColorInput.value = hex;
    canvas.requestRenderAll();
  });
  colorGaugeInput.addEventListener('change', () => pushHistory());

  // 작은 정사각형 스와치: 클릭하면 CMYK 상세 색상 선택창이 뜨고, 고르면 모든 텍스트 박스에 바로 적용
  fontColorSwatch.addEventListener('input', () => {
    const boxes = fontPopoverTargets;
    if (!boxes.length) return;
    const hex = fontColorSwatch.value;
    boxes.forEach(o => o.set('fill', hex));
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const inZone = hsv.h >= GAUGE_TRIGGER_MIN && hsv.h <= GAUGE_TRIGGER_MAX;
    colorGaugeInput.value = inZone ? GAUGE_YELLOW_POS : GAUGE_CORNER_POS;
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) textColorInput.value = hex;
    canvas.requestRenderAll();
    pushHistory();
  });

  // "더보기" 버튼: 클릭할 때마다 펼침 ↔ 접기 전환, 높이가 바뀌므로 위치를 다시 계산
  fontPopoverMoreBtn.addEventListener('click', () => {
    const willOpen = fontPopoverMore.classList.contains('hidden');
    setFontPopoverMoreOpen(willOpen);
    clampFontPopoverToViewport();
  });

  // 정렬 옆 픽셀입력창: "일정간격 정렬" 기능 — 묶어 선택한 텍스트 박스들을, 첫 줄(맨 위) 박스를 기준으로
  // 입력한 픽셀만큼 세로 간격이 일정하게 벌어지도록 배치함. (텍스트 박스가 2개 이상 묶였을 때만 동작)
  function currentBoxGapPx(boxes){
    if (boxes.length < 2) return 0;
    const sorted = boxes.slice().sort((a, b) => a.top - b.top);
    const br0 = sorted[0].getBoundingRect(true, true);
    const br1 = sorted[1].getBoundingRect(true, true);
    return Math.round(br1.top - (br0.top + br0.height));
  }
  function applyBoxGapPx(gapPx){
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return; // 묶인 텍스트가 2개 이상일 때만 의미가 있음
    const sorted = boxes.slice().sort((a, b) => a.top - b.top);
    let br = sorted[0].getBoundingRect(true, true);
    let cursorBottom = br.top + br.height;
    for (let i = 1; i < sorted.length; i++) {
      const o = sorted[i];
      const curBr = o.getBoundingRect(true, true);
      const dy = (cursorBottom + gapPx) - curBr.top;
      o.set('top', o.top + dy);
      o.setCoords();
      const newBr = o.getBoundingRect(true, true);
      cursorBottom = newBr.top + newBr.height;
    }
    canvas.requestRenderAll();
  }
  boxGapPxInput.addEventListener('input', () => {
    const px = parseFloat(boxGapPxInput.value) || 0;
    applyBoxGapPx(px);
  });
  boxGapPxInput.addEventListener('change', () => pushHistory());

  // 상단정렬 버튼: 둘 이상의 텍스트를 묶어 선택했을 때, 선택박스들의 윗변을 서로 맞춤
  // (기준: 맨 위(첫 줄)에 있는 텍스트 박스의 윗변)
  document.getElementById('topAlignBtn').addEventListener('click', () => {
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return;
    let ref = boxes[0];
    for (const o of boxes) { if (o.top < ref.top) ref = o; }
    const refBr = ref.getBoundingRect(true, true);
    boxes.forEach(o => {
      if (o === ref) return;
      const br = o.getBoundingRect(true, true);
      const dy = refBr.top - br.top;
      o.set('top', o.top + dy);
      o.setCoords();
    });
    canvas.requestRenderAll();
    pushHistory();
  });

  // 묶기/풀기 버튼: 텍스트끼리 서로 묶는 기능. 묶으면 이후엔 어디를 클릭해도 묶인 텍스트가
  // 통으로 선택되고, 풀기를 누르면 다시 개별 텍스트로 선택할 수 있게 풀어짐.
  function updateGroupToggleBtn(){
    const active = canvas.getActiveObject();
    if (active && active.type === 'group' && textBoxesFromTarget(active).length > 0) {
      groupToggleBtn.textContent = '풀기';
      groupToggleBtn.disabled = false;
      groupToggleBtn.title = '묶은 것을 다시 풀기';
    } else if (active && active.type === 'activeSelection' && textBoxesFromTarget(active).length >= 2) {
      groupToggleBtn.textContent = '묶기';
      groupToggleBtn.disabled = false;
      groupToggleBtn.title = '선택한 것들을 하나로 묶기';
    } else {
      groupToggleBtn.textContent = '묶기';
      groupToggleBtn.disabled = true;
      groupToggleBtn.title = '오브젝트를 2개 이상 묶어 선택하면 사용할 수 있어요';
    }
  }
  groupToggleBtn.addEventListener('click', () => {
    const active = canvas.getActiveObject();
    if (!active) return;
    if (active.type === 'group') {
      const sel = active.toActiveSelection();
      canvas.setActiveObject(sel);
      canvas.requestRenderAll();
      pushHistory();
      syncFontPopoverToSelection();
    } else if (active.type === 'activeSelection') {
      const group = active.toGroup();
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      pushHistory();
      openFontPopover(group, { reposition: false });
    }
  });

  // 자간 게이지: 픽셀입력창(정렬)과는 완전히 별개인 자간(글자 사이 간격) 기능.
  // 드래그하는 대로 자간이 넓어지고 좁아짐. 텍스트가 1개 이상 선택되어 있으면 항상 사용 가능.
  function applyLetterSpacingPx(px){
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    boxes.forEach(o => o.set('charSpacing', pxToCharSpacing(px, o.fontSize)));
    canvas.requestRenderAll();
  }
  letterSpacingGauge.addEventListener('input', () => {
    if (letterSpacingGauge.disabled || !fontPopoverTargets.length) return;
    const px = parseFloat(letterSpacingGauge.value) || 0;
    applyLetterSpacingPx(px);
    updateLetterSpacingGaugeFill(px);
  });
  letterSpacingGauge.addEventListener('change', () => pushHistory());

  floatingBoldBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeBold = !(anchor.fontWeight === 'bold' || anchor.fontWeight >= 700);
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontWeight']); o.set('fontWeight', makeBold ? 'bold' : 'normal'); });
    floatingBoldBtn.classList.toggle('on', makeBold);
    canvas.requestRenderAll();
    pushHistory();
  });
  floatingItalicBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeItalic = anchor.fontStyle !== 'italic';
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontStyle']); o.set('fontStyle', makeItalic ? 'italic' : 'normal'); });
    floatingItalicBtn.classList.toggle('on', makeItalic);
    canvas.requestRenderAll();
    pushHistory();
  });
  floatingUnderlineBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeUnderline = !anchor.underline;
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['underline']); o.set('underline', makeUnderline); });
    floatingUnderlineBtn.classList.toggle('on', makeUnderline);
    canvas.requestRenderAll();
    pushHistory();
  });

  // 텍스트 박스끼리 서로 정렬 (텍스트 안의 줄맞춤이 아니라, 캔버스 위 텍스트 박스들의 위치를 맞춤)
  // 기준: 캔버스에서 가장 위쪽(첫 줄)에 있는 텍스트 박스
  function alignTextBoxesToFirstLine(mode){
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return; // 맞춰볼 다른 텍스트 박스가 없음

    let ref = boxes[0];
    for (const o of boxes) { if (o.top < ref.top) ref = o; }
    const refBr = ref.getBoundingRect(true, true);

    boxes.forEach(o => {
      if (o === ref) return;
      const br = o.getBoundingRect(true, true);
      let dx = 0;
      if (mode === 'left') dx = refBr.left - br.left;
      else if (mode === 'center') dx = (refBr.left + refBr.width / 2) - (br.left + br.width / 2);
      else if (mode === 'right') dx = (refBr.left + refBr.width) - (br.left + br.width);
      o.set('left', o.left + dx);
      o.setCoords();
    });

    canvas.requestRenderAll();
    pushHistory();
  }
  floatingAlignLeftBtn.addEventListener('click', () => alignTextBoxesToFirstLine('left'));
  floatingAlignCenterBtn.addEventListener('click', () => alignTextBoxesToFirstLine('center'));
  floatingAlignRightBtn.addEventListener('click', () => alignTextBoxesToFirstLine('right'));

  // T버튼으로 연 패널은 자동으로 닫히지 않고, 우측 상단 ✕ 버튼을 눌러야만 닫힘
  document.getElementById('fontPopoverCloseBtn').addEventListener('click', hideFontPopover);

  // 패널을 자유롭게 드래그로 이동 (드롭다운/게이지/스와치/닫기버튼 위에서는 드래그 시작 안 함)
  makeDraggablePopover(fontPopover);

  function refreshEmptyHint(){
    // (캔버스 중앙 안내 문구는 제거됨 — 이 함수는 다른 곳에서 계속 호출되므로 빈 채로 남겨둠)
  }

  /* ---------- 상태바 표시 ---------- */
  document.getElementById('sizeLabel').textContent = `${ratioW} × ${ratioH} (붉은박스 기준)`;
  const sideChip = document.getElementById('sideChip');
  sideChip.textContent = isDouble ? '양면' : '단면';
  sideChip.classList.toggle('double', isDouble);
  const orderInfoLabel = document.getElementById('orderInfoLabel');
  const passedKeys = Object.keys(orderData);
  orderInfoLabel.textContent = passedKeys.length
    ? '전달된 주문정보: ' + passedKeys.map(k => `${k}=${orderData[k]}`).join(' · ')
    : '(전달된 쿼리 파라미터 없음 — 기본값으로 동작)';

  /* ============================================================
     3. 안내선(붉은 재단선 + 회색 여유선)
     - 항상 canvas 맨 위에 떠 있고, 선택/저장 대상에서는 제외됨
  ============================================================ */
  let guideRect, outerGuideRect, gridGuide, guideState = 0; // 0=붉은 박스만, 1=붉은 박스+모눈, 2=숨김
  const GRID_SPACING = 10; // 모눈 간격(px) — 요청대로 기존(5)의 2배로 넓힘

  function buildGridGuide(){
    const padding = CANVAS_W * 0.02;
    const gw = CANVAS_W - padding * 2, gh = CANVAS_H - padding * 2;
    let d = '';
    for (let x = 0; x <= gw; x += GRID_SPACING) d += 'M' + x + ',0 L' + x + ',' + gh + ' ';
    for (let y = 0; y <= gh; y += GRID_SPACING) d += 'M0,' + y + ' L' + gw + ',' + y + ' ';
    gridGuide = new fabric.Path(d, {
      left: padding, top: padding,
      fill: '', stroke: 'rgba(62,214,163,0.4)', strokeWidth: 0.5, // 민트색 격자
      selectable: false, evented: false, visible: guideState === 1
    });
    gridGuide.isGuide = true;
    canvas.add(gridGuide);
  }

  function buildGuides(){
    const padding = CANVAS_W * 0.02;
    guideRect = new fabric.Rect({
      left: padding, top: padding,
      width: CANVAS_W - padding * 2, height: CANVAS_H - padding * 2,
      fill: 'transparent', stroke: '#ff0000', strokeWidth: 2,
      selectable: false, evented: false, visible: guideState !== 2
    });
    guideRect.isGuide = true;

    // 예전엔 얇은 테두리선(stroke)으로 그렸는데, stroke는 기준선 위에 "가운데 정렬"로 그려지는
    // 방식이라 두께의 절반이 캔버스 밖으로 나가 잘리거나(그래서 방향에 따라 안 보이던 문제),
    // 살짝 안쪽으로 들여도 화면 배율·기기 해상도에 따라 미세하게 안티에일리어싱이 번져서
    // 방향마다 두께가 다르게 보이거나 바깥쪽에 지저분한 흰 선이 비치는 문제가 있었음.
    // 그래서 선이 아니라 "캔버스 전체 사각형에서 안쪽 사각형을 뺀 도넛(액자) 모양"을
    // 그냥 회색으로 꽉 채워서 그림 — 이렇게 하면 두께가 사방 어디서든 정확히 outerThickness
    // px로 완전히 균일하고, 캔버스 가장자리에 딱 맞물려서 바깥으로 새거나 잘리는 부분이
    // 전혀 없음(선의 "중심 정렬" 개념 자체가 없어져서 이 문제가 원천적으로 사라짐).
    const outerThickness = 2;
    const outerFrameD =
      `M0,0 L${CANVAS_W},0 L${CANVAS_W},${CANVAS_H} L0,${CANVAS_H} Z ` +
      `M${outerThickness},${outerThickness} L${outerThickness},${CANVAS_H - outerThickness} L${CANVAS_W - outerThickness},${CANVAS_H - outerThickness} L${CANVAS_W - outerThickness},${outerThickness} Z`;
    outerGuideRect = new fabric.Path(outerFrameD, {
      left: 0, top: 0,
      fill: '#999999', fillRule: 'evenodd', stroke: '', strokeWidth: 0,
      selectable: false, evented: false, visible: guideState !== 2
    });
    outerGuideRect.isGuide = true;

    canvas.add(guideRect, outerGuideRect);
    buildGridGuide();
  }
  function bringGuideToFront(){
    if (guideRect) canvas.bringToFront(guideRect);
    if (outerGuideRect) canvas.bringToFront(outerGuideRect);
    if (gridGuide) canvas.bringToFront(gridGuide);
  }
  buildGuides();

  // 붉은선(재단선)의 "실제로 보여야 할 상태"는 두 스위치가 함께 결정함:
  //  1) 기존 guideToggleBtn의 3단계 순환(재단선만 / 재단선+모눈 / 전부 숨김)
  //  2) 새로 추가한 "👁 문구·붉은선 가리기" 버튼(회색선은 그대로 두고 붉은선+안내문구만 따로 숨김)
  // 둘 중 하나라도 "숨김"이면 붉은선은 안 보여야 하므로, 이 함수로 항상 같이 계산해서 반영함.
  let redLineHiddenByCaptionBtn = false;
  function updateGuideRectVisibility(){
    guideRect.visible = (guideState !== 2) && !redLineHiddenByCaptionBtn;
    canvas.renderAll();
  }

  document.getElementById('guideToggleBtn').addEventListener('click', () => {
    // 1번째: 붉은 재단선 박스만 표시 → 2번째: 그 안에 5px 간격 모눈까지 표시 → 3번째: 전부 숨김
    guideState = (guideState + 1) % 3;
    const boxVisible = guideState !== 2;
    outerGuideRect.visible = boxVisible;
    gridGuide.visible = guideState === 1;
    updateGuideRectVisibility();
  });

  // "👁 문구·붉은선 가리기" — 캔버스 바깥의 안내 문구(붉은선/회색선 설명)와 캔버스 안의
  // 붉은 재단선만 같이 숨김(회색선·모눈은 그대로 둠). 다시 누르면 원래대로 돌아옴.
  const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const canvasCaptionToggleBtn = document.getElementById('canvasCaptionToggleBtn');
  const canvasRedLineCaption = document.getElementById('canvasRedLineCaption');
  if (canvasCaptionToggleBtn && canvasRedLineCaption) {
    canvasCaptionToggleBtn.addEventListener('click', () => {
      redLineHiddenByCaptionBtn = !redLineHiddenByCaptionBtn;
      canvasRedLineCaption.classList.toggle('hidden', redLineHiddenByCaptionBtn);
      canvasCaptionToggleBtn.classList.toggle('active', redLineHiddenByCaptionBtn);
      canvasCaptionToggleBtn.innerHTML = redLineHiddenByCaptionBtn ? EYE_OFF_SVG : EYE_OPEN_SVG;
      canvasCaptionToggleBtn.title = redLineHiddenByCaptionBtn ? '문구·붉은선 다시 보이기' : '문구·붉은선 가리기';
      updateGuideRectVisibility();
    });
  }

  /* ============================================================
     3b. 캔버스 전체 90도 회전
     - 캔버스 크기(가로/세로)가 서로 바뀌고, 안의 모든 오브젝트(안내선 포함)가
       캔버스에 붙어있는 것처럼 함께 회전합니다 (상대 위치·각도 그대로 유지).
  ============================================================ */
  function rotateCanvas90(dir){ // dir: 1 = 시계방향, -1 = 반시계방향
    const oldW = CANVAS_W, oldH = CANVAS_H;

    // 오브젝트 하나(모양/패스/텍스트/이미지 등)의 중심점·각도를 새 캔버스 크기 기준으로 회전시킴.
    // 클리핑 마스크로 붙인 클립패스(absolutePositioned:true)에도 그대로 재사용함 — 이건
    // canvas.getObjects()에 안 잡히는 별도 오브젝트라서, 안 챙겨주면 캔버스는 돌아갔는데
    // 클립 경계(마스크 창)만 예전 위치·각도에 그대로 남아 어긋나 버리는 문제가 있었음.
    function rotateOneObject(obj){
      const c = obj.getCenterPoint();
      let nx, ny;
      if (dir === 1) { nx = oldH - c.y; ny = c.x; }
      else { nx = c.y; ny = oldW - c.x; }
      // 순서 중요: 각도를 먼저 바꾸고 그 다음에 위치(중심점)를 맞춰야 함.
      // "모양 만들기"로 만든 도형들은 originX/Y가 'center'라서 순서가 상관없었지만,
      // 텍스트·펜 도구 패스는 origin이 'left'/'top'이라, 위치를 먼저 맞추고 나중에
      // 각도를 바꾸면 "모서리→중심" 오프셋이 새 각도로 다시 회전되면서 중심점이 엉뚱한
      // 곳으로 밀려나 버림(그래서 도형은 멀쩡한데 텍스트/펜 패스만 위치가 이탈해 보였음).
      if (!obj.isGuide) {
        obj.set('angle', ((obj.angle || 0) + dir * 90 + 360) % 360);
      }
      obj.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center');
      obj.setCoords();
    }

    canvas.getObjects().forEach((obj) => {
      rotateOneObject(obj);
      // 클리핑 마스크로 붙은 클립패스가 캔버스 절대좌표 기준(absolutePositioned)이면
      // 오브젝트 본체와 똑같이 같이 돌려줘야 마스크 창이 새 위치에도 정확히 들어맞음
      if (obj.clipPath && obj.clipPath.absolutePositioned) {
        rotateOneObject(obj.clipPath);
        obj.dirty = true;
      }
    });

    // 캔버스 논리 크기 및 규격 비율 교체 (가로 ↔ 세로)
    CANVAS_W = oldH;
    CANVAS_H = oldW;
    const tmpRatio = ratioW; ratioW = ratioH; ratioH = tmpRatio;

    // 캔버스 회전 누적 각도 갱신 → 다음 렌더부터 P/T 미니버튼이 이 각도만큼 회전되어 그려짐,
    // 그리고 지금 이미 열려있는 T/P 팝업창이 있다면 즉시 같은 각도로 회전·재배치함
    EP.canvasRotationDeg = ((EP.canvasRotationDeg || 0) + dir * 90 + 360) % 360;
    EP.refreshRotatablePopovers();

    // 안내선(붉은선/회색선/모눈)을 새 크기에 맞게 다시 생성.
    // 변수 3개(guideRect/outerGuideRect/gridGuide)만 지우는 대신, isGuide 표시가 붙은
    // 오브젝트를 캔버스에서 전부 찾아서 지움 — 이렇게 해야 어떤 이유로든 변수 참조가
    // 실제 캔버스 상태와 어긋나 있어도 안내선이 중복으로 남지 않고 확실히 다 정리됨
    // (회전할 때마다 예전 재단선이 안 지워지고 겹겹이 쌓여 보이던 문제의 원인).
    canvas.getObjects().filter(o => o.isGuide).forEach(o => canvas.remove(o));
    buildGuides();
    if (typeof updateGuideRectVisibility === 'function') updateGuideRectVisibility(); // "👁 문구·붉은선 가리기"로 숨겨둔 상태였다면 새로 만든 붉은선에도 그대로 유지

    // 현재 줌 배율을 유지한 채 캔버스 엘리먼트 크기 갱신
    setZoomLevel(zoom);

    document.getElementById('sizeLabel').textContent = `${ratioW} × ${ratioH} (붉은박스 기준)`;
    canvas.discardActiveObject();
    canvas.renderAll();
    pushHistory();
  }

  document.getElementById('rotateCanvasLeftBtn').addEventListener('click', () => rotateCanvas90(-1));
  document.getElementById('rotateCanvasRightBtn').addEventListener('click', () => rotateCanvas90(1));

  // 캔버스 전체가 아니라, 지금 선택한 모양/텍스트 오브젝트 하나만 90도 회전·좌우반전
  document.getElementById('rotateObjectBtn').addEventListener('click', () => {
    const o = canvas.getActiveObject();
    if (!o) return;
    o.set('angle', ((o.angle || 0) + 90) % 360);
    o.setCoords();
    canvas.requestRenderAll();
    pushHistory();
  });
  document.getElementById('flipObjectXBtn').addEventListener('click', () => {
    const o = canvas.getActiveObject();
    if (!o) return;
    o.set('flipX', !o.flipX);
    canvas.requestRenderAll();
    pushHistory();
  });

  /* ============================================================
     3c. 메가메뉴(드롭다운) 공통 동작
     - 트리거 버튼을 누르면 메뉴가 열리고, 다른 메뉴를 열거나 바깥을 클릭하면 닫힘
     - 메뉴 안의 항목(버튼/라벨)을 클릭하면 해당 동작 후 자동으로 닫힘
  ============================================================ */
  const megaMenus = [
    { trigger: document.getElementById('fileMenuBtn'), menu: document.getElementById('fileMenu') },
    { trigger: document.getElementById('shapeMenuBtn'), menu: document.getElementById('shapeMenu') },
    { trigger: document.getElementById('rotateMenuBtn'), menu: document.getElementById('rotateMenu') },
    { trigger: document.getElementById('zoomMenuBtn'), menu: document.getElementById('zoomMenu') },
    // 모바일 전용 상단 드롭다운(#mobileMenuBtn) — PC 메가메뉴와 완전히 같은 열기/닫기 동작을 씀
    { trigger: document.getElementById('mobileMenuBtn'), menu: document.getElementById('mobileMenuDropdown') },
    // 모바일 전용 "통합"(공통적용/부분적용/모두저장) 드롭다운 — 건수 2개 이상일 때만 실제로
    // 보이지만(숨겨져 있으면 어차피 못 누르므로), 열고/닫는 동작만 다른 메가메뉴들과 동일하게 등록
    { trigger: document.getElementById('mobileUnifyBtn'), menu: document.getElementById('mobileUnifyMenu') }
  ];

  function closeAllMegaMenus(){
    megaMenus.forEach(({ menu }) => { if (menu) menu.classList.add('hidden'); });
  }

  megaMenus.forEach(({ trigger, menu }) => {
    // 이 중 하나라도 페이지에 없으면(예: HTML 버전이 안 맞아서 특정 버튼이 빠진 경우) 여기서
    // 예외가 나서 이 뒤에 있는 삭제/레이어/CMYK 색상칸 등록 코드 전체가 통째로 실행이 안 되는
    // 문제가 있었음 — 반드시 존재 여부를 먼저 확인하고 없으면 그냥 건너뜀
    if (!trigger || !menu) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      closeAllMegaMenus();
      if (willOpen) menu.classList.remove('hidden');
    });
    // 메뉴 안의 항목을 클릭하면(파일첨부 라벨 포함) 동작이 실행된 뒤 메뉴를 닫음
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      setTimeout(() => menu.classList.add('hidden'), 0);
    });
  });

  document.addEventListener('click', () => closeAllMegaMenus());

  // 모바일 상단 드롭다운 "🔲 글씨 가리기" — PC의 '✏️ 편집하기 > ◆ 모양 만들기 > ▭ 사각형'
  // (#pickRectBtn)과 완전히 동일한 기능을 그대로 호출함. 새 도구를 만드는 게 아니라
  // 기존 사각형 생성 기능의 진입로만 모바일용으로 하나 더 뚫어주는 것뿐이라, 만들어진
  // 사각형은 PC에서 만든 것과 똑같이(캔버스 정가운데, 파란색 180x120) 생기고, 그 뒤로는
  // 캔버스 위에서 손가락으로 직접 옮기고 크기 조절해서 가리고 싶은 글씨 위에 덮으면 됨.
  // 모바일 상단 드롭다운 "◆ 모양 만들기" — PC의 '✏️ 편집하기 > ◆ 모양 만들기'(#openShapePickerBtn)와
  // 완전히 동일한 기능을 그대로 호출함. 예전엔 사각형 하나만 바로 만들어주는 "글씨 가리기"
  // 버튼이었는데, 이제는 PC와 똑같이 사각형/둥근사각형/원/삼각형/별/하트/자유모양 중 골라서
  // 만들 수 있는 모양 만들기 팝업이 그대로 뜸(새 기능이 아니라 100% 재사용).
  const mobileShapePickerBtn = document.getElementById('mobileShapePickerBtn');
  if (mobileShapePickerBtn) {
    mobileShapePickerBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode(); // 손바닥(이동) 도구가 켜져 있으면 새로 만든 모양을 바로 움직일 수 있도록 먼저 꺼둠
      const openShapePickerBtn = document.getElementById('openShapePickerBtn');
      if (openShapePickerBtn) openShapePickerBtn.click();
    });
  }

  // 모바일 상단 드롭다운 "🅣 텍스트 추가" — PC의 '✏️ 편집하기 > 🅣 텍스트'(#addTextBtn)와 완전히
  // 동일한 기능을 그대로 호출함. 누르면 텍스트 도구가 무장되고(드롭다운은 자동으로 닫힘),
  // 캔버스에서 원하는 위치를 한 번 탭하면 그 자리에 빈 텍스트가 생기며 바로 입력할 수 있음
  // (PC와 완전히 같은 흐름 — 새로 만든 게 아니라 100% 재사용).
  const mobileAddTextBtn = document.getElementById('mobileAddTextBtn');
  if (mobileAddTextBtn) {
    mobileAddTextBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode(); // 손바닥(이동) 도구와 텍스트 도구가 동시에 켜져 있으면 서로 충돌하므로 먼저 꺼둠
      const addTextBtn = document.getElementById('addTextBtn');
      if (addTextBtn) addTextBtn.click();
    });
  }

  // 모바일 상단 드롭다운 "✒ 펜 도구" — PC의 '✏️ 편집하기 > ✒ 펜 도구'(#penToolBtn)와 완전히
  // 동일한 기능을 그대로 호출함(새로 만든 게 아니라 100% 재사용).
  const mobilePenToolBtn = document.getElementById('mobilePenToolBtn');
  if (mobilePenToolBtn) {
    mobilePenToolBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode(); // 손바닥(이동) 도구와 펜 도구가 동시에 켜져 있으면 서로 충돌하므로 먼저 꺼둠
      const penToolBtn = document.getElementById('penToolBtn');
      if (penToolBtn) penToolBtn.click();
    });
  }

  // 모바일 상단 드롭다운 "⚙ 전문가모드" / "⚙ 기본모드" — <body>에 클래스를 붙였다 뗐다 하는
  // 스위치일 뿐임. 실제 화면 전환(기존 메뉴 ↔ 전문가 메뉴, "메뉴" 버튼 초록색 여부)은
  // ecopro3.css의 body.mobile-expert-mode 규칙이 전부 처리함. 전문가 메뉴 안에 구체적으로
  // 어떤 항목을 넣을지는 아직 정해지지 않아서, 지금은 이 스위치 틀만 만들어둠.
  const mobileExpertModeToggleBtn = document.getElementById('mobileExpertModeToggleBtn');
  if (mobileExpertModeToggleBtn) {
    mobileExpertModeToggleBtn.addEventListener('click', () => {
      document.body.classList.add('mobile-expert-mode');
    });
  }
  const mobileBasicModeToggleBtn = document.getElementById('mobileBasicModeToggleBtn');
  if (mobileBasicModeToggleBtn) {
    mobileBasicModeToggleBtn.addEventListener('click', () => {
      document.body.classList.remove('mobile-expert-mode');
    });
  }

  // 모바일 상단 드롭다운 "↻ 캔버스 90도 회전" / "↺ 반대 90도 회전" — PC의 '↻ 회전 > 캔버스 90도
  // 회전'/'반대 90도 회전'(#rotateCanvasRightBtn/#rotateCanvasLeftBtn)과 완전히 동일한 기능을
  // 그대로 호출함(새로 만든 게 아니라 100% 재사용). 캔버스 위 모든 오브젝트가 캔버스와 함께 회전됨.
  const mobileRotateCanvasRightBtn = document.getElementById('mobileRotateCanvasRightBtn');
  if (mobileRotateCanvasRightBtn) {
    mobileRotateCanvasRightBtn.addEventListener('click', () => {
      const rotateCanvasRightBtn = document.getElementById('rotateCanvasRightBtn');
      if (rotateCanvasRightBtn) rotateCanvasRightBtn.click();
    });
  }

  // 모바일 상단 드롭다운의 "🖼 이미지 불러오기"/"📂 파일 불러오기"는 HTML에서
  // <label for="imageInput">/<label for="projectInput">로 PC와 같은 파일 입력을 그대로
  // 가리키고 있어서 별도 JS 없이 네이티브 동작으로 파일 선택창이 뜸.
  // "💾 저장"만 버튼이라 PC의 실제 저장 버튼(#saveProjectBtn)을 그대로 클릭해줌.
  const mobileSaveProjectBtn = document.getElementById('mobileSaveProjectBtn');
  if (mobileSaveProjectBtn) {
    mobileSaveProjectBtn.addEventListener('click', () => {
      const saveProjectBtn = document.getElementById('saveProjectBtn');
      if (saveProjectBtn) saveProjectBtn.click();
    });
  }

  /* ============================================================
     4. 디자인(건수) / 앞뒤(면) 데이터 & 전환
  ============================================================ */
  const designData = Array.from({ length: count }, () => ({ front: null, back: null }));
  const designNames = Array.from({ length: count }, () => '');
  const designGroups = Array.from({ length: count }, () => ''); // 부분통일하기용 그룹 지정값
  let currentIdx = 0;
  let currentSide = 'front';

  // 현재 캔버스 내용(안내선 제외)만 뽑아내기
  function serializeCurrentCanvas(){
    const objs = canvas.getObjects().filter(o => !o.isGuide);
    return {
      objects: objs.map(o => o.toObject(['selectable', 'evented', 'imageLocked', 'isPenToolPath', 'hasControls', 'hasBorders', 'lockMovementX', 'lockMovementY', 'hoverCursor', 'circularText', 'verticalText', 'puffyText', 'vineText', 'rollText', 'perspectiveText', 'curveText', 'waveText', 'tiredText', 'spiralText', 'magazineText', 'puzzleText', 'skyText', 'chalkText', 'postalText', 'grassText', 'bigbangText', 'eventText', 'golfText', 'christmasText', 'autumnText', 'spaceText', 'doodleText', 'butterflyText', 'soapbubbleText', 'lightningText', 'halloweenText', 'musicnoteText', 'gemText', 'tropicalText', 'candyText', 'jumpText', 'pulseText', 'swayText', 'waddleText', 'popcornText', 'hiccupText', 'breatheText', 'flickerText', 'chatterText', 'walkText', 'doubleOutline', 'threeDText', 'metalText', 'popArtText', 'inkTrapText', 'leafVineText', 'sakuraText', 'shyText', 'fireText', 'meltText', 'bubbleText', 'zebraText', 'speedText', 'reflectionText', 'crackText', 'footprintText', 'animalText', 'seafoodText', 'heartText', 'coffeeText', 'sportsText', 'clubText', 'splashText', 'tileText', 'fruitVegText', 'snowText', 'rainText', 'randomTypo', 'glitchText', 'tearText', 'lightText'])),
      background: canvas.backgroundColor || '#ffffff'
    };
  }

  // 저장된 데이터를 캔버스에 로드 (안내선은 항상 다시 맨 위에 추가)
  function loadCanvasObjects(data, callback){
    restoring = true;
    const payload = {
      objects: (data && data.objects) || [],
      background: (data && data.background) || '#ffffff'
    };
    canvas.loadFromJSON(payload, () => {
      canvas.add(guideRect, outerGuideRect, gridGuide);
      bringGuideToFront();
      if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
      if (EP.reapplyShapeComboPatches) EP.reapplyShapeComboPatches();
      canvas.renderAll();
      restoring = false;
      refreshEmptyHint();
      updateSelectionPanel();
      if (callback) callback();
    });
  }

  function switchTo(idx, side){
    if (designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }
    currentIdx = idx;
    currentSide = side;
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
    });
  }

  function renderTabs(){
    const tabList = document.getElementById('tabList');
    tabList.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const group = document.createElement('div');
      group.className = 'design-group';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'design-name-input';
      nameInput.placeholder = `디자인 ${i + 1}`;
      nameInput.value = designNames[i] || '';
      nameInput.addEventListener('click', (e) => e.stopPropagation());
      nameInput.addEventListener('input', () => {
        designNames[i] = nameInput.value;
        dBtn.textContent = designNames[i].trim() ? designNames[i] : `디자인 ${i + 1}`;
      });
      group.appendChild(nameInput);

      const dBtn = document.createElement('div');
      dBtn.className = 'design-btn' + (i === currentIdx ? ' active' : '');
      dBtn.textContent = designNames[i].trim() ? designNames[i] : `디자인 ${i + 1}`;
      dBtn.addEventListener('click', () => switchTo(i, currentSide));
      group.appendChild(dBtn);

      if (isDouble) {
        const sw = document.createElement('div');
        sw.className = 'side-switch';
        ['front', 'back'].forEach(s => {
          const sBtn = document.createElement('button');
          sBtn.type = 'button';
          sBtn.className = 'side-btn' + (currentIdx === i && currentSide === s ? ' active' : '');
          sBtn.textContent = s === 'front' ? '앞' : '뒤';
          sBtn.addEventListener('click', (e) => { e.stopPropagation(); switchTo(i, s); });
          sw.appendChild(sBtn);
        });
        group.appendChild(sw);
      }

      // 부분통일하기용 그룹 지정란: 같은 값을 적어넣은 디자인끼리 하나로 묶여서,
      // "부분통일하기" 버튼을 누르면 그 그룹 안에서 가장 앞 번호 디자인 내용으로 통일됨
      if (count > 1) {
        const groupInput = document.createElement('input');
        groupInput.type = 'text';
        groupInput.className = 'design-group-input';
        groupInput.placeholder = '그룹';
        groupInput.value = designGroups[i] || '';
        groupInput.title = '같은 값을 입력한 디자인끼리 묶입니다. "부분적용"을 누르면 그룹 안에서 가장 번호가 앞선 디자인 내용으로 통일됩니다.';
        groupInput.addEventListener('click', (e) => e.stopPropagation());
        groupInput.addEventListener('input', () => { designGroups[i] = groupInput.value; });
        group.appendChild(groupInput);
      }

      tabList.appendChild(group);
    }
    syncMobileSideSwitch();
  }

  // 모바일 전용 "앞면/뒷면" 전환 바 — PC 좌측 디자인목록 패널의 앞/뒤 버튼(위 side-switch)과
  // 완전히 같은 switchTo(idx, side) 함수를 그대로 호출함. 새 기능이 아니라 그 기능의
  // 진입로 하나를 모바일에서도 쓸 수 있게 옮겨 붙인 것뿐임. 앞/뒤 버튼은 양면 주문(isDouble)일
  // 때만 보이고, "통합" 드롭다운(공통적용/부분적용/모두저장) + 건수 번호 이동은 건수(count)가
  // 2개 이상일 때만 보임 — 둘 중 하나라도 해당되면 이 바 자체가 보임(단면 1건이면 계속 숨김).
  // PC 좌측 패널의 디자인 "이름 바꾸기" 입력칸은 모바일에서는 요청대로 넣지 않음.
  (function setupMobileSideSwitch(){
    const bar = document.getElementById('mobileSideSwitch');
    const frontBtn = document.getElementById('mobileFrontBtn');
    const backBtn = document.getElementById('mobileBackBtn');
    const unifyDropdown = document.getElementById('mobileUnifyDropdown');
    const designIndex = document.getElementById('mobileDesignIndex');
    if (!bar || !frontBtn || !backBtn) return;

    if (isDouble) {
      frontBtn.addEventListener('click', () => switchTo(currentIdx, 'front'));
      backBtn.addEventListener('click', () => switchTo(currentIdx, 'back'));
    } else {
      frontBtn.style.display = 'none';
      backBtn.style.display = 'none';
    }

    if (count > 1) {
      const mobileUnifyDesignBtn = document.getElementById('mobileUnifyDesignBtn');
      const mobilePartialUnifyBtn = document.getElementById('mobilePartialUnifyBtn');
      const mobileSaveAllZipBtn = document.getElementById('mobileSaveAllZipBtn');
      if (mobileUnifyDesignBtn) mobileUnifyDesignBtn.addEventListener('click', () => { const b = document.getElementById('unifyDesignBtn'); if (b) b.click(); });
      if (mobilePartialUnifyBtn) mobilePartialUnifyBtn.addEventListener('click', () => { const b = document.getElementById('partialUnifyBtn'); if (b) b.click(); });
      if (mobileSaveAllZipBtn) mobileSaveAllZipBtn.addEventListener('click', () => { const b = document.getElementById('saveAllZipBtn'); if (b) b.click(); });

      const prevBtn = document.getElementById('mobileDesignPrevBtn');
      const nextBtn = document.getElementById('mobileDesignNextBtn');
      if (prevBtn) prevBtn.addEventListener('click', () => { if (currentIdx > 0) switchTo(currentIdx - 1, currentSide); });
      if (nextBtn) nextBtn.addEventListener('click', () => { if (currentIdx < count - 1) switchTo(currentIdx + 1, currentSide); });
    } else {
      if (unifyDropdown) unifyDropdown.style.display = 'none';
      if (designIndex) designIndex.style.display = 'none';
    }

    if (isDouble || count > 1) bar.classList.add('show');
  })();

  function syncMobileSideSwitch(){
    const frontBtn = document.getElementById('mobileFrontBtn');
    const backBtn = document.getElementById('mobileBackBtn');
    if (frontBtn && backBtn) {
      frontBtn.classList.toggle('active', currentSide === 'front');
      backBtn.classList.toggle('active', currentSide === 'back');
    }
    const indexLabel = document.getElementById('mobileDesignIndexLabel');
    if (indexLabel) indexLabel.textContent = String(currentIdx + 1);
    const prevBtn = document.getElementById('mobileDesignPrevBtn');
    const nextBtn = document.getElementById('mobileDesignNextBtn');
    if (prevBtn) prevBtn.disabled = currentIdx <= 0;
    if (nextBtn) nextBtn.disabled = currentIdx >= count - 1;
  }

  renderTabs();

  /* ============================================================
     IndexedDB 핸드오프 저장소 — ecopro1 ↔ ecopro3 ↔ sian.html 사이에서 이미지/SVG
     데이터를 주고받을 때 씀. sessionStorage(도메인당 5~10MB)로는 고화질 이미지
     여러 장을 담기 부족해서 한도가 훨씬 넉넉한 IndexedDB로 통일함. 세 페이지
     모두 이 DB/스토어 이름을 그대로 써야 서로 읽고 쓸 수 있음.
  ============================================================ */
  const HANDOFF_DB_NAME = 'ecogrHandoff';
  const HANDOFF_STORE_NAME = 'kv';
  function openHandoffDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDOFF_DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(HANDOFF_STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value){
    const db = await openHandoffDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
      tx.objectStore(HANDOFF_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key){
    const db = await openHandoffDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readonly');
      const req = tx.objectStore(HANDOFF_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDelete(key){
    const db = await openHandoffDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
      tx.objectStore(HANDOFF_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // data URL(base64) 문자열 길이로 대략적인 바이트 수를 추정 (R2 업로드 한도인
  // 500MB와 동일한 기준으로, IndexedDB에 넘기기 전에 미리 걸러내기 위함)
  const MAX_TRANSFER_BYTES = 500 * 1024 * 1024; // 500MB
  function estimateDataUrlBytes(dataUrl){
    if (!dataUrl) return 0;
    const commaIdx = dataUrl.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return Math.floor(base64.length * 3 / 4);
  }

  /* ============================================================
     4b. ecopro1(간단 업로드 페이지)의 "편집하기" 버튼에서 넘어온 첨부 이미지를
     IndexedDB에서 읽어와 각 디자인(idx)/면(side)에 맞게 자동으로 캔버스에
     올려줌. ecopro1이 IndexedDB의 'ecogr_editor_import_images' 키에
     [{idx, side, dataUrl}, ...] 형태로 저장해두고 같은 쿼리를 그대로 이어서
     이 페이지로 이동시킴 — 그래서 count/width/height 등은 이미 URL 쿼리로
     맞춰져 있고, 여기서는 이미지 내용만 채워 넣으면 됨.
  ============================================================ */
  const EDITOR_IMPORT_KEY = 'ecogr_editor_import_images';

  async function importImagesFromEcopro1(){
    let items;
    try { items = await idbGet(EDITOR_IMPORT_KEY); } catch (e) { return; }
    if (!Array.isArray(items) || !items.length) return;

    try { await idbDelete(EDITOR_IMPORT_KEY); } catch (e) {}

    let chain = Promise.resolve();
    items.forEach((item) => {
      if (!item || !item.dataUrl) return;
      const idx = Math.min(Math.max(parseInt(item.idx, 10) || 0, 0), count - 1);
      const side = item.side === 'back' ? 'back' : 'front';

      chain = chain.then(() => new Promise((resolve) => {
        loadCanvasObjects(designData[idx][side], () => {
          fabric.Image.fromURL(item.dataUrl, (img) => {
            const maxDim = Math.min(CANVAS_W, CANVAS_H) * 0.95;
            const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
            img.set({
              left: CANVAS_W / 2, top: CANVAS_H / 2,
              originX: 'center', originY: 'center',
              scaleX: scale, scaleY: scale
            });
            canvas.add(img);
            canvas.sendToBack(img);
            bringGuideToFront();
            canvas.renderAll();
            designData[idx][side] = serializeCurrentCanvas();
            resolve();
          }, { crossOrigin: 'anonymous' });
        });
      }));
    });

    chain.then(() => {
      // 다 채워 넣은 뒤엔 사용자가 처음 보는 화면이 항상 디자인 1 앞면이 되도록 정리
      switchTo(0, 'front');
      resetHistory();
    });
  }
  importImagesFromEcopro1();

  // 디자인 통일하기: 디자인 1(앞/뒤)의 내용을 그대로 복사해서 나머지 모든 디자인에 똑같이 적용
  function unifyDesigns(){
    if (count <= 1) {
      alert('디자인이 1개뿐이라 통일할 필요가 없습니다.');
      return;
    }
    const ok = confirm(
      `디자인 1${isDouble ? '(앞/뒤)' : ''}을 기준으로 전체 ${count}개 디자인을 모두 똑같이 통일합니다.\n` +
      `디자인 2 ~ ${count}에 있던 기존 내용은 모두 사라집니다.\n` +
      `이 작업은 실행취소(Ctrl+Z)로 되돌릴 수 없으니, 계속하시겠습니까?`
    );
    if (!ok) return;

    // 지금 화면에 보이는 캔버스 내용도 먼저 데이터에 반영 (디자인1을 보는 중이었다면 최신 내용까지 반영)
    if (designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }

    const sourceFront = designData[0] ? designData[0].front : null;
    const sourceBack = designData[0] ? designData[0].back : null;

    for (let i = 1; i < count; i++) {
      designData[i] = {
        front: sourceFront ? JSON.parse(JSON.stringify(sourceFront)) : null,
        back: (isDouble && sourceBack) ? JSON.parse(JSON.stringify(sourceBack)) : null
      };
    }

    // 지금 보고 있는 화면도 통일된 최신 내용으로 다시 불러옴
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
    });
  }
  document.getElementById('unifyDesignBtn').addEventListener('click', unifyDesigns);

  // 부분통일하기: designGroups에서 같은 값이 적힌 디자인들끼리 묶어서,
  // 각 그룹 안에서 가장 번호가 앞선 디자인 내용으로 나머지를 통일함
  function partialUnifyDesigns(){
    if (count <= 1) {
      alert('디자인이 1개뿐이라 통일할 필요가 없습니다.');
      return;
    }

    // 지금 화면에 보이는 캔버스 내용도 먼저 데이터에 반영
    if (designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }

    // 그룹값(빈 값 제외)별로 디자인 번호를 모음
    const groupMap = new Map();
    for (let i = 0; i < count; i++) {
      const key = (designGroups[i] || '').trim();
      if (!key) continue; // 그룹을 지정하지 않은 디자인은 건너뜀
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(i);
    }

    // 실제로 2개 이상 묶인 그룹만 의미가 있음
    const groups = Array.from(groupMap.entries()).filter(([, idxs]) => idxs.length > 1);
    if (groups.length === 0) {
      alert('묶인 그룹이 없습니다. 통일하고 싶은 디자인들의 "그룹" 칸에 같은 값을 입력한 뒤 다시 눌러주세요.');
      return;
    }

    const summary = groups.map(([key, idxs]) =>
      `- "${key}" 그룹: 디자인 ${idxs.map(i => i + 1).join(', ')} → 디자인 ${idxs[0] + 1} 내용으로 통일`
    ).join('\n');
    const ok = confirm(
      `아래 그룹별로 부분통일을 진행합니다.\n\n${summary}\n\n` +
      `각 그룹에서 가장 앞 번호 디자인을 기준으로 나머지 디자인 내용은 모두 사라집니다.\n` +
      `이 작업은 실행취소(Ctrl+Z)로 되돌릴 수 없으니, 계속하시겠습니까?`
    );
    if (!ok) return;

    groups.forEach(([, idxs]) => {
      const sourceIdx = idxs[0];
      const sourceFront = designData[sourceIdx] ? designData[sourceIdx].front : null;
      const sourceBack = designData[sourceIdx] ? designData[sourceIdx].back : null;
      for (let k = 1; k < idxs.length; k++) {
        const targetIdx = idxs[k];
        designData[targetIdx] = {
          front: sourceFront ? JSON.parse(JSON.stringify(sourceFront)) : null,
          back: (isDouble && sourceBack) ? JSON.parse(JSON.stringify(sourceBack)) : null
        };
      }
    });

    // 지금 보고 있는 화면도 통일된 최신 내용으로 다시 불러옴
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
    });
  }
  document.getElementById('partialUnifyBtn').addEventListener('click', partialUnifyDesigns);

  // 모든 디자인 저장하기: 디자인마다 완전히 독립된 프로젝트 파일(json)로 각각 저장해 압축(zip)함
  // — 나중에 한두 건만 따로 불러와도 건수(count)가 안 맞아 생기는 오류 없이 바로 열림.
  function buildSingleDesignProjectFile(idx){
    if (idx === currentIdx && designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }
    const entry = designData[idx] || { front: null, back: null };
    return {
      type: 'svg-editor-project',
      version: 1,
      savedAt: new Date().toISOString(),
      orderData,
      count: 1,
      isDouble,
      ratioW, ratioH,
      canvasWidth: CANVAS_W,
      canvasHeight: CANVAS_H,
      designNames: [designNames[idx] || ''],
      // 참고용 메타데이터 — 실제 동작(불러오기 등)에는 영향을 주지 않음
      originalDesignNumber: idx + 1,
      designData: [{ front: entry.front, back: entry.back }]
    };
  }

  document.getElementById('saveAllZipBtn').addEventListener('click', async () => {
    if (typeof JSZip === 'undefined') {
      alert('압축 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해서 다시 시도해주세요.');
      return;
    }

    const zipBtn = document.getElementById('saveAllZipBtn');
    const originalLabel = zipBtn.textContent;
    zipBtn.disabled = true;
    zipBtn.textContent = '저장 중...';

    try {
      // 지금 화면에 보이는 캔버스 내용도 먼저 데이터에 반영
      if (designData[currentIdx]) {
        designData[currentIdx][currentSide] = serializeCurrentCanvas();
      }

      function sanitizeFileName(name){
        return String(name || '').replace(/[\\/:*?"<>|]/g, '').trim();
      }

      const zip = new JSZip();
      const usedNames = new Set();
      for (let i = 0; i < count; i++) {
        const singleProject = buildSingleDesignProjectFile(i);
        let fileName = sanitizeFileName(designNames[i]) || `디자인${i + 1}`;
        if (usedNames.has(fileName)) {
          let n = 2;
          while (usedNames.has(`${fileName}(${n})`)) n++;
          fileName = `${fileName}(${n})`;
        }
        usedNames.add(fileName);
        zip.file(`${fileName}.json`, JSON.stringify(singleProject));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const zipName = `www.ecogr.net-designs-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('디자인을 저장하는 중 문제가 발생했습니다.');
    } finally {
      zipBtn.disabled = false;
      zipBtn.textContent = originalLabel;
    }
  });

  /* ============================================================
     모바일: 좌(디자인목록)/우(속성패널) 패널 공용 컨트롤러
     - 하나를 열면 다른 하나는 자동으로 닫음(겹치지 않게)
     - 열려있는 동안 배경을 어둡게 오버레이 처리, 오버레이를 탭하면 닫힘
     - 각 패널 우상단 ✕ 버튼으로도 닫을 수 있음
  ============================================================ */
  const mobileOverlayEl = document.getElementById('mobileOverlay');
  const tabSidebarEl = document.getElementById('tabSidebar');
  const sidePanelElForDrawer = document.getElementById('sidePanel');

  function isMobileLayout(){
    return window.matchMedia('(max-width:900px)').matches;
  }
  function updateMobileOverlay(){
    const anyOpen = tabSidebarEl.classList.contains('open') || sidePanelElForDrawer.classList.contains('open');
    mobileOverlayEl.classList.toggle('show', isMobileLayout() && anyOpen);
  }
  function openTabSidebar(){
    sidePanelElForDrawer.classList.remove('open');
    tabSidebarEl.classList.add('open');
    updateMobileOverlay();
  }
  function closeTabSidebar(){
    tabSidebarEl.classList.remove('open');
    updateMobileOverlay();
  }
  function openSidePanelDrawer(){
    tabSidebarEl.classList.remove('open');
    sidePanelElForDrawer.classList.add('open');
    updateMobileOverlay();
  }
  function closeSidePanelDrawer(){
    sidePanelElForDrawer.classList.remove('open');
    updateMobileOverlay();
  }
  mobileOverlayEl.addEventListener('click', () => {
    closeTabSidebar();
    closeSidePanelDrawer();
  });
  document.getElementById('tabSidebarCloseBtn').addEventListener('click', closeTabSidebar);
  document.getElementById('sidePanelCloseBtn').addEventListener('click', closeSidePanelDrawer);

  document.getElementById('tabToggleBtn').addEventListener('click', () => {
    if (tabSidebarEl.classList.contains('open')) closeTabSidebar();
    else openTabSidebar();
  });

  /* ============================================================
     5. 실행취소 / 다시실행 (디자인·면 전환 시 초기화됨)
  ============================================================ */
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  let undoStack = [];
  let redoStack = [];
  let restoring = false;
  let saveTimer = null;

  function snapshot(){
    return JSON.stringify(canvas.toJSON(['selectable', 'evented', 'isGuide', 'imageLocked', 'isPenToolPath', 'hasControls', 'hasBorders', 'lockMovementX', 'lockMovementY', 'hoverCursor', 'circularText', 'verticalText', 'puffyText', 'vineText', 'rollText', 'perspectiveText', 'curveText', 'waveText', 'tiredText', 'spiralText', 'magazineText', 'puzzleText', 'skyText', 'chalkText', 'postalText', 'grassText', 'bigbangText', 'eventText', 'golfText', 'christmasText', 'autumnText', 'spaceText', 'doodleText', 'butterflyText', 'soapbubbleText', 'lightningText', 'halloweenText', 'musicnoteText', 'gemText', 'tropicalText', 'candyText', 'jumpText', 'pulseText', 'swayText', 'waddleText', 'popcornText', 'hiccupText', 'breatheText', 'flickerText', 'chatterText', 'walkText', 'doubleOutline', 'threeDText', 'metalText', 'popArtText', 'inkTrapText', 'leafVineText', 'sakuraText', 'shyText', 'fireText', 'meltText', 'bubbleText', 'zebraText', 'speedText', 'reflectionText', 'crackText', 'footprintText', 'animalText', 'seafoodText', 'heartText', 'coffeeText', 'sportsText', 'clubText', 'splashText', 'tileText', 'fruitVegText', 'snowText', 'rainText', 'randomTypo', 'glitchText', 'tearText', 'lightText',
      // 모양필터(M버튼 — 지폐/기하모자이크/물결/원형장식 등) 관련 내부 상태. 이게 빠져있으면
      // 실행취소/다시실행으로 오브젝트가 새로 만들어질 때 이 정보가 사라져서, 눈에 보이는
      // 모양(패턴 채우기 자체)은 그대로여도 "지금 정확히 어떤 필터가 몇 개 적용돼있는지"를
      // 앱이 잊어버림 -> 그 상태에서 다시 선택해 조절하려고 하면 실제 지금 상태가 아니라
      // 엉뚱한(실행취소 직전 메모리에 남아있던) 필터 정보를 기준으로 동작하는 문제가 있었음.
      '_comboLayers', '_comboSize', '_comboPrevFill',
      // P버튼(텍스트) 랜덤 필터의 ◀1/N▶ 목록 복원용 — 마찬가지로 실행취소 후에도
      // "이 오브젝트에 정확히 어떤 조합이 적용돼있었는지"를 잃지 않게 하기 위함.
      '_lastRollComboIds'
    ]));
  }
  function pushHistory(){
    if (restoring || cropState) return; // 자르기 모드 중 임시 사각형은 실행취소 기록에서 제외
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      undoStack.push(snapshot());
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }, 120);
  }
  function updateHistoryButtons(){
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }
  function resetHistory(){
    undoStack = [snapshot()];
    redoStack = [];
    updateHistoryButtons();
  }
  function restoreFrom(json){
    restoring = true;
    // 실행취소/다시실행으로 오브젝트가 통째로 새로 만들어지므로, 지금 열려있는 상세조정
    // 팝업(P/M/J/Z)이 참조하고 있던 오브젝트는 더 이상 캔버스에 있는 그 오브젝트가 아니게 됨.
    // 그대로 두면 팝업이 옛 참조를 붙든 채 안 갱신되므로, 강제로 닫아서 다음에 다시 열 때
    // 항상 최신 상태로 새로 채워지도록 함(T 글꼴 팝업도 동일한 이유로 같이 닫음).
    if (EP.hideQaPopover) EP.hideQaPopover();
    if (EP.hideQaMPopover) EP.hideQaMPopover();
    if (EP.hideQaJPopover) EP.hideQaJPopover();
    if (EP.hideQaZPopover) EP.hideQaZPopover();
    hideFontPopover();
    canvas.loadFromJSON(json, () => {
      if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
      if (EP.reapplyShapeComboPatches) EP.reapplyShapeComboPatches();
      canvas.renderAll();
      restoring = false;
      refreshEmptyHint();
      updateSelectionPanel();
    });
  }
  undoBtn.addEventListener('click', () => {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreFrom(undoStack[undoStack.length - 1]);
    updateHistoryButtons();
  });
  redoBtn.addEventListener('click', () => {
    if (!redoStack.length) return;
    const json = redoStack.pop();
    undoStack.push(json);
    restoreFrom(json);
    updateHistoryButtons();
  });

  canvas.on('object:added', pushHistory);
  canvas.on('object:modified', pushHistory);
  canvas.on('object:removed', () => { pushHistory(); refreshEmptyHint(); });

  // 텍스트 편집이 끝나는 순간(특히 모바일 가상키보드·한글 입력기 조합 입력 이후) 필터가
  // 확실하게 "전체적으로" 다시 그려지도록 강제함. 텍스트 오브젝트는 편집 중(isEditing=true)엔
  // 모든 커스텀 필터 렌더를 건너뛰고 기본 렌더만 쓰는데, 데스크톱은 클릭으로 깔끔하게
  // 편집을 빠져나오지만 모바일은 터치/블러 이벤트 타이밍이 어긋나는 경우가 있어서, 편집이
  // 끝나자마자 (1) 필터 렌더 패치가 살아있는지 다시 확인하고 (2) 캔버스를 통째로 다시 그려서
  // 일부 영역만 필터가 반영된 것처럼 보이는 문제를 막음.
  canvas.on('text:editing:exited', (opt) => {
    if (opt && opt.target && EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
    canvas.requestRenderAll();
  });

  resetHistory();

  /* ============================================================
     6. 이미지(JPG/PNG) 불러오기
  ============================================================ */
  document.getElementById('imageInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      fabric.Image.fromURL(ev.target.result, function(img){
        const maxDim = Math.min(CANVAS_W, CANVAS_H) * 0.8;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        img.set({
          left: CANVAS_W / 2,
          top: CANVAS_H / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale
        });
        canvas.add(img);
        bringGuideToFront();
        canvas.setActiveObject(img);
        canvas.renderAll();
        refreshEmptyHint();
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  /* ============================================================
     6b. 이미지 자르기(크롭)
     - 이미지를 선택한 뒤 속성 패널의 "✂ 자르기" 버튼(또는 이미지 더블클릭)을
       누르면 크롭 모드로 들어가서, 파란 점선 사각형(자를 영역)을 드래그·리사이즈해
       원하는 부분만 남길 수 있습니다.
     - 회전된 이미지는 크롭 편집 중에만 잠시 회전을 0도로 풀어서
       "이미지 자체 기준"으로 정확히 자르고, 적용 후 원래 회전값을 그대로 복원합니다.
     - 실제로 fabric.Image의 cropX/cropY/width/height(원본 픽셀 기준 잘림 영역)를
       바꾸는 방식이라 다른 오브젝트(텍스트/도형)에는 전혀 영향이 없고,
       내보내기/저장 결과물에도 잘린 대로 정확히 반영됩니다.
  ============================================================ */
  const cropToolbar = document.getElementById('cropToolbar');
  const startCropBtn = document.getElementById('startCropBtn');
  const resetCropBtn = document.getElementById('resetCropBtn');
  const applyCropBtn = document.getElementById('applyCropBtn');
  const cancelCropBtn = document.getElementById('cancelCropBtn');

  let cropState = null; // { img, rect, originalAngle, originalSelectable, originalEvented, otherObjs:[{obj,selectable,evented}] }

  function isImageObject(o){ return !!o && o.type === 'image'; }

  /* ---------- 이미지 보정(밝기·대비·채도·흑백) ----------
     fabric.Image.filters의 Brightness/Contrast/Saturation/Grayscale를 그때그때
     obj.filters 배열을 통째로 다시 구성해서 적용함(중첩 누적 대신 항상 최신 슬라이더
     값 기준으로 새로 만듦 — 순서 꼬임/중복 적용 방지). 지도 이미지를 포함해 모든
     이미지 오브젝트에 공통으로 사용됨. */
  function getImageFilterValue(obj, filterType, propName){
    if (!obj || !obj.filters) return 0;
    for (let i = 0; i < obj.filters.length; i++) {
      const f = obj.filters[i];
      if (f && f.type === filterType) return f[propName] || 0;
    }
    return 0;
  }
  function hasGrayscaleFilter(obj){
    return !!(obj && obj.filters && obj.filters.some(f => f && f.type === 'Grayscale'));
  }
  function applyImageAdjustments(obj, opts){
    if (!isImageObject(obj)) return;
    const cur = {
      brightness: getImageFilterValue(obj, 'Brightness', 'brightness'),
      contrast: getImageFilterValue(obj, 'Contrast', 'contrast'),
      saturation: getImageFilterValue(obj, 'Saturation', 'saturation'),
      grayscale: hasGrayscaleFilter(obj)
    };
    const next = Object.assign(cur, opts);
    // Z버튼(이미지 전용 블렌드/투과 필터)이 이미 걸려있다면 배열을 통째로 새로 만들 때 같이
    // 사라지지 않도록 미리 챙겨뒀다가 맨 뒤에 다시 넣어줌. RemoveColor는 흰색투과·지정색투과가
    // 각각 별개 인스턴스로 동시에 걸려있을 수 있어서 전부(배열로) 챙김.
    const blendColorFilter = obj.filters && obj.filters.find(f => f && f.type === 'BlendColor');
    const removeColorFilters = (obj.filters && obj.filters.filter(f => f && f.type === 'RemoveColor')) || [];
    const filters = [];
    if (next.grayscale) filters.push(new fabric.Image.filters.Grayscale());
    if (next.brightness) filters.push(new fabric.Image.filters.Brightness({ brightness: next.brightness }));
    if (next.contrast) filters.push(new fabric.Image.filters.Contrast({ contrast: next.contrast }));
    if (next.saturation) filters.push(new fabric.Image.filters.Saturation({ saturation: next.saturation }));
    if (blendColorFilter) filters.push(blendColorFilter);
    filters.push(...removeColorFilters);
    obj.filters = filters;
    obj.applyFilters();
    canvas.requestRenderAll();
  }

  function setOthersInteractive(exceptObj, on){
    canvas.getObjects().forEach((o) => {
      if (o === exceptObj || o.isGuide) return;
      if (on) {
        if (o.__cropSavedState) { o.selectable = o.__cropSavedState.selectable; o.evented = o.__cropSavedState.evented; delete o.__cropSavedState; }
      } else {
        o.__cropSavedState = { selectable: o.selectable, evented: o.evented };
        o.selectable = false; o.evented = false;
      }
    });
  }

  function clampCropRect(rect, bounds){
    rect.setCoords();
    let w = rect.getScaledWidth();
    let h = rect.getScaledHeight();
    const minSize = 16;
    if (w < minSize) { rect.scaleX = minSize / rect.width; w = minSize; }
    if (h < minSize) { rect.scaleY = minSize / rect.height; h = minSize; }
    if (w > bounds.width) { rect.scaleX = bounds.width / rect.width; w = bounds.width; }
    if (h > bounds.height) { rect.scaleY = bounds.height / rect.height; h = bounds.height; }
    let left = rect.left, top = rect.top;
    left = Math.min(Math.max(left, bounds.left), bounds.left + bounds.width - w);
    top = Math.min(Math.max(top, bounds.top), bounds.top + bounds.height - h);
    rect.set({ left, top });
    rect.setCoords();
  }

  function enterCropMode(img){
    if (!isImageObject(img) || cropState) return;

    const originalAngle = img.angle || 0;
    // 크롭 편집 중에는 이미지 "자체" 기준으로 자르기 위해 회전을 잠시 0으로 초기화
    img.set({ angle: 0 });
    img.setCoords();

    const br = img.getBoundingRect(true, true); // {left, top, width, height} — 절대좌표, 회전 0 상태

    const rect = new fabric.Rect({
      left: br.left, top: br.top,
      width: br.width, height: br.height,
      scaleX: 1, scaleY: 1,
      angle: 0,
      originX: 'left', originY: 'top',
      fill: 'rgba(52,152,219,0.15)',
      stroke: '#3498db', strokeWidth: 2, strokeDashArray: [6, 6],
      strokeUniform: true,
      cornerColor: '#3498db', cornerStrokeColor: '#ffffff', cornerStyle: 'circle',
      transparentCorners: false, cornerSize: 12,
      hasRotatingPoint: false, lockRotation: true,
      selectable: true, evented: true, hasBorders: false
    });
    rect.setControlsVisibility({ mtr: false, qa: false }); // qa: 자르기 중인 임시 사각형이라 모양필터 P버튼은 숨김

    const bounds = { left: br.left, top: br.top, width: br.width, height: br.height };
    rect.on('moving', () => clampCropRect(rect, bounds));
    rect.on('scaling', () => clampCropRect(rect, bounds));

    cropState = {
      img, rect, bounds, originalAngle,
      originalSelectable: img.selectable, originalEvented: img.evented,
      originalOpacity: img.opacity != null ? img.opacity : 1
    };

    setOthersInteractive(img, false);
    img.set({ selectable: false, evented: false, opacity: Math.min(cropState.originalOpacity, 1) * 0.55 });
    canvas.add(rect);
    canvas.bringToFront(rect);
    bringGuideToFront();
    canvas.setActiveObject(rect);
    canvas.renderAll();

    cropToolbar.classList.remove('hidden');
  }

  function exitCropMode(){
    if (!cropState) return;
    canvas.remove(cropState.rect);
    setOthersInteractive(cropState.img, true);
    cropToolbar.classList.add('hidden');
    cropState = null;
  }

  function applyCrop(){
    if (!cropState) return;
    const { img, rect, bounds, originalAngle, originalSelectable, originalEvented, originalOpacity } = cropState;
    rect.setCoords();

    const factorX = img.scaleX || 1;
    const factorY = img.scaleY || 1;
    const relLeft = rect.left - bounds.left;
    const relTop = rect.top - bounds.top;
    const relW = rect.getScaledWidth();
    const relH = rect.getScaledHeight();

    const newCropX = (img.cropX || 0) + relLeft / factorX;
    const newCropY = (img.cropY || 0) + relTop / factorY;
    const newWidth = Math.max(1, relW / factorX);
    const newHeight = Math.max(1, relH / factorY);

    img.set({
      originX: 'left', originY: 'top',
      left: rect.left, top: rect.top,
      cropX: newCropX, cropY: newCropY,
      width: newWidth, height: newHeight,
      angle: originalAngle,
      selectable: originalSelectable, evented: originalEvented,
      opacity: originalOpacity
    });
    img.setCoords();

    canvas.remove(rect);
    setOthersInteractive(img, true);
    cropToolbar.classList.add('hidden');
    cropState = null;

    canvas.setActiveObject(img);
    canvas.renderAll();
    updateSelectionPanel();
    pushHistory();
  }

  function cancelCrop(){
    if (!cropState) return;
    const { img, originalAngle, originalSelectable, originalEvented, originalOpacity } = cropState;
    img.set({ angle: originalAngle, selectable: originalSelectable, evented: originalEvented, opacity: originalOpacity });
    img.setCoords();
    exitCropMode();
    canvas.setActiveObject(img);
    canvas.renderAll();
  }

  function resetCropToOriginal(){
    const img = canvas.getActiveObject();
    if (!isImageObject(img)) return;
    const el = img._element || img._originalElement;
    if (!el) return;
    if (cropState) exitCropMode();
    const naturalW = el.naturalWidth || el.width;
    const naturalH = el.naturalHeight || el.height;
    if (!naturalW || !naturalH) return;

    // 현재 화면에 보이는 크기(자른 부분 기준)는 유지한 채, 크롭 영역만 원본 전체로 되돌림
    const center = img.getCenterPoint();
    img.set({
      cropX: 0, cropY: 0,
      width: naturalW, height: naturalH
    });
    img.setPositionByOrigin(center, 'center', 'center');
    img.setCoords();
    canvas.renderAll();
    updateSelectionPanel();
    pushHistory();
  }

  startCropBtn.addEventListener('click', () => { const o = canvas.getActiveObject(); if (isImageObject(o)) enterCropMode(o); });
  resetCropBtn.addEventListener('click', resetCropToOriginal);
  applyCropBtn.addEventListener('click', applyCrop);
  cancelCropBtn.addEventListener('click', cancelCrop);

  canvas.on('mouse:dblclick', (opt) => {
    if (!opt.target || cropState) return;
    if (opt.target.imageLocked) {
      canvas.setActiveObject(opt.target);
      canvas.requestRenderAll();
      return;
    }
    // 클리핑 마스크가 적용된 이미지(below)는 더블클릭해도 자르기 모드로 들어가지 않고,
    // 그냥 선택된 상태로 남아서 예전처럼 모서리를 드래그해 크기를 늘리고 줄일 수 있게 함
    // (자르기 모드는 마스크 경계와는 별개의 기능이라 지금 맥락에선 오히려 방해가 됨).
    if (opt.target.clipPath) return;
    if (isImageObject(opt.target)) enterCropMode(opt.target);
  });

  document.addEventListener('keydown', (e) => {
    if (!cropState) return;
    if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelCrop(); }
  });

  /* ============================================================
     7. SVG 문자열 -> 편집 가능한 오브젝트로 변환 (내부 유틸)
     사용자가 직접 SVG 파일을 "불러오기"하는 UI 기능은 제거됨. 이 함수 자체는 다른 기능
     (예: ecopro3map.js의 "지도 만들기"가 생성한 SVG 문자열)에서 계속 재사용하므로 남겨둠 —
     낱개 편집 가능한 오브젝트로 캔버스에 넣어주는 공용 유틸.
  ============================================================ */
  function importSvgIntoCanvas(svgText, opts){
    fabric.loadSVGFromString(svgText, function(objects, options){
      objects = objects.filter(Boolean);
      if (!objects.length) { if (opts && opts.onEmpty) opts.onEmpty(); return; }

      const tempGroup = fabric.util.groupSVGElements(objects, options);

      // 기본은 캔버스 정중앙(파일로 불러올 때와 동일), viewportCenter:true를 넘기면
      // 표/이미지 삽입처럼 지금 보이는 화면(zoom·pan 반영) 한가운데에 넣음
      let targetLeft = CANVAS_W / 2, targetTop = CANVAS_H / 2;
      if (opts && opts.viewportCenter) {
        const zoom = canvas.getZoom() || 1;
        const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
        targetLeft = (canvas.getWidth() / 2 - vpt[4]) / zoom;
        targetTop = (canvas.getHeight() / 2 - vpt[5]) / zoom;
      }
      const maxDimBase = (opts && opts.maxDim) ? opts.maxDim : Math.min(CANVAS_W, CANVAS_H) * 0.85;
      const scale = Math.min(maxDimBase / tempGroup.width, maxDimBase / tempGroup.height, 1);
      tempGroup.set({
        left: targetLeft,
        top: targetTop,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale
      });
      tempGroup.setCoords();

      const items = tempGroup.getObjects().slice();
      tempGroup._restoreObjectsState();

      const addedObjs = [];
      items.forEach(function(obj){
        let finalObj = obj;
        if (obj.type === 'text') {
          const props = obj.toObject([
            'left','top','width','height','scaleX','scaleY','angle','skewX','skewY',
            'fontFamily','fontSize','fontWeight','fontStyle','fill','stroke','strokeWidth',
            'textAlign','underline','linethrough','charSpacing','lineHeight','opacity',
            'flipX','flipY','originX','originY'
          ]);
          finalObj = new fabric.IText(obj.text, props);
        }
        finalObj.set({ selectable: true, evented: true });
        canvas.add(finalObj);
        addedObjs.push(finalObj);
      });

      bringGuideToFront();
      canvas.renderAll();
      refreshEmptyHint();
      if (opts && opts.onDone) opts.onDone(addedObjs);
    });
  }

  // 이 에디터가 내보낸 SVG 안에 심어둔 <metadata id="ecopro3-project-data"> 블록을 찾아서
  // 파싱함 — 있으면 이 SVG는 "우리가 저장한 파일"이라는 뜻이므로 완벽 복원이 가능함.
  // 일반 외부 SVG(이 태그가 없는)에는 영향 없음(항상 null 반환 -> 기존 방식으로 처리됨).
  function tryExtractEcopro3Metadata(svgText){
    const m = svgText.match(/<metadata id="ecopro3-project-data"><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>/);
    if (!m) return null;
    try {
      return JSON.parse(m[1].replace(/]]&gt;/g, ']]>'));
    } catch (err) {
      console.error('SVG 안의 프로젝트 데이터 파싱 실패:', err);
      return null;
    }
  }

  // ※ SVG 불러오기 메뉴 항목은 현재 화면에서 숨겨둔 상태(요청에 따라 삭제하지 않고 숨김
  // 처리만 함) — 이 change 리스너와 관련 로직은 그대로 살아있어서, 나중에 필요하면
  // ecopro3.html의 svgInput 관련 label에서 "hidden" 클래스만 지우면 바로 다시 쓸 수 있음.
  document.getElementById('svgInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      const svgText = ev.target.result;
      const restored = tryExtractEcopro3Metadata(svgText);
      if (restored) {
        // 이 에디터로 저장했던 SVG -> 필터·글자 위치 등 전부 원래 그대로 완벽 복원(현재 면을 통째로 교체)
        // 저장 당시 캔버스 크기와 지금 캔버스 크기가 다르면(창 크기가 달라진 경우 등) 그 비율만큼
        // 다시 스케일링해서 한쪽 구석으로 쏠리지 않고 항상 캔버스에 꽉 차게 맞춤.
        const rescaled = rescaleSideDataToCurrentCanvas(restored, restored.canvasWidth, restored.canvasHeight);
        loadCanvasObjects(rescaled, () => {
          resetHistory();
          refreshEmptyHint();
        });
      } else {
        // 일반 SVG 파일 -> 기존처럼 낱개 오브젝트로 변환해서 지금 캔버스에 삽입
        importSvgIntoCanvas(svgText);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ============================================================
     7b. 폰트 파일 불러오기 (임시 적용)
     - 업로드한 폰트는 FontFace API로 이 브라우저 탭에서만 등록되어
       글꼴 목록에 추가되고, 텍스트에 바로 적용해 볼 수 있습니다.
     - 이 폰트 파일 자체는 저장/내보내기 결과물에 절대 포함되지 않고,
       해당 폰트를 쓴 텍스트는 저장 시 자동으로 "이미지"로 바뀌어
       폰트가 없는 다른 환경에서도 모양이 그대로 유지됩니다.
  ============================================================ */
  const customFontNames = new Set(); // 이 세션에서 등록된 커스텀 폰트 이름들

  document.getElementById('fontInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(ev){
      const buffer = ev.target.result;
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const safeName = baseName.replace(/[^a-zA-Z0-9가-힣_-]/g, '') || 'font';
      const fontName = 'custom-' + safeName + '-' + Date.now().toString(36).slice(-4);
      try {
        const face = new FontFace(fontName, buffer);
        await face.load();
        document.fonts.add(face);
        customFontNames.add(fontName);
        const opt = document.createElement('option');
        opt.value = fontName;
        opt.textContent = '🔤 ' + baseName + ' (업로드한 폰트)';
        fontFamilySelect.appendChild(opt);
        floatingFontSelect.appendChild(opt.cloneNode(true));
        canvas.renderAll();
        alert(`"${baseName}" 폰트를 불러왔습니다.\n글꼴 목록 맨 아래에서 선택해 사용할 수 있어요.\n\n※ 이 폰트는 지금 이 화면에서만 임시로 적용되며, 저장/내보내기 시 해당 텍스트는 자동으로 이미지로 바뀌어 저장됩니다.`);
      } catch (err) {
        alert('폰트 파일을 불러오지 못했습니다. ttf/otf/woff 파일인지 확인해주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  });

  function isCustomFontName(name){
    return !!name && customFontNames.has(name);
  }

  // 텍스트 오브젝트(라이브 인스턴스)를 그 자리 그대로의 픽셀 이미지 JSON으로 변환
  function rasterizeTextObjectToImageJSON(obj){
    const MULT = 3; // 저장용 이미지 해상도 배율
    const br = obj.getBoundingRect(true, true);
    const dataUrl = obj.toDataURL({ format: 'png', multiplier: MULT });
    return {
      type: 'image',
      src: dataUrl,
      left: br.left,
      top: br.top,
      width: Math.max(1, Math.round(br.width * MULT)),
      height: Math.max(1, Math.round(br.height * MULT)),
      scaleX: 1 / MULT,
      scaleY: 1 / MULT,
      angle: 0,
      opacity: obj.opacity != null ? obj.opacity : 1,
      selectable: true,
      evented: true
    };
  }

  /* ============================================================
     8. 도구: 선택 / 텍스트추가 / 사각형 / 원
  ============================================================ */
  document.getElementById('selectToolBtn').addEventListener('click', () => {
    if (penActive) setPenMode(false);
    if (textToolActive) setTextToolMode(false);
    if (EP.exitImageToolModes) EP.exitImageToolModes(); // 자동누끼/영역지우기 도구가 켜진 채로 남아있으면 여기서 확실히 끔
    if (EP.exitEyedropperModes) EP.exitEyedropperModes(); // 스포이드 도구가 켜진 채로 남아있으면 여기서 확실히 끔
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.forEachObject(o => { if (!o.isGuide) o.selectable = true; });
  });

  // ---- 텍스트 도구(포토샵 방식): 버튼을 누르면 커서가 I자(텍스트) 모양으로 바뀌는 "무장" 상태가
  //      되고, 캔버스를 클릭한 그 자리에 빈 텍스트 오브젝트가 생기며 바로 깜빡이는 커서와 함께
  //      입력할 수 있게 편집모드로 들어감(입력 즉시 시작 가능, 별도 확인 없이 한 번 클릭으로 끝) ----
  const addTextBtn = document.getElementById('addTextBtn');
  let textToolActive = false;

  // 기본 브라우저 'text' 커서(가늘고 색이 흐릿함)는 캔버스 위에서 잘 안 보인다는 요청이 있어서,
  // 굵고 빨간 I자 모양 커서를 직접 SVG로 그려서 씀(스포이드 커서와 같은 방식).
  const TEXT_TOOL_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'>" +
    "<g stroke='#e74c3c' stroke-width='3.4' stroke-linecap='round'>" +
    "<line x1='7' y1='4' x2='19' y2='4'/>" +
    "<line x1='13' y1='4' x2='13' y2='22'/>" +
    "<line x1='7' y1='22' x2='19' y2='22'/>" +
    "</g></svg>";
  const TEXT_TOOL_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(TEXT_TOOL_CURSOR_SVG) + '") 13 13, text';

  // 텍스트 도구를 처음(딱 한 번만) 무장할 때 사용법을 짧게 안내하는 토스트 메시지.
  // localStorage에 한 번 봤다는 표시를 남겨서, 이후로는(새로고침해도) 다시 뜨지 않음.
  const TEXT_TOOL_HINT_KEY = 'ecopro3_text_tool_hint_seen_v1';
  function showTextToolHintOnce(){
    try {
      if (localStorage.getItem(TEXT_TOOL_HINT_KEY)) return;
      localStorage.setItem(TEXT_TOOL_HINT_KEY, '1');
    } catch (err) {
      // 시크릿 모드 등으로 localStorage를 못 쓰는 환경이면 그냥 매번 안내해도 무방하므로 조용히 통과
    }
    const toast = document.createElement('div');
    toast.className = 'text-tool-hint-toast';
    toast.textContent = '캔버스를 클릭한 후 글을 적어주세요';
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function setTextToolMode(active){
    textToolActive = active;
    addTextBtn.classList.toggle('active', active);
    canvas.selection = !active;
    canvas.skipTargetFind = active;
    canvas.discardActiveObject();
    canvas.defaultCursor = active ? TEXT_TOOL_CURSOR : 'default';
    canvas.hoverCursor = active ? TEXT_TOOL_CURSOR : 'move';
    canvas.renderAll();
    if (active) showTextToolHintOnce();
  }

  addTextBtn.addEventListener('click', () => {
    if (penActive) setPenMode(false);
    setTextToolMode(!textToolActive);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && textToolActive) setTextToolMode(false);
  });

  canvas.on('mouse:down', (opt) => {
    if (!textToolActive) return;
    const p = canvas.getPointer(opt.e);
    const t = new fabric.IText('', {
      left: p.x, top: p.y,
      originX: 'left', originY: 'top',
      fontFamily: 'Pretendard', fontSize: 40, fill: '#222222'
    });
    canvas.add(t);
    bringGuideToFront();
    setTextToolMode(false); // 한 번 클릭해서 만들면 바로 선택 도구로 돌아옴(포토샵과 동일)
    canvas.setActiveObject(t);
    t.enterEditing();
    canvas.requestRenderAll();
  });

  // ---- 글자모양교정: 가로/세로로 눌리거나 늘어난 글자(scaleX ≠ scaleY)를 정비율로 되돌림 ----
  //   - 옆으로 늘어난 경우(scaleX > scaleY): 세로도 그만큼 늘려서 맞춤(scaleY를 scaleX에 맞춤)
  //   - 세로로 길쭉하게 늘어난 경우(scaleY > scaleX): 자간을 기존의 절반으로 줄이고,
  //     세로 크기도 scaleX에 맞게 줄여서 정비율로 만듦
  document.getElementById('fixTextShapeBtn').addEventListener('click', () => {
    const active = canvas.getActiveObject();
    if (!active) return;
    const targets = (active.type === 'activeSelection' || active.type === 'group')
      ? active.getObjects().filter(o => isTextObject(o))
      : (isTextObject(active) ? [active] : []);
    if (!targets.length) return;

    targets.forEach(t => {
      const sx = t.scaleX || 1, sy = t.scaleY || 1;
      if (Math.abs(sx - sy) < 0.001) return; // 이미 정비율이면 그대로 둠
      if (sx > sy) {
        // 옆으로 늘어남 → 세로를 가로만큼 늘려서 맞춤
        t.set('scaleY', sx);
      } else {
        // 세로로 늘어남 → 세로를 가로에 맞게 줄이고, 자간도 절반으로 줄임
        t.set('scaleY', sx);
        t.set('charSpacing', (t.charSpacing || 0) / 2);
      }
      t.setCoords();
    });
    canvas.requestRenderAll();
    pushHistory();
  });

  // ---- 모양 만들기: "◆ 모양 만들기"를 누르면 캔버스 정가운데에 모양 선택 목록이 뜨고,
  //      그중 하나를 클릭하면 즉시 그 모양이 만들어짐(사각형/둥근사각형/원/삼각형/별/하트) ----
  (function(){
    const shapePickerModal = document.getElementById('shapePickerModal');
    const shapePickerModalCloseBtn = document.getElementById('shapePickerModalCloseBtn');
    const shapePickerGridView = document.getElementById('shapePickerGridView');
    const shapePickerRoundRectView = document.getElementById('shapePickerRoundRectView');
    const roundRectWidthInput = document.getElementById('roundRectWidthInput');
    const roundRectHeightInput = document.getElementById('roundRectHeightInput');
    const roundRectRadiusInput = document.getElementById('roundRectRadiusInput');
    const roundRectCreateBtn = document.getElementById('roundRectCreateBtn');
    const roundRectBackBtn = document.getElementById('roundRectBackBtn');

    function showGridView(){
      shapePickerGridView.classList.remove('hidden');
      shapePickerRoundRectView.classList.add('hidden');
    }
    function showRoundRectView(){
      shapePickerGridView.classList.add('hidden');
      shapePickerRoundRectView.classList.remove('hidden');
      roundRectWidthInput.value = 180;
      roundRectHeightInput.value = 120;
      roundRectRadiusInput.value = 20;
    }

    // 모양은 항상 캔버스 정가운데(CANVAS_W/2, CANVAS_H/2)에 만들어지므로, 모달을 그 왼쪽에
    // 자리잡게 함(요청대로). 처음 열 때만 이 위치로 잡아주고, 그 뒤로는 사용자가 마우스로
    // 드래그해서 옮긴 위치를 그대로 유지함(다른 팝업들과 동일한 관례).
    function positionShapePickerModal(){
      shapePickerModal.classList.remove('hidden');
      const mw = shapePickerModal.offsetWidth || 220;
      const mh = shapePickerModal.offsetHeight || 200;
      const canvasRect = canvas.upperCanvasEl.getBoundingClientRect();
      const centerLeft = canvasRect.left + canvasRect.width / 2;
      const centerTop = canvasRect.top + canvasRect.height / 2;
      let left = centerLeft - mw - 16; // 정가운데(=모양이 생길 자리) 왼쪽에 여백을 두고 배치
      let top = centerTop - mh / 2;
      if (left < 8) left = centerLeft + 16; // 화면이 좁아서 왼쪽 공간이 부족하면 오른쪽으로 대체
      const r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, mw, mh, EP.canvasRotationDeg) : { left, top };
      shapePickerModal.style.left = r.left + 'px';
      shapePickerModal.style.top = r.top + 'px';
      if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(shapePickerModal);
    }
    function hideShapePickerModal(){ shapePickerModal.classList.add('hidden'); showGridView(); }

    // 마우스로 클릭+드래그해서 모달창을 원하는 위치로 옮길 수 있게 함(다른 팝업들과 동일)
    if (EP.makeDraggablePopover) EP.makeDraggablePopover(shapePickerModal);
    if (EP.registerRotatablePopover) EP.registerRotatablePopover(shapePickerModal);

    document.getElementById('openShapePickerBtn').addEventListener('click', () => {
      if (penActive) setPenMode(false);
      if (textToolActive) setTextToolMode(false);
      showGridView(); // 매번 새로 열 때는 항상 목록부터 보여줌
      positionShapePickerModal();
    });
    shapePickerModalCloseBtn.addEventListener('click', hideShapePickerModal);

    function addShapeObject(obj){
      canvas.add(obj); bringGuideToFront(); canvas.setActiveObject(obj); canvas.renderAll();
      // (PC에서는 여러 모양을 연달아 만들 수 있게 자동으로 안 닫음 — 모달의 ✕ 버튼을
      // 직접 눌러야만 닫힘. 모바일에서만 화면이 좁아 캔버스를 가리는 게 더 불편하므로,
      // 모양을 하나 만들면 바로 창이 자동으로 닫히게 함)
      if (EP.isMobileModeActive && EP.isMobileModeActive()) hideShapePickerModal();
    }

    document.getElementById('pickRectBtn').addEventListener('click', () => {
      addShapeObject(new fabric.Rect({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        width: 180, height: 120, fill: '#3498db', stroke: '', strokeWidth: 0
      }));
    });

    // 둥근사각형: 바로 만들지 않고, 아까 만들었던 "둥근 정도" 숫자 입력 단계로 먼저 감
    document.getElementById('pickRoundRectBtn').addEventListener('click', () => {
      showRoundRectView();
    });
    roundRectBackBtn.addEventListener('click', showGridView);
    roundRectCreateBtn.addEventListener('click', () => {
      // 가로/세로를 사용자가 직접 입력한 값으로 생성 — 나중에 늘려서 비율을 맞추다가
      // 모서리 radius가 타원형으로 찌그러지는 문제를 애초에 만들 때 원하는 비율로 잡아서 방지함
      const w = Math.max(10, Math.min(parseFloat(roundRectWidthInput.value) || 180, 2000));
      const h = Math.max(10, Math.min(parseFloat(roundRectHeightInput.value) || 120, 2000));
      // 입력값이 클수록 둥근 강도(모서리 반경)도 커짐 — 사각형 짧은 변의 절반을 넘지 않게 막아서
      // 값이 너무 크면 알약(캡슐) 모양까지만 되고 찌그러지지 않게 함
      const radius = Math.max(0, Math.min(parseFloat(roundRectRadiusInput.value) || 0, Math.min(w, h) / 2));
      addShapeObject(new fabric.Rect({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        width: w, height: h, rx: radius, ry: radius, fill: '#3498db', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickCircleBtn').addEventListener('click', () => {
      addShapeObject(new fabric.Circle({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        radius: 80, fill: '#e67e22', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickTriangleBtn').addEventListener('click', () => {
      addShapeObject(new fabric.Triangle({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        width: 160, height: 140, fill: '#9b59b6', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickStarBtn').addEventListener('click', () => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * (Math.PI / 5);
        const rad = i % 2 === 0 ? 80 : 32;
        pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
      }
      addShapeObject(new fabric.Polygon(pts, {
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        fill: '#f1c40f', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickHeartBtn').addEventListener('click', () => {
      const d = 'M0,25 C-40,-5 -70,-45 -35,-65 C-10,-80 0,-50 0,-40 C0,-50 10,-80 35,-65 C70,-45 40,-5 0,25 Z';
      addShapeObject(new fabric.Path(d, {
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        fill: '#e74c3c', stroke: '', strokeWidth: 0
      }));
    });
  })();

  /* ============================================================
     8b. 펜 도구 (일러스트레이터 방식)
     - 클릭: 직선 앵커점 추가
     - 클릭한 채로 드래그: 그 점에 곡선 핸들 생성 (좌우 대칭)
     - 더블클릭 / Enter: 지금까지 그린 경로를 완성 (열린 패스)
     - 시작점 근처를 다시 클릭: 경로를 닫아서 완성 (닫힌 도형)
     - Esc: 그리던 중인 경로 취소 (한번 더 누르면 펜 도구 자체 종료)
  ============================================================ */
  const penToolBtn = document.getElementById('penToolBtn');
  let penActive = false;
  let penPoints = [];      // { x, y, hx, hy } — hx/hy: 이 점에서 바깥쪽으로 드래그한 곡선 핸들 오프셋
  let penDragging = false;
  let penPreviewObjects = [];
  const PEN_CLOSE_TOLERANCE = 10; // 시작점 닫기 판정 (화면 픽셀 기준)

  // 포토샵 펜툴처럼 생긴 커서(닙 모양) — SVG를 데이터 URI로 만들어 커서로 씀.
  // 핫스팟(클릭 포인트)은 닙 끝부분(왼쪽 아래)에 맞춤. 혹시 브라우저가 커스텀 커서를 못 읽으면
  // crosshair로 자동 대체됨(cursor 속성의 콤마 뒤 fallback).
  const PEN_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
    "<line x1='21' y1='3' x2='8' y2='16' stroke='black' stroke-width='3' stroke-linecap='square'/>" +
    "<line x1='21' y1='3' x2='8' y2='16' stroke='white' stroke-width='1' stroke-linecap='square'/>" +
    "<path d='M8 16 L4 21 L2 19 Z' fill='black' stroke='white' stroke-width='0.5' stroke-linejoin='round'/>" +
    "</svg>";
  const PEN_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(PEN_CURSOR_SVG) + '") 2 21, crosshair';

  function setPenMode(active){
    penActive = active;
    penToolBtn.classList.toggle('active', active);
    canvas.selection = !active;
    canvas.skipTargetFind = active;
    canvas.discardActiveObject();
    canvas.defaultCursor = active ? PEN_CURSOR : 'default';
    canvas.hoverCursor = active ? PEN_CURSOR : 'move';
    if (!active) {
      penPoints = [];
      penDragging = false;
      clearPenPreview();
    }
    canvas.renderAll();
  }

  penToolBtn.addEventListener('click', () => {
    if (textToolActive) setTextToolMode(false);
    if (penActive) {
      finishPenPath(false);
      setPenMode(false);
    } else {
      setPenMode(true);
    }
  });

  function clearPenPreview(){
    penPreviewObjects.forEach(o => canvas.remove(o));
    penPreviewObjects = [];
  }

  function buildPenPathD(points, mousePt, closed){
    if (!points.length) return '';
    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const c1x = p0.x + p0.hx, c1y = p0.y + p0.hy;
      const c2x = p1.x - p1.hx, c2y = p1.y - p1.hy;
      d += `C ${c1x} ${c1y} ${c2x} ${c2y} ${p1.x} ${p1.y} `;
    }
    if (mousePt) {
      const last = points[points.length - 1];
      const c1x = last.x + last.hx, c1y = last.y + last.hy;
      d += `C ${c1x} ${c1y} ${mousePt.x} ${mousePt.y} ${mousePt.x} ${mousePt.y} `;
    } else if (closed && points.length > 1) {
      const last = points[points.length - 1], first = points[0];
      const c1x = last.x + last.hx, c1y = last.y + last.hy;
      const c2x = first.x - first.hx, c2y = first.y - first.hy;
      d += `C ${c1x} ${c1y} ${c2x} ${c2y} ${first.x} ${first.y} `;
    }
    if (closed) d += 'Z';
    return d;
  }

  function renderPenPreview(mousePt){
    clearPenPreview();
    if (!penPoints.length) { canvas.renderAll(); return; }

    const d = buildPenPathD(penPoints, mousePt, false);
    const previewPath = new fabric.Path(d, {
      fill: '', stroke: '#3498db', strokeWidth: 1.5 / zoom,
      strokeDashArray: [5 / zoom, 4 / zoom],
      selectable: false, evented: false, objectCaching: false
    });
    previewPath.isGuide = true;
    canvas.add(previewPath);
    penPreviewObjects.push(previewPath);

    penPoints.forEach((p) => {
      const dot = new fabric.Circle({
        left: p.x, top: p.y, originX: 'center', originY: 'center',
        radius: 4 / zoom, fill: '#ffffff', stroke: '#3498db', strokeWidth: 1.5 / zoom,
        selectable: false, evented: false
      });
      dot.isGuide = true;
      canvas.add(dot);
      penPreviewObjects.push(dot);

      if (p.hx || p.hy) {
        const line = new fabric.Line([p.x - p.hx, p.y - p.hy, p.x + p.hx, p.y + p.hy], {
          stroke: '#3498db', strokeWidth: 1 / zoom, selectable: false, evented: false
        });
        line.isGuide = true;
        canvas.add(line);
        penPreviewObjects.push(line);

        [[p.x + p.hx, p.y + p.hy], [p.x - p.hx, p.y - p.hy]].forEach(([hx, hy]) => {
          const hd = new fabric.Rect({
            left: hx, top: hy, originX: 'center', originY: 'center',
            width: 5 / zoom, height: 5 / zoom, fill: '#3498db',
            selectable: false, evented: false
          });
          hd.isGuide = true;
          canvas.add(hd);
          penPreviewObjects.push(hd);
        });
      }
    });

    canvas.renderAll();
  }

  function finishPenPath(closed){
    if (penPoints.length < 2) {
      penPoints = [];
      penDragging = false;
      clearPenPreview();
      canvas.renderAll();
      return;
    }
    const d = buildPenPathD(penPoints, null, closed);
    clearPenPreview();

    const path = new fabric.Path(d, {
      fill: closed ? 'rgba(52,152,219,0.15)' : 'transparent',
      stroke: '#222222',
      strokeWidth: 3,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: true,
      evented: true,
      objectCaching: false
    });
    path.isPenToolPath = true; // 펜 도구로 만든 패스임을 표시 — K 버튼(테두리 색상/불투명도/두께 팝업)은 이 표시가 있는 오브젝트에만 뜸
    canvas.add(path);
    bringGuideToFront();
    canvas.setActiveObject(path);
    canvas.renderAll();

    penPoints = [];
    penDragging = false;
  }

  canvas.on('mouse:down', (opt) => {
    if (!penActive) return;
    const p = canvas.getPointer(opt.e);

    if (penPoints.length >= 2) {
      const first = penPoints[0];
      const screenDist = Math.hypot(p.x - first.x, p.y - first.y) * zoom;
      if (screenDist <= PEN_CLOSE_TOLERANCE) {
        finishPenPath(true);
        return;
      }
    }

    penPoints.push({ x: p.x, y: p.y, hx: 0, hy: 0 });
    penDragging = true;
    renderPenPreview(p);
  });

  canvas.on('mouse:move', (opt) => {
    if (!penActive || !penPoints.length) return;
    const p = canvas.getPointer(opt.e);
    if (penDragging) {
      const anchor = penPoints[penPoints.length - 1];
      anchor.hx = p.x - anchor.x;
      anchor.hy = p.y - anchor.y;
    }
    renderPenPreview(p);
  });

  canvas.on('mouse:up', () => {
    if (!penActive) return;
    penDragging = false;
  });

  canvas.on('mouse:dblclick', () => {
    if (!penActive) return;
    finishPenPath(false);
  });

  // 펜 도구 사용 중 캔버스 "밖"(캔버스 감싸는 여백의 투명/체크무늬 영역)을 좌클릭하면,
  // 그리던 중이던 경로는 취소하고 선택 도구로 바로 전환·활성화해줌(선택 버튼을 직접
  // 누른 것과 완전히 동일하게 동작하도록 그 클릭 핸들러를 그대로 재사용함).
  canvasWrap.addEventListener('mousedown', function(e){
    if (!penActive) return;
    if (e.button !== 0) return; // 좌클릭만 해당
    // 실제 캔버스(그림이 그려지는 영역) 안쪽 클릭이면 펜 도구 자체 로직에 맡기고 여기선 무시
    if (canvas.upperCanvasEl.contains(e.target)) return;
    penPoints = [];
    penDragging = false;
    clearPenPreview();
    document.getElementById('selectToolBtn').click(); // 선택 도구의 기존 활성화 로직을 그대로 재사용
  });

  /* ============================================================
     9. 삭제 / 복제
  ============================================================ */
  const deleteBtn = document.getElementById('deleteBtn');
  const deleteSideBtn = document.getElementById('deleteSideBtn');
  function deleteSelected(){
    if (cropState) return; // 자르기 모드 중에는 일반 삭제 동작을 막음 (취소 버튼/Esc로 나가기)
    const objs = canvas.getActiveObjects().filter(o => !o.isGuide);
    if (!objs.length) return;
    objs.forEach(o => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.renderAll();
  }
  deleteBtn.addEventListener('click', deleteSelected);
  deleteSideBtn.addEventListener('click', deleteSelected);
  EP.deleteSelected = deleteSelected; // 모바일 휴지통 버튼(ecopro3mobiletools.js)에서 재사용

  document.getElementById('duplicateBtn').addEventListener('click', () => {
    if (cropState) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide) return;
    obj.clone(clone => {
      clone.set({
        left: obj.left + 20, top: obj.top + 20,
        // 잠긴(선택 불가) 오브젝트를 롱프레스로 선택한 뒤 복제한 경우에도, 새로 만든
        // 복제본은 원본의 잠금 상태를 물려받지 않고 항상 바로 선택·이동 가능한 상태로
        // 시작하게 함 (요청: "복제로 만든 레이어들 모두 선택 가능하게")
        selectable: true, evented: true, imageLocked: false,
        hasControls: true, hasBorders: true,
        lockMovementX: false, lockMovementY: false,
        hoverCursor: 'move'
      });
      canvas.add(clone); bringGuideToFront();
      if (EP.reindexPastedTable) EP.reindexPastedTable(clone); // 표를 복제한 경우 새 tableId로 재등록
      canvas.setActiveObject(clone);
      canvas.renderAll();
    }, ['selectable', 'evented', 'imageLocked', 'isPenToolPath'].concat(EP.tableCloneProps || []));
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const active = canvas.getActiveObject();
    if (active && active.isEditing) return;

    if (penActive) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (penPoints.length) {
          penPoints = []; penDragging = false; clearPenPreview(); canvas.renderAll();
        } else {
          setPenMode(false);
        }
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); finishPenPath(false); return; }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
  });

  /* ============================================================
     9b. 복사 / 붙여넣기
  ============================================================ */
  let clipboard = null;

  function copySelected(){
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide || cropState) return;
    obj.clone((cloned) => { clipboard = cloned; }, ['selectable', 'evented', 'imageLocked', 'isPenToolPath'].concat(EP.tableCloneProps || []));
  }

  function pasteClipboard(pointer){
    if (!clipboard || cropState) return;
    clipboard.clone((clonedObj) => {
      canvas.discardActiveObject();
      clonedObj.set({
        left: pointer ? pointer.x : (clonedObj.left || 0) + 24,
        top: pointer ? pointer.y : (clonedObj.top || 0) + 24,
        // 잠긴 오브젝트를 복사한 뒤 붙여넣은 경우에도, 붙여넣기 결과는 항상 바로
        // 선택·이동 가능한 상태로 시작하게 함(복제 버튼과 동일한 이유)
        selectable: true, evented: true, imageLocked: false,
        hasControls: true, hasBorders: true,
        lockMovementX: false, lockMovementY: false,
        hoverCursor: 'move'
      });
      if (clonedObj.type === 'activeSelection') {
        clonedObj.canvas = canvas;
        clonedObj.forEachObject((o) => {
          canvas.add(o);
          if (EP.reindexPastedTable) EP.reindexPastedTable(o); // 여러 개 중에 표가 섞여 있으면 그 표만 새 tableId로 재등록
        });
        clonedObj.setCoords();
      } else {
        canvas.add(clonedObj);
        if (EP.reindexPastedTable) EP.reindexPastedTable(clonedObj); // 붙여넣은 게 표라면 원본과 안 겹치도록 새 tableId로 재등록
      }
      bringGuideToFront();
      canvas.setActiveObject(clonedObj);
      canvas.requestRenderAll();
      pushHistory();
    }, ['selectable', 'evented', 'imageLocked', 'isPenToolPath'].concat(EP.tableCloneProps || []));
  }

  /* ============================================================
     9c. 이미지 잠금 / 잠금 해제
     - 잠긴 이미지는 일반 클릭으로 선택·이동할 수 없고,
       꾹 누르고 있거나(롱프레스) 더블클릭해야 선택되어
       우클릭 메뉴에서 "잠금 해제"를 고를 수 있습니다.
  ============================================================ */
  function lockImage(img){
    img.set({
      selectable: false,
      evented: true,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      hoverCursor: 'pointer'
    });
    img.imageLocked = true;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }

  function unlockImage(img){
    img.set({
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      hoverCursor: 'move'
    });
    img.imageLocked = false;
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    pushHistory();
  }
  EP.lockImage = lockImage;     // 모바일 잠금 버튼(ecopro3mobiletools.js)에서 재사용
  EP.unlockImage = unlockImage; // 위와 동일

  let longPressTimer = null;
  let longPressTarget = null;
  canvas.on('mouse:down', (opt) => {
    if (opt.target && opt.target.imageLocked) {
      longPressTarget = opt.target;
      longPressTimer = setTimeout(() => {
        if (longPressTarget) {
          canvas.setActiveObject(longPressTarget);
          canvas.requestRenderAll();
        }
      }, 550);
    }
  });
  canvas.on('mouse:up', () => { clearTimeout(longPressTimer); longPressTarget = null; });

  /* ============================================================
     9d. 이미지 교체
  ============================================================ */
  const replaceImageInput = document.getElementById('replaceImageInput');
  let replaceTargetImg = null;
  function startReplaceImage(img){
    replaceTargetImg = img;
    replaceImageInput.value = '';
    replaceImageInput.click();
  }
  replaceImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !replaceTargetImg) { replaceTargetImg = null; return; }
    const targetImg = replaceTargetImg;
    replaceTargetImg = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      targetImg.setSrc(ev.target.result, () => {
        const el = targetImg._element;
        targetImg.set({
          cropX: 0, cropY: 0,
          width: (el && el.naturalWidth) || targetImg.width,
          height: (el && el.naturalHeight) || targetImg.height
        });
        targetImg.setCoords();
        canvas.renderAll();
        pushHistory();
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  /* ============================================================
     9e. 커스텀 우클릭(컨텍스트) 메뉴
     - 브라우저 기본 우클릭 메뉴 대신, 오브젝트 종류에 맞는
       복사/붙여넣기/실행취소/다시실행/삭제/이미지 잠금·교체 메뉴를 띄움
  ============================================================ */
  const ctxMenu = document.getElementById('customContextMenu');

  function hideContextMenu(){
    ctxMenu.classList.add('hidden');
  }

  function addCtxItem(label, handler, danger){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (danger) btn.classList.add('danger');
    btn.addEventListener('click', () => { hideContextMenu(); handler(); });
    ctxMenu.appendChild(btn);
    return btn;
  }
  function addCtxDivider(){
    const hr = document.createElement('div');
    hr.className = 'ctx-divider';
    ctxMenu.appendChild(hr);
  }

  function openContextMenu(e){
    if (cropState) return;
    e.preventDefault();
    const pointer = canvas.getPointer(e);
    const target = canvas.findTarget(e, false);
    ctxMenu.innerHTML = '';

    if (target && (target.isTableCell || target.isTableCellText) && EP.buildTableContextMenu) {
      EP.buildTableContextMenu(target, e, addCtxItem, addCtxDivider);
    } else if (target && target.isTableGroup && EP.enterTableEditMode) {
      // 아직 그룹으로 묶여있는 표를 우클릭한 경우: 메뉴 대신 바로 편집모드로 진입시켜서
      // "표 편집 완료" 버튼이 확실히 뜨게 함 (더블클릭이 씹히는 경우의 대비책)
      EP.enterTableEditMode(target);
      hideContextMenu();
      return;
    } else if (target && !target.isGuide) {
      if (target.imageLocked) {
        addCtxItem('🔓 잠금 해제', () => unlockImage(target));
        if (isImageObject(target)) addCtxItem('🖼 이미지 교체', () => startReplaceImage(target));
        addCtxItem('🗑 삭제', () => { canvas.remove(target); canvas.discardActiveObject(); canvas.renderAll(); pushHistory(); }, true);
      } else {
        if (canvas.getActiveObject() !== target) {
          canvas.setActiveObject(target);
          canvas.renderAll();
        }
        if (isImageObject(target)) {
          addCtxItem('🔒 이미지 잠금', () => lockImage(target));
          addCtxItem('🗑 이미지 삭제', () => deleteSelected(), true);
        } else {
          addCtxItem('🔒 잠금', () => lockImage(target));
          addCtxItem('🗑 삭제', () => deleteSelected(), true);
        }
        addCtxDivider();
        addCtxItem('⧉ 복제', () => { const duplicateBtn = document.getElementById('duplicateBtn'); if (duplicateBtn) duplicateBtn.click(); });
        addCtxDivider();
        if (target.type === 'group') {
          addCtxItem('🔓 풀기', () => {
            const sel = target.toActiveSelection();
            canvas.setActiveObject(sel);
            canvas.requestRenderAll();
            pushHistory();
          });
        } else if (target.type === 'activeSelection' && target.size() >= 2) {
          addCtxItem('🔗 묶기', () => {
            const group = target.toGroup();
            canvas.setActiveObject(group);
            canvas.requestRenderAll();
            pushHistory();
          });
        }
        addCtxDivider();
        addCtxItem('⬆ 레이어 앞으로', () => { canvas.bringToFront(target); bringGuideToFront(); canvas.renderAll(); pushHistory(); });
        addCtxItem('⬇ 레이어 뒤로', () => { canvas.sendToBack(target); canvas.renderAll(); pushHistory(); });
        addCtxItem('↻ 90도 회전', () => { const rotateObjectBtn = document.getElementById('rotateObjectBtn'); if (rotateObjectBtn) rotateObjectBtn.click(); });
        if (isImageObject(target)) {
          addCtxDivider();
          addCtxItem('🖼 이미지 교체', () => startReplaceImage(target));
        }
      }
    } else {
      addCtxItem('📋 붙여넣기', () => pasteClipboard(pointer));
    }

    ctxMenu.classList.remove('hidden');
    const menuRect = ctxMenu.getBoundingClientRect();
    let x = e.clientX, y = e.clientY;
    if (x + menuRect.width > window.innerWidth - 8) x = window.innerWidth - menuRect.width - 8;
    if (y + menuRect.height > window.innerHeight - 8) y = window.innerHeight - menuRect.height - 8;
    ctxMenu.style.left = Math.max(8, x) + 'px';
    ctxMenu.style.top = Math.max(8, y) + 'px';
  }

  canvas.upperCanvasEl.addEventListener('contextmenu', openContextMenu);
  canvasWrap.addEventListener('contextmenu', (e) => { if (e.target === canvasWrap) e.preventDefault(); });

  /* ============================================================
     9e-2. 길게 누르기(1초 이상)로 우클릭 메뉴 열기 — PC/모바일 공통
     - 마우스든 손가락(터치)이든 캔버스 위에서 1초 이상 같은 자리를 누르고 있으면,
       실제 우클릭(contextmenu)과 완전히 같은 메뉴가 그 자리에서 열림(openContextMenu를
       그대로 재사용하므로 메뉴 내용·동작은 100% 동일함).
     - 누른 채로 일정 거리 이상(10px) 움직이면 오브젝트를 드래그해서 옮기려는 의도로
       보고 자동으로 취소함(그래야 평소처럼 드래그로 이동하는 데 지장이 없음).
  ============================================================ */
  let ctxLongPressTimer = null;
  let ctxLongPressStart = null; // { x, y, e }
  const CTX_LONG_PRESS_MS = 1000;
  const CTX_LONG_PRESS_MOVE_TOLERANCE = 10; // px — 마우스(포인터)는 원래도 잘 안 흔들리므로 그대로 둠
  const CTX_LONG_PRESS_MOVE_TOLERANCE_TOUCH = 26; // px — 손가락은 가만히 누르고 있어도 몇 px씩 미세하게
  // 흔들리는 게 정상이라, 마우스와 같은 10px 기준을 쓰면 안드로이드에서 타이머가 1초를 채우기도
  // 전에 "움직였다"고 오판해서 계속 취소돼버려 길게 눌러도 메뉴가 안 뜨는 문제가 있었음.

  function clearCtxLongPress(){
    if (ctxLongPressTimer) { clearTimeout(ctxLongPressTimer); ctxLongPressTimer = null; }
    ctxLongPressStart = null;
  }
  function clientPointOf(evt){
    return (evt.touches && evt.touches.length) ? evt.touches[0] : evt;
  }
  function isTouchEvent(evt){
    return !!(evt.touches || evt.pointerType === 'touch' || evt.type === 'touchstart');
  }

  canvas.on('mouse:down', (opt) => {
    clearCtxLongPress();
    const evt = opt.e;
    if (!evt) return;
    const p = clientPointOf(evt);
    ctxLongPressStart = { x: p.clientX, y: p.clientY, e: evt, touch: isTouchEvent(evt) };
    ctxLongPressTimer = setTimeout(() => {
      if (!ctxLongPressStart) return;
      const heldEvent = ctxLongPressStart.e;
      ctxLongPressStart = null;
      openContextMenu(heldEvent);
    }, CTX_LONG_PRESS_MS);
  });
  canvas.on('mouse:move', (opt) => {
    if (!ctxLongPressStart || !opt.e) return;
    const p = clientPointOf(opt.e);
    const dx = p.clientX - ctxLongPressStart.x;
    const dy = p.clientY - ctxLongPressStart.y;
    const tolerance = ctxLongPressStart.touch ? CTX_LONG_PRESS_MOVE_TOLERANCE_TOUCH : CTX_LONG_PRESS_MOVE_TOLERANCE;
    if (Math.sqrt(dx * dx + dy * dy) > tolerance) clearCtxLongPress();
  });
  canvas.on('mouse:up', clearCtxLongPress);

  document.addEventListener('mousedown', (e) => {
    if (!ctxMenu.classList.contains('hidden') && !ctxMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

  /* ============================================================
     10. 줌 — 회전 버튼처럼 드롭다운으로 배율을 골라서 적용
  ============================================================ */
  let zoom = 1;
  const zoomMenuBtnLabel = document.getElementById('zoomMenuBtnLabel');
  function setZoomLevel(z){
    zoom = Math.min(Math.max(z, 0.2), 3);
    canvas.setZoom(zoom);
    canvas.setWidth(CANVAS_W * zoom);
    canvas.setHeight(CANVAS_H * zoom);
    zoomMenuBtnLabel.textContent = Math.round(zoom * 100) + '%';
    if (EP.onZoomChanged) EP.onZoomChanged(zoom); // 모바일 확대 게이지(ecopro3mobiletools.js)가 값을 맞출 수 있게 알려줌
  }
  document.querySelectorAll('#zoomMenu .dropdown-item').forEach(btn => {
    btn.addEventListener('click', () => setZoomLevel((parseFloat(btn.dataset.zoom) || 100) / 100));
  });
  setZoomLevel(1);
  EP.setZoomLevel = setZoomLevel;       // 모바일 확대 게이지에서 재사용
  EP.getZoomLevel = () => zoom;         // 위와 동일(현재 배율 읽기용)

  canvasWrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoomLevel(zoom + (e.deltaY < 0 ? 0.08 : -0.08));
  }, { passive: false });

  /* ============================================================
     11. 레이어 순서 / 뒤집기
  ============================================================ */
  document.getElementById('layerFrontBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.bringToFront(o); bringGuideToFront(); canvas.renderAll(); } });
  document.getElementById('layerBackBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.sendToBack(o); canvas.renderAll(); } });
  document.getElementById('layerForwardBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.bringForward(o); bringGuideToFront(); canvas.renderAll(); } });
  document.getElementById('layerBackwardBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.sendBackwards(o); canvas.renderAll(); } });

  /* ============================================================
     12. 내보내기 (PNG / JPG / SVG) — 안내선은 항상 제외
     data-export 버튼은 상단 "🖼 이미지" 드롭다운 메뉴 안에만 있음(우측 하단 플로팅
     "상품담기/구입" 버튼은 아무 기능 없는 자리표시 버튼이라 여기 관여 안 함).
     메뉴 컨테이너가 클릭 시 e.stopPropagation()을 걸어두므로, document에 위임해서 듣는
     방식이 아니라 각 버튼에 직접 리스너를 붙여서 확실하게 동작하도록 함.
  ============================================================ */
  function download(url, filename){
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // 현재 캔버스를 복제한 뒤, 업로드한(임시) 폰트를 쓴 텍스트만 골라 이미지로 바꿔치기함
  // (SVG로 내보낼 때 사용 — 결과 SVG가 그 폰트 파일 없이도 어디서나 똑같이 보이도록)
  function buildFontFlattenedClone(){
    return new Promise((resolve) => {
      canvas.clone((cloned) => {
        const targets = cloned.getObjects().filter(o => !o.isGuide && isTextObject(o) && isCustomFontName(o.fontFamily));
        if (!targets.length) { resolve(cloned); return; }
        let remaining = targets.length;
        targets.forEach((obj) => {
          const imgJSON = rasterizeTextObjectToImageJSON(obj);
          cloned.remove(obj);
          fabric.Image.fromURL(imgJSON.src, (img) => {
            img.set({
              left: imgJSON.left, top: imgJSON.top,
              scaleX: imgJSON.scaleX, scaleY: imgJSON.scaleY,
              opacity: imgJSON.opacity, selectable: true, evented: true
            });
            cloned.add(img);
            remaining--;
            if (remaining === 0) resolve(cloned);
          });
        });
      });
    });
  }

  // 상단 "🖼 이미지" 메뉴 안의 PNG/JPG/SVG 버튼 각각에 직접 리스너를 붙임(메뉴 컨테이너에
  // 위임하지 않음 — 메뉴가 자기 안 클릭을 e.stopPropagation()으로 막아버리는 것과 무관하게
  // 항상 확실히 실행되도록 하기 위함).
  async function handleExportClick(e){
    const trigger = e.currentTarget;
    const type = trigger.getAttribute('data-export');
    if (!type) return;
    canvas.discardActiveObject();
    const wasBoxVisible = guideRect.visible, wasGridVisible = gridGuide.visible;
    guideRect.visible = false; outerGuideRect.visible = false; gridGuide.visible = false;
    canvas.renderAll();
    const multiplier = 1 / zoom;

    if (type === 'png') {
      download(canvas.toDataURL({ format: 'png', multiplier }), 'design.png');
    } else if (type === 'jpg') {
      download(canvas.toDataURL({ format: 'jpeg', quality: 0.95, multiplier }), 'design.jpg');
    } else if (type === 'svg') {
      trigger.disabled = true;
      const flattened = await buildFontFlattenedClone();
      let svgString = flattened.toSVG();
      // 이 SVG를 나중에 "SVG 불러오기"로 다시 열었을 때 필터·글자 위치 등이 전혀 손실되지
      // 않고 완벽히 복원되도록, 캔버스의 전체 데이터를 <metadata> 안에 그대로 함께 저장해둠.
      // 순수 SVG 뷰어/다른 프로그램에서는 이 태그가 그냥 무시되고 평소처럼 보이는 그림만 보임
      // — 이 에디터로 다시 열 때만 읽힘.
      // 주의: 프로젝트 저장(JSON)과 똑같이, 업로드한(임시) 폰트를 쓴 텍스트는 이미지로 바꿔서
      // 넣음 — 그 폰트는 이 브라우저 탭에만 등록돼있어서(파일 자체가 저장되지 않음), 원본
      // 그대로(글꼴 이름만) 넣어두면 다른 사람이나 나중에 다시 열었을 때 그 폰트가 이미
      // 사라지고 없어서 엉뚱한 기본 글꼴로 보이는 문제가 생기기 때문. 이미지로 바꿔두면
      // 폰트 없이도 항상 모양이 정확히 유지됨(다만 그 텍스트만 이후 글자 내용 수정은 불가).
      const originalData = await flattenSideDataForSave(serializeCurrentCanvas());
      const metadataJson = JSON.stringify(Object.assign({}, originalData, { canvasWidth: CANVAS_W, canvasHeight: CANVAS_H })).replace(/]]>/g, ']]&gt;'); // CDATA 종료 시퀀스 충돌 방지
      const metadataTag = '<metadata id="ecopro3-project-data"><![CDATA[' + metadataJson + ']]></metadata>';
      svgString = svgString.replace(/(<svg[^>]*>)/, '$1' + metadataTag);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download(url, 'design.svg');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      flattened.dispose();
      trigger.disabled = false;
    } else if (type === 'svg-vector') {
      // 폰트를 이미지로 바꾸는 과정(buildFontFlattenedClone) 자체를 건너뛰고, 지금 캔버스를
      // 있는 그대로 바로 SVG로 뽑음 — 그래서 글자도 <text>로, 도형도 전부 벡터 경로 그대로
      // 남아서 래스터화(이미지화)가 전혀 없음. 다만 업로드한 임시 폰트를 쓴 글자가 있으면
      // 그 폰트가 없는 다른 환경에서는 다른 글꼴로 대체되어 보일 수 있음(트레이드오프).
      let svgString = canvas.toSVG();
      const originalData = serializeCurrentCanvas(); // 이쪽도 폰트를 안 바꾼 원본 그대로 넣음(내용 일치)
      const metadataJson = JSON.stringify(Object.assign({}, originalData, { canvasWidth: CANVAS_W, canvasHeight: CANVAS_H })).replace(/]]>/g, ']]&gt;');
      const metadataTag = '<metadata id="ecopro3-project-data"><![CDATA[' + metadataJson + ']]></metadata>';
      svgString = svgString.replace(/(<svg[^>]*>)/, '$1' + metadataTag);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download(url, 'design-vector.svg');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    guideRect.visible = wasBoxVisible; outerGuideRect.visible = wasBoxVisible; gridGuide.visible = wasGridVisible;
    canvas.renderAll();
  }
  document.querySelectorAll('#fileMenu [data-export]').forEach(btn => btn.addEventListener('click', handleExportClick));

  /* ============================================================
     12b. "상품담기/구입" (플로팅 바 우측 버튼)
     - 모든 디자인(양면이면 앞/뒤 각각)을 순회하며 세 가지를 뽑아냄:
       1) 시안 이미지 (일반 해상도 JPEG) — sian.html 보드에 그대로 표시됨
       2) 원본 SVG (업로드한 임시 폰트는 이미지로 바꿔 어디서나 동일하게 보이도록)
       3) 고해상도 원본 PNG (인쇄/다운로드용)
     - 세 가지 모두 IndexedDB에 담아 시안보기 페이지(sian.html)로 넘기고,
       현재 쿼리(count/width/height 등)도 그대로 이어서 전달함. (sessionStorage는
       도메인당 5~10MB로 한도가 낮아 고해상도 이미지 여러 장을 담기엔 부족해서,
       한도가 훨씬 넉넉한 IndexedDB로 교체함 — 같은 브라우저의 같은 사이트끼리는
       페이지를 이동해도 그대로 읽을 수 있음)
  ============================================================ */
  const PREVIEW_STORAGE_KEY = 'ecogr_preview_designs';       // sian.html이 그대로 읽는 키(포맷 동일: [{label, dataUrl}])
  const ORIGINAL_SVG_KEY = 'ecogr_original_svgs';            // [{label, svg}]
  const SIAN_PAGE_URL = 'sian';

  // switchTo()와 달리 히스토리 리셋 등 부수효과 없이, 내보내기 목적으로만 조용히 화면을 바꿔줌
  function loadDesignForExport(idx, side){
    return new Promise((resolve) => {
      loadCanvasObjects(designData[idx][side], () => {
        guideRect.visible = false; outerGuideRect.visible = false; gridGuide.visible = false;
        canvas.discardActiveObject();
        canvas.renderAll();
        resolve();
      });
    });
  }

  const floatingSaveBtn = document.getElementById('floatingSaveBtn');
  floatingSaveBtn.addEventListener('click', async () => {
    if (designData[currentIdx]) designData[currentIdx][currentSide] = serializeCurrentCanvas();

    // 1) 건수/앞뒤면 누락 검사 — 캔버스를 건드리기 전에 저장된 데이터만으로 빠르게 확인
    const sidesToCheck = isDouble ? ['front', 'back'] : ['front'];
    const missingLabels = [];
    for (let i = 0; i < count; i++) {
      for (const side of sidesToCheck) {
        const data = designData[i][side];
        const hasContent = data && Array.isArray(data.objects) && data.objects.length > 0;
        if (!hasContent) {
          missingLabels.push(`디자인 ${i + 1}` + (isDouble ? (side === 'front' ? ' 앞면' : ' 뒷면') : ''));
        }
      }
    }
    if (missingLabels.length > 0) {
      alert('아직 작업되지 않은 디자인이 있습니다.\n\n' + missingLabels.join('\n') + '\n\n모든 디자인을 작업해주세요.');
      return;
    }

    const originalBtnText = floatingSaveBtn.textContent;
    floatingSaveBtn.disabled = true;

    const originalIdx = currentIdx;
    const originalSide = currentSide;
    const wasBoxVisible = guideRect.visible, wasGridVisible = gridGuide.visible;

    const previews = [];
    const svgs = [];

    // 오브젝트 하나가 캔버스 전체(붉은선 바깥 회색선, 즉 도련까지)를 덮고 있는지 확인
    function isFullyBled(){
      const tol = 1; // 부동소수점 오차 허용
      return canvas.getObjects().some((o) => {
        if (o.isGuide) return false;
        const r = o.getBoundingRect(true, true);
        return r.left <= tol && r.top <= tol &&
          (r.left + r.width) >= (CANVAS_W - tol) &&
          (r.top + r.height) >= (CANVAS_H - tol);
      });
    }

    try {
      const sides = isDouble ? ['front', 'back'] : ['front'];
      for (let i = 0; i < count; i++) {
        for (const side of sides) {
          const label = `디자인 ${i + 1}` + (isDouble ? (side === 'front' ? ' 앞면' : ' 뒷면') : '');
          floatingSaveBtn.textContent = `${label} 확인 중...`;
          await loadDesignForExport(i, side);

          // 2) 회색선(도련)까지 이미지가 채워졌는지 검사
          if (!isFullyBled()) {
            alert(`${label} — 바탕이미지를 붉은선 밖 회색선까지 이미지를 채워주세요.`);
            await loadDesignForExport(originalIdx, originalSide);
            guideRect.visible = wasBoxVisible; outerGuideRect.visible = wasBoxVisible; gridGuide.visible = wasGridVisible;
            canvas.renderAll();
            renderTabs();
            return;
          }

          floatingSaveBtn.textContent = `${label} 준비 중...`;
          const multiplier = Math.max(1 / zoom, 4);

          // 1) 고해상도 JPEG — 시안 미리보기와 인쇄용 원본을 겸함 (PNG는 무손실이라
          //    용량이 너무 커서 sessionStorage 한도를 쉽게 넘겨버려 JPEG로 통일함)
          const jpegDataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.95, multiplier });
          previews.push({ label, dataUrl: jpegDataUrl });

          // 3) 원본 SVG — PNG/JPG 내보내기와 동일하게 임시 폰트만 이미지로 바꿔서 뽑음
          const flattened = await buildFontFlattenedClone();
          const svgString = flattened.toSVG();
          flattened.dispose();
          svgs.push({ label, svg: svgString });
        }
      }

      // 원래 보고 있던 디자인/면으로 복원
      await loadDesignForExport(originalIdx, originalSide);
      guideRect.visible = wasBoxVisible; outerGuideRect.visible = wasBoxVisible; gridGuide.visible = wasGridVisible;
      canvas.renderAll();
      renderTabs();

      // 넘길 데이터 총량이 500MB를 넘지 않는지 확인 (R2 업로드 한도와 동일하게 맞춤)
      const totalBytes =
        previews.reduce((sum, item) => sum + estimateDataUrlBytes(item.dataUrl), 0) +
        svgs.reduce((sum, item) => sum + (item.svg ? item.svg.length : 0), 0);
      if (totalBytes > MAX_TRANSFER_BYTES) {
        alert('전달할 시안 데이터 용량이 500MB를 초과합니다.\n디자인 수를 줄이거나 이미지를 단순화해서 다시 시도해주세요. (현재 약 ' + (totalBytes / 1024 / 1024).toFixed(0) + 'MB)');
        return;
      }

      try {
        await idbSet(PREVIEW_STORAGE_KEY, previews);
        await idbSet(ORIGINAL_SVG_KEY, svgs);
      } catch (storageErr) {
        console.error('시안 데이터 저장 실패:', storageErr);
        alert('시안 데이터를 저장하지 못했습니다. 브라우저 저장 공간이 가득 찼을 수 있습니다.');
        return;
      }

      // 현재 쿼리(count/width/height 등)를 그대로 이어서 시안보기 페이지로 이동
      window.location.href = SIAN_PAGE_URL + window.location.search;

    } catch (err) {
      console.error(err);
      alert('시안 생성 중 오류가 발생했습니다.');
    } finally {
      floatingSaveBtn.disabled = false;
      floatingSaveBtn.textContent = originalBtnText;
    }
  });

  /* ============================================================
     13. 프로젝트 저장 / 불러오기
     — 쿼리로 전달받은 orderData, 건수(count), 단면/양면 여부,
       디자인별 앞/뒤 내용을 모두 하나의 JSON에 담아 그대로 전달합니다.
  ============================================================ */
  // 저장 전용 데이터(JSON) 한 면을 검사해서, 업로드한(임시) 폰트를 쓴 텍스트가 있으면
  // 이미지로 바꿔치기한 새 데이터를 돌려줌 (원본 designData는 건드리지 않음 — 계속 편집 가능하도록)
  function flattenSideDataForSave(data){
    return new Promise((resolve) => {
      if (!data || !data.objects || !data.objects.length) { resolve(data); return; }
      const hasCustom = data.objects.some(o => isTextObject(o) && isCustomFontName(o.fontFamily));
      if (!hasCustom) { resolve(data); return; }

      fabric.util.enlivenObjects(data.objects, (enlivened) => {
        const results = new Array(enlivened.length);
        let remaining = enlivened.length;
        if (remaining === 0) { resolve({ objects: [], background: data.background }); return; }
        enlivened.forEach((obj, idx) => {
          if (isTextObject(obj) && isCustomFontName(obj.fontFamily)) {
            results[idx] = rasterizeTextObjectToImageJSON(obj);
          } else {
            results[idx] = obj.toObject(['selectable', 'evented']);
          }
          remaining--;
          if (remaining === 0) resolve({ objects: results, background: data.background });
        });
      });
    });
  }

  // 프로젝트 JSON 데이터를 만드는 공용 로직 — "저장" 버튼과 "자동저장" 둘 다 이걸 재사용함.
  async function buildProjectExportData(){
    designData[currentIdx][currentSide] = serializeCurrentCanvas();
    // 업로드한 폰트를 쓴 디자인이 있다면, 저장용으로만 텍스트를 이미지로 바꿔서 내보냄
    const exportDesignData = [];
    for (let i = 0; i < designData.length; i++) {
      const front = await flattenSideDataForSave(designData[i].front);
      const back = await flattenSideDataForSave(designData[i].back);
      exportDesignData.push({ front, back });
    }
    return {
      type: 'svg-editor-project',
      version: 1,
      savedAt: new Date().toISOString(),
      orderData,          // 쿼리로 전달받은 모든 파라미터를 그대로 보존
      count,
      isDouble,
      ratioW, ratioH,
      canvasWidth: CANVAS_W,
      canvasHeight: CANVAS_H,
      designNames,
      designData: exportDesignData
    };
  }

  document.getElementById('saveProjectBtn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveProjectBtn');
    const hasAnyCustomFont = customFontNames.size > 0;
    saveBtn.disabled = true;
    const originalLabel = saveBtn.textContent;
    if (hasAnyCustomFont) saveBtn.textContent = '이미지로 변환 중...';

    const project = await buildProjectExportData();
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    download(url, `www.ecogr.net-design-project-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  });

  /* ============================================================
     자동저장 — 켜면 파일 저장 위치를 한 번만 물어보고(브라우저 저장창), 그 뒤로는
     10초마다 한 번씩 그 "같은 파일"에 조용히 덮어써서 저장함. 저장됐다는 표시는 따로
     안 띄움(요청대로). File System Access API(showSaveFilePicker)를 지원하는 브라우저
     (크롬·엣지 등)에서만 동작 가능 — 이 API라야 매번 다운로드 창을 띄우지 않고 같은
     파일에 조용히 계속 덮어쓸 수 있음(일반 다운로드 방식은 10초마다 파일이 새로 쌓이거나
     매번 알림이 떠서 이 요청에 안 맞음).
  ============================================================ */
  const autoSaveToggleBtn = document.getElementById('autoSaveToggleBtn');
  const AUTOSAVE_ORIGINAL_LABEL = '🔄 자동저장';
  const AUTOSAVE_ON_LABEL = '✅ 자동저장';
  let autoSaveFileHandle = null;
  let autoSaveTimer = null;

  async function writeAutoSaveFile(){
    if (!autoSaveFileHandle) return;
    try {
      const project = await buildProjectExportData();
      const writable = await autoSaveFileHandle.createWritable();
      await writable.write(JSON.stringify(project));
      await writable.close();
    } catch (err) {
      // 사용자가 나중에 권한을 취소했거나 파일이 없어졌거나 등 — 화면에 따로 알리지 않고
      // (요청대로 "저장됐다는 표시"는 물론 실패 표시도 조용히 넘어감) 자동저장만 꺼둠
      console.error('자동저장 실패:', err);
      stopAutoSave();
    }
  }

  function stopAutoSave(){
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    autoSaveFileHandle = null;
    autoSaveToggleBtn.textContent = AUTOSAVE_ORIGINAL_LABEL;
    autoSaveToggleBtn.classList.remove('on');
  }

  autoSaveToggleBtn.addEventListener('click', async () => {
    if (autoSaveTimer) { stopAutoSave(); return; } // 이미 켜져있으면 다시 눌러서 끔

    if (typeof window.showSaveFilePicker !== 'function') {
      alert('이 브라우저에서는 자동저장을 쓸 수 없어요. 크롬(Chrome)이나 엣지(Edge) 최신 버전에서 이용해주세요.');
      return;
    }
    try {
      autoSaveFileHandle = await window.showSaveFilePicker({
        suggestedName: 'www.ecogr.net-design-autosave.json',
        types: [{ description: 'JSON 프로젝트 파일', accept: { 'application/json': ['.json'] } }]
      });
    } catch (err) {
      return; // 사용자가 파일 선택을 취소한 경우 — 조용히 아무 것도 안 함
    }
    autoSaveToggleBtn.textContent = AUTOSAVE_ON_LABEL; // 체크 표시로 활성화 상태를 보여줌
    autoSaveToggleBtn.classList.add('on');
    writeAutoSaveFile(); // 켜자마자 한 번 바로 저장해두고, 그 뒤로 10초마다 반복
    autoSaveTimer = setInterval(writeAutoSaveFile, 10000);
  });


  // 저장 당시 캔버스 크기(project.canvasWidth/Height)와 지금 이 세션의 캔버스 크기(CANVAS_W/H)가
  // 다르면(예: 저장할 때보다 브라우저 창이 좁아서 캔버스가 더 작게 잡힌 경우 등), 오브젝트들의
  // 절대좌표(left/top)와 크기(scaleX/scaleY)가 예전 캔버스 기준 그대로라 지금 캔버스에서는
  // 왼쪽 위 한쪽으로 쏠려 보이게 됨. 그 비율만큼 전부 다시 스케일링해서 항상 캔버스에 꽉 차게 맞춤.
  function rescaleSideDataToCurrentCanvas(data, savedW, savedH){
    if (!data || !data.objects || !data.objects.length) return data;
    if (!savedW || !savedH) return data; // 옛날 버전으로 저장돼서 크기 정보가 없는 파일은 그대로 둠
    const scale = CANVAS_W / savedW;
    if (!isFinite(scale) || Math.abs(scale - 1) < 0.001) return data; // 크기가 사실상 같으면 손댈 필요 없음
    const scaledObjects = data.objects.map(o => {
      const co = Object.assign({}, o);
      if (typeof co.left === 'number') co.left = co.left * scale;
      if (typeof co.top === 'number') co.top = co.top * scale;
      if (typeof co.scaleX === 'number') co.scaleX = co.scaleX * scale;
      if (typeof co.scaleY === 'number') co.scaleY = co.scaleY * scale;
      return co;
    });
    return { objects: scaledObjects, background: data.background };
  }

  // 프로젝트 JSON(파일로 직접 열었든, URL 쿼리로 가져왔든)을 캔버스에 적용하는 공용 로직.
  // ※ project.designData 안의 각 항목은 loadCanvasObjects가 기대하는 { objects, background }
  //   형태여야 함(저장 시 saveProjectBtn이 만드는 포맷과 동일).
  function applyProjectData(project, onDone){
    if (project && project.designData) {
      const savedW = project.canvasWidth, savedH = project.canvasHeight;
      for (let i = 0; i < Math.min(count, project.designData.length); i++) {
        const d = project.designData[i] || {};
        designData[i] = {
          front: rescaleSideDataToCurrentCanvas(d.front, savedW, savedH),
          back: rescaleSideDataToCurrentCanvas(d.back, savedW, savedH)
        };
        if (project.designNames && project.designNames[i] != null) {
          designNames[i] = project.designNames[i];
        }
      }
    }
    currentIdx = 0; currentSide = 'front';
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
      if (onDone) onDone();
    });
  }

  document.getElementById('projectInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try {
        const project = JSON.parse(ev.target.result);
        applyProjectData(project);
      } catch (err) {
        alert('프로젝트 파일을 여는 중 문제가 발생했습니다. 파일 형식을 확인해주세요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ============================================================
     13-1. URL 쿼리로 프로젝트 JSON을 지정해서 시작 시 자동으로 불러오기
     예) editor.html?project=https://example.com/mymy.json
     - "project" 쿼리에 JSON 파일의 URL을 넣어두면, 편집기가 열리자마자 그 파일을 fetch해서
       그대로 편집 상태로 올려놓음. 에디터 소스 자체에는 어떤 프로젝트 데이터도 들어있지 않고
       매번 그 URL의 최신 내용을 받아오므로, 편집기 파일 용량은 그대로 작게 유지하면서
       쿼리의 project 값만 바꿔서 서로 다른 저장물을 열 수 있음.
     - project JSON을 올려두는 서버(또는 스토리지)가 CORS(Access-Control-Allow-Origin)를
       허용해야 브라우저에서 fetch가 성공함. 같은 도메인에 두거나, CORS를 허용하는 스토리지
       (예: 대부분의 공개 오브젝트 스토리지·CDN)를 쓰면 됨.
  ============================================================ */
  if (orderData.project) {
    fetch(orderData.project)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(project => applyProjectData(project))
      .catch(err => {
        console.error('프로젝트 자동 불러오기 실패:', err);
        alert('URL로 지정된 프로젝트 파일을 불러오지 못했습니다.\n(' + (err && err.message ? err.message : err) + ')');
      });
  }

  /* ============================================================
     14. 속성 패널 — 선택 오브젝트에 따라 표시 전환
  ============================================================ */
  const sidePanelEl = document.getElementById('sidePanel');
  const noSelectionSection = document.getElementById('noSelectionSection');
  const selectionSections = document.getElementById('selectionSections');
  const selectToolBtn = document.getElementById('selectToolBtn');
  const textSection = document.getElementById('textSection');
  const shapeSection = document.getElementById('shapeSection');
  const fillColorRow = document.getElementById('fillColorRow');
  const fillColorHueRow = document.getElementById('fillColorHueRow');
  const imageSection = document.getElementById('imageSection');

  const textContentInput = document.getElementById('textContentInput');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const fontSizeGauge = document.getElementById('fontSizeGauge');
  const textColorInput = document.getElementById('textColorInput');
  const textColorHueSlider = document.getElementById('textColorHueSlider');
  const textColorVariedBrightBtn = document.getElementById('textColorVariedBrightBtn');
  const textColorVariedMediumBtn = document.getElementById('textColorVariedMediumBtn');
  const textColorVariedDarkBtn = document.getElementById('textColorVariedDarkBtn');
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const alignLeftBtn = document.getElementById('alignLeftBtn');
  const alignCenterBtn = document.getElementById('alignCenterBtn');
  const alignRightBtn = document.getElementById('alignRightBtn');

  const fillColorInput = document.getElementById('fillColorInput');
  const fillColorHueSlider = document.getElementById('fillColorHueSlider');
  const fillColorVariedRow = document.getElementById('fillColorVariedRow');
  const fillColorVariedBrightBtn = document.getElementById('fillColorVariedBrightBtn');
  const fillColorVariedMediumBtn = document.getElementById('fillColorVariedMediumBtn');
  const fillColorVariedDarkBtn = document.getElementById('fillColorVariedDarkBtn');
  const strokeColorInput = document.getElementById('strokeColorInput');
  const strokeWidthInput = document.getElementById('strokeWidthInput');

  const opacityInput = document.getElementById('opacityInput');
  const angleInput = document.getElementById('angleInput');
  const imgBrightnessInput = document.getElementById('imgBrightnessInput');
  const imgContrastInput = document.getElementById('imgContrastInput');
  const imgSaturationInput = document.getElementById('imgSaturationInput');

  /* ============================================================
     14b. CMYK 색상 선택기
     - 화면(모니터)과 캔버스는 물리적으로 RGB로만 그려지기 때문에,
       "완전한 CMYK 렌더링"은 브라우저에서 불가능합니다.
     - 대신 색을 고를 때 RGB 슬라이더가 아니라 인쇄 기준인
       C/M/Y/K(%) 슬라이더로 지정하도록 하고, 화면 표시용으로만
       RGB로 자동 변환합니다 (모든 색상 입력을 이 방식으로 통일).
  ============================================================ */
  function cmykToRgb(c, m, y, k){
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k))
    };
  }
  function rgbToCmyk(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
    return {
      c: (1 - r - k) / (1 - k),
      m: (1 - g - k) / (1 - k),
      y: (1 - b - k) / (1 - k),
      k
    };
  }
  function hexToRgb(hex){
    let h = (hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const num = parseInt(h, 16) || 0;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbToHex(r, g, b){
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function hsvToRgb(h, s, v){
    h = ((h % 360) + 360) % 360 / 60;
    const i = Math.floor(h);
    const f = h - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  function rgbToHsv(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max, d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, v };
  }
  // hex 색상에서 색조(hue, 0~360)값만 뽑아냄 — 우측 패널의 "색상 조절 막대" 초기 위치를 잡는 데 씀
  function colorToHue(hex){
    const rgb = hexToRgb(hex);
    return rgbToHsv(rgb.r, rgb.g, rgb.b).h;
  }
  // 지금 색의 채도·명도는 그대로 두고 색조(hue)만 newHue로 바꾼 새 hex 색상을 만듦
  // — 색상 조절 막대를 움직였을 때 "톤은 유지한 채 색만 휙 바뀌는" 느낌을 주기 위함
  function hueShiftedColor(hex, newHue){
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // 색이 거의 무채색(회색·흰색·검정)이면 채도가 0이라 색조를 돌려도 눈에 안 보이므로,
    // 이 경우엔 적당한 채도·명도를 줘서 막대를 움직이면 실제로 색이 나타나게 함
    const s = hsv.s < 0.05 ? 0.75 : hsv.s;
    const v = hsv.v < 0.15 ? 0.85 : hsv.v;
    const newRgb = hsvToRgb(newHue, s, v);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
  }
  // "다양한 컬러" 모드용 — 채도·명도를 매번 랜덤으로 붙여서 색조 막대를 움직일 때마다
  // 색이 다채롭게(생기 있게) 나오게 함. 너무 탁하거나 너무 어둡지 않도록 범위를 제한함.
  // "다양한 컬러" 3단계 모드별 채도(S)·명도(V) 랜덤 범위
  //  - bright(밝은): 채도 0~100%, 명도 72~100% — 파스텔~밝은 원색 위주(칙칙한 색 배제)
  //  - medium(중간): 채도 55~100%, 명도 55~95% — 맨 처음 만들었던 쨍한 원색 위주 설정
  //  - dark(어두운): 채도 0~100%, 명도 6~100% — 어둡고 차분한 톤도 자주 섞여 나오는 설정
  const VARIED_COLOR_RANGES = {
    bright: { sMin: 0, sSpread: 1, vMin: 0.72, vSpread: 0.28 },
    medium: { sMin: 0.55, sSpread: 0.45, vMin: 0.55, vSpread: 0.4 }
  };
  // "어두운" 모드 전용 — K(먹판) 값이 균등 분포가 아니라 가중치를 둔 분포로 나오게 함:
  //  - K 45~60% : 60% 확률 (가장 자주 나오는 "적당히 어두운" 구간)
  //  - K 60~70% : 30% 확률 (더 진한 톤)
  //  - 나머지(45% 미만 또는 70% 초과, 20~90% 안에서) : 10% 확률 (가끔 섞이는 변주)
  // K = 1 - 명도(V) 관계를 이용해서 K% 값을 뽑은 뒤 V로 환산함.
  function pickDarkVByWeightedK(){
    const roll = Math.random();
    let kPercent;
    if (roll < 0.6) {
      kPercent = 45 + Math.random() * 15; // 45~60%
    } else if (roll < 0.9) {
      kPercent = 60 + Math.random() * 10; // 60~70%
    } else if (Math.random() < 0.5) {
      kPercent = 20 + Math.random() * 25; // 나머지 중 절반: 20~45%(더 밝은 쪽)
    } else {
      kPercent = 70 + Math.random() * 20; // 나머지 중 절반: 70~90%(더 어두운 쪽)
    }
    return 1 - kPercent / 100;
  }
  // "밝은" 모드 전용 — 뽑힌 색의 CMYK(C+M+Y+K, 퍼센트 합) 값이 50 미만으로 나올 확률이
  // 정확히 50%가 되도록 함. 그냥 채도·명도를 균등 랜덤으로 뽑으면 이 범위에서는 자연히
  // 약 25%만 50 미만이 나오길래, "50 미만을 원하는지/50 이상을 원하는지"를 먼저 동전 던지듯
  // 반반 정하고, 그 목표에 맞는 색이 나올 때까지 다시 뽑는 방식(거부 샘플링)으로 정확히
  // 맞춤 — 채도·명도 자체의 범위(0~100%, 72~100%)는 그대로 유지됨.
  function pickBrightColor(newHue){
    const wantLow = Math.random() < 0.5;
    for (let attempt = 0; attempt < 40; attempt++) {
      const s = Math.random();
      const v = 0.72 + Math.random() * 0.28;
      const rgb = hsvToRgb(newHue, s, v);
      const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
      const sum = (cmyk.c + cmyk.m + cmyk.y + cmyk.k) * 100;
      if ((wantLow && sum < 50) || (!wantLow && sum >= 50)) return rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    // 40번 안에 목표를 못 맞추면(거의 없음) 마지막으로 뽑은 값을 그냥 씀
    const rgb = hsvToRgb(newHue, Math.random(), 0.72 + Math.random() * 0.28);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  function randomizedHueColor(newHue, mode){
    if (mode === 'bright') return pickBrightColor(newHue);
    let s, v;
    if (mode === 'dark') {
      s = Math.random();
      v = pickDarkVByWeightedK();
    } else {
      const range = VARIED_COLOR_RANGES[mode] || VARIED_COLOR_RANGES.bright;
      s = range.sMin + Math.random() * range.sSpread;
      v = range.vMin + Math.random() * range.vSpread;
    }
    const rgb = hsvToRgb(newHue, s, v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  // CMYK 컬러 팝오버가 화면(뷰포트) 밖으로 벗어나지 않게 좌우/상하 위치를 보정함.
  // - 가로: 오른쪽으로 넘치면 스와치 오른쪽 끝에 맞춰 왼쪽으로 당기고, 그래도 넘치면 화면 안쪽으로 클램프
  // - 세로: 스와치 아래쪽에 붙일 공간이 부족하면 스와치 위쪽으로 띄우고, 그래도 부족하면 화면 안쪽으로 클램프
  function positionCmykPopover(popover, anchorEl){
    const margin = 8;
    const r = anchorEl.getBoundingClientRect();
    const pw = popover.offsetWidth || 210;
    const ph = popover.offsetHeight || 320;

    let left = r.left;
    if (left + pw > window.innerWidth - margin) left = r.right - pw;
    left = Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - pw - margin));

    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - margin) {
      const above = r.top - 6 - ph;
      top = above >= margin ? above : (r.bottom + 6); // 위쪽도 부족하면 일단 아래쪽 기준으로 두고 다음 줄에서 최종 클램프
    }
    top = Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - ph - margin));

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function initCmykPicker(el){
    let currentHex = '#000000';
    let hue = 0, sat = 0, val = 0; // 시각적 선택 영역(SV 사각형 + 색상 띠)용 내부 상태

    const swatch = document.createElement('div');
    swatch.className = 'cmyk-swatch';
    el.appendChild(swatch);

    const popover = document.createElement('div');
    popover.className = 'cmyk-popover hidden';
    popover.innerHTML =
      `<canvas class="cmyk-sv" width="186" height="100"></canvas>` +
      `<canvas class="cmyk-hue" width="186" height="14"></canvas>` +
      [['c', 'C'], ['m', 'M'], ['y', 'Y'], ['k', 'K']].map(([ch, label]) =>
        `<div class="cmyk-row"><label>${label}</label><input type="range" min="0" max="100" value="${ch === 'k' ? 100 : 0}" data-ch="${ch}"><span data-out="${ch}">${ch === 'k' ? 100 : 0}</span></div>`
      ).join('') +
      `<div class="cmyk-hexline">
         <span class="cmyk-hex-swatch"></span>
         <input type="text" class="cmyk-hex-input" maxlength="7" spellcheck="false">
       </div>
       <div class="cmyk-values-line"></div>`;
    // 팝업을 el(색상칸) 안이 아니라 document.body에 직접 붙임 — el이 우측 속성 패널처럼
    // CSS zoom(PC에서 1.3배 확대)이 걸린 조상 안에 있으면, position:fixed로 계산해서 넣은
    // left/top 픽셀값이 그 zoom 배율만큼 다시 한번 곱해져서 화면 밖으로 팝업이 튕겨나가는
    // 문제가 있었음(그래서 "색상 선택창이 안 뜬다"처럼 보였음). body에 직접 붙이면 그런
    // 조상 zoom의 영향을 전혀 안 받아서 항상 계산한 그대로 정확한 화면 위치에 뜸.
    document.body.appendChild(popover);
    el._cmykPopover = popover; // 다른 파일(예: ecopro3mobiletools.js)에서 이 색상칸의 팝업을 찾아 버튼 등을 덧붙일 수 있게 참조를 남겨둠

    const svCanvas = popover.querySelector('.cmyk-sv');
    const hueCanvas = popover.querySelector('.cmyk-hue');
    const svCtx = svCanvas.getContext('2d');
    const hueCtx = hueCanvas.getContext('2d');
    const SV_W = svCanvas.width, SV_H = svCanvas.height;
    const HUE_W = hueCanvas.width, HUE_H = hueCanvas.height;

    const sliders = {
      c: popover.querySelector('[data-ch="c"]'),
      m: popover.querySelector('[data-ch="m"]'),
      y: popover.querySelector('[data-ch="y"]'),
      k: popover.querySelector('[data-ch="k"]')
    };
    const outs = {
      c: popover.querySelector('[data-out="c"]'),
      m: popover.querySelector('[data-out="m"]'),
      y: popover.querySelector('[data-out="y"]'),
      k: popover.querySelector('[data-out="k"]')
    };
    const hexSwatch = popover.querySelector('.cmyk-hex-swatch');
    const hexInput = popover.querySelector('.cmyk-hex-input');
    const valuesLine = popover.querySelector('.cmyk-values-line');

    function drawHueStrip(){
      const grad = hueCtx.createLinearGradient(0, 0, HUE_W, 0);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
      hueCtx.fillStyle = grad;
      hueCtx.fillRect(0, 0, HUE_W, HUE_H);
      // 현재 색상(hue) 위치 표시
      const x = (hue / 360) * HUE_W;
      hueCtx.strokeStyle = '#fff';
      hueCtx.lineWidth = 2;
      hueCtx.strokeRect(Math.max(0, Math.min(HUE_W - 3, x - 1.5)), 0, 3, HUE_H);
      hueCtx.strokeStyle = 'rgba(0,0,0,.3)';
      hueCtx.lineWidth = 1;
      hueCtx.strokeRect(Math.max(0, Math.min(HUE_W - 3, x - 1.5)) + 0.5, 0.5, 2, HUE_H - 1);
    }

    // 색상 선택이 금지된 삼각형 영역 (SV 사각형 우측 상단 모서리를 흰색으로 막음)
    // — 색상띠(hue)가 "이 지점" 구간에 있을 때만 나타나고, 벗어나면 사라져서 다시 선택 가능해집니다.
    const BLOCK_TRI_W_FRAC = 0.35; // 오른쪽 끝에서부터 차지하는 폭 비율
    const BLOCK_TRI_H_FRAC = 0.5;  // 위쪽 끝에서부터 차지하는 높이 비율
    const HUE_TRIGGER_MIN = 75;    // "이 지점" 구간 시작 (색상띠, 0~360)
    const HUE_TRIGGER_MAX = 203;   // "이 지점" 구간 끝 (우측으로 3.2배 확장: 폭 40°→128°)
    function isHueInTriggerZone(){
      return hue >= HUE_TRIGGER_MIN && hue <= HUE_TRIGGER_MAX;
    }
    function isInBlockedTriangle(x, y){
      if (!isHueInTriggerZone()) return false;
      const triW = SV_W * BLOCK_TRI_W_FRAC;
      const triH = SV_H * BLOCK_TRI_H_FRAC;
      if (y < 0 || y > triH) return false;
      const boundaryX = (SV_W - triW) + (y / triH) * triW;
      return x >= boundaryX;
    }

    function drawSvSquare(){
      svCtx.fillStyle = `hsl(${hue},100%,50%)`;
      svCtx.fillRect(0, 0, SV_W, SV_H);
      const whiteGrad = svCtx.createLinearGradient(0, 0, SV_W, 0);
      whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
      whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
      svCtx.fillStyle = whiteGrad;
      svCtx.fillRect(0, 0, SV_W, SV_H);
      const blackGrad = svCtx.createLinearGradient(0, 0, 0, SV_H);
      blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
      blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
      svCtx.fillStyle = blackGrad;
      svCtx.fillRect(0, 0, SV_W, SV_H);

      // 선택 금지 삼각형: 색상띠가 "이 지점" 구간일 때만 흰색으로 덮어서 표시
      if (isHueInTriggerZone()) {
        const triW = SV_W * BLOCK_TRI_W_FRAC, triH = SV_H * BLOCK_TRI_H_FRAC;
        svCtx.beginPath();
        svCtx.moveTo(SV_W - triW, 0);
        svCtx.lineTo(SV_W, 0);
        svCtx.lineTo(SV_W, triH);
        svCtx.closePath();
        svCtx.fillStyle = '#ffffff';
        svCtx.fill();
        svCtx.strokeStyle = 'rgba(0,0,0,.15)';
        svCtx.lineWidth = 1;
        svCtx.stroke();
      }

      // 현재 채도/명도 위치에 원형 커서 표시
      const cx = sat * SV_W, cy = (1 - val) * SV_H;
      svCtx.beginPath();
      svCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      svCtx.strokeStyle = '#fff';
      svCtx.lineWidth = 2;
      svCtx.stroke();
      svCtx.beginPath();
      svCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      svCtx.strokeStyle = 'rgba(0,0,0,.35)';
      svCtx.lineWidth = 1;
      svCtx.stroke();
    }

    // 피커 위치가 (색상띠 이동 등으로) 가려진 삼각형 안에 들어가면,
    // 그 삼각형의 대각선(빗변) 가운데 지점으로 자동으로 옮겨서
    // 가려져서 안 보이는 색이 그대로 선택된 채로 남아있지 않게 함
    function clampSvOutOfBlockedZone(){
      if (!isHueInTriggerZone()) return false;
      const x = sat * SV_W, y = (1 - val) * SV_H;
      if (!isInBlockedTriangle(x, y)) return false;
      const triW = SV_W * BLOCK_TRI_W_FRAC, triH = SV_H * BLOCK_TRI_H_FRAC;
      const midX = SV_W - triW / 2, midY = triH / 2; // 빗변(대각선)의 중앙 지점
      sat = midX / SV_W;
      val = 1 - midY / SV_H;
      return true;
    }

    // CMYK 슬라이더 값을 기준으로 화면(스와치/hex/hue·sv 좌표)을 갱신
    function refreshFromCmyk(dispatch){
      const c = sliders.c.value / 100, m = sliders.m.value / 100, y = sliders.y.value / 100, k = sliders.k.value / 100;
      const { r, g, b } = cmykToRgb(c, m, y, k);
      const hsv = rgbToHsv(r, g, b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      // 가려진 구역으로 들어가는 값이면 refreshFromHsv 안에서 자동으로 보정됨
      refreshFromHsv(dispatch);
    }

    // hue/sat/val(시각적 선택 영역) 기준으로 CMYK 슬라이더와 화면을 갱신
    function refreshFromHsv(dispatch){
      clampSvOutOfBlockedZone();
      const { r, g, b } = hsvToRgb(hue, sat, val);
      currentHex = rgbToHex(r, g, b);
      const cmyk = rgbToCmyk(r, g, b);
      sliders.c.value = Math.round(cmyk.c * 100);
      sliders.m.value = Math.round(cmyk.m * 100);
      sliders.y.value = Math.round(cmyk.y * 100);
      sliders.k.value = Math.round(cmyk.k * 100);

      swatch.style.background = currentHex;
      hexSwatch.style.background = currentHex;
      hexInput.value = currentHex.toUpperCase();
      valuesLine.textContent = `C${sliders.c.value} M${sliders.m.value} Y${sliders.y.value} K${sliders.k.value}`;
      Object.keys(outs).forEach(ch => { outs[ch].textContent = sliders[ch].value; });
      drawHueStrip();
      drawSvSquare();
      // 주의: el.value는 아래 Object.defineProperty로 커스텀 setter가 걸려 있어서,
      // 여기서 el.value = currentHex 를 실행하면 그 setter -> refreshFromCmyk -> refreshFromHsv
      // -> 다시 el.value = ... 로 무한 재귀에 빠져 "Maximum call stack size exceeded"가 남.
      // currentHex는 이미 위에서 갱신했고 getter가 그대로 돌려주므로 재대입은 불필요함.
      if (dispatch) el.dispatchEvent(new Event('input'));
    }

    Object.values(sliders).forEach(s => s.addEventListener('input', () => refreshFromCmyk(true)));

    // ---- SV 사각형 클릭/드래그로 채도·명도 선택 ----
    let draggingSv = false;
    function pickSv(clientX, clientY){
      const r = svCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(SV_W, clientX - r.left));
      const y = Math.max(0, Math.min(SV_H, clientY - r.top));
      if (isInBlockedTriangle(x, y)) return; // 이 영역은 선택할 수 없음
      sat = x / SV_W;
      val = 1 - y / SV_H;
      refreshFromHsv(true);
    }
    svCanvas.addEventListener('mousedown', (e) => { draggingSv = true; pickSv(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (draggingSv) pickSv(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { draggingSv = false; });
    svCanvas.addEventListener('mousemove', (e) => {
      const r = svCanvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      svCanvas.style.cursor = isInBlockedTriangle(x, y) ? 'not-allowed' : 'crosshair';
    });

    // ---- 색상 띠 클릭/드래그로 색상(hue) 선택 ----
    let draggingHue = false;
    function pickHue(clientX){
      const r = hueCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(HUE_W, clientX - r.left));
      hue = (x / HUE_W) * 360;
      refreshFromHsv(true);
    }
    hueCanvas.addEventListener('mousedown', (e) => { draggingHue = true; pickHue(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (draggingHue) pickHue(e.clientX); });
    window.addEventListener('mouseup', () => { draggingHue = false; });

    // ---- Hex 직접 입력 ----
    hexInput.addEventListener('change', () => {
      let v = hexInput.value.trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(v) && !/^#?[0-9a-fA-F]{3}$/.test(v)) { hexInput.value = currentHex.toUpperCase(); return; }
      if (v.charAt(0) !== '#') v = '#' + v;
      const { r, g, b } = hexToRgb(v);
      const hsv = rgbToHsv(r, g, b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      refreshFromHsv(true);
    });
    hexInput.addEventListener('click', (e) => e.stopPropagation());
    hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') hexInput.blur(); });

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.cmyk-popover').forEach(p => { if (p !== popover) p.classList.add('hidden'); });
      const willOpen = popover.classList.contains('hidden');
      if (willOpen) {
        popover.classList.remove('hidden'); // 실제 크기를 재려면 먼저 보이는 상태여야 함(가려진 채로는 0으로 측정됨)
        drawHueStrip();
        drawSvSquare();
        positionCmykPopover(popover, swatch);
      } else {
        popover.classList.add('hidden');
      }
    });
    popover.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => popover.classList.add('hidden'));

    Object.defineProperty(el, 'value', {
      get(){ return currentHex; },
      set(hex){
        const { r, g, b } = hexToRgb(hex);
        const { c, m, y, k } = rgbToCmyk(r, g, b);
        sliders.c.value = Math.round(c * 100);
        sliders.m.value = Math.round(m * 100);
        sliders.y.value = Math.round(y * 100);
        sliders.k.value = Math.round(k * 100);
        refreshFromCmyk(false);
      }
    });

    el.value = '#000000';
  }

  initCmykPicker(textColorInput);
  initCmykPicker(fillColorInput);
  initCmykPicker(strokeColorInput);
  initCmykPicker(fontColorSwatch);

  let panelUpdating = false;

  function isTextObject(o){
    return o && (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox');
  }

  // 모양필터(공통 효과를 도형에도 적용) 대상 판별: 표의 셀 박스(isTableCell)도 결국 fabric.Rect라
  // type만으로 자연히 포함됨. 텍스트/가이드선/텍스트가 아닌 것만 골라내는 용도.
  function isShapeObject(o){
    if (!o || o.isGuide || isTextObject(o)) return false;
    return o.type === 'rect' || o.type === 'circle' || o.type === 'triangle' ||
           o.type === 'ellipse' || o.type === 'polygon' || o.type === 'path';
  }

  function updateSelectionPanel(){
    const obj = canvas.getActiveObject();
    sidePanelEl.classList.remove('hidden');
    if (!obj || obj.isGuide) {
      noSelectionSection.classList.remove('hidden');
      selectionSections.classList.add('hidden');
      deleteBtn.disabled = true;
      selectToolBtn.classList.remove('sel-active'); // 우측 패널이 "선택 안 함" 상태 -> 흰색
      return;
    }
    panelUpdating = true;
    noSelectionSection.classList.add('hidden');
    selectionSections.classList.remove('hidden');
    deleteBtn.disabled = false;
    selectToolBtn.classList.add('sel-active'); // 우측 패널에 오브젝트 속성이 뜸 = 선택 활성화 -> 회색

    // 드래그로 여러 오브젝트를 묶어 선택(activeSelection)했거나 "묶기"로 그룹화한 경우,
    // 그 안이 전부 텍스트라면 우측 패널도 "텍스트" 취급해서 뜨게 함(색상·폰트 등을 한 번에
    // 공통 적용할 수 있도록). 섞여있으면(텍스트+도형 등) 기존처럼 도형 패널을 보여줌.
    const isGroupLike = obj.type === 'activeSelection' || obj.type === 'group';
    const groupChildren = isGroupLike ? obj.getObjects().filter(o => !o.isGuide) : [];
    const isMultiTextSelection = isGroupLike && groupChildren.length > 0 && groupChildren.every(isTextObject);
    const textAnchor = isMultiTextSelection ? groupChildren[0] : obj; // 표시값은 첫 번째 선택된 텍스트 기준

    const textLike = isTextObject(obj) || isMultiTextSelection;
    const imageLike = isImageObject(obj);
    textSection.classList.toggle('hidden', !textLike);
    shapeSection.classList.toggle('hidden', textLike);
    imageSection.classList.toggle('hidden', !imageLike);
    fillColorRow.classList.toggle('hidden', imageLike); // 이미지는 채우기색이 의미 없으므로 숨김(테두리는 계속 노출)
    fillColorHueRow.classList.toggle('hidden', imageLike); // 채우기 슬라이더도 같이 숨김
    fillColorVariedRow.classList.toggle('hidden', imageLike); // 다양한 컬러 버튼도 같이 숨김

    if (textLike) {
      // "내용"은 텍스트마다 다른 게 당연하므로, 여러 개를 한꺼번에 선택했을 땐 편집을 막음
      // (그대로 두면 입력한 글자로 선택된 텍스트 전부가 똑같이 덮어써지는 문제가 생김)
      textContentInput.disabled = isMultiTextSelection;
      textContentInput.value = isMultiTextSelection ? '' : (textAnchor.text || '');
      textContentInput.placeholder = isMultiTextSelection ? '텍스트를 여러 개 선택 중 (내용은 개별 수정)' : '더블클릭으로도 수정 가능';
      fontFamilySelect.value = textAnchor.fontFamily || 'Pretendard';
      fontSizeInput.value = Math.round(textAnchor.fontSize || 40);
      fontSizeGauge.value = Math.min(600, Math.max(10, Math.round(textAnchor.fontSize || 40)));
      textColorInput.value = toHex(textAnchor.fill) || '#222222';
      textColorHueSlider.value = Math.round(colorToHue(textColorInput.value));
      boldBtn.classList.toggle('on', textAnchor.fontWeight === 'bold' || textAnchor.fontWeight >= 700);
      italicBtn.classList.toggle('on', textAnchor.fontStyle === 'italic');
      underlineBtn.classList.toggle('on', !!textAnchor.underline);
      [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => b.classList.remove('on'));
      if (textAnchor.textAlign === 'center') alignCenterBtn.classList.add('on');
      else if (textAnchor.textAlign === 'right') alignRightBtn.classList.add('on');
      else alignLeftBtn.classList.add('on');
    } else {
      fillColorInput.value = toHex(obj.fill) || '#3498db';
      fillColorHueSlider.value = Math.round(colorToHue(fillColorInput.value));
      strokeColorInput.value = toHex(obj.stroke) || '#000000';
      strokeWidthInput.value = obj.strokeWidth || 0;
    }

    if (imageLike) {
      imgBrightnessInput.value = Math.round(getImageFilterValue(obj, 'Brightness', 'brightness') * 100);
      imgContrastInput.value = Math.round(getImageFilterValue(obj, 'Contrast', 'contrast') * 100);
      imgSaturationInput.value = Math.round(getImageFilterValue(obj, 'Saturation', 'saturation') * 100);
    }

    opacityInput.value = obj.opacity != null ? obj.opacity : 1;
    angleInput.value = Math.round(obj.angle || 0);
    panelUpdating = false;
  }

  function toHex(c){
    if (!c || typeof c !== 'string') return null;
    if (c.charAt(0) === '#') return c.length === 7 ? c : null;
    const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return '#' + [1,2,3].map(i => parseInt(m[i],10).toString(16).padStart(2,'0')).join('');
  }

  canvas.on('selection:created', updateSelectionPanel);
  canvas.on('selection:updated', updateSelectionPanel);
  canvas.on('selection:cleared', updateSelectionPanel);

  // T 팝업이 열려 있는 동안, 다른 텍스트(또는 다른 텍스트 묶음)를 클릭해서 선택하면
  // 팝업이 자동으로 그 새 텍스트를 붙잡도록 전환 (이전 텍스트는 자동 해제됨)
  function syncFontPopoverToSelection(){
    if (fontPopover.classList.contains('hidden')) return; // 팝업이 닫혀 있으면 그대로 둠
    const active = canvas.getActiveObject();
    const boxes = textBoxesFromTarget(active);
    if (!boxes.length) return; // 텍스트가 아닌 걸 선택했을 땐 팝업을 그대로 유지
    const sameTarget = boxes.length === fontPopoverTargets.length && boxes.every((o, i) => o === fontPopoverTargets[i]);
    if (sameTarget) return;
    openFontPopover(active, { reposition: false });
  }
  canvas.on('selection:created', syncFontPopoverToSelection);
  canvas.on('selection:updated', syncFontPopoverToSelection);
  canvas.on('object:scaling', updateSelectionPanel);
  canvas.on('object:rotating', updateSelectionPanel);
  canvas.on('text:changed', updateSelectionPanel);

  function withActive(fn){
    if (panelUpdating) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide) return;
    if (obj.type === 'activeSelection' || obj.type === 'group') {
      // fabric의 Group/ActiveSelection은 set()을 호출해도 자식 오브젝트에 전파되지 않으므로
      // (그룹 자체에만 값이 설정돼서 실제로는 아무 변화가 없음), 안의 오브젝트 하나하나에
      // 직접 적용해야 함 — 이렇게 해야 여러 개 선택한 상태에서 색상/폰트 등이 공통 적용됨
      obj.getObjects().forEach(o => { if (!o.isGuide) fn(o); });
    } else {
      fn(obj);
    }
    canvas.renderAll();
  }

  // 글꼴을 바꾼 뒤 캔버스가 새 모양으로 다시 그리도록, 크기를 살짝(-5%) 줄였다가 곧바로
  // 원래 크기로 되돌리는 것만으로 강제 재작성시킴(크기 자체가 바뀌면 캔버스가 그 오브젝트의
  // 캐시를 새로 만들 수밖에 없어서 이전 폰트로 그려졌던 잔상이 확실히 지워짐).
  function forceFontReloadRedraw(boxes, fontFamilyName){
    boxes = boxes.filter(o => isTextObject(o));
    if (!boxes.length) return;
    const originalScaleXs = boxes.map(o => o.scaleX);
    const originalScaleYs = boxes.map(o => o.scaleY);
    boxes.forEach((o, i) => {
      o.set('scaleX', originalScaleXs[i] * 0.95);
      o.set('scaleY', originalScaleYs[i] * 0.95);
      o.dirty = true;
    });
    canvas.requestRenderAll();
    setTimeout(() => {
      boxes.forEach((o, i) => {
        o.set('scaleX', originalScaleXs[i]);
        o.set('scaleY', originalScaleYs[i]);
        o.dirty = true;
      });
      canvas.requestRenderAll();
    }, 150);
  }

  textContentInput.addEventListener('input', () => withActive(o => { if (isTextObject(o)) o.set('text', textContentInput.value); }));
  // IText는 줄/글자 단위로 개별 스타일(styles)을 따로 가질 수 있는데, 여기에 fontFamily(또는
  // fontWeight)가 박제돼 있으면 오브젝트 전체에 새 폰트를 적용해도 그 줄/글자만 안 바뀜 —
  // "첫 줄만 새 폰트로 바뀌고 나머지 줄은 그대로인" 문제가 정확히 이것 때문이었음. 폰트를
  // 선택할 때는 "이 오브젝트 전체를 이 폰트로" 라는 의도이므로, 남아있는 개별 오버라이드를
  // 전부 지워서 예외 없이 전체가 똑같이 바뀌도록 함.
  function clearPerCharStyleOverrides(obj, props){
    if (!obj.styles) return;
    Object.keys(obj.styles).forEach(function(lineKey){
      var line = obj.styles[lineKey];
      if (!line) return;
      Object.keys(line).forEach(function(charKey){
        var charStyle = line[charKey];
        if (!charStyle) return;
        props.forEach(function(p){ delete charStyle[p]; });
      });
    });
  }

  fontFamilySelect.addEventListener('change', () => {
    const targets = [];
    withActive(o => {
      if (isTextObject(o)) {
        clearPerCharStyleOverrides(o, ['fontFamily', 'fontWeight']);
        o.set('fontFamily', fontFamilySelect.value);
        targets.push(o);
      }
    });
    forceFontReloadRedraw(targets, fontFamilySelect.value);
  });
  fontSizeInput.addEventListener('input', () => {
    const v = Math.max(10, parseInt(fontSizeInput.value, 10) || 10);
    withActive(o => { if (isTextObject(o)) { clearPerCharStyleOverrides(o, ['fontSize']); o.set('fontSize', v); } });
    fontSizeGauge.value = Math.min(600, v); // 숫자로 직접 입력해도 게이지 위치가 같이 따라오게
  });
  fontSizeInput.addEventListener('change', () => { fontSizeInput.value = Math.max(10, parseInt(fontSizeInput.value, 10) || 10); });
  // 크기 조절 게이지(막대) — 움직이는 동안 실시간으로 글자 크기가 바뀌고, 숫자 입력창도 같이 갱신됨
  fontSizeGauge.addEventListener('input', () => {
    const v = Math.max(10, parseInt(fontSizeGauge.value, 10) || 10);
    withActive(o => { if (isTextObject(o)) { clearPerCharStyleOverrides(o, ['fontSize']); o.set('fontSize', v); } });
    fontSizeInput.value = v;
  });
  fontSizeGauge.addEventListener('change', () => pushHistory());
  textColorInput.addEventListener('input', () => withActive(o => { if (isTextObject(o)) { clearPerCharStyleOverrides(o, ['fill']); o.set('fill', textColorInput.value); } }));

  // 색상 조절 막대 — 평소엔 드래그하는 동안 각 오브젝트의 "지금 색"을 기준으로 색조만 바꿔서
  // 적용함(여러 개를 함께 선택했으면 오브젝트마다 원래 채도/명도가 달라도 각자 자기 색 기준으로
  // 바뀜). "밝은/중간/어두운" 중 하나가 켜져 있으면, 그 대신 채도·명도를 매번(움직일 때마다,
  // 그리고 오브젝트마다 각각) 그 모드의 범위 안에서 랜덤으로 붙여서 더 다채로운 색이 나오게 함.
  // 셋 중 하나만 켜질 수 있고(배타적), 켜진 걸 다시 누르면 꺼져서 원래(색조만 유지) 방식으로 돌아감.
  function makeExclusiveVariedToggle(buttons){
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const wasOn = btn.classList.contains('on');
        buttons.forEach(b => b.classList.remove('on'));
        if (!wasOn) btn.classList.add('on');
      });
    });
  }
  function getActiveVariedMode(buttons, modes){
    for (let i = 0; i < buttons.length; i++) { if (buttons[i].classList.contains('on')) return modes[i]; }
    return null;
  }

  const textVariedBtns = [textColorVariedBrightBtn, textColorVariedMediumBtn, textColorVariedDarkBtn];
  const variedModes = ['bright', 'medium', 'dark'];
  makeExclusiveVariedToggle(textVariedBtns);
  textColorHueSlider.addEventListener('input', () => {
    const hue = parseFloat(textColorHueSlider.value) || 0;
    const mode = getActiveVariedMode(textVariedBtns, variedModes);
    withActive(o => {
      if (!isTextObject(o)) return;
      clearPerCharStyleOverrides(o, ['fill']);
      const newHex = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(toHex(o.fill) || '#222222', hue);
      o.set('fill', newHex);
    });
    textColorInput.value = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(textColorInput.value, hue); // 스와치도 같이 갱신
  });
  textColorHueSlider.addEventListener('change', () => pushHistory());

  boldBtn.addEventListener('click', () => withActive(o => { if (!isTextObject(o)) return; clearPerCharStyleOverrides(o, ['fontWeight']); o.set('fontWeight', (o.fontWeight === 'bold' || o.fontWeight >= 700) ? 'normal' : 'bold'); }));
  italicBtn.addEventListener('click', () => withActive(o => { if (!isTextObject(o)) return; clearPerCharStyleOverrides(o, ['fontStyle']); o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic'); }));
  underlineBtn.addEventListener('click', () => withActive(o => { if (!isTextObject(o)) return; clearPerCharStyleOverrides(o, ['underline']); o.set('underline', !o.underline); }));

  alignLeftBtn.addEventListener('click', () => withActive(o => { if (isTextObject(o)) o.set('textAlign', 'left'); }));
  alignCenterBtn.addEventListener('click', () => withActive(o => { if (isTextObject(o)) o.set('textAlign', 'center'); }));
  alignRightBtn.addEventListener('click', () => withActive(o => { if (isTextObject(o)) o.set('textAlign', 'right'); }));
  [boldBtn, italicBtn, underlineBtn, alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => {
    b.addEventListener('click', updateSelectionPanel); // 버튼 눌린(on) 표시가 최신 상태를 반영하도록
  });

  fillColorInput.addEventListener('input', () => withActive(o => o.set('fill', fillColorInput.value)));

  const fillVariedBtns = [fillColorVariedBrightBtn, fillColorVariedMediumBtn, fillColorVariedDarkBtn];
  makeExclusiveVariedToggle(fillVariedBtns);
  fillColorHueSlider.addEventListener('input', () => {
    const hue = parseFloat(fillColorHueSlider.value) || 0;
    const mode = getActiveVariedMode(fillVariedBtns, variedModes);
    withActive(o => {
      const newHex = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(toHex(o.fill) || '#3498db', hue);
      o.set('fill', newHex);
    });
    fillColorInput.value = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(fillColorInput.value, hue); // 스와치도 같이 갱신
  });
  fillColorHueSlider.addEventListener('change', () => pushHistory());
  strokeColorInput.addEventListener('input', () => withActive(o => o.set('stroke', strokeColorInput.value)));
  strokeWidthInput.addEventListener('input', () => withActive(o => o.set('strokeWidth', parseInt(strokeWidthInput.value, 10) || 0)));

  opacityInput.addEventListener('input', () => withActive(o => {
    o.set('opacity', parseFloat(opacityInput.value));
    if (!fontPopover.classList.contains('hidden')) {
      floatingOpacityInput.value = opacityInput.value;
      updateOpacityGaugeFill(parseFloat(opacityInput.value));
    }
  }));
  angleInput.addEventListener('input', () => withActive(o => { o.set('angle', parseFloat(angleInput.value) || 0); o.setCoords(); }));

  imgBrightnessInput.addEventListener('input', () => withActive(o => applyImageAdjustments(o, { brightness: (parseInt(imgBrightnessInput.value, 10) || 0) / 100 })));
  imgBrightnessInput.addEventListener('change', () => pushHistory());
  imgContrastInput.addEventListener('input', () => withActive(o => applyImageAdjustments(o, { contrast: (parseInt(imgContrastInput.value, 10) || 0) / 100 })));
  imgContrastInput.addEventListener('change', () => pushHistory());
  imgSaturationInput.addEventListener('input', () => withActive(o => applyImageAdjustments(o, { saturation: (parseInt(imgSaturationInput.value, 10) || 0) / 100 })));
  imgSaturationInput.addEventListener('change', () => pushHistory());

  /* ============================================================
     15. 모바일: 패널 토글
  ============================================================ */
  document.getElementById('panelToggleBtn').addEventListener('click', () => {
    if (sidePanelElForDrawer.classList.contains('open')) closeSidePanelDrawer();
    else openSidePanelDrawer();
  });

  /* ============================================================
     15b. 모바일: 하단 바 높이만큼 캔버스 영역에 여백을 실시간으로 확보
     — 하단 바(#floatingActionBar)가 화면 아래에 딱 붙는 고정(position:fixed) 바라서,
     #canvasWrap 자신의 박스 크기에는 반영되지 않음. 그래서 padding만 줬을 때는 흰 박스는
     안 가려졌지만, 확대해서 생기는 "가로 스크롤바"는 #canvasWrap 자신의 맨 아래 가장자리에
     그려지는데 그 가장자리가 하단 바 뒤에 숨어있어서 안 보이는 문제가 있었음(세로 스크롤바는
     오른쪽엔 가리는 게 없어서 문제 없이 보였음). margin-bottom으로 #canvasWrap 자신의
     박스 자체를 하단 바 바로 위에서 끝나게 만들어서, 가로 스크롤바가 하단 바 위쪽에
     또렷하게 보이게 함. 거기에 더해 padding-bottom을 살짝 더 줘서 흰 박스 중앙 기준점을
     20px 위로 올려둠(지난 요청 반영분 유지). 하단 바 높이가 바뀔 수 있어서 ResizeObserver로
     계속 실시간 감지해서 맞춤.
  ============================================================ */
  (function syncMobileBottomBarSpacing(){
    const bar = document.getElementById('floatingActionBar');
    const wrap = document.getElementById('canvasWrap');
    if (!bar || !wrap) return;
    function apply(){
      if (!EP.isMobileModeActive || !EP.isMobileModeActive()) {
        wrap.style.marginBottom = '';
        wrap.style.paddingBottom = '';
        return;
      }
      wrap.style.marginBottom = bar.offsetHeight + 'px'; // #canvasWrap 자신의 아래 가장자리(=가로 스크롤바 위치)를 하단 바 바로 위로
      wrap.style.paddingBottom = (24 + 40) + 'px'; // 24px 기본 여백 + 40px(중앙 기준점을 20px 위로 올리기 위함, 절반만 이동하므로 2배로 줌)
    }
    apply();
    if (window.ResizeObserver) {
      new ResizeObserver(apply).observe(bar);
    } else {
      window.addEventListener('resize', apply); // 구형 브라우저 대비
    }
    window.addEventListener('resize', apply);
  })();

  /* ============================================================
     16. 캔버스 바깥(패널/툴바 제외) 클릭 시 선택 해제
  ============================================================ */
  document.addEventListener('mousedown', (e) => {
    const shell = document.querySelector('.canvas-shell');
    if (
      shell && !shell.contains(e.target) &&
      !e.target.closest('.toolbar') &&
      !e.target.closest('.side-panel') &&
      !e.target.closest('.tab-sidebar') &&
      !e.target.closest('.status-bar') &&
      !e.target.closest('.font-popover') &&
      !e.target.closest('.qa-popover') &&
      !e.target.closest('.ctx-menu') &&
      !e.target.closest('.crop-toolbar') &&
      !e.target.closest('.cmyk-popover') &&
      // 모바일 전용 상단바(휴지통/색상/스포이드/레이어/확대 아이콘, "글씨 가리기" 드롭다운 등)도
      // PC의 .toolbar/.side-panel처럼 "도구를 조작하는 영역"이므로 여기서 제외해야 함.
      // 이게 빠져 있으면 이 버튼들을 누르는 순간(click보다 먼저 발생하는 mousedown 시점에)
      // 캔버스 선택이 먼저 해제돼버려서, 정작 각 버튼의 click 핸들러가 실행될 때는
      // 이미 선택된 오브젝트가 없는 상태가 되어 스포이드·휴지통·색상 적용이 전부 안 먹는
      // 문제가 있었음.
      !e.target.closest('.mobile-topbar')
    ) {
      if (canvas.getActiveObject()) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
  });

  refreshEmptyHint();
  updateSelectionPanel();


  // ---- EP 네임스페이스로 내보내기 (ecopro3c.js / ecopro3text.js / ecopro3l.js 에서 사용) ----
  window.EP = window.EP || {};
  EP.canvas = canvas;
  EP.pushHistory = pushHistory;
  EP.refreshEmptyHint = refreshEmptyHint;
  EP.bringGuideToFront = bringGuideToFront;
  // 다른 파일(예: ecopro3menu.js)에서 캔버스 여백을 계산할 때 쓸 "1 단위가 몇 px인지"를 노출함.
  // 쿼리로 들어오는 width/height(ratioW/ratioH)는 실제 mm/cm 같은 물리 단위가 아니라 그냥
  // 가로세로 비율을 나타내는 순수 숫자라서(예: 16, 8), cm 변환 없이 그 숫자 자체를 격자 단위로
  // 취급함 — 예: ratioW=16이면 캔버스 가로폭이 "16단위"라고 보고, 그 1단위가 몇 px인지를 반환.
  // CANVAS_W/ratioW는 회전하면 같이 바뀌는 값들이라(rotateCanvas90 참고), 여기서 스냅샷을 미리
  // 저장해두지 않고 "호출될 때마다" 그 시점의 최신 값을 읽어서 계산함 — 그래서 캔버스를 회전
  // 하거나 다른 사이즈로 바꾼 뒤에 호출해도 항상 정확함.
  EP.getPxPerUnit = function(){ return CANVAS_W / ratioW; };
  EP.importSvgIntoCanvas = importSvgIntoCanvas;
  EP.isTextObject = isTextObject;
  EP.isShapeObject = isShapeObject;
  EP.isImageObject = isImageObject;
  EP.textBoxesFromTarget = textBoxesFromTarget;
  EP.qaTargetsFromTarget = qaTargetsFromTarget;
  EP.toHex = toHex;
  EP.rgbToHex = rgbToHex;
  EP.hsvToRgb = hsvToRgb;
  EP.makeDraggablePopover = makeDraggablePopover;
  EP.initCmykPicker = initCmykPicker;
  EP.customFontNames = customFontNames;
  EP.hexToRgb = hexToRgb;
  EP.fontPopover = fontPopover;
  EP.registerRotatablePopover(fontPopover);
  EP.registerFilterPopover(fontPopover);
  EP.clearPerCharStyleOverrides = clearPerCharStyleOverrides;
  EP.forceFontReloadRedraw = forceFontReloadRedraw;

})();
