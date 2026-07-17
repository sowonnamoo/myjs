/* ecopro3map.js — 지도 만들기 (VWorld 지오코딩 + 벡터(SVG) 지도, 실패 시 Geoapify 사진식 지도로 대체)
   "텍스트모양" 메뉴의 "표 만들기" 아래에 있는 "지도 만들기" 버튼을 누르면 여는 주소 입력창.

   동작 순서:
     1) VWorld Geocoder로 주소 → 좌표 변환 (도로명 주소로 먼저 시도, 안 되면 지번 주소로 재시도)
        — 대한민국 공식 도로명주소 DB 기반이라 정확도가 높음.
     2) OpenStreetMap의 Overpass API로 그 주변(반경 약 260m)의 실제 건물·도로·수역·공원
        벡터(윤곽선) 데이터를 가져와서 SVG로 직접 그림 → 건물 하나하나가 독립된 도형
        오브젝트로 캔버스에 들어와서, "SVG 불러오기"로 넣은 것처럼 개별 선택해서
        색을 바꾸거나(예: 우리 건물만 강조색으로) 삭제/이동할 수 있음.
     3) 이 지역에 OSM 건물/도로 데이터가 거의 없거나(한국은 지역에 따라 OSM 데이터가
        부실한 곳이 있음) Overpass 서버가 응답하지 않으면, 자동으로 Geoapify의
        고해상도 사진식(래스터) 정적 지도로 대체함(이전 방식, 인쇄 해상도로 생성).

   삽입된 지도(벡터/래스터 어느 쪽이든)는 오른쪽 "이미지" 패널의 밝기·대비·채도·흑백
   보정 기능도 그대로 쓸 수 있음(래스터일 때는 이미지 필터로, 벡터일 때는 개별 도형의
   채우기색 변경으로 보정/수정).

   로딩 순서: ecopro3.js(코어, importSvgIntoCanvas가 여기 있음) 다음, ecopro3l.js(주사위) 전이면 어디든 무방. */
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

  // ---------- 1) VWorld 지오코딩 ----------
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
  // 도로명주소로 먼저 찾고, 못 찾으면 지번주소로 한 번 더 시도
  function geocodeAddress(address){
    return vworldGeocode(address, 'road').then(function(data){
      var hit = extractVworldResult(data);
      if (hit) return hit;
      return vworldGeocode(address, 'parcel').then(function(data2){
        return extractVworldResult(data2);
      });
    });
  }

  // ---------- 2) Overpass(OSM) 벡터 데이터 → SVG ----------
  var SVG_W = 900, SVG_H = 650;
  var RADIUS_M = 260;               // 중심에서 이만큼(m) 반경의 데이터를 가져옴
  var PXPM = (Math.min(SVG_W, SVG_H) / 2 - 40) / RADIUS_M; // 미터당 픽셀

  function bboxFromCenter(lat, lon){
    var dLat = RADIUS_M / 111320;
    var dLon = RADIUS_M / (111320 * Math.cos(lat * Math.PI / 180));
    return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
  }

  function buildOverpassQuery(bbox){
    var b = bbox.south + ',' + bbox.west + ',' + bbox.north + ',' + bbox.east;
    return '[out:json][timeout:20];('
      + 'way["building"](' + b + ');'
      + 'way["highway"](' + b + ');'
      + 'way["natural"="water"](' + b + ');'
      + 'way["leisure"="park"](' + b + ');'
      + 'way["landuse"="grass"](' + b + ');'
      + ');out geom;';
  }

  function fetchOverpass(query, timeoutMs){
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){ controller.abort(); }, timeoutMs) : null;
    return fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: controller ? controller.signal : undefined
    }).then(function(res){
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('overpass http ' + res.status);
      return res.json();
    }).catch(function(err){
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function project(lat, lon, centerLat, centerLon, metersPerDegLat, metersPerDegLon){
    var xM = (lon - centerLon) * metersPerDegLon;
    var yM = (lat - centerLat) * metersPerDegLat;
    var x = SVG_W / 2 + xM * PXPM;
    var y = SVG_H / 2 - yM * PXPM; // lat 위쪽(+)이 SVG에서는 y가 작아지는 방향이라 부호 반전
    return [x, y];
  }

  function pathD(points, closed){
    var d = points.map(function(p, i){ return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    if (closed) d += ' Z';
    return d;
  }

  var MAJOR_ROADS = { motorway:1, trunk:1, primary:1, secondary:1, tertiary:1, motorway_link:1, trunk_link:1, primary_link:1, secondary_link:1, tertiary_link:1 };
  var PATH_ROADS = { footway:1, path:1, cycleway:1, pedestrian:1, steps:1, track:1 };
  function roadStyle(highwayType){
    if (MAJOR_ROADS[highwayType]) return { stroke: '#f4b942', width: 6, dash: null, casing: '#c98f1d' };
    if (PATH_ROADS[highwayType]) return { stroke: '#cfd6dc', width: 2, dash: '5 4', casing: null };
    return { stroke: '#ffffff', width: 4, dash: null, casing: '#c9cfd6' }; // 주거/기타 도로 기본값
  }

  // Overpass 응답(elements)을 카테고리별로 나눈 뒤 SVG 문자열로 조립
  function buildVectorMapSvg(elements, centerLat, centerLon){
    var metersPerDegLat = 111320;
    var metersPerDegLon = 111320 * Math.cos(centerLat * Math.PI / 180);
    var landuseParts = [], roadParts = [], buildingParts = [];
    var hasAny = false;

    elements.forEach(function(el){
      if (!el || el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
      var pts = el.geometry.map(function(g){ return project(g.lat, g.lon, centerLat, centerLon, metersPerDegLat, metersPerDegLon); });
      var tags = el.tags || {};

      if (tags.building) {
        buildingParts.push('<path d="' + pathD(pts, true) + '" fill="#e3e8ec" stroke="#b7c1ca" stroke-width="1" data-name="building"/>');
        hasAny = true;
      } else if (tags.highway) {
        var st = roadStyle(tags.highway);
        var d = pathD(pts, false);
        if (st.casing) roadParts.push('<path d="' + d + '" fill="none" stroke="' + st.casing + '" stroke-width="' + (st.width + 2.4) + '" stroke-linecap="round" stroke-linejoin="round" data-name="road-casing"/>');
        roadParts.push('<path d="' + d + '" fill="none" stroke="' + st.stroke + '" stroke-width="' + st.width + '" stroke-linecap="round" stroke-linejoin="round"' + (st.dash ? (' stroke-dasharray="' + st.dash + '"') : '') + ' data-name="road"/>');
        hasAny = true;
      } else if (tags.natural === 'water') {
        landuseParts.push('<path d="' + pathD(pts, true) + '" fill="#a9d3e5" stroke="none" data-name="water"/>');
        hasAny = true;
      } else if (tags.leisure === 'park' || tags.landuse === 'grass') {
        landuseParts.push('<path d="' + pathD(pts, true) + '" fill="#cfe8c9" stroke="none" data-name="park"/>');
        hasAny = true;
      }
    });

    if (!hasAny) return null;

    var cx = SVG_W / 2, cy = SVG_H / 2;
    var marker = '<circle cx="' + cx + '" cy="' + cy + '" r="15" fill="#ff3b30" stroke="#ffffff" stroke-width="3" data-name="marker"/>'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#ffffff" data-name="marker-dot"/>';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" width="' + SVG_W + '" height="' + SVG_H + '">'
      + '<rect x="0" y="0" width="' + SVG_W + '" height="' + SVG_H + '" fill="#f4f6f8" data-name="bg"/>'
      + landuseParts.join('')
      + roadParts.join('')
      + buildingParts.join('')
      + marker
      + '</svg>';
  }

  function tryInsertVectorMap(lat, lon, address, onSuccess, onFallback){
    var query = buildOverpassQuery(bboxFromCenter(lat, lon));
    fetchOverpass(query, 12000).then(function(data){
      var svg = buildVectorMapSvg((data && data.elements) || [], lat, lon);
      if (!svg) { onFallback('이 주변엔 OSM 건물·도로 데이터가 부족해서'); return; }
      if (!EP.importSvgIntoCanvas) { onFallback('벡터 지도 삽입 기능을 찾을 수 없어서'); return; }
      EP.importSvgIntoCanvas(svg, {
        viewportCenter: true,
        onEmpty: function(){ onFallback('벡터 지도를 그리지 못해서'); },
        onDone: function(){ onSuccess(); }
      });
    }).catch(function(err){
      console.error('Overpass 오류:', err);
      onFallback('실시간 벡터 지도 서버 응답이 없어서');
    });
  }

  // ---------- 3) 대체용 Geoapify 고해상도 사진식 지도(래스터) ----------
  function buildStaticMapUrl(lat, lon){
    var w = 900, h = 650;
    return 'https://maps.geoapify.com/v1/staticmap'
      + '?style=osm-bright'
      + '&width=' + w + '&height=' + h
      + '&scaleFactor=3'
      + '&format=png'
      + '&center=lonlat:' + lon + ',' + lat
      + '&zoom=16.5'
      + '&marker=lonlat:' + lon + ',' + lat + ';type:awesome;color:%23ff3b30;size:55'
      + '&apiKey=' + encodeURIComponent(GEOAPIFY_API_KEY);
  }

  function insertRasterMapToCanvas(url, label, reasonPrefix){
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
      if (finished) return;
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
      mapInputToolbarHint.textContent = (reasonPrefix ? (reasonPrefix + ' 사진식 지도로 대신 넣었어요. ') : '')
        + '오른쪽 "이미지" 패널에서 밝기·대비·채도 보정도 할 수 있어요.';
    }, { crossOrigin: 'anonymous' });
  }

  function geocodeAndBuild(address){
    geocodeAddress(address).then(function(hit){
      if (!hit) {
        setBusy(false);
        alert('주소를 찾을 수 없어요. 도로명 주소(예: "테헤란로 152") 또는 지번 주소로 다시 시도해보세요.');
        return;
      }
      setBusy(true, '🗺 건물·도로 그리는 중...');
      tryInsertVectorMap(hit.lat, hit.lon, address, function(){
        // 성공(벡터)
        setBusy(false);
        mapInputToolbarHint.textContent = '지도가 추가됐어요. 건물 하나하나가 낱개 도형이라 클릭해서 색을 바꾸거나 지울 수 있어요.';
      }, function(reasonPrefix){
        // 실패 → 래스터로 대체
        setBusy(true, '🗺 대체 지도 불러오는 중...');
        var mapUrl = buildStaticMapUrl(hit.lat, hit.lon);
        insertRasterMapToCanvas(mapUrl, address, reasonPrefix);
      });
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
