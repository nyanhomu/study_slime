export default async function handler(req, res) {
    // POSTリクエスト以外は拒否
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 環境変数からAPIキーを取得
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'APIキーがサーバーに設定されていません。' });
    }

    try {
        const { prompt } = req.body;

        // サーバーから Groq API へリクエストを送信
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "あなたは優しく励ましてくれるRPG風の学習プランナーです。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();

        // 成功結果をブラウザへ返す
        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: 'AIプランの生成中にエラーが発生しました。' });
    }
}
