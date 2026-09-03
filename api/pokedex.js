export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image } = req.body || {};

        // 🔒 安全關鍵：從 Vercel 雲端後台的秘密保險箱（環境變數）讀取金鑰
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('[Gemini] Missing GEMINI_API_KEY');
            return res.status(500).json({ error: '伺服器尚未設定 Gemini API Key' });
        }

        if (!image || typeof image !== 'string') {
            return res.status(400).json({ error: '圖片資料不完整，請重新上傳' });
        }

        const promptText = `你是一位資深的寶可夢生態學家，在玉虹市（Celadon City）大學擔任教授。請觀察附帶圖片，這是一個剛被發現的神秘生命體。
        請根據圖片中的生物特徵，嚴格依照以下 JSON 格式建立合理的、充滿幻想與寶可夢世界設定的生態圖鑑資料。
        絕對禁止提及：1. 這是條線或塗鴉。2. 這是人類孩童畫的。3. 關於繪畫風格、字跡、白紙背景、表情符號等文字。
        act as if you are observing a living, biological creature in the wild via advanced scanning technology.
        文案要融入神話、遠古壁畫、地形交互習慣、或者不為人知的特異機制。
        欄位必須包含（繁體中文）：
        {
            "name": "怪獸名稱(結合外型特徵與屬性諧音，避免公版名稱)",
            "category": "分類(如：天線寶可夢、重甲寶可夢、神秘忠犬寶可夢)",
            "type": "屬性組合(1~2個屬性，必須邏輯上符合視覺特徵)",
            "ability": "特性名稱(1個符合特徵的特性)",
            "height": 數字(合理的身高，單位公尺),
            "weight": 數字(合理的體重),
            "moves": ["招式1", "招式2", "罕見招式"],
            "description": "約120字偽科學、帶有幻想與傳說色彩的生態描述。請描述牠覓食時的奇特機制、情緒高漲時身體（如耳朵或尾巴）會有什麼不為人知的變化、或者與古代遺跡的神秘關聯。讓文案讀起來像官方圖鑑。"
        }`;

        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: "image/jpeg", data: image } }
                    ]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    maxOutputTokens: 1024,
                    thinkingConfig: { thinkingLevel: "minimal" }
                }
            })
        };

        const modelPlans = [
            { model: "gemini-3.1-flash-lite", retryDelays: [] },
            { model: "gemini-3.6-flash", retryDelays: [600, 1400] }
        ];
        const retryableStatuses = new Set([429, 500, 502, 503, 504]);
        let response;
        let upstreamError = '';

        modelLoop:
        for (const { model, retryDelays } of modelPlans) {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

            for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
                response = await fetch(apiUrl, requestOptions);

                if (response.ok) break modelLoop;

                upstreamError = await response.text();
                console.error(
                    `[Gemini] ${model} attempt ${attempt + 1} failed with ${response.status}: ${upstreamError}`
                );

                if (!retryableStatuses.has(response.status)) {
                    break modelLoop;
                }

                if (attempt === retryDelays.length) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
            }
        }

        if (!response.ok) {
            const status = response.status;
            const message = status === 429
                ? 'Gemini 使用量已達上限，請稍後再試'
                : status >= 500
                    ? 'Gemini 目前忙碌中，請稍後再試'
                    : 'Gemini 無法分析這張圖片';

            return res.status(status).json({ error: message });
        }

        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.find(part => part.text)?.text;

        if (!jsonText) {
            console.error('[Gemini] Response did not contain JSON text:', JSON.stringify(result));
            return res.status(502).json({ error: 'Gemini 回傳的圖鑑資料不完整' });
        }
        
        // 把乾淨的怪獸資料回傳給前端
        return res.status(200).json(JSON.parse(jsonText));

    } catch (error) {
        console.error('[Pokedex API] Unexpected error:', error);
        return res.status(500).json({ error: '圖鑑分析時發生錯誤，請稍後再試' });
    }
}
