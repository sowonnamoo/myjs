/* ecopro3text.js — 텍스트 전용 필터(37개, 글자 단위 렌더 파이프라인에 묶여있어 텍스트에만 적용 가능)
   로딩 순서: ecopro3.js -> ecopro3c.js -> ecopro3text.js -> ecopro3l.js */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};
  var canvas = EP.canvas, pushHistory = EP.pushHistory, isTextObject = EP.isTextObject,
      toHex = EP.toHex, rgbToHex = EP.rgbToHex, hsvToRgb = EP.hsvToRgb;

  // 특수 렌더 효과 공통 인프라
  // - 원형 글자 / 부풀리기 / 랜덤 타이포는 글자 "배치 방식" 자체를 바꾸는 효과라 셋 중 하나만 선택 가능.
  // - 이중테두리 / 3D 효과는 그 위에 "겹쳐서 더 그리는" 효과라서, 레이아웃 효과와도, 서로끼리도 자유롭게 겹쳐 씀.
  // - 이 넷을 하나의 _render 함수로 통합해서, 매번 현재 켜진 효과들을 순서대로 조합해서 그림.
  const origItextRender = fabric.IText.prototype._render;

  // ---- 광원 효과 ---- (포토샵 스크린 블렌드처럼 겹쳐 그려서, 지정한 각도 방향에서
  // 태양광 같은 강한 빛이 비스듬히 비쳐드는 느낌을 냄. 레이아웃 효과와는 무관하게
  // 항상 마지막에 텍스트 위에 겹쳐 그려지므로 다른 효과와 자유롭게 함께 쓸 수 있음)
  const qaLightIntensity = document.getElementById('qaLightIntensity');
  const qaLightScale = document.getElementById('qaLightScale');
  const qaLightAngle = document.getElementById('qaLightAngle');
  const qaLightOffsetX = document.getElementById('qaLightOffsetX');
  const qaLightHaloWidth = document.getElementById('qaLightHaloWidth');
  const qaLightHaloCount = document.getElementById('qaLightHaloCount');
  const qaLightColor = document.getElementById('qaLightColor');
  function applyQaLight(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaLightIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.lightText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const scale = parseFloat(qaLightScale.value) || 100;
      const angle = parseFloat(qaLightAngle.value) || 0;
      const offsetX = parseFloat(qaLightOffsetX.value) || 0;
      const color = qaLightColor.value || '#ffc233';
      const haloWidth = parseFloat(qaLightHaloWidth.value);
      const haloCount = Math.round(parseFloat(qaLightHaloCount.value)) || 0;
      boxes.forEach(t => {
        // 햇무리(광선)들은 seed로 방향/길이가 고정 — "다시 뿌리기"를 눌러야 새로 흩뿌려짐
        const seed = (regenerateSeed || !t.lightText) ? Math.floor(Math.random() * 100000) : t.lightText.seed;
        t.lightText = { intensity, scale, angle, offsetX, color, haloWidth, haloCount, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaLightIntensity.addEventListener('input', () => applyQaLight(false));
  qaLightScale.addEventListener('input', () => applyQaLight(false));
  qaLightAngle.addEventListener('input', () => applyQaLight(false));
  qaLightOffsetX.addEventListener('input', () => applyQaLight(false));
  qaLightHaloWidth.addEventListener('input', () => applyQaLight(false));
  qaLightHaloCount.addEventListener('input', () => applyQaLight(false));
  qaLightColor.addEventListener('input', () => applyQaLight(false));
  qaLightIntensity.addEventListener('change', () => EP.pushHistory());
  qaLightScale.addEventListener('change', () => EP.pushHistory());
  qaLightAngle.addEventListener('change', () => EP.pushHistory());
  qaLightOffsetX.addEventListener('change', () => EP.pushHistory());
  qaLightHaloWidth.addEventListener('change', () => EP.pushHistory());
  qaLightHaloCount.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaLightShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaLightIntensity.value) || 0) <= 0) qaLightIntensity.value = 50;
    // 색상도 함께 무작위로 새로 뽑음
    const hue = Math.random() * 360;
    const rgb = EP.hsvToRgb(hue, 0.45 + Math.random() * 0.4, 0.75 + Math.random() * 0.25);
    qaLightColor.value = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
    applyQaLight(true);
    EP.pushHistory();
  });
  document.getElementById('qaLightOffBtn').addEventListener('click', () => {
    qaLightIntensity.value = 0;
    applyQaLight(false); EP.pushHistory();
  });


  // ---- 원형 글자 (레이아웃 효과) ----
  // ---- 세로쓰기 (레이아웃 효과) ----
  function drawVerticalPass(ctx){
    const cfg = this.verticalText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();
    ctx.save();
    ctx.font = fontDecl;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const lineHeight = this.fontSize * (cfg.spacing || 1.2);
    const totalHeight = lineHeight * chars.length;
    let y = -totalHeight / 2 + lineHeight / 2;

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';

    chars.forEach((c) => {
      ctx.save();
      ctx.translate(0, y);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();
      y += lineHeight;
    });

    ctx.restore();
  }

  // 둥근 사각형 경로 그리기(테두리용) — 우편번호 칸의 모서리를 둥글게 할 때 씀(radius=0이면 각진 사각형)
  function tracePostalBoxPath(ctx, x, y, w, h, r){
    if (r <= 0) { ctx.rect(x, y, w, h); return; }
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // 우편번호 칸 (레이아웃 효과) — 봉투 우편번호 칸처럼 글자마다 똑같은 크기의 네모 칸을 그리고,
  // 그 정중앙에 글자를 맞춰 넣어서 나란히 배치함. 숫자/영문/한글이 섞여 폭이 서로 달라도
  // 칸 크기와 칸 사이 간격은 항상 균일하게 유지되어 "예쁘게 정렬된" 느낌을 냄.
  function drawPostalPass(ctx){
    const cfg = this.postalText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r' && c !== ' ');
    if (!chars.length) { origItextRender.call(this, ctx); return; }

    const boxSize = this.fontSize * (cfg.boxScale != null ? cfg.boxScale : 1.5);
    const gap = this.fontSize * ((cfg.gap != null ? cfg.gap : 14) / 100);
    const radius = (boxSize / 2) * ((cfg.radius != null ? cfg.radius : 0) / 100);
    const borderWidth = cfg.borderWidth != null ? cfg.borderWidth : 2;
    const borderColor = cfg.borderColor || '#000000';

    const n = chars.length;
    const totalWidth = boxSize * n + gap * (n - 1);
    let x = -totalWidth / 2;

    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();
    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';

    chars.forEach((c) => {
      const cx = x + boxSize / 2;

      // 1) 칸(사각형 테두리)
      if (borderWidth > 0) {
        ctx.save();
        ctx.beginPath();
        tracePostalBoxPath(ctx, x, -boxSize / 2, boxSize, boxSize, radius);
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
        ctx.restore();
      }

      // 2) 글자를 칸 정중앙에 배치(글자 폭과 상관없이 칸 중심 기준으로 정렬)
      ctx.save();
      ctx.translate(cx, 0);
      ctx.font = fontDecl;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();

      x += boxSize + gap;
    });
  }

  function drawCircularPass(ctx){
    const cfg = this.circularText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const r = Math.max(10, cfg.radius || 100);
    const flip = !!cfg.flip;
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();

    ctx.save();
    ctx.font = fontDecl;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    const chars = text.split('');
    const widths = chars.map(c => ctx.measureText(c).width);
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const circumference = 2 * Math.PI * r;
    let totalAngle = (totalWidth / circumference) * 2 * Math.PI;

    // 반지름이 작거나 글자가 길어서 한 바퀴(360도)를 넘어가면, 글자끼리 겹쳐서
    // 위아래로 지저분하게 쌓이므로, 한 바퀴를 넘지 않도록 글자 간격을 비례해서 압축함
    const maxAngle = Math.PI * 2 * 0.98;
    const angleScale = totalAngle > maxAngle ? maxAngle / totalAngle : 1;
    totalAngle *= angleScale;
    let angle = (cfg.startAngle || 0) * Math.PI / 180 - totalAngle / 2;

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';

    chars.forEach((c, i) => {
      const w = widths[i];
      const step = (w / circumference) * 2 * Math.PI * angleScale;
      const dir = flip ? -1 : 1;
      const charMidAngle = angle + step / 2;
      const x = Math.sin(charMidAngle) * r;
      const y = -Math.cos(charMidAngle) * r * dir;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(charMidAngle * dir + (flip ? Math.PI : 0));
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();
      angle += step;
    });

    ctx.restore();
  }

  // ---- 부풀리기 (레이아웃 효과) ----
  function drawPuffyPass(ctx){
    const cfg = this.puffyText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const amp = (cfg.amplitude || 0) / 100;
    const period = Math.max(2, cfg.period || 4);
    const baseFontSize = this.fontSize;
    const fontFamily = this.fontFamily, fontWeight = this.fontWeight || '', fontStyle = this.fontStyle || '';

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const chars = text.split('');
    const scales = chars.map((c, i) => 1 + amp * Math.sin((i / period) * Math.PI * 2));
    const widths = chars.map((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      return ctx.measureText(c).width;
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const y = baseFontSize * 0.35;

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      ctx.save();
      ctx.translate(x, y);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();
      x += widths[i];
    });

    ctx.restore();
  }

  // ---- 나무타기(넝쿨) ---- (레이아웃 효과) : 글자를 아래에서 위로 세로로 쌓아 올리면서,
  // 나무 기둥을 휘감는 넝쿨처럼 좌우로 구불구불 휘어지게 하고, 곡선의 접선 방향을 따라
  // 글자를 자연스럽게 회전시켜서 "타고 올라가는" 느낌을 냄
  function drawVineClimbPass(ctx){
    const cfg = this.vineText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const amp = Math.max(0, cfg.amplitude || 0);
    const period = Math.max(2, cfg.period || 6);
    const spacing = cfg.spacing || 1.2;
    const dir = cfg.flip ? -1 : 1;
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();

    ctx.save();
    ctx.font = fontDecl;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const lineHeight = this.fontSize * spacing;
    const totalHeight = lineHeight * chars.length;
    // 아래(마지막 글자)에서 시작해 위(첫 글자)로 타고 올라가도록 y를 아래에서부터 채움
    let y = totalHeight / 2 - lineHeight / 2;
    const step = (Math.PI * 2) / period;

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';

    // 뒤(마지막 글자)부터 그려서, 위로 갈수록(=앞 글자일수록) 뒤에 그려진 글자 위에 살짝
    // 겹쳐 보이게 함 — 넝쿨이 기둥을 감고 올라가는 자연스러운 겹침 느낌
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i];
      const phase = i * step;
      const x = Math.sin(phase) * amp * dir;
      // 접선 각도: x를 y에 대해 미분한 값으로 근사 → 곡선을 따라가듯 글자가 자연스럽게 기울어짐
      const tangent = Math.cos(phase) * amp * step * dir;
      const rot = Math.atan2(tangent, lineHeight);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();
      y -= lineHeight;
    }

    ctx.restore();
  }

  // ---- 데굴데굴 굴러가는 효과 (레이아웃 효과) ----
  // 글자를 가로로 늘어놓되, 뒤로 갈수록(오른쪽으로 갈수록) 계속 더 많이 회전시켜서
  // 마치 바퀴처럼 굴러온 상태처럼 보이게 하고, 동시에 통통 튀는 듯 사인파로 위아래 바운스를 줘서
  // 바닥을 통통 튀며 굴러가는 공 같은 움직임을 정지된 한 장의 그림으로 표현함
  function drawRollPass(ctx){
    const cfg = this.rollText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const rotStep = (cfg.rotStep != null ? cfg.rotStep : 35) * (cfg.flip ? -1 : 1);
    const bounceAmp = cfg.bounceAmp != null ? cfg.bounceAmp : 12;
    const period = Math.max(1, cfg.period || 3);
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();

    ctx.save();
    ctx.font = fontDecl;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const widths = chars.map(c => ctx.measureText(c).width);
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const yBase = this.fontSize * 0.35; // 바닥(기준선) 위치

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const w = widths[i];
      const cx = x + w / 2;
      const rot = ((i + 1) * rotStep) * Math.PI / 180; // 첫 글자부터 회전 시작, 갈수록 계속 더 굴러간 각도
      const phase = (i / period) * Math.PI * 2;
      const bounce = -Math.abs(Math.sin(phase)) * bounceAmp; // 바닥에서 통통 튀는 높이(항상 위로만)
      const squash = 1 - Math.abs(Math.sin(phase)) * 0.15; // 바닥에 닿을 때 살짝 눌리는 느낌

      ctx.save();
      ctx.translate(cx, yBase + bounce);
      ctx.rotate(rot);
      ctx.scale(1, squash);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();

      x += w;
    });

    ctx.restore();
  }

  // ---- 원근법 효과 (레이아웃 효과) ----
  // 첫 글자가 가장 크고, 뒤로 갈수록 점점 작아지도록 글자마다 폰트 크기를 줄여나감.
  // 모든 글자를 같은 기준선(baseline)에 나란히 배치해서, 마치 바닥에 서서 멀어질수록
  // 작아 보이는 듯한 원근감을 냄. "방향 뒤집기"를 켜면 반대로 뒷글자가 커짐
  function drawPerspectivePass(ctx){
    const cfg = this.perspectiveText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const minScale = 1 - Math.min(90, Math.max(0, cfg.intensity || 0)) / 100;
    const flip = !!cfg.flip;
    const baseFontSize = this.fontSize;
    const fontFamily = this.fontFamily, fontWeight = this.fontWeight || '', fontStyle = this.fontStyle || '';

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const n = chars.length;
    const scales = chars.map((c, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const ratio = flip ? t : 1 - t; // 기본(뒤집기 off): 첫 글자(i=0)가 1(원래 크기), 마지막 글자가 minScale
      return minScale + (1 - minScale) * ratio;
    });
    const widths = chars.map((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      return ctx.measureText(c).width;
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const y = baseFontSize * 0.35;

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      ctx.save();
      ctx.translate(x, y);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();
      x += widths[i];
    });

    ctx.restore();
  }

  // 곡선/물결 효과 공용: 첫 글자가 가장 크고 뒤로 갈수록 점점 작아지는 원근감용 배율 배열을 계산
  function computeFrontLargePerspectiveScales(n, perspectiveIntensity){
    const minScale = 1 - Math.min(90, Math.max(0, perspectiveIntensity || 0)) / 100;
    const scales = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      scales.push(minScale + (1 - minScale) * (1 - t));
    }
    return scales;
  }

  // ---- 곡선 효과 (레이아웃 효과) ----
  // 텍스트를 원호(circle arc)를 따라 배치함. "휨 정도" 0이면 완전히 평평하게, 100이면 반원(180도)
  // 에 가까운 무지개 모양까지 휘어짐. "방향 뒤집기"로 위로 볼록(무지개 ∩)/아래로 볼록(그릇 ∪)을
  // 전환할 수 있고, "원근감"을 올리면 첫 글자가 가장 크고 뒤로 갈수록 작아지는 원근감이 곡선
  // 위에 함께 적용됨
  function drawCurvePass(ctx){
    const cfg = this.curveText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const strength = Math.max(0, Math.min(100, cfg.strength != null ? cfg.strength : 40)) / 100;
    const perspective = Math.max(0, Math.min(100, cfg.perspective || 0));
    const flip = !!cfg.flip;
    const baseFontSize = this.fontSize;
    const fontFamily = this.fontFamily, fontWeight = this.fontWeight || '', fontStyle = this.fontStyle || '';

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const n = chars.length;
    const scales = computeFrontLargePerspectiveScales(n, perspective);
    const widths = chars.map((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      return Math.max(1, ctx.measureText(c).width);
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const dir = flip ? -1 : 1;

    const totalAngle = strength * Math.PI; // 0(평평) ~ π(180도, 반원 무지개)
    const flat = totalAngle < 0.01;
    const r = flat ? 0 : totalWidth / totalAngle;

    let angle = -totalAngle / 2;
    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const w = widths[i];
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      ctx.save();
      if (flat) {
        ctx.translate(x + w / 2, baseFontSize * 0.35);
      } else {
        const step = w / r;
        const charMidAngle = angle + step / 2;
        const px = Math.sin(charMidAngle) * r;
        const py = r * dir * (1 - Math.cos(charMidAngle)) + baseFontSize * 0.35;
        ctx.translate(px, py);
        ctx.rotate(charMidAngle * dir);
        angle += step;
      }
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();
      x += w;
    });

    ctx.restore();
  }

  // ---- 물결 효과 (레이아웃 효과) ----
  // 텍스트가 사인파(물결)를 따라 위아래로 출렁이도록 배치함. "출렁임"은 물결의 높이(진폭),
  // "물결 수"는 텍스트 전체 길이에 몇 번 굽이치는지(주기)를 정함. 각 글자는 그 지점의 물결
  // 접선 기울기만큼 살짝 기울여서 실제로 물결을 타는 듯한 느낌을 냄. "원근감"을 올리면 첫
  // 글자가 가장 크고 뒤로 갈수록 작아지는 원근감이 물결 위에 함께 적용됨
  function drawWavePass(ctx){
    const cfg = this.waveText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const amp = Math.max(0, Math.min(100, cfg.amplitude != null ? cfg.amplitude : 50)) / 100;
    const period = Math.max(1, cfg.period || 2);
    const perspective = Math.max(0, Math.min(100, cfg.perspective || 0));
    const baseFontSize = this.fontSize;
    const fontFamily = this.fontFamily, fontWeight = this.fontWeight || '', fontStyle = this.fontStyle || '';

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const n = chars.length;
    const scales = computeFrontLargePerspectiveScales(n, perspective);
    const widths = chars.map((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      return Math.max(1, ctx.measureText(c).width);
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const ampPx = baseFontSize * amp * 0.55;
    const baseY = baseFontSize * 0.35;
    const angFreq = (Math.PI * 2 * period) / Math.max(1, totalWidth);

    let x = -totalWidth / 2;
    let cum = 0;
    chars.forEach((c, i) => {
      const w = widths[i];
      const midX = cum + w / 2;
      const phase = midX * angFreq;
      const y = baseY + Math.sin(phase) * ampPx;
      const slope = Math.cos(phase) * ampPx * angFreq;
      const rot = Math.atan(slope);

      ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize * scales[i]}px ${fontFamily}`;
      ctx.save();
      ctx.translate(x + w / 2, y);
      ctx.rotate(rot);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();

      x += w;
      cum += w;
    });

    ctx.restore();
  }

  // ---- 기찻길 효과 (레이아웃 효과) ----
  // 물결 효과와 같은 사인파를 따라 글자를 구불구불하게 배치하되, 그 아래에 침목과 레일 두 줄로
  // 이루어진 선로를 함께 그리고 글자 하나하나 밑에는 바퀴를 달아서, 마치 글자들이 기차 칸이
  // 되어 구불구불한 철길 위를 달리는 것처럼 보이게 함. "구불거림"은 선로/글자가 출렁이는
  // 높이(진폭), "굽이 수"는 텍스트 전체 길이에 몇 번 굽이치는지(주기)를 정함
  function drawTrainPass(ctx){
    const cfg = this.trainText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const amp = Math.max(0, Math.min(100, cfg.amplitude != null ? cfg.amplitude : 45)) / 100;
    const period = Math.max(1, cfg.period || 2);
    const trackColor = cfg.trackColor || '#5a4632';
    const baseFontSize = this.fontSize;
    const fontFamily = this.fontFamily, fontWeight = this.fontWeight || '', fontStyle = this.fontStyle || '';

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize}px ${fontFamily}`;

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const widths = chars.map(c => Math.max(1, ctx.measureText(c).width));
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const ampPx = baseFontSize * amp * 0.5;
    const baseY = baseFontSize * 0.32;
    const angFreq = (Math.PI * 2 * period) / Math.max(1, totalWidth);
    const half = totalWidth / 2;

    // px: 글자 중앙 기준 가로좌표(-half~half). 사인파 위상 계산에는 (px+half)를 사용
    const pathY = (px) => baseY + Math.sin((px + half) * angFreq) * ampPx;
    const pathSlope = (px) => Math.cos((px + half) * angFreq) * ampPx * angFreq;

    const trackOffset = baseFontSize * 0.6;            // 글자 기준선에서 선로까지의 아래쪽 거리
    const railGap = Math.max(6, baseFontSize * 0.26);  // 레일 두 줄 사이 간격
    const wheelR = Math.max(2, baseFontSize * 0.065);

    // 1) 선로: 레일 두 줄 + 침목(가로 막대)을 글자와 같은 굴곡을 따라 그림
    ctx.save();
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = Math.max(1, baseFontSize * 0.045);
    [-1, 1].forEach(side => {
      ctx.beginPath();
      var first = true;
      for (var sx = -half - 8; sx <= half + 8; sx += 4) {
        var y = pathY(sx) + trackOffset;
        var ang = Math.atan(pathSlope(sx));
        var nx = -Math.sin(ang) * railGap / 2 * side;
        var ny = Math.cos(ang) * railGap / 2 * side;
        if (first) { ctx.moveTo(sx + nx, y + ny); first = false; } else { ctx.lineTo(sx + nx, y + ny); }
      }
      ctx.stroke();
    });
    for (var tx = -half - 8; tx <= half + 8; tx += 11) {
      var ty = pathY(tx) + trackOffset;
      var tang = Math.atan(pathSlope(tx));
      var hx = Math.cos(tang) * (railGap / 2 + 4);
      var hy = Math.sin(tang) * (railGap / 2 + 4);
      ctx.beginPath();
      ctx.moveTo(tx - hx, ty - hy);
      ctx.lineTo(tx + hx, ty + hy);
      ctx.stroke();
    }
    ctx.restore();

    // 2) 글자(기차 칸처럼) + 바퀴를 선로 굴곡을 따라 배치
    let x = -half;
    chars.forEach((c, i) => {
      const w = widths[i];
      const drawX = x + w / 2;
      const y = pathY(drawX);
      const rot = Math.atan(pathSlope(drawX));

      ctx.save();
      ctx.translate(drawX, y);
      ctx.rotate(rot);
      ctx.fillStyle = '#2b2b2b';
      [-1, 1].forEach(function(wsign){
        ctx.beginPath();
        ctx.arc(wsign * Math.max(3, w * 0.26), trackOffset, wheelR, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      ctx.save();
      ctx.translate(drawX, y);
      ctx.rotate(rot);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();

      x += w;
    });

    ctx.restore();
  }

  // ---- 지침(흐물흐물) 효과 (레이아웃 효과) ----
  // 뒤로 갈수록 글자가 점점 아래로 축 처지고(고개가 떨궈지듯) 시계방향으로 기울며, 세로로는
  // 살짝 눌리고 가로로는 살짝 퍼져서 힘이 빠진 듯한 흐물흐물한 인상을 줌. "처짐"이 전체적인
  // 축 처짐/기울기를 정하고, "흐트러짐"은 글자마다 제각각 떨리듯 위아래로 흔들리고 살짝
  // 회전하며 농도(진하기)까지 들쭉날쭉해져서 힘없이 겨우 쓴 듯한 느낌을 더함. seed로 흔들림의
  // 모양이 고정되어 "다시 늘어지기"를 눌러야 새로 바뀜
  function drawTiredPass(ctx){
    const cfg = this.tiredText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const droop = Math.max(0, Math.min(100, cfg.droop != null ? cfg.droop : 55)) / 100;
    const wobble = Math.max(0, Math.min(100, cfg.wobble != null ? cfg.wobble : 45)) / 100;
    const seed = cfg.seed || 0;
    const baseFontSize = this.fontSize;
    const fontFamily = this.fontFamily, fontWeight = this.fontWeight || '', fontStyle = this.fontStyle || '';

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = `${fontStyle} ${fontWeight} ${baseFontSize}px ${fontFamily}`;

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const n = chars.length;
    const widths = chars.map(c => Math.max(1, ctx.measureText(c).width));
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const baseY = baseFontSize * 0.35;
    const maxDip = baseFontSize * 0.55 * droop; // 마지막 글자가 처지는 최대 높이
    const maxRotDeg = 24 * droop; // 마지막 글자가 기울어지는 최대 각도(시계방향)
    const baseAlpha = ctx.globalAlpha;

    let x = -totalWidth / 2;
    let cum = 0;
    chars.forEach((c, i) => {
      const w = widths[i];
      const midX = cum + w / 2;
      const t = n > 1 ? i / (n - 1) : 0;
      const eased = Math.pow(t, 1.6); // 앞쪽은 거의 그대로, 뒤로 갈수록 급격히 처짐

      const jitterY = (pseudoRandom(seed + i * 17.3 + 11) - 0.5) * baseFontSize * 0.16 * wobble;
      const jitterRot = (pseudoRandom(seed + i * 23.1 + 37) - 0.5) * 12 * wobble;
      const jitterAlpha = 1 - pseudoRandom(seed + i * 13.7 + 59) * 0.4 * wobble;
      const jitterScale = 1 - pseudoRandom(seed + i * 9.3 + 83) * 0.06 * wobble;

      const dip = eased * maxDip + jitterY;
      const rot = (eased * maxRotDeg + jitterRot) * Math.PI / 180;
      const scaleY = (1 - eased * 0.14 * droop) * jitterScale;
      const scaleX = (1 + eased * 0.1 * droop) * (2 - jitterScale);

      ctx.save();
      ctx.translate(x + w / 2, baseY + dip);
      ctx.rotate(rot);
      ctx.scale(scaleX, scaleY);
      ctx.globalAlpha = baseAlpha * jitterAlpha;
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();

      x += w;
      cum += w;
    });

    ctx.restore();
  }


  // 첫 글자는 중심(반지름 0 부근)에서 시작해서, 뒤로 갈수록 아르키메데스 나선(r = b·θ)을 따라
  // 바깥으로 점점 벌어지며 뻗어나감. 글자가 많을수록(문자열이 길수록) 회전각(θ)이 더 많이
  // 누적되고 반지름도 더 커지므로, 자연스럽게 "글이 길어지면 나선도 더 커지는" 모양이 됨.
  // 각 글자 사이의 각도 간격은 현재 반지름에서의 호의 길이가 그 글자 폭 정도가 되도록 계산해서
  // 중심부에서 글자끼리 심하게 겹치지 않게 함
  function drawSpiralPass(ctx){
    const cfg = this.spiralText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const growth = cfg.growth != null ? cfg.growth : 6; // 나선이 한 바퀴(2π) 돌 때 반지름이 늘어나는 기준값
    const flip = !!cfg.flip;
    const fontSize = this.fontSize;
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${fontSize}px ${this.fontFamily}`).trim();

    ctx.save();
    ctx.font = fontDecl;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const widths = chars.map(c => Math.max(1, ctx.measureText(c).width));

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';
    const hasStroke = this.stroke && this.strokeWidth > 0;
    const strokeFirst = this.paintFirst === 'stroke';
    const dir = flip ? -1 : 1;

    const b = growth / (Math.PI * 2); // r = b·θ (아르키메데스 나선 계수)
    const minR = fontSize * 0.15; // 중심부 최소 반지름(글자가 한 점에 완전히 겹치지 않도록)

    // 첫 글자부터 나선 공식(r = b·θ) 위에 정확히 놓이도록, r이 minR이 되는 지점부터 시작함
    // (이렇게 해야 첫 글자만 따로 튕겨나간 것처럼 보이지 않고 나머지 글자와 자연스럽게 이어짐)
    let theta = b > 0 ? minR / b : 0;
    chars.forEach((c, i) => {
      const r = b * theta;
      const x = Math.sin(theta) * r * dir;
      const y = -Math.cos(theta) * r;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(theta * dir);
      const drawFill = () => { if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); } };
      const drawStroke = () => { if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); } };
      if (strokeFirst) { drawStroke(); drawFill(); } else { drawFill(); drawStroke(); }
      ctx.restore();

      const dTheta = widths[i] / Math.max(r, minR * 0.6);
      theta += dTheta;
    });

    ctx.restore();
  }

  // 퍼즐 조각 한 변에 돌기(바깥으로 볼록) 또는 홈(안으로 오목)을 하나 넣어서 이어 그림
  // (nx,ny)는 이 변의 바깥쪽을 향하는 방향, dir이 +1이면 돌기, -1이면 홈
  function addPuzzleEdge(ctx, x0, y0, x1, y1, nx, ny, dir, r){
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const t1x = x0 + ux * (len * 0.5 - r), t1y = y0 + uy * (len * 0.5 - r);
    const t2x = x0 + ux * (len * 0.5 + r), t2y = y0 + uy * (len * 0.5 + r);
    const midx = x0 + ux * len * 0.5, midy = y0 + uy * len * 0.5;
    const bx = midx + nx * r * 1.35 * dir, by = midy + ny * r * 1.35 * dir;
    ctx.lineTo(t1x, t1y);
    ctx.bezierCurveTo(
      t1x + nx * r * dir, t1y + ny * r * dir,
      bx - ux * r * 0.9, by - uy * r * 0.9,
      bx, by
    );
    ctx.bezierCurveTo(
      bx + ux * r * 0.9, by + uy * r * 0.9,
      t2x + nx * r * dir, t2y + ny * r * dir,
      t2x, t2y
    );
    ctx.lineTo(x1, y1);
  }
  // (ox,oy) 중심, 폭 w·높이 h인 사각형의 네 변마다 위 addPuzzleEdge로 돌기/홈을 랜덤 배치해서
  // 실제 직소 퍼즐 조각처럼 보이는 윤곽선의 path를 만듦(채우기/테두리는 호출한 쪽에서 처리)
  function tracePuzzlePiece(ctx, ox, oy, w, h, seed, bumpT){
    const halfW = w / 2, halfH = h / 2;
    const left = ox - halfW, right = ox + halfW, top = oy - halfH, bottom = oy + halfH;
    const r = Math.min(w, h) * (0.1 + Math.max(0, Math.min(1, bumpT)) * 0.16);
    const dirs = [0, 1, 2, 3].map(i => (pseudoRandom(seed + i * 37.7 + 13) > 0.5 ? 1 : -1));
    ctx.beginPath();
    ctx.moveTo(left, top);
    addPuzzleEdge(ctx, left, top, right, top, 0, -1, dirs[0], r);
    addPuzzleEdge(ctx, right, top, right, bottom, 1, 0, dirs[1], r);
    addPuzzleEdge(ctx, right, bottom, left, bottom, 0, 1, dirs[2], r);
    addPuzzleEdge(ctx, left, bottom, left, top, -1, 0, dirs[3], r);
    ctx.closePath();
  }
  // 글자 하나하나를 각기 다른 색의 직소 퍼즐 조각 위에 얹어서 그림. 조각 모양(돌기/홈 배치)과
  // 색상 모두 seed로 정해지며, "다시 맞추기"를 누를 때마다 모양과 색이 통째로 다시 섞임.
  // 조각 색의 밝기에 따라 글자 색(밝은 조각→어두운 글자, 어두운 조각→흰 글자)을 자동으로 골라
  // 항상 눈에 잘 띄게 함
  function drawPuzzlePass(ctx){
    const cfg = this.puzzleText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const seed = cfg.seed || 0;
    const bumpT = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    const baseFontSize = this.fontSize;
    const op = this.opacity != null ? this.opacity : 1;
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();

    ctx.save();
    ctx.font = fontDecl;
    ctx.textBaseline = 'alphabetic';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const widths = chars.map(c => Math.max(1, ctx.measureText(c).width));
    const padX = baseFontSize * 0.24, padY = baseFontSize * 0.2;
    const pieceH = baseFontSize + padY * 2;
    const spacingExtra = baseFontSize * 0.16;
    const pieceWidths = widths.map(w => w + padX * 2);
    const totalWidth = pieceWidths.reduce((a, b) => a + b + spacingExtra, 0) - spacingExtra;

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const pw = pieceWidths[i];
      const cx = x + pw / 2;
      const pieceSeed = seed + i * 199 + 7;

      const hue = pseudoRandom(seed + i * 29.3 + 251) * 360;
      const sat = 0.5 + pseudoRandom(seed + i * 17.1 + 91) * 0.4;
      const val = 0.55 + pseudoRandom(seed + i * 11.3 + 171) * 0.35;
      const rgb = EP.hsvToRgb(hue, sat, val);
      const pieceColor = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
      const inkColor = luminance > 150 ? '#222222' : '#ffffff';

      ctx.save();
      ctx.translate(cx, 0);
      ctx.globalAlpha = op;

      // 퍼즐 조각 그림자 — 살짝 떠 있는 느낌
      ctx.save();
      ctx.globalAlpha = op * 0.28;
      ctx.fillStyle = '#000000';
      tracePuzzlePiece(ctx, baseFontSize * 0.04, baseFontSize * 0.055, pw, pieceH, pieceSeed, bumpT);
      ctx.fill();
      ctx.restore();

      // 퍼즐 조각 본체
      ctx.fillStyle = pieceColor;
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1, baseFontSize * 0.02);
      tracePuzzlePiece(ctx, 0, 0, pw, pieceH, pieceSeed, bumpT);
      ctx.fill();
      ctx.stroke();

      // 조각 위 글자
      ctx.font = fontDecl;
      ctx.textAlign = 'center';
      ctx.fillStyle = inkColor;
      ctx.fillText(c, 0, baseFontSize * 0.35);

      ctx.restore();
      x += pw + spacingExtra;
    });

    ctx.restore();
  }

  const RANDOM_TYPO_BASE_FONTS = ['Pretendard', 'Noto Sans KR', 'Nanum Gothic', 'Black Han Sans', 'Do Hyeon', 'Jua', 'Gowun Dodum', 'Roboto', 'Montserrat', 'Playfair Display', 'Bebas Neue', 'Arial'];

  // ---- 잡지 오려붙인 효과 (레이아웃 효과) ----
  const MAGAZINE_PAPER_COLORS = ['#fef6e4', '#ffe9ec', '#e8f6ef', '#eef2ff', '#fff4d6', '#f3e8ff', '#e0f7ff', '#ffeef0', '#f0fff4', '#fff0e0', '#fff8c9'];
  // 폭 w, 높이 h인 사각형을 (ox,oy) 중심 기준으로 가장자리를 삐뚤빼뚤하게(찢어진 종이처럼) 그려서 채움
  function fillTornRect(ctx, ox, oy, w, h, seed){
    const left = -w / 2 + ox, right = w / 2 + ox, top = -h / 2 + oy, bottom = h / 2 + oy;
    const jag = Math.min(w, h) * 0.09;
    const perSide = 3;
    const pts = [];
    function addEdge(x0, y0, x1, y1, base){
      for (let i = 0; i < perSide; i++) {
        const t = i / perSide;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const rx = (pseudoRandom(seed + base + i * 7.1) * 2 - 1) * jag;
        const ry = (pseudoRandom(seed + base + i * 11.3 + 40) * 2 - 1) * jag;
        pts.push([x + rx, y + ry]);
      }
    }
    addEdge(left, top, right, top, 1);
    addEdge(right, top, right, bottom, 101);
    addEdge(right, bottom, left, bottom, 201);
    addEdge(left, bottom, left, top, 301);
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.fill();
  }
  // 글자 하나하나를 각기 다른 색종이 조각(찢어진 가장자리 + 그림자) 위에, 서로 다른 폰트·크기·
  // 기울기로 붙여넣은 것처럼 그려서, 잡지에서 글자를 오려 붙인 협박장(랜섬노트) 느낌을 냄
  function drawMagazinePass(ctx){
    const cfg = this.magazineText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const seed = cfg.seed || 0;
    const jitter = Math.max(0, Math.min(100, cfg.jitter != null ? cfg.jitter : 60)) / 100;
    const baseFontSize = this.fontSize;
    const op = this.opacity != null ? this.opacity : 1;

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const fontPool = RANDOM_TYPO_BASE_FONTS.concat(Array.from(EP.customFontNames));

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const charInfo = chars.map((c, i) => {
      const font = fontPool[Math.floor(pseudoRandom(seed + i * 13.1 + 1) * fontPool.length) % fontPool.length];
      const scale = 0.92 + pseudoRandom(seed + i * 7.7 + 51) * 0.22;
      const fs = baseFontSize * scale;
      ctx.font = `${fs}px ${font}`;
      const w = Math.max(1, ctx.measureText(c).width);
      return { c, font, fs, w };
    });
    const spacingExtra = baseFontSize * 0.2;
    const totalWidth = charInfo.reduce((a, ci) => a + ci.w + spacingExtra, 0) - spacingExtra;

    let x = -totalWidth / 2;
    charInfo.forEach((ci, i) => {
      const rot = (pseudoRandom(seed + i * 17.3 + 101) * 2 - 1) * 0.22 * jitter;
      const dy = (pseudoRandom(seed + i * 19.9 + 151) * 2 - 1) * baseFontSize * 0.14 * jitter;
      const paperColor = MAGAZINE_PAPER_COLORS[Math.floor(pseudoRandom(seed + i * 23.1 + 201) * MAGAZINE_PAPER_COLORS.length) % MAGAZINE_PAPER_COLORS.length];
      const inkHue = pseudoRandom(seed + i * 29.3 + 251) * 360;
      const inkRgb = EP.hsvToRgb(inkHue, 0.55 + pseudoRandom(seed + i * 41.7 + 351) * 0.4, 0.25 + pseudoRandom(seed + i * 47.1 + 451) * 0.45);
      const inkColor = EP.rgbToHex(inkRgb.r, inkRgb.g, inkRgb.b);

      const cx = x + ci.w / 2;
      const padX = baseFontSize * 0.14, padY = baseFontSize * 0.18;
      const pw = ci.w + padX * 2, ph = ci.fs + padY * 2;

      ctx.save();
      ctx.translate(cx, dy);
      ctx.rotate(rot);
      ctx.globalAlpha = op;

      // 종이 조각 그림자 — 살짝 떠 있는 느낌
      ctx.save();
      ctx.globalAlpha = op * 0.3;
      ctx.fillStyle = '#000000';
      fillTornRect(ctx, baseFontSize * 0.035, baseFontSize * 0.05, pw, ph, seed + i * 3 + 301);
      ctx.restore();

      // 찢어진 색종이 조각
      ctx.globalAlpha = op;
      ctx.fillStyle = paperColor;
      fillTornRect(ctx, 0, 0, pw, ph, seed + i * 5 + 401);

      // 잉크 색 글자 (조각마다 폰트/크기가 조금씩 다름)
      ctx.font = `${ci.fs}px ${ci.font}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = inkColor;
      ctx.fillText(ci.c, 0, ci.fs * 0.32);

      ctx.restore();

      x += ci.w + spacingExtra;
    });

    ctx.restore();
  }

  // 구름 배경 — 여러 개의 원을 겹쳐서 뭉게뭉게한 구름 실루엣을 만들고, 위치/크기를 랜덤하게
  // 흩어서 여기저기 떠다니는 느낌을 냄. seed에 따라 가끔(약 50% 확률) 해도 함께 그려짐.
  // 텍스트보다 먼저(맨 뒤에) 그려짐
  function drawSkyBackgroundPass(ctx){
    const cfg = this.skyText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 60)) / 100;

    ctx.save();
    ctx.globalAlpha = op;

    const cloudCount = Math.max(3, Math.round(4 + density * 7));
    for (let ci = 0; ci < cloudCount; ci++) {
      const cx = (pseudoRandom(seed + ci * 17.3 + 1) - 0.5) * w * 2.0;
      const cy = (pseudoRandom(seed + ci * 11.1 + 51) - 0.5) * h * 2.4;
      const cloudSize = fontSize * (0.6 + pseudoRandom(seed + ci * 13.7 + 101) * 1.1);
      const puffCount = 5 + Math.floor(pseudoRandom(seed + ci * 7.9 + 151) * 4);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = op * (0.75 + pseudoRandom(seed + ci * 3.3 + 201) * 0.25);
      // 퍼프들을 가로로 넓게 늘어놓고(전형적인 뭉게구름 실루엣: 위는 둥글둥글, 아래는 납작),
      // 반지름 대비 간격을 좁게 잡아서 서로 크게 겹치게 함 → 동그라미가 따로 보이지 않고
      // 하나로 뭉쳐진 구름 윤곽처럼 보임. 퍼프마다 크기 편차도 크게 줌
      for (let p = 0; p < puffCount; p++) {
        const t = puffCount > 1 ? p / (puffCount - 1) : 0.5;
        const px = (t - 0.5) * cloudSize * 1.4 + (pseudoRandom(seed + ci * 23 + p * 5 + 251) * 2 - 1) * cloudSize * 0.1;
        const py = -Math.sin(t * Math.PI) * cloudSize * 0.3 + (pseudoRandom(seed + ci * 29 + p * 7 + 301) * 2 - 1) * cloudSize * 0.08;
        const pr = cloudSize * (0.28 + pseudoRandom(seed + ci * 31 + p * 11 + 351) * 0.45);
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      // 밑면을 납작한 타원으로 덮어서 퍼프들을 하나의 덩어리로 자연스럽게 이어붙임
      ctx.beginPath();
      ctx.ellipse(0, cloudSize * 0.14, cloudSize * 0.85, cloudSize * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 가끔(약 50% 확률) 등장하는 해
    if (pseudoRandom(seed + 9999) < 0.5) {
      const sx = (pseudoRandom(seed + 8888) - 0.5) * w * 1.6;
      const sy = (pseudoRandom(seed + 7777) - 0.5) * h * 1.6 - h * 0.35;
      const sunR = fontSize * 0.5;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = op * 0.9;
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = Math.max(1, fontSize * 0.04);
      for (let r = 0; r < 8; r++) {
        const a = (r / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * sunR * 1.3, Math.sin(a) * sunR * 1.3);
        ctx.lineTo(Math.cos(a) * sunR * 1.9, Math.sin(a) * sunR * 1.9);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.fillStyle = '#ffd34d';
      ctx.arc(0, 0, sunR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // ---- 광원 효과 (레이어 효과) ----
  // 지정한 각도 방향의 텍스트 바깥쪽에 밝은 광원을 두고, 포토샵의 "스크린" 블렌드 모드처럼
  // globalCompositeOperation='screen'으로 겹쳐 그림 — 어두운 부분은 살짝만, 밝은 부분은 크게
  // 밝아지는 스크린 특유의 부드러운 발광 느낌을 냄.
  // 구성: ①한가운데 작지만 확실히 밝은 코어 → ②부드럽게 퍼지는 메인 광원 →
  // ③광원을 은은하게 감싸는 햇무리(halo) 고리 → ④텍스트 쪽으로 뻗어나가는 메인 빛살 →
  // ⑤광원 사방으로 무작위 뻗어나가는 직선 햇무리(광선) 여러 가닥.
  // 전부 그라데이션으로만 표현해서 경계가 뚜렷하지 않게 하고, "전체 크기"로 광원 전체를
  // 한번에 확대/축소할 수 있게 함
  function drawLightSourcePass(ctx){
    const cfg = this.lightText;
    if (!cfg) return;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const diag = Math.hypot(w, h);
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const angle = ((cfg.angle != null ? cfg.angle : 315) * Math.PI) / 180;
    const color = cfg.color || '#ffc233';
    const op = this.opacity != null ? this.opacity : 1;
    const rgb = EP.hexToRgb(color);
    const rgba = (a) => `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.max(0, Math.min(1, a))})`;
    // 전체 크기: 위치(광원까지의 거리)와 반경을 함께 스케일링해서, 작게 줄여도 비율이
    // 흐트러지지 않고 광원 전체가 통째로 작아지거나 커지게 함
    const sizeScale = Math.max(0.1, (cfg.scale != null ? cfg.scale : 100) / 100);

    // 광원 위치: 텍스트 바깥쪽, 지정한 각도 방향으로 대각선 길이의 절반 남짓 떨어진 지점.
    // "좌우 위치"로 이 지점을 좌우로 자유롭게 더 밀어서, 각도와 별개로 광원을 옆으로 옮길 수 있음
    const dist = diag * 0.5 * sizeScale;
    const offsetX = ((cfg.offsetX || 0) / 100) * diag * sizeScale;
    const lx = Math.cos(angle) * dist + offsetX;
    const ly = Math.sin(angle) * dist;
    const burstR = diag * (0.5 + amt * 0.45) * sizeScale;
    // 크기(반경)와 상관없이 최소 강도를 높게 잡아서, 작게 설정해도 빛 자체는 확실히 강하게 보이게 함
    const baseAlpha = op * (0.55 + amt * 0.4);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // ① 가장 안쪽 코어 — 흰빛에 가까운 뜨거운 중심부(작아도 강하게 보이는 핵심)
    ctx.globalAlpha = Math.min(1, baseAlpha * 1.15);
    const coreR = burstR * 0.4;
    const core = ctx.createRadialGradient(lx, ly, 0, lx, ly, coreR);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, color);
    core.addColorStop(1, rgba(0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(lx, ly, coreR, 0, Math.PI * 2);
    ctx.fill();

    // ② 부드럽게 퍼지는 메인 광원
    ctx.globalAlpha = baseAlpha;
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, burstR);
    grad.addColorStop(0, color);
    grad.addColorStop(0.3, color);
    grad.addColorStop(1, rgba(0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, burstR, 0, Math.PI * 2);
    ctx.fill();

    // ③ 햇무리 고리(halo ring) — 광원을 은은하게 감싸는 둥근 고리 하나를, 방사형 그라데이션의
    // 알파를 투명→밝음→투명 순으로 배치해서 자연스러운 링 형태로 표현. "빛무리 폭"으로
    // 이 밝은 띠의 두께(좁게~넓게)를 조절함
    const haloR = burstR * 1.7;
    const haloWidthT = Math.max(0, Math.min(100, cfg.haloWidth != null ? cfg.haloWidth : 50)) / 100;
    const bandHalf = 0.04 + haloWidthT * 0.3;
    const ringPeak = 0.68;
    const ringPre = Math.max(0, ringPeak - bandHalf);
    const ringPost = Math.min(1, ringPeak + bandHalf);
    ctx.globalAlpha = baseAlpha * 0.5;
    const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, haloR);
    halo.addColorStop(0, rgba(0));
    halo.addColorStop(ringPre, rgba(0));
    halo.addColorStop(ringPeak, rgba(0.9));
    halo.addColorStop(ringPost, rgba(0));
    halo.addColorStop(1, rgba(0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lx, ly, haloR, 0, Math.PI * 2);
    ctx.fill();

    // ④ 광원에서 텍스트를 가로질러 뻗어나가는 메인 빛살 — 선 색을 단색으로 칠하지 않고
    // 길이 방향 선형 그라데이션(광원 쪽은 밝고 끝으로 갈수록 투명)을 써서 끝부분이
    // 뚝 끊기지 않고 자연스럽게 사라지게 함
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1; // 알파는 그라데이션 안에서 이미 처리하므로 여기선 1로 둠
    const rayCount = 7;
    const rayLen = burstR * 2.1;
    for (let i = 0; i < rayCount; i++) {
      const spread = (i / (rayCount - 1) - 0.5) * (Math.PI * 0.6);
      const a = angle + Math.PI + spread; // 광원에서 텍스트 중심을 지나가는 방향
      const edge = Math.abs(i / (rayCount - 1) - 0.5) * 2; // 0(중앙)~1(가장자리)
      const ex = lx + Math.cos(a) * rayLen, ey = ly + Math.sin(a) * rayLen;
      const rayPeak = baseAlpha * 0.6 * (1 - edge * 0.85);
      const rayGrad = ctx.createLinearGradient(lx, ly, ex, ey);
      rayGrad.addColorStop(0, rgba(rayPeak));
      rayGrad.addColorStop(0.45, rgba(rayPeak * 0.4));
      rayGrad.addColorStop(1, rgba(0));
      ctx.strokeStyle = rayGrad;
      ctx.lineWidth = burstR * (0.05 + (1 - edge) * 0.03);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // ⑤ 햇무리(직선 광선) 여러 가닥 — 광원을 중심으로 사방(360도) 무작위 방향으로 뻗어나가는
    // 가는 빛줄기들. 점이 아니라 실제 "선"으로, ④의 메인 빛살과 같은 방식(길이 방향
    // 그라데이션)으로 그려서 끝이 자연스럽게 사라짐. seed로 방향·길이·굵기가 고정되어
    // "다시 뿌리기"를 눌러야 새로 바뀜
    const haloCount = Math.max(0, Math.min(30, Math.round(cfg.haloCount || 0)));
    if (haloCount > 0) {
      const seed = cfg.seed || 0;
      for (let i = 0; i < haloCount; i++) {
        const ra = pseudoRandom(seed + i * 12.9 + 3) * Math.PI * 2;
        const lenT = 0.7 + pseudoRandom(seed + i * 7.7 + 91) * 1.3;
        const rl = burstR * lenT * 2;
        const ex = lx + Math.cos(ra) * rl, ey = ly + Math.sin(ra) * rl;
        const peakA = baseAlpha * (0.3 + pseudoRandom(seed + i * 5.3 + 233) * 0.45);
        const rg = ctx.createLinearGradient(lx, ly, ex, ey);
        rg.addColorStop(0, rgba(peakA));
        rg.addColorStop(0.4, rgba(peakA * 0.35));
        rg.addColorStop(1, rgba(0));
        ctx.strokeStyle = rg;
        ctx.lineWidth = burstR * (0.012 + pseudoRandom(seed + i * 9.1 + 455) * 0.02);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // 하트 하나를 그림(두 개의 베지어 곡선으로 이루어진 전형적인 하트 모양)
  function drawHeartShape(ctx, cx, cy, size, color){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.32);
    ctx.bezierCurveTo(size * 0.5, -size * 0.3, size * 1.05, size * 0.35, 0, size * 1.05);
    ctx.bezierCurveTo(-size * 1.05, size * 0.35, -size * 0.5, -size * 0.3, 0, size * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- 수줍수줍 효과 (배경 효과) ----
  // 텍스트 둘레에 위치와 길이가 제각각인 짧은 빗금 조각들을 여기저기 흩뿌려서 부분적으로만
  // 비스듬한 무늬가 드러나게 하고, 그 사이사이에 작은 점과 하트를 랜덤하게 흩뿌려서 수줍고
  // 사랑스러운 느낌을 냄. 글자보다 먼저(맨 뒤에) 그려져서 글자 자체 색은 그대로 유지되고,
  // 주변에만 무늬가 화사하게 둘러싸는 형태가 됨
  function drawShyPass(ctx){
    const cfg = this.shyText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 55)) / 100;
    const color = cfg.color || '#ffb3c6';
    const rgb = EP.hexToRgb(color);

    const padX = w * 0.55, padY = h * 1.5;
    const areaW = w + padX * 2, areaH = h + padY * 2;

    ctx.save();
    ctx.globalAlpha = op;

    // ① 빗금 무늬 — 자로 그은 듯한 긴 줄이 아니라, 위치와 길이가 제각각인 짧은 빗금 조각들을
    // 여기저기 흩뿌려서 부분적으로만 비스듬한 줄무늬가 드러나게 함
    const segCount = Math.max(6, Math.round(10 + amt * 34));
    const angle = -62 * Math.PI / 180;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`;
    ctx.lineCap = 'round';
    for (let i = 0; i < segCount; i++) {
      const cx2 = (pseudoRandom(seed + i * 11.3 + 1) - 0.5) * areaW;
      const cy2 = (pseudoRandom(seed + i * 13.7 + 51) - 0.5) * areaH;
      const len = fontSize * (0.45 + pseudoRandom(seed + i * 17.1 + 101) * 1.7);
      ctx.lineWidth = Math.max(1.2, fontSize * (0.018 + pseudoRandom(seed + i * 19.3 + 151) * 0.022));
      ctx.globalAlpha = op * (0.35 + pseudoRandom(seed + i * 23.7 + 201) * 0.45);
      ctx.beginPath();
      ctx.moveTo(cx2 - ux * len / 2, cy2 - uy * len / 2);
      ctx.lineTo(cx2 + ux * len / 2, cy2 + uy * len / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = op;

    // ② 작은 점 무늬 — 줄무늬 사이사이에 성글게 흩뿌림
    const dotCount = Math.max(6, Math.round(8 + amt * 22));
    for (let i = 0; i < dotCount; i++) {
      const px = (pseudoRandom(seed + i * 13.7 + 501) - 0.5) * areaW;
      const py = (pseudoRandom(seed + i * 17.1 + 551) - 0.5) * areaH;
      const r = fontSize * (0.02 + pseudoRandom(seed + i * 7.9 + 601) * 0.035);
      ctx.globalAlpha = op * (0.5 + pseudoRandom(seed + i * 5.3 + 651) * 0.4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ③ 하트 무늬 — 점보다 성글게, 랜덤한 위치·크기로 흩뿌림
    const heartCount = Math.max(2, Math.round(3 + amt * 8));
    for (let i = 0; i < heartCount; i++) {
      const px = (pseudoRandom(seed + i * 19.3 + 1001) - 0.5) * areaW;
      const py = (pseudoRandom(seed + i * 23.1 + 1051) - 0.5) * areaH;
      const size = fontSize * (0.09 + pseudoRandom(seed + i * 11.1 + 1101) * 0.09);
      ctx.globalAlpha = op * (0.55 + pseudoRandom(seed + i * 9.7 + 1151) * 0.35);
      drawHeartShape(ctx, px, py - size * 0.35, size, color);
    }
    ctx.globalAlpha = op;

    ctx.restore();
  }


  // 하늘 위 글씨 레이아웃 — 글자 하나하나를 랜덤 크기·랜덤 방향으로 배치하되, 폰트(글씨체)는
  // 모든 글자가 동일하게 유지함. 각 글자의 실제(스케일된) 폭만큼 자리를 미리 배정해서 커진
  // 글자가 옆 글자를 침범하지 않게 하고, 흔들림 폭도 그 자리 안으로 제한해 겹치지 않게 함.
  // 각 글자에 하얀 테두리를 둘러서 구름 위에 동동 떠 있는 듯한 느낌을 냄
  function drawSkyLettersPass(ctx){
    const cfg = this.skyText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const seed = cfg.seed || 0;
    const baseFontSize = this.fontSize;
    const fontStyle = this.fontStyle || '', fontWeight = this.fontWeight || '', fontFamily = this.fontFamily;

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    // 글자마다 크기(스케일)를 먼저 정한 뒤, 그 스케일의 실제 폭을 측정해서 자리를 배정
    const scales = chars.map((c, i) => 0.75 + pseudoRandom(seed + i * 13.1 + 1) * 0.6);
    const sizes = scales.map(s => baseFontSize * s);
    const widths = chars.map((c, i) => {
      ctx.font = `${fontStyle} ${fontWeight} ${sizes[i]}px ${fontFamily}`.trim();
      return Math.max(1, ctx.measureText(c).width);
    });
    const gap = baseFontSize * 0.2;
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);

    const hasFill = this.fill && this.fill !== 'transparent' && this.fill !== '';

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const w = widths[i];
      const fs = sizes[i];
      const baseCx = x + w / 2;
      // 자기 자리(폭) 안에서만 살짝 흔들리게 해서 옆 글자와 겹치지 않도록 제한
      const jitterX = (pseudoRandom(seed + i * 7.7 + 51) * 2 - 1) * Math.min(w, gap) * 0.25;
      const jitterY = (pseudoRandom(seed + i * 11.3 + 101) * 2 - 1) * baseFontSize * 0.2;
      const rot = (pseudoRandom(seed + i * 17.9 + 151) * 2 - 1) * 0.22;

      ctx.save();
      ctx.translate(baseCx + jitterX, jitterY);
      ctx.rotate(rot);
      ctx.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`.trim();
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, fs * 0.14);
      ctx.strokeText(c, 0, 0);
      if (hasFill) { ctx.fillStyle = this.fill; ctx.fillText(c, 0, 0); }
      ctx.restore();

      x += w + gap;
    });

    ctx.restore();
  }

  // 칠판 글씨 색 팔레트 — 파랑/노랑/분홍/회색 분필
  const CHALK_COLORS = ['#5b9bd5', '#f2d024', '#e8a6c1', '#b5b5b5'];
  // 칠판 글씨 효과 — 보통 위치대로(가로로 순서대로) 글자를 배치하되, 글자마다 분필색을
  // 랜덤으로 배정하고, 살짝 어긋난 복사본을 여러 겹 겹쳐 그려 분필 특유의 부슬부슬한
  // 가장자리를 표현한 뒤, 그 주변에 작은 분필가루 점들을 흩뿌림. 배치는 seed로 고정 —
  // "다시 쓰기"를 눌러야 색/질감이 새로 바뀜
  function drawChalkPass(ctx){
    const cfg = this.chalkText;
    const text = this.text || '';
    if (!cfg || !text.length) { origItextRender.call(this, ctx); return; }

    const seed = cfg.seed || 0;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    const fontSize = this.fontSize;
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${fontSize}px ${this.fontFamily}`).trim();
    const op = this.opacity != null ? this.opacity : 1;

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    ctx.save();
    ctx.font = fontDecl;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const widths = chars.map(c => Math.max(1, ctx.measureText(c).width));
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const yBase = fontSize * 0.32;

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const w = widths[i];
      const color = CHALK_COLORS[Math.floor(pseudoRandom(seed + i * 13.7 + 1) * CHALK_COLORS.length) % CHALK_COLORS.length];

      ctx.save();
      ctx.beginPath();
      ctx.rect(x - fontSize * 0.15, -fontSize * 1.0, w + fontSize * 0.3, fontSize * 1.6);
      ctx.clip();

      // 거친 질감 — 살짝씩 어긋난 얇은 복사본을 여러 겹 겹쳐 그려 부슬부슬한 가장자리를 냄
      const roughPasses = Math.max(1, Math.round(2 + amt * 4));
      for (let r = 0; r < roughPasses; r++) {
        const ox = (pseudoRandom(seed + i * 7 + r * 3 + 101) * 2 - 1) * fontSize * 0.018 * amt;
        const oy = (pseudoRandom(seed + i * 11 + r * 5 + 201) * 2 - 1) * fontSize * 0.018 * amt;
        ctx.globalAlpha = op * (r === 0 ? 1 : 0.3);
        ctx.fillStyle = color;
        ctx.font = fontDecl;
        ctx.fillText(c, x + ox, yBase + oy);
      }

      // 분필가루 — 글자 주변에 작은 점들을 옅게 흩뿌림
      const speckCount = Math.round(4 + amt * 12);
      for (let s = 0; s < speckCount; s++) {
        const sx = x + pseudoRandom(seed + i * 17 + s * 3 + 301) * w;
        const sy = -fontSize * 0.55 + pseudoRandom(seed + i * 19 + s * 5 + 401) * fontSize * 0.95;
        const sr = fontSize * 0.006 + pseudoRandom(seed + i * 23 + s * 7 + 501) * fontSize * 0.012;
        ctx.globalAlpha = op * (0.15 + pseudoRandom(seed + i * 29 + s * 11 + 601) * 0.3);
        ctx.fillStyle = pseudoRandom(seed + i * 31 + s * 13 + 701) > 0.5 ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      x += w;
    });

    ctx.restore();
  }

  // 꽃 한 송이를 그림: 중심 둘레에 타원형 꽃잎 5장을 방사형으로 배치하고 가운데에 꽃술을 찍음
  function drawSimpleFlower(ctx, cx, cy, size, petalColor, centerColor){
    const petals = 5;
    for (let p = 0; p < petals; p++) {
      const ang = (p / petals) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(size * 0.55, 0, size * 0.55, size * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = petalColor;
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = centerColor;
    ctx.fill();
  }

  // ---- 휘날리는 풀밭 효과 (배경 효과) ----
  // 텍스트 아래쪽~둘레에 여러 갈래의 풀잎(보리 싹처럼 가느다랗고 휘어진 잎)을 흩뿌려 심고,
  // 각 잎을 곡선으로 그려서 바람에 옆으로 휘날리는 듯한 인상을 냄. 잎끝 일부에는 작은 보리
  // 이삭(씨앗 알갱이가 줄지어 붙은 모양)을 더하고, 풀 상단 여기저기에는 크기가 제각각인
  // 꽃(꽃잎 색은 매번 랜덤)을 흩뿌려서 화사함을 더함. 글자보다 먼저(맨 뒤에) 그려져서
  // 마치 꽃 핀 풀밭 위에 글자가 놓인 것처럼 보임
  function drawGrassFieldPass(ctx){
    const cfg = this.grassText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
    const wind = Math.max(0, Math.min(100, cfg.wind != null ? cfg.wind : 55)) / 100;
    const baseColor = cfg.color || '#6fae3e';
    const rgb = EP.hexToRgb(baseColor);

    ctx.save();
    ctx.globalAlpha = op;

    const bladeCount = Math.max(6, Math.round(10 + density * 55));
    const bandTop = h / 2 - fontSize * 0.2;
    const bandBottom = h / 2 + fontSize * 0.95;
    const windPhase = wind * Math.PI * 1.0; // 전체적으로 한쪽으로 쏠리는 바람 방향(기존 대비 2배)

    for (let i = 0; i < bladeCount; i++) {
      const bx = (pseudoRandom(seed + i * 17.3 + 1) - 0.5) * w * 1.6;
      const by = bandTop + pseudoRandom(seed + i * 11.1 + 51) * (bandBottom - bandTop);
      const bladeH = fontSize * (0.32 + pseudoRandom(seed + i * 13.7 + 101) * 0.6);
      const sway = windPhase + (pseudoRandom(seed + i * 7.9 + 151) * 2 - 1) * (0.6 + wind * 1.4);
      const baseTilt = (pseudoRandom(seed + i * 19.3 + 201) * 2 - 1) * 0.6;

      const tone = 0.75 + pseudoRandom(seed + i * 29.7 + 301) * 0.5;
      const bladeColor = `rgb(${Math.min(255, Math.round(rgb.r * tone))},${Math.min(255, Math.round(rgb.g * tone))},${Math.min(255, Math.round(rgb.b * tone))})`;

      const leanX = Math.sin(baseTilt + sway) * bladeH;
      const tipX = bx + leanX;
      const tipY = by - bladeH * Math.cos(baseTilt * 0.4);
      const ctrlX = bx + leanX * 0.45;
      const ctrlY = by - bladeH * 0.55;

      ctx.strokeStyle = bladeColor;
      ctx.lineWidth = fontSize * (0.018 + pseudoRandom(seed + i * 31 + 351) * 0.02);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
      ctx.stroke();

      // 보리 이삭 — 잎 몇 개 끝에는 작은 씨앗 알갱이들이 줄지어 붙은 이삭을 더해줌
      if (pseudoRandom(seed + i * 37 + 401) < 0.32) {
        const earAngle = Math.atan2(tipY - ctrlY, tipX - ctrlX);
        const earLen = fontSize * (0.09 + pseudoRandom(seed + i * 41 + 451) * 0.05);
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(earAngle);
        ctx.fillStyle = '#d9c46b';
        for (let k = -2; k <= 2; k++) {
          ctx.save();
          ctx.rotate(k * 0.36);
          ctx.beginPath();
          ctx.ellipse(earLen * 0.55, 0, earLen * 0.55, earLen * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // 꽃 — 휘날리는 풀 상단 여기저기에, 크기와 꽃잎 색을 매번 랜덤하게 뽑아서 흩뿌림
    const flowerCount = Math.max(2, Math.round(3 + density * 9));
    for (let f = 0; f < flowerCount; f++) {
      const fx = (pseudoRandom(seed + f * 53.1 + 5001) - 0.5) * w * 1.5;
      const fy = bandTop - fontSize * (0.05 + pseudoRandom(seed + f * 47.3 + 5051) * 0.55);
      const fSize = fontSize * (0.07 + pseudoRandom(seed + f * 59.7 + 5101) * 0.15);
      const hue = pseudoRandom(seed + f * 61.3 + 5151) * 360;
      const petalRgb = EP.hsvToRgb(hue, 0.55 + pseudoRandom(seed + f * 67.1 + 5201) * 0.4, 0.85 + pseudoRandom(seed + f * 71.9 + 5251) * 0.15);
      const petalColor = EP.rgbToHex(petalRgb.r, petalRgb.g, petalRgb.b);
      ctx.globalAlpha = op * (0.85 + pseudoRandom(seed + f * 73.3 + 5301) * 0.15);
      drawSimpleFlower(ctx, fx, fy, fSize, petalColor, '#ffce4a');
    }
    ctx.globalAlpha = op;

    ctx.restore();
  }

  // 골프채를 휘두른 직후(팔로우스루) 자세의 간단한 스틱맨 골퍼 — 머리(원)+몸통/다리(직선)+
  // 팔 뒤로 넘어간 클럽(직선)으로만 구성된 아주 단순한 실루엣
  function drawGolferFigure(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 머리
    ctx.beginPath();
    ctx.arc(0, -size * 0.85, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // 몸통
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(size * 0.05, -size * 0.15);
    ctx.stroke();
    // 다리(스윙 후 벌어진 자세)
    ctx.beginPath();
    ctx.moveTo(size * 0.05, -size * 0.15);
    ctx.lineTo(-size * 0.22, size * 0.42);
    ctx.moveTo(size * 0.05, -size * 0.15);
    ctx.lineTo(size * 0.3, size * 0.42);
    ctx.stroke();
    // 팔 + 클럽(공을 친 뒤 몸 뒤쪽 위로 넘어간 팔로우스루 자세)
    ctx.beginPath();
    ctx.moveTo(0.02 * size, -size * 0.55);
    ctx.lineTo(-size * 0.32, -size * 0.78);
    ctx.lineTo(-size * 0.6, -size * 1.18);
    ctx.stroke();
    ctx.restore();
  }

  // 딤플이 있는 하얀 골프공
  function drawGolfBall(ctx, x, y, r, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color || '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(0.4, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 야구 타격 자세의 간단한 스틱맨: 머리(원)+몸통+다리(타격 스탠스)+
  // 양팔을 뻗어 몸 앞쪽으로 휘두른 배트로 구성
  function drawBaseballFigure(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 머리
    ctx.beginPath();
    ctx.arc(0, -size * 0.85, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // 몸통
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(0, -size * 0.1);
    ctx.stroke();
    // 다리(타격 스탠스로 벌린 자세)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.lineTo(-size * 0.26, size * 0.42);
    ctx.moveTo(0, -size * 0.1);
    ctx.lineTo(size * 0.22, size * 0.42);
    ctx.stroke();
    // 팔 + 배트(몸 앞쪽으로 휘두른 자세)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.lineTo(size * 0.3, -size * 0.62);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.3, -size * 0.62);
    ctx.lineTo(size * 0.78, -size * 0.98);
    ctx.stroke();
    ctx.restore();
  }

  // 축구 킥 자세의 간단한 스틱맨: 머리(원)+살짝 기운 몸통+
  // 축(디딤)다리 + 앞으로 뻗어찬 다리 + 균형 잡는 두 팔
  function drawSoccerFigure(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 머리
    ctx.beginPath();
    ctx.arc(0, -size * 0.85, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // 몸통(살짝 기울어짐)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(-size * 0.05, -size * 0.2);
    ctx.stroke();
    // 디딤 다리
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, -size * 0.2);
    ctx.lineTo(-size * 0.15, size * 0.42);
    ctx.stroke();
    // 킥하는 다리(앞으로 쭉 뻗음)
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, -size * 0.2);
    ctx.lineTo(size * 0.42, size * 0.12);
    ctx.stroke();
    // 팔(균형)
    ctx.beginPath();
    ctx.moveTo(-size * 0.02, -size * 0.55);
    ctx.lineTo(-size * 0.35, -size * 0.7);
    ctx.moveTo(-size * 0.02, -size * 0.55);
    ctx.lineTo(size * 0.28, -size * 0.68);
    ctx.stroke();
    ctx.restore();
  }

  // 만세하며 뛰는(맨몸 운동) 자세의 간단한 스틱맨: 팔을 위로 V자로 뻗고
  // 다리를 양옆으로 벌린 점핑잭 포즈
  function drawExerciseFigure(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 머리
    ctx.beginPath();
    ctx.arc(0, -size * 0.85, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // 몸통
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(0, -size * 0.15);
    ctx.stroke();
    // 다리(양옆으로 벌린 자세)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.15);
    ctx.lineTo(-size * 0.32, size * 0.42);
    ctx.moveTo(0, -size * 0.15);
    ctx.lineTo(size * 0.32, size * 0.42);
    ctx.stroke();
    // 팔(위로 V자로 뻗은 자세)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(-size * 0.35, -size * 1.05);
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(size * 0.35, -size * 1.05);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 골프 효과 (배경 효과) ----
  // 넓은 필드나 배경 없이, 글자 주위 여러 위치에 사람들을 흩뿌려서 배치함.
  // 각 사람은 골프 스윙/야구 타격/축구 킥/맨몸 운동(점핑잭) 중 하나의 포즈를 랜덤으로 갖고,
  // 골프·야구·축구 포즈에는 각각 어울리는 작은 공을 함께 그려서 무슨 동작인지 알아보기 쉽게 함.
  // 자리(위치)와 크기가 사람마다 랜덤으로 정해지며, "밀도"로 인원 수를,
  // "퍼짐"으로 글자 주변에 흩어지는 범위를 조절함.
  // 글자보다 먼저(맨 뒤에) 그려져서 글자 주변에 사람들이 있는 것처럼 보임.
  function drawGolfPass(ctx){
    const cfg = this.golfText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
    const spread = Math.max(0, Math.min(100, cfg.spread != null ? cfg.spread : 55)) / 100;

    ctx.save();
    ctx.globalAlpha = op;

    // 인원 수 — "밀도"로 조절 (약 3~10명)
    const count = Math.max(3, Math.round(3 + density * 7));
    // 흩뿌리는 범위 — "퍼짐"으로 글자 주변 넓이 조절 (필드 없이 자유롭게 배치)
    const rangeX = w * (0.7 + spread * 0.85);
    const rangeY = h * (0.85 + spread * 1.0) + fontSize * 0.55;

    const POSE_FNS = [drawGolferFigure, drawBaseballFigure, drawSoccerFigure, drawExerciseFigure];

    for (let i = 0; i < count; i++) {
      const px = (pseudoRandom(seed + i * 11.3 + 10) - 0.5) * 2 * rangeX;
      const py = (pseudoRandom(seed + i * 7.7 + 60) - 0.5) * 2 * rangeY;
      const pSize = fontSize * (0.38 + pseudoRandom(seed + i * 13.9 + 110) * 0.34);
      const hue = pseudoRandom(seed + i * 19 + 160) * 360;
      const rgb = EP.hsvToRgb(hue, 0.4 + pseudoRandom(seed + i * 5 + 210) * 0.3, 0.4 + pseudoRandom(seed + i * 5 + 260) * 0.25);
      const color = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      const poseIdx = Math.floor(pseudoRandom(seed + i * 23.7 + 310) * POSE_FNS.length) % POSE_FNS.length;
      const poseFn = POSE_FNS[poseIdx];

      ctx.save();
      ctx.translate(px, py);
      poseFn(ctx, pSize, color);
      ctx.restore();

      // 종목을 알아보기 쉽게 포즈에 어울리는 작은 공을 함께 그림
      if (poseIdx === 0) {
        drawGolfBall(ctx, px - pSize * 0.75, py + pSize * 0.5, pSize * 0.09, '#ffffff');
      } else if (poseIdx === 1) {
        ctx.save();
        ctx.translate(px + pSize * 0.9, py - pSize * 1.08);
        drawBaseballShape(ctx, pSize * 0.28);
        ctx.restore();
      } else if (poseIdx === 2) {
        ctx.save();
        ctx.translate(px + pSize * 0.42, py + pSize * 0.12);
        drawSoccerBallShape(ctx, pSize * 0.32);
        ctx.restore();
      }
    }

    ctx.globalAlpha = op;
    ctx.restore();
  }

  // 크리스마스 트리 장식볼: 매다는 실+금색 캡+공 몸체(그라디언트 하이라이트 포함)
  function drawOrnamentBall(ctx, size, color){
    ctx.save();
    const r = size * 0.5;
    // 매다는 실
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.55);
    ctx.lineTo(0, -r * 1.05);
    ctx.stroke();
    // 캡(고리 부분)
    ctx.fillStyle = '#d9b34a';
    ctx.fillRect(-r * 0.16, -r * 1.15, r * 0.32, r * 0.22);
    // 공 몸체
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = Math.max(0.5, r * 0.05);
    ctx.stroke();
    // 하이라이트
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.32, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
    ctx.restore();
  }

  // 크리스마스 종(방울): 고리+종 몸체(곡선)+밑단+추(clapper)
  function drawOrnamentBell(ctx, size, color){
    ctx.save();
    const s = size * 0.5;
    ctx.fillStyle = color || '#e0b83f';
    // 고리
    ctx.beginPath();
    ctx.arc(0, -s * 1.5, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    // 종 몸체
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.35);
    ctx.quadraticCurveTo(-s * 0.6, -s * 0.6, 0, -s * 1.15);
    ctx.quadraticCurveTo(s * 0.6, -s * 0.6, s * 0.55, s * 0.35);
    ctx.closePath();
    ctx.fill();
    // 종 밑단
    ctx.beginPath();
    ctx.ellipse(0, s * 0.35, s * 0.6, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // 추
    ctx.beginPath();
    ctx.arc(0, s * 0.65, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 지팡이 사탕(캔디케인): 흰 바탕 위에 빨간 점선 줄무늬가 감싼 갈고리 모양
  function drawCandyCane(ctx, size){
    ctx.save();
    const s = size;
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.22;
    const drawPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.7);
      ctx.lineTo(0, -s * 0.15);
      ctx.quadraticCurveTo(0, -s * 0.6, s * 0.35, -s * 0.6);
      ctx.quadraticCurveTo(s * 0.7, -s * 0.6, s * 0.7, -s * 0.3);
    };
    drawPath();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    drawPath();
    ctx.strokeStyle = '#d33333';
    ctx.setLineDash([s * 0.14, s * 0.14]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 선물상자: 상자 몸체+십자 리본+위쪽 나비 매듭
  function drawGiftBox(ctx, size, color){
    ctx.save();
    const s = size;
    ctx.fillStyle = color;
    ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-s * 0.08, -s * 0.35, s * 0.16, s * 0.7);
    ctx.fillRect(-s * 0.5, -s * 0.08, s, s * 0.16);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.35);
    ctx.quadraticCurveTo(-s * 0.32, -s * 0.55, -s * 0.05, -s * 0.4);
    ctx.quadraticCurveTo(-s * 0.05, -s * 0.35, 0, -s * 0.35);
    ctx.quadraticCurveTo(s * 0.05, -s * 0.35, s * 0.05, -s * 0.4);
    ctx.quadraticCurveTo(s * 0.32, -s * 0.55, 0, -s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- 크리스마스 효과 (배경 효과) ----
  // 크리스마스 트리에 다는 장식볼/별/종/지팡이 사탕/선물상자 등 다양한 장식을
  // 글자 주변 여러 위치에 무작위 크기·무작위 방향(회전)으로 흩뿌림.
  // 배경(필드 등) 없이 장식만 흩어져 있고, 글자보다 먼저(맨 뒤에) 그려져서
  // 글자 주변에 장식들이 매달려 있는 듯한 느낌을 줌.
  // "밀도"로 장식 개수를, "퍼짐"으로 글자 주변에 흩어지는 범위를 조절함.
  function drawChristmasPass(ctx){
    const cfg = this.christmasText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
    const spread = Math.max(0, Math.min(100, cfg.spread != null ? cfg.spread : 55)) / 100;

    ctx.save();
    ctx.globalAlpha = op;

    // 장식 개수 — "밀도"로 조절 (약 6~28개)
    const count = Math.max(4, Math.round(6 + density * 22));
    // 흩뿌리는 범위 — "퍼짐"으로 글자 주변 넓이 조절
    const rangeX = w * (0.65 + spread * 0.9);
    const rangeY = h * (0.8 + spread * 1.1) + fontSize * 0.5;

    const PALETTE = ['#c62828', '#2e7d32', '#d4af37', '#1565c0', '#f5f5f0', '#8e24aa'];

    for (let i = 0; i < count; i++) {
      const px = (pseudoRandom(seed + i * 11.3 + 10) - 0.5) * 2 * rangeX;
      const py = (pseudoRandom(seed + i * 7.7 + 60) - 0.5) * 2 * rangeY;
      const size = fontSize * (0.28 + pseudoRandom(seed + i * 13.9 + 110) * 0.4);
      const rot = pseudoRandom(seed + i * 17.1 + 160) * Math.PI * 2;
      const typeIdx = Math.floor(pseudoRandom(seed + i * 23.7 + 210) * 5) % 5;
      const color = PALETTE[Math.floor(pseudoRandom(seed + i * 5.3 + 260) * PALETTE.length) % PALETTE.length];
      ctx.globalAlpha = op * (0.75 + pseudoRandom(seed + i * 3 + 310) * 0.25);

      if (typeIdx === 0) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        drawOrnamentBall(ctx, size, color);
        ctx.restore();
      } else if (typeIdx === 1) {
        const goldHue = 42 + pseudoRandom(seed + i * 9 + 360) * 12;
        const rgb = EP.hsvToRgb(goldHue, 0.55, 0.9);
        drawSparkleStar(ctx, px, py, size * 0.55, EP.rgbToHex(rgb.r, rgb.g, rgb.b), rot);
      } else if (typeIdx === 2) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        drawOrnamentBell(ctx, size, '#e0b83f');
        ctx.restore();
      } else if (typeIdx === 3) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        drawCandyCane(ctx, size * 0.9);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        drawGiftBox(ctx, size * 0.9, color);
        ctx.restore();
      }
    }

    ctx.globalAlpha = op;
    ctx.restore();
  }

  // 단풍잎: 위쪽 뾰족한 끝+좌우 각 2개씩 뾰족한 갈래(총 5갈래)로 이루어진 잎사귀 실루엣 +
  // 중심/좌우로 뻗는 잎맥 + 아래로 뻗은 짧은 잎자루
  function drawMapleLeaf(ctx, size, color){
    ctx.save();
    const s = size * 0.5;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(0.5, size * 0.015);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.15, -s * 0.55);
    ctx.lineTo(s * 0.45, -s * 0.65);
    ctx.lineTo(s * 0.35, -s * 0.3);
    ctx.lineTo(s * 0.75, -s * 0.25);
    ctx.lineTo(s * 0.55, s * 0.05);
    ctx.lineTo(s * 0.85, s * 0.35);
    ctx.lineTo(s * 0.45, s * 0.3);
    ctx.lineTo(s * 0.5, s * 0.75);
    ctx.lineTo(s * 0.15, s * 0.4);
    ctx.lineTo(0, s * 0.65);
    ctx.lineTo(-s * 0.15, s * 0.4);
    ctx.lineTo(-s * 0.5, s * 0.75);
    ctx.lineTo(-s * 0.45, s * 0.3);
    ctx.lineTo(-s * 0.85, s * 0.35);
    ctx.lineTo(-s * 0.55, s * 0.05);
    ctx.lineTo(-s * 0.75, -s * 0.25);
    ctx.lineTo(-s * 0.35, -s * 0.3);
    ctx.lineTo(-s * 0.45, -s * 0.65);
    ctx.lineTo(-s * 0.15, -s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 잎맥
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(0.5, size * 0.012);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, s * 0.55);
    ctx.moveTo(0, -s * 0.2); ctx.lineTo(s * 0.55, -s * 0.05);
    ctx.moveTo(0, -s * 0.2); ctx.lineTo(-s * 0.55, -s * 0.05);
    ctx.moveTo(0, s * 0.1); ctx.lineTo(s * 0.65, s * 0.25);
    ctx.moveTo(0, s * 0.1); ctx.lineTo(-s * 0.65, s * 0.25);
    ctx.stroke();
    // 잎자루
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.65); ctx.lineTo(0, s * 1.0);
    ctx.stroke();
    ctx.restore();
  }

  // 은행잎: 위쪽 가운데가 살짝 패인 부채꼴 모양 + 부챗살처럼 퍼지는 잎맥 + 잎자루
  function drawGinkgoLeaf(ctx, size, color){
    ctx.save();
    const s = size * 0.5;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(0.5, size * 0.015);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.85);
    ctx.bezierCurveTo(-s * 0.95, s * 0.65, -s * 0.9, -s * 0.35, -s * 0.42, -s * 0.55);
    ctx.lineTo(-s * 0.12, -s * 0.78);
    ctx.quadraticCurveTo(0, -s * 0.62, s * 0.12, -s * 0.78);
    ctx.lineTo(s * 0.42, -s * 0.55);
    ctx.bezierCurveTo(s * 0.9, -s * 0.35, s * 0.95, s * 0.65, 0, s * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 부챗살 잎맥
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = Math.max(0.5, size * 0.012);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.8); ctx.lineTo(-s * 0.4, -s * 0.3);
    ctx.moveTo(0, s * 0.8); ctx.lineTo(0, -s * 0.65);
    ctx.moveTo(0, s * 0.8); ctx.lineTo(s * 0.4, -s * 0.3);
    ctx.stroke();
    // 잎자루
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.85); ctx.lineTo(0, s * 1.2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 가을 효과 (배경 효과) ----
  // 단풍잎과 은행잎을 갈색·붉은색·검붉은색 계열로 섞어서 글자 주변 여러 위치에
  // 무작위 크기·무작위 방향(회전)으로 흩뿌림. 배경 없이 잎사귀만 흩어져 있고,
  // 글자보다 먼저(맨 뒤에) 그려져서 글자 주변에 낙엽이 떨어져 있는 듯한 느낌을 줌.
  // "밀도"로 잎사귀 개수를, "퍼짐"으로 글자 주변에 흩어지는 범위를 조절함.
  function drawAutumnPass(ctx){
    const cfg = this.autumnText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
    const spread = Math.max(0, Math.min(100, cfg.spread != null ? cfg.spread : 55)) / 100;

    ctx.save();
    ctx.globalAlpha = op;

    // 잎사귀 개수 — "밀도"로 조절 (약 6~28장)
    const count = Math.max(4, Math.round(6 + density * 22));
    // 흩뿌리는 범위 — "퍼짐"으로 글자 주변 넓이 조절
    const rangeX = w * (0.65 + spread * 0.9);
    const rangeY = h * (0.8 + spread * 1.1) + fontSize * 0.5;

    // 갈색 / 붉은색 / 검붉은색 계열 팔레트
    const AUTUMN_PALETTE = ['#8B4513', '#A0522D', '#B22222', '#8B0000', '#5C1A1A', '#C1440E', '#7B241C', '#9C2B2B'];

    for (let i = 0; i < count; i++) {
      const px = (pseudoRandom(seed + i * 11.3 + 10) - 0.5) * 2 * rangeX;
      const py = (pseudoRandom(seed + i * 7.7 + 60) - 0.5) * 2 * rangeY;
      const size = fontSize * (0.32 + pseudoRandom(seed + i * 13.9 + 110) * 0.42);
      const rot = pseudoRandom(seed + i * 17.1 + 160) * Math.PI * 2;
      const isMaple = pseudoRandom(seed + i * 23.7 + 210) < 0.5;
      const color = AUTUMN_PALETTE[Math.floor(pseudoRandom(seed + i * 5.3 + 260) * AUTUMN_PALETTE.length) % AUTUMN_PALETTE.length];
      ctx.globalAlpha = op * (0.75 + pseudoRandom(seed + i * 3 + 310) * 0.25);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      if (isMaple) { drawMapleLeaf(ctx, size, color); } else { drawGinkgoLeaf(ctx, size, color); }
      ctx.restore();
    }

    ctx.globalAlpha = op;
    ctx.restore();
  }

  // ==== 공용 "흩뿌리기" 배경 효과 팩토리 ====
  // 골프/크리스마스/가을 효과처럼 "글자 주변에 여러 모양을 무작위 위치·크기·방향으로 흩뿌리는"
  // 패턴이 반복되므로, 이 로직을 한 곳에 모아 만든 뒤 새 효과마다 모양 그리기 함수 목록만
  // 넘겨서 재사용함. cfgKey는 this[cfgKey]에서 {density, spread, seed}를 읽어옴.
  // shapeFns의 각 함수는 (ctx, size, itemSeed, index) 형태로 호출됨(원점(0,0)에 그리면 됨).
  // opts: { minCount, baseCount, densityRange, minSize, sizeRange, randomRotation(기본 true) }
  function createScatterPass(cfgKey, shapeFns, opts){
    opts = opts || {};
    return function(ctx){
      const cfg = this[cfgKey];
      if (!cfg) return;
      const seed = cfg.seed || 0;
      const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
      const fontSize = this.fontSize || 40;
      const op = this.opacity != null ? this.opacity : 1;
      const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
      const spread = Math.max(0, Math.min(100, cfg.spread != null ? cfg.spread : 55)) / 100;

      ctx.save();
      ctx.globalAlpha = op;

      const count = Math.max(opts.minCount || 4, Math.round((opts.baseCount || 6) + density * (opts.densityRange || 22)));
      const rangeX = w * (0.65 + spread * 0.9);
      const rangeY = h * (0.8 + spread * 1.1) + fontSize * 0.5;

      for (let i = 0; i < count; i++) {
        const px = (pseudoRandom(seed + i * 11.3 + 10) - 0.5) * 2 * rangeX;
        const py = (pseudoRandom(seed + i * 7.7 + 60) - 0.5) * 2 * rangeY;
        const size = fontSize * ((opts.minSize != null ? opts.minSize : 0.3) + pseudoRandom(seed + i * 13.9 + 110) * (opts.sizeRange != null ? opts.sizeRange : 0.4));
        const rot = opts.randomRotation === false ? 0 : pseudoRandom(seed + i * 17.1 + 160) * Math.PI * 2;
        const fnIdx = Math.floor(pseudoRandom(seed + i * 23.7 + 210) * shapeFns.length) % shapeFns.length;
        const itemSeed = seed + i * 41.7 + 500;
        ctx.globalAlpha = op * (0.75 + pseudoRandom(seed + i * 3 + 310) * 0.25);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        shapeFns[fnIdx](ctx, size, itemSeed, i);
        ctx.restore();
      }
      ctx.globalAlpha = op;
      ctx.restore();
    };
  }
  // 팔레트에서 색상 하나를 itemSeed로 뽑아 원본 그리기 함수에 색을 채워 넘겨주는 래퍼
  function withPalette(drawFn, palette){
    return function(ctx, size, itemSeed){
      const color = palette[Math.floor(pseudoRandom(itemSeed + 901) * palette.length) % palette.length];
      drawFn(ctx, size, color);
    };
  }

  // ---- ① 우주 효과: 반짝이는 별 + 고리 있는 행성 + 꼬리 달린 혜성 ----
  function drawTinyStarShape(ctx, size){
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.5); ctx.lineTo(size * 0.12, -size * 0.12); ctx.lineTo(size * 0.5, 0);
    ctx.lineTo(size * 0.12, size * 0.12); ctx.lineTo(0, size * 0.5); ctx.lineTo(-size * 0.12, size * 0.12);
    ctx.lineTo(-size * 0.5, 0); ctx.lineTo(-size * 0.12, -size * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawPlanetShape(ctx, size, itemSeed){
    ctx.save();
    const hue = pseudoRandom(itemSeed + 1) * 360;
    const rgb = EP.hsvToRgb(hue, 0.5, 0.7);
    ctx.fillStyle = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
    ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.6, size * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawCometShape(ctx, size){
    ctx.save();
    const grad = ctx.createLinearGradient(-size * 0.9, -size * 0.9, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.85)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.9, -size * 0.9); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  var drawSpacePass = createScatterPass('spaceText', [drawTinyStarShape, drawPlanetShape, drawCometShape, drawTinyStarShape]);

  // ---- ② 낙서 효과: 손그림 느낌의 소용돌이 / 화살표 / 하트 스케치 ----
  var DOODLE_PALETTE = ['#2255cc', '#e64545', '#2a2a2a', '#2a9d5c', '#e6a23c'];
  function drawDoodleSwirl(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.08); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const a = t * Math.PI * 4;
      const r = size * 0.5 * t;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawDoodleArrow(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.2); ctx.quadraticCurveTo(0, -size * 0.4, size * 0.5, -size * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.5, -size * 0.1); ctx.lineTo(size * 0.28, -size * 0.28);
    ctx.moveTo(size * 0.5, -size * 0.1); ctx.lineTo(size * 0.3, size * 0.05);
    ctx.stroke();
    ctx.restore();
  }
  function drawDoodleHeart(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.08); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, size * 0.3);
    ctx.bezierCurveTo(-size * 0.5, -size * 0.15, -size * 0.2, -size * 0.5, 0, -size * 0.15);
    ctx.bezierCurveTo(size * 0.2, -size * 0.5, size * 0.5, -size * 0.15, 0, size * 0.3);
    ctx.stroke();
    ctx.restore();
  }
  var drawDoodlePass = createScatterPass('doodleText', [
    withPalette(drawDoodleSwirl, DOODLE_PALETTE),
    withPalette(drawDoodleArrow, DOODLE_PALETTE),
    withPalette(drawDoodleHeart, DOODLE_PALETTE)
  ], { minSize: 0.35, sizeRange: 0.35 });

  // ---- ③ 나비 효과: 좌우 대칭 날개 + 몸통 + 더듬이의 팔랑이는 나비 ----
  var BUTTERFLY_PALETTE = ['#e67e9e', '#f0a93a', '#7b5ce6', '#3aa0e6', '#e64545'];
  function drawButterflyShape(ctx, size, color){
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.7, -size * 0.6, -size * 0.75, size * 0.1, -size * 0.1, size * 0.15);
    ctx.bezierCurveTo(-size * 0.5, size * 0.35, -size * 0.35, size * 0.65, 0, size * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.7, -size * 0.6, size * 0.75, size * 0.1, size * 0.1, size * 0.15);
    ctx.bezierCurveTo(size * 0.5, size * 0.35, size * 0.35, size * 0.65, 0, size * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath(); ctx.moveTo(0, -size * 0.15); ctx.lineTo(0, size * 0.35); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.15); ctx.lineTo(-size * 0.15, -size * 0.4);
    ctx.moveTo(0, -size * 0.15); ctx.lineTo(size * 0.15, -size * 0.4);
    ctx.stroke();
    ctx.restore();
  }
  var drawButterflyPass = createScatterPass('butterflyText', [withPalette(drawButterflyShape, BUTTERFLY_PALETTE)], { minSize: 0.4, sizeRange: 0.4 });

  // ---- ④ 비눗방울 효과: 반투명 그라디언트 + 하이라이트가 있는 동동 뜬 비눗방울 ----
  function drawSoapBubbleShape(ctx, size, itemSeed){
    ctx.save();
    const r = size * 0.5;
    const tintHue = 190 + pseudoRandom(itemSeed + 3) * 60;
    const tintRgb = EP.hsvToRgb(tintHue, 0.3, 1);
    const tint = EP.rgbToHex(tintRgb.r, tintRgb.g, tintRgb.b);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.45, tint + '40');
    grad.addColorStop(1, tint + '26');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(0.5, r * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.32, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.restore();
  }
  var drawSoapbubblePass = createScatterPass('soapbubbleText', [drawSoapBubbleShape], { minSize: 0.35, sizeRange: 0.45, randomRotation: false });

  // ---- ⑤ 번개 효과: 발광 그림자가 있는 지그재그 번개 ----
  var LIGHTNING_PALETTE = ['#ffe14a', '#4ad4ff', '#ffffff'];
  function drawLightningShape(ctx, size, color){
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = size * 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 0.15, -size * 0.6);
    ctx.lineTo(-size * 0.15, -size * 0.05);
    ctx.lineTo(size * 0.05, -size * 0.05);
    ctx.lineTo(-size * 0.2, size * 0.6);
    ctx.lineTo(size * 0.25, size * 0.05);
    ctx.lineTo(size * 0.02, size * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  var drawLightningPass = createScatterPass('lightningText', [withPalette(drawLightningShape, LIGHTNING_PALETTE)], { minSize: 0.4, sizeRange: 0.4 });

  // ---- ⑥ 할로윈 효과: 호박 / 박쥐 / 유령 ----
  function drawPumpkinShape(ctx, size){
    ctx.save();
    ctx.fillStyle = '#e8791c';
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.5, size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = Math.max(1, size * 0.03);
    [-0.28, 0, 0.28].forEach(o => {
      ctx.beginPath();
      ctx.moveTo(o * size, -size * 0.4);
      ctx.quadraticCurveTo(o * size + size * 0.05, 0, o * size, size * 0.4);
      ctx.stroke();
    });
    ctx.fillStyle = '#4a7c3f';
    ctx.fillRect(-size * 0.06, -size * 0.62, size * 0.12, size * 0.2);
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath(); ctx.moveTo(-size * 0.18, -size * 0.08); ctx.lineTo(-size * 0.06, -size * 0.08); ctx.lineTo(-size * 0.12, size * 0.08); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(size * 0.18, -size * 0.08); ctx.lineTo(size * 0.06, -size * 0.08); ctx.lineTo(size * 0.12, size * 0.08); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, size * 0.2); ctx.lineTo(size * 0.2, size * 0.2); ctx.lineTo(size * 0.12, size * 0.32);
    ctx.lineTo(0, size * 0.22); ctx.lineTo(-size * 0.12, size * 0.32); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawBatShape(ctx, size){
    ctx.save();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.35, -size * 0.75, -size * 0.3, -size * 0.9, 0);
    ctx.bezierCurveTo(-size * 0.6, -size * 0.05, -size * 0.4, 0, -size * 0.15, -size * 0.05);
    ctx.lineTo(0, size * 0.1);
    ctx.lineTo(size * 0.15, -size * 0.05);
    ctx.bezierCurveTo(size * 0.4, 0, size * 0.6, -size * 0.05, size * 0.9, 0);
    ctx.bezierCurveTo(size * 0.75, -size * 0.3, size * 0.3, -size * 0.35, 0, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, size * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawGhostShape(ctx, size){
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, size * 0.4);
    ctx.lineTo(-size * 0.4, -size * 0.1);
    ctx.arc(0, -size * 0.1, size * 0.4, Math.PI, 0);
    ctx.lineTo(size * 0.4, size * 0.4);
    ctx.lineTo(size * 0.25, size * 0.25);
    ctx.lineTo(size * 0.1, size * 0.4);
    ctx.lineTo(-size * 0.05, size * 0.25);
    ctx.lineTo(-size * 0.2, size * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-size * 0.15, -size * 0.1, size * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.15, -size * 0.1, size * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  var drawHalloweenPass = createScatterPass('halloweenText', [drawPumpkinShape, drawBatShape, drawGhostShape], { minSize: 0.35, sizeRange: 0.4 });

  // ---- ⑦ 음표 효과: 통통 튀는 8분음표 ----
  var MUSICNOTE_PALETTE = ['#2a2a2a', '#7b2ff7', '#e64545', '#2255cc'];
  function drawMusicNoteShape(ctx, size, color){
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(-size * 0.05, size * 0.35, size * 0.18, size * 0.13, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(size * 0.1, -size * 0.5, size * 0.06, size * 0.85);
    ctx.beginPath();
    ctx.moveTo(size * 0.16, -size * 0.5);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.4, size * 0.4, -size * 0.1);
    ctx.quadraticCurveTo(size * 0.3, -size * 0.3, size * 0.16, -size * 0.25);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  var drawMusicnotePass = createScatterPass('musicnoteText', [withPalette(drawMusicNoteShape, MUSICNOTE_PALETTE)], { minSize: 0.35, sizeRange: 0.35 });

  // ---- ⑧ 보석 효과: 여러 컬러의 반짝이는 컷팅 보석 ----
  var GEM_PALETTE = ['#e63950', '#3a6fe6', '#2ec27e', '#a259e6', '#4ad4e6'];
  function drawGemShape(ctx, size, color){
    ctx.save();
    const s = size * 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.2); ctx.lineTo(-s * 0.4, -s * 0.9); ctx.lineTo(s * 0.4, -s * 0.9); ctx.lineTo(s, -s * 0.2);
    ctx.lineTo(0, s * 0.9);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.5, size * 0.02);
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.2); ctx.lineTo(0, s * 0.9);
    ctx.moveTo(s, -s * 0.2); ctx.lineTo(0, s * 0.9);
    ctx.moveTo(-s * 0.4, -s * 0.9); ctx.lineTo(0, s * 0.9);
    ctx.moveTo(s * 0.4, -s * 0.9); ctx.lineTo(0, s * 0.9);
    ctx.moveTo(-s, -s * 0.2); ctx.lineTo(s, -s * 0.2);
    ctx.stroke();
    ctx.restore();
  }
  var drawGemPass = createScatterPass('gemText', [withPalette(drawGemShape, GEM_PALETTE)], { minSize: 0.3, sizeRange: 0.35 });

  // ---- ⑨ 열대 효과: 야자잎 + 히비스커스 꽃 ----
  var TROPICAL_LEAF_PALETTE = ['#1f8a4c', '#2ea862', '#0f6b38'];
  var TROPICAL_FLOWER_PALETTE = ['#ff5c8a', '#ff8c42', '#ff3d68'];
  function drawPalmLeafShape(ctx, size, color){
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath(); ctx.moveTo(0, size * 0.5); ctx.lineTo(0, -size * 0.1); ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.1);
      ctx.quadraticCurveTo(Math.sin(a) * size * 0.3, -size * 0.5, Math.sin(a) * size * 0.65, -size * 0.75 + Math.abs(i) * size * 0.1);
      ctx.quadraticCurveTo(Math.sin(a) * size * 0.35, -size * 0.55, 0, -size * 0.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawHibiscusShape(ctx, size, color){
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.28, size * 0.16, size * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  var drawTropicalPass = createScatterPass('tropicalText', [
    withPalette(drawPalmLeafShape, TROPICAL_LEAF_PALETTE),
    withPalette(drawHibiscusShape, TROPICAL_FLOWER_PALETTE)
  ], { minSize: 0.38, sizeRange: 0.4 });

  // ---- ⑩ 사탕 효과: 소용돌이 막대사탕 + 양끝이 꼬인 포장 캔디 ----
  var CANDY_PALETTE = ['#ff5c8a', '#ffb020', '#5ac8fa', '#7ed957'];
  function drawLollipopShape(ctx, size, color){
    ctx.save();
    ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath(); ctx.moveTo(0, size * 0.15); ctx.lineTo(0, size * 0.75); ctx.stroke();
    const r = size * 0.35;
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? color : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 1.5, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = Math.max(0.5, size * 0.02);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawWrappedCandyShape(ctx, size, color){
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.35, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s * size * 0.32, -size * 0.15);
      ctx.lineTo(s * size * 0.55, -size * 0.28);
      ctx.lineTo(s * size * 0.55, size * 0.28);
      ctx.lineTo(s * size * 0.32, size * 0.15);
      ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }
  var drawCandyPass = createScatterPass('candyText', [
    withPalette(drawLollipopShape, CANDY_PALETTE),
    withPalette(drawWrappedCandyShape, CANDY_PALETTE)
  ], { minSize: 0.34, sizeRange: 0.36 });

  // 반짝이는 별(스파클) 하나를 그림: 위/아래/좌/우로 길게 뻗은 4개의 뾰족한 꼭짓점과
  // 오목한 옆선으로 이루어진 전형적인 "✦" 모양. rotation(라디안)만큼 통째로 돌려서 그림
  function drawSparkleStar(ctx, cx, cy, size, color, rotation){
    ctx.save();
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.15, -size * 0.15, size, 0);
    ctx.quadraticCurveTo(size * 0.15, size * 0.15, 0, size);
    ctx.quadraticCurveTo(-size * 0.15, size * 0.15, -size, 0);
    ctx.quadraticCurveTo(-size * 0.15, -size * 0.15, 0, -size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- 빅뱅 효과 (배경 효과) ----
  // 지정한 중심점(가로/세로 위치로 조절)에서 밝은 섬광이 "팡" 터지고, 거기서 사방으로 뻗는
  // 폭발 광선 몇 가닥과 함께, 별들이 중심에서 바깥으로 흩날리듯 퍼져나감. 별마다 크기와
  // 색상이 전부 무작위이고, "퍼짐 크기"로 별들이 얼마나 멀리까지 날아가는지 조절함.
  // 글자보다 먼저(맨 뒤에) 그려져서 마치 글자가 빅뱅의 중심에 놓인 것처럼 보임
  function drawBigBangPass(ctx){
    const cfg = this.bigbangText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
    const spread = Math.max(0, Math.min(100, cfg.spread != null ? cfg.spread : 55)) / 100;
    const cx = Math.max(-100, Math.min(100, cfg.centerX || 0)) / 100 * (w / 2);
    const cy = Math.max(-100, Math.min(100, cfg.centerY || 0)) / 100 * (h / 2);

    const diag = Math.hypot(w, h);
    const maxRadius = diag * (0.35 + spread * 1.25);

    ctx.save();
    ctx.globalAlpha = op;

    // ① 중심 섬광 — 스크린 블렌드로 겹쳐서 "팡" 터지는 밝은 빛을 냄
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const flashR = fontSize * (0.6 + spread * 0.7);
    const flashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
    flashGrad.addColorStop(0, '#ffffff');
    flashGrad.addColorStop(0.35, '#fff2c2');
    flashGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
    ctx.fill();

    // ② 중심에서 사방으로 뻗는 폭발 광선
    const rayCount = 10;
    for (let i = 0; i < rayCount; i++) {
      const a = (i / rayCount) * Math.PI * 2 + pseudoRandom(seed + i * 3.1 + 9001) * 0.4;
      const len = maxRadius * (0.45 + pseudoRandom(seed + i * 7.3 + 9051) * 0.5);
      const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      const rg = ctx.createLinearGradient(cx, cy, ex, ey);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = rg;
      ctx.lineWidth = fontSize * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();

    // ③ 별들 — 중심에서 바깥으로 흩날리듯 퍼짐(면적이 고르게 퍼지도록 sqrt로 거리 보정),
    // 크기·색상·회전 각도 전부 무작위(별마다 제각각 다른 방향으로 돌아가 있음)
    const starCount = Math.max(6, Math.round(12 + density * 70));
    for (let i = 0; i < starCount; i++) {
      const ang = pseudoRandom(seed + i * 13.7 + 1) * Math.PI * 2;
      const distT = pseudoRandom(seed + i * 17.3 + 51);
      const dist = Math.sqrt(distT) * maxRadius;
      const sx = cx + Math.cos(ang) * dist;
      const sy = cy + Math.sin(ang) * dist;
      const size = fontSize * (0.03 + pseudoRandom(seed + i * 11.1 + 101) * 0.09);
      const hue = pseudoRandom(seed + i * 19.3 + 151) * 360;
      const starRgb = EP.hsvToRgb(hue, 0.5 + pseudoRandom(seed + i * 23.1 + 201) * 0.5, 0.85 + pseudoRandom(seed + i * 29.7 + 251) * 0.15);
      const starColor = EP.rgbToHex(starRgb.r, starRgb.g, starRgb.b);
      const rotation = pseudoRandom(seed + i * 37.9 + 401) * Math.PI * 2;
      ctx.globalAlpha = op * (0.55 + pseudoRandom(seed + i * 31 + 301) * 0.45) * (1 - distT * 0.3);
      drawSparkleStar(ctx, sx, sy, size, starColor, rotation);
    }
    ctx.globalAlpha = op;

    ctx.restore();
  }

  // 구불구불한 색색 리본(색테이프) 한 가닥을 그림 — 축포 효과에서 폭죽과 함께 날리는 리본용
  function drawRibbonStreamer(ctx, x, y, angle, length, waveAmp, waveFreq, width, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const segments = 20;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const px = length * t;
      const py = Math.sin(t * Math.PI * waveFreq) * waveAmp * (1 - t * 0.2);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- 축포 효과 (배경 효과) ----
  // 폭죽 여러 발이 여기저기서 "팡팡" 터지고(섬광+방사형 광선), 그 사이로 구불구불한 색색 리본이
  // 흩날리며, 오색의 별과 색종이 조각이 곳곳에 뿌려짐 — 생일/축하 이벤트 느낌의 왁자지껄한 배경.
  // 빅뱅 효과처럼 글자보다 먼저(맨 뒤에) 그려서, 글자가 그 한가운데 놓인 것처럼 보임.
  // "밀도"로 폭죽·리본·별의 전체 개수를, "퍼짐"으로 얼마나 넓게 흩어지는지 조절함.
  function drawEventPass(ctx){
    const cfg = this.eventText;
    if (!cfg) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const density = Math.max(0, Math.min(100, cfg.density != null ? cfg.density : 55)) / 100;
    const spread = Math.max(0, Math.min(100, cfg.spread != null ? cfg.spread : 55)) / 100;

    const diag = Math.hypot(w, h);
    const areaR = diag * (0.5 + spread * 0.9); // 폭죽/리본/별이 흩어지는 전체 반경

    ctx.save();
    ctx.globalAlpha = op;

    // ① 폭죽 — 무작위 위치에서 팡 터지는 밝은 섬광 + 사방으로 뻗는 광선을 여러 발
    const burstCount = Math.max(2, Math.round(2 + density * 6));
    for (let i = 0; i < burstCount; i++) {
      const ang = pseudoRandom(seed + i * 13.1 + 1000) * Math.PI * 2;
      const dist = (0.3 + pseudoRandom(seed + i * 7.7 + 1050) * 0.7) * areaR;
      const bx = Math.cos(ang) * dist;
      const by = Math.sin(ang) * dist;
      const hue = pseudoRandom(seed + i * 19.7 + 1100) * 360;
      const rgb = EP.hsvToRgb(hue, 0.6 + pseudoRandom(seed + i * 3.1 + 1120) * 0.3, 1);
      const color = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      const burstSize = fontSize * (0.32 + pseudoRandom(seed + i * 3.3 + 1200) * 0.32);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, burstSize);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, burstSize, 0, Math.PI * 2);
      ctx.fill();

      const rays = 8;
      ctx.strokeStyle = color;
      ctx.lineWidth = fontSize * 0.015;
      for (let r = 0; r < rays; r++) {
        const ra = (r / rays) * Math.PI * 2 + pseudoRandom(seed + i * 5 + r + 1300) * 0.5;
        const rl = burstSize * (0.85 + pseudoRandom(seed + i * 9 + r + 1400) * 0.6);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(ra) * rl, by + Math.sin(ra) * rl);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = op;

    // ② 리본(색테이프) — 구불구불한 색색 리본 여러 가닥이 사방으로 날림
    const ribbonCount = Math.max(3, Math.round(3 + density * 9));
    for (let i = 0; i < ribbonCount; i++) {
      const ang = pseudoRandom(seed + i * 23.3 + 2000) * Math.PI * 2;
      const dist = pseudoRandom(seed + i * 17.9 + 2050) * areaR * 0.85;
      const rx = Math.cos(ang) * dist, ry = Math.sin(ang) * dist;
      const rAngle = pseudoRandom(seed + i * 29.1 + 2100) * Math.PI * 2;
      const length = fontSize * (1.1 + pseudoRandom(seed + i * 11.3 + 2150) * 1.9);
      const hue2 = pseudoRandom(seed + i * 31.7 + 2200) * 360;
      const rgb2 = EP.hsvToRgb(hue2, 0.6 + pseudoRandom(seed + i * 4.1 + 2220) * 0.3, 0.95);
      const rcolor = EP.rgbToHex(rgb2.r, rgb2.g, rgb2.b);
      const rwidth = fontSize * (0.045 + pseudoRandom(seed + i * 3.7 + 2250) * 0.045);
      const waveFreq = 1.5 + pseudoRandom(seed + i * 7 + 2300) * 2.5;
      ctx.globalAlpha = op * (0.75 + pseudoRandom(seed + i * 9.3 + 2350) * 0.25);
      drawRibbonStreamer(ctx, rx, ry, rAngle, length, fontSize * 0.22, waveFreq, rwidth, rcolor);
    }
    ctx.globalAlpha = op;

    // ③ 오색 별 + 색종이 조각 — 곳곳에 흩뿌려짐(면적이 고르게 퍼지도록 sqrt로 거리 보정)
    const starCount = Math.max(10, Math.round(14 + density * 46));
    for (let i = 0; i < starCount; i++) {
      const ang = pseudoRandom(seed + i * 13.7 + 3000) * Math.PI * 2;
      const distT = pseudoRandom(seed + i * 17.3 + 3050);
      const dist = Math.sqrt(distT) * areaR;
      const sx = Math.cos(ang) * dist, sy = Math.sin(ang) * dist;
      const size = fontSize * (0.025 + pseudoRandom(seed + i * 11.1 + 3100) * 0.06);
      const hue3 = pseudoRandom(seed + i * 19.3 + 3150) * 360;
      const rgb3 = EP.hsvToRgb(hue3, 0.55 + pseudoRandom(seed + i * 23.1 + 3200) * 0.45, 0.9 + pseudoRandom(seed + i * 29.7 + 3250) * 0.1);
      const color3 = EP.rgbToHex(rgb3.r, rgb3.g, rgb3.b);
      const rotation = pseudoRandom(seed + i * 37.9 + 3300) * Math.PI * 2;
      ctx.globalAlpha = op * (0.6 + pseudoRandom(seed + i * 31 + 3350) * 0.4) * (1 - distT * 0.25);
      if (pseudoRandom(seed + i * 41 + 3400) < 0.6) {
        drawSparkleStar(ctx, sx, sy, size, color3, rotation);
      } else {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rotation);
        ctx.fillStyle = color3;
        ctx.fillRect(-size, -size * 0.6, size * 2, size * 1.2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = op;

    ctx.restore();
  }

  function randomTypoFontPool(){
    return RANDOM_TYPO_BASE_FONTS.concat(Array.from(EP.customFontNames));
  }
  function randomVividColor(){
    const h = Math.random() * 360;
    const rgb = EP.hsvToRgb(h, 0.7 + Math.random() * 0.3, 0.75 + Math.random() * 0.25);
    return EP.rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  function generateRandomTypoChars(text, intensityPct){
    const amp = Math.max(0, Math.min(100, intensityPct)) / 100;
    const pool = randomTypoFontPool();
    return text.split('').map(() => ({
      font: pool[Math.floor(Math.random() * pool.length)],
      color: randomVividColor(),
      scale: 1 + (Math.random() * 2 - 1) * 0.4 * amp,
      rot: (Math.random() * 2 - 1) * 25 * amp,
      dy: (Math.random() * 2 - 1) * 12 * amp
    }));
  }
  function drawRandomTypoPass(ctx){
    const cfg = this.randomTypo;
    const text = this.text || '';
    if (!cfg || !cfg.chars || !cfg.chars.length || !text.length) { origItextRender.call(this, ctx); return; }

    const chars = text.split('');
    const perChar = cfg.chars;
    const baseFontSize = this.fontSize;
    const yBase = baseFontSize * 0.35;

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    const widths = chars.map((c, i) => {
      const st = perChar[i % perChar.length];
      ctx.font = `${baseFontSize * (st.scale || 1)}px ${st.font || this.fontFamily}`;
      return ctx.measureText(c).width;
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    const hasStroke = this.stroke && this.strokeWidth > 0;
    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const st = perChar[i % perChar.length];
      const fs = baseFontSize * (st.scale || 1);
      ctx.save();
      ctx.translate(x + widths[i] / 2, yBase + (st.dy || 0));
      ctx.rotate((st.rot || 0) * Math.PI / 180);
      ctx.font = `${fs}px ${st.font || this.fontFamily}`;
      ctx.textAlign = 'center';
      if (hasStroke) { ctx.strokeStyle = this.stroke; ctx.lineWidth = this.strokeWidth; ctx.strokeText(c, 0, 0); }
      ctx.fillStyle = st.color || this.fill;
      ctx.fillText(c, 0, 0);
      ctx.restore();
      x += widths[i];
    });

    ctx.restore();
  }

  // 현재 켜진 "레이아웃" 효과(원형/부풀리기/랜덤) 중 하나를 골라서 그리거나, 없으면 기본 텍스트로 그림
  function baseCharacterDraw(ctx){
    if (this.circularText) { drawCircularPass.call(this, ctx); return; }
    if (this.verticalText) { drawVerticalPass.call(this, ctx); return; }
    if (this.puffyText) { drawPuffyPass.call(this, ctx); return; }
    if (this.vineText) { drawVineClimbPass.call(this, ctx); return; }
    if (this.rollText) { drawRollPass.call(this, ctx); return; }
    if (this.perspectiveText) { drawPerspectivePass.call(this, ctx); return; }
    if (this.curveText) { drawCurvePass.call(this, ctx); return; }
    if (this.waveText) { drawWavePass.call(this, ctx); return; }
    if (this.trainText) { drawTrainPass.call(this, ctx); return; }
    if (this.tiredText) { drawTiredPass.call(this, ctx); return; }
    if (this.spiralText) { drawSpiralPass.call(this, ctx); return; }
    if (this.magazineText) { drawMagazinePass.call(this, ctx); return; }
    if (this.puzzleText) { drawPuzzlePass.call(this, ctx); return; }
    if (this.skyText) { drawSkyLettersPass.call(this, ctx); return; }
    if (this.chalkText) { drawChalkPass.call(this, ctx); return; }
    if (this.postalText) { drawPostalPass.call(this, ctx); return; }
    if (this.randomTypo && this.randomTypo.chars && this.randomTypo.chars.length) { drawRandomTypoPass.call(this, ctx); return; }
    origItextRender.call(this, ctx);
  }

  // 레이아웃 결과 위에 3D 효과(옆면 겹겹이) → 불타는 효과(불빛 번짐) → 글리치 → 이중테두리 → 녹아 늘러붙은 효과(스머지+방울) → 앞면 순서로 겹쳐 그림.
  // 이렇게 하면 예: "원형 글자 + 3D + 이중테두리"처럼 여러 효과를 동시에 겹쳐서 쓸 수 있음.
  function unifiedCustomRender(ctx){
    if (this.isEditing) { origItextRender.call(this, ctx); return; }

    const hasLayout = !!(this.circularText || this.verticalText || this.puffyText || this.vineText || this.rollText || this.perspectiveText || this.curveText || this.waveText || this.trainText || this.tiredText || this.spiralText || this.magazineText || this.puzzleText || this.skyText || this.chalkText || this.postalText || (this.randomTypo && this.randomTypo.chars && this.randomTypo.chars.length));
    const has3D = !!(this.threeDText && this.threeDText.depth > 0);
    const hasMetal = !!(this.metalText && this.metalText.intensity > 0);
    const hasPopArt = !!(this.popArtText && this.popArtText.intensity > 0);
    const hasFire = !!(this.fireText && this.fireText.intensity > 0);
    const hasDbl = !!(this.doubleOutline && ((this.doubleOutline.innerWidth || 0) > 0 || (this.doubleOutline.outerWidth || 0) > 0));
    const hasGlitch = !!(this.glitchText && this.glitchText.amount > 0);
    const hasMelt = !!(this.meltText && this.meltText.amount > 0);
    const hasTear = !!(this.tearText && this.tearText.strips > 0 && this.tearText.gap > 0);
    const hasBubble = !!this.bubbleText;
    const hasZebra = !!this.zebraText;
    const hasSpeed = !!(this.speedText && this.speedText.intensity > 0);
    const hasReflection = !!(this.reflectionText && this.reflectionText.intensity > 0);
    const hasCrack = !!(this.crackText && this.crackText.intensity > 0);
    const hasTile = !!(this.tileText && this.tileText.intensity > 0);
    const hasFootprint = !!(this.footprintText && this.footprintText.intensity > 0);
    const hasAnimal = !!(this.animalText && this.animalText.intensity > 0);
    const hasSeafood = !!(this.seafoodText && this.seafoodText.intensity > 0);
    const hasFruitVeg = !!(this.fruitVegText && this.fruitVegText.intensity > 0);
    const hasHeart = !!(this.heartText && this.heartText.intensity > 0);
    const hasCoffee = !!(this.coffeeText && this.coffeeText.intensity > 0);
    const hasSports = !!(this.sportsText && this.sportsText.intensity > 0);
    const hasClub = !!(this.clubText && this.clubText.intensity > 0);
    const hasSnow = !!(this.snowText && this.snowText.intensity > 0);
    const hasRain = !!(this.rainText && this.rainText.intensity > 0);
    const hasSplash = !!(this.splashText && this.splashText.intensity > 0);
    const hasSky = !!this.skyText;
    const hasInkTrap = !!(this.inkTrapText && this.inkTrapText.intensity > 0);
    const hasLeafVine = !!(this.leafVineText && this.leafVineText.intensity > 0);
    const hasSakura = !!(this.sakuraText && this.sakuraText.intensity > 0);
    const hasShy = !!this.shyText;
    const hasLight = !!(this.lightText && this.lightText.intensity > 0);
    const hasGrass = !!this.grassText;
    const hasBigbang = !!this.bigbangText;
    const hasEvent = !!this.eventText;
    const hasGolf = !!this.golfText;
    const hasChristmas = !!this.christmasText;
    const hasAutumn = !!this.autumnText;
    const hasSpace = !!this.spaceText;
    const hasDoodle = !!this.doodleText;
    const hasButterfly = !!this.butterflyText;
    const hasSoapbubble = !!this.soapbubbleText;
    const hasLightning = !!this.lightningText;
    const hasHalloween = !!this.halloweenText;
    const hasMusicnote = !!this.musicnoteText;
    const hasGem = !!this.gemText;
    const hasTropical = !!this.tropicalText;
    const hasCandy = !!this.candyText;
    if (!hasLayout && !has3D && !hasMetal && !hasPopArt && !hasFire && !hasDbl && !hasGlitch && !hasMelt && !hasTear && !hasBubble && !hasZebra && !hasSpeed && !hasReflection && !hasCrack && !hasTile && !hasFootprint && !hasAnimal && !hasSeafood && !hasFruitVeg && !hasHeart && !hasCoffee && !hasSports && !hasClub && !hasSnow && !hasRain && !hasSplash && !hasInkTrap && !hasLeafVine && !hasSakura && !hasShy && !hasLight && !hasGrass && !hasBigbang && !hasEvent && !hasGolf && !hasChristmas && !hasAutumn && !hasSpace && !hasDoodle && !hasButterfly && !hasSoapbubble && !hasLightning && !hasHalloween && !hasMusicnote && !hasGem && !hasTropical && !hasCandy) { origItextRender.call(this, ctx); return; }

    // 말풍선 배경/구름 배경/풀밭 배경/빅뱅 배경/축포 배경/골프 배경/크리스마스 배경/가을 배경/
    // 우주·낙서·나비·비눗방울·번개·할로윈·음표·보석·열대·사탕 배경/수줍수줍 배경은 항상 맨 먼저(가장 뒤에)
    // 그려서, 다른 모든 효과가 그 위에 겹쳐 보이게 함
    if (hasBubble) { drawSpeechBubblePass.call(this, ctx); }
    if (hasSky) { drawSkyBackgroundPass.call(this, ctx); }
    if (hasGrass) { drawGrassFieldPass.call(this, ctx); }
    if (hasBigbang) { drawBigBangPass.call(this, ctx); }
    if (hasEvent) { drawEventPass.call(this, ctx); }
    if (hasGolf) { drawGolfPass.call(this, ctx); }
    if (hasChristmas) { drawChristmasPass.call(this, ctx); }
    if (hasAutumn) { drawAutumnPass.call(this, ctx); }
    if (hasSpace) { drawSpacePass.call(this, ctx); }
    if (hasDoodle) { drawDoodlePass.call(this, ctx); }
    if (hasButterfly) { drawButterflyPass.call(this, ctx); }
    if (hasSoapbubble) { drawSoapbubblePass.call(this, ctx); }
    if (hasLightning) { drawLightningPass.call(this, ctx); }
    if (hasHalloween) { drawHalloweenPass.call(this, ctx); }
    if (hasMusicnote) { drawMusicnotePass.call(this, ctx); }
    if (hasGem) { drawGemPass.call(this, ctx); }
    if (hasTropical) { drawTropicalPass.call(this, ctx); }
    if (hasCandy) { drawCandyPass.call(this, ctx); }
    if (hasShy) { drawShyPass.call(this, ctx); }

    const origFill = this.fill, origStroke = this.stroke, origStrokeWidth = this.strokeWidth;
    // 최종적으로 보일 글자 색/테두리 — 평소엔 원래 값 그대로지만, "불타는 효과"가 켜지면
    // 이 값들이 불꽃 색으로 바뀌고, 그 뒤(글리치/이중테두리/녹기) 단계들도 이 값을 기준으로 복원함
    let baseFill = origFill;
    let baseStroke = origStroke;
    let baseStrokeWidth = origStrokeWidth;

    if (has3D) {
      const cfg = this.threeDText;
      const rad = (cfg.angle != null ? cfg.angle : 45) * Math.PI / 180;
      const dx = Math.cos(rad), dy = Math.sin(rad);
      for (let i = Math.round(cfg.depth); i >= 1; i--) {
        ctx.save();
        ctx.translate(dx * i, dy * i);
        this.fill = cfg.sideColor || '#555555';
        this.stroke = null;
        this.strokeWidth = 0;
        baseCharacterDraw.call(this, ctx);
        ctx.restore();
      }
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    // 메탈(크롬) 효과: 뒤쪽에 어두운 옆면을 압출해서 두께감을 주고, 은은한 빛 번짐을 더한 뒤,
    // 앞면은 어두운색→밝은색→흰색 하이라이트→밝은색→어두운색으로 이어지는 세로 그라디언트를
    // 씌워서 크롬 표면에 하늘/빛이 반사된 듯한 금속 느낌을 냄
    if (hasMetal) {
      const cfg = this.metalText;
      const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
      const darkColor = cfg.darkColor || '#0b1f38';
      const lightColor = cfg.lightColor || '#7ec8ff';
      const glowColor = cfg.glowColor || '#4aa8ff';
      const depth = Math.max(1, Math.round(2 + amt * 6));
      const rad = 45 * Math.PI / 180;
      const dxs = Math.cos(rad), dys = Math.sin(rad);

      // 뒤쪽 옆면(두께) 압출
      for (let i = depth; i >= 1; i--) {
        ctx.save();
        ctx.translate(dxs * i, dys * i);
        this.fill = darkColor; this.stroke = null; this.strokeWidth = 0;
        baseCharacterDraw.call(this, ctx);
        ctx.restore();
      }
      // 은은한 파란 빛 번짐
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8 + amt * 22;
      this.fill = darkColor; this.stroke = null; this.strokeWidth = 0;
      baseCharacterDraw.call(this, ctx);
      ctx.restore();

      // 앞면 크롬 그라디언트 + 어두운 테두리
      baseFill = makeMetalGradient(this, darkColor, lightColor);
      baseStroke = darkColor;
      baseStrokeWidth = Math.max(0.8, (this.fontSize || 40) * 0.025);
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    // 팝아트 효과: 옛날 인쇄물처럼 두 가지 색이 살짝 어긋나게 겹쳐 찍히고, 그 위로 할프톤(망점)
    // 무늬를 깔고, 마지막으로 메인색상 글자에 굵은 검정 테두리를 둘러서 만화책 표지 같은 느낌을 냄
    if (hasPopArt) {
      const cfg = this.popArtText;
      const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
      const fontSize = this.fontSize || 40;
      const w = this.width || 100, h = this.height || fontSize * 1.2;
      const mainColor = cfg.mainColor || '#ffffff';
      const colorA = cfg.colorA || '#ffe600';
      const colorB = cfg.colorB || '#00c2ff';
      const offset = fontSize * (0.03 + amt * 0.1);

      ctx.save();
      ctx.translate(-offset, offset);
      this.fill = colorA; this.stroke = null; this.strokeWidth = 0;
      baseCharacterDraw.call(this, ctx);
      ctx.restore();

      ctx.save();
      ctx.translate(offset, -offset);
      this.fill = colorB; this.stroke = null; this.strokeWidth = 0;
      baseCharacterDraw.call(this, ctx);
      ctx.restore();

      drawHalftonePass(ctx, w, h, fontSize, 0.24 - amt * 0.09, 0.35, '#111111', cfg.seed || 0);

      baseFill = mainColor;
      baseStroke = '#111111';
      baseStrokeWidth = Math.max(1, fontSize * (0.05 + amt * 0.04));
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    // 잉크트랩 스타일: 텍스트 윗변/아랫변에 작은 삼각 노치를 새겨 잉크트랩 특유의 각진 절개
    // 느낌을 내고, 그 위에 긁힌 자국·얼룩 같은 빈티지 흠집을 잔뜩 흩뿌림
    // (테두리 두께는 원래 값 그대로 두고 건드리지 않음)

    // 불타는 효과: 글자 뒤쪽에서 실제 불꽃 모양이 여러 개 타오르고, 잔불(재)이 위로 튀는 느낌.
    // 글자 자체에도 불꽃 색 테두리를 살짝 둘러서 가장자리가 타는 듯한 느낌을 더함
    if (hasFire) {
      const cfg = this.fireText;
      const outer = cfg.outerColor || '#ff5500';
      const inner = cfg.innerColor || '#ffe066';
      const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;

      ctx.save();
      ctx.shadowColor = outer;
      ctx.shadowBlur = 6;
      this.fill = outer; this.stroke = null; this.strokeWidth = 0;
      baseCharacterDraw.call(this, ctx);
      ctx.restore();

      // 불꽃은 글자보다 먼저(뒤에) 그려서, 나중에 그려질 글자 밑변에 뿌리내린 것처럼 보이게 함
      drawFireFlamesPass.call(this, ctx);

      baseFill = inner;
      baseStroke = outer;
      baseStrokeWidth = Math.max(0.6, (this.fontSize || 40) * (0.012 + amt * 0.02));
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    // 글리치: 빨강/시안 색으로 살짝 어긋나게 두 벌 그려서 RGB 색분리(색수차) 느낌을 냄.
    // 가로(기존, 좌우로 어긋남) / 세로(위아래로 어긋남) / 글자별(글자마다 제각각 다른 방향)
    if (hasGlitch) {
      const gcfg = this.glitchText;
      const amt = gcfg.amount;
      const gmode = gcfg.mode || 'horizontal';
      const gseed = gcfg.seed || 0;
      const gop = this.opacity != null ? this.opacity : 1;
      if (gmode === 'perChar') {
        drawGlitchPerCharPass.call(this, ctx, amt, gseed, gop);
      } else {
        const dx = gmode === 'vertical' ? 0 : amt;
        const dy = gmode === 'vertical' ? amt : 0;
        ctx.save();
        ctx.globalAlpha = gop * 0.85;
        ctx.translate(-dx, -dy);
        this.fill = '#ff2a4d'; this.stroke = null; this.strokeWidth = 0;
        baseCharacterDraw.call(this, ctx);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = gop * 0.85;
        ctx.translate(dx, dy);
        this.fill = '#2af0ff'; this.stroke = null; this.strokeWidth = 0;
        baseCharacterDraw.call(this, ctx);
        ctx.restore();
      }
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    if (hasDbl) {
      const cfg = this.doubleOutline;
      const innerW = cfg.innerWidth || 0, outerW = cfg.outerWidth || 0;
      if (outerW > 0) {
        this.stroke = cfg.outerColor || '#000000';
        this.strokeWidth = (innerW + outerW) * 2;
        this.fill = 'transparent';
        baseCharacterDraw.call(this, ctx);
      }
      if (innerW > 0) {
        this.stroke = cfg.innerColor || '#ffffff';
        this.strokeWidth = innerW * 2;
        this.fill = 'transparent';
        baseCharacterDraw.call(this, ctx);
      }
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    if (hasMelt) {
      this.fill = baseFill;
      drawMeltPass.call(this, ctx);
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    if (hasSpeed) {
      this.fill = baseFill;
      drawSpeedPass.call(this, ctx);
      this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth;
    }

    if (hasTear) { drawTearPass.call(this, ctx); } else { baseCharacterDraw.call(this, ctx); }
    if (hasReflection) { this.fill = baseFill; this.stroke = baseStroke; this.strokeWidth = baseStrokeWidth; drawReflectionPass.call(this, ctx); }
    if (hasZebra) { drawZebraStripesPass.call(this, ctx); }
    if (hasCrack) { drawGlassCrackPass.call(this, ctx); }
    if (hasTile) { drawTilePass.call(this, ctx); }
    if (hasFootprint) { drawFootprintPass.call(this, ctx); }
    if (hasAnimal) { drawAnimalPass.call(this, ctx); }
    if (hasSeafood) { drawSeafoodPass.call(this, ctx); }
    if (hasFruitVeg) { drawFruitVegPass.call(this, ctx); }
    if (hasHeart) { drawHeartsPass.call(this, ctx); }
    if (hasCoffee) { drawCoffeeBeansPass.call(this, ctx); }
    if (hasSports) { drawSportsPass.call(this, ctx); }
    if (hasClub) { drawClubPass.call(this, ctx); }
    if (hasSnow) { drawSnowPass.call(this, ctx); }
    if (hasRain) { drawRainPass.call(this, ctx); }
    if (hasSplash) { drawSplashPass.call(this, ctx); }
    if (hasInkTrap) { drawInkTrapPass.call(this, ctx); }
    if (hasLeafVine) { drawLeafVinePass.call(this, ctx); }
    if (hasSakura) { drawSakuraPass.call(this, ctx); }
    if (hasLight) { drawLightSourcePass.call(this, ctx); }

    // 렌더링 중에 잠깐 바꿔둔 색상값을 실제 오브젝트 속성(원래 값)으로 되돌림
    // (불타는 효과가 켜져 있어도, 오브젝트의 진짜 fill 값 자체는 원본 그대로 유지되어야
    //  텍스트 색상 패널/저장 데이터가 오염되지 않음)
    this.fill = origFill; this.stroke = origStroke; this.strokeWidth = origStrokeWidth;
  }

  // 시드로 고정된 의사난수(같은 시드면 항상 같은 값) — 매 프레임 다시 그릴 때마다
  // 조각 위치가 흔들리지 않고 그대로 유지되게 하기 위함
  function pseudoRandom(seed){
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  // 말풍선 배경: 글자 둘레를 감싸는 배경을 그리고, 네 변 중 한 곳에서 뾰족한 꼬리가 튀어나오게 함.
  // 모양(삐뚤빼뚤한 구름형/직사각/둥근사각/사다리꼴)과 꼬리 위치는 모두 seed로 정해지므로
  // "다시 뽑기"를 누를 때마다 매번 다른 모양이 나옴. 꼬리는 몸통 윤곽선 안에 이어붙여서 하나의
  // path로 그리기 때문에(테두리를 두 번 겹쳐 그리지 않음), 이어지는 지점에 경계선이 생기지 않음.
  function drawSpeechBubblePass(ctx){
    const cfg = this.bubbleText;
    if (!cfg) return;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const pad = cfg.padding != null ? cfg.padding : 18;
    const seed = cfg.seed || 0;
    const fillColor = cfg.fillColor || '#ffffff';
    const strokeColor = cfg.strokeColor || '#222222';
    const strokeWidth = cfg.strokeWidth != null ? cfg.strokeWidth : 3;
    const shape = ['blob', 'rect', 'round', 'trapezoid'][Math.floor(pseudoRandom(seed + 12345) * 4) % 4];

    const left = -w / 2 - pad, right = w / 2 + pad, top = -h / 2 - pad, bottom = h / 2 + pad;
    const bw = right - left, bh = bottom - top;

    // 네 꼭짓점(사다리꼴이면 위/아래 폭을 다르게 만들어 기울어진 변을 냄)
    let topLeftX = left, topRightX = right, bottomLeftX = left, bottomRightX = right;
    if (shape === 'trapezoid') {
      const inset = bw * (0.14 + pseudoRandom(seed + 601) * 0.14);
      if (pseudoRandom(seed + 602) > 0.5) { topLeftX += inset; topRightX -= inset; }
      else { bottomLeftX += inset; bottomRightX -= inset; }
    }
    const corners = [
      [topLeftX, top], [topRightX, top], [bottomRightX, bottom], [bottomLeftX, bottom]
    ];

    // 꼬리: 네 변 중 하나를 랜덤으로 골라, 그 변 위의 랜덤 위치에서 바깥으로 뾰족하게 튀어나가게 함
    // (변 방향 기준으로 계산하므로 사다리꼴처럼 기울어진 변에서도 자연스럽게 붙음)
    const side = Math.floor(pseudoRandom(seed + 999) * 4); // 0위 1오른쪽 2아래 3왼쪽
    const tailT = 0.25 + pseudoRandom(seed + 888) * 0.5;
    const tailLen = Math.min(bw, bh) * (0.3 + pseudoRandom(seed + 777) * 0.25);
    const tailSpread = Math.min(bw, bh) * 0.13;
    const tailBend = (pseudoRandom(seed + 555) * 2 - 1) * tailSpread * 0.8;

    const ep0 = corners[side], ep1 = corners[(side + 1) % 4];
    const edx = ep1[0] - ep0[0], edy = ep1[1] - ep0[1];
    const elen = Math.sqrt(edx * edx + edy * edy) || 1;
    const ux = edx / elen, uy = edy / elen; // 변 방향 단위벡터
    let nx = -uy, ny = ux; // 변에 수직인 단위벡터(둘 중 하나)
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const bx = ep0[0] + edx * tailT, by = ep0[1] + edy * tailT;
    if ((bx - cx) * nx + (by - cy) * ny < 0) { nx = -nx; ny = -ny; } // 바깥쪽을 향하도록 방향 보정
    const tx = bx + nx * tailLen + ux * tailBend;
    const ty = by + ny * tailLen + uy * tailBend;
    const t1x = bx - ux * tailSpread / 2, t1y = by - uy * tailSpread / 2;
    const t2x = bx + ux * tailSpread / 2, t2y = by + uy * tailSpread / 2;

    ctx.save();
    ctx.globalAlpha = this.opacity != null ? this.opacity : 1;
    ctx.beginPath();

    if (shape === 'blob') {
      // 네 변을 각각 몇 개 점으로 쪼개고, 점마다 랜덤 오프셋을 줘서 삐뚤빼뚤한 윤곽을 만듦.
      // 꼬리가 붙는 변에서는 중간 지점에 꼬리 세 점(t1→tip→t2)을 끼워 넣어 같은 path로 이어 그림
      const wobble = Math.min(bw, bh) * 0.05;
      const perSide = 3;
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const p0 = corners[e], p1 = corners[(e + 1) % 4];
        for (let i = 0; i < perSide; i++) {
          const t = i / perSide;
          const x = p0[0] + (p1[0] - p0[0]) * t;
          const y = p0[1] + (p1[1] - p0[1]) * t;
          const rx = (pseudoRandom(seed + e * 100 + i * 7.3 + 1) * 2 - 1) * wobble;
          const ry = (pseudoRandom(seed + e * 100 + i * 13.1 + 50) * 2 - 1) * wobble;
          const isTailSpot = (e === side && i === 1);
          if (isTailSpot) {
            pts.push({ x: t1x, y: t1y, sharp: true });
            pts.push({ x: tx, y: ty, sharp: true });
            pts.push({ x: t2x, y: t2y, sharp: true });
          } else {
            pts.push({ x: x + rx, y: y + ry, sharp: false });
          }
        }
      }
      const n = pts.length;
      const first = pts[0], last = pts[n - 1];
      ctx.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
      for (let i = 0; i < n; i++) {
        const cur = pts[i], next = pts[(i + 1) % n];
        if (cur.sharp || next.sharp) {
          ctx.lineTo(cur.x, cur.y);
        } else {
          const midX = (cur.x + next.x) / 2, midY = (cur.y + next.y) / 2;
          ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
        }
      }
      ctx.closePath();
    } else if (shape === 'round') {
      // 둥근 사각형: 실제 네 모서리는 arcTo로 둥글게, 꼬리가 붙는 변에서는 t1→tip→t2를
      // 직선으로 끼워 넣음(모서리 라운딩 계산에는 영향 없음 — arcTo는 현재 점 기준으로 계산됨)
      const r = Math.min(bw, bh) * 0.16;
      const e0x = corners[1][0] - corners[0][0], e0y = corners[1][1] - corners[0][1];
      const e0len = Math.sqrt(e0x * e0x + e0y * e0y) || 1;
      // 표준적인 둥근 사각형 그리기 방식: 첫 변에서 r만큼 들어온 지점에서 시작해야
      // closePath로 돌아왔을 때 첫 모서리도 자연스럽게 둥글게 이어짐
      ctx.moveTo(corners[0][0] + (e0x / e0len) * r, corners[0][1] + (e0y / e0len) * r);
      for (let i = 0; i < 4; i++) {
        if (i === side) {
          ctx.lineTo(t1x, t1y);
          ctx.lineTo(tx, ty);
          ctx.lineTo(t2x, t2y);
        }
        const next = corners[(i + 1) % 4];
        const afterNext = corners[(i + 2) % 4];
        ctx.arcTo(next[0], next[1], afterNext[0], afterNext[1], r);
      }
      ctx.closePath();
    } else {
      // 'rect' 또는 'trapezoid': 직선 폴리곤, 꼬리가 붙는 변에서만 t1→tip→t2를 끼워 넣음
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 0; i < 4; i++) {
        if (i === side) {
          ctx.lineTo(t1x, t1y);
          ctx.lineTo(tx, ty);
          ctx.lineTo(t2x, t2y);
        }
        const next = corners[(i + 1) % 4];
        ctx.lineTo(next[0], next[1]);
      }
      ctx.closePath();
    }

    ctx.fillStyle = fillColor;
    ctx.fill();
    if (strokeWidth > 0) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }

    ctx.restore();
  }

  // 얼룩말 무늬: 글자 영역 위에 두께·각도·위치가 제각각인 얇은 줄무늬 여러 개를 흩뿌림.
  // 글자 실루엣에 딱 맞춰 자르지 않는 대신(방식이 훨씬 단순하고 항상 안정적으로 그려짐),
  // 줄무늬 두께를 글꼴 크기보다 확실히 얇게 제한해서 글씨가 줄에 가려지지 않게 함.
  // 위치/각도/두께는 seed로 고정되어 있어 "다시 그리기"를 눌러야 바뀜
  function drawZebraStripesPass(ctx){
    const cfg = this.zebraText;
    if (!cfg) return;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const seed = cfg.seed || 0;
    const count = Math.max(1, Math.round(cfg.count != null ? cfg.count : 10));
    // 두께 상한을 글꼴 크기보다 확실히 얇게 고정해서, 두께를 세게 올려도 글자를 통째로 덮지 않게 함
    const maxThickness = Math.min(cfg.maxThickness != null ? cfg.maxThickness : fontSize * 0.22, fontSize * 0.32);
    const colorA = cfg.colorA || '#111111';
    const colorB = cfg.colorB || '#ffffff';
    const op = this.opacity != null ? this.opacity : 1;

    ctx.save();
    ctx.globalAlpha = op;
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.7 + 1) - 0.5) * w;
      const ry = (pseudoRandom(seed + i * 7.3 + 51) - 0.5) * h;
      const rAngle = pseudoRandom(seed + i * 13.1 + 101) * Math.PI; // 0~180도, 줄마다 제각각 다른 방향
      const rLen = (0.5 + pseudoRandom(seed + i * 5.9 + 151) * 0.9) * Math.max(w, h) * 0.55;
      const rThick = Math.max(1.5, pseudoRandom(seed + i * 3.3 + 201) * maxThickness);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rAngle);
      ctx.fillStyle = (i % 2 === 0) ? colorA : colorB;
      ctx.fillRect(-rLen / 2, -rThick / 2, rLen, rThick);
      ctx.restore();
    }
    ctx.restore();
  }


  // 찢어진 종이처럼 보이게 함 (조각 배치는 seed로 고정되어 있어 "다시 찢기"를 눌러야 바뀜)
  // 찢기 효과: 글자를 여러 조각으로 나눠 조각마다 살짝 어긋나게(+살짝 회전) 그려서 찢어진
  // 종이처럼 보이게 함. 조각을 나누는 방향은 가로(행)/세로(열)/대각선 중 하나이며, "랜덤"이면
  // seed로 매번 다른 방향이 골라짐. 대각선은 캔버스 좌표계 자체를 비스듬히 돌려놓고 가로 절단과
  // 같은 로직을 재사용하는 방식으로 구현함(그 결과 원래 화면에서는 대각선으로 찢긴 것처럼 보임)
  // 찢기 효과: 글자를 여러 조각으로 나눠 조각마다 살짝 어긋나게(+살짝 회전) 그려서 찢어진
  // 종이처럼 보이게 함. 조각을 나누는 방향은 가로(행)/세로(열)/대각선 중 하나이며, "랜덤"이면
  // seed로 매번 다른 방향이 골라짐. 대각선 모드는 절단 경계(클립 영역)만 비스듬히 만들고,
  // 글자 자체는 회전시키지 않아서 텍스트가 통째로 기울어지지 않고 절단선만 대각선으로 나감
  function drawTearPass(ctx){
    const cfg = this.tearText;
    const strips = Math.max(2, Math.round(cfg.strips || 6));
    const gap = cfg.gap || 0;
    const rotateDeg = cfg.rotate || 0;
    const seed = cfg.seed || 0;
    const w = (this.width || 100) + gap * 2 + 20;
    const h = this.height || (this.fontSize || 40) * 1.2;

    let mode = cfg.direction || 'random';
    if (mode === 'random') {
      const r = pseudoRandom(seed + 9001);
      mode = r < 0.4 ? 'horizontal' : (r < 0.75 ? 'vertical' : 'diagonal');
    }

    if (mode === 'diagonal') {
      // 절단선 방향 벡터(u)와 그에 수직인, 조각을 나누는 방향 벡터(n)
      const diagAngle = (28 + pseudoRandom(seed + 9101) * 34) * (pseudoRandom(seed + 9151) < 0.5 ? 1 : -1) * Math.PI / 180;
      const ux = Math.cos(diagAngle), uy = Math.sin(diagAngle);
      const nx = -uy, ny = ux;
      const span = Math.hypot(w, h) * 1.4; // 회전된 클립이 어느 각도든 텍스트를 완전히 덮도록 넉넉하게
      const top = -span / 2;
      const stripSize = span / strips;

      for (let i = 0; i < strips; i++) {
        const s0 = top + i * stripSize;
        const r1 = pseudoRandom(seed + i * 97.13 + 11);
        const r2 = pseudoRandom(seed + i * 61.7 + 37);
        const shift = (r1 * 2 - 1) * gap;
        const rot = (r2 * 2 - 1) * rotateDeg * Math.PI / 180;
        const mid = s0 + stripSize / 2;

        ctx.save();
        // 클립 영역만 대각선 방향으로 돌려서 만든 뒤, 글자를 그리기 전에 다시 원래 각도로
        // 되돌림 — 캔버스 클립은 만들 당시의 좌표계가 그대로 유지되므로, 이후 각도를
        // 원상복구해도 절단면은 대각선 그대로 남고 글자는 똑바로 서게 됨
        ctx.rotate(diagAngle);
        ctx.beginPath();
        ctx.rect(-span / 2, s0 - 0.5, span, stripSize + 1);
        ctx.clip();
        ctx.rotate(-diagAngle);

        // 조각은 절단선 방향(u)을 따라 밀리게 해서, 대각선 솔기를 따라 찢어져 밀린 느낌을 냄
        const pivotX = mid * nx, pivotY = mid * ny;
        const shiftX = ux * shift, shiftY = uy * shift;
        ctx.translate(pivotX + shiftX, pivotY + shiftY);
        if (rot) ctx.rotate(rot);
        ctx.translate(-pivotX, -pivotY);

        baseCharacterDraw.call(this, ctx);
        ctx.restore();
      }
      return;
    }

    const vertical = mode === 'vertical';
    const mainSpan = vertical ? w : h;
    const crossSpan = vertical ? h : w;
    const top = -mainSpan / 2;
    const stripSize = mainSpan / strips;

    for (let i = 0; i < strips; i++) {
      const s0 = top + i * stripSize;
      const r1 = pseudoRandom(seed + i * 97.13 + 11);
      const r2 = pseudoRandom(seed + i * 61.7 + 37);
      const shift = (r1 * 2 - 1) * gap;
      const rot = (r2 * 2 - 1) * rotateDeg * Math.PI / 180;
      const mid = s0 + stripSize / 2;

      ctx.save();
      ctx.beginPath();
      if (vertical) {
        ctx.rect(s0 - 0.5, -crossSpan / 2, stripSize + 1, crossSpan);
      } else {
        ctx.rect(-crossSpan / 2, s0 - 0.5, crossSpan, stripSize + 1);
      }
      ctx.clip();

      if (vertical) {
        ctx.translate(mid, shift);
        if (rot) ctx.rotate(rot);
        ctx.translate(-mid, 0);
      } else {
        ctx.translate(shift, mid);
        if (rot) ctx.rotate(rot);
        ctx.translate(0, -mid);
      }
      baseCharacterDraw.call(this, ctx);
      ctx.restore();
    }
  }

  // 글리치 "글자별" 모드: 글자 하나하나를 각기 다른(seed로 정해진) 무작위 방향으로
  // 빨강/시안 두 벌을 어긋나게 겹쳐 그려서, 글자마다 제각각 다른 쪽으로 색이 갈라지는
  // 느낌을 냄 (가로/세로 모드는 텍스트 전체를 한 방향으로만 어긋나게 하는 것과 대비됨)
  function drawGlitchPerCharPass(ctx, amt, seed, op){
    const text = this.text || '';
    if (!text.length) { origItextRender.call(this, ctx); return; }
    const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();

    ctx.save();
    ctx.font = fontDecl;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const chars = text.split('').filter(c => c !== '\n' && c !== '\r');
    const widths = chars.map(c => Math.max(1, ctx.measureText(c).width));
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const yBase = this.fontSize * 0.32;

    let x = -totalWidth / 2;
    chars.forEach((c, i) => {
      const w = widths[i];
      const ang = pseudoRandom(seed + i * 31.7 + 501) * Math.PI * 2;
      const dx = Math.cos(ang) * amt, dy = Math.sin(ang) * amt;

      ctx.globalAlpha = op * 0.85;
      ctx.fillStyle = '#ff2a4d';
      ctx.fillText(c, x - dx, yBase - dy);

      ctx.globalAlpha = op * 0.85;
      ctx.fillStyle = '#2af0ff';
      ctx.fillText(c, x + dx, yBase + dy);

      x += w;
    });

    ctx.restore();
  }

  // 녹아 늘러붙은 효과: 글자를 아래로 여러 겹 살짝씩 밀어서 점점 흐려지게 겹쳐 그려
  // 뭉개진 듯한 스머지를 만들고, 그 아래에 방울 몇 가닥이 뚝뚝 떨어지듯 늘어지게 그림
  // (방울 위치는 seed로 고정되어 있어 "다시 녹이기"를 눌러야 바뀜)
  // 불꽃 하나(눈물방울을 뒤집은 모양)를 베지어 곡선으로 그림 — 바깥색 큰 불꽃 위에
  // 안쪽색 작은 불꽃심을 겹쳐서 타오르는 불꽃 실루엣을 표현함
  function drawFlameShape(ctx, baseX, baseY, flameW, flameH, lean, outerColor, innerColor){
    function shape(scale, colorFill){
      const hw = flameW * scale / 2;
      const hh = flameH * scale;
      ctx.beginPath();
      ctx.moveTo(baseX - hw, baseY);
      ctx.bezierCurveTo(
        baseX - hw * 1.3, baseY - hh * 0.55,
        baseX - hw * 0.25 + lean * scale, baseY - hh * 0.85,
        baseX + lean * scale, baseY - hh
      );
      ctx.bezierCurveTo(
        baseX + hw * 0.25 + lean * scale, baseY - hh * 0.85,
        baseX + hw * 1.3, baseY - hh * 0.55,
        baseX + hw, baseY
      );
      ctx.closePath();
      ctx.fillStyle = colorFill;
      ctx.fill();
    }
    shape(1, outerColor);
    shape(0.55, innerColor);
  }

  // 불타는 효과: 글자 맨 위쪽 가장자리를 따라 불꽃 여러 개가 타오르듯 튀어나오고,
  // 그 위로 작은 잔불(재)이 흩날리며 튀는 모습을 그림 (위치는 seed로 고정 — "다시 타오르기"로 재배치)
  function drawFireFlamesPass(ctx){
    const cfg = this.fireText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    const outer = cfg.outerColor || '#ff5500';
    const inner = cfg.innerColor || '#ffe066';
    const seed = cfg.seed || 0;
    const text = this.text || '';

    const w = this.width || 100;
    const h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;

    // 오브젝트의 높이(h)는 줄간격까지 포함해서, 맨 위(-h/2)가 실제 글자 잉크보다 위에 있는 경우가
    // 많음 — 첫 줄 텍스트를 실측해서 그 여백만큼 아래로 내려, 불꽃 밑변이 글자 위쪽 가장자리에
    // 실제로 닿도록(살짝 겹쳐 뒤에 숨도록) 보정함
    let capTopGap = fontSize * 0.28;
    try {
      const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();
      ctx.save();
      ctx.font = fontDecl;
      const firstLine = text.split('\n')[0] || 'A';
      const m = ctx.measureText(firstLine || 'A');
      ctx.restore();
      if (m && m.actualBoundingBoxAscent) {
        const lineH = fontSize * (this.lineHeight || 1.16);
        capTopGap = Math.max(0, lineH - m.actualBoundingBoxAscent - fontSize * 0.06);
      }
    } catch (e) { /* 측정 실패 시 기본값 사용 */ }

    const topY = -h / 2 + capTopGap;
    const op = this.opacity != null ? this.opacity : 1;

    const flameCount = Math.max(3, Math.round(4 + amt * 9));
    ctx.save();
    ctx.globalAlpha = op;
    for (let i = 0; i < flameCount; i++) {
      const rx = pseudoRandom(seed + i * 11.3 + 5);
      const rh = pseudoRandom(seed + i * 23.7 + 19);
      const rw = pseudoRandom(seed + i * 5.9 + 31);
      const rlean = pseudoRandom(seed + i * 41.1 + 53);
      const x = -w / 2 + rx * w;
      const flameH = (0.35 + rh * 0.9) * amt * h * 1.15 + 6;
      const flameW = fontSize * (0.16 + rw * 0.22);
      const lean = (rlean * 2 - 1) * flameW * 0.6;
      drawFlameShape(ctx, x, topY, flameW, flameH, lean, outer, inner);
    }
    ctx.restore();

    // 튀는 재(불티) — 작은 점들이 위로 흩날리며, 위로 갈수록 옅어짐
    const sparkCount = Math.max(0, Math.round(amt * 16));
    if (sparkCount > 0) {
      ctx.save();
      for (let i = 0; i < sparkCount; i++) {
        const rx = pseudoRandom(seed + i * 71.3 + 101);
        const ry = pseudoRandom(seed + i * 17.9 + 211);
        const rs = pseudoRandom(seed + i * 33.1 + 307);
        const x = -w / 2 + rx * w * 1.2 - w * 0.1;
        const y = topY - ry * h * (0.4 + amt * 1.1) - 4;
        const size = 1 + rs * 2.4;
        ctx.globalAlpha = op * (0.3 + (1 - ry) * 0.55);
        ctx.fillStyle = rs > 0.5 ? inner : outer;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 녹아 늘러붙은 효과: 글자를 아래로 여러 겹 살짝씩 밀어서 점점 흐려지게 겹쳐 그려
  // 뭉개진 듯한 스머지를 만들고, 그 아래에 방울 몇 가닥이 뚝뚝 떨어지듯 늘어지게 그림
  // (방울 위치는 seed로 고정되어 있어 "다시 녹이기"를 눌러야 바뀜)
  function drawMeltPass(ctx){
    const cfg = this.meltText;
    if (!cfg) return;
    const amount = Math.max(0, Math.min(100, cfg.amount || 0));
    if (amount <= 0) return;
    const dripCount = Math.max(0, Math.round(cfg.drips != null ? cfg.drips : 6));
    const seed = cfg.seed || 0;
    const amt = amount / 100;

    const w = this.width || 100;
    const h = this.height || (this.fontSize || 40) * 1.2;
    const baseColor = (this.fill && typeof this.fill === 'string') ? this.fill : '#333333';
    const origFill = this.fill, origStroke = this.stroke, origStrokeWidth = this.strokeWidth;

    // 1) 아래로 뭉개지는 스머지 — 점점 흐려지는 얇은 복사본을 아래로 밀며 여러 겹 그림
    const smearSteps = 8;
    const smearReach = amt * h * 0.55;
    for (let i = 1; i <= smearSteps; i++) {
      const t = i / smearSteps;
      ctx.save();
      ctx.globalAlpha = (this.opacity != null ? this.opacity : 1) * (1 - t) * 0.35;
      ctx.translate(0, smearReach * t);
      ctx.scale(1, 1 + amt * 0.25 * t);
      this.fill = baseColor; this.stroke = null; this.strokeWidth = 0;
      baseCharacterDraw.call(this, ctx);
      ctx.restore();
    }
    this.fill = origFill; this.stroke = origStroke; this.strokeWidth = origStrokeWidth;

    // 2) 뚝뚝 흘러내리는 방울 — 텍스트 아래쪽 여러 지점에서 길게 늘어져 끝에 방울지며 떨어짐
    if (dripCount > 0) {
      ctx.save();
      ctx.globalAlpha = this.opacity != null ? this.opacity : 1;
      ctx.fillStyle = baseColor;
      for (let i = 0; i < dripCount; i++) {
        const rx = pseudoRandom(seed + i * 13.7 + 3);
        const rl = pseudoRandom(seed + i * 29.3 + 17);
        const rw = pseudoRandom(seed + i * 7.1 + 41);
        const x = -w / 2 + rx * w;
        const dripLen = (0.2 + rl * 0.9) * amt * h * 0.9;
        const dripW = (this.fontSize || 40) * (0.05 + rw * 0.07);
        const topY = h * 0.32;
        if (dripLen < 2) continue;
        ctx.beginPath();
        ctx.moveTo(x - dripW / 2, topY);
        ctx.lineTo(x + dripW / 2, topY);
        ctx.lineTo(x + dripW / 2, topY + dripLen);
        ctx.arc(x, topY + dripLen, dripW / 2, 0, Math.PI, false);
        ctx.lineTo(x - dripW / 2, topY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 스피드 잔상 효과: 위/아래/왼쪽/오른쪽 네 방향 중 "한 방향"만 골라서(말풍선 꼬리처럼) 그
  // 방향으로 잔상·스피드라인·흙먼지가 몰아치듯 나가게 함. 잔상은 진행 방향으로 갈수록 늘어나며
  // (스트레치) 옅어지고, 그 옆으로 가는 스피드라인을 더해 속도감을 강조함.
  // 방향/배치는 seed로 고정 — "다시 튀기기"를 눌러야 방향과 배치가 모두 새로 바뀜
  function drawSpeedPass(ctx){
    const cfg = this.speedText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const dustColor = cfg.dustColor || '#8a6a45';
    const op = this.opacity != null ? this.opacity : 1;
    const origFill = this.fill, origStroke = this.stroke, origStrokeWidth = this.strokeWidth;

    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // 위 아래 왼쪽 오른쪽
    const d = dirs[Math.floor(pseudoRandom(seed + 999) * 4) % 4]; // 말풍선 꼬리처럼 한 방향만 확정
    const perp = [-d[1], d[0]]; // 그 방향에 수직인 축(스피드라인/먼지가 옆으로 퍼지는 폭 계산용)

    const copies = Math.max(3, Math.round(4 + amt * 7));
    const maxReach = fontSize * (1.1 + amt * 3.2); // 잔상이 훨씬 멀리까지 늘어지도록

    // 1) 잔상 — 진행 반대쪽으로 여러 겹, 갈수록 옅어지고 진행 방향으로 스트레치되어 속도감을 냄
    ctx.save();
    for (let i = 1; i <= copies; i++) {
      const t = i / copies;
      const randSize = 0.7 + pseudoRandom(seed + i * 13.7 + 1) * 0.6;
      const dist = maxReach * t * randSize;
      ctx.save();
      ctx.globalAlpha = op * Math.pow(1 - t, 1.3) * 0.6;
      ctx.translate(d[0] * dist, d[1] * dist);
      const stretch = 1 + amt * 0.6 * t;
      if (d[0] !== 0) { ctx.scale(stretch, 1); } else { ctx.scale(1, stretch); }
      this.fill = origFill; this.stroke = null; this.strokeWidth = 0;
      baseCharacterDraw.call(this, ctx);
      ctx.restore();
    }
    this.fill = origFill; this.stroke = origStroke; this.strokeWidth = origStrokeWidth;
    ctx.restore();

    // 2) 스피드라인 — 진행 방향으로 뻗는 가는 직선 여러 개(만화의 질주선처럼) 속도감을 더함
    const lineCount = Math.round(5 + amt * 10);
    ctx.save();
    ctx.strokeStyle = (origFill && typeof origFill === 'string') ? origFill : '#333333';
    for (let i = 0; i < lineCount; i++) {
      const along = (pseudoRandom(seed + i * 9.1 + 3000) - 0.5) * (d[0] !== 0 ? h : w) * 0.95;
      const startDist = maxReach * 0.25 + pseudoRandom(seed + i * 5.3 + 3200) * maxReach * 0.3;
      const len = maxReach * (0.6 + pseudoRandom(seed + i * 7.7 + 3400) * 1.1);
      const lw = 0.8 + pseudoRandom(seed + i * 3.3 + 3600) * 1.8;
      const sx = d[0] * startDist + perp[0] * along, sy = d[1] * startDist + perp[1] * along;
      const ex = d[0] * (startDist + len) + perp[0] * along, ey = d[1] * (startDist + len) + perp[1] * along;
      ctx.globalAlpha = op * (0.2 + pseudoRandom(seed + i * 2.1 + 3800) * 0.35);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();

    // 3) 흙먼지 — 진행 방향 쪽으로 부채꼴로 튀는 모습(사방이 아니라 한쪽으로만 몰아침)
    const dustCount = Math.round(14 + amt * 30);
    ctx.save();
    for (let i = 0; i < dustCount; i++) {
      const dist = fontSize * 0.2 + pseudoRandom(seed + i * 19.3 + 700) * maxReach * 1.2;
      const spreadAmt = (pseudoRandom(seed + i * 23.1 + 900) * 2 - 1) * (Math.min(w, h) * 0.5 + fontSize * 0.4);
      const x = d[0] * dist + perp[0] * spreadAmt;
      const y = d[1] * dist + perp[1] * spreadAmt;
      const size = 1 + pseudoRandom(seed + i * 7.7 + 1100) * (2.5 + amt * 3.5);
      const rot = pseudoRandom(seed + i * 11.1 + 1300) * Math.PI * 2;

      ctx.save();
      ctx.globalAlpha = op * (0.4 + pseudoRandom(seed + i * 5.5 + 1500) * 0.5);
      ctx.fillStyle = dustColor;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      const sides = 5;
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const rv = size * (0.6 + pseudoRandom(seed + i * 3 + s * 2 + 2000) * 0.7);
        const px = Math.cos(a) * rv, py = Math.sin(a) * rv;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // 거울 반사 효과: 원본 글자 바로 아래에 상하로 뒤집힌 복사본을 옅게 그리고, 아래로 갈수록
  // 점점 투명해지도록(destination-in으로 위→아래 불투명→투명 그라디언트를 곱함) 페이드시켜서
  // 마치 바닥/유리에 살짝 비친 것처럼 보이게 함. "흐림"을 올리면 안개 낀 듯 부드럽게 퍼져
  // 더 입체적인 반사 느낌이 남. 반사 영역만 클리핑해서 캔버스의 다른 부분에는 영향 없음.
  // 거울 반사 비트맵을 만들어서(글자 모양+블러+페이드 그라디언트까지 전부 한 번만 그려서) 오브젝트에
  // 캐싱해둠. 텍스트 내용/폰트/색상/효과값이 그대로면 캐시를 재사용하고, 그중 하나라도 바뀌었을 때만
  // 다시 만듦 — ctx.filter의 blur는 원래 매 프레임 다시 계산하면 매우 무거운데(특히 드래그·타이핑
  // 중 캔버스 전체가 계속 다시 그려질 때), 이렇게 캐싱해두면 평소 렌더링은 그냥 drawImage 한 번으로
  // 끝나서 훨씬 가벼워짐.
  function buildReflectionBitmap(t, cfg, w, h, gap, reflectH, pad){
    const fill = (t.fill && typeof t.fill === 'string') ? t.fill : '#333333';
    const stroke = (t.stroke && typeof t.stroke === 'string') ? t.stroke : '';
    const key = [
      t.text, t.fontFamily, t.fontWeight, t.fontStyle, t.fontSize, t.charSpacing, t.lineHeight,
      fill, stroke, t.strokeWidth, Math.round(w), Math.round(h),
      cfg.intensity, cfg.blur, cfg.gap
    ].join('|');
    const cache = t.__reflectionCache;
    if (cache && cache.key === key) return cache;

    const res = 2; // 확대해도 흐릿하지 않도록 2배 해상도로 그려둠
    const cw = Math.max(1, Math.ceil(w * 2 * res));
    const ch = Math.max(1, Math.ceil((reflectH + pad) * res));
    let off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    const octx = off.getContext('2d');
    octx.scale(res, res);
    octx.translate(w, -(h / 2 + gap)); // 클립 영역 좌상단(-w, h/2+gap)이 오프스크린 (0,0)이 되도록 이동

    const savedFill = t.fill, savedStroke = t.stroke, savedStrokeWidth = t.strokeWidth;
    octx.save();
    octx.translate(0, h + gap * 2);
    octx.scale(1, -1);
    t.fill = fill; t.stroke = stroke || null; t.strokeWidth = stroke ? t.strokeWidth : 0;
    baseCharacterDraw.call(t, octx);
    octx.restore();
    t.fill = savedFill; t.stroke = savedStroke; t.strokeWidth = savedStrokeWidth;

    // 위(글자와 가까운 쪽)는 진하게, 아래로 갈수록 완전히 투명해지도록 알파 그라디언트를 곱함
    octx.save();
    octx.globalCompositeOperation = 'destination-in';
    const grad = octx.createLinearGradient(0, h / 2 + gap, 0, h / 2 + gap + reflectH);
    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = grad;
    octx.fillRect(-w, h / 2 + gap, w * 2, reflectH + pad);
    octx.restore();

    // 흐림은 여기 오프스크린에서 딱 한 번만 적용(성능 핵심 — 매 프레임 반복하지 않음)
    if (cfg.blur > 0) {
      const blurred = document.createElement('canvas');
      blurred.width = cw; blurred.height = ch;
      const bctx = blurred.getContext('2d');
      bctx.filter = 'blur(' + (cfg.blur * res) + 'px)';
      bctx.drawImage(off, 0, 0);
      off = blurred;
    }

    const result = { key, canvas: off };
    t.__reflectionCache = result;
    return result;
  }

  function drawReflectionPass(ctx){
    const cfg = this.reflectionText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 55)) / 100;
    if (amt <= 0) return;
    const blurPx = Math.max(0, Math.min(20, cfg.blur != null ? cfg.blur : 4));
    // 간격은 음수까지 허용 — 글꼴 자체의 위아래 여백(줄간격) 때문에 0으로 둬도 살짝 떠 보일 수 있어서,
    // 안쪽(음수)으로 당길수록 그 여백까지 파고들어 글자 바로 아래에 완전히 딱 붙을 수 있게 함.
    // 안쪽으로 당기는 쪽(gapRaw<0)은 바깥으로 벌리는 쪽보다 배율을 더 크게 줘서(0.4→0.65)
    // 슬라이더를 조금만 내려도 확실히 닫히도록 한계치를 늘림.
    const gapRaw = Math.max(-60, Math.min(100, cfg.gap != null ? cfg.gap : 0)) / 100;
    const w = this.width || 100;
    const h = this.height || (this.fontSize || 40) * 1.2;
    const op = this.opacity != null ? this.opacity : 1;

    const gap = h * gapRaw * (gapRaw >= 0 ? 0.4 : 0.65); // 원본과 반사 사이 틈(음수면 안쪽으로 파고듦)
    const reflectH = h * (0.5 + amt * 0.7); // 강도가 셀수록 반사가 더 길게 이어져 보임
    const topY = h / 2 + gap; // 원본 텍스트 아랫변 기준 위치(간격만큼 위/아래로 이동)
    const pad = blurPx * 2; // 흐림 반경만큼 여유를 둬서 가장자리가 잘리지 않게 함

    const bmp = buildReflectionBitmap(this, cfg, w, h, gap, reflectH, pad);

    ctx.save();
    ctx.globalAlpha = op * (0.35 + amt * 0.4);
    ctx.drawImage(bmp.canvas, -w, topY, w * 2, reflectH + pad);
    ctx.restore();
  }
  // (1) 큰 파편 몇 조각은 제자리에서 살짝 어긋나게(이동/회전) 다시 그려서 밀려난 것처럼 보이게 하고,
  // (2) 작은 파편(칩)들은 충격 지점에서 사방으로 멀리 튀어나가며 흩어지게 함.
  // 각 파편은 뒤에 그림자를, 가장자리에 밝은 테두리(베벨)를 넣어서 붕 떠 있는 입체감을 냄.
  // 충격 지점/균열 모양/파편 배치는 모두 seed로 고정 — "다시 깨기"를 눌러야 새로 바뀜
  function drawGlassCrackPass(ctx){
    const cfg = this.crackText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const crackColor = cfg.crackColor || '#ffffff';
    const origFill = this.fill, origStroke = this.stroke, origStrokeWidth = this.strokeWidth;
    const self = this;

    // 충격 지점: 텍스트 영역 안쪽 랜덤 위치
    const impactX = (pseudoRandom(seed + 11) - 0.5) * w * 0.5;
    const impactY = (pseudoRandom(seed + 23) - 0.5) * h * 0.5;

    const rayCount = Math.max(7, Math.round(8 + amt * 10)); // 더 잘게 쪼개지도록 금 개수를 늘림
    const maxR = Math.max(w, h) * 0.8;

    // 방사형 금(ray)의 각도/길이를 미리 계산 — 파편 클리핑에도 그대로 재사용
    const angles = [];
    let a = pseudoRandom(seed + 1) * Math.PI * 2;
    for (let i = 0; i < rayCount; i++) {
      a += (Math.PI * 2 / rayCount) * (0.65 + pseudoRandom(seed + i * 7 + 3) * 0.7);
      angles.push(a);
    }
    const rayLens = angles.map((ang, i) => maxR * (0.5 + pseudoRandom(seed + i * 13 + 5) * 0.6));

    // 파편 하나를 "그림자 → 내용(클립+이동) → 밝은 테두리(베벨)" 순으로 그려서 입체감을 줌.
    // poly는 원본(이동 전) 좌표 기준의 폴리곤이고, dx/dy만큼 이동한 자리에 그려짐.
    // shadowColor를 파편마다 랜덤하게 줘서 단조로운 회색 판처럼 보이지 않게 함
    function drawShardWithDepth(poly, dx, dy, rot, shadowOff, shadowColor){
      const target = poly.map(p => [p[0] + dx, p[1] + dy]);

      // 그림자 — 파편이 원래 면보다 살짝 떠 있는 느낌을 주기 위해 한쪽으로 치우쳐 색을 깔아줌
      ctx.save();
      ctx.beginPath();
      target.forEach((p, i) => {
        const sx = p[0] + shadowOff[0], sy = p[1] + shadowOff[1];
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.globalAlpha = op * 0.4;
      ctx.fillStyle = shadowColor || '#000000';
      ctx.fill();
      ctx.restore();

      // 파편 내용 — 대상 위치에 클리핑한 뒤, 원본 글자 내용을 dx/dy만큼 이동해서 채워 넣음
      ctx.save();
      ctx.beginPath();
      target.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = op;
      ctx.translate(dx, dy);
      ctx.rotate(rot);
      self.fill = origFill; self.stroke = origStroke; self.strokeWidth = origStrokeWidth;
      baseCharacterDraw.call(self, ctx);
      ctx.restore();

      // 밝은 테두리 — 깨진 유리 단면이 빛을 받아 반짝이는 느낌(베벨 하이라이트)
      ctx.save();
      ctx.beginPath();
      target.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      ctx.globalAlpha = op * 0.65;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(0.6, fontSize * 0.012);
      ctx.stroke();
      ctx.restore();
    }

    // 1) 큰 파편들 — 제자리에서 살짝만 어긋나서(이동/회전) 갈라진 유리판처럼 보이게 함
    const shardCount = Math.max(3, Math.round(3 + amt * 6));
    for (let s = 0; s < shardCount; s++) {
      const ri = Math.floor(pseudoRandom(seed + s * 29 + 700) * rayCount) % rayCount;
      const rj = (ri + 1) % rayCount;
      const a0 = angles[ri], a1 = angles[rj];
      const r0 = rayLens[ri] * (0.1 + pseudoRandom(seed + s * 17 + 900) * 0.35);
      const r1 = Math.min(rayLens[ri], rayLens[rj]) * (0.5 + pseudoRandom(seed + s * 19 + 1100) * 0.45);
      const poly = [
        [impactX + Math.cos(a0) * r0, impactY + Math.sin(a0) * r0],
        [impactX + Math.cos(a0) * r1, impactY + Math.sin(a0) * r1],
        [impactX + Math.cos(a1) * r1, impactY + Math.sin(a1) * r1],
        [impactX + Math.cos(a1) * r0, impactY + Math.sin(a1) * r0]
      ];
      const dx = (pseudoRandom(seed + s * 3 + 1300) * 2 - 1) * (fontSize * 0.06 + amt * fontSize * 0.12);
      const dy = (pseudoRandom(seed + s * 5 + 1500) * 2 - 1) * (fontSize * 0.06 + amt * fontSize * 0.12);
      const rot = (pseudoRandom(seed + s * 7 + 1700) * 2 - 1) * (amt * 0.16);
      const shardHue = pseudoRandom(seed + s * 41 + 6000) * 360;
      const shardRgb = EP.hsvToRgb(shardHue, 0.55 + pseudoRandom(seed + s * 43 + 6200) * 0.35, 0.35 + pseudoRandom(seed + s * 47 + 6400) * 0.35);
      const shardColor = EP.rgbToHex(shardRgb.r, shardRgb.g, shardRgb.b);
      drawShardWithDepth(poly, dx, dy, rot, [fontSize * (0.03 + amt * 0.02), fontSize * (0.05 + amt * 0.03)], shardColor);
    }

    // 2) 작은 파편(칩)들 — 충격 지점 주변에서 시작해 사방으로 멀리 튀어나가며 흩어짐
    const flyCount = Math.max(4, Math.round(6 + amt * 16));
    for (let s = 0; s < flyCount; s++) {
      const ri = Math.floor(pseudoRandom(seed + s * 37 + 4000) * rayCount) % rayCount;
      const rj = (ri + 1) % rayCount;
      const a0 = angles[ri], a1 = angles[rj];
      const rBase = maxR * (0.12 + pseudoRandom(seed + s * 11 + 4200) * 0.4);
      const chipSize = fontSize * (0.05 + pseudoRandom(seed + s * 13 + 4400) * 0.09);
      const cx = impactX + Math.cos((a0 + a1) / 2) * rBase;
      const cy = impactY + Math.sin((a0 + a1) / 2) * rBase;
      const rot0 = pseudoRandom(seed + s * 3 + 4600) * Math.PI * 2;
      const poly = [0, 1, 2].map(k => {
        const ang = rot0 + k * (Math.PI * 2 / 3);
        return [cx + Math.cos(ang) * chipSize, cy + Math.sin(ang) * chipSize];
      });
      const flyAngle = Math.atan2(cy - impactY, cx - impactX) + (pseudoRandom(seed + s * 17 + 4800) * 2 - 1) * 0.6;
      const flyDist = fontSize * (0.4 + amt * 2.2) * (0.35 + pseudoRandom(seed + s * 19 + 5000) * 0.95);
      const dx = Math.cos(flyAngle) * flyDist;
      const dy = Math.sin(flyAngle) * flyDist;
      const rot = (pseudoRandom(seed + s * 7 + 5200) * 2 - 1) * Math.PI * 0.7;
      const chipHue = pseudoRandom(seed + s * 53 + 6600) * 360;
      const chipRgb = EP.hsvToRgb(chipHue, 0.55 + pseudoRandom(seed + s * 59 + 6800) * 0.35, 0.35 + pseudoRandom(seed + s * 61 + 7000) * 0.35);
      const chipColor = EP.rgbToHex(chipRgb.r, chipRgb.g, chipRgb.b);
      drawShardWithDepth(poly, dx, dy, rot, [fontSize * 0.025, fontSize * 0.04], chipColor);
    }

    this.fill = origFill; this.stroke = origStroke; this.strokeWidth = origStrokeWidth;

    // 3) 금(균열) 선 — 충격 지점에서 뻗어나가는 삐뚤빼뚤한 방사형 선 + 그 사이를 잇는 보조 균열
    ctx.save();
    ctx.globalAlpha = op;
    ctx.strokeStyle = crackColor;
    ctx.lineWidth = Math.max(0.8, fontSize * 0.012);
    ctx.lineJoin = 'round';
    angles.forEach((ang, i) => {
      const len = rayLens[i];
      const segs = 5;
      ctx.beginPath();
      ctx.moveTo(impactX, impactY);
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const r = len * t;
        const jitter = (pseudoRandom(seed + i * 31 + k * 7 + 2000) * 2 - 1) * len * 0.06;
        const perpAng = ang + Math.PI / 2;
        const bx = impactX + Math.cos(ang) * r + Math.cos(perpAng) * jitter;
        const by = impactY + Math.sin(ang) * r + Math.sin(perpAng) * jitter;
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    });
    // 보조 균열 — 인접한 금끼리 잇는 짧은 선을 몇 개 랜덤으로 추가해 거미줄처럼 보이게 함
    const secCount = Math.round(amt * rayCount * 0.7);
    for (let i = 0; i < secCount; i++) {
      const ri = Math.floor(pseudoRandom(seed + i * 41 + 2500) * rayCount) % rayCount;
      const rj = (ri + 1) % rayCount;
      const t0 = 0.3 + pseudoRandom(seed + i * 11 + 2700) * 0.5;
      const t1 = 0.3 + pseudoRandom(seed + i * 13 + 2900) * 0.5;
      const x0 = impactX + Math.cos(angles[ri]) * rayLens[ri] * t0;
      const y0 = impactY + Math.sin(angles[ri]) * rayLens[ri] * t0;
      const x1 = impactX + Math.cos(angles[rj]) * rayLens[rj] * t1;
      const y1 = impactY + Math.sin(angles[rj]) * rayLens[rj] * t1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 타일무늬 효과: 글자 위에 랜덤한 크기의 직사각형 타일들을 격자 기반(칸마다 위치/크기를 살짝
  // 흔들어 기계적이지 않게)으로 배치하되, 각 타일은 실제 글자 모양대로만 클리핑해서 채워 넣음
  // (그 칸의 사각형과 글자가 겹치는 부분만 보임 → 퍼즐처럼 글자 위에 조각조각 붙인 모습).
  // 색상은 seed로 고른 하나의 색상계열(hue) 안에서만 고르고, 밝기(명도)만 기준값 대비 ±10%
  // (총 20% 이내)로 랜덤하게 달리해서 같은 색 계열이지만 살짝 어둡고 밝은 타일이 섞여 보이게 함.
  // 타일 사이에 작은 틈(그라우트)을 둬서 원래 글자색이 살짝 비치며 격자 구분이 드러나게 함.
  // 배치/크기/색상은 모두 seed로 고정 — "다시 붙이기"를 눌러야 새로 바뀜
  function drawTilePass(ctx){
    const cfg = this.tileText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const origFill = this.fill;

    // 같은 색상계열 하나(hue)만 사용 — 채도는 고정, 명도만 기준값(약간 어두운 톤) 기준으로
    // 타일마다 ±10%(총 20% 이내)씩 랜덤하게 갈라지게 함
    const hue = pseudoRandom(seed + 501) * 360;
    const sat = 0.32 + pseudoRandom(seed + 601) * 0.35;
    const baseVal = 0.3 + pseudoRandom(seed + 701) * 0.25;

    // 강도가 높을수록 타일이 더 작고 촘촘해짐. 가로세로 비율도 랜덤하게 달리해서 정사각형이
    // 아니라 직사각형 타일들이 섞여 보이게 함
    let tileW = fontSize * (0.6 - amt * 0.32);
    let tileH = tileW * (0.5 + pseudoRandom(seed + 41) * 0.6);

    let halfW = w / 2 + tileW, halfH = h / 2 + tileH;
    let cols = Math.max(2, Math.ceil((halfW * 2) / tileW));
    let rows = Math.max(2, Math.ceil((halfH * 2) / tileH));
    const maxTiles = 220; // 너무 잘게 쪼개져 성능이 나빠지지 않도록 타일 개수 상한을 둠
    if (cols * rows > maxTiles) {
      const scale = Math.sqrt((cols * rows) / maxTiles);
      tileW *= scale; tileH *= scale;
      cols = Math.max(2, Math.ceil((halfW * 2) / tileW));
      rows = Math.max(2, Math.ceil((halfH * 2) / tileH));
    }
    const startX = -cols * tileW / 2;
    const startY = -rows * tileH / 2;

    ctx.save();
    ctx.globalAlpha = op;
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const i = ry * cols + rx;
        // 칸마다 위치와 크기를 살짝 흔들어서(+ 틈새) 기계적인 격자가 아니라 자연스러운
        // 랜덤 사각 타일들처럼 보이게 함
        const jitterX = (pseudoRandom(seed + i * 17.3 + 1) - 0.5) * tileW * 0.16;
        const jitterY = (pseudoRandom(seed + i * 23.9 + 2) - 0.5) * tileH * 0.16;
        const gapT = 0.08 + pseudoRandom(seed + i * 13.1 + 3) * 0.08;
        const cellW = tileW * (1 - gapT);
        const cellH = tileH * (1 - gapT);
        const cx = startX + rx * tileW + tileW / 2 + jitterX;
        const cy = startY + ry * tileH + tileH / 2 + jitterY;

        const valOffset = (pseudoRandom(seed + i * 7.7 + 91) - 0.5) * 0.2; // ±10% (총 20% 이내)
        const val = Math.max(0.05, Math.min(0.95, baseVal + valOffset));
        const rgb = EP.hsvToRgb(hue, sat, val);
        const tileColor = EP.rgbToHex(rgb.r, rgb.g, rgb.b);

        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - cellW / 2, cy - cellH / 2, cellW, cellH);
        ctx.clip();
        this.fill = tileColor;
        baseCharacterDraw.call(this, ctx);
        ctx.restore();
      }
    }
    this.fill = origFill;
    ctx.restore();
  }

  // ---- 테마 장식 모양들 (중심 0,0 기준, size는 대략적인 크기) ----
  function drawHoofPrint(ctx, size){
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.3);
    ctx.quadraticCurveTo(-size * 0.55, -size * 0.5, 0, -size * 0.55);
    ctx.quadraticCurveTo(size * 0.55, -size * 0.5, size * 0.5, size * 0.3);
    ctx.quadraticCurveTo(size * 0.3, size * 0.15, 0, size * 0.2);
    ctx.quadraticCurveTo(-size * 0.3, size * 0.15, -size * 0.5, size * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  function drawStarShape(ctx, size){
    const spikes = 5, outerR = size * 0.5, innerR = size * 0.22;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const ang = (Math.PI / spikes) * i - Math.PI / 2;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  function drawMoonShape(ctx, size){
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2, false);
    ctx.moveTo(size * 0.7, -size * 0.05);
    ctx.arc(size * 0.28, -size * 0.05, size * 0.42, 0, Math.PI * 2, false);
    ctx.fill('evenodd');
  }
  function drawFishShape(ctx, size){
    ctx.beginPath();
    ctx.ellipse(-size * 0.06, 0, size * 0.32, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.24, 0);
    ctx.lineTo(size * 0.48, -size * 0.2);
    ctx.lineTo(size * 0.48, size * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  function drawTurtleShape(ctx, size){
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.38, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size * 0.44, 0, size * 0.12, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    [[-0.24, -0.28], [0.2, -0.3], [-0.24, 0.28], [0.2, 0.3]].forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.ellipse(size * lx, size * ly, size * 0.1, size * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function drawLeafShape(ctx, size){
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.5);
    ctx.quadraticCurveTo(size * 0.4, -size * 0.1, 0, size * 0.5);
    ctx.quadraticCurveTo(-size * 0.4, -size * 0.1, 0, -size * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  function drawButterflyShape(ctx, size){
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      ctx.save();
      ctx.rotate(sx * 0.3);
      ctx.beginPath();
      ctx.ellipse(sx * size * 0.22, sy * size * 0.18, size * (sy < 0 ? 0.22 : 0.17), size * (sy < 0 ? 0.17 : 0.13), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.04, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawFlowerShape(ctx, size){
    const petals = 5;
    for (let i = 0; i < petals; i++) {
      const ang = (Math.PI * 2 / petals) * i;
      ctx.save();
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.28, size * 0.16, size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  // 컨셉별로 묶어서, 한 번 뿌릴 때 한 컨셉의 모양들만 섞이지 않고 등장하도록 함
  const THEME_CONCEPTS = [
    { shapes: [drawHoofPrint] },              // 말발굽
    { shapes: [drawStarShape, drawMoonShape] }, // 별과 달
    { shapes: [drawFishShape, drawTurtleShape] }, // 생선과 거북이(수족관)
    { shapes: [drawLeafShape] },              // 휘날리는 나뭇잎
    { shapes: [drawButterflyShape] },         // 나비
    { shapes: [drawFlowerShape] }             // 꽃
  ];

  // 테마 장식 효과: 글자 위/주변에 컨셉(말발굽/별·달/생선·거북이/나뭇잎/나비/꽃) 중 하나를
  // seed로 골라서, 그 컨셉의 모양들만(서로 다른 컨셉끼리 섞이지 않게) 여러 색상·크기·위치로
  // 넓게 흩뿌림. 컨셉/배치/색상/크기는 모두 seed로 고정 — "다시 뿌리기"를 눌러야 새로 바뀜
  function drawFootprintPass(ctx){
    const cfg = this.footprintText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const concept = THEME_CONCEPTS[Math.floor(pseudoRandom(seed + 9999) * THEME_CONCEPTS.length) % THEME_CONCEPTS.length];

    const count = Math.max(4, Math.round(6 + amt * 20));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.3 + 1) - 0.5) * w * 2.0;
      const ry = (pseudoRandom(seed + i * 7.1 + 51) - 0.5) * h * 2.6;
      const size = fontSize * (0.16 + pseudoRandom(seed + i * 13.7 + 101) * 0.34);
      const rot = pseudoRandom(seed + i * 17.9 + 201) * Math.PI * 2;
      const shapeFn = concept.shapes[Math.floor(pseudoRandom(seed + i * 23.3 + 301) * concept.shapes.length) % concept.shapes.length];
      const hue = pseudoRandom(seed + i * 29.7 + 401) * 360;
      const rgb = EP.hsvToRgb(hue, 0.5 + pseudoRandom(seed + i * 31.1 + 501) * 0.4, 0.4 + pseudoRandom(seed + i * 37.3 + 601) * 0.4);

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.55 + pseudoRandom(seed + i * 3 + 701) * 0.4);
      ctx.fillStyle = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      shapeFn(ctx, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- 귀여운 동물 장식 모양들 (중심 0,0 기준, size는 대략적인 크기) ----
  function drawPawPrintShape(ctx, size){
    // 발바닥(큰 볼록한 패드)
    ctx.beginPath();
    ctx.ellipse(0, size * 0.12, size * 0.32, size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    // 발가락(작은 볼록 4개)
    [[-0.30, -0.32], [-0.11, -0.44], [0.11, -0.44], [0.30, -0.32]].forEach(([tx, ty]) => {
      ctx.beginPath();
      ctx.arc(size * tx, size * ty, size * 0.14, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function drawCatFaceShape(ctx, size){
    // 귀(뾰족한 세모, 양옆)
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s * size * 0.30, -size * 0.14);
      ctx.lineTo(s * size * 0.46, -size * 0.46);
      ctx.lineTo(s * size * 0.10, -size * 0.30);
      ctx.closePath();
      ctx.fill();
    });
    // 둥근 머리
    ctx.beginPath();
    ctx.arc(0, size * 0.04, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawDogFaceShape(ctx, size){
    // 귀(축 늘어진 타원, 양옆)
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.ellipse(s * size * 0.36, -size * 0.02, size * 0.16, size * 0.30, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
    });
    // 둥근 머리
    ctx.beginPath();
    ctx.arc(0, -size * 0.02, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // 주둥이
    ctx.beginPath();
    ctx.ellipse(0, size * 0.22, size * 0.18, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawBoneShape(ctx, size){
    // 가운데 막대
    ctx.beginPath();
    ctx.moveTo(-size * 0.32, -size * 0.10);
    ctx.lineTo(size * 0.32, -size * 0.10);
    ctx.lineTo(size * 0.32, size * 0.10);
    ctx.lineTo(-size * 0.32, size * 0.10);
    ctx.closePath();
    ctx.fill();
    // 양끝 동글동글한 손잡이
    [[-0.36, -0.14], [-0.36, 0.14], [0.36, -0.14], [0.36, 0.14]].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(size * bx, size * by, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function drawPetHeartShape(ctx, size){
    ctx.beginPath();
    ctx.moveTo(0, size * 0.32);
    ctx.bezierCurveTo(size * 0.55, -size * 0.05, size * 0.30, -size * 0.42, 0, -size * 0.12);
    ctx.bezierCurveTo(-size * 0.30, -size * 0.42, -size * 0.55, -size * 0.05, 0, size * 0.32);
    ctx.closePath();
    ctx.fill();
  }
  // 고양이/강아지 컨셉별로 묶어서, 한 번 뿌릴 때 한 종류만(서로 섞이지 않게) 등장하도록 함.
  // 색도 각 동물다운 팔레트(고양이: 회색·주황 계열 / 강아지: 갈색·베이지 계열)에서만 골라
  // 알록달록하지 않고 실제 털색처럼 자연스럽게 보이게 함
  const ANIMAL_CONCEPTS = [
    { shapes: [drawCatFaceShape, drawPawPrintShape, drawPetHeartShape] },  // 고양이
    { shapes: [drawDogFaceShape, drawPawPrintShape, drawBoneShape] }       // 강아지
  ];
  const ANIMAL_PALETTES = [
    ['#4a4a4a', '#8a6d4b', '#e8a33d', '#2b2b2b', '#f2c9a0'],  // 고양이(회색/주황/검정 계열)
    ['#8a5a2b', '#c98a3e', '#e0b47a', '#5c3a1e', '#f2d9b0']   // 강아지(갈색/베이지 계열)
  ];

  // 귀여운 동물 효과: 글자 위/주변에 고양이 또는 강아지(seed로 골라서 하나만) 컨셉의 얼굴·
  // 발자국·소품(고양이는 하트, 강아지는 뼈다귀)을 그 동물다운 색상으로 넓게 흩뿌려서 마치
  // 강아지나 고양이가 뛰어놀다 남긴 자국처럼 보이게 함. 배치/컨셉/색상은 모두 seed로 고정
  // — "다시 뿌리기"를 눌러야 새로 바뀜(고양이↔강아지도 이때 다시 뽑힘)
  function drawAnimalPass(ctx){
    const cfg = this.animalText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const conceptIdx = Math.floor(pseudoRandom(seed + 8888) * ANIMAL_CONCEPTS.length) % ANIMAL_CONCEPTS.length;
    const concept = ANIMAL_CONCEPTS[conceptIdx];
    const palette = ANIMAL_PALETTES[conceptIdx];

    const count = Math.max(4, Math.round(5 + amt * 16));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.9 + 1) - 0.5) * w * 2.0;
      const ry = (pseudoRandom(seed + i * 7.3 + 51) - 0.5) * h * 2.6;
      const size = fontSize * (0.2 + pseudoRandom(seed + i * 13.1 + 101) * 0.34);
      const rot = (pseudoRandom(seed + i * 17.7 + 201) - 0.5) * 0.5; // 살짝만 기울여서 얼굴/모양이 알아볼 수 있게 유지
      const shapeFn = concept.shapes[Math.floor(pseudoRandom(seed + i * 23.9 + 301) * concept.shapes.length) % concept.shapes.length];
      const color = palette[Math.floor(pseudoRandom(seed + i * 29.3 + 401) * palette.length) % palette.length];

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.6 + pseudoRandom(seed + i * 3 + 701) * 0.35);
      ctx.fillStyle = color;
      shapeFn(ctx, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- 해산물 장식 모양들 (중심 0,0 기준, size는 대략적인 크기) ----
  function drawOctopusShape(ctx, size){
    // 둥근 머리(외투막)
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.15, size * 0.42, size * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    // 다리 6가닥 — 물결치듯 곡선으로 아래로 늘어뜨림
    const legCount = 6;
    for (let i = 0; i < legCount; i++) {
      const t = legCount > 1 ? i / (legCount - 1) : 0.5;
      const baseX = (t - 0.5) * size * 0.72;
      const dir = baseX >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(baseX, size * 0.1);
      ctx.quadraticCurveTo(baseX + dir * size * 0.24, size * 0.42, baseX + dir * size * 0.1, size * 0.64);
      ctx.quadraticCurveTo(baseX + dir * size * 0.02, size * 0.74, baseX - dir * size * 0.08, size * 0.66);
      ctx.closePath();
      ctx.fill();
    }
    // 눈 2개
    ctx.save();
    ctx.fillStyle = '#ffffff';
    [[-0.15, -0.2], [0.15, -0.2]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(size * ex, size * ey, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  function drawSquidShape(ctx, size){
    // 몸통(어뢰형)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.quadraticCurveTo(size * 0.32, -size * 0.25, size * 0.28, size * 0.15);
    ctx.quadraticCurveTo(size * 0.18, size * 0.35, 0, size * 0.42);
    ctx.quadraticCurveTo(-size * 0.18, size * 0.35, -size * 0.28, size * 0.15);
    ctx.quadraticCurveTo(-size * 0.32, -size * 0.25, 0, -size * 0.55);
    ctx.closePath();
    ctx.fill();
    // 지느러미(양옆 삼각)
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s * size * 0.05, -size * 0.4);
      ctx.lineTo(s * size * 0.38, -size * 0.5);
      ctx.lineTo(s * size * 0.1, -size * 0.12);
      ctx.closePath();
      ctx.fill();
    });
    // 짧은 다리 여러 가닥(몸통 아래에서 뻗어나옴)
    const legCount = 5;
    for (let i = 0; i < legCount; i++) {
      const t = legCount > 1 ? i / (legCount - 1) : 0.5;
      const baseX = (t - 0.5) * size * 0.4;
      ctx.beginPath();
      ctx.moveTo(baseX, size * 0.4);
      ctx.quadraticCurveTo(baseX * 1.4, size * 0.62, baseX * 1.1, size * 0.78);
      ctx.lineTo(baseX * 0.7, size * 0.74);
      ctx.quadraticCurveTo(baseX * 1.0, size * 0.58, baseX * 0.6, size * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  }
  function drawMackerelShape(ctx, size){
    // 몸통(길쭉한 유선형)
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, 0);
    ctx.quadraticCurveTo(-size * 0.2, -size * 0.28, size * 0.25, -size * 0.16);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.06, size * 0.55, 0);
    ctx.quadraticCurveTo(size * 0.5, size * 0.06, size * 0.25, size * 0.16);
    ctx.quadraticCurveTo(-size * 0.2, size * 0.28, -size * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    // 꼬리지느러미(갈라진 삼각)
    ctx.beginPath();
    ctx.moveTo(-size * 0.48, 0);
    ctx.lineTo(-size * 0.72, -size * 0.2);
    ctx.lineTo(-size * 0.58, 0);
    ctx.lineTo(-size * 0.72, size * 0.2);
    ctx.closePath();
    ctx.fill();
    // 등 무늬(고등어 특유의 물결 줄무늬)
    ctx.save();
    ctx.strokeStyle = 'rgba(20,40,60,0.55)';
    ctx.lineWidth = Math.max(0.5, size * 0.035);
    for (let i = 0; i < 4; i++) {
      const sx = -size * 0.28 + i * size * 0.18;
      ctx.beginPath();
      ctx.moveTo(sx, -size * 0.2);
      ctx.quadraticCurveTo(sx + size * 0.06, -size * 0.05, sx - size * 0.03, size * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawTunaShape(ctx, size){
    // 몸통(참치다운 통통한 유선형)
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, 0);
    ctx.quadraticCurveTo(-size * 0.25, -size * 0.32, size * 0.3, -size * 0.14);
    ctx.quadraticCurveTo(size * 0.58, -size * 0.04, size * 0.62, 0);
    ctx.quadraticCurveTo(size * 0.58, size * 0.04, size * 0.3, size * 0.14);
    ctx.quadraticCurveTo(-size * 0.25, size * 0.32, -size * 0.55, 0);
    ctx.closePath();
    ctx.fill();
    // 등지느러미
    ctx.beginPath();
    ctx.moveTo(-size * 0.02, -size * 0.24);
    ctx.lineTo(size * 0.1, -size * 0.5);
    ctx.lineTo(size * 0.2, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    // 꼬리지느러미(초승달형 갈라짐)
    ctx.beginPath();
    ctx.moveTo(-size * 0.52, 0);
    ctx.lineTo(-size * 0.8, -size * 0.26);
    ctx.lineTo(-size * 0.62, 0);
    ctx.lineTo(-size * 0.8, size * 0.26);
    ctx.closePath();
    ctx.fill();
    // 눈
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size * 0.35, -size * 0.02, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawWaveShape(ctx, size){
    // 물결치는 파도 실루엣
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, size * 0.15);
    ctx.quadraticCurveTo(-size * 0.4, -size * 0.25, -size * 0.15, size * 0.02);
    ctx.quadraticCurveTo(size * 0.05, -size * 0.35, size * 0.3, 0);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.2, size * 0.6, size * 0.05);
    ctx.lineTo(size * 0.6, size * 0.4);
    ctx.lineTo(-size * 0.6, size * 0.4);
    ctx.closePath();
    ctx.fill();
    // 물보라(포말) 점들
    ctx.save();
    ctx.fillStyle = '#ffffff';
    [[-0.15, 0.02], [0.05, -0.32], [0.3, 0.0], [-0.35, -0.15]].forEach(([wx, wy]) => {
      ctx.beginPath();
      ctx.arc(size * wx, size * wy, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  // 해산물 종류별로 어울리는 색상 팔레트를 따로 두고, 뿌릴 때마다 종류와 색을 각각 무작위로
  // 골라 서로 섞여서 등장하게 함(동물 효과와 달리 한 종류로 고정하지 않음)
  const SEAFOOD_ITEMS = [
    { shape: drawOctopusShape, colors: ['#c9576b', '#d97690', '#a83f56'] },
    { shape: drawSquidShape, colors: ['#e8b8c8', '#f4d8e0', '#d99bb0'] },
    { shape: drawMackerelShape, colors: ['#3f6d8e', '#4a89a8', '#2f5670'] },
    { shape: drawTunaShape, colors: ['#2b4a63', '#3a5f7a', '#6b8ba3'] },
    { shape: drawWaveShape, colors: ['#3a7ca5', '#5a9bc4', '#8fc1e3'] }
  ];

  // 해산물 효과: 문어·오징어·고등어·참치·파도를 글자 위/주변에 종류·크기·색상·회전 전부 무작위로
  // 흩뿌림. 크기 편차를 크게 줘서(작은 것~큰 것) 요청대로 "랜덤 크기"가 뚜렷하게 드러나게 함.
  // 배치는 seed로 고정 — "다시 뿌리기"를 눌러야 새로 바뀜
  function drawSeafoodPass(ctx){
    const cfg = this.seafoodText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const count = Math.max(4, Math.round(5 + amt * 18));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.9 + 1) - 0.5) * w * 2.1;
      const ry = (pseudoRandom(seed + i * 7.3 + 51) - 0.5) * h * 2.8;
      const size = fontSize * (0.16 + pseudoRandom(seed + i * 13.1 + 101) * 0.6);
      const rot = (pseudoRandom(seed + i * 17.7 + 201) - 0.5) * 0.9;
      const item = SEAFOOD_ITEMS[Math.floor(pseudoRandom(seed + i * 23.9 + 301) * SEAFOOD_ITEMS.length) % SEAFOOD_ITEMS.length];
      const color = item.colors[Math.floor(pseudoRandom(seed + i * 29.3 + 401) * item.colors.length) % item.colors.length];

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.6 + pseudoRandom(seed + i * 3 + 701) * 0.35);
      ctx.fillStyle = color;
      item.shape(ctx, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // 색상 하나를 기준으로 밝기만 살짝(amt만큼) 더 밝게(+) 또는 어둡게(-) 조정함.
  // 과일/채소는 실제 사물 고유의 색(빨강 사과, 노랑 바나나 등)은 그대로 유지하면서
  // 개체마다 명암만 살짝 다르게 주기 위해 사용함
  function shadeHexColor(hex, amt){
    const rgb = EP.hexToRgb(hex);
    const adj = (c) => {
      const v = amt >= 0 ? c + (255 - c) * amt : c + c * amt;
      return Math.max(0, Math.min(255, Math.round(v)));
    };
    return EP.rgbToHex(adj(rgb.r), adj(rgb.g), adj(rgb.b));
  }

  // ---- 과일 모양들 (중심 0,0 기준, size는 대략적인 크기, shade는 -1~1 명암 보정값) ----
  function drawAppleFruitShape(ctx, size, shade){
    const r = size * 0.42;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.06, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fillStyle = shadeHexColor('#d6362b', shade);
    ctx.fill();
    ctx.strokeStyle = shadeHexColor('#7a4321', shade);
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.85 + size * 0.06);
    ctx.lineTo(size * 0.06, -r * 1.2 + size * 0.06);
    ctx.stroke();
    ctx.fillStyle = shadeHexColor('#4f9e4f', shade);
    ctx.beginPath();
    ctx.ellipse(size * 0.15, -r * 1.05 + size * 0.06, size * 0.14, size * 0.08, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawBananaFruitShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#f4cc4e', shade);
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, size * 0.26);
    ctx.quadraticCurveTo(-size * 0.16, -size * 0.46, size * 0.4, -size * 0.36);
    ctx.quadraticCurveTo(size * 0.14, -size * 0.04, -size * 0.1, size * 0.4);
    ctx.quadraticCurveTo(-size * 0.28, size * 0.4, -size * 0.4, size * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeHexColor('#8a6a2c', shade);
    ctx.beginPath();
    ctx.arc(size * 0.4, -size * 0.36, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawStrawberryFruitShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#e73a52', shade);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.26);
    ctx.quadraticCurveTo(size * 0.38, -size * 0.14, size * 0.3, size * 0.16);
    ctx.quadraticCurveTo(size * 0.18, size * 0.42, 0, size * 0.44);
    ctx.quadraticCurveTo(-size * 0.18, size * 0.42, -size * 0.3, size * 0.16);
    ctx.quadraticCurveTo(-size * 0.38, -size * 0.14, 0, -size * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeHexColor('#f6dd82', shade);
    [[-0.12, -0.02], [0.1, 0.06], [-0.05, 0.2], [0.16, 0.2], [0, -0.14], [-0.18, 0.14]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.ellipse(size * sx, size * sy, size * 0.025, size * 0.045, 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = shadeHexColor('#4f9e4f', shade);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.26);
      ctx.lineTo(Math.cos(a) * size * 0.18, -size * 0.26 + Math.sin(a) * size * 0.18 - size * 0.06);
      ctx.lineTo(Math.cos(a + 0.5) * size * 0.08, -size * 0.26 - size * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  }
  function drawGrapeFruitShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#7c4fa3', shade);
    [[0, -0.24], [-0.22, -0.05], [0.22, -0.05], [-0.34, 0.2], [0, 0.16], [0.34, 0.2], [-0.17, 0.42], [0.17, 0.42]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px * size, py * size, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = shadeHexColor('#4f9e4f', shade);
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.4);
    ctx.lineTo(0, -size * 0.24);
    ctx.stroke();
  }
  function drawOrangeFruitShape(ctx, size, shade){
    const r = size * 0.42;
    ctx.fillStyle = shadeHexColor('#f3952e', shade);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shadeHexColor('#c96f13', shade);
    ctx.lineWidth = Math.max(1, size * 0.02);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.fillStyle = shadeHexColor('#4f9e4f', shade);
    ctx.beginPath();
    ctx.ellipse(size * 0.05, -r * 0.95, size * 0.12, size * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const FRUIT_SHAPES = [drawAppleFruitShape, drawBananaFruitShape, drawStrawberryFruitShape, drawGrapeFruitShape, drawOrangeFruitShape];

  // ---- 채소 모양들 (중심 0,0 기준, size는 대략적인 크기, shade는 -1~1 명암 보정값) ----
  function drawCarrotVegShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#f0793c', shade);
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, -size * 0.3);
    ctx.lineTo(size * 0.18, -size * 0.3);
    ctx.lineTo(0, size * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shadeHexColor('#4f9e4f', shade);
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.lineCap = 'round';
    [-1, 0, 1].forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s * size * 0.08, -size * 0.3);
      ctx.lineTo(s * size * 0.15, -size * 0.5 - Math.abs(s) * size * 0.05);
      ctx.stroke();
    });
  }
  function drawBroccoliVegShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#4f9e4f', shade);
    [[-0.2, -0.28], [0.2, -0.28], [0, -0.4], [-0.35, -0.1], [0.35, -0.1], [0, -0.14]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px * size, py * size, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = shadeHexColor('#cfe3ac', shade);
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, 0);
    ctx.lineTo(size * 0.12, 0);
    ctx.lineTo(size * 0.08, size * 0.42);
    ctx.lineTo(-size * 0.08, size * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  function drawTomatoVegShape(ctx, size, shade){
    const r = size * 0.4;
    ctx.fillStyle = shadeHexColor('#e23a2c', shade);
    ctx.beginPath();
    ctx.arc(0, size * 0.05, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeHexColor('#4f9e4f', shade);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(0, size * 0.05 - r * 0.9);
      ctx.lineTo(Math.cos(a) * size * 0.14, size * 0.05 - r * 0.9 + Math.sin(a) * size * 0.14 - size * 0.04);
      ctx.lineTo(Math.cos(a + 0.5) * size * 0.06, size * 0.05 - r * 0.9 - size * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  }
  function drawCornVegShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#f4cc4e', shade);
    ctx.beginPath();
    ctx.ellipse(0, size * 0.02, size * 0.22, size * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shadeHexColor('#c9a13e', shade);
    ctx.lineWidth = Math.max(1, size * 0.02);
    for (let ky = -0.34; ky <= 0.34; ky += 0.14) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.2, size * 0.02 + ky * size);
      ctx.quadraticCurveTo(0, size * 0.02 + ky * size + size * 0.03, size * 0.2, size * 0.02 + ky * size);
      ctx.stroke();
    }
    ctx.fillStyle = shadeHexColor('#5fae5f', shade);
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, size * 0.02 - size * 0.46);
    ctx.quadraticCurveTo(-size * 0.32, size * 0.02 - size * 0.6, -size * 0.12, size * 0.02 - size * 0.76);
    ctx.quadraticCurveTo(0, size * 0.02 - size * 0.55, -size * 0.05, size * 0.02 - size * 0.46);
    ctx.fill();
  }
  function drawEggplantVegShape(ctx, size, shade){
    ctx.fillStyle = shadeHexColor('#5c3b7d', shade);
    ctx.beginPath();
    ctx.ellipse(0, size * 0.08, size * 0.24, size * 0.4, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeHexColor('#4f9e4f', shade);
    ctx.beginPath();
    ctx.ellipse(-size * 0.12, -size * 0.32, size * 0.14, size * 0.09, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shadeHexColor('#4f9e4f', shade);
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, -size * 0.32);
    ctx.lineTo(-size * 0.05, -size * 0.5);
    ctx.stroke();
  }
  const VEGETABLE_SHAPES = [drawCarrotVegShape, drawBroccoliVegShape, drawTomatoVegShape, drawCornVegShape, drawEggplantVegShape];

  const FRUIT_VEG_CONCEPTS = [
    { shapes: FRUIT_SHAPES },      // 과일만
    { shapes: VEGETABLE_SHAPES }   // 채소만
  ];

  // 과일/채소 효과: 글자 위/주변에 seed로 "과일" 또는 "채소" 중 한 컨셉만 골라서(서로 섞이지
  // 않게) 인기 품목(과일: 사과·바나나·딸기·포도·오렌지 / 채소: 당근·브로콜리·토마토·옥수수·가지)을
  // 실물 그대로의 색으로 흩뿌림. 색상 자체(색조)는 품목 고유값을 유지하되, 개체마다 명암만
  // 살짝(±약 12%) 다르게 줘서 자연스럽게 섞여 보이게 하고, 크기와 위치는 넓게 랜덤 배치함.
  // 컨셉/배치/크기/명암은 모두 seed로 고정 — "다시 뿌리기"를 눌러야 새로 바뀜(과일↔채소도 이때 다시 뽑힘)
  function drawFruitVegPass(ctx){
    const cfg = this.fruitVegText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const conceptIdx = Math.floor(pseudoRandom(seed + 6543) * FRUIT_VEG_CONCEPTS.length) % FRUIT_VEG_CONCEPTS.length;
    const concept = FRUIT_VEG_CONCEPTS[conceptIdx];

    const count = Math.max(4, Math.round(5 + amt * 16));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.9 + 1) - 0.5) * w * 2.0;
      const ry = (pseudoRandom(seed + i * 7.3 + 51) - 0.5) * h * 2.6;
      const size = fontSize * (0.24 + pseudoRandom(seed + i * 13.1 + 101) * 0.36);
      const rot = (pseudoRandom(seed + i * 17.7 + 201) - 0.5) * 0.5;
      const shapeFn = concept.shapes[Math.floor(pseudoRandom(seed + i * 23.9 + 301) * concept.shapes.length) % concept.shapes.length];
      const shade = (pseudoRandom(seed + i * 31.3 + 401) - 0.5) * 0.24; // 실제 색은 유지, 명암만 ±12% 정도로 살짝

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.65 + pseudoRandom(seed + i * 3 + 701) * 0.35);
      shapeFn(ctx, size, shade);
      ctx.restore();
    }
    ctx.restore();
  }

  // 하트 효과: 글자 옆/주변에 랜덤한 크기(아주 작은 것부터 큰 것까지 편차 크게)의 하트를 붉은
  // 색부터 핑크색까지(색상값 320~10도 범위, 즉 자홍/핫핑크~빨강 쪽만) 넓게 흩뿌림. 채도/명도도
  // 함께 랜덤이라 어떤 건 진한 빨강, 어떤 건 옅은 파스텔 핑크로 자연스럽게 섞여 보임. 배치/
  // 크기/색상은 모두 seed로 고정 — "다시 흩뿌리기"를 눌러야 새로 바뀜
  function drawHeartsPass(ctx){
    const cfg = this.heartText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const count = Math.max(4, Math.round(5 + amt * 18));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.7 + 1) - 0.5) * w * 2.2;
      const ry = (pseudoRandom(seed + i * 7.9 + 51) - 0.5) * h * 2.8;
      const size = fontSize * (0.14 + pseudoRandom(seed + i * 13.3 + 101) * 0.42); // 크기 편차를 크게 줘서 작은/큰 하트가 섞이게 함
      const rot = (pseudoRandom(seed + i * 17.1 + 201) - 0.5) * 0.7;

      // 붉은~핑크 계열만: 색상값 320~360(자홍/핫핑크) + 0~10(빨강)을 이어붙인 범위에서만 고름
      const hue = (320 + pseudoRandom(seed + i * 29.3 + 301) * 50) % 360;
      const sat = 0.4 + pseudoRandom(seed + i * 31.7 + 401) * 0.55;
      const val = 0.55 + pseudoRandom(seed + i * 23.1 + 501) * 0.4;
      const rgb = EP.hsvToRgb(hue, sat, val);

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.6 + pseudoRandom(seed + i * 3 + 701) * 0.35);
      ctx.fillStyle = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      drawPetHeartShape(ctx, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // 커피 원두 모양(중심 0,0 기준): 길쭉한 타원 몸통 + 가운데 살짝 S자로 휜 홈(크림선)
  function drawCoffeeBeanShape(ctx, size){
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.27, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 가운데 홈 — 원두 특유의 갈라진 선을 반투명한 어두운 선으로 표현(콩 색이 밝든 어둡든 잘 보이게)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = Math.max(0.8, size * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.46);
    ctx.quadraticCurveTo(size * 0.1, -size * 0.15, 0, 0);
    ctx.quadraticCurveTo(-size * 0.1, size * 0.15, 0, size * 0.46);
    ctx.stroke();
    ctx.restore();
  }
  // 로스팅 정도가 제각각인 커피색 팔레트(연한 라이트로스트 ~ 진한 다크로스트)
  const COFFEE_PALETTE = ['#a97147', '#8b5a2b', '#6f4e37', '#5c3a21', '#4b2e1e', '#3b2412'];

  // 커피 원두 효과: 글자 옆/주변에 랜덤한 크기(작은 것부터 큰 것까지 편차 크게)의 커피 원두를
  // 커피색 팔레트(라이트로스트~다크로스트) 안에서 랜덤으로 색을 입혀 넓게 흩뿌림. 원두는 방향이
  // 뚜렷하지 않아 360도 자유롭게 회전시켜 자연스럽게 흩어진 느낌을 냄. 배치/크기/색상은 모두
  // seed로 고정 — "다시 흩뿌리기"를 눌러야 새로 바뀜
  function drawCoffeeBeansPass(ctx){
    const cfg = this.coffeeText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const count = Math.max(4, Math.round(5 + amt * 18));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.3 + 1) - 0.5) * w * 2.2;
      const ry = (pseudoRandom(seed + i * 7.7 + 51) - 0.5) * h * 2.8;
      const size = fontSize * (0.14 + pseudoRandom(seed + i * 13.9 + 101) * 0.44); // 크기 편차를 크게 줘서 작은/큰 원두가 섞이게 함
      const rot = pseudoRandom(seed + i * 17.3 + 201) * Math.PI * 2; // 원두는 방향이 뚜렷하지 않아 자유롭게 회전
      const color = COFFEE_PALETTE[Math.floor(pseudoRandom(seed + i * 23.7 + 301) * COFFEE_PALETTE.length) % COFFEE_PALETTE.length];

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.65 + pseudoRandom(seed + i * 3 + 701) * 0.3);
      ctx.fillStyle = color;
      drawCoffeeBeanShape(ctx, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- 스포츠공 장식 모양들 (중심 0,0 기준, size는 지름 기준 대략적인 크기) ----
  function drawRegularPolygonPath(ctx, radius, sides, rotation){
    ctx.beginPath();
    for (let k = 0; k < sides; k++) {
      const a = rotation + k * (Math.PI * 2 / sides);
      const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function drawSoccerBallShape(ctx, size){
    const r = size * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f7f7f2';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.strokeStyle = '#22221f';
    ctx.stroke();
    ctx.fillStyle = '#22221f';
    drawRegularPolygonPath(ctx, r * 0.32, 5, -Math.PI / 2);
    ctx.fill();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
      ctx.rotate(a + Math.PI / 2);
      drawRegularPolygonPath(ctx, r * 0.2, 5, Math.PI / 2);
      ctx.fill();
      ctx.restore();
    }
  }
  function drawBasketballShape(ctx, size){
    const r = size * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e8792c';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = '#3a2010';
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.62, 0, 0, r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(-r * 0.62, 0, 0, r); ctx.stroke();
  }
  function drawBaseballShape(ctx, size){
    const r = size * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf6ec';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = '#c9beA8';
    ctx.stroke();
    ctx.strokeStyle = '#c94b4b';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.setLineDash([Math.max(1, size * 0.05), Math.max(1, size * 0.04)]);
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.15);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.78, r * 0.55, -r * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.5);
    ctx.quadraticCurveTo(r * 0.1, r * 0.78, r * 0.7, r * 0.15);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawTennisBallShape(ctx, size){
    const r = size * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#d4f24a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.strokeStyle = '#f5fbe0';
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, -r * 0.98);
    ctx.quadraticCurveTo(r * 0.58, -r * 0.35, 0, 0);
    ctx.quadraticCurveTo(-r * 0.58, r * 0.35, r * 0.12, r * 0.98);
    ctx.stroke();
  }
  function drawVolleyballShape(ctx, size){
    const r = size * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f5f5';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.strokeStyle = '#2255aa';
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.1);
    ctx.quadraticCurveTo(0, r * 0.55, r * 0.75, -r * 0.55);
    ctx.stroke();
    ctx.strokeStyle = '#e8a33d';
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, r * 0.55);
    ctx.quadraticCurveTo(0, -r * 0.15, r * 0.5, -r * 0.85);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const SPORTS_BALL_SHAPES = [drawSoccerBallShape, drawBasketballShape, drawBaseballShape, drawTennisBallShape, drawVolleyballShape];

  // 스포츠공 효과: 글자 위/주변에 축구공·농구공·야구공·테니스공·배구공을 실제 공처럼 보이는
  // 고유 색상/무늬로 그려서 여러 크기·위치·회전으로 넓게 흩뿌림(공 종류는 섞여서 등장).
  // 배치/크기/회전/공 종류는 모두 seed로 고정 — "다시 뿌리기"를 눌러야 새로 바뀜
  function drawSportsPass(ctx){
    const cfg = this.sportsText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const count = Math.max(4, Math.round(5 + amt * 16));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = (pseudoRandom(seed + i * 11.3 + 1) - 0.5) * w * 2.2;
      const ry = (pseudoRandom(seed + i * 7.7 + 51) - 0.5) * h * 2.8;
      const size = fontSize * (0.24 + pseudoRandom(seed + i * 13.9 + 101) * 0.38);
      const rot = pseudoRandom(seed + i * 17.3 + 201) * Math.PI * 2;
      const shapeFn = SPORTS_BALL_SHAPES[Math.floor(pseudoRandom(seed + i * 23.7 + 301) * SPORTS_BALL_SHAPES.length) % SPORTS_BALL_SHAPES.length];

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.65 + pseudoRandom(seed + i * 3 + 701) * 0.3);
      shapeFn(ctx, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // 클럽 사람 실루엣(중심 0,0, 발밑 기준): 머리(원) + 몸통(둥근 사다리꼴) + 팔.
  // armsUp이면 신나게 양팔을 번쩍 든 포즈, 아니면 자연스럽게 내린 포즈
  function drawClubPersonShape(ctx, size, armsUp){
    // 머리
    ctx.beginPath();
    ctx.arc(0, -size * 0.38, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    // 몸통
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, -size * 0.22);
    ctx.lineTo(size * 0.16, -size * 0.22);
    ctx.lineTo(size * 0.22, size * 0.32);
    ctx.lineTo(-size * 0.22, size * 0.32);
    ctx.closePath();
    ctx.fill();
    // 팔
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ctx.fillStyle;
    if (armsUp) {
      [-1, 1].forEach(s => {
        ctx.beginPath();
        ctx.moveTo(s * size * 0.14, -size * 0.20);
        ctx.lineTo(s * size * 0.30, -size * 0.50);
        ctx.stroke();
      });
    } else {
      [-1, 1].forEach(s => {
        ctx.beginPath();
        ctx.moveTo(s * size * 0.16, -size * 0.18);
        ctx.lineTo(s * size * 0.26, size * 0.10);
        ctx.stroke();
      });
    }
  }
  // 클럽 조명/실루엣용 네온 컬러 팔레트
  const CLUB_COLORS = ['#ff2e63', '#a52eff', '#2ee6ff', '#ff6ec7', '#7b2ff7', '#ffea00'];

  // 클럽 분위기 효과: 글자 옆(좌/우 중 seed로 골라진 한쪽)에 사람들이 와르르 몰려있는 무리를
  // 그림. 인원 수는 강도와 무관하게 seed로 완전히 랜덤(대략 6~40명)하게 정해지고, 각 사람은
  // 중심에 몰리도록(가장자리보다 중심 쪽에 확률이 높게) 배치해서 빽빽하게 뭉친 느낌을 냄.
  // 일부는 양팔을 번쩍 든 신난 포즈로 섞여 나오고, 네온 색상 + 은은한 발광으로 클럽 조명 아래
  // 있는 듯한 느낌을 주며, 그 뒤로 위에서 무리 쪽을 향해 쏟아지는 스포트라이트 빛줄기도 함께
  // 그림. 배치/인원수/포즈/색상은 모두 seed로 고정 — "다시 모으기"를 눌러야 새로 바뀜
  function drawClubPass(ctx){
    const cfg = this.clubText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    // 사람 수는 강도와 무관하게 seed로 완전 랜덤(강도는 대략적인 범위에만 영향)
    const count = 6 + Math.floor(pseudoRandom(seed + 9999) * (10 + amt * 24));
    const baseSize = fontSize * (0.4 + amt * 0.25);

    // 무리 중심 — 글자 좌/우 중 한쪽에 뭉쳐있는 느낌
    const clusterSide = pseudoRandom(seed + 111) < 0.5 ? -1 : 1;
    const clusterCx = clusterSide * (w / 2 + fontSize * 0.9);
    const clusterCy = (pseudoRandom(seed + 222) - 0.5) * h * 0.6;
    const maxRadius = fontSize * (1.1 + amt * 1.3);

    // 스포트라이트 빛줄기 — 무리 위쪽에서 쏟아지는 은은한 조명(먼저 그려서 사람들 뒤에 깔림)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const topX = clusterCx + (pseudoRandom(seed + b * 19.3 + 401) - 0.5) * maxRadius * 1.4;
      const topY = clusterCy - maxRadius * 1.6;
      const spread = maxRadius * (0.3 + pseudoRandom(seed + b * 7.1 + 451) * 0.25);
      const beamColor = CLUB_COLORS[Math.floor(pseudoRandom(seed + b * 13.3 + 501) * CLUB_COLORS.length) % CLUB_COLORS.length];
      ctx.globalAlpha = op * 0.18;
      ctx.fillStyle = beamColor;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(clusterCx - spread, clusterCy);
      ctx.lineTo(clusterCx + spread, clusterCy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 사람들 — 중심에 몰리도록 반지름을 지수적으로 눌러서(pow 0.65) 빽빽하게 뭉친 느낌을 냄
    ctx.save();
    for (let i = 0; i < count; i++) {
      const ang = pseudoRandom(seed + i * 13.1 + 1) * Math.PI * 2;
      const rad = maxRadius * Math.pow(pseudoRandom(seed + i * 9.7 + 51), 0.65);
      const px = clusterCx + Math.cos(ang) * rad;
      const py = clusterCy + Math.sin(ang) * rad * 0.7; // 세로는 살짝 눌러서 바닥에 선 무리처럼 보이게 함
      const size = baseSize * (0.65 + pseudoRandom(seed + i * 11.3 + 101) * 0.55);
      const armsUp = pseudoRandom(seed + i * 17.9 + 151) < 0.35;
      const color = CLUB_COLORS[Math.floor(pseudoRandom(seed + i * 23.3 + 201) * CLUB_COLORS.length) % CLUB_COLORS.length];

      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = op * (0.7 + pseudoRandom(seed + i * 3 + 701) * 0.3);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 0.5;
      drawClubPersonShape(ctx, size, armsUp);
      ctx.restore();
    }
    ctx.restore();
  }
  // 눈 내리는 효과: 글자 바닥에는 둥글둥글하게(양 옆이 각지지 않게) 눈이 쌓이고, 그 주변으로
  // 눈송이가 넓게 흩날리는 모습을 그림. 흩날리는 눈 중 일부는 장난스럽게 별 모양으로 깜짝
  // 섞여 나옴. 텍스트보다 나중에(위에) 그려져서 쌓인 눈이 글자 아랫부분을 자연스럽게 덮음.
  // 배치는 seed로 고정 — "다시 내리기"로 재배치
  function drawSnowPass(ctx){
    const cfg = this.snowText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const showPile = cfg.showPile !== false;

    const bottomY = h / 2;

    if (showPile) {
      ctx.save();
      ctx.globalAlpha = op;
      ctx.fillStyle = '#ffffff';

      // 바닥에 쌓인 눈 — 양 끝은 낮게(사인 곡선으로 테이퍼) + 점들을 곡선으로 이어서
      // 각지지 않고 둥글둥글한 언덕 실루엣을 만듦
      const bumpCount = Math.max(8, Math.round(10 + amt * 14));
      const pileHeight = fontSize * (0.12 + amt * 0.24);
      const padX = fontSize * 0.3;
      const leftX = -w / 2 - padX, rightX = w / 2 + padX;

      const pts = [];
      for (let i = 0; i <= bumpCount; i++) {
        const t = i / bumpCount;
        const x = leftX + t * (rightX - leftX);
        const edgeTaper = Math.sin(t * Math.PI); // 양 끝에서 0 → 가운데서 1, 옆면을 둥글게 낮춰줌
        const bump = pileHeight * (0.3 + pseudoRandom(seed + i * 13.7 + 1) * 0.9) * (0.15 + edgeTaper * 0.85);
        pts.push([x, bottomY - bump]);
      }

      ctx.beginPath();
      ctx.moveTo(leftX, bottomY);
      ctx.lineTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const cur = pts[i], next = pts[i + 1];
        const midX = (cur[0] + next[0]) / 2, midY = (cur[1] + next[1]) / 2;
        ctx.quadraticCurveTo(cur[0], cur[1], midX, midY);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.lineTo(rightX, bottomY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 흩날리는 눈송이 — 위치/크기/투명도가 제각각이고, 글자 주변에 넓게 퍼져 있음.
    // 그중 일부(약 10%)는 동그란 눈이 아니라 별 모양으로 장난스럽게 깜짝 등장함
    const flakeCount = Math.max(20, Math.round(28 + amt * 70));
    ctx.save();
    for (let i = 0; i < flakeCount; i++) {
      const fx = (pseudoRandom(seed + i * 7.9 + 301) - 0.5) * w * 2.6;
      const fy = (pseudoRandom(seed + i * 5.3 + 401) - 0.5) * h * 3.2;
      const fr = fontSize * (0.02 + pseudoRandom(seed + i * 9.7 + 501) * 0.06);
      const falpha = 0.4 + pseudoRandom(seed + i * 3.1 + 601) * 0.6;
      ctx.globalAlpha = op * falpha;
      ctx.fillStyle = '#ffffff';
      const isStar = pseudoRandom(seed + i * 41.3 + 9001) < 0.1;
      if (isStar) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(pseudoRandom(seed + i * 19.7 + 9101) * Math.PI * 2);
        drawStarShape(ctx, fr * 4.2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 비 내리는 효과: 글자 아래쪽을 고요한 호수라고 생각하고 동심원 잔물결(파장)을 몇 군데 그린 뒤,
  // 그 위로 살짝 기울어진 빗줄기들을 넓게 흩뿌림. 텍스트보다 나중에(위에) 그려짐.
  // 물결/빗줄기 배치는 seed로 고정 — "다시 내리기"로 재배치
  function drawRainPass(ctx){
    const cfg = this.rainText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const rainColor = cfg.rainColor || '#bcdfff';

    const bottomY = h / 2;
    const waterY = bottomY + fontSize * 0.35;

    // 1) 호수 잔물결 — 텍스트 하단에 동심원 파장을 여러 군데 그림
    const rippleGroups = Math.max(2, Math.round(2 + amt * 4));
    ctx.save();
    ctx.strokeStyle = rainColor;
    ctx.lineWidth = Math.max(0.6, fontSize * 0.015);
    for (let g = 0; g < rippleGroups; g++) {
      const cx = (pseudoRandom(seed + g * 17.3 + 1) - 0.5) * w * 0.9;
      const cy = waterY + pseudoRandom(seed + g * 11.1 + 51) * fontSize * 0.6;
      const ringCount = 2 + Math.floor(pseudoRandom(seed + g * 7.7 + 101) * 3);
      const maxR = fontSize * (0.35 + pseudoRandom(seed + g * 13.3 + 151) * 0.55);
      for (let r = 1; r <= ringCount; r++) {
        const rad = maxR * (r / ringCount);
        ctx.globalAlpha = op * (1 - r / (ringCount + 1)) * 0.65;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rad, rad * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2) 내리는 빗줄기 — 살짝 기울어진 얇은 선들을 넓게 흩뿌림.
    // 색은 대부분 제각각 랜덤하고, 가끔(약 30%) 물결과 같은 색으로 통일해서 통일감도 살짝 줌.
    // 길이는 편차를 크게 줘서 아주 짧은 것과 아주 긴 것이 섞이게 함
    const rainCount = Math.max(20, Math.round(24 + amt * 60));
    const rainAngle = 12 * Math.PI / 180;
    ctx.save();
    for (let i = 0; i < rainCount; i++) {
      const rx = (pseudoRandom(seed + i * 7.9 + 301) - 0.5) * w * 2.4;
      const ry = (pseudoRandom(seed + i * 5.3 + 401) - 0.5) * h * 2.6;
      const lenT = pseudoRandom(seed + i * 9.7 + 501);
      const len = fontSize * (0.15 + Math.pow(lenT, 2) * 1.45); // 제곱으로 편차를 키워 짧은/긴 빗줄기 차이를 크게 냄
      const thick = Math.max(0.6, fontSize * (0.008 + pseudoRandom(seed + i * 3.1 + 601) * 0.02));
      const alpha = 0.25 + pseudoRandom(seed + i * 11.3 + 701) * 0.45;
      const dx = Math.sin(rainAngle) * len, dy = Math.cos(rainAngle) * len;

      const useWaterColor = pseudoRandom(seed + i * 17.1 + 801) < 0.3;
      let streakColor = rainColor;
      if (!useWaterColor) {
        const hue = pseudoRandom(seed + i * 23.7 + 901) * 360;
        const rgb = EP.hsvToRgb(hue, 0.35 + pseudoRandom(seed + i * 29.1 + 1001) * 0.45, 0.6 + pseudoRandom(seed + i * 31.3 + 1101) * 0.35);
        streakColor = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      }

      ctx.globalAlpha = op * alpha;
      ctx.strokeStyle = streakColor;
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + dx, ry + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 물이 팍팍 튀는 효과: 글자 주변 여기저기에 "물이 부딪혀 튄" 지점(터짐 지점)을 몇 군데 두고,
  // 그 지점마다 불규칙한 중심 물방울 얼룩 + 흰 하이라이트를 그린 뒤 사방으로 가느다란 물줄기가
  // 휘어져 뻗어나가다 끝에 작은 물방울로 맺히게 함. 그 위에 잘게 흩어진 잔 물방울(스프레이)을
  // 넓게 뿌려서 텍스트에 실제로 물이 튄 듯한 느낌을 냄. seed로 배치가 고정되며 "다시 튀기기"로
  // 새로 뿌려짐
  function drawSplashPass(ctx){
    const cfg = this.splashText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const splashColor = cfg.splashColor || '#7fd7ff';

    // 1) 터짐 지점들 — 중심 얼룩 + 방사형 물줄기 + 끝 물방울
    const burstCount = Math.max(2, Math.round(2 + amt * 6));
    ctx.save();
    ctx.lineCap = 'round';
    for (let b = 0; b < burstCount; b++) {
      const bx = (pseudoRandom(seed + b * 19.3 + 1) - 0.5) * w * 1.6;
      const by = (pseudoRandom(seed + b * 13.7 + 51) - 0.5) * h * 1.8;
      const burstSize = fontSize * (0.12 + pseudoRandom(seed + b * 7.1 + 101) * 0.16);
      const rayCount = 5 + Math.floor(pseudoRandom(seed + b * 5.3 + 151) * 5);

      // 중심 물방울(불규칙한 얼룩 모양)
      ctx.globalAlpha = op * (0.5 + pseudoRandom(seed + b * 3.7 + 201) * 0.3);
      ctx.fillStyle = splashColor;
      ctx.beginPath();
      const blobPoints = 7;
      for (let p = 0; p < blobPoints; p++) {
        const ang = (p / blobPoints) * Math.PI * 2;
        const rad = burstSize * (0.6 + pseudoRandom(seed + b * 23.1 + p * 9.3 + 251) * 0.5);
        const px = bx + Math.cos(ang) * rad, py = by + Math.sin(ang) * rad;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // 밝은 하이라이트
      ctx.globalAlpha = op * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx - burstSize * 0.22, by - burstSize * 0.22, burstSize * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // 사방으로 휘어져 튀는 물줄기 + 끝 물방울
      for (let r = 0; r < rayCount; r++) {
        const rang = pseudoRandom(seed + b * 31.7 + r * 11.3 + 301) * Math.PI * 2;
        const rlen = burstSize * (0.8 + pseudoRandom(seed + b * 17.9 + r * 7.7 + 351) * 1.6);
        const ex = bx + Math.cos(rang) * rlen, ey = by + Math.sin(rang) * rlen;
        const bend = (pseudoRandom(seed + b * 41.1 + r * 5.9 + 381) - 0.5) * burstSize * 0.8;
        const midx = bx + Math.cos(rang) * rlen * 0.55 - Math.sin(rang) * bend;
        const midy = by + Math.sin(rang) * rlen * 0.55 + Math.cos(rang) * bend;
        const thick = Math.max(0.6, burstSize * 0.09);

        ctx.globalAlpha = op * (0.35 + pseudoRandom(seed + b * 11.1 + r * 3.3 + 401) * 0.35);
        ctx.strokeStyle = splashColor;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(midx, midy, ex, ey);
        ctx.stroke();

        const dropR = Math.max(0.8, burstSize * (0.06 + pseudoRandom(seed + b * 29.3 + r * 13.1 + 451) * 0.06));
        ctx.globalAlpha = op * (0.55 + pseudoRandom(seed + b * 7.3 + r * 17.9 + 501) * 0.35);
        ctx.fillStyle = splashColor;
        ctx.beginPath();
        ctx.arc(ex, ey, dropR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 2) 넓게 흩어진 잔 물방울(스프레이) — 터짐 지점 주변까지 넓게 퍼져 있음
    const fineCount = Math.max(15, Math.round(18 + amt * 55));
    ctx.save();
    for (let i = 0; i < fineCount; i++) {
      const fx = (pseudoRandom(seed + i * 9.1 + 601) - 0.5) * w * 2.2;
      const fy = (pseudoRandom(seed + i * 6.7 + 701) - 0.5) * h * 2.4;
      const fr = Math.max(0.6, fontSize * (0.008 + pseudoRandom(seed + i * 4.3 + 801) * 0.02));
      ctx.globalAlpha = op * (0.25 + pseudoRandom(seed + i * 3.9 + 901) * 0.45);
      ctx.fillStyle = splashColor;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 팝아트 효과용 할프톤(망점) 무늬 — 격자로 점을 찍어서 옛날 인쇄물 특유의 도트 질감을 냄.
  // 점 크기는 seed로 살짝씩 다르게 줘서 기계적으로 완벽하게 균일하지 않게 함
  function drawHalftonePass(ctx, w, h, fontSize, spacingMul, opacity, dotColor, seed){
    const spacing = Math.max(3, fontSize * spacingMul);
    const maxR = spacing * 0.4;
    const left = -w / 2 - fontSize * 0.25, right = w / 2 + fontSize * 0.25;
    const top = -h / 2 - fontSize * 0.25, bottom = h / 2 + fontSize * 0.25;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = dotColor;
    let row = 0;
    for (let y = top; y < bottom; y += spacing) {
      const colOffset = (row % 2 === 0) ? 0 : spacing / 2;
      let col = 0;
      for (let x = left + colOffset; x < right; x += spacing) {
        const r = maxR * (0.5 + pseudoRandom(seed + row * 17.3 + col * 11.7 + 1) * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        col++;
      }
      row++;
    }
    ctx.restore();
  }

  // 잉크트랩 스타일: 진짜 활자 획 안쪽에 잉크트랩을 새기려면 글자 윤곽선(패스) 데이터가 필요한데
  // 캔버스에서는 그 데이터에 접근할 수 없어서, 대신 텍스트 윗변/아랫변을 따라 안쪽을 향한 작은
  // 삼각 노치들을 나란히 새겨 넣어서 활판인쇄 시절의 각진 잉크트랩 서체 느낌을 흉내냄.
  // 노치 배치는 seed로 고정 — "다시 만들기"를 눌러야 새로 바뀜
  function drawInkTrapPass(ctx){
    const cfg = this.inkTrapText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const notchColor = cfg.notchColor || '#111111';
    const text = this.text || '';

    // 글자 잉크 위쪽 가장자리 계산(불타는 효과와 동일한 방식) — 노치가 실제 글자 윗변에 닿도록
    let capTopGap = fontSize * 0.28;
    try {
      const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();
      ctx.save();
      ctx.font = fontDecl;
      const firstLine = text.split('\n')[0] || 'A';
      const m = ctx.measureText(firstLine || 'A');
      ctx.restore();
      if (m && m.actualBoundingBoxAscent) {
        const lineH = fontSize * (this.lineHeight || 1.16);
        capTopGap = Math.max(0, lineH - m.actualBoundingBoxAscent - fontSize * 0.06);
      }
    } catch (e) { /* 측정 실패 시 기본값 사용 */ }

    const topY = -h / 2 + capTopGap;
    const bottomY = h / 2;

    ctx.save();
    ctx.globalAlpha = op;
    ctx.fillStyle = notchColor;

    const notchCount = Math.max(6, Math.round(8 + amt * 16));
    const notchDepth = fontSize * (0.05 + amt * 0.09);
    const notchWidth = fontSize * (0.06 + amt * 0.05);

    for (let i = 0; i < notchCount; i++) {
      const x = -w / 2 + (i + 0.5) / notchCount * w + (pseudoRandom(seed + i * 7 + 1) * 2 - 1) * fontSize * 0.05;

      ctx.beginPath();
      ctx.moveTo(x - notchWidth / 2, topY);
      ctx.lineTo(x + notchWidth / 2, topY);
      ctx.lineTo(x, topY + notchDepth);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x - notchWidth / 2, bottomY);
      ctx.lineTo(x + notchWidth / 2, bottomY);
      ctx.lineTo(x, bottomY - notchDepth);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 빈티지 흠집 — 긁힌 자국(밝은 스크래치)과 작은 얼룩/이 빠진 자국(점)을 텍스트 안팎에
    // 잔뜩 흩뿌려서 오래되고 낡은 느낌을 냄. 테두리 두께는 건드리지 않음
    const scratchCount = Math.max(10, Math.round(14 + amt * 34));
    ctx.save();
    ctx.globalAlpha = op;
    for (let i = 0; i < scratchCount; i++) {
      const midX = (pseudoRandom(seed + i * 9.1 + 2001) - 0.5) * w * 1.15;
      const midY = (pseudoRandom(seed + i * 7.3 + 2101) - 0.5) * h * 1.25;
      const len = fontSize * (0.08 + pseudoRandom(seed + i * 11.7 + 2201) * 0.55);
      const ang = pseudoRandom(seed + i * 13.3 + 2301) * Math.PI * 2;
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      const isLight = pseudoRandom(seed + i * 17.1 + 2401) > 0.35;
      ctx.strokeStyle = isLight ? '#ffffff' : notchColor;
      ctx.lineWidth = Math.max(0.5, fontSize * (0.004 + pseudoRandom(seed + i * 19.7 + 2501) * 0.01));
      ctx.globalAlpha = op * (isLight ? (0.15 + pseudoRandom(seed + i * 23.1 + 2601) * 0.3) : (0.2 + pseudoRandom(seed + i * 29.3 + 2701) * 0.35));
      ctx.beginPath();
      ctx.moveTo(midX - dx, midY - dy);
      ctx.lineTo(midX + dx, midY + dy);
      ctx.stroke();
    }

    // 작은 얼룩/이 빠진 자국(점) — 표면이 닳거나 잉크가 뭉친 듯한 자잘한 반점
    const speckCount = Math.max(14, Math.round(16 + amt * 40));
    for (let i = 0; i < speckCount; i++) {
      const sx = (pseudoRandom(seed + i * 5.9 + 3001) - 0.5) * w * 1.1;
      const sy = (pseudoRandom(seed + i * 6.7 + 3101) - 0.5) * h * 1.2;
      const sr = fontSize * (0.006 + pseudoRandom(seed + i * 8.3 + 3201) * 0.018);
      const isLight = pseudoRandom(seed + i * 10.1 + 3301) > 0.5;
      ctx.fillStyle = isLight ? '#ffffff' : notchColor;
      ctx.globalAlpha = op * (0.15 + pseudoRandom(seed + i * 12.7 + 3401) * 0.35);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 나뭇잎 덩굴 효과: 텍스트의 실제 잉크 윗변/아랫변 위 여러 지점에서 덩굴 줄기가 자라나
  // 방향을 마구 꺾어가며(큰 랜덤 각도 변화) 아주 어지럽게 꼬여서 덤불처럼 뻗어나가고, 그
  // 마디마다 나뭇잎이 촘촘하게 돋아남. 그리고 줄기와 상관없이 텍스트 주변에 독립적으로
  // 흩날리는 나뭇잎도 따로 흩뿌려서 날아다니는 느낌을 더함. 시작점이 반드시 글자 가장자리에
  // 닿아 있어서 "글씨에서 자라난" 것처럼 보임. 배치는 seed로 고정 — "다시 자라기"로 재배치
  function drawLeafVinePass(ctx){
    const cfg = this.leafVineText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;
    const vineColor = cfg.vineColor || '#4a7c3f';
    const leafColorA = cfg.leafColorA || '#5fae4a';
    const leafColorB = cfg.leafColorB || '#8fd46a';
    const text = this.text || '';

    // 글자 잉크 위쪽 가장자리 계산(불타는 효과와 동일한 방식) — 덩굴이 실제 글자 윗변에 닿도록
    let capTopGap = fontSize * 0.28;
    try {
      const fontDecl = (this._getFontDeclaration ? this._getFontDeclaration() : `${this.fontStyle || ''} ${this.fontWeight || ''} ${this.fontSize}px ${this.fontFamily}`).trim();
      ctx.save();
      ctx.font = fontDecl;
      const firstLine = text.split('\n')[0] || 'A';
      const m = ctx.measureText(firstLine || 'A');
      ctx.restore();
      if (m && m.actualBoundingBoxAscent) {
        const lineH = fontSize * (this.lineHeight || 1.16);
        capTopGap = Math.max(0, lineH - m.actualBoundingBoxAscent - fontSize * 0.06);
      }
    } catch (e) { /* 측정 실패 시 기본값 사용 */ }

    const topY = -h / 2 + capTopGap;
    const bottomY = h / 2;

    const vineCount = Math.max(3, Math.round(4 + amt * 7));

    ctx.save();
    ctx.globalAlpha = op;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < vineCount; i++) {
      // 시작점을 위쪽 또는 아래쪽 잉크 가장자리 중 하나로 골라서 글씨에 반드시 닿게 함
      const onTop = pseudoRandom(seed + i * 11 + 1) > 0.5;
      const startX = -w / 2 + pseudoRandom(seed + i * 7 + 51) * w;
      const startY = onTop ? topY : bottomY;
      const outward = onTop ? -1 : 1;
      const baseAngle = outward < 0 ? -Math.PI / 2 : Math.PI / 2;

      // 마디(꼬임 지점) 여러 개를 이어서 아주 어지럽게 방향을 꺾는 줄기를 만듦 —
      // 강도가 셀수록 마디 수와 꺾이는 각도 폭이 커져서 더 심하게 덤불처럼 엉킴
      const segCount = Math.max(5, Math.round(6 + amt * 12));
      const segLen = fontSize * (0.1 + amt * 0.06);
      const twistRange = 0.9 + amt * 2.3; // 라디안 — 세게 하면 거의 사방으로 마구 꺾임

      let angle = baseAngle;
      let x = startX, y = startY;
      const pts = [[x, y]];
      for (let s = 0; s < segCount; s++) {
        const pull = (baseAngle - angle) * 0.12; // 원래 뻗어나가는 방향으로 살짝만 끌어당김
        angle += pull + (pseudoRandom(seed + i * 97 + s * 13 + 601) * 2 - 1) * twistRange;
        x += Math.cos(angle) * segLen;
        y += Math.sin(angle) * segLen;
        pts.push([x, y]);
      }

      ctx.strokeStyle = vineColor;
      ctx.lineWidth = Math.max(1, fontSize * (0.015 + amt * 0.015));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length - 1; s++) {
        const midX = (pts[s][0] + pts[s + 1][0]) / 2, midY = (pts[s][1] + pts[s + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[s][0], pts[s][1], midX, midY);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.stroke();

      // 마디마다(대부분) 나뭇잎을 촘촘하게 붙임 — 꼬인 줄기라 잎도 여기저기 붙어있는 느낌을 냄
      pts.forEach((p, pi) => {
        if (pi === 0) return;
        if (pseudoRandom(seed + i * 151 + pi * 7 + 701) > 0.3) {
          const leafSize = fontSize * (0.11 + pseudoRandom(seed + i * 29 + pi * 11 + 301) * 0.25);
          const leafRot = pseudoRandom(seed + i * 31 + pi * 17 + 351) * Math.PI * 2;
          ctx.save();
          ctx.translate(p[0], p[1]);
          ctx.rotate(leafRot);
          ctx.fillStyle = pseudoRandom(seed + i * 37 + pi * 19 + 401) > 0.5 ? leafColorA : leafColorB;
          drawLeafShape(ctx, leafSize);
          ctx.restore();
        }
      });
    }
    ctx.restore();

    // 날아다니는 나뭇잎 — 줄기와 상관없이 텍스트 주변에 독립적으로 넓게 흩날림
    const flyingCount = Math.max(8, Math.round(10 + amt * 26));
    ctx.save();
    for (let i = 0; i < flyingCount; i++) {
      const fx = (pseudoRandom(seed + i * 7.7 + 5001) - 0.5) * w * 2.5;
      const fy = (pseudoRandom(seed + i * 5.3 + 5101) - 0.5) * h * 2.9;
      const leafSize = fontSize * (0.1 + pseudoRandom(seed + i * 9.1 + 5201) * 0.26);
      const rot = pseudoRandom(seed + i * 11.3 + 5301) * Math.PI * 2;
      ctx.globalAlpha = op * (0.45 + pseudoRandom(seed + i * 13.7 + 5401) * 0.5);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(rot);
      ctx.fillStyle = pseudoRandom(seed + i * 17.9 + 5501) > 0.5 ? leafColorA : leafColorB;
      drawLeafShape(ctx, leafSize);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- 벚꽃 모양들 (중심 0,0 기준, size는 대략적인 크기) ----
  // 꽃잎 한 장(끝이 둥근 하트형에 가까운 모양)
  function drawSakuraPetal(ctx, size){
    ctx.beginPath();
    ctx.moveTo(0, size * 0.05);
    ctx.bezierCurveTo(size * 0.45, -size * 0.05, size * 0.42, -size * 0.55, 0, -size * 0.75);
    ctx.bezierCurveTo(-size * 0.42, -size * 0.55, -size * 0.45, -size * 0.05, 0, size * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  // 꽃잎 5장이 모인 벚꽃 한 송이 — 호출 전에 정해둔 ctx.fillStyle을 꽃잎 색으로 그대로 씀
  function drawSakuraFlower(ctx, size){
    const petalColor = ctx.fillStyle;
    for (let p = 0; p < 5; p++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 / 5) * p);
      ctx.fillStyle = petalColor;
      drawSakuraPetal(ctx, size);
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = '#fff0b8';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const SAKURA_PINKS = ['#ffe3ec', '#ffd1e0', '#ffc4d6', '#ffe8f0', '#ffffff', '#fff5f8', '#ffdce8'];
  const SAKURA_GREENS = ['#d7ecc0', '#c8e6a0', '#e2f0cf'];

  // 벚꽃 효과: 꽃잎 한 장짜리와 다섯 장짜리 벚꽃송이를 글자 주변에 넓게 흩뿌림(산발하는 느낌).
  // 전체적으로 파스텔 톤이고, 낱장 꽃잎 비율을 높였음. 대부분(분홍+흰색)이 자주 나오고,
  // 일부는 파스텔 색상환, 일부는 연두빛이 섞인 벚꽃으로 나와서 단조롭지 않게 함.
  // 배치/색상은 seed로 고정 — "다시 그리기"를 눌러야 새로 바뀜
  function drawSakuraPass(ctx){
    const cfg = this.sakuraText;
    if (!cfg) return;
    const amt = Math.max(0, Math.min(100, cfg.intensity != null ? cfg.intensity : 60)) / 100;
    if (amt <= 0) return;
    const seed = cfg.seed || 0;
    const w = this.width || 100, h = this.height || (this.fontSize || 40) * 1.2;
    const fontSize = this.fontSize || 40;
    const op = this.opacity != null ? this.opacity : 1;

    const count = Math.max(10, Math.round(14 + amt * 34));
    ctx.save();
    ctx.globalAlpha = op;
    for (let i = 0; i < count; i++) {
      const x = (pseudoRandom(seed + i * 11.3 + 1) - 0.5) * w * 2.3;
      const y = (pseudoRandom(seed + i * 7.1 + 51) - 0.5) * h * 2.7;
      const size = fontSize * (0.14 + pseudoRandom(seed + i * 13.7 + 101) * 0.32);
      const rot = pseudoRandom(seed + i * 17.9 + 201) * Math.PI * 2;
      const isFullFlower = pseudoRandom(seed + i * 41.1 + 601) > 0.72; // 꽃송이 비율을 낮추고 낱장 꽃잎 비율을 높임

      // 색상 결정: 대부분(약 82%)은 분홍/흰색, 일부(약 10%)는 파스텔 색상환, 나머지(약 8%)는 연두빛
      const colorRoll = pseudoRandom(seed + i * 23.3 + 301);
      let color;
      if (colorRoll < 0.82) {
        color = SAKURA_PINKS[Math.floor(pseudoRandom(seed + i * 29.7 + 401) * SAKURA_PINKS.length) % SAKURA_PINKS.length];
      } else if (colorRoll < 0.92) {
        const hue = pseudoRandom(seed + i * 31.9 + 451) * 360;
        const rgb = EP.hsvToRgb(hue, 0.25 + pseudoRandom(seed + i * 37.1 + 471) * 0.2, 0.9 + pseudoRandom(seed + i * 39.3 + 491) * 0.1);
        color = EP.rgbToHex(rgb.r, rgb.g, rgb.b);
      } else {
        color = SAKURA_GREENS[Math.floor(pseudoRandom(seed + i * 43.7 + 501) * SAKURA_GREENS.length) % SAKURA_GREENS.length];
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = op * (0.55 + pseudoRandom(seed + i * 3 + 701) * 0.4);
      ctx.fillStyle = color;
      if (isFullFlower) { drawSakuraFlower(ctx, size); } else { drawSakuraPetal(ctx, size * 1.3); }
      ctx.restore();
    }
    ctx.restore();
  }

  function hasAnyRenderEffect(t){
    return !!(t.circularText || t.verticalText || t.puffyText || t.vineText || t.rollText || t.perspectiveText || t.curveText || t.waveText || t.trainText || t.tiredText || t.spiralText || t.magazineText || t.puzzleText || t.skyText || t.chalkText || t.postalText || t.grassText || t.bigbangText || t.eventText || t.golfText || t.christmasText || t.autumnText || t.spaceText || t.doodleText || t.butterflyText || t.soapbubbleText || t.lightningText || t.halloweenText || t.musicnoteText || t.gemText || t.tropicalText || t.candyText || t.doubleOutline || t.threeDText || t.metalText || t.popArtText || t.inkTrapText || t.leafVineText || t.sakuraText || t.shyText || t.fireText || t.meltText || t.bubbleText || t.zebraText || t.speedText || t.reflectionText || t.crackText || t.tileText || t.footprintText || t.animalText || t.seafoodText || t.fruitVegText || t.heartText || t.coffeeText || t.sportsText || t.clubText || t.snowText || t.rainText || t.splashText || t.glitchText || t.tearText || t.lightText || (t.randomTypo && t.randomTypo.chars && t.randomTypo.chars.length));
  }
  // 효과를 하나라도 켜면 이 통합 _render로 바꿔치기하고, objectCaching을 꺼서
  // (렌더 방식이 계속 바뀌는 오브젝트라 fabric의 캐시 비트맵이 못 따라와 지저분한 잔상이
  // 남는 문제가 있었음 — 아예 매번 새로 그리게 해서 원천적으로 방지)
  function patchUnifiedRender(t){
    if (!t.__unifiedPatched) {
      t.__unifiedPatched = true;
      t._render = function(ctx){ unifiedCustomRender.call(this, ctx); };
    }
    t.objectCaching = false;
  }
  // 모든 효과가 꺼졌을 때만 원래 렌더 방식과 캐싱으로 되돌림
  function maybeUnpatchRender(t){
    if (hasAnyRenderEffect(t)) return;
    if (t.__unifiedPatched) { delete t._render; delete t.__unifiedPatched; }
    t.objectCaching = true;
  }
  // 원형/세로쓰기/부풀리기/랜덤 타이포는 넷 중 하나만 가능 — 하나를 켜면 나머지는 꺼줌
  // (이중테두리/3D/글리치/찢기는 서로 다른 종류라 여기서 건드리지 않음 → 자유롭게 같이 켤 수 있음)
  function clearOtherLayoutEffects(t, except){
    if (except !== 'circular') t.circularText = null;
    if (except !== 'vertical') t.verticalText = null;
    if (except !== 'puffy') t.puffyText = null;
    if (except !== 'vine') t.vineText = null;
    if (except !== 'roll') t.rollText = null;
    if (except !== 'perspective') t.perspectiveText = null;
    if (except !== 'curve') t.curveText = null;
    if (except !== 'wave') t.waveText = null;
    if (except !== 'train') t.trainText = null;
    if (except !== 'tired') t.tiredText = null;
    if (except !== 'spiral') t.spiralText = null;
    if (except !== 'magazine') t.magazineText = null;
    if (except !== 'puzzle') t.puzzleText = null;
    if (except !== 'sky') t.skyText = null;
    if (except !== 'chalk') t.chalkText = null;
    if (except !== 'postal') t.postalText = null;
    if (except !== 'randomTypo') t.randomTypo = null;
  }
  // 프로젝트 불러오기/실행취소·다시실행으로 오브젝트가 새로 만들어지면 패치가 사라지므로,
  // 효과값이 남아있는 오브젝트를 찾아 다시 패치해줌
  function reapplyCircularTextPatches(){
    EP.canvas.getObjects().forEach(o => { if (hasAnyRenderEffect(o)) patchUnifiedRender(o); });
  }


  const qaDblInnerWidth = document.getElementById('qaDblInnerWidth');
  const qaDblInnerColor = document.getElementById('qaDblInnerColor');
  const qaDblOuterWidth = document.getElementById('qaDblOuterWidth');
  const qaDblOuterColor = document.getElementById('qaDblOuterColor');
  function applyQaDoubleOutline(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const innerW = parseFloat(qaDblInnerWidth.value) || 0;
    const outerW = parseFloat(qaDblOuterWidth.value) || 0;
    if (innerW <= 0 && outerW <= 0) {
      boxes.forEach(t => { t.doubleOutline = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        t.doubleOutline = {
          innerWidth: innerW, innerColor: qaDblInnerColor.value || '#ffffff',
          outerWidth: outerW, outerColor: qaDblOuterColor.value || '#000000'
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaDblInnerWidth.addEventListener('input', applyQaDoubleOutline);
  qaDblInnerColor.addEventListener('input', applyQaDoubleOutline);
  qaDblOuterWidth.addEventListener('input', applyQaDoubleOutline);
  qaDblOuterColor.addEventListener('input', applyQaDoubleOutline);
  qaDblInnerWidth.addEventListener('change', () => EP.pushHistory());
  qaDblOuterWidth.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaDblOffBtn').addEventListener('click', () => {
    qaDblInnerWidth.value = 0; qaDblOuterWidth.value = 0;
    applyQaDoubleOutline(); EP.pushHistory();
  });


  // ---- 글리치 ---- (빨강/시안으로 살짝 어긋나게 겹쳐 그려서 화면 노이즈 같은 색분리 느낌을 냄)
  // 방향은 가로(기존, 좌우로 어긋남)/세로(위아래로 어긋남)/글자별(글자마다 제각각 다른 방향으로 어긋남) 중 선택
  const qaGlitchAmount = document.getElementById('qaGlitchAmount');
  const qaGlitchModeBtns = Array.from(document.querySelectorAll('#qaGlitchModeSeg button'));
  let qaGlitchMode = 'horizontal';
  qaGlitchModeBtns.forEach(b => {
    b.addEventListener('click', () => {
      qaGlitchMode = b.dataset.mode;
      qaGlitchModeBtns.forEach(o => o.classList.toggle('on', o === b));
      applyQaGlitch(false);
      EP.pushHistory();
    });
  });
  function applyQaGlitch(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const amount = parseFloat(qaGlitchAmount.value) || 0;
    if (amount <= 0) {
      boxes.forEach(t => { t.glitchText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const mode = qaGlitchMode;
      boxes.forEach(t => {
        // 세로/글자별 모드에서 어긋나는 방향은 seed로 정해짐 — "다시 글리치"를 눌러야 새로 바뀜
        const seed = (regenerateSeed || !t.glitchText) ? Math.floor(Math.random() * 100000) : t.glitchText.seed;
        t.glitchText = { amount, mode, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaGlitchAmount.addEventListener('input', () => applyQaGlitch(false));
  qaGlitchAmount.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaGlitchShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaGlitchAmount.value) || 0) <= 0) qaGlitchAmount.value = 8;
    applyQaGlitch(true);
    EP.pushHistory();
  });
  document.getElementById('qaGlitchOffBtn').addEventListener('click', () => {
    qaGlitchAmount.value = 0;
    applyQaGlitch(false); EP.pushHistory();
  });


  // ---- 찢기 ---- (글자를 조각으로 나눠 어긋나게 그려서 찢어진 종이처럼 보이게 함, 방향은 가로/세로/대각선/랜덤)
  const qaTearStrips = document.getElementById('qaTearStrips');
  const qaTearGap = document.getElementById('qaTearGap');
  const qaTearRotate = document.getElementById('qaTearRotate');
  const qaTearDirectionBtns = Array.from(document.querySelectorAll('#qaTearDirectionSeg button'));
  let qaTearDirection = 'random';
  qaTearDirectionBtns.forEach(b => {
    b.addEventListener('click', () => {
      qaTearDirection = b.dataset.dir;
      qaTearDirectionBtns.forEach(o => o.classList.toggle('on', o === b));
      applyQaTear(false);
      EP.pushHistory();
    });
  });
  function applyQaTear(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const gap = parseFloat(qaTearGap.value) || 0;
    if (gap <= 0) {
      boxes.forEach(t => { t.tearText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const strips = parseFloat(qaTearStrips.value) || 6;
      const rotate = parseFloat(qaTearRotate.value) || 0;
      const direction = qaTearDirection;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.tearText) ? Math.floor(Math.random() * 100000) : t.tearText.seed;
        t.tearText = { strips, gap, rotate, direction, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaTearStrips.addEventListener('input', () => applyQaTear(false));
  qaTearGap.addEventListener('input', () => applyQaTear(false));
  qaTearRotate.addEventListener('input', () => applyQaTear(false));
  qaTearStrips.addEventListener('change', () => EP.pushHistory());
  qaTearGap.addEventListener('change', () => EP.pushHistory());
  qaTearRotate.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaTearShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaTearGap.value) || 0) <= 0) qaTearGap.value = 15;
    applyQaTear(true);
    EP.pushHistory();
  });
  document.getElementById('qaTearOffBtn').addEventListener('click', () => {
    qaTearGap.value = 0;
    applyQaTear(false); EP.pushHistory();
  });


  // ---- 녹아 늘러붙은 효과 ---- (아래로 뭉개지는 스머지 + 뚝뚝 떨어지는 방울, 방울 위치는 시드 고정)
  const qaMeltAmount = document.getElementById('qaMeltAmount');
  const qaMeltDrips = document.getElementById('qaMeltDrips');
  function applyQaMelt(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const amount = parseFloat(qaMeltAmount.value) || 0;
    if (amount <= 0) {
      boxes.forEach(t => { t.meltText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const drips = parseFloat(qaMeltDrips.value) || 6;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.meltText) ? Math.floor(Math.random() * 100000) : t.meltText.seed;
        t.meltText = { amount, drips, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaMeltAmount.addEventListener('input', () => applyQaMelt(false));
  qaMeltDrips.addEventListener('input', () => applyQaMelt(false));
  qaMeltAmount.addEventListener('change', () => EP.pushHistory());
  qaMeltDrips.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaMeltShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaMeltAmount.value) || 0) <= 0) qaMeltAmount.value = 50;
    applyQaMelt(true);
    EP.pushHistory();
  });
  document.getElementById('qaMeltOffBtn').addEventListener('click', () => {
    qaMeltAmount.value = 0;
    applyQaMelt(false); EP.pushHistory();
  });


  // ---- 스피드 잔상 효과 ---- (네 방향 잔상 + 흙먼지, 배치는 seed로 고정 — "다시 튀기기"로 재배치)
  const qaSpeedIntensity = document.getElementById('qaSpeedIntensity');
  const qaSpeedDustColor = document.getElementById('qaSpeedDustColor');
  function applyQaSpeed(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaSpeedIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.speedText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.speedText) ? Math.floor(Math.random() * 100000) : t.speedText.seed;
        t.speedText = { intensity, dustColor: qaSpeedDustColor.value || '#8a6a45', seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSpeedIntensity.addEventListener('input', () => applyQaSpeed(false));
  qaSpeedDustColor.addEventListener('input', () => applyQaSpeed(false));
  qaSpeedIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSpeedShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaSpeedIntensity.value) || 0) <= 0) qaSpeedIntensity.value = 55;
    applyQaSpeed(true);
    EP.pushHistory();
  });
  document.getElementById('qaSpeedOffBtn').addEventListener('click', () => {
    qaSpeedIntensity.value = 0;
    applyQaSpeed(false); EP.pushHistory();
  });


  // ---- 거울 반사 효과 ---- (원본 바로 아래에 상하반전 복사본을 옅게+흐리게 그려 바닥/유리에 비친 느낌)
  const qaReflectionIntensity = document.getElementById('qaReflectionIntensity');
  const qaReflectionBlur = document.getElementById('qaReflectionBlur');
  const qaReflectionGap = document.getElementById('qaReflectionGap');
  function applyQaReflection(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaReflectionIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.reflectionText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const blur = parseFloat(qaReflectionBlur.value) || 0;
      const gap = parseFloat(qaReflectionGap.value) || 0;
      boxes.forEach(t => {
        t.reflectionText = { intensity, blur, gap };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaReflectionIntensity.addEventListener('input', () => applyQaReflection());
  qaReflectionBlur.addEventListener('input', () => applyQaReflection());
  qaReflectionGap.addEventListener('input', () => applyQaReflection());
  qaReflectionIntensity.addEventListener('change', () => EP.pushHistory());
  qaReflectionBlur.addEventListener('change', () => EP.pushHistory());
  qaReflectionGap.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaReflectionOffBtn').addEventListener('click', () => {
    qaReflectionIntensity.value = 0;
    applyQaReflection(); EP.pushHistory();
  });


  // ---- 유리 깨짐 효과 ---- (방사형 균열 + 어긋난 파편, 배치는 seed로 고정 — "다시 깨기"로 재배치)
  const qaCrackIntensity = document.getElementById('qaCrackIntensity');
  const qaCrackColor = document.getElementById('qaCrackColor');
  function applyQaCrack(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaCrackIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.crackText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.crackText) ? Math.floor(Math.random() * 100000) : t.crackText.seed;
        t.crackText = { intensity, crackColor: qaCrackColor.value || '#ffffff', seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaCrackIntensity.addEventListener('input', () => applyQaCrack(false));
  qaCrackColor.addEventListener('input', () => applyQaCrack(false));
  qaCrackIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaCrackShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaCrackIntensity.value) || 0) <= 0) qaCrackIntensity.value = 55;
    applyQaCrack(true);
    EP.pushHistory();
  });
  document.getElementById('qaCrackOffBtn').addEventListener('click', () => {
    qaCrackIntensity.value = 0;
    applyQaCrack(false); EP.pushHistory();
  });


  // ---- 타일무늬 효과 ---- (같은 색상계열 안에서 밝기만 랜덤(±10%)한 직사각형 타일들을 글자 모양에 맞춰 붙임, 배치/색상은 seed 고정)
  const qaTileIntensity = document.getElementById('qaTileIntensity');
  function applyQaTile(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaTileIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.tileText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.tileText) ? Math.floor(Math.random() * 100000) : t.tileText.seed;
        t.tileText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaTileIntensity.addEventListener('input', () => applyQaTile(false));
  qaTileIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaTileShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaTileIntensity.value) || 0) <= 0) qaTileIntensity.value = 55;
    applyQaTile(true);
    EP.pushHistory();
  });
  document.getElementById('qaTileOffBtn').addEventListener('click', () => {
    qaTileIntensity.value = 0;
    applyQaTile(false); EP.pushHistory();
  });


  // ---- 발자국 효과 ---- (말발굽/소/닭 발자국을 여러 색상·크기·위치로 흩뿌림, 배치는 seed 고정)
  const qaFootprintIntensity = document.getElementById('qaFootprintIntensity');
  function applyQaFootprint(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaFootprintIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.footprintText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.footprintText) ? Math.floor(Math.random() * 100000) : t.footprintText.seed;
        t.footprintText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaFootprintIntensity.addEventListener('input', () => applyQaFootprint(false));
  qaFootprintIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaFootprintShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaFootprintIntensity.value) || 0) <= 0) qaFootprintIntensity.value = 55;
    applyQaFootprint(true);
    EP.pushHistory();
  });
  document.getElementById('qaFootprintOffBtn').addEventListener('click', () => {
    qaFootprintIntensity.value = 0;
    applyQaFootprint(false); EP.pushHistory();
  });


  // ---- 귀여운 동물 효과 ---- (고양이 또는 강아지 얼굴·발자국·소품을 흩뿌림, 배치/동물 종류는 seed 고정)
  const qaAnimalIntensity = document.getElementById('qaAnimalIntensity');
  function applyQaAnimal(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaAnimalIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.animalText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.animalText) ? Math.floor(Math.random() * 100000) : t.animalText.seed;
        t.animalText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaAnimalIntensity.addEventListener('input', () => applyQaAnimal(false));
  qaAnimalIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaAnimalShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaAnimalIntensity.value) || 0) <= 0) qaAnimalIntensity.value = 55;
    applyQaAnimal(true);
    EP.pushHistory();
  });
  document.getElementById('qaAnimalOffBtn').addEventListener('click', () => {
    qaAnimalIntensity.value = 0;
    applyQaAnimal(false); EP.pushHistory();
  });


  // ---- 해산물 효과 ---- (문어/오징어/고등어/참치/파도를 종류·크기·색 전부 무작위로 흩뿌림)
  const qaSeafoodIntensity = document.getElementById('qaSeafoodIntensity');
  function applyQaSeafood(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaSeafoodIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.seafoodText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.seafoodText) ? Math.floor(Math.random() * 100000) : t.seafoodText.seed;
        t.seafoodText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSeafoodIntensity.addEventListener('input', () => applyQaSeafood(false));
  qaSeafoodIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSeafoodShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaSeafoodIntensity.value) || 0) <= 0) qaSeafoodIntensity.value = 55;
    applyQaSeafood(true);
    EP.pushHistory();
  });
  document.getElementById('qaSeafoodOffBtn').addEventListener('click', () => {
    qaSeafoodIntensity.value = 0;
    applyQaSeafood(false); EP.pushHistory();
  });


  // ---- 과일&채소 효과 ---- (과일 또는 채소 중 하나만 골라 실물 색 그대로(명암만 살짝 랜덤) 흩뿌림, 컨셉/배치는 seed 고정)
  const qaFruitVegIntensity = document.getElementById('qaFruitVegIntensity');
  function applyQaFruitVeg(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaFruitVegIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.fruitVegText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.fruitVegText) ? Math.floor(Math.random() * 100000) : t.fruitVegText.seed;
        t.fruitVegText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaFruitVegIntensity.addEventListener('input', () => applyQaFruitVeg(false));
  qaFruitVegIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaFruitVegShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaFruitVegIntensity.value) || 0) <= 0) qaFruitVegIntensity.value = 55;
    applyQaFruitVeg(true);
    EP.pushHistory();
  });
  document.getElementById('qaFruitVegOffBtn').addEventListener('click', () => {
    qaFruitVegIntensity.value = 0;
    applyQaFruitVeg(false); EP.pushHistory();
  });


  // ---- 하트 효과 ---- (붉은~핑크 계열 랜덤 색, 랜덤 크기의 하트를 흩뿌림, 배치는 seed 고정)
  const qaHeartIntensity = document.getElementById('qaHeartIntensity');
  function applyQaHeart(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaHeartIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.heartText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.heartText) ? Math.floor(Math.random() * 100000) : t.heartText.seed;
        t.heartText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaHeartIntensity.addEventListener('input', () => applyQaHeart(false));
  qaHeartIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaHeartShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaHeartIntensity.value) || 0) <= 0) qaHeartIntensity.value = 55;
    applyQaHeart(true);
    EP.pushHistory();
  });
  document.getElementById('qaHeartOffBtn').addEventListener('click', () => {
    qaHeartIntensity.value = 0;
    applyQaHeart(false); EP.pushHistory();
  });


  // ---- 커피 원두 효과 ---- (커피색(라이트~다크로스트) 랜덤, 랜덤 크기의 원두를 흩뿌림, 배치는 seed 고정)
  const qaCoffeeIntensity = document.getElementById('qaCoffeeIntensity');
  function applyQaCoffee(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaCoffeeIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.coffeeText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.coffeeText) ? Math.floor(Math.random() * 100000) : t.coffeeText.seed;
        t.coffeeText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaCoffeeIntensity.addEventListener('input', () => applyQaCoffee(false));
  qaCoffeeIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaCoffeeShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaCoffeeIntensity.value) || 0) <= 0) qaCoffeeIntensity.value = 55;
    applyQaCoffee(true);
    EP.pushHistory();
  });
  document.getElementById('qaCoffeeOffBtn').addEventListener('click', () => {
    qaCoffeeIntensity.value = 0;
    applyQaCoffee(false); EP.pushHistory();
  });


  // ---- 스포츠공 효과 ---- (축구공·농구공·야구공·테니스공·배구공을 여러 크기·위치로 흩뿌림, 배치는 seed 고정)
  const qaSportsIntensity = document.getElementById('qaSportsIntensity');
  function applyQaSports(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaSportsIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.sportsText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.sportsText) ? Math.floor(Math.random() * 100000) : t.sportsText.seed;
        t.sportsText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSportsIntensity.addEventListener('input', () => applyQaSports(false));
  qaSportsIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSportsShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaSportsIntensity.value) || 0) <= 0) qaSportsIntensity.value = 55;
    applyQaSports(true);
    EP.pushHistory();
  });
  document.getElementById('qaSportsOffBtn').addEventListener('click', () => {
    qaSportsIntensity.value = 0;
    applyQaSports(false); EP.pushHistory();
  });


  // ---- 클럽 분위기 효과 ---- (글자 옆에 사람들이 와르르 몰려있는 무리 + 스포트라이트, 인원수는 seed로 완전 랜덤)
  const qaClubIntensity = document.getElementById('qaClubIntensity');
  function applyQaClub(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaClubIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.clubText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.clubText) ? Math.floor(Math.random() * 100000) : t.clubText.seed;
        t.clubText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaClubIntensity.addEventListener('input', () => applyQaClub(false));
  qaClubIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaClubShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaClubIntensity.value) || 0) <= 0) qaClubIntensity.value = 55;
    applyQaClub(true);
    EP.pushHistory();
  });
  document.getElementById('qaClubOffBtn').addEventListener('click', () => {
    qaClubIntensity.value = 0;
    applyQaClub(false); EP.pushHistory();
  });


  // ---- 눈 내리는 효과 ---- (바닥 쌓임 + 윗변 덮임 + 흩날리는 눈송이, 배치는 seed 고정)
  const qaSnowIntensity = document.getElementById('qaSnowIntensity');
  function applyQaSnow(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaSnowIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.snowText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const showPile = qaSnowPileToggleBtn.classList.contains('on');
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.snowText) ? Math.floor(Math.random() * 100000) : t.snowText.seed;
        t.snowText = { intensity, seed, showPile };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  const qaSnowPileToggleBtn = document.getElementById('qaSnowPileToggleBtn');
  qaSnowPileToggleBtn.addEventListener('click', () => {
    qaSnowPileToggleBtn.classList.toggle('on');
    qaSnowPileToggleBtn.textContent = qaSnowPileToggleBtn.classList.contains('on') ? '쌓인눈 표시중' : '쌓인눈 숨김';
    applyQaSnow(false);
    EP.pushHistory();
  });
  qaSnowIntensity.addEventListener('input', () => applyQaSnow(false));
  qaSnowIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSnowShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaSnowIntensity.value) || 0) <= 0) qaSnowIntensity.value = 55;
    applyQaSnow(true);
    EP.pushHistory();
  });
  document.getElementById('qaSnowOffBtn').addEventListener('click', () => {
    qaSnowIntensity.value = 0;
    applyQaSnow(false); EP.pushHistory();
  });


  // ---- 비 내리는 효과 ---- (호수 잔물결 + 빗줄기, 배치는 seed 고정 — "다시 내리기"로 재배치)
  const qaRainIntensity = document.getElementById('qaRainIntensity');
  const qaRainColor = document.getElementById('qaRainColor');
  function applyQaRain(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaRainIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.rainText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.rainText) ? Math.floor(Math.random() * 100000) : t.rainText.seed;
        t.rainText = { intensity, rainColor: qaRainColor.value || '#bcdfff', seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaRainIntensity.addEventListener('input', () => applyQaRain(false));
  qaRainColor.addEventListener('input', () => applyQaRain(false));
  qaRainIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaRainShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaRainIntensity.value) || 0) <= 0) qaRainIntensity.value = 55;
    applyQaRain(true);
    EP.pushHistory();
  });
  document.getElementById('qaRainOffBtn').addEventListener('click', () => {
    qaRainIntensity.value = 0;
    applyQaRain(false); EP.pushHistory();
  });


  // ---- 물 튀기는 효과 ---- (터짐 지점 + 방사형 물줄기 + 잔 물방울 스프레이, seed 고정 — "다시 튀기기"로 재배치)
  const qaSplashIntensity = document.getElementById('qaSplashIntensity');
  const qaSplashColor = document.getElementById('qaSplashColor');
  function applyQaSplash(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaSplashIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.splashText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.splashText) ? Math.floor(Math.random() * 100000) : t.splashText.seed;
        t.splashText = { intensity, splashColor: qaSplashColor.value || '#7fd7ff', seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSplashIntensity.addEventListener('input', () => applyQaSplash(false));
  qaSplashColor.addEventListener('input', () => applyQaSplash(false));
  qaSplashIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSplashShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaSplashIntensity.value) || 0) <= 0) qaSplashIntensity.value = 55;
    applyQaSplash(true);
    EP.pushHistory();
  });
  document.getElementById('qaSplashOffBtn').addEventListener('click', () => {
    qaSplashIntensity.value = 0;
    applyQaSplash(false); EP.pushHistory();
  });


  const qa3DDepth = document.getElementById('qa3DDepth');
  const qa3DAngle = document.getElementById('qa3DAngle');
  const qa3DColor = document.getElementById('qa3DColor');
  function applyQa3D(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const depth = parseFloat(qa3DDepth.value) || 0;
    if (depth <= 0) {
      boxes.forEach(t => { t.threeDText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const angle = parseFloat(qa3DAngle.value) || 45;
      boxes.forEach(t => {
        t.threeDText = { depth, angle, sideColor: qa3DColor.value || '#555555' };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qa3DDepth.addEventListener('input', applyQa3D);
  qa3DAngle.addEventListener('input', applyQa3D);
  qa3DColor.addEventListener('input', applyQa3D);
  qa3DDepth.addEventListener('change', () => EP.pushHistory());
  qa3DAngle.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qa3DOffBtn').addEventListener('click', () => {
    qa3DDepth.value = 0;
    applyQa3D(); EP.pushHistory();
  });


  // ---- 메탈(크롬) 효과 ---- (어두운 옆면 압출 + 은은한 빛 번짐 + 크롬 반사 그라디언트 앞면)
  const qaMetalIntensity = document.getElementById('qaMetalIntensity');
  const qaMetalDarkColor = document.getElementById('qaMetalDarkColor');
  const qaMetalLightColor = document.getElementById('qaMetalLightColor');
  const qaMetalGlowColor = document.getElementById('qaMetalGlowColor');
  // 메탈(크롬) 효과용 그라디언트 — 세로로 어두운색→밝은색→흰색 하이라이트→밝은색→어두운색 순서로
  // 여러 단계 넣어서, 크롬/금속 표면에 하늘이 비친 듯한 반사 밴드를 흉내냄
  function makeMetalGradient(t, darkColor, lightColor){
    const h = t.height || (t.fontSize || 40) * 1.2;
    return new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 0, y2: h },
      colorStops: [
        { offset: 0, color: darkColor },
        { offset: 0.32, color: lightColor },
        { offset: 0.5, color: '#ffffff' },
        { offset: 0.68, color: lightColor },
        { offset: 1, color: darkColor }
      ]
    });
  }
  function applyQaMetal(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaMetalIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.metalText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        t.metalText = {
          intensity,
          darkColor: qaMetalDarkColor.value || '#0b1f38',
          lightColor: qaMetalLightColor.value || '#7ec8ff',
          glowColor: qaMetalGlowColor.value || '#4aa8ff'
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaMetalIntensity.addEventListener('input', applyQaMetal);
  qaMetalDarkColor.addEventListener('input', applyQaMetal);
  qaMetalLightColor.addEventListener('input', applyQaMetal);
  qaMetalGlowColor.addEventListener('input', applyQaMetal);
  qaMetalIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaMetalOffBtn').addEventListener('click', () => {
    qaMetalIntensity.value = 0;
    applyQaMetal(); EP.pushHistory();
  });


  // ---- 팝아트 효과 ---- (어긋난 인쇄 색상 2겹 + 할프톤 무늬 + 굵은 검정 테두리, 무늬 seed 고정)
  const qaPopartIntensity = document.getElementById('qaPopartIntensity');
  const qaPopartMainColor = document.getElementById('qaPopartMainColor');
  const qaPopartColorA = document.getElementById('qaPopartColorA');
  const qaPopartColorB = document.getElementById('qaPopartColorB');
  function applyQaPopart(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaPopartIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.popArtText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.popArtText) ? Math.floor(Math.random() * 100000) : t.popArtText.seed;
        t.popArtText = {
          intensity, seed,
          mainColor: qaPopartMainColor.value || '#ffffff',
          colorA: qaPopartColorA.value || '#ffe600',
          colorB: qaPopartColorB.value || '#00c2ff'
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaPopartIntensity.addEventListener('input', () => applyQaPopart(false));
  qaPopartMainColor.addEventListener('input', () => applyQaPopart(false));
  qaPopartColorA.addEventListener('input', () => applyQaPopart(false));
  qaPopartColorB.addEventListener('input', () => applyQaPopart(false));
  qaPopartIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaPopartShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaPopartIntensity.value) || 0) <= 0) qaPopartIntensity.value = 55;
    applyQaPopart(true);
    EP.pushHistory();
  });
  document.getElementById('qaPopartOffBtn').addEventListener('click', () => {
    qaPopartIntensity.value = 0;
    applyQaPopart(false); EP.pushHistory();
  });


  // ---- 잉크트랩 스타일 ---- (굵은 테두리 + 윗변/아랫변 삼각 노치, 노치 배치는 seed 고정)
  const qaInktrapIntensity = document.getElementById('qaInktrapIntensity');
  const qaInktrapColor = document.getElementById('qaInktrapColor');
  function applyQaInktrap(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaInktrapIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.inkTrapText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.inkTrapText) ? Math.floor(Math.random() * 100000) : t.inkTrapText.seed;
        t.inkTrapText = { intensity, notchColor: qaInktrapColor.value || '#111111', seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaInktrapIntensity.addEventListener('input', () => applyQaInktrap(false));
  qaInktrapColor.addEventListener('input', () => applyQaInktrap(false));
  qaInktrapIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaInktrapShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaInktrapIntensity.value) || 0) <= 0) qaInktrapIntensity.value = 55;
    applyQaInktrap(true);
    EP.pushHistory();
  });
  document.getElementById('qaInktrapOffBtn').addEventListener('click', () => {
    qaInktrapIntensity.value = 0;
    applyQaInktrap(false); EP.pushHistory();
  });


  // ---- 나뭇잎 덩굴 효과 ---- (글자 가장자리에서 자라나는 덩굴+나뭇잎, 배치는 seed 고정 — "다시 자라기"로 재배치)
  const qaLeafvineIntensity = document.getElementById('qaLeafvineIntensity');
  const qaLeafvineVineColor = document.getElementById('qaLeafvineVineColor');
  const qaLeafvineLeafColorA = document.getElementById('qaLeafvineLeafColorA');
  const qaLeafvineLeafColorB = document.getElementById('qaLeafvineLeafColorB');
  function applyQaLeafvine(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaLeafvineIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.leafVineText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.leafVineText) ? Math.floor(Math.random() * 100000) : t.leafVineText.seed;
        t.leafVineText = {
          intensity, seed,
          vineColor: qaLeafvineVineColor.value || '#4a7c3f',
          leafColorA: qaLeafvineLeafColorA.value || '#5fae4a',
          leafColorB: qaLeafvineLeafColorB.value || '#8fd46a'
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaLeafvineIntensity.addEventListener('input', () => applyQaLeafvine(false));
  qaLeafvineVineColor.addEventListener('input', () => applyQaLeafvine(false));
  qaLeafvineLeafColorA.addEventListener('input', () => applyQaLeafvine(false));
  qaLeafvineLeafColorB.addEventListener('input', () => applyQaLeafvine(false));
  qaLeafvineIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaLeafvineShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaLeafvineIntensity.value) || 0) <= 0) qaLeafvineIntensity.value = 55;
    applyQaLeafvine(true);
    EP.pushHistory();
  });
  document.getElementById('qaLeafvineOffBtn').addEventListener('click', () => {
    qaLeafvineIntensity.value = 0;
    applyQaLeafvine(false); EP.pushHistory();
  });


  // ---- 벚꽃 효과 ---- (우산/여우가면/꽃문양/탄자쿠/물결무늬를 섞어서 흩뿌림, 배치는 seed 고정)
  const qaSakuraIntensity = document.getElementById('qaSakuraIntensity');
  function applyQaSakura(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaSakuraIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.sakuraText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.sakuraText) ? Math.floor(Math.random() * 100000) : t.sakuraText.seed;
        t.sakuraText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSakuraIntensity.addEventListener('input', () => applyQaSakura(false));
  qaSakuraIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSakuraShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaSakuraIntensity.value) || 0) <= 0) qaSakuraIntensity.value = 55;
    applyQaSakura(true);
    EP.pushHistory();
  });
  document.getElementById('qaSakuraOffBtn').addEventListener('click', () => {
    qaSakuraIntensity.value = 0;
    applyQaSakura(false); EP.pushHistory();
  });


  // ---- 불타는 효과 ---- (글자 위로 불꽃이 타오르고 재가 튀는 느낌, 불꽃/재 위치는 시드 고정)
  const qaFireIntensity = document.getElementById('qaFireIntensity');
  const qaFireOuterColor = document.getElementById('qaFireOuterColor');
  const qaFireInnerColor = document.getElementById('qaFireInnerColor');
  function applyQaFire(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaFireIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.fireText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.fireText) ? Math.floor(Math.random() * 100000) : t.fireText.seed;
        t.fireText = {
          intensity,
          outerColor: qaFireOuterColor.value || '#ff5500',
          innerColor: qaFireInnerColor.value || '#ffe066',
          seed
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaFireIntensity.addEventListener('input', () => applyQaFire(false));
  qaFireOuterColor.addEventListener('input', () => applyQaFire(false));
  qaFireInnerColor.addEventListener('input', () => applyQaFire(false));
  qaFireIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaFireShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaFireIntensity.value) || 0) <= 0) qaFireIntensity.value = 50;
    applyQaFire(true);
    EP.pushHistory();
  });
  document.getElementById('qaFireOffBtn').addEventListener('click', () => {
    qaFireIntensity.value = 0;
    applyQaFire(false); EP.pushHistory();
  });


  const qaRandomTypoIntensity = document.getElementById('qaRandomTypoIntensity');
  function applyQaRandomTypo(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaRandomTypoIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.randomTypo = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'randomTypo');
        t.randomTypo = { chars: generateRandomTypoChars(t.text || '', intensity) };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaRandomTypoIntensity.addEventListener('input', applyQaRandomTypo);
  qaRandomTypoIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaRandomTypoShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaRandomTypoIntensity.value) || 0) <= 0) qaRandomTypoIntensity.value = 50;
    applyQaRandomTypo();
    EP.pushHistory();
  });
  document.getElementById('qaRandomTypoOffBtn').addEventListener('click', () => {
    qaRandomTypoIntensity.value = 0;
    applyQaRandomTypo(); EP.pushHistory();
  });


  const qaCircularRadius = document.getElementById('qaCircularRadius');
  const qaCircularAngle = document.getElementById('qaCircularAngle');
  const qaCircularFlipBtn = document.getElementById('qaCircularFlipBtn');
  function applyQaCircular(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const radius = parseFloat(qaCircularRadius.value) || 0;
    if (radius <= 0) {
      boxes.forEach(t => { t.circularText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const startAngle = parseFloat(qaCircularAngle.value) || 0;
      const flip = qaCircularFlipBtn.classList.contains('on');
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'circular');
        t.circularText = { radius, startAngle, flip };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaCircularRadius.addEventListener('input', applyQaCircular);
  qaCircularAngle.addEventListener('input', applyQaCircular);
  qaCircularRadius.addEventListener('change', () => EP.pushHistory());
  qaCircularAngle.addEventListener('change', () => EP.pushHistory());
  qaCircularFlipBtn.addEventListener('click', () => {
    qaCircularFlipBtn.classList.toggle('on');
    applyQaCircular();
    EP.pushHistory();
  });
  document.getElementById('qaCircularOffBtn').addEventListener('click', () => {
    qaCircularRadius.value = 0;
    applyQaCircular(); EP.pushHistory();
  });


  // ---- 세로쓰기 ---- (한 글자씩 세로로 쌓아서 배치, 간격 게이지로 위아래 글자 사이 간격 조절)
  const qaVerticalSpacing = document.getElementById('qaVerticalSpacing');
  function applyQaVertical(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaVerticalSpacing.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.verticalText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const spacing = (parseFloat(qaVerticalSpacing.value) || 120) / 100;
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'vertical');
        t.verticalText = { spacing };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaVerticalSpacing.addEventListener('input', () => { qaVerticalSpacing.dataset.on = '1'; applyQaVertical(); });
  qaVerticalSpacing.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaVerticalOffBtn').addEventListener('click', () => {
    qaVerticalSpacing.dataset.on = '0';
    applyQaVertical(); EP.pushHistory();
  });


  // ---- 우편번호 칸 ---- (봉투 우편번호 칸처럼 글자마다 균일한 네모 칸 안에 정중앙 정렬)
  const qaPostalBoxSize = document.getElementById('qaPostalBoxSize');
  const qaPostalGap = document.getElementById('qaPostalGap');
  const qaPostalBorderWidth = document.getElementById('qaPostalBorderWidth');
  const qaPostalRadius = document.getElementById('qaPostalRadius');
  const qaPostalColor = document.getElementById('qaPostalColor');
  function applyQaPostal(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaPostalBoxSize.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.postalText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const boxScale = (parseFloat(qaPostalBoxSize.value) || 150) / 100;
      const gap = parseFloat(qaPostalGap.value) || 0;
      const borderWidth = parseFloat(qaPostalBorderWidth.value) || 0;
      const radius = parseFloat(qaPostalRadius.value) || 0;
      const borderColor = qaPostalColor.value || '#000000';
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'postal');
        t.postalText = { boxScale, gap, borderWidth, radius, borderColor };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaPostalBoxSize.addEventListener('input', () => { qaPostalBoxSize.dataset.on = '1'; applyQaPostal(); });
  qaPostalGap.addEventListener('input', () => { qaPostalBoxSize.dataset.on = '1'; applyQaPostal(); });
  qaPostalBorderWidth.addEventListener('input', () => { qaPostalBoxSize.dataset.on = '1'; applyQaPostal(); });
  qaPostalRadius.addEventListener('input', () => { qaPostalBoxSize.dataset.on = '1'; applyQaPostal(); });
  qaPostalColor.addEventListener('input', () => { qaPostalBoxSize.dataset.on = '1'; applyQaPostal(); });
  qaPostalBoxSize.addEventListener('change', () => EP.pushHistory());
  qaPostalGap.addEventListener('change', () => EP.pushHistory());
  qaPostalBorderWidth.addEventListener('change', () => EP.pushHistory());
  qaPostalRadius.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaPostalOffBtn').addEventListener('click', () => {
    qaPostalBoxSize.dataset.on = '0';
    applyQaPostal(); EP.pushHistory();
  });


  const qaPuffyIntensity = document.getElementById('qaPuffyIntensity');
  const qaPuffyPeriod = document.getElementById('qaPuffyPeriod');
  function applyQaPuffy(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const amplitude = parseFloat(qaPuffyIntensity.value) || 0;
    if (amplitude <= 0) {
      boxes.forEach(t => { t.puffyText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const period = parseFloat(qaPuffyPeriod.value) || 4;
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'puffy');
        t.puffyText = { amplitude, period };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaPuffyIntensity.addEventListener('input', applyQaPuffy);
  qaPuffyPeriod.addEventListener('input', applyQaPuffy);
  qaPuffyIntensity.addEventListener('change', () => EP.pushHistory());
  qaPuffyPeriod.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaPuffyOffBtn').addEventListener('click', () => {
    qaPuffyIntensity.value = 0;
    applyQaPuffy(); EP.pushHistory();
  });


  // ---- 나무타기(넝쿨) ---- (글자를 세로로 쌓아 올리며 좌우로 구불구불 휘어지게 함)
  const qaVineAmplitude = document.getElementById('qaVineAmplitude');
  const qaVinePeriod = document.getElementById('qaVinePeriod');
  const qaVineSpacing = document.getElementById('qaVineSpacing');
  const qaVineFlipBtn = document.getElementById('qaVineFlipBtn');
  function applyQaVine(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const amplitude = parseFloat(qaVineAmplitude.value) || 0;
    if (amplitude <= 0) {
      boxes.forEach(t => { t.vineText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const period = parseFloat(qaVinePeriod.value) || 6;
      const spacing = (parseFloat(qaVineSpacing.value) || 120) / 100;
      const flip = qaVineFlipBtn.classList.contains('on');
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'vine');
        t.vineText = { amplitude, period, spacing, flip };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaVineAmplitude.addEventListener('input', applyQaVine);
  qaVinePeriod.addEventListener('input', applyQaVine);
  qaVineSpacing.addEventListener('input', applyQaVine);
  qaVineAmplitude.addEventListener('change', () => EP.pushHistory());
  qaVinePeriod.addEventListener('change', () => EP.pushHistory());
  qaVineSpacing.addEventListener('change', () => EP.pushHistory());
  qaVineFlipBtn.addEventListener('click', () => {
    qaVineFlipBtn.classList.toggle('on');
    applyQaVine();
    EP.pushHistory();
  });
  document.getElementById('qaVineOffBtn').addEventListener('click', () => {
    qaVineAmplitude.value = 0;
    applyQaVine(); EP.pushHistory();
  });


  // ---- 데굴데굴 굴러가는 효과 ---- (글자마다 누적 회전 + 통통 튀는 바운스로 굴러가는 느낌을 냄)
  const qaRollRotate = document.getElementById('qaRollRotate');
  const qaRollBounce = document.getElementById('qaRollBounce');
  const qaRollPeriod = document.getElementById('qaRollPeriod');
  const qaRollFlipBtn = document.getElementById('qaRollFlipBtn');
  function applyQaRoll(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const rotStep = parseFloat(qaRollRotate.value) || 0;
    const bounceAmp = parseFloat(qaRollBounce.value) || 0;
    if (rotStep <= 0 && bounceAmp <= 0) {
      boxes.forEach(t => { t.rollText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const period = parseFloat(qaRollPeriod.value) || 3;
      const flip = qaRollFlipBtn.classList.contains('on');
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'roll');
        t.rollText = { rotStep, bounceAmp, period, flip };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaRollRotate.addEventListener('input', applyQaRoll);
  qaRollBounce.addEventListener('input', applyQaRoll);
  qaRollPeriod.addEventListener('input', applyQaRoll);
  qaRollRotate.addEventListener('change', () => EP.pushHistory());
  qaRollBounce.addEventListener('change', () => EP.pushHistory());
  qaRollPeriod.addEventListener('change', () => EP.pushHistory());
  qaRollFlipBtn.addEventListener('click', () => {
    qaRollFlipBtn.classList.toggle('on');
    applyQaRoll();
    EP.pushHistory();
  });
  document.getElementById('qaRollOffBtn').addEventListener('click', () => {
    qaRollRotate.value = 0;
    qaRollBounce.value = 0;
    applyQaRoll(); EP.pushHistory();
  });


  // ---- 원근법 효과 ---- (첫 글자가 가장 크고 뒤로 갈수록 작아짐, 방향 뒤집기로 반대도 가능)
  const qaPerspectiveIntensity = document.getElementById('qaPerspectiveIntensity');
  const qaPerspectiveFlipBtn = document.getElementById('qaPerspectiveFlipBtn');
  function applyQaPerspective(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaPerspectiveIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.perspectiveText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const flip = qaPerspectiveFlipBtn.classList.contains('on');
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'perspective');
        t.perspectiveText = { intensity, flip };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaPerspectiveIntensity.addEventListener('input', applyQaPerspective);
  qaPerspectiveIntensity.addEventListener('change', () => EP.pushHistory());
  qaPerspectiveFlipBtn.addEventListener('click', () => {
    qaPerspectiveFlipBtn.classList.toggle('on');
    applyQaPerspective();
    EP.pushHistory();
  });
  document.getElementById('qaPerspectiveOffBtn').addEventListener('click', () => {
    qaPerspectiveIntensity.value = 0;
    applyQaPerspective(); EP.pushHistory();
  });


  // ---- 곡선 효과 ---- (휨 정도 0=평평 ~ 100=반원(무지개), 방향 뒤집기로 위/아래 볼록 전환, 원근감 추가 가능)
  const qaCurveStrength = document.getElementById('qaCurveStrength');
  const qaCurvePerspective = document.getElementById('qaCurvePerspective');
  const qaCurveFlipBtn = document.getElementById('qaCurveFlipBtn');
  function applyQaCurve(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const strength = parseFloat(qaCurveStrength.value) || 0;
    if (strength <= 0) {
      boxes.forEach(t => { t.curveText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const perspective = parseFloat(qaCurvePerspective.value) || 0;
      const flip = qaCurveFlipBtn.classList.contains('on');
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'curve');
        t.curveText = { strength, perspective, flip };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaCurveStrength.addEventListener('input', applyQaCurve);
  qaCurvePerspective.addEventListener('input', applyQaCurve);
  qaCurveStrength.addEventListener('change', () => EP.pushHistory());
  qaCurvePerspective.addEventListener('change', () => EP.pushHistory());
  qaCurveFlipBtn.addEventListener('click', () => {
    qaCurveFlipBtn.classList.toggle('on');
    applyQaCurve();
    EP.pushHistory();
  });
  document.getElementById('qaCurveOffBtn').addEventListener('click', () => {
    qaCurveStrength.value = 0;
    applyQaCurve(); EP.pushHistory();
  });


  // ---- 물결 효과 ---- (사인파를 따라 출렁이며 배치, 원근감 추가 가능)
  const qaWaveAmplitude = document.getElementById('qaWaveAmplitude');
  const qaWavePeriod = document.getElementById('qaWavePeriod');
  const qaWavePerspective = document.getElementById('qaWavePerspective');
  function applyQaWave(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const amplitude = parseFloat(qaWaveAmplitude.value) || 0;
    if (amplitude <= 0) {
      boxes.forEach(t => { t.waveText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const period = parseFloat(qaWavePeriod.value) || 2;
      const perspective = parseFloat(qaWavePerspective.value) || 0;
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'wave');
        t.waveText = { amplitude, period, perspective };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaWaveAmplitude.addEventListener('input', applyQaWave);
  qaWavePeriod.addEventListener('input', applyQaWave);
  qaWavePerspective.addEventListener('input', applyQaWave);
  qaWaveAmplitude.addEventListener('change', () => EP.pushHistory());
  qaWavePeriod.addEventListener('change', () => EP.pushHistory());
  qaWavePerspective.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaWaveOffBtn').addEventListener('click', () => {
    qaWaveAmplitude.value = 0;
    applyQaWave(); EP.pushHistory();
  });


  // ---- 기찻길 효과 ---- (사인파를 따라 구불구불하게 배치 + 선로/바퀴를 함께 그려 기차처럼 보이게 함)
  const qaTrainAmplitude = document.getElementById('qaTrainAmplitude');
  const qaTrainPeriod = document.getElementById('qaTrainPeriod');
  const qaTrainTrackColor = document.getElementById('qaTrainTrackColor');
  function applyQaTrain(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const amplitude = parseFloat(qaTrainAmplitude.value) || 0;
    if (amplitude <= 0) {
      boxes.forEach(t => { t.trainText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const period = parseFloat(qaTrainPeriod.value) || 2;
      const trackColor = qaTrainTrackColor.value || '#5a4632';
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'train');
        t.trainText = { amplitude, period, trackColor };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaTrainAmplitude.addEventListener('input', applyQaTrain);
  qaTrainPeriod.addEventListener('input', applyQaTrain);
  qaTrainTrackColor.addEventListener('input', applyQaTrain);
  qaTrainAmplitude.addEventListener('change', () => EP.pushHistory());
  qaTrainPeriod.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaTrainOffBtn').addEventListener('click', () => {
    qaTrainAmplitude.value = 0;
    applyQaTrain(); EP.pushHistory();
  });


  // ---- 지침(흐물흐물) 효과 ---- (뒤로 갈수록 축 처지고 기울며, 힘 빠진 듯 글자마다 흔들리고 옅어짐)
  const qaTiredDroop = document.getElementById('qaTiredDroop');
  const qaTiredWobble = document.getElementById('qaTiredWobble');
  function applyQaTired(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const droop = parseFloat(qaTiredDroop.value) || 0;
    const wobble = parseFloat(qaTiredWobble.value) || 0;
    if (droop <= 0 && wobble <= 0) {
      boxes.forEach(t => { t.tiredText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'tired');
        const seed = (regenerateSeed || !t.tiredText) ? Math.floor(Math.random() * 100000) : t.tiredText.seed;
        t.tiredText = { droop, wobble, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaTiredDroop.addEventListener('input', () => applyQaTired(false));
  qaTiredWobble.addEventListener('input', () => applyQaTired(false));
  qaTiredDroop.addEventListener('change', () => EP.pushHistory());
  qaTiredWobble.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaTiredShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaTiredDroop.value) || 0) <= 0 && (parseFloat(qaTiredWobble.value) || 0) <= 0) {
      qaTiredDroop.value = 55; qaTiredWobble.value = 45;
    }
    applyQaTired(true); EP.pushHistory();
  });
  document.getElementById('qaTiredOffBtn').addEventListener('click', () => {
    qaTiredDroop.value = 0; qaTiredWobble.value = 0;
    applyQaTired(false); EP.pushHistory();
  });


  // ---- 나선(달팽이) 효과 ---- (중심에서 시작해 바깥으로 나선형으로 뻗어나감, 글자 수가 많을수록 자연히 커짐)
  const qaSpiralGrowth = document.getElementById('qaSpiralGrowth');
  const qaSpiralFlipBtn = document.getElementById('qaSpiralFlipBtn');
  function applyQaSpiral(){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const growth = parseFloat(qaSpiralGrowth.value) || 0;
    if (growth <= 0) {
      boxes.forEach(t => { t.spiralText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const flip = qaSpiralFlipBtn.classList.contains('on');
      boxes.forEach(t => {
        clearOtherLayoutEffects(t, 'spiral');
        t.spiralText = { growth, flip };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSpiralGrowth.addEventListener('input', applyQaSpiral);
  qaSpiralGrowth.addEventListener('change', () => EP.pushHistory());
  qaSpiralFlipBtn.addEventListener('click', () => {
    qaSpiralFlipBtn.classList.toggle('on');
    applyQaSpiral();
    EP.pushHistory();
  });
  document.getElementById('qaSpiralOffBtn').addEventListener('click', () => {
    qaSpiralGrowth.value = 0;
    applyQaSpiral(); EP.pushHistory();
  });


  // ---- 잡지 오려붙인 효과 ---- (글자마다 색종이 조각+다른 폰트로 오려 붙인 느낌, 배치는 seed 고정)
  const qaMagazineJitter = document.getElementById('qaMagazineJitter');
  function applyQaMagazine(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaMagazineJitter.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.magazineText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const jitter = parseFloat(qaMagazineJitter.value) || 0;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.magazineText) ? Math.floor(Math.random() * 100000) : t.magazineText.seed;
        clearOtherLayoutEffects(t, 'magazine');
        t.magazineText = { jitter, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaMagazineJitter.addEventListener('input', () => { qaMagazineJitter.dataset.on = '1'; applyQaMagazine(false); });
  qaMagazineJitter.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaMagazineShuffleBtn').addEventListener('click', () => {
    qaMagazineJitter.dataset.on = '1';
    applyQaMagazine(true);
    EP.pushHistory();
  });
  document.getElementById('qaMagazineOffBtn').addEventListener('click', () => {
    qaMagazineJitter.dataset.on = '0';
    applyQaMagazine(false); EP.pushHistory();
  });


  // ---- 퍼즐 효과 ---- (글자마다 서로 다른 색의 직소 퍼즐 조각 위에 올려서 그림, 모양/색은 seed 고정)
  const qaPuzzleIntensity = document.getElementById('qaPuzzleIntensity');
  function applyQaPuzzle(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaPuzzleIntensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.puzzleText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const intensity = parseFloat(qaPuzzleIntensity.value) || 0;
      boxes.forEach(t => {
        // 조각 모양(돌기/홈 배치)과 색상 모두 이 seed로 정해짐 — "다시 맞추기"를 눌러야 새로 섞임
        const seed = (regenerateSeed || !t.puzzleText) ? Math.floor(Math.random() * 100000) : t.puzzleText.seed;
        clearOtherLayoutEffects(t, 'puzzle');
        t.puzzleText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaPuzzleIntensity.addEventListener('input', () => { qaPuzzleIntensity.dataset.on = '1'; applyQaPuzzle(false); });
  qaPuzzleIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaPuzzleShuffleBtn').addEventListener('click', () => {
    qaPuzzleIntensity.dataset.on = '1';
    applyQaPuzzle(true);
    EP.pushHistory();
  });
  document.getElementById('qaPuzzleOffBtn').addEventListener('click', () => {
    qaPuzzleIntensity.dataset.on = '0';
    applyQaPuzzle(false); EP.pushHistory();
  });


  // ---- 하늘 위 구름 효과 ---- (뭉게구름 + 가끔 해 + 글자가 랜덤 크기/방향으로 흩어진 배치, seed 고정)
  const qaSkyDensity = document.getElementById('qaSkyDensity');
  function applyQaSky(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaSkyDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.skyText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const density = parseFloat(qaSkyDensity.value) || 60;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.skyText) ? Math.floor(Math.random() * 100000) : t.skyText.seed;
        clearOtherLayoutEffects(t, 'sky');
        t.skyText = { density, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaSkyDensity.addEventListener('input', () => { qaSkyDensity.dataset.on = '1'; applyQaSky(false); });
  qaSkyDensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaSkyShuffleBtn').addEventListener('click', () => {
    qaSkyDensity.dataset.on = '1';
    applyQaSky(true);
    EP.pushHistory();
  });
  document.getElementById('qaSkyOffBtn').addEventListener('click', () => {
    qaSkyDensity.dataset.on = '0';
    applyQaSky(false); EP.pushHistory();
  });


  // ---- 수줍수줍 효과 ---- (빗줄기 무늬 + 점 + 하트를 랜덤하게 흩뿌림, 배치는 seed 고정)
  const qaShyIntensity = document.getElementById('qaShyIntensity');
  const qaShyColor = document.getElementById('qaShyColor');
  function applyQaShy(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const intensity = parseFloat(qaShyIntensity.value) || 0;
    if (intensity <= 0) {
      boxes.forEach(t => { t.shyText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const color = qaShyColor.value || '#ffb3c6';
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.shyText) ? Math.floor(Math.random() * 100000) : t.shyText.seed;
        t.shyText = { intensity, color, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaShyIntensity.addEventListener('input', () => applyQaShy(false));
  qaShyColor.addEventListener('input', () => applyQaShy(false));
  qaShyIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaShyShuffleBtn').addEventListener('click', () => {
    if ((parseFloat(qaShyIntensity.value) || 0) <= 0) qaShyIntensity.value = 55;
    applyQaShy(true);
    EP.pushHistory();
  });
  document.getElementById('qaShyOffBtn').addEventListener('click', () => {
    qaShyIntensity.value = 0;
    applyQaShy(false); EP.pushHistory();
  });


  // ---- 칠판 글씨 효과 ---- (파랑/노랑/분홍/회색 분필색을 글자마다 랜덤 배정 + 거친 질감, seed 고정)
  const qaChalkIntensity = document.getElementById('qaChalkIntensity');
  function applyQaChalk(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaChalkIntensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.chalkText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const intensity = parseFloat(qaChalkIntensity.value) || 60;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.chalkText) ? Math.floor(Math.random() * 100000) : t.chalkText.seed;
        clearOtherLayoutEffects(t, 'chalk');
        t.chalkText = { intensity, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaChalkIntensity.addEventListener('input', () => { qaChalkIntensity.dataset.on = '1'; applyQaChalk(false); });
  qaChalkIntensity.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaChalkShuffleBtn').addEventListener('click', () => {
    qaChalkIntensity.dataset.on = '1';
    applyQaChalk(true);
    EP.pushHistory();
  });
  document.getElementById('qaChalkOffBtn').addEventListener('click', () => {
    qaChalkIntensity.dataset.on = '0';
    applyQaChalk(false); EP.pushHistory();
  });


  // ---- 휘날리는 풀밭 효과 ---- (배경으로 풀잎/보리이삭을 흩뿌림, 색은 초록 계열 선택 가능, 배치는 seed 고정)
  const qaGrassDensity = document.getElementById('qaGrassDensity');
  const qaGrassWind = document.getElementById('qaGrassWind');
  const qaGrassColor = document.getElementById('qaGrassColor');
  function applyQaGrass(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaGrassDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.grassText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const density = parseFloat(qaGrassDensity.value) || 55;
      const wind = parseFloat(qaGrassWind.value) || 55;
      const color = qaGrassColor.value || '#6fae3e';
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.grassText) ? Math.floor(Math.random() * 100000) : t.grassText.seed;
        t.grassText = { density, wind, color, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaGrassDensity.addEventListener('input', () => { qaGrassDensity.dataset.on = '1'; applyQaGrass(false); });
  qaGrassWind.addEventListener('input', () => { qaGrassDensity.dataset.on = '1'; applyQaGrass(false); });
  qaGrassColor.addEventListener('input', () => { qaGrassDensity.dataset.on = '1'; applyQaGrass(false); });
  qaGrassDensity.addEventListener('change', () => EP.pushHistory());
  qaGrassWind.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaGrassShuffleBtn').addEventListener('click', () => {
    qaGrassDensity.dataset.on = '1';
    applyQaGrass(true);
    EP.pushHistory();
  });
  document.getElementById('qaGrassOffBtn').addEventListener('click', () => {
    qaGrassDensity.dataset.on = '0';
    applyQaGrass(false); EP.pushHistory();
  });


  // ---- 빅뱅 효과 ---- (중심점에서 별들이 흩날리며 터짐, 위치/밀도/퍼짐 조절, 별 크기·색상은 랜덤)
  const qaBigbangCenterX = document.getElementById('qaBigbangCenterX');
  const qaBigbangCenterY = document.getElementById('qaBigbangCenterY');
  const qaBigbangDensity = document.getElementById('qaBigbangDensity');
  const qaBigbangSpread = document.getElementById('qaBigbangSpread');
  function applyQaBigbang(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaBigbangDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.bigbangText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const centerX = parseFloat(qaBigbangCenterX.value) || 0;
      const centerY = parseFloat(qaBigbangCenterY.value) || 0;
      const density = parseFloat(qaBigbangDensity.value) || 55;
      const spread = parseFloat(qaBigbangSpread.value) || 55;
      boxes.forEach(t => {
        // 별 하나하나의 위치·크기·색상은 seed로 정해짐 — "다시 터트리기"를 눌러야 새로 흩날림
        const seed = (regenerateSeed || !t.bigbangText) ? Math.floor(Math.random() * 100000) : t.bigbangText.seed;
        t.bigbangText = { centerX, centerY, density, spread, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaBigbangCenterX.addEventListener('input', () => { qaBigbangDensity.dataset.on = '1'; applyQaBigbang(false); });
  qaBigbangCenterY.addEventListener('input', () => { qaBigbangDensity.dataset.on = '1'; applyQaBigbang(false); });
  qaBigbangDensity.addEventListener('input', () => { qaBigbangDensity.dataset.on = '1'; applyQaBigbang(false); });
  qaBigbangSpread.addEventListener('input', () => { qaBigbangDensity.dataset.on = '1'; applyQaBigbang(false); });
  qaBigbangCenterX.addEventListener('change', () => EP.pushHistory());
  qaBigbangCenterY.addEventListener('change', () => EP.pushHistory());
  qaBigbangDensity.addEventListener('change', () => EP.pushHistory());
  qaBigbangSpread.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaBigbangShuffleBtn').addEventListener('click', () => {
    qaBigbangDensity.dataset.on = '1';
    applyQaBigbang(true);
    EP.pushHistory();
  });
  document.getElementById('qaBigbangOffBtn').addEventListener('click', () => {
    qaBigbangDensity.dataset.on = '0';
    applyQaBigbang(false); EP.pushHistory();
  });


  // ---- 축포 효과 ---- (폭죽 여러 발 + 색색 리본 + 오색 별/색종이, 밀도/퍼짐 조절, 배치는 전부 랜덤)
  const qaEventDensity = document.getElementById('qaEventDensity');
  const qaEventSpread = document.getElementById('qaEventSpread');
  function applyQaEvent(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaEventDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.eventText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const density = parseFloat(qaEventDensity.value) || 55;
      const spread = parseFloat(qaEventSpread.value) || 55;
      boxes.forEach(t => {
        // 폭죽/리본/별의 위치·크기·색상은 seed로 정해짐 — "다시 터트리기"를 눌러야 새로 흩날림
        const seed = (regenerateSeed || !t.eventText) ? Math.floor(Math.random() * 100000) : t.eventText.seed;
        t.eventText = { density, spread, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaEventDensity.addEventListener('input', () => { qaEventDensity.dataset.on = '1'; applyQaEvent(false); });
  qaEventSpread.addEventListener('input', () => { qaEventDensity.dataset.on = '1'; applyQaEvent(false); });
  qaEventDensity.addEventListener('change', () => EP.pushHistory());
  qaEventSpread.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaEventShuffleBtn').addEventListener('click', () => {
    qaEventDensity.dataset.on = '1';
    applyQaEvent(true);
    EP.pushHistory();
  });
  document.getElementById('qaEventOffBtn').addEventListener('click', () => {
    qaEventDensity.dataset.on = '0';
    applyQaEvent(false); EP.pushHistory();
  });


  // ---- 골프 효과 ---- (잔디 필드+홀/깃발+스윙하는 골퍼들+날아가는 골프공, 밀도/퍼짐 조절)
  const qaGolfDensity = document.getElementById('qaGolfDensity');
  const qaGolfSpread = document.getElementById('qaGolfSpread');
  function applyQaGolf(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaGolfDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.golfText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const density = parseFloat(qaGolfDensity.value) || 55;
      const spread = parseFloat(qaGolfSpread.value) || 55;
      boxes.forEach(t => {
        // 골퍼 위치·공 궤적은 seed로 정해짐 — "다시 치기"를 눌러야 새로 배치됨
        const seed = (regenerateSeed || !t.golfText) ? Math.floor(Math.random() * 100000) : t.golfText.seed;
        t.golfText = { density, spread, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaGolfDensity.addEventListener('input', () => { qaGolfDensity.dataset.on = '1'; applyQaGolf(false); });
  qaGolfSpread.addEventListener('input', () => { qaGolfDensity.dataset.on = '1'; applyQaGolf(false); });
  qaGolfDensity.addEventListener('change', () => EP.pushHistory());
  qaGolfSpread.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaGolfShuffleBtn').addEventListener('click', () => {
    qaGolfDensity.dataset.on = '1';
    applyQaGolf(true);
    EP.pushHistory();
  });
  document.getElementById('qaGolfOffBtn').addEventListener('click', () => {
    qaGolfDensity.dataset.on = '0';
    applyQaGolf(false); EP.pushHistory();
  });


  // ---- 크리스마스 효과 ---- (장식볼/별/종/지팡이사탕/선물상자를 글자 주변에 무작위 크기·방향으로 흩뿌림, 밀도/퍼짐 조절)
  const qaChristmasDensity = document.getElementById('qaChristmasDensity');
  const qaChristmasSpread = document.getElementById('qaChristmasSpread');
  function applyQaChristmas(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaChristmasDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.christmasText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const density = parseFloat(qaChristmasDensity.value) || 55;
      const spread = parseFloat(qaChristmasSpread.value) || 55;
      boxes.forEach(t => {
        // 장식 위치·종류·크기·회전은 seed로 정해짐 — "다시 걸기"를 눌러야 새로 배치됨
        const seed = (regenerateSeed || !t.christmasText) ? Math.floor(Math.random() * 100000) : t.christmasText.seed;
        t.christmasText = { density, spread, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaChristmasDensity.addEventListener('input', () => { qaChristmasDensity.dataset.on = '1'; applyQaChristmas(false); });
  qaChristmasSpread.addEventListener('input', () => { qaChristmasDensity.dataset.on = '1'; applyQaChristmas(false); });
  qaChristmasDensity.addEventListener('change', () => EP.pushHistory());
  qaChristmasSpread.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaChristmasShuffleBtn').addEventListener('click', () => {
    qaChristmasDensity.dataset.on = '1';
    applyQaChristmas(true);
    EP.pushHistory();
  });
  document.getElementById('qaChristmasOffBtn').addEventListener('click', () => {
    qaChristmasDensity.dataset.on = '0';
    applyQaChristmas(false); EP.pushHistory();
  });


  // ---- 가을 효과 ---- (단풍잎/은행잎을 갈색·붉은·검붉은 계열로 글자 주변에 무작위 크기·방향으로 흩뿌림, 밀도/퍼짐 조절)
  const qaAutumnDensity = document.getElementById('qaAutumnDensity');
  const qaAutumnSpread = document.getElementById('qaAutumnSpread');
  function applyQaAutumn(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaAutumnDensity.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.autumnText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const density = parseFloat(qaAutumnDensity.value) || 55;
      const spread = parseFloat(qaAutumnSpread.value) || 55;
      boxes.forEach(t => {
        // 잎사귀 위치·종류·크기·회전·색상은 seed로 정해짐 — "다시 흩뿌리기"를 눌러야 새로 배치됨
        const seed = (regenerateSeed || !t.autumnText) ? Math.floor(Math.random() * 100000) : t.autumnText.seed;
        t.autumnText = { density, spread, seed };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaAutumnDensity.addEventListener('input', () => { qaAutumnDensity.dataset.on = '1'; applyQaAutumn(false); });
  qaAutumnSpread.addEventListener('input', () => { qaAutumnDensity.dataset.on = '1'; applyQaAutumn(false); });
  qaAutumnDensity.addEventListener('change', () => EP.pushHistory());
  qaAutumnSpread.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaAutumnShuffleBtn').addEventListener('click', () => {
    qaAutumnDensity.dataset.on = '1';
    applyQaAutumn(true);
    EP.pushHistory();
  });
  document.getElementById('qaAutumnOffBtn').addEventListener('click', () => {
    qaAutumnDensity.dataset.on = '0';
    applyQaAutumn(false); EP.pushHistory();
  });


  // ---- 새로 추가한 흩뿌리기형 효과 10종 공용 UI 배선 ----
  // 밀도/퍼짐 슬라이더 2개 + 끄기/다시뿌리기 버튼 조합이 완전히 똑같은 패턴이라
  // (관례상 id: qa{Prefix}Density, qa{Prefix}Spread, qa{Prefix}OffBtn, qa{Prefix}ShuffleBtn)
  // 한 번에 배선해주는 헬퍼로 처리함. apply/populate 함수를 반환해서 registerFilter에 그대로 넘김.
  function setupScatterFilterUI(prefix, cfgKey){
    const densityEl = document.getElementById('qa' + prefix + 'Density');
    const spreadEl = document.getElementById('qa' + prefix + 'Spread');
    function apply(regenerateSeed){
      const boxes = EP.qaTargets.filter(EP.isTextObject);
      if (!boxes.length) return;
      const on = densityEl.dataset.on === '1';
      if (!on) {
        boxes.forEach(t => { t[cfgKey] = null; t.dirty = true; maybeUnpatchRender(t); });
      } else {
        const density = parseFloat(densityEl.value) || 55;
        const spread = parseFloat(spreadEl.value) || 55;
        boxes.forEach(t => {
          const seed = (regenerateSeed || !t[cfgKey]) ? Math.floor(Math.random() * 100000) : t[cfgKey].seed;
          t[cfgKey] = { density, spread, seed };
          patchUnifiedRender(t);
          t.dirty = true;
        });
      }
      EP.canvas.requestRenderAll();
    }
    function populate(anchor){
      const cfg = anchor[cfgKey];
      densityEl.value = cfg ? (cfg.density != null ? cfg.density : 55) : 55;
      spreadEl.value = cfg ? (cfg.spread != null ? cfg.spread : 55) : 55;
      densityEl.dataset.on = cfg ? '1' : '0';
    }
    densityEl.addEventListener('input', () => { densityEl.dataset.on = '1'; apply(false); });
    spreadEl.addEventListener('input', () => { densityEl.dataset.on = '1'; apply(false); });
    densityEl.addEventListener('change', () => EP.pushHistory());
    spreadEl.addEventListener('change', () => EP.pushHistory());
    const shuffleBtn = document.getElementById('qa' + prefix + 'ShuffleBtn');
    if (shuffleBtn) shuffleBtn.addEventListener('click', () => { densityEl.dataset.on = '1'; apply(true); EP.pushHistory(); });
    const offBtn = document.getElementById('qa' + prefix + 'OffBtn');
    if (offBtn) offBtn.addEventListener('click', () => { densityEl.dataset.on = '0'; apply(false); EP.pushHistory(); });
    return { apply: apply, populate: populate };
  }
  const spaceUI = setupScatterFilterUI('Space', 'spaceText');
  const doodleUI = setupScatterFilterUI('Doodle', 'doodleText');
  const butterflyUI = setupScatterFilterUI('Butterfly', 'butterflyText');
  const soapbubbleUI = setupScatterFilterUI('Soapbubble', 'soapbubbleText');
  const lightningUI = setupScatterFilterUI('Lightning', 'lightningText');
  const halloweenUI = setupScatterFilterUI('Halloween', 'halloweenText');
  const musicnoteUI = setupScatterFilterUI('Musicnote', 'musicnoteText');
  const gemUI = setupScatterFilterUI('Gem', 'gemText');
  const tropicalUI = setupScatterFilterUI('Tropical', 'tropicalText');
  const candyUI = setupScatterFilterUI('Candy', 'candyText');


  // ---- 말풍선 배경 ---- (매번 다른 삐뚤빼뚤한 윤곽 + 꼬리, 모양은 seed로 고정 — "다시 뽑기"로 재배치)
  const qaBubblePadding = document.getElementById('qaBubblePadding');
  const qaBubbleFillColor = document.getElementById('qaBubbleFillColor');
  const qaBubbleStrokeColor = document.getElementById('qaBubbleStrokeColor');
  const qaBubbleStrokeWidth = document.getElementById('qaBubbleStrokeWidth');
  function applyQaBubble(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaBubblePadding.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.bubbleText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const padding = parseFloat(qaBubblePadding.value) || 18;
      const strokeWidth = parseFloat(qaBubbleStrokeWidth.value) || 0;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.bubbleText) ? Math.floor(Math.random() * 100000) : t.bubbleText.seed;
        t.bubbleText = {
          padding, strokeWidth, seed,
          fillColor: qaBubbleFillColor.value || '#ffffff',
          strokeColor: qaBubbleStrokeColor.value || '#222222'
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaBubblePadding.addEventListener('input', () => { qaBubblePadding.dataset.on = '1'; applyQaBubble(false); });
  qaBubbleFillColor.addEventListener('input', () => { qaBubblePadding.dataset.on = '1'; applyQaBubble(false); });
  qaBubbleStrokeColor.addEventListener('input', () => { qaBubblePadding.dataset.on = '1'; applyQaBubble(false); });
  qaBubbleStrokeWidth.addEventListener('input', () => { qaBubblePadding.dataset.on = '1'; applyQaBubble(false); });
  qaBubblePadding.addEventListener('change', () => EP.pushHistory());
  qaBubbleStrokeWidth.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaBubbleShuffleBtn').addEventListener('click', () => {
    qaBubblePadding.dataset.on = '1';
    applyQaBubble(true);
    EP.pushHistory();
  });
  document.getElementById('qaBubbleOffBtn').addEventListener('click', () => {
    qaBubblePadding.dataset.on = '0';
    applyQaBubble(false); EP.pushHistory();
  });


  // ---- 얼룩말 무늬 ---- (글자 영역 위에 두께·각도·위치가 제각각인 얇은 줄무늬를 흩뿌림)
  const qaZebraCount = document.getElementById('qaZebraCount');
  const qaZebraMaxThickness = document.getElementById('qaZebraMaxThickness');
  const qaZebraColorA = document.getElementById('qaZebraColorA');
  const qaZebraColorB = document.getElementById('qaZebraColorB');
  function applyQaZebra(regenerateSeed){
    const boxes = EP.qaTargets.filter(EP.isTextObject);
    if (!boxes.length) return;
    const on = qaZebraCount.dataset.on === '1';
    if (!on) {
      boxes.forEach(t => { t.zebraText = null; t.dirty = true; maybeUnpatchRender(t); });
    } else {
      const count = parseFloat(qaZebraCount.value) || 10;
      const maxThickness = parseFloat(qaZebraMaxThickness.value) || 6;
      boxes.forEach(t => {
        const seed = (regenerateSeed || !t.zebraText) ? Math.floor(Math.random() * 100000) : t.zebraText.seed;
        t.zebraText = {
          count, maxThickness, seed,
          colorA: qaZebraColorA.value || '#111111',
          colorB: qaZebraColorB.value || '#ffffff'
        };
        patchUnifiedRender(t);
        t.dirty = true;
      });
    }
    EP.canvas.requestRenderAll();
  }
  qaZebraCount.addEventListener('input', () => { qaZebraCount.dataset.on = '1'; applyQaZebra(false); });
  qaZebraMaxThickness.addEventListener('input', () => { qaZebraCount.dataset.on = '1'; applyQaZebra(false); });
  qaZebraColorA.addEventListener('input', () => { qaZebraCount.dataset.on = '1'; applyQaZebra(false); });
  qaZebraColorB.addEventListener('input', () => { qaZebraCount.dataset.on = '1'; applyQaZebra(false); });
  qaZebraCount.addEventListener('change', () => EP.pushHistory());
  qaZebraMaxThickness.addEventListener('change', () => EP.pushHistory());
  document.getElementById('qaZebraShuffleBtn').addEventListener('click', () => {
    qaZebraCount.dataset.on = '1';
    applyQaZebra(true);
    EP.pushHistory();
  });
  document.getElementById('qaZebraOffBtn').addEventListener('click', () => {
    qaZebraCount.dataset.on = '0';
    applyQaZebra(false); EP.pushHistory();
  });



  // ---- 게이지 되돌리기(populate) 함수들 ----
  function populate_light(anchor){
        const light = anchor.lightText;
        qaLightIntensity.value = light ? (light.intensity || 0) : 0;
        qaLightScale.value = light ? (light.scale != null ? light.scale : 100) : 100;
        qaLightAngle.value = light ? (light.angle != null ? light.angle : 315) : 315;
        qaLightOffsetX.value = light ? (light.offsetX || 0) : 0;
        qaLightHaloWidth.value = light ? (light.haloWidth != null ? light.haloWidth : 50) : 50;
        qaLightHaloCount.value = light ? (light.haloCount || 0) : 0;
        qaLightColor.value = light ? (EP.toHex(light.color) || '#ffc233') : '#ffc233';
  }
  function populate_doubleOutline(anchor){
        const dbl = anchor.doubleOutline;
        qaDblInnerWidth.value = dbl ? (dbl.innerWidth || 0) : 0;
        qaDblInnerColor.value = dbl ? (EP.toHex(dbl.innerColor) || '#ffffff') : '#ffffff';
        qaDblOuterWidth.value = dbl ? (dbl.outerWidth || 0) : 0;
        qaDblOuterColor.value = dbl ? (EP.toHex(dbl.outerColor) || '#000000') : '#000000';
  }
  function populate_glitch(anchor){
        const glitch = anchor.glitchText;
        qaGlitchAmount.value = glitch ? (glitch.amount || 0) : 0;
        qaGlitchMode = glitch ? (glitch.mode || 'horizontal') : 'horizontal';
        qaGlitchModeBtns.forEach(o => o.classList.toggle('on', o.dataset.mode === qaGlitchMode));
  }
  function populate_tear(anchor){
        const tear = anchor.tearText;
        qaTearStrips.value = tear ? (tear.strips || 6) : 6;
        qaTearGap.value = tear ? (tear.gap || 0) : 0;
        qaTearRotate.value = tear ? (tear.rotate || 0) : 0;
        qaTearDirection = tear ? (tear.direction || 'random') : 'random';
        qaTearDirectionBtns.forEach(o => o.classList.toggle('on', o.dataset.dir === qaTearDirection));
  }
  function populate_melt(anchor){
        const melt = anchor.meltText;
        qaMeltAmount.value = melt ? (melt.amount || 0) : 0;
        qaMeltDrips.value = melt ? (melt.drips != null ? melt.drips : 6) : 6;
  }
  function populate_speed(anchor){
        const speed = anchor.speedText;
        qaSpeedIntensity.value = speed ? (speed.intensity || 0) : 0;
        qaSpeedDustColor.value = speed ? (EP.toHex(speed.dustColor) || '#8a6a45') : '#8a6a45';
  }
  function populate_reflection(anchor){
        const reflection = anchor.reflectionText;
        qaReflectionIntensity.value = reflection ? (reflection.intensity || 0) : 0;
        qaReflectionBlur.value = reflection ? (reflection.blur != null ? reflection.blur : 4) : 4;
        qaReflectionGap.value = reflection ? (reflection.gap != null ? reflection.gap : 0) : 0;
  }
  function populate_crack(anchor){
        const crack = anchor.crackText;
        qaCrackIntensity.value = crack ? (crack.intensity || 0) : 0;
        qaCrackColor.value = crack ? (EP.toHex(crack.crackColor) || '#ffffff') : '#ffffff';
  }
  function populate_tile(anchor){
        const tile = anchor.tileText;
        qaTileIntensity.value = tile ? (tile.intensity || 0) : 0;
  }
  function populate_footprint(anchor){
        const footprint = anchor.footprintText;
        qaFootprintIntensity.value = footprint ? (footprint.intensity || 0) : 0;
  }
  function populate_animal(anchor){
        const animal = anchor.animalText;
        qaAnimalIntensity.value = animal ? (animal.intensity || 0) : 0;
  }
  function populate_seafood(anchor){
        const seafood = anchor.seafoodText;
        qaSeafoodIntensity.value = seafood ? (seafood.intensity || 0) : 0;
  }
  function populate_fruitveg(anchor){
        const fruitVeg = anchor.fruitVegText;
        qaFruitVegIntensity.value = fruitVeg ? (fruitVeg.intensity || 0) : 0;
  }
  function populate_heart(anchor){
        const heart = anchor.heartText;
        qaHeartIntensity.value = heart ? (heart.intensity || 0) : 0;
  }
  function populate_coffee(anchor){
        const coffee = anchor.coffeeText;
        qaCoffeeIntensity.value = coffee ? (coffee.intensity || 0) : 0;
  }
  function populate_sports(anchor){
        const sports = anchor.sportsText;
        qaSportsIntensity.value = sports ? (sports.intensity || 0) : 0;
  }
  function populate_club(anchor){
        const club = anchor.clubText;
        qaClubIntensity.value = club ? (club.intensity || 0) : 0;
  }
  function populate_snow(anchor){
        const snow = anchor.snowText;
        qaSnowIntensity.value = snow ? (snow.intensity || 0) : 0;
        const snowShowPile = snow ? (snow.showPile !== false) : true;
        qaSnowPileToggleBtn.classList.toggle('on', snowShowPile);
        qaSnowPileToggleBtn.textContent = snowShowPile ? '쌓인눈 표시중' : '쌓인눈 숨김';
  }
  function populate_rain(anchor){
        const rain = anchor.rainText;
        qaRainIntensity.value = rain ? (rain.intensity || 0) : 0;
        qaRainColor.value = rain ? (EP.toHex(rain.rainColor) || '#bcdfff') : '#bcdfff';
  }
  function populate_splash(anchor){
        const splash = anchor.splashText;
        qaSplashIntensity.value = splash ? (splash.intensity || 0) : 0;
        qaSplashColor.value = splash ? (EP.toHex(splash.splashColor) || '#7fd7ff') : '#7fd7ff';
  }
  function populate_threeD(anchor){
        const t3d = anchor.threeDText;
        qa3DDepth.value = t3d ? (t3d.depth || 0) : 0;
        qa3DAngle.value = t3d ? (t3d.angle != null ? t3d.angle : 45) : 45;
        qa3DColor.value = t3d ? (EP.toHex(t3d.sideColor) || '#555555') : '#555555';
  }
  function populate_metal(anchor){
        const metal = anchor.metalText;
        qaMetalIntensity.value = metal ? (metal.intensity || 0) : 0;
        qaMetalDarkColor.value = metal ? (EP.toHex(metal.darkColor) || '#0b1f38') : '#0b1f38';
        qaMetalLightColor.value = metal ? (EP.toHex(metal.lightColor) || '#7ec8ff') : '#7ec8ff';
        qaMetalGlowColor.value = metal ? (EP.toHex(metal.glowColor) || '#4aa8ff') : '#4aa8ff';
  }
  function populate_popart(anchor){
        const popart = anchor.popArtText;
        qaPopartIntensity.value = popart ? (popart.intensity || 0) : 0;
        qaPopartMainColor.value = popart ? (EP.toHex(popart.mainColor) || '#ffffff') : '#ffffff';
        qaPopartColorA.value = popart ? (EP.toHex(popart.colorA) || '#ffe600') : '#ffe600';
        qaPopartColorB.value = popart ? (EP.toHex(popart.colorB) || '#00c2ff') : '#00c2ff';
  }
  function populate_inktrap(anchor){
        const inktrap = anchor.inkTrapText;
        qaInktrapIntensity.value = inktrap ? (inktrap.intensity || 0) : 0;
        qaInktrapColor.value = inktrap ? (EP.toHex(inktrap.notchColor) || '#111111') : '#111111';
  }
  function populate_leafvine(anchor){
        const leafvine = anchor.leafVineText;
        qaLeafvineIntensity.value = leafvine ? (leafvine.intensity || 0) : 0;
        qaLeafvineVineColor.value = leafvine ? (EP.toHex(leafvine.vineColor) || '#4a7c3f') : '#4a7c3f';
        qaLeafvineLeafColorA.value = leafvine ? (EP.toHex(leafvine.leafColorA) || '#5fae4a') : '#5fae4a';
        qaLeafvineLeafColorB.value = leafvine ? (EP.toHex(leafvine.leafColorB) || '#8fd46a') : '#8fd46a';
  }
  function populate_sakura(anchor){
        const sakura = anchor.sakuraText;
        qaSakuraIntensity.value = sakura ? (sakura.intensity || 0) : 0;
  }
  function populate_fire(anchor){
        const fire = anchor.fireText;
        qaFireIntensity.value = fire ? (fire.intensity || 0) : 0;
        qaFireOuterColor.value = fire ? (EP.toHex(fire.outerColor) || '#ff5500') : '#ff5500';
        qaFireInnerColor.value = fire ? (EP.toHex(fire.innerColor) || '#ffe066') : '#ffe066';
  }
  function populate_randomTypo(anchor){
        qaRandomTypoIntensity.value = (anchor.randomTypo && anchor.randomTypo.chars && anchor.randomTypo.chars.length) ? 50 : 0;
  }
  function populate_circular(anchor){
        const circ = anchor.circularText;
        qaCircularRadius.value = circ ? (circ.radius || 0) : 0;
        qaCircularAngle.value = circ ? (circ.startAngle || 0) : 0;
        qaCircularFlipBtn.classList.toggle('on', !!(circ && circ.flip));
  }
  function populate_vertical(anchor){
        const vert = anchor.verticalText;
        qaVerticalSpacing.value = vert ? Math.round((vert.spacing || 1.2) * 100) : 120;
        qaVerticalSpacing.dataset.on = vert ? '1' : '0';
  }
  function populate_postal(anchor){
        const postal = anchor.postalText;
        qaPostalBoxSize.value = postal ? Math.round((postal.boxScale || 1.5) * 100) : 150;
        qaPostalGap.value = postal ? (postal.gap != null ? postal.gap : 14) : 14;
        qaPostalBorderWidth.value = postal ? (postal.borderWidth != null ? postal.borderWidth : 2) : 2;
        qaPostalRadius.value = postal ? (postal.radius != null ? postal.radius : 0) : 0;
        qaPostalColor.value = postal ? (EP.toHex(postal.borderColor) || '#000000') : '#000000';
        qaPostalBoxSize.dataset.on = postal ? '1' : '0';
  }
  function populate_puffy(anchor){
        const puf = anchor.puffyText;
        qaPuffyIntensity.value = puf ? (puf.amplitude || 0) : 0;
        qaPuffyPeriod.value = puf ? (puf.period || 4) : 4;
  }
  function populate_vine(anchor){
        const vine = anchor.vineText;
        qaVineAmplitude.value = vine ? (vine.amplitude || 0) : 0;
        qaVinePeriod.value = vine ? (vine.period || 6) : 6;
        qaVineSpacing.value = vine ? Math.round((vine.spacing || 1.2) * 100) : 120;
        qaVineFlipBtn.classList.toggle('on', !!(vine && vine.flip));
  }
  function populate_roll(anchor){
        const roll = anchor.rollText;
        qaRollRotate.value = roll ? (roll.rotStep != null ? roll.rotStep : 35) : 35;
        qaRollBounce.value = roll ? (roll.bounceAmp != null ? roll.bounceAmp : 12) : 12;
        qaRollPeriod.value = roll ? (roll.period || 3) : 3;
        qaRollFlipBtn.classList.toggle('on', !!(roll && roll.flip));
  }
  function populate_perspective(anchor){
        const persp = anchor.perspectiveText;
        qaPerspectiveIntensity.value = persp ? (persp.intensity || 0) : 0;
        qaPerspectiveFlipBtn.classList.toggle('on', !!(persp && persp.flip));
  }
  function populate_curve(anchor){
        const curve = anchor.curveText;
        qaCurveStrength.value = curve ? (curve.strength || 0) : 0;
        qaCurvePerspective.value = curve ? (curve.perspective || 0) : 0;
        qaCurveFlipBtn.classList.toggle('on', !!(curve && curve.flip));
  }
  function populate_wave(anchor){
        const wave = anchor.waveText;
        qaWaveAmplitude.value = wave ? (wave.amplitude || 0) : 0;
        qaWavePeriod.value = wave ? (wave.period || 2) : 2;
        qaWavePerspective.value = wave ? (wave.perspective || 0) : 0;
  }
  function populate_train(anchor){
        const train = anchor.trainText;
        qaTrainAmplitude.value = train ? (train.amplitude || 0) : 0;
        qaTrainPeriod.value = train ? (train.period || 2) : 2;
        qaTrainTrackColor.value = train ? (EP.toHex(train.trackColor) || '#5a4632') : '#5a4632';
  }
  function populate_tired(anchor){
        const tired = anchor.tiredText;
        qaTiredDroop.value = tired ? (tired.droop || 0) : 0;
        qaTiredWobble.value = tired ? (tired.wobble || 0) : 0;
  }
  function populate_spiral(anchor){
        const spiral = anchor.spiralText;
        qaSpiralGrowth.value = spiral ? (spiral.growth != null ? spiral.growth : 6) : 6;
        qaSpiralFlipBtn.classList.toggle('on', !!(spiral && spiral.flip));
  }
  function populate_magazine(anchor){
        const magazine = anchor.magazineText;
        qaMagazineJitter.value = magazine ? (magazine.jitter != null ? magazine.jitter : 60) : 60;
        qaMagazineJitter.dataset.on = magazine ? '1' : '0';
  }
  function populate_puzzle(anchor){
        const puzzle = anchor.puzzleText;
        qaPuzzleIntensity.value = puzzle ? (puzzle.intensity != null ? puzzle.intensity : 60) : 60;
        qaPuzzleIntensity.dataset.on = puzzle ? '1' : '0';
  }
  function populate_sky(anchor){
        const sky = anchor.skyText;
        qaSkyDensity.value = sky ? (sky.density != null ? sky.density : 60) : 60;
        qaSkyDensity.dataset.on = sky ? '1' : '0';
  }
  function populate_shy(anchor){
        const shy = anchor.shyText;
        qaShyIntensity.value = shy ? (shy.intensity || 0) : 0;
        qaShyColor.value = shy ? (EP.toHex(shy.color) || '#ffb3c6') : '#ffb3c6';
  }
  function populate_chalk(anchor){
        const chalk = anchor.chalkText;
        qaChalkIntensity.value = chalk ? (chalk.intensity != null ? chalk.intensity : 60) : 60;
        qaChalkIntensity.dataset.on = chalk ? '1' : '0';
  }
  function populate_grass(anchor){
        const grass = anchor.grassText;
        qaGrassDensity.value = grass ? (grass.density != null ? grass.density : 55) : 55;
        qaGrassWind.value = grass ? (grass.wind != null ? grass.wind : 55) : 55;
        qaGrassColor.value = grass ? (EP.toHex(grass.color) || '#6fae3e') : '#6fae3e';
        qaGrassDensity.dataset.on = grass ? '1' : '0';
  }
  function populate_bigbang(anchor){
        const bigbang = anchor.bigbangText;
        qaBigbangCenterX.value = bigbang ? (bigbang.centerX || 0) : 0;
        qaBigbangCenterY.value = bigbang ? (bigbang.centerY || 0) : 0;
        qaBigbangDensity.value = bigbang ? (bigbang.density != null ? bigbang.density : 55) : 55;
        qaBigbangSpread.value = bigbang ? (bigbang.spread != null ? bigbang.spread : 55) : 55;
        qaBigbangDensity.dataset.on = bigbang ? '1' : '0';
  }
  function populate_event(anchor){
        const ev = anchor.eventText;
        qaEventDensity.value = ev ? (ev.density != null ? ev.density : 55) : 55;
        qaEventSpread.value = ev ? (ev.spread != null ? ev.spread : 55) : 55;
        qaEventDensity.dataset.on = ev ? '1' : '0';
  }
  function populate_golf(anchor){
        const golf = anchor.golfText;
        qaGolfDensity.value = golf ? (golf.density != null ? golf.density : 55) : 55;
        qaGolfSpread.value = golf ? (golf.spread != null ? golf.spread : 55) : 55;
        qaGolfDensity.dataset.on = golf ? '1' : '0';
  }
  function populate_christmas(anchor){
        const xmas = anchor.christmasText;
        qaChristmasDensity.value = xmas ? (xmas.density != null ? xmas.density : 55) : 55;
        qaChristmasSpread.value = xmas ? (xmas.spread != null ? xmas.spread : 55) : 55;
        qaChristmasDensity.dataset.on = xmas ? '1' : '0';
  }
  function populate_autumn(anchor){
        const autumn = anchor.autumnText;
        qaAutumnDensity.value = autumn ? (autumn.density != null ? autumn.density : 55) : 55;
        qaAutumnSpread.value = autumn ? (autumn.spread != null ? autumn.spread : 55) : 55;
        qaAutumnDensity.dataset.on = autumn ? '1' : '0';
  }
  function populate_bubble(anchor){
        const bubble = anchor.bubbleText;
        qaBubblePadding.value = bubble ? (bubble.padding != null ? bubble.padding : 18) : 18;
        qaBubblePadding.dataset.on = bubble ? '1' : '0';
        qaBubbleFillColor.value = bubble ? (EP.toHex(bubble.fillColor) || '#ffffff') : '#ffffff';
        qaBubbleStrokeColor.value = bubble ? (EP.toHex(bubble.strokeColor) || '#222222') : '#222222';
        qaBubbleStrokeWidth.value = bubble ? (bubble.strokeWidth != null ? bubble.strokeWidth : 3) : 3;
  }
  function populate_zebra(anchor){
        const zebra = anchor.zebraText;
        qaZebraCount.value = zebra ? (zebra.count || 10) : 10;
        qaZebraCount.dataset.on = zebra ? '1' : '0';
        qaZebraMaxThickness.value = zebra ? (zebra.maxThickness != null ? zebra.maxThickness : 6) : 6;
        qaZebraColorA.value = zebra ? (EP.toHex(zebra.colorA) || '#111111') : '#111111';
        qaZebraColorB.value = zebra ? (EP.toHex(zebra.colorB) || '#ffffff') : '#ffffff';
  }

  // ---- 필터 레지스트리 등록 ----
  EP.registerFilter({
    id: 'light', label: '광원 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaLight, randomize: function(){ var b=document.getElementById('qaLightShuffleBtn'); if(b) b.click(); }, populate: populate_light
  });
  EP.registerFilter({
    id: 'doubleOutline', label: '이중테두리', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaDoubleOutline, randomize: null, populate: populate_doubleOutline
  });
  EP.registerFilter({
    id: 'glitch', label: '글리치', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaGlitch, randomize: function(){ var b=document.getElementById('qaGlitchShuffleBtn'); if(b) b.click(); }, populate: populate_glitch
  });
  EP.registerFilter({
    id: 'tear', label: '찢기', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaTear, randomize: function(){ var b=document.getElementById('qaTearShuffleBtn'); if(b) b.click(); }, populate: populate_tear
  });
  EP.registerFilter({
    id: 'melt', label: '녹아 늘러붙은 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaMelt, randomize: function(){ var b=document.getElementById('qaMeltShuffleBtn'); if(b) b.click(); }, populate: populate_melt
  });
  EP.registerFilter({
    id: 'speed', label: '스피드 잔상', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaSpeed, randomize: function(){ var b=document.getElementById('qaSpeedShuffleBtn'); if(b) b.click(); }, populate: populate_speed
  });
  EP.registerFilter({
    id: 'reflection', label: '거울 반사', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaReflection,
    randomize: function(){
      qaReflectionIntensity.value = Math.round(35 + Math.random() * 55);
      qaReflectionBlur.value = Math.round(Math.random() * 10);
      qaReflectionGap.value = Math.round(Math.random() * 40 - 20);
      applyQaReflection();
      EP.pushHistory();
    },
    populate: populate_reflection
  });
  EP.registerFilter({
    id: 'crack', label: '유리 깨짐', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaCrack, randomize: function(){ var b=document.getElementById('qaCrackShuffleBtn'); if(b) b.click(); }, populate: populate_crack
  });
  EP.registerFilter({
    id: 'tile', label: '타일무늬', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaTile, randomize: function(){ var b=document.getElementById('qaTileShuffleBtn'); if(b) b.click(); }, populate: populate_tile
  });
  EP.registerFilter({
    id: 'footprint', label: '테마 장식', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaFootprint, randomize: function(){ var b=document.getElementById('qaFootprintShuffleBtn'); if(b) b.click(); }, populate: populate_footprint
  });
  EP.registerFilter({
    id: 'animal', label: '귀여운 동물', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaAnimal, randomize: function(){ var b=document.getElementById('qaAnimalShuffleBtn'); if(b) b.click(); }, populate: populate_animal
  });
  EP.registerFilter({
    id: 'seafood', label: '해산물', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaSeafood, randomize: function(){ var b=document.getElementById('qaSeafoodShuffleBtn'); if(b) b.click(); }, populate: populate_seafood
  });
  EP.registerFilter({
    id: 'fruitveg', label: '과일&채소', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaFruitVeg, randomize: function(){ var b=document.getElementById('qaFruitVegShuffleBtn'); if(b) b.click(); }, populate: populate_fruitveg
  });
  EP.registerFilter({
    id: 'heart', label: '하트', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaHeart, randomize: function(){ var b=document.getElementById('qaHeartShuffleBtn'); if(b) b.click(); }, populate: populate_heart
  });
  EP.registerFilter({
    id: 'coffee', label: '커피 원두', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaCoffee, randomize: function(){ var b=document.getElementById('qaCoffeeShuffleBtn'); if(b) b.click(); }, populate: populate_coffee
  });
  EP.registerFilter({
    id: 'sports', label: '스포츠공', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaSports, randomize: function(){ var b=document.getElementById('qaSportsShuffleBtn'); if(b) b.click(); }, populate: populate_sports
  });
  EP.registerFilter({
    id: 'club', label: '클럽 분위기', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaClub, randomize: function(){ var b=document.getElementById('qaClubShuffleBtn'); if(b) b.click(); }, populate: populate_club
  });
  EP.registerFilter({
    id: 'snow', label: '눈', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaSnow, randomize: function(){ var b=document.getElementById('qaSnowShuffleBtn'); if(b) b.click(); }, populate: populate_snow
  });
  EP.registerFilter({
    id: 'rain', label: '비', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaRain, randomize: function(){ var b=document.getElementById('qaRainShuffleBtn'); if(b) b.click(); }, populate: populate_rain
  });
  EP.registerFilter({
    id: 'splash', label: '물 튀기는 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaSplash, randomize: function(){ var b=document.getElementById('qaSplashShuffleBtn'); if(b) b.click(); }, populate: populate_splash
  });
  EP.registerFilter({
    id: 'threeD', label: '3D 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQa3D, randomize: null, populate: populate_threeD
  });
  EP.registerFilter({
    id: 'metal', label: '메탈', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaMetal, randomize: null, populate: populate_metal
  });
  EP.registerFilter({
    id: 'popart', label: '팝아트', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaPopart, randomize: function(){ var b=document.getElementById('qaPopartShuffleBtn'); if(b) b.click(); }, populate: populate_popart
  });
  EP.registerFilter({
    id: 'inktrap', label: '잉크트랩', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaInktrap, randomize: function(){ var b=document.getElementById('qaInktrapShuffleBtn'); if(b) b.click(); }, populate: populate_inktrap
  });
  EP.registerFilter({
    id: 'leafvine', label: '나뭇잎 덩굴', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaLeafvine, randomize: function(){ var b=document.getElementById('qaLeafvineShuffleBtn'); if(b) b.click(); }, populate: populate_leafvine
  });
  EP.registerFilter({
    id: 'sakura', label: '벚꽃', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaSakura, randomize: function(){ var b=document.getElementById('qaSakuraShuffleBtn'); if(b) b.click(); }, populate: populate_sakura
  });
  EP.registerFilter({
    id: 'fire', label: '불타는 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaFire, randomize: function(){ var b=document.getElementById('qaFireShuffleBtn'); if(b) b.click(); }, populate: populate_fire
  });
  EP.registerFilter({
    id: 'randomTypo', label: '랜덤 타이포', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaRandomTypo, randomize: function(){ var b=document.getElementById('qaRandomTypoShuffleBtn'); if(b) b.click(); }, populate: populate_randomTypo
  });
  EP.registerFilter({
    id: 'circular', label: '원형 글자', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaCircular, randomize: null, populate: populate_circular
  });
  EP.registerFilter({
    id: 'vertical', label: '세로쓰기', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaVertical, randomize: null, populate: populate_vertical
  });
  EP.registerFilter({
    id: 'postal', label: '우편번호 칸', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaPostal, randomize: null, populate: populate_postal
  });
  EP.registerFilter({
    id: 'puffy', label: '부풀리기', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaPuffy, randomize: null, populate: populate_puffy
  });
  EP.registerFilter({
    id: 'vine', label: '나무타기(넝쿨)', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaVine, randomize: null, populate: populate_vine
  });
  EP.registerFilter({
    id: 'roll', label: '데굴데굴', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaRoll, randomize: null, populate: populate_roll
  });
  EP.registerFilter({
    id: 'perspective', label: '원근법', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaPerspective, randomize: null, populate: populate_perspective
  });
  EP.registerFilter({
    id: 'curve', label: '곡선', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaCurve, randomize: null, populate: populate_curve
  });
  EP.registerFilter({
    id: 'wave', label: '물결', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaWave, randomize: null, populate: populate_wave
  });
  EP.registerFilter({
    id: 'train', label: '기찻길', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaTrain, randomize: null, populate: populate_train
  });
  EP.registerFilter({
    id: 'tired', label: '지침(흐물흐물)', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaTired, randomize: function(){ var b=document.getElementById('qaTiredShuffleBtn'); if(b) b.click(); }, populate: populate_tired
  });
  EP.registerFilter({
    id: 'spiral', label: '나선', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaSpiral, randomize: null, populate: populate_spiral
  });
  EP.registerFilter({
    id: 'magazine', label: '잡지 오려붙임', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaMagazine, randomize: function(){ var b=document.getElementById('qaMagazineShuffleBtn'); if(b) b.click(); }, populate: populate_magazine
  });
  EP.registerFilter({
    id: 'puzzle', label: '퍼즐', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaPuzzle, randomize: function(){ var b=document.getElementById('qaPuzzleShuffleBtn'); if(b) b.click(); }, populate: populate_puzzle
  });
  EP.registerFilter({
    id: 'sky', label: '하늘 위 구름', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaSky, randomize: function(){ var b=document.getElementById('qaSkyShuffleBtn'); if(b) b.click(); }, populate: populate_sky
  });
  EP.registerFilter({
    id: 'shy', label: '수줍수줍', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaShy, randomize: function(){ var b=document.getElementById('qaShyShuffleBtn'); if(b) b.click(); }, populate: populate_shy
  });
  EP.registerFilter({
    id: 'chalk', label: '칠판 글씨', commonEffect: false,
    appliesTo: ['text'], group: 'layout', includeInRandom: true,
    apply: applyQaChalk, randomize: function(){ var b=document.getElementById('qaChalkShuffleBtn'); if(b) b.click(); }, populate: populate_chalk
  });
  EP.registerFilter({
    id: 'grass', label: '휘날리는 풀밭', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaGrass, randomize: function(){ var b=document.getElementById('qaGrassShuffleBtn'); if(b) b.click(); }, populate: populate_grass
  });
  EP.registerFilter({
    id: 'bigbang', label: '빅뱅', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaBigbang, randomize: function(){ var b=document.getElementById('qaBigbangShuffleBtn'); if(b) b.click(); }, populate: populate_bigbang
  });
  EP.registerFilter({
    id: 'event', label: '축포 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaEvent, randomize: function(){ var b=document.getElementById('qaEventShuffleBtn'); if(b) b.click(); }, populate: populate_event
  });
  EP.registerFilter({
    id: 'golf', label: '골프 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaGolf, randomize: function(){ var b=document.getElementById('qaGolfShuffleBtn'); if(b) b.click(); }, populate: populate_golf
  });
  EP.registerFilter({
    id: 'christmas', label: '크리스마스 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaChristmas, randomize: function(){ var b=document.getElementById('qaChristmasShuffleBtn'); if(b) b.click(); }, populate: populate_christmas
  });
  EP.registerFilter({
    id: 'autumn', label: '가을 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaAutumn, randomize: function(){ var b=document.getElementById('qaAutumnShuffleBtn'); if(b) b.click(); }, populate: populate_autumn
  });
  EP.registerFilter({
    id: 'space', label: '우주 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: spaceUI.apply, randomize: function(){ var b=document.getElementById('qaSpaceShuffleBtn'); if(b) b.click(); }, populate: spaceUI.populate
  });
  EP.registerFilter({
    id: 'doodle', label: '낙서 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: doodleUI.apply, randomize: function(){ var b=document.getElementById('qaDoodleShuffleBtn'); if(b) b.click(); }, populate: doodleUI.populate
  });
  EP.registerFilter({
    id: 'butterfly', label: '나비 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: butterflyUI.apply, randomize: function(){ var b=document.getElementById('qaButterflyShuffleBtn'); if(b) b.click(); }, populate: butterflyUI.populate
  });
  EP.registerFilter({
    id: 'soapbubble', label: '비눗방울 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: soapbubbleUI.apply, randomize: function(){ var b=document.getElementById('qaSoapbubbleShuffleBtn'); if(b) b.click(); }, populate: soapbubbleUI.populate
  });
  EP.registerFilter({
    id: 'lightning', label: '번개 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: lightningUI.apply, randomize: function(){ var b=document.getElementById('qaLightningShuffleBtn'); if(b) b.click(); }, populate: lightningUI.populate
  });
  EP.registerFilter({
    id: 'halloween', label: '할로윈 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: halloweenUI.apply, randomize: function(){ var b=document.getElementById('qaHalloweenShuffleBtn'); if(b) b.click(); }, populate: halloweenUI.populate
  });
  EP.registerFilter({
    id: 'musicnote', label: '음표 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: musicnoteUI.apply, randomize: function(){ var b=document.getElementById('qaMusicnoteShuffleBtn'); if(b) b.click(); }, populate: musicnoteUI.populate
  });
  EP.registerFilter({
    id: 'gem', label: '보석 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: gemUI.apply, randomize: function(){ var b=document.getElementById('qaGemShuffleBtn'); if(b) b.click(); }, populate: gemUI.populate
  });
  EP.registerFilter({
    id: 'tropical', label: '열대 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: tropicalUI.apply, randomize: function(){ var b=document.getElementById('qaTropicalShuffleBtn'); if(b) b.click(); }, populate: tropicalUI.populate
  });
  EP.registerFilter({
    id: 'candy', label: '사탕 효과', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: candyUI.apply, randomize: function(){ var b=document.getElementById('qaCandyShuffleBtn'); if(b) b.click(); }, populate: candyUI.populate
  });
  EP.registerFilter({
    id: 'bubble', label: '말풍선 배경', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaBubble, randomize: function(){ var b=document.getElementById('qaBubbleShuffleBtn'); if(b) b.click(); }, populate: populate_bubble
  });
  EP.registerFilter({
    id: 'zebra', label: '얼룩말 무늬', commonEffect: false,
    appliesTo: ['text'], group: null, includeInRandom: true,
    apply: applyQaZebra, randomize: function(){ var b=document.getElementById('qaZebraShuffleBtn'); if(b) b.click(); }, populate: populate_zebra
  });

  // ---- CMYK 색상 선택기 초기화 (core.js의 initCmykPicker 재사용) ----
  EP.initCmykPicker(qaDblInnerColor);
  EP.initCmykPicker(qaDblOuterColor);
  EP.initCmykPicker(qa3DColor);
  EP.initCmykPicker(qaMetalDarkColor);
  EP.initCmykPicker(qaMetalLightColor);
  EP.initCmykPicker(qaMetalGlowColor);
  EP.initCmykPicker(qaPopartMainColor);
  EP.initCmykPicker(qaPopartColorA);
  EP.initCmykPicker(qaPopartColorB);
  EP.initCmykPicker(qaInktrapColor);
  EP.initCmykPicker(qaShyColor);
  EP.initCmykPicker(qaLeafvineVineColor);
  EP.initCmykPicker(qaLeafvineLeafColorA);
  EP.initCmykPicker(qaLeafvineLeafColorB);
  EP.initCmykPicker(qaFireOuterColor);
  EP.initCmykPicker(qaFireInnerColor);
  EP.initCmykPicker(qaLightColor);
  EP.initCmykPicker(qaPostalColor);
  EP.initCmykPicker(qaGrassColor);
  EP.initCmykPicker(qaBubbleFillColor);
  EP.initCmykPicker(qaBubbleStrokeColor);
  EP.initCmykPicker(qaZebraColorA);
  EP.initCmykPicker(qaZebraColorB);
  EP.initCmykPicker(qaRainColor);
  EP.initCmykPicker(qaSplashColor);
  EP.initCmykPicker(qaTrainTrackColor);
  EP.initCmykPicker(qaSpeedDustColor);
  EP.initCmykPicker(qaCrackColor);

  EP.reapplyCircularTextPatches = reapplyCircularTextPatches;
})();
