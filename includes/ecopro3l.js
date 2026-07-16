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
    tear:'qaTearOffBtn', melt:'qaMeltOffBtn', speed:'qaSpeedOffBtn', crack:'qaCrackOffBtn',
    footprint:'qaFootprintOffBtn', snow:'qaSnowOffBtn', rain:'qaRainOffBtn', threeD:'qa3DOffBtn',
    metal:'qaMetalOffBtn', popart:'qaPopartOffBtn', inktrap:'qaInktrapOffBtn', leafvine:'qaLeafvineOffBtn',
    sakura:'qaSakuraOffBtn', fire:'qaFireOffBtn', randomTypo:'qaRandomTypoOffBtn', circular:'qaCircularOffBtn',
    vertical:'qaVerticalOffBtn', puffy:'qaPuffyOffBtn', vine:'qaVineOffBtn', roll:'qaRollOffBtn',
    perspective:'qaPerspectiveOffBtn', curve:'qaCurveOffBtn', wave:'qaWaveOffBtn', tired:'qaTiredOffBtn',
    spiral:'qaSpiralOffBtn', magazine:'qaMagazineOffBtn', puzzle:'qaPuzzleOffBtn', sky:'qaSkyOffBtn',
    shy:'qaShyOffBtn', chalk:'qaChalkOffBtn', grass:'qaGrassOffBtn', bigbang:'qaBigbangOffBtn',
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

  // 텍스트 선택 시: 텍스트 전용 1~3개 + 공통 1~2개 (겹치면 자연히 1개로 줄어듦)
  function pickCombo(targetType){
    var pool = EP.filterRegistry.filter(function(f){
      return f.includeInRandom !== false && typeof f.randomize === 'function' &&
             f.appliesTo && f.appliesTo.indexOf(targetType) !== -1;
    });
    var specificPool = pool.filter(function(f){ return !f.commonEffect; });
    var commonPool = pool.filter(function(f){ return f.commonEffect; });

    var specificCount = 1 + Math.floor(Math.random() * 3); // 1~3
    var commonCount = Math.floor(Math.random() * 2);       // 0~1

    var chosen = [], usedGroups = {}, usedIds = {};
    drawFrom(specificPool, specificCount, chosen, usedGroups, usedIds);
    drawFrom(commonPool, commonCount, chosen, usedGroups, usedIds);

    if (!chosen.length && pool.length) chosen.push(pool[Math.floor(Math.random() * pool.length)]);
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
    if (!target || !EP.textBoxesFromTarget) return;
    var boxes = EP.textBoxesFromTarget(target);
    if (!boxes.length) return;
    EP.qaTargets = boxes;

    // 1) 재클릭 시 완전 초기화(요청사항): 등록된 모든 필터를 끔
    resetAllFilters();

    // 2) 새로운 1~4개 조합을 뽑아서 각자의 randomize()로 게이지까지 랜덤 적용
    var combo = pickCombo('text');
    combo.forEach(function(def){ try { def.randomize(); } catch (e) { console.error('randomize error:', def.id, e); } });

    if (EP.canvas) EP.canvas.requestRenderAll();
    if (EP.pushHistory) EP.pushHistory();

    // 3) 패널에 순환 표시 준비 (◀ 이전 · 숫자 · 다음 ▶)
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
