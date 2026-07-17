/* ecopro3map.js — 지도 만들기
   "텍스트모양" 메뉴의 "표 만들기" 아래에 있는 "지도 만들기" 버튼을 누르면 여는 주소 입력창.
   주소를 입력하고 적용하면:
     1) 카카오맵 Geocoder로 주소 → 좌표 변환 (실패하면 키워드/장소검색으로 한 번 더 시도)
     2) kakao.maps.StaticMap으로 그 좌표의 정적 지도 이미지를 화면 밖 숨김 영역에 렌더링
     3) 완성된 <img>의 src를 fabric.Image로 캔버스 중앙에 삽입 (표/이미지 불러오기와 같은 방식)
   주의: 카카오 정적 지도 이미지 서버는 CORS 허용 헤더를 보내주지 않는 경우가 많아서,
   화면에 보이고 이동·크기조절하는 데는 문제가 없지만 PNG/JPG 내보내기(canvas.toDataURL 방식)는
   이 지도 때문에 실패할 수 있음(Tainted canvas). SVG 내보내기는 <image href="URL">만 참조하는
   방식이라 이 문제와 무관하게 정상 동작함. 그래서 지도를 넣은 뒤에는 안내 문구로 SVG 내보내기를
   권장함.
   로딩 순서: ecopro3.js(코어) 다음, ecopro3l.js(주사위) 전이면 어디든 무방. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var shapeMenu = document.getElementById('shapeMenu');
  var addMapBtn = document.getElementById('addMapBtn');
  var mapInputToolbar = document.getElementById('mapInputToolbar');
  var mapInputToolbarHint = document.getElementById('mapInputToolbarHint');
  var mapAddressInput = document.getElementById('mapAddressInput');
  var applyMapBtn = document.getElementById('applyMapBtn');
  var cancelMapBtn = document.getElementById('cancelMapBtn');

  if (!addMapBtn || !mapInputToolbar) return; // html이 안 맞으면 조용히 비활성화

  var DEFAULT_HINT = mapInputToolbarHint.textContent;
  var APPLY_BTN_DEFAULT_LABEL = applyMapBtn.textContent;
  var kakaoReady = false;
  var busy = false; // 중복 클릭(연속 요청) 방지

  function openMapInputToolbar(){
    shapeMenu.classList.add('hidden');
    mapInputToolbarHint.textContent = DEFAULT_HINT;
    mapInputToolbar.classList.remove('hidden');
    mapAddressInput.focus();
    mapAddressInput.select();
  }

  addMapBtn.addEventListener('click', function(e){
    if (e) e.stopPropagation(); // 부모(#shapeMenu)의 공통 클릭 핸들러와 겹치지 않도록 분리
    openMapInputToolbar();
  });
  cancelMapBtn.addEventListener('click', function(){
    mapInputToolbar.classList.add('hidden');
  });
  mapAddressInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); applyMapBtn.click(); }
  });

  function setBusy(isBusy, label){
    busy = isBusy;
    applyMapBtn.disabled = isBusy;
    applyMapBtn.textContent = isBusy ? (label || '🗺 불러오는 중...') : APPLY_BTN_DEFAULT_LABEL;
  }

  function ensureKakaoLoaded(onReady, onError){
    if (typeof kakao === 'undefined' || !kakao.maps) {
      onError('카카오맵 스크립트를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
      return;
    }
    if (kakaoReady) { onReady(); return; }
    try {
      kakao.maps.load(function(){ kakaoReady = true; onReady(); });
    } catch (e) {
      console.error('kakao.maps.load 오류:', e);
      onError('카카오맵 초기화 중 오류가 발생했어요.');
    }
  }

  function cleanupContainer(container){
    if (container && container.parentNode) container.parentNode.removeChild(container);
  }

  function failAndCleanup(container, msg){
    cleanupContainer(container);
    setBusy(false);
    alert(msg || '지도 이미지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  }

  // fabric.Image로 캔버스에 삽입 — 이미지 불러오기(6. 이미지 불러오기)와 같은 중앙 배치 방식,
  // 다만 화면 확대/이동(zoom·pan) 중이어도 지금 보이는 화면 한가운데 들어오도록
  // 표 만들기(ecopro3table.js buildTable)와 같은 뷰포트 기준 좌표 계산을 사용함.
  function insertMapImageToCanvas(url, address, container){
    var canvas = EP.canvas;
    if (!canvas) { failAndCleanup(container); return; }

    fabric.Image.fromURL(url, function(img){
      if (!img || !img.width || !img.height) {
        failAndCleanup(container, '지도 이미지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      var zoom = canvas.getZoom() || 1;
      var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      var viewW = (canvas.getWidth() || 0) / zoom, viewH = (canvas.getHeight() || 0) / zoom;
      var centerX = (canvas.getWidth() / 2 - vpt[4]) / zoom;
      var centerY = (canvas.getHeight() / 2 - vpt[5]) / zoom;

      var maxDim = Math.min(viewW || img.width, viewH || img.height) * 0.75;
      var scale = Math.min(maxDim / img.width, maxDim / img.height, 1);

      img.set({
        left: centerX, top: centerY,
        originX: 'center', originY: 'center',
        scaleX: scale, scaleY: scale
      });
      img.isMapImage = true;
      img.mapAddress = address;

      canvas.add(img);
      if (EP.bringGuideToFront) EP.bringGuideToFront();
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
      if (EP.refreshEmptyHint) EP.refreshEmptyHint();
      if (EP.pushHistory) EP.pushHistory();

      cleanupContainer(container);
      setBusy(false);
      mapInputToolbarHint.textContent = '지도가 추가됐어요. 카카오 지도 특성상 PNG·JPG 내보내기는 오류가 날 수 있어요 — SVG 내보내기를 이용해주세요.';
    }, { /* crossOrigin 지정 안 함: 카카오 정적 지도 서버가 CORS 헤더를 안 주면
            crossOrigin:'anonymous'일 때 아예 로드 자체가 실패하기 때문에,
            여기선 화면 표시가 되도록 일반 로드로 넣음(대신 위 PNG/JPG 안내 필요) */ });
  }

  // kakao.maps.StaticMap은 지정한 div 안에 비동기로 <img>를 채워 넣는 방식이라,
  // 완성될 때까지 짧게 폴링(최대 약 4.5초)하면서 기다림.
  function waitForStaticMapImage(container, onReady, onFail){
    var tries = 0, maxTries = 30;
    (function poll(){
      var imgEl = container.querySelector('img');
      if (imgEl && imgEl.src) {
        if (imgEl.complete && imgEl.naturalWidth > 0) { onReady(imgEl.src); return; }
        imgEl.addEventListener('load', function(){ onReady(imgEl.src); }, { once: true });
        imgEl.addEventListener('error', function(){ onFail(); }, { once: true });
        return;
      }
      tries++;
      if (tries >= maxTries) { onFail(); return; }
      setTimeout(poll, 150);
    })();
  }

  function buildStaticMapImage(lat, lng, address){
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:400px;';
    document.body.appendChild(container);
    try {
      var staticMap = new kakao.maps.StaticMap(container, {
        center: new kakao.maps.LatLng(lat, lng),
        level: 3
      });
      // 위치가 잘 보이도록 정중앙에 마커도 함께 표시
      if (staticMap.addMarker) {
        staticMap.addMarker({ position: new kakao.maps.LatLng(lat, lng) });
      }
    } catch (e) {
      console.error('StaticMap 생성 오류:', e);
      failAndCleanup(container, '지도를 생성하지 못했어요.');
      return;
    }
    waitForStaticMapImage(container, function(url){
      insertMapImageToCanvas(url, address, container);
    }, function(){
      failAndCleanup(container, '지도 이미지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    });
  }

  function geocodeAndBuild(address){
    var geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, function(result, status){
      if (status === kakao.maps.services.Status.OK && result && result[0]) {
        buildStaticMapImage(parseFloat(result[0].y), parseFloat(result[0].x), address);
        return;
      }
      // 정식 주소로 못 찾으면 건물명/장소명 키워드 검색으로 한 번 더 시도
      var places = new kakao.maps.services.Places();
      places.keywordSearch(address, function(data, status2){
        if (status2 === kakao.maps.services.Status.OK && data && data[0]) {
          buildStaticMapImage(parseFloat(data[0].y), parseFloat(data[0].x), address);
        } else {
          setBusy(false);
          alert('주소를 찾을 수 없어요. 다른 주소나 건물명으로 다시 시도해보세요.');
        }
      });
    });
  }

  applyMapBtn.addEventListener('click', function(){
    if (busy) return;
    var address = (mapAddressInput.value || '').trim();
    if (!address) { mapAddressInput.focus(); return; }
    setBusy(true, '🗺 주소 찾는 중...');
    ensureKakaoLoaded(function(){
      geocodeAndBuild(address);
    }, function(msg){
      setBusy(false);
      alert(msg);
    });
  });
})();
