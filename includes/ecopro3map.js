/* ecopro3map.js — 지도 만들기
   "텍스트모양" 메뉴의 "표 만들기" 아래에 있는 "지도 만들기" 버튼을 누르면 여는 주소 입력창.

   구조:
     1) 주소 → 좌표: VWorld(국토교통부 공식 주소 DB, 정확도 높음)로 먼저 시도.
        VWorld는 CORS 헤더를 아예 안 줘서 fetch()로는 항상 막히기 때문에,
        <script> 태그를 쓰는 JSONP 방식으로 우회함(콜백 파라미터 지원 확인됨).
        VWorld가 막히거나 못 찾으면 자동으로 Geoapify 지오코딩으로 대체.
     2) 지도 "그림": Geoapify Static Maps API만 사용(고해상도 인쇄용, style=osm-bright).
        Geoapify는 CORS를 정식 지원해서 캔버스에 넣은 뒤 PNG/JPG 내보내기까지 문제없음.
        (VWorld도 지도 이미지 자체는 제공하지만 이쪽도 CORS 헤더가 없어서 내보내기가
        깨짐 — 카카오 때와 같은 문제라 이미지 용도로는 안 씀)

   삽입된 지도는 일반 이미지 오브젝트라서, 오른쪽 "이미지" 패널의 밝기·대비·채도·흑백
   보정 기능으로 인쇄 전 색 보정도 할 수 있음(ecopro3.js 쪽 기능).

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

  // ---------- 1) VWorld 지오코딩 (JSONP — VWorld는 CORS 헤더를 안 줘서 fetch 대신 이 방식을 씀) ----------
  var __vworldJsonpSeq = 0;
  function vworldGeocodeJsonp(address, type){
    return new Promise(function(resolve, reject){
      var callbackName = '__vworldCb' + (++__vworldJsonpSeq) + '_' + Date.now();
      var script = document.createElement('script');
      var timeoutId = setTimeout(function(){ cleanup(); reject(new Error('vworld jsonp timeout')); }, 10000);

      function cleanup(){
        clearTimeout(timeoutId);
        try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function(data){
        cleanup();
        resolve(data);
      };

      var url = 'https://api.vworld.kr/req/address'
        + '?service=address&request=getcoord&version=2.0&crs=epsg:4326'
        + '&address=' + encodeURIComponent(address)
        + '&refine=true&simple=false&format=json'
        + '&type=' + type
        + '&key=' + encodeURIComponent(VWORLD_KEY)
        + '&callback=' + callbackName;

      script.src = url;
      script.onerror = function(){ cleanup(); reject(new Error('vworld jsonp script load error')); };
      document.head.appendChild(script);
    });
  }
  function extractVworldResult(data){
    var resp = data && data.response;
    if (resp && resp.status === 'OK' && resp.result && resp.result.point) {
      return { lat: parseFloat(resp.result.point.y), lon: parseFloat(resp.result.point.x) };
    }
    return null;
  }
  // 도로명주소로 먼저 찾고, 못 찾으면 지번주소로 한 번 더 시도
  function geocodeViaVWorld(address){
    return vworldGeocodeJsonp(address, 'road').then(function(data){
      var hit = extractVworldResult(data);
      if (hit) return hit;
      return vworldGeocodeJsonp(address, 'parcel').then(function(data2){
        return extractVworldResult(data2);
      });
    });
  }

  // VWorld가 막히거나(차단/장애) 응답이 없을 때를 대비한 대체 지오코더.
  // 한국 주소 정확도는 VWorld보다 떨어지지만 CORS 걱정 없이 안정적으로 동작해서
  // "완전히 먹통"이 되는 상황은 막아줌 — VWorld 우선, 실패하면 자동으로 이쪽으로 넘어감.
  function geocodeViaGeoapify(address){
    var url = 'https://api.geoapify.com/v1/geocode/search'
      + '?text=' + encodeURIComponent(address)
      + '&lang=ko&limit=1&bias=countrycode:kr&format=json'
      + '&apiKey=' + encodeURIComponent(GEOAPIFY_API_KEY);
    return fetch(url).then(function(res){ return res.json(); }).then(function(data){
      var results = (data && data.results) || [];
      if (!results.length) return null;
      return { lat: results[0].lat, lon: results[0].lon };
    }).catch(function(err){
      console.warn('Geoapify 대체 지오코딩도 실패:', err);
      return null;
    });
  }

  function geocodeAddress(address){
    return geocodeViaVWorld(address).then(function(hit){
      if (hit) return hit;
      return geocodeViaGeoapify(address);
    }).catch(function(err){
      console.warn('VWorld 지오코딩 실패(차단/장애 등), Geoapify로 대체 시도:', err);
      return geocodeViaGeoapify(address);
    });
  }

  // ---------- 2) Geoapify 고해상도 사진식 지도 이미지 ----------
  function buildStaticMapUrl(lat, lon){
    var w = 900, h = 650;
    // osm-bright 스타일에서 실제로 동작이 확인된 레이어 이름만 사용(추측성 레이어명은 다 뺌 —
    // 지원 안 하는 레이어명이나 존재하지 않는 마커 아이콘(Font Awesome)이 하나라도 섞이면
    // Geoapify가 지도 자체를 아예 못 만들어서 통째로 실패하는 걸 겪었기 때문에, 여기선
    // 안전이 확인된 것만 사용함.
    var styleCustomization = [
      'background:%23fdf3ea',
      'highway-minor-casing:%23ddd2c4',
      'highway-minor:%23fffaf3',
      'highway-secondary-tertiary-casing:%23dba99f',
      'highway-secondary-tertiary:%23f2d2ca',
      'highway-primary-casing:%23e08a76',
      'highway-primary:%23f6bcae',
      'poi-level-3:none',
      'place-other:none'
    ].join('|');
    // 폰트 아이콘(Font Awesome 등) 의존 없는 단순 원형 마커 — 아이콘 이름 오타/미존재로
    // 지도 생성 자체가 실패하는 걸 방지하기 위해 가장 안전한 형태로 둠
    var marker = 'lonlat:' + lon + ',' + lat
      + ';type:circle;color:%23ff6f61;size:56;strokecolor:%23ffffff;shadow:no';
    return 'https://maps.geoapify.com/v1/staticmap'
      + '?style=osm-bright'
      + '&width=' + w + '&height=' + h
      + '&scaleFactor=3'          // 인쇄용 고해상도
      + '&format=png'
      + '&center=lonlat:' + lon + ',' + lat
      + '&zoom=16.5'
      + '&styleCustomization=' + styleCustomization
      + '&marker=' + marker
      + '&apiKey=' + encodeURIComponent(GEOAPIFY_API_KEY);
  }

  // 커스텀 스타일/마커에 문제가 생겨 위 URL이 실패할 경우를 대비한 최소 구성(색 커스터마이징
  // 없이 기본 osm-bright + 가장 단순한 원형 마커만) — 실패 확률을 최대한 낮춘 최후의 보루
  function buildPlainStaticMapUrl(lat, lon){
    return 'https://maps.geoapify.com/v1/staticmap'
      + '?style=osm-bright'
      + '&width=900&height=650'
      + '&format=png'
      + '&center=lonlat:' + lon + ',' + lat
      + '&zoom=16.5'
      + '&marker=lonlat:' + lon + ',' + lat + ';type:circle;color:%23ff3b30;size:48'
      + '&apiKey=' + encodeURIComponent(GEOAPIFY_API_KEY);
  }

  // fabric.Image로 캔버스에 삽입 — 표 만들기(ecopro3table.js buildTable)와 같은 방식으로
  // 지금 보이는 화면(zoom·pan 반영) 한가운데에 들어오도록 뷰포트 기준 좌표를 계산함.
  // onFail이 있으면(꾸민 지도용 URL을 먼저 시도할 때) 실패해도 alert 없이 그쪽으로 넘김.
  function insertMapImageToCanvas(url, label, onFail){
    var canvas = EP.canvas;
    if (!canvas) { setBusy(false); alert('캔버스를 찾을 수 없어요.'); return; }

    var finished = false;
    var timeoutId = setTimeout(function(){
      if (finished) return;
      finished = true;
      if (onFail) { onFail(); return; }
      setBusy(false);
      alert('지도 이미지를 불러오는 데 시간이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.');
    }, 12000);

    fabric.Image.fromURL(url, function(img){
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);

      if (!img || !img.width || !img.height) {
        if (onFail) { onFail(); return; }
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
      setBusy(true, '🗺 지도 불러오는 중...');
      var styledUrl = buildStaticMapUrl(hit.lat, hit.lon);
      insertMapImageToCanvas(styledUrl, address, function(){
        // 꾸민 버전이 실패하면 조용히 기본(무보정) 버전으로 한 번 더 시도
        console.warn('꾸민 스타일 지도 실패, 기본 스타일로 재시도');
        setBusy(true, '🗺 기본 스타일로 다시 시도 중...');
        var plainUrl = buildPlainStaticMapUrl(hit.lat, hit.lon);
        insertMapImageToCanvas(plainUrl, address);
      });
    }).catch(function(err){
      console.error('지오코딩 오류:', err);
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
