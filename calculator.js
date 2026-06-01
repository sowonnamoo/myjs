function calcPrice(PRODUCTS, productCode, w, h, qty) {
    const DELIVERY_FEE = 3000;
    const product = PRODUCTS[productCode];
    if (!product) return 0;

    const area = w * h;
    const price500 = (product.base500 + (product.areaRate * area) - 100);
    const price1000 = price500 * (1.445 - (0.0000002 * area));

    let finalPrice = (qty <= 500) ? price500 : (qty <= 1000 ? price1000 : price1000 * Math.ceil(qty / 1000));
    finalPrice = Math.round(finalPrice * (1 + (product.marginRate / 100)) + DELIVERY_FEE);
    
    return finalPrice;
}
