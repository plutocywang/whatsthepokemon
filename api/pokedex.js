export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image } = req.body;
        
        // 🔒 安全關鍵：從 Vercel 雲端後台的秘密保險箱（環境變數）讀取金鑰
        const apiKey = process.env.GEMINI_API_KEY;
        const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

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

        const response = await fetch(apiUrl, {
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
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: "Gemini Remote Server Error" });
        }

        const result = await response.json();
        const jsonText = result.candidates[0].content.parts[0].text;
        
        // 把乾淨的怪獸資料回傳給前端
        return res.status(200).json(JSON.parse(jsonText));

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
