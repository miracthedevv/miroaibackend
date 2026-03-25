export default async function handler(req, res) {
    // CORS Ayarları (PHP'deki header'ların aynısı)
    res.setHeader('Access-Control-Allow-Origin', '*'); // Güvenlik için daha sonra kendi siteni yazabilirsin
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Düz giriş kabul edilmez!' });
    }

    // GİZLİ BİLGİLER
    const NVIDIA_API_KEY = process.env.NVIDIA_APIKEY;    
    const TAVILY_API_KEY = process.env.TVLY_APIKEY;
    const SYSTEM_PROMPT = "Adın Miro AI";

    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Geçersiz JSON.' });

    const { action = 'chat', messages = [], query = '', tarih = '', saat = '', personaContext = '', titleMode = false } = body;

    // === TAVİLY İLE WEB'DE ARA ===
    if (action === 'search') {
        if (!query) return res.status(400).json({ error: 'Arama sorgusu boş.' });

        try {
            const tavilyRes = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: TAVILY_API_KEY,
                    query: query,
                    max_nvidiaDatas: 5,
                    search_depth: 'basic',
                    include_answer: true
                })
            });
            const data = await tavilyRes.json();
            return res.status(200).json(data);
        } catch (err) {
            return res.status(502).json({ error: "Tavily hatası" });
        }
    }

    // === NVIDIA CHAT & BAŞLIK MODU ===
    if (messages.length === 0) return res.status(400).json({ error: 'Mesaj listesi boş.' });

    let dinamikPrompt = SYSTEM_PROMPT;
    if (personaContext) dinamikPrompt += `\n\n[Bunlar mesajlaştığın kullanıcının bilgileri. Bu bilgileri kullanıcı bilgisi gereken yerlerde kullanabilirsin. Boşuna belirtmene gerek yok. Bu kullanıcıyı geliştiricin ile karıştırma. Bu normal bir kullanıcı]: ${personaContext}`;
    if (tarih && saat) dinamikPrompt += `\n\n[Sistem Anlık Zaman Bilgisi]: Tarih: ${tarih}, Saat: ${saat} . Kullanıcı yıl/ay/gün/saat ile ilgili birşey sormadığı sürece bu bilgileri kullanmana gerek yok.`;

    const nvidiaPayload = titleMode ? {
        model: 'qwen/qwen3.5-122b-a10b',
        messages: [
            { role: 'system', content: 'Aşağıdaki mesaj için maksimum 4 kelimelik, kısa ve öz bir sohbet başlığı üret. Sadece başlığı yaz.' },
            { role: 'user', content: messages[0].content }
        ],
        max_tokens: 30,
        temperature: 0.3
    } : {
        model: 'qwen/qwen3.5-122b-a10b',
        messages: [{ role: 'system', content: dinamikPrompt }, ...messages],
        max_tokens: 6096,
        temperature: 0.5,
        chat_template_kwargs: { enable_thinking: true, thinking_budget: 400 },
        extra_body: { thinking: { type: 'enabled' } }
    };

    try {
        const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`
            },
            body: JSON.stringify(nvidiaPayload)
        });

        // NVIDIA'dan gelen ham yanıtı alalım
        const nvidiaData = await nvidiaRes.json();
        // Eğer NVIDIA hata döndürdüyse (403, 401 vb.)
        if (!nvidiaRes.ok) {
            return res.status(nvidiaRes.status).json({ 
                error: "NVIDIA Hatası", 
                detail: nvidiaData 
            });
        }
        const nvidiaData = await nvidiaRes.json();

        // PHP'deki düşünce (<think>) birleştirme mantığı
        if (nvidiaData.choices && nvidiaData.choices[0].message) {
            const msg = nvidiaData.choices[0].message;
            const reasoning = msg.reasoning_content || msg.reasoning || '';
            const content = msg.content || '';
            if (reasoning) {
                nvidiaData.choices[0].message.content = `<think>\n${reasoning}\n</think>\n\n${content}`;
            }
        }

        return res.status(200).json(nvidiaData);
    } catch (err) {
        return res.status(502).json({ error: "AI Sağlayıcısı hatası" });
    }
}
