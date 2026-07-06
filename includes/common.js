// 1. 검색 데이터
const searchData = [
    { "name":"명함", "url":"/products/namecard.html" },
    { "name":"박명함", "url":"/products/parkcard.html" },
    { "name":"카드명함", "url":"/products/namecard.html" },
    { "name":"수입지", "url":"/products/parkcard.html" },
    { "name":"하드지", "url":"/products/namecard.html" },
    { "name":"벨벨", "url":"/products/parkcard.html" },
    { "name":"저렴한", "url":"/products/namecard.html" },
    { "name":"회사", "url":"/products/parkcard.html" },
];

/**
 * [핵심] 헤더가 로드된 후 호출할 초기화 함수
 */
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterSearch);
    }
    
    // URL에 검색어가 있는지 확인 후 자동 실행
    checkUrlAndSearch();
}

// URL 검색 파라미터 체크 함수
function checkUrlAndSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');

    if (query) {
        const input = document.getElementById('searchInput');
        if (input) {
            input.value = query;
            renderResults(query);
        }
    }
}

// 검색어 입력 시 호출
function filterSearch() {
    const inputVal = document.getElementById('searchInput').value;
    renderResults(inputVal);
}

// 결과 렌더링
function renderResults(query){
    const resultArea = document.getElementById('searchResultArea');
    if (!resultArea) return;

    if(query.length === 0){
        resultArea.classList.remove('active');
        resultArea.innerHTML = '';
        return;
    }

    const filtered = searchData.filter(item => item.name.includes(query));

    if(filtered.length > 0){
        const visibleCount = window.innerWidth <= 768 ? 3 : 6;
        const visibleItems = filtered.slice(0, visibleCount);
        const hiddenItems = filtered.slice(visibleCount);

        const visibleHtml = visibleItems.map(item => 
            `<a href="${item.url}?q=${encodeURIComponent(query)}" class="result-item">${item.name}</a>`
        ).join(' | ');

        const hiddenHtml = hiddenItems.map(item => 
            `<a href="${item.url}?q=${encodeURIComponent(query)}" class="result-item">${item.name}</a>`
        ).join(' | ');

        resultArea.innerHTML = `
            ${visibleHtml}
            ${hiddenItems.length > 0 
                ? `<span class="hidden-results"> | ${hiddenHtml} </span>
                   <button class="more-btn" onclick="toggleResults(this)">+${hiddenItems.length} 더보기</button>` 
                : ''
            }
        `;
        resultArea.classList.add('active');
    } else {
        resultArea.innerHTML = '<span>검색 결과가 없습니다.</span>';
        resultArea.classList.add('active');
    }
}

// 더보기/접기 토글
function toggleResults(btn){
    const hidden = btn.parentElement.querySelector('.hidden-results');
    if(hidden.classList.contains('show')){
        hidden.classList.remove('show');
        btn.textContent = '+' + hidden.querySelectorAll('.result-item').length + ' 더보기';
    } else {
        hidden.classList.add('show');
        btn.textContent = '접기';
    }
}

// 즉시 실행으로 묶지 않고, 헤더 로드 시 initSearch()를 외부에서 호출하는 방식입니다.
