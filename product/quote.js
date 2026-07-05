/**
 * quote.js - 범용 견적 데이터 허브 및 명령전달 시스템
 * @description 웹 페이지의 주문 정보를 수집하여 견적서 인쇄 창으로 전달합니다.
 */

function getOrderQuoteData() {
    const priceText = document.getElementById('priceDisplay')?.textContent || "0";
    const totalPrice = priceText.replace(/[^0-9]/g, '');

    // 후가공 정보 수집
    const finishings = [];
    document.querySelectorAll('.finishing-select').forEach(sel => {
        if (sel.value && sel.value !== "선택안함") finishings.push(sel.value);
    });

    return {
        productInfo: {
            name: "명함", // 고정값 또는 UI 참조
            paper: document.getElementById('paperSelect')?.value || "미선택",
            ink: document.getElementById('inkSelect')?.value || "미선택",
            finishings: finishings.join(', ') // 후가공 리스트 문자열화
        },
        size: {
            width: document.getElementById('widthInput')?.value || "0",
            height: document.getElementById('heightInput')?.value || "0"
        },
        order: {
            qty: document.getElementById('qtySelect')?.value || "0",
            count: document.getElementById('setCountInput')?.value || "1",
            totalPrice: totalPrice
        }
    };
}

function printQuote() {
    const data = getOrderQuoteData();
    const params = new URLSearchParams({
        product: `${data.productInfo.name} (${data.productInfo.paper}/${data.productInfo.ink})`,
        finishings: data.productInfo.finishings, // 후가공 파라미터 추가
        size: `${data.size.width}x${data.size.height}mm`,
        qty: data.order.qty,
        count: data.order.count,
        price: data.order.totalPrice
    });
    window.open(`print.html?${params.toString()}`, '_blank', 'width=850,height=1000');
}
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('printQuoteBtn');
    if (btn) {
        btn.addEventListener('click', printQuote);
    }
});