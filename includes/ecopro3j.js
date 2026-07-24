/* ecopro3j.js — "J" 버튼 + 공통필터(그림자/외부광선/그라디언트/엠보스/테두리/배경) 패널
   로딩 순서: ecopro3.js -> ecopro3table.js -> ecopro3c.js -> ecopro3m.js -> ecopro3j.js -> ecopro3text.js -> ...
   P(텍스트 전용 큰 필터 목록)·M(도형/텍스트 모양필터)과 완전히 별개의 컨트롤/팝업/상태를 가짐.
   인터페이스 구조(닫기버튼 + 드롭다운 + 상세조절 + 끄기버튼, 드래그·회전 가능한 팝업)는 P와
   비슷하지만, 이 버튼은 "랜덤 적용(주사위)" 기능이 없음 — 사용자가 직접 하나씩 골라 적용함.
   도형(사각형/원/삼각형/펜도구 패스)·텍스트·이미지 세 종류 모두에 붙음 — 도형에선 M 버튼과,
   텍스트에선 P 버튼과, 이미지에선 Z 버튼(ecopro3z.js, 이미지 전용 블렌드필터)과 같은 줄에
   나란히 뜸(모두 P/M 자리 바로 왼쪽인 -46 위치). */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  EP.qaJTargets = [];

  var isShapeObject = EP.isShapeObject;
  var isImageObject = EP.isImageObject || function(o){ return !!o && o.type === 'image'; };
  // J버튼이 도형·텍스트뿐 아니라 이미지 오브젝트에도 붙으므로, 대상 판별을 셋 다로 넓힘
  function isShapeOrText(o){ return isShapeObject(o) || isImageObject(o) || (EP.isTextObject && EP.isTextObject(o)); }
  var isTableRelatedTarget = EP.isTableRelatedTarget || function(){ return false; };

  /* ============================================================
     J 버튼 컨트롤 — M과 같은 줄(offsetY:-36)에, M보다 더 왼쪽(offsetX:-46)에 배치.
  ============================================================ */
  function renderJButton(ctx, left, top, styleOverride, fabricObject){
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
    ctx.fillStyle = '#9B7FD4';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('J', 0, 1);
    ctx.restore();
  }

  const jControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: -46, offsetY: -36, // M(-14) 바로 왼쪽
    cursorStyle: 'pointer',
    render: renderJButton,
    mouseUpHandler: function(eventData, transformData){
      const target = transformData && transformData.target;
      if (!target || isTableRelatedTarget(target)) return true;
      if (!qaJPopover.classList.contains('hidden')) { hideQaJPopover(); return true; } // 이미 열려있으면 다시 눌렀을 때 닫힘(토글)
      openQaJPopover(target);
      return true;
    }
  });

  // 도형(사각형/원/삼각형/펜도구 패스) 전용 — 'qj' 라는 별도 키라서 M('qa')과 동시에 붙어있어도 안 겹침
  fabric.Rect.prototype.controls = Object.assign({}, fabric.Rect.prototype.controls, { qj: jControl });
  fabric.Circle.prototype.controls = Object.assign({}, fabric.Circle.prototype.controls, { qj: jControl });
  fabric.Triangle.prototype.controls = Object.assign({}, fabric.Triangle.prototype.controls, { qj: jControl });
  fabric.Path.prototype.controls = Object.assign({}, fabric.Path.prototype.controls, { qj: jControl });
  // 텍스트 오브젝트에도 동일한 컨트롤을 붙임 — P가 -14 자리를 쓰므로 J는 그대로 -46(같은 위치 규칙)이라 안 겹침
  fabric.IText.prototype.controls = Object.assign({}, fabric.IText.prototype.controls, { qj: jControl });
  // 이미지 오브젝트에도 붙임(요청: 불러온 이미지도 다른 오브젝트처럼 공통필터 J 버튼을 쓸 수 있게)
  fabric.Image.prototype.controls = Object.assign({}, fabric.Image.prototype.controls, { qj: jControl });

  /* ============================================================
     J 팝업 — P와 비슷한 구조(드롭다운으로 필터 선택 → 상세조절 표시)지만 주사위(랜덤) 없음.
  ============================================================ */
  const qaJPopover = document.getElementById('qaJPopover');
  const qaJFilterSelect = document.getElementById('qaJFilterSelect');
  const qaJDetails = {
    shadow: document.getElementById('qaJDetailShadow'),
    glow: document.getElementById('qaJDetailGlow'),
    gradient: document.getElementById('qaJDetailGradient'),
    emboss: document.getElementById('qaJDetailEmboss'),
    outline: document.getElementById('qaJDetailOutline'),
    bg: document.getElementById('qaJDetailBg')
  };
  function setActiveJFilterMenu(key){
    Object.keys(qaJDetails).forEach(function(k){ qaJDetails[k].classList.toggle('hidden', k !== key); });
  }
  qaJFilterSelect.addEventListener('change', function(){ setActiveJFilterMenu(qaJFilterSelect.value); });

  function hideQaJPopover(){ qaJPopover.classList.add('hidden'); EP.qaJTargets = []; }
  if (EP.registerFilterPopover) EP.registerFilterPopover(qaJPopover);

  function positionQaJPopover(target){
    qaJPopover.classList.remove('hidden');
    const pw = qaJPopover.offsetWidth || 200;
    const ph = qaJPopover.offsetHeight || 140;

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

    // T/P/M/Z 등 다른 필터 팝업이 이미 열려있어서 이 자리와 겹치면, 그 옆으로 자동으로 밀어서 배치
    if (EP.findNonOverlappingPosition) {
      const avoided = EP.findNonOverlappingPosition(qaJPopover, left, top, pw, ph);
      left = avoided.left; top = avoided.top;
    }

    const r = EP.clampPopoverRect(left, top, pw, ph, EP.canvasRotationDeg);
    qaJPopover.style.left = r.left + 'px';
    qaJPopover.style.top = r.top + 'px';
    EP.applyPopoverRotationStyle(qaJPopover);
  }

  function clampQaJPopoverToViewport(){
    const pw = qaJPopover.offsetWidth || 200;
    const ph = qaJPopover.offsetHeight || 140;
    const curLeft = parseFloat(qaJPopover.style.left) || 0;
    const curTop = parseFloat(qaJPopover.style.top) || 0;
    const r = EP.clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
    qaJPopover.style.left = r.left + 'px';
    qaJPopover.style.top = r.top + 'px';
  }

  // P(텍스트)/M(도형) 전용인 EP.qaTargetsFromTarget은 단일 오브젝트가 텍스트|도형일 때만 대상으로
  // 인정해서(이미지는 제외) 재사용하면 이미지 단일 선택 시 J팝업이 못 열림 -> J는 이미지도 포함하도록
  // 자체적으로 판별함. 그룹/활성선택(activeSelection)은 원래 로직과 동일하게 안의 오브젝트들을 그대로 씀.
  function jTargetsFromTarget(target){
    if (!target) return [];
    if (target.type === 'activeSelection' || target.type === 'group') {
      return target.getObjects().filter(function(o){ return !o.isGuide; }).filter(isShapeOrText);
    }
    if (target.isGuide) return [];
    return isShapeOrText(target) ? [target] : [];
  }

  const qaJPopulators = []; // openQaJPopover에서 전부 호출해서 현재 값 표시

  function openQaJPopover(target, opts){
    const boxes = jTargetsFromTarget(target);
    if (!boxes.length) return;
    const wasHidden = qaJPopover.classList.contains('hidden');
    EP.qaJTargets = boxes;

    const anchor = boxes[0];
    qaJPopulators.forEach(function(fn){ try { fn(anchor); } catch (e) { console.error('J populate error:', e); } });

    if (wasHidden) {
      qaJFilterSelect.value = '';
      Object.values(qaJDetails).forEach(function(d){ d.classList.add('hidden'); });
    }

    const reposition = !opts || opts.reposition !== false;
    if (reposition) {
      positionQaJPopover(target);
    } else {
      qaJPopover.classList.remove('hidden');
      clampQaJPopoverToViewport();
    }
  }

  document.getElementById('qaJPopoverCloseBtn').addEventListener('click', hideQaJPopover);

  // J 팝업이 열려있는 동안 다른 도형을 새로 선택하면 자동으로 그 대상으로 전환됨
  function syncQaJPopoverToSelection(){
    if (qaJPopover.classList.contains('hidden')) return;
    const active = EP.canvas.getActiveObject();
    if (isTableRelatedTarget(active)) return;
    const boxes = jTargetsFromTarget(active);
    if (!boxes.length) return;
    const sameTarget = boxes.length === EP.qaJTargets.length && boxes.every(function(o, i){ return o === EP.qaJTargets[i]; });
    if (sameTarget) return;
    openQaJPopover(active, { reposition: false });
  }
  EP.canvas.on('selection:created', syncQaJPopoverToSelection);
  EP.canvas.on('selection:updated', syncQaJPopoverToSelection);

  EP.makeDraggablePopover(qaJPopover);
  EP.registerRotatablePopover(qaJPopover);

  /* ============================================================
     공통필터 6개 — ecopro3c.js의 그림자/외부광선/그라디언트/엠보스/테두리/배경과 같은 효과를
     그대로 재구현(도형 전용이라 텍스트 분기 없이 항상 도형 방식으로 적용).
  ============================================================ */
  function makeShapeGradient(t, angleDeg, color1, color2){
    const w = t.width || 100, h = t.height || 40;
    const rad = angleDeg * Math.PI / 180;
    const cx = w / 2, cy = h / 2;
    const len = Math.sqrt(w * w + h * h) / 2;
    const dx = Math.cos(rad) * len, dy = Math.sin(rad) * len;
    return new fabric.Gradient({
      type: 'linear',
      coords: { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy },
      colorStops: [
        { offset: 0, color: color1 || '#3498db' },
        { offset: 1, color: color2 || '#e74c3c' }
      ]
    });
  }

  // ---- 그림자 ----
  const qaJShadowBlur = document.getElementById('qaJShadowBlur');
  const qaJShadowDist = document.getElementById('qaJShadowDist');
  const qaJShadowColor = document.getElementById('qaJShadowColor');
  // P쪽과 동일한 이유로 알파 대신 색을 흰색 쪽으로 섞어 밝게(연하게) 만드는 방식으로 "투명도" 구현
  function lightenColorJ(hex, opacityPct){
    const rgb = EP.hexToRgb(hex || '#000000') || { r: 0, g: 0, b: 0 };
    const t = Math.max(0, Math.min(100, opacityPct)) / 100;
    const mr = Math.round(rgb.r * t + 255 * (1 - t));
    const mg = Math.round(rgb.g * t + 255 * (1 - t));
    const mb = Math.round(rgb.b * t + 255 * (1 - t));
    return 'rgb(' + mr + ',' + mg + ',' + mb + ')';
  }

  const qaJShadowOpacity = document.getElementById('qaJShadowOpacity');
  function applyJShadow(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    const blur = parseFloat(qaJShadowBlur.value) || 0;
    const dist = parseFloat(qaJShadowDist.value) || 0;
    const opacity = qaJShadowOpacity.value === '' ? 100 : (parseFloat(qaJShadowOpacity.value) || 0);
    boxes.forEach(function(t){
      if (blur <= 0 && dist <= 0) {
        t.set('shadow', null);
        t.shadowOpacityValue = null;
        t.shadowBaseColorValue = null;
      } else {
        const off = dist / Math.SQRT2;
        t.set('shadow', new fabric.Shadow({ color: lightenColorJ(qaJShadowColor.value, opacity), blur: blur, offsetX: off, offsetY: off }));
        t.shadowOpacityValue = opacity;
        t.shadowBaseColorValue = qaJShadowColor.value || '#000000';
      }
    });
    EP.canvas.requestRenderAll();
  }
  qaJShadowBlur.addEventListener('input', applyJShadow);
  qaJShadowDist.addEventListener('input', applyJShadow);
  qaJShadowOpacity.addEventListener('input', applyJShadow);
  qaJShadowColor.addEventListener('input', applyJShadow);
  qaJShadowBlur.addEventListener('change', function(){ EP.pushHistory(); });
  qaJShadowDist.addEventListener('change', function(){ EP.pushHistory(); });
  qaJShadowOpacity.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaJShadowOffBtn').addEventListener('click', function(){
    qaJShadowBlur.value = 0; qaJShadowDist.value = 0;
    applyJShadow(); EP.pushHistory();
  });
  function populate_jShadow(anchor){
    const sh = anchor.shadow;
    qaJShadowBlur.value = sh ? (sh.blur || 0) : 0;
    qaJShadowDist.value = sh ? Math.round(Math.sqrt((sh.offsetX || 0) ** 2 + (sh.offsetY || 0) ** 2)) : 0;
    qaJShadowColor.value = sh ? (anchor.shadowBaseColorValue || EP.toHex(sh.color) || '#000000') : '#000000';
    qaJShadowOpacity.value = sh ? (anchor.shadowOpacityValue != null ? anchor.shadowOpacityValue : 100) : 100;
  }
  qaJPopulators.push(populate_jShadow);

  // ---- 외부광선 ----
  const qaJGlowBlur = document.getElementById('qaJGlowBlur');
  const qaJGlowColor = document.getElementById('qaJGlowColor');
  function applyJGlow(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    const blur = parseFloat(qaJGlowBlur.value) || 0;
    if (blur <= 0) {
      boxes.forEach(function(t){ t.set('shadow', null); });
    } else {
      boxes.forEach(function(t){ t.set('shadow', new fabric.Shadow({ color: qaJGlowColor.value || '#ffffff', blur: blur, offsetX: 0, offsetY: 0 })); });
    }
    EP.canvas.requestRenderAll();
  }
  qaJGlowBlur.addEventListener('input', applyJGlow);
  qaJGlowColor.addEventListener('input', applyJGlow);
  qaJGlowBlur.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaJGlowOffBtn').addEventListener('click', function(){
    qaJGlowBlur.value = 0;
    applyJGlow(); EP.pushHistory();
  });
  function populate_jGlow(anchor){
    const sh = anchor.shadow;
    qaJGlowBlur.value = sh ? (sh.blur || 0) : 0;
    qaJGlowColor.value = sh ? (EP.toHex(sh.color) || '#ffffff') : '#ffffff';
  }
  qaJPopulators.push(populate_jGlow);

  // ---- 그라디언트 ----
  const qaJGradColor1 = document.getElementById('qaJGradColor1');
  const qaJGradColor2 = document.getElementById('qaJGradColor2');
  const qaJGradAngle = document.getElementById('qaJGradAngle');
  function applyJGradient(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    const angle = parseFloat(qaJGradAngle.value) || 0;
    boxes.forEach(function(t){ t.set('fill', makeShapeGradient(t, angle, qaJGradColor1.value, qaJGradColor2.value)); });
    EP.canvas.requestRenderAll();
  }
  qaJGradColor1.addEventListener('input', applyJGradient);
  qaJGradColor2.addEventListener('input', applyJGradient);
  qaJGradAngle.addEventListener('input', applyJGradient);
  qaJGradColor1.addEventListener('input', function(){ EP.pushHistory(); });
  qaJGradColor2.addEventListener('input', function(){ EP.pushHistory(); });
  qaJGradAngle.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaJGradOffBtn').addEventListener('click', function(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    boxes.forEach(function(t){ t.set('fill', qaJGradColor1.value || '#222222'); });
    EP.canvas.requestRenderAll();
    EP.pushHistory();
  });
  function populate_jGradient(anchor){
    const isGrad = anchor.fill && typeof anchor.fill === 'object' && anchor.fill.colorStops;
    if (isGrad) {
      const stops = anchor.fill.colorStops;
      qaJGradColor1.value = EP.toHex(stops[0] && stops[0].color) || '#3498db';
      qaJGradColor2.value = EP.toHex(stops[1] && stops[1].color) || '#e74c3c';
      const co = anchor.fill.coords || {};
      const ang = Math.round(Math.atan2((co.y2 || 0) - (co.y1 || 0), (co.x2 || 0) - (co.x1 || 0)) * 180 / Math.PI);
      qaJGradAngle.value = ((ang % 360) + 360) % 360;
    } else {
      qaJGradColor1.value = EP.toHex(anchor.fill) || '#3498db';
      qaJGradColor2.value = '#e74c3c';
      qaJGradAngle.value = 0;
    }
  }
  qaJPopulators.push(populate_jGradient);

  // ---- 경사와 엠보스 ---- (도형 전용이라 항상 중앙정렬 stroke로 적용, 표 셀처럼 옆칸과 안 겹침)
  const qaJEmbossDepth = document.getElementById('qaJEmbossDepth');
  const qaJEmbossAngle = document.getElementById('qaJEmbossAngle');
  const qaJEmbossHighlight = document.getElementById('qaJEmbossHighlight');
  const qaJEmbossShadow = document.getElementById('qaJEmbossShadow');
  function applyJEmboss(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    const depth = parseFloat(qaJEmbossDepth.value) || 0;
    if (depth <= 0) {
      boxes.forEach(function(t){ t.set({ shadow: null, stroke: null, strokeWidth: 0, paintFirst: 'fill' }); });
    } else {
      const angle = parseFloat(qaJEmbossAngle.value) || 135;
      const rad = angle * Math.PI / 180;
      const dx = Math.cos(rad) * depth, dy = Math.sin(rad) * depth;
      boxes.forEach(function(t){
        const shadow = new fabric.Shadow({ color: qaJEmbossShadow.value || '#000000', blur: depth * 0.6, offsetX: dx, offsetY: dy });
        if (isShapeObject(t)) {
          t.set({ shadow: shadow, paintFirst: 'fill', stroke: qaJEmbossHighlight.value || '#ffffff', strokeWidth: Math.max(0.5, depth * 0.15) });
        } else {
          t.set({
            shadow: shadow,
            paintFirst: 'stroke',
            stroke: qaJEmbossHighlight.value || '#ffffff',
            strokeWidth: Math.max(0.5, depth * 0.15) * 2
          });
        }
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaJEmbossDepth.addEventListener('input', applyJEmboss);
  qaJEmbossAngle.addEventListener('input', applyJEmboss);
  qaJEmbossHighlight.addEventListener('input', applyJEmboss);
  qaJEmbossShadow.addEventListener('input', applyJEmboss);
  qaJEmbossDepth.addEventListener('change', function(){ EP.pushHistory(); });
  qaJEmbossAngle.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaJEmbossOffBtn').addEventListener('click', function(){
    qaJEmbossDepth.value = 0;
    applyJEmboss(); EP.pushHistory();
  });
  function populate_jEmboss(anchor){
    const embossDepth = anchor.strokeWidth ? Math.round(anchor.strokeWidth / 0.15) : 0;
    qaJEmbossDepth.value = embossDepth;
    qaJEmbossHighlight.value = EP.toHex(anchor.stroke) || '#ffffff';
    qaJEmbossShadow.value = (anchor.shadow && EP.toHex(anchor.shadow.color)) || '#000000';
    if (anchor.shadow) {
      const eang = Math.round(Math.atan2(anchor.shadow.offsetY || 0, anchor.shadow.offsetX || 0) * 180 / Math.PI);
      qaJEmbossAngle.value = ((eang % 360) + 360) % 360;
    } else {
      qaJEmbossAngle.value = 135;
    }
  }
  qaJPopulators.push(populate_jEmboss);

  // ---- 테두리 ---- (도형 전용, 항상 중앙정렬)
  const qaJOutlineWidth = document.getElementById('qaJOutlineWidth');
  const qaJOutlineColor = document.getElementById('qaJOutlineColor');
  function applyJOutline(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    const w = parseFloat(qaJOutlineWidth.value) || 0;
    if (w <= 0) {
      boxes.forEach(function(t){ t.set({ stroke: null, strokeWidth: 0, paintFirst: 'fill' }); });
    } else {
      boxes.forEach(function(t){
        if (isShapeObject(t)) {
          t.set({ paintFirst: 'fill', stroke: qaJOutlineColor.value || '#000000', strokeWidth: w });
        } else {
          t.set({ paintFirst: 'stroke', stroke: qaJOutlineColor.value || '#000000', strokeWidth: w * 2 });
        }
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaJOutlineWidth.addEventListener('input', applyJOutline);
  qaJOutlineColor.addEventListener('input', applyJOutline);
  qaJOutlineWidth.addEventListener('change', function(){ EP.pushHistory(); });
  document.getElementById('qaJOutlineOffBtn').addEventListener('click', function(){
    qaJOutlineWidth.value = 0;
    applyJOutline(); EP.pushHistory();
  });
  function populate_jOutline(anchor){
    qaJOutlineWidth.value = anchor.strokeWidth ? Math.round(anchor.strokeWidth) : 0;
    qaJOutlineColor.value = EP.toHex(anchor.stroke) || '#000000';
  }
  qaJPopulators.push(populate_jOutline);

  // ---- 배경(채우기) ----
  const qaJBgColor = document.getElementById('qaJBgColor');
  function applyJBg(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    boxes.forEach(function(t){
      if (isShapeObject(t)) t.set('fill', qaJBgColor.value || '#ffffff');
      else t.set('textBackgroundColor', qaJBgColor.value || '');
    });
    EP.canvas.requestRenderAll();
  }
  qaJBgColor.addEventListener('input', function(){ applyJBg(); EP.pushHistory(); });
  document.getElementById('qaJBgOffBtn').addEventListener('click', function(){
    const boxes = EP.qaJTargets.filter(isShapeOrText);
    if (!boxes.length) return;
    boxes.forEach(function(t){
      if (isShapeObject(t)) t.set('fill', '#ffffff');
      else t.set('textBackgroundColor', '');
    });
    EP.canvas.requestRenderAll();
    EP.pushHistory();
  });
  function populate_jBg(anchor){
    if (isShapeObject(anchor)) qaJBgColor.value = EP.toHex(anchor.fill) || '#cccccc';
    else qaJBgColor.value = anchor.textBackgroundColor ? (EP.toHex(anchor.textBackgroundColor) || '#ffffff') : '#ffffff';
  }
  qaJPopulators.push(populate_jBg);

  // ---- CMYK 색상 선택기 초기화 ----
  EP.initCmykPicker(qaJShadowColor);
  EP.initCmykPicker(qaJGlowColor);
  EP.initCmykPicker(qaJGradColor1);
  EP.initCmykPicker(qaJGradColor2);
  EP.initCmykPicker(qaJEmbossHighlight);
  EP.initCmykPicker(qaJEmbossShadow);
  EP.initCmykPicker(qaJOutlineColor);
  EP.initCmykPicker(qaJBgColor);

  EP.openQaJPopover = openQaJPopover;
  EP.hideQaJPopover = hideQaJPopover;
  EP.setActiveJFilterMenu = setActiveJFilterMenu;
  EP.qaJDetails = qaJDetails;
  EP.qaJFilterSelect = qaJFilterSelect;
})();
