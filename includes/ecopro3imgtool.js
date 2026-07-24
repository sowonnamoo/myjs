/* ecopro3imgtool.js — 이미지 전용 도구 3종
   로딩 순서: ecopro3.js -> ... -> ecopro3shape.js -> ecopro3imgtool.js -> ecopro3text.js -> ...
   (EP.canvas / EP.pushHistory가 이미 준비된 뒤에 로드돼야 함)

   1) 🪄 자동누끼(매직완드) — 클릭 지점과 색이 비슷한 인접 픽셀을 flood fill로 찾아 한 번에 투명하게
   2) ▭ 영역 지우기 — 지우고 싶은 부분을 마우스로 드래그해 사각형으로 선택한 뒤 "선택영역 지우기"를
      누르면, 그 영역만 주변 색으로 부드럽게 채워서 지움(글씨/워터마크 등 제거용). 자동으로 글자를
      찾는 대신, 사용자가 직접 지울 영역을 지정하는 방식.
   3) 🌫 가장자리블러 — 중심은 선명하게 두고 가장자리로 갈수록 점점 흐려지게 만듦(비네트 스타일)
   4) ✏️ 스케치 효과 — 사진을 연필로 그린 듯한 흑백 스케치 느낌으로 바꿈

   세 기능 모두 이미지 오브젝트를 선택했을 때만 동작하며, 원본 대신 픽셀 편집 가능한 <canvas>로
   바꿔치기해서 처리함(이후 밝기/대비 등 다른 이미지 보정을 적용해도 지운 내용이 되살아나지 않음). */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  function isImg(o){ return !!o && o.type === 'image'; }

  // 포토샵 마법봉 툴처럼 생긴 커서(막대 + 반짝임) — 십자(crosshair) 대신 사용.
  // 핫스팟(클릭 지점)은 반짝이는 별 끝부분에 맞춤.
  var MAGIC_WAND_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
    "<line x1='4' y1='21' x2='14' y2='11' stroke='black' stroke-width='2.5' stroke-linecap='round'/>" +
    "<line x1='4' y1='21' x2='14' y2='11' stroke='white' stroke-width='1' stroke-linecap='round'/>" +
    "<path d='M18 3 L19.3 6.7 L23 8 L19.3 9.3 L18 13 L16.7 9.3 L13 8 L16.7 6.7 Z' fill='black' stroke='white' stroke-width='0.5' stroke-linejoin='round'/>" +
    "<circle cx='9' cy='16' r='1.1' fill='black' stroke='white' stroke-width='0.4'/>" +
    "</svg>";
  var MAGIC_WAND_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(MAGIC_WAND_CURSOR_SVG) + '") 18 8, crosshair';

  // 이미지의 원본 엘리먼트(img 태그)를 픽셀 조작이 가능한 <canvas>로 한 번만 바꿔서 반환.
  // 이미 이 방식으로 만든 캔버스라면 그대로 재사용해서 이전 편집 내용이 사라지지 않게 함.
  function getEditableCanvasForImage(imgObj){
    var el = imgObj.getElement();
    if (el && el.tagName === 'CANVAS' && el.__isEditCanvas) return el;
    var w = imgObj.width, h = imgObj.height;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var cctx = c.getContext('2d');
    // 자르기(✂)를 먼저 적용한 이미지는 cropX/cropY가 "원본 소스에서 지금 보이는 영역이
    // 어디서부터 시작하는지"를 가리킴. 이걸 무시하고 그냥 원본 전체를 w×h 캔버스에 그리면
    // 잘려나간 부분까지 포함된 원본 전체가 찌그러져 들어가서, 그 뒤에 가장자리블러·스케치효과·
    // 자동누끼·워터마크삭제·이미지지우개 같은 기능을 쓰면 엉뚱하게 찌그러진 그림을 기준으로
    // 처리돼버리는 버그가 있었음 -> 소스 자르기 좌표(cropX/cropY, w, h)를 그대로 지정해서
    // "지금 실제로 보이는 영역"만 정확히 추출해 그림.
    var cropX = imgObj.cropX || 0, cropY = imgObj.cropY || 0;
    cctx.drawImage(el, cropX, cropY, w, h, 0, 0, w, h);
    c.__isEditCanvas = true;
    imgObj._element = c;
    imgObj._originalElement = c; // 필터를 다시 적용해도 편집 내용이 되살아나지 않도록 원본도 함께 교체
    // 이제 캔버스 자체가 "보이는 영역"만 담고 있으므로, 남아있던 크롭 오프셋은 리셋(안 하면
    // 다음 렌더링에서 이미 잘라낸 캔버스를 기준으로 또 한 번 잘라내는 이중 크롭이 됨)
    imgObj.cropX = 0; imgObj.cropY = 0;
    imgObj.perPixelTargetFind = false; // 투명해진 부분을 클릭해도 바운딩박스 기준으로 계속 선택되게 함
    return c;
  }

  // 캔버스(화면) 좌표를 이미지의 회전/확대·축소 이전 "원본 픽셀" 좌표로 변환
  function screenPointToImagePixel(imgObj, pt){
    var invMatrix = fabric.util.invertTransform(imgObj.calcTransformMatrix());
    var local = fabric.util.transformPoint(pt, invMatrix);
    return { x: local.x + imgObj.width / 2, y: local.y + imgObj.height / 2 };
  }

  /* ============================================================
     1. 자동누끼(매직완드)
  ============================================================ */
  var magicWandToggleBtn = document.getElementById('magicWandToggleBtn');
  var magicWandToleranceInput = document.getElementById('magicWandToleranceInput');
  var isMagicWandMode = false;
  var magicWandTargetImage = null;

  function setMagicWandMode(on){
    isMagicWandMode = on;
    magicWandToggleBtn.classList.toggle('on', on);
    if (on) {
      var obj = EP.canvas.getActiveObject();
      if (!isImg(obj)) { isMagicWandMode = false; magicWandToggleBtn.classList.remove('on'); return; }
      if (isMarqueeEraseMode) setMarqueeEraseMode(false);
      if (isEraseBrushMode) setEraseBrushMode(false);
      if (EP.exitEyedropperModes) EP.exitEyedropperModes();
      magicWandTargetImage = obj;
      // (선택을 풀면 오른쪽 이미지 패널 자체가 사라져서 슬라이더/버튼을 못 쓰게 되므로,
      // 선택은 그대로 유지하고, 대신 이미지 자체가 드래그/변형되지 않게만 잠가둠)
      obj.__prevSelectable = obj.selectable;
      obj.__prevHasControls = obj.hasControls;
      obj.set({ selectable: false, hasControls: false });
      EP.canvas.selection = false;
      EP.canvas.skipTargetFind = true;
      EP.canvas.defaultCursor = MAGIC_WAND_CURSOR;
      EP.canvas.hoverCursor = MAGIC_WAND_CURSOR;
      EP.canvas.requestRenderAll();
    } else {
      EP.canvas.selection = true;
      EP.canvas.skipTargetFind = false;
      EP.canvas.defaultCursor = 'default';
      EP.canvas.hoverCursor = 'move';
      if (magicWandTargetImage) {
        magicWandTargetImage.set({
          selectable: magicWandTargetImage.__prevSelectable !== false,
          hasControls: magicWandTargetImage.__prevHasControls !== false
        });
        EP.canvas.setActiveObject(magicWandTargetImage);
      }
      magicWandTargetImage = null;
      EP.canvas.requestRenderAll();
    }
  }
  magicWandToggleBtn.addEventListener('click', function(){ setMagicWandMode(!isMagicWandMode); });

  // 시드 지점과 색이 비슷한 인접 픽셀들을 flood fill로 찾아 전부 투명하게 만듦
  function magicWandRemove(imgObj, startX, startY, tolerancePercent){
    var c = getEditableCanvasForImage(imgObj);
    var ctx = c.getContext('2d');
    var w = c.width, h = c.height;
    startX = Math.floor(startX); startY = Math.floor(startY);
    if (startX < 0 || startY < 0 || startX >= w || startY >= h) return false;

    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;
    var startPixel = startY * w + startX;
    var startIdx = startPixel * 4;
    if (data[startIdx + 3] === 0) return false; // 이미 투명한 곳이면 아무 것도 안 함

    var startR = data[startIdx], startG = data[startIdx + 1], startB = data[startIdx + 2];
    var tol = (Math.max(0, Math.min(100, tolerancePercent)) / 100) * 441.7;

    var visited = new Uint8Array(w * h);
    var stack = [startPixel];
    visited[startPixel] = 1;
    var changed = false;

    while (stack.length) {
      var p = stack.pop();
      var x = p % w, y = (p - x) / w;
      var idx = p * 4;
      var dr = data[idx] - startR, dg = data[idx + 1] - startG, db = data[idx + 2] - startB;
      if (Math.sqrt(dr * dr + dg * dg + db * db) > tol) continue;

      data[idx + 3] = 0;
      changed = true;

      if (x + 1 < w && !visited[p + 1]) { visited[p + 1] = 1; stack.push(p + 1); }
      if (x - 1 >= 0 && !visited[p - 1]) { visited[p - 1] = 1; stack.push(p - 1); }
      if (y + 1 < h && !visited[p + w]) { visited[p + w] = 1; stack.push(p + w); }
      if (y - 1 >= 0 && !visited[p - w]) { visited[p - w] = 1; stack.push(p - w); }
    }

    if (changed) ctx.putImageData(imgData, 0, 0);
    imgObj.dirty = true;
    return changed;
  }

  EP.canvas.on('mouse:down', function(opt){
    if (!isMagicWandMode || !magicWandTargetImage) return;
    var pt = screenPointToImagePixel(magicWandTargetImage, EP.canvas.getPointer(opt.e));
    var tolerance = parseInt(magicWandToleranceInput.value, 10) || 30;
    var changed = magicWandRemove(magicWandTargetImage, pt.x, pt.y, tolerance);
    if (changed) {
      EP.canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    }
  });

  /* ============================================================
     2. 영역 지우기(마키 선택 인페인트)
     — 자동으로 글자를 찾는 대신, 드래그로 지울 영역을 직접 지정하는 방식으로 구현
  ============================================================ */
  var marqueeEraseToggleBtn = document.getElementById('marqueeEraseToggleBtn');
  var isMarqueeEraseMode = false;
  var marqueeTargetImage = null;
  var marqueeRectObj = null;
  var marqueeDragging = false;
  var marqueeStartPt = null;

  // 지우기 강도(자동 모드일 때 주변색과 섞는 정도) + 덮는 색상(자동/지정색) 옵션
  var marqueeEraseStrengthInput = document.getElementById('marqueeEraseStrengthInput');
  var marqueeEraseAutoModeBtn = document.getElementById('marqueeEraseAutoModeBtn');
  var marqueeEraseCustomModeBtn = document.getElementById('marqueeEraseCustomModeBtn');
  var marqueeEraseCustomColorRow = document.getElementById('marqueeEraseCustomColorRow');
  var marqueeEraseCustomColorInput = document.getElementById('marqueeEraseCustomColorInput');
  var marqueeEraseColorMode = 'auto'; // 'auto' | 'custom'
  if (EP.initCmykPicker) EP.initCmykPicker(marqueeEraseCustomColorInput);
  marqueeEraseCustomColorInput.value = '#ffffff';

  var marqueeEraseCustomColorEyedropBtn = document.getElementById('marqueeEraseCustomColorEyedropBtn');
  if (marqueeEraseCustomColorEyedropBtn) {
    marqueeEraseCustomColorEyedropBtn.addEventListener('click', function(){
      if (!EP.armMiniEyedropper) return;
      EP.armMiniEyedropper(marqueeEraseCustomColorEyedropBtn, function(colorHex){
        marqueeEraseCustomColorInput.value = colorHex;
      });
    });
  }

  function setMarqueeEraseColorMode(mode){
    marqueeEraseColorMode = mode;
    marqueeEraseAutoModeBtn.classList.toggle('on', mode === 'auto');
    marqueeEraseCustomModeBtn.classList.toggle('on', mode === 'custom');
    marqueeEraseCustomColorRow.classList.toggle('hidden', mode !== 'custom');
  }
  marqueeEraseAutoModeBtn.addEventListener('click', function(){ setMarqueeEraseColorMode('auto'); });
  marqueeEraseCustomModeBtn.addEventListener('click', function(){ setMarqueeEraseColorMode('custom'); });

  function clearMarqueeRectVisual(){
    if (marqueeRectObj) { EP.canvas.remove(marqueeRectObj); marqueeRectObj = null; }
  }

  function setMarqueeEraseMode(on){
    isMarqueeEraseMode = on;
    marqueeEraseToggleBtn.classList.toggle('on', on);
    if (on) {
      var obj = EP.canvas.getActiveObject();
      if (!isImg(obj)) { isMarqueeEraseMode = false; marqueeEraseToggleBtn.classList.remove('on'); return; }
      if (isMagicWandMode) setMagicWandMode(false);
      if (isEraseBrushMode) setEraseBrushMode(false);
      if (EP.exitEyedropperModes) EP.exitEyedropperModes();
      marqueeTargetImage = obj;
      // (선택을 풀면 오른쪽 이미지 패널 자체가 사라져서 버튼을 못 쓰게 되므로,
      // 선택은 그대로 유지하고, 대신 이미지 자체가 드래그/변형되지 않게만 잠가둠)
      obj.__prevSelectable = obj.selectable;
      obj.__prevHasControls = obj.hasControls;
      obj.set({ selectable: false, hasControls: false });
      EP.canvas.selection = false;
      EP.canvas.skipTargetFind = true;
      EP.canvas.defaultCursor = 'crosshair';
      EP.canvas.hoverCursor = 'crosshair';
      EP.canvas.requestRenderAll();
    } else {
      clearMarqueeRectVisual();
      EP.canvas.selection = true;
      EP.canvas.skipTargetFind = false;
      EP.canvas.defaultCursor = 'default';
      EP.canvas.hoverCursor = 'move';
      if (marqueeTargetImage) {
        marqueeTargetImage.set({
          selectable: marqueeTargetImage.__prevSelectable !== false,
          hasControls: marqueeTargetImage.__prevHasControls !== false
        });
        EP.canvas.setActiveObject(marqueeTargetImage);
      }
      marqueeTargetImage = null;
      EP.canvas.requestRenderAll();
    }
  }
  marqueeEraseToggleBtn.addEventListener('click', function(){ setMarqueeEraseMode(!isMarqueeEraseMode); });

  // 텍스트모양 메뉴의 "🧹 워터마크, 글씨영역 삭제하기" 빠른 진입 버튼 — 이미지 패널을 열지 않아도
  // 바로 영역 지우기 도구를 켤 수 있게 함(이미지가 선택 안 돼 있으면 먼저 선택하라고 안내)
  var quickMarqueeEraseBtn = document.getElementById('quickMarqueeEraseBtn');
  if (quickMarqueeEraseBtn) {
    quickMarqueeEraseBtn.addEventListener('click', function(){
      var obj = EP.canvas.getActiveObject();
      if (!isImg(obj)) {
        alert('먼저 워터마크·글씨를 지우고 싶은 이미지를 클릭해서 선택한 뒤 다시 눌러주세요.');
        return;
      }
      setMarqueeEraseMode(true);
    });
  }

  EP.canvas.on('mouse:down', function(opt){
    if (!isMarqueeEraseMode || !marqueeTargetImage) return;
    clearMarqueeRectVisual();
    marqueeStartPt = EP.canvas.getPointer(opt.e);
    marqueeDragging = true;
    marqueeRectObj = new fabric.Rect({
      left: marqueeStartPt.x, top: marqueeStartPt.y, width: 1, height: 1,
      fill: 'rgba(52,152,219,0.15)', stroke: '#3498db', strokeWidth: 1, strokeDashArray: [5, 4],
      selectable: false, evented: false
    });
    marqueeRectObj.isGuide = true; // 저장/선택/내보내기 대상에서 제외되는 표시(안내선과 같은 취급)
    EP.canvas.add(marqueeRectObj);
    EP.canvas.bringToFront(marqueeRectObj);
  });
  EP.canvas.on('mouse:move', function(opt){
    if (!isMarqueeEraseMode || !marqueeDragging || !marqueeRectObj) return;
    var p = EP.canvas.getPointer(opt.e);
    var left = Math.min(marqueeStartPt.x, p.x), top = Math.min(marqueeStartPt.y, p.y);
    var w = Math.abs(p.x - marqueeStartPt.x), h = Math.abs(p.y - marqueeStartPt.y);
    marqueeRectObj.set({ left: left, top: top, width: w, height: h });
    EP.canvas.requestRenderAll();
  });
  EP.canvas.on('mouse:up', function(){
    if (!isMarqueeEraseMode || !marqueeDragging) return;
    marqueeDragging = false;
    if (!marqueeRectObj || marqueeRectObj.width < 4 || marqueeRectObj.height < 4) {
      clearMarqueeRectVisual();
      return;
    }
    // 화면상 사각형의 네 모서리를 이미지 픽셀 좌표로 변환해서 축 정렬 바운딩 박스를 구함
    // (이미지가 회전돼 있어도 안전하게 동작하도록)
    var corners = [
      { x: marqueeRectObj.left, y: marqueeRectObj.top },
      { x: marqueeRectObj.left + marqueeRectObj.width, y: marqueeRectObj.top },
      { x: marqueeRectObj.left, y: marqueeRectObj.top + marqueeRectObj.height },
      { x: marqueeRectObj.left + marqueeRectObj.width, y: marqueeRectObj.top + marqueeRectObj.height }
    ].map(function(pt){ return screenPointToImagePixel(marqueeTargetImage, pt); });
    var xs = corners.map(function(c){ return c.x; });
    var ys = corners.map(function(c){ return c.y; });
    var rect = {
      x: Math.max(0, Math.floor(Math.min.apply(null, xs))),
      y: Math.max(0, Math.floor(Math.min.apply(null, ys))),
      w: Math.ceil(Math.max.apply(null, xs) - Math.min.apply(null, xs)),
      h: Math.ceil(Math.max.apply(null, ys) - Math.min.apply(null, ys))
    };
    var targetImg = marqueeTargetImage;

    // 확인 창으로 물어보고, 확인을 누르면 그 자리에서 바로 지운 뒤 도구를 꺼서
    // 원래의 "이미지 선택" 상태로 자동으로 돌아가게 함
    if (window.confirm('이곳의 워터마크나 글자를 지우겠습니까?')) {
      var c = getEditableCanvasForImage(targetImg);
      var ctx = c.getContext('2d');
      var w2 = c.width, h2 = c.height;
      var imgData = ctx.getImageData(0, 0, w2, h2);
      if (marqueeEraseColorMode === 'custom') {
        coverRectWithColor(imgData, rect, w2, h2, marqueeEraseCustomColorInput.value);
      } else {
        var strength = parseInt(marqueeEraseStrengthInput.value, 10) || 60;
        coverRectWithSurroundingColor(imgData, rect, w2, h2, strength);
      }
      ctx.putImageData(imgData, 0, 0);
      targetImg.dirty = true;
      EP.canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    }
    clearMarqueeRectVisual();
    setMarqueeEraseMode(false); // 지웠든 취소했든, 그리기가 끝나면 항상 선택 모드로 복귀
  });

  // 선택 사각형 안쪽을 직접 고른 색으로 그대로 덮어서 지움(자동 모드처럼 주변색을 읽지 않고,
  // 사용자가 고른 단일 색으로 flat하게 채움)
  function coverRectWithColor(imgData, rect, w, h, colorHex){
    var data = imgData.data;
    var col = hexToRgbLocal(colorHex);
    var x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
    var x1 = Math.min(w, rect.x + rect.w), y1 = Math.min(h, rect.y + rect.h);
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var o = (y * w + x) * 4;
        data[o] = col.r; data[o + 1] = col.g; data[o + 2] = col.b; data[o + 3] = 255;
      }
    }
  }

  // 선택 사각형 안쪽을 주변 색으로 부드럽게 채워서 지움(간단 인페인트: 이완법/diffusion)
  function coverRectWithSurroundingColor(imgData, rect, w, h, iterations){
    var data = imgData.data;
    var n = w * h;
    var mask = new Uint8Array(n);
    var x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
    var x1 = Math.min(w, rect.x + rect.w), y1 = Math.min(h, rect.y + rect.h);
    var fillIdx = [];
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var i = y * w + x;
        mask[i] = 1;
        fillIdx.push(i);
      }
    }
    if (!fillIdx.length) return;

    var sumR = 0, sumG = 0, sumB = 0, cnt = 0;
    for (var k0 = 0; k0 < n; k0++) {
      if (!mask[k0]) { var o0 = k0 * 4; sumR += data[o0]; sumG += data[o0 + 1]; sumB += data[o0 + 2]; cnt++; }
    }
    var avgR = cnt ? sumR / cnt : 255, avgG = cnt ? sumG / cnt : 255, avgB = cnt ? sumB / cnt : 255;

    var bufA = new Float32Array(n * 3);
    for (var i0 = 0; i0 < n; i0++) {
      var o = i0 * 4, o3 = i0 * 3;
      if (mask[i0]) { bufA[o3] = avgR; bufA[o3 + 1] = avgG; bufA[o3 + 2] = avgB; }
      else { bufA[o3] = data[o]; bufA[o3 + 1] = data[o + 1]; bufA[o3 + 2] = data[o + 2]; }
    }
    var bufB = new Float32Array(bufA);

    for (var iter = 0; iter < iterations; iter++) {
      var src = (iter % 2 === 0) ? bufA : bufB;
      var dst = (iter % 2 === 0) ? bufB : bufA;
      for (var k = 0; k < fillIdx.length; k++) {
        var i = fillIdx[k];
        var x2 = i % w, y2 = (i / w) | 0;
        var r = 0, g = 0, b = 0, c2 = 0;
        if (x2 > 0) { var j1 = (i - 1) * 3; r += src[j1]; g += src[j1 + 1]; b += src[j1 + 2]; c2++; }
        if (x2 < w - 1) { var j2 = (i + 1) * 3; r += src[j2]; g += src[j2 + 1]; b += src[j2 + 2]; c2++; }
        if (y2 > 0) { var j3 = (i - w) * 3; r += src[j3]; g += src[j3 + 1]; b += src[j3 + 2]; c2++; }
        if (y2 < h - 1) { var j4 = (i + w) * 3; r += src[j4]; g += src[j4 + 1]; b += src[j4 + 2]; c2++; }
        var od3 = i * 3;
        dst[od3] = r / c2; dst[od3 + 1] = g / c2; dst[od3 + 2] = b / c2;
      }
    }
    var final = (iterations % 2 === 0) ? bufA : bufB;
    for (var k1 = 0; k1 < fillIdx.length; k1++) {
      var ii = fillIdx[k1], oo = ii * 4, oo3 = ii * 3;
      data[oo] = final[oo3]; data[oo + 1] = final[oo3 + 1]; data[oo + 2] = final[oo3 + 2];
    }
  }

  /* ============================================================
     3. 🧽 이미지 지우개 — 브러시로 문지른 부분이 투명하게 지워짐. "브러시 크기" 슬라이더로
        지우는 원의 크기를 조절할 수 있음. 화면(스크린) 픽셀 기준으로 슬라이더 값을 받아서,
        이미지의 실제 확대/축소·캔버스 줌 배율을 반영해 이미지 원본 픽셀 좌표계로 환산한 뒤
        지움(그래서 이미지를 확대해서 작업해도 브러시가 화면에서 보이는 크기와 맞게 지워짐).
        마키(영역) 지우기와 달리 한 번 켜면 여러 번 계속 문질러 지울 수 있고, 버튼을 다시
        누르거나 Esc/다른 도구로 전환해야 꺼짐(자동누끼와 같은 "계속 쓰는 모드" 방식).
  ============================================================ */
  var eraseBrushToggleBtn = document.getElementById('eraseBrushToggleBtn');
  var eraseBrushSizeInput = document.getElementById('eraseBrushSizeInput');
  var isEraseBrushMode = false;
  var eraseBrushTargetImage = null;
  var eraseBrushDrawing = false;
  var eraseBrushLastPt = null; // 이미지 픽셀 좌표계 기준 마지막 지운 지점(선을 끊김 없이 잇기 위함)

  var ERASE_BRUSH_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
    "<circle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='1.6'/>" +
    "<circle cx='12' cy='12' r='9' fill='none' stroke='white' stroke-width='0.6'/>" +
    "</svg>";
  var ERASE_BRUSH_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(ERASE_BRUSH_CURSOR_SVG) + '") 12 12, crosshair';

  function setEraseBrushMode(on){
    isEraseBrushMode = on;
    eraseBrushToggleBtn.classList.toggle('on', on);
    if (on) {
      var obj = EP.canvas.getActiveObject();
      if (!isImg(obj)) { isEraseBrushMode = false; eraseBrushToggleBtn.classList.remove('on'); return; }
      if (isMagicWandMode) setMagicWandMode(false);
      if (isMarqueeEraseMode) setMarqueeEraseMode(false);
      if (EP.exitEyedropperModes) EP.exitEyedropperModes();
      eraseBrushTargetImage = obj;
      // (선택을 풀면 오른쪽 이미지 패널 자체가 사라져서 버튼을 못 쓰게 되므로,
      // 선택은 그대로 유지하고, 대신 이미지 자체가 드래그/변형되지 않게만 잠가둠)
      obj.__prevSelectable = obj.selectable;
      obj.__prevHasControls = obj.hasControls;
      obj.set({ selectable: false, hasControls: false });
      EP.canvas.selection = false;
      EP.canvas.skipTargetFind = true;
      EP.canvas.defaultCursor = ERASE_BRUSH_CURSOR;
      EP.canvas.hoverCursor = ERASE_BRUSH_CURSOR;
      EP.canvas.requestRenderAll();
    } else {
      if (eraseBrushTargetImage) {
        eraseBrushTargetImage.set({
          selectable: eraseBrushTargetImage.__prevSelectable !== false,
          hasControls: eraseBrushTargetImage.__prevHasControls !== false
        });
        EP.canvas.setActiveObject(eraseBrushTargetImage);
      }
      eraseBrushTargetImage = null;
      EP.canvas.selection = true;
      EP.canvas.skipTargetFind = false;
      EP.canvas.defaultCursor = 'default';
      EP.canvas.hoverCursor = 'move';
      EP.canvas.requestRenderAll();
    }
  }
  eraseBrushToggleBtn.addEventListener('click', function(){ setEraseBrushMode(!isEraseBrushMode); });

  // 화면(스크린) 기준 브러시 반지름을, 캔버스 줌·이미지 확대/축소를 반영해 이미지 원본
  // 픽셀 좌표계 기준 반지름으로 환산함(scaleX/scaleY 평균으로 대략 근사).
  function eraseBrushRadiusInImagePx(imgObj){
    var screenRadius = (parseFloat(eraseBrushSizeInput.value) || 30) / 2;
    var zoom = EP.canvas.getZoom() || 1;
    var avgScale = ((imgObj.scaleX || 1) + (imgObj.scaleY || 1)) / 2;
    return screenRadius / (zoom * avgScale);
  }

  function eraseCircleAt(canvasEl, px, py, radius){
    var ctx = canvasEl.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();
  }

  // 마우스가 빠르게 움직여도 점과 점 사이가 끊기지 않도록, 이전 지점부터 지금 지점까지
  // 반지름의 1/3 간격으로 원을 여러 개 찍어서 이어줌
  function eraseStrokeTo(canvasEl, fromPt, toPt, radius){
    var dx = toPt.x - fromPt.x, dy = toPt.y - fromPt.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var step = Math.max(1, radius / 3);
    var steps = Math.max(1, Math.ceil(dist / step));
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      eraseCircleAt(canvasEl, fromPt.x + dx * t, fromPt.y + dy * t, radius);
    }
  }

  EP.canvas.on('mouse:down', function(opt){
    if (!isEraseBrushMode || !eraseBrushTargetImage) return;
    var c = getEditableCanvasForImage(eraseBrushTargetImage);
    var pt = screenPointToImagePixel(eraseBrushTargetImage, EP.canvas.getPointer(opt.e));
    var radius = eraseBrushRadiusInImagePx(eraseBrushTargetImage);
    eraseCircleAt(c, pt.x, pt.y, radius);
    eraseBrushTargetImage.dirty = true;
    EP.canvas.requestRenderAll();
    eraseBrushDrawing = true;
    eraseBrushLastPt = pt;
  });
  EP.canvas.on('mouse:move', function(opt){
    if (!isEraseBrushMode || !eraseBrushDrawing || !eraseBrushTargetImage) return;
    var c = getEditableCanvasForImage(eraseBrushTargetImage);
    var pt = screenPointToImagePixel(eraseBrushTargetImage, EP.canvas.getPointer(opt.e));
    var radius = eraseBrushRadiusInImagePx(eraseBrushTargetImage);
    eraseStrokeTo(c, eraseBrushLastPt, pt, radius);
    eraseBrushTargetImage.dirty = true;
    EP.canvas.requestRenderAll();
    eraseBrushLastPt = pt;
  });
  EP.canvas.on('mouse:up', function(){
    if (!isEraseBrushMode || !eraseBrushDrawing) return;
    eraseBrushDrawing = false;
    eraseBrushLastPt = null;
    if (EP.pushHistory) EP.pushHistory(); // 한 번 문지른 스트로크가 끝날 때마다 히스토리 1개로 기록
  });

  /* ============================================================
     4. 가장자리 블러(비네트 스타일) — 사용자가 고른 색이 가장자리로 갈수록 부드럽게
        번져서(뿌려져서) 이미지가 그 색 쪽으로 흐려지며 사라지는 효과
  ============================================================ */
  var edgeBlurBtn = document.getElementById('edgeBlurBtn');
  var edgeBlurAmount = document.getElementById('edgeBlurAmount');
  var edgeBlurColorInput = document.getElementById('edgeBlurColorInput');
  if (EP.initCmykPicker) EP.initCmykPicker(edgeBlurColorInput);
  edgeBlurColorInput.value = '#ffffff';

  var edgeBlurColorEyedropBtn = document.getElementById('edgeBlurColorEyedropBtn');
  if (edgeBlurColorEyedropBtn) {
    edgeBlurColorEyedropBtn.addEventListener('click', function(){
      if (!EP.armMiniEyedropper) return;
      EP.armMiniEyedropper(edgeBlurColorEyedropBtn, function(colorHex){
        edgeBlurColorInput.value = colorHex;
      });
    });
  }

  function hexToRgbLocal(hex){
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#ffffff');
    if (!m) return { r: 255, g: 255, b: 255 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function applyEdgeBlur(obj, amount, colorHex){
    var c = getEditableCanvasForImage(obj);
    var w = obj.width, h = obj.height;
    if (!w || !h) return;
    var ctx = c.getContext('2d');
    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;

    var col = hexToRgbLocal(colorHex);

    var cx = w / 2, cy = h / 2;
    // 정도(amount)가 클수록 안쪽부터 더 일찍 번지기 시작해서 흐려지는 영역이 넓어짐
    var innerRatio = Math.max(0.12, 0.78 - amount * 0.06);
    var outerRatio = 1.0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = (x - cx) / cx, dy = (y - cy) / cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var t = (dist - innerRatio) / (outerRatio - innerRatio);
        t = Math.min(1, Math.max(0, t));
        t = t * t * (3 - 2 * t); // smoothstep — 경계가 부드럽게 이어지도록
        var o = (y * w + x) * 4;
        data[o] = data[o] + (col.r - data[o]) * t;
        data[o + 1] = data[o + 1] + (col.g - data[o + 1]) * t;
        data[o + 2] = data[o + 2] + (col.b - data[o + 2]) * t;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    obj.dirty = true;
    EP.canvas.requestRenderAll();
  }

  edgeBlurBtn.addEventListener('click', function(){
    var obj = EP.canvas.getActiveObject();
    if (!isImg(obj)) return;
    var originalLabel = edgeBlurBtn.textContent;
    edgeBlurBtn.disabled = true;
    edgeBlurBtn.textContent = '처리 중...';
    setTimeout(function(){
      try {
        applyEdgeBlur(obj, parseInt(edgeBlurAmount.value, 10) || 5, edgeBlurColorInput.value);
        if (EP.pushHistory) EP.pushHistory();
      } finally {
        edgeBlurBtn.disabled = false;
        edgeBlurBtn.textContent = originalLabel;
      }
    }, 20);
  });

  /* ============================================================
     5. ✏️ 스케치 효과 — 사진을 연필로 그린 듯한 흑백 스케치로 바꿈
     원리(전통적인 "연필 스케치" 알고리즘): 그레이스케일 -> 반전 -> 가우시안 블러 ->
     원본 그레이스케일과 "컬러닷지(color dodge)"로 합성. 밝은 면은 하얗게 날아가고
     경계(에지) 부분만 진하게 남아서 손으로 그린 선 느낌이 남. "스케치 강도"는 블러
     반경을 조절해서 선이 가늘고 또렷하게(약하게) / 두껍고 부드럽게(강하게) 바뀜.
  ============================================================ */
  var imgSketchBtn = document.getElementById('imgSketchBtn');
  var imgSketchAmount = document.getElementById('imgSketchAmount');

  // 1차원 박스블러(수평/수직 각각) — 여러 번 겹쳐 적용하면 가우시안 블러에 가까워짐
  function boxBlurH(src, w, h, r){
    var dst = new Float32Array(w * h);
    var win = 2 * r + 1;
    for (var y = 0; y < h; y++) {
      var rowOff = y * w, acc = 0, x;
      for (x = -r; x <= r; x++) acc += src[rowOff + Math.min(w - 1, Math.max(0, x))];
      dst[rowOff] = acc / win;
      for (x = 1; x < w; x++) {
        acc += src[rowOff + Math.min(w - 1, x + r)] - src[rowOff + Math.max(0, x - r - 1)];
        dst[rowOff + x] = acc / win;
      }
    }
    return dst;
  }
  function boxBlurV(src, w, h, r){
    var dst = new Float32Array(w * h);
    var win = 2 * r + 1;
    for (var x = 0; x < w; x++) {
      var acc = 0, y;
      for (y = -r; y <= r; y++) acc += src[Math.min(h - 1, Math.max(0, y)) * w + x];
      dst[x] = acc / win;
      for (y = 1; y < h; y++) {
        acc += src[Math.min(h - 1, y + r) * w + x] - src[Math.max(0, y - r - 1) * w + x];
        dst[y * w + x] = acc / win;
      }
    }
    return dst;
  }
  function approxGaussianBlur(src, w, h, r){
    // 박스블러를 두 번 겹쳐 적용해서 가우시안 블러에 근사시킴(가로->세로->가로->세로)
    var a = boxBlurV(boxBlurH(src, w, h, r), w, h, r);
    return boxBlurV(boxBlurH(a, w, h, r), w, h, r);
  }

  function applyPencilSketch(obj, strength){
    var c = getEditableCanvasForImage(obj);
    var w = obj.width, h = obj.height;
    if (!w || !h) return;
    var ctx = c.getContext('2d');
    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;
    var n = w * h;

    var gray = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      gray[i] = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    }

    var inv = new Float32Array(n);
    for (i = 0; i < n; i++) inv[i] = 255 - gray[i];

    // 강도(1~10)를 이미지 크기에 비례한 블러 반경으로 변환 — 이미지가 커도 선 굵기가 비슷하게 느껴지도록
    var radius = Math.max(1, Math.round((Math.min(w, h) * 0.01) * strength));
    var blurred = approxGaussianBlur(inv, w, h, radius);

    for (i = 0; i < n; i++) {
      var b = blurred[i];
      var val = b >= 255 ? 255 : Math.min(255, (gray[i] * 256) / (256 - b));
      var o2 = i * 4;
      data[o2] = data[o2 + 1] = data[o2 + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);
    obj.dirty = true;
    EP.canvas.requestRenderAll();
  }

  imgSketchBtn.addEventListener('click', function(){
    var obj = EP.canvas.getActiveObject();
    if (!isImg(obj)) return;
    var originalLabel = imgSketchBtn.textContent;
    imgSketchBtn.disabled = true;
    imgSketchBtn.textContent = '처리 중...';
    setTimeout(function(){
      try {
        applyPencilSketch(obj, parseInt(imgSketchAmount.value, 10) || 4);
        if (EP.pushHistory) EP.pushHistory();
      } finally {
        imgSketchBtn.disabled = false;
        imgSketchBtn.textContent = originalLabel;
      }
    }, 20);
  });

  // (참고: 예전엔 여기서 'selection:cleared' 시 모드를 자동으로 껐는데, 모드 진입 시 우리가
  // 직접 호출하는 canvas.discardActiveObject() 자체가 그 이벤트를 발생시켜서 켜자마자 바로
  // 꺼져버리는 버그가 있었음 — 그래서 제거함. skipTargetFind로 이미 다른 선택은 막혀있음.

  // Esc로도 세 도구 모드를 빠져나올 수 있게 함(자동누끼·지우개는 여러 번 계속 쓰는 도구라
  // 자동으로는 안 꺼지므로, 다 쓴 뒤 빠져나오는 확실한 방법이 필요함)
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if (isMagicWandMode) setMagicWandMode(false);
    if (isMarqueeEraseMode) setMarqueeEraseMode(false);
    if (isEraseBrushMode) setEraseBrushMode(false);
  });

  // 상단 툴바의 "선택" 도구가 항상 확실하게 정상 선택 상태로 되돌릴 수 있도록 노출.
  // (도구 모드가 켜진 채로 남아있으면 skipTargetFind가 true로 고정돼서 아무 것도 선택이 안
  // 되는데, 기존 "선택" 버튼은 이걸 모르고 있어서 안 풀리는 문제가 있었음 — 이 함수로 해결)
  EP.exitImageToolModes = function(){
    if (isMagicWandMode) setMagicWandMode(false);
    if (isMarqueeEraseMode) setMarqueeEraseMode(false);
    if (isEraseBrushMode) setEraseBrushMode(false);
    // 혹시 위 모드들이 다 꺼진 상태인데도 어떤 이유로 skipTargetFind가 남아있는 경우까지 대비한 안전장치
    EP.canvas.skipTargetFind = false;
    EP.canvas.selection = true;
  };
})();
