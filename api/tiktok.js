export default async function handler(req, res) {
  const { url, download_type } = req.query;
  
  // ==========================================
  // JIKA DIMINTA DOWNLOAD FILE (PROXY)
  // ==========================================
  if (download_type) {
    const { file_url, filename } = req.query;
    if (!file_url) return res.status(400).json({ error: "URL file kosong" });

    try {
      // Ambil file asli dari tiktokio
      const fileResponse = await fetch(file_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://tiktokio.com/"
        }
      });

      if (!fileResponse.ok) throw new Error("Gagal mengambil file dari sumber");

      // Paksa browser buat download pakai nama ini
      const safeFilename = encodeURIComponent(filename || "tiktok_media.mp4");
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
      
      // Set tipe konten (video atau audio)
      if (download_type === 'video') res.setHeader('Content-Type', 'video/mp4');
      else if (download_type === 'audio') res.setHeader('Content-Type', 'audio/mpeg');
      else res.setHeader('Content-Type', 'application/octet-stream');

      // Kirim stream file ke user
      const arrayBuffer = await fileResponse.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));

    } catch (error) {
      res.status(500).json({ error: "Gagal mendownload file: " + error.message });
    }
    return;
  }

  // ==========================================
  // LOGIKA ASLI SCRAPER KAMU (TETAP UTUH)
  // ==========================================
  if (!url) {
    return res.status(400).json({ error: "Link TikTok kosong!" });
  }

  const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const getCleanUrl = (u) => u.split("?")[0];

  const scraperFetch = async (options, serverName) => {
    const method = (options.method || (options.data ? "POST" : "GET")).toUpperCase();
    const headers = { ...options.headers };
    
    if (!headers["User-Agent"] && !headers["user-agent"]) headers["User-Agent"] = CHROME_UA;

    let body = undefined;
    if (options.data !== undefined) {
      if (typeof options.data === "object" && !headers["Content-Type"]?.includes("application/x-www-form-urlencoded")) {
        body = JSON.stringify(options.data);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      } else if (typeof options.data === "object") {
        body = new URLSearchParams(options.data).toString();
      } else {
        body = String(options.data);
      }
    }

    try {
      const fetchRes = await fetch(options.url, { method, headers, body });
      const textData = await fetchRes.text();

      if (options.rawResponse) return { status: fetchRes.status, headers: Object.fromEntries(fetchRes.headers.entries()), data: textData };

      try { return JSON.parse(textData); } catch (e) { return textData; }
    } catch (error) {
      throw new Error(`${serverName} Request Failed: ${error.message}`);
    }
  };

  try {
    const cleanUrl = getCleanUrl(url).split("?")[0];
    const regexTiktokUrl = /https:\/\/(?:m|www|vm|vt|lite)?\.?tiktok\.com\/((?:.*\b(?:(?:usr|v|embed|user|video|photo)\/|\?shareId=|\&item_id=)(\d+))|\w+)/;
    
    if (!regexTiktokUrl.test(cleanUrl)) throw new Error("Link bukan TikTok yang valid.");

    const resTiktokio = await scraperFetch(
      {
        url: "https://tiktokio.com/api/v1/tk/html",
        method: "POST",
        data: { vid: cleanUrl, prefix: "tiktokio.com" },
        headers: { "User-Agent": CHROME_UA, "Content-Type": "application/json", Origin: "https://tiktokio.com", Referer: "https://tiktokio.com/" },
        rawResponse: true,
      },
      "TikTokIO"
    );

    let html = resTiktokio.data;
    if (typeof html === "object" && html !== null) html = JSON.stringify(html);
    
    if (!html || typeof html !== "string" || html.includes("Please paste a valid link")) {
      throw new Error("Gagal memproses. Situs TikTokIO mungkin nge-blokir request.");
    }

    let title = "TikTok Content";
    const titleMatch = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, "").trim();

    let thumbnail = "";
    const thumbMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (thumbMatch) thumbnail = thumbMatch[1].replace(/&#38;/g, "&");

    const authorMatch = cleanUrl.match(/@([^\/]+)/);
    const author = authorMatch ? authorMatch[1] : "Unknown";
    const downloads = [];

    const anchorTagRegex = /<a[\s\S]*?<\/a>/gi;
    let anchorMatch;
    while ((anchorMatch = anchorTagRegex.exec(html)) !== null) {
      const tag = anchorMatch[0];
      if (!tag.includes("download-btn")) continue;

      const hrefM = tag.match(/href=["']([^"']+)/i);
      if (!hrefM || hrefM[1] === "#") continue;
      
      const href = hrefM[1].replace(/&#38;/g, "&");
      const innerText = tag.replace(/<[^>]+>/g, "").trim().toLowerCase();

      let label = null;
      if (innerText.includes("without watermark") || tag.includes("download-btn-blue") || tag.includes("download-btn-green")) label = "VIDEO";
      else if (innerText.includes("mp3") || innerText.includes("music") || tag.includes("download-btn-purple")) label = "MP3";

      if (label) downloads.push({ type: label, url: href });
    }

    if (downloads.length === 0) throw new Error("Link video tidak ditemukan di halaman TikTokIO.");

    // ==========================================
    // KIRIM HASIL KE FRONTEND
    // ==========================================
    // Kita ganti URL-nya agar nembak fungsi Proxy di atas, bukan link mentah tiktokio
    const rawVideoUrl = downloads.find(d => d.type === "VIDEO")?.url || "";
    const rawAudioUrl = downloads.find(d => d.type === "MP3")?.url || "";

    res.status(200).json({
      success: true,
      title: title,
      author: author,
      thumbnail: thumbnail,
      // Nanti nama filenya diurus sama Frontend (JS HTML)
      video_url: rawVideoUrl ? `/api/tiktok?download_type=video&file_url=${encodeURIComponent(rawVideoUrl)}` : "",
      audio_url: rawAudioUrl ? `/api/tiktok?download_type=audio&file_url=${encodeURIComponent(rawAudioUrl)}` : ""
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}