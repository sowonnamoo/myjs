/* ecopro3m.js — 도형(모양) 전용 "M" 버튼 + 모양필터 패널 인프라
   로딩 순서: ecopro3.js(코어) -> ecopro3table.js -> ecopro3c.js -> ecopro3m.js -> ecopro3text.js -> ...
   (ecopro3c.js가 만든 P 버튼과 완전히 별개의 컨트롤/팝업/레지스트리를 가짐.
    구조는 P와 동일하게 맞춰뒀고, 모양 전용 필터는 EP.registerShapeFilter()로 하나씩 추가함
    — 현재 등록된 필터: 지폐/상품권 그물무늬.)
   도형(사각형/원/삼각형/펜도구 패스)을 선택하면 이제 P 대신 이 M이 뜨고,
   M을 누르면 qaMPopover(모양 전용 필터 메뉴)가 열림. 텍스트 쪽 P 버튼/팝업은 그대로 유지됨. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  EP.shapeFilterRegistry = EP.shapeFilterRegistry || [];
  EP.registerShapeFilter = EP.registerShapeFilter || function(def){ EP.shapeFilterRegistry.push(def); };
  EP.qaShapeTargets = [];

  var isShapeObject = EP.isShapeObject;
  var isTableRelatedTarget = EP.isTableRelatedTarget || function(){ return false; };

  /* ============================================================
     M 버튼 컨트롤 — P와 동일한 위치/구조(controls.qa)를 도형 프로토타입에서만 사용.
     (ecopro3c.js는 더 이상 도형에 qa 컨트롤을 붙이지 않으므로 여기서 붙이는 게 유일한 등록임)
  ============================================================ */
  function renderMButton(ctx, left, top, styleOverride, fabricObject){
    if (isTableRelatedTarget(fabricObject)) return;
    if (fabricObject && (fabricObject.type === 'activeSelection' || fabricObject.type === 'group')) {
      const objs = fabricObject.getObjects().filter(o => !o.isGuide);
      if (objs.length < 2) return;
    }
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#6FC983';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 0, 1);
    ctx.restore();
  }

  const mControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: -14, offsetY: -36, // T버튼 바로 왼쪽, P버튼과 같은 자리(도형은 P 대신 M만 뜸)
    cursorStyle: 'pointer',
    render: renderMButton,
    mouseUpHandler: function(eventData, transformData){
      const target = transformData && transformData.target;
      if (!target || isTableRelatedTarget(target)) return true;
      if (!qaMPopover.classList.contains('hidden')) { hideQaMPopover(); return true; } // 이미 열려있으면 다시 눌렀을 때 닫힘(토글)
      openQaMPopover(target);
      return true;
    }
  });

  // 도형(사각형/원/삼각형/펜도구 패스) 전용 — 이 4개 프로토타입에만 M을 붙임(텍스트는 계속 P 사용)
  fabric.Rect.prototype.controls = Object.assign({}, fabric.Rect.prototype.controls, { qa: mControl });
  fabric.Circle.prototype.controls = Object.assign({}, fabric.Circle.prototype.controls, { qa: mControl });
  fabric.Triangle.prototype.controls = Object.assign({}, fabric.Triangle.prototype.controls, { qa: mControl });
  fabric.Path.prototype.controls = Object.assign({}, fabric.Path.prototype.controls, { qa: mControl });

  /* ============================================================
     M 팝업 — P의 qaPopover와 동일한 구조(드롭다운으로 필터 종류 선택 → 그 필터의
     상세조절만 아래 표시). 지금은 등록된 모양 전용 필터가 없어서 목록이 비어있음.
  ============================================================ */
  const qaMPopover = document.getElementById('qaMPopover');
  const qaMFilterSelect = document.getElementById('qaMFilterSelect');
  const qaShapeDetails = {}; // 앞으로 모양필터를 추가할 때: qaShapeDetails[id] = document.getElementById(...)
  // "랜덤 적용"(주사위) 버튼이 여러 필터를 겹쳐 쓸 때 참고할 등록부 — 각 필터가 자기 build 함수와
  // 타일 방식을 여기 등록해두면, 주사위가 그걸 그대로 재사용해서 합성 이미지를 만듦.
  EP.shapeComboFilters = EP.shapeComboFilters || [];

  // 도형에 걸려있던 모든 필터 상태(단일필터든 콤보든)를 깨끗이 지움 — 주사위를 다시 누르면
  // 항상 처음부터 새로 조합하기 위함
  function resetShapeFilters(t){
    t.banknotePattern = null;
    t.geoMosaicPattern = null;
    t.edgeWavePattern = null;
    t.orbScatterPattern = null;
    Object.keys(qaShapeDetails).forEach(function(id){ t['_shapeFx_' + id] = null; });
    t._comboLayers = null;
    t._comboSize = null;
    t._comboPrevFill = null;
  }
  function comboSizeForTarget(t){
    return {
      w: Math.max(20, Math.min(2000, Math.round(t.width || 100))),
      h: Math.max(20, Math.min(2000, Math.round(t.height || 100)))
    };
  }
  // 이 도형(t)이 지금 "콤보 모드"이고, 그 콤보 안에 id 필터가 포함돼 있으면 그 레이어 객체를 반환
  function getComboLayer(t, id){
    if (!t._comboLayers) return null;
    return t._comboLayers.filter(function(l){ return l.id === id; })[0] || null;
  }
  // 콤보에 들어있는 레이어들을 전부 다시 그려서 하나의 합성 이미지로 만들고 fill에 앉힘.
  // 레이어마다: 타일 반복형이면 <pattern>으로 감싸고, 도형 전체 크기형(가장자리/모서리 장식류)이면
  // 그대로 그 크기로 그림. 둘 다 랜덤 회전(rotate)과 투명도(opacity)를 <g>로 감쌈.
  function renderShapeCombo(t){
    const layers = t._comboLayers;
    if (!layers || !layers.length) return;
    const size = t._comboSize || comboSizeForTarget(t);
    const cx = size.w / 2, cy = size.h / 2;
    let defs = '';
    let body = '<rect width="' + size.w + '" height="' + size.h + '" fill="#f7f5f2"/>';
    layers.forEach(function(layer){
      const desc = EP.shapeComboFilters.filter(function(d){ return d.id === layer.id; })[0];
      if (!desc) return;
      const opacityFrac = (Math.max(0, Math.min(100, layer.opacity)) / 100).toFixed(3);
      if (desc.mode === 'tile') {
        const pid = 'cp' + Math.floor(Math.random() * 1000000);
        const inner = desc.build(layer.seed, layer.hue, layer.hueB, desc.tileW, desc.tileH, layer.intensity);
        defs += '<pattern id="' + pid + '" width="' + desc.tileW + '" height="' + desc.tileH + '" patternUnits="userSpaceOnUse">' + inner + '</pattern>';
        // 회전해도 모서리에 빈틈이 안 생기도록 실제 크기보다 3배 넉넉하게 깔고 회전시킴
        body += '<g opacity="' + opacityFrac + '" transform="rotate(' + layer.rotation + ',' + cx + ',' + cy + ')">' +
          '<rect x="-' + size.w + '" y="-' + size.h + '" width="' + (size.w * 3) + '" height="' + (size.h * 3) + '" fill="url(#' + pid + ')"/></g>';
      } else {
        const inner = desc.build(layer.seed, layer.hue, layer.hueB, size.w, size.h, layer.intensity);
        body += '<g opacity="' + opacityFrac + '" transform="rotate(' + layer.rotation + ',' + cx + ',' + cy + ')">' + inner + '</g>';
      }
    });
    buildPatternFromSVG(size.w, size.h, '<defs>' + defs + '</defs>' + body, 'no-repeat', function(pattern){
      if (!pattern) return;
      t.set('fill', pattern);
      EP.canvas.requestRenderAll();
    });
  }

  // ---- 주사위(랜덤 적용) 버튼 + P처럼 "◀ 1/3 ▶" 순환 네비게이션 ----
  const qaMDiceBtn = document.getElementById('qaMDiceBtn');
  const qaMRollNav = document.getElementById('qaMRollNav');
  const qaMRollCounter = document.getElementById('qaMRollCounter');
  const qaMRollPrevBtn = document.getElementById('qaMRollPrevBtn');
  const qaMRollNextBtn = document.getElementById('qaMRollNextBtn');
  const mRollState = { ids: [], index: 0 };

  function updateMRollNavUI(){
    if (!mRollState.ids.length) { qaMRollNav.classList.add('hidden'); return; }
    qaMRollNav.classList.remove('hidden');
    qaMRollCounter.textContent = (mRollState.index + 1) + '/' + mRollState.ids.length;
  }
  function showCurrentMRollFilter(){
    if (!mRollState.ids.length) return;
    const id = mRollState.ids[mRollState.index];
    setActiveShapeFilterMenu(id);
    qaMFilterSelect.value = id;
    updateMRollNavUI();
  }

  function rollShapeDice(target){
    const boxes = (EP.qaTargetsFromTarget ? EP.qaTargetsFromTarget(target) : []).filter(isShapeObject);
    if (!boxes.length) return;
    EP.qaShapeTargets = boxes;
    if (!EP.shapeComboFilters.length) return;

    // 1~3개를 중복 없이 뽑음
    const shuffled = EP.shapeComboFilters.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    const count = Math.min(shuffled.length, 1 + Math.floor(Math.random() * 3)); // 1~3
    const chosen = shuffled.slice(0, count);

    boxes.forEach(function(t){
      const prevFill = typeof t.fill === 'string' ? t.fill : '#cccccc';
      resetShapeFilters(t);
      t._comboPrevFill = prevFill;
      t._comboSize = comboSizeForTarget(t);
      t._comboLayers = chosen.map(function(desc){
        return {
          id: desc.id,
          seed: Math.floor(Math.random() * 100000),
          hue: Math.floor(Math.random() * 360),
          hueB: Math.floor(Math.random() * 360),
          intensity: Math.round(35 + Math.random() * 55),
          opacity: Math.round(10 + Math.random() * 40), // 요청대로 10~50 사이만
          rotation: Math.round(Math.random() * 360) // 요청대로 무늬 자체를 0~360도 랜덤 회전
        };
      });
      renderShapeCombo(t);
      chosen.forEach(function(desc){
        if (desc.populate) desc.populate(t);
      });
    });

    if (EP.pushHistory) EP.pushHistory();

    mRollState.ids = chosen.map(function(d){ return d.id; });
    mRollState.index = 0;
    showCurrentMRollFilter();
  }

  qaMDiceBtn.addEventListener('click', function(){
    const active = EP.canvas && EP.canvas.getActiveObject();
    if (!active) return;
    rollShapeDice(active);
  });
  qaMRollPrevBtn.addEventListener('click', function(){
    if (!mRollState.ids.length) return;
    mRollState.index = (mRollState.index - 1 + mRollState.ids.length) % mRollState.ids.length;
    showCurrentMRollFilter();
  });
  qaMRollNextBtn.addEventListener('click', function(){
    if (!mRollState.ids.length) return;
    mRollState.index = (mRollState.index + 1) % mRollState.ids.length;
    showCurrentMRollFilter();
  });

  function setActiveShapeFilterMenu(key){
    Object.keys(qaShapeDetails).forEach(k => qaShapeDetails[k].classList.toggle('hidden', k !== key));
  }
  qaMFilterSelect.addEventListener('change', () => setActiveShapeFilterMenu(qaMFilterSelect.value));

  function hideQaMPopover(){ qaMPopover.classList.add('hidden'); EP.qaShapeTargets = []; }
  if (EP.registerFilterPopover) EP.registerFilterPopover(qaMPopover);

  // P의 positionQaPopover와 동일한 방식(대상 중앙 아래쪽, 공간 부족하면 위쪽).
  function positionQaMPopover(target){
    qaMPopover.classList.remove('hidden');
    const pw = qaMPopover.offsetWidth || 200;
    const ph = qaMPopover.offsetHeight || 140;

    const br = target.getBoundingRect(true, true);
    const canvasRect = EP.canvas.upperCanvasEl.getBoundingClientRect();
    const scaleX = canvasRect.width / EP.canvas.getWidth();
    const scaleY = canvasRect.height / EP.canvas.getHeight();
    const z = EP.canvas.getZoom();

    const objLeft = canvasRect.left + br.left * z * scaleX;
    const objTop = canvasRect.top + br.top * z * scaleY;
    const objW = br.width * z * scaleX;
    const objH = br.height * z * scaleY;

    let left = objLeft + objW / 2 - pw / 2;
    let top = objTop + objH + 14;
    if (top + ph > window.innerHeight - 8) top = objTop - ph - 14;

    // T/P/J/Z 등 다른 필터 팝업이 이미 열려있어서 이 자리와 겹치면, 그 옆으로 자동으로 밀어서 배치
    if (EP.findNonOverlappingPosition) {
      const avoided = EP.findNonOverlappingPosition(qaMPopover, left, top, pw, ph);
      left = avoided.left; top = avoided.top;
    }

    const r = EP.clampPopoverRect(left, top, pw, ph, EP.canvasRotationDeg);
    qaMPopover.style.left = r.left + 'px';
    qaMPopover.style.top = r.top + 'px';
    EP.applyPopoverRotationStyle(qaMPopover);
  }

  function clampQaMPopoverToViewport(){
    const pw = qaMPopover.offsetWidth || 200;
    const ph = qaMPopover.offsetHeight || 140;
    const curLeft = parseFloat(qaMPopover.style.left) || 0;
    const curTop = parseFloat(qaMPopover.style.top) || 0;
    const r = EP.clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
    qaMPopover.style.left = r.left + 'px';
    qaMPopover.style.top = r.top + 'px';
  }

  // shapeTargetsFromTarget: qaTargetsFromTarget과 동일한 대상 수집 로직을 쓰되,
  // 도형만 남김(텍스트가 섞여 있어도 M 팝업은 도형에만 적용).
  function shapeTargetsFromTarget(target){
    var boxes = EP.qaTargetsFromTarget ? EP.qaTargetsFromTarget(target) : [];
    return boxes.filter(isShapeObject);
  }

  function openQaMPopover(target, opts){
    var boxes = shapeTargetsFromTarget(target);
    if (!boxes.length) return;
    var wasHidden = qaMPopover.classList.contains('hidden');
    EP.qaShapeTargets = boxes;

    var anchor = boxes[0];
    EP.shapeFilterRegistry.forEach(function(def){
      if (def.populate) { try { def.populate(anchor); } catch(e) { console.error('shape populate error:', def.id, e); } }
    });

    if (wasHidden) {
      qaMFilterSelect.value = '';
      Object.values(qaShapeDetails).forEach(function(d){ d.classList.add('hidden'); });
    }

    var reposition = !opts || opts.reposition !== false;
    if (reposition) {
      positionQaMPopover(target);
    } else {
      qaMPopover.classList.remove('hidden');
      clampQaMPopoverToViewport();
    }
  }

  document.getElementById('qaMPopoverCloseBtn').addEventListener('click', hideQaMPopover);

  // P의 syncQaPopoverToSelection과 동일한 방식: M 팝업이 열려있는 동안 다른 도형을
  // 새로 선택하면 자동으로 그 대상으로 전환됨.
  function syncQaMPopoverToSelection(){
    if (qaMPopover.classList.contains('hidden')) return;
    const active = EP.canvas.getActiveObject();
    if (isTableRelatedTarget(active)) return;
    const boxes = shapeTargetsFromTarget(active);
    if (!boxes.length) return;
    const sameTarget = boxes.length === EP.qaShapeTargets.length && boxes.every((o, i) => o === EP.qaShapeTargets[i]);
    if (sameTarget) return;
    openQaMPopover(active, { reposition: false });
  }
  EP.canvas.on('selection:created', syncQaMPopoverToSelection);
  EP.canvas.on('selection:updated', syncQaMPopoverToSelection);

  EP.makeDraggablePopover(qaMPopover);
  EP.registerRotatablePopover(qaMPopover);

  /* ============================================================
     여기서부터는 모든 모양필터를 "벡터(SVG)"로 만듭니다.
     이전 방식(작은 <canvas>에 그린 뒤 그 픽셀을 fabric.Pattern 소스로 씀)은 도형을 확대하거나
     인쇄용으로 내보낼 때 무늬가 흐려지거나 계단현상이 생길 수 있었습니다.
     이제는 각 필터가 SVG 마크업 문자열(선/원/다각형 등 실제 벡터 요소)을 만들고, 그 SVG를
     data URI 이미지로 불러와 fabric.Pattern의 소스로 사용합니다 — 브라우저가 그 이미지를
     그릴 때마다 벡터로 다시 그리므로 확대해도 선이 매끈하게 유지되고, 이 캔버스를 SVG로
     내보낼 때도 무늬가 래스터(PNG)가 아니라 벡터 그대로 보존됩니다.
     이미지 로딩이 비동기라 fill이 아주 살짝(다음 틱) 뒤에 반영되지만 체감상 차이는 없습니다.
  ============================================================ */

  // 시드로 고정된 의사난수(같은 시드면 항상 같은 값) — 슬라이더를 움직여도 무늬가 흔들리지 않고,
  // "다시 뽑기"를 눌러야만 새 시드(=새 색상·새 무늬)로 바뀌게 하기 위함
  function pseudoRandom(seed){
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function hexVertices(cx, cy, r){
    const v = [];
    for (let k = 0; k < 6; k++){
      const ang = Math.PI / 180 * (60 * k - 90); // pointy-top 육각형
      v.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    return v;
  }

  // ---- SVG 마크업 조립용 공용 헬퍼 ----
  function hsla(h, s, l, a){ return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')'; }
  function hslColor(h, s, l){ return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }
  function rndSeq(seed){ let i = 0; return function(){ i++; return pseudoRandom(seed + i * 5.13); }; }
  function pts(arr){ return arr.map(function(p){ return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '); }
  let _gradSeq = 0;
  function radialGradDef(hue, sat, light, alpha){
    _gradSeq++;
    const id = 'rg' + _gradSeq;
    return {
      id: id,
      markup: '<radialGradient id="' + id + '" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0%" stop-color="' + hslColor(hue, sat, light) + '" stop-opacity="' + alpha + '"/>' +
        '<stop offset="100%" stop-color="' + hslColor(hue, sat, light) + '" stop-opacity="0"/>' +
        '</radialGradient>'
    };
  }
  function computeDpr(W, H){
    // 실제로 도형 위에 깔릴 타일 크기(W,H)는 그대로 두되, 그 안의 벡터 내용은 훨씬 더 높은
    // 픽셀 밀도로 래스터라이즈함 — patternTransform으로 다시 1/dpr만큼 축소해서 앉히므로
    // "타일이 차지하는 실제 크기"는 그대로면서 "선명도"만 올라감(확대해도 안 흐려짐).
    let dpr = 6;
    const maxDim = Math.max(W, H);
    if (maxDim * dpr > 2400) dpr = Math.max(2, 2400 / maxDim); // 도형 크기에 맞춘(no-repeat) 큰 타일은 과도한 픽셀 수를 피함
    return dpr;
  }
  // SVG 조각(inner markup, <svg> 태그 없이) + 타일의 논리적 W,H를 받아서
  // fabric.Pattern까지 완성해서 콜백으로 돌려줌. repeatMode: 'repeat' | 'no-repeat'
  function buildPatternFromSVG(W, H, innerMarkup, repeatMode, cb){
    const dpr = computeDpr(W, H);
    const pxW = Math.max(1, Math.round(W * dpr));
    const pxH = Math.max(1, Math.round(H * dpr));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + pxW + '" height="' + pxH + '" viewBox="0 0 ' + W + ' ' + H + '">' + innerMarkup + '</svg>';
    const img = new Image();
    img.onload = function(){
      cb(new fabric.Pattern({
        source: img,
        repeat: repeatMode,
        patternTransform: [1 / dpr, 0, 0, 1 / dpr, 0, 0] // 고해상도 소스를 다시 원래 타일 크기로 앉힘
      }));
    };
    img.onerror = function(){ cb(null); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ============================================================
     모양필터 #1: 지폐/상품권 그물무늬 (벡터)
  ============================================================ */
  function buildBanknoteSVG(seed, hue, w, h, density){
    const lineHue = (hue + 8) % 360;
    let s = '<rect width="' + w + '" height="' + h + '" fill="' + hslColor(hue, 46, 91) + '"/>';
    const col = hsla(lineHue, 55, 40, 0.5);
    const dens = Math.max(0, Math.min(100, density)) / 100;
    const lineCount = Math.round(4 + dens * 6);
    const waveFreq = 2;
    const ampY = w * 0.16, ampX = h * 0.16;
    for (let i = 0; i < lineCount; i++) {
      const baseY = (h / lineCount) * (i + 0.5);
      const phase = pseudoRandom(seed + i * 13.7 + 1) * Math.PI * 2;
      const p = [];
      for (let x = 0; x <= w; x += 2) p.push([x, baseY + ampY * Math.sin((x / w) * Math.PI * 2 * waveFreq + phase)]);
      s += '<polyline points="' + pts(p) + '" fill="none" stroke="' + col + '" stroke-width="0.35"/>';
    }
    for (let j = 0; j < lineCount; j++) {
      const baseX = (w / lineCount) * (j + 0.5);
      const phase2 = pseudoRandom(seed + j * 9.3 + 501) * Math.PI * 2;
      const p = [];
      for (let y = 0; y <= h; y += 2) p.push([baseX + ampX * Math.sin((y / h) * Math.PI * 2 * waveFreq + phase2), y]);
      s += '<polyline points="' + pts(p) + '" fill="none" stroke="' + col + '" stroke-width="0.35"/>';
    }
    return s;
  }

  const qaBanknoteDensity = document.getElementById('qaBanknoteDensity');
  const qaBanknoteOpacity = document.getElementById('qaBanknoteOpacity');
  function applyQaBanknote(regenerateSeed){
    const boxes = EP.qaShapeTargets.filter(isShapeObject);
    if (!boxes.length) return;
    const density = parseFloat(qaBanknoteDensity.value) || 0;
    const opacityVal = parseFloat(qaBanknoteOpacity.value);
    boxes.forEach(function(t){
      const layer = getComboLayer(t, 'banknote');
      if (layer) {
        if (density <= 0) {
          t._comboLayers = t._comboLayers.filter(function(l){ return l.id !== 'banknote'; });
          if (!t._comboLayers.length) { t._comboLayers = null; t._comboSize = null; t.set('fill', t._comboPrevFill || '#cccccc'); EP.canvas.requestRenderAll(); return; }
        } else {
          layer.intensity = density;
          if (!isNaN(opacityVal)) layer.opacity = Math.max(0, Math.min(100, opacityVal));
          if (regenerateSeed) { layer.seed = Math.floor(Math.random() * 100000); layer.hue = Math.floor(Math.random() * 360); }
        }
        renderShapeCombo(t);
        return;
      }
      if (density <= 0) {
        t.set('fill', (t.banknotePattern && t.banknotePattern.prevFill) || '#cccccc');
        t.banknotePattern = null;
        EP.canvas.requestRenderAll();
      } else {
        const isNew = regenerateSeed || !t.banknotePattern;
        const seed = isNew ? Math.floor(Math.random() * 100000) : t.banknotePattern.seed;
        const hue = isNew ? Math.floor(Math.random() * 360) : t.banknotePattern.hue;
        const prevFill = t.banknotePattern ? t.banknotePattern.prevFill : (typeof t.fill === 'string' ? t.fill : '#cccccc');
        const opacity = !isNaN(opacityVal) ? Math.max(0, Math.min(100, opacityVal)) : (t.banknotePattern ? t.banknotePattern.opacity : 100);
        t.banknotePattern = { seed: seed, hue: hue, density: density, opacity: opacity, prevFill: prevFill };
        const inner = buildBanknoteSVG(seed, hue, 22, 22, density);
        const wrapped = opacity >= 100 ? inner : '<g opacity="' + (opacity / 100).toFixed(3) + '">' + inner + '</g>';
        buildPatternFromSVG(22, 22, wrapped, 'repeat', function(pattern){
          if (!pattern) return;
          t.set('fill', pattern);
          EP.canvas.requestRenderAll();
        });
      }
    });
  }
  qaBanknoteDensity.addEventListener('input', function(){ applyQaBanknote(false); });
  qaBanknoteDensity.addEventListener('change', function(){ EP.pushHistory(); });
  qaBanknoteOpacity.addEventListener('input', function(){ applyQaBanknote(false); });
  qaBanknoteOpacity.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaBanknoteShuffleBtn').addEventListener('click', function(){
    if ((parseFloat(qaBanknoteDensity.value) || 0) <= 0) qaBanknoteDensity.value = 55;
    applyQaBanknote(true);
    EP.pushHistory();
  });
  document.getElementById('qaBanknoteOffBtn').addEventListener('click', function(){
    qaBanknoteDensity.value = 0;
    applyQaBanknote(false);
    EP.pushHistory();
  });
  function populate_banknote(anchor){
    const layer = getComboLayer(anchor, 'banknote');
    if (layer) {
      qaBanknoteDensity.value = layer.intensity;
      qaBanknoteOpacity.value = layer.opacity;
    } else {
      qaBanknoteDensity.value = (anchor.banknotePattern && anchor.banknotePattern.density) || 0;
      qaBanknoteOpacity.value = (anchor.banknotePattern && anchor.banknotePattern.opacity != null) ? anchor.banknotePattern.opacity : 100;
    }
  }
  function randomize_banknote(){
    qaBanknoteDensity.value = Math.round(30 + Math.random() * 60);
    applyQaBanknote(true);
    EP.pushHistory();
  }
  qaShapeDetails.banknote = document.getElementById('qaDetailBanknote');
  EP.registerShapeFilter({
    id: 'banknote', label: '지폐/상품권 그물무늬',
    appliesTo: ['shape'], group: null, includeInRandom: true,
    apply: applyQaBanknote, randomize: randomize_banknote, populate: populate_banknote
  });
  EP.shapeComboFilters.push({
    id: 'banknote', mode: 'tile', tileW: 22, tileH: 22,
    build: function(seed, hue, hueB, W, H, intensity){ return buildBanknoteSVG(seed, hue, W, H, intensity); },
    populate: populate_banknote
  });

  /* ============================================================
     모양필터 #2: 기하학 큐브 모자이크 (벡터)
  ============================================================ */
  const GEO_MOSAIC_R = 3;
  const GEO_MOSAIC_W = Math.sqrt(3) * GEO_MOSAIC_R * 2;
  const GEO_MOSAIC_H = 1.5 * GEO_MOSAIC_R * 4;
  function buildGeoMosaicSVG(seed, hueA, hueB, intensity){
    const r = GEO_MOSAIC_R;
    const hexW = Math.sqrt(3) * r, vertStep = 1.5 * r;
    const cols = 2, rows = 4;
    const W = hexW * cols, H = vertStep * rows;
    const amt = Math.max(0, Math.min(100, intensity)) / 100;
    const sat = 22;
    const lightA = 90 - amt * 3, lightB = 90 - amt * 16;
    const colorA = hslColor(hueA, sat, lightA), colorB = hslColor(hueB, sat, lightB);
    const lineColor = hsla(hueA, 12, 45, (0.12 + amt * 0.18).toFixed(3));

    let s = '<rect width="' + W + '" height="' + H + '" fill="' + colorA + '"/>';
    let hexIndex = 0;
    for (let row = -1; row <= rows; row++) {
      const cy = row * vertStep;
      const rowOffset = (((row % 2) + 2) % 2) * (hexW / 2);
      for (let col = -1; col <= cols; col++) {
        const cx = col * hexW + rowOffset;
        const v = hexVertices(cx, cy, r);
        const rot = Math.floor(pseudoRandom(seed + hexIndex * 7.13) * 3);
        const rhombi = [[v[0], v[1], v[2]], [v[2], v[3], v[4]], [v[4], v[5], v[0]]];
        rhombi.forEach(function(triple, i){
          const fill = (i === rot) ? colorB : colorA;
          s += '<polygon points="' + pts([[cx, cy]].concat(triple)) + '" fill="' + fill + '" stroke="' + lineColor + '" stroke-width="0.4"/>';
        });
        hexIndex++;
      }
    }
    return s;
  }

  const qaGeoMosaicIntensity = document.getElementById('qaGeoMosaicIntensity');
  const qaGeoMosaicOpacity = document.getElementById('qaGeoMosaicOpacity');
  function applyQaGeoMosaic(regenerateSeed){
    const boxes = EP.qaShapeTargets.filter(isShapeObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaGeoMosaicIntensity.value) || 0;
    const opacityVal = parseFloat(qaGeoMosaicOpacity.value);
    boxes.forEach(function(t){
      const layer = getComboLayer(t, 'geoMosaic');
      if (layer) {
        if (intensity <= 0) {
          t._comboLayers = t._comboLayers.filter(function(l){ return l.id !== 'geoMosaic'; });
          if (!t._comboLayers.length) { t._comboLayers = null; t._comboSize = null; t.set('fill', t._comboPrevFill || '#cccccc'); EP.canvas.requestRenderAll(); return; }
        } else {
          layer.intensity = intensity;
          if (!isNaN(opacityVal)) layer.opacity = Math.max(0, Math.min(100, opacityVal));
          if (regenerateSeed) { layer.seed = Math.floor(Math.random() * 100000); layer.hue = Math.floor(Math.random() * 360); layer.hueB = Math.floor(Math.random() * 360); }
        }
        renderShapeCombo(t);
        return;
      }
      if (intensity <= 0) {
        t.set('fill', (t.geoMosaicPattern && t.geoMosaicPattern.prevFill) || '#cccccc');
        t.geoMosaicPattern = null;
        EP.canvas.requestRenderAll();
      } else {
        const isNew = regenerateSeed || !t.geoMosaicPattern;
        const seed = isNew ? Math.floor(Math.random() * 100000) : t.geoMosaicPattern.seed;
        const hueA = isNew ? Math.floor(Math.random() * 360) : t.geoMosaicPattern.hueA;
        const hueB = isNew ? Math.floor(Math.random() * 360) : t.geoMosaicPattern.hueB;
        const prevFill = t.geoMosaicPattern ? t.geoMosaicPattern.prevFill : (typeof t.fill === 'string' ? t.fill : '#cccccc');
        const opacity = !isNaN(opacityVal) ? Math.max(0, Math.min(100, opacityVal)) : (t.geoMosaicPattern ? t.geoMosaicPattern.opacity : 100);
        t.geoMosaicPattern = { seed: seed, hueA: hueA, hueB: hueB, intensity: intensity, opacity: opacity, prevFill: prevFill };
        const inner = buildGeoMosaicSVG(seed, hueA, hueB, intensity);
        const wrapped = opacity >= 100 ? inner : '<g opacity="' + (opacity / 100).toFixed(3) + '">' + inner + '</g>';
        buildPatternFromSVG(GEO_MOSAIC_W, GEO_MOSAIC_H, wrapped, 'repeat', function(pattern){
          if (!pattern) return;
          t.set('fill', pattern);
          EP.canvas.requestRenderAll();
        });
      }
    });
  }
  qaGeoMosaicIntensity.addEventListener('input', function(){ applyQaGeoMosaic(false); });
  qaGeoMosaicIntensity.addEventListener('change', function(){ EP.pushHistory(); });
  qaGeoMosaicOpacity.addEventListener('input', function(){ applyQaGeoMosaic(false); });
  qaGeoMosaicOpacity.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaGeoMosaicShuffleBtn').addEventListener('click', function(){
    if ((parseFloat(qaGeoMosaicIntensity.value) || 0) <= 0) qaGeoMosaicIntensity.value = 55;
    applyQaGeoMosaic(true);
    EP.pushHistory();
  });
  document.getElementById('qaGeoMosaicOffBtn').addEventListener('click', function(){
    qaGeoMosaicIntensity.value = 0;
    applyQaGeoMosaic(false);
    EP.pushHistory();
  });
  function populate_geoMosaic(anchor){
    const layer = getComboLayer(anchor, 'geoMosaic');
    if (layer) {
      qaGeoMosaicIntensity.value = layer.intensity;
      qaGeoMosaicOpacity.value = layer.opacity;
    } else {
      qaGeoMosaicIntensity.value = (anchor.geoMosaicPattern && anchor.geoMosaicPattern.intensity) || 0;
      qaGeoMosaicOpacity.value = (anchor.geoMosaicPattern && anchor.geoMosaicPattern.opacity != null) ? anchor.geoMosaicPattern.opacity : 100;
    }
  }
  function randomize_geoMosaic(){
    qaGeoMosaicIntensity.value = Math.round(30 + Math.random() * 60);
    applyQaGeoMosaic(true);
    EP.pushHistory();
  }
  qaShapeDetails.geoMosaic = document.getElementById('qaDetailGeoMosaic');
  EP.registerShapeFilter({
    id: 'geoMosaic', label: '기하학 큐브 모자이크',
    appliesTo: ['shape'], group: null, includeInRandom: true,
    apply: applyQaGeoMosaic, randomize: randomize_geoMosaic, populate: populate_geoMosaic
  });
  EP.shapeComboFilters.push({
    id: 'geoMosaic', mode: 'tile', tileW: GEO_MOSAIC_W, tileH: GEO_MOSAIC_H,
    build: function(seed, hue, hueB, W, H, intensity){ return buildGeoMosaicSVG(seed, hue, hueB, intensity); },
    populate: populate_geoMosaic
  });

  /* ============================================================
     모양필터 #3: 가장자리 물결무늬 (벡터, no-repeat — 도형 크기에 맞춘 1장)
  ============================================================ */
  function buildEdgeWaveSVG(seed, hue, w, h, intensity){
    let s = '<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>';
    const amt = Math.max(0, Math.min(100, intensity)) / 100;
    const minWH = Math.min(w, h);
    const bandDepth = minWH * (0.16 + amt * 0.22);
    const lineCount = Math.round(16 + amt * 26);
    const amp = minWH * 0.1;
    const freq = 2.1;
    function edgeBand(edge){
      let out = '';
      for (let i = 0; i < lineCount; i++) {
        const t = i / Math.max(1, lineCount - 1);
        const depth = t * bandDepth;
        const alpha = (1 - t) * (0.25 + amt * 0.45);
        const lightness = 32 + t * 45;
        const col = hsla(hue, 55, lightness, alpha.toFixed(3));
        const phase = pseudoRandom(seed + i * 3.7 + edge.length) * Math.PI * 2;
        const p = [];
        if (edge === 'top' || edge === 'bottom') {
          const baseY = edge === 'top' ? depth : h - depth;
          const dir = edge === 'top' ? 1 : -1;
          for (let x = -w * 0.1; x <= w * 1.1; x += 3) p.push([x, baseY + dir * amp * Math.sin((x / w) * Math.PI * 2 * freq + phase)]);
        } else {
          const baseX = edge === 'left' ? depth : w - depth;
          const dir = edge === 'left' ? 1 : -1;
          for (let y = -h * 0.1; y <= h * 1.1; y += 3) p.push([baseX + dir * amp * Math.sin((y / h) * Math.PI * 2 * freq + phase), y]);
        }
        out += '<polyline points="' + pts(p) + '" fill="none" stroke="' + col + '" stroke-width="0.6"/>';
      }
      return out;
    }
    ['top', 'bottom', 'left', 'right'].forEach(function(e){ s += edgeBand(e); });
    return s;
  }

  const qaEdgeWaveIntensity = document.getElementById('qaEdgeWaveIntensity');
  const qaEdgeWaveOpacity = document.getElementById('qaEdgeWaveOpacity');
  function applyQaEdgeWave(regenerateSeed){
    const boxes = EP.qaShapeTargets.filter(isShapeObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaEdgeWaveIntensity.value) || 0;
    const opacityVal = parseFloat(qaEdgeWaveOpacity.value);
    boxes.forEach(function(t){
      const layer = getComboLayer(t, 'edgeWave');
      if (layer) {
        if (intensity <= 0) {
          t._comboLayers = t._comboLayers.filter(function(l){ return l.id !== 'edgeWave'; });
          if (!t._comboLayers.length) { t._comboLayers = null; t._comboSize = null; t.set('fill', t._comboPrevFill || '#cccccc'); EP.canvas.requestRenderAll(); return; }
        } else {
          layer.intensity = intensity;
          if (!isNaN(opacityVal)) layer.opacity = Math.max(0, Math.min(100, opacityVal));
          if (regenerateSeed) { layer.seed = Math.floor(Math.random() * 100000); layer.hue = Math.floor(Math.random() * 360); }
        }
        renderShapeCombo(t);
        return;
      }
      if (intensity <= 0) {
        t.set('fill', (t.edgeWavePattern && t.edgeWavePattern.prevFill) || '#cccccc');
        t.edgeWavePattern = null;
        EP.canvas.requestRenderAll();
      } else {
        const isNew = regenerateSeed || !t.edgeWavePattern;
        const seed = isNew ? Math.floor(Math.random() * 100000) : t.edgeWavePattern.seed;
        const hue = isNew ? Math.floor(Math.random() * 360) : t.edgeWavePattern.hue;
        const prevFill = t.edgeWavePattern ? t.edgeWavePattern.prevFill : (typeof t.fill === 'string' ? t.fill : '#cccccc');
        const w = Math.max(20, Math.min(2000, Math.round(t.width || 100)));
        const h = Math.max(20, Math.min(2000, Math.round(t.height || 100)));
        const opacity = !isNaN(opacityVal) ? Math.max(0, Math.min(100, opacityVal)) : (t.edgeWavePattern ? t.edgeWavePattern.opacity : 100);
        t.edgeWavePattern = { seed: seed, hue: hue, intensity: intensity, opacity: opacity, prevFill: prevFill };
        const inner = buildEdgeWaveSVG(seed, hue, w, h, intensity);
        const wrapped = opacity >= 100 ? inner : '<g opacity="' + (opacity / 100).toFixed(3) + '">' + inner + '</g>';
        buildPatternFromSVG(w, h, wrapped, 'no-repeat', function(pattern){
          if (!pattern) return;
          t.set('fill', pattern);
          EP.canvas.requestRenderAll();
        });
      }
    });
  }
  qaEdgeWaveIntensity.addEventListener('input', function(){ applyQaEdgeWave(false); });
  qaEdgeWaveIntensity.addEventListener('change', function(){ EP.pushHistory(); });
  qaEdgeWaveOpacity.addEventListener('input', function(){ applyQaEdgeWave(false); });
  qaEdgeWaveOpacity.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaEdgeWaveShuffleBtn').addEventListener('click', function(){
    if ((parseFloat(qaEdgeWaveIntensity.value) || 0) <= 0) qaEdgeWaveIntensity.value = 55;
    applyQaEdgeWave(true);
    EP.pushHistory();
  });
  document.getElementById('qaEdgeWaveOffBtn').addEventListener('click', function(){
    qaEdgeWaveIntensity.value = 0;
    applyQaEdgeWave(false);
    EP.pushHistory();
  });
  function populate_edgeWave(anchor){
    const layer = getComboLayer(anchor, 'edgeWave');
    if (layer) {
      qaEdgeWaveIntensity.value = layer.intensity;
      qaEdgeWaveOpacity.value = layer.opacity;
    } else {
      qaEdgeWaveIntensity.value = (anchor.edgeWavePattern && anchor.edgeWavePattern.intensity) || 0;
      qaEdgeWaveOpacity.value = (anchor.edgeWavePattern && anchor.edgeWavePattern.opacity != null) ? anchor.edgeWavePattern.opacity : 100;
    }
  }
  function randomize_edgeWave(){
    qaEdgeWaveIntensity.value = Math.round(30 + Math.random() * 60);
    applyQaEdgeWave(true);
    EP.pushHistory();
  }
  qaShapeDetails.edgeWave = document.getElementById('qaDetailEdgeWave');
  EP.registerShapeFilter({
    id: 'edgeWave', label: '가장자리 물결무늬',
    appliesTo: ['shape'], group: null, includeInRandom: true,
    apply: applyQaEdgeWave, randomize: randomize_edgeWave, populate: populate_edgeWave
  });
  EP.shapeComboFilters.push({
    id: 'edgeWave', mode: 'full',
    build: function(seed, hue, hueB, W, H, intensity){ return buildEdgeWaveSVG(seed, hue, W, H, intensity); },
    populate: populate_edgeWave
  });

  /* ============================================================
     모양필터 #4: 가장자리 원형 장식 (벡터, no-repeat)
  ============================================================ */
  function buildOrbScatterSVG(seed, hue, w, h, intensity){
    const amt = Math.max(0, Math.min(100, intensity)) / 100;
    const minWH = Math.min(w, h);
    const cx0 = w / 2, cy0 = h / 2;
    const safeR = minWH * 0.30;
    let rngIdx = 0;
    function rnd(){ rngIdx++; return pseudoRandom(seed + rngIdx * 5.11); }
    function farEnough(px, py, r){ return (Math.hypot(px - cx0, py - cy0) - r) >= safeR; }

    let defs = '', body = '<rect width="' + w + '" height="' + h + '" fill="#fffdf8"/>';

    function shapeMarkup(kind, sx, sy, r){
      if (kind === 'filled') {
        const g = radialGradDef(hue, 55, 78, (0.40 + amt * 0.18).toFixed(3));
        defs += g.markup;
        return '<circle cx="' + sx.toFixed(2) + '" cy="' + sy.toFixed(2) + '" r="' + r.toFixed(2) + '" fill="url(#' + g.id + ')"/>';
      } else if (kind === 'outline') {
        const col = hsla(hue, 45, 55, (0.26 + amt * 0.2).toFixed(3));
        return '<circle cx="' + sx.toFixed(2) + '" cy="' + sy.toFixed(2) + '" r="' + r.toFixed(2) + '" fill="none" stroke="' + col + '" stroke-width="0.8"/>';
      } else {
        const col = hsla(hue, 62, 46, (0.5 + amt * 0.25).toFixed(3));
        return '<rect x="' + (sx - r).toFixed(2) + '" y="' + (sy - r).toFixed(2) + '" width="' + (r * 2).toFixed(2) + '" height="' + (r * 2).toFixed(2) + '" fill="' + col + '"/>';
      }
    }

    const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: h }, { x: w, y: h }];
    const shapeCount = Math.round(8 + amt * 11);

    for (let i = 0; i < shapeCount; i++) {
      const c = corners[Math.floor(rnd() * 4)];
      const dirX = cx0 - c.x, dirY = cy0 - c.y;
      const dirLen = Math.hypot(dirX, dirY) || 1;
      const ux = dirX / dirLen, uy = dirY / dirLen;
      const px0 = -uy, py0 = ux;

      const kind = rnd() < 0.2 ? 'square' : (rnd() < 0.55 ? 'outline' : 'filled');
      const r = kind === 'square' ? minWH * (0.018 + rnd() * 0.022) : minWH * (0.09 + rnd() * 0.17);

      let inward = minWH * (0.05 + rnd() * 0.30);
      const lateral = (rnd() - 0.5) * minWH * 0.5;

      let sx = c.x + ux * inward + px0 * lateral;
      let sy = c.y + uy * inward + py0 * lateral;

      let attempts = 0;
      while (!farEnough(sx, sy, r) && attempts < 12) {
        inward *= 0.7;
        sx = c.x + ux * inward + px0 * lateral;
        sy = c.y + uy * inward + py0 * lateral;
        attempts++;
      }
      if (!farEnough(sx, sy, r)) continue;

      body += shapeMarkup(kind, sx, sy, r);
    }

    return '<defs>' + defs + '</defs>' + body;
  }

  const qaOrbScatterIntensity = document.getElementById('qaOrbScatterIntensity');
  const qaOrbScatterOpacity = document.getElementById('qaOrbScatterOpacity');
  function applyQaOrbScatter(regenerateSeed){
    const boxes = EP.qaShapeTargets.filter(isShapeObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaOrbScatterIntensity.value) || 0;
    const opacityVal = parseFloat(qaOrbScatterOpacity.value);
    boxes.forEach(function(t){
      const layer = getComboLayer(t, 'orbScatter');
      if (layer) {
        if (intensity <= 0) {
          t._comboLayers = t._comboLayers.filter(function(l){ return l.id !== 'orbScatter'; });
          if (!t._comboLayers.length) { t._comboLayers = null; t._comboSize = null; t.set('fill', t._comboPrevFill || '#cccccc'); EP.canvas.requestRenderAll(); return; }
        } else {
          layer.intensity = intensity;
          if (!isNaN(opacityVal)) layer.opacity = Math.max(0, Math.min(100, opacityVal));
          if (regenerateSeed) { layer.seed = Math.floor(Math.random() * 100000); layer.hue = Math.floor(Math.random() * 360); }
        }
        renderShapeCombo(t);
        return;
      }
      if (intensity <= 0) {
        t.set('fill', (t.orbScatterPattern && t.orbScatterPattern.prevFill) || '#cccccc');
        t.orbScatterPattern = null;
        EP.canvas.requestRenderAll();
      } else {
        const isNew = regenerateSeed || !t.orbScatterPattern;
        const seed = isNew ? Math.floor(Math.random() * 100000) : t.orbScatterPattern.seed;
        const hue = isNew ? Math.floor(Math.random() * 360) : t.orbScatterPattern.hue;
        const prevFill = t.orbScatterPattern ? t.orbScatterPattern.prevFill : (typeof t.fill === 'string' ? t.fill : '#cccccc');
        const w = Math.max(20, Math.min(2000, Math.round(t.width || 100)));
        const h = Math.max(20, Math.min(2000, Math.round(t.height || 100)));
        const opacity = !isNaN(opacityVal) ? Math.max(0, Math.min(100, opacityVal)) : (t.orbScatterPattern ? t.orbScatterPattern.opacity : 100);
        t.orbScatterPattern = { seed: seed, hue: hue, intensity: intensity, opacity: opacity, prevFill: prevFill };
        const inner = buildOrbScatterSVG(seed, hue, w, h, intensity);
        const wrapped = opacity >= 100 ? inner : '<g opacity="' + (opacity / 100).toFixed(3) + '">' + inner + '</g>';
        buildPatternFromSVG(w, h, wrapped, 'no-repeat', function(pattern){
          if (!pattern) return;
          t.set('fill', pattern);
          EP.canvas.requestRenderAll();
        });
      }
    });
  }
  qaOrbScatterIntensity.addEventListener('input', function(){ applyQaOrbScatter(false); });
  qaOrbScatterIntensity.addEventListener('change', function(){ EP.pushHistory(); });
  qaOrbScatterOpacity.addEventListener('input', function(){ applyQaOrbScatter(false); });
  qaOrbScatterOpacity.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaOrbScatterShuffleBtn').addEventListener('click', function(){
    if ((parseFloat(qaOrbScatterIntensity.value) || 0) <= 0) qaOrbScatterIntensity.value = 55;
    applyQaOrbScatter(true);
    EP.pushHistory();
  });
  document.getElementById('qaOrbScatterOffBtn').addEventListener('click', function(){
    qaOrbScatterIntensity.value = 0;
    applyQaOrbScatter(false);
    EP.pushHistory();
  });
  function populate_orbScatter(anchor){
    const layer = getComboLayer(anchor, 'orbScatter');
    if (layer) {
      qaOrbScatterIntensity.value = layer.intensity;
      qaOrbScatterOpacity.value = layer.opacity;
    } else {
      qaOrbScatterIntensity.value = (anchor.orbScatterPattern && anchor.orbScatterPattern.intensity) || 0;
      qaOrbScatterOpacity.value = (anchor.orbScatterPattern && anchor.orbScatterPattern.opacity != null) ? anchor.orbScatterPattern.opacity : 100;
    }
  }
  function randomize_orbScatter(){
    qaOrbScatterIntensity.value = Math.round(30 + Math.random() * 60);
    applyQaOrbScatter(true);
    EP.pushHistory();
  }
  qaShapeDetails.orbScatter = document.getElementById('qaDetailOrbScatter');
  EP.registerShapeFilter({
    id: 'orbScatter', label: '가장자리 원형 장식',
    appliesTo: ['shape'], group: null, includeInRandom: true,
    apply: applyQaOrbScatter, randomize: randomize_orbScatter, populate: populate_orbScatter
  });
  EP.shapeComboFilters.push({
    id: 'orbScatter', mode: 'full',
    build: function(seed, hue, hueB, W, H, intensity){ return buildOrbScatterSVG(seed, hue, W, H, intensity); },
    populate: populate_orbScatter
  });

  /* ============================================================
     모양필터 #5~#24: 수수한 배경용 벡터 패턴 20종
     공통 뼈대(registerSimpleShapeFilter)가 <option>/슬라이더/버튼을 만들어 붙이고,
     각 buildXXXSVG(seed,hue,hueB,W,H,intensity)가 SVG 문자열을 만들면 data URI 이미지로
     불러와 fabric.Pattern 소스로 씀. 전부 벡터라 확대해도 매끈함.
  ============================================================ */
  function registerSimpleShapeFilter(id, label, buildTileSVG, opts){
    opts = opts || {};
    const tileSize = opts.tileSize || 48;

    const optionEl = document.createElement('option');
    optionEl.value = id; optionEl.textContent = label;
    qaMFilterSelect.appendChild(optionEl);

    const detail = document.createElement('div');
    detail.className = 'qa-filter-detail hidden';
    detail.id = 'qaDetail_' + id;
    detail.innerHTML =
      '<div class="row"><label>선명도</label>' +
      '<input type="range" id="qaIntensity_' + id + '" min="0" max="100" step="1"></div>' +
      '<div class="row"><label>투명도</label>' +
      '<input type="range" id="qaOpacity_' + id + '" min="0" max="100" step="1"></div>' +
      '<div class="row">' +
      '<button type="button" class="qa-btn" id="qaShuffle_' + id + '" style="flex:1;">🎲 다시 뽑기 (색상 새로고침)</button>' +
      '<button type="button" class="qa-btn" id="qaOff_' + id + '" style="flex:0 0 auto;width:auto;padding:6px 10px;">끄기</button>' +
      '</div>';
    qaMPopover.appendChild(detail);

    const intensityInput = detail.querySelector('#qaIntensity_' + id);
    const opacityInput = detail.querySelector('#qaOpacity_' + id);
    const shuffleBtn = detail.querySelector('#qaShuffle_' + id);
    const offBtn = detail.querySelector('#qaOff_' + id);
    const propName = '_shapeFx_' + id;

    function populate(anchor){
      const layer = getComboLayer(anchor, id);
      if (layer) {
        intensityInput.value = layer.intensity;
        opacityInput.value = layer.opacity;
      } else {
        intensityInput.value = (anchor[propName] && anchor[propName].intensity) || 0;
        opacityInput.value = (anchor[propName] && anchor[propName].opacity != null) ? anchor[propName].opacity : 100;
      }
    }

    function apply(regenerateSeed){
      const boxes = EP.qaShapeTargets.filter(isShapeObject);
      if (!boxes.length) return;
      const intensity = parseFloat(intensityInput.value) || 0;
      const opacityVal = parseFloat(opacityInput.value);
      boxes.forEach(function(t){
        const layer = getComboLayer(t, id);
        if (layer) {
          // 콤보(랜덤 적용) 안에 있는 레이어면, 이 레이어만 갱신하고 합성 전체를 다시 그림
          if (intensity <= 0) {
            t._comboLayers = t._comboLayers.filter(function(l){ return l.id !== id; });
            if (!t._comboLayers.length) {
              t._comboLayers = null; t._comboSize = null;
              t.set('fill', t._comboPrevFill || '#cccccc');
              EP.canvas.requestRenderAll();
              return;
            }
          } else {
            layer.intensity = intensity;
            if (!isNaN(opacityVal)) layer.opacity = Math.max(0, Math.min(100, opacityVal));
            if (regenerateSeed) {
              layer.seed = Math.floor(Math.random() * 100000);
              layer.hue = Math.floor(Math.random() * 360);
              layer.hueB = Math.floor(Math.random() * 360);
            }
          }
          renderShapeCombo(t);
          return;
        }
        // 콤보가 아니면 기존처럼 단일 필터로 적용
        if (intensity <= 0) {
          t.set('fill', (t[propName] && t[propName].prevFill) || '#cccccc');
          t[propName] = null;
          EP.canvas.requestRenderAll();
        } else {
          const isNew = regenerateSeed || !t[propName];
          const seed = isNew ? Math.floor(Math.random() * 100000) : t[propName].seed;
          const hue = isNew ? Math.floor(Math.random() * 360) : t[propName].hue;
          const hueB = isNew ? Math.floor(Math.random() * 360) : t[propName].hueB;
          const prevFill = t[propName] ? t[propName].prevFill : (typeof t.fill === 'string' ? t.fill : '#cccccc');
          const opacity = !isNaN(opacityVal) ? Math.max(0, Math.min(100, opacityVal)) : (t[propName] ? t[propName].opacity : 100);
          t[propName] = { seed: seed, hue: hue, hueB: hueB, intensity: intensity, opacity: opacity, prevFill: prevFill };
          const inner = buildTileSVG(seed, hue, hueB, tileSize, tileSize, intensity);
          const wrapped = opacity >= 100 ? inner : '<g opacity="' + (opacity / 100).toFixed(3) + '">' + inner + '</g>';
          buildPatternFromSVG(tileSize, tileSize, wrapped, 'repeat', function(pattern){
            if (!pattern) return;
            t.set('fill', pattern);
            EP.canvas.requestRenderAll();
          });
        }
      });
    }

    intensityInput.addEventListener('input', function(){ apply(false); });
    intensityInput.addEventListener('change', function(){ EP.pushHistory(); });
    opacityInput.addEventListener('input', function(){ apply(false); });
    opacityInput.addEventListener('change', function(){ EP.pushHistory(); });
    shuffleBtn.addEventListener('click', function(){
      if ((parseFloat(intensityInput.value) || 0) <= 0) intensityInput.value = 55;
      apply(true);
      EP.pushHistory();
    });
    offBtn.addEventListener('click', function(){
      intensityInput.value = 0;
      apply(false);
      EP.pushHistory();
    });

    qaShapeDetails[id] = detail;

    EP.registerShapeFilter({
      id: id, label: label, appliesTo: ['shape'], group: null, includeInRandom: true,
      apply: apply,
      randomize: function(){
        intensityInput.value = Math.round(30 + Math.random() * 60);
        apply(true);
        EP.pushHistory();
      },
      populate: populate
    });

    EP.shapeComboFilters.push({
      id: id, mode: 'tile', tileW: tileSize, tileH: tileSize,
      build: buildTileSVG,
      populate: populate
    });
  }

  // ---- 1. 도트무늬 ----
  function buildDotSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 20, 94) + '"/>';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++){
      const cx = (c + 0.5) * (W / 4) + (rnd() - 0.5) * 4;
      const cy = (r + 0.5) * (H / 4) + (rnd() - 0.5) * 4;
      const rad = (1.2 + rnd() * 2.2) * (0.5 + amt * 0.8);
      s += '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + rad.toFixed(2) + '" fill="' + hsla(hue, 30, 55 + rnd() * 15, (0.16 + amt * 0.32).toFixed(3)) + '"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('dot', '도트무늬', buildDotSVG, { tileSize: 13 });

  // ---- 2. 대각선 줄무늬 ----
  function buildStripeDiagSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 18, 95) + '"/>';
    const sw = (1.4 + amt * 1.6).toFixed(2);
    const col = hsla(hue, 35, 60, (0.12 + amt * 0.26).toFixed(3));
    for (let d = -H; d < W + H; d += 2.4) s += '<line x1="' + d + '" y1="0" x2="' + (d + H) + '" y2="' + H + '" stroke="' + col + '" stroke-width="' + sw + '"/>';
    return s;
  }
  registerSimpleShapeFilter('stripeDiag', '대각선 줄무늬', buildStripeDiagSVG, { tileSize: 16 });

  // ---- 3. 깅엄 체크무늬 ----
  function buildGinghamSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 20, 96) + '"/>';
    const col = hsla(hue, 35, 60, (0.12 + amt * 0.2).toFixed(3));
    const bandW = W * 0.32;
    s += '<rect x="0" y="' + ((H - bandW) / 2).toFixed(2) + '" width="' + W + '" height="' + bandW.toFixed(2) + '" fill="' + col + '"/>';
    s += '<rect x="' + ((W - bandW) / 2).toFixed(2) + '" y="0" width="' + bandW.toFixed(2) + '" height="' + H + '" fill="' + col + '"/>';
    return s;
  }
  registerSimpleShapeFilter('gingham', '깅엄 체크무늬', buildGinghamSVG, { tileSize: 12 });

  // ---- 4. 크로스해치 잔선 ----
  function buildCrosshatchSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>';
    const col = hsla(hue, 20, 45, (0.09 + amt * 0.18).toFixed(3));
    for (let d = -H; d < W + H; d += 2) s += '<line x1="' + d + '" y1="0" x2="' + (d + H) + '" y2="' + H + '" stroke="' + col + '" stroke-width="0.4"/>';
    for (let d = -H; d < W + H; d += 2) s += '<line x1="' + d + '" y1="' + H + '" x2="' + (d + H) + '" y2="0" stroke="' + col + '" stroke-width="0.4"/>';
    return s;
  }
  registerSimpleShapeFilter('crosshatch', '크로스해치 잔선', buildCrosshatchSVG, { tileSize: 14 });

  // ---- 5. 헤링본 무늬 ----
  function buildHerringboneSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 16, 95) + '"/>';
    const col = hsla(hue, 30, 50, (0.14 + amt * 0.22).toFixed(3));
    const seg = W / 4;
    for (let y = 0; y < H + seg; y += seg) for (let x = 0; x < W + seg; x += seg){
      if (Math.round((x + y) / seg) % 2 === 0) s += '<line x1="' + x + '" y1="' + (y + seg) + '" x2="' + (x + seg) + '" y2="' + y + '" stroke="' + col + '" stroke-width="1.6"/>';
      else s += '<line x1="' + x + '" y1="' + y + '" x2="' + (x + seg) + '" y2="' + (y + seg) + '" stroke="' + col + '" stroke-width="1.6"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('herringbone', '헤링본 무늬', buildHerringboneSVG, { tileSize: 13 });

  // ---- 6. 전체 버블 산점 ----
  function buildBubbleFullSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let defs = '', body = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>';
    const count = Math.round(3 + amt * 5);
    for (let i = 0; i < count; i++){
      const cx = rnd() * W, cy = rnd() * H, r = W * 0.08 + rnd() * W * 0.14;
      const g = radialGradDef(hue, 45, 75, (0.2 + amt * 0.16).toFixed(3));
      defs += g.markup;
      body += '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + r.toFixed(2) + '" fill="url(#' + g.id + ')"/>';
    }
    return '<defs>' + defs + '</defs>' + body;
  }
  registerSimpleShapeFilter('bubbleFull', '전체 버블 산점', buildBubbleFullSVG, { tileSize: 23 });

  // ---- 7. 색종이 조각(컨페티) ----
  function buildConfettiSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 15, 97) + '"/>';
    const count = Math.round(6 + amt * 10);
    for (let i = 0; i < count; i++){
      const cx = rnd() * W, cy = rnd() * H, sz = 1 + rnd() * 2.2;
      const useB = rnd() < 0.5;
      const col = hsla(useB ? hueB : hue, 40, 55, (0.22 + amt * 0.3).toFixed(3));
      const kind = rnd();
      const rot = (rnd() * 180).toFixed(1);
      if (kind < 0.34) {
        s += '<rect x="' + (-sz).toFixed(2) + '" y="' + (-sz).toFixed(2) + '" width="' + (sz * 2).toFixed(2) + '" height="' + (sz * 2).toFixed(2) + '" fill="' + col + '" transform="translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ') rotate(' + rot + ')"/>';
      } else if (kind < 0.67) {
        s += '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + sz.toFixed(2) + '" fill="' + col + '"/>';
      } else {
        const p = [[0, -sz], [sz, sz], [-sz, sz]];
        s += '<polygon points="' + pts(p) + '" fill="' + col + '" transform="translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ') rotate(' + rot + ')"/>';
      }
    }
    return s;
  }
  registerSimpleShapeFilter('confetti', '색종이 조각', buildConfettiSVG, { tileSize: 15 });

  // ---- 8. 별무늬 산점 ----
  function starPoints(r, points){
    const arr = [];
    for (let i = 0; i < points * 2; i++){
      const ang = (Math.PI / points) * i - Math.PI / 2;
      const rad = (i % 2 === 0) ? r : r * 0.45;
      arr.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    return arr;
  }
  function buildStarSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 14, 96) + '"/>';
    const count = Math.round(3 + amt * 5);
    for (let i = 0; i < count; i++){
      const cx = rnd() * W, cy = rnd() * H, r = 1.6 + rnd() * 2.6;
      const col = hsla(hue, 35, 55, (0.2 + amt * 0.3).toFixed(3));
      s += '<polygon points="' + pts(starPoints(r, 5)) + '" fill="' + col + '" transform="translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('star', '별무늬 산점', buildStarSVG, { tileSize: 15 });

  // ---- 9. 잎맥 라인 ----
  function buildLeafVeinSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 20, 95) + '"/>';
    const col = hsla(hue, 30, 45, (0.13 + amt * 0.2).toFixed(3));
    s += '<line x1="' + (W / 2) + '" y1="0" x2="' + (W / 2) + '" y2="' + H + '" stroke="' + col + '" stroke-width="0.6"/>';
    for (let y = 4; y < H; y += 7){
      const len = W * 0.32;
      const e1x = W / 2 + len, e1y = y - 4 + rnd() * 8;
      const c1x = W / 2 + len * 0.6, c1y = y + 3;
      s += '<path d="M' + (W / 2).toFixed(2) + ',' + y + ' Q' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + e1x.toFixed(2) + ',' + e1y.toFixed(2) + '" stroke="' + col + '" fill="none" stroke-width="0.6"/>';
      const e2x = W / 2 - len, e2y = y - 1 + rnd() * 8;
      const c2x = W / 2 - len * 0.6, c2y = y + 6;
      s += '<path d="M' + (W / 2).toFixed(2) + ',' + (y + 3) + ' Q' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + e2x.toFixed(2) + ',' + e2y.toFixed(2) + '" stroke="' + col + '" fill="none" stroke-width="0.6"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('leafVein', '잎맥 라인', buildLeafVeinSVG, { tileSize: 15 });

  // ---- 10. 구름무늬 ----
  function buildCloudSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let defs = '', body = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>';
    const puffCount = Math.round(3 + amt * 3);
    for (let i = 0; i < puffCount; i++){
      const cx = rnd() * W, cy = H * 0.3 + rnd() * H * 0.5, r = W * 0.14 + rnd() * W * 0.12;
      const g = radialGradDef(hue, 25, 88, (0.24 + amt * 0.16).toFixed(3));
      defs += g.markup;
      body += '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + r.toFixed(2) + '" fill="url(#' + g.id + ')"/>';
    }
    return '<defs>' + defs + '</defs>' + body;
  }
  registerSimpleShapeFilter('cloud', '구름무늬', buildCloudSVG, { tileSize: 20 });

  // ---- 11. 대리석 결 ----
  function buildMarbleSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 10, 96) + '"/>';
    const col = hsla(hue, 20, 55, (0.09 + amt * 0.2).toFixed(3));
    for (let i = 0; i < 5; i++){
      const y0 = pseudoRandom(seed + i * 11) * H;
      const sw = (0.5 + pseudoRandom(seed + i * 17) * 1).toFixed(2);
      const p = [];
      for (let x = -4; x <= W + 4; x += 6){
        const y = y0 + Math.sin((x / W) * Math.PI * 2 * 1.4 + seed * 0.001 + i) * (H * 0.08);
        p.push([x, y]);
      }
      s += '<polyline points="' + pts(p) + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('marble', '대리석 결', buildMarbleSVG, { tileSize: 19 });

  // ---- 12. 미세 그레인 텍스처 ----
  function buildGrainSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 8, 95) + '"/>';
    const count = Math.round(W * H * 0.5);
    for (let i = 0; i < count; i++){
      const x = rnd() * W, y = rnd() * H;
      const light = rnd() < 0.5 ? 20 : 85;
      s += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="0.8" height="0.8" fill="hsla(0,0%,' + light + '%,' + (0.03 + amt * 0.05).toFixed(3) + ')"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('grain', '미세 그레인 텍스처', buildGrainSVG, { tileSize: 12 });

  // ---- 13. 물결 줄무늬 ----
  function buildWaveStripeSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 18, 95) + '"/>';
    const col = hsla(hue, 35, 55, (0.13 + amt * 0.24).toFixed(3));
    for (let r = 0; r < 5; r++){
      const baseY = (H / 5) * (r + 0.5);
      const phase = pseudoRandom(seed + r * 9) * Math.PI * 2;
      const p = [];
      for (let x = 0; x <= W; x += 2){
        const y = baseY + Math.sin((x / W) * Math.PI * 2 * 2 + phase) * (H / 5 * 0.3);
        p.push([x, y]);
      }
      s += '<polyline points="' + pts(p) + '" fill="none" stroke="' + col + '" stroke-width="1.2"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('waveStripe', '물결 줄무늬', buildWaveStripeSVG, { tileSize: 16 });

  // ---- 14. 그라디언트 줄무늬 ----
  function buildGradStripeSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const cols = 4;
    let defs = '', body = '';
    for (let c = 0; c < cols; c++){
      const x = (W / cols) * c;
      const l1 = 88 + ((c % 2) ? -4 : 4);
      _gradSeq++;
      const id = 'lg' + _gradSeq;
      defs += '<linearGradient id="' + id + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
        '<stop offset="0%" stop-color="' + hslColor(hue, 22, l1) + '" stop-opacity="' + (0.35 + amt * 0.25).toFixed(3) + '"/>' +
        '<stop offset="100%" stop-color="' + hslColor(hueB, 22, l1 - 5) + '" stop-opacity="' + (0.35 + amt * 0.25).toFixed(3) + '"/>' +
        '</linearGradient>';
      body += '<rect x="' + x.toFixed(2) + '" y="0" width="' + (W / cols).toFixed(2) + '" height="' + H + '" fill="url(#' + id + ')"/>';
    }
    return '<defs>' + defs + '</defs>' + body;
  }
  registerSimpleShapeFilter('gradStripe', '그라디언트 줄무늬', buildGradStripeSVG, { tileSize: 16 });

  // ---- 15. 알가일(다이아몬드) 격자 ----
  function buildArgyleSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 16, 95) + '"/>';
    const col = hsla(hue, 32, 50, (0.13 + amt * 0.24).toFixed(3));
    const step = W / 2;
    for (let d = -H; d < W + H; d += step) s += '<line x1="' + d + '" y1="0" x2="' + (d + H) + '" y2="' + H + '" stroke="' + col + '" stroke-width="0.8"/>';
    for (let d = -H; d < W + H; d += step) s += '<line x1="' + d + '" y1="' + H + '" x2="' + (d + H) + '" y2="0" stroke="' + col + '" stroke-width="0.8"/>';
    return s;
  }
  registerSimpleShapeFilter('argyle', '알가일(다이아몬드) 격자', buildArgyleSVG, { tileSize: 17 });

  // ---- 16. 육각형 아웃라인 격자 ----
  function buildHexOutlineSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 14, 96) + '"/>';
    const r = W / 2.6;
    const hexW = Math.sqrt(3) * r, vertStep = 1.5 * r;
    const col = hsla(hue, 30, 45, (0.13 + amt * 0.24).toFixed(3));
    for (let row = -1; row <= Math.ceil(H / vertStep) + 1; row++){
      const cy = row * vertStep;
      const rowOffset = (((row % 2) + 2) % 2) * (hexW / 2);
      for (let col2 = -1; col2 <= Math.ceil(W / hexW) + 1; col2++){
        const cx = col2 * hexW + rowOffset;
        const v = hexVertices(cx, cy, r);
        s += '<polygon points="' + pts(v) + '" fill="none" stroke="' + col + '" stroke-width="0.6"/>';
      }
    }
    return s;
  }
  registerSimpleShapeFilter('hexOutline', '육각형 아웃라인 격자', buildHexOutlineSVG, { tileSize: 15 });

  // ---- 17. 크라프트지 텍스처 ----
  function buildKraftSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 20, 85) + '"/>';
    for (let i = 0; i < 120; i++){
      const x = rnd() * W, y = rnd() * H;
      s += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="1" height="1" fill="' + hsla(hue, 15, 30 + rnd() * 40, (0.03 + amt * 0.05).toFixed(3)) + '"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('kraft', '크라프트지 텍스처', buildKraftSVG, { tileSize: 13 });

  // ---- 18. 리넨 패브릭 결 ----
  function buildLinenSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 12, 95) + '"/>';
    const col = hsla(hue, 20, 55, (0.07 + amt * 0.15).toFixed(3));
    for (let x = 0; x <= W; x += 0.9) s += '<line x1="' + x.toFixed(2) + '" y1="0" x2="' + x.toFixed(2) + '" y2="' + H + '" stroke="' + col + '" stroke-width="0.35"/>';
    for (let y = 0; y <= H; y += 0.9) s += '<line x1="0" y1="' + y.toFixed(2) + '" x2="' + W + '" y2="' + y.toFixed(2) + '" stroke="' + col + '" stroke-width="0.35"/>';
    return s;
  }
  registerSimpleShapeFilter('linen', '리넨 패브릭 결', buildLinenSVG, { tileSize: 10 });

  // ---- 19. 쉐브런(지그재그) 무늬 ----
  function buildChevronSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 16, 95) + '"/>';
    const col = hsla(hue, 32, 50, (0.13 + amt * 0.24).toFixed(3));
    const step = H / 3;
    for (let y = -step; y < H + step; y += step){
      s += '<polyline points="0,' + (y + step).toFixed(2) + ' ' + (W / 2).toFixed(2) + ',' + y.toFixed(2) + ' ' + W + ',' + (y + step).toFixed(2) + '" fill="none" stroke="' + col + '" stroke-width="1.4"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('chevron', '쉐브런(지그재그) 무늬', buildChevronSVG, { tileSize: 13 });

  // ---- 20. 테라조 알갱이 무늬 ----
  function buildTerrazzoSVG(seed, hue, hueB, W, H, intensity){
    const amt = intensity / 100;
    const rnd = rndSeq(seed);
    let s = '<rect width="' + W + '" height="' + H + '" fill="' + hslColor(hue, 10, 94) + '"/>';
    const count = Math.round(8 + amt * 10);
    for (let i = 0; i < count; i++){
      const cx = rnd() * W, cy = rnd() * H, sz = 1 + rnd() * 2.6;
      const useB = rnd() < 0.5;
      const col = hsla(useB ? hueB : hue, 28, 50, (0.18 + amt * 0.26).toFixed(3));
      const sides = 3 + Math.floor(rnd() * 3);
      const rot = (rnd() * 180).toFixed(1);
      const p = [];
      for (let k = 0; k < sides; k++){
        const ang = (Math.PI * 2 / sides) * k;
        p.push([Math.cos(ang) * sz, Math.sin(ang) * sz]);
      }
      s += '<polygon points="' + pts(p) + '" fill="' + col + '" transform="translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ') rotate(' + rot + ')"/>';
    }
    return s;
  }
  registerSimpleShapeFilter('terrazzo', '테라조 알갱이 무늬', buildTerrazzoSVG, { tileSize: 15 });

  EP.openQaMPopover = openQaMPopover;
  EP.hideQaMPopover = hideQaMPopover;
  EP.setActiveShapeFilterMenu = setActiveShapeFilterMenu;
  EP.qaShapeDetails = qaShapeDetails;
  EP.qaMFilterSelect = qaMFilterSelect;
  EP.rollShapeDice = rollShapeDice; // M의 "랜덤 적용" 로직을 다른 기능(예: 캔버스 바탕 랜덤 생성)에서도 재사용
})();
