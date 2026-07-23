/* ecopro3logo.js — 로고 만들기 (한글 이름 → 영문 이니셜 로고)
   "텍스트모양" 메뉴의 "지도 만들기" 아래에 있는 "로고 만들기" 버튼을 누르면 여는 이름 입력창.

   동작 방식:
     0) "🎲 랜덤 로고 만들기"는 무엇보다 먼저 "한글 전용" 모드 여부를 약 20% 확률로 먼저 뽑음
        (rollBadgeStyle의 koreanOnlyMode) — 켜지면 아래 1)~4)의 영어 이니셜/로마자 변환·아이콘
        모드는 전부 건너뛰고, 입력한 한글 이름을 로마자 변환 없이 그대로 크게 씀. 이 모드 안에서도
        KOREAN_FILTERS 10종(메탈·네온·듀오톤·비비드그라디언트·선버스트·글리치·손그림지터·도트패턴·
        글래스·테두리, 각 10%) 중 하나가 같이 무작위로 적용됨 — 대부분 신규 10종 필터에서 쓴
        배지/텍스트 빌더 함수를 그대로 재사용함(buildKoreanBadge/buildKoreanNameText 참고).
        로마자가 아예 없는 모드라 하단 부제목 줄도 안 넣음. "🔤 로고 만들기"(일반 버튼)는 이 모드를
        타지 않고 항상 1)~3)의 기본 영어 이니셜 방식으로 고정.
     1) 한글 이름을 띄어쓰기로 단어 단위로 나눔 (예: "대신 일렉트로닉스" → ["대신","일렉트로닉스"])
     2) 각 글자를 국립국어원 로마자 표기법(초성/중성/종성 분해) 규칙으로 영문 변환
        (예: 대→dae, 신→sin, 일→il, 렉→reg ...) — 받침 연음(음운변화)까지는 반영하지 않는 단순 변환이라
        실제 로마자 표기법과 약간 다를 수 있음. 로고용 "느낌" 변환으로 이해하면 됨.
     3) 단어별 첫 글자의 영문 첫 알파벳만 모아 큼직한 이니셜(예: "DI")을 만들고,
        그 아래에 전체 이름을 이어붙인 영문 표기(예: "daesinilregteuronigseu")를 작게 넣음.
     4) 입력한 이름에 업종을 짐작할 수 있는 키워드(예: "커피", "전자", "헬스", "부동산" 등, 총 50개
        업종·100여개 키워드 — ICON_LIBRARY/pickIconForWords 참고)가 들어있으면, "🔤 로고 만들기"는
        항상 영어 이니셜/로마자 없이 "관련 아이콘 + 한글 상호"로만 디자인함(예: "대신 커피" → 커피컵
        아이콘 + "대신 커피" 글자). 아이콘은 이미지가 아니라 기본 도형으로 그린 단순 실루엣이라 로고
        색에 맞춰 물듦. "🎲 랜덤 로고 만들기"는 매번 약 55% 확률로 이 아이콘 버전을, 나머지 45%는
        키워드가 있어도 아래 4-1)의 영어 이니셜 버전을 뽑아서 두 스타일이 섞여 나오게 함(계속 눌러서
        둘 다 확인 가능). 키워드가 아예 매칭되지 않으면 항상 4-1)의 영어 이니셜 방식으로 만듦.
     4-1) "🎲 랜덤 로고 만들기"는 배지 모양(원형/사각형/둥근사각형/육각형/삼각형/역삼각형/별 7종,
        BADGE_SHAPES 참고)과 함께 "룩"을 하나 뽑아서 적용함 — 아래 4-1a~4-1e 중 서로 완전히
        배타적으로 딱 하나만 골라짐(rollBadgeStyle의 EFFECT_TABLE 참고, 총합 100%):
        메탈 30% · 신규 10종(각 4.5%, 합 45%) · 테두리 3종(각 5%, 합 15%) · 아무 효과 없음(플랫) 10%.
        원형/사각형/둥근사각형/육각형은 이니셜 글자의 폭·높이에 딱 맞춰 여백을 최소로 타이트하게
        잡고(buildBadgeDims 참고), 삼각형/역삼각형/별은 모서리 밖으로 글씨가 살짝 벗어나도 되게
        허용하고 크기를 더 작게 잡음. "🔤 로고 만들기"(일반 버튼)는 배지 없이 이니셜+로마자만
        깔끔하게 넣는 가장 단순한 형태로 고정(룩 랜덤화는 랜덤 버튼 전용).
        누를 때마다 팔레트·모양·룩 조합을 새로 굴리고(직전과 완전히 같은 조합은 다시 굴려서 피함),
        바로 전에 랜덤으로 만든 로고가 캔버스에 남아있으면 그걸 지우고 그 자리에 새 걸로 교체함.
        20% 확률로 아래 작은 전체이름 줄은 아예 뺌.
     4-1a) 메탈(30%): 큰 이니셜 글자 뒤로 금속 그라디언트 배지를 깔고(가끔 배지 안쪽에 내부
        광원 추가, 도형 바깥으로 번지는 그림자·외부광선은 전혀 안 씀), 배지가 없을 땐 이니셜
        글자 자체에 금속 그라디언트를 입힘(applyTextMetalEffect 참고). 배지가 있을 땐 50%
        확률로 글자에도 추가로 금속 효과를 입힘.
     4-1b) 신규 10종(각 4.5%): 네온사인(어두운 배지+비비드 글자+내부 컬러 광원, buildNeonBadge) ·
        듀오톤 스플릿 배지(두 색 대각선 분할, buildDuotoneBadge) · 비비드 그라디언트 텍스트
        (흰 밴드 없는 매끈한 2색 그라디언트, makeVividTextGradient) · 레트로 선버스트 배지
        (두 색이 번갈아가는 광선 무늬, buildSunburstBadge) · 글리치(RGB 분리) 텍스트(살짝
        어긋난 컬러 잔상 2겹+진한 메인 글자, buildGlitchText) · 손그림 지터 아웃라인(윤곽선을
        살짝씩 다르게 3겹 겹침, buildWobbleBadge) · 팝아트 도트 패턴 배지(fabric.Pattern으로
        물방울무늬 채우기, buildDotPatternBadge) · 반투명 글래스 배지(파스텔 반투명 채우기+
        하이라이트, buildGlassBadge) · 그림자 없는 플랫 엠보스 텍스트(블러 없이 살짝 어긋난
        진한 사본을 뒤에 겹쳐 입체감, buildFlatEmbossText) · 컨페티 스플래시 배지(흰 배지
        둘레에 알록달록한 점·조각 흩뿌림, buildConfettiDecor). 전부 영어 이니셜 전용(아이콘
        모드 끔)이고, 배지가 필요 없는 순수 텍스트 효과(그라디언트/글리치/엠보스)는 배지를
        아예 안 씀.
     4-1c) 테두리 3종(각 5%, 4-2 참고), 4-1d) 플랫(10%): 배지·글자 전부 그라디언트/광원 없이
        가장 단순한 단색 하나로만 그려지는 기본형(buildFlatBadge).
     4-2) "테두리" 계열 필터 3종 — 배지·이니셜에 쓰는 테두리 색은 항상 하나로 통일하고, 하단
        작은 전체이름 줄에는 테두리 효과를 적용하지 않고 평범한 단색(테두리와 같은 색)으로만 남김.
        - "단일"(single): 배지·이니셜 모두 "바깥 테두리만"(흰색으로 채운 뒤 두께를 2배로 한
          테두리를 fill보다 먼저 그려서 바깥 절반만 남기는 방식 — applyOuterBorder 참고).
        - "더블"(double): 위 단일 테두리 배지 바깥에 흰 여백을 두고 같은 색으로 한 겹 더 큰
          테두리를 깔아 "색-흰-색" 두 겹 링으로 보이게 함(buildDoubleBorderBadge 참고, 글자는
          단일과 동일하게 한 겹만).
        - "뭉침"(clump): 이니셜이 2글자 이상일 때만 적용됨(1글자면 단일로 대체) — 글자를 한
          자씩 쪼개 각각 같은 색 바깥 테두리를 입히고 무작위 위치·각도로 겹쳐 쌓은 듯 배치함
          (buildClumpedLetters 참고), 배지는 60% 확률로만 곁들여짐.
     5) 만들어진 오브젝트는 fabric.Group으로 묶여 캔버스 중앙에 추가됨 (다른 오브젝트처럼
        이동·크기조절 가능하고, "묶기 풀기"로 배지/이니셜/전체이름을 따로 편집할 수도 있음).

   로딩 순서: ecopro3.js(코어, EP.canvas 등이 여기서 채워짐) 다음이면 어디든 무방하나,
   관례상 ecopro3map.js 다음, ecopro3l.js(주사위, 레지스트리를 맨 마지막에 읽음) 전에 둠. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var shapeMenu = document.getElementById('shapeMenu');
  var addLogoBtn = document.getElementById('addLogoBtn');
  var logoInputToolbar = document.getElementById('logoInputToolbar');
  var logoInputToolbarHint = document.getElementById('logoInputToolbarHint');
  var logoNameInput = document.getElementById('logoNameInput');
  var applyLogoBtn = document.getElementById('applyLogoBtn');
  var randomLogoBtn = document.getElementById('randomLogoBtn');
  var cancelLogoBtn = document.getElementById('cancelLogoBtn');

  if (!addLogoBtn || !logoInputToolbar) return; // html이 안 맞으면 조용히 비활성화

  var DEFAULT_HINT = logoInputToolbarHint.textContent;

  // ---------- 한글 로마자 변환 (초성/중성/종성 분해) ----------
  // 유니코드 완성형 한글 음절은 0xAC00('가') ~ 0xD7A3('힣') 사이에 있고,
  // (code - 0xAC00) = 초성index*588 + 중성index*28 + 종성index 로 계산됨.
  var CHO = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  var JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  var JONG = ['','g','kk','gs','n','nj','nh','d','l','lg','lm','lb','ls','lt','lp','lh','m','b','bs','s','ss','ng','j','ch','k','t','p','h'];

  // 한 글자(음절)를 로마자로. 완성형 한글이 아니면 null.
  function romanizeSyllable(ch){
    var code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return null;
    var idx = code - 0xAC00;
    var cho = Math.floor(idx / 588);
    var jung = Math.floor((idx % 588) / 28);
    var jong = idx % 28;
    return CHO[cho] + JUNG[jung] + JONG[jong];
  }

  // 단어 하나를 통째로 로마자로 (한글이 아닌 영문/숫자는 그대로 두고, 그 외 특수문자는 건너뜀)
  function romanizeWord(word){
    var out = '';
    for (var i = 0; i < word.length; i++) {
      var ch = word[i];
      var r = romanizeSyllable(ch);
      if (r !== null) out += r;
      else if (/[a-zA-Z0-9]/.test(ch)) out += ch;
    }
    return out;
  }

  // 단어의 첫 글자에서 이니셜 알파벳 한 글자만 뽑음
  function wordInitial(word){
    var trimmed = word.trim();
    if (!trimmed) return '';
    var first = trimmed.charAt(0);
    var r = romanizeSyllable(first);
    var letter = (r !== null) ? r.charAt(0) : first;
    return letter ? letter.toUpperCase() : '';
  }

  // 입력 문자열 → { initials:'DI', full:'daesinilregteuronigseu', words:[...] }
  function buildLogoData(name){
    var words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    var initials = words.map(wordInitial).join('');
    var full = words.map(romanizeWord).join('').toLowerCase();
    if (!initials || !full) return null;
    return { initials: initials, full: full, words: words };
  }

  // ---------- 로고필터: 이니셜 뒤 금속(메탈) 그라디언트 배지 ----------
  // dark:true  → 배지가 전체적으로 어두운 계열 → 이니셜 글자는 밝은/흰색으로(보색 대비)
  // dark:false → 배지가 전체적으로 밝은 계열 → 이니셜 글자는 어두운 색으로(보색 대비)
  // bandDark/bandLight는 크롬 반사 밴드 그라디언트(어둠→밝음→흰하이라이트→밝음→어둠)의 재료색.
  var METAL_PALETTES = [
    { id: 'silver',    dark: false, bandDark: '#6b7280', bandLight: '#eef1f4', textColor: '#20242b' },
    { id: 'chrome',    dark: false, bandDark: '#4b5561', bandLight: '#fbfdff', textColor: '#15181d' },
    { id: 'gold',      dark: false, bandDark: '#8a6416', bandLight: '#f7e2a0', textColor: '#3a2a06' },
    { id: 'rosegold',  dark: false, bandDark: '#7a4a42', bandLight: '#f3d0c4', textColor: '#3c1c16' },
    { id: 'gunmetal',  dark: true,  bandDark: '#0c0e11', bandLight: '#454b54', textColor: '#ffffff' },
    { id: 'midnight',  dark: true,  bandDark: '#040a1a', bandLight: '#2c4d8f', textColor: '#eaf1ff' },
    { id: 'bronze',    dark: true,  bandDark: '#341f0e', bandLight: '#a9723a', textColor: '#fff2df' },
    { id: 'blackgold', dark: true,  bandDark: '#050505', bandLight: '#caa03a', textColor: '#fbe7a8' },
    { id: 'copper',    dark: true,  bandDark: '#3d1d0f', bandLight: '#c97b45', textColor: '#ffe9d6' },
    { id: 'plum',      dark: true,  bandDark: '#12081f', bandLight: '#5b3a91', textColor: '#f1e6ff' }
  ];

  // 배지 모양 7종 — 매번 이 중 하나를 무작위로 골라 씀
  var BADGE_SHAPES = ['circle', 'rect', 'roundedRect', 'hexagon', 'triangle', 'invertedTriangle', 'star'];

  function pickRandomPalette(){
    return METAL_PALETTES[Math.floor(Math.random() * METAL_PALETTES.length)];
  }
  function pickRandomShape(){
    return BADGE_SHAPES[Math.floor(Math.random() * BADGE_SHAPES.length)];
  }

  // 무작위 색상 하나 생성 (HSL) — "테두리" 필터 전용. 팔레트 색과는 완전히 별개.
  function randomOutlineColor(){
    var h = Math.floor(Math.random() * 360);
    var s = 55 + Math.random() * 35;
    var l = 30 + Math.random() * 30;
    return 'hsl(' + h + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
  }

  // 채도 높은 비비드 색상(HSL) — 네온/그라디언트/글래스 등 신규 필터 전용
  function randomVividColor(satMin, lightMin, lightRange){
    var h = Math.floor(Math.random() * 360);
    var s = (satMin || 65) + Math.random() * 25;
    var l = (lightMin || 45) + Math.random() * (lightRange || 15);
    return 'hsl(' + h + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
  }
  // randomOutlineColor/randomVividColor가 만든 'hsl(h,s%,l%)' 문자열을 alpha값 있는
  // 'hsla(h,s%,l%,a)'로 바꿔줌(반투명 채우기가 필요한 글래스/듀오톤 등에서 씀)
  function toHsla(hslStr, alpha){
    return hslStr.replace('hsl(', 'hsla(').replace(/\)$/, ',' + alpha + ')');
  }

  // 팔레트/모양/광원효과/배지유무/부제목 표시여부/글자 메탈효과를 한번에 굴림 —
  // 직전 조합과 완전히 같으면 다시 굴려서 "누를 때마다 계속 다른 게 나오는" 느낌을 보장(최대 6번 재시도)
  var lastStyleKey = null;
  function rollBadgeStyle(){
    var style, key, tries = 0;
    do {
      // "한글 전용" 로고 모드 — 약 20% 확률로 켜짐. 켜지면 영어 이니셜/로마자 변환을 전혀 안 쓰고
      // 입력한 한글 이름을 그대로 큼직하게 씀. 아이콘+한글 상호 모드(업종 키워드 매칭 전용)와는
      // 별개로, 키워드 매칭 여부와 무관하게 항상 이 확률로 등장함. 이 모드 안에서도 KOREAN_FILTERS
      // 10종 중 하나가 무작위로 적용됨(buildKoreanNameText/buildKoreanBadge 참고).
      var koreanOnlyMode = Math.random() < 0.2;
      var koreanFilterMode = pickRandomKoreanFilter();

      // 모든 "룩"을 하나의 가중치 표에서 딱 하나만 뽑음(합계 100) — 서로 완전 배타적이라
      // 켜진 룩 하나만 순수하게 적용되고 나머지 코드 경로는 전혀 안 건드림.
      //   메탈(요청대로 30%) · 신규 10종 각 4.5%(총 45%) · 테두리 단일/더블/뭉침 각 5%(총 15%) · 아무 효과 없음(플랫/아이콘 모드용) 10%
      var EFFECT_TABLE = [
        { mode: 'metal',    w: 30 },
        { mode: 'neon',     w: 4.5 }, { mode: 'duotone', w: 4.5 }, { mode: 'gradientText', w: 4.5 },
        { mode: 'sunburst', w: 4.5 }, { mode: 'glitch',  w: 4.5 }, { mode: 'wobble',       w: 4.5 },
        { mode: 'dots',     w: 4.5 }, { mode: 'glass',   w: 4.5 }, { mode: 'emboss',       w: 4.5 },
        { mode: 'confetti', w: 4.5 },
        { mode: 'borderSingle', w: 5 }, { mode: 'borderDouble', w: 5 }, { mode: 'borderClump', w: 5 },
        { mode: 'none', w: 10 }
      ];
      var roll = Math.random() * 100, acc = 0, effectMode = 'none';
      for (var ei = 0; ei < EFFECT_TABLE.length; ei++) {
        acc += EFFECT_TABLE[ei].w;
        if (roll < acc) { effectMode = EFFECT_TABLE[ei].mode; break; }
      }

      // 신규 필터/테두리 필터는 전부 영어 이니셜 방식 전용(아이콘 모드 끔) + 배지 필요 여부가
      // 필터마다 달라서 여기서 한 번에 정리함. 'none'일 때만 기존처럼 배지/메탈/아이콘을 자유롭게 굴림.
      var borderMode = (effectMode === 'borderSingle') ? 'single' : (effectMode === 'borderDouble') ? 'double' : (effectMode === 'borderClump') ? 'clump' : 'none';
      var isSpecial = effectMode !== 'metal' && effectMode !== 'none';
      var isBorderFamily = borderMode !== 'none';

      var palette = pickRandomPalette();
      var shape = pickRandomShape();
      var withGlow = (effectMode === 'metal') ? (Math.random() < 0.45) : false;
      var showSubtitle = Math.random() >= 0.20; // 20% 확률로 아래 작은 전체이름 글씨를 아예 뺌
      var withBadge;
      if (isBorderFamily) withBadge = (borderMode === 'clump') ? (Math.random() < 0.6) : true;
      else if (effectMode === 'gradientText' || effectMode === 'glitch' || effectMode === 'emboss') withBadge = false; // 순수 글자 효과라 배지 없이 글자 자체로 승부
      else if (isSpecial) withBadge = true; // neon/duotone/sunburst/wobble/dots/glass/confetti는 배지가 핵심
      else withBadge = Math.random() < 0.75; // 'metal' 또는 'none' — 기존처럼 25% 확률로 배지 없이 글자만
      // 배지가 없으면 "글자에만 메탈+광원" 효과가 이 조합의 핵심이므로 항상 켜고,
      // 배지가 있을 땐 절반 확률로만 글자 자체에도 메탈+광원을 추가로 입힘 ('metal' 모드에서만 의미 있음)
      var textMetal = (effectMode !== 'metal') ? false : (withBadge ? (Math.random() < 0.5) : true);
      var textPalette = pickRandomPalette(); // 글자 메탈 색상은 배지 색과 별개로 무작위 선택
      // 업종 키워드가 매칭돼도(아이콘 있음) 랜덤 버튼에서는 항상 "아이콘+한글" 버전만 나오지 않도록,
      // 약 55% 확률로만 아이콘 버전을 쓰고 나머지는 기존 영어 이니셜(+배지/메탈) 버전으로 만듦.
      // 신규/테두리 계열 필터는 전부 영어 이니셜 방식 전용이라 켜지면 아이콘 모드는 항상 끔.
      var useIcon = (effectMode === 'metal' || effectMode === 'none') ? (Math.random() < 0.55) : false;

      // 테두리 계열 전용 색상/두께
      var borderColor = randomOutlineColor();
      var borderStrokeWidthPx = 3 + Math.random() * 3; // 기준 3~6px(배지/글자 크기에 맞춰 아래에서 스케일)
      var doubleBorderGapRatio = 0.08 + Math.random() * 0.06; // 더블 테두리의 흰 여백 폭(배지 크기 대비 8~14%)

      // 신규 10종 필터 전용 색상(필터별로 실제 쓰는 것만 아래에서 참조함)
      var vividColorA = randomVividColor();
      var vividColorB = randomVividColor(60, 20, 20); // 좀 더 어두운 보조색(엠보스 뒷면 등)

      style = {
        palette: palette, shape: shape, withGlow: withGlow, showSubtitle: showSubtitle, withBadge: withBadge,
        textMetal: textMetal, textPalette: textPalette, useIcon: useIcon,
        borderMode: borderMode, borderColor: borderColor, borderStrokeWidthPx: borderStrokeWidthPx,
        doubleBorderGapRatio: doubleBorderGapRatio,
        effectMode: effectMode, vividColorA: vividColorA, vividColorB: vividColorB,
        koreanOnlyMode: koreanOnlyMode, koreanFilterMode: koreanFilterMode
      };
      key = palette.id + '|' + shape + '|' + withGlow + '|' + showSubtitle + '|' + withBadge + '|' + textMetal + '|' + textPalette.id + '|' + useIcon + '|' + effectMode + '|' + koreanOnlyMode + '|' + koreanFilterMode;
      tries++;
    } while (key === lastStyleKey && tries < 6);
    lastStyleKey = key;
    return style;
  }

  function hexToRgba(hex, alpha){
    var h = (hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function(c){ return c + c; }).join('');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // 이니셜 글자 크기 기준으로 배지 가로/세로/모서리 반경을 계산.
  // 원형은 글자의 폭·높이 중 큰 쪽 기준으로 지름을 잡아 어느 쪽으로도 글자가 넘치지 않게 함.
  // 사각형/둥근사각형/육각형은 한 글자(예: "E")처럼 폭이 유난히 좁을 때 세로로 길쭉해지지 않도록
  // 가로세로 비율을 강제하고, 원형만큼 타이트하게(여백을 적게) 잡아서 배지가 커 보이지 않게 함.
  // 삼각형/역삼각형/별은 글씨가 모서리 밖으로 살짝 벗어나도 되는 도형이라 크기를 더 작게 잡음.
  function buildBadgeDims(shapeKind, initialsText){
    var tw = initialsText.width, th = initialsText.height;

    if (shapeKind === 'circle') {
      var d = Math.max(tw, th) * 1.28;
      return { w: d, h: d, rx: 0, ry: 0 };
    }

    if (shapeKind === 'triangle' || shapeKind === 'invertedTriangle') {
      var ts = Math.max(tw, th) * 1.15;
      return { w: ts, h: ts, rx: 0, ry: 0 };
    }

    if (shapeKind === 'star') {
      var ss = Math.max(tw, th) * 1.3;
      return { w: ss, h: ss, rx: 0, ry: 0 };
    }

    if (shapeKind === 'hexagon') {
      var hw = tw * 1.26, hh = th * 1.32;
      var hexMinRatio = 1.15; // 육각형은 좌우가 뾰족해서 가로가 세로보다 확실히 넓어야 안 찌그러져 보임
      if (hw / hh < hexMinRatio) hw = hh * hexMinRatio;
      return { w: hw, h: hh, rx: 0, ry: 0 };
    }

    // rect / roundedRect — 예전보다 더 타이트하게(원형 느낌으로) 줄임
    var w = tw * 1.18;
    var h = th * 1.4;
    var minRatio = 0.92; // w/h가 이보다 작아지면(세로로 너무 길쭉) 폭을 넓혀 정사각형에 가깝게 맞춤
    if (w / h < minRatio) w = h * minRatio;
    var r = (shapeKind === 'roundedRect') ? Math.min(w, h) * 0.16 : 0;
    return { w: w, h: h, rx: r, ry: r };
  }

  // 육각형(좌우로 뾰족한 flat-top 육각형) 꼭짓점 좌표
  function buildHexagonPoints(w, h){
    var hw = w / 2, hh = h / 2, cut = hw * 0.5;
    return [
      { x: -hw + cut, y: -hh }, { x: hw - cut, y: -hh }, { x: hw, y: 0 },
      { x: hw - cut, y: hh }, { x: -hw + cut, y: hh }, { x: -hw, y: 0 }
    ];
  }
  // 별(5각 별) 꼭짓점 좌표
  function buildStarPoints(w, h){
    var outerR = Math.max(w, h) / 2, innerR = outerR * 0.42;
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var r = (i % 2 === 0) ? outerR : innerR;
      var ang = Math.PI / 5 * i - Math.PI / 2;
      pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
    }
    return pts;
  }

  // shapeKind에 맞는 fabric 오브젝트를 하나 생성(배지 몸통/하이라이트/광원 겹층에서 공통으로 씀).
  // 항상 원점(0,0) 중심, w/h 크기 기준으로 만들어서 여러 겹을 쌓아도 서로 정확히 겹치게 함.
  function makeBadgeShapeObject(shapeKind, w, h, rx, ry, fillValue, extraProps){
    var base = { left: 0, top: 0, originX: 'center', originY: 'center', fill: fillValue };
    var props = Object.assign(base, extraProps || {});
    if (shapeKind === 'circle') {
      return new fabric.Circle(Object.assign({ radius: w / 2 }, props));
    }
    if (shapeKind === 'triangle') {
      return new fabric.Triangle(Object.assign({ width: w, height: h }, props));
    }
    if (shapeKind === 'invertedTriangle') {
      return new fabric.Triangle(Object.assign({ width: w, height: h, angle: 180 }, props));
    }
    if (shapeKind === 'hexagon') {
      return new fabric.Polygon(buildHexagonPoints(w, h), props);
    }
    if (shapeKind === 'star') {
      return new fabric.Polygon(buildStarPoints(w, h), props);
    }
    // rect / roundedRect
    return new fabric.Rect(Object.assign({ width: w, height: h, rx: rx || 0, ry: ry || 0 }, props));
  }

  // 세로로 어두운색→밝은색→흰색 하이라이트→밝은색→어두운색 밴드를 넣어 금속 표면에
  // 빛이 반사되는 느낌을 줌 (기존 "메탈" 텍스트 필터의 makeMetalGradient와 같은 원리)
  function makeMetalBandGradient(h, palette){
    return new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: -h / 2, x2: 0, y2: h / 2 },
      colorStops: [
        { offset: 0,    color: palette.bandDark },
        { offset: 0.32, color: palette.bandLight },
        { offset: 0.5,  color: '#ffffff' },
        { offset: 0.68, color: palette.bandLight },
        { offset: 1,    color: palette.bandDark }
      ]
    });
  }

  // 배지 하나 = 금속 밴드 몸통 + 좌상단 하이라이트(광택), 도형(원/사각/둥근사각/육각/삼각/역삼각/별)에
  // 맞춰 makeBadgeShapeObject로 만들어 배열로 반환. 로고가 선명하게 보이도록 드롭섀도우나
  // 도형 바깥으로 번지는 외부 광선은 전혀 쓰지 않음 — 광원효과(withGlow)는 도형 "안쪽"의
  // 하이라이트를 더 밝고 크게 넣는 것으로만 표현함(내부에만 비침, 바깥으로는 안 새어나감).
  function buildMetalBadge(shapeKind, w, h, rx, ry, palette, withGlow){
    var maxSpan = Math.max(w, h);
    var objs = [];

    var shineFill = new fabric.Gradient({
      type: 'radial',
      coords: { x1: -w * 0.16, y1: -h * 0.28, r1: 0, x2: -w * 0.16, y2: -h * 0.28, r2: maxSpan * (withGlow ? 0.72 : 0.58) },
      colorStops: [
        { offset: 0,    color: hexToRgba('#ffffff', withGlow ? 0.75 : 0.55) },
        { offset: 0.55, color: 'rgba(255,255,255,0.12)' },
        { offset: 1,    color: 'rgba(255,255,255,0)' }
      ]
    });

    var base = makeBadgeShapeObject(shapeKind, w, h, rx, ry, makeMetalBandGradient(h, palette), {
      stroke: 'rgba(0,0,0,0.22)', strokeWidth: Math.max(1, maxSpan * 0.006)
    });
    var shine = makeBadgeShapeObject(shapeKind, w, h, rx, ry, shineFill, {});

    objs.push(base, shine);

    // 광원효과: 배지 안쪽 중심 부근에 은은한 밝은 색 빛무리를 하나 더 겹쳐서(도형 크기 안에서만
    // 렌더링되므로 바깥으로는 절대 번지지 않음) "안에서 빛나는" 느낌을 냄
    if (withGlow) {
      var innerGlowFill = new fabric.Gradient({
        type: 'radial',
        coords: { x1: 0, y1: 0, r1: 0, x2: 0, y2: 0, r2: maxSpan * 0.5 },
        colorStops: [
          { offset: 0,    color: hexToRgba(palette.bandLight, 0.4) },
          { offset: 0.7,  color: hexToRgba(palette.bandLight, 0.08) },
          { offset: 1,    color: hexToRgba(palette.bandLight, 0) }
        ]
      });
      objs.push(makeBadgeShapeObject(shapeKind, w, h, rx, ry, innerGlowFill, {}));
    }

    return objs;
  }

  // ---------- "테두리" 로고필터 (메탈/광원/아이콘 등 다른 효과와 완전히 분리된 전용 코드) ----------
  // 배지·이니셜 모두 "바깥 테두리만" 보이게 그리는 공통 트릭: 안을 흰색으로 채우고, 두께를 2배로
  // 한 테두리를 fill보다 먼저 그려서(paintFirst:'stroke') 안쪽 절반은 흰 fill에 가려지고 바깥쪽
  // 절반만 남게 함. 배지든 이니셜이든 이 함수 하나로 색상/두께를 통일해서 적용함.
  function applyOuterBorder(obj, color, strokeWidthPx){
    obj.set('fill', '#ffffff');
    obj.set('stroke', color);
    obj.set('strokeWidth', strokeWidthPx * 2);
    obj.set('strokeLineJoin', 'round');
    obj.set('paintFirst', 'stroke');
  }

  // "테두리" 필터용 배지 — makeBadgeShapeObject로 도형을 만든 뒤 applyOuterBorder로 통일된
  // 바깥 테두리를 입힘. shapeKind가 원/사각/육각/삼각/별 무엇이든 이 함수 하나로 다 처리됨.
  function buildBorderBadge(shapeKind, w, h, rx, ry, color, strokeWidthPx){
    var obj = makeBadgeShapeObject(shapeKind, w, h, rx, ry, '#ffffff', {});
    applyOuterBorder(obj, color, strokeWidthPx);
    return obj;
  }

  // "더블 테두리" 필터용 배지 — 기존 단일 테두리 배지(buildBorderBadge) 그대로 위에 얹고, 그보다
  // 흰 여백만큼 더 큰 같은 도형을 뒤에 하나 더 깔아서(색은 완전히 동일) "색-흰-색" 순으로 겹쳐
  // 보이는 두 겹 테두리 링을 만듦. 안쪽 배지의 흰 채우기가 자연스럽게 바깥 배지 안쪽 절반을
  // 가려주므로, 크기만 다르게 두 배지를 같은 색으로 쌓기만 하면 저절로 이 효과가 남(별도 렌더링
  // 트릭 불필요) — buildBorderBadge를 그대로 재사용해서 완전히 같은 색/스타일을 보장함.
  function buildDoubleBorderBadge(shapeKind, w, h, rx, ry, color, strokeWidthPx, gapRatio){
    var gap = Math.max(w, h) * gapRatio;
    var outerW = w + gap * 2, outerH = h + gap * 2;
    var outerRx = rx ? rx + gap * 0.6 : 0, outerRy = ry ? ry + gap * 0.6 : 0;
    var outer = buildBorderBadge(shapeKind, outerW, outerH, outerRx, outerRy, color, strokeWidthPx);
    var inner = buildBorderBadge(shapeKind, w, h, rx, ry, color, strokeWidthPx);
    return [outer, inner]; // 바깥(뒤) 먼저, 안쪽(앞) 나중
  }

  // "글자 뭉침" 필터용 — 이니셜을 한 글자씩 낱개 오브젝트로 쪼개서, 각 글자에 똑같은 색의
  // applyOuterBorder(바깥 테두리)를 입힌 뒤 서로 살짝씩 겹치며 무작위 위치·각도로 흩어놓아
  // 뭉쳐 쌓인 듯한 느낌을 냄. 글자가 2개 이상일 때만 의미가 있어서 호출 전에 길이 체크는
  // insertLogoToCanvas에서 함. 그려지는 순서(=어떤 글자가 맨 위로 올라올지)도 매번 섞음.
  function buildClumpedLetters(letters, color, strokeWidthPx, fontSize, spreadRadius){
    var order = letters.slice();
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    return order.map(function(ch){
      var t = new fabric.IText(ch, {
        left: (Math.random() * 2 - 1) * spreadRadius,
        top: (Math.random() * 2 - 1) * spreadRadius,
        angle: Math.round((Math.random() * 2 - 1) * 22),
        originX: 'center', originY: 'center',
        fontFamily: 'Montserrat', fontWeight: '400',
        fontSize: fontSize
      });
      applyOuterBorder(t, color, strokeWidthPx);
      return t;
    });
  }

  // ---------- 신규 로고필터 10종 (전부 메탈/테두리 계열과 독립적인 코드 경로) ----------

  // 1) 네온사인 — 어두운 배지 위에 비비드한 색으로 채운 글자 + 배지 안쪽에만 은은한 컬러 광원
  //    (도형 바깥으로는 절대 안 번짐, 4-1의 "안쪽 광원" 원칙과 동일)
  function buildNeonBadge(shapeKind, w, h, rx, ry, neonColor){
    var darkFill = 'hsl(' + (Math.floor(Math.random() * 360)) + ',35%,10%)';
    var base = makeBadgeShapeObject(shapeKind, w, h, rx, ry, darkFill, {
      stroke: 'rgba(0,0,0,0.3)', strokeWidth: Math.max(1, Math.max(w, h) * 0.006)
    });
    var glowFill = new fabric.Gradient({
      type: 'radial',
      coords: { x1: 0, y1: 0, r1: 0, x2: 0, y2: 0, r2: Math.max(w, h) * 0.5 },
      colorStops: [
        { offset: 0,   color: toHsla(neonColor, 0.55) },
        { offset: 0.6, color: toHsla(neonColor, 0.16) },
        { offset: 1,   color: toHsla(neonColor, 0) }
      ]
    });
    var glow = makeBadgeShapeObject(shapeKind, w, h, rx, ry, glowFill, {});
    return [base, glow];
  }

  // 2) 듀오톤 스플릿 배지 — 기본 배지 위에 대각선 삼각형을 겹쳐서 두 가지 색으로 반씩 나뉜 느낌
  function buildDuotoneBadge(shapeKind, w, h, rx, ry, colorA, colorB){
    var base = makeBadgeShapeObject(shapeKind, w, h, rx, ry, colorA, {});
    var maxSpan = Math.max(w, h);
    var half = new fabric.Polygon([
      { x: -maxSpan * 0.7, y: -maxSpan * 0.7 }, { x: maxSpan * 0.7, y: -maxSpan * 0.7 }, { x: maxSpan * 0.7, y: maxSpan * 0.7 }
    ], { left: 0, top: 0, originX: 'center', originY: 'center', fill: colorB });
    return [base, half];
  }

  // 3) 비비드 그라디언트 텍스트 — 메탈의 밴드형(흰 하이라이트 포함) 그라디언트와 달리, 흰 줄무늬
  //    없이 두 가지 비비드 색이 매끈하게 이어지는 대각선 그라디언트
  function makeVividTextGradient(h, colorA, colorB){
    return new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: -h / 2, x2: 0, y2: h / 2 },
      colorStops: [ { offset: 0, color: colorA }, { offset: 1, color: colorB } ]
    });
  }

  // 4) 레트로 선버스트 배지 — 원형으로 두 색이 번갈아가는 광선 무늬(도형 종류와 무관하게 항상 원형)
  function buildSunburstBadge(w, h, colorA, colorB){
    var R = Math.max(w, h) / 2;
    var objs = [], rays = 14;
    for (var i = 0; i < rays; i++) {
      var ang = (Math.PI * 2 / rays) * i;
      objs.push(new fabric.Triangle({
        width: R * 0.62, height: R * 1.05,
        left: Math.cos(ang) * R * 0.42, top: Math.sin(ang) * R * 0.42,
        angle: (ang * 180 / Math.PI) + 90, originX: 'center', originY: 'center',
        fill: (i % 2 === 0) ? colorA : colorB
      }));
    }
    objs.push(new fabric.Circle({ radius: R * 0.56, left: 0, top: 0, originX: 'center', originY: 'center', fill: colorA }));
    return objs;
  }

  // 5) 글리치(RGB 분리) 텍스트 — 살짝 어긋난 두 컬러 잔상 뒤에 진한 메인 글자를 겹쳐 인쇄
  //    오정합(미스레지스트레이션) 같은 느낌을 냄. 흐림 없이 또렷한 사본 3장을 겹치는 방식이라 선명함.
  function buildGlitchText(str, fontSize, charSpacing, fontFamily, fontWeight){
    var jitter = fontSize * 0.045;
    var layers = [
      { dx: -jitter, dy: 0, color: 'rgba(255,20,90,0.72)' },
      { dx: jitter, dy: 0, color: 'rgba(0,210,255,0.72)' },
      { dx: 0, dy: 0, color: '#141414' }
    ];
    return layers.map(function(l){
      return new fabric.IText(str, {
        left: l.dx, top: l.dy, originX: 'center', originY: 'center',
        fontFamily: fontFamily || 'Montserrat', fontWeight: fontWeight || '800', fontSize: fontSize,
        charSpacing: charSpacing, fill: l.color
      });
    });
  }

  // 6) 손그림 지터 아웃라인 — 같은 배지 윤곽선을 살짝씩 다른 각도/위치로 2~3겹 겹쳐서
  //    손으로 대충 여러 번 그은 듯한 스케치 느낌을 냄(채우기 없음, 선만)
  function buildWobbleBadge(shapeKind, w, h, rx, ry, color, strokeWidthPx){
    var objs = [];
    var passes = 3;
    for (var i = 0; i < passes; i++) {
      objs.push(makeBadgeShapeObject(shapeKind, w, h, rx, ry, 'transparent', {
        stroke: color, strokeWidth: Math.max(1, strokeWidthPx * 0.55), strokeLineJoin: 'round',
        left: (Math.random() * 2 - 1) * w * 0.025, top: (Math.random() * 2 - 1) * h * 0.025,
        angle: (Math.random() * 2 - 1) * 5
      }));
    }
    return objs;
  }

  // 7) 팝아트 도트 패턴 배지 — fabric.Pattern으로 작은 물방울무늬 캔버스를 만들어 배지 채우기로 씀
  function buildDotPatternFill(bgColor, dotColor, size){
    var pc = document.createElement('canvas');
    pc.width = size; pc.height = size;
    var pctx = pc.getContext('2d');
    pctx.fillStyle = bgColor; pctx.fillRect(0, 0, size, size);
    pctx.fillStyle = dotColor;
    pctx.beginPath();
    pctx.arc(size / 2, size / 2, size * 0.22, 0, Math.PI * 2);
    pctx.fill();
    return new fabric.Pattern({ source: pc, repeat: 'repeat' });
  }
  function buildDotPatternBadge(shapeKind, w, h, rx, ry, bgColor, dotColor){
    var patternSize = Math.max(16, Math.round(Math.max(w, h) * 0.09));
    var fill = buildDotPatternFill(bgColor, dotColor, patternSize);
    return makeBadgeShapeObject(shapeKind, w, h, rx, ry, fill, {
      stroke: 'rgba(0,0,0,0.18)', strokeWidth: Math.max(1, Math.max(w, h) * 0.006)
    });
  }

  // 8) 반투명 글래스 배지 — 은은한 반투명 컬러 채우기 + 위쪽에 살짝 밝은 하이라이트로 유리질감
  function buildGlassBadge(shapeKind, w, h, rx, ry, color){
    var base = makeBadgeShapeObject(shapeKind, w, h, rx, ry, toHsla(color, 0.3), {
      stroke: toHsla(color, 0.65), strokeWidth: Math.max(1, Math.max(w, h) * 0.012)
    });
    var shine = makeBadgeShapeObject(shapeKind, w * 0.72, h * 0.5, rx, ry, 'rgba(255,255,255,0.22)', {
      top: -h * 0.2
    });
    return [base, shine];
  }

  // 9) 그림자 없는 플랫 엠보스 텍스트 — 블러 없이 살짝 어긋난 진한 색 사본을 뒤에 깔아
  //    입체감을 흉내냄(그림자가 아니라 또렷한 색 도형 하나 더 겹치는 것뿐이라 선명함 유지)
  function buildFlatEmbossText(str, fontSize, charSpacing, mainColor, backColor){
    var off = fontSize * 0.045;
    var back = new fabric.IText(str, {
      left: off, top: off, originX: 'center', originY: 'center',
      fontFamily: 'Montserrat', fontWeight: '800', fontSize: fontSize,
      charSpacing: charSpacing, fill: backColor
    });
    var front = new fabric.IText(str, {
      left: 0, top: 0, originX: 'center', originY: 'center',
      fontFamily: 'Montserrat', fontWeight: '800', fontSize: fontSize,
      charSpacing: charSpacing, fill: mainColor
    });
    return [back, front];
  }

  // 10) 컨페티 스플래시 배지 장식 — 배지 바깥 둘레에 알록달록한 작은 점/사각 조각을 흩뿌림
  function buildConfettiDecor(w, h, count){
    var objs = [];
    var R = Math.max(w, h) / 2;
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = R * (1.08 + Math.random() * 0.4);
      var size = 4 + Math.random() * 7;
      var col = 'hsl(' + Math.floor(Math.random() * 360) + ',75%,55%)';
      var deco;
      if (Math.random() < 0.5) {
        deco = new fabric.Circle({ radius: size / 2, fill: col, left: Math.cos(ang) * dist, top: Math.sin(ang) * dist, originX: 'center', originY: 'center' });
      } else {
        deco = new fabric.Rect({ width: size, height: size * 0.42, fill: col, left: Math.cos(ang) * dist, top: Math.sin(ang) * dist, angle: Math.random() * 360, originX: 'center', originY: 'center' });
      }
      objs.push(deco);
    }
    return objs;
  }

  // "글자 메탈+광원" 로고필터 — 이니셜 텍스트의 fill을 단색 대신 금속 밴드 그라디언트로 바꿈.
  // 예전엔 여기에 정의선(얇은 stroke)도 같이 둘렀었는데, A/O/B/D/R 같이 글자 안쪽에 뚫린 구멍
  // (카운터)이 있는 글자는 그 구멍의 윤곽선까지 stroke가 따라 그려져서, 꽉 찬 글자 속에 작은
  // 세모/네모 윤곽선이 유령처럼 겹쳐 보이는 버그가 있었음(폰트를 바꿔도 똑같이 나는 문제라 폰트
  // 탓이 아니라 stroke 자체가 원인) — 그래서 stroke 없이 그라디언트 채우기만 씀.
  function applyTextMetalEffect(textObj, palette){
    textObj.set('fill', makeMetalBandGradient(textObj.height, palette));
  }

  // 이니셜 텍스트 오브젝트를 새로 하나 만듦. "테두리" 필터가 켜지면(메탈효과와 완전 배타적) 얇은
  // 굵기(400)로 그린 뒤 applyOuterBorder로 통일된 바깥 테두리를 입힘 — 얇은 굵기를 쓰는 이유는,
  // K/M처럼 획이 만나는 글자에 굵은 글씨(800) 위로 두꺼운 테두리를 얹으면 원래도 두꺼운 획이
  // 테두리만큼 더 부풀어서 대각선/모서리가 겹치며 "덩어리"처럼 뭉쳐 보이는 문제가 있었기 때문.
  // 배지 안에 들어갈 땐 자간을 좁게 잡아서(20) 원/사각 배지 중앙에 잘 맞게 하고, 배지가 없을 땐
  // 넉넉히(80) 둬서 글자가 안 붙어 보이게 함. 또한 fabric은 charSpacing이 있으면 마지막 글자
  // 뒤에도 자간만큼의 빈 공간을 더해서 전체 폭을 계산하는 특성이 있어, originX:'center'로 놓으면
  // 실제 보이는 글자가 그 빈 공간의 절반만큼 한쪽으로 쏠려 보임(특히 배지 중앙정렬에서 눈에 띔) —
  // 그 절반만큼 반대로 밀어서 실제 글자가 배지/그룹 중앙에 정확히 오도록 보정함.
  // 도형 채우기만 있는 단순 "플랫" 배지 — 그라디언트/광원 없이 단색 하나만 쓰는 가장 기본 배지.
  // effectMode가 'none'(아무 특수효과 없음)일 때 씀 — 메탈 배지와 뚜렷이 구분되는 밋밋한 기본형.
  function buildFlatBadge(shapeKind, w, h, rx, ry, color){
    return makeBadgeShapeObject(shapeKind, w, h, rx, ry, color, {
      stroke: 'rgba(0,0,0,0.15)', strokeWidth: Math.max(1, Math.max(w, h) * 0.006)
    });
  }

  function buildInitialsText(text, style, palette){
    var hasBadge = !!(style && style.withBadge);
    var mode = style ? style.effectMode : 'none';
    // single/double 테두리 모드는 글자 자체도 (한 겹) 바깥 테두리로 그림. clump/glitch/emboss
    // 모드는 이 함수를 아예 쓰지 않고 각자 전용 빌더로 별도 처리하므로 여기서 신경 쓸 필요 없음.
    var isBorderText = mode === 'borderSingle' || mode === 'borderDouble';
    var t = new fabric.IText(text, {
      left: 0, top: 0, originX: 'center', originY: 'center',
      fontFamily: 'Montserrat', fontWeight: isBorderText ? '400' : '800',
      fontSize: 96, fill: palette ? palette.textColor : '#222222', charSpacing: hasBadge ? 20 : 80
    });
    if (isBorderText) {
      applyOuterBorder(t, style.borderColor, style.borderStrokeWidthPx);
      t.set('charSpacing', t.charSpacing + Math.round(style.borderStrokeWidthPx * 12)); // 두꺼운 테두리가 옆 글자와 안 붙게 자간 추가 확보
    } else if (mode === 'metal') {
      if (style.textMetal) applyTextMetalEffect(t, style.textPalette || palette || pickRandomPalette());
    } else if (mode === 'gradientText') {
      // 신규 필터 3) 비비드 그라디언트 텍스트 — 메탈과 달리 흰 밴드 없는 매끈한 2색 그라디언트
      t.set('fill', makeVividTextGradient(t.height, style.vividColorA, style.vividColorB));
    } else if (mode === 'neon') {
      t.set('fill', style.vividColorA); // 어두운 네온 배지 위에서 도드라지는 비비드 컬러 글자
    } else if (mode === 'duotone' || mode === 'sunburst') {
      t.set('fill', '#ffffff'); // 컬러가 화려한 배지 위라 흰색이 제일 잘 읽힘
    } else if (mode === 'wobble') {
      t.set('fill', style.vividColorA);
    } else if (mode === 'dots') {
      t.set('fill', '#232323'); // 파스텔 도트 배경 위라 어두운 글자가 잘 읽힘
    } else if (mode === 'glass') {
      t.set('fill', style.vividColorA);
    } else if (mode === 'confetti') {
      t.set('fill', palette ? palette.bandDark : '#242424');
    }
    var cs = t.charSpacing || 0;
    if (cs) {
      var trailingGapPx = (cs / 1000) * t.fontSize;
      t.set('left', (t.left || 0) + trailingGapPx / 2);
    }
    return t;
  }

  // ---------- "한글 전용" 로고 모드용 필터 10종 (영어/로마자 없이 한글 이름 그대로 표시) ----------
  // 배지가 필요한 필터는 위에서 만든 신규 10종 빌더(buildNeonBadge 등)를 그대로 재사용함 —
  // 그 함수들이 전부 shapeKind/w/h 파라미터만으로 도형을 그리는 구조라 한글이든 영어든 무관함.
  var KOREAN_FILTERS = ['metal', 'neon', 'duotone', 'gradientText', 'sunburst', 'glitch', 'wobble', 'dots', 'glass', 'border'];
  function pickRandomKoreanFilter(){
    return KOREAN_FILTERS[Math.floor(Math.random() * KOREAN_FILTERS.length)];
  }

  // 한글 이름 텍스트 오브젝트 하나를 만듦(글리치처럼 여러 겹인 경우는 별도 처리하므로 여기서 안 다룸).
  // Black Han Sans는 굵기가 하나뿐인 초굵은 서체라 테두리 필터와는 안 맞아서(획이 뭉침),
  // 테두리 모드일 때만 얇은 Noto Sans KR(400)로 바꿈 — 영어 이니셜 쪽과 같은 이유.
  function buildKoreanNameText(text, filterMode, style, fontSize){
    var useThinFont = filterMode === 'border';
    var t = new fabric.IText(text, {
      left: 0, top: 0, originX: 'center', originY: 'center',
      fontFamily: useThinFont ? 'Noto Sans KR' : 'Black Han Sans',
      fontSize: fontSize, charSpacing: 20,
      fill: '#222222'
    });
    if (filterMode === 'metal') {
      applyTextMetalEffect(t, style.textPalette || style.palette || pickRandomPalette());
    } else if (filterMode === 'gradientText') {
      t.set('fill', makeVividTextGradient(t.height, style.vividColorA, style.vividColorB));
    } else if (filterMode === 'neon' || filterMode === 'wobble' || filterMode === 'glass') {
      t.set('fill', style.vividColorA);
    } else if (filterMode === 'duotone' || filterMode === 'sunburst') {
      t.set('fill', '#ffffff');
    } else if (filterMode === 'dots') {
      t.set('fill', '#232323');
    } else if (filterMode === 'border') {
      applyOuterBorder(t, style.borderColor, style.borderStrokeWidthPx * 0.55); // 한글은 획이 많아 두께를 살짝 줄임
    }
    var cs = t.charSpacing || 0;
    if (cs) {
      var trailingGapPx = (cs / 1000) * t.fontSize;
      t.set('left', (t.left || 0) + trailingGapPx / 2);
    }
    return t;
  }

  // 한글 로고용 배지를 필터 모드에 맞춰 만들어서 배열로 반환(배지가 필요 없는 모드는 호출 안 함)
  function buildKoreanBadge(shapeKind, w, h, rx, ry, filterMode, style, palette){
    if (filterMode === 'metal') return buildMetalBadge(shapeKind, w, h, rx, ry, palette, style.withGlow);
    if (filterMode === 'neon') return buildNeonBadge(shapeKind, w, h, rx, ry, style.vividColorA);
    if (filterMode === 'duotone') return buildDuotoneBadge(shapeKind, w, h, rx, ry, style.vividColorA, style.vividColorB);
    if (filterMode === 'sunburst') return buildSunburstBadge(w, h, style.vividColorA, style.vividColorB);
    if (filterMode === 'wobble') return buildWobbleBadge(shapeKind, w, h, rx, ry, style.vividColorA, style.borderStrokeWidthPx);
    if (filterMode === 'dots') {
      var dotsBg = 'hsl(' + Math.floor(Math.random() * 360) + ',35%,90%)';
      return [buildDotPatternBadge(shapeKind, w, h, rx, ry, dotsBg, style.vividColorA)];
    }
    if (filterMode === 'glass') return buildGlassBadge(shapeKind, w, h, rx, ry, style.vividColorA);
    if (filterMode === 'border') return [buildBorderBadge(shapeKind, w, h, rx, ry, style.borderColor, style.borderStrokeWidthPx)];
    return [];
  }


  // 입력한 한글 이름(단어 목록)에 업종을 짐작할 수 있는 키워드가 들어있으면, 그 업종을 상징하는
  // 작은 아이콘을 이니셜 글자 오른쪽 옆에 함께 넣어줌. 아이콘은 이미지가 아니라 원/사각/삼각형
  // 등 기본 도형만으로 그린 단순한 라인/실루엣 아이콘이라 로고 색상에 맞춰 자유롭게 물들일 수 있음.
  // 매칭되는 키워드가 없으면 억지로 아무 아이콘이나 붙이지 않고 그냥 생략함.
  function buildCoffeeIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.62, height: s * 0.56, rx: s * 0.08, ry: s * 0.08, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.16, left: s * 0.28, top: s * 0.02, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.07 }),
      new fabric.Circle({ radius: s * 0.045, left: -s * 0.10, top: -s * 0.34, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.045, left: s * 0.08, top: -s * 0.30, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildBoltIcon(color, s){
    var pts = [
      { x: s * 0.08,  y: -s * 0.5 }, { x: -s * 0.22, y: s * 0.05 }, { x: -s * 0.02, y: s * 0.05 },
      { x: -s * 0.08, y: s * 0.5 },  { x: s * 0.22,  y: -s * 0.05 }, { x: s * 0.02,  y: -s * 0.05 }
    ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildFlowerIcon(color, s){
    var objs = [], petalR = s * 0.22, orbit = s * 0.28;
    for (var i = 0; i < 5; i++) {
      var ang = (Math.PI * 2 / 5) * i - Math.PI / 2;
      objs.push(new fabric.Circle({ radius: petalR, left: Math.cos(ang) * orbit, top: Math.sin(ang) * orbit, originX: 'center', originY: 'center', fill: color, opacity: 0.85 }));
    }
    objs.push(new fabric.Circle({ radius: s * 0.14, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }));
    return objs;
  }
  function buildDumbbellIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.62, height: s * 0.11, rx: s * 0.02, ry: s * 0.02, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.16, height: s * 0.46, rx: s * 0.03, ry: s * 0.03, left: -s * 0.36, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.16, height: s * 0.46, rx: s * 0.03, ry: s * 0.03, left: s * 0.36, top: 0, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildCrossIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.24, height: s * 0.66, rx: s * 0.04, ry: s * 0.04, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.66, height: s * 0.24, rx: s * 0.04, ry: s * 0.04, left: 0, top: 0, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildHouseIcon(color, s){
    return [
      new fabric.Triangle({ width: s * 0.66, height: s * 0.34, left: 0, top: -s * 0.2, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.5, height: s * 0.36, left: 0, top: s * 0.14, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.14, height: s * 0.2, left: 0, top: s * 0.24, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.65)' })
    ];
  }
  function buildCarIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.7, height: s * 0.28, rx: s * 0.08, ry: s * 0.08, left: 0, top: -s * 0.02, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.36, height: s * 0.2, rx: s * 0.06, ry: s * 0.06, left: 0, top: -s * 0.2, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.09, left: -s * 0.22, top: s * 0.16, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.09, left: s * 0.22, top: s * 0.16, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildMusicIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.14, left: -s * 0.1, top: s * 0.28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.06, height: s * 0.5, left: s * 0.06, top: -s * 0.02, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.22, height: s * 0.16, left: s * 0.17, top: -s * 0.24, angle: 90, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildCameraIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.66, height: s * 0.44, rx: s * 0.06, ry: s * 0.06, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.22, height: s * 0.12, rx: s * 0.03, ry: s * 0.03, left: -s * 0.14, top: -s * 0.22, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.14, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: 'transparent', stroke: 'rgba(255,255,255,0.8)', strokeWidth: s * 0.035 })
    ];
  }
  function buildPawIcon(color, s){
    return [
      new fabric.Ellipse({ rx: s * 0.22, ry: s * 0.18, left: 0, top: s * 0.12, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.09, left: -s * 0.2, top: -s * 0.16, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.1, left: -s * 0.06, top: -s * 0.26, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.1, left: s * 0.08, top: -s * 0.26, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.09, left: s * 0.2, top: -s * 0.16, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildScissorsIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.55, height: s * 0.07, left: 0, top: -s * 0.06, angle: 28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.55, height: s * 0.07, left: 0, top: -s * 0.06, angle: -28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.1, left: -s * 0.16, top: s * 0.24, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Circle({ radius: s * 0.1, left: s * 0.16, top: s * 0.24, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 })
    ];
  }
  function buildForkKnifeIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.07, height: s * 0.62, left: -s * 0.14, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.035, height: s * 0.16, left: -s * 0.18, top: -s * 0.28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.035, height: s * 0.16, left: -s * 0.14, top: -s * 0.28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.035, height: s * 0.16, left: -s * 0.10, top: -s * 0.28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.16, height: s * 0.3, left: s * 0.14, top: -s * 0.18, angle: 180, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.06, height: s * 0.32, left: s * 0.14, top: s * 0.16, originX: 'center', originY: 'center', fill: color })
    ];
  }

  // ---- 여기부터 업종 확장용 아이콘(단순 도형 조합, 12종 + 37종 = 총 49종) ----
  function buildBookIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.34, height: s * 0.5, rx: s * 0.02, ry: s * 0.02, left: -s * 0.17, top: 0, angle: -4, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.34, height: s * 0.5, rx: s * 0.02, ry: s * 0.02, left: s * 0.17, top: 0, angle: 4, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildPencilIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.16, height: s * 0.6, left: 0, top: -s * 0.02, angle: 28, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.16, height: s * 0.14, left: -s * 0.12, top: s * 0.28, angle: 208, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildBagIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.56, height: s * 0.42, rx: s * 0.04, ry: s * 0.04, left: 0, top: s * 0.1, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.14, left: 0, top: -s * 0.12, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.05 })
    ];
  }
  function buildShirtIcon(color, s){
    var pts = [
      { x: -s * 0.1, y: -s * 0.3 }, { x: -s * 0.28, y: -s * 0.14 }, { x: -s * 0.16, y: -s * 0.02 }, { x: -s * 0.16, y: s * 0.32 },
      { x: s * 0.16, y: s * 0.32 }, { x: s * 0.16, y: -s * 0.02 }, { x: s * 0.28, y: -s * 0.14 }, { x: s * 0.1, y: -s * 0.3 }
    ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildShoeIcon(color, s){
    var pts = [
      { x: -s * 0.3, y: s * 0.1 }, { x: -s * 0.3, y: s * 0.22 }, { x: s * 0.32, y: s * 0.22 }, { x: s * 0.32, y: s * 0.04 },
      { x: s * 0.1, y: s * 0.02 }, { x: -s * 0.02, y: -s * 0.14 }, { x: -s * 0.2, y: -s * 0.06 }
    ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildGemIcon(color, s){
    var pts = [ { x: 0, y: -s * 0.32 }, { x: s * 0.26, y: -s * 0.06 }, { x: s * 0.14, y: s * 0.32 }, { x: -s * 0.14, y: s * 0.32 }, { x: -s * 0.26, y: -s * 0.06 } ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildWrenchIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.55, height: s * 0.13, rx: s * 0.04, ry: s * 0.04, left: 0, top: 0, angle: -40, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.13, left: -s * 0.22, top: s * 0.18, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.06 })
    ];
  }
  function buildGearIcon(color, s){
    var objs = [], teeth = 8, R = s * 0.3;
    for (var i = 0; i < teeth; i++) {
      var ang = (Math.PI * 2 / teeth) * i;
      objs.push(new fabric.Rect({ width: s * 0.09, height: s * 0.1, left: Math.cos(ang) * R, top: Math.sin(ang) * R, angle: (ang * 180 / Math.PI) + 90, originX: 'center', originY: 'center', fill: color }));
    }
    objs.push(new fabric.Circle({ radius: s * 0.22, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }));
    objs.push(new fabric.Circle({ radius: s * 0.09, left: 0, top: 0, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.6)' }));
    return objs;
  }
  function buildPhoneIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.36, height: s * 0.62, rx: s * 0.07, ry: s * 0.07, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.03, left: 0, top: s * 0.24, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.7)' })
    ];
  }
  function buildLaptopIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.5, height: s * 0.34, rx: s * 0.03, ry: s * 0.03, left: 0, top: -s * 0.1, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.64, height: s * 0.08, rx: s * 0.03, ry: s * 0.03, left: 0, top: s * 0.14, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildCloudIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.16, left: -s * 0.14, top: s * 0.04, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.2, left: s * 0.04, top: -s * 0.04, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.14, left: s * 0.22, top: s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.5, height: s * 0.16, rx: s * 0.08, ry: s * 0.08, left: s * 0.02, top: s * 0.12, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildLeafIcon(color, s){
    return [ new fabric.Ellipse({ rx: s * 0.16, ry: s * 0.3, left: 0, top: 0, angle: 35, originX: 'center', originY: 'center', fill: color }) ];
  }
  function buildTreeIcon(color, s){
    return [
      new fabric.Triangle({ width: s * 0.5, height: s * 0.3, left: 0, top: -s * 0.18, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.4, height: s * 0.26, left: 0, top: -s * 0.02, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.1, height: s * 0.2, left: 0, top: s * 0.26, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildSunIcon(color, s){
    var objs = [ new fabric.Circle({ radius: s * 0.18, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }) ];
    for (var i = 0; i < 8; i++) {
      var ang = (Math.PI * 2 / 8) * i;
      objs.push(new fabric.Rect({ width: s * 0.05, height: s * 0.12, left: Math.cos(ang) * s * 0.3, top: Math.sin(ang) * s * 0.3, angle: (ang * 180 / Math.PI) + 90, originX: 'center', originY: 'center', fill: color }));
    }
    return objs;
  }
  function buildDropIcon(color, s){
    return [
      new fabric.Triangle({ width: s * 0.3, height: s * 0.24, left: 0, top: -s * 0.18, angle: 180, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.18, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildFlameIcon(color, s){
    var pts = [ { x: 0, y: -s * 0.34 }, { x: s * 0.16, y: -s * 0.06 }, { x: s * 0.1, y: s * 0.06 }, { x: s * 0.2, y: s * 0.2 }, { x: 0, y: s * 0.34 }, { x: -s * 0.2, y: s * 0.2 }, { x: -s * 0.1, y: s * 0.06 }, { x: -s * 0.16, y: -s * 0.06 } ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildAnchorIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.09, left: 0, top: -s * 0.28, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.05 }),
      new fabric.Rect({ width: s * 0.07, height: s * 0.5, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.4, height: s * 0.07, left: 0, top: s * 0.02, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.08, left: -s * 0.18, top: s * 0.24, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.08, left: s * 0.18, top: s * 0.24, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildPlaneIcon(color, s){
    return [
      new fabric.Triangle({ width: s * 0.6, height: s * 0.34, left: 0, top: 0, angle: 90, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.24, height: s * 0.2, left: s * 0.06, top: s * 0.16, angle: 200, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildShipIcon(color, s){
    return [
      new fabric.Polygon([{ x: -s * 0.3, y: s * 0.1 }, { x: s * 0.3, y: s * 0.1 }, { x: s * 0.2, y: s * 0.3 }, { x: -s * 0.2, y: s * 0.3 }], { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }),
      new fabric.Rect({ width: s * 0.05, height: s * 0.4, left: 0, top: -s * 0.14, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.18, height: s * 0.22, left: s * 0.05, top: -s * 0.22, angle: 90, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildBicycleIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.16, left: -s * 0.2, top: s * 0.14, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Circle({ radius: s * 0.16, left: s * 0.2, top: s * 0.14, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Rect({ width: s * 0.34, height: s * 0.045, left: -s * 0.03, top: s * 0.02, angle: -14, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.24, height: s * 0.045, left: s * 0.1, top: s * 0.02, angle: 35, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.2, height: s * 0.045, left: -s * 0.14, top: -s * 0.04, angle: 60, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildTruckIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.42, height: s * 0.24, rx: s * 0.03, ry: s * 0.03, left: -s * 0.1, top: -s * 0.02, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.22, height: s * 0.2, rx: s * 0.03, ry: s * 0.03, left: s * 0.24, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.08, left: -s * 0.2, top: s * 0.16, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.08, left: s * 0.2, top: s * 0.16, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildBriefcaseIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.56, height: s * 0.36, rx: s * 0.04, ry: s * 0.04, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.2, height: s * 0.1, left: 0, top: -s * 0.18, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Rect({ width: s * 0.56, height: s * 0.04, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.6)' })
    ];
  }
  function buildGradCapIcon(color, s){
    return [
      new fabric.Triangle({ width: s * 0.6, height: s * 0.14, left: 0, top: -s * 0.1, angle: 180, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.3, height: s * 0.14, left: 0, top: s * 0.02, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.03, height: s * 0.2, left: s * 0.2, top: s * 0.14, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.03, left: s * 0.2, top: s * 0.24, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildRulerIcon(color, s){
    var objs = [ new fabric.Rect({ width: s * 0.66, height: s * 0.16, rx: s * 0.02, ry: s * 0.02, left: 0, top: 0, angle: -20, originX: 'center', originY: 'center', fill: color }) ];
    for (var i = -2; i <= 2; i++) {
      objs.push(new fabric.Rect({ width: s * 0.02, height: s * 0.06, left: i * s * 0.11, top: -s * 0.02, angle: -20, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.7)' }));
    }
    return objs;
  }
  function buildChartIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.14, height: s * 0.24, left: -s * 0.2, top: s * 0.14, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.14, height: s * 0.4, left: 0, top: s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.14, height: s * 0.56, left: s * 0.2, top: -s * 0.02, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildEnvelopeIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.64, height: s * 0.44, rx: s * 0.03, ry: s * 0.03, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.5, height: s * 0.24, left: 0, top: -s * 0.06, angle: 180, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.55)' })
    ];
  }
  function buildGlobeIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.28, left: 0, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Ellipse({ rx: s * 0.12, ry: s * 0.28, left: 0, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.035 }),
      new fabric.Rect({ width: s * 0.56, height: s * 0.035, left: 0, top: 0, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildMapPinIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.22, left: 0, top: -s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.2, height: s * 0.24, left: 0, top: s * 0.2, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.08, left: 0, top: -s * 0.06, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.7)' })
    ];
  }
  function buildKeyIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.14, left: -s * 0.2, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.06 }),
      new fabric.Rect({ width: s * 0.36, height: s * 0.06, left: s * 0.1, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.05, height: s * 0.12, left: s * 0.24, top: s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.05, height: s * 0.16, left: s * 0.32, top: s * 0.08, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildShieldIcon(color, s){
    var pts = [ { x: 0, y: -s * 0.32 }, { x: s * 0.24, y: -s * 0.2 }, { x: s * 0.24, y: s * 0.06 }, { x: 0, y: s * 0.32 }, { x: -s * 0.24, y: s * 0.06 }, { x: -s * 0.24, y: -s * 0.2 } ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildTrophyIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.3, height: s * 0.3, rx: s * 0.04, ry: s * 0.04, left: 0, top: -s * 0.08, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.1, left: -s * 0.2, top: -s * 0.14, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Circle({ radius: s * 0.1, left: s * 0.2, top: -s * 0.14, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Rect({ width: s * 0.08, height: s * 0.14, left: 0, top: s * 0.12, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.3, height: s * 0.06, rx: s * 0.02, ry: s * 0.02, left: 0, top: s * 0.2, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildBalloonIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.22, left: 0, top: -s * 0.1, originX: 'center', originY: 'center', fill: color }),
      new fabric.Triangle({ width: s * 0.08, height: s * 0.08, left: 0, top: s * 0.12, angle: 180, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildUmbrellaIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.3, left: 0, top: -s * 0.08, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.05, height: s * 0.36, left: 0, top: s * 0.2, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildGlassesIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.14, left: -s * 0.16, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Circle({ radius: s * 0.14, left: s * 0.16, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.045 }),
      new fabric.Rect({ width: s * 0.1, height: s * 0.03, left: 0, top: 0, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildClockIcon(color, s){
    return [
      new fabric.Circle({ radius: s * 0.3, left: 0, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: color, strokeWidth: s * 0.05 }),
      new fabric.Rect({ width: s * 0.04, height: s * 0.18, left: 0, top: -s * 0.08, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.04, height: s * 0.14, left: s * 0.06, top: -s * 0.02, angle: 70, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildCrownIcon(color, s){
    var pts = [ { x: -s * 0.28, y: s * 0.14 }, { x: -s * 0.28, y: -s * 0.06 }, { x: -s * 0.14, y: s * 0.06 }, { x: 0, y: -s * 0.22 }, { x: s * 0.14, y: s * 0.06 }, { x: s * 0.28, y: -s * 0.06 }, { x: s * 0.28, y: s * 0.14 } ];
    return [ new fabric.Polygon(pts, { fill: color, left: 0, top: 0, originX: 'center', originY: 'center' }) ];
  }
  function buildCakeIcon(color, s){
    return [
      new fabric.Rect({ width: s * 0.56, height: s * 0.24, rx: s * 0.03, ry: s * 0.03, left: 0, top: s * 0.12, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.36, height: s * 0.16, rx: s * 0.03, ry: s * 0.03, left: 0, top: -s * 0.06, originX: 'center', originY: 'center', fill: color }),
      new fabric.Rect({ width: s * 0.025, height: s * 0.1, left: 0, top: -s * 0.2, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.03, left: 0, top: -s * 0.26, originX: 'center', originY: 'center', fill: color })
    ];
  }
  function buildPizzaIcon(color, s){
    return [
      new fabric.Triangle({ width: s * 0.5, height: s * 0.5, left: 0, top: 0, originX: 'center', originY: 'center', fill: color }),
      new fabric.Circle({ radius: s * 0.035, left: -s * 0.06, top: s * 0.02, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.7)' }),
      new fabric.Circle({ radius: s * 0.035, left: s * 0.06, top: s * 0.1, originX: 'center', originY: 'center', fill: 'rgba(255,255,255,0.7)' })
    ];
  }

  // 업종을 짐작할 수 있는 한글 키워드 → 아이콘. 위에서부터 먼저 매칭되는 걸 씀.
  var ICON_LIBRARY = [
    { id: 'coffee',    keywords: ['커피', '카페', '에스프레소', '라떼'],              build: buildCoffeeIcon },
    { id: 'bolt',      keywords: ['전자', '일렉트로닉스', '전기', '파워'],            build: buildBoltIcon },
    { id: 'flower',    keywords: ['꽃', '플라워', '플로리스트', '화원'],              build: buildFlowerIcon },
    { id: 'dumbbell',  keywords: ['헬스', '피트니스', '체육', '짐'],                  build: buildDumbbellIcon },
    { id: 'cross',     keywords: ['병원', '의원', '클리닉', '약국', '치과', '메디컬'], build: buildCrossIcon },
    { id: 'house',     keywords: ['부동산', '공인중개사', '리얼티'],                  build: buildHouseIcon },
    { id: 'car',       keywords: ['자동차', '모터스', '카센터', '오토'],              build: buildCarIcon },
    { id: 'music',     keywords: ['뮤직', '음악', '사운드'],                         build: buildMusicIcon },
    { id: 'camera',    keywords: ['포토', '사진', '스냅', '카메라', '스튜디오'],       build: buildCameraIcon },
    { id: 'paw',       keywords: ['펫', '애견', '강아지', '고양이', '동물병원'],       build: buildPawIcon },
    { id: 'scissors',  keywords: ['미용', '헤어', '뷰티', '살롱'],                    build: buildScissorsIcon },
    { id: 'fork',      keywords: ['푸드', '음식', '레스토랑', '식당', '키친', '다이닝'], build: buildForkKnifeIcon },
    { id: 'book',      keywords: ['학원', '교육', '과외', '도서관', '서점', '출판', '북'], build: buildBookIcon },
    { id: 'pencil',    keywords: ['디자인', '편집', '인쇄', '아트웍'],                build: buildPencilIcon },
    { id: 'bag',       keywords: ['쇼핑', '편집샵', '부티크', '마켓', '스토어'],       build: buildBagIcon },
    { id: 'shirt',     keywords: ['의류', '패션', '어패럴'],                         build: buildShirtIcon },
    { id: 'shoe',      keywords: ['신발', '슈즈', '운동화'],                         build: buildShoeIcon },
    { id: 'gem',       keywords: ['보석', '주얼리', '쥬얼리', '액세서리'],            build: buildGemIcon },
    { id: 'wrench',    keywords: ['정비', '공업사', '철물', '설비', '수리'],          build: buildWrenchIcon },
    { id: 'gear',      keywords: ['기계', '엔지니어링', '산업', '제조'],              build: buildGearIcon },
    { id: 'phone',     keywords: ['통신', '모바일', '텔레콤'],                       build: buildPhoneIcon },
    { id: 'laptop',    keywords: ['컴퓨터', '노트북', '소프트웨어'],                  build: buildLaptopIcon },
    { id: 'cloud',     keywords: ['클라우드', '데이터', '서버'],                     build: buildCloudIcon },
    { id: 'leaf',      keywords: ['친환경', '에코', '그린', '유기농'],                build: buildLeafIcon },
    { id: 'tree',      keywords: ['조경', '가드닝', '정원'],                         build: buildTreeIcon },
    { id: 'sun',       keywords: ['태양광', '솔라', '에너지'],                       build: buildSunIcon },
    { id: 'drop',      keywords: ['워터', '정수', '생수'],                          build: buildDropIcon },
    { id: 'flame',     keywords: ['고기', '구이', '바베큐', '숯불'],                  build: buildFlameIcon },
    { id: 'anchor',    keywords: ['마린', '요트', '항구'],                          build: buildAnchorIcon },
    { id: 'plane',     keywords: ['항공', '여행사', '트래블'],                       build: buildPlaneIcon },
    { id: 'ship',      keywords: ['조선', '선박', '항만'],                          build: buildShipIcon },
    { id: 'bicycle',   keywords: ['자전거', '바이크샵'],                            build: buildBicycleIcon },
    { id: 'truck',     keywords: ['물류', '운송', '택배', '화물'],                   build: buildTruckIcon },
    { id: 'briefcase', keywords: ['컨설팅', '법인', '오피스', '비즈니스'],            build: buildBriefcaseIcon },
    { id: 'gradcap',   keywords: ['입시', '유학', '어학원'],                         build: buildGradCapIcon },
    { id: 'ruler',     keywords: ['수학', '회계', '세무', '측량'],                    build: buildRulerIcon },
    { id: 'chart',     keywords: ['마케팅', '투자', '증권', '펀드', '애널리틱스'],     build: buildChartIcon },
    { id: 'envelope',  keywords: ['우편', '메일', '편지'],                          build: buildEnvelopeIcon },
    { id: 'globe',     keywords: ['무역', '수출', '글로벌', '인터내셔널'],            build: buildGlobeIcon },
    { id: 'mappin',    keywords: ['투어', '네비게이션'],                            build: buildMapPinIcon },
    { id: 'key',       keywords: ['보안', '자물쇠', '열쇠'],                        build: buildKeyIcon },
    { id: 'shield',    keywords: ['경비', '보험', '시큐리티'],                       build: buildShieldIcon },
    { id: 'trophy',    keywords: ['수상', '대회', '우승', '시상식'],                  build: buildTrophyIcon },
    { id: 'balloon',   keywords: ['파티', '이벤트', '파티룸'],                       build: buildBalloonIcon },
    { id: 'umbrella',  keywords: ['우산', '레인', '장마'],                          build: buildUmbrellaIcon },
    { id: 'glasses',   keywords: ['안경', '옵티컬', '렌즈'],                        build: buildGlassesIcon },
    { id: 'clock',     keywords: ['시계', '워치', '타임'],                          build: buildClockIcon },
    { id: 'crown',     keywords: ['로얄', '프리미엄', '명품', '퀸', '킹'],            build: buildCrownIcon },
    { id: 'cake',      keywords: ['베이커리', '제과', '디저트', '케이크'],            build: buildCakeIcon },
    { id: 'pizza',     keywords: ['피자', '이탈리안'],                              build: buildPizzaIcon }
  ];

  // 원래 한글 단어들(예: ["대신","커피"])을 합쳐서 키워드가 들어있는지 검사, 첫 매칭을 반환
  function pickIconForWords(words){
    var joined = (words || []).join(' ');
    for (var i = 0; i < ICON_LIBRARY.length; i++) {
      var entry = ICON_LIBRARY[i];
      for (var j = 0; j < entry.keywords.length; j++) {
        if (joined.indexOf(entry.keywords[j]) !== -1) return entry;
      }
    }
    return null;
  }



  // ---------- 입력창 열기/닫기 ----------
  function setApplyEnabled(enabled){
    applyLogoBtn.disabled = !enabled;
    if (randomLogoBtn) randomLogoBtn.disabled = !enabled;
  }

  function updatePreview(){
    var data = buildLogoData(logoNameInput.value);
    if (!data) {
      logoInputToolbarHint.textContent = DEFAULT_HINT;
      setApplyEnabled(false);
      return;
    }
    var iconEntry = pickIconForWords(data.words);
    if (iconEntry) {
      logoInputToolbarHint.textContent = '미리보기 — 🔤 로고 만들기: 🔗 ' + iconEntry.id + ' 아이콘+"' + data.words.join(' ') + '"   🎲 랜덤은 이 아이콘 버전과 영어 이니셜(' + data.initials + ') 버전이 섞여 나와요';
    } else {
      logoInputToolbarHint.textContent = '미리보기 — ' + data.initials + ' / ' + data.full;
    }
    setApplyEnabled(true);
  }

  function openLogoInputToolbar(){
    shapeMenu.classList.add('hidden');
    logoInputToolbarHint.textContent = DEFAULT_HINT;
    logoNameInput.value = '';
    setApplyEnabled(false);
    logoInputToolbar.classList.remove('hidden');
    logoNameInput.focus();
  }

  addLogoBtn.addEventListener('click', function(e){
    if (e) e.stopPropagation(); // 부모(#shapeMenu)의 공통 클릭 핸들러와 겹치지 않도록 분리
    openLogoInputToolbar();
  });
  cancelLogoBtn.addEventListener('click', function(){
    logoInputToolbar.classList.add('hidden');
  });
  logoNameInput.addEventListener('input', updatePreview);
  logoNameInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !applyLogoBtn.disabled) applyLogoBtn.click();
  });

  // ---------- 캔버스에 로고 오브젝트 추가 ----------
  // 이름에 업종 키워드가 매칭되면(iconEntry) 영어 이니셜/로마자 없이 "아이콘 + 한글 상호"만으로
  // 디자인함 — 어차피 아이콘이 업종을 알려주니 영어로 축약할 필요가 없어서 훨씬 읽기 쉬움.
  // 키워드가 매칭되지 않으면 기존처럼 영어 이니셜(+로마자 풀네임, 배지 등) 로고로 만듦.
  // style이 없으면(plain 적용) 기본 색만 쓰고, 있으면({palette, shape, withGlow, showSubtitle,
  // withBadge, textMetal, textPalette}) 배지/메탈효과 등을 반영함. 생성된 그룹을 반환함(랜덤 교체용).
  function insertLogoToCanvas(data, style){
    var canvas = EP.canvas;
    if (!canvas) { alert('캔버스를 찾을 수 없어요.'); return null; }

    var zoom = canvas.getZoom() || 1;
    var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

    var palette = style && style.palette;
    var iconEntry = pickIconForWords(data.words);
    var useIconMode = !!iconEntry && (!style || style.useIcon !== false);
    var group;

    if (style && style.koreanOnlyMode) {
      // ---- "한글 전용" 로고 모드 — 영어 이니셜/로마자를 전혀 안 쓰고 입력한 한글 이름을 그대로
      // 큼직하게 씀. KOREAN_FILTERS 10종 중 하나(rollBadgeStyle에서 미리 뽑힌 style.koreanFilterMode)
      // 를 적용하는데, badge/텍스트 빌더는 전부 신규 10종 필터에서 쓴 것과 같은 함수를 재사용함
      // (buildKoreanBadge/buildKoreanNameText 참고). 로마자가 아예 없으므로 하단 부제목 줄도 없음.
      var kMode = style.koreanFilterMode;
      var kText = data.words.join(' ');
      var kFontSize = 64;
      var kWithBadge = (kMode !== 'gradientText' && kMode !== 'glitch');
      var kGroupObjects = [];
      var kNameText, kGlitchObjs, kSizingRef;

      if (kMode === 'glitch') {
        kGlitchObjs = buildGlitchText(kText, kFontSize, 20, 'Black Han Sans');
        kSizingRef = { width: kGlitchObjs[kGlitchObjs.length - 1].width + kFontSize * 0.15, height: kFontSize * 1.15 };
      } else {
        kNameText = buildKoreanNameText(kText, kMode, style, kFontSize);
        kSizingRef = kNameText;
      }

      if (kWithBadge) {
        var kDims = buildBadgeDims(style.shape, kSizingRef);
        kGroupObjects = kGroupObjects.concat(buildKoreanBadge(style.shape, kDims.w, kDims.h, kDims.rx, kDims.ry, kMode, style, palette));
      }

      if (kMode === 'glitch') {
        kGlitchObjs.forEach(function(o){ kGroupObjects.push(o); });
      } else {
        kGroupObjects.push(kNameText);
      }

      group = new fabric.Group(kGroupObjects, {
        left: centerX, top: centerY, originX: 'center', originY: 'center'
      });
      group.isLogoGroup = true;
      group.logoName = data.words.join(' ');
      group.logoMode = 'korean-only';
      group.logoKoreanFilter = kMode;
    } else if (useIconMode) {
      // ---- 아이콘 + 한글 상호 (영어/로마자 없음) ----
      var useMetal = !!(style && style.textMetal);
      var textPalette = (style && style.textPalette) || palette;
      var flatColor = palette ? palette.bandDark : '#242424';

      var nameText = new fabric.IText(data.words.join(' '), {
        left: 0, top: 0, originX: 'center', originY: 'center',
        fontFamily: 'Black Han Sans', fontSize: 58, charSpacing: 30,
        fill: flatColor
      });
      var iconColor = flatColor;
      if (useMetal) {
        applyTextMetalEffect(nameText, textPalette || pickRandomPalette());
        iconColor = (textPalette || palette).bandDark;
      }

      var iconSize = nameText.height * 0.9;
      var iconGroup = new fabric.Group(iconEntry.build(iconColor, iconSize), { originX: 'center', originY: 'center' });

      var iconGap = 18;
      var totalW = iconGroup.width + iconGap + nameText.width;
      iconGroup.set({ left: -totalW / 2 + iconGroup.width / 2, top: 0 });
      nameText.set({ left: totalW / 2 - nameText.width / 2, top: 0 });
      // charSpacing 트레일링 갭 보정(buildInitialsText와 동일한 이유)
      var nameCs = nameText.charSpacing || 0;
      if (nameCs) {
        nameText.set('left', nameText.left + (nameCs / 1000) * nameText.fontSize / 2);
      }

      group = new fabric.Group([iconGroup, nameText], {
        left: centerX, top: centerY, originX: 'center', originY: 'center'
      });
      group.isLogoGroup = true;
      group.logoName = data.words.join(' ');
      group.logoIcon = iconEntry.id;
      group.logoMode = 'icon-wordmark';
      if (style) {
        group.logoMetalPalette = style.palette.id;
        group.logoTextMetal = useMetal;
      }
    } else {
      // ---- 기존 영어 이니셜(+로마자) 로고 ----
      var effectMode = style ? style.effectMode : 'none';
      var borderMode = style ? style.borderMode : 'none';
      // "뭉침" 모드는 글자가 2개 이상일 때만 의미가 있음 — 이니셜이 한 글자뿐이면 대신 단일
      // 테두리 모드로 자연스럽게 대체함(요청사항: 글자 2개 이상일 때만 뭉침 필터 적용)
      if (borderMode === 'clump' && data.initials.length < 2) { borderMode = 'single'; effectMode = 'borderSingle'; }
      var isClump = borderMode === 'clump';
      var isMultiText = effectMode === 'glitch' || effectMode === 'emboss'; // 텍스트가 여러 겹 오브젝트로 구성되는 모드

      var groupObjects = [];
      var gap = 26;
      var contentHalf, dims;
      var initialsText, clumpObjs, multiTextObjs, sizingRef;

      if (isClump) {
        // "글자 뭉침" 필터 — 이니셜을 한 글자씩 쪼개 각각 같은 색 바깥 테두리를 입히고
        // 무작위 위치·각도로 겹쳐 배치. 배지 크기 계산용으로 대략적인 정사각형 크기를 추정함.
        var spreadRadius = 96 * 0.34;
        clumpObjs = buildClumpedLetters(data.initials.split(''), style.borderColor, style.borderStrokeWidthPx, 96, spreadRadius);
        var clumpFootprint = 96 * 0.95 + spreadRadius * 2;
        sizingRef = { width: clumpFootprint, height: clumpFootprint };
      } else if (isMultiText) {
        // "글리치"/"플랫 엠보스" 필터 — 글자를 2~3겹으로 살짝 어긋나게 겹쳐서 표현하므로
        // 배지 크기 계산은 폰트 크기 기준으로 대략 추정함(겹침 폭이 작아 실질적 차이 미미)
        if (effectMode === 'glitch') {
          multiTextObjs = buildGlitchText(data.initials, 96, 40);
        } else {
          multiTextObjs = buildFlatEmbossText(data.initials, 96, 40, style.vividColorA, style.vividColorB);
        }
        sizingRef = { width: multiTextObjs[multiTextObjs.length - 1].width + 96 * 0.1, height: 96 * 1.1 };
      } else {
        initialsText = buildInitialsText(data.initials, style, palette);
        sizingRef = initialsText;
      }

      if (style && style.withBadge) {
        dims = buildBadgeDims(style.shape, sizingRef);
        if (borderMode === 'double') {
          // "더블 테두리" 필터 — 색-흰-색 두 겹 링(buildDoubleBorderBadge 참고)
          groupObjects = groupObjects.concat(buildDoubleBorderBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, style.borderColor, style.borderStrokeWidthPx, style.doubleBorderGapRatio));
        } else if (borderMode === 'single' || isClump) {
          // "테두리" 필터(또는 뭉침 필터에 곁들인 배지) — 메탈 코드 경로를 전혀 타지 않고
          // buildBorderBadge만 사용(완전 분리), 색은 글자 테두리와 항상 동일하게 공유함
          groupObjects.push(buildBorderBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, style.borderColor, style.borderStrokeWidthPx));
        } else if (effectMode === 'neon') {
          groupObjects = groupObjects.concat(buildNeonBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, style.vividColorA));
        } else if (effectMode === 'duotone') {
          groupObjects = groupObjects.concat(buildDuotoneBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, style.vividColorA, style.vividColorB));
        } else if (effectMode === 'sunburst') {
          groupObjects = groupObjects.concat(buildSunburstBadge(dims.w, dims.h, style.vividColorA, style.vividColorB));
        } else if (effectMode === 'wobble') {
          groupObjects = groupObjects.concat(buildWobbleBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, style.vividColorA, style.borderStrokeWidthPx));
        } else if (effectMode === 'dots') {
          // 배경은 밝은 파스텔 톤(어두운 글자와 잘 대비되게), 점은 채도 높은 vividColorA로
          var dotsBg = 'hsl(' + Math.floor(Math.random() * 360) + ',35%,90%)';
          groupObjects.push(buildDotPatternBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, dotsBg, style.vividColorA));
        } else if (effectMode === 'glass') {
          groupObjects = groupObjects.concat(buildGlassBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, style.vividColorA));
        } else if (effectMode === 'confetti') {
          groupObjects.push(buildFlatBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, '#ffffff'));
          groupObjects = groupObjects.concat(buildConfettiDecor(dims.w, dims.h, 14));
        } else if (effectMode === 'metal') {
          groupObjects = groupObjects.concat(buildMetalBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, palette, style.withGlow));
        } else {
          // 'none' — 아무 특수효과도 없는 가장 기본적인 단색 플랫 배지
          groupObjects.push(buildFlatBadge(style.shape, dims.w, dims.h, dims.rx, dims.ry, palette.bandDark));
        }
        contentHalf = dims.h / 2;
        // 컨페티 장식은 배지 바깥 반경 약 1.48배까지 흩어지므로, 부제목이 그 위에 안 겹치도록 여유를 더 둠
        if (effectMode === 'confetti') contentHalf = Math.max(dims.w, dims.h) * 0.74;
      } else {
        contentHalf = sizingRef.height / 2;
      }

      if (isClump) {
        clumpObjs.forEach(function(o){ groupObjects.push(o); });
      } else if (isMultiText) {
        multiTextObjs.forEach(function(o){ groupObjects.push(o); });
      } else {
        groupObjects.push(initialsText);
      }

      var subTop = contentHalf + gap;

      var showSubtitle = !style || style.showSubtitle !== false;
      if (showSubtitle) {
        // 부제목 색: 어떤 특수효과든 부제목엔 그 효과 자체는 절대 적용 안 하고 평범한 단색
        // 글자로만 남기되, 색상만 각 필터의 대표색과 맞춰서 통일감을 줌
        var subColor = '#555555';
        if (style) {
          if (borderMode !== 'none') subColor = style.borderColor;
          else if (effectMode === 'metal') subColor = style.withBadge ? palette.bandDark : (style.textMetal ? style.textPalette.bandDark : palette.bandDark);
          else if (effectMode === 'none') subColor = style.withBadge ? palette.bandDark : palette.bandDark;
          else subColor = style.vividColorA; // neon/duotone/gradientText/sunburst/glitch/wobble/dots/glass/emboss/confetti
        }
        var fullNameText = new fabric.IText(data.full, {
          left: 0, top: subTop,
          originX: 'center', originY: 'center',
          fontFamily: 'Montserrat', fontWeight: '600',
          fontSize: 20, fill: subColor, charSpacing: 120
        });
        groupObjects.push(fullNameText);
      }

      group = new fabric.Group(groupObjects, {
        left: centerX, top: centerY,
        originX: 'center', originY: 'center'
      });
      group.isLogoGroup = true;
      group.logoName = data.words.join(' ');
      if (style) {
        group.logoMetalPalette = style.palette.id;
        group.logoBadgeShape = style.withBadge ? style.shape : null;
        group.logoGlow = !!style.withGlow;
        group.logoTextMetal = !!style.textMetal;
        group.logoBorderMode = borderMode;
        group.logoEffectMode = effectMode;
        group.logoSubtitle = showSubtitle;
      }
    }

    canvas.add(group);
    if (EP.bringGuideToFront) EP.bringGuideToFront();
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    if (EP.refreshEmptyHint) EP.refreshEmptyHint();

    return group;
  }

  applyLogoBtn.addEventListener('click', function(){
    var data = buildLogoData(logoNameInput.value);
    if (!data) { updatePreview(); return; }
    insertLogoToCanvas(data, null);
    if (EP.pushHistory) EP.pushHistory();
    logoInputToolbar.classList.add('hidden');
  });

  // 랜덤 로고 만들기: 누를 때마다 팔레트·모양·광원효과 조합을 새로 굴리고, 바로 전에
  // 랜덤으로 만든 로고가 아직 캔버스에 남아있으면 지운 뒤 그 자리에 새 걸 추가함(계속 눌러서
  // 여러 개가 쌓이지 않고, 매번 새로운 조합으로 교체되도록).
  var lastRandomGroup = null;
  if (randomLogoBtn) {
    randomLogoBtn.addEventListener('click', function(){
      var data = buildLogoData(logoNameInput.value);
      if (!data) { updatePreview(); return; }
      var canvas = EP.canvas;
      if (canvas && lastRandomGroup && canvas.getObjects().indexOf(lastRandomGroup) !== -1) {
        canvas.remove(lastRandomGroup);
      }
      var style = rollBadgeStyle();
      lastRandomGroup = insertLogoToCanvas(data, style);
      if (EP.pushHistory) EP.pushHistory();
      // 입력창은 닫지 않음 — 계속 눌러서 다른 조합으로 재굴림할 수 있게 둠 (닫고 싶으면 "✕ 닫기")
    });
  }

  // 로고 그룹(일반/랜덤 로고 만들기로 생긴 것 전부, isLogoGroup 표시된 것만)은 더블클릭하면
  // "묶기/풀기" 버튼을 누른 것과 똑같이 자동으로 풀려서, 배지·이니셜·전체이름을 각각 따로
  // 선택해 위치/배열을 조정할 수 있게 함. 이미지 자르기(더블클릭)나 펜툴 같은 다른 더블클릭
  // 동작과는 대상 조건(isLogoGroup)이 겹치지 않아 서로 간섭하지 않음.
  if (EP.canvas) {
    EP.canvas.on('mouse:dblclick', function(opt){
      var target = opt.target;
      if (!target || target.type !== 'group' || !target.isLogoGroup) return;
      var sel = target.toActiveSelection();
      EP.canvas.setActiveObject(sel);
      EP.canvas.requestRenderAll();
      if (EP.pushHistory) EP.pushHistory();
    });
  }

  EP.buildLogoData = buildLogoData; // 필요하면 다른 파일에서도 재사용 가능하도록 노출
})();
