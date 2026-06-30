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
