const canvas = new fabric.Canvas('c');

async function addText() {
    const text = document.getElementById('textInput').value;
    const weight = document.getElementById('weightSelect').value;

    const response = await fetch('https://myeongserver.onrender.com/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, weight: weight })
    });

    const data = await response.json();

    const path = new fabric.Path(data.pathData, {
        left: 100, 
        top: 100, 
        fill: 'black',
        // [추가] 나중에 수정할 때 필요함
        originalText: text, 
        originalWeight: weight 
    });
    canvas.add(path);
}

function saveSVG() {
    // 캔버스 객체에서 SVG 데이터 추출
    const svgData = canvas.toSVG();
    
    // Blob 생성 및 다운로드 실행
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'my-design.svg';
    link.click();
}


// 글삭제기능
function deleteSelected() {
    const activeObjects = canvas.getActiveObjects(); // 선택된 객체들을 가져옴
    if (activeObjects.length) {
        canvas.discardActiveObject(); // 선택 해제
        activeObjects.forEach((obj) => {
            canvas.remove(obj); // 캔버스에서 제거
        });
        canvas.renderAll(); // 다시 그리기
    } else {
        alert("삭제할 항목을 먼저 클릭하세요!");
    }
}



// 1. 좌측 정렬 함수
function alignLeft() {
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length < 2) return alert("최소 2개 이상의 객체를 선택하세요!");

    // 가장 왼쪽 기준점 잡기 (첫 번째 객체의 left 기준)
    const firstLeft = activeObjects[0].left;
    activeObjects.forEach(obj => {
        obj.set({ left: firstLeft });
    });
    canvas.renderAll();
}


// 2. 세로로 일정한 간격 정렬 함수
function distributeVertically() {
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length < 3) return alert("최소 3개 이상의 객체를 선택하세요!");

    // top 좌표순으로 정렬
    activeObjects.sort((a, b) => a.top - b.top);

    const firstTop = activeObjects[0].top;
    const lastTop = activeObjects[activeObjects.length - 1].top;
    
    // 전체 간격 나누기
    const totalSpace = lastTop - firstTop;
    const interval = totalSpace / (activeObjects.length - 1);

    activeObjects.forEach((obj, index) => {
        obj.set({ top: firstTop + (interval * index) });
    });
    canvas.renderAll();
}


// 색상추가
function changeColor(color) {
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) {
        alert("색상을 바꿀 글자를 선택해주세요!");
        return;
    }

    activeObjects.forEach(obj => {
        // 텍스트 객체라면 fill 속성을 변경
        obj.set({ fill: color });
    });
    canvas.renderAll();
}


// 글자더블클릭수정
canvas.on('mouse:dblclick', async function(options) {
    if (options.target && options.target.type === 'path') {
        const obj = options.target;
        const newText = prompt("수정할 내용을 입력하세요:", obj.originalText || "");
        
        if (newText && newText !== obj.originalText) {
            // 1. 서버에 새로운 데이터 요청
            const response = await fetch('https://myeongserver.onrender.com/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: newText, weight: obj.originalWeight })
            });
            const data = await response.json();
            
            // 2. 현재 객체의 위치와 상태 저장
            const savedLeft = obj.left;
            const savedTop = obj.top;
            const savedFill = obj.fill;
            const savedScaleX = obj.scaleX;
            const savedScaleY = obj.scaleY;

            // 3. 기존 객체 제거 후 새 객체 생성 (데이터 교체)
            canvas.remove(obj);

            const newPath = new fabric.Path(data.pathData, {
                left: savedLeft,
                top: savedTop,
                fill: savedFill,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
                originalText: newText,
                originalWeight: obj.originalWeight
            });

            canvas.add(newPath);
            canvas.setActiveObject(newPath); // 새로 만든 객체를 선택 상태로 만듦
            canvas.renderAll();
        }
    }
});


// 사각형 추가 함수
function addRectangle() {
    const rect = new fabric.Rect({
        left: 150,
        top: 150,
        fill: 'transparent', // 투명 배경
        stroke: 'black',     // 테두리 색상
        strokeWidth: 2,      // 테두리 두께
        width: 100,
        height: 100
    });
    canvas.add(rect);
}


// 원 추가 함수
function addCircle() {
    const circle = new fabric.Circle({
        left: 150,
        top: 150,
        fill: 'transparent',
        stroke: 'black',
        strokeWidth: 2,
        radius: 50           // 반지름
    });
    canvas.add(circle);
}







