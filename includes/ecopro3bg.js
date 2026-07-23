/* ecopro3bg.js — "🎨 바탕 채우기" 툴바 버튼 + 캔버스 배경 생성 모달
   로딩 순서: ecopro3.js -> ... -> ecopro3m.js -> ecopro3j.js -> ecopro3bg.js -> ecopro3text.js -> ...
   (M의 랜덤 적용 로직인 EP.rollShapeDice를 그대로 재사용하므로 ecopro3m.js보다 뒤에 로드돼야 함)

   동작: 툴바의 "🎨 바탕 채우기"를 누르면 캔버스 정가운데에 작은 모달이 뜨고, 그 안에 버튼 2개:
     - "바탕생성 (흰 바탕)": 캔버스 전체 크기의 흰색 사각형을 만들어 맨 뒤로 보냄
     - "랜덤 바탕생성": 캔버스 전체 크기 사각형을 만들고 M의 랜덤 적용(1~3개 모양필터 겹치기)을
       그대로 적용함. 누를 때마다 기존에 만들어둔 배경 사각형을 지우고 새로 만듦.
   두 버튼 모두 "기존 배경(이 기능으로 만든 것)"이 있으면 먼저 지우고 새로 만들어서, 배경이
   여러 겹 쌓이지 않게 함. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var addBgFillBtn = document.getElementById('addBgFillBtn');
  var bgFillModal = document.getElementById('bgFillModal');
  var bgFillModalCloseBtn = document.getElementById('bgFillModalCloseBtn');
  var bgFillWhiteBtn = document.getElementById('bgFillWhiteBtn');
  var bgFillRandomBtn = document.getElementById('bgFillRandomBtn');
  var bgFillRandomColorBtn = document.getElementById('bgFillRandomColorBtn');

  // 현재 캔버스의 "논리적" 크기(줌 배율과 무관한 실제 디자인 크기)를 구함
  function getLogicalCanvasSize(){
    var zoom = EP.canvas.getZoom() || 1;
    return {
      w: EP.canvas.getWidth() / zoom,
      h: EP.canvas.getHeight() / zoom
    };
  }

  // 이전에 이 기능으로 만들어둔 배경 사각형을 찾아서 캔버스에서 제거
  function removeExistingBgFill(){
    var objs = EP.canvas.getObjects().filter(function(o){ return o && o.isCanvasBgFill; });
    objs.forEach(function(o){ EP.canvas.remove(o); });
  }

  function createBgFillRect(){
    var size = getLogicalCanvasSize();
    var rect = new fabric.Rect({
      left: 0, top: 0, originX: 'left', originY: 'top',
      width: size.w, height: size.h,
      fill: '#ffffff', stroke: '', strokeWidth: 0
    });
    rect.isCanvasBgFill = true;
    return rect;
  }

  function positionBgFillModal(){
    bgFillModal.classList.remove('hidden');
    var mw = bgFillModal.offsetWidth || 220;
    var mh = bgFillModal.offsetHeight || 160;
    var canvasRect = EP.canvas.upperCanvasEl.getBoundingClientRect();
    var left = canvasRect.left + canvasRect.width / 2 - mw / 2;
    var top = canvasRect.top + canvasRect.height / 2 - mh / 2;
    var r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, mw, mh, EP.canvasRotationDeg) : { left: left, top: top };
    bgFillModal.style.left = r.left + 'px';
    bgFillModal.style.top = r.top + 'px';
    if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(bgFillModal);
  }

  function openBgFillModal(){
    positionBgFillModal();
  }
  function hideBgFillModal(){
    bgFillModal.classList.add('hidden');
  }

  addBgFillBtn.addEventListener('click', function(){
    openBgFillModal();
  });
  bgFillModalCloseBtn.addEventListener('click', hideBgFillModal);

  // 마우스로 클릭+드래그해서 모달창을 원하는 위치로 옮길 수 있게 함
  if (EP.makeDraggablePopover) EP.makeDraggablePopover(bgFillModal);
  if (EP.registerRotatablePopover) EP.registerRotatablePopover(bgFillModal);

  bgFillWhiteBtn.addEventListener('click', function(){
    removeExistingBgFill();
    var rect = createBgFillRect();
    EP.canvas.add(rect);
    EP.canvas.sendToBack(rect);
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    EP.canvas.setActiveObject(rect);
    EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();
    hideBgFillModal();
  });

  bgFillRandomBtn.addEventListener('click', function(){
    // 요청대로: 누를 때마다 기존 배경(이 기능으로 만든 것)을 지우고 새로 만듦
    removeExistingBgFill();
    var rect = createBgFillRect();
    EP.canvas.add(rect);
    EP.canvas.sendToBack(rect);
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    EP.canvas.setActiveObject(rect);
    EP.canvas.requestRenderAll();
    // M의 "랜덤 적용"(1~3개 모양필터를 랜덤 투명도·회전으로 겹치기)을 그대로 재사용
    if (EP.rollShapeDice) EP.rollShapeDice(rect);
    // 모달은 열어둔 채로 둬서 마음에 들 때까지 계속 다시 뽑을 수 있게 함
  });

  bgFillRandomColorBtn.addEventListener('click', function(){
    // 요청대로: 누를 때마다 기존 배경(이 기능으로 만든 것)을 지우고 새로 만듦
    removeExistingBgFill();
    var rect = createBgFillRect();
    var hue = Math.floor(Math.random() * 360);
    var sat = Math.round(45 + Math.random() * 45); // 40~90%
    var light = Math.round(35 + Math.random() * 45); // 35~80%
    rect.set('fill', 'hsl(' + hue + ',' + sat + '%,' + light + '%)');
    EP.canvas.add(rect);
    EP.canvas.sendToBack(rect);
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    EP.canvas.setActiveObject(rect);
    EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();
    // 모달은 열어둔 채로 둬서 마음에 들 때까지 계속 다시 뽑을 수 있게 함
  });
})();
