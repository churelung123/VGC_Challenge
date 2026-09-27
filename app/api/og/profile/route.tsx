import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getCustomBackground } from '@/src/serverless/database';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function convertFancyUnicodeToAscii(str: string): string {
  if (!str) return '';
  let result = '';
  for (const char of str) {
    const cp = char.codePointAt(0);
    if (!cp) continue;
    if (cp >= 0x1D400 && cp <= 0x1D7FF) {
      if (cp >= 0x1D7CE) {
        result += String.fromCharCode(0x30 + ((cp - 0x1D7CE) % 10));
      } else {
        const blockBases = [0x1D400, 0x1D434, 0x1D468, 0x1D49C, 0x1D4D0, 0x1D504, 0x1D538, 0x1D56C, 0x1D5A0, 0x1D5D4, 0x1D608, 0x1D63C, 0x1D670];
        let converted = false;
        for (const base of blockBases) {
          if (cp >= base && cp < base + 52) {
            const offset = cp - base;
            if (offset < 26) {
              result += String.fromCharCode(0x41 + offset);
            } else {
              result += String.fromCharCode(0x61 + (offset - 26));
            }
            converted = true;
            break;
          }
        }
        if (!converted) result += char;
      }
    } else if (cp >= 0xFF01 && cp <= 0xFF5E) {
      result += String.fromCharCode(cp - 0xFEE0);
    } else if (cp >= 0x24B6 && cp <= 0x24CF) {
      result += String.fromCharCode(0x41 + (cp - 0x24B6));
    } else if (cp >= 0x24D0 && cp <= 0x24E9) {
      result += String.fromCharCode(0x61 + (cp - 0x24D0));
    } else {
      const supMap: Record<string, string> = {
        '\u02E0': 'y', '\u02E1': 'l', '\u02E2': 's', '\u02E3': 'x', '\u02E4': 'r',
        '\u1D43': 'a', '\u1D47': 'b', '\u1D48': 'd', '\u1D49': 'e', '\u1D4B': 'g', '\u1D4C': 'h', '\u1D4D': 'i', '\u1D4E': 'j', '\u1D4F': 'k', '\u1D50': 'm', '\u1D52': 'o', '\u1D56': 'p', '\u1D57': 't', '\u1D58': 'u', '\u1D5B': 'v', '\u1D5D': 'w', '\u1D62': 'i', '\u1D63': 'r', '\u1D64': 'u', '\u1D65': 'v',
        '\u1D74': 't', '\u1D88': 'u', '\u2070': '0', '\u2071': 'i', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
        '\u207F': 'n', '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4', '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
        '\u2102': 'C', '\u2107': 'E', '\u2109': 'F', '\u210A': 'g', '\u210B': 'H', '\u210C': 'H', '\u210D': 'H', '\u210E': 'h', '\u210F': 'h', '\u2110': 'I', '\u2111': 'I', '\u2112': 'L', '\u2113': 'l', '\u2115': 'N', '\u2118': 'P', '\u2119': 'P', '\u211A': 'Q', '\u211B': 'R', '\u211C': 'R', '\u211D': 'R', '\u2124': 'Z', '\u2128': 'Z', '\u212C': 'B', '\u212D': 'C', '\u212F': 'e', '\u2130': 'E', '\u2131': 'F', '\u2133': 'M', '\u2134': 'o'
      };
      result += supMap[char] || char;
    }
  }
  return result.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '').trim();
}

function isRenderableChar(char: string): boolean {
  const cp = char.codePointAt(0);
  if (!cp) return false;
  if ((cp >= 0x0020 && cp <= 0x024F) || (cp >= 0x1EA0 && cp <= 0x1EF9)) return true;
  if ((cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF)) return true;
  return false;
}

