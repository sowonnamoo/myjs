/* ecopro3mobiletools.js — 모바일 상단바 "🔲 글씨 가리기" 옆 빠른 도구 아이콘들
   로딩 순서: ecopro3.js -> ... -> ecopro3eyedrop.js -> ecopro3mobiletools.js -> ecopro3text.js -> ...
   (스포이드 버튼(#mobileEyedropperBtn) 자체는 ecopro3eyedrop.js에서 PC 스포이드와 완전히
   같은 로직을 그대로 공유해서 처리하므로 이 파일에는 스포이드 관련 코드가 없음)

   새 기능을 만드는 게 아니라, PC 툴바/우측 속성 패널에 있던 기존 기능의 "모바일용
   입구"만 하나 더 뚫어주는 파일임:
     🗑 삭제        -> EP.deleteSelected() (PC #deleteBtn과 완전히 같은 함수를 그대로 호출)
     색상 적용      -> 텍스트든 모양이든 공통으로 쓰는 fill 속성. PC와 똑같은 CMYK 색상
                        선택 팝업(EP.initCmykPicker)을 그대로 재사용하되, 그 팝업 맨 아래에
                        "완료" 버튼을 하나 붙여서, 슬라이더를 만지는 동안은 미리보기만 되고
                        실제 오브젝트 색상은 "완료"를 눌러야 비로소 적용되게 함.
     레이어 앞/뒤   -> #layerFrontBtn / #layerBackBtn
     확대/축소      -> #zoomMenu 안의 배율 버튼들
*/
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  function isGuideObj(o){ return !!o && o.isGuide; }

  /* ============================================================
     1. 🗑 삭제 — PC와 완전히 같은 삭제 함수를 직접 호출함(버튼 disabled 상태 등
     화면에 보이지도 않는 PC 버튼의 상태에 기대지 않아서 더 확실하게 동작함)
  ============================================================ */
  var mobileDeleteBtn = document.getElementById('mobileDeleteBtn');
  if (mobileDeleteBtn) {
    mobileDeleteBtn.addEventListener('click', function(){
      var canvas = EP.canvas;
      if (!canvas) return;
      // 텍스트를 입력하던 중(커서가 깜빡이는 편집 상태)에 트래시를 누르면, 모바일에서는
      // 편집 종료(blur) 타이밍이 애매해서 선택 상태가 꼬일 수 있으므로 먼저 확실히
      // 편집을 종료시켜 캔버스가 최신 선택 상태를 정확히 인식하게 함
      var active = canvas.getActiveObject();
      if (active && active.isEditing && typeof active.exitEditing === 'function') {
        active.exitEditing();
      }
      if (EP.deleteSelected) EP.deleteSelected();
      canvas.requestRenderAll();
    });
  }

  /* ============================================================
     2. 색상 적용 (텍스트·모양 공통) — PC의 CMYK 색상 선택 팝업 구조를 그대로 재사용하고,
     그 팝업 맨 아래에 "완료" 버튼만 하나 덧붙여서 씀
  ============================================================ */
  var mobileColorInput = document.getElementById('mobileColorInput');
  if (mobileColorInput && EP.initCmykPicker) {
    EP.initCmykPicker(mobileColorInput); // 이 호출로 PC와 동일한 SV사각형/색상띠/CMYK슬라이더/hex입력 팝업이 만들어져 el._cmykPopover에 참조가 남음

    // 지금 선택된 오브젝트 중, 색을 적용할 "대상"을 찾음(묶음 선택이면 첫 번째 텍스트/모양 기준)
    function findColorTarget(){
      var obj = EP.canvas.getActiveObject();
      if (!obj || isGuideObj(obj)) return null;
      if (obj.type === 'activeSelection' || obj.type === 'group') {
        var children = obj.getObjects().filter(function(o){
          return !isGuideObj(o) && !(EP.isImageObject && EP.isImageObject(o));
        });
        return children.length ? children[0] : null;
      }
      if (EP.isImageObject && EP.isImageObject(obj)) return null; // 이미지는 채우기색이 의미 없음
      return obj;
    }

    // 실제로 색을 적용할 오브젝트 하나에 fill을 세팅(텍스트는 글자별 스타일 덮어쓰기도 같이 정리)
    function applyColorTo(obj, hex){
      if (!obj || isGuideObj(obj)) return;
      if (EP.isImageObject && EP.isImageObject(obj)) return;
      if (EP.isTextObject && EP.isTextObject(obj) && EP.clearPerCharStyleOverrides) {
        EP.clearPerCharStyleOverrides(obj, ['fill']);
      }
      obj.set('fill', hex);
    }

    // "완료" 버튼을 눌렀을 때: 지금 선택돼 있는 오브젝트(들)에 실제로 색을 적용
    function commitColor(){
      var obj = EP.canvas.getActiveObject();
      if (!obj || isGuideObj(obj)) return;
      var hex = mobileColorInput.value;
      if (obj.type === 'activeSelection' || obj.type === 'group') {
        obj.getObjects().forEach(function(o){ applyColorTo(o, hex); });
      } else {
        applyColorTo(obj, hex);
      }
      EP.canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    }

    // 색상칸(스와치)을 탭하는 "그 순간"(팝업이 열리기 직전, capture 단계)에 먼저 실행돼서
    // - 선택된 오브젝트가 없으면 팝업을 아예 못 열게 막고 안내 문구를 보여주고
    // - 있으면 팝업이 "지금 오브젝트의 현재 색"에서부터 시작하도록 값을 맞춰둠
    mobileColorInput.addEventListener('click', function(e){
      var target = findColorTarget();
      if (!target) {
        e.stopPropagation(); // 내부 팝업 열기 로직(swatch의 버블 클릭 리스너)까지 도달하지 못하게 막음
        alert('먼저 색을 바꾸고 싶은 텍스트나 모양을 선택해주세요.');
        return;
      }
      var hex = (EP.toHex && EP.toHex(target.fill)) || '#3498db';
      mobileColorInput.value = hex; // 팝업의 슬라이더/스와치를 현재 색 기준으로 맞춰둠(적용은 아직 안 함)
    }, true);

    // 팝업 맨 아래에 "완료" 버튼을 한 번만 붙여줌
    var popover = mobileColorInput._cmykPopover;
    if (popover) {
      var confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'cmyk-confirm-btn';
      confirmBtn.textContent = '✓ 완료 (색상 적용)';
      popover.appendChild(confirmBtn);
      confirmBtn.addEventListener('click', function(e){
        e.stopPropagation();
        commitColor();
        popover.classList.add('hidden'); // 적용 후 팝업 닫기
      });
    }
  }

  /* ============================================================
     3. 레이어 맨 앞으로 / 맨 뒤로 — PC 우측 패널의 실제 버튼을 그대로 클릭
  ============================================================ */
  var mobileLayerFrontBtn = document.getElementById('mobileLayerFrontBtn');
  var mobileLayerBackBtn = document.getElementById('mobileLayerBackBtn');
  if (mobileLayerFrontBtn) {
    mobileLayerFrontBtn.addEventListener('click', function(){
      var layerFrontBtn = document.getElementById('layerFrontBtn');
      if (layerFrontBtn) layerFrontBtn.click();
    });
  }
  if (mobileLayerBackBtn) {
    mobileLayerBackBtn.addEventListener('click', function(){
      var layerBackBtn = document.getElementById('layerBackBtn');
      if (layerBackBtn) layerBackBtn.click();
    });
  }

  /* ============================================================
     4. 이미지 확대 게이지 — 하단 "이미지 불러오기" 옆 슬라이더로 화면 배율을 바로 조절함.
     PC의 setZoomLevel을 EP.setZoomLevel로 그대로 재사용(새 줌 로직을 만들지 않음).
     Ctrl+휠 등 다른 경로로 배율이 바뀌는 경우까지 대비해서, ecopro3.js가 배율을 바꿀 때마다
     불러주는 EP.onZoomChanged 콜백으로 게이지 값을 계속 동기화함.
  ============================================================ */
  var mobileZoomGauge = document.getElementById('mobileZoomGauge');
  var mobileZoomGaugeLabel = document.getElementById('mobileZoomGaugeLabel');
  if (mobileZoomGauge && EP.setZoomLevel) {
    mobileZoomGauge.addEventListener('input', function(){
      EP.setZoomLevel(parseFloat(mobileZoomGauge.value) / 100);
    });
    EP.onZoomChanged = function(zoom){
      var pct = Math.round(zoom * 100);
      mobileZoomGauge.value = pct;
      if (mobileZoomGaugeLabel) mobileZoomGaugeLabel.textContent = pct + '%';
    };
    if (EP.getZoomLevel) EP.onZoomChanged(EP.getZoomLevel()); // 처음 로드 시 현재 배율(보통 100%)로 맞춰둠
  }
  // 게이지 옆 "100%" 글자를 버튼으로 만들어서, 누르면 바로 100%(원래 크기)로 되돌아가게 함
  if (mobileZoomGaugeLabel && EP.setZoomLevel) {
    mobileZoomGaugeLabel.addEventListener('click', function(){
      EP.setZoomLevel(1);
    });
  }

  /* ============================================================
     4a-2. ⛶ 전체화면 토글 — 브라우저 표준 Fullscreen API를 그대로 씀. 켜면 주소창·브라우저
     하단 메뉴까지 다 가려지고 화면을 더 넓게 쓸 수 있음(기기/브라우저별로 API 이름이
     조금씩 달라서 표준명 + 구형 접두사(webkit)까지 순서대로 시도함). 아이폰 사파리처럼
     이 API를 아예 지원하지 않는 브라우저에서는 버튼을 그냥 숨겨서 헛눌림을 막음.
  ============================================================ */
  var mobileFullscreenBtn = document.getElementById('mobileFullscreenBtn');
  if (mobileFullscreenBtn) {
    function fsRequest(el){
      var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
      if (fn) fn.call(el);
    }
    function fsExit(){
      var fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
      if (fn) fn.call(document);
    }
    function fsElement(){
      return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
    }
    var fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen ||
      document.documentElement.webkitRequestFullScreen || document.documentElement.msRequestFullscreen);
    if (!fsSupported) {
      mobileFullscreenBtn.style.display = 'none'; // 아이폰 사파리 등 미지원 브라우저에서는 버튼 자체를 숨김
    } else {
      mobileFullscreenBtn.addEventListener('click', function(){
        if (fsElement()) fsExit();
        else fsRequest(document.documentElement);
      });
      ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function(evtName){
        document.addEventListener(evtName, function(){
          mobileFullscreenBtn.classList.toggle('active', !!fsElement());
        });
      });
    }
  }

  /* ============================================================
     4b. ✋ 손바닥(화면 이동) 도구 — 켜두면 오브젝트를 선택/이동하는 대신, 캔버스 아무 곳이나
     손가락으로 끌어서 화면(스크롤 위치)만 움직임. 확대했을 때 유용하도록 만든 도구로,
     포토샵의 스페이스바 이동 도구와 같은 역할을 함(다만 모바일엔 스페이스바가 없으므로
     "켜고/끄는" 토글 버튼 형태로 만듦). 새 오브젝트 조작 기능이 아니라 순수하게
     #canvasWrap의 스크롤 위치(scrollLeft/scrollTop)만 바꾸는 것이라 기존 캔버스 데이터에는
     전혀 영향이 없음.
  ============================================================ */
  var mobilePanBtn = document.getElementById('mobilePanBtn');
  if (mobilePanBtn && EP.canvas) {
    var canvasWrapEl = document.getElementById('canvasWrap');
    var panActive = false;
    var panDragging = false;
    var panStartX = 0, panStartY = 0, panStartScrollLeft = 0, panStartScrollTop = 0;

    function pointFromEvt(e){
      if (e && e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e ? e.clientX : 0, y: e ? e.clientY : 0 };
    }

    function setPanMode(on){
      panActive = on;
      panDragging = false;
      mobilePanBtn.classList.toggle('active', on);
      var canvas = EP.canvas;
      if (on) {
        // 다른 도구(펜/텍스트/이미지 도구/스포이드)가 무장돼 있으면 기존 "선택" 도구의
        // 리셋 로직을 그대로 재사용해서 확실히 정리해둠(새로 만드는 게 아니라 재사용)
        if (EP.exitImageToolModes) EP.exitImageToolModes();
        if (EP.exitEyedropperModes) EP.exitEyedropperModes();
        var selectToolBtn = document.getElementById('selectToolBtn');
        if (selectToolBtn) selectToolBtn.click();
        canvas.discardActiveObject();
        canvas.selection = false;   // 드래그해도 선택 사각형이 안 생기게
        canvas.skipTargetFind = true; // 드래그해도 오브젝트가 안 딸려 움직이게
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
      } else {
        canvas.selection = true;
        canvas.skipTargetFind = false;
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
      }
      canvas.requestRenderAll();
    }

    mobilePanBtn.addEventListener('click', function(){
      setPanMode(!panActive);
    });

    EP.canvas.on('mouse:down', function(opt){
      if (!panActive) return;
      panDragging = true;
      var p = pointFromEvt(opt.e);
      panStartX = p.x; panStartY = p.y;
      panStartScrollLeft = canvasWrapEl ? canvasWrapEl.scrollLeft : 0;
      panStartScrollTop = canvasWrapEl ? canvasWrapEl.scrollTop : 0;
      EP.canvas.defaultCursor = 'grabbing';
      if (EP.canvas.setCursor) EP.canvas.setCursor('grabbing');
    });
    EP.canvas.on('mouse:move', function(opt){
      if (!panActive || !panDragging || !canvasWrapEl) return;
      var p = pointFromEvt(opt.e);
      canvasWrapEl.scrollLeft = panStartScrollLeft - (p.x - panStartX);
      canvasWrapEl.scrollTop = panStartScrollTop - (p.y - panStartY);
      if (opt.e && opt.e.cancelable) opt.e.preventDefault(); // 브라우저 기본 페이지 스크롤과 겹치지 않게
    });
    EP.canvas.on('mouse:up', function(){
      if (!panActive) return;
      panDragging = false;
      EP.canvas.defaultCursor = 'grab';
      if (EP.canvas.setCursor) EP.canvas.setCursor('grab');
    });

    // 다른 도구가 무장될 때(텍스트 추가/스포이드 등) 손바닥 도구를 확실히 꺼줄 수 있게 노출
    EP.exitPanMode = function(){ if (panActive) setPanMode(false); };
  }

  /* ============================================================
     4c. 👁 화면 정리(미리보기) 토글 — 캔버스 안 디자인만 남기고 상단바·하단 플로팅바·열려있던
     팝업 등 나머지 UI를 전부 숨김/복원함. 단순히 <body>에 클래스 하나 붙였다 뗐다 하는
     방식이라 별도 상태 관리가 필요 없음(실제 숨김 처리는 ecopro3.css의
     body.mobile-focus-mode 규칙이 담당). 눈 아이콘 자기 자신은 CSS에서 예외 처리해뒀기
     때문에 계속 눌러서 다시 원래대로 돌릴 수 있음.
  ============================================================ */
  var mobileFocusToggleBtn = document.getElementById('mobileFocusToggleBtn');
  if (mobileFocusToggleBtn) {
    // 눈 아이콘을 처음(딱 한 번만) 켤 때 화면 아래 중간쯤에 짧게 안내 토스트를 보여줌.
    // localStorage에 한 번 봤다는 표시를 남겨서, 이후로는(새로고침해도) 다시 뜨지 않음
    // (텍스트 도구 처음 안내 토스트와 같은 방식).
    var FOCUS_HINT_KEY = 'ecopro3_focus_mode_hint_seen_v1';
    function showFocusHintOnce(){
      try {
        if (localStorage.getItem(FOCUS_HINT_KEY)) return;
        localStorage.setItem(FOCUS_HINT_KEY, '1');
      } catch (err) {
        // 시크릿 모드 등으로 localStorage를 못 쓰는 환경이면 그냥 매번 안내해도 무방하므로 조용히 통과
      }
      var toast = document.createElement('div');
      toast.className = 'mobile-focus-hint-toast';
      toast.textContent = '버튼위치를 외우신 경우 쾌적한 작업이 가능합니다.';
      document.body.appendChild(toast);
      requestAnimationFrame(function(){ toast.classList.add('show'); });
      setTimeout(function(){
        toast.classList.remove('show');
        setTimeout(function(){ toast.remove(); }, 300);
      }, 2600);
    }

    mobileFocusToggleBtn.addEventListener('click', function(){
      var on = document.body.classList.toggle('mobile-focus-mode');
      mobileFocusToggleBtn.classList.toggle('active', on);
      if (on) showFocusHintOnce();
    });
  }

  /* ============================================================
     5. ⧉ 복제 — PC 우측 패널의 실제 복제 버튼(#duplicateBtn)을 그대로 클릭
  ============================================================ */
  var mobileDuplicateBtn = document.getElementById('mobileDuplicateBtn');
  if (mobileDuplicateBtn) {
    mobileDuplicateBtn.addEventListener('click', function(){
      var duplicateBtn = document.getElementById('duplicateBtn');
      if (duplicateBtn) duplicateBtn.click();
    });
  }

  /* ============================================================
     6. 🔒 잠금 / 🔓 잠금 해제 — PC 우클릭 메뉴의 "잠금"/"잠금 해제"(EP.lockImage/EP.unlockImage)를
     그대로 재사용함. 새로 만든 기능이 아니라 모바일에서 바로 누를 수 있는 입구만 하나 더 뚫은 것.
     - 잠기지 않은 오브젝트가 선택된 상태에서 누르면: 잠금(선택 해제되고, 움직이거나 지워지지 않음)
     - 잠긴 오브젝트를 다시 만지고 싶으면: 그 오브젝트를 길게(0.5초) 눌러서 선택한 뒤(PC의 롱프레스
       선택과 동일한 기존 로직 재사용) 이 버튼을 다시 누르면 잠금 해제됨
     아이콘은 지금 선택된 게 잠긴 오브젝트인지에 따라 🔒 ↔ 🔓로 자동으로 바뀜.
  ============================================================ */
  var mobileLockBtn = document.getElementById('mobileLockBtn');
  if (mobileLockBtn && EP.canvas) {
    function isGuideObj2(o){ return !!o && o.isGuide; }

    function syncLockBtnIcon(){
      var obj = EP.canvas.getActiveObject();
      mobileLockBtn.textContent = (obj && obj.imageLocked) ? '🔓' : '🔒';
    }
    EP.canvas.on('selection:created', syncLockBtnIcon);
    EP.canvas.on('selection:updated', syncLockBtnIcon);
    EP.canvas.on('selection:cleared', syncLockBtnIcon);

    mobileLockBtn.addEventListener('click', function(){
      var obj = EP.canvas.getActiveObject();
      if (!obj || isGuideObj2(obj)) return;
      if (obj.imageLocked) {
        if (EP.unlockImage) EP.unlockImage(obj);
      } else {
        if (EP.lockImage) EP.lockImage(obj);
      }
      syncLockBtnIcon();
    });
  }
  /* ============================================================
     7. ↶ 실행 취소 / ↷ 다시 실행 — PC 상단 실제 버튼(#undoBtn/#redoBtn)을 그대로 클릭
  ============================================================ */
  var mobileUndoBtn = document.getElementById('mobileUndoBtn');
  if (mobileUndoBtn) {
    mobileUndoBtn.addEventListener('click', function(){
      var undoBtn = document.getElementById('undoBtn');
      if (undoBtn) undoBtn.click();
    });
  }
  var mobileRedoBtn = document.getElementById('mobileRedoBtn');
  if (mobileRedoBtn) {
    mobileRedoBtn.addEventListener('click', function(){
      var redoBtn = document.getElementById('redoBtn');
      if (redoBtn) redoBtn.click();
    });
  }
})();
