/* ecopro3shape.js — "🎲 랜덤모양 생성" 툴바 버튼 + 모달
   로딩 순서: ecopro3.js -> ... -> ecopro3bg.js -> ecopro3shape.js -> ecopro3text.js -> ...

   동작: 툴바의 "🎲 랜덤모양 생성"을 누르면 캔버스 정가운데에 작은 모달이 뜨고, 그 안의
   "🎲 랜덤생성" 버튼을 누를 때마다:
     - 이 기능으로 이전에 만들어둔 모양(있다면)을 지움 (bgFill 기능과 동일한 방식)
     - 정다각형/별/버스트(뱃지)/기어/꽃잎/화살표/쉐브런/십자가/다이아몬드/사다리꼴/블롭 +
       손으로 그린 하트·물방울·초승달·구름·말풍선·방패·배너·번개·아치·링 등 약 100종 중
       하나를 무작위로 골라 무작위 색상으로 만듦
     - 크기는 항상 일정함(모양마다 자연 크기가 달라도 마지막에 동일한 기준 크기로 맞춤) */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var addRandomShapeBtn = document.getElementById('addRandomShapeBtn');
  var randomShapeModal = document.getElementById('randomShapeModal');
  var randomShapeModalCloseBtn = document.getElementById('randomShapeModalCloseBtn');
  var randomShapeGenBtn = document.getElementById('randomShapeGenBtn');

  var TARGET_SIZE = 140; // 모양이 몇 종류든 항상 이 크기(가로/세로 중 큰 쪽 기준)로 맞춰서 "크기 일정" 요구를 지킴

  function positionModalBelowShape(modal){
    modal.classList.remove('hidden');
    var mw = modal.offsetWidth || 200;
    var mh = modal.offsetHeight || 140;
    var canvasRect = EP.canvas.upperCanvasEl.getBoundingClientRect();
    var zoom = EP.canvas.getZoom() || 1;
    var scaleY = canvasRect.height / EP.canvas.getHeight();
    var centerX = canvasRect.left + canvasRect.width / 2;
    var centerY = canvasRect.top + canvasRect.height / 2;
    // 생성된 모양은 항상 캔버스 정가운데, 반지름 TARGET_SIZE/2 크기로 나오므로 그 아래쪽에 자리잡게 함
    var shapeHalfOnScreen = (TARGET_SIZE / 2) * zoom * scaleY;
    var gap = 16;
    var left = centerX - mw / 2;
    var top = centerY + shapeHalfOnScreen + gap;
    var r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, mw, mh, EP.canvasRotationDeg) : { left: left, top: top };
    modal.style.left = r.left + 'px';
    modal.style.top = r.top + 'px';
    if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(modal);
  }

  // 처음 열 때만 "생성된 모양 아래쪽"에 자리잡게 하고, 그 뒤로는 사용자가 마우스로 옮긴 위치를
  // 그대로 유지함(랜덤생성을 계속 눌러도 모달이 제자리로 튀어 돌아가지 않게)
  addRandomShapeBtn.addEventListener('click', function(){ positionModalBelowShape(randomShapeModal); });
  randomShapeModalCloseBtn.addEventListener('click', function(){ randomShapeModal.classList.add('hidden'); });

  // 마우스로 클릭+드래그해서 모달창을 원하는 위치로 옮길 수 있게 함
  if (EP.makeDraggablePopover) EP.makeDraggablePopover(randomShapeModal);
  if (EP.registerRotatablePopover) EP.registerRotatablePopover(randomShapeModal);

  /* ============================================================
     모양 생성기 — 반지름 R=70 기준 좌표(중심 0,0)로 만들고, 실제 캔버스에 올릴 때 균일한
     크기(TARGET_SIZE)로 다시 맞춤. 정다각형/별/버스트/기어/꽃잎처럼 규칙적인 것들은 각도
     계산으로 자동 생성하고, 하트/구름/방패 같은 손그림 모양만 좌표를 직접 지정함.
  ============================================================ */
  function polar(r, ang){ return { x: Math.cos(ang) * r, y: Math.sin(ang) * r }; }

  function regularPolygonPts(sides, R){
    var pts = [];
    for (var i = 0; i < sides; i++) pts.push(polar(R, -Math.PI / 2 + i * (2 * Math.PI / sides)));
    return pts;
  }
  function starPts(spikes, R, innerRatio){
    var pts = []; var ir = R * innerRatio;
    for (var i = 0; i < spikes * 2; i++) {
      var a = -Math.PI / 2 + i * (Math.PI / spikes);
      pts.push(polar(i % 2 === 0 ? R : ir, a));
    }
    return pts;
  }
  function gearPts(teeth, R, innerR){
    var pts = []; var step = 2 * Math.PI / teeth;
    for (var i = 0; i < teeth; i++) {
      var a = -Math.PI / 2 + i * step;
      pts.push(polar(innerR, a - step * 0.18));
      pts.push(polar(R, a - step * 0.12));
      pts.push(polar(R, a + step * 0.12));
      pts.push(polar(innerR, a + step * 0.18));
    }
    return pts;
  }
  function flowerPts(petals, R, innerR){
    var pts = []; var step = 2 * Math.PI / petals; var sub = 5; var halfW = step * 0.42;
    for (var i = 0; i < petals; i++) {
      var a0 = -Math.PI / 2 + i * step;
      for (var k = 0; k < sub; k++) {
        var t = k / (sub - 1);
        var ang = a0 - halfW + t * halfW * 2;
        var r = innerR + (R - innerR) * Math.sin(Math.PI * t);
        pts.push(polar(r, ang));
      }
    }
    return pts;
  }
  function blobPts(freq, R, amp, phase){
    var pts = []; var n = 28;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push(polar(R + amp * Math.sin(freq * a + phase), a));
    }
    return pts;
  }
  function ringPathD(Router, Rinner){
    return 'M0,-' + Router + ' A' + Router + ',' + Router + ' 0 1,1 0,' + Router + ' A' + Router + ',' + Router + ' 0 1,1 0,-' + Router + ' Z ' +
           'M0,-' + Rinner + ' A' + Rinner + ',' + Rinner + ' 0 1,0 0,' + Rinner + ' A' + Rinner + ',' + Rinner + ' 0 1,0 0,-' + Rinner + ' Z';
  }

  var shapeRegistry = [];

  // A. 정다각형 3~20변 (18종)
  for (var s = 3; s <= 20; s++) shapeRegistry.push({ type: 'polygon', points: regularPolygonPts(s, 70) });

  // B. 별 4~16개 꼭짓점 (13종)
  for (var sp = 4; sp <= 16; sp++) shapeRegistry.push({ type: 'polygon', points: starPts(sp, 70, 0.45) });

  // C. 버스트(뱃지/훈장) 6~16개 꼭짓점 (11종)
  for (var b = 6; b <= 16; b++) shapeRegistry.push({ type: 'polygon', points: starPts(b, 70, 0.78) });

  // D. 톱니(기어) 6~20 (8종)
  [6, 8, 10, 12, 14, 16, 18, 20].forEach(function(teeth){
    shapeRegistry.push({ type: 'polygon', points: gearPts(teeth, 70, 50) });
  });

  // E. 꽃잎 4~12장 (9종)
  for (var f = 4; f <= 12; f++) shapeRegistry.push({ type: 'polygon', points: flowerPts(f, 70, 20) });

  // F. 화살표 6종
  shapeRegistry.push({ type: 'polygon', points: [{ x: -70, y: -20 }, { x: 20, y: -20 }, { x: 20, y: -45 }, { x: 70, y: 0 }, { x: 20, y: 45 }, { x: 20, y: 20 }, { x: -70, y: 20 }] }); // →
  shapeRegistry.push({ type: 'polygon', points: [{ x: 70, y: -20 }, { x: -20, y: -20 }, { x: -20, y: -45 }, { x: -70, y: 0 }, { x: -20, y: 45 }, { x: -20, y: 20 }, { x: 70, y: 20 }] }); // ←
  shapeRegistry.push({ type: 'polygon', points: [{ x: -20, y: 70 }, { x: -20, y: -20 }, { x: -45, y: -20 }, { x: 0, y: -70 }, { x: 45, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 70 }] }); // ↑
  shapeRegistry.push({ type: 'polygon', points: [{ x: -20, y: -70 }, { x: -20, y: 20 }, { x: -45, y: 20 }, { x: 0, y: 70 }, { x: 45, y: 20 }, { x: 20, y: 20 }, { x: 20, y: -70 }] }); // ↓
  shapeRegistry.push({ type: 'polygon', points: [{ x: -70, y: 0 }, { x: -30, y: -30 }, { x: -30, y: -10 }, { x: 30, y: -10 }, { x: 30, y: -30 }, { x: 70, y: 0 }, { x: 30, y: 30 }, { x: 30, y: 10 }, { x: -30, y: 10 }, { x: -30, y: 30 }] }); // ↔
  shapeRegistry.push({ type: 'polygon', points: [{ x: 0, y: -70 }, { x: 30, y: -30 }, { x: 10, y: -30 }, { x: 10, y: 30 }, { x: 30, y: 30 }, { x: 0, y: 70 }, { x: -30, y: 30 }, { x: -10, y: 30 }, { x: -10, y: -30 }, { x: -30, y: -30 }] }); // ↕

  // G. 쉐브런 4종
  shapeRegistry.push({ type: 'polygon', points: [{ x: -50, y: -60 }, { x: 20, y: 0 }, { x: -50, y: 60 }, { x: -20, y: 60 }, { x: 50, y: 0 }, { x: -20, y: -60 }] }); // →
  shapeRegistry.push({ type: 'polygon', points: [{ x: 50, y: -60 }, { x: -20, y: 0 }, { x: 50, y: 60 }, { x: 20, y: 60 }, { x: -50, y: 0 }, { x: 20, y: -60 }] }); // ←
  shapeRegistry.push({ type: 'polygon', points: [{ x: -60, y: 50 }, { x: 0, y: -20 }, { x: 60, y: 50 }, { x: 60, y: 20 }, { x: 0, y: -50 }, { x: -60, y: 20 }] }); // ↑
  shapeRegistry.push({ type: 'polygon', points: [{ x: -60, y: -50 }, { x: 0, y: 20 }, { x: 60, y: -50 }, { x: 60, y: -20 }, { x: 0, y: 50 }, { x: -60, y: -20 }] }); // ↓

  // H. 십자가 3종 (얇게/보통/두껍게)
  [18, 26, 34].forEach(function(w){
    shapeRegistry.push({ type: 'polygon', points: [
      { x: -w, y: -70 }, { x: w, y: -70 }, { x: w, y: -w }, { x: 70, y: -w }, { x: 70, y: w }, { x: w, y: w },
      { x: w, y: 70 }, { x: -w, y: 70 }, { x: -w, y: w }, { x: -70, y: w }, { x: -70, y: -w }, { x: -w, y: -w }
    ] });
  });

  // I. 다이아몬드 3종
  shapeRegistry.push({ type: 'polygon', points: [{ x: 0, y: -70 }, { x: 70, y: 0 }, { x: 0, y: 70 }, { x: -70, y: 0 }] });
  shapeRegistry.push({ type: 'polygon', points: [{ x: 0, y: -50 }, { x: 70, y: 0 }, { x: 0, y: 50 }, { x: -70, y: 0 }] });
  shapeRegistry.push({ type: 'polygon', points: [{ x: 0, y: -70 }, { x: 45, y: 0 }, { x: 0, y: 70 }, { x: -45, y: 0 }] });

  // J. 평행사변형/사다리꼴 4종
  shapeRegistry.push({ type: 'polygon', points: [{ x: -70, y: 40 }, { x: -30, y: -40 }, { x: 70, y: -40 }, { x: 30, y: 40 }] });
  shapeRegistry.push({ type: 'polygon', points: [{ x: 70, y: 40 }, { x: 30, y: -40 }, { x: -70, y: -40 }, { x: -30, y: 40 }] });
  shapeRegistry.push({ type: 'polygon', points: [{ x: -70, y: 40 }, { x: -35, y: -40 }, { x: 35, y: -40 }, { x: 70, y: 40 }] });
  shapeRegistry.push({ type: 'polygon', points: [{ x: -35, y: -40 }, { x: 35, y: -40 }, { x: 70, y: 40 }, { x: -70, y: 40 }] });

  // K. 블롭(유기적 얼룩 모양) 3종
  shapeRegistry.push({ type: 'polygon', points: blobPts(3, 65, 15, 0) });
  shapeRegistry.push({ type: 'polygon', points: blobPts(4, 65, 12, 0.4) });
  shapeRegistry.push({ type: 'polygon', points: blobPts(5, 65, 10, 0.8) });

  // L. 손으로 그린 특수 모양 17종
  [
    'M0,25 C-40,-5 -70,-45 -35,-65 C-10,-80 0,-50 0,-40 C0,-50 10,-80 35,-65 C70,-45 40,-5 0,25 Z', // 하트
    'M0,-70 C45,-10 45,45 0,70 C-45,45 -45,-10 0,-70 Z', // 물방울(위로 뾰족)
    'M0,70 C45,10 45,-45 0,-70 C-45,-45 -45,10 0,70 Z', // 물방울(아래로 뾰족)
    'M-10,-68 A70,70 0 1,0 -10,68 A48,48 0 1,1 -10,-68 Z', // 초승달(얇게)
    'M-5,-68 A70,70 0 1,0 -5,68 A30,30 0 1,1 -5,-68 Z', // 초승달(두껍게)
    'M-60,20 A25,25 0 1,1 -50,-20 A30,30 0 1,1 0,-40 A28,28 0 1,1 55,-10 A25,25 0 1,1 60,25 Z', // 구름A
    'M-55,15 A22,22 0 1,1 -45,-18 A26,26 0 1,1 0,-35 A24,24 0 1,1 50,-8 A22,22 0 1,1 55,20 Z', // 구름B
    'M-60,-40 H60 V30 H-10 L-25,60 L-25,30 H-60 Z', // 말풍선(각진 꼬리)
    'M-60,-30 H60 V35 H10 L25,65 L20,35 H-60 Z', // 말풍선(다른 방향 꼬리)
    'M0,-55 C40,-55 60,-20 60,10 C60,45 30,65 0,65 C-30,65 -60,45 -60,10 C-60,-20 -40,-55 0,-55 Z', // 생각풍선(둥근 몸통)
    'M0,-70 L55,-50 L55,10 Q55,50 0,70 Q-55,50 -55,10 L-55,-50 Z', // 방패A
    'M0,-65 Q55,-55 55,0 Q55,55 0,68 Q-55,55 -55,0 Q-55,-55 0,-65 Z', // 방패B
    'M-70,-25 L70,-25 L55,0 L70,25 L-70,25 L-55,0 Z', // 배너/리본
    'M10,-70 L-30,10 L0,10 L-10,70 L40,-10 L5,-10 Z', // 번개
    'M-50,60 V0 A50,50 0 0,1 50,0 V60 Z', // 아치
    ringPathD(70, 50), // 링(얇게)
    ringPathD(70, 30)  // 링(두껍게)
  ].forEach(function(d){ shapeRegistry.push({ type: 'path', d: d }); });

  /* ============================================================
     생성 로직
  ============================================================ */
  function removeExistingRandomShape(){
    var objs = EP.canvas.getObjects().filter(function(o){ return o && o.isRandomShapeGen; });
    objs.forEach(function(o){ EP.canvas.remove(o); });
  }

  function randomVividColor(){
    var hue = Math.floor(Math.random() * 360);
    var sat = Math.round(55 + Math.random() * 35);
    var light = Math.round(42 + Math.random() * 26);
    return 'hsl(' + hue + ',' + sat + '%,' + light + '%)';
  }

  function fitToUniformSize(obj){
    // 모양마다 원래 폭/높이가 달라도, 큰 쪽 기준으로 스케일을 맞춰서 항상 같은 크기로 보이게 함
    var w = obj.width || 1, h = obj.height || 1;
    var scale = TARGET_SIZE / Math.max(w, h);
    obj.scale(scale);
  }

  randomShapeGenBtn.addEventListener('click', function(){
    removeExistingRandomShape();

    var zoom = EP.canvas.getZoom() || 1;
    var cx = (EP.canvas.getWidth() / zoom) / 2;
    var cy = (EP.canvas.getHeight() / zoom) / 2;

    var def = shapeRegistry[Math.floor(Math.random() * shapeRegistry.length)];
    var color = randomVividColor();
    var obj;
    if (def.type === 'polygon') {
      obj = new fabric.Polygon(def.points, {
        left: cx, top: cy, originX: 'center', originY: 'center',
        fill: color, stroke: '', strokeWidth: 0
      });
    } else {
      obj = new fabric.Path(def.d, {
        left: cx, top: cy, originX: 'center', originY: 'center',
        fill: color, stroke: '', strokeWidth: 0
      });
    }
    obj.isRandomShapeGen = true;
    EP.canvas.add(obj);
    fitToUniformSize(obj);
    obj.setCoords();
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    EP.canvas.setActiveObject(obj);
    EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();
  });
})();
