/* ecopro3table.js — 표 만들기
   - 생성 시 캔버스 안에 들어오도록 크기 자동 조절
   - 평소엔 fabric.Group으로 묶여서 다른 도형처럼 이동/크기조절 가능
   - 더블클릭하면 "편집모드"(개별 셀 선택 가능) 진입 -> 정렬/드래그 합치기 -> "표 편집 완료"로 다시 묶임
   - 셀 텍스트는 세로 가운데 정렬, 길어지면 박스 안에서 줄바꿈(최대 4줄)되고 그래도 넘치면 말줄임(...)
   - '기본 표 만들기'(buildTable) 외에 '랜덤 표 만들기'(buildRandomTable)도 지원:
     (1) 첫 줄에 스페이스가 하나도 없으면 그 줄 전체가 아랫줄들의 칸 수에 맞춰
         폭이 늘어난 1칸짜리 제목 행이 됨 (첫 줄에도 스페이스가 있으면 그냥 평범한 본문 줄).
     (2) 본문에서 같은 열에 같은 값이 연속으로 반복되면 그 칸들이 세로로 자동 합쳐짐.
   로딩 순서: ecopro3.js(코어) 다음이면 어디든 무방. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  var canvas = EP.canvas, pushHistory = EP.pushHistory;

  EP.tableRegistry = EP.tableRegistry || {};
  var tableSeq = 0;
  var PAD = 6;
  var MAX_LINES = 4;

  // 표 관련 커스텀 속성들 — fabric의 clone()/toObject()는 기본적으로 이런 임의 속성을
  // 안 들고 가기 때문에, 복사(Ctrl+C)/붙여넣기(Ctrl+V)/복제 시 이 목록을 propertiesToInclude로
  // 넘겨줘야 표가 표로 인식됨. (ecopro3.js의 copySelected/pasteClipboard/duplicateBtn에서 사용)
  EP.tableCloneProps = ['isTableGroup', 'tableId', 'isTableCell', 'isTableCellText', 'isTableExtra',
    'cellRow', 'cellCol', 'cellR1', 'cellC1', 'fullText', 'origHeight',
    'subTargetCheck', 'objectCaching', '__pad'];

  // 붙여넣기(또는 복제)로 생겨난 표 그룹은 원본과 tableId가 같은 채로 들어오는데,
  // 그대로 두면 EP.tableRegistry[tableId]가 여전히 "원본" 셀들을 가리키고 있어서
  // 더블클릭해도 편집이 안 되거나(원본만 편집모드로 들어감) 우클릭 메뉴가 원본 표를 건드리게 됨.
  // 그래서 사본에는 새 tableId를 발급하고, 지금 그룹 안에 실제로 들어있는 셀들을 기준으로
  // EP.tableRegistry에 새 항목을 다시 만들어줌.
  EP.reindexPastedTable = function(obj){
    if (!obj || !obj.isTableGroup) return null;
    var newTableId = 'tbl' + (++tableSeq);
    obj.tableId = newTableId;
    var cells = {};
    var extras = {};
    var rows = 0, cols = 0;
    var children = (typeof obj.getObjects === 'function') ? obj.getObjects() : [];
    children.forEach(function(o){
      if (!o) return;
      if (o.isTableExtra) { o.tableId = newTableId; extras[o.isTableExtra] = o; return; } // 배경/바깥테두리 등 장식 오브젝트
      if (o.cellRow == null || o.cellCol == null) return;
      o.tableId = newTableId;
      var r0 = o.cellRow, c0 = o.cellCol;
      var r1 = (o.cellR1 != null) ? o.cellR1 : r0;
      var c1 = (o.cellC1 != null) ? o.cellC1 : c0;
      var key = r0 + '_' + c0;
      if (!cells[key]) cells[key] = { r0: r0, c0: c0, r1: r1, c1: c1 };
      if (o.isTableCell) cells[key].rect = o;
      if (o.isTableCellText) cells[key].text = o;
      rows = Math.max(rows, r1 + 1);
      cols = Math.max(cols, c1 + 1);
    });
    EP.tableRegistry[newTableId] = { rows: rows, cols: cols, cells: cells, extras: extras };
    if (obj.setCoords) obj.setCoords(); // 더블클릭 판정용 좌표 캐시 갱신
    return newTableId;
  };

  // 실행취소/다시실행이나 디자인(면) 전환은 canvas.loadFromJSON()으로 캔버스를 통째로
  // 새로 만들기 때문에, 표 셀/그룹도 전부 새로운 오브젝트 인스턴스로 다시 생성됨.
  // tableId(문자열) 자체는 스냅샷에 같이 저장돼서 그대로 남아있지만, EP.tableRegistry는
  // 여전히 "복원 전"의 예전 오브젝트를 가리키고 있어서 그대로 두면 표 편집(더블클릭/우클릭
  // 메뉴)이 화면에 안 보이는 옛날 오브젝트를 건드리게 됨. 그래서 캔버스가 다시 로드될 때마다
  // tableId를 기준으로 지금 캔버스에 실제로 있는 오브젝트들로 레지스트리 전체를 새로 지음.
  EP.rebuildAllTableRegistries = function(){
    var registry = {};
    function visit(o){
      if (!o) return;
      if (o.isTableExtra && o.tableId != null) {
        registry[o.tableId] = registry[o.tableId] || { rows: 0, cols: 0, cells: {}, extras: {} };
        registry[o.tableId].extras[o.isTableExtra] = o;
      } else if ((o.isTableCell || o.isTableCellText) && o.tableId != null && o.cellRow != null && o.cellCol != null) {
        var tid = o.tableId;
        registry[tid] = registry[tid] || { rows: 0, cols: 0, cells: {}, extras: {} };
        var r0 = o.cellRow, c0 = o.cellCol;
        var r1 = (o.cellR1 != null) ? o.cellR1 : r0;
        var c1 = (o.cellC1 != null) ? o.cellC1 : c0;
        var key = r0 + '_' + c0;
        if (!registry[tid].cells[key]) registry[tid].cells[key] = { r0: r0, c0: c0, r1: r1, c1: c1 };
        if (o.isTableCell) registry[tid].cells[key].rect = o;
        if (o.isTableCellText) registry[tid].cells[key].text = o;
        registry[tid].rows = Math.max(registry[tid].rows, r1 + 1);
        registry[tid].cols = Math.max(registry[tid].cols, c1 + 1);
      }
      if (typeof o.getObjects === 'function') o.getObjects().forEach(visit);
    }
    canvas.getObjects().forEach(visit);
    EP.tableRegistry = registry;
  };

  // 셀 텍스트를 박스 너비에 맞춰 자연스럽게 줄바꿈하고, 필요하면 박스 높이를 늘려서
  // 그 안에서 여러 줄로 다 보이게 함. 그래도 MAX_LINES를 넘으면 그때만 "..."로 줄임.
  // 마지막엔 (늘어난) 박스 높이에 맞춰 텍스트를 세로 가운데로 배치함.
  function layoutCell(rect, textObj){
    var full = textObj.fullText != null ? textObj.fullText : (textObj.text || '');
    textObj.fullText = full;
    var innerW = rect.width - PAD * 2;
    textObj.set({ width: Math.max(10, innerW), text: full });
    if (textObj.initDimensions) textObj.initDimensions();

    var lineH = (textObj.fontSize || 14) * (textObj.lineHeight || 1.16);
    var maxAllowedH = lineH * MAX_LINES;

    if (textObj.height > maxAllowedH) {
      // 4줄을 넘으면 그 안에서만 말줄임
      var lo = 0, hi = full.length, best = '…';
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        var candidate = full.slice(0, mid).trim() + '…';
        textObj.set({ text: candidate });
        if (textObj.initDimensions) textObj.initDimensions();
        if (textObj.height <= maxAllowedH) { best = candidate; lo = mid + 1; }
        else { hi = mid - 1; }
      }
      textObj.set({ text: best });
      if (textObj.initDimensions) textObj.initDimensions();
    }

    // 필요한 만큼 박스 높이를 늘림 (원래 높이보다 작아지진 않게)
    var neededH = Math.max(rect.origHeight || rect.height, textObj.height + PAD * 2);
    if (!rect.origHeight) rect.origHeight = rect.height;
    rect.set({ height: neededH });

    // 세로 가운데 정렬
    textObj.set({
      left: rect.left + PAD,
      top: rect.top + (neededH - textObj.height) / 2
    });
    textObj.clipPath = new fabric.Rect({
      width: innerW, height: neededH - PAD * 2, originX: 'center', originY: 'center'
    });
    rect.setCoords();
    textObj.setCoords();
    if (rect.tableId) updateTableExtrasBounds(rect.tableId); // 셀 크기가 바뀌었으니 바깥테두리/배경도 범위 갱신
  }

  // 표의 바깥 테두리·둥근모서리 배경(있는 경우)을 지금 셀들의 실제 범위에 맞춰 다시 그림.
  // 행높이/열너비 조절이나 글씨 크기 변화로 셀이 커지거나 밀려도 바깥 테두리가 따로 놀지 않게 함.
  function updateTableExtrasBounds(tableId){
    var tbl = EP.tableRegistry[tableId];
    if (!tbl || !tbl.extras) return;
    var minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
    var found = false;
    Object.keys(tbl.cells).forEach(function(k){
      var cell = tbl.cells[k];
      if (!cell.rect) return;
      found = true;
      var sx = cell.rect.scaleX || 1, sy = cell.rect.scaleY || 1;
      minLeft = Math.min(minLeft, cell.rect.left);
      minTop = Math.min(minTop, cell.rect.top);
      maxRight = Math.max(maxRight, cell.rect.left + cell.rect.width * sx);
      maxBottom = Math.max(maxBottom, cell.rect.top + cell.rect.height * sy);
    });
    if (!found || !isFinite(minLeft)) return;

    var ob = tbl.extras.outerBorder;
    if (ob) {
      ob.set({ left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop });
      ob.setCoords();
    }
    var bg = tbl.extras.bg;
    if (bg) {
      var pad = (bg.__pad != null) ? bg.__pad : 0;
      bg.set({ left: minLeft - pad, top: minTop - pad, width: (maxRight - minLeft) + pad * 2, height: (maxBottom - minTop) + pad * 2 });
      bg.setCoords();
    }
  }

  function makeCell(tableId, r, c, left, top, w, h, content){
    var rect = new fabric.Rect({
      left: left, top: top, width: w, height: h,
      fill: '#ffffff', stroke: '#333333', strokeWidth: 1, strokeUniform: true,
      selectable: true, hasControls: false, lockMovementX: true, lockMovementY: true,
      hoverCursor: 'cell', objectCaching: false
    });
    rect.isTableCell = true; rect.tableId = tableId; rect.cellRow = r; rect.cellCol = c;
    rect.cellR1 = r; rect.cellC1 = c; // 기본은 1칸짜리; 병합되면 mergeCells()에서 갱신됨
    rect.origHeight = h;

    var text = new fabric.Textbox(content, {
      left: left + PAD, top: top + PAD, width: w - PAD * 2,
      fontSize: 14, fontFamily: 'Pretendard', fill: '#222222', textAlign: 'center',
      selectable: true, hasControls: false, lockMovementX: true, lockMovementY: true,
      editable: true, hoverCursor: 'text', splitByGrapheme: false, objectCaching: false
    });
    text.isTableCellText = true; text.tableId = tableId; text.cellRow = r; text.cellCol = c;
    text.cellR1 = r; text.cellC1 = c;
    // evented만 false로: 클릭(단일 선택)은 항상 박스(rect)가 받도록 함.
    // selectable은 반드시 true로 둬야 함 — 드래그로 여러 셀을 한꺼번에 선택(고무줄 선택)할 때
    // Fabric은 selectable 여부만 보고 골라담기 때문에, false면 박스만 선택되고 글은 쏙 빠져서
    // 표 편집 완료(재그룹)나 선택 이동 시 글이 박스를 안 따라가고 떨어져 남는 버그가 생김.
    text.evented = false;
    layoutCell(rect, text);

    return { rect: rect, text: text, r0: r, c0: c, r1: r, c1: c };
  }

  var tableInputToolbar = document.getElementById('tableInputToolbar');
  var tableInputArea = document.getElementById('tableInputArea');

  // 상단 메뉴의 "표 만들기" 버튼 하나로 이 입력창을 열고, 기본/랜덤/정석 중 무엇을 만들지는
  // 입력창 아래 버튼 한 줄(기본/랜덤/정석/닫기)에서 그때그때 고르게 함.
  function openTableInputToolbar(){
    document.getElementById('shapeMenu').classList.add('hidden');
    tableInputToolbar.classList.remove('hidden');
    tableInputArea.focus();
    tableInputArea.select(); // 이전 내용이 남아있으면 전체 선택 — 그대로 두거나 바로 타이핑해서 덮어쓰기 편하게
  }

  document.getElementById('addTableBtn').addEventListener('click', function(e){
    if (e) e.stopPropagation(); // 부모(#shapeMenu)의 공통 클릭 핸들러와 겹치지 않도록 분리
    openTableInputToolbar();
  });
  document.getElementById('cancelTableBtn').addEventListener('click', function(){
    tableInputToolbar.classList.add('hidden');
  });

  // 세 가지 "표 만들기" 버튼이 공통으로 하는 일(입력값 확인 → 이전 표 있으면 지우기 →
  // 실제 빌드 함수 실행 → 실패 시 알림)을 한 곳에 묶어서, 버튼마다 거의 같은 코드가
  // 반복되지 않게 함.
  function runTableBuild(buildFn, label){
    var raw = tableInputArea.value;
    if (!raw || !raw.trim()) return;
    var deleteBtnEl = document.getElementById('deleteBtn');
    if (canvas.getActiveObject() && deleteBtnEl && !deleteBtnEl.disabled) deleteBtnEl.click();
    var ok = false, errMsg = '';
    try {
      ok = buildFn(raw);
    } catch (e) {
      console.error(label + ' 실패:', e);
      errMsg = (e && e.message) ? e.message : String(e);
      ok = false;
    }
    if (!ok) {
      alert('표를 만들지 못했어요. 입력 내용은 그대로 남아있으니 다시 시도해보세요.' + (errMsg ? ('\n(오류: ' + errMsg + ')') : ''));
    }
    // 성공해도 입력창은 계속 열어둠(닫지 않음) — 방금 만든 표는 그대로 선택된 상태(각 build 함수
    // 안의 groupTable()에서 이미 canvas.setActiveObject(group) 처리됨)로 남아있고, 연속으로 표를
    // 더 만들 수 있게 텍스트도 지우지 않고 그대로 둠. 닫으려면 옆의 '닫기' 버튼을 누르면 됨.
  }

  document.getElementById('applyTableBtn').addEventListener('click', function(){
    runTableBuild(buildTable, '기본 표 만들기');
  });
  document.getElementById('applyRandomTableBtn').addEventListener('click', function(){
    runTableBuild(buildRandomTable, '랜덤 표 만들기');
  });
  document.getElementById('applyStandardTableBtn').addEventListener('click', function(){
    runTableBuild(buildStandardTable, '정석 표 만들기');
  });

  function buildTable(raw){
    var lines = raw.replace(/\r/g, '').split('\n').filter(function(l){ return l.trim().length > 0; });
    var grid = lines.map(function(line){ return line.trim().split(/\s+/).filter(function(w){ return w.length > 0; }); });
    var rows = grid.length;
    var cols = grid.reduce(function(m, r){ return Math.max(m, r.length); }, 1);
    if (rows < 1 || cols < 1) return false;
    if (!canvas) return false;

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var viewW = (canvas.getWidth() || 0) / zoom, viewH = (canvas.getHeight() || 0) / zoom;
    if (!viewW || !viewH) return false; // 캔버스 크기를 아직 알 수 없는 상태(초기화 전 등)
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    // 칸/줄 수가 많아져도 표 전체가 항상 화면(가시 영역) 안에 들어오도록,
    // "최대 크기"만 제한하고(위쪽 상한) 필요하면 그 아래로 계속 줄어들게 함.
    // (예전 코드는 "최소 크기" 하한도 걸어놔서, 열이 많으면 표가 화면 밖으로 삐져나가
    //  마치 표가 "생성되지 않은 것"처럼 보이는 문제가 있었음)
    var availW = viewW * 0.86, availH = viewH * 0.8;
    var cellW = Math.max(24, Math.min(110, availW / cols));
    var cellH = Math.max(18, Math.min(40, availH / rows));

    var left = centerX - (cellW * cols) / 2;
    var top = centerY - (cellH * rows) / 2;

    var tableId = 'tbl' + (++tableSeq);
    var cells = {};
    var objs = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var content = grid[r][c] || '';
        var cell = makeCell(tableId, r, c, left + c * cellW, top + r * cellH, cellW, cellH, content);
        cells[r + '_' + c] = cell;
        objs.push(cell.rect, cell.text);
      }
    }
    if (!objs.length) return false;

    EP.tableRegistry[tableId] = { rows: rows, cols: cols, cells: cells };
    objs.forEach(function(o){ canvas.add(o); });

    // 묶기(그룹화)까지 성공해야 진짜 성공. 중간에 실패하면 방금 추가한 조각들을
    // 캔버스에 그대로 남겨두지 않고 깨끗하게 되돌림 (부서진 표 조각이 남는 것 방지)
    try {
      var group = groupTable(tableId);
      if (!group) throw new Error('셀을 하나의 표로 묶지 못했습니다.');
    } catch (e) {
      objs.forEach(function(o){ canvas.remove(o); });
      delete EP.tableRegistry[tableId];
      canvas.requestRenderAll();
      throw e;
    }

    canvas.requestRenderAll();
    pushHistory();
    return true;
  }

  // ---- 랜덤 표 만들기 전용 색상 유틸 ----
  // 가중치 배열([weight, colorGenFn], ...)에서 하나를 뽑아 실행. weight 합이 100이 아니어도 비율로 동작함.
  function weightedColorPick(entries){
    var total = entries.reduce(function(s, e){ return s + e[0]; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < entries.length; i++) {
      r -= entries[i][0];
      if (r <= 0) return entries[i][1]();
    }
    return entries[entries.length - 1][1]();
  }
  function randHexAny(){
    return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }
  function randGrayColor(){
    var v = 90 + Math.floor(Math.random() * 90); // 90~179: 너무 어둡거나(검정) 밝지(흰색) 않은 회색
    var h = v.toString(16).padStart(2, '0');
    return '#' + h + h + h;
  }
  function hslToHex(h, s, l){
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    var R = Math.round((r + m) * 255), G = Math.round((g + m) * 255), B = Math.round((b + m) * 255);
    return '#' + [R, G, B].map(function(v){ return v.toString(16).padStart(2, '0'); }).join('');
  }
  function randPastelColor(){
    return hslToHex(Math.random() * 360, 30 + Math.random() * 20, 82 + Math.random() * 10);
  }
  function randYellowColor(){ // 진한 노랑
    return hslToHex(45 + Math.random() * 15, 75 + Math.random() * 20, 45 + Math.random() * 10);
  }
  function randLightYellowColor(){ // 연노랑
    return hslToHex(45 + Math.random() * 15, 40 + Math.random() * 30, 80 + Math.random() * 10);
  }
  // 두 번째 이상(제목이 아닌) 병합된 칸 배경:
  // 검정2% / 회색20% / 파스텔40% / 노랑5% / 연노랑5% / 나머지(임의색)28%
  function randMergedCellFill(){
    return weightedColorPick([
      [2, function(){ return '#000000'; }],
      [20, randGrayColor],
      [40, randPastelColor],
      [5, randYellowColor],
      [5, randLightYellowColor],
      [28, randHexAny]
    ]);
  }
  // 제목(첫 줄 병합) 칸 배경: 검정10% / 회색20% / 파스텔40% / 노랑5% / 연노랑5% / 나머지(임의색)20%
  function randTitleMergedFill(){
    return weightedColorPick([
      [10, function(){ return '#000000'; }],
      [20, randGrayColor],
      [40, randPastelColor],
      [5, randYellowColor],
      [5, randLightYellowColor],
      [20, randHexAny]
    ]);
  }
  // 병합 안 된 일반 칸 배경: 흰색30% / 회색20% / 파스텔30% / 나머지(임의색)20%
  function randPlainCellFill(){
    return weightedColorPick([
      [30, function(){ return '#ffffff'; }],
      [20, randGrayColor],
      [30, randPastelColor],
      [20, randHexAny]
    ]);
  }
  // 글씨색: 검정30% / 흰색30% / 나머지(임의색)40%
  function randCellTextColor(){
    return weightedColorPick([
      [30, function(){ return '#000000'; }],
      [30, function(){ return '#ffffff'; }],
      [40, randHexAny]
    ]);
  }
  // 테두리색: 검정50% / 나머지(임의색)50%
  function randCellBorderColor(){
    return weightedColorPick([
      [50, function(){ return '#000000'; }],
      [50, randHexAny]
    ]);
  }

  // ---- 배경 밝기에 따른 글씨색 대비 보장 ----
  // 배경이 어두우면 글씨는 무조건 밝게, 배경이 밝으면 글씨는 무조건 어둡게(모든 칸 공통 적용).
  function relativeLuminance(hex){
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    function lin(c){ return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function isDarkBg(hex){
    return relativeLuminance(hex) < 0.5;
  }
  // ---- 특정 밝기보다 무조건 진하게/연하게 만드는 보정 ----
  // (제목 칸은 다른 병합 칸보다 항상 진하게, 공통 칸은 병합 칸들보다 항상 연하게 강제하는 데 씀)
  function hexToRgbArr(hex){
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function rgbArrToHex(rgb){
    return '#' + rgb.map(function(v){ return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
  }
  function darkenBelowLuminance(hex, maxLum){
    var rgb = hexToRgbArr(hex);
    for (var i = 0; i < 40 && relativeLuminance(rgbArrToHex(rgb)) >= maxLum; i++) {
      rgb = rgb.map(function(c){ return c * 0.92; });
    }
    return rgbArrToHex(rgb);
  }
  function lightenAboveLuminance(hex, minLum){
    var rgb = hexToRgbArr(hex);
    for (var i = 0; i < 40 && relativeLuminance(rgbArrToHex(rgb)) <= minLum; i++) {
      rgb = rgb.map(function(c){ return c + (255 - c) * 0.15; });
    }
    return rgbArrToHex(rgb);
  }
  function randLightColor(){ // 밝은 임의색 — 실제 명도 대비가 항상 보장되도록 검증 후 폴백까지 둠
    for (var i = 0; i < 10; i++) {
      var c = hslToHex(Math.random() * 360, 15 + Math.random() * 50, 82 + Math.random() * 13);
      if (!isDarkBg(c)) return c;
    }
    return '#f2f2f2';
  }
  function randDarkColor(){ // 어두운 임의색 — 실제 명도 대비가 항상 보장되도록 검증 후 폴백까지 둠
    for (var i = 0; i < 10; i++) {
      var c = hslToHex(Math.random() * 360, 15 + Math.random() * 50, 6 + Math.random() * 16);
      if (isDarkBg(c)) return c;
    }
    return '#0d0d0d';
  }
  // 배경색(bgHex)을 넣으면 그 배경과 항상 대비되는 글씨색을 뽑아줌
  // (어두운 배경 → 흰색60%+밝은임의색40%, 밝은 배경 → 검정60%+어두운임의색40%)
  function randTextColorForBg(bgHex){
    if (isDarkBg(bgHex)) {
      return weightedColorPick([
        [60, function(){ return '#ffffff'; }],
        [40, randLightColor]
      ]);
    }
    return weightedColorPick([
      [60, function(){ return '#000000'; }],
      [40, randDarkColor]
    ]);
  }

  // ---- 랜덤 표 만들기 ----
  // 규칙 1) 첫 줄에 스페이스가 "아예 없으면" 제목 줄로 취급해서, 아랫줄들의 칸 수(cols)에
  //         맞춰 폭이 늘어난 1칸짜리 합쳐진 칸으로 만듦. 첫 줄에도 스페이스가 있으면
  //         제목 줄이 아니라 그냥 평범한 본문 줄(칸 나누기 대상)로 취급함.
  // 규칙 2) 본문 각 줄의 단어 수가 표 전체 칸 수(cols)보다 모자라면, 그 줄의 칸들이 cols를
  //         단어 개수만큼 최대한 균등하게 나눠 가짐(콜스팬). 예: cols=6인데 그 줄이 2단어면
  //         3칸씩 정확히 절반으로 나뉘어서 정중앙에 선이 생김 (한쪽에 몰아주지 않음).
  //         나누어떨어지지 않을 땐 남는 칸을 앞쪽 단어부터 1칸씩 더 배분함.
  // 규칙 3) 본문 줄들에서, 바로 위/아래 줄에 칸 범위(시작~끝 열)와 값이 완전히 같은 칸이 있으면
  //         세로로 자동 합침 (예: 1열에 "1"이 3줄 연속 나오면 3칸을 세로로 합쳐 1칸으로 만듦).
  //         값이 없거나 칸 범위가 다르면(콜스팬 모양이 다르면) 합치지 않음.
  function buildRandomTable(raw){
    var lines = raw.replace(/\r/g, '').split('\n').filter(function(l){ return l.trim().length > 0; });
    if (!lines.length) return false;

    var hasTitle = !/\s/.test(lines[0].trim()); // 첫 줄에 스페이스가 하나도 없어야 제목 줄로 인정
    var titleText = hasTitle ? lines[0].trim() : null;
    var bodyLines = hasTitle ? lines.slice(1) : lines;

    var bodyGrid = bodyLines.map(function(line){ return line.trim().split(/\s+/).filter(function(w){ return w.length > 0; }); });
    var bodyRows = bodyGrid.length;
    var cols = bodyGrid.reduce(function(m, r){ return Math.max(m, r.length); }, 1); // 본문 줄들 중 가장 칸이 많은 줄에 맞춤

    var titleRows = hasTitle ? 1 : 0;
    var rows = titleRows + bodyRows;
    if (rows < 1 || cols < 1) return false;
    if (!canvas) return false;

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var viewW = (canvas.getWidth() || 0) / zoom, viewH = (canvas.getHeight() || 0) / zoom;
    if (!viewW || !viewH) return false; // 캔버스 크기를 아직 알 수 없는 상태(초기화 전 등)
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    var availW = viewW * 0.86, availH = viewH * 0.8;
    var cellW = Math.max(24, Math.min(110, availW / cols));
    var cellH = Math.max(18, Math.min(40, availH / rows));

    var left = centerX - (cellW * cols) / 2;
    var top = centerY - (cellH * rows) / 2;

    // 내부 격자선 두께는 표 전체에서 통일함(칸마다 두께가 다르면 지난번 고친 "테두리 어긋남"
    // 문제가 재발함) — 랜덤은 색상에서만 냄. 바깥 테두리 두께는 이 값의 최대 300%까지만 허용.
    var innerStrokeWidth = Math.round(1 + Math.random() * 2); // 1~3px (정수로 고정 — 소수점 두께는 안티에일리어싱 때문에 선이 흐릿/삐뚤어 보임)

    // 5% 확률로 표 전체를 한 색조(hue)로 맞춘 "테마" 모드로 감. 제목은 진하게, 다른 병합
    // 칸들은 그보다 연하게, 공통 칸은 아주 연하거나 흰색으로 — 색상 계열은 매번 랜덤(보라/파랑/초록 등).
    var themeActive = Math.random() < 0.05;
    var themeHue = themeActive ? Math.random() * 360 : 0;
    function pickTitleFill(){
      return themeActive ? hslToHex(themeHue, 60 + Math.random() * 25, 15 + Math.random() * 12) : randTitleMergedFill();
    }
    function pickMergedFill(){
      return themeActive ? hslToHex(themeHue, 55 + Math.random() * 20, 40 + Math.random() * 10) : randMergedCellFill();
    }
    function pickPlainFill(){
      if (!themeActive) return randPlainCellFill();
      return (Math.random() < 0.5) ? '#ffffff' : hslToHex(themeHue, 20 + Math.random() * 30, 88 + Math.random() * 8);
    }

    // 테두리 색은 칸 크기와 무관하게 표 전체가 한 색으로 통일(딱 한 번만 뽑음).
    // 테마 모드면 테두리도 같은 색조의 진한 색으로 맞춤.
    var sharedBorderColor = themeActive ? hslToHex(themeHue, 60 + Math.random() * 20, 10 + Math.random() * 10) : randCellBorderColor();
    // "이웃과 크기가 같은" 칸들은 전부 같은 배경색+글씨색을 공유함(칸마다 따로 안 뽑음).
    // 크기가 다른(튀는) 칸만 각자 따로 랜덤을 뽑음.
    var sharedPlainFill = pickPlainFill();
    var sharedPlainTextColor = randTextColorForBg(sharedPlainFill);
    // 공통(같은 크기) 칸들의 글씨 크기 기준값. 50% 확률로 기본 크기(14px)보다 1~20% 크게 잡고,
    // 나머지 50%는 기본 크기 그대로. 병합된 칸들의 "~% 더 크게"는 전부 이 값을 기준으로 계산함.
    var BASE_FONT_SIZE = 14;
    var sharedPlainFontSize = BASE_FONT_SIZE;
    if (Math.random() < 0.5) {
      sharedPlainFontSize = BASE_FONT_SIZE * (1 + (0.01 + Math.random() * 0.19)); // 1~20% 크게
    }

    var tableId = 'tbl' + (++tableSeq);
    var cells = {};
    var objs = [];

    // 제목(첫 줄) 글씨 크기는 "두 번째 이상의 병합된 칸들" 중 가장 큰 글씨 크기보다 1~10% 더 크게
    // 잡아야 하므로, 본문을 먼저 다 처리하면서 이 값을 갱신해두고 제목은 맨 마지막에 만듦.
    var maxOtherMergedFontSize = sharedPlainFontSize;
    // 다른 병합 칸들 중 볼드가 하나라도 있었으면, 제목도 무조건 볼드로 맞춤(없으면 제목은 그냥 50% 확률).
    var anyOtherMergedBold = false;
    // 밝기(명도) 규칙: 제목은 다른 병합 칸들보다 항상 진하게, 공통 칸은 모든 병합 칸(제목 포함)보다
    // 항상 연하게 — 이를 위해 "다른 병합 칸들"의 최소/최대 명도를 본문 처리하면서 추적해둠.
    var minOtherMergedLum = Infinity, maxOtherMergedLum = -Infinity;
    // 공통 칸(다수결 폭) 오브젝트들은 나중에 sharedPlainFill을 보정해야 할 수도 있어서
    // 미리 만들어둔 rect/text를 참조로 남겨둠(색 보정 시 다시 찾아가 덮어씀).
    var plainCellRects = [], plainCellTexts = [];

    // 한 본문 줄(단어 배열)을 실제 칸 목록으로 바꿈: 표 전체 칸 수(cols)를 그 줄의 단어 개수만큼
    // 최대한 균등하게 나눠 각자 콜스팬으로 가짐 (예: cols=6에 단어가 2개면 3칸씩 정확히 반으로 나뉨).
    // 나누어떨어지지 않으면 남는 칸을 앞쪽 단어들부터 1칸씩 더 배분함.
    function rowToCells(tokens){
      var L = tokens.length;
      if (!L) return [];
      var base = Math.floor(cols / L), extra = cols % L;
      var out = [];
      var c = 0;
      for (var i = 0; i < L; i++) {
        var w = base + (i < extra ? 1 : 0);
        out.push({ c0: c, c1: c + w - 1, text: tokens[i] });
        c += w;
      }
      return out;
    }

    // 모든 본문 줄의 칸을 먼저 한 번에 계산해두고(재사용), 표 전체를 통틀어 가장 흔하게 나오는
    // 칸 너비를 구함. 이 "표 전체 기준 보통 크기"와 같은 칸들은 전부 색을 공유하고, 다른 칸만
    // (칸 하나짜리든 여러 줄에 걸친 칸이든) 튀는 크기로 보고 각자 따로 색을 뽑음.
    var allRowCells = bodyGrid.map(rowToCells);
    var globalWidthCounts = {};
    allRowCells.forEach(function(rowCells){
      rowCells.forEach(function(rc){
        var w = rc.c1 - rc.c0 + 1;
        globalWidthCounts[w] = (globalWidthCounts[w] || 0) + 1;
      });
    });
    var globalMajorityWidth = 1, bestWidthCount = -1;
    Object.keys(globalWidthCounts).forEach(function(wKey){
      var wNum = parseInt(wKey, 10), cnt = globalWidthCounts[wKey];
      if (cnt > bestWidthCount || (cnt === bestWidthCount && wNum < globalMajorityWidth)) { bestWidthCount = cnt; globalMajorityWidth = wNum; }
    });

    // 폭(너비)이 같은 칸들은 항상 같은 색+글씨스타일을 공유함 — 다수결 폭(globalMajorityWidth)뿐
    // 아니라 그 외의 폭들도 "그 폭끼리는 서로 같은 스타일"이 되도록, 폭마다 한 번만 뽑아 캐시해둠.
    // (다수결 폭은 sharedPlainFill/sharedPlainTextColor/sharedPlainFontSize를 그대로 쓰고,
    //  나머지 폭들은 처음 등장할 때 한 번만 배경색+글씨색을 뽑고, 글씨 크기도 공통 크기보다
    //  10~30% 크게(50% 확률) + 볼드(50% 확률)를 뽑아 재사용함)
    var widthColorGroups = {};
    function colorsForWidth(width){
      if (width === globalMajorityWidth) {
        return { fill: sharedPlainFill, textColor: sharedPlainTextColor, fontSize: sharedPlainFontSize, bold: false };
      }
      if (!widthColorGroups[width]) {
        var fillColor = pickMergedFill();
        var fillLum = relativeLuminance(fillColor);
        if (fillLum < minOtherMergedLum) minOtherMergedLum = fillLum;
        if (fillLum > maxOtherMergedLum) maxOtherMergedLum = fillLum;
        var fontSize = sharedPlainFontSize;
        if (Math.random() < 0.5) fontSize = sharedPlainFontSize * (1 + (0.10 + Math.random() * 0.20)); // 공통 크기보다 10~30% 크게
        if (fontSize > maxOtherMergedFontSize) maxOtherMergedFontSize = fontSize;
        var groupBold = (Math.random() < 0.5);
        if (groupBold) anyOtherMergedBold = true;
        widthColorGroups[width] = {
          fill: fillColor, textColor: randTextColorForBg(fillColor),
          fontSize: fontSize, bold: groupBold
        };
      }
      return widthColorGroups[width];
    }

    function flushRun(run){
      var rowStart = titleRows + run.rowStart, rowEnd = titleRows + run.rowEnd;
      var cellTop = top + titleRows * cellH + run.rowStart * cellH;
      var cellHeight = cellH * (run.rowEnd - run.rowStart + 1);
      var cellLeft = left + run.c0 * cellW;
      var cellWidth = cellW * (run.c1 - run.c0 + 1);
      var cell = makeCell(tableId, rowStart, run.c0, cellLeft, cellTop, cellWidth, cellHeight, run.text);
      cell.r1 = rowEnd; cell.c1 = run.c1;
      cell.rect.cellR1 = rowEnd; cell.rect.cellC1 = run.c1;
      cell.text.cellR1 = rowEnd; cell.text.cellC1 = run.c1;

      // 세로로 여러 줄에 걸친 칸(rowspan>1)은 항상 개별 랜덤(그런 칸은 흔치 않고 늘 눈에 띄니까).
      // 그 외에는 폭이 같은 칸끼리 항상 같은 색+글씨스타일을 공유함(다수결 폭이든 아니든 폭 그룹별로 공유).
      // 테두리색은 크기와 무관하게 항상 공유색. 글씨색은 어느 경우든 자기 배경색과 항상 대비되게 뽑음.
      var isRowSpan = run.rowEnd > run.rowStart;
      var picked;
      if (isRowSpan) {
        var rowSpanFill = pickMergedFill();
        var rowSpanLum = relativeLuminance(rowSpanFill);
        if (rowSpanLum < minOtherMergedLum) minOtherMergedLum = rowSpanLum;
        if (rowSpanLum > maxOtherMergedLum) maxOtherMergedLum = rowSpanLum;
        var rowSpanFontSize = sharedPlainFontSize;
        if (Math.random() < 0.5) rowSpanFontSize = sharedPlainFontSize * (1 + (0.10 + Math.random() * 0.20)); // 공통 크기보다 10~30% 크게
        if (rowSpanFontSize > maxOtherMergedFontSize) maxOtherMergedFontSize = rowSpanFontSize;
        var rowSpanBold = (Math.random() < 0.5);
        if (rowSpanBold) anyOtherMergedBold = true;
        picked = {
          fill: rowSpanFill, textColor: randTextColorForBg(rowSpanFill),
          fontSize: rowSpanFontSize, bold: rowSpanBold
        };
      } else {
        picked = colorsForWidth(run.c1 - run.c0 + 1);
      }
      cell.rect.set({ fill: picked.fill, stroke: sharedBorderColor, strokeWidth: innerStrokeWidth });
      cell.text.set({ fill: picked.textColor, fontSize: picked.fontSize, fontWeight: picked.bold ? 'bold' : 'normal' });
      layoutCell(cell.rect, cell.text); // 글씨 크기가 바뀌었으니 줄바꿈/세로중앙 재계산

      if (!isRowSpan && run.c1 - run.c0 + 1 === globalMajorityWidth) {
        // 공통(같은 크기) 칸 — sharedPlainFill을 나중에 보정해야 할 수도 있어서 참조를 남겨둠
        plainCellRects.push(cell.rect);
        plainCellTexts.push(cell.text);
      }

      cells[rowStart + '_' + run.c0] = cell;
      objs.push(cell.rect, cell.text);
    }

    // 줄 단위로 훑으면서, 바로 위 줄에 칸 범위(c0~c1)와 값이 완전히 같은 "진행 중인 세로 묶음"이
    // 있으면 이어붙이고, 없으면 새로 시작. 이번 줄에서 이어지지 않은 묶음은 그 자리에서 확정 지음.
    var openRuns = [];
    for (var r = 0; r < bodyRows; r++) {
      var rowCells = allRowCells[r];
      var stillOpen = [];
      rowCells.forEach(function(rc){
        var matchIdx = -1;
        for (var k = 0; k < openRuns.length; k++) {
          var run = openRuns[k];
          if (run.c0 === rc.c0 && run.c1 === rc.c1 && run.rowEnd === r - 1 && rc.text && run.text === rc.text) {
            matchIdx = k; break;
          }
        }
        if (matchIdx !== -1) {
          openRuns[matchIdx].rowEnd = r;
          stillOpen.push(openRuns[matchIdx]);
          openRuns.splice(matchIdx, 1);
        } else {
          stillOpen.push({ c0: rc.c0, c1: rc.c1, text: rc.text, rowStart: r, rowEnd: r });
        }
      });
      openRuns.forEach(function(run){ flushRun(run); }); // 이번 줄에서 안 이어진 묶음은 확정
      openRuns = stillOpen;
    }
    openRuns.forEach(function(run){ flushRun(run); }); // 마지막 줄까지 남아있던 묶음도 확정

    // 제목 줄(있는 경우): 표 폭 전체(cols칸 분)를 덮는 1칸으로 생성. 본문을 다 처리한 뒤라
    // maxOtherMergedFontSize에 "다른 병합된 칸들" 중 가장 큰 글씨 크기가 채워져 있음 —
    // 제목 글씨는 그 값보다 항상 1~10% 크게 잡음(없으면 공통 크기 기준으로 1~10% 크게).
    if (hasTitle) {
      var titleCell = makeCell(tableId, 0, 0, left, top, cellW * cols, cellH, titleText);
      titleCell.r1 = 0; titleCell.c1 = cols - 1;
      titleCell.rect.cellR1 = 0; titleCell.rect.cellC1 = cols - 1;
      titleCell.text.cellR1 = 0; titleCell.text.cellC1 = cols - 1;
      var titleFill = pickTitleFill();
      if (minOtherMergedLum < Infinity && relativeLuminance(titleFill) >= minOtherMergedLum) {
        // 다른 병합 칸이 이미 순수 검정에 가까우면(명도 0에 근접) 그보다 더 어둡게는 사실상 불가능 → 검정으로 고정
        titleFill = (minOtherMergedLum <= 0.005) ? '#000000' : darkenBelowLuminance(titleFill, minOtherMergedLum);
      }
      titleCell.rect.set({ fill: titleFill, stroke: sharedBorderColor, strokeWidth: innerStrokeWidth });
      var titleFontSize = maxOtherMergedFontSize * (1 + (0.01 + Math.random() * 0.09)); // 다른 병합 칸들보다 1~10% 크게
      titleCell.text.set({
        fill: randTextColorForBg(titleFill),
        fontSize: titleFontSize,
        fontWeight: (anyOtherMergedBold || Math.random() < 0.5) ? 'bold' : 'normal'
      });
      layoutCell(titleCell.rect, titleCell.text); // 글씨 크기가 바뀌었으니 줄바꿈/세로중앙 재계산
      cells['0_0'] = titleCell;
      objs.push(titleCell.rect, titleCell.text);

      // 20% 확률로 제목 줄 높이를 지금 높이보다 10~30% 더 키우고, 늘어난 만큼 아래 본문 전체를 밀어내림.
      if (Math.random() < 0.2) {
        var beforeTitleH = titleCell.rect.height;
        titleCell.rect.origHeight = beforeTitleH * (1 + (0.10 + Math.random() * 0.20)); // 10~30% 크게
        layoutCell(titleCell.rect, titleCell.text); // 늘어난 높이에 맞춰 다시 세로중앙 정렬
        var titleDeltaH = titleCell.rect.height - beforeTitleH;
        if (titleDeltaH > 0) {
          Object.keys(cells).forEach(function(k){
            if (k === '0_0') return; // 제목 칸 자신은 이미 처리했으니 제외
            var c = cells[k];
            c.rect.set({ top: c.rect.top + titleDeltaH });
            c.text.set({ top: c.text.top + titleDeltaH });
            c.rect.setCoords(); c.text.setCoords();
          });
        }
      }

      var titleLum = relativeLuminance(titleFill);
      if (titleLum > maxOtherMergedLum) maxOtherMergedLum = titleLum;
    }

    // 공통(같은 크기) 칸들은 모든 병합 칸(제목 포함)보다 항상 연한색이어야 함 — 병합 칸들의
    // 색이 다 정해진 지금에서야 최댓값을 알 수 있으므로, 필요하면 여기서 sharedPlainFill을
    // 밝게 보정하고, 이미 만들어져 있던 공통 칸들도 참조를 따라가 다시 칠함.
    if (maxOtherMergedLum > -Infinity && relativeLuminance(sharedPlainFill) <= maxOtherMergedLum) {
      // 병합 칸들 중 이미 순백에 가까운 게 있으면 그보다 더 밝게는 사실상 불가능 → 흰색으로 고정
      sharedPlainFill = (maxOtherMergedLum >= 0.995) ? '#ffffff' : lightenAboveLuminance(sharedPlainFill, maxOtherMergedLum);
      sharedPlainTextColor = randTextColorForBg(sharedPlainFill);
      plainCellRects.forEach(function(r){ r.set({ fill: sharedPlainFill }); });
      plainCellTexts.forEach(function(t){ t.set({ fill: sharedPlainTextColor }); });
    }

    if (!objs.length) return false;

    var tableExtras = {};

    // 바깥 테두리: 표 전체 윤곽을 감싸는 별도 테두리. 두께는 내부 격자선(innerStrokeWidth)의
    // 100~300% 사이에서만 랜덤으로 잡아서, 아무리 굵어져도 내부 격자선의 3배를 넘지 않게 함.
    // 좌표/크기는 반올림하지 않고 실제 셀들의 범위를 그대로 재서 씀 — 셀 경계와 어긋나 보이지
    // 않게 하면서(두께만 정수로 고정), 제목 줄 높이를 키우는 등으로 표의 실제 크기가 이론값과
    // 달라져도 항상 지금 셀 배치를 기준으로 정확히 감싸도록 함.
    var outerStrokeWidth = Math.max(1, Math.round(innerStrokeWidth * (1 + Math.random() * 2))); // innerStrokeWidth ~ innerStrokeWidth*3
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    Object.keys(cells).forEach(function(k){
      var c = cells[k];
      bx0 = Math.min(bx0, c.rect.left); by0 = Math.min(by0, c.rect.top);
      bx1 = Math.max(bx1, c.rect.left + c.rect.width * (c.rect.scaleX || 1));
      by1 = Math.max(by1, c.rect.top + c.rect.height * (c.rect.scaleY || 1));
    });
    var outerLeft = isFinite(bx0) ? bx0 : left, outerTop = isFinite(by0) ? by0 : top;
    var outerW = isFinite(bx1) ? bx1 - outerLeft : cellW * cols;
    var outerH = isFinite(by1) ? by1 - outerTop : cellH * rows;
    var outerBorder = new fabric.Rect({
      left: outerLeft, top: outerTop, width: outerW, height: outerH,
      fill: 'transparent', stroke: sharedBorderColor, strokeWidth: outerStrokeWidth,
      strokeUniform: true, strokeLineJoin: 'miter', selectable: false, evented: false, objectCaching: false
    });
    outerBorder.isTableExtra = 'outerBorder';
    outerBorder.tableId = tableId;
    objs.push(outerBorder); // 맨 나중에 추가 → 다른 모든 칸 위에 겹쳐서 표 윤곽이 또렷하게 보임
    tableExtras.outerBorder = outerBorder;

    // 가끔(30% 확률) 표 뒤에 둥근 모서리 배경 카드를 하나 깔아줌.
    // 둥근 정도(radius)는 이 배경의 테두리 두께보다 항상 크게 잡아서 모서리가 뭉개지지 않게 함.
    if (Math.random() < 0.3) {
      var bgPad = Math.round(Math.max(4, outerStrokeWidth));
      var bgStrokeW = outerStrokeWidth;
      var bgRadius = Math.round(bgStrokeW * (1.5 + Math.random() * 2)); // 테두리 두께보다 항상 더 크게(1.5~3.5배)
      var bgShape = new fabric.Rect({
        left: outerLeft - bgPad, top: outerTop - bgPad,
        width: outerW + bgPad * 2, height: outerH + bgPad * 2,
        rx: bgRadius, ry: bgRadius,
        fill: pickPlainFill(), stroke: sharedBorderColor, strokeWidth: bgStrokeW,
        strokeUniform: true, selectable: false, evented: false, objectCaching: false
      });
      bgShape.isTableExtra = 'bg';
      bgShape.tableId = tableId;
      bgShape.__pad = bgPad; // 나중에 셀 크기 변경 시 배경 범위를 다시 계산할 때 씀
      objs.unshift(bgShape); // 맨 먼저 추가 → 다른 모든 것 아래(배경 레이어)에 깔림
      tableExtras.bg = bgShape;
    }

    EP.tableRegistry[tableId] = { rows: rows, cols: cols, cells: cells, extras: tableExtras };
    objs.forEach(function(o){ canvas.add(o); });

    // 묶기(그룹화)까지 성공해야 진짜 성공. 중간에 실패하면 방금 추가한 조각들을
    // 캔버스에 그대로 남겨두지 않고 깨끗하게 되돌림 (부서진 표 조각이 남는 것 방지)
    try {
      var group = groupTable(tableId);
      if (!group) throw new Error('셀을 하나의 표로 묶지 못했습니다.');
    } catch (e) {
      objs.forEach(function(o){ canvas.remove(o); });
      delete EP.tableRegistry[tableId];
      canvas.requestRenderAll();
      throw e;
    }

    canvas.requestRenderAll();
    pushHistory();
    return true;
  }

  // ---- 정석 표 만들기 ----
  // 구조(제목 줄 합치기 / 콜스팬 균등분배 / 세로 병합)는 랜덤 표 만들기와 완전히 동일하지만,
  // 색상은 전부 고정값을 씀 — 랜덤 색·테마·글자크기 변주 없이 담백한 흑백 표가 필요할 때 씀.
  // 병합된 칸(제목 포함)은 연한 회색, 공통 칸은 흰색, 글씨/테두리는 전부 검정, 제목만 볼드.
  function buildStandardTable(raw){
    var lines = raw.replace(/\r/g, '').split('\n').filter(function(l){ return l.trim().length > 0; });
    if (!lines.length) return false;

    var hasTitle = !/\s/.test(lines[0].trim());
    var titleText = hasTitle ? lines[0].trim() : null;
    var bodyLines = hasTitle ? lines.slice(1) : lines;

    var bodyGrid = bodyLines.map(function(line){ return line.trim().split(/\s+/).filter(function(w){ return w.length > 0; }); });
    var bodyRows = bodyGrid.length;
    var cols = bodyGrid.reduce(function(m, r){ return Math.max(m, r.length); }, 1);

    var titleRows = hasTitle ? 1 : 0;
    var rows = titleRows + bodyRows;
    if (rows < 1 || cols < 1) return false;
    if (!canvas) return false;

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var viewW = (canvas.getWidth() || 0) / zoom, viewH = (canvas.getHeight() || 0) / zoom;
    if (!viewW || !viewH) return false;
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    var availW = viewW * 0.86, availH = viewH * 0.8;
    var cellW = Math.max(24, Math.min(110, availW / cols));
    var cellH = Math.max(18, Math.min(40, availH / rows));

    var left = centerX - (cellW * cols) / 2;
    var top = centerY - (cellH * rows) / 2;

    // 고정 스타일값 — 전부 랜덤 없음
    var STD_BORDER_COLOR = '#000000';
    var STD_TITLE_FILL = '#c9c9c9';  // 첫째(제목) 병합칸 — 진한 회색
    var STD_MERGED_FILL = '#e8e8e8'; // 둘째 이상 병합칸(콜스팬/세로병합) — 제목보다 연한 회색
    var STD_PLAIN_FILL = '#ffffff';  // 흰색 (공통 칸)
    var STD_TEXT_COLOR = '#000000';
    var innerStrokeWidth = 1;
    var outerStrokeWidth = 2; // 바깥테두리만 내부보다 살짝 굵게

    var tableId = 'tbl' + (++tableSeq);
    var cells = {};
    var objs = [];

    function rowToCells(tokens){
      var L = tokens.length;
      if (!L) return [];
      var base = Math.floor(cols / L), extra = cols % L;
      var out = [];
      var c = 0;
      for (var i = 0; i < L; i++) {
        var w = base + (i < extra ? 1 : 0);
        out.push({ c0: c, c1: c + w - 1, text: tokens[i] });
        c += w;
      }
      return out;
    }

    function flushRun(run){
      var rowStart = titleRows + run.rowStart, rowEnd = titleRows + run.rowEnd;
      var cellTop = top + titleRows * cellH + run.rowStart * cellH;
      var cellHeight = cellH * (run.rowEnd - run.rowStart + 1);
      var cellLeft = left + run.c0 * cellW;
      var cellWidth = cellW * (run.c1 - run.c0 + 1);
      var cell = makeCell(tableId, rowStart, run.c0, cellLeft, cellTop, cellWidth, cellHeight, run.text);
      cell.r1 = rowEnd; cell.c1 = run.c1;
      cell.rect.cellR1 = rowEnd; cell.rect.cellC1 = run.c1;
      cell.text.cellR1 = rowEnd; cell.text.cellC1 = run.c1;

      var isDifferentSize = (run.c1 > run.c0) || (run.rowEnd > run.rowStart); // 콜스팬 또는 세로병합이면 회색
      cell.rect.set({
        fill: isDifferentSize ? STD_MERGED_FILL : STD_PLAIN_FILL,
        stroke: STD_BORDER_COLOR, strokeWidth: innerStrokeWidth
      });
      cell.text.set({ fill: STD_TEXT_COLOR });
      layoutCell(cell.rect, cell.text);

      cells[rowStart + '_' + run.c0] = cell;
      objs.push(cell.rect, cell.text);
    }

    var openRuns = [];
    for (var r = 0; r < bodyRows; r++) {
      var rowCells = rowToCells(bodyGrid[r]);
      var stillOpen = [];
      rowCells.forEach(function(rc){
        var matchIdx = -1;
        for (var k = 0; k < openRuns.length; k++) {
          var run = openRuns[k];
          if (run.c0 === rc.c0 && run.c1 === rc.c1 && run.rowEnd === r - 1 && rc.text && run.text === rc.text) {
            matchIdx = k; break;
          }
        }
        if (matchIdx !== -1) {
          openRuns[matchIdx].rowEnd = r;
          stillOpen.push(openRuns[matchIdx]);
          openRuns.splice(matchIdx, 1);
        } else {
          stillOpen.push({ c0: rc.c0, c1: rc.c1, text: rc.text, rowStart: r, rowEnd: r });
        }
      });
      openRuns.forEach(function(run){ flushRun(run); });
      openRuns = stillOpen;
    }
    openRuns.forEach(function(run){ flushRun(run); });

    // 제목 줄(있는 경우): 회색 배경 + 검정 볼드 글씨. 본문 뒤에 만들어서 편집모드/재그룹 시
    // 다른 헬퍼들과 동일한 순서 관례를 따름(랜덤 표 만들기와 동일).
    if (hasTitle) {
      var titleCell = makeCell(tableId, 0, 0, left, top, cellW * cols, cellH, titleText);
      titleCell.r1 = 0; titleCell.c1 = cols - 1;
      titleCell.rect.cellR1 = 0; titleCell.rect.cellC1 = cols - 1;
      titleCell.text.cellR1 = 0; titleCell.text.cellC1 = cols - 1;
      titleCell.rect.set({ fill: STD_TITLE_FILL, stroke: STD_BORDER_COLOR, strokeWidth: innerStrokeWidth });
      titleCell.text.set({ fill: STD_TEXT_COLOR, fontWeight: 'bold' }); // 제목만 볼드
      layoutCell(titleCell.rect, titleCell.text);
      cells['0_0'] = titleCell;
      objs.push(titleCell.rect, titleCell.text);
    }

    if (!objs.length) return false;

    var tableExtras = {};

    // 바깥 테두리: 검정, 내부 격자선(1px)보다 살짝 굵게(2px) — 실제 셀 범위를 그대로 재서 씀
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    Object.keys(cells).forEach(function(k){
      var c = cells[k];
      bx0 = Math.min(bx0, c.rect.left); by0 = Math.min(by0, c.rect.top);
      bx1 = Math.max(bx1, c.rect.left + c.rect.width * (c.rect.scaleX || 1));
      by1 = Math.max(by1, c.rect.top + c.rect.height * (c.rect.scaleY || 1));
    });
    var outerLeft = isFinite(bx0) ? bx0 : left, outerTop = isFinite(by0) ? by0 : top;
    var outerW = isFinite(bx1) ? bx1 - outerLeft : cellW * cols;
    var outerH = isFinite(by1) ? by1 - outerTop : cellH * rows;
    var outerBorder = new fabric.Rect({
      left: outerLeft, top: outerTop, width: outerW, height: outerH,
      fill: 'transparent', stroke: STD_BORDER_COLOR, strokeWidth: outerStrokeWidth,
      strokeUniform: true, strokeLineJoin: 'miter', selectable: false, evented: false, objectCaching: false
    });
    outerBorder.isTableExtra = 'outerBorder';
    outerBorder.tableId = tableId;
    objs.push(outerBorder);
    tableExtras.outerBorder = outerBorder;

    EP.tableRegistry[tableId] = { rows: rows, cols: cols, cells: cells, extras: tableExtras };
    objs.forEach(function(o){ canvas.add(o); });

    try {
      var group2 = groupTable(tableId);
      if (!group2) throw new Error('셀을 하나의 표로 묶지 못했습니다.');
    } catch (e) {
      objs.forEach(function(o){ canvas.remove(o); });
      delete EP.tableRegistry[tableId];
      canvas.requestRenderAll();
      throw e;
    }

    canvas.requestRenderAll();
    pushHistory();
    return true;
  }

  function cellObjectsOf(tableId){
    var tbl = EP.tableRegistry[tableId];
    if (!tbl) return [];
    var objs = [];
    var extras = tbl.extras || {};
    // 배경 장식은 맨 먼저 담아서 그룹화 후에도 항상 다른 모든 것 아래(뒤)에 깔리게 함
    if (extras.bg && canvas.getObjects().indexOf(extras.bg) !== -1) {
      extras.bg.setCoords();
      objs.push(extras.bg);
    }
    // 박스(rect)를 전부 먼저 담고, 글씨(text)는 그 다음에 전부 담음 — "자기 칸의 글씨만 자기 박스
    // 위" 정도가 아니라 "모든 글씨가 모든 박스보다 위"가 되게 해서, 그림자/광선처럼 칸 밖으로
    // 번지는 필터 효과가 옆 칸 글씨를 덮어버리는 일이 없게 함.
    var cellKeys = Object.keys(tbl.cells);
    cellKeys.forEach(function(k){
      var cell = tbl.cells[k];
      if (cell.rect && canvas.getObjects().indexOf(cell.rect) !== -1) {
        cell.rect.setCoords();
        objs.push(cell.rect);
      }
    });
    cellKeys.forEach(function(k){
      var cell = tbl.cells[k];
      if (cell.text && canvas.getObjects().indexOf(cell.text) !== -1) {
        cell.text.setCoords();
        objs.push(cell.text);
      }
    });
    // 바깥 테두리는 맨 나중에 담아서 항상 칸들 위에 겹쳐 보이게 함
    if (extras.outerBorder && canvas.getObjects().indexOf(extras.outerBorder) !== -1) {
      extras.outerBorder.setCoords();
      objs.push(extras.outerBorder);
    }
    return objs;
  }

  function groupTable(tableId){
    var objs = cellObjectsOf(tableId);
    if (objs.length < 2) return null;
    var sel = new fabric.ActiveSelection(objs, { canvas: canvas });
    canvas.setActiveObject(sel);
    var group = sel.toGroup();
    group.isTableGroup = true;
    group.tableId = tableId;
    group.subTargetCheck = true;
    group.objectCaching = false;
    // 표는 가로/세로 중 한쪽만 늘리는(테두리 변/mt·mb·ml·mr) 핸들로 늘리면 셀 글씨는 세로 배율만큼,
    // 칸 너비는 가로 배율만큼 서로 다르게 커져버려서 글자 줄바꿈이 깨지고, 그 결과 셀 높이가
    // 비정상적으로 부풀면서 바깥 테두리까지 쭉 늘어나는 문제가 생김. 모서리(코너) 핸들만 남겨두면
    // 기본적으로 가로세로 비율이 그대로 유지된 채 커지므로 이 문제가 애초에 발생하지 않음.
    group.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    group.addWithUpdate(); // 좌표/바운딩박스를 지금 상태 기준으로 강제로 다시 계산
    group.setCoords(); // 클릭/더블클릭 판정용 좌표 캐시도 갱신 (안 하면 재편집 진입이 안 될 수 있음)
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    return group;
  }

  function normalizeScale(o){
    var sx = o.scaleX || 1, sy = o.scaleY || 1;
    if (sx === 1 && sy === 1) { o.setCoords(); return; }
    if (o.isTableCell) {
      o.set({ width: o.width * sx, height: o.height * sy, scaleX: 1, scaleY: 1 });
      o.origHeight = o.height;
    } else if (o.isTableCellText) {
      o.set({ width: o.width * sx, fontSize: (o.fontSize || 14) * sy, scaleX: 1, scaleY: 1 });
      if (o.initDimensions) o.initDimensions();
    } else if (o.isTableExtra) {
      // 바깥테두리/배경 카드도 표와 함께 크기조절됐을 수 있으므로 스케일을 실제 폭/높이에 반영해둠.
      // 안 그러면 나중에 updateTableExtrasBounds가 width/height를 새로 지정할 때 남은 배율이
      // 다시 곱해져서(이중 적용) 테두리가 뜬금없이 크게 부풀어버림.
      var patch = { width: o.width * sx, height: o.height * sy, scaleX: 1, scaleY: 1 };
      if (o.rx != null) patch.rx = o.rx * sx;
      if (o.ry != null) patch.ry = o.ry * sy;
      o.set(patch);
    }
    o.setCoords();
  }

  // ---- 편집모드는 "지금 이 표가 편집 중"이라는 상태를 별도로 기억해서,
  //      셀 텍스트를 수정하느라 선택이 잠깐 풀려도 "표 편집 완료" 버튼이 사라지지 않게 함 ----
  var activeEditTableId = null;
  var tableEditToolbar = document.getElementById('tableEditToolbar');

  function enterEditMode(group){
    var tableId = group.tableId;
    var sel = group.toActiveSelection();
    sel.getObjects().forEach(function(o){ normalizeScale(o); });

    var tbl = EP.tableRegistry[tableId];
    if (tbl) {
      Object.keys(tbl.cells).forEach(function(k){
        var cell = tbl.cells[k];
        if (!cell.rect || !cell.text) return;
        layoutCell(cell.rect, cell.text);
      });
    }
    // 편집모드에 들어가자마자 셀 전체가 선택된 상태로 남아있으면, 바로 우클릭했을 때
    // "여러 셀이 한꺼번에 선택된 상태"로 인식돼서 메뉴가 바로 원하는 대로 안 나올 수 있음.
    // 선택을 풀어두면 다음 우클릭이 그 셀 하나에 대한 진짜 첫 선택이 되어 수정 메뉴가 바로 뜸.
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();

    activeEditTableId = tableId;
    tableEditToolbar.classList.remove('hidden');
  }
  EP.enterTableEditMode = enterEditMode; // 우클릭이 아직 그룹 상태인 표를 잡았을 때(ecopro3.js) 바로 편집모드 진입용

  canvas.on('mouse:dblclick', function(opt){
    var t = opt.target;
    while (t && !t.isTableGroup && t.group) t = t.group; // 하위 오브젝트가 잡혀도 실제 표 그룹까지 타고 올라감
    if (t && t.isTableGroup) enterEditMode(t);
  });

  document.getElementById('tableEditDoneBtn').addEventListener('click', function(){
    if (activeEditTableId) finishTableEdit(activeEditTableId);
  });

  // ---- 4) 우클릭(PC) / 꾹 누르기(모바일)로 셀 선택 + 메뉴 (정렬/글수정/합치기/편집완료) ----
  function cellOf(target){
    if (!target) return null;
    if (target.isTableCell || target.isTableCellText) return target;
    return null;
  }

  function findCellPair(tableId, r, c){
    var tbl = EP.tableRegistry[tableId];
    if (!tbl) return null;
    return tbl.cells[r + '_' + c] || null;
  }

  var mergeAnchor = null; // { tableId, r, c } — "합치기 시작"으로 찍어둔 셀

  // 행 전체 높이 / 열 전체 너비를 조절 (그 행·열에 걸친 셀들은 크기가 바뀌고,
  // 그 뒤에 있는 행·열은 늘어나거나 줄어든 만큼 밀려남)
  function resizeRow(tableId, row, deltaH){
    var tbl = EP.tableRegistry[tableId];
    if (!tbl) return;
    Object.keys(tbl.cells).forEach(function(k){
      var cell = tbl.cells[k];
      if (cell.r0 <= row && row <= cell.r1) {
        var newH = Math.max(20, cell.rect.height + deltaH);
        cell.rect.set({ height: newH });
        cell.rect.origHeight = newH;
        layoutCell(cell.rect, cell.text);
      } else if (cell.r0 > row) {
        cell.rect.set({ top: cell.rect.top + deltaH });
        cell.text.set({ top: cell.text.top + deltaH });
        cell.rect.setCoords(); cell.text.setCoords();
      }
    });
    updateTableExtrasBounds(tableId);
    canvas.requestRenderAll();
    pushHistory();
  }
  function resizeCol(tableId, col, deltaW){
    var tbl = EP.tableRegistry[tableId];
    if (!tbl) return;
    Object.keys(tbl.cells).forEach(function(k){
      var cell = tbl.cells[k];
      if (cell.c0 <= col && col <= cell.c1) {
        var newW = Math.max(20, cell.rect.width + deltaW);
        cell.rect.set({ width: newW });
        layoutCell(cell.rect, cell.text);
      } else if (cell.c0 > col) {
        cell.rect.set({ left: cell.rect.left + deltaW });
        cell.text.set({ left: cell.text.left + deltaW });
        cell.rect.setCoords(); cell.text.setCoords();
      }
    });
    updateTableExtrasBounds(tableId);
    canvas.requestRenderAll();
    pushHistory();
  }

  function finishTableEdit(tableId){
    activeEditTableId = null;
    tableEditToolbar.classList.add('hidden');
    mergeAnchor = null;
    groupTable(tableId);
    pushHistory();
  }

  EP.buildTableContextMenu = function(target, e, addCtxItem, addCtxDivider){
    var tableId = target.tableId;
    var group = target.group;
    if (group && group.isTableGroup) {
      enterEditMode(group);
    } else {
      activeEditTableId = tableId;
      tableEditToolbar.classList.remove('hidden');
    }

    // 우클릭 시 아래에서 단일 셀 선택으로 강제하기 전에, 지금 여러 셀이 함께
    // 선택돼 있었는지 먼저 확인해둠 ("글 일괄수정" 메뉴에서 사용)
    var prevActive = canvas.getActiveObject();
    var multiCells = [];
    if (prevActive && prevActive.type === 'activeSelection' && prevActive.getObjects) {
      var seenKeys = {};
      prevActive.getObjects().forEach(function(o){
        if (!o || o.tableId !== tableId) return;
        if (!(o.isTableCell || o.isTableCellText)) return;
        var key = o.cellRow + '_' + o.cellCol;
        if (seenKeys[key]) return;
        seenKeys[key] = true;
        var p = findCellPair(tableId, o.cellRow, o.cellCol);
        if (p) multiCells.push(p);
      });
    }

    if (multiCells.length >= 2) {
      // ---- 여러 칸이 함께 선택된 상태 전용 메뉴 ----
      canvas.setActiveObject(prevActive);
      canvas.requestRenderAll();

      addCtxItem('⬛ 선택한 ' + multiCells.length + '칸 합치기', function(){
        var r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
        multiCells.forEach(function(c){
          r0 = Math.min(r0, c.r0); r1 = Math.max(r1, c.r1);
          c0 = Math.min(c0, c.c0); c1 = Math.max(c1, c.c1);
        });
        mergeAnchor = null;
        mergeCells({ tableId: tableId, r0: r0, r1: r1, c0: c0, c1: c1 });
      });
      addCtxDivider();
      addCtxItem('✎✎ 글 일괄수정 (선택된 ' + multiCells.length + '칸)', function(){
        var sample = multiCells[0].text.fullText != null ? multiCells[0].text.fullText : (multiCells[0].text.text || '');
        var val = prompt('선택한 ' + multiCells.length + '칸에 모두 넣을 내용을 입력하세요.', sample);
        if (val == null) return; // 취소
        multiCells.forEach(function(c){
          c.text.fullText = val;
          c.text.set({ text: val, textAlign: 'center' });
          layoutCell(c.rect, c.text);
        });
        canvas.requestRenderAll();
        pushHistory();
      });
      addCtxDivider();
      addCtxItem('✓ 표 편집 완료', function(){ finishTableEdit(tableId); });
      return;
    }

    // ---- 셀 1칸만 선택(우클릭)된 상태의 기존 메뉴 ----
    var pair = findCellPair(tableId, target.cellRow, target.cellCol);
    var textObj = pair ? pair.text : (target.isTableCellText ? target : null);
    var rectObj = pair ? pair.rect : (target.isTableCell ? target : null);

    // 텍스트를 클릭했어도 박스(사각형)를 활성 오브젝트로 잡아서, 우측 패널의
    // "채우기(배경색)" 입력이 항상 이 셀의 박스에 적용되도록 함
    canvas.setActiveObject(rectObj || target);
    canvas.requestRenderAll();

    addCtxItem('⬅ 좌측 정렬', function(){
      if (!textObj) return;
      textObj.set('textAlign', 'left'); canvas.requestRenderAll(); pushHistory();
    });
    addCtxItem('■ 가운데 정렬', function(){
      if (!textObj) return;
      textObj.set('textAlign', 'center'); canvas.requestRenderAll(); pushHistory();
    });
    addCtxItem('➡ 우측 정렬', function(){
      if (!textObj) return;
      textObj.set('textAlign', 'right'); canvas.requestRenderAll(); pushHistory();
    });
    addCtxDivider();
    addCtxItem('✎ 글 수정', function(){
      if (!textObj) return;
      canvas.setActiveObject(textObj);
      textObj.enterEditing();
      textObj.selectAll();
      canvas.requestRenderAll();
      // 편집을 마쳤을 때의 처리(가운데 정렬 + 셀 재배치 + 히스토리 저장)는 아래 전역
      // canvas.on('editing:exited') 핸들러가 모든 표 셀 텍스트에 대해 이미 해주므로 여기서
      // 따로 등록하지 않음. 예전엔 여기서도 한 번 더 등록해서 편집을 마칠 때마다 재배치가
      // 두 번 실행됐고, 글이 길어서 말줄임(…) 처리가 된 경우 두 번째 실행이 이미 줄어든
      // 텍스트를 fullText로 덮어써서 원문이 날아가는 문제도 있었음.
    });
    addCtxDivider();
    if (mergeAnchor && mergeAnchor.tableId === tableId &&
        !(mergeAnchor.r === target.cellRow && mergeAnchor.c === target.cellCol)) {
      addCtxItem('⬛ 여기까지 합치기', function(){
        var range = {
          tableId: tableId,
          r0: Math.min(mergeAnchor.r, target.cellRow), r1: Math.max(mergeAnchor.r, target.cellRow),
          c0: Math.min(mergeAnchor.c, target.cellCol), c1: Math.max(mergeAnchor.c, target.cellCol)
        };
        mergeAnchor = null;
        mergeCells(range);
      });
      addCtxItem('합치기 취소', function(){ mergeAnchor = null; });
    } else {
      addCtxItem('⬛ 합치기 시작 (합칠 반대쪽 셀에서 다시 우클릭)', function(){
        mergeAnchor = { tableId: tableId, r: target.cellRow, c: target.cellCol };
      });
    }
    addCtxDivider();
    addCtxItem('↕ 이 줄(행) 높이 키우기', function(){ resizeRow(tableId, target.cellRow, 12); });
    addCtxItem('↕ 이 줄(행) 높이 줄이기', function(){ resizeRow(tableId, target.cellRow, -12); });
    addCtxItem('↔ 이 열 너비 키우기', function(){ resizeCol(tableId, target.cellCol, 12); });
    addCtxItem('↔ 이 열 너비 줄이기', function(){ resizeCol(tableId, target.cellCol, -12); });
    addCtxDivider();
    addCtxItem('✓ 표 편집 완료', function(){ finishTableEdit(tableId); });
  };

  function mergeCells(range){
    var tbl = EP.tableRegistry[range.tableId];
    if (!tbl) return;
    var texts = [];
    var minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
    var found = false;
    for (var r = range.r0; r <= range.r1; r++) {
      for (var c = range.c0; c <= range.c1; c++) {
        var key = r + '_' + c;
        var cell = tbl.cells[key];
        if (!cell) continue;
        found = true;
        var content = (cell.text.fullText != null ? cell.text.fullText : cell.text.text || '').trim();
        if (content) texts.push(content);
        minLeft = Math.min(minLeft, cell.rect.left);
        minTop = Math.min(minTop, cell.rect.top);
        maxRight = Math.max(maxRight, cell.rect.left + cell.rect.width * (cell.rect.scaleX || 1));
        maxBottom = Math.max(maxBottom, cell.rect.top + cell.rect.height * (cell.rect.scaleY || 1));
        canvas.remove(cell.rect);
        canvas.remove(cell.text);
        delete tbl.cells[key];
      }
    }
    if (!found || !isFinite(minLeft)) return;

    var w = maxRight - minLeft, h = maxBottom - minTop;
    var merged = makeCell(range.tableId, range.r0, range.c0, minLeft, minTop, w, h, texts.join(' '));
    merged.r1 = range.r1; merged.c1 = range.c1;
    merged.rect.cellR1 = range.r1; merged.rect.cellC1 = range.c1;
    merged.text.cellR1 = range.r1; merged.text.cellC1 = range.c1;
    tbl.cells[range.r0 + '_' + range.c0] = merged;
    canvas.add(merged.rect); canvas.add(merged.text);
    updateTableExtrasBounds(range.tableId);
    canvas.requestRenderAll();
    pushHistory();
  }

  // ---- 5) 글자 속성(크기 등)이 바뀌거나 편집을 마쳤을 때, 셀 안에서 다시 세로 가운데로 맞춤 ----
  function relayoutIfTableCellText(o){
    if (!o || !o.isTableCellText) return;
    var pair = findCellPair(o.tableId, o.cellRow, o.cellCol);
    if (!pair) return;
    layoutCell(pair.rect, pair.text);
    canvas.requestRenderAll();
  }

  var fontSizeInputEl = document.getElementById('fontSizeInput');
  if (fontSizeInputEl) {
    fontSizeInputEl.addEventListener('input', function(){
      relayoutIfTableCellText(canvas.getActiveObject());
    });
  }

  // ---- 표 그룹이 선택된 상태에서 채우기/테두리를 바꾸면, 그룹 자체가 아니라
  //      안에 있는 모든 셀 박스에 적용되게 함 (그룹은 자체 도형이 없어서 원래 안 먹힘) ----
  function applyToAllCellsIfTableGroup(prop, value){
    var active = canvas.getActiveObject();
    if (!active || !active.isTableGroup) return false;
    var tbl = EP.tableRegistry[active.tableId];
    if (!tbl) return false;
    Object.keys(tbl.cells).forEach(function(k){
      tbl.cells[k].rect.set(prop, value);
      tbl.cells[k].rect.dirty = true;
    });
    // 테두리 두께처럼 셀의 실제 렌더링 크기가 바뀌는 속성은, 표 그룹의 바운딩박스(선택박스)도
    // 그 자리에서 다시 계산해줘야 함. 안 그러면 선택박스는 예전(얇은 테두리) 크기 그대로 남아있고
    // 실제 표만 두꺼워진 테두리만큼 커져서, 두께를 올릴수록 선택박스가 표 기준으로 점점
    // 오른쪽/아래로 치우쳐 보이는 문제가 생김.
    active.addWithUpdate();
    active.dirty = true;
    canvas.requestRenderAll();
    return true;
  }
  var fillColorInputEl = document.getElementById('fillColorInput');
  var strokeColorInputEl = document.getElementById('strokeColorInput');
  var strokeWidthInputEl = document.getElementById('strokeWidthInput');
  if (fillColorInputEl) {
    fillColorInputEl.addEventListener('input', function(){
      applyToAllCellsIfTableGroup('fill', fillColorInputEl.value);
    });
  }
  if (strokeColorInputEl) {
    strokeColorInputEl.addEventListener('input', function(){
      applyToAllCellsIfTableGroup('stroke', strokeColorInputEl.value);
    });
  }
  if (strokeWidthInputEl) {
    strokeWidthInputEl.addEventListener('input', function(){
      applyToAllCellsIfTableGroup('strokeWidth', parseFloat(strokeWidthInputEl.value) || 0);
    });
  }
  canvas.on('editing:exited', function(opt){
    var o = opt.target;
    if (o && o.isTableCellText) {
      o.fullText = o.text;
      o.set('textAlign', 'center'); // 글 수정을 마치면 항상 박스 정중앙(가로+세로)으로 정렬
      relayoutIfTableCellText(o);
      pushHistory();
    }
  });
})();
