/* ecopro3menu.js — 메뉴판 만들기
   "텍스트모양" 메뉴의 "로고 만들기" 아래에 있는 "메뉴판 만들기" 버튼을 누르면 여는 입력창.

   동작 방식:
     1) 여러 줄 텍스트를 붙여넣으면 한 줄씩 해석함(parseMenuText 참고):
        - 쉼표(,)가 있는 줄 → "품목명, 가격" 한 항목 (쉼표 뒤 숫자만 남기고 "원"/"," 등은 자동 정리)
        - 쉼표가 없는 줄 → 새 구간(섹션) 제목으로 취급 (예: "커피", "디저트")
        - 빈 줄은 무시함(구분용으로만 써도 되고 안 써도 됨)
        - 첫 항목들 앞에 제목 줄이 없으면 제목 없는 기본 구간에 담김
     2) "🧾 메뉴판 만들기"(일반 버튼)는 미니멀 타이포 스타일 하나로 고정해서 만듦 — 품목명은
        왼쪽 정렬, 가격은 오른쪽 정렬로 나란히 놓고 섹션 제목엔 밑줄을 살짝 그어 구분함.
     3) "🎲 랜덤 메뉴판 만들기"는 매번 스타일 3종(미니멀 / 손글씨·카페 / 컬러풀) 중 하나를
        무작위로 골라 적용함(rollMenuStyle 참고). 누를 때마다 새로 굴리고, 바로 전에 랜덤으로
        만든 메뉴판이 캔버스에 남아있으면 지우고 그 자리에 새 걸로 교체함(로고 만들기와 동일한 패턴).
     4) 만들어진 오브젝트는 fabric.Group으로 묶여 캔버스 중앙에 추가됨(다른 오브젝트처럼 이동/
        크기조절 가능하고, "묶기 풀기"로 항목별로 따로 편집할 수도 있음).
     5) "캔버스 안에 무조건 들어가게" — 🧾/🎲/📐 세 버튼 전부, 만들고 나서 "캔버스 가장자리"
        기준으로 상단 2·하단 2·좌우 0.5씩 안쪽으로 줄인 경계(getCanvasBounds 참고)를 기준선으로
        삼음. 캔버스는 cm/mm 같은 물리 단위가 아니라 쿼리로 받은 순수 비율 숫자(예: 16×8)라서,
        그 숫자를 격자 단위로 보고 ecopro3.js가 노출한 EP.getPxPerUnit()으로 "1단위가 몇 px인지"를
        정확히 환산해서 뺌. 폭이나 높이가 이 경계를 넘으면 글자 크기를 포함해 통째로 축소함
        (fitScaleForCanvas 참고, 원본보다 키우지는 않음). 캔버스를 회전하거나 다른 사이즈로
        바꿔도 그 시점의 실제 캔버스 크기·비율을 다시 재는 방식이라 항상 정확하게 맞음. 목록이
        아무리 많아져도(세로로 길어지거나 칼럼이 넓어져도) 이 로직 덕분에 항상 이 경계 안에서
        정렬된 채로 나옴.
     6) "📐 정메뉴 만들기" — 줄에 '/'만 쓰면 그 지점에서 잘라 새로운 열(칼럼)을 시작함(좌·중·우
        처럼 옆으로 나란히 배치됨, parseMenuColumns 참고). 줄에 '~'만 쓰면 새 열을 만들지 않고
        "지금 열 안에서" 그 아래에 서브블록을 하나 더 쌓음(제목+밑줄 디자인을 가진 독립된
        오브젝트가 그 열 안에서만 세로로 이어붙음, buildColumnStack 참고). 즉 '~'로 A열이 아무리
        길어져도 B열·C열은 영향받지 않고 전부 맨 위에서 시작해서 그대로 옆으로 나란히 배치됨 —
        "밑배치"가 아니라 기존 "옆배치" 구조가 기본이고, '~'는 그 안에서 세로로만 늘어남
        (예: "A1 ~ A2 / B1 / C1"이면 A열에 A1·A2가 세로로 쌓이고, 그 옆에 B열(B1), C열(C1)이
        나란히 옴). 열들을 다 합친 폭이 오히려 캔버스 폭보다 좁아서 바깥 양쪽에 여백이 남으면,
        축소 대신 각 열의 "이름-가격 사이 간격"을 넓혀서 캔버스 폭에 채움(buildMenuGroup의 gapPx
        인자로 간격을 계산해서 다시 만듦 — 기본 16px보다 좁아지진 않음). 다만 이 간격이 그 열의
        가장 긴 품목명 길이의 1배를 넘어서면 이름-가격 사이가 지나치게 헐렁해 보이므로, 그
        지점에서 간격 늘리기를 멈추고(열마다 자기 열의 최대 품목명 길이가 상한이라 열마다 상한이
        다름) 그 이상 남는 폭은 억지로 채우지 않고 좌우 여백으로 남김.
        이때 세로가 캔버스 높이를 넘어서 나중에 전체가 한 번 더 축소될 예정이면, 그 축소분까지
        미리 감안해서 목표 폭을 그만큼 더 넉넉히 잡음 — 안 그러면 상하로 꽉 채우려고 축소하는
        순간 애써 채워둔 좌우가 다시 줄어들어 여백이 생기기 때문. 세로 기준 축소는
        fitScaleForCanvas로 마지막에 한 번 더 안전 확인함.

     7) "📊 엑셀로 불러오기" — .xlsx 파일을 선택하면 SheetJS(XLSX, ecopro3.html에서 fabric.js
        바로 뒤에 로드)로 첫 번째 시트를 읽어서, 위 1)의 미니 문법(품목명+쉼표+가격 / 쉼표없으면
        구간제목 / '/'면 열바꿈 / '~'면 같은 열 안 아랫블록)에 맞는 텍스트로 재조립한 뒤
        menuInputArea에 그대로 채워넣기만 함(excelRowsToMenuText 참고). 엑셀 열 구성은
        A=카테고리명, B=품목명, C=가격 세 칸뿐이고, '/'·'~' 같은 기호를 엑셀에 직접 쓸 필요 없이
        아래 규칙으로 자동 추론함:
          - 완전히 빈 줄 하나(A·B·C 전부 공백) → '/'(새 열)로 취급. 그 다음 내용부터 새 열이 시작됨
            (연속으로 여러 줄을 비워도 '/' 한 번만 들어감).
          - 그 "/" 구간(직전 빈 줄 이후) 안에서 A열(카테고리명)에 글자가 있는 줄을 첫 번째로 만나면
            그냥 새 구간 제목으로 쓰고, 같은 구간 안에서 두 번째 이후로 A열에 글자가 있는 줄을
            또 만나면(예: 업로드 샘플의 4·9행) 그 앞에 '~'를 붙여 "같은 열 안 아랫블록"으로 쌓음.
          - 카테고리명과 그 카테고리의 첫 품목을 같은 행에 나란히 적어도 되고(A·B·C 한 행에 같이),
            그 아래 행들은 A열을 비워둔 채 B·C(품목명·가격)만 이어서 적으면 같은 구간에 속함.
        "📥 엑셀 양식 받기"로 이 구조 그대로의 예시 파일을 내려받을 수 있음. 엑셀을 별도 경로로
        처리하지 않고 항상 이 textarea를 거쳐 가므로, parseMenuText/parseMenuColumns/미리보기/
        🧾·🎲·📐 세 버튼 전부 기존 코드 그대로 재사용되고, 불러온 뒤에도 textarea에서 자유롭게
        직접 수정 가능함.

   로딩 순서: ecopro3.js(코어) 다음이면 어디든 무방하나, 관례상 ecopro3logo.js 다음,
   ecopro3l.js(주사위, 레지스트리를 맨 마지막에 읽음) 전에 둠. SheetJS(XLSX)는 ecopro3.html에서
   fabric.js 바로 다음(defer 없이)에 로드되어 이 파일이 실행되는 시점엔 이미 window.XLSX로
   준비되어 있음. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var shapeMenu = document.getElementById('shapeMenu');
  var addMenuBtn = document.getElementById('addMenuBtn');
  var menuInputToolbar = document.getElementById('menuInputToolbar');
  var menuInputToolbarHint = document.getElementById('menuInputToolbarHint');
  var menuInputArea = document.getElementById('menuInputArea');
  var applyMenuBtn = document.getElementById('applyMenuBtn');
  var randomMenuBtn = document.getElementById('randomMenuBtn');
  var applyStandardMenuBtn = document.getElementById('applyStandardMenuBtn');
  var cancelMenuBtn = document.getElementById('cancelMenuBtn');

  if (!addMenuBtn || !menuInputToolbar) return; // html이 안 맞으면 조용히 비활성화

  var DEFAULT_HINT = menuInputToolbarHint.textContent;

  // ---------- 입력 텍스트 파싱 ----------
  // 쉼표가 있는 줄 = 품목(이름+가격), 없는 줄 = 섹션 제목. 가격은 숫자만 남기고 정리함
  // (예: "4,500원" / "4500 원" 처럼 써도 "4,500"으로 통일해서 보여줌).
  function formatPrice(raw){
    var trimmed = (raw || '').trim();
    var hasWon = trimmed.indexOf('원') !== -1;
    var digits = trimmed.replace(/[^0-9]/g, '');
    if (!digits) return trimmed; // 숫자가 하나도 없으면 원문 그대로(예: "시가", "품절")
    var formatted = Number(digits).toLocaleString('ko-KR');
    return hasWon ? (formatted + '원') : formatted; // 입력에 "원"이 붙어있었으면 결과에도 붙여줌
  }

  function parseMenuText(text){
    var lines = (text || '').split('\n');
    var sections = [];
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var commaIdx = line.indexOf(',');
      if (commaIdx === -1) {
        current = { title: line, items: [] };
        sections.push(current);
      } else {
        var name = line.substring(0, commaIdx).trim();
        var price = formatPrice(line.substring(commaIdx + 1));
        if (!name) continue;
        if (!current) { current = { title: null, items: [] }; sections.push(current); }
        current.items.push({ name: name, price: price });
      }
    }
    // 항목이 하나도 없는 섹션(제목만 있고 품목이 안 딸려온 경우)은 그대로 두되,
    // 완전히 빈 결과면 null 반환해서 호출부가 "입력 없음"으로 처리하게 함
    var hasAnyItem = sections.some(function(s){ return s.items.length > 0; });
    if (!sections.length || !hasAnyItem) return null;
    return sections;
  }

  // "정메뉴 만들기" 전용 — 줄에 '/' 또는 '~' 하나만 있으면 그 지점에서 텍스트를 잘라 블록
  // (오브젝트 레이어)으로 나눔. '/'는 "같은 행에서 오른쪽으로 이어붙임"(좌·중·우처럼 가로로
  // 나란히), '~'는 "새 행을 시작함"(그 아래 줄로 내려가서 세로로 쌓임) — 이 둘을 섞어서 써도
  // 됨(예: A / B / C ~ D 이면 1행에 A·B·C가 나란히, 2행에 D 하나가 그 아래에 옴). 결과는
  // [[sections,...], [sections,...], ...] 형태의 "행 배열"로 반환됨(행 하나 = 블록 배열).
  // "정메뉴 만들기" 전용 — 줄에 '/' 하나만 있으면 새로운 열(칼럼, 좌·중·우처럼 옆으로)을
  // 시작함. 줄에 '~' 하나만 있으면 열을 새로 만들지 않고, "지금 열 안에서" 그 아래에 서브블록을
  // 하나 더 쌓음(제목+밑줄 디자인을 가진 독립된 오브젝트가 세로로 이어붙음). 즉 '~'로 아무리
  // 늘어나도 그 열(예: A열)만 세로로 길어질 뿐, 다른 열(B열/C열)은 전부 맨 위에서 시작해서
  // 옆으로 나란히 배치됨 — "밑배치"가 아니라 기존처럼 "옆배치"가 기본 구조임.
  // 반환값은 [[sectionsA1, sectionsA2, ...], [sectionsB1, ...], [sectionsC1, ...]] 형태의
  // "열 배열"(열 하나 = 그 열 안에서 세로로 쌓일 서브블록들의 배열).
  function parseMenuColumns(rawText){
    var lines = (rawText || '').split('\n');
    var columns = [[]];
    var current = [];
    lines.forEach(function(line){
      var trimmed = line.trim();
      if (trimmed === '/') {
        columns[columns.length - 1].push(current.join('\n'));
        current = [];
        columns.push([]);
      } else if (trimmed === '~') {
        columns[columns.length - 1].push(current.join('\n'));
        current = [];
      } else {
        current.push(line);
      }
    });
    columns[columns.length - 1].push(current.join('\n'));

    var grid = [];
    columns.forEach(function(blockTexts){
      var colSectionsList = [];
      blockTexts.forEach(function(blockText){
        var sections = parseMenuText(blockText);
        if (sections) colSectionsList.push(sections);
      });
      if (colSectionsList.length) grid.push(colSectionsList);
    });
    return grid.length ? grid : null;
  }

  // ---------- 입력창 열기/닫기 ----------
  function setApplyEnabled(enabled){
    applyMenuBtn.disabled = !enabled;
    if (randomMenuBtn) randomMenuBtn.disabled = !enabled;
    if (applyStandardMenuBtn) applyStandardMenuBtn.disabled = !enabled;
  }

  function updatePreview(){
    var sections = parseMenuText(menuInputArea.value);
    if (!sections) {
      menuInputToolbarHint.textContent = DEFAULT_HINT;
      setApplyEnabled(false);
      return;
    }
    var itemCount = sections.reduce(function(n, s){ return n + s.items.length; }, 0);
    var titledCount = sections.filter(function(s){ return s.title; }).length;
    var grid = parseMenuColumns(menuInputArea.value);
    var totalBlocks = grid ? grid.reduce(function(n, col){ return n + col.length; }, 0) : 0;
    var blockHint = (grid && (grid.length > 1 || totalBlocks > 1)) ? (', 정메뉴는 ' + grid.length + '열 · 오브젝트 ' + totalBlocks + '개') : '';
    menuInputToolbarHint.textContent = '미리보기 — 품목 ' + itemCount + '개' + (titledCount ? ', 구간 ' + titledCount + '개' : '') + blockHint;
    setApplyEnabled(true);
  }

  function openMenuInputToolbar(){
    shapeMenu.classList.add('hidden');
    menuInputToolbarHint.textContent = DEFAULT_HINT;
    menuInputArea.value = '';
    setApplyEnabled(false);
    menuInputToolbar.classList.remove('hidden');
    menuInputArea.focus();
  }

  addMenuBtn.addEventListener('click', function(e){
    if (e) e.stopPropagation();
    openMenuInputToolbar();
  });
  cancelMenuBtn.addEventListener('click', function(){
    menuInputToolbar.classList.add('hidden');
  });
  menuInputArea.addEventListener('input', updatePreview);

  // ---------- 엑셀(.xlsx) 첨부로 불러오기 ----------
  // 엑셀을 "별도의 새 구조"로 다루지 않고, 엑셀 각 행을 지금 입력창이 원래 이해하는 한 줄짜리
  // 미니 문법(품목명+쉼표+가격 / 쉼표없으면 구간제목 / '/'면 열바꿈 / '~'면 같은 열 안 아랫블록)
  // 그대로로 다시 조립해서 textarea에 채워넣기만 함. 그래서 이후의 parseMenuText/parseMenuColumns/
  // 미리보기/🧾·🎲·📐 세 버튼은 전혀 손대지 않아도 엑셀로 넣은 내용이 그대로 똑같이 동작함
  // (엑셀 없이 직접 타이핑한 것과 결과가 100% 동일 — 불러온 뒤 textarea에서 직접 수정도 가능).
  // 엑셀 열 구성(양식 다운로드 참고): A=카테고리명, B=품목명, C=가격 세 칸뿐 — '/'·'~' 기호를
  // 엑셀에 직접 쓸 필요 없이 excelRowsToMenuText가 아래 규칙으로 자동 추론함(자세한 설명은 파일
  // 맨 위 7번 참고). 헤더 설명 줄(1행)에 "카테고리"/"품목"/"가격" 안내문구가 있으면 자동으로 건너뜀.
  var menuExcelInput = document.getElementById('menuExcelInput');
  var menuExcelTemplateBtn = document.getElementById('menuExcelTemplateBtn');
  var menuExcelHint = document.getElementById('menuExcelHint');

  function excelCellStr(v){
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  function excelRowsToMenuText(rows){
    var lines = [];
    var colHasCategory = false; // 지금 "/" 구간(직전 빈 줄 이후) 안에서 카테고리명이 이미 한 번 나왔는지
    var pendingSlash = false;   // 빈 줄을 만나서 다음 내용 앞에 '/'를 붙여야 하는지(연속 빈 줄은 한 번만)
    var hasAnyLine = false;     // 지금까지 실제 내용 줄을 하나라도 냈는지(맨 앞 빈 줄은 무시)

    (rows || []).forEach(function(row, idx){
      if (!row) return;
      var category = excelCellStr(row[0]); // 카테고리명(A열)
      var name = excelCellStr(row[1]);      // 품목명(B열)
      var price = excelCellStr(row[2]);     // 가격(C열)

      // 1행이 안내용 헤더면(카테고리/품목/가격 안내문구 포함) 건너뜀
      if (idx === 0 && (category.indexOf('카테고리') !== -1 || name.indexOf('품목') !== -1 || price.indexOf('가격') !== -1)) return;

      var isBlank = !category && !name && !price;
      if (isBlank) {
        if (hasAnyLine) pendingSlash = true; // 맨 앞의 빈 줄은 무시하고, 내용이 나온 뒤의 빈 줄만 "/" 후보로 표시
        return;
      }

      if (pendingSlash) {
        lines.push('/');
        colHasCategory = false; // 새 열이 시작됐으니 "이 열에서 카테고리 나온 적 있음" 플래그도 초기화
        pendingSlash = false;
      }

      if (category) {
        if (colHasCategory) lines.push('~'); // 같은 "/" 구간 안에서 두 번째 이후 카테고리부터는 서브블록으로 이어붙임
        lines.push(category);
        colHasCategory = true;
        hasAnyLine = true;
      }
      if (name) {
        lines.push(price ? (name + ', ' + price) : (name + ','));
        hasAnyLine = true;
      }
    });
    return lines.join('\n');
  }

  if (menuExcelInput) {
    menuExcelInput.addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!window.XLSX) {
        alert('엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
        menuExcelInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function(ev){
        try {
          var data = new Uint8Array(ev.target.result);
          var wb = XLSX.read(data, { type: 'array' });
          var sheetName = wb.SheetNames[0];
          if (!sheetName) throw new Error('시트 없음');
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
          var text = excelRowsToMenuText(rows);
          if (!text) {
            if (menuExcelHint) menuExcelHint.textContent = '엑셀에서 읽을 내용을 찾지 못했어요. "엑셀 양식 받기"로 형식을 확인해주세요.';
            return;
          }
          menuInputArea.value = text;
          updatePreview();
          if (menuExcelHint) menuExcelHint.textContent = '"' + file.name + '"에서 불러왔어요 — 아래 미리보기를 확인하고 필요하면 직접 더 수정하세요.';
        } catch (err) {
          console.error('엑셀 불러오기 실패:', err);
          alert('엑셀 파일을 읽는 중 문제가 생겼어요. "엑셀 양식 받기"로 받은 양식에 맞춰 입력했는지 확인해주세요.');
        } finally {
          menuExcelInput.value = ''; // 같은 파일을 다시 골라도 change 이벤트가 다시 나도록 초기화
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  if (menuExcelTemplateBtn) {
    menuExcelTemplateBtn.addEventListener('click', function(){
      if (!window.XLSX) {
        alert('엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
        return;
      }
      // 지금 입력창의 placeholder 예시(커피/디저트/모카/디저트2, '~'와 '/' 사용)와 같은 결과가
      // 나오도록, 빈 줄 하나로 열바꿈을, 같은 열 안 두 번째 카테고리로 서브블록을 표현한 예시.
      var aoa = [
        ['카테고리명', '품목명', '가격'],
        ['커피', '아메리카노', 4500],
        ['', '카페라떼', 5000],
        ['디저트', '크루아상', 4500],
        ['', '치즈케이크', 5000],
        ['', '', ''],
        ['모카', '모카아메리카노', 4500],
        ['', '모카라떼', 5000],
        ['디저트2', '크루아상', 4500],
        ['', '치즈케이크', 5000]
      ];
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 10 }];
      var wbOut = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wbOut, ws, '메뉴판');
      XLSX.writeFile(wbOut, '메뉴판_엑셀양식.xlsx');
    });
  }

  // ---------- 스타일 굴리기(랜덤 메뉴판 전용) ----------
  var MENU_ACCENTS = ['#8a5a2f', '#2f5d8a', '#1f7a5c', '#a3384f', '#6b4fa0', '#b05a1f', '#2f7a7a'];
  function pickMenuAccent(){
    return MENU_ACCENTS[Math.floor(Math.random() * MENU_ACCENTS.length)];
  }

  var lastMenuStyleKey = null;
  function rollMenuStyle(){
    var style, key, tries = 0;
    do {
      var kinds = ['minimal', 'handwritten', 'colorful'];
      var kind = kinds[Math.floor(Math.random() * kinds.length)];
      var accent = pickMenuAccent();
      style = { kind: kind, accent: accent };
      key = kind + '|' + accent;
      tries++;
    } while (key === lastMenuStyleKey && tries < 6);
    lastMenuStyleKey = key;
    return style;
  }

  // ---------- 메뉴판 레이아웃 빌드 ----------
  // (이제 buildMenuGroup 안에서 실제 품목명/가격 폭을 재서 동적으로 폭을 정하므로
  // 고정 메뉴 폭 상수는 더 이상 필요 없음 — 이름-가격 간격을 좁히기 위한 변경)

  function fontsForKind(kind){
    if (kind === 'handwritten') return { header: 'Jua', item: 'Gowun Dodum' };
    if (kind === 'colorful') return { header: 'Black Han Sans', item: 'Noto Sans KR' };
    return { header: 'Noto Sans KR', item: 'Noto Sans KR' }; // minimal(기본)
  }

  // style이 없으면(일반 버튼) 미니멀 스타일 고정. 있으면 style.kind에 따라 색/폰트가 달라짐.
  // forcedNameWidth: "정메뉴 만들기"에서 같은 열 안에 '~'로 여러 서브블록(예: 커피 블록과 그
  // 아래 디저트 블록)이 쌓일 때, 서브블록마다 각자 buildMenuGroup을 따로 호출하다 보니 블록별로
  // 품목명 중 가장 넓은 폭이 달라서(예: "아메리카노"보다 "크루아상"이 짧음) 이름-가격 사이 점선과
  // 가격 시작 x가 블록마다 어긋나 보이던 문제가 있었음. buildColumnStack이 그 열의 모든 서브블록
  // 품목명 중 가장 넓은 폭을 미리 재서 이 값으로 넘겨주면, 모든 서브블록이 같은 priceColumnX를
  // 쓰게 되어 가격 칸이 세로로 정확히 정렬됨(값을 안 넘기면 기존처럼 자기 자신의 폭만 씀).
  function buildMenuGroup(sections, style, gapPx, forcedNameWidth){
    var kind = style ? style.kind : 'minimal';
    var accent = style ? style.accent : '#2f5d8a';
    var fonts = fontsForKind(kind);
    var itemColor = '#242424';
    var priceColor = kind === 'colorful' ? accent : '#242424';

    var headerFontSize = 25;
    var itemFontSize = 19;
    var rowHeight = 34;
    var sectionGap = 22;
    var DEFAULT_GAP = 16;
    var nameGapPx = (typeof gapPx === 'number' && gapPx > 0) ? gapPx : DEFAULT_GAP;

    // 이름-가격 사이 공백을 줄이기 위해, 고정폭(예전 460px) 대신 실제 품목명 중 가장 넓은 폭을
    // 먼저 재서 가격 칸을 그 바로 뒤(기본 16px 간격, 필요하면 gapPx로 더 넓게 지정 가능)에 붙임
    // — 그래서 메뉴판 전체 폭도 내용에 맞게 자동으로 정해지고, 짧은 이름일 때 공백이 크게 남던
    // 문제가 줄어듦. "정메뉴 만들기"에서 좌우로 여백이 남는 경우엔 이 간격을 넓혀서 캔버스 폭에
    // 꽉 채우는 용도로도 씀(insertStandardMenusToCanvas 참고).
    var maxNameWidth = 0, maxPriceWidth = 0;
    sections.forEach(function(section){
      section.items.forEach(function(item){
        item._nameObj = new fabric.IText(item.name, {
          left: 0, top: 0, originX: 'left', originY: 'top',
          fontFamily: fonts.item, fontSize: itemFontSize, fill: itemColor
        });
        item._priceObj = new fabric.IText(item.price, {
          left: 0, top: 0, originX: 'left', originY: 'top',
          fontFamily: fonts.item, fontSize: itemFontSize, fontWeight: '700', fill: priceColor
        });
        maxNameWidth = Math.max(maxNameWidth, item._nameObj.width);
        maxPriceWidth = Math.max(maxPriceWidth, item._priceObj.width);
      });
    });
    var priceColumnX = Math.max(maxNameWidth, (typeof forcedNameWidth === 'number' ? forcedNameWidth : 0)) + nameGapPx;
    var colWidth = priceColumnX + maxPriceWidth;

    var objs = [];
    var y = 0;

    sections.forEach(function(section, sIdx){
      if (sIdx > 0) y += sectionGap;

      if (section.title) {
        if (kind === 'colorful') {
          // 컬러풀 스타일: 섹션 제목 뒤에 둥근 알약 모양 배경(악센트 색)
          var titleText = new fabric.IText(section.title, {
            left: 0, top: y, originX: 'left', originY: 'top',
            fontFamily: fonts.header, fontSize: headerFontSize, fill: '#ffffff', charSpacing: 20
          });
          var pillW = titleText.width + 34, pillH = headerFontSize * 1.55;
          var pill = new fabric.Rect({
            left: -17, top: y - (pillH - headerFontSize) / 2 + 2, originX: 'left', originY: 'top',
            width: pillW, height: pillH, rx: pillH / 2, ry: pillH / 2, fill: accent
          });
          objs.push(pill, titleText);
          y += headerFontSize * 1.9;
        } else {
          var header = new fabric.IText(section.title, {
            left: 0, top: y, originX: 'left', originY: 'top',
            fontFamily: fonts.header, fontSize: headerFontSize,
            fill: kind === 'handwritten' ? accent : '#1a1a1a',
            charSpacing: kind === 'minimal' ? 40 : 10
          });
          objs.push(header);
          y += headerFontSize * 1.3;
          var ruleY = y;
          objs.push(new fabric.Rect({
            left: 0, top: ruleY, originX: 'left', originY: 'top',
            width: colWidth, height: kind === 'handwritten' ? 2 : 1.5,
            fill: accent
          }));
          y += 14;
        }
      }

      section.items.forEach(function(item){
        item._nameObj.set('top', y);
        item._priceObj.set({ left: priceColumnX, top: y });
        objs.push(item._nameObj, item._priceObj);
        if (kind === 'minimal') {
          // 미니멀 스타일: 이름과 가격 사이 좁아진 간격을 은은한 점선(dot leader)으로 채움
          var dotsColor = 'rgba(0,0,0,0.22)';
          var dotY = y + itemFontSize * 0.78;
          var dotStartX = item._nameObj.width + 4;
          var dotEndX = priceColumnX - 4;
          if (dotEndX > dotStartX) {
            var dotsLine = new fabric.Line([dotStartX, dotY, dotEndX, dotY], {
              stroke: dotsColor, strokeWidth: 1.4, strokeDashArray: [1.5, 5], strokeLineCap: 'round'
            });
            objs.push(dotsLine);
          }
        }
        y += rowHeight;
      });
    });

    var group = new fabric.Group(objs, { originX: 'center', originY: 'center' });
    group.isLogoGroup = true; // 더블클릭 시 자동으로 묶기 풀리는 기존 로직(ecopro3logo.js)을 그대로 재사용
    group.logoMode = 'menu-board';
    group.logoMenuStyle = kind;
    // 호출부(insertMenuToCanvas)가 "이름-가격 사이 간격은 가장 긴 품목명 길이의 1배를 넘지 않게"
    // 제한할 때 기준으로 쓸 수 있도록, 이번에 실제로 쓰인(및 forcedNameWidth로 강제된) 품목명
    // 최대 폭을 그룹에 실어서 반환함.
    group.maxNameWidth = Math.max(maxNameWidth, (typeof forcedNameWidth === 'number' ? forcedNameWidth : 0));
    return group;
  }

  function insertMenuToCanvas(sections, style){
    var canvas = EP.canvas;
    if (!canvas) { alert('캔버스를 찾을 수 없어요.'); return null; }

    var DEFAULT_GAP = 16;

    // 1차: 기본 간격으로 만들어서 자연 폭·높이를 먼저 재봄
    var group = buildMenuGroup(sections, style, DEFAULT_GAP);
    var naturalWidth = group.width;
    var naturalHeight = group.height;

    var bounds = getCanvasBounds(canvas);
    if (bounds) {
      var maxAllowedWidth = bounds.width;
      var maxAllowedHeight = bounds.height;
      // 세로가 캔버스 높이를 넘으면 나중에 전체가 scaleH만큼 축소될 텐데, 그 축소분을 미리
      // 감안해서 목표 폭을 넉넉히 잡아야 축소 후에도 좌우가 꽉 참(정메뉴 만들기와 동일한 원리).
      var scaleH = naturalHeight > maxAllowedHeight ? (maxAllowedHeight / naturalHeight) : 1;
      var targetWidthPreScale = maxAllowedWidth / scaleH;
      // 좌우에 여백이 남으면(폭이 목표보다 좁으면) 이름-가격 간격을 늘려서 꽉 채우되, 그 간격이
      // "이 안의 가장 긴 품목명 길이의 1배"를 넘어가면 이름-가격 사이가 지나치게 헐렁해 보이므로
      // 그 지점에서 간격 늘리기를 멈춤(group.maxNameWidth 기준). 그 이상 채워야 할 폭이 남으면
      // 억지로 늘리지 않고 그냥 좌우에 여백을 남김(축소는 아래 fitScaleForCanvas가 필요할 때만 함).
      if (naturalWidth < targetWidthPreScale) {
        var contentWidth = naturalWidth - DEFAULT_GAP; // 이름+가격 순수 내용폭(간격 제외)
        var rawTargetGap = Math.max(targetWidthPreScale - contentWidth, DEFAULT_GAP);
        var targetGap = Math.max(DEFAULT_GAP, Math.min(rawTargetGap, group.maxNameWidth));
        group = buildMenuGroup(sections, style, targetGap);
        naturalWidth = group.width;
        naturalHeight = group.height;
      }
    }

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    // 목록이 많아 세로로 길어지거나(위에서 이미 좌우는 채웠으니) 여전히 캔버스 안전영역을 넘으면,
    // 글자 크기를 포함해 통째로 축소해서 무조건 캔버스 안에 들어가게 함(원본보다 키우진 않음).
    var scale = fitScaleForCanvas(canvas, naturalWidth, naturalHeight);
    if (scale !== 1) group.set({ scaleX: scale, scaleY: scale });
    group.set({ left: centerX, top: centerY });

    canvas.add(group);
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    if (EP.refreshEmptyHint) EP.refreshEmptyHint();

    return group;
  }

  // "캔버스 가장자리" 기준을 상단 2·하단 2·좌우 0.5씩 안쪽으로 줄인 새 경계로 정의함(요청사항).
  // 캔버스는 cm/mm 같은 물리 단위가 아니라 쿼리로 받은 순수 비율 숫자(ratioW×ratioH, 예: 16×8)로
  // 잡혀있으므로, 그 숫자 자체를 격자 단위로 보고 2와 0.5를 그대로 씀(cm 변환 없음). 기존의 회색
  // 바깥 안내선(실제 캔버스 원본 크기, guides 중 폭이 더 큰 쪽)에서 시작해서, ecopro3.js가 노출한
  // EP.getPxPerUnit()으로 "1단위가 몇 px인지"를 그 순간의 실제 캔버스 크기 기준으로 정확히 환산해
  // 안쪽으로 파고듦. 캔버스를 회전하거나 다른 사이즈로 바꿔도 EP.getPxPerUnit()이 항상 최신 값을
  // 계산해주므로 이 함수도 매번 정확하게 맞음. 이 함수가 반환하는 사각형이 곧 "지금부터의 캔버스
  // 가장자리 역할"이라 아래 fitScaleForCanvas/insertMenuToCanvas/insertStandardMenusToCanvas가
  // 전부 이 경계를 그대로 기준으로 씀(별도의 추가 여유 마진을 두지 않음 — 이 경계 자체가 이미
  // 의도한 여백임).
  function getCanvasBounds(canvas){
    var guides = (canvas.getObjects() || []).filter(function(o){ return o && o.isGuide; });
    if (!guides.length) return null;
    guides = guides.slice().sort(function(a, b){ return (b.width || 0) - (a.width || 0); });
    var outer = guides[0]; // 회색 바깥 안내선 = 실제 캔버스 원본 크기(left=0,top=0,width=CANVAS_W,height=CANVAS_H)

    var pxPerUnit = (EP.getPxPerUnit && EP.getPxPerUnit()) || 0;
    if (!pxPerUnit) {
      // 단위 변환 정보를 못 가져오면(구버전 등) 안전하게 원본 안내선 크기 그대로 반환
      return { left: outer.left, top: outer.top, width: outer.width, height: outer.height };
    }

    var topMarginPx = 2 * pxPerUnit;    // 상단 2단위
    var bottomMarginPx = 2 * pxPerUnit; // 하단 2단위
    var sideMarginPx = 0.5 * pxPerUnit; // 좌우 0.5단위씩

    return {
      left: outer.left + sideMarginPx,
      top: outer.top + topMarginPx,
      width: Math.max(outer.width - sideMarginPx * 2, 1),
      height: Math.max(outer.height - topMarginPx - bottomMarginPx, 1)
    };
  }

  // 오브젝트(들)가 캔버스 안전영역(guideRect/outerGuideRect 기준) 폭·높이를 넘지 않도록 필요한
  // 축소 배율을 계산함 — 캔버스를 회전하거나 다른 크기로 바꿔도 매번 그 시점의 실제 안내선
  // 크기를 다시 재서 계산하므로 항상 정확함. 안내선을 못 찾으면(만일의 경우) 축소하지 않음(1).
  // totalWidth/maxHeight는 "만약 원본 크기 그대로 배치했다면"의 폭/높이를 넘겨주면 됨.
  function fitScaleForCanvas(canvas, totalWidth, maxHeight){
    var bounds = getCanvasBounds(canvas);
    if (!bounds) return 1;
    // bounds가 이미 상단2·하단2·좌우0.5단위를 뺀 "정확한 목표 경계"이므로, 여기서 별도로
    // 추가 여유(margin)를 더 두지 않음 — 그러면 의도한 것보다 더 줄어들게 됨.
    var maxAllowedWidth = bounds.width;
    var maxAllowedHeight = bounds.height;
    var scaleW = totalWidth > maxAllowedWidth ? maxAllowedWidth / totalWidth : 1;
    var scaleH = maxHeight > maxAllowedHeight ? maxAllowedHeight / maxHeight : 1;
    return Math.min(scaleW, scaleH, 1); // 1을 넘지 않게(원본보다 키우지는 않음)
  }

  // "정메뉴 만들기" 전용 — 블록(오브젝트 레이어)마다 각각 독립된 메뉴판 그룹을 만들어서(항상
  // 미니멀 스타일 고정 — "정"석/고정이라는 의미), 하나로 합치지 않고 왼쪽부터 순서대로 나란히
  // (좌·중·우…) 배치함. 전부 합친 폭(또는 가장 큰 높이)이 캔버스 크기를 넘으면, 글자 크기를
  // 포함해 전체를 균등 축소해서 반드시 캔버스 안에 다 들어가도록 함(원래 크기보다 확대는 안 함).
  // 한 행(row, '~'로 나뉜 한 덩어리) 안의 블록들(칼럼, '/'로 나뉨)을 실제 그룹으로 만듦.
  // 기본 간격(16px)으로 먼저 만들어보고, maxAllowedWidth보다 좁으면(여백이 남으면) 이름-가격
  // 간격을 늘려서 그 폭까지 꽉 채움(insertStandardMenusToCanvas의 좌우 여백 채우기와 동일한 로직).
  // 열(칼럼) 하나 안에서 '~'로 나뉜 서브블록들을 세로로 쌓아 만듦. 기본 간격(16px)으로 먼저
  // 만들어보고, maxAllowedWidth(전체 열들의 폭 합)보다 좁으면 이름-가격 간격을 늘려서 그 열의
  // 폭을 넓힘(좌우 여백 채우기와 동일한 원리, 열 단위로 적용). 서브블록들은 전부 이 열의 왼쪽
  // 끝에 맞춰 정렬되고(originX:'left'), 열의 폭은 서브블록 중 가장 넓은 것 기준으로 정해짐.
  // "정메뉴 만들기"의 열(칼럼) 안에서 '~'로 쌓이는 서브블록들이 전부 같은 priceColumnX를 쓰도록,
  // 그 열에 들어갈 모든 서브블록의 품목명 중 가장 넓은 폭을 미리 재둠(buildMenuGroup의
  // forcedNameWidth로 전달됨). buildMenuGroup과 동일한 폰트/크기로 재야 정확히 맞으므로,
  // 정메뉴는 항상 미니멀 고정이라는 전제(파일 상단 설명 참고)에 맞춰 fontsForKind(null)과
  // itemFontSize=19(buildMenuGroup 안의 값과 반드시 같아야 함)를 그대로 씀.
  function measureNameWidth(sections, itemFont, itemFontSize){
    var w = 0;
    sections.forEach(function(section){
      section.items.forEach(function(item){
        var t = new fabric.IText(item.name, { fontFamily: itemFont, fontSize: itemFontSize });
        w = Math.max(w, t.width);
      });
    });
    return w;
  }

  function buildColumnStack(colSectionsList, gapPx){
    var fonts = fontsForKind(null); // 정메뉴는 항상 미니멀 고정
    var sharedNameWidth = 0;
    colSectionsList.forEach(function(sections){
      sharedNameWidth = Math.max(sharedNameWidth, measureNameWidth(sections, fonts.item, 19));
    });
    var groups = colSectionsList.map(function(sections){ return buildMenuGroup(sections, null, gapPx, sharedNameWidth); });
    var subGap = 24;
    var colWidth = groups.reduce(function(w, g){ return Math.max(w, g.width); }, 0);
    var colHeight = groups.reduce(function(h, g){ return h + g.height; }, 0) + subGap * (groups.length - 1);
    return { groups: groups, width: colWidth, height: colHeight, subGap: subGap, maxNameWidth: sharedNameWidth };
  }

  // "정메뉴 만들기" — 입력을 parseMenuColumns로 열(칼럼) 단위로 나눠서, 열들은 옆으로 나란히
  // (좌·중·우, '/'로 구분) 배치하고 전부 맨 위에서 시작함(top 정렬). 한 열 안에서 '~'로 나뉜
  // 서브블록들은 그 열 안에서만 세로로 쌓임 — 그래서 A열이 '~'로 아무리 길어져도 B열/C열은
  // 영향받지 않고 그대로 맨 위에서 옆으로 나란히 배치됨(밑배치 아님, 기존 옆배치 구조 유지).
  // 열들 전체 폭이 캔버스보다 좁으면 각 열의 이름-가격 간격을 넓혀 캔버스 폭까지 채우고, 마지막엔
  // 전체(가장 넓은 폭·가장 큰 높이)가 캔버스 안전영역을 넘지 않도록 필요시 글자 크기까지 통째로
  // 축소함(fitScaleForCanvas) — 그래서 열이 몇 개든, 서브블록이 몇 개든 항상 캔버스 안에 들어감.
  function insertStandardMenusToCanvas(rawText){
    var canvas = EP.canvas;
    if (!canvas) { alert('캔버스를 찾을 수 없어요.'); return null; }

    var grid = parseMenuColumns(rawText); // [[sectionsA1, sectionsA2, ...], [sectionsB1, ...], ...]
    if (!grid) return null;

    var DEFAULT_GAP = 16;
    var interColGap = 40;

    // 1차: 기본 간격으로 각 열을 만들어서 자연 폭·높이를 먼저 재봄
    var columns = grid.map(function(colSectionsList){ return buildColumnStack(colSectionsList, DEFAULT_GAP); });
    var naturalTotalWidth = columns.reduce(function(w, c){ return w + c.width; }, 0) + interColGap * (columns.length - 1);
    var naturalMaxHeight = columns.reduce(function(h, c){ return Math.max(h, c.height); }, 0);

    var bounds = getCanvasBounds(canvas);
    if (bounds) {
      // bounds가 이미 상단2·하단2·좌우0.5단위를 뺀 "정확한 목표 경계"이므로 추가 마진을 두지 않음.
      var maxAllowedWidth = bounds.width;
      var maxAllowedHeight = bounds.height;
      // 세로가 캔버스 높이를 넘으면(상하로 꽉 채우려면) 나중에 전체가 scaleH만큼 축소될 텐데,
      // 그 축소분을 미리 감안하지 않고 그냥 캔버스 폭에 맞춰 채우면 축소된 뒤엔 다시 좌우
      // 여백이 남게 됨 — 그래서 "축소되기 전" 목표 폭을 scaleH로 미리 나눠서 더 넉넉히 잡음.
      // (세로가 이미 다 들어가면 scaleH=1이라 기존과 동일하게 캔버스 폭 그대로가 목표가 됨)
      var scaleH = naturalMaxHeight > maxAllowedHeight ? (maxAllowedHeight / naturalMaxHeight) : 1;
      var targetWidthPreScale = maxAllowedWidth / scaleH;
      // 좌우에 여백이 남으면 이름-가격 간격을 늘려서 채우되, 열마다 "그 열의 가장 긴 품목명
      // 길이의 1배"를 넘어서까지 늘리진 않음(각 열 c.maxNameWidth 기준 — 열마다 품목명 길이가
      // 다르므로 상한도 열마다 다름). 상한에 걸려서 목표 폭까지 다 못 채우면 억지로 늘리지 않고
      // 그냥 좌우에 여백을 남김(축소는 아래 fitScaleForCanvas가 필요할 때만 함).
      if (naturalTotalWidth < targetWidthPreScale) {
        var n = columns.length;
        var contentSum = columns.reduce(function(s, c){ return s + (c.width - DEFAULT_GAP); }, 0);
        var rawTargetGap = Math.max((targetWidthPreScale - contentSum - interColGap * (n - 1)) / n, DEFAULT_GAP);
        var colNameWidthCaps = columns.map(function(c){ return c.maxNameWidth; });
        columns = grid.map(function(colSectionsList, i){
          var colGap = Math.max(DEFAULT_GAP, Math.min(rawTargetGap, colNameWidthCaps[i]));
          return buildColumnStack(colSectionsList, colGap);
        });
        naturalTotalWidth = columns.reduce(function(w, c){ return w + c.width; }, 0) + interColGap * (columns.length - 1);
        naturalMaxHeight = columns.reduce(function(h, c){ return Math.max(h, c.height); }, 0); // 간격은 높이에 영향 없지만 안전하게 재확인
      }
    }

    // 위에서 이미 축소분까지 감안해서 폭을 늘려뒀으므로, 여기서 계산되는 scale은 사실상 위의
    // scaleH와 같아지고(또는 애초에 축소가 필요 없었으면 1), 결과적으로 상하좌우 전부 여백 없이
    // 꽉 차게 됨.
    var scale = fitScaleForCanvas(canvas, naturalTotalWidth, naturalMaxHeight);

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    var totalWidthScaled = naturalTotalWidth * scale;
    var topY = centerY - (naturalMaxHeight * scale) / 2; // 가장 높은 열 기준으로 전체를 세로 중앙정렬
    var x = centerX - totalWidthScaled / 2;

    // 열마다 따로 세로 위치를 누적하면, 서로 다른 글자(예: "디저트" vs "디저트2")의 미세한 실제
    // 렌더링 높이 차이 때문에 같은 순번의 서브블록인데도 열마다 조금씩 다른 y에서 시작하는
    // 문제가 있었음(요청사항: 우측 하단정렬이 위와 안 맞음). 그래서 "같은 순번의 서브블록"을
    // 하나의 행으로 묶어 그 행에서 가장 큰 높이를 모든 열이 공통으로 쓰게 해서, 열이 몇 개든
    // 서브블록 순번이 같으면 항상 정확히 같은 y에서 시작하도록 정렬함.
    var maxSubCount = columns.reduce(function(m, c){ return Math.max(m, c.groups.length); }, 0);
    var rowHeights = [];
    for (var ri = 0; ri < maxSubCount; ri++) {
      var rh = 0;
      columns.forEach(function(c){ if (c.groups[ri]) rh = Math.max(rh, c.groups[ri].height); });
      rowHeights.push(rh);
    }
    var subGapUnscaled = columns.length ? columns[0].subGap : 24;

    var allGroups = [];
    columns.forEach(function(col){
      col.groups.forEach(function(g, ri){
        if (scale !== 1) g.set({ scaleX: scale, scaleY: scale });
        var rowTopUnscaled = 0;
        for (var k = 0; k < ri; k++) rowTopUnscaled += rowHeights[k] + subGapUnscaled;
        var subY = topY + rowTopUnscaled * scale;
        g.set({ left: x, top: subY, originX: 'left', originY: 'top' });
        allGroups.push(g);
        canvas.add(g);
      });
      x += col.width * scale + interColGap * scale;
    });

    if (EP.bringGuideToFront) EP.bringGuideToFront();
    if (allGroups.length > 1) {
      canvas.setActiveObject(new fabric.ActiveSelection(allGroups, { canvas: canvas }));
    } else if (allGroups.length === 1) {
      canvas.setActiveObject(allGroups[0]);
    }
    canvas.requestRenderAll();
    if (EP.refreshEmptyHint) EP.refreshEmptyHint();

    return allGroups;
  }

  applyMenuBtn.addEventListener('click', function(){
    var sections = parseMenuText(menuInputArea.value);
    if (!sections) { updatePreview(); return; }
    insertMenuToCanvas(sections, null);
    if (EP.pushHistory) EP.pushHistory();
    menuInputToolbar.classList.add('hidden');
  });

  if (applyStandardMenuBtn) {
    applyStandardMenuBtn.addEventListener('click', function(){
      var made = insertStandardMenusToCanvas(menuInputArea.value);
      if (!made) { updatePreview(); return; }
      if (EP.pushHistory) EP.pushHistory();
      menuInputToolbar.classList.add('hidden');
    });
  }

  var lastRandomMenuGroup = null;
  if (randomMenuBtn) {
    randomMenuBtn.addEventListener('click', function(){
      var sections = parseMenuText(menuInputArea.value);
      if (!sections) { updatePreview(); return; }
      var canvas = EP.canvas;
      if (canvas && lastRandomMenuGroup && canvas.getObjects().indexOf(lastRandomMenuGroup) !== -1) {
        canvas.remove(lastRandomMenuGroup);
      }
      var style = rollMenuStyle();
      lastRandomMenuGroup = insertMenuToCanvas(sections, style);
      if (EP.pushHistory) EP.pushHistory();
      // 입력창은 닫지 않음 — 계속 눌러서 다른 스타일로 재굴림할 수 있게 둠(닫고 싶으면 "✕ 닫기")
    });
  }
})();
