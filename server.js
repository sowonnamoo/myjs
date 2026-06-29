const express = require('express');
const opentype = require('opentype.js');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// 폰트 파일 매핑 (아까 정했던 그 9개 파일들)
const fontFiles = {
   const fontFiles = {
    'Regular': 'Pretendard-Regular.ttf',
    'Bold': 'Pretendard-Bold.ttf',
    'Light': 'Pretendard-Light.ttf',
    'Medium': 'Pretendard-Medium.ttf',
    'SemiBold': 'Pretendard-SemiBold.ttf',
    'ExtraBold': 'Pretendard-ExtraBold.ttf',
    'Black': 'Pretendard-Black.ttf',
    'Thin': 'Pretendard-Thin.ttf',
    'ExtraLight': 'Pretendard-ExtraLight.ttf'
};

app.post('/convert', (req, res) => {
    const { text, weight } = req.body;
    const fontPath = path.join(__dirname, 'fonts', fontFiles[weight] || 'Pretendard-Regular.ttf');

    opentype.load(fontPath, (err, font) => {
        if (err) return res.status(500).send('폰트 로드 실패');
        const pathData = font.getPath(text, 0, 0, 72).toPathData();
        res.json({ pathData });
    });
});

app.listen(process.env.PORT || 3000, () => console.log('서버 작동 중!'));
