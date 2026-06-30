const express = require('express');
const opentype = require('opentype.js');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// 폰트 파일 매핑 (아까 정했던 그 9개 파일들) / 명함서버 명령어
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
    
    // 로그 추가: 클라이언트가 보낸 값 확인
    console.log("받은 요청:", { text, weight });

    const fileName = fontFiles[weight] || 'Pretendard-Regular.ttf';
    const fontPath = path.join(__dirname, 'fonts', fileName);
    
    // 로그 추가: 실제로 찾으려는 절대 경로 확인
    console.log("찾는 파일 경로:", fontPath);

    opentype.load(fontPath, (err, font) => {
        if (err) {
            console.error("폰트 로드 오류 상세:", err); // 구체적인 에러 확인
            return res.status(500).send('폰트 로드 실패: ' + fileName);
        }
        const pathData = font.getPath(text, 0, 0, 72).toPathData();
        res.json({ pathData });
    });
});

// [추가] UptimeRobot 헬스 체크용 GET 요청  서버깨움
app.get('/convert', (req, res) => {
    res.status(200).send("Server is alive!");
});


app.listen(process.env.PORT || 3000, () => console.log('서버 작동 중!'));





