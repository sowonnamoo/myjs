const canvas = new fabric.Canvas('c');

async function addText() {
    // 1. 입력창과 선택창에서 값 가져오기
    const text = document.getElementById('textInput').value;
    const weight = document.getElementById('weightSelect').value;

    // 2. 서버로 요청 보내기
    const response = await fetch('https://myeongserver.onrender.com/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, weight: weight })
    });

    const data = await response.json();

    // 3. 서버에서 받은 Path 데이터로 캔버스에 그리기
    const path = new fabric.Path(data.pathData, {
        left: 100, 
        top: 100, 
        fill: 'black'
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






