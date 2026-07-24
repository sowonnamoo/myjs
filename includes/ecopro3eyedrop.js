/* ecopro3eyedrop.js — 스포이드(오브젝트 색상 복사)
   로딩 순서: ecopro3.js -> ... -> ecopro3imgtool.js -> ecopro3eyedrop.js -> ecopro3text.js -> ...

   동작:
   1) 색을 바꾸고 싶은 오브젝트를 먼저 선택함
   2) 스포이드 버튼을 누름(그 오브젝트를 "대상"으로 기억해두고 무장됨 — 테두리 파란 링)
   3) 색을 따올 다른 오브젝트를 클릭 → 그 오브젝트의 색을 그대로 "대상" 오브젝트에 적용하고,
      대상 오브젝트를 다시 선택한 채로 스포이드는 자동으로 꺼짐
   클릭한 대상이 단색 채우기가 아니면(그라디언트/패턴/이미지 등) 그 지점에 실제로 렌더링된 픽셀
   색을 대신 추출해서 적용함.
   4) 스포이드 버튼 옆의 작은 세모 컬러박스 — 무장(active) 상태에서 캔버스 위를 움직이는 동안
      커서가 가리키는 색을 실시간으로 미리 보여줌(아직 적용은 안 됨). 클릭해서 실제로 "찍는"
      순간에만 대상 오브젝트에 색이 적용되는 기존 동작은 그대로 유지됨.
   5) 범용 미니 스포이드(EP.armMiniEyedropper) — 우측 패널의 "번짐 색상"·"덮을 색상" 같은
      개별 색상 박스 옆에 달린 작은 스포이드 버튼용. 오브젝트의 fill이 아니라 그 색상 입력값
      자체를 캔버스에서 뽑은 색으로 바꿔줌(색을 뽑는 방식은 메인 스포이드와 동일). */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var btn = document.getElementById('eyedropperPickBtn');
  var pickMode = false;
  var targetObj = null; // 스포이드를 누른 순간 선택돼 있던, 색을 바꿀 오브젝트

  function isGuideObj(o){ return !!o && o.isGuide; }

  // 스포이드 모양 커서 — 핫스팟은 팁 끝에 맞춤
  var DROPPER_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
    "<path d='M17 3 L21 7 L11 17 L7 17 L7 13 Z' fill='black' stroke='white' stroke-width='1' stroke-linejoin='round'/>" +
    "<circle cx='6' cy='18' r='2.2' fill='black' stroke='white' stroke-width='0.6'/>" +
    "</svg>";
  var DROPPER_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(DROPPER_CURSOR_SVG) + '") 6 18, crosshair';

  var previewSwatch = document.getElementById('eyedropPreviewSwatch');
  var DEFAULT_SWATCH_COLOR = '#d8dde3';

  function setPickMode(on){
    pickMode = on;
    btn.classList.toggle('active', on);
    if (on) {
      if (EP.exitImageToolModes) EP.exitImageToolModes();
      // 색을 따올 "다른 오브젝트를 클릭"해서 골라야 하니 선택 기능은 그대로 살려둠
      EP.canvas.selection = true;
      EP.canvas.skipTargetFind = false;
      EP.canvas.defaultCursor = DROPPER_CURSOR;
      EP.canvas.hoverCursor = DROPPER_CURSOR;
    } else {
      targetObj = null;
      EP.canvas.defaultCursor = 'default';
      EP.canvas.hoverCursor = 'move';
      previewSwatch.style.borderBottomColor = DEFAULT_SWATCH_COLOR; // 무장 해제되면 미리보기도 기본색으로 초기화
    }
    EP.canvas.requestRenderAll();
  }

  btn.addEventListener('click', function(){
    if (pickMode) { setPickMode(false); return; } // 무장 중에 다시 누르면 취소
    var active = EP.canvas.getActiveObject();
    if (!active || isGuideObj(active)) {
      alert('먼저 색을 바꾸고 싶은 오브젝트를 선택한 뒤 스포이드를 눌러주세요.');
      return;
    }
    targetObj = active;
    setPickMode(true);
  });

  // 화면에 실제로 그려진 픽셀을 읽어서 색을 추출(그라디언트/패턴 등 단색이 아닌 경우의 대비용)
  function pickColorAtEvent(e){
    var canvasEl = EP.canvas.lowerCanvasEl;
    var rect = canvasEl.getBoundingClientRect();
    var scaleX = canvasEl.width / rect.width;
    var scaleY = canvasEl.height / rect.height;
    var px = Math.floor((e.clientX - rect.left) * scaleX);
    var py = Math.floor((e.clientY - rect.top) * scaleY);
    if (px < 0 || py < 0 || px >= canvasEl.width || py >= canvasEl.height) return null;
    var ctx = canvasEl.getContext('2d');
    var d;
    try {
      d = ctx.getImageData(px, py, 1, 1).data; // 외부 URL 이미지 등으로 캔버스가 오염(CORS)된 경우 여기서 예외가 날 수 있음
    } catch (err) {
      console.error('eyedropper pickColorAtEvent error:', err);
      return null;
    }
    function h(n){ return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
    return '#' + h(d[0]) + h(d[1]) + h(d[2]);
  }

  // 미리보기(mousemove)와 실제 적용(mousedown) 양쪽에서 똑같은 기준으로 색을 뽑도록 공용화함
  // — 이렇게 해야 "미리보기에서 본 색"과 "실제로 찍었을 때 적용되는 색"이 항상 일치함.
  function sampleColorAt(source, e){
    // 이미지는 실제로 채우기(fill) 색이 없는데도 fabric 기본값(rgb(0,0,0))이 항상 문자열로 남아있어서
    // source.fill 지름길을 타면 클릭 위치와 상관없이 항상 같은 색만 나옴 -> 이미지는 무조건 실제 픽셀색을 읽음
    var isImageSource = source && source.type === 'image';
    if (source && !isGuideObj(source) && !isImageSource && typeof source.fill === 'string') {
      return source.fill; // 단색 채우기 오브젝트면 그 값을 그대로 씀(가장 정확함)
    }
    return pickColorAtEvent(e); // 이미지/그라디언트/패턴/빈 캔버스 등엔 실제 픽셀색으로 대체
  }

  // 무장 상태에서 마우스를 움직이는 동안 커서 아래 색을 실시간으로 세모 미리보기 박스에 반영
  // (실제 대상 오브젝트에는 아직 적용 안 함 — 적용은 지금처럼 클릭했을 때만 이뤄짐)
  EP.canvas.on('mouse:move', function(opt){
    if (!pickMode || !targetObj) return;
    var colorHex = sampleColorAt(opt.target, opt.e);
    if (colorHex) previewSwatch.style.borderBottomColor = colorHex;
  });

  EP.canvas.on('mouse:down', function(opt){
    if (!pickMode || !targetObj) return;

    var colorHex = sampleColorAt(opt.target, opt.e);

    if (colorHex && targetObj) {
      targetObj.set('fill', colorHex);
      previewSwatch.style.borderBottomColor = colorHex;
      EP.canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    }

    var appliedTo = targetObj;
    setPickMode(false);
    previewSwatch.style.borderBottomColor = colorHex || DEFAULT_SWATCH_COLOR; // setPickMode(false)가 기본색으로 되돌리므로, 방금 적용한 색으로 다시 덮어써서 결과가 남아있게 함
    if (appliedTo) EP.canvas.setActiveObject(appliedTo); // 바뀐 결과가 보이도록 대상 오브젝트를 다시 선택
    EP.canvas.requestRenderAll();
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && pickMode) setPickMode(false);
  });

  // 캔버스가 아닌 다른 곳(툴바 버튼, 메가메뉴, 모달, 우측 패널 등)을 클릭하면 무장 상태를
  // 취소함 — 다른 기능으로 넘어갔는데 스포이드가 뒤에서 계속 켜진 채로 남지 않게 함
  document.addEventListener('mousedown', function(e){
    if (!pickMode) return;
    if (e.target.closest && e.target.closest('#eyedropperPickBtn')) return;
    var canvasWrap = document.getElementById('canvasWrap');
    if (canvasWrap && !canvasWrap.contains(e.target)) setPickMode(false);
  }, true);

  // 상단 툴바 "선택" 버튼 등에서 확실하게 리셋할 수 있도록 노출
  EP.exitEyedropperModes = function(){
    if (pickMode) setPickMode(false);
    if (miniPickActive) disarmMiniEyedropper();
  };

  /* ============================================================
     5. 범용 미니 스포이드 — 상단 메인 스포이드(오브젝트끼리 색 복사용)와는 별개로, 우측 패널의
     각종 색상 박스(예: "번짐 색상", "덮을 색상") 옆에 달린 작은 스포이드 버튼에서 씀.
     대상이 "오브젝트의 fill"이 아니라 "그 색상 입력값 자체"라는 점만 다르고, 색을 뽑는 방식
     (sampleColorAt — 이미지는 항상 실제 픽셀색을 읽는 것 포함)은 메인 스포이드와 완전히 동일함.
     버튼을 누르면 무장되고, 캔버스에서 한 번 클릭하면 그 색을 콜백에 넘겨준 뒤 자동으로 꺼짐.
  ============================================================ */
  var miniPickActive = false;
  var miniPickCallback = null;
  var miniPickBtnEl = null; // 지금 무장 중인 버튼(눌러서 취소할 수 있도록, 그리고 active 표시용)

  function disarmMiniEyedropper(){
    miniPickActive = false;
    miniPickCallback = null;
    if (miniPickBtnEl) miniPickBtnEl.classList.remove('active');
    miniPickBtnEl = null;
    EP.canvas.defaultCursor = 'default';
    EP.canvas.hoverCursor = 'move';
    EP.canvas.requestRenderAll();
  }

  // btnEl: 무장 표시(active 클래스)를 줄 버튼 엘리먼트, onPick: 색을 뽑으면 (colorHex)로 호출될 콜백
  function armMiniEyedropper(btnEl, onPick){
    if (miniPickActive && miniPickBtnEl === btnEl) { disarmMiniEyedropper(); return; } // 같은 버튼 다시 누르면 취소
    if (pickMode) setPickMode(false); // 메인 스포이드가 무장 중이면 먼저 꺼서 충돌 방지
    if (miniPickActive) disarmMiniEyedropper(); // 다른 미니 스포이드가 무장 중이면 그것부터 정리
    if (EP.exitImageToolModes) EP.exitImageToolModes();
    miniPickActive = true;
    miniPickCallback = onPick;
    miniPickBtnEl = btnEl;
    if (btnEl) btnEl.classList.add('active');
    EP.canvas.selection = true;
    EP.canvas.skipTargetFind = false;
    EP.canvas.defaultCursor = DROPPER_CURSOR;
    EP.canvas.hoverCursor = DROPPER_CURSOR;
    EP.canvas.requestRenderAll();
  }

  EP.canvas.on('mouse:down', function(opt){
    if (!miniPickActive) return;
    var colorHex = sampleColorAt(opt.target, opt.e);
    var cb = miniPickCallback;
    disarmMiniEyedropper();
    if (colorHex && cb) cb(colorHex);
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && miniPickActive) disarmMiniEyedropper();
  });

  document.addEventListener('mousedown', function(e){
    if (!miniPickActive) return;
    if (miniPickBtnEl && e.target.closest && e.target.closest('#' + miniPickBtnEl.id)) return;
    var canvasWrap = document.getElementById('canvasWrap');
    if (canvasWrap && !canvasWrap.contains(e.target)) disarmMiniEyedropper();
  }, true);

  EP.armMiniEyedropper = armMiniEyedropper;
})();
