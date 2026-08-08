/* ecopro3s.js — 이미지 전용 "S" 버튼 + PC 우측 속성패널 "이미지" 섹션을 그대로 쓸 수 있는 모바일 팝업
   로딩 순서: ecopro3.js -> ... -> ecopro3z.js -> ecopro3s.js -> ecopro3text.js -> ...
   (ecopro3imgtool.js가 이미 로드되어 PC 쪽 실제 입력칸들의 이벤트가 다 걸려있어야 함)

   구조는 J/Z와 동일(닫기버튼 + 컨트롤 목록, 드래그·회전 가능한 팝업)이지만, 안에 있는 기능은
   PC 우측 속성패널의 "이미지" 섹션(#imageSection)과 완전히 동일함 — 새 이미지 처리 로직을
   전혀 만들지 않고, 이 팝업의 컨트롤을 조작하면 그 값을 그대로 PC 쪽 실제 입력칸에 반영하고
   input/change 이벤트를 그대로 흘려보내는 "중계(forwarding)" 방식으로만 구현함. 그래서
   ecopro3imgtool.js 쪽 실제 이미지 처리 코드는 전혀 손대지 않아도 동일하게 동작함. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var isImageObject = EP.isImageObject || function(o){ return !!o && o.type === 'image'; };
  var isTableRelatedTarget = EP.isTableRelatedTarget || function(){ return false; };

  /* ============================================================
     S 버튼 컨트롤 — Z 바로 왼쪽(offsetX:-78, J:-14 · Z:-46과 같은 간격 규칙)에 배치.
     이미지 오브젝트에만 붙음.
  ============================================================ */
  function renderSButton(ctx, left, top, styleOverride, fabricObject){
    if (!(EP.isMobileModeActive && EP.isMobileModeActive())) return; // PC에서는 숨김 — 모바일 전용
    if (isTableRelatedTarget(fabricObject)) return;
    if (fabricObject && (fabricObject.type === 'activeSelection' || fabricObject.type === 'group')) {
      const objs = fabricObject.getObjects().filter(function(o){ return !o.isGuide; });
      if (objs.length < 2) return;
    }
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#E67E9E';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 1);
    ctx.restore();
  }

  const sControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: -78, offsetY: -36,
    sizeX: 28, sizeY: 28,
    cursorStyle: 'pointer',
    render: renderSButton,
    mouseUpHandler: function(eventData, transformData){
      if (!(EP.isMobileModeActive && EP.isMobileModeActive())) return true; // PC에서는 눌러도 반응 안 함
      const target = transformData && transformData.target;
      if (!target || isTableRelatedTarget(target)) return true;
      if (!qaSPopover.classList.contains('hidden')) { hideQaSPopover(); return true; } // 토글
      openQaSPopover(target);
      return true;
    }
  });

  // 이미지 오브젝트에만 붙임(텍스트·도형엔 안 뜸)
  fabric.Image.prototype.controls = Object.assign({}, fabric.Image.prototype.controls, { qs: sControl });

  /* ============================================================
     S 팝업 — 열기/닫기/위치 (J와 동일한 구조, 드롭다운 없이 컨트롤이 항상 다 보임)
  ============================================================ */
  const qaSPopover = document.getElementById('qaSPopover');
  const qaSPopoverCloseBtn = document.getElementById('qaSPopoverCloseBtn');
  if (!qaSPopover) return;
  if (EP.registerPopoverPositionMemory) EP.registerPopoverPositionMemory(qaSPopover);

  function hideQaSPopover(){ qaSPopover.classList.add('hidden'); }
  qaSPopoverCloseBtn.addEventListener('click', hideQaSPopover);
  if (EP.registerFilterPopover) EP.registerFilterPopover(qaSPopover);

  function positionQaSPopover(target){
    if (EP.positionPopoverAtCanvasCorner) EP.positionPopoverAtCanvasCorner(qaSPopover);
  }

  function openQaSPopover(target){
    syncQaSFromRealInputs();
    positionQaSPopover(target);
  }
  if (EP.makeDraggablePopover) EP.makeDraggablePopover(qaSPopover);
  if (EP.registerRotatablePopover) EP.registerRotatablePopover(qaSPopover);

  /* ============================================================
     중계(forwarding) 유틸 — 이 팝업의 컨트롤을 PC 쪽 실제 입력칸과 값 동기화 + 이벤트 위임
  ============================================================ */
  function fireEvent(el, type){
    const evt = document.createEvent('Event');
    evt.initEvent(type, true, true);
    el.dispatchEvent(evt);
  }
  // 슬라이더/숫자 등 값 입력 — 이 팝업에서 값이 바뀌면 실제 PC 입력칸에 값을 반영하고
  // input(실시간)·change(끝났을 때) 이벤트를 그대로 흘려보내서, 실제 처리 로직(PC 쪽)이
  // 아무 차이 없이 그대로 반응하게 함.
  function wireRangeMirror(mobileId, realId){
    const mobileEl = document.getElementById(mobileId);
    const realEl = document.getElementById(realId);
    if (!mobileEl || !realEl) return;
    mobileEl.addEventListener('input', function(){
      realEl.value = mobileEl.value;
      fireEvent(realEl, 'input');
    });
    mobileEl.addEventListener('change', function(){
      realEl.value = mobileEl.value;
      fireEvent(realEl, 'change');
    });
  }
  // 버튼 — 그냥 실제 PC 버튼을 그대로 클릭해줌(가장 확실하고 안전한 재사용 방식)
  function wireButtonForward(mobileId, realId){
    const mobileEl = document.getElementById(mobileId);
    const realEl = document.getElementById(realId);
    if (!mobileEl || !realEl) return;
    mobileEl.addEventListener('click', function(){ realEl.click(); });
  }

  // ---- 1) 글씨 워터마크삭제 ----
  wireButtonForward('qaSMarqueeEraseBtn', 'marqueeEraseToggleBtn');
  wireRangeMirror('qaSMarqueeStrength', 'marqueeEraseStrengthInput');
  const qaSMarqueeAutoModeBtn = document.getElementById('qaSMarqueeAutoModeBtn');
  const qaSMarqueeCustomModeBtn = document.getElementById('qaSMarqueeCustomModeBtn');
  const qaSMarqueeCustomColorRow = document.getElementById('qaSMarqueeCustomColorRow');
  if (qaSMarqueeAutoModeBtn && qaSMarqueeCustomModeBtn) {
    qaSMarqueeAutoModeBtn.addEventListener('click', function(){
      const realBtn = document.getElementById('marqueeEraseAutoModeBtn');
      if (realBtn) realBtn.click();
      qaSMarqueeAutoModeBtn.classList.add('on');
      qaSMarqueeCustomModeBtn.classList.remove('on');
      if (qaSMarqueeCustomColorRow) qaSMarqueeCustomColorRow.classList.add('hidden');
    });
    qaSMarqueeCustomModeBtn.addEventListener('click', function(){
      const realBtn = document.getElementById('marqueeEraseCustomModeBtn');
      if (realBtn) realBtn.click();
      qaSMarqueeCustomModeBtn.classList.add('on');
      qaSMarqueeAutoModeBtn.classList.remove('on');
      if (qaSMarqueeCustomColorRow) qaSMarqueeCustomColorRow.classList.remove('hidden');
    });
  }
  const qaSMarqueeCustomColor = document.getElementById('qaSMarqueeCustomColor');
  if (qaSMarqueeCustomColor && EP.initCmykPicker) {
    EP.initCmykPicker(qaSMarqueeCustomColor);
    qaSMarqueeCustomColor.addEventListener('input', function(){
      const realEl = document.getElementById('marqueeEraseCustomColorInput');
      if (realEl) { realEl.value = qaSMarqueeCustomColor.value; fireEvent(realEl, 'input'); fireEvent(realEl, 'change'); }
    });
  }

  // ---- 2) 자르기 ----
  wireButtonForward('qaSCropBtn', 'startCropBtn');
  wireButtonForward('qaSCropResetBtn', 'resetCropBtn');

  // ---- 3) 이미지 지우개(브러시) ----
  wireButtonForward('qaSEraseBrushBtn', 'eraseBrushToggleBtn');
  wireRangeMirror('qaSEraseBrushSize', 'eraseBrushSizeInput');

  // ---- 4) 밝기/대비/채도 ----
  wireRangeMirror('qaSBrightness', 'imgBrightnessInput');
  wireRangeMirror('qaSContrast', 'imgContrastInput');
  wireRangeMirror('qaSSaturation', 'imgSaturationInput');

  // ---- 5) 스케치 효과 ----
  wireRangeMirror('qaSSketchAmount', 'imgSketchAmount');
  wireButtonForward('qaSSketchBtn', 'imgSketchBtn');

  // ---- 6) 자동누끼(매직완드) ----
  wireButtonForward('qaSMagicWandBtn', 'magicWandToggleBtn');
  wireRangeMirror('qaSMagicWandTolerance', 'magicWandToleranceInput');

  // ---- 7) 가장자리블러 ----
  wireRangeMirror('qaSEdgeBlurAmount', 'edgeBlurAmount');
  const qaSEdgeBlurColor = document.getElementById('qaSEdgeBlurColor');
  if (qaSEdgeBlurColor && EP.initCmykPicker) {
    EP.initCmykPicker(qaSEdgeBlurColor);
    qaSEdgeBlurColor.addEventListener('input', function(){
      const realEl = document.getElementById('edgeBlurColorInput');
      if (realEl) { realEl.value = qaSEdgeBlurColor.value; fireEvent(realEl, 'input'); fireEvent(realEl, 'change'); }
    });
  }
  wireButtonForward('qaSEdgeBlurBtn', 'edgeBlurBtn');

  // 팝업을 열 때, 실제 PC 입력칸들의 "지금 값"으로 이 팝업의 슬라이더/색상들을 맞춰둠
  // (전에 조정해둔 값이 있으면 0으로 안 보이고 그 값 그대로 이어서 보이게)
  function syncQaSFromRealInputs(){
    const pairs = [
      ['qaSMarqueeStrength', 'marqueeEraseStrengthInput'],
      ['qaSEraseBrushSize', 'eraseBrushSizeInput'],
      ['qaSBrightness', 'imgBrightnessInput'],
      ['qaSContrast', 'imgContrastInput'],
      ['qaSSaturation', 'imgSaturationInput'],
      ['qaSSketchAmount', 'imgSketchAmount'],
      ['qaSMagicWandTolerance', 'magicWandToleranceInput'],
      ['qaSEdgeBlurAmount', 'edgeBlurAmount']
    ];
    pairs.forEach(function(pair){
      const mobileEl = document.getElementById(pair[0]);
      const realEl = document.getElementById(pair[1]);
      if (mobileEl && realEl && realEl.value !== '') mobileEl.value = realEl.value;
    });
    const realMarqueeColor = document.getElementById('marqueeEraseCustomColorInput');
    if (qaSMarqueeCustomColor && realMarqueeColor && realMarqueeColor.value) qaSMarqueeCustomColor.value = realMarqueeColor.value;
    const realBlurColor = document.getElementById('edgeBlurColorInput');
    if (qaSEdgeBlurColor && realBlurColor && realBlurColor.value) qaSEdgeBlurColor.value = realBlurColor.value;
  }
})();
