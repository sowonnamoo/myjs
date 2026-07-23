/* ecopro3eyedrop.js — 스포이드(오브젝트 색상 복사)
   로딩 순서: ecopro3.js -> ... -> ecopro3imgtool.js -> ecopro3eyedrop.js -> ecopro3text.js -> ...

   동작:
   1) 색을 바꾸고 싶은 오브젝트를 먼저 선택함
   2) 스포이드 버튼을 누름(그 오브젝트를 "대상"으로 기억해두고 무장됨 — 테두리 파란 링)
   3) 색을 따올 다른 오브젝트를 클릭 → 그 오브젝트의 색을 그대로 "대상" 오브젝트에 적용하고,
      대상 오브젝트를 다시 선택한 채로 스포이드는 자동으로 꺼짐
   클릭한 대상이 단색 채우기가 아니면(그라디언트/패턴 등) 그 지점에 실제로 렌더링된 픽셀 색을
   대신 추출해서 적용함. 별도의 색상 박스는 없음 — 항상 오브젝트끼리 바로 색을 복사하는 방식. */
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
    var d = ctx.getImageData(px, py, 1, 1).data;
    function h(n){ return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
    return '#' + h(d[0]) + h(d[1]) + h(d[2]);
  }

  EP.canvas.on('mouse:down', function(opt){
    if (!pickMode || !targetObj) return;

    var source = opt.target;
    var colorHex = null;
    if (source && !isGuideObj(source) && typeof source.fill === 'string') {
      colorHex = source.fill; // 단색 채우기 오브젝트면 그 값을 그대로 씀(가장 정확함)
    } else {
      colorHex = pickColorAtEvent(opt.e); // 그 외(그라디언트/패턴/빈 캔버스 등)엔 실제 픽셀색으로 대체
    }

    if (colorHex && targetObj) {
      targetObj.set('fill', colorHex);
      EP.canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    }

    var appliedTo = targetObj;
    setPickMode(false);
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
  };
})();
