const express = require('express');
const opentype = require('opentype.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// [성능 향상] 캐시 객체: 변환 결과를 메모리에 저장
const cache = new Map();

app.post('/convert', (req, res) => {
    const { text, weight, font } = req.body;
    
    // 1. 유효성 검사
    if (!text) return res.status(400).json({ error: '텍스트가 없습니다.' });
    
    const fontName = font || 'Pretendard';
    const weightName = weight || 'Regular';

    // 2. 폰트 폴더 경로
    const fontsDir = path.join(__dirname, 'fonts');
    
    // 폴더가 없으면 에러 방지
    if (!fs.existsSync(fontsDir)) {
        return res.status(500).json({ error: 'fonts 폴더가 존재하지 않습니다.' });
    }

    // 3. 파일 자동 검색: 파일명에 fontName과 weightName이 포함된 파일 찾기
    const files = fs.readdirSync(fontsDir);
    const targetFile = files.find(file => 
        file.toLowerCase().includes(fontName.toLowerCase()) && 
        file.toLowerCase().includes(weightName.toLowerCase())
    );

    if (!targetFile) {
        return res.status(404).json({ error: `폰트 파일을 찾을 수 없습니다: ${fontName}-${weightName}` });
    }

    const fontPath = path.join(fontsDir, targetFile);

    // 4. 캐시 확인
    const cacheKey = `${text}-${targetFile}`;
    if (cache.has(cacheKey)) {
        return res.json({ pathData: cache.get(cacheKey) });
    }

    // 5. 폰트 로드 및 데이터 생성
    opentype.load(fontPath, (err, fontData) => {
        if (err) return res.status(500).json({ error: '폰트 로드 실패' });
        
        try {
            // 기본 크기를 72로 설정하여 경로 데이터 추출
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