// 1. 도형 추가 원 사각 (테두리 제거 버전)
function addRectangle() {
    const rect = new fabric.Rect({
        left: 150, top: 150,
        fill: '#cccccc',      // 배경색 (투명하지 않게 설정)
        stroke: null,        // 테두리 제거
        strokeWidth: 0,      // 테두리 두께 0
        width: 100, height: 100,
        lockUniScaling: false 
    });
    canvas.add(rect);
}

function addCircle() {
    const ellipse = new fabric.Ellipse({
        left: 150, top: 150,
        fill: '#cccccc',      // 배경색 (투명하지 않게 설정)
        stroke: null,        // 테두리 제거
        strokeWidth: 0,      // 테두리 두께 0
        rx: 50, ry: 50,
        lockUniScaling: false
    });
    canvas.add(ellipse);
}

// 2. 크기 조절 시 실제 속성값으로 고정하는 이벤트
canvas.on('object:scaling', function(e) {
    const obj = e.target;
    
    // 사각형인 경우
    if (obj.type === 'rect') {
        obj.set({
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
            scaleX: 1,
            scaleY: 1
        });
    } 
    // 타원(Ellipse)인 경우
    else if (obj.type === 'ellipse') {
        obj.set({
            rx: obj.rx * obj.scaleX,
            ry: obj.ry * obj.scaleY,
            scaleX: 1,
            scaleY: 1
        });
    }
});


// 글자크기
function changeFontSize(scaleFactor) {
    const activeObjects = canvas.getActiveObjects();
    
    if (activeObjects.length === 0) {
        alert("크기를 조절할 객체를 선택하세요!");
        return;
    }

    activeObjects.forEach(obj => {
        // 현재 크기에 입력받은 비율을 곱함
        obj.set({
            scaleX: obj.scaleX * scaleFactor,
            scaleY: obj.scaleY * scaleFactor
        });
    });
    canvas.renderAll();
}




// 휴지통 이미지 URL (원하는 아이콘 링크로 교체 가능)
const deleteIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23ff0000'%3E%3Cpath d='M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z'/%3E%3Cpath fill-rule='evenodd' d='M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z'/%3E%3C/svg%3E";

const img = document.createElement('img');
img.src = deleteIcon;

// Fabric.js 컨트롤 커스텀
fabric.Object.prototype.controls.deleteControl = new fabric.Control({
    x: 0.5, // 위치: 객체 오른쪽
    y: -0.5, // 위치: 객체 위쪽
    offsetY: -16,
    cursorStyle: 'pointer',
    mouseUpHandler: deleteObject, // 클릭 시 삭제 함수 실행
    render: renderIcon // 아이콘 그리기
});

function deleteObject(eventData, transform) {
    const target = transform.target;
    canvas.remove(target);
    canvas.renderAll();
}

function renderIcon(ctx, left, top, styleOverride, fabricObject) {
    const size = 24;
    ctx.save();
    ctx.translate(left, top);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
}






// 배경추가
function setBackgroundImage(e) {
    const file = e.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(f) {
        fabric.Image.fromURL(f.target.result, function(img) {
            img.scaleToWidth(200); 
            canvas.add(img);
            // 추가: 이미지를 캔버스의 맨 아래 레이어로 보냄
            canvas.sendToBack(img);
            canvas.renderAll();
        });
    };
    reader.readAsDataURL(file);
}


// 맨 뒤로 보내기
function sendToBack() {
    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach(obj => canvas.sendToBack(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
}

// 맨 앞으로 가져오기
function bringToFront() {
    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach(obj => canvas.bringToFront(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
}


// 캔버스 빈 곳 클릭 시 선택 해제
canvas.on('mouse:down', function(options) {
    // 클릭한 위치에 타겟(객체)이 없는 경우
    if (!options.target) {
        canvas.discardActiveObject();
        canvas.renderAll();
    }
});



// 복제
function duplicateCanvasLayout() {
    const currentWidth = canvas.width;
    const currentHeight = canvas.height;
    
    // 1. 캔버스 높이를 현재의 2배로 확장 (기존 높이 + 현재 높이)
    canvas.setDimensions({ 
        width: currentWidth, 
        height: currentHeight * 2 
    });

    // 2. 현재 캔버스에 있는 모든 객체 가져오기
    const objects = canvas.getObjects();
    
    // 3. 각 객체를 복제하여 아래 위치(currentHeight만큼 아래)에 배치
    objects.forEach((obj) => {
        // 배경 이미지는 복제하지 않거나, 필요하다면 별도 로직 추가
        if (obj === canvas.backgroundImage) return;

        obj.clone((cloned) => {
            cloned.set({
                left: cloned.left,
                top: cloned.top + currentHeight // 높이만큼 아래로 이동
            });
            canvas.add(cloned);
        });
    });

    canvas.renderAll();
}





