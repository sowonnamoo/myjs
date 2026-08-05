/* ecopro3s.js — 텍스트("T")·모양/펜 패스("K") 버튼 바로 아래에 뜨는 "S" 그림자 효과 버튼 + 팝업
   로딩 순서: ecopro3.js(코어) -> ... -> ecopro3k.js -> ecopro3s.js -> ecopro3bg.js -> ...

   K·T와 똑같은 구조(작은 원형 버튼 → 근처에 뜨는 설정 팝업)지만, 위치만 K/T 바로 아래로
   두고 다루는 대상은 텍스트/모양(도형)/펜 패스/이미지 전부 공용임. M/J/Z처럼 SVG를 직접
   합성하지 않고, fabric 오브젝트가 원래 가지고 있는 표준 shadow 속성(fabric.Shadow)을
   그대로 씀 — 이러면 별도 이미지 합성 과정이 없어 가볍고, 저장(JSON)·실행취소에도
   자동으로 같이 저장됨(shadow는 fabric의 표준 직렬화 속성이라 커스텀 프로퍼티 목록에
   따로 추가할 필요가 없음). */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  var isTableRelatedTarget = EP.isTableRelatedTarget || function(){ return false; };

  // S 버튼을 보여줄 대상: 표 셀 제외, 펜 패스·모양(K 대상)이거나 텍스트(T 대상)이거나
  // 그 둘을 묶은 그룹/다중선택
  function isSTarget(o){
    if (!o || o.isGuide) return false;
    if (isTableRelatedTarget(o)) return false;
    if (o.isPenToolPath) return true;
    if (EP.isShapeObject && EP.isShapeObject(o)) return true;
    if (EP.isTextObject && EP.isTextObject(o)) return true;
    if (EP.isImageObject && EP.isImageObject(o)) return true;
    if (o.type === 'activeSelection' || o.type === 'group') {
      var kids = o.getObjects ? o.getObjects().filter(function(x){ return !x.isGuide; }) : [];
      return kids.length >= 1;
    }
    return false;
  }

  function renderSButton(ctx, left, top, styleOverride, fabricObject){
    if (!isSTarget(fabricObject)) return;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#16a085';
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

  var sPopover = document.getElementById('sShadowPopover');
  var sPopoverCloseBtn = document.getElementById('sShadowPopoverCloseBtn');
  var sToggleBtn = document.getElementById('sShadowToggleBtn');
  var sColorInput = document.getElementById('sShadowColorInput');
  var sBlurInput = document.getElementById('sShadowBlurInput');
  var sOpacityInput = document.getElementById('sShadowOpacityInput');
  var sOffsetXInput = document.getElementById('sShadowOffsetXInput');
  var sOffsetYInput = document.getElementById('sShadowOffsetYInput');

  var DEFAULT_SHADOW_RGB = { r: 0, g: 0, b: 0 };
  var DEFAULT_SHADOW = { blur: 10, opacity: 0.5, offsetX: 5, offsetY: 5 };

  function parseShadowRGB(colorStr){
    if (!colorStr) return DEFAULT_SHADOW_RGB;
    if (colorStr.charAt(0) === '#') {
      var rgb = EP.hexToRgb ? EP.hexToRgb(colorStr) : null;
      return rgb || DEFAULT_SHADOW_RGB;
    }
    var m = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return DEFAULT_SHADOW_RGB;
  }
  function parseShadowAlpha(colorStr){
    if (!colorStr) return DEFAULT_SHADOW.opacity;
    var m = colorStr.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
    if (m) return parseFloat(m[1]);
    return 1;
  }
  function shadowColorString(hex, opacity){
    var rgb = parseShadowRGB(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + opacity + ')';
  }

  var sTarget = null; // 지금 이 팝업이 편집 중인 오브젝트(그룹/다중선택이면 그 자체)

  function hideSPopover(){
    sPopover.classList.add('hidden');
    sTarget = null;
  }
  if (EP.registerFilterPopover) EP.registerFilterPopover(sPopover);
  if (EP.makeDraggablePopover) EP.makeDraggablePopover(sPopover);
  if (EP.registerRotatablePopover) EP.registerRotatablePopover(sPopover);

  // K팝업과 완전히 같은 방식(대상 중앙 아래쪽 배치, 공간 부족하면 위쪽, 겹치면 자동으로 비켜서 배치)
  function positionSPopover(target){
    sPopover.classList.remove('hidden');
    var pw = sPopover.offsetWidth || 200;
    var ph = sPopover.offsetHeight || 140;

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

    if (EP.findNonOverlappingPosition) {
      var avoided = EP.findNonOverlappingPosition(sPopover, left, top, pw, ph);
      left = avoided.left; top = avoided.top;
    }

    var r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, pw, ph, EP.canvasRotationDeg) : { left: left, top: top };
    sPopover.style.left = r.left + 'px';
    sPopover.style.top = r.top + 'px';
    if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(sPopover);
  }

  // fabric의 Group/ActiveSelection은 set()이 자식에 전파되지 않으므로, 그런 경우엔 안의
  // 오브젝트 하나하나에 직접 적용함(다른 K/T 등에서도 쓰는 것과 동일한 방식)
  function forEachShadowTarget(obj, fn){
    if (obj.type === 'activeSelection' || obj.type === 'group') {
      obj.getObjects().forEach(function(o){ if (!o.isGuide) fn(o); });
    } else {
      fn(obj);
    }
  }

  // 대상의 "대표" 그림자값(팝업 입력칸을 채울 기준) — 그룹/다중선택이면 첫 번째 자식 기준
  function representativeShadow(target){
    if (target.type === 'activeSelection' || target.type === 'group') {
      var kids = target.getObjects().filter(function(o){ return !o.isGuide; });
      return kids.length ? kids[0].shadow : null;
    }
    return target.shadow;
  }

  function syncSPopoverFromTarget(target){
    var sh = representativeShadow(target);
    if (sh) {
      sColorInput.value = (EP.toHex && EP.toHex(sh.color)) || '#000000';
      sOpacityInput.value = parseShadowAlpha(sh.color);
      sBlurInput.value = sh.blur != null ? sh.blur : DEFAULT_SHADOW.blur;
      sOffsetXInput.value = sh.offsetX != null ? sh.offsetX : DEFAULT_SHADOW.offsetX;
      sOffsetYInput.value = sh.offsetY != null ? sh.offsetY : DEFAULT_SHADOW.offsetY;
      sToggleBtn.textContent = '그림자 끄기';
      sToggleBtn.classList.add('on');
    } else {
      sColorInput.value = '#000000';
      sOpacityInput.value = DEFAULT_SHADOW.opacity;
      sBlurInput.value = DEFAULT_SHADOW.blur;
      sOffsetXInput.value = DEFAULT_SHADOW.offsetX;
      sOffsetYInput.value = DEFAULT_SHADOW.offsetY;
      sToggleBtn.textContent = '그림자 켜기';
      sToggleBtn.classList.remove('on');
    }
  }

  function openSPopover(target){
    sTarget = target;
    syncSPopoverFromTarget(target);
    positionSPopover(target);
  }

  if (EP.initCmykPicker) EP.initCmykPicker(sColorInput);

  // 슬라이더 중 하나라도 조작하면(그림자가 꺼져있어도) 자동으로 그림자를 켜서 바로
  // 눈에 보이게 적용함 — K의 테두리 두께/색상과 같은 방식
  function applyShadowFromInputs(){
    if (!sTarget) return;
    var colorStr = shadowColorString(sColorInput.value, parseFloat(sOpacityInput.value));
    var blur = parseFloat(sBlurInput.value) || 0;
    var offsetX = parseFloat(sOffsetXInput.value) || 0;
    var offsetY = parseFloat(sOffsetYInput.value) || 0;
    forEachShadowTarget(sTarget, function(o){
      o.set('shadow', new fabric.Shadow({ color: colorStr, blur: blur, offsetX: offsetX, offsetY: offsetY }));
    });
    sToggleBtn.textContent = '그림자 끄기';
    sToggleBtn.classList.add('on');
    EP.canvas.requestRenderAll();
  }

  [sColorInput, sBlurInput, sOpacityInput, sOffsetXInput, sOffsetYInput].forEach(function(el){
    el.addEventListener('input', applyShadowFromInputs);
    el.addEventListener('change', function(){ if (EP.pushHistory) EP.pushHistory(); });
  });

  sToggleBtn.addEventListener('click', function(){
    if (!sTarget) return;
    var currentlyOn = sToggleBtn.classList.contains('on');
    if (currentlyOn) {
      forEachShadowTarget(sTarget, function(o){ o.set('shadow', null); });
      sToggleBtn.textContent = '그림자 켜기';
      sToggleBtn.classList.remove('on');
    } else {
      applyShadowFromInputs();
    }
    EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();
  });

  sPopoverCloseBtn.addEventListener('click', hideSPopover);

  var sControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: 20, offsetY: -2, // K·T(offsetY:-36) 바로 아래에 오도록 배치
    cursorStyle: 'pointer',
    render: renderSButton,
    mouseUpHandler: function(eventData, transformData){
      var target = transformData && transformData.target;
      if (!isSTarget(target)) return true;
      if (target.isEditing) target.exitEditing();
      if (!sPopover.classList.contains('hidden') && sTarget === target) { hideSPopover(); return true; }
      openSPopover(target);
      return true;
    }
  });

  // 텍스트·모양(도형)·펜 패스·이미지·그룹·다중선택 전부에 붙임 — 'sShadow'라는 별도 키라서
  // 이미 붙어있는 T('tFont')·K('kStroke')·M('qa')·J('qj') 등과 동시에 있어도 서로 안 겹침
  fabric.IText.prototype.controls = Object.assign({}, fabric.IText.prototype.controls, { sShadow: sControl });
  fabric.ActiveSelection.prototype.controls = Object.assign({}, fabric.ActiveSelection.prototype.controls, { sShadow: sControl });
  fabric.Group.prototype.controls = Object.assign({}, fabric.Group.prototype.controls, { sShadow: sControl });
  fabric.Rect.prototype.controls = Object.assign({}, fabric.Rect.prototype.controls, { sShadow: sControl });
  fabric.Circle.prototype.controls = Object.assign({}, fabric.Circle.prototype.controls, { sShadow: sControl });
  fabric.Triangle.prototype.controls = Object.assign({}, fabric.Triangle.prototype.controls, { sShadow: sControl });
  fabric.Path.prototype.controls = Object.assign({}, fabric.Path.prototype.controls, { sShadow: sControl });
  fabric.Image.prototype.controls = Object.assign({}, fabric.Image.prototype.controls, { sShadow: sControl });

  function closeIfTargetChanged(){
    if (!sTarget) return;
    if (EP.canvas.getActiveObject() !== sTarget) hideSPopover();
  }
  EP.canvas.on('selection:created', closeIfTargetChanged);
  EP.canvas.on('selection:updated', closeIfTargetChanged);
  EP.canvas.on('selection:cleared', hideSPopover);
})();