function normalizeFancyText(str: string, usernameFallback?: string): string {
  const converted = convertFancyUnicodeToAscii(str);
  let filtered = '';
  for (const char of converted) {
    if (isRenderableChar(char)) {
      filtered += char;
    }
  }
  filtered = filtered.trim();
  if (filtered.length >= 1) {
    return filtered;
  }
  
  if (usernameFallback) {
    const cleanUsername = convertFancyUnicodeToAscii(usernameFallback);
    let filteredUsername = '';
    for (const char of cleanUsername) {
      if (isRenderableChar(char)) filteredUsername += char;
    }
    filteredUsername = filteredUsername.trim();
    if (filteredUsername.length >= 1) return filteredUsername;
    return usernameFallback;
  }
  return 'Trainer';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    const byte = bytes[i];
    if (byte !== undefined) binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function fetchImageAsDataUri(url: string, timeoutMs: number = 2000): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (url.includes('pximg.net')) {
      headers['Referer'] = 'https://www.pixiv.net/';
    } else if (url.includes('discordapp.com') || url.includes('discord.com')) {
      headers['Referer'] = 'https://discord.com/';
    }

    const res = await fetch(url, { headers, signal: createTimeoutSignal(timeoutMs) });
    if (!res.ok) {
      console.warn(`Fetch image failed (${res.status}): ${url}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`Lỗi khi fetch image base64 (${url}):`, err);
    return null;
  }
}

let cachedFontBold: Buffer | null = null;
let cachedFontRegular: Buffer | null = null;
let cachedFontDisplay: Buffer | null = null;

function readFontCached(file: string, cache: Buffer | null): Buffer | null {
  if (cache) return cache;
  try {
    const p = path.join(process.cwd(), 'public', 'fonts', file);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch (e) {
    console.error(`Lỗi đọc font ${file}:`, e);
  }
  return null;
}

function getFontsLocal(): { bold: Buffer | null; regular: Buffer | null; display: Buffer | null } {
  cachedFontBold = readFontCached('BeVietnamPro-Bold.ttf', cachedFontBold);
  cachedFontRegular = readFontCached('BeVietnamPro-Regular.ttf', cachedFontRegular);
  cachedFontDisplay = readFontCached('Outfit-Bold.ttf', cachedFontDisplay);
  return { bold: cachedFontBold, regular: cachedFontRegular, display: cachedFontDisplay };
}

/* ── RYUSEI BROADCAST design tokens ────────────────────────────────────── */
const INK = '#0A0A12';
const PAPER = '#F5F2EA';
const MUTED = '#8B8BA7';
const GOLD = '#FFC24D';
const WIN = '#4ADE80';
const LOSS = '#FF5C6C';
const DRAW = '#FFD23F';
const HAIR = 'rgba(245,242,234,0.12)';
const EMBER_GRAD = 'linear-gradient(120deg, #FF4D4D 0%, #FF8A3D 52%, #FFC24D 100%)';
const DEFAULT_BG = 'linear-gradient(120deg, #2A2130 0%, #1A1622 52%, #12111A 100%)';
const TEXT_SHADOW = '0 2px 6px rgba(0,0,0,0.88), 0 0 3px rgba(0,0,0,0.85)';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawName = searchParams.get('name') || 'Trainer';
    const usernameFallback = searchParams.get('username') || undefined;
    const name = normalizeFancyText(rawName, usernameFallback);
    const avatar = searchParams.get('avatar') || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const rankText = searchParams.get('rank') || 'Unranked';
    const badge = searchParams.get('badge') || '🏅';
    const elo = searchParams.get('elo') || '1000';
    const win = searchParams.get('w') || '0';
    const loss = searchParams.get('l') || '0';
    const draw = searchParams.get('d') || '0';
    const ryucoin = searchParams.get('ryucoin') || '0';
    
    let rawWp = searchParams.get('wp') || 'default';
    for (let i = 0; i < 3; i++) {
      if (rawWp.includes('%3A') || rawWp.includes('%2F') || rawWp.includes('%25')) {
        try {
          const decoded = decodeURIComponent(rawWp);
          if (decoded === rawWp) break;
          rawWp = decoded;
        } catch { break; }
      }
    }

    // Extract full URL if wp was unencoded and truncated at query param '?'
    if (!rawWp.startsWith('http')) {
      const fullReqUrl = req.url;
      const wpMatch = fullReqUrl.indexOf('wp=');
      if (wpMatch !== -1) {
        let extractedWp = fullReqUrl.slice(wpMatch + 3);
        const nextParamIdx = extractedWp.search(/&(t|name|avatar|rank|badge|elo|w|l|d|ryucoin)=/);
        if (nextParamIdx !== -1) {
          extractedWp = extractedWp.slice(0, nextParamIdx);
        }
        for (let i = 0; i < 3; i++) {
          if (extractedWp.includes('%3A') || extractedWp.includes('%2F') || extractedWp.includes('%25')) {
            try {
              const decoded = decodeURIComponent(extractedWp);
              if (decoded === extractedWp) break;
              extractedWp = decoded;
            } catch { break; }
          }
        }
        if (extractedWp.startsWith('http')) {
          rawWp = extractedWp;
        }
      }
    }

    const wNum = Number(win);
    const lNum = Number(loss);
    const dNum = Number(draw);
    const validMatches = wNum + lNum;
    const wrOverride = searchParams.get('wr');
    const winRate = wrOverride !== null ? Number(wrOverride) : (validMatches > 0 ? Math.round((wNum / validMatches) * 100) : 0);

    const WALLPAPERS: Record<string, string> = {
      'default': DEFAULT_BG,
      'img1': '/wallpapers/img1.png',
      'img2': '/wallpapers/img2.png',
      'img3': '/wallpapers/img3.jpg',
      'img4': '/wallpapers/img4.jpg',
      'img5': '/wallpapers/img5.jpg',
    };

    // Parallel fetching for avatar and custom background
    const avatarPromise = (async () => {
      if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
        const fetched = await fetchImageAsDataUri(avatar, 3500);
        if (fetched) return fetched;
      }
      return avatar;
    })();

    const defaultBg = WALLPAPERS['default'] || 'linear-gradient(135deg, #1E1E2E 0%, #0F0F1A 100%)';

    const backgroundPromise = (async (): Promise<{ style: string; isImage: boolean }> => {
      const userId = searchParams.get('userId');

      // 1. Ưu tiên 1: Tải ảnh background tùy chỉnh từ Database (nếu đã set qua /set-background)
      if (userId) {
        try {
          const customBg = await getCustomBackground(userId);
          if (customBg && customBg.imageData) {
            return { style: `data:${customBg.mimeType || 'image/png'};base64,${customBg.imageData}`, isImage: true };
          }
        } catch (err) {
          console.error('Lỗi fetch custom background từ database:', err);
        }
      }

      // 2. Ưu tiên 2: Preset wallpapers từ local filesystem (img1, img2, img3, img4, img5...)
      const presetPath = WALLPAPERS[rawWp];
      if (presetPath && presetPath.startsWith('/')) {
        try {
          const filePath = path.join(process.cwd(), 'public', presetPath);
          if (fs.existsSync(filePath)) {
            const fileBuf = fs.readFileSync(filePath);
            const ext = path.extname(filePath).substring(1).toLowerCase();
            const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
            return { style: `data:${mimeType};base64,${fileBuf.toString('base64')}`, isImage: true };
          }
        } catch (err) {
          console.error(`Lỗi đọc local wallpaper (${presetPath}):`, err);
        }
      }

      // 3. Ưu tiên 3: Tải từ link HTTP/HTTPS bên ngoài nếu wp chứa URL trực tiếp
      if (rawWp.startsWith('http://') || rawWp.startsWith('https://')) {
        const dataUri = await fetchImageAsDataUri(rawWp, 4000);
        if (dataUri) {
          return { style: dataUri, isImage: true };
        }
      }

      // 4. Fallback về gradient/CSS wallpaper mặc định
      const fallbackStyle = (presetPath && !presetPath.startsWith('/'))
        ? presetPath
        : defaultBg;

      return { style: fallbackStyle, isImage: false };
    })();

    const [avatarToUse, bgResult] = await Promise.all([
      avatarPromise,
      backgroundPromise,
    ]);

    const { bold: fontBold, regular: fontRegular, display: fontDisplay } = getFontsLocal();
    const backgroundStyle = bgResult.style;
    const isImageBg = bgResult.isImage;

    const nameLength = name.length;
    let nameFontSize = '60px';
    if (nameLength > 18) nameFontSize = '34px';
    else if (nameLength > 12) nameFontSize = '46px';
    else if (nameLength > 8) nameFontSize = '52px';

    const fontsOption: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] = [];
    if (fontBold) fontsOption.push({ name: 'Be Vietnam Pro', data: fontBold, weight: 700, style: 'normal' });
    if (fontRegular) fontsOption.push({ name: 'Be Vietnam Pro', data: fontRegular, weight: 400, style: 'normal' });
    if (fontDisplay) fontsOption.push({ name: 'Outfit', data: fontDisplay, weight: 700, style: 'normal' });

    const hasFonts = fontsOption.length > 0;
    const bodyFont = hasFonts ? '"Be Vietnam Pro", sans-serif' : 'sans-serif';
    const numFont = fontDisplay ? '"Outfit", "Be Vietnam Pro", sans-serif' : bodyFont;
    const fontFamilyValue = bodyFont;

    const renderCard = (avatarSrc: string, bgToUse: string, isImage: boolean) => {
      const bgContainerStyle = isImage ? 'black' : bgToUse;

      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              position: 'relative',
              background: bgContainerStyle,
              fontFamily: fontFamilyValue,
              color: PAPER,
              overflow: 'hidden',
            }}
          >
            {/* Ảnh nền + lớp phủ tối để chữ dễ đọc */}
            {isImage && (
              <img
                src={bgToUse}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, objectFit: 'cover', width: '100%', height: '100%' }}
              />
            )}
            {isImage && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(8,8,16,0.30) 0%, rgba(8,8,16,0.20) 48%, rgba(8,8,16,0.10) 100%)' }} />
            )}
            {/* Khí quyển: quầng sáng ember ấm + quầng lạnh đối trọng */}
            <div style={{ position: 'absolute', top: '-140px', left: '-90px', width: '540px', height: '540px', borderRadius: '50%', background: `radial-gradient(circle, rgba(255,138,61,${isImage ? 0.16 : 0.3}) 0%, rgba(255,138,61,0) 70%)` }} />
            <div style={{ position: 'absolute', bottom: '-160px', right: '-110px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(76,110,245,0.14) 0%, rgba(76,110,245,0) 70%)' }} />
            {/* Dải sao băng ký hiệu (Ryusei) */}
            {/* 
            <div style={{ position: 'absolute', top: '92px', left: '-120px', width: '980px', height: '2px', transform: 'rotate(-18deg)', background: 'linear-gradient(90deg, rgba(255,194,77,0) 0%, rgba(255,194,77,0.55) 72%, rgba(255,194,77,0) 100%)' }} />
            <div style={{ position: 'absolute', top: '150px', left: '-140px', width: '1560px', height: '3px', transform: 'rotate(-18deg)', background: 'linear-gradient(90deg, rgba(255,77,77,0) 0%, #FF8A3D 44%, #FFC24D 60%, rgba(255,194,77,0) 100%)', boxShadow: '0 0 26px rgba(255,138,61,0.6)' }} />
            */}
            {/* Khung viewfinder + góc nhấn */}
            <div style={{ position: 'absolute', top: '18px', left: '18px', right: '18px', bottom: '18px', border: `1px solid ${HAIR}`, borderRadius: '20px' }} />
            <div style={{ position: 'absolute', top: '18px', left: '18px', width: '46px', height: '46px', borderTop: `3px solid ${GOLD}`, borderLeft: `3px solid ${GOLD}`, borderTopLeftRadius: '20px' }} />
            <div style={{ position: 'absolute', bottom: '18px', right: '18px', width: '46px', height: '46px', borderBottom: `3px solid ${GOLD}`, borderRight: `3px solid ${GOLD}`, borderBottomRightRadius: '20px' }} />
            {/* Nội dung */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', height: '100%', padding: '50px 64px' }}>
              {/* Chân dung */}
              <div style={{ display: 'flex', position: 'relative', flexShrink: 0 }}>
                <div style={{ display: 'flex', padding: '4px', borderRadius: '50%', background: EMBER_GRAD, boxShadow: '0 0 36px rgba(255,138,61,0.45)' }}>
                  <img
                    src={avatarSrc}
                    alt="Avatar"
                    style={{ width: '214px', height: '214px', borderRadius: '50%', objectFit: 'cover', border: `4px solid ${INK}` }}
                  />
                </div>
                {/* Huy hiệu hạng */}
                <div style={{ position: 'absolute', bottom: '-18px', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '58px', height: '58px', borderRadius: '50%', background: INK, border: `3px solid ${GOLD}`, boxShadow: '0 8px 20px rgba(0,0,0,0.55)' }}>
                  <span style={{ fontSize: '30px' }}>{badge}</span>
                </div>
              </div>
              {/* Cột thông tin */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: '58px', height: '100%', justifyContent: 'center', overflow: 'hidden', textShadow: TEXT_SHADOW }}>
                {/* Hàng trên: tên + hạng / ryucoin */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', marginRight: '20px' }}>
                    <span style={{ display: 'flex', fontFamily: bodyFont, fontSize: nameFontSize, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-1px', color: PAPER, maxWidth: '560px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: TEXT_SHADOW }}>{name}</span>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: '14px' }}>
                      <div style={{ display: 'flex', width: '9px', height: '9px', borderRadius: '50%', background: GOLD, marginRight: '11px', boxShadow: `0 0 10px ${GOLD}` }} />
                      <span style={{ display: 'flex', fontFamily: bodyFont, fontSize: '22px', fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '3px' }}>{rankText}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexShrink: 0, background: 'rgba(255,194,77,0.1)', border: '1px solid rgba(255,194,77,0.35)', borderRadius: '100px', padding: '10px 20px' }}>
                    <span style={{ fontSize: '26px', marginRight: '9px' }}>🪙</span>
                    <span style={{ display: 'flex', fontFamily: numFont, fontSize: '30px', fontWeight: 700, color: GOLD }}>{ryucoin}</span>
                  </div>
                </div>
                {/* Kẻ phân cách */}
                <div style={{ display: 'flex', width: '100%', height: '1px', background: HAIR, marginTop: '22px', marginBottom: '22px' }} />
                {/* Bảng chỉ số */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <span style={{ display: 'flex', fontFamily: numFont, fontSize: '15px', fontWeight: 700, color: MUTED, letterSpacing: '4px' }}>ELO</span>
                    <span style={{ display: 'flex', fontFamily: numFont, fontSize: '86px', fontWeight: 700, lineHeight: 1, color: GOLD, textShadow: '0 2px 6px rgba(0,0,0,0.88), 0 0 30px rgba(255,138,61,0.5)' }}>{elo}</span>
                  </div>
                  <div style={{ display: 'flex', width: '1px', height: '72px', background: HAIR, marginLeft: '34px', marginRight: '34px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ display: 'flex', fontFamily: numFont, fontSize: '15px', fontWeight: 700, color: MUTED, letterSpacing: '4px' }}>WIN RATE</span>
                    <span style={{ display: 'flex', fontFamily: numFont, fontSize: '56px', fontWeight: 700, lineHeight: 1, color: PAPER }}>{winRate}%</span>
                  </div>
                  <div style={{ display: 'flex', width: '1px', height: '72px', background: HAIR, marginLeft: '34px', marginRight: '34px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ display: 'flex', fontFamily: numFont, fontSize: '15px', fontWeight: 700, color: MUTED, letterSpacing: '4px' }}>RECORD</span>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', fontFamily: numFont, fontSize: '52px', fontWeight: 700, lineHeight: 1 }}>
                      <span style={{ display: 'flex', color: WIN }}>{`${win}W`}</span>
                      <span style={{ display: 'flex', color: MUTED, marginLeft: '10px', marginRight: '10px' }}>/</span>
                      <span style={{ display: 'flex', color: LOSS }}>{`${loss}L`}</span>
                      {dNum > 0 && (
                        <span style={{ display: 'flex', color: MUTED, marginLeft: '10px', marginRight: '10px' }}>/</span>
                      )}
                      {dNum > 0 && (
                        <span style={{ display: 'flex', color: DRAW }}>{`${draw}D`}</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Thanh năng lượng win-rate */}
                <div style={{ display: 'flex', width: '100%', height: '8px', borderRadius: '100px', background: 'rgba(245,242,234,0.1)', marginTop: '24px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', width: `${Math.max(2, Math.min(100, winRate))}%`, height: '100%', borderRadius: '100px', background: EMBER_GRAD, boxShadow: '0 0 16px rgba(255,138,61,0.55)' }} />
                </div>
              </div>
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 400,
          emoji: 'twemoji',
          fonts: fontsOption,
        }
      );
    };

    try {
      return renderCard(avatarToUse, backgroundStyle, isImageBg);
    } catch (e: any) {
      console.error('Lỗi khi render profile card với custom bg:', e);
      return renderCard(avatar, WALLPAPERS['default'] || INK, false);
    }
  } catch (e: any) {
    console.error('Lỗi tổng quan khi render profile card:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
