const express = require('express');
const opentype = require('opentype.js');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// [성능 향상] 캐시 객체: 변환 결과를 메모리에 저장
const cache = new Map();

const fontFiles = {
    'Regular': 'Pretendard-Regular.ttf', 'Bold': 'Pretendard-Bold.ttf',
    'Light': 'Pretendard-Light.ttf', 'Medium': 'Pretendard-Medium.ttf',
    'SemiBold': 'Pretendard-SemiBold.ttf', 'ExtraBold': 'Pretendard-ExtraBold.ttf',
    'Black': 'Pretendard-Black.ttf', 'Thin': 'Pretendard-Thin.ttf',
    'ExtraLight': 'Pretendard-ExtraLight.ttf'
};

app.post('/convert', (req, res) => {
    const { text, weight } = req.body;
    
    // [보안] 텍스트가 없으면 오류 방지
    if (!text) return res.status(400).send('텍스트를 입력해주세요.');

    // [성능] 캐시 키 생성 (텍스트+폰트종류)
    const cacheKey = `${text}-${weight}`;
    if (cache.has(cacheKey)) {
        console.log("캐시 사용:", cacheKey);
        return res.json({ pathData: cache.get(cacheKey) });
    }

    const fileName = fontFiles[weight] || 'Pretendard-Regular.ttf';
    const fontPath = path.join(__dirname, 'fonts', fileName);

    opentype.load(fontPath, (err, font) => {
        if (err) return res.status(500).send('폰트 로드 실패');
        
        const pathData = font.getPath(text, 0, 0, 72).toPathData();
        
        // [성능] 결과 저장 (캐시)
        cache.set(cacheKey, pathData);
        
        res.json({ pathData });
    });
});

app.get('/convert', (req, res) => res.status(200).send("Server is alive!"));

app.listen(process.env.PORT || 3000, () => console.log('서버 작동 중!'));
