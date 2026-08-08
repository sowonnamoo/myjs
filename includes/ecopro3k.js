/* ecopro3k.js — 모양(도형)·펜 도구 패스 공용 "K" 버튼 + 테두리 스타일/클리핑 마스크 팝업
   로딩 순서: ecopro3.js(코어) -> ... -> ecopro3z.js -> ecopro3k.js -> ecopro3bg.js -> ...

   T(텍스트 전용 버튼)와 똑같은 구조: 오브젝트를 선택하면 원형 미니 버튼이 뜨고,
   누르면 근처에 작은 설정 팝업이 열림. K는 "모양(사각형/원/삼각형/자유모양 등)"과
   "펜 도구로 만든 패스" 둘 다에서 뜸(EP.isShapeObject 기준 — 표 셀은 제외).
   다루는 항목: 테두리 색상 / 전체 불투명도 / 본문(채우기) 불투명도 / 테두리 두께 /
   클리핑 마스크(바로 뒤(아래) 레이어를 이 모양·패스 윤곽으로 잘라냄).
   M('qa')·J('qj')와 다른 컨트롤 키('kStroke')를 쓰기 때문에 이미 붙어있는 M/J 버튼과
   동시에 있어도 서로 안 겹치고 잘 공존함. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  var isTableRelatedTarget = EP.isTableRelatedTarget || function(){ return false; };

  // K 버튼을 보여줄 대상인지 판단: 표 셀은 제외, 펜 도구 패스이거나 일반 모양(도형)이면 대상
  function isKTarget(o){
    if (!o || o.isGuide) return false;
    if (isTableRelatedTarget(o)) return false;
    if (o.isPenToolPath) return true;
    return !!(EP.isShapeObject && EP.isShapeObject(o));
  }

  function renderKButton(ctx, left, top, styleOverride, fabricObject){
    if (!isKTarget(fabricObject)) return;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#2980b9';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', 0, 1);
    ctx.restore();
  }

  var kPopover = document.getElementById('kStrokePopover');
  var kPopoverCloseBtn = document.getElementById('kStrokePopoverCloseBtn');
  var kStrokeColorInput = document.getElementById('kStrokeColorInput');
  var kColorGaugeInput = document.getElementById('kColorGaugeInput');
  var kOpacityInput = document.getElementById('kOpacityInput');
  var kFillOpacityInput = document.getElementById('kFillOpacityInput');
  var kStrokeWidthInput = document.getElementById('kStrokeWidthInput');
  var kClipMaskBtn = document.getElementById('kClipMaskBtn');

  // 기본 채우기색(닫힌 패스를 만들 때 finishPenPath가 쓰는 파란색) — fill이 비어있거나
  // 'transparent'라서 색상 정보가 아예 없을 때, 본문 불투명도를 처음 올리면 이 색으로
  // 채워지게 함
  var DEFAULT_FILL_RGB = { r: 52, g: 152, b: 219 };
  var DEFAULT_STROKE_COLOR = '#000000';
  var DEFAULT_STROKE_WIDTH = 2;

  // "본문 불투명도"는 오브젝트 전체(opacity)가 아니라 fill 색상 자체의 알파 값만 바꿔서,
  // 테두리(stroke)는 그대로 두고 안쪽 채우기만 투명해지게 만드는 방식임.
  function parseFillRGB(fillStr){
    if (!fillStr || fillStr === 'transparent') return DEFAULT_FILL_RGB;
    if (fillStr.charAt(0) === '#') {
      var rgb = EP.hexToRgb ? EP.hexToRgb(fillStr) : null;
      return rgb || DEFAULT_FILL_RGB;
    }
    var m = fillStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return DEFAULT_FILL_RGB;
  }
  function parseFillAlpha(fillStr){
    if (!fillStr || fillStr === 'transparent') return 0;
    var m = fillStr.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
    if (m) return parseFloat(m[1]);
    return 1; // hex나 alpha 없는 rgb는 완전 불투명으로 취급
  }

  var kTarget = null; // 지금 이 팝업이 편집 중인 모양/패스

  function hideKPopover(){
    kPopover.classList.add('hidden');
    kTarget = null;
  }
  if (EP.registerFilterPopover) EP.registerFilterPopover(kPopover); // 다른 필터 팝업이 열릴 때 이것도 같이 정리 대상에 포함
  if (EP.makeDraggablePopover) EP.makeDraggablePopover(kPopover);   // 마우스로 클릭+드래그해서 옮길 수 있게 함
  if (EP.registerRotatablePopover) EP.registerRotatablePopover(kPopover); // 캔버스 회전에 맞춰 팝업도 같이 회전

  // M팝업(positionQaMPopover)과 완전히 같은 방식 — 대상 중앙 아래쪽에 배치하고, 공간이
  // 부족하면 위쪽으로, 다른 팝업과 겹치면 자동으로 옆으로 비켜서 배치함.
  function positionKPopover(target){
    kPopover.classList.remove('hidden');
    var pw = kPopover.offsetWidth || 200;
    var ph = kPopover.offsetHeight || 140;

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
      var avoided = EP.findNonOverlappingPosition(kPopover, left, top, pw, ph);
      left = avoided.left; top = avoided.top;
    }

    var r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, pw, ph, EP.canvasRotationDeg) : { left: left, top: top };
    kPopover.style.left = r.left + 'px';
    kPopover.style.top = r.top + 'px';
    if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(kPopover);
  }

  // 팝업을 열 때, 지금 모양/패스의 실제 값(테두리색/전체 불투명도/본문 불투명도/두께)으로
  // 입력칸들을 맞춰둠
  function syncKPopoverFromTarget(target){
    var hex = (EP.toHex && EP.toHex(target.stroke)) || DEFAULT_STROKE_COLOR;
    kStrokeColorInput.value = hex;
    if (EP.hexToGaugePos) kColorGaugeInput.value = EP.hexToGaugePos(hex);
    kOpacityInput.value = target.opacity != null ? target.opacity : 1;
    kFillOpacityInput.value = parseFillAlpha(target.fill);
    kStrokeWidthInput.value = Math.round(target.strokeWidth || 0);
  }

  function openKPopover(target){
    kTarget = target;
    syncKPopoverFromTarget(target);
    positionKPopover(target);
  }

  if (EP.initCmykPicker) EP.initCmykPicker(kStrokeColorInput);

  // 무지개 게이지 — T(텍스트) 팝업의 색상 게이지와 완전히 같은 방식으로 재사용(EP.gaugePosToHex).
  // 드래그하는 대로 그 위치의 색이 바로 테두리 색으로 적용되고, 옆 스와치도 같이 맞춰짐.
  if (kColorGaugeInput) {
    kColorGaugeInput.addEventListener('input', function(){
      if (!kTarget || !EP.gaugePosToHex) return;
      var hex = EP.gaugePosToHex(parseFloat(kColorGaugeInput.value));
      kTarget.set('stroke', hex);
      kStrokeColorInput.value = hex;
      if (!kTarget.strokeWidth || kTarget.strokeWidth <= 0) {
        kTarget.set('strokeWidth', DEFAULT_STROKE_WIDTH);
        kStrokeWidthInput.value = DEFAULT_STROKE_WIDTH;
      }
      EP.canvas.requestRenderAll();
    });
    kColorGaugeInput.addEventListener('change', function(){ if (EP.pushHistory) EP.pushHistory(); });
  }

  // 색상을 고르면 테두리가 실제로 "적용"되게 함 — 도형은 기본적으로 테두리가 없는(strokeWidth:0)
  // 상태로 만들어지므로, 색만 고르고 끝나면 아무 변화도 안 보이는 문제가 있었음. 그래서 색을
  // 고르는 순간 두께가 0이면 기본 두께(2px)로 같이 올려줌.
  kStrokeColorInput.addEventListener('input', function(){
    if (!kTarget) return;
    kTarget.set('stroke', kStrokeColorInput.value);
    if (kColorGaugeInput && EP.hexToGaugePos) kColorGaugeInput.value = EP.hexToGaugePos(kStrokeColorInput.value);
    if (!kTarget.strokeWidth || kTarget.strokeWidth <= 0) {
      kTarget.set('strokeWidth', DEFAULT_STROKE_WIDTH);
      kStrokeWidthInput.value = DEFAULT_STROKE_WIDTH;
    }
    EP.canvas.requestRenderAll();
  });
  kStrokeColorInput.addEventListener('change', function(){ if (EP.pushHistory) EP.pushHistory(); });

  kOpacityInput.addEventListener('input', function(){
    if (!kTarget) return;
    kTarget.set('opacity', parseFloat(kOpacityInput.value));
    EP.canvas.requestRenderAll();
  });
  kOpacityInput.addEventListener('change', function(){ if (EP.pushHistory) EP.pushHistory(); });

  kFillOpacityInput.addEventListener('input', function(){
    if (!kTarget) return;
    var rgb = parseFillRGB(kTarget.fill);
    var alpha = parseFloat(kFillOpacityInput.value);
    kTarget.set('fill', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')');
    EP.canvas.requestRenderAll();
  });
  kFillOpacityInput.addEventListener('change', function(){ if (EP.pushHistory) EP.pushHistory(); });

  // 숫자(두께)를 입력해도 테두리가 실제로 "적용"되게 함 — 두께만 올리고 색이 아예 없으면
  // (도형 기본값) 여전히 안 보이므로, 두께가 0보다 커지는 순간 테두리색이 비어있으면
  // 기본 검정색을 같이 넣어줌.
  kStrokeWidthInput.addEventListener('input', function(){
    if (!kTarget) return;
    var w = Math.max(0, Math.min(60, parseFloat(kStrokeWidthInput.value) || 0));
    kTarget.set('strokeWidth', w);
    if (w > 0 && !kTarget.stroke) {
      kTarget.set('stroke', kStrokeColorInput.value || DEFAULT_STROKE_COLOR);
    }
    EP.canvas.requestRenderAll();
  });
  kStrokeWidthInput.addEventListener('change', function(){ if (EP.pushHistory) EP.pushHistory(); });

  kPopoverCloseBtn.addEventListener('click', hideKPopover);

  /* ============================================================
     클리핑 마스크 — 지금 이 모양/패스 "바로 뒤(아래) 레이어"를 이 윤곽으로 잘라냄.
     동작: 레이어 순서상 바로 아래 오브젝트를 찾아서, 이 모양/패스를 복제한 것을
     absolutePositioned 클립패스로 붙여줌(캔버스 절대 좌표 기준으로 그대로 겹쳐서 잘라냄 —
     가장 단순하고 확실한 방식. 상대좌표 방식은 오류가 많고 이미지를 틀 규격 안에서
     조절하는 기존 장점이 먹통이 돼서 이 방식으로 되돌림). 적용 후에는 마스크로 쓴
     모양/패스를 이미지 바로 뒤(레이어 순서상 아래)로 보내서, 이미지가 위에서 보이고
     모양은 그 뒤에 가려지게 함(모양/패스 자체는 지우지 않아서 두 오브젝트를 각각 계속
     선택할 수 있음).
  ============================================================ */
  function applyClippingMask(shapeObj){
    var canvas = EP.canvas;
    var objs = canvas.getObjects().filter(function(o){ return !o.isGuide; });
    var idx = objs.indexOf(shapeObj);
    if (idx <= 0) {
      if (EP.showBottomHintToast) EP.showBottomHintToast('클리핑 마스크를 적용할 뒤(아래) 레이어가 없어요. 이 모양/패스 바로 아래에 다른 오브젝트가 있어야 해요.');
      else alert('클리핑 마스크를 적용할 뒤(아래) 레이어가 없어요. 이 모양/패스 바로 아래에 다른 오브젝트가 있어야 해요.');
      return;
    }
    var below = objs[idx - 1]; // 레이어 순서상 바로 뒤(아래)

    // 클립(마스크 모양)이 지금 below와 어떤 관계인지(상대 변환행렬)를 미리 계산해서 저장해둠.
    // 클립 자체는 계속 absolutePositioned(절대좌표)로 붙여서 "이미지만 따로 옮기거나 크기
    // 조절해도 창(마스크 경계)은 그대로 고정"되는 기존 동작을 유지하되, 나중에 "묶어서
    // 통째로" 크기를 바꾸거나 회전하는 경우에만 이 저장된 관계를 이용해 클립도 같이
    // 맞춰 재계산함(아래 syncClipsForGroupTransform 참고).
    var belowMatrix = below.calcTransformMatrix();
    var invertedBelow = fabric.util.invertTransform(belowMatrix);
    var shapeMatrix = shapeObj.calcTransformMatrix();
    var relativeMatrix = fabric.util.multiplyTransformMatrices(invertedBelow, shapeMatrix);

    shapeObj.clone(function(clonedClip){
      clonedClip.set({
        absolutePositioned: true, // 캔버스 절대 좌표 기준으로 그대로 겹쳐서 잘라내기 위함
        selectable: false, evented: false
      });
      below.clipPath = clonedClip;
      below._clipMaskRelativeMatrix = relativeMatrix; // 그룹째로 옮길 때 클립을 다시 맞추기 위한 기준값
      below.dirty = true;

      // 마스크로 쓴 모양/패스는 지우지 않고, 이미지 바로 뒤(한 단계 아래)로 보냄
      // — 지금 shapeObj와 below는 레이어상 바로 붙어있으므로(한 단계 차이) sendBackwards
      // 한 번이면 정확히 둘의 순서가 뒤바뀜(이미지가 위, 모양이 그 바로 아래)
      canvas.sendBackwards(shapeObj);

      canvas.setActiveObject(below);
      canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    });
  }

  /* ============================================================
     클리핑 마스크가 걸린 오브젝트를 "묶어서(그룹/다중선택)" 통째로 옮기거나 회전·크기
     조절하면, 클립(마스크 경계)은 그룹의 자식이 아니라서 같이 안 따라오고 원래 자리에
     그대로 남아 이미지가 모양을 벗어나 보이는 문제가 있었음. 그룹/다중선택 전체가 변형될
     때만(개별 이미지 하나만 따로 조절할 때는 기존처럼 클립이 고정된 채로 그대로 있어야
     하므로 제외) 저장해둔 상대 변환행렬을 이용해 클립을 다시 계산해서 맞춰줌.
  ============================================================ */
  function syncClipsForGroupTransform(groupObj){
    if (!groupObj || (groupObj.type !== 'group' && groupObj.type !== 'activeSelection')) return;
    var members = groupObj.getObjects ? groupObj.getObjects() : [];
    var changed = false;
    members.forEach(function(o){
      if (o && o.clipPath && o.clipPath.absolutePositioned && o._clipMaskRelativeMatrix) {
        var ownerMatrix = o.calcTransformMatrix(); // 그룹 변환까지 포함된 현재 절대 변환
        var newMatrix = fabric.util.multiplyTransformMatrices(ownerMatrix, o._clipMaskRelativeMatrix);
        var opts = fabric.util.qrDecompose(newMatrix);
        o.clipPath.set({
          left: opts.translateX, top: opts.translateY,
          scaleX: opts.scaleX, scaleY: opts.scaleY,
          angle: opts.angle, skewX: opts.skewX, skewY: opts.skewY,
          originX: 'center', originY: 'center'
        });
        o.dirty = true;
        changed = true;
      }
    });
    if (changed) EP.canvas.requestRenderAll();
  }
  EP.canvas.on('object:scaling', function(opt){ syncClipsForGroupTransform(opt.target); });
  EP.canvas.on('object:rotating', function(opt){ syncClipsForGroupTransform(opt.target); });
  EP.canvas.on('object:modified', function(opt){ syncClipsForGroupTransform(opt.target); });
  if (kClipMaskBtn) {
    kClipMaskBtn.addEventListener('click', function(){
      if (!kTarget) return;
      var applyTo = kTarget;
      hideKPopover();
      applyClippingMask(applyTo);
    });
  }

  var kControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: 20, offsetY: -36, // T가 텍스트 전용이라 도형/패스에서는 비어있는 자리라 그대로 재사용(M/J와도 안 겹침)
    sizeX: 28, sizeY: 28, // 그려지는 원(지름28) 전체가 클릭 영역이 되도록 맞춤
    cursorStyle: 'pointer',
    render: renderKButton,
    mouseUpHandler: function(eventData, transformData){
      var target = transformData && transformData.target;
      if (!isKTarget(target)) return true;
      if (target.isEditing) target.exitEditing();
      if (!kPopover.classList.contains('hidden') && kTarget === target) { hideKPopover(); return true; } // 다시 누르면 토글로 닫힘
      openKPopover(target);
      return true;
    }
  });

  // 모양(도형)과 펜 도구 패스가 쓰는 4개 프로토타입 전부에 붙임 — M('qa')과 동일한 대상 범위.
  // 'kStroke'라는 별도 키라서 M('qa')·J('qj')와 동시에 붙어있어도 서로 안 겹침.
  fabric.Rect.prototype.controls = Object.assign({}, fabric.Rect.prototype.controls, { kStroke: kControl });
  fabric.Circle.prototype.controls = Object.assign({}, fabric.Circle.prototype.controls, { kStroke: kControl });
  fabric.Triangle.prototype.controls = Object.assign({}, fabric.Triangle.prototype.controls, { kStroke: kControl });
  fabric.Path.prototype.controls = Object.assign({}, fabric.Path.prototype.controls, { kStroke: kControl });

  // 다른 오브젝트를 선택하거나 선택을 해제하면 팝업을 자동으로 닫음(그대로 열어두면
  // 엉뚱한 오브젝트를 고치게 될 수 있어서)
  function closeIfTargetChanged(){
    if (!kTarget) return;
    if (EP.canvas.getActiveObject() !== kTarget) hideKPopover();
  }
  EP.canvas.on('selection:created', closeIfTargetChanged);
  EP.canvas.on('selection:updated', closeIfTargetChanged);
  EP.canvas.on('selection:cleared', hideKPopover);

  // 이 파일이 쓰는 클립마스크 위치 기준값을 중앙 레지스트리에 등록 — 실행취소·저장·
  // SVG내보내기·복제에 자동으로 반영됨.
  if (EP.registerCustomObjectProps) {
    EP.registerCustomObjectProps(['_clipMaskRelativeMatrix']);
  }
})();
