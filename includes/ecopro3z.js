/* ecopro3z.js — "Z" 버튼 + 이미지 전용 블렌드(합성) 필터 패널
   로딩 순서: ecopro3.js -> ecopro3table.js -> ecopro3c.js -> ecopro3m.js -> ecopro3j.js -> ecopro3z.js -> ecopro3text.js -> ...
   (fabric.Image.filters.BlendColor를 확장해서 쓰므로 fabric.js가 이미 로드된 뒤,
    그리고 EP.isImageObject / EP.initCmykPicker / EP.pushHistory 등이 준비된 뒤에 로드돼야 함)

   J버튼과 인터페이스 구조(닫기버튼 + 드롭다운으로 필터 선택 → 상세조절 → 끄기버튼,
   드래그·회전 가능한 팝업)는 완전히 동일하지만, 안에 들어가는 필터는 전혀 다름:
   포토샵에 있는 곱하기(Multiply)/색상번(Color Burn)/선형번(Linear Burn)/스크린(Screen)
   블렌드(합성) 모드 4종 + 흰색 투과(사진의 흰색/밝은 색만 투명해져 뒤 레이어가 비쳐 보임) 1종 +
   지정색 투과(직접 고른 색을 최대 10개까지 동시에 투명하게) 1종, 총 6종. 이미지 오브젝트에만
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
     1. Z 버튼 컨트롤 — J(offsetX:-46)보다 한 칸 더 왼쪽(-78)에, 이미지에만 부착.
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
    offsetX: -78, offsetY: -36, // J(-46) 바로 왼쪽
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
    customColorTransparent: document.getElementById('qaZDetailCustomColorTransparent')
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

  EP.openQaZPopover = openQaZPopover;
  EP.hideQaZPopover = hideQaZPopover;
  EP.setActiveZFilterMenu = setActiveZFilterMenu;
  EP.qaZDetails = qaZDetails;
  EP.qaZFilterSelect = qaZFilterSelect;
})();
