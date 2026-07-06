<script>

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

window.onload = function(){

    const urlParams =
        new URLSearchParams(window.location.search);

    const query = urlParams.get('q');

    if(query){

        document.getElementById('searchInput').value =
            query;

        renderResults(query);
    }
};

function filterSearch(){

    renderResults(
        document.getElementById('searchInput').value
    );
}

function renderResults(query){

    const resultArea =
        document.getElementById('searchResultArea');

    if(query.length === 0){

        resultArea.classList.remove('active');
        resultArea.innerHTML = '';
        return;
    }

    const filtered =
        searchData.filter(item =>
            item.name.includes(query)
        );

    if(filtered.length > 0){

        const visibleCount =
            window.innerWidth <= 768 ? 3 : 6;

        const visibleItems =
            filtered.slice(0, visibleCount);

        const hiddenItems =
            filtered.slice(visibleCount);

        const visibleHtml =
            visibleItems.map(item =>
                `<a href="${item.url}?q=${encodeURIComponent(query)}" class="result-item">${item.name}</a>`
            ).join(' | ');

        const hiddenHtml =
            hiddenItems.map(item =>
                `<a href="${item.url}?q=${encodeURIComponent(query)}" class="result-item">${item.name}</a>`
            ).join(' | ');

        resultArea.innerHTML = `
            ${visibleHtml}

            ${
                hiddenItems.length
                ? `
                <span class="hidden-results">
                    | ${hiddenHtml}
                </span>

                <button
                    class="more-btn"
                    onclick="toggleResults(this)">
                    +${hiddenItems.length} 더보기
                </button>
                `
                : ''
            }
        `;

        resultArea.classList.add('active');

    }else{

        resultArea.innerHTML =
            '<span>검색 결과가 없습니다.</span>';

        resultArea.classList.add('active');
    }
}

function toggleResults(btn){

    const hidden =
        btn.parentElement.querySelector('.hidden-results');

    if(hidden.classList.contains('show')){

        hidden.classList.remove('show');

        btn.textContent =
            '+' +
            hidden.querySelectorAll('.result-item').length +
            ' 더보기';

    }else{

        hidden.classList.add('show');

        btn.textContent = '접기';
    }
}

function executeSearch(){

    const query =
        document.getElementById('searchInput').value;

    const filtered =
        searchData.filter(item =>
            item.name.includes(query)
        );

    if(
        filtered.length > 0 &&
        filtered[0].name === query
    ){

        window.location.href =
            filtered[0].url +
            '?q=' +
            encodeURIComponent(query);
    }
}

</script>

