/* ecopro3table.js — 표 만들기
   - 생성 시 캔버스 안에 들어오도록 크기 자동 조절
   - 평소엔 fabric.Group으로 묶여서 다른 도형처럼 이동/크기조절 가능
   - 더블클릭하면 "편집모드"(개별 셀 선택 가능) 진입 -> 정렬/드래그 합치기 -> "표 편집 완료"로 다시 묶임
   - 셀 텍스트는 세로 가운데 정렬, 길어지면 박스 안에서 줄바꿈(최대 4줄)되고 그래도 넘치면 말줄임(...)
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
  EP.tableCloneProps = ['isTableGroup', 'tableId', 'isTableCell', 'isTableCellText',
    'cellRow', 'cellCol', 'cellR1', 'cellC1', 'fullText', 'origHeight',
    'subTargetCheck', 'objectCaching'];

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
    var rows = 0, cols = 0;
    var children = (typeof obj.getObjects === 'function') ? obj.getObjects() : [];
    children.forEach(function(o){
      if (!o || o.cellRow == null || o.cellCol == null) return;
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
    EP.tableRegistry[newTableId] = { rows: rows, cols: cols, cells: cells };
    if (obj.setCoords) obj.setCoords(); // 더블클릭 판정용 좌표 캐시 갱신
    return newTableId;
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

  document.getElementById('addTableBtn').addEventListener('click', function(e){
    if (e) e.stopPropagation(); // 부모(#shapeMenu)의 공통 클릭 핸들러와 겹치지 않도록 분리
    document.getElementById('shapeMenu').classList.add('hidden');
    tableInputToolbar.classList.remove('hidden');
    tableInputArea.focus();
    tableInputArea.select(); // 이전 내용이 남아있으면 전체 선택 — 그대로 두거나 바로 타이핑해서 덮어쓰기 편하게
  });
  document.getElementById('cancelTableBtn').addEventListener('click', function(){
    tableInputToolbar.classList.add('hidden');
  });
  document.getElementById('applyTableBtn').addEventListener('click', function(){
    var raw = tableInputArea.value;
    if (!raw || !raw.trim()) return;
    var ok = false, errMsg = '';
    try {
      ok = buildTable(raw);
    } catch (e) {
      console.error('표 만들기 실패:', e);
      errMsg = (e && e.message) ? e.message : String(e);
      ok = false;
    }
    if (ok) {
      tableInputToolbar.classList.add('hidden');
      // 입력했던 내용은 일부러 지우지 않음: 표를 지운 뒤 다시 '표 만들기'를 눌러도
      // 마지막에 적었던 내용이 그대로 남아있어서 다시 타이핑할 필요가 없음
    } else {
      alert('표를 만들지 못했어요. 입력 내용은 그대로 남아있으니 다시 시도해보세요.' + (errMsg ? ('\n(오류: ' + errMsg + ')') : ''));
    }
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

  function cellObjectsOf(tableId){
    var tbl = EP.tableRegistry[tableId];
    if (!tbl) return [];
    var objs = [];
    Object.keys(tbl.cells).forEach(function(k){
      var cell = tbl.cells[k];
      if (cell.rect && canvas.getObjects().indexOf(cell.rect) !== -1) {
        cell.rect.setCoords();
        objs.push(cell.rect);
      }
      if (cell.text && canvas.getObjects().indexOf(cell.text) !== -1) {
        cell.text.setCoords();
        objs.push(cell.text);
      }
    });
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
      textObj.once('editing:exited', function(){
        textObj.fullText = textObj.text;
        textObj.set('textAlign', 'center'); // 글 수정을 마치면 항상 박스 정중앙(가로+세로)으로 정렬
        relayoutIfTableCellText(textObj);
        pushHistory();
      });
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
