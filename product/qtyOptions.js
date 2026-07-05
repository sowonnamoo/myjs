// qtyOptions.js
const qtyData = [
    { value: "200", multi: 0.9, label: "200매" },
    { value: "500", multi: 1.0, label: "500매" },
    { value: "1000", multi: 1.9, label: "1000매" },
    { value: "2000", multi: 3.8, label: "2000매" },
    { value: "3000", multi: 5.4, label: "3000매" },
    { value: "4000", multi: 7.2, label: "4000매" },
    { value: "5000", multi: 8.5, label: "5000매" },
    { value: "6000", multi: 10.1, label: "6000매" },
    { value: "7000", multi: 11.1, label: "7000매" },
    { value: "8000", multi: 12.1, label: "8000매" },
    { value: "9000", multi: 13.1, label: "9000매" },
    { value: "10000", multi: 14.1, label: "10000매" }
    // 여기서 필요한 만큼 추가/수정하세요
];

function loadQtyOptions() {
    const select = document.getElementById('qtySelect');
    select.innerHTML = ''; // 기존 내용 삭제
    qtyData.forEach(item => {
        const option = document.createElement('option');
        option.value = item.value;
        option.dataset.multi = item.multi;
        option.textContent = item.label;
        select.appendChild(option);
    });
}