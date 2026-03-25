export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST lazım kanka!' });

    const NVIDIA_API_KEY = process.env.NVIDIA_APIKEY;    
    const TAVILY_API_KEY = process.env.TVLY_APIKEY;

    // SENİN SİSTEM PROMPTUN (HİÇ DOKUNMADIM)
    const SYSTEM_PROMPT = `Senin adın "Miro AI". miracthedev tarafından geliştirilen; kullanıcı dostu, eğlenceli ve her konuda uzman bir yapay zekasın.`;

    const body = req.body;
    const { action = 'chat', messages = [], query = '', tarih = '', saat = '', personaContext = '', titleMode = false } = body;

    // === TAVİLY ===
    if (action === 'search') {
        try {
            const tavilyRes = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: TAVILY_API_KEY, query, max_results: 5, include_answer: true })
            });
            const searchData = await tavilyRes.json();
            return res.status(200).json(searchData);
        } catch (err) {
            return res.status(502).json({ error: "Tavily patladı" });
        }
    }

    // === TAM OLARAK SENİN İSTEDİĞİN DİNAMİK PROMPT MANTIĞI ===
    let dinamikPrompt = SYSTEM_PROMPT;
    if (personaContext) {
        dinamikPrompt += `\n\n[Bunlar mesajlaştığın kullanıcının bilgileri. Bu bilgileri kullanıcı bilgisi gereken yerlerde kullanabilirsin. Boşuna belirtmene gerek yok. Bu kullanıcıyı geliştiricin ile karıştırma. Bu normal bir kullanıcı]: ${personaContext}`;
    }
    if (tarih && saat) {
        dinamikPrompt += `\n\n[Sistem Anlık Zaman Bilgisi]: Tarih: ${tarih}, Saat: ${saat} . Kullanıcı yıl/ay/gün/saat ile ilgili birşey sormadığı sürece bu bilgileri kullanmana gerek yok.`;
    }

    const nvidiaPayload = {
        model: 'qwen/qwen3.5-122b-a10b',
        messages: titleMode 
            ? [{ role: 'system', content: '4 kelimelik başlık üret.' }, { role: 'user', content: messages[0]?.content || '' }]
            : [{ role: 'system', content: dinamikPrompt }, ...messages],
        max_tokens: titleMode ? 30 : 6096,
        temperature: 0.5,
        extra_body: titleMode ? {} : { thinking: { type: 'enabled' } }
    };

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`
            },
            body: JSON.stringify(nvidiaPayload)
        });

        const finalData = await response.json(); // "result" değil, çakışma bitti.

        if (finalData.choices && finalData.choices[0].message) {
            const msg = finalData.choices[0].message;
            const reasoning = msg.reasoning_content || msg.reasoning || '';
            const content = msg.content || '';
            if (reasoning) {
                finalData.choices[0].message.content = `<think>\n${reasoning}\n</think>\n\n${content}`;
            }
        }

        return res.status(200).json(finalData);
    } catch (err) {
        return res.status(502).json({ error: "NVIDIA error" });
    }
}
