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
    bg:'qaBgOffBtn', bubble:'qaBubbleOffBtn', zebra:'qaZebraOffBtn'
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

  // types: ['text'] | ['shape'] | ['text','shape'] — 표처럼 텍스트와 도형(셀 박스)이 섞여있으면
  // 텍스트 전용 필터 + 공통(텍스트/도형 겸용) 필터를 함께 후보 풀에 넣어서 뽑음
  // isTable: true면 텍스트 전용 필터는 TABLE_TEXT_FILTER_WHITELIST에 있는 것만 후보로 남김.
  function pickCombo(types, isTable){
    var pool = EP.filterRegistry.filter(function(f){
      if (f.includeInRandom === false || typeof f.randomize !== 'function' || !f.appliesTo) return false;
      if (isTable && !f.commonEffect && TABLE_TEXT_FILTER_WHITELIST.indexOf(f.id) === -1) return false;
      return f.appliesTo.some(function(t){ return types.indexOf(t) !== -1; });
    });
    var specificPool = pool.filter(function(f){ return !f.commonEffect; });
    var commonPool = pool.filter(function(f){ return f.commonEffect; });

    // 도형만 있고(표 셀 박스 등) 텍스트 전용 필터가 뽑힐 게 없으면(specificPool 비어있음)
    // 공통 필터 쪽에서 좀 더 넉넉히 뽑아 밋밋해지지 않게 함
    var specificCount = specificPool.length ? 1 + Math.floor(Math.random() * 3) : 0; // 1~3
    var commonCount = specificPool.length ? Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2); // 0~2 또는 1~2

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

    if (EP.canvas) EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();

    // 4) 패널에 순환 표시 준비 (◀ 이전 · 숫자 · 다음 ▶)
    rollState.ids = combo.map(function(f){ return f.id; });
    rollState.index = 0;
    showCurrentRollFilter();
  }

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
})();
