/* ecopro3excel.js — "📊 엑셀모드" : 엑셀 스프레드시트 느낌의 행/열 안내선 + 묶인 박스들
   로딩 순서: ecopro3.js(코어) -> ecopro3c.js -> ecopro3logo.js -> ecopro3excel.js

   구조:
   - 행/열 개수를 입력하면, 좌측 행번호(1,2,3..)·상단 열문자(A,B,C..) 헤더 + 셀 사각형들 +
     각 셀 안의 편집 가능한 빈 텍스트(IText)를 전부 하나의 fabric.Group으로 묶어서 만듦
     (요청: "박스들은 모두 묶어진 상태로 생성되야 되... 개별로 생성되있으면 한번에
     이동시키기 어려우니까").
   - 더블클릭하면 로고 그룹과 완전히 같은 방식(target.toActiveSelection())으로 순간
     풀려서, 원하는 칸을 클릭해 바로 글씨를 입력할 수 있음.
   - 그룹 우측에는 다른 P/M 필터·주사위 버튼이 전혀 안 뜨고(ecopro3c.js의
     isTableRelatedTarget에 isExcelGroup을 추가해뒀음), 눈 모양 버튼 하나만 있어서
     누르면 안내선(헤더·칸 테두리)만 안 보이게 하고 입력해둔 글씨는 그대로 남겨둠.
*/
(function () {
  "use strict";
  var EP = window.EP = window.EP || {};
  var canvas = EP.canvas;
  var pushHistory = EP.pushHistory;
  if (!canvas) return;

  var addExcelModeBtn = document.getElementById('addExcelModeBtn');
  var excelModeModal = document.getElementById('excelModeModal');
  var excelModeModalCloseBtn = document.getElementById('excelModeModalCloseBtn');
  var excelModeRowsInput = document.getElementById('excelModeRowsInput');
  var excelModeColsInput = document.getElementById('excelModeColsInput');
  var excelModeCreateBtn = document.getElementById('excelModeCreateBtn');
  if (!addExcelModeBtn || !excelModeModal) return;

  if (EP.makeDraggablePopover) EP.makeDraggablePopover(excelModeModal);

  addExcelModeBtn.addEventListener('click', function(){
    excelModeModal.classList.remove('hidden');
  });
  excelModeModalCloseBtn.addEventListener('click', function(){
    excelModeModal.classList.add('hidden');
  });

  function colLabel(idx){
    // 0→A, 1→B ... 25→Z, 26→AA ... (엑셀과 동일한 방식)
    var label = '';
    idx += 1;
    while (idx > 0) {
      var rem = (idx - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      idx = Math.floor((idx - 1) / 26);
    }
    return label;
  }

  function buildExcelGroup(rows, cols){
    var cellW = 72, cellH = 28;
    var headerW = 34, headerH = 22;
    var guideColor = '#dfe3e8';
    var guideStroke = '#b9bfc7';

    var objects = [];

    // 좌상단 빈 코너
    var corner = new fabric.Rect({
      left: 0, top: 0, width: headerW, height: headerH,
      fill: guideColor, stroke: guideStroke, strokeWidth: 1,
      selectable: false, evented: false
    });
    objects.push(corner);

    // 상단 열 헤더(A, B, C...)
    for (var c = 0; c < cols; c++) {
      var hx = headerW + c * cellW;
      var hRect = new fabric.Rect({
        left: hx, top: 0, width: cellW, height: headerH,
        fill: guideColor, stroke: guideStroke, strokeWidth: 1,
        selectable: false, evented: false
      });
      var hText = new fabric.Text(colLabel(c), {
        left: hx + cellW / 2, top: headerH / 2, originX: 'center', originY: 'center',
        fontSize: 12, fontFamily: 'Arial', fill: '#555',
        selectable: false, evented: false
      });
      objects.push(hRect, hText);
    }

    // 좌측 행 헤더(1, 2, 3...)
    for (var r = 0; r < rows; r++) {
      var ry = headerH + r * cellH;
      var rRect = new fabric.Rect({
        left: 0, top: ry, width: headerW, height: cellH,
        fill: guideColor, stroke: guideStroke, strokeWidth: 1,
        selectable: false, evented: false
      });
      var rText = new fabric.Text(String(r + 1), {
        left: headerW / 2, top: ry + cellH / 2, originX: 'center', originY: 'center',
        fontSize: 12, fontFamily: 'Arial', fill: '#555',
        selectable: false, evented: false
      });
      objects.push(rRect, rText);
    }

    // 데이터 셀(테두리 사각형 + 빈 편집용 텍스트) — 더블클릭으로 풀렸을 때 각각 따로
    // 선택·편집 가능하도록 selectable/evented는 기본값(true) 그대로 둠.
    for (var rr = 0; rr < rows; rr++) {
      for (var cc = 0; cc < cols; cc++) {
        var cx = headerW + cc * cellW, cy = headerH + rr * cellH;
        var cellRect = new fabric.Rect({
          left: cx, top: cy, width: cellW, height: cellH,
          fill: '#ffffff', stroke: guideStroke, strokeWidth: 1
        });
        cellRect.isExcelCell = true;
        var cellText = new fabric.IText('', {
          left: cx + 6, top: cy + cellH / 2, originY: 'center',
          fontSize: 13, fontFamily: 'Arial', fill: '#111',
          width: cellW - 12
        });
        cellText.isExcelCellText = true;
        objects.push(cellRect, cellText);
      }
    }

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    var group = new fabric.Group(objects, {
      left: centerX, top: centerY, originX: 'center', originY: 'center'
    });
    group.isExcelGroup = true;
    group.excelGuideVisible = true;
    return group;
  }

  // 안내선(헤더·칸 테두리) 대상만 뽑음 — 매번 그룹의 지금 자식들을 다시 훑어서 구하므로,
  // 저장/불러오기·실행취소 후에도(참조 배열을 따로 저장해두는 방식과 달리) 항상 정확함.
  function getExcelGuideParts(group){
    return group.getObjects().filter(function(o){ return !o.isExcelCellText; });
  }

  excelModeCreateBtn.addEventListener('click', function(){
    var rows = Math.min(30, Math.max(1, parseInt(excelModeRowsInput.value, 10) || 6));
    var cols = Math.min(26, Math.max(1, parseInt(excelModeColsInput.value, 10) || 5));
    var group = buildExcelGroup(rows, cols);
    canvas.add(group);
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    if (pushHistory) pushHistory();
    excelModeModal.classList.add('hidden');
  });

  /* ============================================================
     더블클릭 → 순간 풀어서 개별 칸 편집 가능하게 함(로고 그룹과 완전히 동일한 방식,
     요청: "클릭하면 바로 수정해서 글씨 적을수 있게").
  ============================================================ */
  canvas.on('mouse:dblclick', function(opt){
    var target = opt.target;
    if (!target || target.type !== 'group' || !target.isExcelGroup) return;
    var sel = target.toActiveSelection();
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    if (pushHistory) pushHistory();
  });

  /* ============================================================
     우측 눈 아이콘 — 안내선(헤더·칸 테두리)만 껐다 켰다 함(글씨는 항상 남아있음)
  ============================================================ */
  function renderExcelEyeButton(ctx, left, top, styleOverride, fabricObject){
    if (!fabricObject || !fabricObject.isExcelGroup) return;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#555';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    var visible = fabricObject.excelGuideVisible !== false;
    // 눈 모양(아몬드형 외곽선 + 동공)
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(0, -6, 7, 0);
    ctx.quadraticCurveTo(0, 6, -7, 0);
    ctx.stroke();
    if (visible) {
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 안내선이 꺼진 상태 — 눈에 사선을 그어 "감김" 표시
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(8, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  var excelEyeControl = new fabric.Control({
    x: 0.5, y: -0.5,
    offsetX: 20, offsetY: -36, // 그룹 우측 상단 — 요청대로 필터/주사위 없이 이거 하나만
    sizeX: 28, sizeY: 28,
    cursorStyle: 'pointer',
    render: renderExcelEyeButton,
    mouseUpHandler: function(eventData, transformData){
      var target = transformData && transformData.target;
      if (!target || !target.isExcelGroup) return true;
      target.excelGuideVisible = !(target.excelGuideVisible !== false);
      var show = target.excelGuideVisible;
      getExcelGuideParts(target).forEach(function(part){ part.visible = show; });
      canvas.requestRenderAll();
      if (pushHistory) pushHistory();
      return true;
    }
  });

  fabric.Group.prototype.controls = Object.assign({}, fabric.Group.prototype.controls, { qaExcelEye: excelEyeControl });

  // 저장/실행취소/복제 시에도 이 속성들이 그대로 남아있도록 중앙 레지스트리에 등록함.
  if (EP.registerCustomObjectProps) {
    EP.registerCustomObjectProps(['isExcelGroup', 'excelGuideVisible', 'isExcelCell', 'isExcelCellText']);
  }
})();
