document.addEventListener('DOMContentLoaded', () => {
    
    // 검색 데이터
    const searchData = [
        { "name":"명함", "url":"/products/namecard.html" },
        { "name":"박명함", "url":"/products/parkcard.html" },
        { "name":"카드명함", "url":"/products/namecard.html" },
        { "name":"수입지명함", "url":"/products/parkcard.html" },
        { "name":"하드지명함", "url":"/products/namecard.html" },
        { "name":"벨벨명함", "url":"/products/parkcard.html" },
        { "name":"저렴한명함", "url":"/products/namecard.html" },
        { "name":"회사명함", "url":"/products/parkcard.html" },
    ];

    // 1. 페이지 로드 시 URL 파라미터 검색어 처리
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    const searchInput = document.getElementById('searchInput');

    if (query && searchInput) {
        searchInput.value = query;
        renderResults(query);
    }

    // 2. 검색창 입력 시 이벤트 연결 (방어 코드 포함)
    if (searchInput) {
        searchInput.addEventListener('input', filterSearch);
    }

    // 검색 실행 함수 (Enter 키 등으로 실행 시)
    window.executeSearch = function() {
        const query = searchInput ? searchInput.value : "";
        const filtered = searchData.filter(item => item.name.includes(query));

        if (filtered.length > 0 && filtered[0].name === query) {
            window.location.href = filtered[0].url + '?q=' + encodeURIComponent(query);
        }
    };
});

// 검색 결과 필터링 함수
function filterSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    renderResults(input.value);
}

// 결과 렌더링 함수
function renderResults(query) {
    const resultArea = document.getElementById('searchResultArea');
    if (!resultArea) return;

    if (query.length === 0) {
        resultArea.classList.remove('active');
        resultArea.innerHTML = '';
        return;
    }

    const filtered = searchData.filter(item => item.name.includes(query));

    if (filtered.length > 0) {
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
            ${hiddenItems.length ? `
                <span class="hidden-results" style="display:none;"> | ${hiddenHtml}</span>
                <button class="more-btn" onclick="toggleResults(this)">+${hiddenItems.length} 더보기</button>
            ` : ''}
        `;
        resultArea.classList.add('active');
    } else {
        resultArea.innerHTML = '<span>검색 결과가 없습니다.</span>';
        resultArea.classList.add('active');
    }
}

// 더보기 토글 함수
function toggleResults(btn) {
    const hidden = btn.parentElement.querySelector('.hidden-results');
    if (hidden.style.display === 'inline') {
        hidden.style.display = 'none';
        btn.textContent = '+' + hidden.querySelectorAll('.result-item').length + ' 더보기';
    } else {
        hidden.style.display = 'inline';
        btn.textContent = '접기';
    }
}
