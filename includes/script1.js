const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvas = document.getElementById('canvas');
const guideText = document.getElementById('guide-text');

// 업로드 영역 클릭 시 파일 선택
dropZone.addEventListener('click', () => fileInput.click());

// 파일 선택 시 처리
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

// 드래그 앤 드롭 이벤트
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.background = '#e9e9e9';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.background = '#f9f9f9';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.background = '#f9f9f9';
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

// 파일 읽기 및 표시 로직
function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        canvas.src = e.target.result;
        canvas.style.display = 'block';
        guideText.style.display = 'none'; // 안내 텍스트 숨김
        dropZone.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}