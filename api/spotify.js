export default async function handler(req, res) {
  const { url, download_type } = req.query;

  // ==========================================
  // JIKA DIMINTA DOWNLOAD FILE (PROXY)
  // ==========================================
  if (download_type) {
    const { file_url, filename } = req.query;
    if (!file_url) return res.status(400).json({ error: "URL file kosong" });

    try {
      // Ambil file asli dari SpotiDown
      const fileResponse = await fetch(file_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://spotidown.app/"
        }
      });

      if (!fileResponse.ok) throw new Error("Gagal mengambil file dari sumber");

      // Paksa browser buat download pakai nama ini
      const safeFilename = encodeURIComponent(filename || "spotify_track.mp3");
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
      
      // Set tipe konten
      if (download_type === 'audio') res.setHeader('Content-Type', 'audio/mpeg');
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
  // LOGIKA ASLI SCRAPER SPOTIFY (TETAP UTUH)
  // ==========================================
  if (!url) {
    return res.status(400).json({ error: "Link Spotify kosong!" });
  }

  const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  
  const serializeData = (obj) => new URLSearchParams(obj).toString();

  const scraperFetch = async (options, serverName) => {
    const method = (options.method || (options.data ? "POST" : "GET")).toUpperCase();
    const headers = { ...options.headers };
    if (!headers["User-Agent"]) headers["User-Agent"] = CHROME_UA;

    let body = undefined;
    if (options.data) {
      if (typeof options.data === "object" && !headers["Content-Type"]?.includes("x-www-form-urlencoded")) {
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
      
      if (options.rawResponse) {
        return { status: fetchRes.status, headers: Object.fromEntries(fetchRes.headers.entries()), data: textData };
      }
      try { return JSON.parse(textData); } catch (e) { return textData; }
    } catch (error) {
      throw new Error(`${serverName} Request Failed: ${error.message}`);
    }
  };

  const getCookiesFromHeaders = (headers) => {
    const setCookie = headers["set-cookie"];
    if (!setCookie) return "";
    return setCookie.map(c => c.split(";")[0]).join("; ");
  };

  try {
    const r1 = await scraperFetch({
      url: "https://spotidown.app/",
      headers: { "User-Agent": CHROME_UA },
      rawResponse: true,
    }, "SpotiDown Main");
    
    const cookies = getCookiesFromHeaders(r1.headers);
    
    const data = { url: url };
    const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi;
    let match;
    while ((match = inputRegex.exec(r1.data)) !== null) {
      const name = match[1];
      const value = match[2];
      if (name && name !== "url") data[name] = value;
    }
    data["g-recaptcha-response"] = "dummy_token";

    const r2Headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": CHROME_UA,
      Origin: "https://spotidown.app",
      Referer: "https://spotidown.app/",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (cookies) r2Headers["Cookie"] = cookies;

    const r2 = await scraperFetch({
      url: "https://spotidown.app/action",
      method: "POST",
      data: serializeData(data),
      headers: r2Headers,
      rawResponse: true,
    }, "SpotiDown Action");

    let r2Data = r2.data;
    try { r2Data = JSON.parse(r2Data); } catch (e) {}

    if (r2Data.error) throw new Error(r2Data.message || "Spotify error");

    let finalHtml = r2Data.data || r2Data;
    
    const data2 = {};
    const form2Regex = /<form[^>]*name=["']submitspurl["'][^>]*>([\s\S]*?)<\/form>/i;
    const form2Match = finalHtml.match(form2Regex);
    
    if (form2Match) {
      const input2Regex = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi;
      let match2;
      while ((match2 = input2Regex.exec(form2Match[1])) !== null) {
        data2[match2[1]] = match2[2];
      }
      data2["g-recaptcha-response"] = "dummy_token";

      const r3Headers = { ...r2Headers };
      const r3 = await scraperFetch({
        url: "https://spotidown.app/action/track",
        method: "POST",
        data: serializeData(data2),
        headers: r3Headers,
        rawResponse: true,
      }, "SpotiDown Track");

      let r3Data = r3.data;
      try { r3Data = JSON.parse(r3Data); } catch (e) {}
      finalHtml = r3Data.data || r3Data;
    }

    const titleMatch = finalHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Spotify Track";
    
    const artistMatch = finalHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const artist = artistMatch ? artistMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    
    const imgMatch = finalHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    const thumbnail = imgMatch ? imgMatch[1] : "";

    const downloads = [];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch;
    while ((aMatch = aRegex.exec(finalHtml)) !== null) {
      const link = aMatch[1];
      const text = aMatch[2].replace(/<[^>]+>/g, "").trim();
      if (link && link.startsWith("http") && !link.includes("premium.html") && text !== "Download Another Song") {
        downloads.push({ type: text || "MP3", url: link });
      }
    }

    if (downloads.length === 0) throw new Error("Link MP3 tidak ditemukan.");

    // ==========================================
    // KIRIM HASIL KE FRONTEND
    // ==========================================
    const rawAudioUrl = downloads[0].url;

    res.status(200).json({
      success: true,
      title: artist ? `${artist} - ${title}` : title,
      artist: artist,
      thumbnail: thumbnail,
      // Ganti URL jadi nembak Proxy
      audio_url: `/api/spotify?download_type=audio&file_url=${encodeURIComponent(rawAudioUrl)}`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}