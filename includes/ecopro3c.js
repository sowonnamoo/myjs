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

  // 테두리·엠보스는 "장식 효과 있는지" 판단하는 hasAnyRenderEffect 목록에 안 들어있어서,
  // 낙서·우주·해산물·보석 등 다른 특수효과가 이미 켜져있는 오브젝트에 테두리/엠보스를
  // 얹을 때 objectCaching이 확실히 계속 꺼진 채로 유지되도록 이 함수에서 명시적으로 맞춰줌
  // (켜진 채로 있으면 fabric이 원래 글자 크기 기준 캐시 캔버스를 만들어서, 그 바깥으로 퍼지는
  // 장식들이 잘려 보이는 문제가 있었음). 다른 특수효과가 하나도 없으면 정상적으로 다시 켬(성능).
  function syncObjectCachingForCommonEffect(t){
    t.objectCaching = EP.hasAnyRenderEffect ? !EP.hasAnyRenderEffect(t) : true;
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
      ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#e67e22';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      // 조금 더 예쁜 주사위 아이콘 — 둥근 사각형 몸체 + "5" 배열의 점 5개(버튼 색과 맞춘 포인트 컬러)
      (function drawDiceIcon(){
        const s = 8, r = 3;
        ctx.beginPath();
        ctx.moveTo(-s + r, -s);
        ctx.lineTo(s - r, -s);
        ctx.quadraticCurveTo(s, -s, s, -s + r);
        ctx.lineTo(s, s - r);
        ctx.quadraticCurveTo(s, s, s - r, s);
        ctx.lineTo(-s + r, s);
        ctx.quadraticCurveTo(-s, s, -s, s - r);
        ctx.lineTo(-s, -s + r);
        ctx.quadraticCurveTo(-s, -s, -s + r, -s);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#e67e22';
        const off = 4, pipR = 1.3;
        [[-off, -off], [off, -off], [0, 0], [-off, off], [off, off]].forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(px, py, pipR, 0, Math.PI * 2);
          ctx.fill();
        });
      })();
      ctx.restore();
    }

    const pControl = new fabric.Control({
      x: -0.5, y: -0.5,
      offsetX: -20, offsetY: -36, // 좌측 상단 모서리 바로 위 — 글자가 커져도(오른쪽으로만 넓어짐) 위치가 안 흔들려서 연속 클릭하기 편함
      sizeX: 28, sizeY: 28, // 그려지는 원(지름28) 전체가 클릭 영역이 되도록 맞춤(M버튼과 동일 — 이제 모바일에서도 쓰이므로)
      cursorStyle: 'pointer',
      render: renderPButton,
      mouseUpHandler: function(eventData, transformData){
        const target = transformData && transformData.target;
        if (!target || isTableRelatedTarget(target)) return true;
        if (target.isEditing) target.exitEditing(); // 모바일에서 편집 상태가 남아있으면 필터가 안 그려지므로 확실히 빠져나옴
        // 이제 이 버튼 자체가 "주사위"라서 누를 때마다 곧바로 랜덤 필터를 다시 뽑음(토글로 닫히던
        // 예전 동작은 제거) — 팝업이 이미 열려있으면 위치는 그대로 두고(드래그해둔 자리 유지),
        // 처음 여는 거면 글자 바로 아래에 새로 자리잡음. 그 안의 게이지들로 계속 세부 조절 가능.
        const alreadyOpen = !qaPopover.classList.contains('hidden');
        openQaPopover(target, { reposition: !alreadyOpen });
        if (EP.rollDice) EP.rollDice(target);
        return true;
      }
    });

    fabric.IText.prototype.controls = Object.assign({}, fabric.IText.prototype.controls, { qa: pControl });
    fabric.ActiveSelection.prototype.controls = Object.assign({}, fabric.ActiveSelection.prototype.controls, { qa: pControl });
    fabric.Group.prototype.controls = Object.assign({}, fabric.Group.prototype.controls, { qa: pControl });
    // 도형(사각형/원/삼각형/펜도구 패스) 전용 "M" 버튼은 ecopro3m.js에서 이 자리(controls.qa)에
    // 덮어씌워 등록함 — 도형을 선택하면 이제 P 대신 M이 뜨고, 모양 전용 필터 메뉴가 열림.
    // (이 파일에서는 더 이상 도형 프로토타입에 pControl을 붙이지 않음)

    // 모바일 전용 "연필" 버튼 — 주사위(P) 바로 옆에 붙여서, 탭 한 번으로 곧바로 글자 편집
    // 모드로 들어감(요청: "텍스트 클릭시 나오는 주사위 옆에 연필모양 아이콘... 터치하면
    // 글자 수정할수 있게"). 텍스트 오브젝트에만 붙음 — 여러 개 묶어 선택했을 땐 "이 글자를
    // 편집"이라는 개념 자체가 애매해서 안 붙임.
    function renderEditPencilButton(ctx, left, top, styleOverride, fabricObject){
      if (!(EP.isMobileModeActive && EP.isMobileModeActive())) return; // 모바일 전용
      if (isTableRelatedTarget(fabricObject)) return;
      ctx.save();
      ctx.translate(left, top);
      ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#3498db';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      // 연필 아이콘 — 몸통(사선) + 뾰족한 끝
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 5);
      ctx.lineTo(4, -4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 6);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-4, 6);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    const editPencilControl = new fabric.Control({
      x: -0.5, y: -0.5,
      offsetX: 12, offsetY: -36, // P(주사위) 바로 오른쪽 옆
      sizeX: 28, sizeY: 28,
      cursorStyle: 'text',
      render: renderEditPencilButton,
      mouseUpHandler: function(eventData, transformData){
        if (!(EP.isMobileModeActive && EP.isMobileModeActive())) return true; // PC에선 동작 안 함
        const target = transformData && transformData.target;
        if (!target || isTableRelatedTarget(target)) return true;
        target.enterEditing();
        target.selectAll();
        canvas.requestRenderAll();
        return true;
      }
    });
    fabric.IText.prototype.controls = Object.assign({}, fabric.IText.prototype.controls, { qaEdit: editPencilControl });
  })();

  const qaPopover = document.getElementById('qaPopover');
  if (EP.registerPopoverPositionMemory) EP.registerPopoverPositionMemory(qaPopover);
  // EP.qaTargets 는 파일 상단에서 이미 초기화됨 (T버튼과 동일한 방식: 창을 여는 시점의 대상을 그대로 붙잡아둠)

  function hideQaPopover(){
    qaPopover.classList.add('hidden');
    EP.qaTargets = [];
    setQaDetailExpanded(false);
  }
  if (EP.registerFilterPopover) EP.registerFilterPopover(qaPopover);

  // "상세조정하기" 접기/펼치기 — 주사위(P버튼)를 눌러 랜덤 필터를 적용한 직후에는
  // ◀1/3▶ 이동과 필터 게이지들을 다 숨기고 이 버튼 하나만 글자 아래에 보이게 함.
  // 조절하고 싶을 때만 눌러서 펼치면 그제서야 게이지들이 나타남.
  const qaDetailToggleBtn = document.getElementById('qaDetailToggleBtn');
  function setQaDetailExpanded(expanded){
    qaPopover.classList.toggle('qa-expanded', expanded);
    qaDetailToggleBtn.textContent = expanded ? '접기 ▴' : '상세조정하기 ▾';
    qaDetailToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  qaDetailToggleBtn.addEventListener('click', () => {
    setQaDetailExpanded(!qaPopover.classList.contains('qa-expanded'));
    // 펼치거나 접으면 팝업 크기(높이)가 바뀌는데, 회전된 상태에서는 CSS transform이 박스의
    // "중심"을 기준으로 돌기 때문에 크기가 바뀌면 그 중심점도 같이 움직여서, 위치를 다시
    // 계산해주지 않으면 엉뚱한 방향(옆/위)으로 삐져나가 보이는 문제가 있었음(요청: "펼치기
    // 누르니 상세조정하기 창의 옆지점에 펼쳐져 창보다 윗지점부터 펼쳐지고 있어"). 크기가
    // 바뀐 직후 같은 위치 계산 함수를 다시 돌려서 항상 정확히 재정렬되게 함.
    const activeTarget = EP.canvas.getActiveObject();
    if (activeTarget) positionQaPopover(activeTarget);
  });

  // T버튼 팝오버와 동일한 방식: 오브젝트 중앙 아래쪽에 표시 (공간 부족하면 위쪽)
  // PC에서는 캔버스 좌측 상단 모서리에 가지런히 배치(회전 고려 없음). 모바일은 예전 그대로
  // 오브젝트 근처에 뜸.
  function positionQaPopover(target){
    // 요청: PC처럼 모바일도 항상 캔버스 좌측 상단(겹치지 않게 나란히), 회전 여부와 무관하게
    // 좌상단이 원칙.
    EP.positionPopoverAtCanvasCorner(qaPopover);
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
    jump: document.getElementById('qaDetailJump'),
    pulse: document.getElementById('qaDetailPulse'),
    sway: document.getElementById('qaDetailSway'),
    waddle: document.getElementById('qaDetailWaddle'),
    popcorn: document.getElementById('qaDetailPopcorn'),
    hiccup: document.getElementById('qaDetailHiccup'),
    breathe: document.getElementById('qaDetailBreathe'),
    flicker: document.getElementById('qaDetailFlicker'),
    chatter: document.getElementById('qaDetailChatter'),
    walk: document.getElementById('qaDetailWalk'),
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
    christmas: document.getElementById('qaDetailChristmas'),
    autumn: document.getElementById('qaDetailAutumn'),
    space: document.getElementById('qaDetailSpace'),
    doodle: document.getElementById('qaDetailDoodle'),
    butterfly: document.getElementById('qaDetailButterfly'),
    soapbubble: document.getElementById('qaDetailSoapbubble'),
    lightning: document.getElementById('qaDetailLightning'),
    halloween: document.getElementById('qaDetailHalloween'),
    musicnote: document.getElementById('qaDetailMusicnote'),
    gem: document.getElementById('qaDetailGem'),
    tropical: document.getElementById('qaDetailTropical'),
    candy: document.getElementById('qaDetailCandy'),
    popart: document.getElementById('qaDetailPopart'),
    inktrap: document.getElementById('qaDetailInktrap'),
    leafvine: document.getElementById('qaDetailLeafvine'),
    sakura: document.getElementById('qaDetailSakura'),
    randomTypo: document.getElementById('qaDetailRandomTypo'),
    zebra: document.getElementById('qaDetailZebra'),
    tote: document.getElementById('qaDetailTote'),
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
  // 캔버스 그림자(shadowColor)의 알파 채널은 브라우저/버전에 따라 눈에 잘 안 띄게 렌더링될 때가
  // 있어서, "투명도"는 알파 대신 색 자체를 흰색 쪽으로 섞어 밝게(연하게) 만드는 방식으로 구현함
  // — 100이면 원래 색 그대로, 0에 가까울수록 거의 흰색(원래 검정이었다면 연한 회색이 됨).
  function lightenColor(hex, opacityPct){
    const rgb = EP.hexToRgb(hex || '#000000') || { r: 0, g: 0, b: 0 };
    const t = Math.max(0, Math.min(100, opacityPct)) / 100;
    const mr = Math.round(rgb.r * t + 255 * (1 - t));
    const mg = Math.round(rgb.g * t + 255 * (1 - t));
    const mb = Math.round(rgb.b * t + 255 * (1 - t));
    return 'rgb(' + mr + ',' + mg + ',' + mb + ')';
  }

  const qaShadowOpacity = document.getElementById('qaShadowOpacity');
  function applyQaShadow(){
    const boxes = EP.qaTargets.filter(isTextOrShape);
    if (!boxes.length) return;
    const blur = parseFloat(qaShadowBlur.value) || 0;
    const dist = parseFloat(qaShadowDist.value) || 0;
    const opacity = qaShadowOpacity.value === '' ? 100 : (parseFloat(qaShadowOpacity.value) || 0);
    boxes.forEach(t => {
      if (blur <= 0 && dist <= 0) {
        t.set('shadow', null);
        t.shadowOpacityValue = null;
        t.shadowBaseColorValue = null;
      } else {
        const off = dist / Math.SQRT2;
        t.set('shadow', new fabric.Shadow({ color: lightenColor(qaShadowColor.value, opacity), blur, offsetX: off, offsetY: off }));
        t.shadowOpacityValue = opacity; // populate 시 정확히 되읽기 위해 원본 값을 따로 저장해둠
        t.shadowBaseColorValue = qaShadowColor.value || '#000000';
      }
    });
    EP.canvas.requestRenderAll();
  }
  qaShadowBlur.addEventListener('input', applyQaShadow);
  qaShadowDist.addEventListener('input', applyQaShadow);
  qaShadowOpacity.addEventListener('input', applyQaShadow);
  qaShadowColor.addEventListener('input', applyQaShadow);
  qaShadowBlur.addEventListener('change', () => EP.pushHistory());
  qaShadowDist.addEventListener('change', () => EP.pushHistory());
  qaShadowOpacity.addEventListener('change', () => EP.pushHistory());
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
      boxes.forEach(t => { t.set({ shadow: null, stroke: null, strokeWidth: 0, paintFirst: 'fill' }); syncObjectCachingForCommonEffect(t); });
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
        syncObjectCachingForCommonEffect(t);
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
      boxes.forEach(t => { t.set({ stroke: null, strokeWidth: 0, paintFirst: 'fill' }); syncObjectCachingForCommonEffect(t); });
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
        syncObjectCachingForCommonEffect(t);
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
  const qaBgOpacity = document.getElementById('qaBgOpacity');
  // 그림자와 달리 배경색은 캔버스에서 진짜 알파(rgba)가 안정적으로 잘 렌더링되므로,
  // "흰색으로 섞기"가 아니라 실제 반투명(뒤가 비쳐보이는) 방식으로 구현함
  function hexToRgbaStr(hex, opacityPct){
    const rgb = EP.hexToRgb(hex || '#cccccc') || { r: 204, g: 204, b: 204 };
    const a = Math.max(0, Math.min(100, opacityPct)) / 100;
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }
  function applyQaBg(){
    const targets = EP.qaTargets.filter(isTextOrShape);
    if (!targets.length) return;
    const opacity = qaBgOpacity.value === '' ? 100 : (parseFloat(qaBgOpacity.value) || 0);
    const colorStr = hexToRgbaStr(qaBgColor.value, opacity);
    targets.forEach(t => {
      if (isTextObject(t)) t.set('textBackgroundColor', qaBgColor.value ? colorStr : '');
      else t.set('fill', colorStr);
      t.bgOpacityValue = opacity; // populate 시 정확히 되읽기 위해 원본 값을 따로 저장해둠
      t.bgBaseColorValue = qaBgColor.value || '#cccccc';
    });
    EP.canvas.requestRenderAll();
  }
  qaBgColor.addEventListener('input', () => { applyQaBg(); EP.pushHistory(); });
  qaBgOpacity.addEventListener('input', applyQaBg);
  qaBgOpacity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaBgOffBtn').addEventListener('click', () => {
    const targets = EP.qaTargets.filter(isTextOrShape);
    if (!targets.length) return;
    targets.forEach(t => {
      if (isTextObject(t)) t.set('textBackgroundColor', '');
      else t.set('fill', '#ffffff');
      t.bgOpacityValue = null;
      t.bgBaseColorValue = null;
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
    if (EP.applyFilteredFilterDropdown) EP.applyFilteredFilterDropdown(anchor); // 드롭다운을 이 오브젝트의 랜덤 적용 이력에 맞춰 좁힘(이력 없으면 전체 목록)

    if (wasHidden) {
      qaFilterSelect.value = '';
      Object.values(qaDetails).forEach(function(d){ d.classList.add('hidden'); });
      setQaDetailExpanded(false); // 새로 열 때는 항상 접힌 상태로 시작(주사위 결과만 캔버스에서 바로 보이게)
      // 이 오브젝트에 이미 적용돼있는 필터 목록(◀1/N▶)을 즉시 복원해둠 — 이렇게 안 하면
      // 펼쳤을 때 "1"번 내용이 안 뜨고, ◀▶로 2·3번을 거쳐야만 그제서야 표시되는 문제가 있었음.
      if (EP.refreshTextRollNav) EP.refreshTextRollNav(anchor);
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
    const r = EP.clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
    qaPopover.style.left = r.left + 'px';
    qaPopover.style.top = r.top + 'px';
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

  // 이미 필터가 적용돼있는 텍스트(예: "전체 랜덤 적용" 직후)를 선택하면, 굳이 P버튼(주사위)을
  // 따로 안 눌러도 자동으로 "상세조정하기" 팝업이 (접힌 상태로) 뜨게 함 — 새로 랜덤을 뽑지는
  // 않고, 지금 적용된 필터를 조정할 수 있는 진입점만 바로 보여줌. 필터가 없는 텍스트를
  // 선택했을 땐(아직 아무것도 적용 안 한 새 텍스트 등) 평소처럼 아무것도 안 뜸.
  function autoOpenQaPopoverIfHasEffect(){
    if (EP.rollAllInProgress) return; // "전체 랜덤 적용" 배치가 진행 중이면 자동으로 안 뜨게 함
    if (!qaPopover.classList.contains('hidden')) return; // 이미 열려있으면 위 syncQaPopoverToSelection이 처리하므로 손 안 댐
    const active = EP.canvas.getActiveObject();
    if (!active || isTableRelatedTarget(active)) return;
    const boxes = EP.qaTargetsFromTarget(active).filter(isTextObject);
    if (!boxes.length) return;
    const hasEffect = boxes.some(o => EP.hasAnyRenderEffect && EP.hasAnyRenderEffect(o));
    if (!hasEffect) return;
    openQaPopover(active);
  }
  EP.canvas.on('selection:created', autoOpenQaPopoverIfHasEffect);
  EP.canvas.on('selection:updated', autoOpenQaPopoverIfHasEffect);

  // 패널을 자유롭게 드래그로 이동 (드롭다운/게이지/스와치/닫기버튼 위에서는 드래그 시작 안 함)

  EP.makeDraggablePopover(qaPopover);
  // 다시 등록함 — 이제 회전 각도에 따라 모서리 자체가 바뀌어야 하므로(요청), 팝업이 열려있는
  // 채로 캔버스를 회전시켜도 즉시 올바른 모서리·방향으로 다시 배치되어야 함.
  EP.registerRotatablePopover(qaPopover);

  function populate_shadow(anchor){
        const sh = anchor.shadow;
        qaShadowBlur.value = sh ? (sh.blur || 0) : 0;
        qaShadowDist.value = sh ? Math.round(Math.sqrt((sh.offsetX || 0) ** 2 + (sh.offsetY || 0) ** 2)) : 0;
        qaShadowColor.value = sh ? (anchor.shadowBaseColorValue || EP.toHex(sh.color) || '#000000') : '#000000';
        qaShadowOpacity.value = sh ? (anchor.shadowOpacityValue != null ? anchor.shadowOpacityValue : 100) : 100;
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
        const hasBg = isTextObject(anchor) ? !!anchor.textBackgroundColor : (anchor.bgBaseColorValue != null);
        qaBgColor.value = hasBg ? (anchor.bgBaseColorValue || '#cccccc') : '#cccccc';
        qaBgOpacity.value = hasBg && anchor.bgOpacityValue != null ? anchor.bgOpacityValue : 100;
  }

  // ---- 공통필터 6개는 "다시 그리기" 버튼이 아직 없어서, 주사위용으로 최소한의
  //      랜덤 적용 로직을 여기 만들어둠 (나중에 전용 셔플 버튼 만들면 이 부분을 그걸로 바꾸면 됨) ----
  function randHex(){
    return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }
  function randomizeShadow(){
    qaShadowBlur.value = Math.round(4 + Math.random() * 16);
    qaShadowDist.value = Math.round(2 + Math.random() * 12);
    qaShadowOpacity.value = Math.round(40 + Math.random() * 60);
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
    qaBgOpacity.value = Math.round(50 + Math.random() * 50);
    applyQaBg(); pushHistory();
  }

  // ---- 필터 레지스트리 등록 ----
  // 그림자~배경 6개는 도형(shape)에도 적용 가능한 "공통 효과"라 appliesTo에 shape를 함께 넣음.
  // (번역/맞춤법검사는 텍스트 전용이라 그대로 text만 유지)
  // 이 6개도 다른 필터들과 마찬가지로 "🎲 랜덤 적용"의 후보로 포함됨(ecopro3l.js의 pickCombo가
  // 공통필터 몫으로 별도 개수를 뽑음). 드롭다운 목록에서도 <optgroup>으로 나머지 장식 효과들과
  // 분리해서 보여줌.
  EP.registerFilter({
    id: 'shadow', label: '그림자', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null,
    apply: applyQaShadow, randomize: randomizeShadow, populate: populate_shadow
  });
  EP.registerFilter({
    id: 'glow', label: '외부광선', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null,
    apply: applyQaGlow, randomize: randomizeGlow, populate: populate_glow
  });
  EP.registerFilter({
    id: 'gradient', label: '그라디언트', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null,
    apply: applyQaGradient, randomize: randomizeGradient, populate: populate_gradient
  });
  EP.registerFilter({
    id: 'emboss', label: '경사와 엠보스', commonEffect: true, includeInRandom: false,
    appliesTo: ['text', 'shape'], group: null,
    apply: applyQaEmboss, randomize: randomizeEmboss, populate: populate_emboss
  });
  EP.registerFilter({
    id: 'outline', label: '테두리', commonEffect: true, includeInRandom: false,
    appliesTo: ['text', 'shape'], group: null,
    apply: applyQaOutline, randomize: randomizeOutline, populate: populate_outline
  });
  EP.registerFilter({
    id: 'bg', label: '배경', commonEffect: true,
    appliesTo: ['text', 'shape'], group: null,
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
  EP.hideQaPopover = hideQaPopover;
  EP.setActiveFilterMenu = setActiveFilterMenu;
  EP.setQaDetailExpanded = setQaDetailExpanded;
  EP.qaDetails = qaDetails;
  EP.qaFilterSelect = qaFilterSelect;
  EP.isTableRelatedTarget = isTableRelatedTarget;

  /* ============================================================
     "상세조정하기"를 펼쳤을 때, ◀1/3▶ 바로 아래 필터 선택 드롭다운에는 82개 전체
     대신 "지금 이 오브젝트에 실제로 랜덤 적용된 필터들"만 좁혀서 보여줌 — 그래야
     이번에 뭐가 뽑혔는지 목록으로 바로 보고 골라서 수정할 수 있음.
     (적용 이력이 없는 오브젝트라면 평소처럼 전체 82개 목록을 그대로 보여줌)
  ============================================================ */
  var qaFilterSelectOriginalHTML = qaFilterSelect.innerHTML;

  EP.applyFilteredFilterDropdown = function(anchor){
    var ids = anchor && anchor._lastRollComboIds;
    if (!ids || !ids.length) {
      qaFilterSelect.innerHTML = qaFilterSelectOriginalHTML; // 이력 없으면 전체 목록 그대로
      return;
    }
    var frag = document.createDocumentFragment();
    var placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.disabled = true;
    placeholder.textContent = '이번에 적용된 필터 (' + ids.length + '개)';
    frag.appendChild(placeholder);
    ids.forEach(function(id){
      var def = EP.filterRegistry.filter(function(f){ return f.id === id; })[0];
      if (!def) return;
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = def.label || id;
      frag.appendChild(opt);
    });
    qaFilterSelect.innerHTML = '';
    qaFilterSelect.appendChild(frag);
    qaFilterSelect.value = ids[0];
  };
})();
