/* ecopro3z.js — "Z" 버튼 + 이미지 전용 블렌드(합성) 필터 패널
   로딩 순서: ecopro3.js -> ecopro3table.js -> ecopro3c.js -> ecopro3m.js -> ecopro3j.js -> ecopro3z.js -> ecopro3text.js -> ...
   (fabric.Image.filters.BlendColor를 확장해서 쓰므로 fabric.js가 이미 로드된 뒤,
    그리고 EP.isImageObject / EP.initCmykPicker / EP.pushHistory 등이 준비된 뒤에 로드돼야 함)

   J버튼과 인터페이스 구조(닫기버튼 + 드롭다운으로 필터 선택 → 상세조절 → 끄기버튼,
   드래그·회전 가능한 팝업)는 완전히 동일하지만, 안에 들어가는 필터는 전혀 다름:
   포토샵에 있는 곱하기(Multiply)/색상번(Color Burn)/선형번(Linear Burn)/스크린(Screen)
   블렌드(합성) 모드 4종 + 흰색 투과(사진의 흰색/밝은 색만 투명해져 뒤 레이어가 비쳐 보임) 1종 +
   지정색 투과(직접 고른 색을 최대 10개까지 동시에 투명하게) 1종 + 가장자리 확장(사방 30px를
   가장자리 색으로 늘리고 경계는 블러로 자연스럽게) 1종, 총 7종. 이미지 오브젝트에만
   붙는 버튼임(도형·텍스트엔 안 뜸).

   구현 방식: fabric.js가 원래 제공하는 fabric.Image.filters.BlendColor는 multiply/screen 등은
   이미 지원하지만 colorBurn/linearBurn은 없어서, 이 두 모드를 BlendColor 클래스에 추가로
   확장해 넣음(WebGL 셰이더 + 2D 캔버스 버전 둘 다) — 그래서 밝기/대비/채도 슬라이더처럼
   실시간으로, 그리고 비파괴적으로(언제든 다시 슬라이더를 움직이면 값이 바뀌는 방식으로) 동작함.
   4개 모드 중 실제로는 한 번에 하나만 이미지에 적용됨(포토샵에서 레이어 블렌드 모드가 하나만
   선택되는 것과 동일한 개념) — obj.filters 배열 안에 'BlendColor' 타입 필터를 항상 하나만
   유지하고, 어떤 탭(모드)의 슬라이더를 만지느냐에 따라 그 모드로 교체됨. 흰색 투과는 완전히
   별도 슬롯('RemoveColor' 타입)이라 블렌드 모드 4종 중 하나와 동시에 같이 켜놔도 서로 안 지움.
   지정색 투과는 색을 최대 10개까지 늘려서 여러 색을 동시에(중복으로) 투명하게 만들 수 있음 —
   슬롯마다 독립된 RemoveColor 인스턴스(zRole: custom0~custom9)라 서로 안 지우고, 슬라이더를
   움직이면 다음 빈 슬롯이 자동으로 나타남. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  EP.qaZTargets = [];

  var isImageObject = EP.isImageObject || function(o){ return !!o && o.type === 'image'; };
  var isTableRelatedTarget = EP.isTableRelatedTarget || function(){ return false; };

  /* ============================================================
     0. fabric.Image.filters.BlendColor에 colorBurn/linearBurn 모드 추가
  ============================================================ */
  (function extendBlendColorFilter(){
    var BlendColor = fabric.Image.filters.BlendColor;
    if (!BlendColor) return; // 혹시 fabric 버전이 달라 이 필터 자체가 없으면 조용히 건너뜀

    // WebGL 경로(GPU) — 값은 0~1로 정규화된 상태. 색이 0에 가까우면 나눗셈이 커지는 걸
    // max(...,0.0001)로 막아서 안전하게 0으로 수렴하게 함(색상번의 "분모가 0이면 결과도 0" 규칙).
    BlendColor.prototype.fragmentSource.colorBurn =
      'gl_FragColor.rgb = 1.0 - min(vec3(1.0), (1.0 - gl_FragColor.rgb) / max(uColor.rgb, vec3(0.0001)));\n';
    BlendColor.prototype.fragmentSource.linearBurn =
      'gl_FragColor.rgb = clamp(gl_FragColor.rgb + uColor.rgb - 1.0, 0.0, 1.0);\n';

    // 2D 캔버스 경로(WebGL을 못 쓰는 환경 대비 폴백) — fabric 원본 applyTo2d를 감싸서
    // multiply/screen 등 기존 모드는 그대로 원본 로직에 맡기고, 새로 추가한 2개 모드만 처리함.
    var originalApplyTo2d = BlendColor.prototype.applyTo2d;
    BlendColor.prototype.applyTo2d = function(options){
      if (this.mode !== 'colorBurn' && this.mode !== 'linearBurn') {
        originalApplyTo2d.call(this, options);
        return;
      }
      var imageData = options.imageData;
      var data = imageData.data, iLen = data.length;
      var source = new fabric.Color(this.color).getSource();
      var tr = source[0] * this.alpha, tg = source[1] * this.alpha, tb = source[2] * this.alpha;
      var mode = this.mode;
      for (var i = 0; i < iLen; i += 4) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        if (mode === 'colorBurn') {
          data[i] = tr <= 0 ? 0 : 255 - Math.min(255, (255 - r) * 255 / tr);
          data[i + 1] = tg <= 0 ? 0 : 255 - Math.min(255, (255 - g) * 255 / tg);
          data[i + 2] = tb <= 0 ? 0 : 255 - Math.min(255, (255 - b) * 255 / tb);
        } else { // linearBurn
          data[i] = Math.max(0, Math.min(255, r + tr - 255));
          data[i + 1] = Math.max(0, Math.min(255, g + tg - 255));
          data[i + 2] = Math.max(0, Math.min(255, b + tb - 255));
        }
      }
    };
  })();

  // RemoveColor(흰색 투과 / 지정색 투과가 함께 쓰는 필터)에 zRole 표식을 붙여 저장/불러오기·
  // 되돌리기(undo)를 거쳐도 "이게 흰색용인지 지정색용인지" 계속 구분되게 함 — toObject에서
  // 안 챙기면 JSON으로 저장했다가 다시 불러올 때 이 표식이 사라져서 팝업을 다시 열었을 때
  // 이미 적용된 필터인데도 0(꺼짐)으로 잘못 표시되는 문제가 생김.
  (function extendRemoveColorFilter(){
    var RemoveColor = fabric.Image.filters.RemoveColor;
    if (!RemoveColor) return;
    var originalToObject = RemoveColor.prototype.toObject;
    RemoveColor.prototype.toObject = function(){
      var obj = originalToObject.call(this);
      obj.zRole = this.zRole;
      return obj;
    };
  })();

  /* ============================================================
     1. Z 버튼 컨트롤 — J(offsetX:-14)보다 한 칸 더 왼쪽(-46)에, 이미지에만 부착.
  ============================================================ */
  function renderZButton(ctx, left, top, styleOverride, fabricObject){
    if (isTableRelatedTarget(fabricObject)) return;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 0, 1);
    ctx.restore();
  }

  var zControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: -46, offsetY: -36, // 주사위(P/M)가 좌측 모서리로 옮겨가서 한 칸씩 당겨짐 — J 바로 왼쪽
    cursorStyle: 'pointer',
    render: renderZButton,
    mouseUpHandler: function(eventData, transformData){
      var target = transformData && transformData.target;
      if (!target || isTableRelatedTarget(target)) return true;
      if (!qaZPopover.classList.contains('hidden')) { hideQaZPopover(); return true; } // 이미 열려있으면 다시 눌렀을 때 닫힘(토글)
      openQaZPopover(target);
      return true;
    }
  });

  // 이미지 오브젝트에만 붙임 — 도형/텍스트엔 안 뜸(이미지 전용 필터이므로)
  fabric.Image.prototype.controls = Object.assign({}, fabric.Image.prototype.controls, { qz: zControl });

  /* ============================================================
     2. Z 팝업 — J와 똑같은 구조(드롭다운 → 상세조절 → 끄기버튼)
  ============================================================ */
  var qaZPopover = document.getElementById('qaZPopover');
  var qaZFilterSelect = document.getElementById('qaZFilterSelect');
  var qaZDetails = {
    multiply: document.getElementById('qaZDetailMultiply'),
    colorBurn: document.getElementById('qaZDetailColorBurn'),
    linearBurn: document.getElementById('qaZDetailLinearBurn'),
    screen: document.getElementById('qaZDetailScreen'),
    whiteTransparent: document.getElementById('qaZDetailWhiteTransparent'),
    customColorTransparent: document.getElementById('qaZDetailCustomColorTransparent'),
    edgeExtend: document.getElementById('qaZDetailEdgeExtend'),
    textExtract: document.getElementById('qaZDetailTextExtract')
  };
  function setActiveZFilterMenu(key){
    Object.keys(qaZDetails).forEach(function(k){ qaZDetails[k].classList.toggle('hidden', k !== key); });
  }
  qaZFilterSelect.addEventListener('change', function(){ setActiveZFilterMenu(qaZFilterSelect.value); });

  function hideQaZPopover(){ qaZPopover.classList.add('hidden'); EP.qaZTargets = []; }
  if (EP.registerFilterPopover) EP.registerFilterPopover(qaZPopover);

  function positionQaZPopover(target){
    qaZPopover.classList.remove('hidden');
    var pw = qaZPopover.offsetWidth || 200;
    var ph = qaZPopover.offsetHeight || 140;

    var br = target.getBoundingRect(true, true);
    var canvasRect = EP.canvas.upperCanvasEl.getBoundingClientRect();
    var scaleX = canvasRect.width / EP.canvas.getWidth();
    var scaleY = canvasRect.height / EP.canvas.getHeight();
    var z = EP.canvas.getZoom();

    var objLeft = canvasRect.left + br.left * z * scaleX;
    var objTop = canvasRect.top + br.top * z * scaleY;
    var objW = br.width * z * scaleX;
    var objH = br.height * z * scaleY;

    var left = objLeft + objW / 2 - pw / 2;
    var top = objTop + objH + 14;
    if (top + ph > window.innerHeight - 8) top = objTop - ph - 14;

    // T/P/M/J 등 다른 필터 팝업이 이미 열려있어서 이 자리와 겹치면, 그 옆으로 자동으로 밀어서 배치
    if (EP.findNonOverlappingPosition) {
      var avoided = EP.findNonOverlappingPosition(qaZPopover, left, top, pw, ph);
      left = avoided.left; top = avoided.top;
    }

    var r = EP.clampPopoverRect(left, top, pw, ph, EP.canvasRotationDeg);
    qaZPopover.style.left = r.left + 'px';
    qaZPopover.style.top = r.top + 'px';
    EP.applyPopoverRotationStyle(qaZPopover);
  }

  function clampQaZPopoverToViewport(){
    var pw = qaZPopover.offsetWidth || 200;
    var ph = qaZPopover.offsetHeight || 140;
    var curLeft = parseFloat(qaZPopover.style.left) || 0;
    var curTop = parseFloat(qaZPopover.style.top) || 0;
    var r = EP.clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
    qaZPopover.style.left = r.left + 'px';
    qaZPopover.style.top = r.top + 'px';
  }

  function zTargetsFromTarget(target){
    if (!target) return [];
    if (target.type === 'activeSelection' || target.type === 'group') {
      return target.getObjects().filter(function(o){ return !o.isGuide; }).filter(isImageObject);
    }
    if (target.isGuide) return [];
    return isImageObject(target) ? [target] : [];
  }

  var qaZPopulators = []; // openQaZPopover에서 전부 호출해서 현재 값 표시

  function openQaZPopover(target, opts){
    var boxes = zTargetsFromTarget(target);
    if (!boxes.length) return;
    var wasHidden = qaZPopover.classList.contains('hidden');
    EP.qaZTargets = boxes;

    var anchor = boxes[0];
    qaZPopulators.forEach(function(fn){ try { fn(anchor); } catch (e) { console.error('Z populate error:', e); } });

    if (wasHidden) {
      qaZFilterSelect.value = '';
      Object.values(qaZDetails).forEach(function(d){ d.classList.add('hidden'); });
    }

    var reposition = !opts || opts.reposition !== false;
    if (reposition) {
      positionQaZPopover(target);
    } else {
      qaZPopover.classList.remove('hidden');
      clampQaZPopoverToViewport();
    }
  }

  document.getElementById('qaZPopoverCloseBtn').addEventListener('click', hideQaZPopover);

  // Z 팝업이 열려있는 동안 다른 이미지를 새로 선택하면 자동으로 그 대상으로 전환됨
  function syncQaZPopoverToSelection(){
    if (qaZPopover.classList.contains('hidden')) return;
    var active = EP.canvas.getActiveObject();
    if (isTableRelatedTarget(active)) return;
    var boxes = zTargetsFromTarget(active);
    if (!boxes.length) return;
    var sameTarget = boxes.length === EP.qaZTargets.length && boxes.every(function(o, i){ return o === EP.qaZTargets[i]; });
    if (sameTarget) return;
    openQaZPopover(active, { reposition: false });
  }
  EP.canvas.on('selection:created', syncQaZPopoverToSelection);
  EP.canvas.on('selection:updated', syncQaZPopoverToSelection);

  EP.makeDraggablePopover(qaZPopover);
  EP.registerRotatablePopover(qaZPopover);

  /* ============================================================
     3. 블렌드 필터 공통 적용/조회 로직
  ============================================================ */
  // obj.filters 배열에서 현재 걸려있는 BlendColor 필터(있다면 하나뿐)를 찾음
  function getBlendColorFilter(obj){
    if (!obj || !obj.filters) return null;
    for (var i = 0; i < obj.filters.length; i++) {
      if (obj.filters[i] && obj.filters[i].type === 'BlendColor') return obj.filters[i];
    }
    return null;
  }

  // mode/color/amount(0~100)로 BlendColor 필터를 새로 구성해서 적용. amount가 0이면 필터 자체를 제거(끄기).
  // 기존에 걸려있던 다른 필터(밝기/대비/채도/흑백 등)는 그대로 두고 BlendColor 자리만 교체함.
  function applyZBlend(mode, colorHex, amountPercent){
    var boxes = EP.qaZTargets.filter(isImageObject);
    if (!boxes.length) return;
    var alpha = Math.max(0, Math.min(1, (parseFloat(amountPercent) || 0) / 100));
    boxes.forEach(function(t){
      if (!t.filters) t.filters = [];
      t.filters = t.filters.filter(function(f){ return !(f && f.type === 'BlendColor'); });
      if (alpha > 0) {
        t.filters.push(new fabric.Image.filters.BlendColor({ mode: mode, color: colorHex || '#ff0000', alpha: alpha }));
      }
      t.applyFilters();
    });
    EP.canvas.requestRenderAll();
  }

  // 필터 탭(모드) 하나를 통째로 등록하는 헬퍼 — 곱하기/색상번/선형번/스크린 4개가 구조상 완전히
  // 똑같아서(강도 슬라이더 + 색상 + 끄기버튼) 이 함수 하나로 4번 호출해서 만듦.
  function setupZBlendTab(mode, amountElId, colorElId, offBtnId){
    var amountEl = document.getElementById(amountElId);
    var colorEl = document.getElementById(colorElId);
    EP.initCmykPicker(colorEl);
    colorEl.value = '#ff0000';
    amountEl.value = 0;

    function apply(){ applyZBlend(mode, colorEl.value, amountEl.value); }
    amountEl.addEventListener('input', apply);
    colorEl.addEventListener('input', apply);
    amountEl.addEventListener('change', function(){ EP.pushHistory(); });

    document.getElementById(offBtnId).addEventListener('click', function(){
      amountEl.value = 0;
      apply();
      EP.pushHistory();
    });

    // 탭을 열었을 때: 지금 이 모드가 실제로 적용 중이면 그 값을, 아니면 강도 0(꺼짐)으로 표시
    qaZPopulators.push(function(anchor){
      var f = getBlendColorFilter(anchor);
      if (f && f.mode === mode) {
        amountEl.value = Math.round((f.alpha || 0) * 100);
        colorEl.value = f.color || '#ff0000';
      } else {
        amountEl.value = 0;
      }
    });
  }

  setupZBlendTab('multiply', 'qaZMultiplyAmount', 'qaZMultiplyColor', 'qaZMultiplyOffBtn');
  setupZBlendTab('colorBurn', 'qaZColorBurnAmount', 'qaZColorBurnColor', 'qaZColorBurnOffBtn');
  setupZBlendTab('linearBurn', 'qaZLinearBurnAmount', 'qaZLinearBurnColor', 'qaZLinearBurnOffBtn');
  setupZBlendTab('screen', 'qaZScreenAmount', 'qaZScreenColor', 'qaZScreenOffBtn');

  /* ============================================================
     4. 흰색 투과 / 지정색 투과 — 사진에서 특정 색(과 그 근처 색)만 투명해져서 뒤 레이어가
     비쳐 보이게 함. BlendColor(위 4개 탭)와는 완전히 다른 별도 필터들('RemoveColor',
     fabric.js 내장)을 쓰므로 블렌드 모드와 동시에 같이 적용해도 서로 안 지움.
     흰색 투과·지정색 투과도 서로 "역할(zRole)" 표식으로 구분한 별개의 RemoveColor 인스턴스라
     둘 다 동시에 켜놔도(예: 흰 배경 + 특정 초록 배경을 같이 지우기) 서로 안 지움.
     "허용범위" 슬라이더 = 그 색으로 쳐줄 범위(값이 클수록 비슷한 톤도 같이 투명해짐).
  ============================================================ */
  function getRemoveColorFilter(obj, role){
    if (!obj || !obj.filters) return null;
    for (var i = 0; i < obj.filters.length; i++) {
      var f = obj.filters[i];
      if (f && f.type === 'RemoveColor' && f.zRole === role) return f;
    }
    return null;
  }

  function applyZRemoveColor(role, colorHex, amountPercent){
    var boxes = EP.qaZTargets.filter(isImageObject);
    if (!boxes.length) return;
    var amount = Math.max(0, Math.min(100, parseFloat(amountPercent) || 0));
    // 슬라이더 0~100%를 fabric RemoveColor의 distance(0~1, "그 색으로부터 얼마나 떨어진
    // 색까지 봐줄지")로 변환. 0.4까지만 써도 웬만한 비슷한 톤까지 넉넉히 잡힘.
    var distance = (amount / 100) * 0.4;
    boxes.forEach(function(t){
      if (!t.filters) t.filters = [];
      t.filters = t.filters.filter(function(f){ return !(f && f.type === 'RemoveColor' && f.zRole === role); });
      if (amount > 0) {
        var f = new fabric.Image.filters.RemoveColor({ color: colorHex || '#ffffff', distance: distance });
        f.zRole = role; // 흰색 투과('white')와 지정색 투과('custom')를 서로 구분하기 위한 표식
        t.filters.push(f);
      }
      t.applyFilters();
    });
    EP.canvas.requestRenderAll();
  }

  // ---- 흰색 투과 ----
  var qaZWhiteTransparentAmount = document.getElementById('qaZWhiteTransparentAmount');
  qaZWhiteTransparentAmount.value = 0;
  qaZWhiteTransparentAmount.addEventListener('input', function(){ applyZRemoveColor('white', '#ffffff', qaZWhiteTransparentAmount.value); });
  qaZWhiteTransparentAmount.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaZWhiteTransparentOffBtn').addEventListener('click', function(){
    qaZWhiteTransparentAmount.value = 0;
    applyZRemoveColor('white', '#ffffff', 0);
    EP.pushHistory();
  });
  qaZPopulators.push(function(anchor){
    var f = getRemoveColorFilter(anchor, 'white');
    qaZWhiteTransparentAmount.value = f ? Math.round((f.distance / 0.4) * 100) : 0;
  });

  // ---- 지정색 투과 (최대 10개 슬롯, 서로 다른 색을 동시에·중복으로 투명하게 적용 가능) ----
  var CUSTOM_COLOR_SLOT_COUNT = 10;
  var customColorSlots = []; // { idx, row, colorEl, amountEl, offBtn }

  function updateCustomColorRowsVisibility(){
    // 규칙: 0번은 항상 보임. i번은 "바로 앞(i-1)번이 켜져있을 때" 또는 "자기 자신이 이미
    // 켜져있을 때" 보임 — 슬라이더를 움직여 색을 하나 채우면 자동으로 다음 빈 칸이 나타남.
    for (var i = 0; i < CUSTOM_COLOR_SLOT_COUNT; i++) {
      var slot = customColorSlots[i];
      var amount = parseFloat(slot.amountEl.value) || 0;
      var prevOn = i === 0 ? true : (parseFloat(customColorSlots[i - 1].amountEl.value) || 0) > 0;
      var show = prevOn || amount > 0;
      slot.row.classList.toggle('hidden', !show);
    }
  }

  function applyZCustomColorSlot(idx){
    var slot = customColorSlots[idx];
    applyZRemoveColor('custom' + idx, slot.colorEl.value, slot.amountEl.value);
    updateCustomColorRowsVisibility();
  }

  for (var ci = 0; ci < CUSTOM_COLOR_SLOT_COUNT; ci++) {
    (function(idx){
      var row = document.getElementById('qaZCustomRow' + idx);
      var colorEl = document.getElementById('qaZCustomColor' + idx);
      var amountEl = document.getElementById('qaZCustomAmount' + idx);
      var offBtn = document.getElementById('qaZCustomOffBtn' + idx);
      EP.initCmykPicker(colorEl);
      // 슬롯마다 색이 겹쳐 보이지 않게 매번 다른 기본 색상으로 시작(빨/주/노/초/파/남/보 등 순환)
      var defaultColors = ['#ff0000', '#ff8c00', '#ffd700', '#2ecc71', '#00bcd4', '#3498db', '#9b59b6', '#e91e63', '#795548', '#607d8b'];
      colorEl.value = defaultColors[idx] || '#ff0000';
      amountEl.value = 0;

      amountEl.addEventListener('input', function(){ applyZCustomColorSlot(idx); });
      colorEl.addEventListener('input', function(){ applyZCustomColorSlot(idx); });
      amountEl.addEventListener('change', function(){ EP.pushHistory(); });
      offBtn.addEventListener('click', function(){
        amountEl.value = 0;
        applyZCustomColorSlot(idx);
        EP.pushHistory();
      });

      customColorSlots.push({ idx: idx, row: row, colorEl: colorEl, amountEl: amountEl, offBtn: offBtn });
    })(ci);
  }

  qaZPopulators.push(function(anchor){
    for (var i = 0; i < CUSTOM_COLOR_SLOT_COUNT; i++) {
      var slot = customColorSlots[i];
      var f = getRemoveColorFilter(anchor, 'custom' + i);
      if (f) {
        slot.amountEl.value = Math.round((f.distance / 0.4) * 100);
        slot.colorEl.value = f.color || slot.colorEl.value;
      } else {
        slot.amountEl.value = 0;
      }
    }
    updateCustomColorRowsVisibility();
  });

  /* ============================================================
     5. 가장자리 확장 — 사방 가장자리 색을 그대로 밖으로 늘려 캔버스를 키움(폭은 슬라이더로
     10~100px 사이에서 조절 가능, 기본 30px). 원본과 확장된 영역의 경계는 블러(페더)로
     부드럽게 섞어서 이어붙인 티가 안 나게 함. 다른 Z필터(블렌드/투과)와 달리 캔버스 크기
     자체가 바뀌는 "1회성 적용" 방식이라, 슬라이더로 폭을 먼저 정한 뒤 버튼을 눌러야 적용됨.
  ============================================================ */
  var EDGE_EXTEND_PAD_DEFAULT = 30; // 슬라이더 기본값(px)
  var EDGE_EXTEND_BLUR = 14;  // 경계를 얼마나 부드럽게 흐릴지
  var EDGE_EXTEND_FEATHER = 22; // 원본 안쪽에서부터 얼마나 파고들어와 페이드시킬지

  // 이미지의 원본 엘리먼트를 (아직 편집용 캔버스가 아니면) 캔버스로 한 번 바꿔서 반환.
  // imgtool.js의 getEditableCanvasForImage와 같은 역할이지만, 파일 로딩 순서와 무관하게
  // 동작하도록 이 파일 안에 독립적으로 구현함.
  function getEditableCanvasForImageLocal(imgObj){
    var el = imgObj.getElement();
    if (el && el.tagName === 'CANVAS' && el.__isEditCanvas) return el;
    var w = imgObj.width, h = imgObj.height;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var cctx = c.getContext('2d');
    var cropX = imgObj.cropX || 0, cropY = imgObj.cropY || 0;
    cctx.drawImage(el, cropX, cropY, w, h, 0, 0, w, h);
    c.__isEditCanvas = true;
    imgObj._element = c;
    imgObj._originalElement = c;
    imgObj.cropX = 0; imgObj.cropY = 0;
    imgObj.perPixelTargetFind = false;
    return c;
  }

  // 가장자리 1px 띠/모서리 1px을 늘려 붙여서 "가장자리 색 그대로 확장"을 만듦.
  // padX(좌우)와 padY(상하)를 따로 받아서, 한쪽이 0이면 그쪽 방향은 확장하지 않음
  // (가로만/세로만 확장 지원 — 전체확장은 padX===padY인 경우).
  function buildEdgeExtendedCanvas(srcCanvas, w, h, padX, padY){
    var out = document.createElement('canvas');
    out.width = w + padX * 2;
    out.height = h + padY * 2;
    var ctx = out.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0, w, h, padX, padY, w, h); // 중앙: 원본 그대로
    if (padY > 0) {
      ctx.drawImage(srcCanvas, 0, 0, w, 1, padX, 0, w, padY); // 위
      ctx.drawImage(srcCanvas, 0, h - 1, w, 1, padX, padY + h, w, padY); // 아래
    }
    if (padX > 0) {
      ctx.drawImage(srcCanvas, 0, 0, 1, h, 0, padY, padX, h); // 왼쪽
      ctx.drawImage(srcCanvas, w - 1, 0, 1, h, padX + w, padY, padX, h); // 오른쪽
    }
    if (padX > 0 && padY > 0) {
      ctx.drawImage(srcCanvas, 0, 0, 1, 1, 0, 0, padX, padY); // 좌상단 모서리
      ctx.drawImage(srcCanvas, w - 1, 0, 1, 1, padX + w, 0, padX, padY); // 우상단 모서리
      ctx.drawImage(srcCanvas, 0, h - 1, 1, 1, 0, padY + h, padX, padY); // 좌하단 모서리
      ctx.drawImage(srcCanvas, w - 1, h - 1, 1, 1, padX + w, padY + h, padX, padY); // 우하단 모서리
    }
    return out;
  }

  function blurCanvasCopy(srcCanvas, radiusPx){
    var out = document.createElement('canvas');
    out.width = srcCanvas.width; out.height = srcCanvas.height;
    var ctx = out.getContext('2d');
    ctx.filter = 'blur(' + radiusPx + 'px)';
    ctx.drawImage(srcCanvas, 0, 0);
    return out;
  }

  // 원본 크기(w,h)만큼의 "페더 마스크"(가장자리로 갈수록 투명해지는 흰 사각형)를 만듦.
  // 안쪽 feather px는 완전 불투명(흰색), 거기서 가장자리까지는 블러로 점점 투명해짐.
  function buildFeatherMask(w, h, feather, blurRadius){
    var sharp = document.createElement('canvas');
    sharp.width = w; sharp.height = h;
    var sctx = sharp.getContext('2d');
    sctx.fillStyle = '#fff';
    sctx.fillRect(feather, feather, Math.max(0, w - feather * 2), Math.max(0, h - feather * 2));
    return blurCanvasCopy(sharp, blurRadius);
  }

  function applyEdgeExtend(imgObj, pad, direction){
    var srcCanvas = getEditableCanvasForImageLocal(imgObj);
    var w = imgObj.width, h = imgObj.height;
    pad = pad || EDGE_EXTEND_PAD_DEFAULT;
    direction = direction || 'all'; // 'all' | 'horizontal'(좌우만) | 'vertical'(상하만)
    var padX = (direction === 'vertical') ? 0 : pad;
    var padY = (direction === 'horizontal') ? 0 : pad;

    // 1) 가장자리 색을 그대로 밖으로 늘린 "각진" 확장본 — 블러 시 캔버스 "밖"(투명)을
    //    샘플링해서 진짜 바깥쪽 끝 알파가 옅어지는 걸 막기 위해, 필요한 크기보다 블러 반경만큼
    //    더 여유 있게 확장해뒀다가, 블러 후 가운데(필요한 크기)만 잘라서 씀
    //    (가로/세로 한쪽만 확장할 때도, 확장 안 하는 쪽 끝에서 알파가 옅어지는 걸 막기 위해
    //    두 방향 모두에 여유를 둠)
    var margin = EDGE_EXTEND_BLUR * 3; // 블러 커널이 캔버스 밖(투명)에 닿지 않도록 넉넉히 여유를 둠
    var extendedSharpBig = buildEdgeExtendedCanvas(srcCanvas, w, h, padX + margin, padY + margin);
    var extendedBlurredBig = blurCanvasCopy(extendedSharpBig, EDGE_EXTEND_BLUR);
    var extendedBlurred = document.createElement('canvas');
    extendedBlurred.width = w + padX * 2; extendedBlurred.height = h + padY * 2;
    extendedBlurred.getContext('2d').drawImage(
      extendedBlurredBig, margin, margin, w + padX * 2, h + padY * 2, 0, 0, w + padX * 2, h + padY * 2
    );

    // 3) 원본 영역만큼의 페더 마스크(안쪽은 선명하게 보이고, 원본 가장자리로 갈수록 투명해짐)
    var mask = buildFeatherMask(w, h, EDGE_EXTEND_FEATHER, EDGE_EXTEND_BLUR);
    // 4) 원본(선명한 사진)에 그 마스크를 곱해서, 가장자리로 갈수록 자연스럽게 옅어지는 조각을 만듦
    var sharpMasked = document.createElement('canvas');
    sharpMasked.width = w; sharpMasked.height = h;
    var smctx = sharpMasked.getContext('2d');
    smctx.drawImage(srcCanvas, 0, 0, w, h);
    smctx.globalCompositeOperation = 'destination-in';
    smctx.drawImage(mask, 0, 0);

    // 5) 최종 합성: 블러된 확장본을 베이스로 깔고, 그 위에 "가장자리가 옅어지는 선명한 원본"을 얹음
    //    → 원본은 안쪽에서 선명하게 보이다가 경계 부근에서 자연스럽게 블러된 배경과 섞임
    var final = document.createElement('canvas');
    final.width = w + padX * 2; final.height = h + padY * 2;
    var fctx = final.getContext('2d');
    fctx.drawImage(extendedBlurred, 0, 0);
    fctx.drawImage(sharpMasked, padX, padY);

    final.__isEditCanvas = true;
    imgObj._element = final;
    imgObj._originalElement = final;
    imgObj.width = w + padX * 2;
    imgObj.height = h + padY * 2;
    // 화면에 보이는 중심 위치는 그대로 두고, 커진 만큼 좌상단 좌표만 안쪽으로 당겨줌
    imgObj.left = (imgObj.left || 0) - padX * (imgObj.scaleX || 1);
    imgObj.top = (imgObj.top || 0) - padY * (imgObj.scaleY || 1);
    imgObj.dirty = true;
    imgObj.setCoords();
    if (imgObj.filters && imgObj.filters.length) imgObj.applyFilters(); // 걸려있던 다른 필터(밝기 등)를 새 크기에 다시 반영
    EP.canvas.requestRenderAll();
  }

  var qaZEdgeExtendAmount = document.getElementById('qaZEdgeExtendAmount');
  var qaZEdgeExtendAmountVal = document.getElementById('qaZEdgeExtendAmountVal');
  qaZEdgeExtendAmount.addEventListener('input', function(){
    qaZEdgeExtendAmountVal.textContent = qaZEdgeExtendAmount.value + 'px';
  });

  // 전체확장/가로확장/세로확장 — 셋 중 하나만 켜지는 배타적 토글(기본값: 전체확장)
  var edgeExtendDirBtns = [
    document.getElementById('qaZEdgeExtendDirAllBtn'),
    document.getElementById('qaZEdgeExtendDirHBtn'),
    document.getElementById('qaZEdgeExtendDirVBtn')
  ];
  edgeExtendDirBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      edgeExtendDirBtns.forEach(function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
    });
  });
  function getSelectedEdgeExtendDirection(){
    var active = edgeExtendDirBtns.filter(function(b){ return b.classList.contains('on'); })[0];
    return active ? active.getAttribute('data-dir') : 'all';
  }

  document.getElementById('qaZEdgeExtendApplyBtn').addEventListener('click', function(){
    var boxes = EP.qaZTargets.filter(isImageObject);
    if (!boxes.length) return;
    var pad = parseInt(qaZEdgeExtendAmount.value, 10) || EDGE_EXTEND_PAD_DEFAULT;
    var direction = getSelectedEdgeExtendDirection();
    var btn = document.getElementById('qaZEdgeExtendApplyBtn');
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '처리 중...';
    setTimeout(function(){
      boxes.forEach(function(t){ applyEdgeExtend(t, pad, direction); });
      if (EP.pushHistory) EP.pushHistory();
      btn.disabled = false;
      btn.textContent = originalLabel;
    }, 20);
  });

  /* ============================================================
     6. 글자 추출(OCR) — 이미지 안의 글자를 인식해서 복사하기 쉬운 메모장 모달로 꺼내줌.
     Tesseract.js(한글+영어 인식)를 씀. 결과 모달은 다른 팝업들과 달리 다른 곳을 클릭하거나
     다른 오브젝트를 선택해도 절대 자동으로 안 닫히고, ✕ 또는 "닫기" 버튼을 직접 눌러야만
     닫힘 — 복사/붙여넣기하는 동안 실수로 사라지지 않게 하기 위함(그래서 필터 팝업들과
     달리 EP.registerFilterPopover 같은 자동 정리 시스템에 등록하지 않음).
  ============================================================ */
  var textExtractModal = document.getElementById('textExtractModal');
  var textExtractResultArea = document.getElementById('textExtractResultArea');
  var qaZTextExtractKoreanBtn = document.getElementById('qaZTextExtractKoreanBtn');
  var qaZTextExtractEnglishBtn = document.getElementById('qaZTextExtractEnglishBtn');

  function positionTextExtractModal(){
    textExtractModal.classList.remove('hidden');
    var mw = textExtractModal.offsetWidth || 320;
    var mh = textExtractModal.offsetHeight || 300;
    var canvasRect = EP.canvas.upperCanvasEl.getBoundingClientRect();
    var left = canvasRect.left + canvasRect.width / 2 - mw / 2;
    var top = canvasRect.top + canvasRect.height / 2 - mh / 2;
    var r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, mw, mh, EP.canvasRotationDeg) : { left: left, top: top };
    textExtractModal.style.left = r.left + 'px';
    textExtractModal.style.top = r.top + 'px';
    if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(textExtractModal);
  }
  function hideTextExtractModal(){ textExtractModal.classList.add('hidden'); }

  // 마우스로 클릭+드래그해서 모달을 원하는 위치로 옮길 수 있게 함(다른 모달들과 동일)
  if (EP.makeDraggablePopover) EP.makeDraggablePopover(textExtractModal);
  if (EP.registerRotatablePopover) EP.registerRotatablePopover(textExtractModal);

  document.getElementById('textExtractModalCloseBtn').addEventListener('click', hideTextExtractModal);
  document.getElementById('textExtractModalCloseBtn2').addEventListener('click', hideTextExtractModal);

  document.getElementById('textExtractCopyBtn').addEventListener('click', function(){
    textExtractResultArea.select();
    try {
      navigator.clipboard.writeText(textExtractResultArea.value);
    } catch (e) {
      document.execCommand('copy'); // 클립보드 API를 못 쓰는 환경(구형 브라우저 등)을 위한 대체 수단
    }
  });

  // 추출한 글자를 한 줄당 텍스트 오브젝트 하나씩으로 캔버스에 붙여넣음 — 좌측 상단부터
  // 시작해서 한 줄 쓰고 그 다음 줄은 바로 아래에, 순서대로 차곡차곡 배치함. 글자 크기는
  // 요청대로 12pt 고정. 빈 줄(공백만 있는 줄)은 건너뜀.
  var PASTE_START_X = 20, PASTE_START_Y = 20, PASTE_FONT_SIZE = 12, PASTE_LINE_GAP = 6;
  document.getElementById('textExtractPasteToCanvasBtn').addEventListener('click', function(){
    var lines = textExtractResultArea.value.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
    if (!lines.length) { alert('붙여넣을 글자가 없습니다.'); return; }
    var canvas = EP.canvas;
    var y = PASTE_START_Y;
    var created = [];
    lines.forEach(function(line){
      var t = new fabric.IText(line, {
        left: PASTE_START_X, top: y, originX: 'left', originY: 'top',
        fontFamily: 'Pretendard', fontSize: PASTE_FONT_SIZE, fill: '#000000'
      });
      canvas.add(t);
      created.push(t);
      y += PASTE_FONT_SIZE * 1.2 + PASTE_LINE_GAP; // 다음 줄은 이 줄 바로 아래로
    });
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    canvas.discardActiveObject();
    canvas.setActiveObject(created[created.length - 1]); // 마지막 줄을 선택한 채로 남겨서 결과 위치를 바로 확인할 수 있게 함
    canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();
    // 붙여넣은 뒤에도 모달은 계속 열어둠(닫기 버튼을 직접 눌러야만 닫힘) — 결과를 계속
    // 보면서 필요하면 다시 붙여넣거나 복사할 수 있도록
  });

  /* ============================================================
     마키(드래그 영역선택) 방식 글자 추출 — 한글 추출 / 영어 추출 두 모드
     - "한글 추출": 한글 + 숫자 + 문장부호(; , . ! ?)만 남김, Tesseract 언어팩은 'kor'
     - "영어 추출": 영어 + 숫자 + 문장부호(; , . ! ?)만 남김, Tesseract 언어팩은 'eng'
     — 버튼을 누르면 마키 도구가 켜지고, 이미지 위를 드래그해서 글자가 있는 영역만 고름
     — 그 영역을 화면에는 안 보이게 뒤에서(오프스크린 캔버스에서) 처리함: 5배 확대 → 선명도
       (샤픈) 대폭 강화 → 그레이스케일+임계값 이진화 순으로 거쳐서 "글자는 또렷한 검정,
       배경은 흰색"으로 만듦(컬러 사진도 밝기 기준으로 자동 판단해서 필요시 반전까지 처리).
       이 과정을 캔버스에 실제로 그려서 보여주진 않음 — 이미지가 순식간에 커졌다 반전됐다
       하는 게 보이면 오히려 혼란스러우므로, 처리 자체는 화면 밖에서 조용히 진행됨
     — 그 결과로 OCR을 돌리고, 결과는 메모장 모달에 채움(캔버스에 자동으로 붙여넣진 않음 —
       모달의 "📌 캔버스에 붙여넣기" 버튼을 직접 눌러야 캔버스에 올라감)
  ============================================================ */
  var isTextExtractMarqueeMode = false;
  var textExtractMode = 'korean'; // 'korean' | 'english' — 지금 누른 버튼에 따라 정해짐
  var textExtractTargetImage = null;
  var textExtractMarqueeStartPt = null;
  var textExtractMarqueeDragging = false;
  var textExtractMarqueeRectObj = null;

  function activeExtractBtn(){ return textExtractMode === 'english' ? qaZTextExtractEnglishBtn : qaZTextExtractKoreanBtn; }

  function clearTextExtractMarqueeVisual(){
    if (textExtractMarqueeRectObj) { EP.canvas.remove(textExtractMarqueeRectObj); textExtractMarqueeRectObj = null; }
    textExtractMarqueeDragging = false;
  }

  function setTextExtractMarqueeMode(on){
    isTextExtractMarqueeMode = on;
    qaZTextExtractKoreanBtn.classList.toggle('on', on && textExtractMode === 'korean');
    qaZTextExtractEnglishBtn.classList.toggle('on', on && textExtractMode === 'english');
    if (on) {
      var obj = EP.qaZTargets.filter(isImageObject)[0];
      if (!obj) {
        isTextExtractMarqueeMode = false;
        qaZTextExtractKoreanBtn.classList.remove('on');
        qaZTextExtractEnglishBtn.classList.remove('on');
        return;
      }
      if (EP.exitImageToolModes) EP.exitImageToolModes(); // 다른 이미지 도구(자동누끼·영역지우기 등)와 충돌 방지
      if (EP.exitEyedropperModes) EP.exitEyedropperModes();
      textExtractTargetImage = obj;
      obj.__prevSelectable = obj.selectable;
      obj.__prevHasControls = obj.hasControls;
      obj.set({ selectable: false, hasControls: false });
      EP.canvas.selection = false;
      EP.canvas.skipTargetFind = true;
      EP.canvas.defaultCursor = 'crosshair';
      EP.canvas.hoverCursor = 'crosshair';
      EP.canvas.requestRenderAll();
    } else {
      clearTextExtractMarqueeVisual();
      EP.canvas.selection = true;
      EP.canvas.skipTargetFind = false;
      EP.canvas.defaultCursor = 'default';
      EP.canvas.hoverCursor = 'move';
      if (textExtractTargetImage) {
        textExtractTargetImage.set({
          selectable: textExtractTargetImage.__prevSelectable !== false,
          hasControls: textExtractTargetImage.__prevHasControls !== false
        });
      }
      textExtractTargetImage = null;
      EP.canvas.requestRenderAll();
    }
  }

  EP.canvas.on('mouse:down', function(opt){
    if (!isTextExtractMarqueeMode || !textExtractTargetImage) return;
    clearTextExtractMarqueeVisual();
    textExtractMarqueeStartPt = EP.canvas.getPointer(opt.e);
    textExtractMarqueeDragging = true;
    textExtractMarqueeRectObj = new fabric.Rect({
      left: textExtractMarqueeStartPt.x, top: textExtractMarqueeStartPt.y, width: 1, height: 1,
      fill: 'rgba(52,152,219,0.15)', stroke: '#3498db', strokeWidth: 1, strokeDashArray: [5, 4],
      selectable: false, evented: false
    });
    textExtractMarqueeRectObj.isGuide = true;
    EP.canvas.add(textExtractMarqueeRectObj);
    EP.canvas.bringToFront(textExtractMarqueeRectObj);
  });
  EP.canvas.on('mouse:move', function(opt){
    if (!isTextExtractMarqueeMode || !textExtractMarqueeDragging || !textExtractMarqueeRectObj) return;
    var p = EP.canvas.getPointer(opt.e);
    var left = Math.min(textExtractMarqueeStartPt.x, p.x), top = Math.min(textExtractMarqueeStartPt.y, p.y);
    var w = Math.abs(p.x - textExtractMarqueeStartPt.x), h = Math.abs(p.y - textExtractMarqueeStartPt.y);
    textExtractMarqueeRectObj.set({ left: left, top: top, width: w, height: h });
    EP.canvas.requestRenderAll();
  });

  // 선명도(샤픈)를 대폭 강화함 — 글자 테두리를 또렷하게 만들어서 그 다음 단계인 이진화·OCR
  // 인식률을 높임. 3x3 언샤프 마스크 컨볼루션(중앙을 크게 강조하고 상하좌우를 깎아냄)을 씀.
  function sharpenCanvas(canvasEl, strength){
    var ctx = canvasEl.getContext('2d');
    var w = canvasEl.width, h = canvasEl.height;
    if (!w || !h) return;
    var src = ctx.getImageData(0, 0, w, h);
    var srcData = src.data;
    var out = ctx.createImageData(w, h);
    var outData = out.data;
    var center = 1 + 4 * strength;
    var edge = -strength;
    function getPx(x, y, c){
      if (x < 0) x = 0; else if (x >= w) x = w - 1;
      if (y < 0) y = 0; else if (y >= h) y = h - 1;
      return srcData[(y * w + x) * 4 + c];
    }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        for (var c = 0; c < 3; c++) {
          var v = center * getPx(x, y, c) + edge * getPx(x - 1, y, c) + edge * getPx(x + 1, y, c) + edge * getPx(x, y - 1, c) + edge * getPx(x, y + 1, c);
          outData[idx + c] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
        outData[idx + 3] = srcData[idx + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // 그레이스케일 + 자동 임계값 이진화 — 배경이 밝든 어둡든, 컬러사진이든 상관없이
  // 항상 "글자=검정, 배경=흰색"으로 또렷하게 맞춰서 OCR 인식률을 높임
  // (적응형/로컬 임계값 방식도 시도해봤지만 속도가 너무 느려져서, 빠른 전역 평균 방식으로 유지)
  function binarizeForOcr(canvasEl){
    var ctx = canvasEl.getContext('2d');
    var w = canvasEl.width, h = canvasEl.height;
    if (!w || !h) return;
    var imgData = ctx.getImageData(0, 0, w, h);
    var d = imgData.data;
    var n = w * h;
    var gray = new Float32Array(n);
    var sum = 0;
    for (var i = 0; i < n; i++) {
      var l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      gray[i] = l;
      sum += l;
    }
    var mean = sum / n;
    // 테두리(가장자리) 픽셀의 평균 밝기로 "배경이 밝은지 어두운지" 판단(글자는 보통 이미지
    // 안쪽보다 가장자리에 적으므로, 가장자리 평균이 배경색에 가까움)
    var borderSum = 0, borderCount = 0;
    for (var x = 0; x < w; x++) { borderSum += gray[x] + gray[(h - 1) * w + x]; borderCount += 2; }
    for (var y = 0; y < h; y++) { borderSum += gray[y * w] + gray[y * w + (w - 1)]; borderCount += 2; }
    var borderMean = borderCount ? borderSum / borderCount : mean;
    var lightBackground = borderMean >= mean;
    var threshold = mean;
    for (var j = 0; j < n; j++) {
      var isDarkerThanThreshold = gray[j] < threshold;
      var isText = lightBackground ? isDarkerThanThreshold : !isDarkerThanThreshold;
      var v = isText ? 0 : 255;
      var idx = j * 4;
      d[idx] = v; d[idx + 1] = v; d[idx + 2] = v; d[idx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  EP.canvas.on('mouse:up', function(){
    if (!isTextExtractMarqueeMode || !textExtractMarqueeDragging) return;
    textExtractMarqueeDragging = false;
    if (!textExtractMarqueeRectObj || textExtractMarqueeRectObj.width < 6 || textExtractMarqueeRectObj.height < 6) {
      clearTextExtractMarqueeVisual();
      setTextExtractMarqueeMode(false);
      return;
    }
    var targetImg = textExtractTargetImage;
    var srcCanvas = getEditableCanvasForImageLocal(targetImg); // 지금 화면에 보이는(필터 적용된) 픽셀 기준

    // 드래그한 화면 사각형의 네 모서리를 이미지 원본 픽셀 좌표로 변환해서 축 정렬 영역을 구함
    var corners = [
      { x: textExtractMarqueeRectObj.left, y: textExtractMarqueeRectObj.top },
      { x: textExtractMarqueeRectObj.left + textExtractMarqueeRectObj.width, y: textExtractMarqueeRectObj.top },
      { x: textExtractMarqueeRectObj.left, y: textExtractMarqueeRectObj.top + textExtractMarqueeRectObj.height },
      { x: textExtractMarqueeRectObj.left + textExtractMarqueeRectObj.width, y: textExtractMarqueeRectObj.top + textExtractMarqueeRectObj.height }
    ].map(function(pt){ return EP.screenPointToImagePixel(targetImg, pt); });
    var xs = corners.map(function(c){ return c.x; });
    var ys = corners.map(function(c){ return c.y; });
    var rx = Math.max(0, Math.floor(Math.min.apply(null, xs)));
    var ry = Math.max(0, Math.floor(Math.min.apply(null, ys)));
    var rw = Math.min(srcCanvas.width - rx, Math.ceil(Math.max.apply(null, xs) - Math.min.apply(null, xs)));
    var rh = Math.min(srcCanvas.height - ry, Math.ceil(Math.max.apply(null, ys) - Math.min.apply(null, ys)));
    clearTextExtractMarqueeVisual();

    if (rw < 4 || rh < 4 || typeof Tesseract === 'undefined') {
      if (typeof Tesseract === 'undefined') alert('글자 인식 라이브러리를 아직 불러오지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.');
      setTextExtractMarqueeMode(false);
      return;
    }

    // 고른 영역을 잘라서 5배로 확대 → 선명도(샤픈) 대폭 강화 → 이진화(글자=검정, 배경=흰색)
    // 순으로 처리함. 전부 화면에 보이지 않는 오프스크린 캔버스에서만 이뤄지고, 실제
    // 캔버스에는 아무것도 추가/표시되지 않음.
    var UPSCALE = 5;
    var cropCanvas = document.createElement('canvas');
    cropCanvas.width = rw * UPSCALE; cropCanvas.height = rh * UPSCALE;
    var cctx = cropCanvas.getContext('2d');
    cctx.drawImage(srcCanvas, rx, ry, rw, rh, 0, 0, rw * UPSCALE, rh * UPSCALE);
    sharpenCanvas(cropCanvas, 1.6); // 대폭 강화(수치가 클수록 더 또렷해짐)
    binarizeForOcr(cropCanvas);

    var extractBtn = activeExtractBtn();
    var originalLabel = extractBtn.textContent;
    extractBtn.textContent = '인식 중...';

    // 인식된 글자 중 "의미 있는 글자"(한글·영어·숫자)와 "그 밖의 잡음(기호 등)"의 비율을 봐서
    // 결과가 믿을만한지 가늠함 — 흑백 반전(밝기 기준 배경/글자 판단)이 잘못됐을 때 글자가
    // 깨져서 알아볼 수 없는 기호 위주로 인식되는 경우가 많기 때문.
    // + 이것만으로는 부족한 경우가 있음: 진짜 글자(한글·영어)인데도 뒤죽박죽 엉뚱한 조합으로
    // 나오는 경우(예: "oy 이 아이 B Le pen pee CELT Ae ER BREE" 식으로 1~2글자짜리 의미 없는
    // 조각 단어가 잔뜩 흩어져 나옴)엔 문자 종류만으론 못 걸러내므로, 띄어쓰기로 나눈 "단어"
    // 단위로 평균 길이·짧은 단어 비율까지 같이 봄 — 진짜 문장/단어는 이 정도로 짧게 쪼개져
    // 나오지 않는다는 점을 이용함. 단, 한글 단어는 1~2글자짜리(예: "네", "잘", "제품")가 원래도
    // 흔하고 정상이므로, 이 "짧은 단어" 판단은 한글이 섞이지 않은(순수 영어·숫자) 단어만
    // 대상으로 함 — 그래야 한글+영어가 잘 섞인 정상적인 결과를 억울하게 걸러내지 않음
    function assessTextQuality(text){
      var meaningful = 0, junk = 0;
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        var code = text.charCodeAt(i);
        var isKorean = (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F);
        var isEnglish = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
        var isDigit = code >= 48 && code <= 57;
        if (isKorean || isEnglish || isDigit) meaningful++;
        else if (!/\s/.test(ch)) junk++;
      }
      var tokens = text.split(/\s+/).filter(function(t){
        return t.length > 0 && /[A-Za-z0-9\uAC00-\uD7A3]/.test(t); // 문장부호만 있는 조각은 단어로 안 침
      });
      // 한글이 하나라도 섞인 단어는 "짧은 단어" 판단에서 제외(한글 단어는 원래 짧은 게 정상)
      var nonKoreanTokens = tokens.filter(function(t){ return !/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(t); });
      var avgTokenLen = nonKoreanTokens.length ? nonKoreanTokens.reduce(function(s, t){ return s + t.length; }, 0) / nonKoreanTokens.length : null;
      var shortTokenCount = nonKoreanTokens.filter(function(t){ return t.length <= 2; }).length;
      var shortTokenRatio = nonKoreanTokens.length ? shortTokenCount / nonKoreanTokens.length : null;
      return { meaningful: meaningful, junk: junk, tokenCount: tokens.length, nonKoreanTokenCount: nonKoreanTokens.length, avgTokenLen: avgTokenLen, shortTokenRatio: shortTokenRatio };
    }
    // 순수 영어·숫자 단어가 어느 정도 있는데(우연히 짧은 걸 하나 뽑은 경우까지 걸리지 않도록
    // 4개 이상일 때만 적용) 그중 절반 넘게 1~2글자짜리 조각이거나 평균 길이가 너무 짧으면 —
    // 뒤죽박죽 엉뚱하게 인식된 것으로 봄. 한글 단어는 이 판단에서 아예 빠져있으므로(원래 짧은
    // 게 정상이라) 한글+영어가 잘 섞인 결과는 억울하게 걸리지 않음
    function looksLikeGarbledWords(q){
      return q.nonKoreanTokenCount >= 4 && (q.shortTokenRatio > 0.55 || q.avgTokenLen < 2.2);
    }
    // OCR이 자주 헷갈리는 "생김새 비슷한" 문자(0↔O, 1↔l↔I, 5↔S, 8↔B)를 가볍게 보정함.
    // 사전이나 외부 API 없이, 한 "단어" 안에서 숫자와 영어가 섞여 있으면(이게 바로 헷갈린
    // 흔적) 그 단어 안에서 어느 쪽이 다수인지 보고 소수파를 다수파 쪽 문자로 맞춰줌.
    // 한글이 섞인 단어나 이미 한쪽으로만 된(숫자만/영어만) 단어는 애매할 게 없으니 안 건드림.
    function normalizeCommonOcrConfusions(text){
      var DIGIT_TO_LETTER = { '0': 'O', '1': 'l', '5': 'S', '8': 'B' }; // 다수가 영어일 때 숫자를 영어로
      var LETTER_TO_DIGIT = { 'O': '0', 'o': '0', 'I': '1', 'l': '1', 'S': '5', 's': '5', 'B': '8' }; // 다수가 숫자일 때 영어를 숫자로
      function isDigit(ch){ return ch >= '0' && ch <= '9'; }
      function isLetter(ch){ var c = ch.charCodeAt(0); return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
      return text.split('\n').map(function(line){
        return line.split(' ').map(function(token){
          if (!token) return token;
          var digitCount = 0, letterCount = 0, otherCount = 0;
          for (var i = 0; i < token.length; i++) {
            if (isDigit(token[i])) digitCount++;
            else if (isLetter(token[i])) letterCount++;
            else otherCount++;
          }
          // 한글 등 다른 문자가 섞여있거나, 애초에 숫자·영어 중 한쪽만 있으면 헷갈릴 게 없으므로 그대로 둠
          if (otherCount > 0 || digitCount === 0 || letterCount === 0) return token;
          if (digitCount > letterCount) {
            return token.split('').map(function(ch){ return LETTER_TO_DIGIT[ch] || ch; }).join('');
          }
          if (letterCount > digitCount) {
            return token.split('').map(function(ch){ return DIGIT_TO_LETTER[ch] || ch; }).join('');
          }
          return token; // 정확히 반반이면 어느 쪽이 맞는지 판단하기 애매하므로 안 건드림
        }).join(' ');
      }).join('\n');
    }
    // 이진화된 흑백 캔버스의 색을 통째로 뒤집음(검정↔흰색) — 처음 판단이 틀려서 글자/배경이
    // 뒤바뀐 채로 인식됐을 가능성에 대비한 재시도용
    function invertBinaryCanvas(canvasEl){
      var ctx = canvasEl.getContext('2d');
      var w = canvasEl.width, h = canvasEl.height;
      var imgData = ctx.getImageData(0, 0, w, h);
      var d = imgData.data;
      for (var i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // 기본 PSM(자동 페이지 레이아웃 분석)은 신문/문서 전체 스캔본처럼 복잡한 레이아웃을
    // 상정한 모드라, 마키로 잘라낸 작은 스니펫(글자 몇 줄짜리)엔 오히려 안 맞는 경우가 많음.
    // "균일한 텍스트 블록" 모드(PSM 6)로 지정해서 크롭된 조각에 더 적합하게 인식하게 함.
    var OCR_OPTIONS = { tessedit_pageseg_mode: '6' };
    var ocrLang = textExtractMode === 'english' ? 'eng' : 'kor';
    Tesseract.recognize(cropCanvas, ocrLang, OCR_OPTIONS)
      .then(function(result){
        var text = (result && result.data && result.data.text) ? result.data.text.trim() : '';
        var quality = assessTextQuality(text);
        // 잡음(알아볼 수 없는 기호 등)이 의미 있는 글자보다 많거나, 글자 종류는 맞아도
        // 뒤죽박죽 조각 단어 패턴이면 -> 처음 판단(배경/글자 밝기)이 잘못됐을 가능성이
        // 크다고 보고, 이미지를 통째로 반전해서 한 번 더 시도함
        if (quality.junk > quality.meaningful || looksLikeGarbledWords(quality)) {
          invertBinaryCanvas(cropCanvas);
          return Tesseract.recognize(cropCanvas, ocrLang, OCR_OPTIONS).then(function(result2){
            var text2 = (result2 && result2.data && result2.data.text) ? result2.data.text.trim() : '';
            var quality2 = assessTextQuality(text2);
            // 반전해서 다시 뽑은 결과가 더 낫고(의미 있는 글자가 많고) 뒤죽박죽 패턴도
            // 아니면 그걸 쓰고, 그래도 별로면 그나마 나았던 처음 결과를 씀
            var secondIsBetter = quality2.meaningful >= quality.meaningful && !looksLikeGarbledWords(quality2);
            return secondIsBetter ? text2 : text;
          });
        }
        return text;
      })
      .then(function(rawText){
        var text = rawText.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; }).join('\n');
        // (※ 0/O, 1/l/I 등 오인식 보정 기능은 "Hello123" 같은 정상적인 영숫자 혼합 단어를
        // 오히려 잘못 바꿔버리는 부작용이 발견되어 비활성화함)
        // 모드에 따라 남길 글자를 정함 — 한글 모드: 한글+숫자+문장부호, 영어 모드: 영어+숫자+문장부호.
        // 문장부호는 세미콜론·쉼표·마침표·느낌표·물음표만 허용(줄 구조를 위한 공백은 남겨둠).
        var ALLOWED_PUNCT = ';,.!?';
        function filterByMode(raw, mode){
          var lines = raw.split('\n').map(function(line){
            var out = '';
            for (var i = 0; i < line.length; i++) {
              var ch = line[i];
              var code = line.charCodeAt(i);
              var isKorean = (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F);
              var isEnglish = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
              var isDigit = code >= 48 && code <= 57;
              var isAllowedPunct = ALLOWED_PUNCT.indexOf(ch) !== -1;
              var keep = mode === 'english' ? isEnglish : isKorean;
              if (keep || isDigit || isAllowedPunct || ch === ' ' || ch === '\t') out += ch;
            }
            return out.replace(/[ \t]+/g, ' ').trim();
          });
          return lines.filter(function(l){ return l.length > 0; }).join('\n');
        }
        text = filterByMode(text, textExtractMode);
        // 반전까지 시도해봤는데도 여전히 잡음이 많거나, 글자 종류는 맞아도 뒤죽박죽 조각
        // 단어 패턴이거나, 아예 아무것도 못 뽑았으면 — 이상한 글자들을 그대로 보여주는 대신
        // 안내 문구로 대체함 — 화질이 안 좋은 사진에서 엉뚱한 결과가 나오는 걸 막기 위함
        var finalQuality = assessTextQuality(text);
        if (!text || finalQuality.meaningful === 0 || finalQuality.junk > finalQuality.meaningful || looksLikeGarbledWords(finalQuality)) {
          text = '';
        }
        // 이 모달이 이미 열려있는 상태(= 이전에 뽑은 글자를 정리하던 중)에서 마키로 또
        // 추출했다면, 창을 새로 띄우거나 내용을 통째로 갈아치우지 않고 지금 커서가 있는
        // 자리에 새로 뽑은 글자를 그대로 끼워넣음 — 정리 중이던 글자들 사이에 쏙 들어가게.
        // 반대로 모달이 닫혀있다가 새로 여는 경우엔 기존처럼 내용을 새로 채움.
        var modalWasAlreadyOpen = !textExtractModal.classList.contains('hidden');
        if (modalWasAlreadyOpen) {
          if (text) {
            var ta = textExtractResultArea;
            var start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
            var end = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
            ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
            var newPos = start + text.length;
            ta.focus();
            ta.setSelectionRange(newPos, newPos);
          } else {
            // 정리 중이던 내용은 그대로 두고, 이번 영역만 인식이 안 됐다고 알려줌
            alert('이 영역에서는 글자를 알아보기 어려워요.\n밝은 배경, 해상도 선명한 파일, 정위치 글자만 추출 가능합니다.');
          }
        } else {
          // 추출 결과는 메모장 모달에만 채워둠 — 캔버스에 자동으로 붙여넣진 않고, 모달의
          // "📌 캔버스에 붙여넣기" 버튼을 직접 눌러야만 캔버스에 올라감.
          textExtractResultArea.value = text || '⚠ 글자를 알아보기 어려워요.\n밝은 배경, 해상도 선명한 파일, 정위치 글자만 추출 가능합니다.';
          positionTextExtractModal();
        }
      })
      .catch(function(err){
        console.error('글자 추출(OCR) 오류:', err);
        alert('글자를 추출하는 중 문제가 생겼어요. 다시 시도해주세요.');
      })
      .finally(function(){
        extractBtn.textContent = originalLabel;
        setTextExtractMarqueeMode(false);
      });
  });

  function startTextExtract(mode){
    if (isTextExtractMarqueeMode) { setTextExtractMarqueeMode(false); return; } // 다시 누르면 취소
    var boxes = EP.qaZTargets.filter(isImageObject);
    if (!boxes.length) { alert('먼저 글자를 뽑아낼 이미지를 선택해주세요.'); return; }
    if (typeof Tesseract === 'undefined') {
      alert('글자 인식 라이브러리를 아직 불러오지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.');
      return;
    }
    textExtractMode = mode;
    setTextExtractMarqueeMode(true);
  }
  qaZTextExtractKoreanBtn.addEventListener('click', function(){ startTextExtract('korean'); });
  qaZTextExtractEnglishBtn.addEventListener('click', function(){ startTextExtract('english'); });

  EP.openQaZPopover = openQaZPopover;
  EP.hideQaZPopover = hideQaZPopover;
  EP.setActiveZFilterMenu = setActiveZFilterMenu;
  EP.qaZDetails = qaZDetails;
  EP.qaZFilterSelect = qaZFilterSelect;
})();
