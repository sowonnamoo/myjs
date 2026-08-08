(function(){
  "use strict";

  // 캔버스를 90도씩 회전(rotateCanvas90)시킨 누적 각도(0/90/180/270).
  // 오브젝트 선택 시 뜨는 P/T 미니버튼과 그 버튼을 눌러 여는 팝업창들이 이 값만큼 함께 회전 표시됨.
  window.EP = window.EP || {};
  EP.canvasRotationDeg = EP.canvasRotationDeg || 0;

  // 모바일 화면(좁은 폭) 여부를 어디서든 확인할 수 있는 공용 헬퍼.
  // 예전엔 기기 종류(UA)로 판별해서 <html class="ep-mobile-mode">를 붙이는 방식이었는데,
  // 이제는 순수하게 "화면 폭"만 보고 자동 판단함 — ecopro3.css의 @media(max-width:900px)와
  // 같은 기준(900px)이라 CSS가 모바일 UI를 보여주는 시점과 항상 정확히 일치함.
  // 오브젝트 선택 시 뜨는 주사위(M/P)·T·J·Z 미니버튼들을 모바일에서만 숨기는 데 씀
  // (ecopro3.js/c/m/j/z 등 여러 파일에서 공통으로 참조)
  EP.isMobileModeActive = function(){
    return window.innerWidth <= 900;
  };

  /* ============================================================
     1. URL 쿼리 파라미터 읽기
     예) editor.html?count=3&width=90&height=50&type=양면인쇄
     - count  : 디자인 건수 (없으면 1)
     - width / height : 캔버스 가로세로 비율(mm 등, 붉은 재단선 기준)
     - 값 중 어딘가에 "양면"이 포함되면 앞/뒤 양면 작업으로 처리
  ============================================================ */
  const urlParams = new URLSearchParams(window.location.search);
  const orderData = {};
  let hasDouble = false;
  for (const [key, value] of urlParams.entries()) {
    const decoded = decodeURIComponent(value);
    orderData[key] = decoded;
    if (decoded.includes('양면')) hasDouble = true;
  }
  const count = Math.max(1, parseInt(orderData.count, 10) || 1);
  const isDouble = hasDouble;
  let ratioW = parseInt(orderData.width, 10) || 16;
  let ratioH = parseInt(orderData.height, 10) || 9;

  /* ============================================================
     2. 캔버스 초기화 (쿼리의 가로:세로 비율에 맞춰 크기 결정)
  ============================================================ */
  const canvasWrap = document.getElementById('canvasWrap');
  const wrapRect = canvasWrap.getBoundingClientRect();
  const maxW = Math.min(wrapRect.width - 60, 900);
  let CANVAS_W = Math.max(320, Math.round(maxW));
  let CANVAS_H = Math.max(200, Math.round(CANVAS_W * (ratioH / ratioW)));

  const canvas = new fabric.Canvas('mainCanvas', {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    perPixelTargetFind: false // 투명한 부분(예: 자동누끼로 지운 배경)을 클릭해도 바운딩박스 기준으로 선택되게 함
  });

  /* ============================================================
     2b. 회전 핸들 커스텀 아이콘
     - 오브젝트(텍스트/도형/이미지) 선택 시 위쪽에 뜨는 회전 컨트롤을
       기본 원형 점 대신 빨간 곡선 화살표(양방향 회전) 아이콘으로 표시
  ============================================================ */
  (function setupCustomRotateIcon(){
    function drawArrowHead(ctx, angleRad, r, forward, color){
      ctx.save();
      ctx.rotate(angleRad);
      ctx.translate(r, 0);
      const dir = forward ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(0, dir * 8);
      ctx.lineTo(-5, dir * 1);
      ctx.lineTo(5, dir * 1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    function renderRotateIcon(ctx, left, top /*, styleOverride, fabricObject */){
      const red = '#e74c3c';
      const r = 8;
      // 양방향 화살표 대신, 흔히 보는 "새로고침/회전" 아이콘처럼 한쪽 방향으로만 도는
      // 270도짜리 원호 + 화살표 하나로 바꿈(요청: "회전 같은 아이콘으로"). 이게 훨씬
      // 직관적으로 "회전"임을 알아볼 수 있음.
      const startDeg = -30;
      const endDeg = startDeg + 270;
      const startRad = startDeg * Math.PI / 180;
      const endRad = endDeg * Math.PI / 180;

      ctx.save();
      ctx.translate(left, top);

      // 흰 배경 원 (아이콘 가독성용)
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#dfe4ea';
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = red;
      ctx.beginPath();
      ctx.arc(0, 0, r, startRad, endRad);
      ctx.stroke();

      drawArrowHead(ctx, endRad, r, true, red); // 화살표는 회전 방향 쪽 끝에 하나만

      ctx.restore();
    }

    // 모바일 최적화: 리사이즈 핸들·회전 핸들·T/주사위/J/Z 버튼 전부, 눈에 보이는 크기는 그대로 두고
    // "터치로 인식되는 범위"만 넉넉하게 넓힘(기본값 24px → 44px). 화면엔 안 보이지만 그 반경
    // 안에서는 어디를 눌러도 인식되므로, 손가락으로 정확히 맞추기 훨씬 편해짐(마우스는 영향 없음).
    fabric.Object.prototype.touchCornerSize = 44;

    const cu = fabric.controlsUtils || {};

    // 회전 버튼을 클릭(드래그 없이)했을 때 켜지는 빨간 십자 안내선 — 오브젝트(사각 박스)의
    // 좌측 하단 지점을 지나는 가로/세로 전체 선(회전 아이콘 자체 위치가 아니라 오브젝트
    // 바운딩박스의 실제 좌측하단 기준). 오브젝트가 움직이면 그 지점도 매번 새로 계산해서
    // 그리므로 항상 따라다님.
    // 0=꺼짐, 1=좌측하단 기준, 2=우측상단 기준 — 클릭할 때마다 이 순서로 순환(요청: "총 2번
    // 클릭기능" = 두 가지 기준점을 오가며 순환하고, 한 번 더 누르면 꺼짐)
    let rotateGuideState = 0;
    let rotateGuideTarget = null;
    canvas.on('after:render', () => {
      // 안내선은 1(좌측하단)/2(우측상단) 상태일 때만 그림 — 3(각도 리셋)·0(90도 회전) 상태는
      // 안내선 없이 그냥 지나감. rotateGuideTarget은 이제 사이클 내내(3→0 전환 포함) 계속
      // 같은 오브젝트를 가리키게 유지하므로, 여기서 상태값 자체로 명확히 걸러야 함.
      if ((rotateGuideState !== 1 && rotateGuideState !== 2) || !rotateGuideTarget || !canvas.contains(rotateGuideTarget)) return;
      const br = rotateGuideTarget.getBoundingRect(true, true); // 캔버스 논리좌표(줌 반영 전)
      const z = canvas.getZoom();
      const x = (rotateGuideState === 1 ? br.left : br.left + br.width) * z;
      const y = (rotateGuideState === 1 ? br.top + br.height : br.top) * z;
      const ctx = canvas.getContext();
      ctx.save();
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(canvas.getWidth(), y); // 가로선(X축)
      ctx.moveTo(x, 0); ctx.lineTo(x, canvas.getHeight()); // 세로선(Y축)
      ctx.stroke();
      ctx.restore();
    });
    canvas.on('selection:cleared', () => {
      rotateGuideState = 0;
      rotateGuideTarget = null;
    });

    // "도구" 메뉴의 안내선1/안내선2 항목에서 재사용할 수 있게 공개함 — 같은 십자 안내선
    // 로직을 그대로 씀(요청: "모양이나 텍스트 오브젝트 클릭 선택시 해당 오브젝트 기준에
    // 나오게"). 이미 그 상태로 켜져 있으면 다시 눌렀을 때 꺼짐(토글).
    EP.toggleRotateGuide = function(target, state){
      if (!target) return;
      if (rotateGuideTarget === target && rotateGuideState === state) {
        rotateGuideState = 0;
        rotateGuideTarget = null;
      } else {
        rotateGuideTarget = target;
        rotateGuideState = state;
      }
      canvas.requestRenderAll();
    };

    fabric.Object.prototype.controls.mtr = new fabric.Control({
      x: 0,
      y: 0.5,
      offsetY: 36,
      withConnection: true, // 파란 이동 손잡이와 동일하게, 끊김 없는 연결선을 fabric이 자동으로 그림
      sizeX: 32, sizeY: 32, // 마우스 클릭 인식 범위를 눈에 보이는 원(반지름 14=지름 28)보다 넉넉하게
      cursorStyle: 'grab',
      cursorStyleHandler: cu.rotationStyleHandler,
      actionHandler: cu.rotationWithSnapping,
      actionName: 'rotate',
      render: renderRotateIcon,
      // 드래그 없이 그냥 클릭(탭)만 했을 때 — 회전 대신 빨간 십자 안내선을 켜고 끔
      // (요청: "회전동그라미 버튼을 한번 더 누르면... 안내선이 생기게, 다시 누르면 사라지게")
      mouseUpHandler: function(eventData, transformData){
        // 모바일에서는 이 탭-사이클 자체를 끔 — 터치 인식이 들쭉날쭉해서 안 눌렸다 눌렸다
        // 하는 문제가 있었음(요청: "회전버튼의 터치가 잘 안먹혀... 클릭기능 삭제하고").
        // 같은 기능(안내선1/안내선2/기울기교정)은 아래에서 "도구" 메뉴 항목으로 옮겨서
        // 그쪽에서 선택된 오브젝트 기준으로 대신 제공함. PC는 기존 그대로 유지.
        if (EP.isMobileModeActive && EP.isMobileModeActive()) return true;
        const transform = transformData || canvas._currentTransform;
        if (transform && transform.actionPerformed) return true; // 실제로 드래그해서 회전했으면 안내선은 건드리지 않음
        const target = (transform && transform.target) || canvas.getActiveObject();
        if (!target) return true;
        if (rotateGuideTarget !== target) {
          // 다른 오브젝트를 대상으로 새로 누른 경우 항상 1단계(좌측하단)부터 시작
          rotateGuideTarget = target;
          rotateGuideState = 1;
        } else {
          // 0(꺼짐) → 1(좌측하단 안내선) → 2(우측상단 안내선) → 3(안내선 끄고 각도 0 복구)
          // → 0(90도 회전) → 다시 1로 순환(요청: "네번째 클릭하면 90도 회전")
          rotateGuideState = (rotateGuideState + 1) % 4;
          if (rotateGuideState === 3) {
            // 3번째 클릭 — 안내선 끄면서 기울기도 0도로 복구. 그냥 angle만 0으로 바꾸면
            // origin이 'center'가 아닌 오브젝트는 회전축이 모서리 쪽이라 이 사각 오브젝트의
            // "중심"이 그 자리에 안 있고 옆으로 튀어버림 — 그래서 각도를 바꾸기 전에 지금
            // 중심점을 먼저 기억해두고, 각도를 0으로 바꾼 뒤 그 중심점 자리에 다시 정확히
            // 맞춰줌(캔버스 회전 때 쓰는 것과 동일한 방식).
            // setTimeout(0)으로 한 틱 미뤄서 실행함 — fabric이 이 컨트롤의 transform을 마무리
            // 짓는 도중에 각도/위치를 바로 바꿔버리면, 그 마무리 처리가 꼬여서 오브젝트 선택이
            // 풀려버리는 버그가 있었음(그래서 이어서 4번째 클릭을 할 대상 자체가 없어짐).
            // 지금 클릭 처리가 완전히 끝난 다음 틱에 바꾸면 이 문제가 사라짐.
            // ⚠️ 여기서 rotateGuideTarget을 null로 지우면 안 됨 — 지우면 바로 다음(4번째)
            // 클릭에서 "다른 오브젝트를 새로 누른 것"으로 오인해서 사이클이 1단계로 되돌아가
            // 버리는 버그가 있었음(요청하신 바로 그 증상). 계속 같은 타깃을 가리키고 있어야
            // 다음 클릭이 정확히 0단계(90도 회전)로 이어짐.
            setTimeout(() => {
              const center = target.getCenterPoint();
              target.set('angle', 0);
              target.setPositionByOrigin(center, 'center', 'center');
              target.setCoords();
              canvas.setActiveObject(target); // 혹시 모를 선택 해제에 대비한 안전장치
              canvas.requestRenderAll();
              pushHistory();
            }, 0);
          } else if (rotateGuideState === 0) {
            // 4번째 클릭 — 지금 각도에서 90도 회전(중심점은 마찬가지로 그대로 유지, 같은
            // 이유로 setTimeout(0)으로 미뤄서 처리)
            setTimeout(() => {
              const center = target.getCenterPoint();
              const newAngle = ((target.angle || 0) + 90) % 360;
              target.set('angle', newAngle);
              target.setPositionByOrigin(center, 'center', 'center');
              target.setCoords();
              canvas.setActiveObject(target); // 혹시 모를 선택 해제에 대비한 안전장치
              canvas.requestRenderAll();
              pushHistory();
            }, 0);
          }
        }
        canvas.requestRenderAll();
        return true;
      }
    });
  })();

  /* ============================================================
     2b-1. 모바일 전용 "이동 손잡이" — 하단 회전마크(빨간 곡선 화살표)와 완전히 같은
     막대사탕 모양(선 + 끝에 동그라미)으로, 오브젝트 우측에 하나 더 붙임. 회전·크기조절
     기능은 전혀 없고, 누른 채 드래그하면 오브젝트가 그 방향으로 그대로 옮겨지는
     "이동 전용" 손잡이임 — 화살표 없이 그냥 파란 동그라미만 그림(요청대로).
     PC에서는 마우스로 오브젝트 몸통을 바로 눌러 옮기면 되니 이 손잡이 자체(막대+동그라미)를
     아예 안 그리고 작동도 안 하게 함 — setControlsVisibility로 매 선택마다 켜고 끔.
  ============================================================ */
  (function setupMobileMoveHandle(){
    function renderMoveHandle(ctx, left, top){
      ctx.save();
      ctx.translate(left, top);
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#3498db';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }

    fabric.Object.prototype.controls.mobileMoveHandle = new fabric.Control({
      x: 0.5,
      y: 0,
      offsetX: 36,
      withConnection: true, // 회전마크와 똑같이 오브젝트~손잡이 사이에 막대(선)가 자동으로 그려짐
      sizeX: 34, sizeY: 34, // 마우스/터치 클릭 인식 범위를 눈에 보이는 원(반지름 15=지름 30)보다 넉넉하게
      cursorStyle: 'move',
      render: renderMoveHandle,
      actionHandler: function(eventData, transform, x, y){
        if (!(EP.isMobileModeActive && EP.isMobileModeActive())) return false; // 안전장치: PC에선 동작 안 함
        const target = transform.target;
        const dx = x - transform.ex; // 드래그 시작 지점(캔버스 좌표) 대비 지금까지 움직인 거리
        const dy = y - transform.ey;
        target.set({
          left: transform.original.left + dx,
          top: transform.original.top + dy
        });
        target.setCoords();
        return true;
      },
      actionName: 'mobileMoveDrag'
    });

    // 선택될 때마다(그리고 화면 폭이 모바일<->PC 경계를 넘나들 때도) 지금 활성 오브젝트의
    // 이 손잡이를 보이거나 숨김 — setControlsVisibility를 써야 아이콘뿐 아니라 연결선(막대)도
    // 같이 사라짐(단순히 render 안에서만 안 그리면 막대 선은 그대로 남아서 어색해짐).
    function syncMoveHandleVisibility(){
      const mobile = !!(EP.isMobileModeActive && EP.isMobileModeActive());
      const targets = [];
      const active = canvas.getActiveObject();
      if (active) {
        if (active.type === 'activeSelection' && active.getObjects) targets.push(...active.getObjects());
        else targets.push(active);
      }
      targets.forEach((o) => { if (o && o.setControlsVisibility) o.setControlsVisibility({ mobileMoveHandle: mobile }); });
      canvas.requestRenderAll();
    }
    canvas.on('selection:created', syncMoveHandleVisibility);
    canvas.on('selection:updated', syncMoveHandleVisibility);
    window.addEventListener('resize', syncMoveHandleVisibility);
  })();

  // 모바일 모드에서는 오브젝트 선택 시 뜨는 리사이즈 핸들(네모 8개)이 화면 대비 너무 커
  // 보인다는 요청으로, 기본 크기의 절반으로 줄임. (터치로 인식되는 범위는 위
  // touchCornerSize로 이미 넉넉하게 잡혀있어서, 핸들이 작아 보여도 실제 터치 조작감에는
  // 영향 없음.) 화면 폭이 바뀌어 모바일<->PC 경계를 넘나들 때도 실시간으로 반영되도록
  // resize에서 다시 계산함.
  (function setupResponsiveCornerSize(){
    const DEFAULT_CORNER_SIZE = fabric.Object.prototype.cornerSize; // fabric 기본값
    function apply(){
      const mobile = !!(EP.isMobileModeActive && EP.isMobileModeActive());
      fabric.Object.prototype.cornerSize = mobile ? Math.round(DEFAULT_CORNER_SIZE / 2) : DEFAULT_CORNER_SIZE;
      canvas.requestRenderAll();
    }
    apply();
    window.addEventListener('resize', apply);
  })();

  /* ============================================================
     2c. 텍스트 전용 "T" 버튼 컨트롤 → 글꼴/투명도 플로팅 패널
     - 텍스트(IText) 오브젝트를 선택하면 우측에 보라색 T 버튼이 뜨고,
       클릭하면 글꼴 선택 + 투명도 게이지가 있는 작은 패널이 근처에 나타남
  ============================================================ */
  (function setupTextFontControl(){
    function renderTButton(ctx, left, top, styleOverride, fabricObject){
      // 모바일에서도 T 버튼만은 예외적으로 보이게 함(요청에 따라) — 도형쪽 M/P/J/Z 등
      // 나머지 미니 버튼들은 계속 모바일에서 숨김 처리됨(각 파일의 isMobileModeActive 체크 유지).
      // 여러 개를 묶어 선택했거나(활성선택) 묶기로 그룹화한 경우: 텍스트뿐 아니라 이미지가 섞여 있어도
      // (정렬 기능은 이미지에도 필요하므로) 2개 이상의 유효한 오브젝트만 있으면 T 버튼을 보여줌
      if (fabricObject && (fabricObject.type === 'activeSelection' || fabricObject.type === 'group')) {
        const objs = fabricObject.getObjects().filter(o => !o.isGuide);
        if (objs.length < 2) return;
      }
      ctx.save();
      ctx.translate(left, top);
      ctx.rotate(fabric.util.degreesToRadians(EP.canvasRotationDeg || 0));
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#6c3ce0';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('T', 0, 1);
      ctx.restore();
    }

    const tControl = new fabric.Control({
      x: 0.5, y: -0.5,
      offsetX: 20, offsetY: -36,
      sizeX: 28, sizeY: 28, // 그려지는 원(반지름14=지름28) 전체가 클릭 영역이 되도록 맞춤(기본값은 이보다 작아서 글자 부분만 눌리는 것처럼 느껴졌음)
      cursorStyle: 'pointer',
      render: renderTButton,
      mouseUpHandler: function(eventData, transformData){
        const target = transformData && transformData.target;
        if (!target) return true;
        if (target.isEditing) target.exitEditing(); // 모바일에서 편집 상태가 남아있으면 필터가 안 그려지므로 확실히 빠져나옴
        if (!fontPopover.classList.contains('hidden')) { hideFontPopover(); return true; } // 이미 열려있으면 다시 눌렀을 때 닫힘(토글)
        openFontPopover(target);
        return true;
      }
    });

    // 텍스트(IText) 단일 선택에 T 버튼이 보이도록 별도 컨트롤셋 복제(다른 오브젝트엔 영향 없음)
    fabric.IText.prototype.controls = Object.assign({}, fabric.Object.prototype.controls, { tFont: tControl });
    // 여러 텍스트를 드래그로 묶어 선택했을 때도 T 버튼이 뜨도록 활성선택(그룹)에도 추가
    // (renderTButton 내부에서 전부 텍스트일 때만 실제로 그려짐)
    fabric.ActiveSelection.prototype.controls = Object.assign({}, fabric.ActiveSelection.prototype.controls, { tFont: tControl });
    // "묶기"로 만든 영구 그룹에도 동일하게 T 버튼 지원
    fabric.Group.prototype.controls = Object.assign({}, fabric.Group.prototype.controls, { tFont: tControl });
  })();

  /* ============================================================
     회전 가능한 플로팅 팝업(T 글꼴창 / P 필터창) 공용 유틸
     - 캔버스를 90도 회전(rotateCanvas90)시키면 이 팝업들도 같은 각도로 함께 회전 표시됨
     - 90/270도로 회전하면 화면에 실제로 보이는 가로·세로가 서로 뒤바뀌므로,
       화면 밖으로 나가지 않게 클램프할 땐 "회전된 뒤의 크기" 기준으로 계산해야 함
       (중심점은 회전해도 움직이지 않으므로, 중심점 기준으로 클램프한 뒤 좌상단 좌표로 환산)
  ============================================================ */
  function clampPopoverCenter(cx, cy, pw, ph, rotDeg){
    const d = ((rotDeg || 0) % 360 + 360) % 360;
    const vw = (d === 90 || d === 270) ? ph : pw; // 화면상 실제 가로폭
    const vh = (d === 90 || d === 270) ? pw : ph; // 화면상 실제 세로높이
    return {
      cx: Math.min(Math.max(vw / 2 + 8, cx), window.innerWidth - vw / 2 - 8),
      cy: Math.min(Math.max(vh / 2 + 8, cy), window.innerHeight - vh / 2 - 8)
    };
  }
  function clampPopoverRect(left, top, pw, ph, rotDeg){
    const c = clampPopoverCenter(left + pw / 2, top + ph / 2, pw, ph, rotDeg);
    return { left: c.cx - pw / 2, top: c.cy - ph / 2 };
  }
  function applyPopoverRotationStyle(el){
    el.style.transform = EP.canvasRotationDeg ? ('rotate(' + EP.canvasRotationDeg + 'deg)') : '';
  }
  EP.clampPopoverCenter = clampPopoverCenter;

  // 캔버스 오브젝트를 직렬화(저장/실행취소/프로젝트 저장)할 때마다 fabric의 기본 속성 외에
  // 추가로 같이 담아야 하는 커스텀 속성 전체 목록. 텍스트 효과(원형/물결/기차 등), 도형
  // 필터 콤보 상태, 클립마스크 위치 기준값 등이 여기 없으면 실행취소나 저장 후 다시 불러올
  // 때 조용히 사라짐 — snapshot()/serializeCurrentCanvas()/flattenSideDataForSave() 세 곳
  // 전부 이 하나의 목록만 쓰도록 통일해서, 앞으로 새 효과가 추가돼도 한 곳만 고치면 됨.
  /* ============================================================
     캔버스 오브젝트 커스텀 속성 레지스트리
     - 실행취소(snapshot)·디자인전환(serializeCurrentCanvas)·프로젝트저장(flattenSideDataForSave)·
       복제/복사·붙여넣기(clone) — 이 모든 곳에서 "fabric 기본 속성 외에 추가로 같이 챙겨야
       하는 커스텀 속성 목록"을 예전엔 ecopro3.js 안에 하드코딩된 배열 하나로 전부 관리했음.
       문제는 새 텍스트 효과나 도형 필터가 다른 파일(ecopro3text.js/m.js/k.js/l.js 등)에
       추가될 때마다 이 배열에도 "깜빡하지 않고" 똑같이 추가해줘야 했다는 것 — 하나라도
       빠뜨리면 그 속성은 실행취소/저장/SVG내보내기/복제 시 조용히 사라짐(실제로 trainText·
       toteText·_clipMaskRelativeMatrix가 이렇게 빠져있던 걸 발견해서 고쳤었음).
     - 그래서 구조를 뒤집음: 각 효과/필터를 "만드는" 파일이 자기가 쓰는 속성 이름을
       EP.registerCustomObjectProps([...])로 직접 등록하게 하고, ecopro3.js는 그 등록된
       목록을 그때그때 그대로 읽어서만 씀. 앞으로 새 효과를 추가할 때는 그 효과를 만드는
       파일 안에서 등록 한 줄만 추가하면 실행취소/저장/SVG내보내기/복제 네 군데 전부에
       자동으로 반영되고, ecopro3.js는 다시 손댈 필요가 없음.
  ============================================================ */
  EP.customObjectProps = EP.customObjectProps || new Set([
    'selectable', 'evented', 'imageLocked', 'isPenToolPath', 'hasControls', 'hasBorders',
    'lockMovementX', 'lockMovementY', 'hoverCursor', 'isGuide'
  ]);
  EP.registerCustomObjectProps = function(names){
    (names || []).forEach((n) => EP.customObjectProps.add(n));
  };
  // 실제 목록이 필요한 시점(실행취소/저장 등, 항상 사용자 조작 이후 = 모든 파일이 이미
  // 로드되어 등록을 마친 뒤)마다 매번 새로 배열로 뽑아씀 — 페이지 로드 시점에 미리 굳혀두면
  // ecopro3.js보다 나중에 로드되는 파일들이 등록한 속성이 누락되므로 반드시 함수로 둠.
  function getCustomObjectProps(){
    return Array.from(EP.customObjectProps);
  }

  EP.clampPopoverRect = clampPopoverRect;
  EP.applyPopoverRotationStyle = applyPopoverRotationStyle;
  EP.rotatablePopovers = EP.rotatablePopovers || [];
  EP.registerRotatablePopover = function(el){ EP.rotatablePopovers.push(el); };

  /* ============================================================
     "상세조정하기"류 팝업(T/J/K/M/S/Z 등)이 꺼질 때 마지막 위치를 기억해뒀다가, 다음에
     열릴 때 그 자리에 그대로 다시 뜨게 함(요청: "랜덤디자인 적용 등으로 꺼졌을 때, 마지막에
     드래그해둔 그 자리에 다시 등장"). 각 팝업 파일에서 EP.registerPopoverPositionMemory(el)을
     한 번만 불러주면, 그 팝업이 hidden 클래스로 감춰지는 순간 자동으로 위치를 저장하고,
     EP.getRememberedPopoverPosition(el)로 다음에 열 때 그 값을 꺼내 쓸 수 있음.
  ============================================================ */
  const popoverLastPositions = {}; // { [popoverEl.id]: {left, top} }
  EP.registerPopoverPositionMemory = function(el){
    if (!el || !el.id) return;
    const observer = new MutationObserver(function(){
      if (el.classList.contains('hidden')) {
        const left = parseFloat(el.style.left);
        const top = parseFloat(el.style.top);
        if (!isNaN(left) && !isNaN(top)) popoverLastPositions[el.id] = { left: left, top: top };
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  };
  EP.getRememberedPopoverPosition = function(el){
    return (el && el.id) ? (popoverLastPositions[el.id] || null) : null;
  };

  /* ============================================================
     "상세조정하기"류 필터 팝업(P=텍스트 필터, M=모양 필터 등)을 PC에서 오브젝트 근처가
     아니라 캔버스 박스(재단선) 좌측 상단 모서리에 가지런히 배치하는 공용 유틸(PC 전용).
     이미 그 자리에 다른 필터 팝업이 열려 있으면 그 오른쪽으로 나란히 이어붙임.
     캔버스 회전 각도는 전혀 고려하지 않음 — 항상 고정된 화면 좌표에 그대로 붙음.
  ============================================================ */
  EP.cornerAnchoredPopovers = EP.cornerAnchoredPopovers || [];
  EP.positionPopoverAtCanvasCorner = function(popoverEl){
    popoverEl.classList.remove('hidden'); // 실제 크기를 재려면 먼저 보이는 상태여야 함
    const pw = popoverEl.offsetWidth || 200;
    const ph = popoverEl.offsetHeight || 140;
    const canvasRect = EP.canvas.upperCanvasEl.getBoundingClientRect();
    const margin = 10;

    // 캔버스 "요소" 자체는 화면에서 절대 안 돌아가지만(항상 네모반듯), 디자인 내용은 90도씩
    // 돌아가므로 "디자인 기준 좌상단"이 실제 화면에서는 매번 다른 모서리에 대응됨 — 시계
    // 방향으로 90도 돌 때마다 좌상단→우상단→우하단→좌하단 순으로 옮겨감(진짜 물체를
    // 시계방향으로 돌렸을 때 원래 좌상단 꼭짓점이 이동하는 것과 똑같은 규칙). 그래서 지금
    // 회전 각도에 맞는 모서리를 골라서 거기서부터 안쪽으로 나란히 쌓음
    // (요청: "회전한 이후면 좌상단은 우상단이 되잖아").
    const rot = ((EP.canvasRotationDeg || 0) % 360 + 360) % 360;
    let cornerX, cornerY, stackDirX, stackDirY;
    if (rot === 90) {
      cornerX = canvasRect.right - margin; cornerY = canvasRect.top + margin;
      stackDirX = -1; stackDirY = 1; // 안쪽(왼쪽)으로 쌓음
    } else if (rot === 180) {
      cornerX = canvasRect.right - margin; cornerY = canvasRect.bottom - margin;
      stackDirX = -1; stackDirY = -1;
    } else if (rot === 270) {
      cornerX = canvasRect.left + margin; cornerY = canvasRect.bottom - margin;
      stackDirX = 1; stackDirY = -1;
    } else { // 0도(기본) — 좌측 상단
      cornerX = canvasRect.left + margin; cornerY = canvasRect.top + margin;
      stackDirX = 1; stackDirY = 1;
    }

    // 지금 이 모서리에 이미 나란히 붙어서 보이고 있는 다른 팝업들의 폭만큼 안쪽으로 밀어서 배치
    const others = EP.cornerAnchoredPopovers.filter((p) =>
      p && p !== popoverEl && document.body.contains(p) && !p.classList.contains('hidden')
    );
    let offsetAlongEdge = 0;
    others.forEach((p) => { offsetAlongEdge += p.offsetWidth + margin; });

    // stackDirX가 -1이면 오른쪽 변에 붙었다는 뜻이라, 팝업의 "오른쪽 끝"이 cornerX에 오도록
    // left를 그만큼 왼쪽으로 당겨줌(폭만큼 빼줌). stackDirY도 동일한 방식으로 위/아래 처리.
    let left = stackDirX === 1 ? (cornerX + offsetAlongEdge) : (cornerX - offsetAlongEdge - pw);
    let top = stackDirY === 1 ? cornerY : (cornerY - ph);

    // 마지막으로 닫혔을 때 있던(드래그해둔) 자리가 기억돼 있으면 그 자리를 우선함(요청)
    const remembered = EP.getRememberedPopoverPosition(popoverEl);
    const finalLeft = remembered ? remembered.left : left;
    const finalTop = remembered ? remembered.top : top;

    const r = EP.clampPopoverRect(finalLeft, finalTop, pw, ph, EP.canvasRotationDeg);
    popoverEl.style.left = r.left + 'px';
    popoverEl.style.top = r.top + 'px';
    // 팝업 자신도 캔버스 회전 각도에 맞춰 같이 돌려서 읽기 좋은 방향을 유지함(요청: "회전도
    // 안되있고").
    EP.applyPopoverRotationStyle(popoverEl);

    if (!EP.cornerAnchoredPopovers.includes(popoverEl)) EP.cornerAnchoredPopovers.push(popoverEl);
  };

  /* ============================================================
     여러 필터 팝업(T 글꼴 / P 텍스트필터 / M 도형필터 / J 공통필터 / Z 이미지블렌드필터)이
     동시에 열려있을 때 서로 겹쳐서 뒤에 있는 창을 가리지 않도록, "이미 열려있는 다른 팝업과
     겹치면 그 옆으로 밀어서" 위치를 잡아주는 범용 유틸. 각 팝업 파일에서
     EP.registerFilterPopover(el)로 자기 팝업 엘리먼트를 등록해두면, 위치를 잡을 때
     EP.findNonOverlappingPosition(el, left, top, pw, ph)를 불러써서 자동으로 피해감.
  ============================================================ */
  EP.filterPopovers = EP.filterPopovers || [];
  EP.registerFilterPopover = function(el){ EP.filterPopovers.push(el); };
  EP.findNonOverlappingPosition = function(popoverEl, left, top, pw, ph){
    const others = EP.filterPopovers.filter(function(p){ return p && p !== popoverEl && !p.classList.contains('hidden'); });
    if (!others.length) return { left, top };
    function collidesWithAny(l, t){
      return others.some(function(o){
        const r = o.getBoundingClientRect();
        return !(l + pw <= r.left || l >= r.right || t + ph <= r.top || t >= r.bottom);
      });
    }
    if (!collidesWithAny(left, top)) return { left, top };
    // 겹치면: 지금 열려있는 다른 팝업들 중 가장 오른쪽 끝 바로 옆으로 붙여서 다시 시도.
    // 그래도 겹치면(팝업이 3개 이상 겹쳐있는 경우 등) 한 번 더 오른쪽으로 밀어서 재시도.
    for (let attempt = 0; attempt < others.length + 1; attempt++) {
      const rightmost = others.reduce(function(acc, o){ return Math.max(acc, o.getBoundingClientRect().right); }, left);
      left = rightmost + 12;
      if (!collidesWithAny(left, top)) break;
    }
    return { left, top };
  };

  // 캔버스 회전 버튼을 누른 그 순간, 지금 열려있는 팝업(들)도 즉시 같은 각도로 재배치
  EP.refreshRotatablePopovers = function(){
    EP.rotatablePopovers.forEach(function(el){
      if (!el) return;
      if (el.classList.contains('hidden')) { el.style.transform = ''; return; }
      // 모서리 고정형 팝업(T/P/M/J/K/S/Z)은 회전 각도가 바뀌면 "어느 모서리에 붙어야 하는지"
      // 자체가 바뀌므로(좌상단→우상단→...), 단순 재클램프가 아니라 코너 선택 로직을 통째로
      // 다시 돌려야 함.
      if (EP.cornerAnchoredPopovers && EP.cornerAnchoredPopovers.includes(el)) {
        EP.positionPopoverAtCanvasCorner(el);
        return;
      }
      const pw = el.offsetWidth, ph = el.offsetHeight;
      const curLeft = parseFloat(el.style.left) || 0;
      const curTop = parseFloat(el.style.top) || 0;
      const r = clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      applyPopoverRotationStyle(el);
    });
  };

  function makeDraggablePopover(el){
    let dragging = false, dcx = 0, dcy = 0; // 마우스 시작점 → 박스 "중심"까지의 오프셋(회전은 중심 기준이라 이렇게 재면 회전 상태에서도 어긋나지 않음)
    function startDrag(clientX, clientY, targetEl){
      if (targetEl.closest('select, input, textarea, button, .cmyk-picker, .cmyk-popover')) return false;
      // 우측 하단 모서리(약 16px 이내)는 브라우저 기본 리사이즈 손잡이 영역일 수 있으므로,
      // 여기를 누르면 이동 드래그를 시작하지 않고 그대로 둬서 리사이즈가 우선되게 함
      const rr = el.getBoundingClientRect();
      if ((rr.right - clientX) < 16 && (rr.bottom - clientY) < 16) return false;
      dragging = true;
      dcx = clientX - (rr.left + rr.width / 2);
      dcy = clientY - (rr.top + rr.height / 2);
      return true;
    }
    function moveDrag(clientX, clientY){
      if (!dragging) return;
      const pw = el.offsetWidth, ph = el.offsetHeight;
      const c = clampPopoverCenter(clientX - dcx, clientY - dcy, pw, ph, EP.canvasRotationDeg);
      el.style.left = (c.cx - pw / 2) + 'px';
      el.style.top = (c.cy - ph / 2) + 'px';
    }
    el.addEventListener('mousedown', (e) => {
      if (startDrag(e.clientX, e.clientY, e.target)) e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => { moveDrag(e.clientX, e.clientY); });
    document.addEventListener('mouseup', () => { dragging = false; });

    // 터치 — 모바일에서는 mousedown/mousemove가 안정적으로 합성(synthesize)되지 않는 경우가
    // 많아서(특히 계속 이어지는 move 추적), 위 마우스 로직과 완전히 동일한 계산을 터치
    // 이벤트로 따로 한 번 더 붙여줌(요청: "알파벳 버튼들 클릭하면 나오는 창들 터치로 모두
    // 창 이동 드래그하기 쉽게"). 이걸로 T/P/M/J/K/S/Z 팝업 전부가 한 번에 같이 고쳐짐
    // (전부 이 함수 하나를 공용으로 쓰기 때문).
    el.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return; // 두 손가락(핀치 등)이면 무시
      const t = e.touches[0];
      if (startDrag(t.clientX, t.clientY, e.target)) e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!dragging || !e.touches || !e.touches.length) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
      e.preventDefault(); // 드래그 중엔 배경(캔버스) 스크롤/줌이 같이 안 움직이게 막음
    }, { passive: false });
    document.addEventListener('touchend', () => { dragging = false; });
    document.addEventListener('touchcancel', () => { dragging = false; });
  }

  const fontPopover = document.getElementById('fontPopover');
  EP.registerPopoverPositionMemory(fontPopover);
  const floatingFontSelect = document.getElementById('floatingFontSelect');
  const floatingFontSizeInput = document.getElementById('floatingFontSizeInput');
  const floatingOpacityInput = document.getElementById('floatingOpacityInput');
  const colorGaugeInput = document.getElementById('colorGaugeInput');
  const fontColorSwatch = document.getElementById('fontColorSwatch');
  const fontPopoverMoreBtn = document.getElementById('fontPopoverMoreBtn');
  const fontPopoverMore = document.getElementById('fontPopoverMore');
  const boxGapPxInput = document.getElementById('boxGapPxInput');
  const letterSpacingGauge = document.getElementById('letterSpacingGauge');
  const groupToggleBtn = document.getElementById('groupToggleBtn');
  const floatingBoldBtn = document.getElementById('floatingBoldBtn');
  const floatingItalicBtn = document.getElementById('floatingItalicBtn');
  const floatingUnderlineBtn = document.getElementById('floatingUnderlineBtn');
  const floatingAlignLeftBtn = document.getElementById('floatingAlignLeftBtn');
  const floatingAlignCenterBtn = document.getElementById('floatingAlignCenterBtn');
  const floatingAlignRightBtn = document.getElementById('floatingAlignRightBtn');
  let fontPopoverTargets = []; // 이 미니 창이 현재 편집 중인 텍스트 목록(선택 해제와 무관하게 유지)

  function updateOpacityGaugeFill(v){
    floatingOpacityInput.style.setProperty('--fill', Math.round((v != null ? v : 1) * 100) + '%');
  }

  // 자간(글자 사이 간격)을 "픽셀" 감각으로 다루기 위한 변환
  // fabric의 charSpacing은 폰트 크기의 1/1000 단위이므로, 각 텍스트의 fontSize 기준으로 환산
  const LETTER_SPACING_MIN = -20, LETTER_SPACING_MAX = 100;
  function charSpacingToPx(cs, fontSize){
    return Math.round(((cs || 0) / 1000) * (fontSize || 40));
  }
  function pxToCharSpacing(px, fontSize){
    return Math.round((px / (fontSize || 40)) * 1000);
  }
  function updateLetterSpacingGaugeFill(px){
    const pct = ((px - LETTER_SPACING_MIN) / (LETTER_SPACING_MAX - LETTER_SPACING_MIN)) * 100;
    letterSpacingGauge.style.setProperty('--fill', Math.round(Math.max(0, Math.min(100, pct))) + '%');
  }

  function hideFontPopover(){
    fontPopover.classList.add('hidden');
    fontPopoverTargets = [];
    setFontPopoverMoreOpen(true);
  }

  // "더보기" 펼침/접기 상태 전환 (열림 상태에 따라 버튼 라벨도 함께 바뀜)
  function setFontPopoverMoreOpen(open){
    fontPopoverMore.classList.toggle('hidden', !open);
    fontPopoverMoreBtn.textContent = open ? '접기 ▴' : '더보기 ▾';
    fontPopoverMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function positionFontPopover(target){
    // 요청: PC처럼 모바일도 캔버스 박스 좌측 상단에 가지런히(겹치지 않게) 배치, 회전 여부와
    // 무관하게 좌상단이 원칙 — P/M이 PC에서 쓰던 공용 코너 앵커 유틸을 모든 플랫폼에 그대로 씀.
    EP.positionPopoverAtCanvasCorner(fontPopover);
  }

  // 더보기 펼침/접기로 창 높이가 바뀔 때: 텍스트 아래(6시 방향)로 재배치하지 않고,
  // 현재 위치(사용자가 드래그해둔 자리 포함)를 그대로 유지한 채 화면 밖으로만 안 나가게 조정
  function clampFontPopoverToViewport(){
    const pw = fontPopover.offsetWidth || 210;
    const ph = fontPopover.offsetHeight || 110;
    const curLeft = parseFloat(fontPopover.style.left) || 0;
    const curTop = parseFloat(fontPopover.style.top) || 0;
    const r = clampPopoverRect(curLeft, curTop, pw, ph, EP.canvasRotationDeg);
    fontPopover.style.left = r.left + 'px';
    fontPopover.style.top = r.top + 'px';
  }

  // 게이지 맨 좌측(0%): 흰색 → 빨강(M100 Y100) → 노랑(Y100) → 흰색(얇게)
  // 중간(12~84%): 기존 무지개 스펙트럼 / 우측(84~100%): 회색 → 검정
  const GAUGE_STOPS = [
    { p: 0,   hex: '#ffffff' },
    { p: 3,   hex: '#ff0000' },
    { p: 7,   hex: '#ffff00' },
    { p: 9,   hex: '#ffffff' },
    { p: 12,  hex: '#ff0000' },
    { p: 24,  hex: '#ff9900' },
    { p: 36,  hex: '#ffee00' },
    { p: 48,  hex: '#33cc33' },
    { p: 60,  hex: '#00cccc' },
    { p: 72,  hex: '#3366ff' },
    { p: 84,  hex: '#9933ff' },
    { p: 92,  hex: '#888888' },
    { p: 100, hex: '#000000' }
  ];
  const GAUGE_CORNER_POS = 3;  // "저 모서리지점" — 빨강
  const GAUGE_YELLOW_POS = 7;  // "노란색 좌표" — 노랑
  const GAUGE_TRIGGER_MIN = 75, GAUGE_TRIGGER_MAX = 203; // 기존 CMYK 피커 차단 구간(Hue)과 동일

  function gaugePosToHex(pct){
    pct = Math.max(0, Math.min(100, pct));
    let a = GAUGE_STOPS[0], b = GAUGE_STOPS[GAUGE_STOPS.length - 1];
    for (let i = 0; i < GAUGE_STOPS.length - 1; i++) {
      if (pct >= GAUGE_STOPS[i].p && pct <= GAUGE_STOPS[i + 1].p) { a = GAUGE_STOPS[i]; b = GAUGE_STOPS[i + 1]; break; }
    }
    const span = b.p - a.p || 1;
    const t = (pct - a.p) / span;
    const c1 = hexToRgb(a.hex), c2 = hexToRgb(b.hex);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const bl = Math.round(c1.b + (c2.b - c1.b) * t);
    return rgbToHex(r, g, bl);
  }
  // 지금 색상(hex)을 봤을 때 무지개 게이지를 어느 위치에 놔야 자연스러운지 대략적으로
  // 되짚어주는 헬퍼 — K 팝업(ecopro3k.js) 등 T 말고 다른 색상 게이지에서도 그대로 재사용함.
  function hexToGaugePos(hex){
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const inZone = hsv.h >= GAUGE_TRIGGER_MIN && hsv.h <= GAUGE_TRIGGER_MAX;
    return inZone ? GAUGE_YELLOW_POS : GAUGE_CORNER_POS;
  }
  EP.gaugePosToHex = gaugePosToHex;
  EP.hexToGaugePos = hexToGaugePos;

  // T 팝업이 편집할 대상: 드래그로 여러 오브젝트를 묶어 선택했거나 "묶기"로 그룹화한 경우엔 그 묶음 전체
  // (정렬 기능은 이미지에도 필요하므로 텍스트로 제한하지 않음), 묶지 않고 텍스트 하나만 선택한 경우엔 그 하나만.
  function textBoxesFromTarget(target){
    if (!target) return [];
    if (target.type === 'activeSelection' || target.type === 'group') {
      return target.getObjects().filter(o => !o.isGuide);
    }
    return (!target.isGuide && isTextObject(target)) ? [target] : [];
  }

  // P(필터)/주사위 전용: textBoxesFromTarget과 달리 단일 도형(사각형/원/삼각형/패스)도 대상에 포함시킴.
  // T(폰트) 팝업 쪽 로직에 영향 주지 않도록 별도 함수로 분리해둠.
  function qaTargetsFromTarget(target){
    if (!target) return [];
    if (target.type === 'activeSelection' || target.type === 'group') {
      return target.getObjects().filter(o => !o.isGuide);
    }
    if (target.isGuide) return [];
    return (isTextObject(target) || isShapeObject(target)) ? [target] : [];
  }

  function openFontPopover(target, opts){
    const boxes = textBoxesFromTarget(target);
    if (!boxes.length) return;
    const wasHidden = fontPopover.classList.contains('hidden');
    fontPopoverTargets = boxes; // 팝업이 붙잡을 텍스트 목록 (이후 선택이 풀려도 이 목록을 계속 편집)
    const anchor = boxes.find(isTextObject) || boxes[0]; // 초기값 표시 기준 (섞여 있으면 텍스트를 우선)
    floatingFontSelect.value = anchor.fontFamily || 'Pretendard';
    floatingFontSizeInput.value = Math.round(anchor.fontSize || 40);
    const v = anchor.opacity != null ? anchor.opacity : 1;
    floatingOpacityInput.value = v;
    updateOpacityGaugeFill(v);

    const curHex = toHex(anchor.fill) || '#222222';
    const rgb = hexToRgb(curHex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const inZone = hsv.h >= GAUGE_TRIGGER_MIN && hsv.h <= GAUGE_TRIGGER_MAX;
    colorGaugeInput.value = inZone ? GAUGE_YELLOW_POS : GAUGE_CORNER_POS;
    fontColorSwatch.value = curHex;

    // 정렬 옆 픽셀입력창: "정렬" 기능의 일부 — 묶어 선택한 텍스트 박스들 사이의 세로 간격을
    // 입력한 픽셀만큼 일정하게 맞추는 기능. 자간(글자 사이 간격)과는 완전히 다른 기능입니다.
    boxGapPxInput.value = currentBoxGapPx(boxes);

    // 자간 게이지: 위 픽셀입력창과 무관한 별개 기능. 드래그하는 대로 글자 사이 간격이 넓어지고 좁아짐.
    const startPx = Math.max(LETTER_SPACING_MIN, Math.min(LETTER_SPACING_MAX, charSpacingToPx(anchor.charSpacing, anchor.fontSize)));
    letterSpacingGauge.value = startPx;
    updateLetterSpacingGaugeFill(startPx);
    letterSpacingGauge.disabled = !boxes.some(isTextObject);
    letterSpacingGauge.title = '자간';
    floatingBoldBtn.classList.toggle('on', anchor.fontWeight === 'bold' || anchor.fontWeight >= 700);
    floatingItalicBtn.classList.toggle('on', anchor.fontStyle === 'italic');
    floatingUnderlineBtn.classList.toggle('on', !!anchor.underline);
    updateGroupToggleBtn();
    // 이제 더보기/접기 구분 없이 항상 펼친 상태로 둠(요청에 따라 토글 버튼 자체를 없앰)
    if (wasHidden) setFontPopoverMoreOpen(true);

    // T 버튼으로 처음 열 때만 텍스트 아래(6시 방향)에 배치하고,
    // 다른 텍스트를 클릭해서 대상이 바뀌는 경우엔 드래그해둔 자리 그대로 고정
    const reposition = !opts || opts.reposition !== false;
    if (reposition) {
      positionFontPopover(target);
    } else {
      fontPopover.classList.remove('hidden');
      clampFontPopoverToViewport();
    }
  }

  floatingFontSelect.addEventListener('change', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontFamily', 'fontWeight']); o.set('fontFamily', floatingFontSelect.value); });
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) fontFamilySelect.value = floatingFontSelect.value;
    canvas.requestRenderAll();
    forceFontReloadRedraw(boxes, floatingFontSelect.value);
    pushHistory();
  });

  floatingFontSizeInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const v = Math.max(10, parseInt(floatingFontSizeInput.value, 10) || 10);
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontSize']); o.set('fontSize', v); });
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) { fontSizeInput.value = v; fontSizeGauge.value = v; }
    canvas.requestRenderAll();
  });
  floatingFontSizeInput.addEventListener('change', () => {
    floatingFontSizeInput.value = Math.max(10, parseInt(floatingFontSizeInput.value, 10) || 10);
    pushHistory();
  });

  floatingOpacityInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets;
    if (!boxes.length) return;
    const v = parseFloat(floatingOpacityInput.value);
    boxes.forEach(o => o.set('opacity', v));
    updateOpacityGaugeFill(v);
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) opacityInput.value = v;
    canvas.requestRenderAll();
  });
  floatingOpacityInput.addEventListener('change', () => pushHistory());

  // 무지개 게이지: 드래그하면 그 위치의 색이 모든 텍스트 박스에 바로 적용됨
  colorGaugeInput.addEventListener('input', () => {
    const boxes = fontPopoverTargets;
    if (!boxes.length) return;
    const hex = gaugePosToHex(parseFloat(colorGaugeInput.value));
    boxes.forEach(o => o.set('fill', hex));
    fontColorSwatch.value = hex;
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) textColorInput.value = hex;
    canvas.requestRenderAll();
  });
  colorGaugeInput.addEventListener('change', () => pushHistory());

  // 작은 정사각형 스와치: 클릭하면 CMYK 상세 색상 선택창이 뜨고, 고르면 모든 텍스트 박스에 바로 적용
  fontColorSwatch.addEventListener('input', () => {
    const boxes = fontPopoverTargets;
    if (!boxes.length) return;
    const hex = fontColorSwatch.value;
    boxes.forEach(o => o.set('fill', hex));
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const inZone = hsv.h >= GAUGE_TRIGGER_MIN && hsv.h <= GAUGE_TRIGGER_MAX;
    colorGaugeInput.value = inZone ? GAUGE_YELLOW_POS : GAUGE_CORNER_POS;
    const active = canvas.getActiveObject();
    if (active && isTextObject(active)) textColorInput.value = hex;
    canvas.requestRenderAll();
    pushHistory();
  });

  // "더보기" 버튼: 클릭할 때마다 펼침 ↔ 접기 전환, 높이가 바뀌므로 위치를 다시 계산
  fontPopoverMoreBtn.addEventListener('click', () => {
    const willOpen = fontPopoverMore.classList.contains('hidden');
    setFontPopoverMoreOpen(willOpen);
    clampFontPopoverToViewport();
  });

  // 정렬 옆 픽셀입력창: "일정간격 정렬" 기능 — 묶어 선택한 텍스트 박스들을, 첫 줄(맨 위) 박스를 기준으로
  // 입력한 픽셀만큼 세로 간격이 일정하게 벌어지도록 배치함. (텍스트 박스가 2개 이상 묶였을 때만 동작)
  // 정렬 기준 정렬/이동 모두 raw top이 아니라 화면 기준 실제 위치(getBoundingRect)로 계산하고,
  // 이동도 중심점 이동방식을 씀 — 캔버스를 90도 회전해서 오브젝트에 angle이 붙어있어도 항상
  // 화면 기준으로 정확하게 동작함(가로 정렬 때와 같은 이유의 같은 수정).
  function currentBoxGapPx(boxes){
    if (boxes.length < 2) return 0;
    const sorted = boxes.slice().sort((a, b) => a.getBoundingRect(true, true).top - b.getBoundingRect(true, true).top);
    const br0 = sorted[0].getBoundingRect(true, true);
    const br1 = sorted[1].getBoundingRect(true, true);
    return Math.round(br1.top - (br0.top + br0.height));
  }
  function applyBoxGapPx(gapPx){
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return; // 묶인 텍스트가 2개 이상일 때만 의미가 있음
    const sorted = boxes.slice().sort((a, b) => a.getBoundingRect(true, true).top - b.getBoundingRect(true, true).top);
    let br = sorted[0].getBoundingRect(true, true);
    let cursorBottom = br.top + br.height;
    for (let i = 1; i < sorted.length; i++) {
      const o = sorted[i];
      const curBr = o.getBoundingRect(true, true);
      const dy = (cursorBottom + gapPx) - curBr.top;
      const c = o.getCenterPoint();
      o.setPositionByOrigin(new fabric.Point(c.x, c.y + dy), 'center', 'center');
      o.setCoords();
      const newBr = o.getBoundingRect(true, true);
      cursorBottom = newBr.top + newBr.height;
    }
    canvas.requestRenderAll();
  }
  boxGapPxInput.addEventListener('input', () => {
    const px = parseFloat(boxGapPxInput.value) || 0;
    applyBoxGapPx(px);
  });
  boxGapPxInput.addEventListener('change', () => pushHistory());

  // 가로정렬 픽셀입력창: 세로정렬(위)과 완전히 동일한 방식으로, 축만 가로(X)로 바꾼 버전.
  // 묶어 선택한 텍스트 박스들을 맨 왼쪽 박스 기준으로 입력한 픽셀만큼 가로 간격이 일정하게
  // 벌어지도록 배치함.
  function currentBoxGapPxX(boxes){
    if (boxes.length < 2) return 0;
    const sorted = boxes.slice().sort((a, b) => a.getBoundingRect(true, true).left - b.getBoundingRect(true, true).left);
    const br0 = sorted[0].getBoundingRect(true, true);
    const br1 = sorted[1].getBoundingRect(true, true);
    return Math.round(br1.left - (br0.left + br0.width));
  }
  function applyBoxGapPxX(gapPx){
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return;
    const sorted = boxes.slice().sort((a, b) => a.getBoundingRect(true, true).left - b.getBoundingRect(true, true).left);
    let br = sorted[0].getBoundingRect(true, true);
    let cursorRight = br.left + br.width;
    for (let i = 1; i < sorted.length; i++) {
      const o = sorted[i];
      const curBr = o.getBoundingRect(true, true);
      const dx = (cursorRight + gapPx) - curBr.left;
      const c = o.getCenterPoint();
      o.setPositionByOrigin(new fabric.Point(c.x + dx, c.y), 'center', 'center');
      o.setCoords();
      const newBr = o.getBoundingRect(true, true);
      cursorRight = newBr.left + newBr.width;
    }
    canvas.requestRenderAll();
  }
  const boxGapPxXInput = document.getElementById('boxGapPxXInput');
  boxGapPxXInput.addEventListener('input', () => {
    const px = parseFloat(boxGapPxXInput.value) || 0;
    applyBoxGapPxX(px);
  });
  boxGapPxXInput.addEventListener('change', () => pushHistory());

  // 상단정렬/중단정렬/하단정렬 — 좌단/가운데/우측(가로)의 세로 버전.
  // 상단: 맨 위(가장 작은 top) 박스의 윗변에 맞춤 / 하단: 맨 아래(가장 큰 bottom) 박스의
  // 아랫변에 맞춤 / 중단: 선택된 박스들 전체(맨 위~맨 아래)의 한가운데 높이에 각자의 세로
  // 중심을 맞춤.
  function alignTextBoxesVertical(mode){
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return;

    if (mode === 'middle') {
      let minTop = Infinity, maxBottom = -Infinity;
      boxes.forEach(o => {
        const br = o.getBoundingRect(true, true);
        minTop = Math.min(minTop, br.top);
        maxBottom = Math.max(maxBottom, br.top + br.height);
      });
      const midY = (minTop + maxBottom) / 2;
      boxes.forEach(o => {
        const br = o.getBoundingRect(true, true);
        const dy = midY - (br.top + br.height / 2);
        const c = o.getCenterPoint();
        o.setPositionByOrigin(new fabric.Point(c.x, c.y + dy), 'center', 'center');
        o.setCoords();
      });
    } else {
      let ref = boxes[0];
      let refBr = ref.getBoundingRect(true, true);
      boxes.forEach(o => {
        const br = o.getBoundingRect(true, true);
        const better = mode === 'top' ? (br.top < refBr.top) : ((br.top + br.height) > (refBr.top + refBr.height));
        if (better) { ref = o; refBr = br; }
      });
      boxes.forEach(o => {
        if (o === ref) return;
        const br = o.getBoundingRect(true, true);
        const dy = mode === 'top' ? (refBr.top - br.top) : ((refBr.top + refBr.height) - (br.top + br.height));
        const c = o.getCenterPoint();
        o.setPositionByOrigin(new fabric.Point(c.x, c.y + dy), 'center', 'center');
        o.setCoords();
      });
    }
    canvas.requestRenderAll();
    pushHistory();
  }
  document.getElementById('topAlignBtn').addEventListener('click', () => alignTextBoxesVertical('top'));
  document.getElementById('middleAlignBtn').addEventListener('click', () => alignTextBoxesVertical('middle'));
  document.getElementById('bottomAlignBtn').addEventListener('click', () => alignTextBoxesVertical('bottom'));

  // 묶기/풀기 버튼: 텍스트끼리 서로 묶는 기능. 묶으면 이후엔 어디를 클릭해도 묶인 텍스트가
  // 통으로 선택되고, 풀기를 누르면 다시 개별 텍스트로 선택할 수 있게 풀어짐.
  function updateGroupToggleBtn(){
    const active = canvas.getActiveObject();
    if (active && active.type === 'group' && textBoxesFromTarget(active).length > 0) {
      groupToggleBtn.textContent = '풀기';
      groupToggleBtn.disabled = false;
      groupToggleBtn.title = '묶은 것을 다시 풀기';
    } else if (active && active.type === 'activeSelection' && textBoxesFromTarget(active).length >= 2) {
      groupToggleBtn.textContent = '묶기';
      groupToggleBtn.disabled = false;
      groupToggleBtn.title = '선택한 것들을 하나로 묶기';
    } else {
      groupToggleBtn.textContent = '묶기';
      groupToggleBtn.disabled = true;
      groupToggleBtn.title = '오브젝트를 2개 이상 묶어 선택하면 사용할 수 있어요';
    }
  }
  groupToggleBtn.addEventListener('click', () => {
    const active = canvas.getActiveObject();
    if (!active) return;
    if (active.type === 'group') {
      const sel = active.toActiveSelection();
      canvas.setActiveObject(sel);
      canvas.requestRenderAll();
      pushHistory();
      syncFontPopoverToSelection();
    } else if (active.type === 'activeSelection') {
      const group = active.toGroup();
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      pushHistory();
      openFontPopover(group, { reposition: false });
    }
  });

  // 자간 게이지: 픽셀입력창(정렬)과는 완전히 별개인 자간(글자 사이 간격) 기능.
  // 드래그하는 대로 자간이 넓어지고 좁아짐. 텍스트가 1개 이상 선택되어 있으면 항상 사용 가능.
  function applyLetterSpacingPx(px){
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    boxes.forEach(o => o.set('charSpacing', pxToCharSpacing(px, o.fontSize)));
    canvas.requestRenderAll();
  }
  letterSpacingGauge.addEventListener('input', () => {
    if (letterSpacingGauge.disabled || !fontPopoverTargets.length) return;
    const px = parseFloat(letterSpacingGauge.value) || 0;
    applyLetterSpacingPx(px);
    updateLetterSpacingGaugeFill(px);
  });
  letterSpacingGauge.addEventListener('change', () => pushHistory());

  floatingBoldBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeBold = !(anchor.fontWeight === 'bold' || anchor.fontWeight >= 700);
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontWeight']); o.set('fontWeight', makeBold ? 'bold' : 'normal'); });
    floatingBoldBtn.classList.toggle('on', makeBold);
    canvas.requestRenderAll();
    pushHistory();
  });
  floatingItalicBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeItalic = anchor.fontStyle !== 'italic';
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['fontStyle']); o.set('fontStyle', makeItalic ? 'italic' : 'normal'); });
    floatingItalicBtn.classList.toggle('on', makeItalic);
    canvas.requestRenderAll();
    pushHistory();
  });
  floatingUnderlineBtn.addEventListener('click', () => {
    const boxes = fontPopoverTargets.filter(isTextObject);
    if (!boxes.length) return;
    const anchor = boxes[0];
    const makeUnderline = !anchor.underline;
    boxes.forEach(o => { clearPerCharStyleOverrides(o, ['underline']); o.set('underline', makeUnderline); });
    floatingUnderlineBtn.classList.toggle('on', makeUnderline);
    canvas.requestRenderAll();
    pushHistory();
  });

  // 텍스트 박스끼리 서로 정렬 (텍스트 안의 줄맞춤이 아니라, 캔버스 위 텍스트 박스들의 위치를 맞춤)
  // 기준: 화면에 실제로 보이는 위치 기준으로 가장 위쪽에 있는 텍스트 박스
  function alignTextBoxesToFirstLine(mode){
    const boxes = fontPopoverTargets;
    if (boxes.length < 2) return; // 맞춰볼 다른 텍스트 박스가 없음

    let ref = boxes[0];
    let refTop = ref.getBoundingRect(true, true).top;
    for (const o of boxes) {
      const t = o.getBoundingRect(true, true).top;
      if (t < refTop) { ref = o; refTop = t; }
    }
    const refBr = ref.getBoundingRect(true, true);

    boxes.forEach(o => {
      if (o === ref) return;
      const br = o.getBoundingRect(true, true);
      let dx = 0;
      if (mode === 'left') dx = refBr.left - br.left;
      else if (mode === 'center') dx = (refBr.left + refBr.width / 2) - (br.left + br.width / 2);
      else if (mode === 'right') dx = (refBr.left + refBr.width) - (br.left + br.width);
      const c = o.getCenterPoint();
      o.setPositionByOrigin(new fabric.Point(c.x + dx, c.y), 'center', 'center');
      o.setCoords();
    });

    canvas.requestRenderAll();
    pushHistory();
  }
  floatingAlignLeftBtn.addEventListener('click', () => alignTextBoxesToFirstLine('left'));
  floatingAlignCenterBtn.addEventListener('click', () => alignTextBoxesToFirstLine('center'));
  floatingAlignRightBtn.addEventListener('click', () => alignTextBoxesToFirstLine('right'));

  // T버튼으로 연 패널은 자동으로 닫히지 않고, 우측 상단 ✕ 버튼을 눌러야만 닫힘
  document.getElementById('fontPopoverCloseBtn').addEventListener('click', hideFontPopover);

  // 패널을 자유롭게 드래그로 이동 (드롭다운/게이지/스와치/닫기버튼 위에서는 드래그 시작 안 함)
  makeDraggablePopover(fontPopover);

  function refreshEmptyHint(){
    // (캔버스 중앙 안내 문구는 제거됨 — 이 함수는 다른 곳에서 계속 호출되므로 빈 채로 남겨둠)
  }

  /* ---------- 상태바 표시 ---------- */
  document.getElementById('sizeLabel').textContent = `${ratioW} × ${ratioH} (붉은박스 기준)`;
  const sideChip = document.getElementById('sideChip');
  sideChip.textContent = isDouble ? '양면' : '단면';
  sideChip.classList.toggle('double', isDouble);
  const orderInfoLabel = document.getElementById('orderInfoLabel');
  const passedKeys = Object.keys(orderData);
  orderInfoLabel.textContent = passedKeys.length
    ? '전달된 주문정보: ' + passedKeys.map(k => `${k}=${orderData[k]}`).join(' · ')
    : '(전달된 쿼리 파라미터 없음 — 기본값으로 동작)';

  /* ============================================================
     3. 안내선(붉은 재단선 + 회색 여유선)
     - 항상 canvas 맨 위에 떠 있고, 선택/저장 대상에서는 제외됨
  ============================================================ */
  let guideRect, outerGuideRect, gridGuide, guideState = 0; // 0=붉은 박스만, 1=붉은 박스+모눈, 2=숨김
  const GRID_SPACING = 10; // 모눈 간격(px) — 요청대로 기존(5)의 2배로 넓힘

  function buildGridGuide(){
    // min(W,H) 기준으로 계산해야 90도 회전으로 W/H가 서로 바뀌어도 여백(padding) 값 자체는
    // 항상 그대로 유지됨(CANVAS_W만 기준으로 하면 회전할 때마다 값이 달라져서 재단선 크기가
    // 회전 전과 안 맞아 보이는 문제가 있었음 — 아래 buildGuides()와 같은 이유의 같은 수정).
    const padding = Math.min(CANVAS_W, CANVAS_H) * 0.03;
    const gw = CANVAS_W - padding * 2, gh = CANVAS_H - padding * 2;
    let d = '';
    for (let x = 0; x <= gw; x += GRID_SPACING) d += 'M' + x + ',0 L' + x + ',' + gh + ' ';
    for (let y = 0; y <= gh; y += GRID_SPACING) d += 'M0,' + y + ' L' + gw + ',' + y + ' ';
    gridGuide = new fabric.Path(d, {
      left: padding, top: padding,
      fill: '', stroke: 'rgba(62,214,163,0.4)', strokeWidth: 0.5, // 민트색 격자
      selectable: false, evented: false, visible: guideState === 1
    });
    gridGuide.isGuide = true;
    canvas.add(gridGuide);
  }

  function buildGuides(){
    // min(W,H) 기준으로 계산 — CANVAS_W만 기준으로 하면 캔버스를 90도 회전할 때마다
    // (W/H가 서로 맞바뀌므로) 이 padding 값 자체가 매번 달라져서, 회전을 거듭할수록
    // 붉은 재단선 박스의 여백(=사실상 실제 인쇄 크기)이 회전 전과 안 맞고 계속 줄어들거나
    // 커지는 문제가 있었음. min(W,H)는 회전으로 W/H가 서로 바뀌어도 값이 절대 안 바뀌므로,
    // 몇 번을 회전해도 여백이 항상 정확히 같게 유지됨(요청: "회전 전과 크기 매칭 안되는 문제").
    const padding = Math.min(CANVAS_W, CANVAS_H) * 0.03;
    guideRect = new fabric.Rect({
      left: padding, top: padding,
      width: CANVAS_W - padding * 2, height: CANVAS_H - padding * 2,
      fill: 'transparent', stroke: '#ff0000', strokeWidth: 2,
      selectable: false, evented: false, visible: guideState !== 2
    });
    guideRect.isGuide = true;

    // 예전엔 얇은 테두리선(stroke)으로 그렸는데, stroke는 기준선 위에 "가운데 정렬"로 그려지는
    // 방식이라 두께의 절반이 캔버스 밖으로 나가 잘리거나(그래서 방향에 따라 안 보이던 문제),
    // 살짝 안쪽으로 들여도 화면 배율·기기 해상도에 따라 미세하게 안티에일리어싱이 번져서
    // 방향마다 두께가 다르게 보이거나 바깥쪽에 지저분한 흰 선이 비치는 문제가 있었음.
    // 그래서 선이 아니라 "캔버스 전체 사각형에서 안쪽 사각형을 뺀 도넛(액자) 모양"을
    // 그냥 회색으로 꽉 채워서 그림 — 이렇게 하면 두께가 사방 어디서든 정확히 outerThickness
    // px로 완전히 균일하고, 캔버스 가장자리에 딱 맞물려서 바깥으로 새거나 잘리는 부분이
    // 전혀 없음(선의 "중심 정렬" 개념 자체가 없어져서 이 문제가 원천적으로 사라짐).
    // outerThickness를 고정값(예: 2)으로 두면, 규격이 작아서 padding 자체가 작을 때(예:
    // 좁고 긴 배너) 이 고정 두께가 padding을 통째로 잡아먹어서 재단선(빨강)과 회색 테두리가
    // 서로 거의 붙어(또는 완전히 붙어) 보이는 문제가 있었음(요청: "재단선이 회색선에 딱
    // 달라붙어있다"). 그래서 padding에 비례하는 두께로 바꿔서, 어떤 규격이든 항상 눈에
    // 보이는 일정한 간격이 유지되게 함.
    const outerThickness = Math.max(1.5, padding * 0.15);
    const outerFrameD =
      `M0,0 L${CANVAS_W},0 L${CANVAS_W},${CANVAS_H} L0,${CANVAS_H} Z ` +
      `M${outerThickness},${outerThickness} L${outerThickness},${CANVAS_H - outerThickness} L${CANVAS_W - outerThickness},${CANVAS_H - outerThickness} L${CANVAS_W - outerThickness},${outerThickness} Z`;
    outerGuideRect = new fabric.Path(outerFrameD, {
      left: 0, top: 0,
      fill: '#999999', fillRule: 'evenodd', stroke: '', strokeWidth: 0,
      selectable: false, evented: false, visible: guideState !== 2
    });
    outerGuideRect.isGuide = true;

    canvas.add(guideRect, outerGuideRect);
    buildGridGuide();
  }
  function bringGuideToFront(){
    if (guideRect) canvas.bringToFront(guideRect);
    if (outerGuideRect) canvas.bringToFront(outerGuideRect);
    if (gridGuide) canvas.bringToFront(gridGuide);
  }
  buildGuides();

  // 붉은선(재단선)의 "실제로 보여야 할 상태"는 두 스위치가 함께 결정함:
  //  1) 기존 guideToggleBtn의 3단계 순환(재단선만 / 재단선+모눈 / 전부 숨김)
  //  2) 새로 추가한 "👁 문구·붉은선 가리기" 버튼(회색선은 그대로 두고 붉은선+안내문구만 따로 숨김)
  // 둘 중 하나라도 "숨김"이면 붉은선은 안 보여야 하므로, 이 함수로 항상 같이 계산해서 반영함.
  let redLineHiddenByCaptionBtn = false;
  function updateGuideRectVisibility(){
    guideRect.visible = (guideState !== 2) && !redLineHiddenByCaptionBtn;
    canvas.renderAll();
  }

  document.getElementById('guideToggleBtn').addEventListener('click', () => {
    // 1번째: 붉은 재단선 박스만 표시 → 2번째: 그 안에 5px 간격 모눈까지 표시 → 3번째: 전부 숨김
    guideState = (guideState + 1) % 3;
    const boxVisible = guideState !== 2;
    outerGuideRect.visible = boxVisible;
    gridGuide.visible = guideState === 1;
    updateGuideRectVisibility();
  });

  // 모바일 전용 — 문구 가리기 눈 아이콘 옆의 "▦" 안내선 버튼은 위 guideToggleBtn을 그대로
  // 클릭해주는 것뿐(100% 재사용, 새 로직 없음).
  const mobileCanvasGuideToggleBtn = document.getElementById('mobileCanvasGuideToggleBtn');
  if (mobileCanvasGuideToggleBtn) {
    mobileCanvasGuideToggleBtn.addEventListener('click', () => {
      document.getElementById('guideToggleBtn').click();
    });
  }

  // "👁 문구·붉은선 가리기" — 캔버스 바깥의 안내 문구(붉은선/회색선 설명)와 캔버스 안의
  // 붉은 재단선만 같이 숨김(회색선·모눈은 그대로 둠). 다시 누르면 원래대로 돌아옴.
  const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const canvasCaptionToggleBtn = document.getElementById('canvasCaptionToggleBtn');
  const canvasRedLineCaption = document.getElementById('canvasRedLineCaption');
  if (canvasCaptionToggleBtn && canvasRedLineCaption) {
    canvasCaptionToggleBtn.addEventListener('click', () => {
      redLineHiddenByCaptionBtn = !redLineHiddenByCaptionBtn;
      canvasRedLineCaption.classList.toggle('hidden', redLineHiddenByCaptionBtn);
      canvasCaptionToggleBtn.classList.toggle('active', redLineHiddenByCaptionBtn);
      canvasCaptionToggleBtn.innerHTML = redLineHiddenByCaptionBtn ? EYE_OFF_SVG : EYE_OPEN_SVG;
      canvasCaptionToggleBtn.title = redLineHiddenByCaptionBtn ? '문구·붉은선 다시 보이기' : '문구·붉은선 가리기';
      updateGuideRectVisibility();
    });
  }

  /* ============================================================
     3b. 캔버스 전체 90도 회전
     - 캔버스 크기(가로/세로)가 서로 바뀌고, 안의 모든 오브젝트(안내선 포함)가
       캔버스에 붙어있는 것처럼 함께 회전합니다 (상대 위치·각도 그대로 유지).
  ============================================================ */
  function rotateCanvas90(dir){ // dir: 1 = 시계방향, -1 = 반시계방향
    // 여러 오브젝트를 묶어 선택한(ActiveSelection) 상태로 회전을 실행하면, fabric이 그
    // 선택묶음 자체의 좌표계를 따로 캐싱하고 있어서 그 상태로 개별 오브젝트의 위치를 하나씩
    // 바꾸면 좌표가 꼬여 엉뚱한 곳으로 튀어보일 수 있음(특히 텍스트 여러 개를 묶어 캔버스
    // 중앙에 배치해둔 경우에 두드러짐). 그래서 선택 해제를 맨 뒤가 아니라 맨 앞에서 먼저
    // 해줘서, 모든 오브젝트가 항상 순수 캔버스 절대좌표 기준으로 이동하도록 함.
    canvas.discardActiveObject();

    const oldW = CANVAS_W, oldH = CANVAS_H;

    // 오브젝트 하나(모양/패스/텍스트/이미지 등)의 중심점·각도를 새 캔버스 크기 기준으로 회전시킴.
    // 클리핑 마스크로 붙인 클립패스(absolutePositioned:true)에도 그대로 재사용함 — 이건
    // canvas.getObjects()에 안 잡히는 별도 오브젝트라서, 안 챙겨주면 캔버스는 돌아갔는데
    // 클립 경계(마스크 창)만 예전 위치·각도에 그대로 남아 어긋나 버리는 문제가 있었음.
    function rotateOneObject(obj){
      const c = obj.getCenterPoint();
      let nx, ny;
      if (dir === 1) { nx = oldH - c.y; ny = c.x; }
      else { nx = c.y; ny = oldW - c.x; }
      // 순서 중요: 각도를 먼저 바꾸고 그 다음에 위치(중심점)를 맞춰야 함.
      // "모양 만들기"로 만든 도형들은 originX/Y가 'center'라서 순서가 상관없었지만,
      // 텍스트·펜 도구 패스는 origin이 'left'/'top'이라, 위치를 먼저 맞추고 나중에
      // 각도를 바꾸면 "모서리→중심" 오프셋이 새 각도로 다시 회전되면서 중심점이 엉뚱한
      // 곳으로 밀려나 버림(그래서 도형은 멀쩡한데 텍스트/펜 패스만 위치가 이탈해 보였음).
      if (!obj.isGuide) {
        obj.set('angle', ((obj.angle || 0) + dir * 90 + 360) % 360);
      }
      obj.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center');
      obj.setCoords();
    }

    canvas.getObjects().forEach((obj) => {
      rotateOneObject(obj);
      // 클리핑 마스크로 붙은 클립패스가 캔버스 절대좌표 기준(absolutePositioned)이면
      // 오브젝트 본체와 똑같이 같이 돌려줘야 마스크 창이 새 위치에도 정확히 들어맞음
      if (obj.clipPath && obj.clipPath.absolutePositioned) {
        rotateOneObject(obj.clipPath);
        obj.dirty = true;
      }
    });

    // 캔버스 논리 크기 및 규격 비율 교체 (가로 ↔ 세로)
    CANVAS_W = oldH;
    CANVAS_H = oldW;
    const tmpRatio = ratioW; ratioW = ratioH; ratioH = tmpRatio;

    // 캔버스 회전 누적 각도 갱신 → 다음 렌더부터 P/T 미니버튼이 이 각도만큼 회전되어 그려짐,
    // 그리고 지금 이미 열려있는 T/P 팝업창이 있다면 즉시 같은 각도로 회전·재배치함
    EP.canvasRotationDeg = ((EP.canvasRotationDeg || 0) + dir * 90 + 360) % 360;
    EP.refreshRotatablePopovers();

    // 안내선(붉은선/회색선/모눈)을 새 크기에 맞게 다시 생성.
    // 변수 3개(guideRect/outerGuideRect/gridGuide)만 지우는 대신, isGuide 표시가 붙은
    // 오브젝트를 캔버스에서 전부 찾아서 지움 — 이렇게 해야 어떤 이유로든 변수 참조가
    // 실제 캔버스 상태와 어긋나 있어도 안내선이 중복으로 남지 않고 확실히 다 정리됨
    // (회전할 때마다 예전 재단선이 안 지워지고 겹겹이 쌓여 보이던 문제의 원인).
    canvas.getObjects().filter(o => o.isGuide).forEach(o => canvas.remove(o));
    buildGuides();
    if (typeof updateGuideRectVisibility === 'function') updateGuideRectVisibility(); // "👁 문구·붉은선 가리기"로 숨겨둔 상태였다면 새로 만든 붉은선에도 그대로 유지

    // 곡선/원형/물결 등 특수 효과가 걸린 텍스트는 렌더링 방식이 패치되어 있는데, 회전으로
    // angle·위치가 바뀐 뒤에도 그 패치가 정확히 다시 반영되도록 강제로 재적용
    if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
    if (EP.reapplyShapeComboPatches) EP.reapplyShapeComboPatches();

    // 현재 줌 배율을 유지한 채 캔버스 엘리먼트 크기 갱신
    setZoomLevel(zoom);

    document.getElementById('sizeLabel').textContent = `${ratioW} × ${ratioH} (붉은박스 기준)`;
    canvas.discardActiveObject();
    canvas.renderAll();
    pushHistory();
  }

  document.getElementById('rotateCanvasLeftBtn').addEventListener('click', () => rotateCanvas90(-1));
  document.getElementById('rotateCanvasRightBtn').addEventListener('click', () => rotateCanvas90(1));

  // 캔버스 전체가 아니라, 지금 선택한 모양/텍스트 오브젝트 하나만 90도 회전·좌우반전
  document.getElementById('rotateObjectBtn').addEventListener('click', () => {
    const o = canvas.getActiveObject();
    if (!o) return;
    o.set('angle', ((o.angle || 0) + 90) % 360);
    o.setCoords();
    canvas.requestRenderAll();
    pushHistory();
  });
  document.getElementById('flipObjectXBtn').addEventListener('click', () => {
    const o = canvas.getActiveObject();
    if (!o) return;
    o.set('flipX', !o.flipX);
    canvas.requestRenderAll();
    pushHistory();
  });

  /* ============================================================
     3c. 메가메뉴(드롭다운) 공통 동작
     - 트리거 버튼을 누르면 메뉴가 열리고, 다른 메뉴를 열거나 바깥을 클릭하면 닫힘
     - 메뉴 안의 항목(버튼/라벨)을 클릭하면 해당 동작 후 자동으로 닫힘
  ============================================================ */
  const megaMenus = [
    { trigger: document.getElementById('fileMenuBtn'), menu: document.getElementById('fileMenu') },
    { trigger: document.getElementById('shapeMenuBtn'), menu: document.getElementById('shapeMenu') },
    { trigger: document.getElementById('rotateMenuBtn'), menu: document.getElementById('rotateMenu') },
    { trigger: document.getElementById('zoomMenuBtn'), menu: document.getElementById('zoomMenu') },
    // 모바일 전용 상단 드롭다운(#mobileMenuBtn) — PC 메가메뉴와 완전히 같은 열기/닫기 동작을 씀
    { trigger: document.getElementById('mobileMenuBtn'), menu: document.getElementById('mobileMenuDropdown') },
    // 모바일 전용 "통합"(공통적용/부분적용/모두저장) 드롭다운 — 건수 2개 이상일 때만 실제로
    // 보이지만(숨겨져 있으면 어차피 못 누르므로), 열고/닫는 동작만 다른 메가메뉴들과 동일하게 등록
    { trigger: document.getElementById('mobileUnifyBtn'), menu: document.getElementById('mobileUnifyMenu') }
  ];

  function closeAllMegaMenus(){
    megaMenus.forEach(({ menu }) => { if (menu) menu.classList.add('hidden'); });
  }

  megaMenus.forEach(({ trigger, menu }) => {
    // 이 중 하나라도 페이지에 없으면(예: HTML 버전이 안 맞아서 특정 버튼이 빠진 경우) 여기서
    // 예외가 나서 이 뒤에 있는 삭제/레이어/CMYK 색상칸 등록 코드 전체가 통째로 실행이 안 되는
    // 문제가 있었음 — 반드시 존재 여부를 먼저 확인하고 없으면 그냥 건너뜀
    if (!trigger || !menu) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      closeAllMegaMenus();
      if (willOpen) menu.classList.remove('hidden');
    });
    // 메뉴 안의 항목을 클릭하면(파일첨부 라벨 포함) 동작이 실행된 뒤 메뉴를 닫음
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      setTimeout(() => menu.classList.add('hidden'), 0);
    });
  });

  document.addEventListener('click', () => closeAllMegaMenus());

  // 모바일 상단 드롭다운 "🔲 글씨 가리기" — PC의 '✏️ 편집하기 > ◆ 모양 만들기 > ▭ 사각형'
  // (#pickRectBtn)과 완전히 동일한 기능을 그대로 호출함. 새 도구를 만드는 게 아니라
  // 기존 사각형 생성 기능의 진입로만 모바일용으로 하나 더 뚫어주는 것뿐이라, 만들어진
  // 사각형은 PC에서 만든 것과 똑같이(캔버스 정가운데, 파란색 180x120) 생기고, 그 뒤로는
  // 캔버스 위에서 손가락으로 직접 옮기고 크기 조절해서 가리고 싶은 글씨 위에 덮으면 됨.
  // 모바일 상단 드롭다운 "◆ 모양 만들기" — PC의 '✏️ 편집하기 > ◆ 모양 만들기'(#openShapePickerBtn)와
  // 완전히 동일한 기능을 그대로 호출함. 예전엔 사각형 하나만 바로 만들어주는 "글씨 가리기"
  // 버튼이었는데, 이제는 PC와 똑같이 사각형/둥근사각형/원/삼각형/별/하트/자유모양 중 골라서
  // 만들 수 있는 모양 만들기 팝업이 그대로 뜸(새 기능이 아니라 100% 재사용).
  // "🆕 새로 만들기" — 캔버스에 흰색 바탕을 깔아줌. 새 기능을 따로 만들지 않고, 이미 있는
  // "🎨 바탕 채우기" 모달의 "⬜ 바탕생성 (흰 바탕)" 버튼(#bgFillWhiteBtn, ecopro3bg.js)을 그대로
  // 클릭해줌 — 모달이 화면에 열려있지 않아도 클릭 이벤트는 그대로 실행되므로 모달을 굳이
  // 열었다 닫을 필요 없이 흰 배경 사각형만 조용히 만들어짐.
  const newCanvasBtn = document.getElementById('newCanvasBtn');
  const NEW_CANVAS_AFTER_RELOAD_KEY = 'ecopro3_new_canvas_after_reload';
  if (newCanvasBtn) {
    newCanvasBtn.addEventListener('click', () => {
      // 요청: "새로만들기 누르면 새로고침후 바탕만들기 해줘" — 지금까지 작업 중이던 내용이
      // 다 사라지는 동작이라, 새로고침 버튼과 똑같이 한 번 확인을 받음. 확인하면 새로고침
      // 하기 직전에 플래그를 하나 남겨두고, 페이지가 다시 열렸을 때(아래 별도 리스너) 그
      // 플래그를 보고 자동으로 흰 배경을 만들어줌.
      if (!confirm('새로고침 후 새 바탕을 만듭니다. 계속할까요?')) return;
      try { sessionStorage.setItem(NEW_CANVAS_AFTER_RELOAD_KEY, '1'); } catch (err) { /* 저장 안 되면 그냥 진행 */ }
      location.reload();
    });
  }
  // 새로고침 직후, 방금 남겨둔 플래그가 있으면 자동으로 흰 배경을 만들어줌(위 클릭 핸들러와 이어짐)
  try {
    if (sessionStorage.getItem(NEW_CANVAS_AFTER_RELOAD_KEY)) {
      sessionStorage.removeItem(NEW_CANVAS_AFTER_RELOAD_KEY);
      setTimeout(() => {
        const bgFillWhiteBtn = document.getElementById('bgFillWhiteBtn');
        if (bgFillWhiteBtn) bgFillWhiteBtn.click();
        const bgRect = canvas.getActiveObject();
        if (bgRect && bgRect.isCanvasBgFill && EP.lockImage) EP.lockImage(bgRect);
        if (EP.showBottomHintToast) EP.showBottomHintToast('새창이 생성되었습니다. 배경에 흰색바탕이 깔려있어요.');
      }, 300); // 캔버스·기타 초기화가 다 끝난 뒤에 실행되도록 살짝 늦춤
    }
  } catch (err) { /* sessionStorage 사용 불가 환경이면 조용히 무시 */ }
  const mobileNewCanvasBtn = document.getElementById('mobileNewCanvasBtn');
  if (mobileNewCanvasBtn) {
    mobileNewCanvasBtn.addEventListener('click', () => {
      if (newCanvasBtn) newCanvasBtn.click();
    });
  }

  /* ============================================================
     "🎲 랜덤 디자인 생성" (PC/모바일 공통 — 새로 만들기 바로 아래)
     - 누를 때마다: 기존 오브젝트를 전부 지우고 → 흰 배경을 새로 깔고(새로 만들기와 같은
       방식 재사용) → 가운데에 인사말(매번 다른 문구로 랜덤) + 그 아래 작은 안내문구 2줄을
       넣고 → "🎲 전체 랜덤 적용"(#rollAllBtn)을 한 번 실행해서 그 텍스트들에 랜덤 필터를
       입혀줌. 완전히 새 디자인 하나를 즉석에서 만들어보는 용도. 실제 로직은 PC 버튼
       (#randomDesignBtn)에 붙이고, 모바일 버튼은 그 PC 버튼을 그대로 클릭해주는 방식으로
       재사용함(100% 동일 동작 보장).
  ============================================================ */
  const RANDOM_GREETINGS = [
    '안녕하세요.', '환영합니다.', '반갑습니다.', '어서오세요.',
    '만나서 반가워요.', '좋은 하루 되세요.', '오늘도 화이팅!',
    '방문해주셔서 감사해요.', '행복한 하루예요.', '즐거운 시간 되세요.',
    '와주셔서 감사합니다.', '늘 감사드려요.', '좋은 인연이길 바래요.',
    '오늘 하루도 힘내세요.', '함께해서 즐거워요.', '멋진 하루 보내세요.',
    '늘 건강하세요.', '고맙습니다.', '늘 응원할게요.', '따뜻한 하루 되세요.'
  ];
  const randomDesignBtn = document.getElementById('randomDesignBtn');
  let randomDesignClickCount = 0; // 몇 번째 클릭인지 세어서 아래 한 줄 문구를 순서대로 다르게 고름
  const HINT_MESSAGES = [
    '아래 주사위를 클릭하면 매번 다른디자인을 불러와요.',
    '맘에드는 디자인은 꼭 저장 / 부분 잠금후 주사위 클릭해주세요.',
    '본 기능은 헤드라인 디자인시 편리한 기능 입니다.',
    '본 기능은 다수의 시안 작업시 편리한 기능 입니다.'
  ];
  if (randomDesignBtn) {
    randomDesignBtn.addEventListener('click', () => {
      randomDesignClickCount++;
      // 1) 기존 오브젝트 전부 제거(안내선은 제외) — 누를 때마다 완전히 새로 시작함
      canvas.getObjects().filter((o) => !o.isGuide).forEach((o) => canvas.remove(o));
      canvas.discardActiveObject();

      // 2) 흰 배경을 새로 깔음 — "🆕 새로 만들기"와 같은 방식 재사용하되, 여기서는 일부러
      // 잠그지 않음(요청: "잠궈져 있어서 랜덤이 적용 안되는데 잠금 해제해줘") — 잠그면 아래
      // "전체 랜덤 적용" 대상에서 빠져서 배경엔 아무 효과가 안 입혀지므로, 잠금 없이 둬서
      // 배경도 같이 랜덤 필터를 받을 수 있게 함.
      const bgFillWhiteBtn = document.getElementById('bgFillWhiteBtn');
      if (bgFillWhiteBtn) bgFillWhiteBtn.click();
      // ⚠️ 배경 사각형은 여기서 회전시키지 않음 — ecopro3bg.js가 만들 때 이미 "지금 이 순간의"
      // (회전된 상태 포함) 캔버스 크기에 맞춰 각도 0으로 딱 맞게 채워둔 상태라서, 이 위에
      // 추가로 90도를 더 돌리면 오히려 캔버스보다 옆으로 삐져나가 잘려 보이는 문제가 있었음
      // (요청: "배경도 잘렸잖아" — 원인 찾아서 뺌).

      // 캔버스가 90도 회전된 상태일 수 있으므로, 배경 만들기 기능(ecopro3bg.js)이 실제로 쓰는
      // 것과 동일한 방식(canvas.getWidth()/줌)으로 "지금 이 순간의" 캔버스 크기를 다시 구함
      // — CANVAS_W/CANVAS_H를 직접 참조하는 대신 이렇게 해서, 회전 직후에도 항상 지금 캔버스
      // 크기·비율에 정확히 맞춰 배경·글자가 배치되도록 함.
      const liveZoom = canvas.getZoom() || 1;
      const liveW = canvas.getWidth() / liveZoom;
      const liveH = canvas.getHeight() / liveZoom;

      // 3) 인사말(1번째 줄, 매번 다른 문구) — 랜덤 필터 대상이 되어야 하므로 먼저 만듦.
      // 캔버스가 회전된 상태일 때만 더 크게 키우고, 캔버스 정중앙에 놓음(요청: "회전하고
      // 나서... 1번째줄은 캔버스 정중앙정렬로"). 회전 안 된 기본 상태는 원래 그대로 유지.
      const rotAngle = EP.canvasRotationDeg || 0;
      const isRotated = !!rotAngle;
      const greeting = RANDOM_GREETINGS[Math.floor(Math.random() * RANDOM_GREETINGS.length)];
      const baseGreetingSize = Math.round(liveW * 0.06) + 3; // "너무 크지 않게" + 요청대로 3pt 키움(2pt+1pt 추가)
      const greetingSize = isRotated ? baseGreetingSize * 2 : baseGreetingSize;
      const hintSize = Math.max(10, Math.round(liveW * 0.025));
      const greetingText = new fabric.IText(greeting, {
        left: liveW / 2, top: isRotated ? liveH / 2 : liveH * 0.42, angle: 0,
        originX: 'center', originY: 'center',
        fontFamily: 'Pretendard', fontSize: greetingSize, fill: '#222222',
        textAlign: 'center', selectable: true, evented: true
      });
      canvas.add(greetingText);
      canvas.requestRenderAll();

      // 3-1) 캔버스 회전 각도만큼 인사말을 실제로 돌림 — 중심점은 그대로 유지한 채 각도만
      // 캔버스 회전 각도(EP.canvasRotationDeg)에 맞춤. 캔버스가 0도(회전 안 한 상태)면
      // 각도가 0이라 사실상 아무 변화 없음.
      if (rotAngle) {
        const center = greetingText.getCenterPoint();
        greetingText.set('angle', ((greetingText.angle || 0) + rotAngle) % 360);
        greetingText.setPositionByOrigin(center, 'center', 'center');
        greetingText.setCoords();
        canvas.requestRenderAll();
      }

      // 4) "🎲 랜덤디자인적용"을 실행 — 잠금 안 된(=배경+인사말) 오브젝트에 랜덤 필터가
      // 자동으로 입혀짐(재사용, 새 로직 아님)
      const rollAllBtn = document.getElementById('rollAllBtn');
      if (rollAllBtn) rollAllBtn.click();

      // 5) 안내문구(2번째 줄) — 회전된 상태에서는 아예 안 만듦(요청: "두번째줄은 안보이게
      // 처리"). 겹침 문제를 근본적으로 피하는 가장 확실한 방법. 회전 안 했을 때만 예전
      // 그대로 만듦.
      if (!isRotated) {
        const chosenHint = HINT_MESSAGES[(randomDesignClickCount - 1) % HINT_MESSAGES.length];
        // 첫 번째 문구만 PC/모바일에 맞게 다르게 씀 — 모바일은 버튼이 화면 "아래"(하단 주사위)에
        // 있고, PC는 상단 툴바의 "랜덤디자인적용" 버튼이라 "아래"라는 표현이 안 맞아서 이름으로 안내함.
        const isMobileForHint = !!(EP.isMobileModeActive && EP.isMobileModeActive());
        const finalHint = (chosenHint === HINT_MESSAGES[0] && !isMobileForHint)
          ? '랜덤디자인적용을 클릭하면 매번 다른디자인을 불러와요.'
          : chosenHint;
        const hintGap = (greetingSize * 1.3 * 3) / 2;
        // IText는 폭 제한이 없어서, 문구가 길면 캔버스 밖으로 삐져나가 캔버스 경계에서 잘려
        // 보이는 문제가 있었음(그래서 끝의 정중한 어미가 잘려 반말처럼 보였음). Textbox로
        // 만들고 캔버스 폭 안에 들어오도록 width를 제한해서, 혹시 화면이 좁아 한 줄에 다 안
        // 들어가도 자동으로 줄바꿈되도록 안전장치를 둠(평소엔 한 줄로 보임).
        const hintText = new fabric.Textbox(
          finalHint,
          {
            left: liveW / 2, top: liveH * 0.42 + hintGap, angle: 0,
            width: liveW * 0.85,
            originX: 'center', originY: 'center',
            fontFamily: 'Pretendard', fontSize: hintSize, fill: '#888888',
            textAlign: 'center', selectable: true, evented: true
          }
        );
        canvas.add(hintText);
      }
      canvas.requestRenderAll();

      pushHistory();
    });
  }
  const mobileRandomDesignBtn = document.getElementById('mobileRandomDesignBtn');
  if (mobileRandomDesignBtn) {
    mobileRandomDesignBtn.addEventListener('click', () => {
      if (randomDesignBtn) randomDesignBtn.click();
    });
  }

  const mobileShapePickerBtn = document.getElementById('mobileShapePickerBtn');
  if (mobileShapePickerBtn) {
    mobileShapePickerBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode(); // 손바닥(이동) 도구가 켜져 있으면 새로 만든 모양을 바로 움직일 수 있도록 먼저 꺼둠
      const openShapePickerBtn = document.getElementById('openShapePickerBtn');
      if (openShapePickerBtn) openShapePickerBtn.click();
    });
  }

  // 모바일 상단 드롭다운 "🅣 텍스트 추가" — PC의 '✏️ 편집하기 > 🅣 텍스트'(#addTextBtn)와 완전히
  // 동일한 기능을 그대로 호출함. 누르면 텍스트 도구가 무장되고(드롭다운은 자동으로 닫힘),
  // 캔버스에서 원하는 위치를 한 번 탭하면 그 자리에 빈 텍스트가 생기며 바로 입력할 수 있음
  // (PC와 완전히 같은 흐름 — 새로 만든 게 아니라 100% 재사용).
  const mobileAddTextBtn = document.getElementById('mobileAddTextBtn');
  if (mobileAddTextBtn) {
    mobileAddTextBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode(); // 손바닥(이동) 도구와 텍스트 도구가 동시에 켜져 있으면 서로 충돌하므로 먼저 꺼둠
      const addTextBtn = document.getElementById('addTextBtn');
      if (addTextBtn) addTextBtn.click();
    });
  }

  // 모바일 상단 드롭다운 "✒ 펜 도구" — PC의 '✏️ 편집하기 > ✒ 펜 도구'(#penToolBtn)와 완전히
  // 동일한 기능을 그대로 호출함(새로 만든 게 아니라 100% 재사용).
  const mobilePenToolBtn = document.getElementById('mobilePenToolBtn');
  if (mobilePenToolBtn) {
    mobilePenToolBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode(); // 손바닥(이동) 도구와 펜 도구가 동시에 켜져 있으면 서로 충돌하므로 먼저 꺼둠
      const penToolBtn = document.getElementById('penToolBtn');
      if (penToolBtn) penToolBtn.click();
    });
  }

  // 모바일 상단 드롭다운 "⚙ 전문가모드" / "⚙ 기본모드" — <body>에 클래스를 붙였다 뗐다 하는
  // 스위치일 뿐임. 실제 화면 전환(기존 메뉴 ↔ 전문가 메뉴, "메뉴" 버튼 초록색 여부)은
  // ecopro3.css의 body.mobile-expert-mode 규칙이 전부 처리함. 전문가 메뉴 안에 구체적으로
  // 어떤 항목을 넣을지는 아직 정해지지 않아서, 지금은 이 스위치 틀만 만들어둠.
  const mobileExpertModeToggleBtn = document.getElementById('mobileExpertModeToggleBtn');
  if (mobileExpertModeToggleBtn) {
    mobileExpertModeToggleBtn.addEventListener('click', () => {
      document.body.classList.add('mobile-expert-mode');
    });
  }
  const mobileBasicModeToggleBtn = document.getElementById('mobileBasicModeToggleBtn');
  if (mobileBasicModeToggleBtn) {
    mobileBasicModeToggleBtn.addEventListener('click', () => {
      document.body.classList.remove('mobile-expert-mode');
    });
  }

  // 모바일 상단 드롭다운 "↻ 캔버스 90도 회전" / "↺ 반대 90도 회전" — PC의 '↻ 회전 > 캔버스 90도
  // 회전'/'반대 90도 회전'(#rotateCanvasRightBtn/#rotateCanvasLeftBtn)과 완전히 동일한 기능을
  // 그대로 호출함(새로 만든 게 아니라 100% 재사용). 캔버스 위 모든 오브젝트가 캔버스와 함께 회전됨.
  const mobileRotateCanvasRightBtn = document.getElementById('mobileRotateCanvasRightBtn');
  if (mobileRotateCanvasRightBtn) {
    mobileRotateCanvasRightBtn.addEventListener('click', () => {
      const rotateCanvasRightBtn = document.getElementById('rotateCanvasRightBtn');
      if (rotateCanvasRightBtn) rotateCanvasRightBtn.click();
    });
  }
  // 하단 손바닥(이동) 아이콘 옆의 회전 버튼도 동일하게 재사용
  const mobileRotateCanvasBtn = document.getElementById('mobileRotateCanvasBtn');
  if (mobileRotateCanvasBtn) {
    mobileRotateCanvasBtn.addEventListener('click', () => {
      const rotateCanvasRightBtn = document.getElementById('rotateCanvasRightBtn');
      if (rotateCanvasRightBtn) rotateCanvasRightBtn.click();
      // 요청: 회전과 함께 확대율도 100%로 같이 되돌림 — 옆의 "눌러서 100%로 되돌리기"
      // 버튼(ecopro3mobiletools.js)을 그대로 클릭해줌(재사용, 새 로직 아님)
      const mobileZoomGaugeLabel = document.getElementById('mobileZoomGaugeLabel');
      if (mobileZoomGaugeLabel) mobileZoomGaugeLabel.click();
    });
  }

  // 모바일 상단 드롭다운의 "🖼 이미지 불러오기"/"📂 파일 불러오기"는 HTML에서
  // <label for="imageInput">/<label for="projectInput">로 PC와 같은 파일 입력을 그대로
  // 가리키고 있어서 별도 JS 없이 네이티브 동작으로 파일 선택창이 뜸.
  // "💾 저장"만 버튼이라 PC의 실제 저장 버튼(#saveProjectBtn)을 그대로 클릭해줌.
  const mobileSaveProjectBtn = document.getElementById('mobileSaveProjectBtn');
  if (mobileSaveProjectBtn) {
    mobileSaveProjectBtn.addEventListener('click', () => {
      const saveProjectBtn = document.getElementById('saveProjectBtn');
      if (saveProjectBtn) saveProjectBtn.click();
    });
  }

  // 커스텀메뉴(초록 메뉴) 항목들 — PC의 "✏️ 편집하기"/"🖼 이미지" 메가메뉴에 있는 실제 버튼을
  // 그대로 클릭해주는 것뿐이라 새 기능은 하나도 없음(100% 재사용). 손바닥 도구가 켜져 있으면
  // 새로 만든 오브젝트를 바로 움직일 수 있도록 먼저 꺼주는 것도 기존 모바일 버튼들과 동일.
  function forwardMobileCustomBtn(mobileId, targetId){
    const btn = document.getElementById(mobileId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode();
      const target = document.getElementById(targetId);
      if (target) target.click();
    });
  }
  forwardMobileCustomBtn('mobileCustomAddTextBtn', 'addTextBtn');
  forwardMobileCustomBtn('mobileCustomFixTextShapeBtn', 'fixTextShapeBtn');
  // 기울기 교정 — PC 쪽 대응 버튼이 없는 모바일 전용 기능이라 forwardMobileCustomBtn 대신
  // 직접 구현함. 선택한 오브젝트의 각도를 "캔버스 회전 각도"에 맞춤(요청: "기울기를 0도로
  // 맞춰줘(캔바스 회전각도에 맞춰 0도야)") — 캔버스가 90도 회전된 상태라면 그 90도가 곧
  // "기울어지지 않은 기준"이므로, 무조건 0이 아니라 EP.canvasRotationDeg를 기준으로 맞춤.
  const mobileCustomTiltFixBtn = document.getElementById('mobileCustomTiltFixBtn');
  if (mobileCustomTiltFixBtn) {
    mobileCustomTiltFixBtn.addEventListener('click', () => {
      if (EP.exitPanMode) EP.exitPanMode();
      const target = canvas.getActiveObject();
      if (!target) return;
      const center = target.getCenterPoint();
      target.set('angle', EP.canvasRotationDeg || 0);
      target.setPositionByOrigin(center, 'center', 'center');
      target.setCoords();
      canvas.requestRenderAll();
      pushHistory();
    });
  }
  forwardMobileCustomBtn('mobileCustomShapePickerBtn', 'openShapePickerBtn');
  forwardMobileCustomBtn('mobileCustomPenToolBtn', 'penToolBtn');
  forwardMobileCustomBtn('mobileCustomAddTableBtn', 'addTableBtn');
  forwardMobileCustomBtn('mobileCustomAddMapBtn', 'addMapBtn');
  forwardMobileCustomBtn('mobileCustomAddLogoBtn', 'addLogoBtn');
  forwardMobileCustomBtn('mobileCustomAddMenuBtn', 'addMenuBtn');
  forwardMobileCustomBtn('mobileCustomAddBgFillBtn', 'addBgFillBtn');
  forwardMobileCustomBtn('mobileCustomSaveProjectBtn', 'saveProjectBtn');
  forwardMobileCustomBtn('mobileCustomAutoSaveToggleBtn', 'autoSaveToggleBtn');

  // PNG/JPG/SVG 내보내기 버튼들은 PC의 파일 메뉴 안에 data-export 속성으로만 구분되어 있어서
  // (고유 id가 없음) querySelector로 정확히 그 버튼을 찾아 그대로 클릭해줌
  function forwardMobileExportBtn(mobileId, exportType){
    const btn = document.getElementById(mobileId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const target = document.querySelector('#fileMenu [data-export="' + exportType + '"]');
      if (target) target.click();
    });
  }
  forwardMobileExportBtn('mobileCustomExportPngBtn', 'png');
  forwardMobileExportBtn('mobileCustomExportJpgBtn', 'jpg');
  forwardMobileExportBtn('mobileCustomExportSvgBtn', 'svg');
  forwardMobileExportBtn('mobileCustomExportSvgVectorBtn', 'svg-vector');

  /* ============================================================
     4. 디자인(건수) / 앞뒤(면) 데이터 & 전환
  ============================================================ */
  const designData = Array.from({ length: count }, () => ({ front: null, back: null }));
  const designNames = Array.from({ length: count }, () => '');
  const designGroups = Array.from({ length: count }, () => ''); // 부분통일하기용 그룹 지정값
  let currentIdx = 0;
  let currentSide = 'front';

  // 현재 캔버스 내용(안내선 제외)만 뽑아내기
  function serializeCurrentCanvas(){
    const objs = canvas.getObjects().filter(o => !o.isGuide);
    return {
      objects: objs.map(o => o.toObject(getCustomObjectProps())),
      background: canvas.backgroundColor || '#ffffff'
    };
  }

  // 저장된 데이터를 캔버스에 로드 (안내선은 항상 다시 맨 위에 추가)
  function loadCanvasObjects(data, callback){
    restoring = true;
    const payload = {
      objects: (data && data.objects) || [],
      background: (data && data.background) || '#ffffff'
    };
    canvas.loadFromJSON(payload, () => {
      canvas.add(guideRect, outerGuideRect, gridGuide);
      bringGuideToFront();
      if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
      if (EP.reapplyShapeComboPatches) EP.reapplyShapeComboPatches();
      canvas.renderAll();
      restoring = false;
      refreshEmptyHint();
      updateSelectionPanel();
      if (callback) callback();
    });
  }

  function switchTo(idx, side){
    if (designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }
    currentIdx = idx;
    currentSide = side;
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
    });
  }

  function renderTabs(){
    const tabList = document.getElementById('tabList');
    tabList.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const group = document.createElement('div');
      group.className = 'design-group';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'design-name-input';
      nameInput.placeholder = `디자인 ${i + 1}`;
      nameInput.value = designNames[i] || '';
      nameInput.addEventListener('click', (e) => e.stopPropagation());
      nameInput.addEventListener('input', () => {
        designNames[i] = nameInput.value;
        dBtn.textContent = designNames[i].trim() ? designNames[i] : `디자인 ${i + 1}`;
      });
      group.appendChild(nameInput);

      const dBtn = document.createElement('div');
      dBtn.className = 'design-btn' + (i === currentIdx ? ' active' : '');
      dBtn.textContent = designNames[i].trim() ? designNames[i] : `디자인 ${i + 1}`;
      dBtn.addEventListener('click', () => switchTo(i, currentSide));
      group.appendChild(dBtn);

      if (isDouble) {
        const sw = document.createElement('div');
        sw.className = 'side-switch';
        ['front', 'back'].forEach(s => {
          const sBtn = document.createElement('button');
          sBtn.type = 'button';
          sBtn.className = 'side-btn' + (currentIdx === i && currentSide === s ? ' active' : '');
          sBtn.textContent = s === 'front' ? '앞' : '뒤';
          sBtn.addEventListener('click', (e) => { e.stopPropagation(); switchTo(i, s); });
          sw.appendChild(sBtn);
        });
        group.appendChild(sw);
      }

      // 부분통일하기용 그룹 지정란: 같은 값을 적어넣은 디자인끼리 하나로 묶여서,
      // "부분통일하기" 버튼을 누르면 그 그룹 안에서 가장 앞 번호 디자인 내용으로 통일됨
      if (count > 1) {
        const groupInput = document.createElement('input');
        groupInput.type = 'text';
        groupInput.className = 'design-group-input';
        groupInput.placeholder = '그룹';
        groupInput.value = designGroups[i] || '';
        groupInput.title = '같은 값을 입력한 디자인끼리 묶입니다. "부분적용"을 누르면 그룹 안에서 가장 번호가 앞선 디자인 내용으로 통일됩니다.';
        groupInput.addEventListener('click', (e) => e.stopPropagation());
        groupInput.addEventListener('input', () => { designGroups[i] = groupInput.value; });
        group.appendChild(groupInput);
      }

      tabList.appendChild(group);
    }
    syncMobileSideSwitch();
  }

  // 모바일 전용 "앞면/뒷면" 전환 바 — PC 좌측 디자인목록 패널의 앞/뒤 버튼(위 side-switch)과
  // 완전히 같은 switchTo(idx, side) 함수를 그대로 호출함. 새 기능이 아니라 그 기능의
  // 진입로 하나를 모바일에서도 쓸 수 있게 옮겨 붙인 것뿐임. 앞/뒤 버튼은 양면 주문(isDouble)일
  // 때만 보이고, "통합" 드롭다운(공통적용/부분적용/모두저장) + 건수 번호 이동은 건수(count)가
  // 2개 이상일 때만 보임 — 둘 중 하나라도 해당되면 이 바 자체가 보임(단면 1건이면 계속 숨김).
  // PC 좌측 패널의 디자인 "이름 바꾸기" 입력칸은 모바일에서는 요청대로 넣지 않음.
  (function setupMobileSideSwitch(){
    const bar = document.getElementById('mobileSideSwitch');
    const frontBtn = document.getElementById('mobileFrontBtn');
    const backBtn = document.getElementById('mobileBackBtn');
    const unifyDropdown = document.getElementById('mobileUnifyDropdown');
    const designIndex = document.getElementById('mobileDesignIndex');
    if (!bar || !frontBtn || !backBtn) return;

    if (isDouble) {
      frontBtn.addEventListener('click', () => switchTo(currentIdx, 'front'));
      backBtn.addEventListener('click', () => switchTo(currentIdx, 'back'));
    } else {
      frontBtn.style.display = 'none';
      backBtn.style.display = 'none';
    }

    if (count > 1) {
      const mobileUnifyDesignBtn = document.getElementById('mobileUnifyDesignBtn');
      const mobilePartialUnifyBtn = document.getElementById('mobilePartialUnifyBtn');
      const mobileSaveAllZipBtn = document.getElementById('mobileSaveAllZipBtn');
      if (mobileUnifyDesignBtn) mobileUnifyDesignBtn.addEventListener('click', () => { const b = document.getElementById('unifyDesignBtn'); if (b) b.click(); });
      if (mobilePartialUnifyBtn) mobilePartialUnifyBtn.addEventListener('click', () => { const b = document.getElementById('partialUnifyBtn'); if (b) b.click(); });
      if (mobileSaveAllZipBtn) mobileSaveAllZipBtn.addEventListener('click', () => { const b = document.getElementById('saveAllZipBtn'); if (b) b.click(); });

      const prevBtn = document.getElementById('mobileDesignPrevBtn');
      const nextBtn = document.getElementById('mobileDesignNextBtn');
      if (prevBtn) prevBtn.addEventListener('click', () => { if (currentIdx > 0) switchTo(currentIdx - 1, currentSide); });
      if (nextBtn) nextBtn.addEventListener('click', () => { if (currentIdx < count - 1) switchTo(currentIdx + 1, currentSide); });
    } else {
      if (unifyDropdown) unifyDropdown.style.display = 'none';
      if (designIndex) designIndex.style.display = 'none';
    }

    if (isDouble || count > 1) bar.classList.add('show');
  })();

  function syncMobileSideSwitch(){
    const frontBtn = document.getElementById('mobileFrontBtn');
    const backBtn = document.getElementById('mobileBackBtn');
    if (frontBtn && backBtn) {
      frontBtn.classList.toggle('active', currentSide === 'front');
      backBtn.classList.toggle('active', currentSide === 'back');
    }
    const indexLabel = document.getElementById('mobileDesignIndexLabel');
    if (indexLabel) indexLabel.textContent = String(currentIdx + 1);
    const prevBtn = document.getElementById('mobileDesignPrevBtn');
    const nextBtn = document.getElementById('mobileDesignNextBtn');
    if (prevBtn) prevBtn.disabled = currentIdx <= 0;
    if (nextBtn) nextBtn.disabled = currentIdx >= count - 1;
  }

  renderTabs();

  /* ============================================================
     IndexedDB 핸드오프 저장소 — ecopro1 ↔ ecopro3 ↔ sian.html 사이에서 이미지/SVG
     데이터를 주고받을 때 씀. sessionStorage(도메인당 5~10MB)로는 고화질 이미지
     여러 장을 담기 부족해서 한도가 훨씬 넉넉한 IndexedDB로 통일함. 세 페이지
     모두 이 DB/스토어 이름을 그대로 써야 서로 읽고 쓸 수 있음.
  ============================================================ */
  const HANDOFF_DB_NAME = 'ecogrHandoff';
  const HANDOFF_STORE_NAME = 'kv';
  function openHandoffDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDOFF_DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(HANDOFF_STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value){
    const db = await openHandoffDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
      tx.objectStore(HANDOFF_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key){
    const db = await openHandoffDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readonly');
      const req = tx.objectStore(HANDOFF_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDelete(key){
    const db = await openHandoffDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE_NAME, 'readwrite');
      tx.objectStore(HANDOFF_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // data URL(base64) 문자열 길이로 대략적인 바이트 수를 추정 (R2 업로드 한도인
  // 500MB와 동일한 기준으로, IndexedDB에 넘기기 전에 미리 걸러내기 위함)
  const MAX_TRANSFER_BYTES = 500 * 1024 * 1024; // 500MB
  function estimateDataUrlBytes(dataUrl){
    if (!dataUrl) return 0;
    const commaIdx = dataUrl.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return Math.floor(base64.length * 3 / 4);
  }

  /* ============================================================
     4b. ecopro1(간단 업로드 페이지)의 "편집하기" 버튼에서 넘어온 첨부 이미지를
     IndexedDB에서 읽어와 각 디자인(idx)/면(side)에 맞게 자동으로 캔버스에
     올려줌. ecopro1이 IndexedDB의 'ecogr_editor_import_images' 키에
     [{idx, side, dataUrl}, ...] 형태로 저장해두고 같은 쿼리를 그대로 이어서
     이 페이지로 이동시킴 — 그래서 count/width/height 등은 이미 URL 쿼리로
     맞춰져 있고, 여기서는 이미지 내용만 채워 넣으면 됨.
  ============================================================ */
  const EDITOR_IMPORT_KEY = 'ecogr_editor_import_images';

  async function importImagesFromEcopro1(){
    let items;
    try { items = await idbGet(EDITOR_IMPORT_KEY); } catch (e) { return; }
    if (!Array.isArray(items) || !items.length) return;

    try { await idbDelete(EDITOR_IMPORT_KEY); } catch (e) {}

    let chain = Promise.resolve();
    items.forEach((item) => {
      if (!item || !item.dataUrl) return;
      const idx = Math.min(Math.max(parseInt(item.idx, 10) || 0, 0), count - 1);
      const side = item.side === 'back' ? 'back' : 'front';

      chain = chain.then(() => new Promise((resolve) => {
        loadCanvasObjects(designData[idx][side], () => {
          fabric.Image.fromURL(item.dataUrl, (img) => {
            const maxDim = Math.min(CANVAS_W, CANVAS_H) * 0.95;
            const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
            img.set({
              left: CANVAS_W / 2, top: CANVAS_H / 2,
              originX: 'center', originY: 'center',
              scaleX: scale, scaleY: scale
            });
            canvas.add(img);
            canvas.sendToBack(img);
            bringGuideToFront();
            canvas.renderAll();
            designData[idx][side] = serializeCurrentCanvas();
            resolve();
          }, { crossOrigin: 'anonymous' });
        });
      }));
    });

    chain.then(() => {
      // 다 채워 넣은 뒤엔 사용자가 처음 보는 화면이 항상 디자인 1 앞면이 되도록 정리
      switchTo(0, 'front');
      resetHistory();
    });
  }
  importImagesFromEcopro1();

  // 디자인 통일하기: 디자인 1(앞/뒤)의 내용을 그대로 복사해서 나머지 모든 디자인에 똑같이 적용
  function unifyDesigns(){
    if (count <= 1) {
      alert('디자인이 1개뿐이라 통일할 필요가 없습니다.');
      return;
    }
    const ok = confirm(
      `디자인 1${isDouble ? '(앞/뒤)' : ''}을 기준으로 전체 ${count}개 디자인을 모두 똑같이 통일합니다.\n` +
      `디자인 2 ~ ${count}에 있던 기존 내용은 모두 사라집니다.\n` +
      `이 작업은 실행취소(Ctrl+Z)로 되돌릴 수 없으니, 계속하시겠습니까?`
    );
    if (!ok) return;

    // 지금 화면에 보이는 캔버스 내용도 먼저 데이터에 반영 (디자인1을 보는 중이었다면 최신 내용까지 반영)
    if (designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }

    const sourceFront = designData[0] ? designData[0].front : null;
    const sourceBack = designData[0] ? designData[0].back : null;

    for (let i = 1; i < count; i++) {
      designData[i] = {
        front: sourceFront ? JSON.parse(JSON.stringify(sourceFront)) : null,
        back: (isDouble && sourceBack) ? JSON.parse(JSON.stringify(sourceBack)) : null
      };
    }

    // 지금 보고 있는 화면도 통일된 최신 내용으로 다시 불러옴
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
    });
  }
  document.getElementById('unifyDesignBtn').addEventListener('click', unifyDesigns);

  // 부분통일하기: designGroups에서 같은 값이 적힌 디자인들끼리 묶어서,
  // 각 그룹 안에서 가장 번호가 앞선 디자인 내용으로 나머지를 통일함
  function partialUnifyDesigns(){
    if (count <= 1) {
      alert('디자인이 1개뿐이라 통일할 필요가 없습니다.');
      return;
    }

    // 지금 화면에 보이는 캔버스 내용도 먼저 데이터에 반영
    if (designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }

    // 그룹값(빈 값 제외)별로 디자인 번호를 모음
    const groupMap = new Map();
    for (let i = 0; i < count; i++) {
      const key = (designGroups[i] || '').trim();
      if (!key) continue; // 그룹을 지정하지 않은 디자인은 건너뜀
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(i);
    }

    // 실제로 2개 이상 묶인 그룹만 의미가 있음
    const groups = Array.from(groupMap.entries()).filter(([, idxs]) => idxs.length > 1);
    if (groups.length === 0) {
      alert('묶인 그룹이 없습니다. 통일하고 싶은 디자인들의 "그룹" 칸에 같은 값을 입력한 뒤 다시 눌러주세요.');
      return;
    }

    const summary = groups.map(([key, idxs]) =>
      `- "${key}" 그룹: 디자인 ${idxs.map(i => i + 1).join(', ')} → 디자인 ${idxs[0] + 1} 내용으로 통일`
    ).join('\n');
    const ok = confirm(
      `아래 그룹별로 부분통일을 진행합니다.\n\n${summary}\n\n` +
      `각 그룹에서 가장 앞 번호 디자인을 기준으로 나머지 디자인 내용은 모두 사라집니다.\n` +
      `이 작업은 실행취소(Ctrl+Z)로 되돌릴 수 없으니, 계속하시겠습니까?`
    );
    if (!ok) return;

    groups.forEach(([, idxs]) => {
      const sourceIdx = idxs[0];
      const sourceFront = designData[sourceIdx] ? designData[sourceIdx].front : null;
      const sourceBack = designData[sourceIdx] ? designData[sourceIdx].back : null;
      for (let k = 1; k < idxs.length; k++) {
        const targetIdx = idxs[k];
        designData[targetIdx] = {
          front: sourceFront ? JSON.parse(JSON.stringify(sourceFront)) : null,
          back: (isDouble && sourceBack) ? JSON.parse(JSON.stringify(sourceBack)) : null
        };
      }
    });

    // 지금 보고 있는 화면도 통일된 최신 내용으로 다시 불러옴
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
    });
  }
  document.getElementById('partialUnifyBtn').addEventListener('click', partialUnifyDesigns);

  // 모든 디자인 저장하기: 디자인마다 완전히 독립된 프로젝트 파일(json)로 각각 저장해 압축(zip)함
  // — 나중에 한두 건만 따로 불러와도 건수(count)가 안 맞아 생기는 오류 없이 바로 열림.
  function buildSingleDesignProjectFile(idx){
    if (idx === currentIdx && designData[currentIdx]) {
      designData[currentIdx][currentSide] = serializeCurrentCanvas();
    }
    const entry = designData[idx] || { front: null, back: null };
    return {
      type: 'svg-editor-project',
      version: 1,
      savedAt: new Date().toISOString(),
      orderData,
      count: 1,
      isDouble,
      ratioW, ratioH,
      canvasWidth: CANVAS_W,
      canvasHeight: CANVAS_H,
      designNames: [designNames[idx] || ''],
      // 참고용 메타데이터 — 실제 동작(불러오기 등)에는 영향을 주지 않음
      originalDesignNumber: idx + 1,
      designData: [{ front: entry.front, back: entry.back }]
    };
  }

  document.getElementById('saveAllZipBtn').addEventListener('click', async () => {
    if (typeof JSZip === 'undefined') {
      alert('압축 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해서 다시 시도해주세요.');
      return;
    }

    const zipBtn = document.getElementById('saveAllZipBtn');
    const originalLabel = zipBtn.textContent;
    zipBtn.disabled = true;
    zipBtn.textContent = '저장 중...';

    try {
      // 지금 화면에 보이는 캔버스 내용도 먼저 데이터에 반영
      if (designData[currentIdx]) {
        designData[currentIdx][currentSide] = serializeCurrentCanvas();
      }

      function sanitizeFileName(name){
        return String(name || '').replace(/[\\/:*?"<>|]/g, '').trim();
      }

      const zip = new JSZip();
      const usedNames = new Set();
      for (let i = 0; i < count; i++) {
        const singleProject = buildSingleDesignProjectFile(i);
        let fileName = sanitizeFileName(designNames[i]) || `디자인${i + 1}`;
        if (usedNames.has(fileName)) {
          let n = 2;
          while (usedNames.has(`${fileName}(${n})`)) n++;
          fileName = `${fileName}(${n})`;
        }
        usedNames.add(fileName);
        zip.file(`${fileName}.json`, JSON.stringify(singleProject));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const zipName = `www.ecogr.net-designs-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('디자인을 저장하는 중 문제가 발생했습니다.');
    } finally {
      zipBtn.disabled = false;
      zipBtn.textContent = originalLabel;
    }
  });

  /* ============================================================
     모바일: 좌(디자인목록)/우(속성패널) 패널 공용 컨트롤러
     - 하나를 열면 다른 하나는 자동으로 닫음(겹치지 않게)
     - 열려있는 동안 배경을 어둡게 오버레이 처리, 오버레이를 탭하면 닫힘
     - 각 패널 우상단 ✕ 버튼으로도 닫을 수 있음
  ============================================================ */
  const mobileOverlayEl = document.getElementById('mobileOverlay');
  const tabSidebarEl = document.getElementById('tabSidebar');
  const sidePanelElForDrawer = document.getElementById('sidePanel');

  function isMobileLayout(){
    return window.matchMedia('(max-width:900px)').matches;
  }
  function updateMobileOverlay(){
    const anyOpen = tabSidebarEl.classList.contains('open') || sidePanelElForDrawer.classList.contains('open');
    mobileOverlayEl.classList.toggle('show', isMobileLayout() && anyOpen);
  }
  function openTabSidebar(){
    sidePanelElForDrawer.classList.remove('open');
    tabSidebarEl.classList.add('open');
    updateMobileOverlay();
  }
  function closeTabSidebar(){
    tabSidebarEl.classList.remove('open');
    updateMobileOverlay();
  }
  function openSidePanelDrawer(){
    tabSidebarEl.classList.remove('open');
    sidePanelElForDrawer.classList.add('open');
    updateMobileOverlay();
  }
  function closeSidePanelDrawer(){
    sidePanelElForDrawer.classList.remove('open');
    updateMobileOverlay();
  }
  mobileOverlayEl.addEventListener('click', () => {
    closeTabSidebar();
    closeSidePanelDrawer();
  });
  document.getElementById('tabSidebarCloseBtn').addEventListener('click', closeTabSidebar);
  document.getElementById('sidePanelCloseBtn').addEventListener('click', closeSidePanelDrawer);

  document.getElementById('tabToggleBtn').addEventListener('click', () => {
    if (tabSidebarEl.classList.contains('open')) closeTabSidebar();
    else openTabSidebar();
  });

  /* ============================================================
     5. 실행취소 / 다시실행 (디자인·면 전환 시 초기화됨)
  ============================================================ */
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  let undoStack = [];
  let redoStack = [];
  let restoring = false;
  let saveTimer = null;

  function snapshot(){
    return JSON.stringify(canvas.toJSON(getCustomObjectProps()));
  }
  function pushHistory(){
    if (restoring || cropState) return; // 자르기 모드 중 임시 사각형은 실행취소 기록에서 제외
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      undoStack.push(snapshot());
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }, 120);
  }
  function updateHistoryButtons(){
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }
  function resetHistory(){
    undoStack = [snapshot()];
    redoStack = [];
    updateHistoryButtons();
  }
  function restoreFrom(json){
    restoring = true;
    // 실행취소/다시실행으로 오브젝트가 통째로 새로 만들어지므로, 지금 열려있는 상세조정
    // 팝업(P/M/J/Z)이 참조하고 있던 오브젝트는 더 이상 캔버스에 있는 그 오브젝트가 아니게 됨.
    // 그대로 두면 팝업이 옛 참조를 붙든 채 안 갱신되므로, 강제로 닫아서 다음에 다시 열 때
    // 항상 최신 상태로 새로 채워지도록 함(T 글꼴 팝업도 동일한 이유로 같이 닫음).
    if (EP.hideQaPopover) EP.hideQaPopover();
    if (EP.hideQaMPopover) EP.hideQaMPopover();
    if (EP.hideQaJPopover) EP.hideQaJPopover();
    if (EP.hideQaZPopover) EP.hideQaZPopover();
    hideFontPopover();
    canvas.loadFromJSON(json, () => {
      if (EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
      if (EP.reapplyShapeComboPatches) EP.reapplyShapeComboPatches();
      canvas.renderAll();
      restoring = false;
      refreshEmptyHint();
      updateSelectionPanel();
    });
  }
  undoBtn.addEventListener('click', () => {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreFrom(undoStack[undoStack.length - 1]);
    updateHistoryButtons();
  });
  redoBtn.addEventListener('click', () => {
    if (!redoStack.length) return;
    const json = redoStack.pop();
    undoStack.push(json);
    restoreFrom(json);
    updateHistoryButtons();
  });

  canvas.on('object:added', pushHistory);
  canvas.on('object:modified', pushHistory);
  canvas.on('object:removed', () => { pushHistory(); refreshEmptyHint(); });

  // 텍스트 편집이 끝나는 순간(특히 모바일 가상키보드·한글 입력기 조합 입력 이후) 필터가
  // 확실하게 "전체적으로" 다시 그려지도록 강제함. 텍스트 오브젝트는 편집 중(isEditing=true)엔
  // 모든 커스텀 필터 렌더를 건너뛰고 기본 렌더만 쓰는데, 데스크톱은 클릭으로 깔끔하게
  // 편집을 빠져나오지만 모바일은 터치/블러 이벤트 타이밍이 어긋나는 경우가 있어서, 편집이
  // 끝나자마자 (1) 필터 렌더 패치가 살아있는지 다시 확인하고 (2) 캔버스를 통째로 다시 그려서
  // 일부 영역만 필터가 반영된 것처럼 보이는 문제를 막음.
  canvas.on('text:editing:exited', (opt) => {
    if (opt && opt.target && EP.reapplyCircularTextPatches) EP.reapplyCircularTextPatches();
    canvas.requestRenderAll();
  });

  resetHistory();

  /* ============================================================
     6. 이미지(JPG/PNG) 불러오기
  ============================================================ */
  document.getElementById('imageInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      fabric.Image.fromURL(ev.target.result, function(img){
        const maxDim = Math.min(CANVAS_W, CANVAS_H) * 0.8;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        img.set({
          left: CANVAS_W / 2,
          top: CANVAS_H / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale
        });
        canvas.add(img);
        bringGuideToFront();
        canvas.setActiveObject(img);
        canvas.renderAll();
        refreshEmptyHint();
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  /* ============================================================
     6b. 이미지 자르기(크롭)
     - 이미지를 선택한 뒤 속성 패널의 "✂ 자르기" 버튼(또는 이미지 더블클릭)을
       누르면 크롭 모드로 들어가서, 파란 점선 사각형(자를 영역)을 드래그·리사이즈해
       원하는 부분만 남길 수 있습니다.
     - 회전된 이미지는 크롭 편집 중에만 잠시 회전을 0도로 풀어서
       "이미지 자체 기준"으로 정확히 자르고, 적용 후 원래 회전값을 그대로 복원합니다.
     - 실제로 fabric.Image의 cropX/cropY/width/height(원본 픽셀 기준 잘림 영역)를
       바꾸는 방식이라 다른 오브젝트(텍스트/도형)에는 전혀 영향이 없고,
       내보내기/저장 결과물에도 잘린 대로 정확히 반영됩니다.
  ============================================================ */
  const cropToolbar = document.getElementById('cropToolbar');
  const startCropBtn = document.getElementById('startCropBtn');
  const resetCropBtn = document.getElementById('resetCropBtn');
  const applyCropBtn = document.getElementById('applyCropBtn');
  const cancelCropBtn = document.getElementById('cancelCropBtn');

  let cropState = null; // { img, rect, originalAngle, originalSelectable, originalEvented, otherObjs:[{obj,selectable,evented}] }

  function isImageObject(o){ return !!o && o.type === 'image'; }

  /* ---------- 이미지 보정(밝기·대비·채도·흑백) ----------
     fabric.Image.filters의 Brightness/Contrast/Saturation/Grayscale를 그때그때
     obj.filters 배열을 통째로 다시 구성해서 적용함(중첩 누적 대신 항상 최신 슬라이더
     값 기준으로 새로 만듦 — 순서 꼬임/중복 적용 방지). 지도 이미지를 포함해 모든
     이미지 오브젝트에 공통으로 사용됨. */
  function getImageFilterValue(obj, filterType, propName){
    if (!obj || !obj.filters) return 0;
    for (let i = 0; i < obj.filters.length; i++) {
      const f = obj.filters[i];
      if (f && f.type === filterType) return f[propName] || 0;
    }
    return 0;
  }
  function hasGrayscaleFilter(obj){
    return !!(obj && obj.filters && obj.filters.some(f => f && f.type === 'Grayscale'));
  }
  function applyImageAdjustments(obj, opts){
    if (!isImageObject(obj)) return;
    const cur = {
      brightness: getImageFilterValue(obj, 'Brightness', 'brightness'),
      contrast: getImageFilterValue(obj, 'Contrast', 'contrast'),
      saturation: getImageFilterValue(obj, 'Saturation', 'saturation'),
      grayscale: hasGrayscaleFilter(obj)
    };
    const next = Object.assign(cur, opts);
    // Z버튼(이미지 전용 블렌드/투과 필터)이 이미 걸려있다면 배열을 통째로 새로 만들 때 같이
    // 사라지지 않도록 미리 챙겨뒀다가 맨 뒤에 다시 넣어줌. RemoveColor는 흰색투과·지정색투과가
    // 각각 별개 인스턴스로 동시에 걸려있을 수 있어서 전부(배열로) 챙김.
    const blendColorFilter = obj.filters && obj.filters.find(f => f && f.type === 'BlendColor');
    const removeColorFilters = (obj.filters && obj.filters.filter(f => f && f.type === 'RemoveColor')) || [];
    const filters = [];
    if (next.grayscale) filters.push(new fabric.Image.filters.Grayscale());
    if (next.brightness) filters.push(new fabric.Image.filters.Brightness({ brightness: next.brightness }));
    if (next.contrast) filters.push(new fabric.Image.filters.Contrast({ contrast: next.contrast }));
    if (next.saturation) filters.push(new fabric.Image.filters.Saturation({ saturation: next.saturation }));
    if (blendColorFilter) filters.push(blendColorFilter);
    filters.push(...removeColorFilters);
    obj.filters = filters;
    obj.applyFilters();
    canvas.requestRenderAll();
  }

  function setOthersInteractive(exceptObj, on){
    canvas.getObjects().forEach((o) => {
      if (o === exceptObj || o.isGuide) return;
      if (on) {
        if (o.__cropSavedState) { o.selectable = o.__cropSavedState.selectable; o.evented = o.__cropSavedState.evented; delete o.__cropSavedState; }
      } else {
        o.__cropSavedState = { selectable: o.selectable, evented: o.evented };
        o.selectable = false; o.evented = false;
      }
    });
  }

  function clampCropRect(rect, bounds){
    rect.setCoords();
    let w = rect.getScaledWidth();
    let h = rect.getScaledHeight();
    const minSize = 16;
    if (w < minSize) { rect.scaleX = minSize / rect.width; w = minSize; }
    if (h < minSize) { rect.scaleY = minSize / rect.height; h = minSize; }
    if (w > bounds.width) { rect.scaleX = bounds.width / rect.width; w = bounds.width; }
    if (h > bounds.height) { rect.scaleY = bounds.height / rect.height; h = bounds.height; }
    let left = rect.left, top = rect.top;
    left = Math.min(Math.max(left, bounds.left), bounds.left + bounds.width - w);
    top = Math.min(Math.max(top, bounds.top), bounds.top + bounds.height - h);
    rect.set({ left, top });
    rect.setCoords();
  }

  function enterCropMode(img){
    if (!isImageObject(img) || cropState) return;

    const originalAngle = img.angle || 0;
    // 크롭 편집 중에는 이미지 "자체" 기준으로 자르기 위해 회전을 잠시 0으로 초기화
    img.set({ angle: 0 });
    img.setCoords();

    const br = img.getBoundingRect(true, true); // {left, top, width, height} — 절대좌표, 회전 0 상태

    const rect = new fabric.Rect({
      left: br.left, top: br.top,
      width: br.width, height: br.height,
      scaleX: 1, scaleY: 1,
      angle: 0,
      originX: 'left', originY: 'top',
      fill: 'rgba(52,152,219,0.15)',
      stroke: '#3498db', strokeWidth: 2, strokeDashArray: [6, 6],
      strokeUniform: true,
      cornerColor: '#3498db', cornerStrokeColor: '#ffffff', cornerStyle: 'circle',
      transparentCorners: false, cornerSize: 12,
      hasRotatingPoint: false, lockRotation: true,
      selectable: true, evented: true, hasBorders: false
    });
    rect.setControlsVisibility({ mtr: false, qa: false }); // qa: 자르기 중인 임시 사각형이라 모양필터 P버튼은 숨김

    const bounds = { left: br.left, top: br.top, width: br.width, height: br.height };
    rect.on('moving', () => clampCropRect(rect, bounds));
    rect.on('scaling', () => clampCropRect(rect, bounds));

    cropState = {
      img, rect, bounds, originalAngle,
      originalSelectable: img.selectable, originalEvented: img.evented,
      originalOpacity: img.opacity != null ? img.opacity : 1
    };

    setOthersInteractive(img, false);
    img.set({ selectable: false, evented: false, opacity: Math.min(cropState.originalOpacity, 1) * 0.55 });
    canvas.add(rect);
    canvas.bringToFront(rect);
    bringGuideToFront();
    canvas.setActiveObject(rect);
    canvas.renderAll();

    cropToolbar.classList.remove('hidden');
  }

  function exitCropMode(){
    if (!cropState) return;
    canvas.remove(cropState.rect);
    setOthersInteractive(cropState.img, true);
    cropToolbar.classList.add('hidden');
    cropState = null;
  }

  function applyCrop(){
    if (!cropState) return;
    const { img, rect, bounds, originalAngle, originalSelectable, originalEvented, originalOpacity } = cropState;
    rect.setCoords();

    const factorX = img.scaleX || 1;
    const factorY = img.scaleY || 1;
    const relLeft = rect.left - bounds.left;
    const relTop = rect.top - bounds.top;
    const relW = rect.getScaledWidth();
    const relH = rect.getScaledHeight();

    const newCropX = (img.cropX || 0) + relLeft / factorX;
    const newCropY = (img.cropY || 0) + relTop / factorY;
    const newWidth = Math.max(1, relW / factorX);
    const newHeight = Math.max(1, relH / factorY);

    img.set({
      originX: 'left', originY: 'top',
      left: rect.left, top: rect.top,
      cropX: newCropX, cropY: newCropY,
      width: newWidth, height: newHeight,
      angle: originalAngle,
      selectable: originalSelectable, evented: originalEvented,
      opacity: originalOpacity
    });
    img.setCoords();

    canvas.remove(rect);
    setOthersInteractive(img, true);
    cropToolbar.classList.add('hidden');
    cropState = null;

    canvas.setActiveObject(img);
    canvas.renderAll();
    updateSelectionPanel();
    pushHistory();
  }

  function cancelCrop(){
    if (!cropState) return;
    const { img, originalAngle, originalSelectable, originalEvented, originalOpacity } = cropState;
    img.set({ angle: originalAngle, selectable: originalSelectable, evented: originalEvented, opacity: originalOpacity });
    img.setCoords();
    exitCropMode();
    canvas.setActiveObject(img);
    canvas.renderAll();
  }

  function resetCropToOriginal(){
    const img = canvas.getActiveObject();
    if (!isImageObject(img)) return;
    const el = img._element || img._originalElement;
    if (!el) return;
    if (cropState) exitCropMode();
    const naturalW = el.naturalWidth || el.width;
    const naturalH = el.naturalHeight || el.height;
    if (!naturalW || !naturalH) return;

    // 현재 화면에 보이는 크기(자른 부분 기준)는 유지한 채, 크롭 영역만 원본 전체로 되돌림
    const center = img.getCenterPoint();
    img.set({
      cropX: 0, cropY: 0,
      width: naturalW, height: naturalH
    });
    img.setPositionByOrigin(center, 'center', 'center');
    img.setCoords();
    canvas.renderAll();
    updateSelectionPanel();
    pushHistory();
  }

  startCropBtn.addEventListener('click', () => { const o = canvas.getActiveObject(); if (isImageObject(o)) enterCropMode(o); });
  resetCropBtn.addEventListener('click', resetCropToOriginal);
  applyCropBtn.addEventListener('click', applyCrop);
  cancelCropBtn.addEventListener('click', cancelCrop);

  canvas.on('mouse:dblclick', (opt) => {
    if (!opt.target || cropState) return;
    if (opt.target.imageLocked) {
      canvas.setActiveObject(opt.target);
      canvas.requestRenderAll();
      return;
    }
    // 클리핑 마스크가 적용된 이미지(below)는 더블클릭해도 자르기 모드로 들어가지 않고,
    // 그냥 선택된 상태로 남아서 예전처럼 모서리를 드래그해 크기를 늘리고 줄일 수 있게 함
    // (자르기 모드는 마스크 경계와는 별개의 기능이라 지금 맥락에선 오히려 방해가 됨).
    if (opt.target.clipPath) return;
    if (isImageObject(opt.target)) enterCropMode(opt.target);
  });

  document.addEventListener('keydown', (e) => {
    if (!cropState) return;
    if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelCrop(); }
  });

  /* ============================================================
     7. SVG 문자열 -> 편집 가능한 오브젝트로 변환 (내부 유틸)
     사용자가 직접 SVG 파일을 "불러오기"하는 UI 기능은 제거됨. 이 함수 자체는 다른 기능
     (예: ecopro3map.js의 "지도 만들기"가 생성한 SVG 문자열)에서 계속 재사용하므로 남겨둠 —
     낱개 편집 가능한 오브젝트로 캔버스에 넣어주는 공용 유틸.
  ============================================================ */
  function importSvgIntoCanvas(svgText, opts){
    fabric.loadSVGFromString(svgText, function(objects, options){
      objects = objects.filter(Boolean);
      if (!objects.length) { if (opts && opts.onEmpty) opts.onEmpty(); return; }

      const tempGroup = fabric.util.groupSVGElements(objects, options);

      // 기본은 캔버스 정중앙(파일로 불러올 때와 동일), viewportCenter:true를 넘기면
      // 표/이미지 삽입처럼 지금 보이는 화면(zoom·pan 반영) 한가운데에 넣음
      let targetLeft = CANVAS_W / 2, targetTop = CANVAS_H / 2;
      if (opts && opts.viewportCenter) {
        const zoom = canvas.getZoom() || 1;
        const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
        targetLeft = (canvas.getWidth() / 2 - vpt[4]) / zoom;
        targetTop = (canvas.getHeight() / 2 - vpt[5]) / zoom;
      }
      const maxDimBase = (opts && opts.maxDim) ? opts.maxDim : Math.min(CANVAS_W, CANVAS_H) * 0.85;
      const scale = Math.min(maxDimBase / tempGroup.width, maxDimBase / tempGroup.height, 1);
      tempGroup.set({
        left: targetLeft,
        top: targetTop,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale
      });
      tempGroup.setCoords();

      const items = tempGroup.getObjects().slice();
      tempGroup._restoreObjectsState();

      const addedObjs = [];
      items.forEach(function(obj){
        let finalObj = obj;
        if (obj.type === 'text') {
          const props = obj.toObject([
            'left','top','width','height','scaleX','scaleY','angle','skewX','skewY',
            'fontFamily','fontSize','fontWeight','fontStyle','fill','stroke','strokeWidth',
            'textAlign','underline','linethrough','charSpacing','lineHeight','opacity',
            'flipX','flipY','originX','originY'
          ]);
          finalObj = new fabric.IText(obj.text, props);
        }
        finalObj.set({ selectable: true, evented: true });
        canvas.add(finalObj);
        addedObjs.push(finalObj);
      });

      bringGuideToFront();
      canvas.renderAll();
      refreshEmptyHint();
      if (opts && opts.onDone) opts.onDone(addedObjs);
    });
  }

  // 이 에디터가 내보낸 SVG 안에 심어둔 <metadata id="ecopro3-project-data"> 블록을 찾아서
  // 파싱함 — 있으면 이 SVG는 "우리가 저장한 파일"이라는 뜻이므로 완벽 복원이 가능함.
  // 일반 외부 SVG(이 태그가 없는)에는 영향 없음(항상 null 반환 -> 기존 방식으로 처리됨).
  function tryExtractEcopro3Metadata(svgText){
    const m = svgText.match(/<metadata id="ecopro3-project-data"><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>/);
    if (!m) return null;
    try {
      return JSON.parse(m[1].replace(/]]&gt;/g, ']]>'));
    } catch (err) {
      console.error('SVG 안의 프로젝트 데이터 파싱 실패:', err);
      return null;
    }
  }

  // ※ SVG 불러오기 메뉴 항목은 현재 화면에서 숨겨둔 상태(요청에 따라 삭제하지 않고 숨김
  // 처리만 함) — 이 change 리스너와 관련 로직은 그대로 살아있어서, 나중에 필요하면
  // ecopro3.html의 svgInput 관련 label에서 "hidden" 클래스만 지우면 바로 다시 쓸 수 있음.
  document.getElementById('svgInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      const svgText = ev.target.result;
      const restored = tryExtractEcopro3Metadata(svgText);
      if (restored) {
        // 이 에디터로 저장했던 SVG -> 필터·글자 위치 등 전부 원래 그대로 완벽 복원(현재 면을 통째로 교체)
        // 저장 당시 캔버스 크기와 지금 캔버스 크기가 다르면(창 크기가 달라진 경우 등) 그 비율만큼
        // 다시 스케일링해서 한쪽 구석으로 쏠리지 않고 항상 캔버스에 꽉 차게 맞춤.
        const rescaled = rescaleSideDataToCurrentCanvas(restored, restored.canvasWidth, restored.canvasHeight);
        loadCanvasObjects(rescaled, () => {
          resetHistory();
          refreshEmptyHint();
        });
      } else {
        // 일반 SVG 파일 -> 기존처럼 낱개 오브젝트로 변환해서 지금 캔버스에 삽입
        importSvgIntoCanvas(svgText);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ============================================================
     7b. 폰트 파일 불러오기 (임시 적용)
     - 업로드한 폰트는 FontFace API로 이 브라우저 탭에서만 등록되어
       글꼴 목록에 추가되고, 텍스트에 바로 적용해 볼 수 있습니다.
     - 이 폰트 파일 자체는 저장/내보내기 결과물에 절대 포함되지 않고,
       해당 폰트를 쓴 텍스트는 저장 시 자동으로 "이미지"로 바뀌어
       폰트가 없는 다른 환경에서도 모양이 그대로 유지됩니다.
  ============================================================ */
  const customFontNames = new Set(); // 이 세션에서 등록된 커스텀 폰트 이름들

  document.getElementById('fontInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(ev){
      const buffer = ev.target.result;
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const safeName = baseName.replace(/[^a-zA-Z0-9가-힣_-]/g, '') || 'font';
      const fontName = 'custom-' + safeName + '-' + Date.now().toString(36).slice(-4);
      try {
        const face = new FontFace(fontName, buffer);
        await face.load();
        document.fonts.add(face);
        customFontNames.add(fontName);
        const opt = document.createElement('option');
        opt.value = fontName;
        opt.textContent = '🔤 ' + baseName + ' (업로드한 폰트)';
        fontFamilySelect.appendChild(opt);
        floatingFontSelect.appendChild(opt.cloneNode(true));
        canvas.renderAll();
        alert(`"${baseName}" 폰트를 불러왔습니다.\n글꼴 목록 맨 아래에서 선택해 사용할 수 있어요.\n\n※ 이 폰트는 지금 이 화면에서만 임시로 적용되며, 저장/내보내기 시 해당 텍스트는 자동으로 이미지로 바뀌어 저장됩니다.`);
      } catch (err) {
        alert('폰트 파일을 불러오지 못했습니다. ttf/otf/woff 파일인지 확인해주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  });

  function isCustomFontName(name){
    return !!name && customFontNames.has(name);
  }

  // 텍스트 오브젝트(라이브 인스턴스)를 그 자리 그대로의 픽셀 이미지 JSON으로 변환
  function rasterizeTextObjectToImageJSON(obj){
    const MULT = 3; // 저장용 이미지 해상도 배율
    const br = obj.getBoundingRect(true, true);
    const dataUrl = obj.toDataURL({ format: 'png', multiplier: MULT });
    return {
      type: 'image',
      src: dataUrl,
      left: br.left,
      top: br.top,
      width: Math.max(1, Math.round(br.width * MULT)),
      height: Math.max(1, Math.round(br.height * MULT)),
      scaleX: 1 / MULT,
      scaleY: 1 / MULT,
      angle: 0,
      opacity: obj.opacity != null ? obj.opacity : 1,
      selectable: true,
      evented: true
    };
  }

  /* ============================================================
     8. 도구: 선택 / 텍스트추가 / 사각형 / 원
  ============================================================ */
  document.getElementById('selectToolBtn').addEventListener('click', () => {
    if (penActive) setPenMode(false);
    if (textToolActive) setTextToolMode(false);
    if (EP.exitImageToolModes) EP.exitImageToolModes(); // 자동누끼/영역지우기 도구가 켜진 채로 남아있으면 여기서 확실히 끔
    if (EP.exitEyedropperModes) EP.exitEyedropperModes(); // 스포이드 도구가 켜진 채로 남아있으면 여기서 확실히 끔
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.forEachObject(o => { if (!o.isGuide) o.selectable = true; });
  });

  // ---- 텍스트 도구(포토샵 방식): 버튼을 누르면 커서가 I자(텍스트) 모양으로 바뀌는 "무장" 상태가
  //      되고, 캔버스를 클릭한 그 자리에 빈 텍스트 오브젝트가 생기며 바로 깜빡이는 커서와 함께
  //      입력할 수 있게 편집모드로 들어감(입력 즉시 시작 가능, 별도 확인 없이 한 번 클릭으로 끝) ----
  const addTextBtn = document.getElementById('addTextBtn');
  let textToolActive = false;

  // 기본 브라우저 'text' 커서(가늘고 색이 흐릿함)는 캔버스 위에서 잘 안 보인다는 요청이 있어서,
  // 굵고 빨간 I자 모양 커서를 직접 SVG로 그려서 씀(스포이드 커서와 같은 방식).
  const TEXT_TOOL_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'>" +
    "<g stroke='#e74c3c' stroke-width='3.4' stroke-linecap='round'>" +
    "<line x1='7' y1='4' x2='19' y2='4'/>" +
    "<line x1='13' y1='4' x2='13' y2='22'/>" +
    "<line x1='7' y1='22' x2='19' y2='22'/>" +
    "</g></svg>";
  const TEXT_TOOL_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(TEXT_TOOL_CURSOR_SVG) + '") 13 13, text';

  // 텍스트 도구를 처음(딱 한 번만) 무장할 때 사용법을 짧게 안내하는 토스트 메시지.
  // localStorage에 한 번 봤다는 표시를 남겨서, 이후로는(새로고침해도) 다시 뜨지 않음.
  const TEXT_TOOL_HINT_KEY = 'ecopro3_text_tool_hint_seen_v1';
  function showTextToolHintOnce(){
    try {
      if (localStorage.getItem(TEXT_TOOL_HINT_KEY)) return;
      localStorage.setItem(TEXT_TOOL_HINT_KEY, '1');
    } catch (err) {
      // 시크릿 모드 등으로 localStorage를 못 쓰는 환경이면 그냥 매번 안내해도 무방하므로 조용히 통과
    }
    const toast = document.createElement('div');
    toast.className = 'text-tool-hint-toast';
    toast.textContent = '캔버스를 클릭한 후 글을 적어주세요';
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function setTextToolMode(active){
    textToolActive = active;
    addTextBtn.classList.toggle('active', active);
    canvas.selection = !active;
    canvas.skipTargetFind = active;
    canvas.discardActiveObject();
    canvas.defaultCursor = active ? TEXT_TOOL_CURSOR : 'default';
    canvas.hoverCursor = active ? TEXT_TOOL_CURSOR : 'move';
    canvas.renderAll();
    if (active) showTextToolHintOnce();
  }

  addTextBtn.addEventListener('click', () => {
    if (penActive) setPenMode(false);
    setTextToolMode(!textToolActive);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && textToolActive) setTextToolMode(false);
  });

  canvas.on('mouse:down', (opt) => {
    if (!textToolActive) return;
    const p = canvas.getPointer(opt.e);
    const t = new fabric.IText('', {
      left: p.x, top: p.y,
      originX: 'left', originY: 'top',
      fontFamily: 'Pretendard', fontSize: 40, fill: '#222222',
      // 캔버스가 90/180/270도 회전된 상태면 새 텍스트도 그 각도로 바로 맞춰서 만들어짐 —
      // 그래야 화면(회전된 디자인) 기준으로 눕지 않고 똑바로 읽히는 방향으로 생김.
      // 모바일 모드에서만 캔버스 회전 각도를 새 텍스트에 바로 적용함(요청에 따라 PC는 제외 —
      // PC는 항상 angle 0으로 예전 그대로 생성됨)
      angle: (EP.isMobileModeActive && EP.isMobileModeActive()) ? (EP.canvasRotationDeg || 0) : 0
    });
    canvas.add(t);
    bringGuideToFront();
    setTextToolMode(false); // 한 번 클릭해서 만들면 바로 선택 도구로 돌아옴(포토샵과 동일)
    canvas.setActiveObject(t);
    t.enterEditing();
    canvas.requestRenderAll();
  });

  // ---- 글자모양교정: 가로/세로로 눌리거나 늘어난 글자(scaleX ≠ scaleY)를 정비율로 되돌림 ----
  //   - 옆으로 늘어난 경우(scaleX > scaleY): 세로도 그만큼 늘려서 맞춤(scaleY를 scaleX에 맞춤)
  //   - 세로로 길쭉하게 늘어난 경우(scaleY > scaleX): 자간을 기존의 절반으로 줄이고,
  //     세로 크기도 scaleX에 맞게 줄여서 정비율로 만듦
  document.getElementById('fixTextShapeBtn').addEventListener('click', () => {
    const active = canvas.getActiveObject();
    if (!active) return;
    const targets = (active.type === 'activeSelection' || active.type === 'group')
      ? active.getObjects().filter(o => isTextObject(o))
      : (isTextObject(active) ? [active] : []);
    if (!targets.length) return;

    targets.forEach(t => {
      const sx = t.scaleX || 1, sy = t.scaleY || 1;
      if (Math.abs(sx - sy) < 0.001) return; // 이미 정비율이면 그대로 둠
      if (sx > sy) {
        // 옆으로 늘어남 → 세로를 가로만큼 늘려서 맞춤
        t.set('scaleY', sx);
      } else {
        // 세로로 늘어남 → 세로를 가로에 맞게 줄이고, 자간도 절반으로 줄임
        t.set('scaleY', sx);
        t.set('charSpacing', (t.charSpacing || 0) / 2);
      }
      t.setCoords();
    });
    canvas.requestRenderAll();
    pushHistory();
  });

  // ---- 모양 만들기: "◆ 모양 만들기"를 누르면 캔버스 정가운데에 모양 선택 목록이 뜨고,
  //      그중 하나를 클릭하면 즉시 그 모양이 만들어짐(사각형/둥근사각형/원/삼각형/별/하트) ----
  (function(){
    const shapePickerModal = document.getElementById('shapePickerModal');
    const shapePickerModalCloseBtn = document.getElementById('shapePickerModalCloseBtn');
    const shapePickerGridView = document.getElementById('shapePickerGridView');
    const shapePickerRoundRectView = document.getElementById('shapePickerRoundRectView');
    const roundRectWidthInput = document.getElementById('roundRectWidthInput');
    const roundRectHeightInput = document.getElementById('roundRectHeightInput');
    const roundRectRadiusInput = document.getElementById('roundRectRadiusInput');
    const roundRectCreateBtn = document.getElementById('roundRectCreateBtn');
    const roundRectBackBtn = document.getElementById('roundRectBackBtn');

    function showGridView(){
      shapePickerGridView.classList.remove('hidden');
      shapePickerRoundRectView.classList.add('hidden');
    }
    function showRoundRectView(){
      shapePickerGridView.classList.add('hidden');
      shapePickerRoundRectView.classList.remove('hidden');
      roundRectWidthInput.value = 180;
      roundRectHeightInput.value = 120;
      roundRectRadiusInput.value = 20;
    }

    // 모양은 항상 캔버스 정가운데(CANVAS_W/2, CANVAS_H/2)에 만들어지므로, 모달을 그 왼쪽에
    // 자리잡게 함(요청대로). 처음 열 때만 이 위치로 잡아주고, 그 뒤로는 사용자가 마우스로
    // 드래그해서 옮긴 위치를 그대로 유지함(다른 팝업들과 동일한 관례).
    function positionShapePickerModal(){
      shapePickerModal.classList.remove('hidden');
      const mw = shapePickerModal.offsetWidth || 220;
      const mh = shapePickerModal.offsetHeight || 200;
      const canvasRect = canvas.upperCanvasEl.getBoundingClientRect();
      const centerLeft = canvasRect.left + canvasRect.width / 2;
      const centerTop = canvasRect.top + canvasRect.height / 2;
      let left = centerLeft - mw - 16; // 정가운데(=모양이 생길 자리) 왼쪽에 여백을 두고 배치
      let top = centerTop - mh / 2;
      if (left < 8) left = centerLeft + 16; // 화면이 좁아서 왼쪽 공간이 부족하면 오른쪽으로 대체
      const r = EP.clampPopoverRect ? EP.clampPopoverRect(left, top, mw, mh, EP.canvasRotationDeg) : { left, top };
      shapePickerModal.style.left = r.left + 'px';
      shapePickerModal.style.top = r.top + 'px';
      if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(shapePickerModal);
    }
    function hideShapePickerModal(){ shapePickerModal.classList.add('hidden'); showGridView(); }

    // 마우스로 클릭+드래그해서 모달창을 원하는 위치로 옮길 수 있게 함(다른 팝업들과 동일)
    if (EP.makeDraggablePopover) EP.makeDraggablePopover(shapePickerModal);
    if (EP.registerRotatablePopover) EP.registerRotatablePopover(shapePickerModal);

    document.getElementById('openShapePickerBtn').addEventListener('click', () => {
      if (penActive) setPenMode(false);
      if (textToolActive) setTextToolMode(false);
      showGridView(); // 매번 새로 열 때는 항상 목록부터 보여줌
      positionShapePickerModal();
    });
    shapePickerModalCloseBtn.addEventListener('click', hideShapePickerModal);

    function addShapeObject(obj){
      canvas.add(obj); bringGuideToFront(); canvas.setActiveObject(obj); canvas.renderAll();
      // (PC에서는 여러 모양을 연달아 만들 수 있게 자동으로 안 닫음 — 모달의 ✕ 버튼을
      // 직접 눌러야만 닫힘. 모바일에서만 화면이 좁아 캔버스를 가리는 게 더 불편하므로,
      // 모양을 하나 만들면 바로 창이 자동으로 닫히게 함)
      if (EP.isMobileModeActive && EP.isMobileModeActive()) hideShapePickerModal();
    }

    document.getElementById('pickRectBtn').addEventListener('click', () => {
      addShapeObject(new fabric.Rect({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        width: 180, height: 120, fill: '#3498db', stroke: '', strokeWidth: 0
      }));
    });

    // 둥근사각형: 바로 만들지 않고, 아까 만들었던 "둥근 정도" 숫자 입력 단계로 먼저 감
    document.getElementById('pickRoundRectBtn').addEventListener('click', () => {
      showRoundRectView();
    });
    roundRectBackBtn.addEventListener('click', showGridView);
    roundRectCreateBtn.addEventListener('click', () => {
      // 가로/세로를 사용자가 직접 입력한 값으로 생성 — 나중에 늘려서 비율을 맞추다가
      // 모서리 radius가 타원형으로 찌그러지는 문제를 애초에 만들 때 원하는 비율로 잡아서 방지함
      const w = Math.max(10, Math.min(parseFloat(roundRectWidthInput.value) || 180, 2000));
      const h = Math.max(10, Math.min(parseFloat(roundRectHeightInput.value) || 120, 2000));
      // 입력값이 클수록 둥근 강도(모서리 반경)도 커짐 — 사각형 짧은 변의 절반을 넘지 않게 막아서
      // 값이 너무 크면 알약(캡슐) 모양까지만 되고 찌그러지지 않게 함
      const radius = Math.max(0, Math.min(parseFloat(roundRectRadiusInput.value) || 0, Math.min(w, h) / 2));
      addShapeObject(new fabric.Rect({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        width: w, height: h, rx: radius, ry: radius, fill: '#3498db', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickCircleBtn').addEventListener('click', () => {
      addShapeObject(new fabric.Circle({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        radius: 80, fill: '#e67e22', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickTriangleBtn').addEventListener('click', () => {
      addShapeObject(new fabric.Triangle({
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        width: 160, height: 140, fill: '#9b59b6', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickStarBtn').addEventListener('click', () => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * (Math.PI / 5);
        const rad = i % 2 === 0 ? 80 : 32;
        pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
      }
      addShapeObject(new fabric.Polygon(pts, {
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        fill: '#f1c40f', stroke: '', strokeWidth: 0
      }));
    });

    document.getElementById('pickHeartBtn').addEventListener('click', () => {
      const d = 'M0,25 C-40,-5 -70,-45 -35,-65 C-10,-80 0,-50 0,-40 C0,-50 10,-80 35,-65 C70,-45 40,-5 0,25 Z';
      addShapeObject(new fabric.Path(d, {
        left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center',
        fill: '#e74c3c', stroke: '', strokeWidth: 0
      }));
    });
  })();

  /* ============================================================
     8b. 펜 도구 (일러스트레이터 방식)
     - 클릭: 직선 앵커점 추가
     - 클릭한 채로 드래그: 그 점에 곡선 핸들 생성 (좌우 대칭)
     - 더블클릭 / Enter: 지금까지 그린 경로를 완성 (열린 패스)
     - 시작점 근처를 다시 클릭: 경로를 닫아서 완성 (닫힌 도형)
     - Esc: 그리던 중인 경로 취소 (한번 더 누르면 펜 도구 자체 종료)
  ============================================================ */
  const penToolBtn = document.getElementById('penToolBtn');
  let penActive = false;
  let penPoints = [];      // { x, y, hx, hy } — hx/hy: 이 점에서 바깥쪽으로 드래그한 곡선 핸들 오프셋
  let penDragging = false;
  let penPreviewObjects = [];
  const PEN_CLOSE_TOLERANCE = 10; // 시작점 닫기 판정 (화면 픽셀 기준)

  // 포토샵 펜툴처럼 생긴 커서(닙 모양) — SVG를 데이터 URI로 만들어 커서로 씀.
  // 핫스팟(클릭 포인트)은 닙 끝부분(왼쪽 아래)에 맞춤. 혹시 브라우저가 커스텀 커서를 못 읽으면
  // crosshair로 자동 대체됨(cursor 속성의 콤마 뒤 fallback).
  const PEN_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
    "<line x1='21' y1='3' x2='8' y2='16' stroke='black' stroke-width='3' stroke-linecap='square'/>" +
    "<line x1='21' y1='3' x2='8' y2='16' stroke='white' stroke-width='1' stroke-linecap='square'/>" +
    "<path d='M8 16 L4 21 L2 19 Z' fill='black' stroke='white' stroke-width='0.5' stroke-linejoin='round'/>" +
    "</svg>";
  const PEN_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(PEN_CURSOR_SVG) + '") 2 21, crosshair';

  function setPenMode(active){
    penActive = active;
    penToolBtn.classList.toggle('active', active);
    canvas.selection = !active;
    canvas.skipTargetFind = active;
    canvas.discardActiveObject();
    canvas.defaultCursor = active ? PEN_CURSOR : 'default';
    canvas.hoverCursor = active ? PEN_CURSOR : 'move';
    if (!active) {
      penPoints = [];
      penDragging = false;
      clearPenPreview();
    }
    canvas.renderAll();
  }

  penToolBtn.addEventListener('click', () => {
    if (textToolActive) setTextToolMode(false);
    if (penActive) {
      finishPenPath(false);
      setPenMode(false);
    } else {
      setPenMode(true);
    }
  });

  function clearPenPreview(){
    penPreviewObjects.forEach(o => canvas.remove(o));
    penPreviewObjects = [];
  }

  function buildPenPathD(points, mousePt, closed){
    if (!points.length) return '';
    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const c1x = p0.x + p0.hx, c1y = p0.y + p0.hy;
      const c2x = p1.x - p1.hx, c2y = p1.y - p1.hy;
      d += `C ${c1x} ${c1y} ${c2x} ${c2y} ${p1.x} ${p1.y} `;
    }
    if (mousePt) {
      const last = points[points.length - 1];
      const c1x = last.x + last.hx, c1y = last.y + last.hy;
      d += `C ${c1x} ${c1y} ${mousePt.x} ${mousePt.y} ${mousePt.x} ${mousePt.y} `;
    } else if (closed && points.length > 1) {
      const last = points[points.length - 1], first = points[0];
      const c1x = last.x + last.hx, c1y = last.y + last.hy;
      const c2x = first.x - first.hx, c2y = first.y - first.hy;
      d += `C ${c1x} ${c1y} ${c2x} ${c2y} ${first.x} ${first.y} `;
    }
    if (closed) d += 'Z';
    return d;
  }

  function renderPenPreview(mousePt){
    clearPenPreview();
    if (!penPoints.length) { canvas.renderAll(); return; }

    const d = buildPenPathD(penPoints, mousePt, false);
    const previewPath = new fabric.Path(d, {
      fill: '', stroke: '#3498db', strokeWidth: 1.5 / zoom,
      strokeDashArray: [5 / zoom, 4 / zoom],
      selectable: false, evented: false, objectCaching: false
    });
    previewPath.isGuide = true;
    canvas.add(previewPath);
    penPreviewObjects.push(previewPath);

    penPoints.forEach((p) => {
      const dot = new fabric.Circle({
        left: p.x, top: p.y, originX: 'center', originY: 'center',
        radius: 4 / zoom, fill: '#ffffff', stroke: '#3498db', strokeWidth: 1.5 / zoom,
        selectable: false, evented: false
      });
      dot.isGuide = true;
      canvas.add(dot);
      penPreviewObjects.push(dot);

      if (p.hx || p.hy) {
        const line = new fabric.Line([p.x - p.hx, p.y - p.hy, p.x + p.hx, p.y + p.hy], {
          stroke: '#3498db', strokeWidth: 1 / zoom, selectable: false, evented: false
        });
        line.isGuide = true;
        canvas.add(line);
        penPreviewObjects.push(line);

        [[p.x + p.hx, p.y + p.hy], [p.x - p.hx, p.y - p.hy]].forEach(([hx, hy]) => {
          const hd = new fabric.Rect({
            left: hx, top: hy, originX: 'center', originY: 'center',
            width: 5 / zoom, height: 5 / zoom, fill: '#3498db',
            selectable: false, evented: false
          });
          hd.isGuide = true;
          canvas.add(hd);
          penPreviewObjects.push(hd);
        });
      }
    });

    canvas.renderAll();
  }

  function finishPenPath(closed){
    if (penPoints.length < 2) {
      penPoints = [];
      penDragging = false;
      clearPenPreview();
      canvas.renderAll();
      return;
    }
    const d = buildPenPathD(penPoints, null, closed);
    clearPenPreview();

    const path = new fabric.Path(d, {
      fill: closed ? 'rgba(52,152,219,0.15)' : 'transparent',
      stroke: '#222222',
      strokeWidth: 3,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: true,
      evented: true,
      objectCaching: false
    });
    path.isPenToolPath = true; // 펜 도구로 만든 패스임을 표시 — K 버튼(테두리 색상/불투명도/두께 팝업)은 이 표시가 있는 오브젝트에만 뜸
    canvas.add(path);
    bringGuideToFront();
    canvas.setActiveObject(path);
    canvas.renderAll();

    penPoints = [];
    penDragging = false;
  }

  canvas.on('mouse:down', (opt) => {
    if (!penActive) return;
    const p = canvas.getPointer(opt.e);

    if (penPoints.length >= 2) {
      const first = penPoints[0];
      const screenDist = Math.hypot(p.x - first.x, p.y - first.y) * zoom;
      if (screenDist <= PEN_CLOSE_TOLERANCE) {
        finishPenPath(true);
        return;
      }
    }

    penPoints.push({ x: p.x, y: p.y, hx: 0, hy: 0 });
    penDragging = true;
    renderPenPreview(p);
  });

  canvas.on('mouse:move', (opt) => {
    if (!penActive || !penPoints.length) return;
    const p = canvas.getPointer(opt.e);
    if (penDragging) {
      const anchor = penPoints[penPoints.length - 1];
      anchor.hx = p.x - anchor.x;
      anchor.hy = p.y - anchor.y;
    }
    renderPenPreview(p);
  });

  canvas.on('mouse:up', () => {
    if (!penActive) return;
    penDragging = false;
  });

  canvas.on('mouse:dblclick', () => {
    if (!penActive) return;
    finishPenPath(false);
  });

  // 펜 도구 사용 중 캔버스 "밖"(캔버스 감싸는 여백의 투명/체크무늬 영역)을 좌클릭하면,
  // 그리던 중이던 경로는 취소하고 선택 도구로 바로 전환·활성화해줌(선택 버튼을 직접
  // 누른 것과 완전히 동일하게 동작하도록 그 클릭 핸들러를 그대로 재사용함).
  canvasWrap.addEventListener('mousedown', function(e){
    if (!penActive) return;
    if (e.button !== 0) return; // 좌클릭만 해당
    // 실제 캔버스(그림이 그려지는 영역) 안쪽 클릭이면 펜 도구 자체 로직에 맡기고 여기선 무시
    if (canvas.upperCanvasEl.contains(e.target)) return;
    penPoints = [];
    penDragging = false;
    clearPenPreview();
    document.getElementById('selectToolBtn').click(); // 선택 도구의 기존 활성화 로직을 그대로 재사용
  });

  /* ============================================================
     9. 삭제 / 복제
  ============================================================ */
  const deleteBtn = document.getElementById('deleteBtn');
  const deleteSideBtn = document.getElementById('deleteSideBtn');
  function deleteSelected(){
    if (cropState) return; // 자르기 모드 중에는 일반 삭제 동작을 막음 (취소 버튼/Esc로 나가기)
    const objs = canvas.getActiveObjects().filter(o => !o.isGuide);
    if (!objs.length) return;
    objs.forEach(o => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.renderAll();
  }
  deleteBtn.addEventListener('click', deleteSelected);
  deleteSideBtn.addEventListener('click', deleteSelected);
  EP.deleteSelected = deleteSelected; // 모바일 휴지통 버튼(ecopro3mobiletools.js)에서 재사용

  document.getElementById('duplicateBtn').addEventListener('click', () => {
    if (cropState) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide) return;
    obj.clone(clone => {
      clone.set({
        left: obj.left, top: obj.top + 20,
        // 잠긴(선택 불가) 오브젝트를 롱프레스로 선택한 뒤 복제한 경우에도, 새로 만든
        // 복제본은 원본의 잠금 상태를 물려받지 않고 항상 바로 선택·이동 가능한 상태로
        // 시작하게 함 (요청: "복제로 만든 레이어들 모두 선택 가능하게")
        selectable: true, evented: true, imageLocked: false,
        hasControls: true, hasBorders: true,
        lockMovementX: false, lockMovementY: false,
        hoverCursor: 'move'
      });
      canvas.add(clone); bringGuideToFront();
      if (EP.reindexPastedTable) EP.reindexPastedTable(clone); // 표를 복제한 경우 새 tableId로 재등록
      canvas.setActiveObject(clone);
      canvas.renderAll();
    }, getCustomObjectProps().concat(EP.tableCloneProps || []));
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const active = canvas.getActiveObject();
    if (active && active.isEditing) return;

    if (penActive) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (penPoints.length) {
          penPoints = []; penDragging = false; clearPenPreview(); canvas.renderAll();
        } else {
          setPenMode(false);
        }
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); finishPenPath(false); return; }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
  });

  /* ============================================================
     9b. 복사 / 붙여넣기
  ============================================================ */
  let clipboard = null;

  function copySelected(){
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide || cropState) return;
    obj.clone((cloned) => { clipboard = cloned; }, getCustomObjectProps().concat(EP.tableCloneProps || []));
  }

  function pasteClipboard(pointer){
    if (!clipboard || cropState) return;
    clipboard.clone((clonedObj) => {
      canvas.discardActiveObject();
      clonedObj.set({
        left: pointer ? pointer.x : (clonedObj.left || 0),
        top: pointer ? pointer.y : (clonedObj.top || 0) + 24,
        // 잠긴 오브젝트를 복사한 뒤 붙여넣은 경우에도, 붙여넣기 결과는 항상 바로
        // 선택·이동 가능한 상태로 시작하게 함(복제 버튼과 동일한 이유)
        selectable: true, evented: true, imageLocked: false,
        hasControls: true, hasBorders: true,
        lockMovementX: false, lockMovementY: false,
        hoverCursor: 'move'
      });
      if (clonedObj.type === 'activeSelection') {
        clonedObj.canvas = canvas;
        clonedObj.forEachObject((o) => {
          canvas.add(o);
          if (EP.reindexPastedTable) EP.reindexPastedTable(o); // 여러 개 중에 표가 섞여 있으면 그 표만 새 tableId로 재등록
        });
        clonedObj.setCoords();
      } else {
        canvas.add(clonedObj);
        if (EP.reindexPastedTable) EP.reindexPastedTable(clonedObj); // 붙여넣은 게 표라면 원본과 안 겹치도록 새 tableId로 재등록
      }
      bringGuideToFront();
      canvas.setActiveObject(clonedObj);
      canvas.requestRenderAll();
      pushHistory();
    }, getCustomObjectProps().concat(EP.tableCloneProps || []));
  }

  /* ============================================================
     9c. 이미지 잠금 / 잠금 해제
     - 잠긴 이미지는 일반 클릭으로 선택·이동할 수 없고,
       꾹 누르고 있거나(롱프레스) 더블클릭해야 선택되어
       우클릭 메뉴에서 "잠금 해제"를 고를 수 있습니다.
  ============================================================ */
  function lockImage(img){
    img.set({
      selectable: false,
      evented: true,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      hoverCursor: 'pointer'
    });
    img.imageLocked = true;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }

  function unlockImage(img){
    img.set({
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      hoverCursor: 'move'
    });
    img.imageLocked = false;
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    pushHistory();
  }
  EP.lockImage = lockImage;     // 모바일 잠금 버튼(ecopro3mobiletools.js)에서 재사용
  EP.unlockImage = unlockImage; // 위와 동일

  let longPressTimer = null;
  let longPressTarget = null;
  canvas.on('mouse:down', (opt) => {
    if (opt.target && opt.target.imageLocked) {
      longPressTarget = opt.target;
      longPressTimer = setTimeout(() => {
        if (longPressTarget) {
          canvas.setActiveObject(longPressTarget);
          canvas.requestRenderAll();
        }
      }, 550);
    }
  });
  canvas.on('mouse:up', () => { clearTimeout(longPressTimer); longPressTarget = null; });

  /* ============================================================
     9d. 이미지 교체
  ============================================================ */
  const replaceImageInput = document.getElementById('replaceImageInput');
  let replaceTargetImg = null;
  function startReplaceImage(img){
    replaceTargetImg = img;
    replaceImageInput.value = '';
    replaceImageInput.click();
  }
  replaceImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !replaceTargetImg) { replaceTargetImg = null; return; }
    const targetImg = replaceTargetImg;
    replaceTargetImg = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      targetImg.setSrc(ev.target.result, () => {
        const el = targetImg._element;
        targetImg.set({
          cropX: 0, cropY: 0,
          width: (el && el.naturalWidth) || targetImg.width,
          height: (el && el.naturalHeight) || targetImg.height
        });
        targetImg.setCoords();
        canvas.renderAll();
        pushHistory();
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  /* ============================================================
     9e. 커스텀 우클릭(컨텍스트) 메뉴
     - 브라우저 기본 우클릭 메뉴 대신, 오브젝트 종류에 맞는
       복사/붙여넣기/실행취소/다시실행/삭제/이미지 잠금·교체 메뉴를 띄움
  ============================================================ */
  const ctxMenu = document.getElementById('customContextMenu');

  function hideContextMenu(){
    ctxMenu.classList.add('hidden');
  }

  function addCtxItem(label, handler, danger){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (danger) btn.classList.add('danger');
    btn.addEventListener('click', () => { hideContextMenu(); handler(); });
    ctxMenu.appendChild(btn);
    return btn;
  }
  function addCtxDivider(){
    const hr = document.createElement('div');
    hr.className = 'ctx-divider';
    ctxMenu.appendChild(hr);
  }

  function openContextMenu(e, opts){
    if (cropState) return;
    opts = opts || {};
    let pointer, target;
    if (opts.explicitTarget !== undefined) {
      // 버튼으로 연 경우: 클릭 좌표가 없으므로 "지금 선택된 오브젝트"를 그대로 대상으로 씀
      target = opts.explicitTarget;
      pointer = null;
    } else {
      e.preventDefault();
      pointer = canvas.getPointer(e);
      target = canvas.findTarget(e, false);
    }
    ctxMenu.innerHTML = '';

    if (target && (target.isTableCell || target.isTableCellText) && EP.buildTableContextMenu) {
      EP.buildTableContextMenu(target, e, addCtxItem, addCtxDivider);
    } else if (target && target.isTableGroup && EP.enterTableEditMode) {
      // 아직 그룹으로 묶여있는 표를 우클릭한 경우: 메뉴 대신 바로 편집모드로 진입시켜서
      // "표 편집 완료" 버튼이 확실히 뜨게 함 (더블클릭이 씹히는 경우의 대비책)
      EP.enterTableEditMode(target);
      hideContextMenu();
      return;
    } else if (target && !target.isGuide) {
      if (target.imageLocked) {
        addCtxItem('🔓 잠금 해제', () => unlockImage(target));
        if (isImageObject(target)) addCtxItem('🖼 이미지 교체', () => startReplaceImage(target));
        addCtxItem('🗑 삭제', () => { canvas.remove(target); canvas.discardActiveObject(); canvas.renderAll(); pushHistory(); }, true);
      } else {
        if (canvas.getActiveObject() !== target) {
          canvas.setActiveObject(target);
          canvas.renderAll();
        }
        if (isImageObject(target)) {
          addCtxItem('🔒 이미지 잠금', () => lockImage(target));
          addCtxItem('🗑 이미지 삭제', () => deleteSelected(), true);
        } else {
          addCtxItem('🔒 잠금', () => lockImage(target));
          addCtxItem('🗑 삭제', () => deleteSelected(), true);
        }
        addCtxDivider();
        addCtxItem('⧉ 복제', () => { const duplicateBtn = document.getElementById('duplicateBtn'); if (duplicateBtn) duplicateBtn.click(); });
        if (target.type === 'group') {
          addCtxItem('🔓 풀기', () => {
            const sel = target.toActiveSelection();
            canvas.setActiveObject(sel);
            canvas.requestRenderAll();
            pushHistory();
          });
        } else if (target.type === 'activeSelection' && target.size() >= 2) {
          addCtxItem('🔗 묶기', () => {
            const group = target.toGroup();
            canvas.setActiveObject(group);
            canvas.requestRenderAll();
            pushHistory();
          });
        }
        addCtxDivider();
        addCtxItem('⬆ 레이어 앞으로', () => { canvas.bringToFront(target); bringGuideToFront(); canvas.renderAll(); pushHistory(); });
        addCtxItem('⬇ 레이어 뒤로', () => { canvas.sendToBack(target); canvas.renderAll(); pushHistory(); });
        addCtxItem('↻ 90도 회전', () => { const rotateObjectBtn = document.getElementById('rotateObjectBtn'); if (rotateObjectBtn) rotateObjectBtn.click(); });
        addCtxItem('🔍 2배 확대', () => {
          const center = target.getCenterPoint();
          target.set({ scaleX: target.scaleX * 2, scaleY: target.scaleY * 2 });
          target.setPositionByOrigin(center, 'center', 'center');
          target.setCoords();
          canvas.requestRenderAll();
          pushHistory();
        });
        if (isImageObject(target)) {
          addCtxDivider();
          addCtxItem('🖼 이미지 교체', () => startReplaceImage(target));
        }
        // 모양·텍스트 오브젝트일 때만 — 회전 아이콘 탭-사이클에 있던 안내선1/2를 여기로
        // 옮김(요청: "회전버튼 클릭할 때 나오는 안내선1, 안내선2는 도구 하단에 넣고").
        // 지금 선택된(=이 메뉴가 열린) 오브젝트를 기준으로 십자 안내선을 켜고 끔.
        if (EP.isTextObject(target) || EP.isShapeObject(target)) {
          addCtxDivider();
          addCtxItem('📐 안내선1 (좌측하단)', () => { if (EP.toggleRotateGuide) EP.toggleRotateGuide(target, 1); });
          addCtxItem('📐 안내선2 (우측상단)', () => { if (EP.toggleRotateGuide) EP.toggleRotateGuide(target, 2); });
        }
        // 글자 오브젝트를 클릭해서 이 메뉴를 열었을 때만 — 곧바로 편집 모드로 들어가는
        // 버튼(요청: "도구의 안내선 아래에 글수정 버튼... 글 오브젝트 클릭후 수정 가능하게").
        // 텍스트 옆 연필 아이콘과 완전히 같은 동작.
        if (EP.isTextObject(target)) {
          addCtxItem('✏️ 글수정', () => {
            target.enterEditing();
            target.selectAll();
            canvas.requestRenderAll();
          });
        }
      }
    } else if (opts.explicitTarget !== undefined) {
      return; // 버튼으로 열었는데 선택된 오브젝트가 없으면(호출하는 쪽에서 이미 걸러내지만 이중 안전장치) 그냥 아무것도 안 함
    } else {
      addCtxItem('📋 붙여넣기', () => pasteClipboard(pointer));
    }

    ctxMenu.classList.remove('hidden');
    const menuRect = ctxMenu.getBoundingClientRect();
    let x, y;
    if (opts.anchorRect) {
      // 버튼 위쪽(상단 방향)으로 열림 — 버튼 바로 위에 메뉴 아래쪽 끝이 오도록 배치
      x = opts.anchorRect.left;
      y = opts.anchorRect.top - menuRect.height - 8;
      if (x + menuRect.width > window.innerWidth - 8) x = window.innerWidth - menuRect.width - 8;
      if (y < 8) y = 8; // 화면 위로 넘치면 최소한 맨 위(8px)에는 붙임
    } else {
      x = e.clientX; y = e.clientY;
      if (x + menuRect.width > window.innerWidth - 8) x = window.innerWidth - menuRect.width - 8;
      if (y + menuRect.height > window.innerHeight - 8) y = window.innerHeight - menuRect.height - 8;
    }
    ctxMenu.style.left = Math.max(8, x) + 'px';
    ctxMenu.style.top = Math.max(8, y) + 'px';
  }

  canvas.upperCanvasEl.addEventListener('contextmenu', openContextMenu);
  canvasWrap.addEventListener('contextmenu', (e) => { if (e.target === canvasWrap) e.preventDefault(); });

  // 페이지 전체에서 브라우저 기본 우클릭 메뉴를 막음(요청: "우클릭 안되는 기능 추가").
  // 캔버스 위는 위에서 이미 openContextMenu(자체 메뉴)로 대체돼 있어서 그대로 유지되고,
  // 그 외 영역(툴바/빈 배경 등)에서도 우클릭 시 브라우저 메뉴가 안 뜨게 됨.
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  // 모바일 하단 바 "우클릭메뉴" 버튼 — 길게 누르기(터치)가 일부 기기에서 잘 안 먹혀서, 우클릭
  // 메뉴와 완전히 같은 내용을 이 버튼으로도 열 수 있게 함. 지금 선택돼 있는 오브젝트를
  // 그대로 대상으로 쓰고(따로 뭘 다시 클릭할 필요 없음), 메뉴는 버튼 아래가 아니라 위쪽으로
  // 열림(화면 맨 아래에 있는 버튼이라 아래로 열면 화면 밖으로 나가버리므로). 이 버튼을 누르는
  // 순간 선택이 풀리지 않도록 위 "16. 캔버스 바깥 클릭 시 선택 해제"에서 .floating-action-bar를
  // 이미 예외 처리해뒀음.
  // alert() 없이 화면 아래쪽에 잠깐 떴다 사라지는 안내 토스트 — alert()은 브라우저 네이티브
  // 대화상자라서 뜨는 즉시 전체화면이 강제로 풀려버리는데(브라우저 표준 동작, 막을 수 없음),
  // 이 토스트는 그냥 일반 DOM 요소라 전체화면 상태에 전혀 영향을 주지 않음.
  function showBottomHintToast(text){
    const toast = document.createElement('div');
    toast.className = 'mobile-focus-hint-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }
  EP.showBottomHintToast = showBottomHintToast; // 다른 파일(스포이드 등)에서도 alert() 대신 재사용

  const mobileCtxMenuBtn = document.getElementById('mobileCtxMenuBtn');
  if (mobileCtxMenuBtn) {
    mobileCtxMenuBtn.addEventListener('click', () => {
      if (!ctxMenu.classList.contains('hidden')) { hideContextMenu(); return; } // 다시 누르면 토글로 닫힘
      const target = canvas.getActiveObject();
      if (!target || target.isGuide) {
        // alert()은 브라우저 네이티브 대화상자라서 뜨는 순간 전체화면이 강제로 풀려버림
        // (브라우저 표준 동작이라 막을 수 없음) — 그래서 alert 대신 화면 안에 잠깐 떴다 사라지는
        // 토스트 문구로 안내함(전체화면이 풀리지 않음).
        showBottomHintToast('먼저 메뉴를 쓸 오브젝트를 선택해주세요.');
        return;
      }
      openContextMenu(null, { explicitTarget: target, anchorRect: mobileCtxMenuBtn.getBoundingClientRect() });
    });
  }

  /* ============================================================
     9e-2. 길게 누르기(1초 이상)로 우클릭 메뉴 열기 — PC/모바일 공통
     - 마우스든 손가락(터치)이든 캔버스 위에서 1초 이상 같은 자리를 누르고 있으면,
       실제 우클릭(contextmenu)과 완전히 같은 메뉴가 그 자리에서 열림(openContextMenu를
       그대로 재사용하므로 메뉴 내용·동작은 100% 동일함).
     - 누른 채로 일정 거리 이상(10px) 움직이면 오브젝트를 드래그해서 옮기려는 의도로
       보고 자동으로 취소함(그래야 평소처럼 드래그로 이동하는 데 지장이 없음).
  ============================================================ */
  let ctxLongPressTimer = null;
  let ctxLongPressStart = null; // { x, y, e }
  const CTX_LONG_PRESS_MS = 1000;
  const CTX_LONG_PRESS_MOVE_TOLERANCE = 10; // px — 마우스(포인터)는 원래도 잘 안 흔들리므로 그대로 둠
  const CTX_LONG_PRESS_MOVE_TOLERANCE_TOUCH = 26; // px — 손가락은 가만히 누르고 있어도 몇 px씩 미세하게
  // 흔들리는 게 정상이라, 마우스와 같은 10px 기준을 쓰면 안드로이드에서 타이머가 1초를 채우기도
  // 전에 "움직였다"고 오판해서 계속 취소돼버려 길게 눌러도 메뉴가 안 뜨는 문제가 있었음.

  function clearCtxLongPress(){
    if (ctxLongPressTimer) { clearTimeout(ctxLongPressTimer); ctxLongPressTimer = null; }
    ctxLongPressStart = null;
  }
  function clientPointOf(evt){
    return (evt.touches && evt.touches.length) ? evt.touches[0] : evt;
  }
  function isTouchEvent(evt){
    return !!(evt.touches || evt.pointerType === 'touch' || evt.type === 'touchstart');
  }

  // 마우스 입력은 기존 그대로 fabric의 mouse:down/move/up 이벤트로 처리(PC에서 이미 잘 동작함).
  canvas.on('mouse:down', (opt) => {
    const evt = opt.e;
    if (!evt || isTouchEvent(evt)) return; // 터치는 아래 네이티브 리스너가 따로(더 안정적으로) 처리함
    clearCtxLongPress();
    ctxLongPressStart = { x: evt.clientX, y: evt.clientY, e: evt, touch: false };
    ctxLongPressTimer = setTimeout(() => {
      if (!ctxLongPressStart) return;
      const heldEvent = ctxLongPressStart.e;
      ctxLongPressStart = null;
      openContextMenu(heldEvent);
    }, CTX_LONG_PRESS_MS);
  });
  canvas.on('mouse:move', (opt) => {
    if (!ctxLongPressStart || ctxLongPressStart.touch || !opt.e) return;
    const dx = opt.e.clientX - ctxLongPressStart.x;
    const dy = opt.e.clientY - ctxLongPressStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > CTX_LONG_PRESS_MOVE_TOLERANCE) clearCtxLongPress();
  });
  canvas.on('mouse:up', (opt) => { if (!opt.e || !isTouchEvent(opt.e)) clearCtxLongPress(); });

  // 잠금 해제 등에 꼭 필요해서 다시 복구함(요청) — 다만 파란 이동 손잡이(mobileMoveHandle)나
  // 빨간 회전 손잡이(mtr)를 누른 경우에는 시작하지 않음. 그래야 그 손잡이들을 꾹 눌러 천천히
  // 옮기는/돌리는 중에 메뉴가 끼어들지 않음(요청: "회전버튼 동그라미 꾸욱 길게누르면
  // 우클릭 안나오게 해줘").
  function isTouchNearDragHandle(evt){
    const target = canvas.getActiveObject();
    if (!target || !target.oCoords) return false;
    const pointer = canvas.getPointer(evt, true);
    const handles = [target.oCoords.mobileMoveHandle, target.oCoords.mtr];
    return handles.some((corner) => {
      if (!corner) return false;
      const dx = pointer.x - corner.x, dy = pointer.y - corner.y;
      return Math.sqrt(dx * dx + dy * dy) < 30;
    });
  }

  // 터치 입력은 fabric을 거치지 않고 캔버스 DOM 엘리먼트에 직접 붙인 네이티브
  // touchstart/touchmove/touchend/touchcancel로 따로 처리함 — fabric이 내부적으로 터치를
  // mouse:* 이벤트로 변환해주는 과정에서 안드로이드 일부 기종·브라우저 조합에서 타이밍이
  // 어긋나 길게 눌러도 메뉴가 안 뜨는 경우가 있어서, 더 원초적이고 확실한 방식으로 바꿈.
  const upperCanvasEl = canvas.upperCanvasEl;
  upperCanvasEl.addEventListener('touchstart', (evt) => {
    if (!evt.touches || evt.touches.length !== 1) { clearCtxLongPress(); return; } // 두 손가락(핀치줌 등)이면 무시
    clearCtxLongPress();
    if (isTouchNearDragHandle(evt)) return; // 이동/회전 손잡이 위에서 시작한 터치는 메뉴 타이머를 아예 안 켬
    const t = evt.touches[0];
    ctxLongPressStart = { x: t.clientX, y: t.clientY, e: evt, touch: true };
    ctxLongPressTimer = setTimeout(() => {
      if (!ctxLongPressStart) return;
      const heldEvent = ctxLongPressStart.e;
      ctxLongPressStart = null;
      openContextMenu(heldEvent);
    }, CTX_LONG_PRESS_MS);
  }, { passive: true });
  upperCanvasEl.addEventListener('touchmove', (evt) => {
    if (!ctxLongPressStart || !ctxLongPressStart.touch || !evt.touches || !evt.touches.length) return;
    const t = evt.touches[0];
    const dx = t.clientX - ctxLongPressStart.x;
    const dy = t.clientY - ctxLongPressStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > CTX_LONG_PRESS_MOVE_TOLERANCE_TOUCH) clearCtxLongPress();
  }, { passive: true });
  upperCanvasEl.addEventListener('touchend', () => { if (ctxLongPressStart && ctxLongPressStart.touch) clearCtxLongPress(); });
  upperCanvasEl.addEventListener('touchcancel', () => { if (ctxLongPressStart && ctxLongPressStart.touch) clearCtxLongPress(); });

  document.addEventListener('mousedown', (e) => {
    if (!ctxMenu.classList.contains('hidden') && !ctxMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

  /* ============================================================
     10. 줌 — 회전 버튼처럼 드롭다운으로 배율을 골라서 적용
  ============================================================ */
  let zoom = 1;
  const zoomMenuBtnLabel = document.getElementById('zoomMenuBtnLabel');
  function setZoomLevel(z){
    zoom = Math.min(Math.max(z, 0.2), 3);
    canvas.setZoom(zoom);
    canvas.setWidth(CANVAS_W * zoom);
    canvas.setHeight(CANVAS_H * zoom);
    zoomMenuBtnLabel.textContent = Math.round(zoom * 100) + '%';
    if (EP.onZoomChanged) EP.onZoomChanged(zoom); // 모바일 확대 게이지(ecopro3mobiletools.js)가 값을 맞출 수 있게 알려줌
    // 고정형 배경사진(목업)용 별도 훅 — EP.onZoomChanged는 mobiletools.js가 자기 것으로
    // 덮어써버려서 재사용할 수 없어 이름을 다르게 둠. rotateCanvas90()이 캔버스 크기를
    // 다시 맞추려고 "바뀌지 않은" 같은 zoom 값으로 이 함수를 또 부르는 경우가 있는데,
    // 그 호출까지 여기서 같이 걸러내면 "회전에는 반응하면 안 됨" 요구사항이 자동으로
    // 지켜짐(아래 훅 구현 쪽에서 실제 줌 값이 바뀌었을 때만 반응하도록 처리함).
    if (EP.onFixedBgZoomChange) EP.onFixedBgZoomChange(zoom);
  }
  document.querySelectorAll('#zoomMenu .dropdown-item').forEach(btn => {
    btn.addEventListener('click', () => setZoomLevel((parseFloat(btn.dataset.zoom) || 100) / 100));
  });
  setZoomLevel(1);
  EP.setZoomLevel = setZoomLevel;       // 모바일 확대 게이지에서 재사용
  EP.getCanvasDesignSize = function(){ return { w: CANVAS_W, h: CANVAS_H }; }; // 모바일 "화면에 꽉 채우기" 확대 계산용
  EP.getZoomLevel = () => zoom;         // 위와 동일(현재 배율 읽기용)

  canvasWrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoomLevel(zoom + (e.deltaY < 0 ? 0.08 : -0.08));
  }, { passive: false });

  /* ============================================================
     11. 레이어 순서 / 뒤집기
  ============================================================ */
  document.getElementById('layerFrontBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.bringToFront(o); bringGuideToFront(); canvas.renderAll(); } });
  document.getElementById('layerBackBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.sendToBack(o); canvas.renderAll(); } });
  document.getElementById('layerForwardBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.bringForward(o); bringGuideToFront(); canvas.renderAll(); } });
  document.getElementById('layerBackwardBtn').addEventListener('click', () => { const o = canvas.getActiveObject(); if (o) { canvas.sendBackwards(o); canvas.renderAll(); } });

  /* ============================================================
     12. 내보내기 (PNG / JPG / SVG) — 안내선은 항상 제외
     data-export 버튼은 상단 "🖼 이미지" 드롭다운 메뉴 안에만 있음(우측 하단 플로팅
     "상품담기/구입" 버튼은 아무 기능 없는 자리표시 버튼이라 여기 관여 안 함).
     메뉴 컨테이너가 클릭 시 e.stopPropagation()을 걸어두므로, document에 위임해서 듣는
     방식이 아니라 각 버튼에 직접 리스너를 붙여서 확실하게 동작하도록 함.
  ============================================================ */
  function download(url, filename){
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // 현재 캔버스를 복제한 뒤, 업로드한(임시) 폰트를 쓴 텍스트만 골라 이미지로 바꿔치기함
  // (SVG로 내보낼 때 사용 — 결과 SVG가 그 폰트 파일 없이도 어디서나 똑같이 보이도록)
  function buildFontFlattenedClone(){
    return new Promise((resolve) => {
      // 클론(canvas.clone)으로 새로 만들어지는 오브젝트는 원본에 런타임으로 붙어있던 특수효과
      // 렌더 패치(_render 오버라이드, ecopro3text.js의 patchUnifiedRender)를 물려받지 않음 —
      // 그래서 "어떤 오브젝트를 이미지로 바꿔야 하는지" 판단과 "실제로 그 이미지를 뽑는" 작업
      // 둘 다 항상 원본(patch가 살아있는) 오브젝트 기준으로 먼저 해두고, 클론 쪽에서는 그
      // 자리만 이미지로 바꿔치기함.
      const liveObjects = canvas.getObjects().filter(o => !o.isGuide);
      canvas.clone((cloned) => {
        const clonedObjects = cloned.getObjects().filter(o => !o.isGuide);
        // 업로드한 임시 폰트를 쓴 텍스트뿐 아니라, 원형/물결/기차/불꽃 등 특수 효과가 걸린
        // 텍스트도 SVG로는 표현할 방법이 없어서(캔버스 전용 렌더 방식이라) 마찬가지로
        // 이미지로 바꿔서 내보내야 실제 보이는 모양 그대로 SVG에 담김.
        const pairs = [];
        for (let i = 0; i < liveObjects.length && i < clonedObjects.length; i++) {
          const live = liveObjects[i];
          const needsRasterize = (isTextObject(live) && isCustomFontName(live.fontFamily)) ||
            (EP.hasAnyRenderEffect && EP.hasAnyRenderEffect(live));
          if (needsRasterize) pairs.push({ live, clonedObj: clonedObjects[i] });
        }
        if (!pairs.length) { resolve(cloned); return; }
        let remaining = pairs.length;
        pairs.forEach(({ live, clonedObj }) => {
          const imgJSON = rasterizeTextObjectToImageJSON(live); // 원본 기준으로 뽑아야 효과가 실제로 찍힘
          cloned.remove(clonedObj);
          fabric.Image.fromURL(imgJSON.src, (img) => {
            img.set({
              left: imgJSON.left, top: imgJSON.top,
              scaleX: imgJSON.scaleX, scaleY: imgJSON.scaleY,
              opacity: imgJSON.opacity, selectable: true, evented: true
            });
            cloned.add(img);
            remaining--;
            if (remaining === 0) resolve(cloned);
          });
        });
      });
    });
  }

  // 상단 "🖼 이미지" 메뉴 안의 PNG/JPG/SVG 버튼 각각에 직접 리스너를 붙임(메뉴 컨테이너에
  // 위임하지 않음 — 메뉴가 자기 안 클릭을 e.stopPropagation()으로 막아버리는 것과 무관하게
  // 항상 확실히 실행되도록 하기 위함).
  async function handleExportClick(e){
    const trigger = e.currentTarget;
    const type = trigger.getAttribute('data-export');
    if (!type) return;
    canvas.discardActiveObject();
    const wasBoxVisible = guideRect.visible, wasGridVisible = gridGuide.visible;
    guideRect.visible = false; outerGuideRect.visible = false; gridGuide.visible = false;
    canvas.renderAll();
    const multiplier = 1 / zoom;

    if (type === 'png') {
      download(canvas.toDataURL({ format: 'png', multiplier }), 'design.png');
    } else if (type === 'jpg') {
      download(canvas.toDataURL({ format: 'jpeg', quality: 0.95, multiplier }), 'design.jpg');
    } else if (type === 'svg') {
      trigger.disabled = true;
      const flattened = await buildFontFlattenedClone();
      let svgString = flattened.toSVG();
      // 이 SVG를 나중에 "SVG 불러오기"로 다시 열었을 때 필터·글자 위치 등이 전혀 손실되지
      // 않고 완벽히 복원되도록, 캔버스의 전체 데이터를 <metadata> 안에 그대로 함께 저장해둠.
      // 순수 SVG 뷰어/다른 프로그램에서는 이 태그가 그냥 무시되고 평소처럼 보이는 그림만 보임
      // — 이 에디터로 다시 열 때만 읽힘.
      // 주의: 프로젝트 저장(JSON)과 똑같이, 업로드한(임시) 폰트를 쓴 텍스트는 이미지로 바꿔서
      // 넣음 — 그 폰트는 이 브라우저 탭에만 등록돼있어서(파일 자체가 저장되지 않음), 원본
      // 그대로(글꼴 이름만) 넣어두면 다른 사람이나 나중에 다시 열었을 때 그 폰트가 이미
      // 사라지고 없어서 엉뚱한 기본 글꼴로 보이는 문제가 생기기 때문. 이미지로 바꿔두면
      // 폰트 없이도 항상 모양이 정확히 유지됨(다만 그 텍스트만 이후 글자 내용 수정은 불가).
      const originalData = await flattenSideDataForSave(serializeCurrentCanvas());
      const metadataJson = JSON.stringify(Object.assign({}, originalData, { canvasWidth: CANVAS_W, canvasHeight: CANVAS_H })).replace(/]]>/g, ']]&gt;'); // CDATA 종료 시퀀스 충돌 방지
      const metadataTag = '<metadata id="ecopro3-project-data"><![CDATA[' + metadataJson + ']]></metadata>';
      svgString = svgString.replace(/(<svg[^>]*>)/, '$1' + metadataTag);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download(url, 'design.svg');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      flattened.dispose();
      trigger.disabled = false;
    } else if (type === 'svg-vector') {
      // 폰트를 이미지로 바꾸는 과정(buildFontFlattenedClone) 자체를 건너뛰고, 지금 캔버스를
      // 있는 그대로 바로 SVG로 뽑음 — 그래서 글자도 <text>로, 도형도 전부 벡터 경로 그대로
      // 남아서 래스터화(이미지화)가 전혀 없음. 다만 업로드한 임시 폰트를 쓴 글자가 있으면
      // 그 폰트가 없는 다른 환경에서는 다른 글꼴로 대체되어 보일 수 있음(트레이드오프).
      let svgString = canvas.toSVG();
      const originalData = serializeCurrentCanvas(); // 이쪽도 폰트를 안 바꾼 원본 그대로 넣음(내용 일치)
      const metadataJson = JSON.stringify(Object.assign({}, originalData, { canvasWidth: CANVAS_W, canvasHeight: CANVAS_H })).replace(/]]>/g, ']]&gt;');
      const metadataTag = '<metadata id="ecopro3-project-data"><![CDATA[' + metadataJson + ']]></metadata>';
      svgString = svgString.replace(/(<svg[^>]*>)/, '$1' + metadataTag);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download(url, 'design-vector.svg');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    guideRect.visible = wasBoxVisible; outerGuideRect.visible = wasBoxVisible; gridGuide.visible = wasGridVisible;
    canvas.renderAll();
  }
  document.querySelectorAll('#fileMenu [data-export]').forEach(btn => btn.addEventListener('click', handleExportClick));

  /* ============================================================
     12b. "상품담기/구입" (플로팅 바 우측 버튼)
     - 모든 디자인(양면이면 앞/뒤 각각)을 순회하며 세 가지를 뽑아냄:
       1) 시안 이미지 (일반 해상도 JPEG) — sian.html 보드에 그대로 표시됨
       2) 원본 SVG (업로드한 임시 폰트는 이미지로 바꿔 어디서나 동일하게 보이도록)
       3) 고해상도 원본 PNG (인쇄/다운로드용)
     - 세 가지 모두 IndexedDB에 담아 시안보기 페이지(sian.html)로 넘기고,
       현재 쿼리(count/width/height 등)도 그대로 이어서 전달함. (sessionStorage는
       도메인당 5~10MB로 한도가 낮아 고해상도 이미지 여러 장을 담기엔 부족해서,
       한도가 훨씬 넉넉한 IndexedDB로 교체함 — 같은 브라우저의 같은 사이트끼리는
       페이지를 이동해도 그대로 읽을 수 있음)
  ============================================================ */
  const PREVIEW_STORAGE_KEY = 'ecogr_preview_designs';       // sian.html이 그대로 읽는 키(포맷 동일: [{label, dataUrl}])
  const ORIGINAL_SVG_KEY = 'ecogr_original_svgs';            // [{label, svg}]
  const SIAN_PAGE_URL = 'sian';

  // switchTo()와 달리 히스토리 리셋 등 부수효과 없이, 내보내기 목적으로만 조용히 화면을 바꿔줌
  function loadDesignForExport(idx, side){
    return new Promise((resolve) => {
      loadCanvasObjects(designData[idx][side], () => {
        guideRect.visible = false; outerGuideRect.visible = false; gridGuide.visible = false;
        canvas.discardActiveObject();
        canvas.renderAll();
        resolve();
      });
    });
  }

  const floatingSaveBtn = document.getElementById('floatingSaveBtn');
  floatingSaveBtn.addEventListener('click', async () => {
    if (designData[currentIdx]) designData[currentIdx][currentSide] = serializeCurrentCanvas();

    // 1) 건수/앞뒤면 누락 검사 — 캔버스를 건드리기 전에 저장된 데이터만으로 빠르게 확인
    const sidesToCheck = isDouble ? ['front', 'back'] : ['front'];
    const missingLabels = [];
    for (let i = 0; i < count; i++) {
      for (const side of sidesToCheck) {
        const data = designData[i][side];
        const hasContent = data && Array.isArray(data.objects) && data.objects.length > 0;
        if (!hasContent) {
          missingLabels.push(`디자인 ${i + 1}` + (isDouble ? (side === 'front' ? ' 앞면' : ' 뒷면') : ''));
        }
      }
    }
    if (missingLabels.length > 0) {
      alert('아직 작업되지 않은 디자인이 있습니다.\n\n' + missingLabels.join('\n') + '\n\n모든 디자인을 작업해주세요.');
      return;
    }

    const originalBtnText = floatingSaveBtn.textContent;
    floatingSaveBtn.disabled = true;

    const originalIdx = currentIdx;
    const originalSide = currentSide;
    const wasBoxVisible = guideRect.visible, wasGridVisible = gridGuide.visible;

    const previews = [];
    const svgs = [];

    // 오브젝트 하나가 캔버스 전체(붉은선 바깥 회색선, 즉 도련까지)를 덮고 있는지 확인
    function isFullyBled(){
      const tol = 1; // 부동소수점 오차 허용
      return canvas.getObjects().some((o) => {
        if (o.isGuide) return false;
        const r = o.getBoundingRect(true, true);
        return r.left <= tol && r.top <= tol &&
          (r.left + r.width) >= (CANVAS_W - tol) &&
          (r.top + r.height) >= (CANVAS_H - tol);
      });
    }

    try {
      const sides = isDouble ? ['front', 'back'] : ['front'];
      for (let i = 0; i < count; i++) {
        for (const side of sides) {
          const label = `디자인 ${i + 1}` + (isDouble ? (side === 'front' ? ' 앞면' : ' 뒷면') : '');
          floatingSaveBtn.textContent = `${label} 확인 중...`;
          await loadDesignForExport(i, side);

          // 2) 회색선(도련)까지 이미지가 채워졌는지 검사
          if (!isFullyBled()) {
            alert(`${label} — 바탕이미지를 붉은선 밖 회색선까지 이미지를 채워주세요.`);
            await loadDesignForExport(originalIdx, originalSide);
            guideRect.visible = wasBoxVisible; outerGuideRect.visible = wasBoxVisible; gridGuide.visible = wasGridVisible;
            canvas.renderAll();
            renderTabs();
            return;
          }

          floatingSaveBtn.textContent = `${label} 준비 중...`;
          const multiplier = Math.max(1 / zoom, 4);

          // 1) 고해상도 JPEG — 시안 미리보기와 인쇄용 원본을 겸함 (PNG는 무손실이라
          //    용량이 너무 커서 sessionStorage 한도를 쉽게 넘겨버려 JPEG로 통일함)
          const jpegDataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.95, multiplier });
          previews.push({ label, dataUrl: jpegDataUrl });

          // 3) 원본 SVG — PNG/JPG 내보내기와 동일하게 임시 폰트만 이미지로 바꿔서 뽑음
          const flattened = await buildFontFlattenedClone();
          const svgString = flattened.toSVG();
          flattened.dispose();
          svgs.push({ label, svg: svgString });
        }
      }

      // 원래 보고 있던 디자인/면으로 복원
      await loadDesignForExport(originalIdx, originalSide);
      guideRect.visible = wasBoxVisible; outerGuideRect.visible = wasBoxVisible; gridGuide.visible = wasGridVisible;
      canvas.renderAll();
      renderTabs();

      // 넘길 데이터 총량이 500MB를 넘지 않는지 확인 (R2 업로드 한도와 동일하게 맞춤)
      const totalBytes =
        previews.reduce((sum, item) => sum + estimateDataUrlBytes(item.dataUrl), 0) +
        svgs.reduce((sum, item) => sum + (item.svg ? item.svg.length : 0), 0);
      if (totalBytes > MAX_TRANSFER_BYTES) {
        alert('전달할 시안 데이터 용량이 500MB를 초과합니다.\n디자인 수를 줄이거나 이미지를 단순화해서 다시 시도해주세요. (현재 약 ' + (totalBytes / 1024 / 1024).toFixed(0) + 'MB)');
        return;
      }

      try {
        await idbSet(PREVIEW_STORAGE_KEY, previews);
        await idbSet(ORIGINAL_SVG_KEY, svgs);
      } catch (storageErr) {
        console.error('시안 데이터 저장 실패:', storageErr);
        alert('시안 데이터를 저장하지 못했습니다. 브라우저 저장 공간이 가득 찼을 수 있습니다.');
        return;
      }

      // 현재 쿼리(count/width/height 등)를 그대로 이어서 시안보기 페이지로 이동
      window.location.href = SIAN_PAGE_URL + window.location.search;

    } catch (err) {
      console.error(err);
      alert('시안 생성 중 오류가 발생했습니다.');
    } finally {
      floatingSaveBtn.disabled = false;
      floatingSaveBtn.textContent = originalBtnText;
    }
  });

  /* ============================================================
     13. 프로젝트 저장 / 불러오기
     — 쿼리로 전달받은 orderData, 건수(count), 단면/양면 여부,
       디자인별 앞/뒤 내용을 모두 하나의 JSON에 담아 그대로 전달합니다.
  ============================================================ */
  // 저장 전용 데이터(JSON) 한 면을 검사해서, 업로드한(임시) 폰트를 쓴 텍스트가 있으면
  // 이미지로 바꿔치기한 새 데이터를 돌려줌 (원본 designData는 건드리지 않음 — 계속 편집 가능하도록)
  function flattenSideDataForSave(data){
    return new Promise((resolve) => {
      if (!data || !data.objects || !data.objects.length) { resolve(data); return; }
      const hasCustom = data.objects.some(o => isTextObject(o) && isCustomFontName(o.fontFamily));
      if (!hasCustom) { resolve(data); return; }

      fabric.util.enlivenObjects(data.objects, (enlivened) => {
        const results = new Array(enlivened.length);
        let remaining = enlivened.length;
        if (remaining === 0) { resolve({ objects: [], background: data.background }); return; }
        enlivened.forEach((obj, idx) => {
          if (isTextObject(obj) && isCustomFontName(obj.fontFamily)) {
            results[idx] = rasterizeTextObjectToImageJSON(obj);
          } else {
            results[idx] = obj.toObject(getCustomObjectProps());
          }
          remaining--;
          if (remaining === 0) resolve({ objects: results, background: data.background });
        });
      });
    });
  }

  // 프로젝트 JSON 데이터를 만드는 공용 로직 — "저장" 버튼과 "자동저장" 둘 다 이걸 재사용함.
  async function buildProjectExportData(){
    designData[currentIdx][currentSide] = serializeCurrentCanvas();
    // 업로드한 폰트를 쓴 디자인이 있다면, 저장용으로만 텍스트를 이미지로 바꿔서 내보냄
    const exportDesignData = [];
    for (let i = 0; i < designData.length; i++) {
      const front = await flattenSideDataForSave(designData[i].front);
      const back = await flattenSideDataForSave(designData[i].back);
      exportDesignData.push({ front, back });
    }
    return {
      type: 'svg-editor-project',
      version: 1,
      savedAt: new Date().toISOString(),
      orderData,          // 쿼리로 전달받은 모든 파라미터를 그대로 보존
      count,
      isDouble,
      ratioW, ratioH,
      canvasWidth: CANVAS_W,
      canvasHeight: CANVAS_H,
      designNames,
      designData: exportDesignData,
      // 참고용 배경사진(미관용) — json 저장/불러오기·갤러리 템플릿에는 같이 담기지만,
      // PNG/JPG/SVG 등 실제 인쇄용 내보내기 쪽 코드에서는 일부러 아예 참조하지 않음
      bgReferenceImages: EP.getBgReferenceImagesForSave ? EP.getBgReferenceImagesForSave() : null
    };
  }

  document.getElementById('saveProjectBtn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveProjectBtn');
    const hasAnyCustomFont = customFontNames.size > 0;
    saveBtn.disabled = true;
    const originalLabel = saveBtn.textContent;
    if (hasAnyCustomFont) saveBtn.textContent = '이미지로 변환 중...';

    const project = await buildProjectExportData();
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    download(url, `www.ecogr.net-design-project-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  });

  /* ============================================================
     자동저장 — 켜면 파일 저장 위치를 한 번만 물어보고(브라우저 저장창), 그 뒤로는
     10초마다 한 번씩 그 "같은 파일"에 조용히 덮어써서 저장함. 저장됐다는 표시는 따로
     안 띄움(요청대로). File System Access API(showSaveFilePicker)를 지원하는 브라우저
     (크롬·엣지 등)에서만 동작 가능 — 이 API라야 매번 다운로드 창을 띄우지 않고 같은
     파일에 조용히 계속 덮어쓸 수 있음(일반 다운로드 방식은 10초마다 파일이 새로 쌓이거나
     매번 알림이 떠서 이 요청에 안 맞음).
  ============================================================ */
  const autoSaveToggleBtn = document.getElementById('autoSaveToggleBtn');
  const AUTOSAVE_ORIGINAL_LABEL = '🔄 자동저장';
  const AUTOSAVE_ON_LABEL = '✅ 자동저장';
  let autoSaveFileHandle = null;
  let autoSaveTimer = null;

  async function writeAutoSaveFile(){
    if (!autoSaveFileHandle) return;
    try {
      const project = await buildProjectExportData();
      const writable = await autoSaveFileHandle.createWritable();
      await writable.write(JSON.stringify(project));
      await writable.close();
    } catch (err) {
      // 사용자가 나중에 권한을 취소했거나 파일이 없어졌거나 등 — 화면에 따로 알리지 않고
      // (요청대로 "저장됐다는 표시"는 물론 실패 표시도 조용히 넘어감) 자동저장만 꺼둠
      console.error('자동저장 실패:', err);
      stopAutoSave();
    }
  }

  function stopAutoSave(){
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    autoSaveFileHandle = null;
    autoSaveToggleBtn.textContent = AUTOSAVE_ORIGINAL_LABEL;
    autoSaveToggleBtn.classList.remove('on');
  }

  autoSaveToggleBtn.addEventListener('click', async () => {
    if (autoSaveTimer) { stopAutoSave(); return; } // 이미 켜져있으면 다시 눌러서 끔

    if (typeof window.showSaveFilePicker !== 'function') {
      alert('이 브라우저에서는 자동저장을 쓸 수 없어요. 크롬(Chrome)이나 엣지(Edge) 최신 버전에서 이용해주세요.');
      return;
    }
    try {
      autoSaveFileHandle = await window.showSaveFilePicker({
        suggestedName: 'www.ecogr.net-design-autosave.json',
        types: [{ description: 'JSON 프로젝트 파일', accept: { 'application/json': ['.json'] } }]
      });
    } catch (err) {
      return; // 사용자가 파일 선택을 취소한 경우 — 조용히 아무 것도 안 함
    }
    autoSaveToggleBtn.textContent = AUTOSAVE_ON_LABEL; // 체크 표시로 활성화 상태를 보여줌
    autoSaveToggleBtn.classList.add('on');
    writeAutoSaveFile(); // 켜자마자 한 번 바로 저장해두고, 그 뒤로 10초마다 반복
    autoSaveTimer = setInterval(writeAutoSaveFile, 10000);
  });


  // 저장 당시 캔버스 크기(project.canvasWidth/Height)와 지금 이 세션의 캔버스 크기(CANVAS_W/H)가
  // 다르면(예: 저장할 때보다 브라우저 창이 좁아서 캔버스가 더 작게 잡힌 경우 등), 오브젝트들의
  // 절대좌표(left/top)와 크기(scaleX/scaleY)가 예전 캔버스 기준 그대로라 지금 캔버스에서는
  // 왼쪽 위 한쪽으로 쏠려 보이게 됨. 그 비율만큼 전부 다시 스케일링해서 항상 캔버스에 꽉 차게 맞춤.
  function rescaleSideDataToCurrentCanvas(data, savedW, savedH){
    if (!data || !data.objects || !data.objects.length) return data;
    if (!savedW || !savedH) return data; // 옛날 버전으로 저장돼서 크기 정보가 없는 파일은 그대로 둠
    const scale = CANVAS_W / savedW;
    if (!isFinite(scale) || Math.abs(scale - 1) < 0.001) return data; // 크기가 사실상 같으면 손댈 필요 없음
    const scaledObjects = data.objects.map(o => {
      const co = Object.assign({}, o);
      if (typeof co.left === 'number') co.left = co.left * scale;
      if (typeof co.top === 'number') co.top = co.top * scale;
      if (typeof co.scaleX === 'number') co.scaleX = co.scaleX * scale;
      if (typeof co.scaleY === 'number') co.scaleY = co.scaleY * scale;
      return co;
    });
    return { objects: scaledObjects, background: data.background };
  }

  // 프로젝트 JSON(파일로 직접 열었든, URL 쿼리로 가져왔든)을 캔버스에 적용하는 공용 로직.
  // ※ project.designData 안의 각 항목은 loadCanvasObjects가 기대하는 { objects, background }
  //   형태여야 함(저장 시 saveProjectBtn이 만드는 포맷과 동일).
  function applyProjectData(project, onDone){
    if (project && project.designData) {
      const savedW = project.canvasWidth, savedH = project.canvasHeight;
      for (let i = 0; i < Math.min(count, project.designData.length); i++) {
        const d = project.designData[i] || {};
        designData[i] = {
          front: rescaleSideDataToCurrentCanvas(d.front, savedW, savedH),
          back: rescaleSideDataToCurrentCanvas(d.back, savedW, savedH)
        };
        if (project.designNames && project.designNames[i] != null) {
          designNames[i] = project.designNames[i];
        }
      }
    }
    // ⚠️ 참고용 배경사진(bgReferenceImages)은 여기서 자동으로 복원하지 않음 — 이걸 켜두면
    // ?project=... 쿼리로 자동 불러오기될 때(=페이지 열릴 때마다)나 "프로젝트 불러오기" 시
    // 레이아웃이 아직 안 잡힌 상태에서 이미지가 나타났다 자리를 잡는 과정이 "깜빡임"으로
    // 보이는 문제가 있었음(실제로 templates 폴더의 저장된 json에 배경이미지가 들어있어서
    // 페이지 열 때마다 재현됐음). "저장"할 때는 계속 json에 같이 담아두되(내보내기 쪽은
    // 안 건드림), 자동으로 다시 보여주는 것만 꺼서 문제를 확실히 없앰. 필요하면 사용자가
    // 직접 "🖼 배경사진 호출" 버튼으로 다시 불러오면 됨.
    currentIdx = 0; currentSide = 'front';
    loadCanvasObjects(designData[currentIdx][currentSide], () => {
      resetHistory();
      renderTabs();
      if (onDone) onDone();
    });
  }

  document.getElementById('projectInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try {
        const project = JSON.parse(ev.target.result);
        applyProjectData(project);
      } catch (err) {
        alert('프로젝트 파일을 여는 중 문제가 발생했습니다. 파일 형식을 확인해주세요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ============================================================
     13-1. URL 쿼리로 프로젝트 JSON을 지정해서 시작 시 자동으로 불러오기
     예) editor.html?project=https://example.com/mymy.json
     - "project" 쿼리에 JSON 파일의 URL을 넣어두면, 편집기가 열리자마자 그 파일을 fetch해서
       그대로 편집 상태로 올려놓음. 에디터 소스 자체에는 어떤 프로젝트 데이터도 들어있지 않고
       매번 그 URL의 최신 내용을 받아오므로, 편집기 파일 용량은 그대로 작게 유지하면서
       쿼리의 project 값만 바꿔서 서로 다른 저장물을 열 수 있음.
     - project JSON을 올려두는 서버(또는 스토리지)가 CORS(Access-Control-Allow-Origin)를
       허용해야 브라우저에서 fetch가 성공함. 같은 도메인에 두거나, CORS를 허용하는 스토리지
       (예: 대부분의 공개 오브젝트 스토리지·CDN)를 쓰면 됨.
  ============================================================ */
  if (orderData.project) {
    fetch(orderData.project)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(project => applyProjectData(project))
      .catch(err => {
        console.error('프로젝트 자동 불러오기 실패:', err);
        alert('URL로 지정된 프로젝트 파일을 불러오지 못했습니다.\n(' + (err && err.message ? err.message : err) + ')');
      });
  }

  /* ============================================================
     14. 속성 패널 — 선택 오브젝트에 따라 표시 전환
  ============================================================ */
  const sidePanelEl = document.getElementById('sidePanel');
  const noSelectionSection = document.getElementById('noSelectionSection');
  const selectionSections = document.getElementById('selectionSections');
  const selectToolBtn = document.getElementById('selectToolBtn');
  const textSection = document.getElementById('textSection');
  const shapeSection = document.getElementById('shapeSection');
  const fillColorRow = document.getElementById('fillColorRow');
  const fillColorHueRow = document.getElementById('fillColorHueRow');
  const imageSection = document.getElementById('imageSection');

  const textContentInput = document.getElementById('textContentInput');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const fontSizeGauge = document.getElementById('fontSizeGauge');
  const textColorInput = document.getElementById('textColorInput');
  const textColorHueSlider = document.getElementById('textColorHueSlider');
  const textColorVariedBrightBtn = document.getElementById('textColorVariedBrightBtn');
  const textColorVariedMediumBtn = document.getElementById('textColorVariedMediumBtn');
  const textColorVariedDarkBtn = document.getElementById('textColorVariedDarkBtn');
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const alignLeftBtn = document.getElementById('alignLeftBtn');
  const alignCenterBtn = document.getElementById('alignCenterBtn');
  const alignRightBtn = document.getElementById('alignRightBtn');

  const fillColorInput = document.getElementById('fillColorInput');
  const fillColorHueSlider = document.getElementById('fillColorHueSlider');
  const fillColorVariedRow = document.getElementById('fillColorVariedRow');
  const fillColorVariedBrightBtn = document.getElementById('fillColorVariedBrightBtn');
  const fillColorVariedMediumBtn = document.getElementById('fillColorVariedMediumBtn');
  const fillColorVariedDarkBtn = document.getElementById('fillColorVariedDarkBtn');
  const strokeColorInput = document.getElementById('strokeColorInput');
  const strokeWidthInput = document.getElementById('strokeWidthInput');

  const opacityInput = document.getElementById('opacityInput');
  const angleInput = document.getElementById('angleInput');
  const imgBrightnessInput = document.getElementById('imgBrightnessInput');
  const imgContrastInput = document.getElementById('imgContrastInput');
  const imgSaturationInput = document.getElementById('imgSaturationInput');

  /* ============================================================
     14b. CMYK 색상 선택기
     - 화면(모니터)과 캔버스는 물리적으로 RGB로만 그려지기 때문에,
       "완전한 CMYK 렌더링"은 브라우저에서 불가능합니다.
     - 대신 색을 고를 때 RGB 슬라이더가 아니라 인쇄 기준인
       C/M/Y/K(%) 슬라이더로 지정하도록 하고, 화면 표시용으로만
       RGB로 자동 변환합니다 (모든 색상 입력을 이 방식으로 통일).
  ============================================================ */
  function cmykToRgb(c, m, y, k){
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k))
    };
  }
  function rgbToCmyk(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
    return {
      c: (1 - r - k) / (1 - k),
      m: (1 - g - k) / (1 - k),
      y: (1 - b - k) / (1 - k),
      k
    };
  }
  function hexToRgb(hex){
    let h = (hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const num = parseInt(h, 16) || 0;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbToHex(r, g, b){
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function hsvToRgb(h, s, v){
    h = ((h % 360) + 360) % 360 / 60;
    const i = Math.floor(h);
    const f = h - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  function rgbToHsv(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max, d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, v };
  }
  // hex 색상에서 색조(hue, 0~360)값만 뽑아냄 — 우측 패널의 "색상 조절 막대" 초기 위치를 잡는 데 씀
  function colorToHue(hex){
    const rgb = hexToRgb(hex);
    return rgbToHsv(rgb.r, rgb.g, rgb.b).h;
  }
  // 지금 색의 채도·명도는 그대로 두고 색조(hue)만 newHue로 바꾼 새 hex 색상을 만듦
  // — 색상 조절 막대를 움직였을 때 "톤은 유지한 채 색만 휙 바뀌는" 느낌을 주기 위함
  function hueShiftedColor(hex, newHue){
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // 색이 거의 무채색(회색·흰색·검정)이면 채도가 0이라 색조를 돌려도 눈에 안 보이므로,
    // 이 경우엔 적당한 채도·명도를 줘서 막대를 움직이면 실제로 색이 나타나게 함
    const s = hsv.s < 0.05 ? 0.75 : hsv.s;
    const v = hsv.v < 0.15 ? 0.85 : hsv.v;
    const newRgb = hsvToRgb(newHue, s, v);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
  }
  // "다양한 컬러" 모드용 — 채도·명도를 매번 랜덤으로 붙여서 색조 막대를 움직일 때마다
  // 색이 다채롭게(생기 있게) 나오게 함. 너무 탁하거나 너무 어둡지 않도록 범위를 제한함.
  // "다양한 컬러" 3단계 모드별 채도(S)·명도(V) 랜덤 범위
  //  - bright(밝은): 채도 0~100%, 명도 72~100% — 파스텔~밝은 원색 위주(칙칙한 색 배제)
  //  - medium(중간): 채도 55~100%, 명도 55~95% — 맨 처음 만들었던 쨍한 원색 위주 설정
  //  - dark(어두운): 채도 0~100%, 명도 6~100% — 어둡고 차분한 톤도 자주 섞여 나오는 설정
  const VARIED_COLOR_RANGES = {
    bright: { sMin: 0, sSpread: 1, vMin: 0.72, vSpread: 0.28 },
    medium: { sMin: 0.55, sSpread: 0.45, vMin: 0.55, vSpread: 0.4 }
  };
  // "어두운" 모드 전용 — K(먹판) 값이 균등 분포가 아니라 가중치를 둔 분포로 나오게 함:
  //  - K 45~60% : 60% 확률 (가장 자주 나오는 "적당히 어두운" 구간)
  //  - K 60~70% : 30% 확률 (더 진한 톤)
  //  - 나머지(45% 미만 또는 70% 초과, 20~90% 안에서) : 10% 확률 (가끔 섞이는 변주)
  // K = 1 - 명도(V) 관계를 이용해서 K% 값을 뽑은 뒤 V로 환산함.
  function pickDarkVByWeightedK(){
    const roll = Math.random();
    let kPercent;
    if (roll < 0.6) {
      kPercent = 45 + Math.random() * 15; // 45~60%
    } else if (roll < 0.9) {
      kPercent = 60 + Math.random() * 10; // 60~70%
    } else if (Math.random() < 0.5) {
      kPercent = 20 + Math.random() * 25; // 나머지 중 절반: 20~45%(더 밝은 쪽)
    } else {
      kPercent = 70 + Math.random() * 20; // 나머지 중 절반: 70~90%(더 어두운 쪽)
    }
    return 1 - kPercent / 100;
  }
  // "밝은" 모드 전용 — 뽑힌 색의 CMYK(C+M+Y+K, 퍼센트 합) 값이 50 미만으로 나올 확률이
  // 정확히 50%가 되도록 함. 그냥 채도·명도를 균등 랜덤으로 뽑으면 이 범위에서는 자연히
  // 약 25%만 50 미만이 나오길래, "50 미만을 원하는지/50 이상을 원하는지"를 먼저 동전 던지듯
  // 반반 정하고, 그 목표에 맞는 색이 나올 때까지 다시 뽑는 방식(거부 샘플링)으로 정확히
  // 맞춤 — 채도·명도 자체의 범위(0~100%, 72~100%)는 그대로 유지됨.
  function pickBrightColor(newHue){
    const wantLow = Math.random() < 0.5;
    for (let attempt = 0; attempt < 40; attempt++) {
      const s = Math.random();
      const v = 0.72 + Math.random() * 0.28;
      const rgb = hsvToRgb(newHue, s, v);
      const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
      const sum = (cmyk.c + cmyk.m + cmyk.y + cmyk.k) * 100;
      if ((wantLow && sum < 50) || (!wantLow && sum >= 50)) return rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    // 40번 안에 목표를 못 맞추면(거의 없음) 마지막으로 뽑은 값을 그냥 씀
    const rgb = hsvToRgb(newHue, Math.random(), 0.72 + Math.random() * 0.28);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  function randomizedHueColor(newHue, mode){
    if (mode === 'bright') return pickBrightColor(newHue);
    let s, v;
    if (mode === 'dark') {
      s = Math.random();
      v = pickDarkVByWeightedK();
    } else {
      const range = VARIED_COLOR_RANGES[mode] || VARIED_COLOR_RANGES.bright;
      s = range.sMin + Math.random() * range.sSpread;
      v = range.vMin + Math.random() * range.vSpread;
    }
    const rgb = hsvToRgb(newHue, s, v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  // CMYK 컬러 팝오버가 화면(뷰포트) 밖으로 벗어나지 않게 좌우/상하 위치를 보정함.
  // - 가로: 오른쪽으로 넘치면 스와치 오른쪽 끝에 맞춰 왼쪽으로 당기고, 그래도 넘치면 화면 안쪽으로 클램프
  // - 세로: 스와치 아래쪽에 붙일 공간이 부족하면 스와치 위쪽으로 띄우고, 그래도 부족하면 화면 안쪽으로 클램프
  function positionCmykPopover(popover, anchorEl){
    const margin = 8;
    const r = anchorEl.getBoundingClientRect();
    const pw = popover.offsetWidth || 210;
    const ph = popover.offsetHeight || 320;

    let left = r.left;
    if (left + pw > window.innerWidth - margin) left = r.right - pw;
    left = Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - pw - margin));

    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - margin) {
      const above = r.top - 6 - ph;
      top = above >= margin ? above : (r.bottom + 6); // 위쪽도 부족하면 일단 아래쪽 기준으로 두고 다음 줄에서 최종 클램프
    }
    top = Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - ph - margin));

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    // T/J/K 팝업과 똑같이, 캔버스 회전 각도에 맞춰 이 색상 선택창도 같이 회전 표시함
    // (요청: "이 색상선택창도 T나 J K 인터페이스처럼 회전각도에 맞게 열리게 해줘")
    if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(popover);
  }

  function initCmykPicker(el){
    let currentHex = '#000000';
    let hue = 0, sat = 0, val = 0; // 시각적 선택 영역(SV 사각형 + 색상 띠)용 내부 상태

    const swatch = document.createElement('div');
    swatch.className = 'cmyk-swatch';
    el.appendChild(swatch);

    const popover = document.createElement('div');
    popover.className = 'cmyk-popover hidden';
    popover.innerHTML =
      `<canvas class="cmyk-sv" width="186" height="100"></canvas>` +
      `<canvas class="cmyk-hue" width="186" height="14"></canvas>` +
      [['c', 'C'], ['m', 'M'], ['y', 'Y'], ['k', 'K']].map(([ch, label]) =>
        `<div class="cmyk-row"><label>${label}</label><input type="range" min="0" max="100" value="${ch === 'k' ? 100 : 0}" data-ch="${ch}"><span data-out="${ch}">${ch === 'k' ? 100 : 0}</span></div>`
      ).join('') +
      `<div class="cmyk-hexline">
         <span class="cmyk-hex-swatch"></span>
         <input type="text" class="cmyk-hex-input" maxlength="7" spellcheck="false">
       </div>
       <div class="cmyk-values-line"></div>`;
    // 팝업을 el(색상칸) 안이 아니라 document.body에 직접 붙임 — el이 우측 속성 패널처럼
    // CSS zoom(PC에서 1.3배 확대)이 걸린 조상 안에 있으면, position:fixed로 계산해서 넣은
    // left/top 픽셀값이 그 zoom 배율만큼 다시 한번 곱해져서 화면 밖으로 팝업이 튕겨나가는
    // 문제가 있었음(그래서 "색상 선택창이 안 뜬다"처럼 보였음). body에 직접 붙이면 그런
    // 조상 zoom의 영향을 전혀 안 받아서 항상 계산한 그대로 정확한 화면 위치에 뜸.
    document.body.appendChild(popover);
    el._cmykPopover = popover; // 다른 파일(예: ecopro3mobiletools.js)에서 이 색상칸의 팝업을 찾아 버튼 등을 덧붙일 수 있게 참조를 남겨둠
    if (EP.registerRotatablePopover) EP.registerRotatablePopover(popover); // 열려있는 채로 캔버스를 회전해도 즉시 같이 재회전됨

    const svCanvas = popover.querySelector('.cmyk-sv');
    const hueCanvas = popover.querySelector('.cmyk-hue');
    const svCtx = svCanvas.getContext('2d');
    const hueCtx = hueCanvas.getContext('2d');
    const SV_W = svCanvas.width, SV_H = svCanvas.height;
    const HUE_W = hueCanvas.width, HUE_H = hueCanvas.height;

    const sliders = {
      c: popover.querySelector('[data-ch="c"]'),
      m: popover.querySelector('[data-ch="m"]'),
      y: popover.querySelector('[data-ch="y"]'),
      k: popover.querySelector('[data-ch="k"]')
    };
    const outs = {
      c: popover.querySelector('[data-out="c"]'),
      m: popover.querySelector('[data-out="m"]'),
      y: popover.querySelector('[data-out="y"]'),
      k: popover.querySelector('[data-out="k"]')
    };
    const hexSwatch = popover.querySelector('.cmyk-hex-swatch');
    const hexInput = popover.querySelector('.cmyk-hex-input');
    const valuesLine = popover.querySelector('.cmyk-values-line');

    function drawHueStrip(){
      const grad = hueCtx.createLinearGradient(0, 0, HUE_W, 0);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
      hueCtx.fillStyle = grad;
      hueCtx.fillRect(0, 0, HUE_W, HUE_H);
      // 현재 색상(hue) 위치 표시
      const x = (hue / 360) * HUE_W;
      hueCtx.strokeStyle = '#fff';
      hueCtx.lineWidth = 2;
      hueCtx.strokeRect(Math.max(0, Math.min(HUE_W - 3, x - 1.5)), 0, 3, HUE_H);
      hueCtx.strokeStyle = 'rgba(0,0,0,.3)';
      hueCtx.lineWidth = 1;
      hueCtx.strokeRect(Math.max(0, Math.min(HUE_W - 3, x - 1.5)) + 0.5, 0.5, 2, HUE_H - 1);
    }

    // 색상 선택이 금지된 삼각형 영역 (SV 사각형 우측 상단 모서리를 흰색으로 막음)
    // — 색상띠(hue)가 "이 지점" 구간에 있을 때만 나타나고, 벗어나면 사라져서 다시 선택 가능해집니다.
    const BLOCK_TRI_W_FRAC = 0.35; // 오른쪽 끝에서부터 차지하는 폭 비율
    const BLOCK_TRI_H_FRAC = 0.5;  // 위쪽 끝에서부터 차지하는 높이 비율
    const HUE_TRIGGER_MIN = 75;    // "이 지점" 구간 시작 (색상띠, 0~360)
    const HUE_TRIGGER_MAX = 203;   // "이 지점" 구간 끝 (우측으로 3.2배 확장: 폭 40°→128°)
    function isHueInTriggerZone(){
      return hue >= HUE_TRIGGER_MIN && hue <= HUE_TRIGGER_MAX;
    }
    function isInBlockedTriangle(x, y){
      if (!isHueInTriggerZone()) return false;
      const triW = SV_W * BLOCK_TRI_W_FRAC;
      const triH = SV_H * BLOCK_TRI_H_FRAC;
      if (y < 0 || y > triH) return false;
      const boundaryX = (SV_W - triW) + (y / triH) * triW;
      return x >= boundaryX;
    }

    function drawSvSquare(){
      svCtx.fillStyle = `hsl(${hue},100%,50%)`;
      svCtx.fillRect(0, 0, SV_W, SV_H);
      const whiteGrad = svCtx.createLinearGradient(0, 0, SV_W, 0);
      whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
      whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
      svCtx.fillStyle = whiteGrad;
      svCtx.fillRect(0, 0, SV_W, SV_H);
      const blackGrad = svCtx.createLinearGradient(0, 0, 0, SV_H);
      blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
      blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
      svCtx.fillStyle = blackGrad;
      svCtx.fillRect(0, 0, SV_W, SV_H);

      // 선택 금지 삼각형: 색상띠가 "이 지점" 구간일 때만 흰색으로 덮어서 표시
      if (isHueInTriggerZone()) {
        const triW = SV_W * BLOCK_TRI_W_FRAC, triH = SV_H * BLOCK_TRI_H_FRAC;
        svCtx.beginPath();
        svCtx.moveTo(SV_W - triW, 0);
        svCtx.lineTo(SV_W, 0);
        svCtx.lineTo(SV_W, triH);
        svCtx.closePath();
        svCtx.fillStyle = '#ffffff';
        svCtx.fill();
        svCtx.strokeStyle = 'rgba(0,0,0,.15)';
        svCtx.lineWidth = 1;
        svCtx.stroke();
      }

      // 현재 채도/명도 위치에 원형 커서 표시
      const cx = sat * SV_W, cy = (1 - val) * SV_H;
      svCtx.beginPath();
      svCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      svCtx.strokeStyle = '#fff';
      svCtx.lineWidth = 2;
      svCtx.stroke();
      svCtx.beginPath();
      svCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      svCtx.strokeStyle = 'rgba(0,0,0,.35)';
      svCtx.lineWidth = 1;
      svCtx.stroke();
    }

    // 피커 위치가 (색상띠 이동 등으로) 가려진 삼각형 안에 들어가면,
    // 그 삼각형의 대각선(빗변) 가운데 지점으로 자동으로 옮겨서
    // 가려져서 안 보이는 색이 그대로 선택된 채로 남아있지 않게 함
    function clampSvOutOfBlockedZone(){
      if (!isHueInTriggerZone()) return false;
      const x = sat * SV_W, y = (1 - val) * SV_H;
      if (!isInBlockedTriangle(x, y)) return false;
      const triW = SV_W * BLOCK_TRI_W_FRAC, triH = SV_H * BLOCK_TRI_H_FRAC;
      const midX = SV_W - triW / 2, midY = triH / 2; // 빗변(대각선)의 중앙 지점
      sat = midX / SV_W;
      val = 1 - midY / SV_H;
      return true;
    }

    // CMYK 슬라이더 값을 기준으로 화면(스와치/hex/hue·sv 좌표)을 갱신
    function refreshFromCmyk(dispatch){
      const c = sliders.c.value / 100, m = sliders.m.value / 100, y = sliders.y.value / 100, k = sliders.k.value / 100;
      const { r, g, b } = cmykToRgb(c, m, y, k);
      const hsv = rgbToHsv(r, g, b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      // 가려진 구역으로 들어가는 값이면 refreshFromHsv 안에서 자동으로 보정됨
      refreshFromHsv(dispatch);
    }

    // hue/sat/val(시각적 선택 영역) 기준으로 CMYK 슬라이더와 화면을 갱신
    function refreshFromHsv(dispatch){
      clampSvOutOfBlockedZone();
      const { r, g, b } = hsvToRgb(hue, sat, val);
      currentHex = rgbToHex(r, g, b);
      const cmyk = rgbToCmyk(r, g, b);
      sliders.c.value = Math.round(cmyk.c * 100);
      sliders.m.value = Math.round(cmyk.m * 100);
      sliders.y.value = Math.round(cmyk.y * 100);
      sliders.k.value = Math.round(cmyk.k * 100);

      swatch.style.background = currentHex;
      hexSwatch.style.background = currentHex;
      hexInput.value = currentHex.toUpperCase();
      valuesLine.textContent = `C${sliders.c.value} M${sliders.m.value} Y${sliders.y.value} K${sliders.k.value}`;
      Object.keys(outs).forEach(ch => { outs[ch].textContent = sliders[ch].value; });
      drawHueStrip();
      drawSvSquare();
      // 주의: el.value는 아래 Object.defineProperty로 커스텀 setter가 걸려 있어서,
      // 여기서 el.value = currentHex 를 실행하면 그 setter -> refreshFromCmyk -> refreshFromHsv
      // -> 다시 el.value = ... 로 무한 재귀에 빠져 "Maximum call stack size exceeded"가 남.
      // currentHex는 이미 위에서 갱신했고 getter가 그대로 돌려주므로 재대입은 불필요함.
      if (dispatch) el.dispatchEvent(new Event('input'));
    }

    Object.values(sliders).forEach(s => s.addEventListener('input', () => refreshFromCmyk(true)));

    // ---- SV 사각형 클릭/드래그로 채도·명도 선택 ----
    let draggingSv = false;
    function pickSv(clientX, clientY){
      const r = svCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(SV_W, clientX - r.left));
      const y = Math.max(0, Math.min(SV_H, clientY - r.top));
      if (isInBlockedTriangle(x, y)) return; // 이 영역은 선택할 수 없음
      sat = x / SV_W;
      val = 1 - y / SV_H;
      refreshFromHsv(true);
    }
    svCanvas.addEventListener('mousedown', (e) => { draggingSv = true; pickSv(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (draggingSv) pickSv(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { draggingSv = false; });
    svCanvas.addEventListener('mousemove', (e) => {
      const r = svCanvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      svCanvas.style.cursor = isInBlockedTriangle(x, y) ? 'not-allowed' : 'crosshair';
    });
    // 모바일(터치)에서도 PC 마우스 드래그와 똑같이 손가락을 누른 채 움직이며 색을 고를 수 있게
    // touch 이벤트를 mouse 이벤트와 동일한 방식으로 처리함. touchmove에서 preventDefault를
    // 해줘야 손가락을 움직이는 동안 화면이 스크롤되지 않고 색 선택 드래그만 됨.
    svCanvas.addEventListener('touchstart', (e) => {
      draggingSv = true;
      const t = e.touches[0];
      pickSv(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    svCanvas.addEventListener('touchmove', (e) => {
      if (!draggingSv) return;
      const t = e.touches[0];
      pickSv(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    svCanvas.addEventListener('touchend', () => { draggingSv = false; });
    svCanvas.addEventListener('touchcancel', () => { draggingSv = false; });

    // ---- 색상 띠 클릭/드래그로 색상(hue) 선택 ----
    let draggingHue = false;
    function pickHue(clientX){
      const r = hueCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(HUE_W, clientX - r.left));
      hue = (x / HUE_W) * 360;
      refreshFromHsv(true);
    }
    hueCanvas.addEventListener('mousedown', (e) => { draggingHue = true; pickHue(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (draggingHue) pickHue(e.clientX); });
    window.addEventListener('mouseup', () => { draggingHue = false; });
    // 색상 띠도 SV 사각형과 동일하게 터치 드래그 지원
    hueCanvas.addEventListener('touchstart', (e) => {
      draggingHue = true;
      pickHue(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });
    hueCanvas.addEventListener('touchmove', (e) => {
      if (!draggingHue) return;
      pickHue(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });
    hueCanvas.addEventListener('touchend', () => { draggingHue = false; });
    hueCanvas.addEventListener('touchcancel', () => { draggingHue = false; });

    // ---- Hex 직접 입력 ----
    hexInput.addEventListener('change', () => {
      let v = hexInput.value.trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(v) && !/^#?[0-9a-fA-F]{3}$/.test(v)) { hexInput.value = currentHex.toUpperCase(); return; }
      if (v.charAt(0) !== '#') v = '#' + v;
      const { r, g, b } = hexToRgb(v);
      const hsv = rgbToHsv(r, g, b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      refreshFromHsv(true);
    });
    hexInput.addEventListener('click', (e) => e.stopPropagation());
    hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') hexInput.blur(); });

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.cmyk-popover').forEach(p => { if (p !== popover) p.classList.add('hidden'); });
      const willOpen = popover.classList.contains('hidden');
      if (willOpen) {
        popover.classList.remove('hidden'); // 실제 크기를 재려면 먼저 보이는 상태여야 함(가려진 채로는 0으로 측정됨)
        drawHueStrip();
        drawSvSquare();
        positionCmykPopover(popover, swatch);
      } else {
        popover.classList.add('hidden');
      }
    });
    popover.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => popover.classList.add('hidden'));

    Object.defineProperty(el, 'value', {
      get(){ return currentHex; },
      set(hex){
        const { r, g, b } = hexToRgb(hex);
        const { c, m, y, k } = rgbToCmyk(r, g, b);
        sliders.c.value = Math.round(c * 100);
        sliders.m.value = Math.round(m * 100);
        sliders.y.value = Math.round(y * 100);
        sliders.k.value = Math.round(k * 100);
        refreshFromCmyk(false);
      }
    });

    el.value = '#000000';
  }

  initCmykPicker(textColorInput);
  initCmykPicker(fillColorInput);
  initCmykPicker(strokeColorInput);
  initCmykPicker(fontColorSwatch);

  let panelUpdating = false;

  function isTextObject(o){
    return o && (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox');
  }

  // 모양필터(공통 효과를 도형에도 적용) 대상 판별: 표의 셀 박스(isTableCell)도 결국 fabric.Rect라
  // type만으로 자연히 포함됨. 텍스트/가이드선/텍스트가 아닌 것만 골라내는 용도.
  function isShapeObject(o){
    if (!o || o.isGuide || isTextObject(o)) return false;
    return o.type === 'rect' || o.type === 'circle' || o.type === 'triangle' ||
           o.type === 'ellipse' || o.type === 'polygon' || o.type === 'path';
  }

  function updateSelectionPanel(){
    const obj = canvas.getActiveObject();
    sidePanelEl.classList.remove('hidden');
    if (!obj || obj.isGuide) {
      noSelectionSection.classList.remove('hidden');
      selectionSections.classList.add('hidden');
      deleteBtn.disabled = true;
      selectToolBtn.classList.remove('sel-active'); // 우측 패널이 "선택 안 함" 상태 -> 흰색
      return;
    }
    panelUpdating = true;
    noSelectionSection.classList.add('hidden');
    selectionSections.classList.remove('hidden');
    deleteBtn.disabled = false;
    selectToolBtn.classList.add('sel-active'); // 우측 패널에 오브젝트 속성이 뜸 = 선택 활성화 -> 회색

    // 드래그로 여러 오브젝트를 묶어 선택(activeSelection)했거나 "묶기"로 그룹화한 경우,
    // 그 안이 전부 텍스트라면 우측 패널도 "텍스트" 취급해서 뜨게 함(색상·폰트 등을 한 번에
    // 공통 적용할 수 있도록). 섞여있으면(텍스트+도형 등) 기존처럼 도형 패널을 보여줌.
    const isGroupLike = obj.type === 'activeSelection' || obj.type === 'group';
    const groupChildren = isGroupLike ? obj.getObjects().filter(o => !o.isGuide) : [];
    const isMultiTextSelection = isGroupLike && groupChildren.length > 0 && groupChildren.every(isTextObject);
    const textAnchor = isMultiTextSelection ? groupChildren[0] : obj; // 표시값은 첫 번째 선택된 텍스트 기준

    const textLike = isTextObject(obj) || isMultiTextSelection;
    const imageLike = isImageObject(obj);
    textSection.classList.toggle('hidden', !textLike);
    shapeSection.classList.toggle('hidden', textLike);
    imageSection.classList.toggle('hidden', !imageLike);
    fillColorRow.classList.toggle('hidden', imageLike); // 이미지는 채우기색이 의미 없으므로 숨김(테두리는 계속 노출)
    fillColorHueRow.classList.toggle('hidden', imageLike); // 채우기 슬라이더도 같이 숨김
    fillColorVariedRow.classList.toggle('hidden', imageLike); // 다양한 컬러 버튼도 같이 숨김

    if (textLike) {
      // "내용"은 텍스트마다 다른 게 당연하므로, 여러 개를 한꺼번에 선택했을 땐 편집을 막음
      // (그대로 두면 입력한 글자로 선택된 텍스트 전부가 똑같이 덮어써지는 문제가 생김)
      textContentInput.disabled = isMultiTextSelection;
      textContentInput.value = isMultiTextSelection ? '' : (textAnchor.text || '');
      textContentInput.placeholder = isMultiTextSelection ? '텍스트를 여러 개 선택 중 (내용은 개별 수정)' : '더블클릭으로도 수정 가능';
      fontFamilySelect.value = textAnchor.fontFamily || 'Pretendard';
      fontSizeInput.value = Math.round(textAnchor.fontSize || 40);
      fontSizeGauge.value = Math.min(600, Math.max(10, Math.round(textAnchor.fontSize || 40)));
      textColorInput.value = toHex(textAnchor.fill) || '#222222';
      textColorHueSlider.value = Math.round(colorToHue(textColorInput.value));
      boldBtn.classList.toggle('on', textAnchor.fontWeight === 'bold' || textAnchor.fontWeight >= 700);
      italicBtn.classList.toggle('on', textAnchor.fontStyle === 'italic');
      underlineBtn.classList.toggle('on', !!textAnchor.underline);
      [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => b.classList.remove('on'));
      if (textAnchor.textAlign === 'center') alignCenterBtn.classList.add('on');
      else if (textAnchor.textAlign === 'right') alignRightBtn.classList.add('on');
      else alignLeftBtn.classList.add('on');
    } else {
      fillColorInput.value = toHex(obj.fill) || '#3498db';
      fillColorHueSlider.value = Math.round(colorToHue(fillColorInput.value));
      strokeColorInput.value = toHex(obj.stroke) || '#000000';
      strokeWidthInput.value = obj.strokeWidth || 0;
    }

    if (imageLike) {
      imgBrightnessInput.value = Math.round(getImageFilterValue(obj, 'Brightness', 'brightness') * 100);
      imgContrastInput.value = Math.round(getImageFilterValue(obj, 'Contrast', 'contrast') * 100);
      imgSaturationInput.value = Math.round(getImageFilterValue(obj, 'Saturation', 'saturation') * 100);
    }

    opacityInput.value = obj.opacity != null ? obj.opacity : 1;
    angleInput.value = Math.round(obj.angle || 0);
    panelUpdating = false;
  }

  function toHex(c){
    if (!c || typeof c !== 'string') return null;
    if (c.charAt(0) === '#') return c.length === 7 ? c : null;
    const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return '#' + [1,2,3].map(i => parseInt(m[i],10).toString(16).padStart(2,'0')).join('');
  }

  canvas.on('selection:created', updateSelectionPanel);
  canvas.on('selection:updated', updateSelectionPanel);
  canvas.on('selection:cleared', updateSelectionPanel);

  // T 팝업이 열려 있는 동안, 다른 텍스트(또는 다른 텍스트 묶음)를 클릭해서 선택하면
  // 팝업이 자동으로 그 새 텍스트를 붙잡도록 전환 (이전 텍스트는 자동 해제됨)
  function syncFontPopoverToSelection(){
    if (fontPopover.classList.contains('hidden')) return; // 팝업이 닫혀 있으면 그대로 둠
    const active = canvas.getActiveObject();
    const boxes = textBoxesFromTarget(active);
    if (!boxes.length) return; // 텍스트가 아닌 걸 선택했을 땐 팝업을 그대로 유지
    const sameTarget = boxes.length === fontPopoverTargets.length && boxes.every((o, i) => o === fontPopoverTargets[i]);
    if (sameTarget) return;
    openFontPopover(active, { reposition: false });
  }
  canvas.on('selection:created', syncFontPopoverToSelection);
  canvas.on('selection:updated', syncFontPopoverToSelection);
  canvas.on('object:scaling', updateSelectionPanel);
  canvas.on('object:rotating', updateSelectionPanel);
  canvas.on('text:changed', updateSelectionPanel);

  function withActive(fn){
    if (panelUpdating) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.isGuide) return;
    if (obj.type === 'activeSelection' || obj.type === 'group') {
      // fabric의 Group/ActiveSelection은 set()을 호출해도 자식 오브젝트에 전파되지 않으므로
      // (그룹 자체에만 값이 설정돼서 실제로는 아무 변화가 없음), 안의 오브젝트 하나하나에
      // 직접 적용해야 함 — 이렇게 해야 여러 개 선택한 상태에서 색상/폰트 등이 공통 적용됨
      obj.getObjects().forEach(o => { if (!o.isGuide) fn(o); });
    } else {
      fn(obj);
    }
    canvas.renderAll();
  }

  // 글꼴을 바꾼 뒤 캔버스가 새 모양으로 다시 그리도록, 크기를 살짝(-5%) 줄였다가 곧바로
  // 원래 크기로 되돌리는 것만으로 강제 재작성시킴(크기 자체가 바뀌면 캔버스가 그 오브젝트의
  // 캐시를 새로 만들 수밖에 없어서 이전 폰트로 그려졌던 잔상이 확실히 지워짐).
  function forceFontReloadRedraw(boxes, fontFamilyName){
    boxes = boxes.filter(o => isTextObject(o));
    if (!boxes.length) return;
    // 방향키로 폰트를 빠르게 연속으로 넘기면 이 함수가 150ms 안에 여러 번 겹쳐 호출될 수
    // 있는데, 그때마다 "지금(이미 살짝 줄어든) 크기"를 새로운 "원본"으로 잘못 기억해버리면
    // 되돌릴 때마다 조금씩 더 작아지는 문제가 있었음(요청: "키보드로 넘길 때 폰트가 점점
    // 작아지는 버그"). 그래서 "진짜 원본 크기"는 이 트릭이 시작될 때 딱 한 번만 오브젝트에
    // 저장해두고, 그 뒤로 겹쳐 호출돼도 항상 그 진짜 원본을 기준으로만 0.95배 하고, 되돌릴
    // 때도 항상 그 진짜 원본으로 정확히 복귀하도록 함.
    boxes.forEach((o) => {
      if (o.__fontReloadRevertTimer) {
        clearTimeout(o.__fontReloadRevertTimer); // 겹쳐 호출된 경우 이전 되돌리기 타이머만 취소
      } else {
        o.__fontReloadTrueScaleX = o.scaleX;
        o.__fontReloadTrueScaleY = o.scaleY;
      }
      o.set('scaleX', o.__fontReloadTrueScaleX * 0.95);
      o.set('scaleY', o.__fontReloadTrueScaleY * 0.95);
      o.dirty = true;
    });
    canvas.requestRenderAll();
    boxes.forEach((o) => {
      o.__fontReloadRevertTimer = setTimeout(() => {
        o.set('scaleX', o.__fontReloadTrueScaleX);
        o.set('scaleY', o.__fontReloadTrueScaleY);
        o.dirty = true;
        o.__fontReloadRevertTimer = null;
        canvas.requestRenderAll();
      }, 150);
    });
  }

  textContentInput.addEventListener('input', () => withActive(o => { if (isTextObject(o)) o.set('text', textContentInput.value); }));
  // IText는 줄/글자 단위로 개별 스타일(styles)을 따로 가질 수 있는데, 여기에 fontFamily(또는
  // fontWeight)가 박제돼 있으면 오브젝트 전체에 새 폰트를 적용해도 그 줄/글자만 안 바뀜 —
  // "첫 줄만 새 폰트로 바뀌고 나머지 줄은 그대로인" 문제가 정확히 이것 때문이었음. 폰트를
  // 선택할 때는 "이 오브젝트 전체를 이 폰트로" 라는 의도이므로, 남아있는 개별 오버라이드를
  // 전부 지워서 예외 없이 전체가 똑같이 바뀌도록 함.
  function clearPerCharStyleOverrides(obj, props){
    if (!obj.styles) return;
    Object.keys(obj.styles).forEach(function(lineKey){
      var line = obj.styles[lineKey];
      if (!line) return;
      Object.keys(line).forEach(function(charKey){
        var charStyle = line[charKey];
        if (!charStyle) return;
        props.forEach(function(p){ delete charStyle[p]; });
      });
    });
  }

  fontFamilySelect.addEventListener('change', () => {
    const targets = [];
    withActive(o => {
      if (isTextObject(o)) {
        clearPerCharStyleOverrides(o, ['fontFamily', 'fontWeight']);
        o.set('fontFamily', fontFamilySelect.value);
        targets.push(o);
      }
    });
    forceFontReloadRedraw(targets, fontFamilySelect.value);
  });
  fontSizeInput.addEventListener('input', () => {
    const v = Math.max(10, parseInt(fontSizeInput.value, 10) || 10);
    withActive(o => { if (isTextObject(o)) { clearPerCharStyleOverrides(o, ['fontSize']); o.set('fontSize', v); } });
    fontSizeGauge.value = Math.min(600, v); // 숫자로 직접 입력해도 게이지 위치가 같이 따라오게
  });
  fontSizeInput.addEventListener('change', () => { fontSizeInput.value = Math.max(10, parseInt(fontSizeInput.value, 10) || 10); });
  // 크기 조절 게이지(막대) — 움직이는 동안 실시간으로 글자 크기가 바뀌고, 숫자 입력창도 같이 갱신됨
  fontSizeGauge.addEventListener('input', () => {
    const v = Math.max(10, parseInt(fontSizeGauge.value, 10) || 10);
    withActive(o => { if (isTextObject(o)) { clearPerCharStyleOverrides(o, ['fontSize']); o.set('fontSize', v); } });
    fontSizeInput.value = v;
  });
  fontSizeGauge.addEventListener('change', () => pushHistory());
  textColorInput.addEventListener('input', () => withActive(o => { if (isTextObject(o)) { clearPerCharStyleOverrides(o, ['fill']); o.set('fill', textColorInput.value); } }));

  // 색상 조절 막대 — 평소엔 드래그하는 동안 각 오브젝트의 "지금 색"을 기준으로 색조만 바꿔서
  // 적용함(여러 개를 함께 선택했으면 오브젝트마다 원래 채도/명도가 달라도 각자 자기 색 기준으로
  // 바뀜). "밝은/중간/어두운" 중 하나가 켜져 있으면, 그 대신 채도·명도를 매번(움직일 때마다,
  // 그리고 오브젝트마다 각각) 그 모드의 범위 안에서 랜덤으로 붙여서 더 다채로운 색이 나오게 함.
  // 셋 중 하나만 켜질 수 있고(배타적), 켜진 걸 다시 누르면 꺼져서 원래(색조만 유지) 방식으로 돌아감.
  function makeExclusiveVariedToggle(buttons){
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const wasOn = btn.classList.contains('on');
        buttons.forEach(b => b.classList.remove('on'));
        if (!wasOn) btn.classList.add('on');
      });
    });
  }
  function getActiveVariedMode(buttons, modes){
    for (let i = 0; i < buttons.length; i++) { if (buttons[i].classList.contains('on')) return modes[i]; }
    return null;
  }

  const textVariedBtns = [textColorVariedBrightBtn, textColorVariedMediumBtn, textColorVariedDarkBtn];
  const variedModes = ['bright', 'medium', 'dark'];
  makeExclusiveVariedToggle(textVariedBtns);
  textColorHueSlider.addEventListener('input', () => {
    const hue = parseFloat(textColorHueSlider.value) || 0;
    const mode = getActiveVariedMode(textVariedBtns, variedModes);
    withActive(o => {
      if (!isTextObject(o)) return;
      clearPerCharStyleOverrides(o, ['fill']);
      const newHex = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(toHex(o.fill) || '#222222', hue);
      o.set('fill', newHex);
    });
    textColorInput.value = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(textColorInput.value, hue); // 스와치도 같이 갱신
  });
  textColorHueSlider.addEventListener('change', () => pushHistory());

  boldBtn.addEventListener('click', () => withActive(o => { if (!isTextObject(o)) return; clearPerCharStyleOverrides(o, ['fontWeight']); o.set('fontWeight', (o.fontWeight === 'bold' || o.fontWeight >= 700) ? 'normal' : 'bold'); }));
  italicBtn.addEventListener('click', () => withActive(o => { if (!isTextObject(o)) return; clearPerCharStyleOverrides(o, ['fontStyle']); o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic'); }));
  underlineBtn.addEventListener('click', () => withActive(o => { if (!isTextObject(o)) return; clearPerCharStyleOverrides(o, ['underline']); o.set('underline', !o.underline); }));

  alignLeftBtn.addEventListener('click', () => withActive(o => { if (isTextObject(o)) o.set('textAlign', 'left'); }));
  alignCenterBtn.addEventListener('click', () => withActive(o => { if (isTextObject(o)) o.set('textAlign', 'center'); }));
  alignRightBtn.addEventListener('click', () => withActive(o => { if (isTextObject(o)) o.set('textAlign', 'right'); }));
  [boldBtn, italicBtn, underlineBtn, alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(b => {
    b.addEventListener('click', updateSelectionPanel); // 버튼 눌린(on) 표시가 최신 상태를 반영하도록
  });

  fillColorInput.addEventListener('input', () => withActive(o => o.set('fill', fillColorInput.value)));

  const fillVariedBtns = [fillColorVariedBrightBtn, fillColorVariedMediumBtn, fillColorVariedDarkBtn];
  makeExclusiveVariedToggle(fillVariedBtns);
  fillColorHueSlider.addEventListener('input', () => {
    const hue = parseFloat(fillColorHueSlider.value) || 0;
    const mode = getActiveVariedMode(fillVariedBtns, variedModes);
    withActive(o => {
      const newHex = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(toHex(o.fill) || '#3498db', hue);
      o.set('fill', newHex);
    });
    fillColorInput.value = mode ? randomizedHueColor(hue, mode) : hueShiftedColor(fillColorInput.value, hue); // 스와치도 같이 갱신
  });
  fillColorHueSlider.addEventListener('change', () => pushHistory());
  strokeColorInput.addEventListener('input', () => withActive(o => o.set('stroke', strokeColorInput.value)));
  strokeWidthInput.addEventListener('input', () => withActive(o => o.set('strokeWidth', parseInt(strokeWidthInput.value, 10) || 0)));

  opacityInput.addEventListener('input', () => withActive(o => {
    o.set('opacity', parseFloat(opacityInput.value));
    if (!fontPopover.classList.contains('hidden')) {
      floatingOpacityInput.value = opacityInput.value;
      updateOpacityGaugeFill(parseFloat(opacityInput.value));
    }
  }));
  angleInput.addEventListener('input', () => withActive(o => { o.set('angle', parseFloat(angleInput.value) || 0); o.setCoords(); }));

  imgBrightnessInput.addEventListener('input', () => withActive(o => applyImageAdjustments(o, { brightness: (parseInt(imgBrightnessInput.value, 10) || 0) / 100 })));
  imgBrightnessInput.addEventListener('change', () => pushHistory());
  imgContrastInput.addEventListener('input', () => withActive(o => applyImageAdjustments(o, { contrast: (parseInt(imgContrastInput.value, 10) || 0) / 100 })));
  imgContrastInput.addEventListener('change', () => pushHistory());
  imgSaturationInput.addEventListener('input', () => withActive(o => applyImageAdjustments(o, { saturation: (parseInt(imgSaturationInput.value, 10) || 0) / 100 })));
  imgSaturationInput.addEventListener('change', () => pushHistory());

  /* ============================================================
     15. 모바일: 패널 토글
  ============================================================ */
  document.getElementById('panelToggleBtn').addEventListener('click', () => {
    if (sidePanelElForDrawer.classList.contains('open')) closeSidePanelDrawer();
    else openSidePanelDrawer();
  });

  /* ============================================================
     15a. PC: 전체화면 토글 — 모바일의 ⛶ 전체화면 버튼(ecopro3mobiletools.js)과 완전히 같은
     방식(브라우저 표준 Fullscreen API, 구형 접두사까지 순서대로 시도)을 그대로 재사용함.
  ============================================================ */
  (function setupPcFullscreenToggle(){
    const btn = document.getElementById('pcFullscreenBtn');
    if (!btn) return;
    function fsRequest(el){
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
      if (fn) fn.call(el);
    }
    function fsExit(){
      const fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
      if (fn) fn.call(document);
    }
    function fsElement(){
      return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
    }
    const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen ||
      document.documentElement.webkitRequestFullScreen || document.documentElement.msRequestFullscreen);
    if (!fsSupported) {
      btn.style.display = 'none'; // 이 API를 지원 안 하는 브라우저에서는 버튼 자체를 숨김
      return;
    }
    btn.addEventListener('click', () => {
      if (fsElement()) fsExit();
      else fsRequest(document.documentElement);
    });
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach((evtName) => {
      document.addEventListener(evtName, () => {
        btn.classList.toggle('active', !!fsElement());
      });
    });
  })();

  // 🔄 리셋 버튼(PC/모바일 공통) — F5(새로고침)와 완전히 같은 동작. 새 기능이 아니라 그냥
  // location.reload()만 호출함.
  (function setupResetButtons(){
    function reload(){
      if (confirm('새로고침 하시겠습니까?')) location.reload();
    }
    const pcResetBtn = document.getElementById('pcResetBtn');
    if (pcResetBtn) pcResetBtn.addEventListener('click', reload);
  })();

  /* ============================================================
     15b. 모바일: 하단 바 높이만큼 캔버스 영역에 여백을 실시간으로 확보
     — 하단 바(#floatingActionBar)가 화면 아래에 딱 붙는 고정(position:fixed) 바라서,
     #canvasWrap 자신의 박스 크기에는 반영되지 않음. 그래서 padding만 줬을 때는 흰 박스는
     안 가려졌지만, 확대해서 생기는 "가로 스크롤바"는 #canvasWrap 자신의 맨 아래 가장자리에
     그려지는데 그 가장자리가 하단 바 뒤에 숨어있어서 안 보이는 문제가 있었음(세로 스크롤바는
     오른쪽엔 가리는 게 없어서 문제 없이 보였음). margin-bottom으로 #canvasWrap 자신의
     박스 자체를 하단 바 바로 위에서 끝나게 만들어서, 가로 스크롤바가 하단 바 위쪽에
     또렷하게 보이게 함. 거기에 더해 padding-bottom을 살짝 더 줘서 흰 박스 중앙 기준점을
     20px 위로 올려둠(지난 요청 반영분 유지). 하단 바 높이가 바뀔 수 있어서 ResizeObserver로
     계속 실시간 감지해서 맞춤.
  ============================================================ */
  (function syncMobileBottomBarSpacing(){
    const bar = document.getElementById('floatingActionBar');
    const wrap = document.getElementById('canvasWrap');
    if (!bar || !wrap) return;
    function apply(){
      if (!EP.isMobileModeActive || !EP.isMobileModeActive()) {
        wrap.style.marginBottom = '';
        wrap.style.paddingBottom = '';
        return;
      }
      wrap.style.marginBottom = bar.offsetHeight + 'px'; // #canvasWrap 자신의 아래 가장자리(=가로 스크롤바 위치)를 하단 바 바로 위로
      wrap.style.paddingBottom = (24 + 80) + 'px'; // 24px 기본 여백 + 80px(중앙 기준점을 총 40px 위로 올리기 위함 — 20px씩 두 번 반영, 절반만 이동하므로 2배로 줌)
    }
    apply();
    if (window.ResizeObserver) {
      new ResizeObserver(apply).observe(bar);
    } else {
      window.addEventListener('resize', apply); // 구형 브라우저 대비
    }
    window.addEventListener('resize', apply);
  })();

  /* ============================================================
     16. 캔버스 바깥(패널/툴바 제외) 클릭 시 선택 해제
  ============================================================ */
  document.addEventListener('mousedown', (e) => {
    const shell = document.querySelector('.canvas-shell');
    if (
      shell && !shell.contains(e.target) &&
      !e.target.closest('.toolbar') &&
      !e.target.closest('.side-panel') &&
      !e.target.closest('.tab-sidebar') &&
      !e.target.closest('.status-bar') &&
      !e.target.closest('.font-popover') &&
      !e.target.closest('.qa-popover') &&
      !e.target.closest('.ctx-menu') &&
      !e.target.closest('.crop-toolbar') &&
      !e.target.closest('.cmyk-popover') &&
      !e.target.closest('.custom-select-list') &&
      // 모바일 전용 상단바(휴지통/색상/스포이드/레이어/확대 아이콘, "글씨 가리기" 드롭다운 등)도
      // PC의 .toolbar/.side-panel처럼 "도구를 조작하는 영역"이므로 여기서 제외해야 함.
      // 이게 빠져 있으면 이 버튼들을 누르는 순간(click보다 먼저 발생하는 mousedown 시점에)
      // 캔버스 선택이 먼저 해제돼버려서, 정작 각 버튼의 click 핸들러가 실행될 때는
      // 이미 선택된 오브젝트가 없는 상태가 되어 스포이드·휴지통·색상 적용이 전부 안 먹는
      // 문제가 있었음.
      !e.target.closest('.mobile-topbar') &&
      // 하단 바(손바닥/화면정리/확대게이지/전체화면/우클릭메뉴 버튼 등)도 마찬가지 이유로 제외 —
      // 특히 새로 추가한 "우클릭메뉴" 버튼은 지금 선택된 오브젝트를 대상으로 동작해야 하므로,
      // 누르는 순간 선택이 먼저 풀려버리면 안 됨.
      !e.target.closest('.floating-action-bar')
    ) {
      if (canvas.getActiveObject()) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
  });

  refreshEmptyHint();
  updateSelectionPanel();


  // ---- EP 네임스페이스로 내보내기 (ecopro3c.js / ecopro3text.js / ecopro3l.js 에서 사용) ----
  window.EP = window.EP || {};
  EP.canvas = canvas;
  EP.pushHistory = pushHistory;
  EP.refreshEmptyHint = refreshEmptyHint;
  EP.bringGuideToFront = bringGuideToFront;
  // 다른 파일(예: ecopro3menu.js)에서 캔버스 여백을 계산할 때 쓸 "1 단위가 몇 px인지"를 노출함.
  // 쿼리로 들어오는 width/height(ratioW/ratioH)는 실제 mm/cm 같은 물리 단위가 아니라 그냥
  // 가로세로 비율을 나타내는 순수 숫자라서(예: 16, 8), cm 변환 없이 그 숫자 자체를 격자 단위로
  // 취급함 — 예: ratioW=16이면 캔버스 가로폭이 "16단위"라고 보고, 그 1단위가 몇 px인지를 반환.
  // CANVAS_W/ratioW는 회전하면 같이 바뀌는 값들이라(rotateCanvas90 참고), 여기서 스냅샷을 미리
  // 저장해두지 않고 "호출될 때마다" 그 시점의 최신 값을 읽어서 계산함 — 그래서 캔버스를 회전
  // 하거나 다른 사이즈로 바꾼 뒤에 호출해도 항상 정확함.
  EP.getPxPerUnit = function(){ return CANVAS_W / ratioW; };
  EP.importSvgIntoCanvas = importSvgIntoCanvas;
  EP.isTextObject = isTextObject;
  EP.isShapeObject = isShapeObject;
  EP.isImageObject = isImageObject;
  EP.textBoxesFromTarget = textBoxesFromTarget;
  EP.qaTargetsFromTarget = qaTargetsFromTarget;
  EP.toHex = toHex;
  EP.rgbToHex = rgbToHex;
  EP.hsvToRgb = hsvToRgb;
  EP.makeDraggablePopover = makeDraggablePopover;
  EP.initCmykPicker = initCmykPicker;
  EP.customFontNames = customFontNames;
  EP.hexToRgb = hexToRgb;
  EP.fontPopover = fontPopover;
  EP.registerRotatablePopover(fontPopover);
  EP.registerFilterPopover(fontPopover);
  EP.clearPerCharStyleOverrides = clearPerCharStyleOverrides;
  EP.forceFontReloadRedraw = forceFontReloadRedraw;

  /* ============================================================
     17. 폰트 선택창 — 구조는 그대로(트리거 박스 + 바로 아래 펼쳐지는 목록) 두고,
     열었을 때 목록 개수(10개+스크롤)와 가로폭(트리거의 절반)만 제한.
     원래 <select>는 화면에서만 숨기고 그대로 DOM에 남겨서 값 읽기/쓰기, 'change' 리스너,
     커스텀폰트 appendChild(2059번줄) 등 기존 코드는 전혀 손대지 않음.
  ============================================================ */
  function makeCompactFontDropdown(selectEl, opts){
    if (!selectEl || selectEl._compactDropdownReady) return;
    selectEl._compactDropdownReady = true;
    const showArrows = !opts || opts.showArrows !== false;

    const wrap = document.createElement('div');
    wrap.className = 'custom-select-wrap';
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    selectEl.style.display = 'none';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    const triggerLabel = document.createElement('span');
    trigger.appendChild(triggerLabel);
    const caret = document.createElement('span');
    caret.className = 'custom-select-caret';
    caret.textContent = '▾';
    trigger.appendChild(caret);
    wrap.appendChild(trigger);

    // 위/아래 화살표 — 목록을 열지 않고도 눌러서 바로 이전/다음 폰트로 자연스럽게 넘어감
    // (방향키 상하 탐색과 완전히 같은 동작을 손가락으로 탭할 수 있게 버튼으로도 만든 것 —
    // 모바일에서 물리 키보드 없이도 같은 기능을 쓸 수 있게 하기 위함). 우측 속성 패널처럼
    // 폭이 좁은 곳에서는 화살표가 자리만 차지하므로 showArrows=false로 아예 안 만듦
    // (요청: "T버튼 팝업 쪽에만 화살표, 우측 패널 쪽은 빼줘").
    let arrowUpBtn = null, arrowDownBtn = null;
    if (showArrows) {
      const arrowsWrap = document.createElement('div');
      arrowsWrap.className = 'custom-select-arrows';
      arrowUpBtn = document.createElement('button');
      arrowUpBtn.type = 'button';
      arrowUpBtn.className = 'custom-select-arrow-btn';
      arrowUpBtn.textContent = '▲';
      arrowUpBtn.title = '이전 폰트 (꾹 누르면 계속 넘어감)';
      arrowDownBtn = document.createElement('button');
      arrowDownBtn.type = 'button';
      arrowDownBtn.className = 'custom-select-arrow-btn';
      arrowDownBtn.textContent = '▼';
      arrowDownBtn.title = '다음 폰트 (꾹 누르면 계속 넘어감)';
      arrowsWrap.appendChild(arrowUpBtn);
      arrowsWrap.appendChild(arrowDownBtn);
      wrap.appendChild(arrowsWrap);
    }

    const list = document.createElement('div');
    list.className = 'custom-select-list hidden';
    document.body.appendChild(list);

    function syncTriggerLabel(){
      const opt = selectEl.options[selectEl.selectedIndex];
      triggerLabel.textContent = opt ? opt.textContent : '';
    }
    syncTriggerLabel();

    function closeList(){
      list.classList.add('hidden');
    }

    function commitIndex(idx){
      const opt = selectEl.options[idx];
      if (!opt) return;
      selectEl.value = opt.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      syncTriggerLabel();
      closeList();
    }

    function stepFont(dir){
      const next = Math.max(0, Math.min(selectEl.options.length - 1, selectEl.selectedIndex + dir));
      commitIndex(next);
    }

    if (showArrows) {
      // 꾹 누르고 있으면 키보드 방향키를 계속 누르고 있을 때처럼 폰트가 계속 자동으로
      // 넘어감 — 처음엔 살짝 대기했다가(단순 탭과 구분되도록) 그 다음부터는 일정 간격으로
      // 천천히 계속 반복함. 손을 떼거나(mouseup/touchend) 버튼 밖으로 나가면(mouseleave) 멈춤.
      const HOLD_START_DELAY = 400; // 누른 뒤 이 시간 안에 떼면 "한 번 클릭"으로만 처리됨
      const HOLD_REPEAT_INTERVAL = 440; // 반복 간격 — 요청에 따라 기존(220ms)의 2배로 늦춤

      function bindHold(btn, dir){
        let holdTimeout = null, holdInterval = null, didRepeat = false;
        function stopHold(){
          clearTimeout(holdTimeout);
          clearInterval(holdInterval);
          holdTimeout = null;
          holdInterval = null;
        }
        function startHold(){
          stopHold();
          didRepeat = false;
          holdTimeout = setTimeout(() => {
            didRepeat = true;
            holdInterval = setInterval(() => stepFont(dir), HOLD_REPEAT_INTERVAL);
          }, HOLD_START_DELAY);
        }
        btn.addEventListener('mousedown', (e) => { e.stopPropagation(); startHold(); });
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(); }, { passive: false });
        ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach((evt) => {
          btn.addEventListener(evt, stopHold);
        });
        // click은 "짧게 한 번 탭"일 때만 스텝을 실행함 — 꾹 눌러서 이미 반복 이동이 시작된
        // 경우엔 click에서 한 번 더 이동하지 않도록 didRepeat로 구분함
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!didRepeat) stepFont(dir);
        });
      }
      bindHold(arrowUpBtn, -1);
      bindHold(arrowDownBtn, 1);
    }

    function openList(){
      list.innerHTML = '';
      Array.from(selectEl.options).forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = 'custom-select-option' + (opt.selected ? ' selected' : '');
        item.textContent = opt.textContent;
        item.addEventListener('click', () => commitIndex(idx));
        list.appendChild(item);
      });

      // 크기 계산은 항상 트리거의 "회전과 무관한 실제 레이아웃 크기"(offsetWidth/offsetHeight)
      // 기준으로 함 — getBoundingClientRect는 팝업이 회전(90/270도)돼 있으면 화면상 가로세로가
      // 뒤바뀐 값을 주기 때문에 그대로 쓰면 폭이 찌그러짐.
      const localW = trigger.offsetWidth;
      const localTriggerH = trigger.offsetHeight;
      list.style.width = localW + 'px';
      list.classList.remove('hidden'); // 실제 렌더 높이를 재려면 먼저 보이는 상태여야 함

      // 옵션 10개 높이만큼만 보이고 나머지는 스크롤 (실제 렌더된 한 줄 높이를 재서 정확히 맞춤)
      const firstItem = list.querySelector('.custom-select-option');
      const itemH = firstItem ? firstItem.offsetHeight : 34;
      const maxVisible = 10;
      const localListMaxH = Math.round(itemH * maxVisible + 8);
      list.style.maxHeight = localListMaxH + 'px';
      const localListH = Math.min(list.scrollHeight, localListMaxH);

      // 캔버스를 90/180/270도 돌리면 팝업 전체(.font-popover)가 그 각도만큼 CSS로 회전
      // 표시되는데(registerRotatablePopover), 이 목록은 팝업 밖(document.body)에 붙어있어서
      // 그 회전이 자동으로 적용되지 않음 — 그래서 목록도 같은 각도로 직접 회전시키고,
      // "트리거 바로 아래"라는 방향(로컬 +Y)도 그 각도만큼 돌려서 화면상 올바른 방향에 붙게 함.
      // .font-popover(T 글꼴창)뿐 아니라 .qa-popover(공통필터 등 P/M/J/Z 팝업)도 캔버스 회전에
      // 맞춰 같은 방식으로 회전 표시되므로, 그 안에 있는 드롭다운도 똑같이 회전 각도를 반영함
      const rot = trigger.closest('.font-popover, .qa-popover') ? (((EP.canvasRotationDeg || 0) % 360 + 360) % 360) : 0;
      function rotateVec(dx, dy, deg){
        const rad = deg * Math.PI / 180;
        const c = Math.cos(rad), s = Math.sin(rad);
        return { x: dx * c - dy * s, y: dx * s + dy * c };
      }
      const gap = 4;
      const belowLocal = { x: 0, y: localTriggerH / 2 + gap + localListH / 2 };
      const aboveLocal = { x: 0, y: -(localTriggerH / 2 + gap + localListH / 2) };
      const belowRot = rotateVec(belowLocal.x, belowLocal.y, rot);
      const aboveRot = rotateVec(aboveLocal.x, aboveLocal.y, rot);

      // 트리거의 화면상(=회전 반영된) 실제 중심점 — getBoundingClientRect는 조상의 transform까지
      // 감안한 진짜 화면 좌표를 주므로, 이 중심점 자체는 회전 여부와 무관하게 항상 정확함
      const tr = trigger.getBoundingClientRect();
      const triggerCenterX = tr.left + tr.width / 2;
      const triggerCenterY = tr.top + tr.height / 2;

      // 화면상 세로 여유가 부족하면 위쪽으로 뒤집음(90/270도에선 "위/아래"가 화면에서
      // "좌/우"가 될 수 있어 회전 후 실제 세로 크기 기준으로 판단)
      const visH = (rot === 90 || rot === 270) ? localW : localListH;
      let chosen = belowRot;
      if (triggerCenterY + belowRot.y + visH / 2 > window.innerHeight - 8) chosen = aboveRot;

      const desiredCenterX = triggerCenterX + chosen.x;
      const desiredCenterY = triggerCenterY + chosen.y;
      const clamped = EP.clampPopoverCenter
        ? EP.clampPopoverCenter(desiredCenterX, desiredCenterY, localW, localListH, rot)
        : { cx: desiredCenterX, cy: desiredCenterY };

      list.style.left = (clamped.cx - localW / 2) + 'px';
      list.style.top = (clamped.cy - localListH / 2) + 'px';
      if (EP.applyPopoverRotationStyle) EP.applyPopoverRotationStyle(list); // 팝업과 같은 각도로 함께 회전

      const selectedEl = list.querySelector('.custom-select-option.selected');
      if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!list.classList.contains('hidden')) { closeList(); return; }
      openList();
    });

    // 방향키로 폰트 선택 — 네이티브 <select>에서 되던 상하 화살표 탐색을 그대로 재현
    // (목록을 열지 않고도 포커스만 있으면 바로 다음/이전 폰트로 즉시 적용됨)
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(selectEl.options.length - 1, selectEl.selectedIndex + dir));
        commitIndex(next);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        list.classList.contains('hidden') ? openList() : closeList();
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (list.classList.contains('hidden')) return;
      if (e.target === trigger || trigger.contains(e.target)) return;
      if (list.contains(e.target)) return;
      closeList();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeList();
    });
    window.addEventListener('resize', closeList);
    // 페이지의 다른 부분이 스크롤될 때만 닫음 — 목록 자신의 스크롤(수동 스크롤/열릴 때 자동
    // scrollIntoView)까지 여기 걸리면 "열자마자 닫힘"/"스크롤이 안 먹음" 문제가 생기므로 제외.
    window.addEventListener('scroll', (e) => {
      if (e.target === list || (e.target.nodeType === 1 && list.contains(e.target))) return;
      closeList();
    }, true);

    // 다른 코드가 select.value를 직접 바꾸는 경우(예: 오브젝트 다시 선택 시 폰트 동기화)에도
    // 트리거에 보이는 글자가 항상 최신 상태를 따라가도록 값 setter를 감시함
    const origDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(selectEl, 'value', {
      get(){ return origDescriptor.get.call(this); },
      set(v){ origDescriptor.set.call(this, v); syncTriggerLabel(); },
      configurable: true
    });
  }

  makeCompactFontDropdown(fontFamilySelect, { showArrows: false });
  makeCompactFontDropdown(floatingFontSelect); // T버튼 팝업 — 화살표 그대로 유지
  // 공통필터(J버튼 팝업) 선택 목록도 T 글꼴창과 똑같이 회전 각도에 맞춰 아래쪽으로 정확히
  // 펼쳐지도록 동일하게 적용함 (요청: "폰트선택시 회전각도에 맞춰 펼치는 기능, 공통필터
  // 선택창에도 적용해줘")
  EP.makeCompactFontDropdown = makeCompactFontDropdown;
  makeCompactFontDropdown(document.getElementById('qaJFilterSelect'), { showArrows: false });

  /* ============================================================
     18. 초기화면 전용 "기본 레이아웃" 미리보기 패널 + 검색창
     - side-panel(#noSelectionSection/#selectionSections)의 기존 로직은 절대 안 건드리고,
       그 상태를 "읽기만" 해서 내 새 패널을 보였다 숨겼다만 함.
     - 데이터 소스: 저장소의 templates/ 폴더에 이름별로 넣어둔 .json 파일들.
       "목록"은 GitHub Pages가 폴더 목록 기능이 없어서 GitHub API로 조회하고,
       실제 각 json "내용"은 https://sowonnamoo.github.io/myjs/templates/{파일명} 에서 fetch함.
       파일명(확장자 제외)이 그대로 검색되는 "이름"이 됨. 예) templates/명함기본.json → "명함기본"
     - 각 레이아웃 json은 저장 파일과 같은 형식: { objects, background, canvasWidth, canvasHeight }
     - 검색창에 입력하면 이미 불러온 목록 중 이름에 포함되는 것만 걸러서 보여줌(다시 fetch 안 함).
     - 목록이 길어지면 .template-gallery-list 자체가 스크롤됨(검색창은 위에 고정).
  ============================================================ */
  (function setupTemplateGalleryPanel(){
    const panel = document.getElementById('templateGalleryPanel');
    const listEl = document.getElementById('templateGalleryList');
    const hintEl = document.getElementById('templateGalleryHint');
    const searchInput = document.getElementById('templateGallerySearch');
    if (!panel || !listEl || !hintEl || !searchInput) return;

    const FOLDER_API_URL = 'https://api.github.com/repos/sowonnamoo/myjs/contents/templates';
    const TEMPLATES_PAGES_BASE = 'https://sowonnamoo.github.io/myjs/templates/';

    let templates = []; // [{ name, jsonUrl, jpgUrl, itemEl }] — json 내용은 클릭 전까지 아예 안 받아옴
    let panelEnabled = false; // 목록을 정상적으로 불러왔을 때만 true

    // side-panel이 지금 "선택 없음" 상태인지를 그 DOM 상태만 읽어서 판단 — side-panel 쪽
    // 코드/동작은 전혀 건드리지 않음
    function isNoSelectionState(){
      const noSelSection = document.getElementById('noSelectionSection');
      return !!(noSelSection && !noSelSection.classList.contains('hidden'));
    }
    function updateGalleryVisibility(){
      if (!panelEnabled) { panel.classList.add('hidden'); return; }
      panel.classList.toggle('hidden', !isNoSelectionState());
    }
    // side-panel의 표시 상태를 바꾸는 것과 같은 이벤트들을 그대로 구독(읽기 전용) —
    // updateSelectionPanel 등 기존 함수는 손대지 않고, 같은 타이밍에 내 패널만 동기화함
    canvas.on('selection:created', updateGalleryVisibility);
    canvas.on('selection:updated', updateGalleryVisibility);
    canvas.on('selection:cleared', updateGalleryVisibility);

    // templates 폴더에 넣는 json이 두 형태 중 뭐든 가능하도록 정규화함:
    //  1) 단일 캔버스 형태: { objects, background, canvasWidth, canvasHeight }
    //  2) "저장" 버튼(saveProjectBtn)이 만드는 전체 프로젝트 파일 형태:
    //     { designData: [{front, back}, ...], canvasWidth, canvasHeight, designNames }
    //     — 이 경우 첫 번째 디자인의 앞면을 템플릿 레이아웃으로 씀.
    function normalizeTemplateData(raw){
      if (raw && Array.isArray(raw.objects)) return raw;
      if (raw && Array.isArray(raw.designData) && raw.designData[0] && raw.designData[0].front) {
        const front = raw.designData[0].front;
        return {
          objects: front.objects || [],
          background: front.background || '#ffffff',
          canvasWidth: raw.canvasWidth,
          canvasHeight: raw.canvasHeight
        };
      }
      return { objects: [], background: '#ffffff' };
    }

    function renderGalleryList(){
      listEl.innerHTML = '';
      templates.forEach((tpl) => {
        const item = document.createElement('div');
        item.className = 'template-gallery-item hidden'; // 평소엔 안 보이고 검색으로 매칭될 때만 나타남
        tpl.itemEl = item;

        // 미리보기는 json을 그려서 만드는 게 아니라, 같은 이름의 jpg를 그냥 <img>로 보여줌
        // (요청: "같은 이름의 jpg로 미리보기를 대처") — 캔버스 렌더링 비용이 전혀 없어서
        // 훨씬 빠름. loading="lazy"까지 붙여서 실제로 화면에 나타날 때만 브라우저가 받아옴.
        const img = document.createElement('img');
        img.alt = tpl.name;
        img.loading = 'lazy';
        img.src = tpl.jpgUrl;
        img.onerror = () => { img.style.display = 'none'; }; // 같은 이름 jpg가 없으면 이름만 보임(클릭은 정상 동작)
        item.appendChild(img);

        const nameEl = document.createElement('div');
        nameEl.className = 'template-gallery-name';
        nameEl.textContent = tpl.name;
        item.appendChild(nameEl);
        listEl.appendChild(item);

        // 클릭한 그 순간에야 비로소 실제 json을 받아와서 캔버스에 불러옴(요청: "그 이미지를
        // 클릭하면 그때 json을 불러오는거지") — 그전까지는 네트워크 요청 자체가 안 나감.
        // ⚠️ bgReferenceImages는 자동 복원 안 함(깜빡임 문제로 자동 복원 경로를 전부 꺼둠)
        item.addEventListener('click', () => {
          item.classList.add('template-gallery-item-loading');
          fetch(tpl.jsonUrl)
            .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then((raw) => {
              const data = normalizeTemplateData(raw);
              const scaled = rescaleSideDataToCurrentCanvas(data, data.canvasWidth, data.canvasHeight);
              loadCanvasObjects(scaled, () => {
                resetHistory();
                pushHistory();
              });
            })
            .catch((err) => {
              console.error('템플릿 불러오기 실패:', err);
              if (EP.showBottomHintToast) EP.showBottomHintToast('이 레이아웃을 불러오지 못했어요.');
            })
            .finally(() => {
              item.classList.remove('template-gallery-item-loading');
            });
        });
      });
    }

    // 검색창 — 다시 fetch하지 않고, 이미 불러온 파일명 목록을 이름 기준으로 걸러서
    // 보이기/숨기기만 함. 평소(검색어 없음)에는 아무것도 안 보이고, 뭔가 입력했을 때만
    // 매칭되는 것만 나타남.
    function applySearchFilter(){
      const q = searchInput.value.trim().toLowerCase();
      templates.forEach((tpl) => {
        if (!tpl.itemEl) return;
        const match = !!q && tpl.name.toLowerCase().includes(q);
        tpl.itemEl.classList.toggle('hidden', !match);
      });
      hintEl.classList.toggle('hidden', !!q);
    }
    searchInput.addEventListener('input', applySearchFilter);
    searchInput.addEventListener('click', (e) => e.stopPropagation());

    // 앞 페이지(photo-order.html 등)에서 쿼리로 넘어온 "실제 읽을 수 있는 상품명" — productId
    // 같은 코드(예: "01my")는 실사용자가 검색할 리 없으니 쓰지 않고, 사람이 읽는 한글 이름
    // (예: "명함")을 씀. 우선순위: orderData.paper(예: paper=명함) → orderData.options 안의
    // options1 값(같은 예시 URL에서 명함으로 겹쳐 들어오는 필드) → 그래도 없으면 productId.
    function resolveReadableProductName(){
      if (orderData.paper) return orderData.paper.trim();
      if (orderData.options) {
        try {
          const opts = JSON.parse(orderData.options);
          if (opts && opts.options1) return String(opts.options1).trim();
        } catch (err) { /* JSON이 아니면 무시하고 다음 후보로 */ }
      }
      return (orderData.productId || '').trim();
    }
    // 앞 쿼리에서 상품명을 못 알아낸 경우(예: 쿼리 없이 그냥 에디터를 열었을 때)에도 패널을
    // 텅 비워두지 않고, "기본"으로 시작하는 기본 레이아웃들(예: 기본1~기본5.json)을 대신
    // 보여줌 — 검색창은 그대로 살아있어서 사용자가 원하면 다른 걸로 다시 검색할 수 있음.
    const productName = resolveReadableProductName();
    const searchTerm = productName || '기본';

    // 파일 "목록"은 GitHub Pages가 폴더 목록 기능을 제공하지 않아서(정적 호스팅이라 index 파일이
    // 없으면 목록을 못 줌) 어쩔 수 없이 GitHub API로 조회함. 여기서는 파일명만 필요하고 json
    // 내용은 전혀 안 받아오기 때문에(미리보기는 jpg로 대체, json은 클릭해야 받아옴) 이 목록
    // 조회 하나로 끝남 — 예전처럼 모든 json을 미리 다 받아오지 않아서 훨씬 빠름.
    hintEl.textContent = '불러오는 중...';
    fetch(FOLDER_API_URL)
      .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then((files) => {
        const jsonFiles = (Array.isArray(files) ? files : [])
          .filter((f) => f.type === 'file' && /\.json$/i.test(f.name));
        if (!jsonFiles.length) throw new Error('templates 폴더에 json 파일 없음');
        templates = jsonFiles
          .map((f) => {
            const base = f.name.replace(/\.json$/i, '');
            return {
              name: base,
              jsonUrl: TEMPLATES_PAGES_BASE + encodeURIComponent(f.name),
              jpgUrl: TEMPLATES_PAGES_BASE + encodeURIComponent(base) + '.jpg'
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        panelEnabled = true;
        renderGalleryList();
        updateGalleryVisibility();
        // 상품명을 알면 그걸로, 모르면 "기본"으로 자동 검색 — 사용자가 직접 입력 안 해도 바로 매칭 결과가 보임
        searchInput.value = searchTerm;
        applySearchFilter();
      })
      .catch(() => {
        // templates 폴더가 없거나 비어있거나 API 호출이 실패하면 조용히 실패 — 패널은 계속 숨김
        panelEnabled = false;
        panel.classList.add('hidden');
      });
  })();

  /* ============================================================
     19. 참고용 배경사진 2종 (미관용 — 인쇄되는 디자인 파일에는 절대 포함 안 됨)
     - 둘 다 fabric 오브젝트가 아니라 순수 DOM <img>라서, PNG/JPG/SVG 내보내기나
       "상품담기/구입" 시안 이미지(canvas.toDataURL/toSVG)에는 애초에 잡힐 수가 없음.
     - 🖼 배경채우기: 캔버스 박스 주변(체커무늬 영역) 전체를 이 사진으로 채움. CSS
       width:100%/height:100%라서 창 크기·줌이 바뀌면 자동으로 같이 늘었다 줄었다 함.
     - 🖼 고정형(목업): 파일을 고른 그 순간의 디자인 박스 화면 위치·크기를 기준으로
       딱 한 번만 left/top/width/height를 픽셀 단위로 계산해서 인라인 스타일로 고정함.
       그 뒤로는 줌을 바꾸든 캔버스를 90도 회전시키든 이 값을 다시 건드리는 코드가
       전혀 없어서, 말 그대로 화면에 "고정"되어 안 움직임(티셔츠 등 목업 사진 위에
       인쇄 영역을 한 번 맞춰두면 계속 그 자리에 있어야 하는 용도).
  ============================================================ */
  (function setupBackgroundReferenceImages(){
    const fillImg = document.getElementById('bgFillRefImage');
    const fixedImg = document.getElementById('bgFixedRefImage');
    const fillInput = document.getElementById('bgFillImageInput');
    const fixedInput = document.getElementById('bgFixedImageInput');
    if (!fillImg || !fixedImg || !fillInput || !fixedInput) return;

    let bgFillDataUrl = null;
    // 고정형은 "줌 1배 기준" 크기(widthAtZoom1/heightAtZoom1)로 저장해두고, 화면에 그릴 때마다
    // 그 값에 지금 줌 배율을 곱해서 실제 px를 계산함 — 이렇게 해야 줌을 여러 번 바꿔도 오차가
    // 누적되지 않고, 캔버스를 확대하면 같이 커지고 축소하면 같은 비율로 같이 작아짐(요청사항).
    let bgFixedState = null; // { dataUrl, widthAtZoom1, heightAtZoom1 }
    let lastZoomForFixedImg = null;

    function readFileAsDataUrl(file, cb){
      const reader = new FileReader();
      reader.onload = (e) => cb(e.target.result);
      reader.readAsDataURL(file);
    }

    fillInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      readFileAsDataUrl(file, (dataUrl) => {
        bgFillDataUrl = dataUrl;
        fillImg.src = dataUrl;
        fillImg.classList.remove('hidden');
      });
      e.target.value = '';
    });

    // 지금 디자인 박스(캔버스)의 화면상 정중앙을 canvasWrap 좌표계로 환산 — 매번 새로 계산해서
    // 쓰기 때문에 "이미지 중앙 = 캔버스 중앙"이 항상 정확히 유지됨(요청: "정 일치시켜야 함").
    function getShellCenterInWrap(){
      const wrapRect = canvasWrap.getBoundingClientRect();
      const shellRect = canvas.upperCanvasEl.getBoundingClientRect();
      return {
        x: shellRect.left + shellRect.width / 2 - wrapRect.left + canvasWrap.scrollLeft,
        y: shellRect.top + shellRect.height / 2 - wrapRect.top + canvasWrap.scrollTop
      };
    }

    // 지금 줌 배율 기준으로 실제 화면 px 크기를 계산해서 다시 그림. 이미지 바깥이 캔버스
    // 영역 밖으로 잘려나가는 건 상관없음(요청: "이미지 바깥 잘려도 괜찮음") — 그냥 canvasWrap의
    // overflow에 맡겨둠.
    function applyFixedImageStyle(){
      if (!bgFixedState) { fixedImg.classList.add('hidden'); return; }
      const z = (EP.getZoomLevel && EP.getZoomLevel()) || 1;
      const w = bgFixedState.widthAtZoom1 * z;
      const h = bgFixedState.heightAtZoom1 * z;
      const center = getShellCenterInWrap();
      fixedImg.src = bgFixedState.dataUrl;
      fixedImg.style.left = (center.x - w / 2) + 'px';
      fixedImg.style.top = (center.y - h / 2) + 'px';
      fixedImg.style.width = w + 'px';
      fixedImg.style.height = h + 'px';
      fixedImg.classList.remove('hidden');
      lastZoomForFixedImg = z;
    }

    fixedInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      readFileAsDataUrl(file, (dataUrl) => {
        const probe = new Image();
        probe.onload = () => {
          const shellRect = canvas.upperCanvasEl.getBoundingClientRect();
          const z = (EP.getZoomLevel && EP.getZoomLevel()) || 1;
          const naturalW = probe.naturalWidth || shellRect.width * 2;
          const naturalH = probe.naturalHeight || shellRect.height * 2;
          // 기본 크기: 원본 비율 유지, 디자인 박스의 2배 폭으로 시작(목업 사진이 인쇄
          // 영역보다 훨씬 넓은 경우가 보통이라 처음부터 자연스럽게 보이도록) — 이 크기를
          // "줌 1배 기준"으로 환산해서 저장해둠.
          const baseW = Math.max(shellRect.width * 2, naturalW);
          const scale = baseW / naturalW;
          bgFixedState = {
            dataUrl,
            widthAtZoom1: (naturalW * scale) / z,
            heightAtZoom1: (naturalH * scale) / z
          };
          applyFixedImageStyle();
        };
        probe.src = dataUrl;
      });
      e.target.value = '';
    });

    // 줌이 실제로 바뀌었을 때만 다시 그림 — rotateCanvas90()이 캔버스 크기를 다시 맞추려고
    // "바뀌지 않은" 같은 zoom 값으로 이 훅을 호출하는 경우가 있는데, 그때는 그냥 건너뛰어서
    // 회전에는 절대 반응하지 않게 함(요청: "캔버스 회전 기능과 적용되면 안 됨").
    EP.onFixedBgZoomChange = function(newZoom){
      if (!bgFixedState) return;
      if (lastZoomForFixedImg != null && Math.abs(newZoom - lastZoomForFixedImg) < 1e-6) return;
      applyFixedImageStyle();
    };

    // 프로젝트 저장(json)·템플릿 갤러리 불러오기에서 재사용할 수 있게 노출.
    // 인쇄용 PNG/JPG/SVG 내보내기 쪽 함수에서는 일부러 이걸 전혀 참조하지 않음
    // (요청: "파일 저장에는 개입 안 해도 됨 — 그냥 이건 미관용이니까").
    EP.getBgReferenceImagesForSave = function(){
      if (!bgFillDataUrl && !bgFixedState) return null;
      return { bgFill: bgFillDataUrl, bgFixed: bgFixedState };
    };
    EP.applyBgReferenceImagesFromSave = function(data){
      if (!data) return;
      // 페이지 초기화 중(프로젝트 자동 불러오기 등)에 이 함수가 너무 일찍 불리면, 브라우저가
      // 아직 레이아웃 계산을 다 안 끝낸 상태라 이미지가 순간적으로 원래보다 커 보였다 다시
      // 제자리로 줄어드는 "깜빡임"이 생길 수 있어서, 화면이 최소 두 번 그려진 뒤(레이아웃이
      // 확실히 자리잡은 뒤)에 실제로 보여주도록 함.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (data.bgFill) {
            bgFillDataUrl = data.bgFill;
            fillImg.src = bgFillDataUrl;
            fillImg.classList.remove('hidden');
          }
          if (data.bgFixed) {
            bgFixedState = data.bgFixed;
            applyFixedImageStyle();
          }
        });
      });
    };
  })();

})();
