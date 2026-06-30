const express = require('express');
const opentype = require('opentype.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// [성능 향상] 캐시 객체
const cache = new Map();

app.post('/convert', (req, res) => {
    // 프론트엔드에서 { text: "내용", weight: "Bold", font: "Pretendard" } 형태로 요청
    const { text, weight, font } = req.body;
    
    // 1. 기본값 설정 및 유효성 검사
    if (!text) return res.status(400).json({ error: '텍스트가 없습니다.' });
    
    const fontName = font || 'Pretendard';
    const weightName = weight || 'Regular';
    const fileName = `${fontName}-${weightName}.ttf`;
    const fontPath = path.join(__dirname, 'fonts', fileName);

    // 2. 폰트 파일 존재 여부 확인
    if (!fs.existsSync(fontPath)) {
        return res.status(404).json({ error: `폰트 파일을 찾을 수 없습니다: ${fileName}` });
    }

    // 3. 캐시 확인
    const cacheKey = `${text}-${fileName}`;
    if (cache.has(cacheKey)) {
        return res.json({ pathData: cache.get(cacheKey) });
    }

    // 4. 폰트 로드 및 데이터 생성
    opentype.load(fontPath, (err, fontData) => {
        if (err) return res.status(500).json({ error: '폰트 로드 실패' });
        
        try {
            const pathData = fontData.getPath(text, 0, 0, 72).toPathData();
            
            // 캐시 저장
            cache.set(cacheKey, pathData);
            
            res.json({ pathData });
        } catch (e) {
            res.status(500).json({ error: '경로 데이터 변환 실패' });
        }
    });
});

app.get('/convert', (req, res) => res.status(200).send("Server is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버가 ${PORT}번 포트에서 실행 중입니다!`));
