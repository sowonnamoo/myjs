/* ecopro3map.js — 지도 만들기 (벡터 지도: 실제 도로·건물을 새로 그림 + 도로명/건물명 라벨)
   "텍스트모양" 메뉴의 "표 만들기" 아래에 있는 "지도 만들기" 버튼을 누르면 여는 주소 입력창.

   구조:
     1) 주소 → 좌표: VWorld(국토교통부 공식 주소 DB)로 먼저 시도, CORS를 안 줘서 JSONP로 우회.
        막히거나 못 찾으면 자동으로 Geoapify 지오코딩으로 대체.
     2) 지도 "그림": OpenStreetMap Overpass API로 주변(반경 약 190m) 실제 도로·건물·수역·공원
        윤곽선 데이터를 가져와서 SVG로 새로 그림(길은 두껍고 선명하게, 이름 있는 도로/건물은
        글자 라벨도 큼직하게 같이 그림). 각 도형·글자가 독립된 오브젝트라 낱개로 편집 가능함
        ("SVG 불러오기"로 넣은 파일처럼 클릭해서 색 바꾸기/이동/삭제 다 됨).
     3) 이 지역에 OSM 데이터가 거의 없거나 Overpass 서버가 응답하지 않으면, 자동으로
        Geoapify의 고해상도 사진식 지도(+선명하게 보이는 필터)로 조용히 대체함.

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
  var randomMapBtn = document.getElementById('randomMapBtn');
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
    if (randomMapBtn) randomMapBtn.disabled = isBusy;
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

  // ---------- 지도 필터(색상/두께/글자/마커를 통째로 바꾸는 프리셋) ----------
  // "랜덤 지도 만들기"를 누르면 이 목록에서 하나를 무작위로 골라 적용함.
  // 새 필터를 추가하고 싶으면 MAP_FILTERS 배열에 { id, name, build() } 객체만 추가하면 됨.
  function clamp255(v){ return Math.max(0, Math.min(255, Math.round(v))); }
  function rgbToHexLocal(r, g, b){
    return '#' + [r, g, b].map(function(v){ var h = v.toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  }
  function hexToRgbLocal(hex){
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function(c){ return c + c; }).join('');
    var num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  // 인쇄 잉크 기준(CMYK, 0~1)을 화면 RGB 색으로 근사 변환
  function cmykToHex(c, m, y, k){
    var r = clamp255(255 * (1 - c) * (1 - k));
    var g = clamp255(255 * (1 - m) * (1 - k));
    var b = clamp255(255 * (1 - y) * (1 - k));
    return rgbToHexLocal(r, g, b);
  }
  function lightenHex(hex, amt){
    var c = hexToRgbLocal(hex);
    return rgbToHexLocal(c.r + (255 - c.r) * amt, c.g + (255 - c.g) * amt, c.b + (255 - c.b) * amt);
  }
  function darkenHex(hex, amt){
    var c = hexToRgbLocal(hex);
    return rgbToHexLocal(c.r * (1 - amt), c.g * (1 - amt), c.b * (1 - amt));
  }

  var MAP_FILTERS = [
    {
      id: 'grayInk',
      name: '무채색 잉크 (K70·C12)',
      build: function(){
        var major = cmykToHex(0.12, 0, 0, 0.70);           // K70 C12 계열 진한 회색
        var minor = lightenHex(major, 0.20 + Math.random() * 0.10); // 큰 길보다 20~30% 더 연하게
        return {
          majorColor: major,
          majorCasing: darkenHex(major, 0.18),
          minorColor: minor,
          minorCasing: darkenHex(minor, 0.18),
          widthMultiplier: 1 + (0.01 + Math.random() * 0.09), // 길 두께 1~10% 더 크게
          textColor: '#000000',
          fontMultiplier: 1 + ((Math.random() * 20 - 10) / 100), // 글자 크기 ±10%
          markerType: 'building',
          markerColor: '#e0483a'
        };
      }
    },
    {
      id: 'tiltedIso',
      name: '기울어진 3D 아이소메트릭',
      build: function(){
        var tiltDir = Math.random() < 0.5 ? 'left' : 'right';
        var deg = (6 + Math.random() * 8) * (tiltDir === 'left' ? -1 : 1); // 길 전체를 6~14도 눕힘
        var palette = ['#e0483a', '#d9432f', '#c8402f', '#e2543f'];
        return {
          mapSkewDeg: deg,             // 길·건물·글자 전체를 비스듬히 눕혀서 기운 느낌을 줌
          markerType: 'isoBuilding',   // 위치 마커를 입체 빌딩 아이콘으로
          markerColor: palette[Math.floor(Math.random() * palette.length)]
        };
      }
    }
  ];
  function pickRandomMapFilterConfig(){
    var f = MAP_FILTERS[Math.floor(Math.random() * MAP_FILTERS.length)];
    return f.build();
  }

  // ---------- 2) Overpass(OSM) 벡터 데이터 → SVG (도로·건물 새로 그리기 + 이름 라벨) ----------
  var SVG_W = 1000, SVG_H = 750;
  var RADIUS_M = 190;               // 반경을 좁혀서(예전 260m→190m) 더 확대된, 큼직한 지도가 되도록 함
  var PXPM = (Math.min(SVG_W, SVG_H) / 2 - 50) / RADIUS_M; // 미터당 픽셀

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

  function pathPixelLength(points){
    var len = 0;
    for (var i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  function centroid(points){
    var sx = 0, sy = 0;
    points.forEach(function(p){ sx += p[0]; sy += p[1]; });
    return [sx / points.length, sy / points.length];
  }

  // 도로는 실제로 쿼리한 반경보다 훨씬 멀리까지 뻗어있는 경우가 많음(예: 지나가는 큰 도로가
  // 화면 밖 먼 곳까지 이어짐). SVG는 viewBox 밖도 그냥 다 그려버려서 그대로 두면 길이 액자
  // 밖으로 뚫고 나가 보임 — 그래서 프레임(0,0)-(SVG_W,SVG_H) 경계에서 실제로 선을 잘라냄
  // (Cohen–Sutherland 직선 클리핑). 잘린 결과가 여러 조각으로 끊길 수 있어 배열의 배열로 반환.
  function outCode(x, y, xmin, ymin, xmax, ymax){
    var code = 0;
    if (x < xmin) code |= 1; else if (x > xmax) code |= 2;
    if (y < ymin) code |= 4; else if (y > ymax) code |= 8;
    return code;
  }
  function clipSegment(x0, y0, x1, y1, xmin, ymin, xmax, ymax){
    var oc0 = outCode(x0, y0, xmin, ymin, xmax, ymax);
    var oc1 = outCode(x1, y1, xmin, ymin, xmax, ymax);
    while (true) {
      if (!(oc0 | oc1)) return [x0, y0, x1, y1];
      if (oc0 & oc1) return null;
      var out = oc0 || oc1;
      var x, y;
      if (out & 8) { x = x0 + (x1 - x0) * (ymax - y0) / (y1 - y0); y = ymax; }
      else if (out & 4) { x = x0 + (x1 - x0) * (ymin - y0) / (y1 - y0); y = ymin; }
      else if (out & 2) { y = y0 + (y1 - y0) * (xmax - x0) / (x1 - x0); x = xmax; }
      else { y = y0 + (y1 - y0) * (xmin - x0) / (x1 - x0); x = xmin; }
      if (out === oc0) { x0 = x; y0 = y; oc0 = outCode(x0, y0, xmin, ymin, xmax, ymax); }
      else { x1 = x; y1 = y; oc1 = outCode(x1, y1, xmin, ymin, xmax, ymax); }
    }
  }
  function clipPolylineToFrame(points, xmin, ymin, xmax, ymax){
    var runs = [], current = [];
    function endRun(){ if (current.length >= 2) runs.push(current); current = []; }
    for (var i = 0; i < points.length - 1; i++) {
      var seg = clipSegment(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], xmin, ymin, xmax, ymax);
      if (!seg) { endRun(); continue; }
      var a = [seg[0], seg[1]], b = [seg[2], seg[3]];
      if (!current.length) { current.push(a, b); continue; }
      var last = current[current.length - 1];
      if (Math.abs(last[0] - a[0]) < 0.01 && Math.abs(last[1] - a[1]) < 0.01) current.push(b);
      else { endRun(); current.push(a, b); }
    }
    endRun();
    return runs;
  }

  // 라벨을 도로 중간 지점에, 그 구간 방향을 따라 살짝 기울여 붙임
  function roadLabelPlacement(points){
    var idx = Math.floor(points.length / 2);
    if (idx < 1) idx = 1;
    if (idx >= points.length) idx = points.length - 1;
    var p0 = points[idx - 1], p1 = points[idx];
    var mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    var angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return { pos: mid, angle: angle };
  }

  function escapeXml(s){
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var MAJOR_ROADS = { motorway:1, trunk:1, primary:1, secondary:1, tertiary:1, motorway_link:1, trunk_link:1, primary_link:1, secondary_link:1, tertiary_link:1 };
  var PATH_ROADS = { footway:1, path:1, cycleway:1, pedestrian:1, steps:1, track:1 };
  function roadStyle(highwayType, styleConfig){
    var mult = (styleConfig && styleConfig.widthMultiplier) || 1;
    // 큰 길 3배, 작은 길 3배 두껍게(예전 10/7 → 30/21) — 필터가 있으면 색과 배수를 그걸로 덮어씀
    if (MAJOR_ROADS[highwayType]) {
      var majorStroke = (styleConfig && styleConfig.majorColor) || '#f4b942';
      var majorCasing = (styleConfig && styleConfig.majorCasing) || '#c98f1d';
      var majorWidth = 30 * mult;
      return { stroke: majorStroke, width: majorWidth, dash: null, casing: majorCasing, casingWidth: majorWidth + 9 * mult, major: true };
    }
    if (PATH_ROADS[highwayType]) {
      var pathWidth = 4 * mult;
      return { stroke: '#cfd6dc', width: pathWidth, dash: '10 7', casing: null, casingWidth: 0, major: false };
    }
    var minorStroke = (styleConfig && styleConfig.minorColor) || '#ffffff';
    var minorCasing = (styleConfig && styleConfig.minorCasing) || '#c9cfd6';
    var minorWidth = 21 * mult;
    return { stroke: minorStroke, width: minorWidth, dash: null, casing: minorCasing, casingWidth: minorWidth + 9 * mult, major: false }; // 주거/기타 도로
  }

  // 건물 모양 마커 — "랜덤 지도 만들기" 필터에서 위치 마커로 사용. 뾰족한 핀 대신 작은 빌딩
  // 실루엣(창문 몇 개 + 문)으로, 바닥 중앙이 정확한 위치 지점에 오도록 함(핀의 뾰족한 끝과 같은 기준)
  function buildBuildingMarkerSvg(cx, cy, color){
    var s = 5.9;
    var tx = cx - 12 * s, ty = cy - 22 * s;
    return '<g transform="translate(' + tx.toFixed(1) + ',' + ty.toFixed(1) + ') scale(' + s.toFixed(3) + ')" data-name="marker-building">'
      + '<rect x="3" y="6" width="18" height="16" rx="1.2" fill="' + color + '" stroke="#ffffff" stroke-width="0.6"/>'
      + '<rect x="6" y="9" width="3" height="3" fill="#ffffff" opacity="0.85"/>'
      + '<rect x="10.5" y="9" width="3" height="3" fill="#ffffff" opacity="0.85"/>'
      + '<rect x="15" y="9" width="3" height="3" fill="#ffffff" opacity="0.85"/>'
      + '<rect x="6" y="13.5" width="3" height="3" fill="#ffffff" opacity="0.85"/>'
      + '<rect x="15" y="13.5" width="3" height="3" fill="#ffffff" opacity="0.85"/>'
      + '<rect x="9.7" y="16.5" width="4.6" height="5.5" fill="#ffffff" opacity="0.9"/>'
      + '</g>';
  }

  // 입체(아이소메트릭) 빌딩 아이콘 마커 — 지붕(밝은 회백색) + 정면(밝은 톤) + 측면(어두운 톤)
  // 3면이 다 보이는 작은 타워 모양, 층을 나누는 흰 줄무늬까지 넣어서 실제 3D 렌더링처럼 보이게 함.
  // 바닥 중앙(정면-측면이 만나는 가운데 지점)이 정확한 위치 지점(cx,cy)에 오도록 배치함.
  function buildIsoBuildingMarkerSvg(cx, cy, color){
    var s = 4.3; // 전체 높이가 대략 150~160px 정도 되도록
    var tx = cx - 10 * s, ty = cy - 40 * s;
    var frontColor = color;
    var sideColor = darkenHex(color, 0.30);
    var roofColor = lightenHex(color, 0.72);
    // 로컬 좌표: 정면 사각형(0,10)-(20,10)-(20,40)-(0,40), 측면은 (10,-6)만큼 뒤로 밀어 돌출
    var front = [[0, 10], [20, 10], [20, 40], [0, 40]];
    var side = [[20, 10], [30, 4], [30, 34], [20, 40]];
    var roof = [[0, 10], [20, 10], [30, 4], [10, 4]];
    var stripeLevels = [18, 26, 34];
    var stripes = stripeLevels.map(function(yf){
      var yBack = yf - 6; // 측면 쪽으로 갈수록 6만큼 위로(원근감)
      return '<line x1="0" y1="' + yf + '" x2="30" y2="' + yBack + '" stroke="#ffffff" stroke-width="0.5" opacity="0.55"/>';
    }).join('');
    return '<g transform="translate(' + tx.toFixed(1) + ',' + ty.toFixed(1) + ') scale(' + s.toFixed(3) + ')" data-name="marker-iso-building">'
      + '<path d="' + pathD(side, true) + '" fill="' + sideColor + '" stroke="' + darkenHex(sideColor, 0.15) + '" stroke-width="0.5" data-name="marker-side"/>'
      + '<path d="' + pathD(front, true) + '" fill="' + frontColor + '" stroke="' + darkenHex(frontColor, 0.15) + '" stroke-width="0.5" data-name="marker-front"/>'
      + stripes
      + '<path d="' + pathD(roof, true) + '" fill="' + roofColor + '" stroke="' + darkenHex(roofColor, 0.15) + '" stroke-width="0.5" data-name="marker-roof"/>'
      + '</g>';
  }

  // Overpass 응답(elements)을 카테고리별로 나눈 뒤 SVG 문자열로 조립.
  // 레이어 순서(아래→위): 배경 → 물/공원 → 건물(사각형) → 작은 길 → 큰 길 → 글자 라벨 → 위치 마커
  // styleConfig가 있으면(랜덤 지도 만들기) 색상/두께/글자/마커를 그 값으로 덮어씀

  function buildVectorMapSvg(elements, centerLat, centerLon, styleConfig){
    var metersPerDegLat = 111320;
    var metersPerDegLon = 111320 * Math.cos(centerLat * Math.PI / 180);
    var landuseParts = [], buildingParts = [], minorRoadParts = [], majorRoadParts = [], labelParts = [];
    var usedRoadNames = {}; // 같은 도로 이름이 여러 조각(way)으로 나뉘어 있어도 라벨은 한 번만
    var hasAny = false;

    var cx = SVG_W / 2, cy = SVG_H / 2;
    var fontMult = (styleConfig && styleConfig.fontMultiplier) || 1;
    var roadLabelColor = (styleConfig && styleConfig.textColor) || '#5a4632';
    var buildingLabelColor = (styleConfig && styleConfig.textColor) || '#3a3a3a';

    // 길·건물·글자 각각에(마커는 제외) 개별적으로 붙이는 "기울임" transform. 화면 세로 중심(cy)을
    // 기준으로 기울여서 마커가 놓이는 정중앙 지점은 그대로 유지되고, 참고 이미지처럼 길이 좌우로
    // 비스듬히 눕는 느낌을 줌. 전체를 하나의 <g>로 묶지 않고 요소마다 따로 붙이는 이유는, 하나로
    // 묶어버리면 그 안의 길·건물이 낱개로 선택 안 되는 그룹이 돼버리기 때문(편집 가능해야 함).
    var skewT = (styleConfig && styleConfig.mapSkewDeg)
      ? ('translate(0,' + cy + ') skewX(' + styleConfig.mapSkewDeg + ') translate(0,' + (-cy) + ')')
      : '';
    function withSkew(extra){
      var t = skewT + (extra ? (skewT ? ' ' : '') + extra : '');
      return t ? (' transform="' + t + '"') : '';
    }

    elements.forEach(function(el){
      if (!el || el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
      var pts = el.geometry.map(function(g){ return project(g.lat, g.lon, centerLat, centerLon, metersPerDegLat, metersPerDegLon); });
      var tags = el.tags || {};

      if (tags.building) {
        // 요청대로 실제 윤곽 대신 깔끔한 사각형(바운딩 박스)으로 표시, 프레임 밖으로 못 나가게 clamp
        var minX = Math.max(0, Math.min.apply(null, pts.map(function(p){ return p[0]; })));
        var maxX = Math.min(SVG_W, Math.max.apply(null, pts.map(function(p){ return p[0]; })));
        var minY = Math.max(0, Math.min.apply(null, pts.map(function(p){ return p[1]; })));
        var maxY = Math.min(SVG_H, Math.max.apply(null, pts.map(function(p){ return p[1]; })));
        if (maxX - minX < 1 || maxY - minY < 1) return;
        buildingParts.push('<rect x="' + minX.toFixed(1) + '" y="' + minY.toFixed(1) + '" width="' + (maxX - minX).toFixed(1) + '" height="' + (maxY - minY).toFixed(1) + '" fill="#e3e8ec" stroke="#aab5bf" stroke-width="1.4"' + withSkew() + ' data-name="building"/>');
        hasAny = true;
        if (tags.name) {
          var c = [(minX + maxX) / 2, (minY + maxY) / 2];
          var bFontSize = (26 * fontMult).toFixed(1), bHalo = (6 * fontMult).toFixed(1);
          labelParts.push(
            '<text x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '" font-family="Pretendard, sans-serif" font-size="' + bFontSize + '" font-weight="600" fill="' + buildingLabelColor + '" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="' + bHalo + '" stroke-linejoin="round"' + withSkew() + '>' + escapeXml(tags.name) + '</text>'
          );
        }
      } else if (tags.highway) {
        var st = roadStyle(tags.highway, styleConfig);
        var runs = clipPolylineToFrame(pts, 0, 0, SVG_W, SVG_H);
        if (!runs.length) return;
        var bucket = st.major ? majorRoadParts : minorRoadParts;
        runs.forEach(function(run){
          var d = pathD(run, false);
          if (st.casing) bucket.push('<path d="' + d + '" fill="none" stroke="' + st.casing + '" stroke-width="' + st.casingWidth + '" stroke-linecap="round" stroke-linejoin="round"' + withSkew() + ' data-name="road-casing"/>');
          bucket.push('<path d="' + d + '" fill="none" stroke="' + st.stroke + '" stroke-width="' + st.width + '" stroke-linecap="round" stroke-linejoin="round"' + (st.dash ? (' stroke-dasharray="' + st.dash + '"') : '') + withSkew() + ' data-name="road"/>');
        });
        hasAny = true;

        if (tags.name && !usedRoadNames[tags.name]) {
          // 라벨은 잘린 조각들 중 가장 긴 구간을 골라 붙임
          var longest = runs.reduce(function(best, r){ return pathPixelLength(r) > pathPixelLength(best) ? r : best; }, runs[0]);
          if (pathPixelLength(longest) > 70) {
            usedRoadNames[tags.name] = true;
            var lp = roadLabelPlacement(longest);
            var rotatePart = lp.angle ? ('rotate(' + lp.angle.toFixed(1) + ',' + lp.pos[0].toFixed(1) + ',' + lp.pos[1].toFixed(1) + ')') : '';
            var rFontSize = (34 * fontMult).toFixed(1), rHalo = (9 * fontMult).toFixed(1);
            labelParts.push(
              '<text x="' + lp.pos[0].toFixed(1) + '" y="' + lp.pos[1].toFixed(1) + '" font-family="Pretendard, sans-serif" font-size="' + rFontSize + '" font-weight="700" fill="' + roadLabelColor + '" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="' + rHalo + '" stroke-linejoin="round"' + withSkew(rotatePart) + '>' + escapeXml(tags.name) + '</text>'
            );
          }
        }
      } else if (tags.natural === 'water') {
        landuseParts.push('<path d="' + pathD(pts, true) + '" fill="#a9d3e5" stroke="none"' + withSkew() + ' data-name="water"/>');
        hasAny = true;
      } else if (tags.leisure === 'park' || tags.landuse === 'grass') {
        landuseParts.push('<path d="' + pathD(pts, true) + '" fill="#cfe8c9" stroke="none"' + withSkew() + ' data-name="park"/>');
        hasAny = true;
      }
    });

    if (!hasAny) return null;

    var marker;
    if (styleConfig && styleConfig.markerType === 'isoBuilding') {
      marker = buildIsoBuildingMarkerSvg(cx, cy, styleConfig.markerColor || '#e0483a');
    } else if (styleConfig && styleConfig.markerType === 'building') {
      marker = buildBuildingMarkerSvg(cx, cy, styleConfig.markerColor || '#e0483a');
    } else {
      // 뒤집힌 물방울(핀) 모양 마커(기본) — 24x24 기준 좌표로 만든 뒤, 뾰족한 끝(정확한 위치
      // 지점)이 (cx,cy)에 딱 맞도록 옮기고 키움. 마커는 기울임(skew)의 영향을 받지 않고
      // 항상 똑바로 서 있음(참고 이미지처럼 길만 눕고 건물 아이콘은 똑바로 서 있는 모습).
      var pinScale = 5.9; // 핀 전체 높이가 대략 130px 정도 되도록
      var pinTx = cx - 12 * pinScale;
      var pinTy = cy - 22 * pinScale;
      marker = '<g transform="translate(' + pinTx.toFixed(1) + ',' + pinTy.toFixed(1) + ') scale(' + pinScale.toFixed(3) + ')" data-name="marker">'
        + '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="#ff3b30" stroke="#ffffff" stroke-width="0.6" fill-rule="evenodd" data-name="marker-pin"/>'
        + '</g>';
    }

    return {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" width="' + SVG_W + '" height="' + SVG_H + '">'
        + '<rect x="0" y="0" width="' + SVG_W + '" height="' + SVG_H + '" fill="#f4f6f8" data-name="bg"/>'
        + landuseParts.join('')
        + buildingParts.join('')
        + minorRoadParts.join('')
        + majorRoadParts.join('')
        + labelParts.join('')
        + marker
        + '</svg>',
      landuseCount: landuseParts.length,
      buildingCount: buildingParts.length
    };
  }

  // 같은 주소로 스타일만 바꿔 다시 만들 때(특히 "랜덤 지도 만들기" 반복 클릭) VWorld·Overpass를
  // 매번 다시 부르지 않도록, 마지막으로 성공한 좌표+원본 벡터 데이터를 주소별로 기억해둠.
  // 주소가 바뀌면 자동으로 새로 가져오고, 같은 주소면 그 자리에서 바로 스타일만 다시 그림.
  var locationCache = null; // { address, lat, lon, elements }

  function fetchLocationData(address){
    var normalized = address.trim();
    if (locationCache && locationCache.address === normalized) {
      return Promise.resolve({ lat: locationCache.lat, lon: locationCache.lon, elements: locationCache.elements, fromCache: true });
    }
    return geocodeAddress(normalized).then(function(hit){
      if (!hit) return null;
      var query = buildOverpassQuery(bboxFromCenter(hit.lat, hit.lon));
      return fetchOverpass(query, 12000).then(function(data){
        var elements = (data && data.elements) || [];
        locationCache = { address: normalized, lat: hit.lat, lon: hit.lon, elements: elements };
        return { lat: hit.lat, lon: hit.lon, elements: elements, fromCache: false };
      }).catch(function(err){
        console.error('Overpass 오류:', err);
        // Overpass만 실패한 경우 — 좌표는 살아있지만 벡터 데이터가 없으니 캐시는 남기지 않고
        // (다음에 다시 시도할 수 있게) 래스터 대체용으로만 좌표를 넘김
        return { lat: hit.lat, lon: hit.lon, elements: null, fromCache: false, overpassFailed: true };
      });
    });
  }

  // ---------- 3) 대체용 Geoapify 고해상도 사진식 지도(래스터) ----------
  function buildStaticMapUrl(lat, lon){
    return 'https://maps.geoapify.com/v1/staticmap'
      + '?style=osm-bright'
      + '&width=900&height=650'
      + '&scaleFactor=3'
      + '&format=png'
      + '&center=lonlat:' + lon + ',' + lat
      + '&zoom=16.5'
      + '&marker=lonlat:' + lon + ',' + lat + ';type:awesome;color:%23ff3b30;size:70'
      + '&apiKey=' + encodeURIComponent(GEOAPIFY_API_KEY);
  }

  function applyPrettyFilter(img){
    img.filters = [
      new fabric.Image.filters.Saturation({ saturation: 0.35 }),
      new fabric.Image.filters.Contrast({ contrast: 0.08 }),
      new fabric.Image.filters.Brightness({ brightness: 0.04 })
    ];
    img.applyFilters();
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
      applyPrettyFilter(img);

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

  function geocodeAndBuild(address, styleConfig){
    fetchLocationData(address).then(function(loc){
      if (!loc) {
        setBusy(false);
        alert('주소를 찾을 수 없어요. 도로명 주소(예: "테헤란로 152") 또는 지번 주소로 다시 시도해보세요.');
        return;
      }
      setBusy(true, loc.fromCache ? '🗺 새 스타일로 다시 그리는 중...' : '🗺 길·건물 새로 그리는 중...');

      function fallbackToRaster(reasonPrefix){
        setBusy(true, '🗺 대체 지도 불러오는 중...');
        insertRasterMapToCanvas(buildStaticMapUrl(loc.lat, loc.lon), address, reasonPrefix);
      }

      if (loc.elements && loc.elements.length && EP.importSvgIntoCanvas) {
        var built = buildVectorMapSvg(loc.elements, loc.lat, loc.lon, styleConfig);
        if (built) {
          EP.importSvgIntoCanvas(built.svg, {
            viewportCenter: true,
            onEmpty: function(){ fallbackToRaster('벡터 지도를 그리지 못해서'); },
            onDone: function(){
              setBusy(false);
              mapInputToolbarHint.textContent = '지도가 추가됐어요. 도로·건물·글자가 모두 낱개 도형이라 클릭해서 색·크기를 바꾸거나 지울 수 있어요.';
            }
          });
          return;
        }
      }
      fallbackToRaster(loc.overpassFailed ? '실시간 벡터 지도 서버 응답이 없어서' : '이 주변엔 OSM 건물·도로 데이터가 부족해서');
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

  if (randomMapBtn) {
    randomMapBtn.addEventListener('click', function(){
      if (busy) return;
      var address = (mapAddressInput.value || '').trim();
      if (!address) { mapAddressInput.focus(); return; }
      setBusy(true, '🎲 주소 찾는 중...');
      geocodeAndBuild(address, pickRandomMapFilterConfig());
    });
  }
})();
