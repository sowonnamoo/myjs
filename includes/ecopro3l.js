/* ecopro3l.js — 주사위(랜덤 필터 뽑기) 로직
   반드시 script 태그 맨 마지막에 로드되어야 합니다 (다른 모든 필터가 등록을 마친 뒤 레지스트리를 읽음).
   새 필터를 추가해도 이 파일은 건드릴 필요가 없습니다 — EP.registerFilter()로 등록만 하면
   자동으로 뽑기 후보에 포함됩니다 (includeInRandom:false 로 등록한 것만 제외됨). */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  // 필터마다 "끄기" 버튼 id가 조금씩 달라서(예: gradient->qaGradOffBtn, doubleOutline->qaDblOffBtn)
  // 여기 한 곳에 매핑해둡니다. 새 필터 추가 시 여기에 한 줄만 추가하면 재클릭(전체 초기화)에도 포함됩니다.
  var OFF_BTN = {
    shadow:'qaShadowOffBtn', glow:'qaGlowOffBtn', light:'qaLightOffBtn', gradient:'qaGradOffBtn',
    emboss:'qaEmbossOffBtn', outline:'qaOutlineOffBtn', doubleOutline:'qaDblOffBtn', glitch:'qaGlitchOffBtn',
    tear:'qaTearOffBtn', melt:'qaMeltOffBtn', speed:'qaSpeedOffBtn', reflection:'qaReflectionOffBtn', crack:'qaCrackOffBtn', tile:'qaTileOffBtn',
    footprint:'qaFootprintOffBtn', animal:'qaAnimalOffBtn', seafood:'qaSeafoodOffBtn', fruitveg:'qaFruitVegOffBtn', heart:'qaHeartOffBtn', coffee:'qaCoffeeOffBtn', sports:'qaSportsOffBtn', club:'qaClubOffBtn', snow:'qaSnowOffBtn', rain:'qaRainOffBtn', splash:'qaSplashOffBtn', threeD:'qa3DOffBtn',
    metal:'qaMetalOffBtn', popart:'qaPopartOffBtn', inktrap:'qaInktrapOffBtn', leafvine:'qaLeafvineOffBtn',
    sakura:'qaSakuraOffBtn', fire:'qaFireOffBtn', randomTypo:'qaRandomTypoOffBtn', circular:'qaCircularOffBtn',
    vertical:'qaVerticalOffBtn', postal:'qaPostalOffBtn', puffy:'qaPuffyOffBtn', vine:'qaVineOffBtn', roll:'qaRollOffBtn',
    perspective:'qaPerspectiveOffBtn', curve:'qaCurveOffBtn', wave:'qaWaveOffBtn', tired:'qaTiredOffBtn',
    jump:'qaJumpOffBtn', pulse:'qaPulseOffBtn', sway:'qaSwayOffBtn', waddle:'qaWaddleOffBtn', popcorn:'qaPopcornOffBtn', hiccup:'qaHiccupOffBtn', breathe:'qaBreatheOffBtn', flicker:'qaFlickerOffBtn', chatter:'qaChatterOffBtn', walk:'qaWalkOffBtn',
    spiral:'qaSpiralOffBtn', magazine:'qaMagazineOffBtn', puzzle:'qaPuzzleOffBtn', sky:'qaSkyOffBtn', train:'qaTrainOffBtn',
    shy:'qaShyOffBtn', chalk:'qaChalkOffBtn', grass:'qaGrassOffBtn', bigbang:'qaBigbangOffBtn', event:'qaEventOffBtn', golf:'qaGolfOffBtn', christmas:'qaChristmasOffBtn', autumn:'qaAutumnOffBtn',
    space:'qaSpaceOffBtn', doodle:'qaDoodleOffBtn', butterfly:'qaButterflyOffBtn', soapbubble:'qaSoapbubbleOffBtn', lightning:'qaLightningOffBtn', halloween:'qaHalloweenOffBtn', musicnote:'qaMusicnoteOffBtn', gem:'qaGemOffBtn', tropical:'qaTropicalOffBtn', candy:'qaCandyOffBtn',
    bg:'qaBgOffBtn', bubble:'qaBubbleOffBtn', zebra:'qaZebraOffBtn', tote:'qaToteOffBtn'
  };

  var rollState = { ids: [], index: 0 };

  function shuffleArr(arr){
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 표(표 그룹 전체든 편집모드 중 셀 선택이든) 안의 텍스트에는, 텍스트 전용(비공통) 필터 중
  // 이 13개만 후보로 허용함 — 나머지(원형글자/세로쓰기/이중테두리/글리치 외 다수)는 표 셀 안에서
  // 삐져나가거나 안 어울려서 제외. 공통필터(그림자/외부광선/그라디언트/엠보스/테두리/배경)는 이 제한과 무관하게 그대로 허용됨.
  var TABLE_TEXT_FILTER_WHITELIST = [
    'puzzle', 'sakura', 'grass', 'footprint', 'animal', 'seafood', 'fruitveg', 'heart', 'coffee', 'sports', 'club', 'rain', 'splash', 'glitch', 'leafvine', 'tile',
    'randomTypo', 'snow', 'magazine', 'bigbang', 'shy', 'popart'
  ];

  // 그룹(예: 'layout')당 최대 1개만 뽑히도록 하면서 목록에서 count개 채워 담기
  function drawFrom(list, count, chosen, usedGroups, usedIds){
    var shuffled = shuffleArr(list);
    for (var i = 0; i < shuffled.length && count > 0; i++) {
      var f = shuffled[i];
      if (usedIds[f.id]) continue;
      if (f.group && usedGroups[f.group]) continue;
      chosen.push(f);
      usedIds[f.id] = true;
      if (f.group) usedGroups[f.group] = true;
      count--;
    }
  }

  // 특정 필터를 "몇 배 더 자주 뽑히게" 하고 싶을 때 쓰는 가중치. randomWeight:3이면 풀 안에
  // 사본을 3개 넣어서 뽑힐 확률을 3배로 높임(그래도 실제로 같은 필터가 한 콤보에 중복으로
  // 뽑히진 않음 — drawFrom이 이미 뽑힌 id는 건너뛰기 때문).
  function applyRandomWeights(list){
    var out = [];
    list.forEach(function(f){
      var w = f.randomWeight || 1;
      for (var i = 0; i < w; i++) out.push(f);
    });
    return out;
  }

  // types: ['text'] | ['shape'] | ['text','shape'] — 표처럼 텍스트와 도형(셀 박스)이 섞여있으면
  // 텍스트 전용 필터 + 공통(텍스트/도형 겸용) 필터를 함께 후보 풀에 넣어서 뽑음
  // isTable: true면 텍스트 전용 필터는 TABLE_TEXT_FILTER_WHITELIST에 있는 것만 후보로 남김.
  function pickCombo(types, isTable){
    var pool = EP.filterRegistry.filter(function(f){
      if (f.includeInRandom === false || typeof f.randomize !== 'function' || !f.appliesTo) return false;
      if (isTable && !f.commonEffect && TABLE_TEXT_FILTER_WHITELIST.indexOf(f.id) === -1) return false;
      return f.appliesTo.some(function(t){ return types.indexOf(t) !== -1; });
    });
    var specificPool = applyRandomWeights(pool.filter(function(f){ return !f.commonEffect; }));
    var commonPool = pool.filter(function(f){ return f.commonEffect; });

    // 도형만 있고(표 셀 박스 등) 텍스트 전용 필터가 뽑힐 게 없으면(specificPool 비어있음)
    // 공통 필터 쪽에서 좀 더 넉넉히 뽑아 밋밋해지지 않게 함
    var isPureText = types.indexOf('text') !== -1 && types.indexOf('shape') === -1; // 도형이 안 섞인 순수 텍스트 뽑기
    var specificCount = specificPool.length ? 1 + Math.floor(Math.random() * 3) : 0; // 1~3
    var commonCount;
    if (specificPool.length) {
      // 텍스트만 있을 땐 공통필터가 너무 많이 겹치면 지저분해 보여서 0~1개로 더 절제되게 뽑음
      commonCount = isPureText ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3); // 텍스트: 0~1, 그 외(도형 등): 0~2
    } else {
      commonCount = 1 + Math.floor(Math.random() * 2); // 1~2
    }

    var chosen = [], usedGroups = {}, usedIds = {};
    drawFrom(specificPool, specificCount, chosen, usedGroups, usedIds);
    drawFrom(commonPool, commonCount, chosen, usedGroups, usedIds);

    if (!chosen.length && pool.length) chosen.push(pool[Math.floor(Math.random() * pool.length)]);

    // 표 대상이면 테두리(outline) 필터는 뽑기 결과와 상관없이 항상 포함시킴(칸 구분이 잘 보이도록)
    if (isTable) {
      var outlineDef = pool.filter(function(f){ return f.id === 'outline'; })[0];
      if (outlineDef && !usedIds.outline) {
        chosen.push(outlineDef);
        usedIds.outline = true;
      }
    } else if (!usedIds.outline && Math.random() < 0.05) {
      // 표가 아닌 일반 뽑기에서는, 위 추첨에서 테두리가 안 뽑혔더라도 별도로 5% 확률을
      // 한 번 더 굴려서 추가함(요청: "J의 테두리만 등장확률 5%확률만 더 키워줘") — 다른
      // 공통필터의 확률에는 전혀 영향 안 주고, 테두리에게만 순수하게 +5%p를 더해주는 방식.
      var outlineDef2 = pool.filter(function(f){ return f.id === 'outline'; })[0];
      if (outlineDef2) {
        chosen.push(outlineDef2);
        usedIds.outline = true;
      }
    }

    return chosen;
  }

  function resetAllFilters(){
    (EP.filterRegistry || []).forEach(function(def){
      var btnId = OFF_BTN[def.id];
      if (!btnId) return;
      var btn = document.getElementById(btnId);
      if (btn) btn.click();
    });
  }

  function updateRollNavUI(){
    var nav = document.getElementById('qaRollNav');
    var counter = document.getElementById('qaRollCounter');
    if (!nav || !counter) return;
    if (rollState.ids.length <= 0) {
      nav.classList.add('hidden');
      return;
    }
    nav.classList.remove('hidden');
    counter.textContent = (rollState.index + 1) + '/' + rollState.ids.length;
  }

  function showCurrentRollFilter(){
    if (!rollState.ids.length) return;
    var id = rollState.ids[rollState.index];
    if (EP.setActiveFilterMenu) EP.setActiveFilterMenu(id);
    if (EP.qaFilterSelect) EP.qaFilterSelect.value = id;
    updateRollNavUI();
  }

  function rollDice(target){
    if (!target || !EP.qaTargetsFromTarget) return;
    var boxes = EP.qaTargetsFromTarget(target);
    if (!boxes.length) return;
    EP.qaTargets = boxes;
    // 모바일에서 편집 상태가 남아있으면 필터가 안 그려지므로(텍스트 오브젝트는 편집 중엔 모든
    // 커스텀 필터 렌더를 건너뜀) 확실히 빠져나오게 함
    boxes.forEach(function(o){ if (o.isEditing) o.exitEditing(); });

    // 1) 재클릭 시 완전 초기화(요청사항): 등록된 모든 필터를 끔
    resetAllFilters();

    // 2) 선택 안에 텍스트/도형이 각각 있는지 확인 (표는 셀 텍스트+셀 박스가 함께 들어있음)
    //    -> 텍스트가 있으면 text 필터 풀도, 도형(표 셀 박스 포함)이 있으면 shape 필터 풀도 함께 사용
    var types = [];
    if (boxes.some(EP.isTextObject)) types.push('text');
    if (boxes.some(EP.isShapeObject)) types.push('shape');
    if (!types.length) return;

    // 3) 새로운 1~4개 조합을 뽑아서 각자의 randomize()로 게이지까지 랜덤 적용
    //    (공통 필터는 같은 def.randomize() 하나로 텍스트/도형 대상 모두에게 동시에 적용됨)
    //    표(표 그룹 전체든, 편집모드 중 셀 여러 개 선택이든)면 layout 그룹 필터는
    //    셀 밖으로 삐져나갈 수 있어 후보에서 제외됨
    var isTable = boxes.some(function(o){ return o && (o.isTableCell || o.isTableCellText); });
    var combo = pickCombo(types, isTable);
    combo.forEach(function(def){ try { def.randomize(); } catch (e) { console.error('randomize error:', def.id, e); } });

    // 텍스트에는 필터와 함께 폰트도 매번 랜덤으로 하나 골라(오브젝트 전체에 똑같이) 적용함.
    // 단, "랜덤 타이포"(글자마다 각자 다른 폰트를 쓰는 필터)가 이번에 뽑혔다면, 그건 이미
    // 자기 나름대로 글자마다 다른 폰트를 쓰고 있으니 여기서 통일된 폰트로 덮어쓰지 않고 그대로 둠.
    var pickedRandomTypo = combo.some(function(def){ return def.id === 'randomTypo'; });
    if (!pickedRandomTypo) {
      var fontSelectEl = document.getElementById('fontFamilySelect');
      var fontOptions = fontSelectEl ? Array.prototype.map.call(fontSelectEl.options, function(o){ return o.value; }) : [];
      var textBoxes = boxes.filter(EP.isTextObject);
      if (fontOptions.length && textBoxes.length) {
        var randomFont = fontOptions[Math.floor(Math.random() * fontOptions.length)];
        textBoxes.forEach(function(o){
          if (EP.clearPerCharStyleOverrides) EP.clearPerCharStyleOverrides(o, ['fontFamily', 'fontWeight']);
          o.set('fontFamily', randomFont);
        });
        if (EP.forceFontReloadRedraw) EP.forceFontReloadRedraw(textBoxes, randomFont);
      }
    }

    if (EP.canvas) EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();

    // 4) 패널에 순환 표시 준비 (◀ 이전 · 숫자 · 다음 ▶)
    rollState.ids = combo.map(function(f){ return f.id; });
    rollState.index = 0;
    // 이 오브젝트 자체에도 조합을 저장해둠 — 나중에 다른 오브젝트를 롤한 뒤(rollState가
    // 그쪽으로 덮어써진 뒤) 이 오브젝트를 다시 선택해도, EP.refreshTextRollNav로 이 오브젝트
    // 고유의 목록을 정확히 복원할 수 있게 하기 위함(안 이러면 "1"번이 안 뜨고 2·3번으로
    // 넘어가야만 그제서야 맞는 내용이 보이는 문제가 생김).
    target._lastRollComboIds = rollState.ids.slice();
    if (EP.applyFilteredFilterDropdown) EP.applyFilteredFilterDropdown(target); // 팝오버가 이미 열려있었다면(재굴림) 드롭다운도 새 조합으로 갱신
    showCurrentRollFilter();

    // 토트무늬가 뽑혀도 드롭다운만 그쪽으로 맞춰두고, 상세조정 패널 자체는 열지 않음 —
    // "상세조정하기를 직접 누르지 않는 한 절대 임의로 펼쳐지면 안 된다"는 원칙(요청)이라,
    // 어떤 필터가 뽑히든 이 규칙에 예외를 두지 않음.
    if (rollState.ids.indexOf('tote') !== -1 && EP.setActiveFilterMenu && EP.qaFilterSelect) {
      EP.qaFilterSelect.value = 'tote';
      EP.setActiveFilterMenu('tote');
    }
  }

  // 이미 필터가 적용돼있는 텍스트를 선택만 했을 때(주사위를 새로 굴리지 않고) 상세조정하기를
  // 펼치면, 그 오브젝트 고유의 필터 목록(◀1/N▶)과 "1번" 내용이 곧바로 정확히 표시되도록
  // rollState를 다시 채워줌. target에 저장해둔 게 없으면(예: 필터가 하나도 없는 오브젝트)
  // 아무것도 안 하고 false를 반환함.
  EP.refreshTextRollNav = function(target){
    if (!target || !target._lastRollComboIds || !target._lastRollComboIds.length) return false;
    rollState.ids = target._lastRollComboIds.slice();
    rollState.index = 0;
    showCurrentRollFilter();
    return true;
  };

  document.getElementById('qaDiceBtn').addEventListener('click', function(){
    var active = EP.canvas && EP.canvas.getActiveObject();
    if (!active) return;
    rollDice(active);
  });
  document.getElementById('qaRollPrevBtn').addEventListener('click', function(){
    if (!rollState.ids.length) return;
    rollState.index = (rollState.index - 1 + rollState.ids.length) % rollState.ids.length;
    showCurrentRollFilter();
  });
  document.getElementById('qaRollNextBtn').addEventListener('click', function(){
    if (!rollState.ids.length) return;
    rollState.index = (rollState.index + 1) % rollState.ids.length;
    showCurrentRollFilter();
  });

  EP.rollDice = rollDice;

  /* ============================================================
     화면 상단 "🎲 전체 랜덤 적용" 버튼
     — 캔버스 위 잠금(imageLocked) 안 된 모든 텍스트·모양 오브젝트를 하나씩 순서대로 훑으면서,
       텍스트는 텍스트용 랜덤필터(rollDice), 모양은 모양용 랜덤필터(rollShapeDice)를 각각
       자동으로 적용함. 오브젝트를 하나씩 잠깐 선택했다가(선택 테두리가 보임) 적용되면 바로
       선택을 풀고 다음으로 넘어가는 방식이라, 눈으로 진행 상황을 볼 수 있음.
       P/M버튼과 달리 상세조절(게이지) 팝업은 절대 띄우지 않음 — 오브젝트를 개별로 따로
       선택했을 때(P/M 주사위를 직접 눌렀을 때)만 그 팝업이 뜨는 기존 동작은 그대로 유지됨.
  ============================================================ */
  var rollAllBtn = document.getElementById('rollAllBtn');
  if (rollAllBtn) {
    rollAllBtn.addEventListener('click', function(){
      if (rollAllBtn.disabled || !EP.canvas) return;
      var canvas = EP.canvas;
      var qaPopoverEl = document.getElementById('qaPopover');
      var qaMPopoverEl = document.getElementById('qaMPopover');

      var objs = canvas.getObjects().filter(function(o){
        return o && !o.isGuide && !o.imageLocked && !o.isExcelCellText &&
          (EP.isTextObject(o) || EP.isShapeObject(o) || o.isLogoGroup);
      });
      if (!objs.length) {
        alert('텍스트나 모양을 입력해 주세요.');
        return;
      }

      // 이 버튼으로는 상세조절 팝업이 절대 안 뜨게, 혹시 열려있던 게 있으면 미리 닫아둠
      if (qaPopoverEl) qaPopoverEl.classList.add('hidden');
      if (qaMPopoverEl) qaMPopoverEl.classList.add('hidden');

      // 배치가 진행되는 동안은 캔버스 선택/클릭을 잠가서(다른 도구들과 동일한 "모드" 방식),
      // 사용자가 중간에 다른 오브젝트를 클릭해 진행 중인 순서와 상태가 서로 꼬이지 않게 함.
      // 이래야 배치가 끝난 뒤 개별 오브젝트를 눌렀을 때 상세조정하기 버튼이 항상 깨끗하게 뜸.
      var prevSelection = canvas.selection, prevSkipTargetFind = canvas.skipTargetFind;
      canvas.discardActiveObject();
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.requestRenderAll();

      // 배치 중엔 canvas.setActiveObject()를 코드로 계속 호출하는데(오브젝트가 잠깐 선택된 채로
      // 보이게 하려고), 이게 selection:created/updated 이벤트를 그대로 발생시킴. 이미 필터가
      // 걸려있는 오브젝트(예: 재클릭해서 다시 돌리는 경우 이전 결과가 남아있는 오브젝트)를
      // 건드리는 순간 "상세조정하기 자동 열기" 로직이 반응해서 팝업이 튀어나오던 게 진짜 원인
      // -> 배치가 진행되는 동안엔 이 플래그로 그 자동 열기를 확실히 막아둠.
      EP.rollAllInProgress = true;

      rollAllBtn.disabled = true;
      var originalLabel = rollAllBtn.textContent;
      var idx = 0;

      function step(){
        if (idx >= objs.length) {
          canvas.discardActiveObject();
          canvas.selection = prevSelection;
          canvas.skipTargetFind = prevSkipTargetFind;
          EP.rollAllInProgress = false;
          canvas.requestRenderAll();
          rollAllBtn.disabled = false;
          rollAllBtn.textContent = originalLabel;
          return;
        }
        var o = objs[idx];
        rollAllBtn.textContent = '적용 중... (' + (idx + 1) + '/' + objs.length + ')';
        canvas.setActiveObject(o); // 지금 처리 중인 오브젝트가 잠깐 선택된 채로 보임(클릭은 잠겨있어 방해 안 됨)
        canvas.requestRenderAll();
        setTimeout(function(){
          if (EP.isTextObject(o)) { if (EP.rollDice) EP.rollDice(o); }
          else if (EP.isShapeObject(o)) { if (EP.rollShapeDice) EP.rollShapeDice(o); }
          else if (o.isLogoGroup) { if (EP.rerollLogoGroup) EP.rerollLogoGroup(o); }
          canvas.requestRenderAll();
          setTimeout(function(){
            canvas.discardActiveObject(); // 적용이 끝나면 선택을 풀고 다음 오브젝트로
            canvas.requestRenderAll();
            idx++;
            step();
          }, 90);
        }, 90);
      }
      step();
    });

    // 꾹 누르고 있으면 1초마다 자동으로 다시 실행됨(요청: "상단 랜덤디자인 적용 꾸욱
    // 클릭하면 1초마다 자동으로 눌러지게"). 버튼 자체가 처리 중엔 disabled 처리되므로,
    // 그 사이에 겹쳐 눌려도 안전하게 무시됨(비활성 버튼은 click 이벤트가 안 일어남).
    var rollAllHoldInterval = null;
    function startRollAllHold(){
      if (rollAllHoldInterval) return;
      rollAllHoldInterval = setInterval(function(){ rollAllBtn.click(); }, 1000);
    }
    function stopRollAllHold(){
      clearInterval(rollAllHoldInterval);
      rollAllHoldInterval = null;
    }
    rollAllBtn.addEventListener('mousedown', startRollAllHold);
    rollAllBtn.addEventListener('touchstart', startRollAllHold, { passive: true });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function(evt){
      rollAllBtn.addEventListener(evt, stopRollAllHold);
    });
  }

  // 이 파일이 쓰는 랜덤 필터 조합 기억용 속성을 중앙 레지스트리에 등록 — 실행취소·저장·
  // SVG내보내기·복제에 자동으로 반영됨.
  if (EP.registerCustomObjectProps) {
    EP.registerCustomObjectProps(['_lastRollComboIds']);
  }
})();
