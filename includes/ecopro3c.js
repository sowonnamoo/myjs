/* ecopro3c.js — 공통적용 필터(그림자/외부광선/그라디언트/엠보스/테두리/배경) + 필터 패널 공용 인프라
   로딩 순서: ecopro3.js(코어) -> ecopro3c.js -> ecopro3text.js -> ecopro3l.js */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  EP.filterRegistry = EP.filterRegistry || [];
  EP.registerFilter = EP.registerFilter || function(def){ EP.filterRegistry.push(def); };
  EP.qaTargets = [];
  var canvas = EP.canvas, pushHistory = EP.pushHistory, isTextObject = EP.isTextObject,
      isShapeObject = EP.isShapeObject, toHex = EP.toHex, textBoxesFromTarget = EP.textBoxesFromTarget;
  // 그림자/외부광선/그라디언트/엠보스/테두리/배경 6개는 "공통 효과"라 텍스트뿐 아니라
  // 도형(사각형/원/삼각형 및 표의 셀 박스)에도 그대로 적용됨.
  function isTextOrShape(o){ return isTextObject(o) || isShapeObject(o); }
  // 표(표 그룹 전체, 개별 셀, 편집모드 중 셀 다중선택)는 P버튼 필터 기능 대상에서 완전히 제외함.
  function isTableRelatedTarget(o){
    if (!o) return false;
    if (o.isTableGroup || o.isTableCell || o.isTableCellText) return true;
    if ((o.type === 'activeSelection' || o.type === 'group') && typeof o.getObjects === 'function') {
      return o.getObjects().some(function(c){ return c && (c.isTableCell || c.isTableCellText); });
    }
    return false;
  }

  /* ============================================================
     2c-2. T버튼 좌측 "P" 버튼 컨트롤 → 필터(그림자/외곽선/배경) 메뉴
     - T와 동일한 크기·구조의 원형 버튼을 T 바로 왼쪽에 배치
     - 메뉴(그림자/외곽선/배경) 중 하나를 선택하면 그 메뉴의 상세 조절값만
       아래에 나타나고, 다른 메뉴를 선택하면 이전 것은 사라지고 새 것으로 교체됨
  ============================================================ */
  (function setupFilterControl(){
    function renderPButton(ctx, left, top, styleOverride, fabricObject){
      if (isTableRelatedTarget(fabricObject)) return;
      if (fabricObject && (fabricObject.type === 'activeSelection' || fabricObject.type === 'group')) {
        const objs = fabricObject.getObjects().filter(o => !o.isGuide);
        if (objs.length < 2) return;
      }
      ctx.save();
      ctx.translate(left, top);
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#e67e22';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', 0, 1);
      ctx.restore();
    }

    const pControl = new fabric.Control({
      x: 0.5, y: -0.5,
      offsetX: -14, offsetY: -36, // T버튼(offsetX:20) 바로 왼쪽, 같은 줄
      cursorStyle: 'pointer',
      render: renderPButton,
      mouseUpHandler: function(eventData, transformData){
        const target = transformData && transformData.target;
        if (target && !isTableRelatedTarget(target)) openQaPopover(target);
        return true;
      }
    });

    fabric.IText.prototype.controls = Object.assign({}, fabric.IText.prototype.controls, { qa: pControl });
    fabric.ActiveSelection.prototype.controls = Object.assign({}, fabric.ActiveSelection.prototype.controls, { qa: pControl });
    fabric.Group.prototype.controls = Object.assign({}, fabric.Group.prototype.controls, { qa: pControl });
    // 도형(사각형/원/삼각형/펜도구 패스)도 단독으로 P 버튼을 눌러 모양필터(그림자/그라디언트 등)를 열 수 있게 함
    fabric.Rect.prototype.controls = Object.assign({}, fabric.Rect.prototype.controls, { qa: pControl });
    fabric.Circle.prototype.controls = Object.assign({}, fabric.Circle.prototype.controls, { qa: pControl });
    fabric.Triangle.prototype.controls = Object.assign({}, fabric.Triangle.prototype.controls, { qa: pControl });
    fabric.Path.prototype.controls = Object.assign({}, fabric.Path.prototype.controls, { qa: pControl });
  })();

  const qaPopover = document.getElementById('qaPopover');
  // EP.qaTargets 는 파일 상단에서 이미 초기화됨 (T버튼과 동일한 방식: 창을 여는 시점의 대상을 그대로 붙잡아둠)

  function hideQaPopover(){ qaPopover.classList.add('hidden'); EP.qaTargets = []; }

  // T버튼 팝오버와 동일한 방식: 오브젝트 중앙 아래쪽에 표시 (공간 부족하면 위쪽)
  function positionQaPopover(target){
    qaPopover.classList.remove('hidden');
    const pw = qaPopover.offsetWidth || 200;
    const ph = qaPopover.offsetHeight || 140;

    // T(글꼴) 창이 같이 열려있으면: 그 오른쪽에 나란히 붙이고,
    // 오른쪽 공간이 부족하면 바로 아래로, 그마저 부족하면 위로 배치 (드래그해서 옮긴 위치 기준)
    if (!EP.fontPopover.classList.contains('hidden')) {
      const tRect = EP.fontPopover.getBoundingClientRect();
      let left = tRect.right + 12;
      let top = tRect.top;
      if (left + pw > window.innerWidth - 8) {
        left = tRect.left;
        top = tRect.bottom + 12;
        if (top + ph > window.innerHeight - 8) top = tRect.top - ph - 12;
      }
      left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
      top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);
      qaPopover.style.left = left + 'px';
      qaPopover.style.top = top + 'px';
      return;
    }

    // T가 열려있지 않으면: 기존처럼 오브젝트 중앙 아래쪽(공간 부족하면 위쪽)
    const br = target.getBoundingRect(true, true); // 캔버스 논리좌표(줌 반영 전)
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
    if (top + ph > window.innerHeight - 8) top = objTop - ph - 14; // 아래 공간 부족하면 위쪽에 표시

    left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - ph - 8);
    qaPopover.style.left = left + 'px';
    qaPopover.style.top = top + 'px';
  }

  // ---- 메뉴(그림자/배경 ... 계속 추가될 예정) ↔ 상세조절 아코디언 ----
  // 버튼을 나열하는 방식 대신 드롭다운 메뉴로 — 필터 종류가 계속 늘어나도 팝오버 폭이 길어지지 않음
  const qaFilterSelect = document.getElementById('qaFilterSelect');
  const qaDetails = {
    shadow: document.getElementById('qaDetailShadow'),
    glow: document.getElementById('qaDetailGlow'),
    light: document.getElementById('qaDetailLight'),
    gradient: document.getElementById('qaDetailGradient'),
    emboss: document.getElementById('qaDetailEmboss'),
    outline: document.getElementById('qaDetailOutline'),
    doubleOutline: document.getElementById('qaDetailDoubleOutline'),
    glitch: document.getElementById('qaDetailGlitch'),
    tear: document.getElementById('qaDetailTear'),
    melt: document.getElementById('qaDetailMelt'),
    speed: document.getElementById('qaDetailSpeed'),
    reflection: document.getElementById('qaDetailReflection'),
    crack: document.getElementById('qaDetailCrack'),
    tile: document.getElementById('qaDetailTile'),
    footprint: document.getElementById('qaDetailFootprint'),
    animal: document.getElementById('qaDetailAnimal'),
    seafood: document.getElementById('qaDetailSeafood'),
    fruitveg: document.getElementById('qaDetailFruitVeg'),
    heart: document.getElementById('qaDetailHeart'),
    coffee: document.getElementById('qaDetailCoffee'),
    sports: document.getElementById('qaDetailSports'),
    club: document.getElementById('qaDetailClub'),
    snow: document.getElementById('qaDetailSnow'),
    rain: document.getElementById('qaDetailRain'),
    splash: document.getElementById('qaDetailSplash'),
    threeD: document.getElementById('qaDetail3D'),
    metal: document.getElementById('qaDetailMetal'),
    fire: document.getElementById('qaDetailFire'),
    circular: document.getElementById('qaDetailCircular'),
    vertical: document.getElementById('qaDetailVertical'),
    postal: document.getElementById('qaDetailPostal'),
    puffy: document.getElementById('qaDetailPuffy'),
    vine: document.getElementById('qaDetailVine'),
    roll: document.getElementById('qaDetailRoll'),
    perspective: document.getElementById('qaDetailPerspective'),
    curve: document.getElementById('qaDetailCurve'),
    wave: document.getElementById('qaDetailWave'),
    train: document.getElementById('qaDetailTrain'),
    tired: document.getElementById('qaDetailTired'),
    spiral: document.getElementById('qaDetailSpiral'),
    magazine: document.getElementById('qaDetailMagazine'),
    puzzle: document.getElementById('qaDetailPuzzle'),
    sky: document.getElementById('qaDetailSky'),
    shy: document.getElementById('qaDetailShy'),
    chalk: document.getElementById('qaDetailChalk'),
    grass: document.getElementById('qaDetailGrass'),
    bigbang: document.getElementById('qaDetailBigbang'),
    event: document.getElementById('qaDetailEvent'),
    golf: document.getElementById('qaDetailGolf'),
    popart: document.getElementById('qaDetailPopart'),
    inktrap: document.getElementById('qaDetailInktrap'),
    leafvine: document.getElementById('qaDetailLeafvine'),
    sakura: document.getElementById('qaDetailSakura'),
    randomTypo: document.getElementById('qaDetailRandomTypo'),
    zebra: document.getElementById('qaDetailZebra'),
    translate: document.getElementById('qaDetailTranslate'),
    typo: document.getElementById('qaDetailTypo'),
    bg: document.getElementById('qaDetailBg'),
    bubble: document.getElementById('qaDetailBubble')
  };
  function setActiveFilterMenu(key){
    Object.keys(qaDetails).forEach(k => qaDetails[k].classList.toggle('hidden', k !== key));
  }
  qaFilterSelect.addEventListener('change', () => setActiveFilterMenu(qaFilterSelect.value));


  // ---- 그림자 ---- (EP.qaTargets 중 텍스트에만 동일하게 적용: 단일 선택이면 그 하나, 다중선택이면 텍스트 전부)
  const qaShadowBlur = document.getElementById('qaShadowBlur');
  const qaShadowDist = document.getElementById('qaShadowDist');
  const qaShadowColor = document.getElementById('qaShadowColor');
  function applyQaShadow(){
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    const blur = parseFloat(qaShadowBlur.value) || 0;
    const dist = parseFloat(qaShadowDist.value) || 0;
    boxes.forEach(t => {
      if (blur <= 0 && dist <= 0) {
        t.set('shadow', null);
      } else {
        const off = dist / Math.SQRT2;
        t.set('shadow', new fabric.Shadow({ color: qaShadowColor.value || '#000000', blur, offsetX: off, offsetY: off }));
      }
    });
    EP.canvas.requestRenderAll();
  }
  qaShadowBlur.addEventListener('input', applyQaShadow);
  qaShadowDist.addEventListener('input', applyQaShadow);
  qaShadowColor.addEventListener('input', applyQaShadow);
  qaShadowBlur.addEventListener('change', () => EP.pushHistory());
  qaShadowDist.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaShadowOffBtn').addEventListener('click', () => {
    qaShadowBlur.value = 0; qaShadowDist.value = 0;
    applyQaShadow(); EP.pushHistory();
  });


  // ---- 외부광선 ---- (그림자와 같은 shadow 슬롯을 쓰되, 방향 없이(offset 0) 사방으로 은은하게 퍼지는 광선)
  const qaGlowBlur = document.getElementById('qaGlowBlur');
  const qaGlowColor = document.getElementById('qaGlowColor');
  function applyQaGlow(){
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    const blur = parseFloat(qaGlowBlur.value) || 0;
    if (blur <= 0) {
      boxes.forEach(t => t.set('shadow', null));
    } else {
      boxes.forEach(t => t.set('shadow', new fabric.Shadow({ color: qaGlowColor.value || '#ffffff', blur, offsetX: 0, offsetY: 0 })));
    }
    EP.canvas.requestRenderAll();
  }
  qaGlowBlur.addEventListener('input', applyQaGlow);
  qaGlowColor.addEventListener('input', applyQaGlow);
  qaGlowBlur.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaGlowOffBtn').addEventListener('click', () => {
    qaGlowBlur.value = 0;
    applyQaGlow(); EP.pushHistory();
  });


  // ---- 그라디언트 ----
  const qaGradColor1 = document.getElementById('qaGradColor1');
  const qaGradColor2 = document.getElementById('qaGradColor2');
  const qaGradAngle = document.getElementById('qaGradAngle');
  function makeTextGradient(t, angleDeg, color1, color2){
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
  function applyQaGradient(){
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    const angle = parseFloat(qaGradAngle.value) || 0;
    boxes.forEach(t => t.set('fill', makeTextGradient(t, angle, qaGradColor1.value, qaGradColor2.value)));
    EP.canvas.requestRenderAll();
  }
  qaGradColor1.addEventListener('input', applyQaGradient);
  qaGradColor2.addEventListener('input', applyQaGradient);
  qaGradAngle.addEventListener('input', applyQaGradient);
  qaGradColor1.addEventListener('input', () => EP.pushHistory());
  qaGradColor2.addEventListener('input', () => EP.pushHistory());
  qaGradAngle.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaGradOffBtn').addEventListener('click', () => {
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    boxes.forEach(t => t.set('fill', qaGradColor1.value || '#222222'));
    EP.canvas.requestRenderAll();
    EP.pushHistory();
  });


  // ---- 경사와 엠보스 ---- (그림자 슬롯을 재사용해 어두운 쪽을 만들고, 얇은 밝은 테두리로 튀어나온 느낌을 냄)
  const qaEmbossDepth = document.getElementById('qaEmbossDepth');
  const qaEmbossAngle = document.getElementById('qaEmbossAngle');
  const qaEmbossHighlight = document.getElementById('qaEmbossHighlight');
  const qaEmbossShadow = document.getElementById('qaEmbossShadow');
  function applyQaEmboss(){
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    const depth = parseFloat(qaEmbossDepth.value) || 0;
    if (depth <= 0) {
      boxes.forEach(t => t.set({ shadow: null, stroke: null, strokeWidth: 0, paintFirst: 'fill' }));
    } else {
      const angle = parseFloat(qaEmbossAngle.value) || 135;
      const rad = angle * Math.PI / 180;
      const dx = Math.cos(rad) * depth, dy = Math.sin(rad) * depth;
      boxes.forEach(t => {
        const shadow = new fabric.Shadow({ color: qaEmbossShadow.value || '#000000', blur: depth * 0.6, offsetX: dx, offsetY: dy });
        if (isShapeObject(t)) {
          // 표 셀처럼 도형끼리 딱 붙어있으면 하이라이트 테두리가 바깥쪽으로 자라면서 옆 칸과
          // 겹쳐 어긋나 보이므로, 도형은 strokeWidth를 그대로(2배 안 함) 중앙정렬로 적용함.
          t.set({ shadow: shadow, paintFirst: 'fill', stroke: qaEmbossHighlight.value || '#ffffff', strokeWidth: Math.max(0.5, depth * 0.15) });
        } else {
          t.set({
            shadow: shadow,
            // stroke는 항상 글씨 "바깥쪽"으로만 자라야 하므로: stroke를 먼저 그리고 fill을 그 위에 덮어서
            // 안쪽 절반은 fill에 가려지게 함(paintFirst:'stroke') → 실제 두께는 원하는 값의 2배로 잡음
            paintFirst: 'stroke',
            stroke: qaEmbossHighlight.value || '#ffffff',
            strokeWidth: Math.max(0.5, depth * 0.15) * 2
          });
        }
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaEmbossDepth.addEventListener('input', applyQaEmboss);
  qaEmbossAngle.addEventListener('input', applyQaEmboss);
  qaEmbossHighlight.addEventListener('input', applyQaEmboss);
  qaEmbossShadow.addEventListener('input', applyQaEmboss);
  qaEmbossDepth.addEventListener('change', () => EP.pushHistory());
  qaEmbossAngle.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaEmbossOffBtn').addEventListener('click', () => {
    qaEmbossDepth.value = 0;
    applyQaEmboss(); EP.pushHistory();
  });


  // ---- 테두리 ----
  // 필터의 테두리는 원래 글씨 "바깥쪽"으로만 두꺼워지도록 만든 것(stroke를 먼저 그리고 fill을
  // 그 위에 덮어 안쪽 절반을 가리는 방식, paintFirst:'stroke' + strokeWidth 2배)인데,
  // 표 셀처럼 도형끼리 서로 딱 붙어있는 경우엔 이 방식대로 하면 옆 칸 쪽으로 두께가 침범해서
  // 칸 경계에서 테두리가 겹치고 어긋나 보임. 그래서 도형(isShapeObject)은 평범하게 중앙정렬된
  // 테두리(strokeWidth 그대로, paintFirst 기본값)로 적용하고, 텍스트만 기존 "바깥쪽 성장" 방식을 유지함.
  const qaOutlineWidth = document.getElementById('qaOutlineWidth');
  const qaOutlineColor = document.getElementById('qaOutlineColor');
  function applyQaOutline(){
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    const w = parseFloat(qaOutlineWidth.value) || 0;
    if (w <= 0) {
      boxes.forEach(t => t.set({ stroke: null, strokeWidth: 0, paintFirst: 'fill' }));
    } else {
      boxes.forEach(t => {
        if (isShapeObject(t)) {
          t.set({ paintFirst: 'fill', stroke: qaOutlineColor.value || '#000000', strokeWidth: w });
        } else {
          t.set({
            paintFirst: 'stroke',
            stroke: qaOutlineColor.value || '#000000',
            strokeWidth: w * 2
          });
        }
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaOutlineWidth.addEventListener('input', applyQaOutline);
  qaOutlineColor.addEventListener('input', applyQaOutline);
  qaOutlineWidth.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaOutlineOffBtn').addEventListener('click', () => {
    qaOutlineWidth.value = 0;
    applyQaOutline(); EP.pushHistory();
  });

  // ---- 번역 ---- (무료 번역 API인 MyMemory를 인터넷으로 직접 호출해서 실제 번역 결과를 가져옴, 영어/중국어/일본어 선택 가능)
  const qaTranslateBtn = document.getElementById('qaTranslateBtn');
  const qaTranslateLangBtns = Array.from(document.querySelectorAll('#qaTranslateLangSeg button'));
  let qaTranslateLang = 'en';
  qaTranslateLangBtns.forEach(b => {
    b.addEventListener('click', () => {
      qaTranslateLang = b.dataset.lang;
      qaTranslateLangBtns.forEach(o => o.classList.toggle('on', o === b));
    });
  });
  async function translateText(text, langpair){
    const params = new URLSearchParams({ q: text, langpair });
    const res = await fetch(`https://api.mymemory.translated.net/get?${params}`);
    if (!res.ok) throw new Error('네트워크 오류');
    const data = await res.json();
    if (data.responseStatus !== 200 || !data.responseData) throw new Error(data.responseDetails || '번역 실패');
    return data.responseData.translatedText;
  }
  qaTranslateBtn.addEventListener('click', async () => {
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const originalLabel = qaTranslateBtn.textContent;
    qaTranslateBtn.textContent = '번역 중...';
    qaTranslateBtn.disabled = true;
    try {
      for (const t of boxes) {
        if (t.__translateOriginalText == null) t.__translateOriginalText = t.text;
        const translated = await translateText(t.__translateOriginalText, `ko|${qaTranslateLang}`);
        t.set('text', translated);
      }
      EP.canvas.requestRenderAll();
      EP.pushHistory();
    } catch (err) {
      alert('번역에 실패했어요 (인터넷 연결 또는 무료 사용량 초과를 확인해주세요): ' + err.message);
    } finally {
      qaTranslateBtn.textContent = originalLabel;
      qaTranslateBtn.disabled = false;
    }
  });
  document.getElementById('qaTranslateRevertBtn').addEventListener('click', () => {
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    boxes.forEach(t => {
      if (t.__translateOriginalText != null) {
        t.set('text', t.__translateOriginalText);
        delete t.__translateOriginalText;
      }
    });
    EP.canvas.requestRenderAll();
    EP.pushHistory();
  });


  // ---- 맞춤법 검사 ---- (직접 검사하는 대신, 실제 검증된 "바른한글" 사이트로 연결)
  document.getElementById('qaTypoOpenBtn').addEventListener('click', () => {
    window.open('https://nara-speller.co.kr/speller/', '_blank');
  });
  document.getElementById('qaTypoCopyBtn').addEventListener('click', async () => {
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const text = boxes.map(t => t.text || '').join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('글자를 복사했어요. 바른한글 사이트에 붙여넣어 검사해보세요.');
    } catch (e) {
      alert('복사에 실패했어요. 직접 선택해서 복사해주세요:\n\n' + text);
    }
  });


  // ---- 배경 ---- (텍스트는 글자 뒤 배경색, 도형은 채우기색 자체를 바꿈)
  const qaBgColor = document.getElementById('qaBgColor');
  function applyQaBg(){
    const targets = EP.qaTargets.filter(isTextOrShape);
    if (!targets.length) return;
    targets.forEach(t => {
      if (isTextObject(t)) t.set('textBackgroundColor', qaBgColor.value || '');
      else t.set('fill', qaBgColor.value || '#ffffff');
    });
    EP.canvas.requestRenderAll();
  }
  qaBgColor.addEventListener('input', () => { applyQaBg(); EP.pushHistory(); });
  document.getElementById('qaBgOffBtn').addEventListener('click', () => {
    const targets = EP.qaTargets.filter(isTextOrShape);
    if (!targets.length) return;
    targets.forEach(t => {
      if (isTextObject(t)) t.set('textBackgroundColor', '');
      else t.set('fill', '#ffffff');
    });
    EP.canvas.requestRenderAll(); EP.pushHistory();
  });



  function openQaPopover(target, opts, boxesOverride){
    var boxes = boxesOverride || EP.qaTargetsFromTarget(target);
    if (!boxes.length) return;
    var wasHidden = qaPopover.classList.contains('hidden');
    EP.qaTargets = boxes;

    var anchor = boxes.find(isTextObject) || boxes[0];
    EP.filterRegistry.forEach(function(def){
      if (def.populate) { try { def.populate(anchor); } catch(e) { console.error('populate error:', def.id, e); } }
    });

    if (wasHidden) {
      qaFilterSelect.value = '';
      Object.values(qaDetails).forEach(function(d){ d.classList.add('hidden'); });
    }

    var reposition = !opts || opts.reposition !== false;
    if (reposition) {
      positionQaPopover(target);
    } else {
      qaPopover.classList.remove('hidden');
      clampQaPopoverToViewport();
    }
  }

  document.getElementById('qaPopoverCloseBtn').addEventListener('click', hideQaPopover);

  function clampQaPopoverToViewport(){
    const pw = qaPopover.offsetWidth || 200;
    const ph = qaPopover.offsetHeight || 140;
    const curLeft = parseFloat(qaPopover.style.left) || 0;
    const curTop = parseFloat(qaPopover.style.top) || 0;
    const left = Math.min(Math.max(8, curLeft), window.innerWidth - pw - 8);
    const top = Math.min(Math.max(8, curTop), window.innerHeight - ph - 8);
    qaPopover.style.left = left + 'px';
    qaPopover.style.top = top + 'px';
  }

  // P 팝업이 열려 있는 동안, 다른 텍스트(또는 텍스트 여러 개를 새로 선택)를 선택하면
  // P를 다시 누를 필요 없이 자동으로 그 대상으로 전환 — 2개 이상 선택 시 전부에 동일 적용됨
  function syncQaPopoverToSelection(){
    if (qaPopover.classList.contains('hidden')) return; // 팝업이 닫혀 있으면 그대로 둠
    const active = EP.canvas.getActiveObject();
    if (isTableRelatedTarget(active)) return; // 표는 필터 대상이 아니므로 팝업을 그대로 유지
    const boxes = EP.qaTargetsFromTarget(active);
    if (!boxes.length) return; // 텍스트가 아닌 걸 선택했을 땐 팝업을 그대로 유지
    const sameTarget = boxes.length === EP.qaTargets.length && boxes.every((o, i) => o === EP.qaTargets[i]);
    if (sameTarget) return;
    openQaPopover(active, { reposition: false });
  }
  EP.canvas.on('selection:created', syncQaPopoverToSelection);
  EP.canvas.on('selection:updated', syncQaPopoverToSelection);

  // 패널을 자유롭게 드래그로 이동 (드롭다운/게이지/스와치/닫기버튼 위에서는 드래그 시작 안 함)

  EP.makeDraggablePopover(qaPopover);

  function populate_shadow(anchor){
        const sh = anchor.shadow;
        qaShadowBlur.value = sh ? (sh.blur || 0) : 0;
        qaShadowDist.value = sh ? Math.round(Math.sqrt((sh.offsetX || 0) ** 2 + (sh.offsetY || 0) ** 2)) : 0;
        qaShadowColor.value = sh ? (EP.toHex(sh.color) || '#000000') : '#000000';
  }
  function populate_glow(anchor){
        const sh = anchor.shadow;
        qaGlowBlur.value = sh ? (sh.blur || 0) : 0;
        qaGlowColor.value = sh ? (EP.toHex(sh.color) || '#ffffff') : '#ffffff';
  }
  function populate_gradient(anchor){
        const isGrad = anchor.fill && typeof anchor.fill === 'object' && anchor.fill.colorStops;
        if (isGrad) {
          const stops = anchor.fill.colorStops;
          qaGradColor1.value = EP.toHex(stops[0] && stops[0].color) || '#3498db';
          qaGradColor2.value = EP.toHex(stops[1] && stops[1].color) || '#e74c3c';
          const co = anchor.fill.coords || {};
          const ang = Math.round(Math.atan2((co.y2 || 0) - (co.y1 || 0), (co.x2 || 0) - (co.x1 || 0)) * 180 / Math.PI);
          qaGradAngle.value = ((ang % 360) + 360) % 360;
        } else {
          qaGradColor1.value = EP.toHex(anchor.fill) || '#3498db';
          qaGradColor2.value = '#e74c3c';
          qaGradAngle.value = 0;
        }
  }
  function populate_emboss(anchor){
        const embossDepth = anchor.strokeWidth ? Math.round(anchor.strokeWidth / (0.15 * 2)) : 0;
        qaEmbossDepth.value = embossDepth;
        qaEmbossHighlight.value = EP.toHex(anchor.stroke) || '#ffffff';
        qaEmbossShadow.value = (anchor.shadow && EP.toHex(anchor.shadow.color)) || '#000000';
        if (anchor.shadow) {
          const eang = Math.round(Math.atan2(anchor.shadow.offsetY || 0, anchor.shadow.offsetX || 0) * 180 / Math.PI);
          qaEmbossAngle.value = ((eang % 360) + 360) % 360;
        } else {
          qaEmbossAngle.value = 135;
        }
  }
  function populate_outline(anchor){
        qaOutlineWidth.value = anchor.strokeWidth ? Math.round(anchor.strokeWidth / 2) : 0;
        qaOutlineColor.value = EP.toHex(anchor.stroke) || '#000000';
  }
  function populate_bg(anchor){
        if (isTextObject(anchor)) {
          qaBgColor.value = EP.toHex(anchor.textBackgroundColor) || '#cccccc';
        } else {
          qaBgColor.value = EP.toHex(anchor.fill) || '#cccccc';
        }
  }

  // ---- 공통필터 6개는 "다시 그리기" 버튼이 아직 없어서, 주사위용으로 최소한의
  //      랜덤 적용 로직을 여기 만들어둠 (나중에 전용 셔플 버튼 만들면 이 부분을 그걸로 바꾸면 됨) ----
  function randHex(){
    return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }
  function randomizeShadow(){
    qaShadowBlur.value = Math.round(4 + Math.random() * 16);
    qaShadowDist.value = Math.round(2 + Math.random() * 12);
    qaShadowColor.value = randHex();
    applyQaShadow(); pushHistory();
  }
  function randomizeGlow(){
    qaGlowBlur.value = Math.round(6 + Math.random() * 20);
    qaGlowColor.value = randHex();
    applyQaGlow(); pushHistory();
  }
  function randomizeGradient(){
    qaGradColor1.value = randHex();
    qaGradColor2.value = randHex();
    qaGradAngle.value = Math.round(Math.random() * 360);
    applyQaGradient(); pushHistory();
  }
  function randomizeEmboss(){
    qaEmbossDepth.value = Math.round(2 + Math.random() * 8);
    qaEmbossHighlight.value = randHex();
    qaEmbossShadow.value = randHex();
    qaEmbossAngle.value = Math.round(Math.random() * 360);
    applyQaEmboss(); pushHistory();
  }
  function randomizeOutline(){
    qaOutlineWidth.value = Math.round(1 + Math.random() * 6);
    qaOutlineColor.value = randHex();
    applyQaOutline(); pushHistory();
  }
  function randomizeBg(){
    qaBgColor.value = randHex();
    applyQaBg(); pushHistory();
  }

  // ---- 필터 레지스트리 등록 ----
  // 그림자~배경 6개는 도형(shape)에도 적용 가능한 "공통 효과"라 appliesTo에 shape를 함께 넣음.
  // (번역/맞춤법검사는 텍스트 전용이라 그대로 text만 유지)
  EP.registerFilter({
    id: 'shadow', label: '그림자', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null, includeInRandom: true,
    apply: applyQaShadow, randomize: randomizeShadow, populate: populate_shadow
  });
  EP.registerFilter({
    id: 'glow', label: '외부광선', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null, includeInRandom: true,
    apply: applyQaGlow, randomize: randomizeGlow, populate: populate_glow
  });
  EP.registerFilter({
    id: 'gradient', label: '그라디언트', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null, includeInRandom: true,
    apply: applyQaGradient, randomize: randomizeGradient, populate: populate_gradient
  });
  EP.registerFilter({
    id: 'emboss', label: '경사와 엠보스', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null, includeInRandom: true,
    apply: applyQaEmboss, randomize: randomizeEmboss, populate: populate_emboss
  });
  EP.registerFilter({
    id: 'outline', label: '테두리', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null, includeInRandom: true,
    apply: applyQaOutline, randomize: randomizeOutline, populate: populate_outline
  });
  EP.registerFilter({
    id: 'bg', label: '배경', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null, includeInRandom: true,
    apply: applyQaBg, randomize: randomizeBg, populate: populate_bg
  });
  EP.registerFilter({ id: 'translate', label: '번역', commonEffect: true,
    appliesTo: ['text'], group: null, includeInRandom: false,
    apply: null, randomize: null, populate: null });
  EP.registerFilter({ id: 'typo', label: '맞춤법 검사', commonEffect: true,
    appliesTo: ['text'], group: null, includeInRandom: false,
    apply: null, randomize: null, populate: null });

  // ---- CMYK 색상 선택기 초기화 (core.js의 initCmykPicker 재사용) ----
  EP.initCmykPicker(qaShadowColor);
  EP.initCmykPicker(qaGlowColor);
  EP.initCmykPicker(qaGradColor1);
  EP.initCmykPicker(qaGradColor2);
  EP.initCmykPicker(qaEmbossHighlight);
  EP.initCmykPicker(qaEmbossShadow);
  EP.initCmykPicker(qaOutlineColor);
  EP.initCmykPicker(qaBgColor);

  EP.openQaPopover = openQaPopover;
  EP.setActiveFilterMenu = setActiveFilterMenu;
  EP.qaDetails = qaDetails;
  EP.qaFilterSelect = qaFilterSelect;
})();
