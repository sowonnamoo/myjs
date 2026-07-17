(function(){
  "use strict";

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
    preserveObjectStacking: true
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

    const cu = fabric.controlsUtils || {};
    fabric.Object.prototype.controls.mtr = new fabric.Control({
      x: 0,
      y: -0.5,
      offsetY: -36,
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
      // 여러 개를 묶어 선택했거나(활성선택) 묶기로 그룹화한 경우: 텍스트뿐 아니라 이미지가 섞여 있어도
      // (정렬 기능은 이미지에도 필요하므로) 2개 이상의 유효한 오브젝트만 있으면 T 버튼을 보여줌
      if (fabricObject && (fabricObject.type === 'activeSelection' || fabricObject.type === 'group')) {
        const objs = fabricObject.getObjects().filter(o => !o.isGuide);
        if (objs.length < 2) return;
      }
      ctx.save();
      ctx.translate(left, top);
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
      cursorStyle: 'pointer',
      render: renderTButton,
      mouseUpHandler: function(eventData, transformData){
        const target = transformData && transformData.target;
        if (target) openFontPopover(target);
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

  function makeDraggablePopover(el){
    let dragging = false, dx = 0, dy = 0;
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('select, input, button, .cmyk-picker, .cmyk-popover')) return;
      dragging = true;
      const r = el.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const pw = el.offsetWidth, ph = el.offsetHeight;
      let left = e.clientX - dx, top = e.clientY - dy;
      left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
      top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
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
    setFontPopoverMoreOpen(false);
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

    // P(필터) 창이 먼저 열려있으면: 그 왼쪽에 나란히 붙이고,
    // 왼쪽 공간이 부족하면 바로 아래로, 그마저 부족하면 위로 배치 (드래그해서 옮긴 위치 기준)
    if (EP.qaPopover && !EP.qaPopover.classList.contains('hidden')) {
      const qRect = EP.qaPopover.getBoundingClientRect();
      let left = qRect.left - pw - 12;
      let top = qRect.top;
      if (left < 8) {
        left = qRect.left;
        top = qRect.bottom + 12;
        if (top + ph > window.innerHeight - 8) top = qRect.top - ph - 12;
      }
      left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
      top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);
      fontPopover.style.left = left + 'px';
      fontPopover.style.top = top + 'px';
      return;
    }

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
    left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);

    fontPopover.style.left = left + 'px';
    fontPopover.style.top = top + 'px';
  }

  // 더보기 펼침/접기로 창 높이가 바뀔 때: 텍스트 아래(6시 방향)로 재배치하지 않고,
  // 현재 위치(사용자가 드래그해둔 자리 포함)를 그대로 유지한 채 화면 밖으로만 안 나가게 조정
  function clampFontPopoverToViewport(){
    const pw = fontPopover.offsetWidth || 210;
    const ph = fontPopover.offsetHeight || 110;
    const curLeft = parseFloat(fontPopover.style.left) || 0;
    const curTop = parseFloat(fontPopover.style.top) || 0;
    const left = Math.min(Math.max(8, curLeft), window.innerWidth - pw - 8);
    const top = Math.min(Math.max(8, curTop), window.innerHeight - ph - 8);
    fontPopover.style.left = left + 'px';
    fontPopover.style.top = top + 'px';
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
    // 완전히 새로 열 때(닫혀 있다가 여는 경우)만 접힌 상태로 시작.
    // 이미 열려 있는 채로 다른 텍스트/새 텍스트로 대상만 바뀌는 경우엔 더보기 상태를 그대로 유지.
    if (wasHidden) setFontPopoverMoreOpen(false);

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
    boxes.forEach(o => o.set('fontFamily', floatingFontSelect.value));
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) fontFamilySelect.value = floatingFontSelect.value;
    canvas.requestRenderAll();
    pushHistory();
  });

  floatingFontSizeInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const v = parseInt(floatingFontSizeInput.value, 10) || 1;
    boxes.forEach(o => o.set('fontSize', v));
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) fontSizeInput.value = v;
    canvas.requestRenderAll();
  });
  floatingFontSizeInput.addEventListener('change', () => pushHistory());

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
    boxes.forEach(o => o.set('fontWeight', makeBold ? 'bold' : 'normal'));
    floatingBoldBtn.classList.toggle('on', makeBold);
    canvas.requestRenderAll();
    pushHistory();
  });
  floatingItalicBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeItalic = anchor.fontStyle !== 'italic';
    boxes.forEach(o => o.set('fontStyle', makeItalic ? 'italic' : 'normal'));
    floatingItalicBtn.classList.toggle('on', makeItalic);
    canvas.requestRenderAll();
    pushHistory();
  });
  floatingUnderlineBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeUnderline = !anchor.underline;
    boxes.forEach(o => o.set('underline', makeUnderline));
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

  const emptyHint = document.getElementById('emptyHint');
  function refreshEmptyHint(){
    const real = canvas.getObjects().filter(o => !o.isGuide);
    emptyHint.style.display = real.length ? 'none' : 'block';
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
  let guideRect, outerGuideRect, guidesVisible = true;

  function buildGuides(){
    const padding = CANVAS_W * 0.02;
    guideRect = new fabric.Rect({
      left: padding, top: padding,
      width: CANVAS_W - padding * 2, height: CANVAS_H - padding * 2,
      fill: 'transparent', stroke: '#ff0000', strokeWidth: 2,
      selectable: false, evented: false, visible: guidesVisible
    });
    guideRect.isGuide = true;

    outerGuideRect = new fabric.Rect({
      left: 0, top: 0,
      width: CANVAS_W, height: CANVAS_H,
      fill: 'transparent', stroke: '#999999', strokeWidth: 2,
      selectable: false, evented: false, visible: guidesVisible
    });
    outerGuideRect.isGuide = true;

    canvas.add(guideRect, outerGuideRect);
  }
  function bringGuideToFront(){
    if (guideRect) canvas.bringToFront(guideRect);
    if (outerGuideRect) canvas.bringToFront(outerGuideRect);
  }
  buildGuides();

  document.getElementById('guideToggleBtn').addEventListener('click', () => {
    guidesVisible = !guidesVisible;
    guideRect.visible = guidesVisible;
    outerGuideRect.visible = guidesVisible;
    canvas.renderAll();
  });

  /* ============================================================
     3b. 캔버스 전체 90도 회전
     - 캔버스 크기(가로/세로)가 서로 바뀌고, 안의 모든 오브젝트(안내선 포함)가
       캔버스에 붙어있는 것처럼 함께 회전합니다 (상대 위치·각도 그대로 유지).
  ============================================================ */
  function rotateCanvas90(dir){ // dir: 1 = 시계방향, -1 = 반시계방향
    const oldW = CANVAS_W, oldH = CANVAS_H;

    canvas.getObjects().forEach((obj) => {
      const c = obj.getCenterPoint();
      let nx, ny;
      if (dir === 1) { nx = oldH - c.y; ny = c.x; }
      else { nx = c.y; ny = oldW - c.x; }
      obj.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center');
      if (!obj.isGuide) {
        obj.set('angle', ((obj.angle || 0) + dir * 90 + 360) % 360);
      }
      obj.setCoords();
    });

    // 캔버스 논리 크기 및 규격 비율 교체 (가로 ↔ 세로)
    CANVAS_W = oldH;
    CANVAS_H = oldW;
    const tmpRatio = ratioW; ratioW = ratioH; ratioH = tmpRatio;

    // 안내선(붉은선/회색선)을 새 크기에 맞게 다시 생성
    canvas.remove(guideRect, outerGuideRect);
    buildGuides();

    // 현재 줌 배율을 유지한 채 캔버스 엘리먼트 크기 갱신
    setZoomLevel(zoom);

    document.getElementById('sizeLabel').textContent = `${ratioW} × ${ratioH} (붉은박스 기준)`;
    canvas.discardActiveObject();
    canvas.renderAll();
    pushHistory();
  }

  document.getElementById('rotateCanvasLeftBtn').addEventListener('click', () => rotateCanvas90(-1));
  document.getElementById('rotateCanvasRightBtn').addEventListener('click', () => rotateCanvas90(1));

  /* ============================================================
     3c. 메가메뉴(드롭다운) 공통 동작
     - 트리거 버튼을 누르면 메뉴가 열리고, 다른 메뉴를 열거나 바깥을 클릭하면 닫힘
     - 메뉴 안의 항목(버튼/라벨)을 클릭하면 해당 동작 후 자동으로 닫힘
  ============================================================ */
  const megaMenus = [
    { trigger: document.getElementById('fileMenuBtn'), menu: document.getElementById('fileMenu') },
    { trigger: document.getElementById('shapeMenuBtn'), menu: document.getElementById('shapeMenu') },
    { trigger: document.getElementById('rotateMenuBtn'), menu: document.getElementById('rotateMenu') },
    { trigger: document.getElementById('exportBtn'), menu: document.getElementById('exportMenu') }
  ];

  function closeAllMegaMenus(){
    megaMenus.forEach(({ menu }) => menu.classList.add('hidden'));
  }

  megaMenus.forEach(({ trigger, menu }) => {
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

  /* ============================================================
     4. 디자인(건수) / 앞뒤(면) 데이터 & 전환
  ============================================================ */
  const designData = Array.from({ length: count }, () => ({ front: null, back: null }));
  const designNames = Array.from({ length: count }, () => '');
  let currentIdx = 0;
  let currentSide = 'front';

  // 현재 캔버스 내용(안내선 제외)만 뽑아내기
  function serializeCurrentCanvas(){
    const objs = canvas.getObjects().filter(o => !o.isGuide);
    return {
      objects: objs.map(o => o.toObject(['selectable', 'evented', 'imageLocked', 'hasControls', 'hasBorders', 'lockMovementX', 'lockMovementY', 'hoverCursor', 'circularText', 'verticalText', 'puffyText', 'vineText', 'rollText', 'perspectiveText', 'curveText', 'waveText', 'tiredText', 'spiralText', 'magazineText', 'puzzleText', 'skyText', 'chalkText', 'grassText', 'bigbangText', 'doubleOutline', 'threeDText', 'metalText', 'popArtText', 'inkTrapText', 'leafVineText', 'sakuraText', 'shyText', 'fireText', 'meltText', 'bubbleText', 'zebraText', 'speedText', 'crackText', 'footprintText', 'snowText', 'rainText', 'randomTypo', 'glitchText', 'tearText', 'lightText'])),
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
      canvas.add(guideRect, outerGuideRect);
      bringGuideToFront();
      if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
      canvas.discardActiveObject();
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

      tabList.appendChild(group);
    }
  }
  renderTabs();

  document.getElementById('tabToggleBtn').addEventListener('click', () => {
    document.getElementById('tabSidebar').classList.toggle('open');
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
    return JSON.stringify(canvas.toJSON(['selectable', 'evented', 'isGuide', 'imageLocked', 'hasControls', 'hasBorders', 'lockMovementX', 'lockMovementY', 'hoverCursor', 'circularText', 'verticalText', 'puffyText', 'vineText', 'rollText', 'perspectiveText', 'curveText', 'waveText', 'tiredText', 'spiralText', 'magazineText', 'puzzleText', 'skyText', 'chalkText', 'grassText', 'bigbangText', 'doubleOutline', 'threeDText', 'metalText', 'popArtText', 'inkTrapText', 'leafVineText', 'sakuraText', 'shyText', 'fireText', 'meltText', 'bubbleText', 'zebraText', 'speedText', 'crackText', 'footprintText', 'snowText', 'rainText', 'randomTypo', 'glitchText', 'tearText', 'lightText']));
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
    canvas.loadFromJSON(json, () => {
      if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
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
    const filters = [];
    if (next.grayscale) filters.push(new fabric.Image.filters.Grayscale());
    if (next.brightness) filters.push(new fabric.Image.filters.Brightness({ brightness: next.brightness }));
    if (next.contrast) filters.push(new fabric.Image.filters.Contrast({ contrast: next.contrast }));
    if (next.saturation) filters.push(new fabric.Image.filters.Saturation({ saturation: next.saturation }));
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
    if (isImageObject(opt.target)) enterCropMode(opt.target);
  });

  document.addEventListener('keydown', (e) => {
    if (!cropState) return;
    if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelCrop(); }
  });

  /* ============================================================
     7. SVG 불러오기 — 개별 도형/텍스트를 그대로 편집 가능하게 배치
     importSvgIntoCanvas()로 빼둬서, 파일로 불러올 때뿐 아니라 다른 기능(예: ecopro3map.js의
     "지도 만들기"가 생성한 SVG 문자열)에서도 똑같은 방식으로 낱개 편집 가능한 오브젝트로
     캔버스에 넣을 수 있게 함.
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

  document.getElementById('svgInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      importSvgIntoCanvas(ev.target.result);
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
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.forEachObject(o => { if (!o.isGuide) o.selectable = true; });
  });

  document.getElementById('addTextBtn').addEventListener('click', () => {
    if (penActive) setPenMode(false);
    const t = new fabric.IText('텍스트를 입력하세요', {
      left: CANVAS_W / 2, top: CANVAS_H / 2,
      originX: 'center', originY: 'center',
      fontFamily: 'Pretendard', fontSize: 40, fill: '#222222'
    });
    canvas.add(t); bringGuideToFront(); canvas.setActiveObject(t); canvas.renderAll();
  });

  document.getElementById('addRectBtn').addEventListener('click', () => {
    if (penActive) setPenMode(false);
    const r = new fabric.Rect({
      left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
      width: 180, height: 120, fill: '#3498db', stroke: '', strokeWidth: 0
    });
    canvas.add(r); bringGuideToFront(); canvas.setActiveObject(r); canvas.renderAll();
  });

  document.getElementById('addCircleBtn').addEventListener('click', () => {
    if (penActive) setPenMode(false);
    const c = new fabric.Circle({
      left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
      radius: 80, fill: '#e67e22', stroke: '', strokeWidth: 0
    });
    canvas.add(c); bringGuideToFront(); canvas.setActiveObject(c); canvas.renderAll();
  });

  document.getElementById('addTriangleBtn').addEventListener('click', () => {
    if (penActive) setPenMode(false);
    const t = new fabric.Triangle({
      left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
      width: 160, height: 140, fill: '#9b59b6', stroke: '', strokeWidth: 0
    });
    canvas.add(t); bringGuideToFront(); canvas.setActiveObject(t); canvas.renderAll();
  });

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

  function setPenMode(active){
    penActive = active;
    penToolBtn.classList.toggle('active', active);
    document.getElementById('selectToolBtn').classList.toggle('active', !active);
    canvas.selection = !active;
    canvas.skipTargetFind = active;
    canvas.discardActiveObject();
    canvas.defaultCursor = active ? 'crosshair' : 'default';
    canvas.hoverCursor = active ? 'crosshair' : 'move';
    if (!active) {
      penPoints = [];
      penDragging = false;
      clearPenPreview();
    }
    canvas.renderAll();
  }

  penToolBtn.addEventListener('click', () => {
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

  document.getElementById('duplicateBtn').addEventListener('click', () => {
    if (cropState) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide) return;
    obj.clone(clone => {
      clone.set({ left: obj.left + 20, top: obj.top + 20 });
      canvas.add(clone); bringGuideToFront();
      if (EP.reindexPastedTable) EP.reindexPastedTable(clone); // 표를 복제한 경우 새 tableId로 재등록
      canvas.setActiveObject(clone);
      canvas.renderAll();
    }, ['selectable', 'evented', 'imageLocked'].concat(EP.tableCloneProps || []));
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
    obj.clone((cloned) => { clipboard = cloned; }, ['selectable', 'evented', 'imageLocked'].concat(EP.tableCloneProps || []));
  }

  function pasteClipboard(pointer){
    if (!clipboard || cropState) return;
    clipboard.clone((clonedObj) => {
      canvas.discardActiveObject();
      clonedObj.set({
        left: pointer ? pointer.x : (clonedObj.left || 0) + 24,
        top: pointer ? pointer.y : (clonedObj.top || 0) + 24,
        evented: true,
        imageLocked: false
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
    }, ['selectable', 'evented', 'imageLocked'].concat(EP.tableCloneProps || []));
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
        addCtxItem('🖼 이미지 교체', () => startReplaceImage(target));
        addCtxDivider();
        addCtxItem('🗑 이미지 삭제', () => { canvas.remove(target); canvas.discardActiveObject(); canvas.renderAll(); pushHistory(); }, true);
      } else {
        if (canvas.getActiveObject() !== target) {
          canvas.setActiveObject(target);
          canvas.renderAll();
        }
        addCtxItem('⧉ 복사', () => copySelected());
        addCtxItem('📋 붙여넣기', () => pasteClipboard(pointer));
        addCtxDivider();
        addCtxItem('↶ 실행 취소', () => undoBtn.click());
        addCtxItem('↷ 다시 실행', () => redoBtn.click());
        addCtxDivider();
        if (isImageObject(target)) {
          addCtxItem('🖼 이미지 교체', () => startReplaceImage(target));
          addCtxItem('🔒 이미지 잠금', () => lockImage(target));
          addCtxItem('🗑 이미지 삭제', () => deleteSelected(), true);
        } else {
          addCtxItem('🗑 삭제', () => deleteSelected(), true);
        }
      }
    } else {
      addCtxItem('📋 붙여넣기', () => pasteClipboard(pointer));
      addCtxDivider();
      addCtxItem('↶ 실행 취소', () => undoBtn.click());
      addCtxItem('↷ 다시 실행', () => redoBtn.click());
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

  document.addEventListener('mousedown', (e) => {
    if (!ctxMenu.classList.contains('hidden') && !ctxMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

  /* ============================================================
     10. 줌
  ============================================================ */
  let zoom = 1;
  const zoomLabel = document.getElementById('zoomLabel');
  function setZoomLevel(z){
    zoom = Math.min(Math.max(z, 0.2), 3);
    canvas.setZoom(zoom);
    canvas.setWidth(CANVAS_W * zoom);
    canvas.setHeight(CANVAS_H * zoom);
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
  document.getElementById('zoomInBtn').addEventListener('click', () => setZoomLevel(zoom + 0.1));
  document.getElementById('zoomOutBtn').addEventListener('click', () => setZoomLevel(zoom - 0.1));
  document.getElementById('zoomResetBtn').addEventListener('click', () => setZoomLevel(1));
  setZoomLevel(1);

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

  document.getElementById('flipXBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { o.set('flipX', !o.flipX); canvas.renderAll(); pushHistory(); } });
  document.getElementById('flipYBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { o.set('flipY', !o.flipY); canvas.renderAll(); pushHistory(); } });

  /* ============================================================
     12. 내보내기 (PNG / JPG / SVG) — 안내선은 항상 제외
  ============================================================ */
  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');

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

  exportMenu.addEventListener('click', async (e) => {
    const type = e.target.getAttribute('data-export');
    if (!type) return;
    canvas.discardActiveObject();
    const wasVisible = guidesVisible;
    guideRect.visible = false; outerGuideRect.visible = false;
    canvas.renderAll();
    const multiplier = 1 / zoom;

    if (type === 'png') {
      download(canvas.toDataURL({ format: 'png', multiplier }), 'design.png');
    } else if (type === 'jpg') {
      download(canvas.toDataURL({ format: 'jpeg', quality: 0.95, multiplier }), 'design.jpg');
    } else if (type === 'svg') {
      exportBtn.disabled = true;
      const flattened = await buildFontFlattenedClone();
      const blob = new Blob([flattened.toSVG()], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download(url, 'design.svg');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      flattened.dispose();
      exportBtn.disabled = false;
    }
    guideRect.visible = wasVisible; outerGuideRect.visible = wasVisible;
    canvas.renderAll();
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

  document.getElementById('saveProjectBtn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveProjectBtn');
    designData[currentIdx][currentSide] = serializeCurrentCanvas();

    const hasAnyCustomFont = customFontNames.size > 0;
    saveBtn.disabled = true;
    const originalLabel = saveBtn.textContent;
    if (hasAnyCustomFont) saveBtn.textContent = '이미지로 변환 중...';

    // 업로드한 폰트를 쓴 디자인이 있다면, 저장용으로만 텍스트를 이미지로 바꿔서 내보냄
    const exportDesignData = [];
    for (let i = 0; i < designData.length; i++) {
      const front = await flattenSideDataForSave(designData[i].front);
      const back = await flattenSideDataForSave(designData[i].back);
      exportDesignData.push({ front, back });
    }

    const project = {
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
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    download(url, `design-project-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  });

  document.getElementById('projectInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try {
        const project = JSON.parse(ev.target.result);
        if (project.designData) {
          for (let i = 0; i < Math.min(count, project.designData.length); i++) {
            designData[i] = project.designData[i];
            if (project.designNames && project.designNames[i] != null) {
              designNames[i] = project.designNames[i];
            }
          }
        }
        currentIdx = 0; currentSide = 'front';
        loadCanvasObjects(designData[currentIdx][currentSide], () => {
          resetHistory();
          renderTabs();
        });
      } catch (err) {
        alert('프로젝트 파일을 여는 중 문제가 발생했습니다. 파일 형식을 확인해주세요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ============================================================
     14. 속성 패널 — 선택 오브젝트에 따라 표시 전환
  ============================================================ */
  const sidePanelEl = document.getElementById('sidePanel');
  const noSelectionSection = document.getElementById('noSelectionSection');
  const selectionSections = document.getElementById('selectionSections');
  const textSection = document.getElementById('textSection');
  const shapeSection = document.getElementById('shapeSection');
  const imageSection = document.getElementById('imageSection');

  const textContentInput = document.getElementById('textContentInput');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const textColorInput = document.getElementById('textColorInput');
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const alignLeftBtn = document.getElementById('alignLeftBtn');
  const alignCenterBtn = document.getElementById('alignCenterBtn');
  const alignRightBtn = document.getElementById('alignRightBtn');

  const fillColorInput = document.getElementById('fillColorInput');
  const strokeColorInput = document.getElementById('strokeColorInput');
  const strokeWidthInput = document.getElementById('strokeWidthInput');

  const opacityInput = document.getElementById('opacityInput');
  const angleInput = document.getElementById('angleInput');
  const imgBrightnessInput = document.getElementById('imgBrightnessInput');
  const imgContrastInput = document.getElementById('imgContrastInput');
  const imgSaturationInput = document.getElementById('imgSaturationInput');
  const imgGrayscaleBtn = document.getElementById('imgGrayscaleBtn');
  const imgAdjustResetBtn = document.getElementById('imgAdjustResetBtn');

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
    el.appendChild(popover);

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
        const r = swatch.getBoundingClientRect();
        let left = r.left;
        if (left + 216 > window.innerWidth - 8) left = window.innerWidth - 224;
        popover.style.left = Math.max(8, left) + 'px';
        popover.style.top = (r.bottom + 6) + 'px';
        drawHueStrip();
        drawSvSquare();
      }
      popover.classList.toggle('hidden');
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
      return;
    }
    panelUpdating = true;
    noSelectionSection.classList.add('hidden');
    selectionSections.classList.remove('hidden');
    deleteBtn.disabled = false;

    const textLike = isTextObject(obj);
    const imageLike = isImageObject(obj);
    textSection.classList.toggle('hidden', !textLike);
    shapeSection.classList.toggle('hidden', textLike);
    imageSection.classList.toggle('hidden', !imageLike);

    if (textLike) {
      textContentInput.value = obj.text || '';
      fontFamilySelect.value = obj.fontFamily || 'Pretendard';
      fontSizeInput.value = Math.round(obj.fontSize || 40);
      textColorInput.value = toHex(obj.fill) || '#222222';
      boldBtn.classList.toggle('on', obj.fontWeight === 'bold' || obj.fontWeight >= 700);
      italicBtn.classList.toggle('on', obj.fontStyle === 'italic');
      underlineBtn.classList.toggle('on', !!obj.underline);
      [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => b.classList.remove('on'));
      if (obj.textAlign === 'center') alignCenterBtn.classList.add('on');
      else if (obj.textAlign === 'right') alignRightBtn.classList.add('on');
      else alignLeftBtn.classList.add('on');
    } else {
      fillColorInput.value = toHex(obj.fill) || '#3498db';
      strokeColorInput.value = toHex(obj.stroke) || '#000000';
      strokeWidthInput.value = obj.strokeWidth || 0;
    }

    if (imageLike) {
      imgBrightnessInput.value = Math.round(getImageFilterValue(obj, 'Brightness', 'brightness') * 100);
      imgContrastInput.value = Math.round(getImageFilterValue(obj, 'Contrast', 'contrast') * 100);
      imgSaturationInput.value = Math.round(getImageFilterValue(obj, 'Saturation', 'saturation') * 100);
      imgGrayscaleBtn.classList.toggle('on', hasGrayscaleFilter(obj));
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
    fn(obj);
    canvas.renderAll();
  }

  textContentInput.addEventListener('input', () => withActive(o => { if (isTextObject(o)) o.set('text', textContentInput.value); }));
  fontFamilySelect.addEventListener('change', () => withActive(o => o.set('fontFamily', fontFamilySelect.value)));
  fontSizeInput.addEventListener('input', () => withActive(o => o.set('fontSize', parseInt(fontSizeInput.value, 10) || 1)));
  textColorInput.addEventListener('input', () => withActive(o => o.set('fill', textColorInput.value)));

  boldBtn.addEventListener('click', () => withActive(o => { o.set('fontWeight', (o.fontWeight === 'bold' || o.fontWeight >= 700) ? 'normal' : 'bold'); updateSelectionPanel(); }));
  italicBtn.addEventListener('click', () => withActive(o => { o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic'); updateSelectionPanel(); }));
  underlineBtn.addEventListener('click', () => withActive(o => { o.set('underline', !o.underline); updateSelectionPanel(); }));

  alignLeftBtn.addEventListener('click', () => withActive(o => { o.set('textAlign', 'left'); updateSelectionPanel(); }));
  alignCenterBtn.addEventListener('click', () => withActive(o => { o.set('textAlign', 'center'); updateSelectionPanel(); }));
  alignRightBtn.addEventListener('click', () => withActive(o => { o.set('textAlign', 'right'); updateSelectionPanel(); }));

  fillColorInput.addEventListener('input', () => withActive(o => o.set('fill', fillColorInput.value)));
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
  imgGrayscaleBtn.addEventListener('click', () => withActive(o => {
    if (!isImageObject(o)) return;
    const turningOn = !hasGrayscaleFilter(o);
    applyImageAdjustments(o, { grayscale: turningOn });
    imgGrayscaleBtn.classList.toggle('on', turningOn);
    pushHistory();
  }));
  imgAdjustResetBtn.addEventListener('click', () => withActive(o => {
    if (!isImageObject(o)) return;
    o.filters = [];
    o.applyFilters();
    canvas.requestRenderAll();
    imgBrightnessInput.value = 0;
    imgContrastInput.value = 0;
    imgSaturationInput.value = 0;
    imgGrayscaleBtn.classList.remove('on');
    pushHistory();
  }));

  /* ============================================================
     15. 모바일: 패널 토글
  ============================================================ */
  document.getElementById('panelToggleBtn').addEventListener('click', () => {
    document.getElementById('sidePanel').classList.toggle('open');
  });

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
      !e.target.closest('.cmyk-popover')
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
  EP.importSvgIntoCanvas = importSvgIntoCanvas;
  EP.isTextObject = isTextObject;
  EP.isShapeObject = isShapeObject;
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

})();
