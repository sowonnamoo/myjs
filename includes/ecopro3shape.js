/* ecopro3shape.js — "🔷 자유모양 만들기" 갤러리
   로딩 순서: ecopro3.js -> ... -> ecopro3bg.js -> ecopro3shape.js -> ecopro3text.js -> ...

   이전에는 "🎲 자유모양" 버튼을 누르면 랜덤으로 모양+색상이 하나 정해져서 나왔는데(랜덤 방식),
   이제는 "모양 만들기" 팝업 맨 아래 "🔷 자유모양 만들기" 버튼을 누르면 큰 갤러리 모달이 뜨고,
   그 안에서 기하학적 도형(정다각형/별/기어/화살표 등 약 100종)과 실용 아이콘(전화기/명함/봉투/
   지구본/시계 등 약 68종)을 눈으로 직접 보고 클릭 한 번으로 캔버스에 바로 추가할 수 있음. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var openFreeShapeGalleryBtn = document.getElementById('openFreeShapeGalleryBtn');
  var freeShapeGalleryModal = document.getElementById('freeShapeGalleryModal');
  var freeShapeGalleryGrid = document.getElementById('freeShapeGalleryGrid');
  var freeShapeGalleryCloseBtn = document.getElementById('freeShapeGalleryCloseBtn');

  var TARGET_SIZE = 120; // 갤러리에서 어떤 모양을 고르든 항상 이 크기(가로/세로 중 큰 쪽 기준)로 캔버스에 놓임

  /* ============================================================
     A. 기하학적 도형 생성기 — 반지름 R=70 기준 좌표(중심 0,0)로 만듦
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
  for (var s = 3; s <= 20; s++) shapeRegistry.push({ name: '정다각형(' + s + ')', type: 'polygon', points: regularPolygonPts(s, 70) });

  // B. 별 4~16개 꼭짓점 (13종)
  for (var sp = 4; sp <= 16; sp++) shapeRegistry.push({ name: '별(' + sp + '개)', type: 'polygon', points: starPts(sp, 70, 0.45) });

  // C. 버스트(뱃지/훈장) 6~16개 꼭짓점 (11종)
  for (var b = 6; b <= 16; b++) shapeRegistry.push({ name: '뱃지(' + b + '개)', type: 'polygon', points: starPts(b, 70, 0.78) });

  // D. 톱니(기어) 6~20 (8종)
  [6, 8, 10, 12, 14, 16, 18, 20].forEach(function(teeth){
    shapeRegistry.push({ name: '톱니(' + teeth + ')', type: 'polygon', points: gearPts(teeth, 70, 50) });
  });

  // E. 꽃잎 4~12장 (9종)
  for (var f = 4; f <= 12; f++) shapeRegistry.push({ name: '꽃잎(' + f + '장)', type: 'polygon', points: flowerPts(f, 70, 20) });

  // F. 화살표 6종
  shapeRegistry.push({ name: '화살표 →', type: 'polygon', points: [{ x: -70, y: -20 }, { x: 20, y: -20 }, { x: 20, y: -45 }, { x: 70, y: 0 }, { x: 20, y: 45 }, { x: 20, y: 20 }, { x: -70, y: 20 }] });
  shapeRegistry.push({ name: '화살표 ←', type: 'polygon', points: [{ x: 70, y: -20 }, { x: -20, y: -20 }, { x: -20, y: -45 }, { x: -70, y: 0 }, { x: -20, y: 45 }, { x: -20, y: 20 }, { x: 70, y: 20 }] });
  shapeRegistry.push({ name: '화살표 ↑', type: 'polygon', points: [{ x: -20, y: 70 }, { x: -20, y: -20 }, { x: -45, y: -20 }, { x: 0, y: -70 }, { x: 45, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 70 }] });
  shapeRegistry.push({ name: '화살표 ↓', type: 'polygon', points: [{ x: -20, y: -70 }, { x: -20, y: 20 }, { x: -45, y: 20 }, { x: 0, y: 70 }, { x: 45, y: 20 }, { x: 20, y: 20 }, { x: 20, y: -70 }] });
  shapeRegistry.push({ name: '양쪽화살표 ↔', type: 'polygon', points: [{ x: -70, y: 0 }, { x: -30, y: -30 }, { x: -30, y: -10 }, { x: 30, y: -10 }, { x: 30, y: -30 }, { x: 70, y: 0 }, { x: 30, y: 30 }, { x: 30, y: 10 }, { x: -30, y: 10 }, { x: -30, y: 30 }] });
  shapeRegistry.push({ name: '양쪽화살표 ↕', type: 'polygon', points: [{ x: 0, y: -70 }, { x: 30, y: -30 }, { x: 10, y: -30 }, { x: 10, y: 30 }, { x: 30, y: 30 }, { x: 0, y: 70 }, { x: -30, y: 30 }, { x: -10, y: 30 }, { x: -10, y: -30 }, { x: -30, y: -30 }] });

  // G. 쉐브런 4종
  shapeRegistry.push({ name: '쉐브런 →', type: 'polygon', points: [{ x: -50, y: -60 }, { x: 20, y: 0 }, { x: -50, y: 60 }, { x: -20, y: 60 }, { x: 50, y: 0 }, { x: -20, y: -60 }] });
  shapeRegistry.push({ name: '쉐브런 ←', type: 'polygon', points: [{ x: 50, y: -60 }, { x: -20, y: 0 }, { x: 50, y: 60 }, { x: 20, y: 60 }, { x: -50, y: 0 }, { x: 20, y: -60 }] });
  shapeRegistry.push({ name: '쉐브런 ↑', type: 'polygon', points: [{ x: -60, y: 50 }, { x: 0, y: -20 }, { x: 60, y: 50 }, { x: 60, y: 20 }, { x: 0, y: -50 }, { x: -60, y: 20 }] });
  shapeRegistry.push({ name: '쉐브런 ↓', type: 'polygon', points: [{ x: -60, y: -50 }, { x: 0, y: 20 }, { x: 60, y: -50 }, { x: 60, y: -20 }, { x: 0, y: 50 }, { x: -60, y: -20 }] });

  // H. 십자가 3종 (얇게/보통/두껍게)
  [18, 26, 34].forEach(function(w, idx){
    var labels = ['얇게', '보통', '두껍게'];
    shapeRegistry.push({ name: '십자가(' + labels[idx] + ')', type: 'polygon', points: [
      { x: -w, y: -70 }, { x: w, y: -70 }, { x: w, y: -w }, { x: 70, y: -w }, { x: 70, y: w }, { x: w, y: w },
      { x: w, y: 70 }, { x: -w, y: 70 }, { x: -w, y: w }, { x: -70, y: w }, { x: -70, y: -w }, { x: -w, y: -w }
    ] });
  });

  // I. 다이아몬드 3종
  shapeRegistry.push({ name: '다이아몬드(넓게)', type: 'polygon', points: [{ x: 0, y: -70 }, { x: 70, y: 0 }, { x: 0, y: 70 }, { x: -70, y: 0 }] });
  shapeRegistry.push({ name: '다이아몬드(납작)', type: 'polygon', points: [{ x: 0, y: -50 }, { x: 70, y: 0 }, { x: 0, y: 50 }, { x: -70, y: 0 }] });
  shapeRegistry.push({ name: '다이아몬드(길쭉)', type: 'polygon', points: [{ x: 0, y: -70 }, { x: 45, y: 0 }, { x: 0, y: 70 }, { x: -45, y: 0 }] });

  // J. 평행사변형/사다리꼴 4종
  shapeRegistry.push({ name: '평행사변형(우)', type: 'polygon', points: [{ x: -70, y: 40 }, { x: -30, y: -40 }, { x: 70, y: -40 }, { x: 30, y: 40 }] });
  shapeRegistry.push({ name: '평행사변형(좌)', type: 'polygon', points: [{ x: 70, y: 40 }, { x: 30, y: -40 }, { x: -70, y: -40 }, { x: -30, y: 40 }] });
  shapeRegistry.push({ name: '사다리꼴(위)', type: 'polygon', points: [{ x: -70, y: 40 }, { x: -35, y: -40 }, { x: 35, y: -40 }, { x: 70, y: 40 }] });
  shapeRegistry.push({ name: '사다리꼴(아래)', type: 'polygon', points: [{ x: -35, y: -40 }, { x: 35, y: -40 }, { x: 70, y: 40 }, { x: -70, y: 40 }] });

  // K. 블롭(유기적 얼룩 모양) 3종
  shapeRegistry.push({ name: '블롭A', type: 'polygon', points: blobPts(3, 65, 15, 0) });
  shapeRegistry.push({ name: '블롭B', type: 'polygon', points: blobPts(4, 65, 12, 0.4) });
  shapeRegistry.push({ name: '블롭C', type: 'polygon', points: blobPts(5, 65, 10, 0.8) });

  // L. 손으로 그린 특수 모양 17종
  [
    ['하트', 'M0,25 C-40,-5 -70,-45 -35,-65 C-10,-80 0,-50 0,-40 C0,-50 10,-80 35,-65 C70,-45 40,-5 0,25 Z'],
    ['물방울(위)', 'M0,-70 C45,-10 45,45 0,70 C-45,45 -45,-10 0,-70 Z'],
    ['물방울(아래)', 'M0,70 C45,10 45,-45 0,-70 C-45,-45 -45,10 0,70 Z'],
    ['초승달(얇게)', 'M-10,-68 A70,70 0 1,0 -10,68 A48,48 0 1,1 -10,-68 Z'],
    ['초승달(두껍게)', 'M-5,-68 A70,70 0 1,0 -5,68 A30,30 0 1,1 -5,-68 Z'],
    ['구름A', 'M-60,20 A25,25 0 1,1 -50,-20 A30,30 0 1,1 0,-40 A28,28 0 1,1 55,-10 A25,25 0 1,1 60,25 Z'],
    ['구름B', 'M-55,15 A22,22 0 1,1 -45,-18 A26,26 0 1,1 0,-35 A24,24 0 1,1 50,-8 A22,22 0 1,1 55,20 Z'],
    ['말풍선(각진꼬리)', 'M-60,-40 H60 V30 H-10 L-25,60 L-25,30 H-60 Z'],
    ['말풍선(다른꼬리)', 'M-60,-30 H60 V35 H10 L25,65 L20,35 H-60 Z'],
    ['생각풍선', 'M0,-55 C40,-55 60,-20 60,10 C60,45 30,65 0,65 C-30,65 -60,45 -60,10 C-60,-20 -40,-55 0,-55 Z'],
    ['방패A', 'M0,-70 L55,-50 L55,10 Q55,50 0,70 Q-55,50 -55,10 L-55,-50 Z'],
    ['방패B', 'M0,-65 Q55,-55 55,0 Q55,55 0,68 Q-55,55 -55,0 Q-55,-55 0,-65 Z'],
    ['배너/리본', 'M-70,-25 L70,-25 L55,0 L70,25 L-70,25 L-55,0 Z'],
    ['번개', 'M10,-70 L-30,10 L0,10 L-10,70 L40,-10 L5,-10 Z'],
    ['아치', 'M-50,60 V0 A50,50 0 0,1 50,0 V60 Z'],
    ['링(얇게)', ringPathD(70, 50)],
    ['링(두껍게)', ringPathD(70, 30)]
  ].forEach(function(pair){ shapeRegistry.push({ name: pair[0], type: 'path', d: pair[1] }); });

  /* ============================================================
     B. 실용 아이콘 생성기(0~100 정규화 좌표) — ecopro2에서 이식
  ============================================================ */
  function roundedRectWH(x, y, w, h, r, cornerSamples){
    cornerSamples = cornerSamples || 5;
    var pts = [];
    var corners = [
      { cx: x + w - r, cy: y + r, start: -90 },
      { cx: x + w - r, cy: y + h - r, start: 0 },
      { cx: x + r, cy: y + h - r, start: 90 },
      { cx: x + r, cy: y + r, start: 180 }
    ];
    corners.forEach(function(c){
      for (var i = 0; i <= cornerSamples; i++) {
        var a = (c.start + (i / cornerSamples) * 90) * Math.PI / 180;
        pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
      }
    });
    return pts;
  }
  function ngonPoints(sides, r, cx, cy, rotDeg){
    r = r || 46; cx = cx == null ? 50 : cx; cy = cy == null ? 50 : cy; rotDeg = rotDeg == null ? -90 : rotDeg;
    var pts = [];
    for (var i = 0; i < sides; i++) {
      var a = (rotDeg + i * 360 / sides) * Math.PI / 180;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }
  function starPoints(points, outerR, innerRatio, cx, cy, rotDeg){
    outerR = outerR || 46; innerRatio = innerRatio == null ? 0.5 : innerRatio;
    cx = cx == null ? 50 : cx; cy = cy == null ? 50 : cy; rotDeg = rotDeg == null ? -90 : rotDeg;
    var innerR = outerR * innerRatio;
    var step = 180 / points;
    var pts = [];
    for (var i = 0; i < points * 2; i++) {
      var r = (i % 2 === 0) ? outerR : innerR;
      var a = (rotDeg + i * step) * Math.PI / 180;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }
  function handsetPoints(n){
    n = n || 20;
    var outer = [], inner = [];
    for (var i = 0; i <= n; i++) {
      var a = (135 + i * 180 / n) * Math.PI / 180;
      outer.push({ x: 50 + 42 * Math.cos(a), y: 50 + 42 * Math.sin(a) });
    }
    for (var j = 0; j <= n; j++) {
      var a2 = (315 - j * 180 / n) * Math.PI / 180;
      inner.push({ x: 50 + 21 * Math.cos(a2), y: 50 + 21 * Math.sin(a2) });
    }
    return outer.concat(inner);
  }
  function faxPoints(){
    return [{x:30,y:2},{x:70,y:2},{x:70,y:20},{x:85,y:20},{x:85,y:75},{x:95,y:75},{x:95,y:90},
            {x:5,y:90},{x:5,y:75},{x:15,y:75},{x:15,y:20},{x:30,y:20}];
  }
  function printerPoints(){
    return [{x:38,y:0},{x:62,y:0},{x:62,y:15},{x:78,y:15},{x:78,y:55},{x:92,y:55},{x:92,y:85},
            {x:8,y:85},{x:8,y:55},{x:22,y:55},{x:22,y:15},{x:38,y:15}];
  }
  function monitorPoints(){
    return [{x:8,y:8},{x:92,y:8},{x:92,y:60},{x:60,y:60},{x:60,y:80},{x:76,y:80},{x:76,y:92},
            {x:24,y:92},{x:24,y:80},{x:40,y:80},{x:40,y:60},{x:8,y:60}];
  }
  function laptopPoints(){
    return [{x:20,y:4},{x:80,y:4},{x:86,y:60},{x:98,y:60},{x:98,y:72},{x:2,y:72},{x:2,y:60},{x:14,y:60}];
  }
  function warningTrianglePoints(){
    return [{x:46,y:4},{x:46,y:58},{x:54,y:58},{x:54,y:4},{x:94,y:90},{x:6,y:90}];
  }
  function leafPoints(n){
    n = n || 24;
    var pts = [];
    for (var i = 0; i <= n; i++) { var t = i / n; pts.push({ x: 50 + 44 * Math.sin(t * Math.PI), y: 4 + t * 88 }); }
    for (var j = 0; j <= n; j++) { var t2 = j / n; pts.push({ x: 50 - 30 * Math.sin(t2 * Math.PI), y: 92 - t2 * 88 }); }
    return pts;
  }
  function treePoints(){
    return [{x:50,y:2},{x:82,y:46},{x:66,y:46},{x:90,y:80},{x:58,y:80},{x:58,y:98},{x:42,y:98},
            {x:42,y:80},{x:10,y:80},{x:34,y:46},{x:18,y:46}];
  }
  function bookPoints(){
    return [{x:8,y:6},{x:46,y:6},{x:50,y:12},{x:54,y:6},{x:92,y:6},{x:92,y:94},{x:54,y:94},
            {x:50,y:88},{x:46,y:94},{x:8,y:94}];
  }
  function openBookPoints(){
    return [{x:8,y:96},{x:8,y:22},{x:50,y:14},{x:92,y:22},{x:92,y:96},{x:50,y:88}];
  }
  function envelopePoints(){
    return [{x:4,y:12},{x:50,y:52},{x:96,y:12},{x:96,y:90},{x:4,y:90}];
  }
  function folderPoints(){
    return [{x:4,y:20},{x:36,y:20},{x:44,y:32},{x:96,y:32},{x:96,y:88},{x:4,y:88}];
  }
  function documentPoints(){
    return [{x:16,y:2},{x:70,y:2},{x:84,y:16},{x:84,y:98},{x:16,y:98}];
  }
  function clipboardPoints(){
    return [{x:12,y:14},{x:36,y:14},{x:36,y:2},{x:64,y:2},{x:64,y:14},{x:88,y:14},{x:88,y:98},{x:12,y:98}];
  }
  function pencilPoints(){
    return [{x:6,y:94},{x:2,y:78},{x:70,y:10},{x:86,y:26},{x:18,y:94}];
  }
  function briefcasePoints(){
    return [{x:36,y:14},{x:36,y:2},{x:64,y:2},{x:64,y:14},{x:96,y:14},{x:96,y:90},{x:4,y:90},{x:4,y:14}];
  }
  function tagPoints(){
    return [{x:4,y:50},{x:44,y:6},{x:96,y:6},{x:96,y:58},{x:54,y:96}];
  }
  function pinPoints(n){
    n = n || 26;
    var pts = [];
    for (var i = 0; i <= n; i++) { var a = Math.PI + (i / n) * Math.PI; pts.push({ x: 50 + 40 * Math.cos(a), y: 40 + 40 * Math.sin(a) }); }
    pts.push({ x: 50, y: 98 });
    return pts;
  }
  function calendarPoints(){
    return [{x:2,y:12},{x:20,y:12},{x:20,y:2},{x:32,y:2},{x:32,y:12},{x:68,y:12},{x:68,y:2},
            {x:80,y:2},{x:80,y:12},{x:98,y:12},{x:98,y:98},{x:2,y:98}];
  }
  function batteryPoints(){
    return [{x:2,y:26},{x:86,y:26},{x:86,y:14},{x:98,y:14},{x:98,y:62},{x:86,y:62},{x:86,y:50},{x:2,y:50}];
  }
  function giftBoxPoints(){
    return [{x:4,y:30},{x:44,y:30},{x:44,y:2},{x:56,y:2},{x:56,y:30},{x:96,y:30},{x:96,y:96},{x:4,y:96}];
  }
  function shoppingBagPoints(){
    return [{x:12,y:2},{x:28,y:2},{x:28,y:20},{x:16,y:20},{x:8,y:98},{x:92,y:98},{x:84,y:20},
            {x:72,y:20},{x:72,y:2},{x:88,y:2},{x:88,y:20},{x:98,y:20},{x:98,y:100},{x:2,y:100},{x:2,y:20},{x:12,y:20}];
  }
  function truckPoints(){
    return [{x:2,y:30},{x:60,y:30},{x:60,y:16},{x:82,y:16},{x:98,y:40},{x:98,y:74},{x:2,y:74}];
  }
  function coffeeCupPoints(){
    return [{x:12,y:14},{x:76,y:14},{x:88,y:16},{x:92,y:36},{x:80,y:40},{x:76,y:20},{x:72,y:92},{x:16,y:92}];
  }
  function flagPoints(){
    return [{x:14,y:98},{x:14,y:2},{x:20,y:2},{x:20,y:8},{x:88,y:10},{x:70,y:34},{x:88,y:58},{x:20,y:58},{x:20,y:98}];
  }
  function bellPoints(){
    return [{x:50,y:2},{x:78,y:24},{x:82,y:70},{x:94,y:82},{x:6,y:82},{x:18,y:70},{x:22,y:24}];
  }
  function keyPoints(n){
    n = n || 16;
    var pts = [];
    for (var i = 0; i <= n; i++) { var a = (90 + (i / n) * 180) * Math.PI / 180; pts.push({ x: 20 + 18 * Math.cos(a), y: 40 + 18 * Math.sin(a) }); }
    pts.push({x:20,y:34},{x:94,y:34},{x:94,y:46},{x:84,y:46},{x:84,y:56},{x:72,y:56},{x:72,y:46},{x:20,y:46});
    return pts;
  }
  function umbrellaPoints(bumps){
    bumps = bumps || 6;
    var pts = []; var total = bumps * 2;
    for (var i = 0; i <= total; i++) {
      var t = i / total; var baseAngle = Math.PI * (1 - t); var wave = (i % 2 === 0) ? 0 : 6; var r = 46 - wave;
      pts.push({ x: 50 + r * Math.cos(baseAngle), y: 50 - r * Math.sin(baseAngle) });
    }
    pts.push({x:53,y:50},{x:53,y:92},{x:47,y:92},{x:47,y:50});
    return pts;
  }
  function heartPoints(n){
    n = n || 48;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var x = 16 * Math.pow(Math.sin(t), 3);
      var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push({ x: 50 + x * 2.5, y: 50 + y * 2.3 });
    }
    return pts;
  }
  function crossPoints(thickness){
    thickness = thickness == null ? 0.34 : thickness;
    var t = 50 * thickness;
    return [
      {x:50-t,y:2},{x:50+t,y:2},{x:50+t,y:50-t},{x:98,y:50-t},{x:98,y:50+t},
      {x:50+t,y:50+t},{x:50+t,y:98},{x:50-t,y:98},{x:50-t,y:50+t},{x:2,y:50+t},
      {x:2,y:50-t},{x:50-t,y:50-t}
    ];
  }
  function checkmarkPoints(){ return [{x:2,y:55},{x:20,y:38},{x:40,y:62},{x:90,y:8},{x:98,y:18},{x:42,y:88}]; }
  function xmarkPoints(){
    var t = 12;
    return [
      {x:0,y:t},{x:50-t,y:50},{x:0,y:100-t},{x:t,y:100},{x:50,y:50+t},
      {x:100-t,y:100},{x:100,y:100-t},{x:50+t,y:50},{x:100,y:t},{x:100-t,y:0},
      {x:50,y:50-t},{x:t,y:0}
    ];
  }
  function speechBubblePoints(){ return [{x:2,y:2},{x:98,y:2},{x:98,y:78},{x:30,y:78},{x:12,y:98},{x:26,y:76},{x:2,y:76}]; }
  function cloudPoints(n){
    n = n || 60;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var r = 34 + 9 * Math.sin(3.3 * t) + 5 * Math.sin(5.1 * t + 1);
      pts.push({ x: 50 + r * Math.cos(t), y: 55 + r * 0.72 * Math.sin(t) });
    }
    return pts;
  }
  function housePoints(){ return [{x:50,y:2},{x:98,y:42},{x:98,y:98},{x:2,y:98},{x:2,y:42}]; }
  function ellipsePathD(cx, cy, rx, ry){
    return 'M' + (cx + rx) + ',' + cy + ' A' + rx + ',' + ry + ' 0 1,0 ' + (cx - rx) + ',' + cy + ' A' + rx + ',' + ry + ' 0 1,0 ' + (cx + rx) + ',' + cy + ' Z';
  }
  function globePathD(){
    return ellipsePathD(50, 50, 44, 44) + ' ' + ellipsePathD(50, 50, 44, 13) + ' ' + ellipsePathD(50, 50, 44, 26) + ' ' + ellipsePathD(50, 50, 13, 44);
  }
  function pointsToPathD(points){
    return 'M' + points.map(function(p){ return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join('L') + 'Z';
  }
  function compoundPathD(subpaths){ return subpaths.map(pointsToPathD).join(' '); }
  function scalePointsAroundCenter(pts, scale, cx, cy){
    cx = cx == null ? 50 : cx; cy = cy == null ? 50 : cy;
    return pts.map(function(p){ return { x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale }; });
  }
  function waveArcPoints(rOuter, rInner, cx, cy, angleSpan, n){
    n = n || 12; cy = cy == null ? 50 : cy;
    var outer = [], inner = [];
    for (var i = 0; i <= n; i++) { var a = (-angleSpan / 2 + i * angleSpan / n) * Math.PI / 180; outer.push({ x: cx + rOuter * Math.cos(a), y: cy + rOuter * Math.sin(a) }); }
    for (var j = 0; j <= n; j++) { var a2 = (angleSpan / 2 - j * angleSpan / n) * Math.PI / 180; inner.push({ x: cx + rInner * Math.cos(a2), y: cy + rInner * Math.sin(a2) }); }
    return outer.concat(inner);
  }
  function envelopeOutlinePoints(){ return [{x:2,y:14},{x:50,y:56},{x:98,y:14},{x:98,y:90},{x:2,y:90}]; }
  function phoneBadgePathD(){
    var outer = roundedRectWH(4, 4, 92, 92, 16);
    var hole = scalePointsAroundCenter(handsetPoints(), 0.6, 50, 50);
    return compoundPathD([outer, hole]);
  }
  function phoneCallPathD(){
    return 'M27.58 44.96c6.0 11.79 15.67 21.42 27.46 27.46l9.17 -9.17c1.13 -1.13 2.79 -1.5 4.25 -1.0'
         + 'c4.67 1.54 9.71 2.38 14.88 2.38c2.29 0.0 4.17 1.88 4.17 4.17V83.33c0.0 2.29 -1.88 4.17 -4.17 4.17'
         + 'c-39.13 0.0 -70.83 -31.71 -70.83 -70.83c0.0 -2.29 1.88 -4.17 4.17 -4.17h14.58'
         + 'c2.29 0.0 4.17 1.88 4.17 4.17c0.0 5.21 0.83 10.21 2.38 14.88c0.46 1.46 0.12 3.08 -1.04 4.25'
         + 'l-9.17 9.17z';
  }
  function checkboxPathD(){
    var outerSq = roundedRectWH(4, 4, 92, 92, 10);
    var innerSq = roundedRectWH(16, 16, 68, 68, 6);
    var check = scalePointsAroundCenter(checkmarkPoints(), 0.58, 50, 50);
    return compoundPathD([outerSq, innerSq, check]);
  }
  function speakerBodyPoints(){ return [{x:2,y:36},{x:26,y:36},{x:54,y:12},{x:54,y:88},{x:26,y:64},{x:2,y:64}]; }
  function speakerPathD(){
    return compoundPathD([speakerBodyPoints(), waveArcPoints(20, 14, 60, 50, 80), waveArcPoints(36, 30, 60, 50, 92)]);
  }
  function rotatePoints(pts, deg, cx, cy){
    cx = cx == null ? 50 : cx; cy = cy == null ? 50 : cy;
    var rad = deg * Math.PI / 180;
    return pts.map(function(p){
      return { x: cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad), y: cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad) };
    });
  }
  function arrowPoints(dir){
    var shapes = {
      up:    [{x:50,y:2},{x:92,y:42},{x:68,y:42},{x:68,y:98},{x:32,y:98},{x:32,y:42},{x:8,y:42}],
      down:  [{x:50,y:98},{x:92,y:58},{x:68,y:58},{x:68,y:2},{x:32,y:2},{x:32,y:58},{x:8,y:58}],
      left:  [{x:2,y:50},{x:42,y:8},{x:42,y:32},{x:98,y:32},{x:98,y:68},{x:42,y:68},{x:42,y:92}],
      right: [{x:98,y:50},{x:58,y:8},{x:58,y:32},{x:2,y:32},{x:2,y:68},{x:58,y:68},{x:58,y:92}]
    };
    return shapes[dir];
  }
  function chevronPoints(dir){
    var shapes = {
      up:    [{x:50,y:10},{x:95,y:55},{x:80,y:70},{x:50,y:40},{x:20,y:70},{x:5,y:55}],
      down:  [{x:50,y:90},{x:95,y:45},{x:80,y:30},{x:50,y:60},{x:20,y:30},{x:5,y:45}],
      left:  [{x:10,y:50},{x:55,y:5},{x:70,y:20},{x:40,y:50},{x:70,y:80},{x:55,y:95}],
      right: [{x:90,y:50},{x:45,y:5},{x:30,y:20},{x:60,y:50},{x:30,y:80},{x:45,y:95}]
    };
    return shapes[dir];
  }
  function teardropPoints(n){
    n = n || 26;
    var pts = [];
    for (var i = 0; i <= n; i++) { var a = (i / n) * Math.PI; pts.push({ x: 50 + 40 * Math.cos(a), y: 60 + 40 * Math.sin(a) }); }
    pts.push({ x: 50, y: 2 });
    return pts;
  }
  function lightningPoints(){ return [{x:58,y:2},{x:20,y:56},{x:46,y:56},{x:38,y:98},{x:82,y:40},{x:54,y:40}]; }
  function diamondPoints(){ return ngonPoints(4, 48, 50, 50, -90); }
  function parallelogramPoints(dir){
    return dir === 'right' ? [{x:25,y:2},{x:98,y:2},{x:75,y:98},{x:2,y:98}] : [{x:75,y:2},{x:98,y:98},{x:25,y:98},{x:2,y:2}];
  }
  function trapezoidPoints(dir){
    return dir === 'up' ? [{x:30,y:2},{x:70,y:2},{x:98,y:98},{x:2,y:98}] : [{x:2,y:2},{x:98,y:2},{x:70,y:98},{x:30,y:98}];
  }
  function roundedRectPoints(rx, cornerSamples){
    rx = rx == null ? 18 : rx; cornerSamples = cornerSamples || 6;
    return roundedRectWH(0, 0, 100, 100, rx, cornerSamples);
  }
  function semicirclePoints(n){
    n = n || 30;
    var pts = [];
    for (var i = 0; i <= n; i++) { var a = Math.PI - (i / n) * Math.PI; pts.push({ x: 50 + 48 * Math.cos(a), y: 98 - 96 * Math.sin(a) }); }
    return pts;
  }
  function quarterCirclePoints(n){
    n = n || 24;
    var pts = [{x:2,y:98},{x:2,y:2}];
    for (var i = 0; i <= n; i++) { var a = (i / n) * Math.PI / 2; pts.push({ x: 2 + 96 * Math.sin(a), y: 98 - 96 * (1 - Math.cos(a)) }); }
    return pts;
  }
  function pieSlicePoints(startDeg, endDeg, n){
    n = n || 24;
    var pts = [{ x: 50, y: 50 }];
    for (var i = 0; i <= n; i++) { var a = (startDeg + (endDeg - startDeg) * i / n) * Math.PI / 180; pts.push({ x: 50 + 48 * Math.cos(a), y: 50 + 48 * Math.sin(a) }); }
    return pts;
  }
  function crescentLensPoints(n){
    n = n || 30;
    var outer = [], inner = [];
    for (var i = 0; i <= n; i++) { var a = (-100 + i * 200 / n) * Math.PI / 180; outer.push({ x: 50 + 44 * Math.cos(a), y: 50 + 44 * Math.sin(a) }); }
    for (var j = 0; j <= n; j++) { var a2 = (100 - j * 200 / n) * Math.PI / 180; inner.push({ x: 50 + 30 * Math.cos(a2), y: 50 + 30 * Math.sin(a2) }); }
    return outer.concat(inner);
  }

  // 0~100 정규화 좌표 기반 실용 아이콘 68종 (points는 0~100 기준이라 삽입시 별도로 스케일함)
  var NAMED_SHAPES = [
    { name: '전화기', points: handsetPoints(), norm: true },
    { name: '전화(통화)', type: 'path', d: phoneCallPathD(), norm: true },
    { name: '팩스', points: faxPoints(), norm: true },
    { name: '스마트폰', points: roundedRectWH(22, 4, 56, 92, 10), norm: true },
    { name: '태블릿', points: roundedRectWH(10, 14, 80, 72, 8), norm: true },
    { name: '컴퓨터(모니터)', points: monitorPoints(), norm: true },
    { name: '노트북', points: laptopPoints(), norm: true },
    { name: '프린터', points: printerPoints(), norm: true },
    { name: '경고', points: warningTrianglePoints(), norm: true },
    { name: '정지(팔각형)', points: ngonPoints(8), norm: true },
    { name: '지구본', type: 'path', d: globePathD(), norm: true },
    { name: '나뭇잎', points: leafPoints(), norm: true },
    { name: '나무', points: treePoints(), norm: true },
    { name: '태양', points: starPoints(16, 46, 0.78), norm: true },
    { name: '명함', points: roundedRectWH(4, 24, 92, 52, 8), norm: true },
    { name: '책', points: bookPoints(), norm: true },
    { name: '펼친책', points: openBookPoints(), norm: true },
    { name: '봉투(이메일)', points: envelopePoints(), norm: true },
    { name: '봉투(윤곽형)', points: envelopeOutlinePoints(), norm: true },
    { name: '전화기(뱃지)', type: 'path', d: phoneBadgePathD(), norm: true },
    { name: '체크박스', type: 'path', d: checkboxPathD(), norm: true },
    { name: '스피커(알림음)', type: 'path', d: speakerPathD(), norm: true },
    { name: '폴더', points: folderPoints(), norm: true },
    { name: '문서', points: documentPoints(), norm: true },
    { name: '클립보드', points: clipboardPoints(), norm: true },
    { name: '연필', points: pencilPoints(), norm: true },
    { name: '서류가방', points: briefcasePoints(), norm: true },
    { name: '가격표', points: tagPoints(), norm: true },
    { name: '도장/뱃지', points: starPoints(24, 46, 0.86), norm: true },
    { name: '위치핀', points: pinPoints(), norm: true },
    { name: '시계', points: starPoints(12, 46, 0.9), norm: true },
    { name: '달력', points: calendarPoints(), norm: true },
    { name: '배터리', points: batteryPoints(), norm: true },
    { name: '선물상자', points: giftBoxPoints(), norm: true },
    { name: '쇼핑백', points: shoppingBagPoints(), norm: true },
    { name: '트럭(배송)', points: truckPoints(), norm: true },
    { name: '커피컵', points: coffeeCupPoints(), norm: true },
    { name: '깃발', points: flagPoints(), norm: true },
    { name: '나침반', points: starPoints(4, 46, 0.28), norm: true },
    { name: '종(알림)', points: bellPoints(), norm: true },
    { name: '열쇠', points: keyPoints(), norm: true },
    { name: '우산', points: umbrellaPoints(), norm: true },
    { name: '집', points: housePoints(), norm: true },
    { name: '말풍선', points: speechBubblePoints(), norm: true },
    { name: '구름', points: cloudPoints(), norm: true },
    { name: '별(꽉찬)', points: starPoints(5, 46, 0.5), norm: true },
    { name: '하트(꽉찬)', points: heartPoints(), norm: true },
    { name: '플러스(의료)', points: crossPoints(), norm: true },
    { name: '체크표시', points: checkmarkPoints(), norm: true },
    { name: 'X표시', points: xmarkPoints(), norm: true },
    { name: '화살표 up', points: arrowPoints('up'), norm: true },
    { name: '화살표 down', points: arrowPoints('down'), norm: true },
    { name: '화살표 left', points: arrowPoints('left'), norm: true },
    { name: '화살표 right', points: arrowPoints('right'), norm: true },
    { name: '대각선 화살표45', points: rotatePoints(arrowPoints('up'), 45), norm: true },
    { name: '대각선 화살표135', points: rotatePoints(arrowPoints('up'), 135), norm: true },
    { name: '대각선 화살표225', points: rotatePoints(arrowPoints('up'), 225), norm: true },
    { name: '대각선 화살표315', points: rotatePoints(arrowPoints('up'), 315), norm: true },
    { name: '양쪽화살표(가로)', points: [{x:2,y:50},{x:22,y:30},{x:22,y:42},{x:78,y:42},{x:78,y:30},{x:98,y:50},{x:78,y:70},{x:78,y:58},{x:22,y:58},{x:22,y:70}], norm: true },
    { name: '양쪽화살표(세로)', points: [{x:50,y:2},{x:30,y:22},{x:42,y:22},{x:42,y:78},{x:30,y:78},{x:50,y:98},{x:70,y:78},{x:58,y:78},{x:58,y:22},{x:70,y:22}], norm: true },
    { name: '쉐브론 up', points: chevronPoints('up'), norm: true },
    { name: '쉐브론 down', points: chevronPoints('down'), norm: true },
    { name: '쉐브론 left', points: chevronPoints('left'), norm: true },
    { name: '쉐브론 right', points: chevronPoints('right'), norm: true },
    { name: '마름모', points: diamondPoints(), norm: true },
    { name: '평행사변형(우)', points: parallelogramPoints('right'), norm: true },
    { name: '평행사변형(좌)', points: parallelogramPoints('left'), norm: true },
    { name: '사다리꼴(위)', points: trapezoidPoints('up'), norm: true },
    { name: '사다리꼴(아래)', points: trapezoidPoints('down'), norm: true },
    { name: '번개(아이콘)', points: lightningPoints(), norm: true },
    { name: '눈물방울', points: teardropPoints(), norm: true },
    { name: '둥근사각형(작게)', points: roundedRectPoints(10), norm: true },
    { name: '둥근사각형(크게)', points: roundedRectPoints(28), norm: true },
    { name: '반원', points: semicirclePoints(), norm: true },
    { name: '부채꼴(사분원)', points: quarterCirclePoints(), norm: true },
    { name: '파이(90도)', points: pieSlicePoints(-45, 45), norm: true },
    { name: '파이(270도)', points: pieSlicePoints(45, 315), norm: true },
    { name: '초승달(렌즈)', points: crescentLensPoints(), norm: true }
  ];

  var galleryShapes = NAMED_SHAPES.concat(shapeRegistry);

  /* ============================================================
     C. 갤러리 렌더링 & 클릭시 캔버스에 추가
  ============================================================ */
  var galleryColor = '#3498db';

  function shapeToSvgMarkup(shape){
    if (shape.type === 'path') {
      return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="' + shape.d + '" fill="' + galleryColor + '" fill-rule="evenodd"/></svg>';
    }
    var attr = shape.points.map(function(p){ return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    // norm(0~100 정규화) 도형은 뷰박스가 그대로 0~100, 그 외(반지름 70 기준) 도형은 중심이 0,0이라 뷰박스를 -100~100으로 맞춤
    var viewBox = shape.norm ? '0 0 100 100' : '-100 -100 200 200';
    return '<svg viewBox="' + viewBox + '" xmlns="http://www.w3.org/2000/svg"><polygon points="' + attr + '" fill="' + galleryColor + '"/></svg>';
  }

  var galleryBuilt = false;
  function buildFreeShapeGallery(){
    if (galleryBuilt) return;
    galleryBuilt = true;
    var frag = document.createDocumentFragment();
    galleryShapes.forEach(function(shape, idx){
      var item = document.createElement('div');
      item.className = 'free-shape-item';
      item.title = shape.name;
      item.innerHTML = shapeToSvgMarkup(shape);
      item.addEventListener('click', function(){ insertFreeShape(idx); });
      frag.appendChild(item);
    });
    freeShapeGalleryGrid.appendChild(frag);
  }

  function fitToUniformSize(obj){
    var w = obj.width || 1, h = obj.height || 1;
    var scale = TARGET_SIZE / Math.max(w, h);
    obj.scale(scale);
  }

  function insertFreeShape(idx){
    var shape = galleryShapes[idx];
    if (!shape) return;
    var zoom = EP.canvas.getZoom() || 1;
    var cx = (EP.canvas.getWidth() / zoom) / 2;
    var cy = (EP.canvas.getHeight() / zoom) / 2;

    var obj;
    if (shape.type === 'path') {
      obj = new fabric.Path(shape.d, {
        left: cx, top: cy, originX: 'center', originY: 'center',
        fill: galleryColor, fillRule: shape.norm ? 'evenodd' : 'nonzero', stroke: '', strokeWidth: 0
      });
    } else {
      obj = new fabric.Polygon(shape.points, {
        left: cx, top: cy, originX: 'center', originY: 'center',
        fill: galleryColor, stroke: '', strokeWidth: 0
      });
    }
    EP.canvas.add(obj);
    fitToUniformSize(obj);
    obj.setCoords();
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    EP.canvas.setActiveObject(obj);
    EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();
    // PC에서는 여러 개를 연달아 골라 추가할 수 있게 자동으로 안 닫음(✕로만 닫힘).
    // 모바일에서만 화면이 좁아 갤러리가 캔버스를 계속 가리는 게 더 불편하므로,
    // 모양을 하나 넣으면 바로 갤러리가 자동으로 닫히게 함
    if (EP.isMobileModeActive && EP.isMobileModeActive()) hideFreeShapeGallery();
  }

  function showFreeShapeGallery(){
    buildFreeShapeGallery();
    freeShapeGalleryModal.classList.add('visible');
  }
  function hideFreeShapeGallery(){ freeShapeGalleryModal.classList.remove('visible'); }

  openFreeShapeGalleryBtn.addEventListener('click', function(){
    var shapePickerModal = document.getElementById('shapePickerModal');
    if (shapePickerModal) shapePickerModal.classList.add('hidden'); // 작은 모양 만들기 팝업은 접어두고 갤러리를 보여줌
    showFreeShapeGallery();
  });
  freeShapeGalleryCloseBtn.addEventListener('click', hideFreeShapeGallery);
  freeShapeGalleryModal.addEventListener('mousedown', function(e){
    if (e.target === freeShapeGalleryModal) hideFreeShapeGallery(); // 어두운 배경 클릭 시 닫기
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && freeShapeGalleryModal.classList.contains('visible')) hideFreeShapeGallery();
  });
})();
