// =================================================================
// [수정 구역 1] 기본 정책 설정
// =================================================================
const DELIVERY_FEE = 3000; // 배송비 수정 시 여기만 바꾸세요

// =================================================================
// [수정 구역 2] 가격 계산 공식 (로직 수정)
// =================================================================
function calcPrice(product, w, h, qty) {
    const area = w * h;

    // 500매 기준 단가 계산식
    const price500 = (product.base500 + (product.areaRate * area) - 100);
    
    // 1000매 기준 단가 계산식
    const price1000 = price500 * (1.445 - (0.0000002 * area));

    // 수량별 가격 적용 로직
    let finalPrice = 0;
    if (qty <= 500) {
        finalPrice = price500;
    } else if (qty <= 1000) {
        finalPrice = price1000;
    } else {
        const multiplier = Math.ceil(qty / 1000);
        finalPrice = price1000 * multiplier;
    }

    // =============================================================
    // [수정 구역 3] 마진 및 최종 보정
    // =============================================================
    // 마진률 적용 (JSON 데이터의 marginRate 사용)
    finalPrice = finalPrice * (1 + (product.marginRate / 100));
    
    // 최종 금액 합산
    finalPrice = finalPrice + DELIVERY_FEE;

    return Math.round(finalPrice);
}

// =================================================================
// [수정 구역 4] 서버 메인 엔진 (건드릴 일 거의 없음)
// =================================================================
export default {
    async fetch(request) {
        // CORS 프리플라이트 요청 처리
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }});
        }

        try {
            const { productCode, w, h, qty } = await request.json();
            
            // 데이터 파일에서 최신 정보를 가져옴
            const response = await fetch("https://sowonnamoo.github.io/myjs/formulas.json");
            const PRODUCTS = await response.json();
            
            const product = PRODUCTS[productCode];
            if (!product) throw new Error("상품 코드를 찾을 수 없습니다.");
            
            const price = calcPrice(product, w, h, qty);
            
            return new Response(JSON.stringify({ 
                price, 
                name: product.name 
            }), {
                headers: { 
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*" 
                }
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { 
                status: 500,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }
    }
};
