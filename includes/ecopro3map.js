/* ecopro3map.js — 지도 만들기 (VWorld 지오코딩 + Geoapify 정적 지도 이미지)
   "텍스트모양" 메뉴의 "표 만들기" 아래에 있는 "지도 만들기" 버튼을 누르면 여는 주소 입력창.

   주소 → 좌표 변환은 국토교통부 브이월드(VWorld) API를 씀:
   - 대한민국 공식 도로명주소 DB 기반이라 Geoapify(OSM 기반)보다 한국 주소 정확도가 훨씬 높음.
   - 광고 인프라와 무관한 정부 도메인이라 카카오 때 겪었던 광고차단 차단 문제도 없음.
   - 무료 하루 3만 건.

   실제 지도 "그림"(이미지)은 Geoapify Static Maps API를 그대로 씀:
   - CORS를 지원해서 캔버스에 넣은 뒤 PNG/JPG 내보내기까지 문제없이 동작함.
   - scaleFactor를 올려 고해상도로 받아서 인쇄용으로도 선명하게 나오도록 함.
   - style=osm-bright — 색감 있고 깔끔한, 인쇄물에 무난하게 예쁜 스타일.

   삽입된 지도는 일반 이미지 오브젝트라서, 오른쪽 "이미지" 패널의 밝기·대비·채도·흑백
   보정 기능으로 인쇄 전에 색 보정도 할 수 있음(ecopro3.js 쪽 기능).

   동작 순서:
     1) VWorld Geocoder로 주소 → 좌표 변환 (도로명 주소로 먼저 시도, 안 되면 지번 주소로 재시도)
     2) Geoapify Static Maps API로 그 좌표의 고해상도 지도 이미지 URL 생성
     3) fabric.Image로 캔버스 중앙(지금 보이는 화면 기준)에 삽입

   로딩 순서: ecopro3.js(코어) 다음, ecopro3l.js(주사위) 전이면 어디든 무방. */
(function(){
  "use strict";
  var EP = window.EP = window.EP || {};

  var VWORLD_KEY = '2799E8C4-4E56-36A9-891A-A00B7E5BA60C';
  var GEOAPIFY_API_KEY = '48d65d25e76341bcbed4197e3745fc56';

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

  // ---------- VWorld 지오코딩 ----------
  function vworldGeocode(address, type){
    var url = 'https://api.vworld.kr/req/address'
      + '?service=address&request=getcoord&version=2.0&crs=epsg:4326'
      + '&address=' + encodeURIComponent(address)
      + '&refine=true&simple=false&format=json'
      + '&type=' + type
      + '&key=' + encodeURIComponent(VWORLD_KEY);
    return fetch(url).then(function(res){ return res.json(); });
  }

  function extractVworldResult(data){
    var resp = data && data.response;
    if (resp && resp.status === 'OK' && resp.result && resp.result.point) {
      return { lat: parseFloat(resp.result.point.y), lon: parseFloat(resp.result.point.x) };
    }
    return null;
  }

  // 도로명주소로 먼저 찾고, 못 찾으면 지번주소로 한 번 더 시도(사용자가 어떤 형태로 입력했는지
  // 모르기 때문에 둘 다 순서대로 시도함)
  function geocodeAddress(address){
    return vworldGeocode(address, 'road').then(function(data){
      var hit = extractVworldResult(data);
      if (hit) return hit;
      return vworldGeocode(address, 'parcel').then(function(data2){
        return extractVworldResult(data2);
      });
    });
  }

  // ---------- Geoapify 정적 지도 이미지 ----------
  function buildStaticMapUrl(lat, lon){
    var w = 900, h = 650;
    return 'https://maps.geoapify.com/v1/staticmap'
      + '?style=osm-bright'
      + '&width=' + w + '&height=' + h
      + '&scaleFactor=3'          // 인쇄용 고해상도
      + '&format=png'
      + '&center=lonlat:' + lon + ',' + lat
      + '&zoom=16.5'
      + '&marker=lonlat:' + lon + ',' + lat + ';type:awesome;color:%23ff3b30;size:55'
      + '&apiKey=' + encodeURIComponent(GEOAPIFY_API_KEY);
  }

  // fabric.Image로 캔버스에 삽입 — 표 만들기(ecopro3table.js buildTable)와 같은 방식으로
  // 지금 보이는 화면(zoom·pan 반영) 한가운데에 들어오도록 뷰포트 기준 좌표를 계산함.
  function insertMapImageToCanvas(url, label){
    var canvas = EP.canvas;
    if (!canvas) { setBusy(false); alert('캔버스를 찾을 수 없어요.'); return; }

    var finished = false;
    var timeoutId = setTimeout(function(){
      if (finished) return;
      finished = true;
      setBusy(false);
      alert('지도 이미지를 불러오는 데 시간이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.');
    }, 15000);

    fabric.Image.fromURL(url, function(img){
      if (finished) return; // 이미 타임아웃으로 처리된 뒤 늦게 도착한 경우 무시
      finished = true;
      clearTimeout(timeoutId);

      if (!img || !img.width || !img.height) {
        setBusy(false);
        alert('지도 이미지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
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
      img.mapAddress = label;

      canvas.add(img);
      if (EP.bringGuideToFront) EP.bringGuideToFront();
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
      if (EP.refreshEmptyHint) EP.refreshEmptyHint();
      if (EP.pushHistory) EP.pushHistory();

      setBusy(false);
      mapInputToolbarHint.textContent = '지도가 추가됐어요. 오른쪽 "이미지" 패널에서 밝기·대비·채도 보정도 할 수 있어요.';
    }, { crossOrigin: 'anonymous' }); // Geoapify는 CORS를 지원해서 내보내기(PNG/JPG)까지 문제없이 동작함
  }

  function geocodeAndBuild(address){
    geocodeAddress(address).then(function(hit){
      if (!hit) {
        setBusy(false);
        alert('주소를 찾을 수 없어요. 도로명 주소(예: "테헤란로 152") 또는 지번 주소로 다시 시도해보세요.');
        return;
      }
      var mapUrl = buildStaticMapUrl(hit.lat, hit.lon);
      insertMapImageToCanvas(mapUrl, address);
    }).catch(function(err){
      console.error('VWorld geocode 오류:', err);
      setBusy(false);
      alert('주소 검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    });
  }

  applyMapBtn.addEventListener('click', function(){
    if (busy) return;
    var address = (mapAddressInput.value || '').trim();
    if (!address) { mapAddressInput.focus(); return; }
    setBusy(true, '🗺 주소 찾는 중...');
    geocodeAndBuild(address);
  });
})();
