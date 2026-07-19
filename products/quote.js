/**
 * quote.js - 견적 데이터 수집 및 견적서 인쇄 창 호출
 * @description 01my.html 화면에 지금 선택되어 있는 옵션/가격을 그대로 모아
 * print.html 새 창으로 전달합니다. "견적서 출력" 버튼(#printQuoteBtn) 클릭 시 동작합니다.
 */

function getOrderQuoteData() {
    const priceText = document.getElementById('priceDisplay')?.textContent || "0";
    const totalPrice = priceText.replace(/[^0-9]/g, '');

    // ---- 일반 옵션 그룹들 (예: 명함양면/금박 등) - 라벨: 선택값 형태로 수집 ----
    const groupDetails = [];
    document.querySelectorAll('#dynamicOptionsContainer .option-row').forEach(row => {
        const label = row.querySelector('.label')?.textContent?.trim() || "";
        const select = row.querySelector('select');
        const value = select ? (select.options[select.selectedIndex]?.value || "") : "";
        if (label && value) groupDetails.push(`${label}: ${value}`);
    });

    // ---- 후가공 (다중 선택 + 서브옵션 색상 등이 있으면 함께 표시) ----
    const finishings = [];
    document.querySelectorAll('.finishing-select').forEach(sel => {
        if (!sel.value) return; // "선택안함"은 value=""
        const row = sel.closest('.option-row');
        const subSelect = row ? row.querySelector('.finishing-sub-select') : null;
        const subValue = subSelect ? subSelect.value : "";
        finishings.push(subValue ? `${sel.value}(${subValue})` : sel.value);
    });

    // 상품명: 선택된 일반 옵션 값들을 이어붙여 구성 (예: "명함양면 / 즉시인쇄")
    const productName = groupDetails.length
        ? groupDetails.map(d => d.split(': ').slice(1).join(': ')).join(' / ')
        : "명함";

    return {
        productName,
        groupDetails,
        finishings,
        size: {
            width: document.getElementById('widthInput')?.value || "0",
            height: document.getElementById('heightInput')?.value || "0"
        },
        qty: document.getElementById('qtySelect')?.value || "0",
        count: document.getElementById('setCountInput')?.value || "1",
        weight: document.getElementById('weightDisplay')?.textContent || "",
        totalPrice
    };
}

function printQuote() {
    const data = getOrderQuoteData();
    const params = new URLSearchParams({
        product: data.productName,
        options: data.groupDetails.join(', '),
        finishings: data.finishings.join(', '),
        size: `${data.size.width}x${data.size.height}mm`,
        qty: data.qty,
        count: data.count,
        weight: data.weight,
        price: data.totalPrice
    });
    window.open(`print.html?${params.toString()}`, '_blank', 'width=900,height=1000');
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('printQuoteBtn');
    if (btn) {
        btn.addEventListener('click', printQuote);
    }
});
