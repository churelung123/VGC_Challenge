import { NextRequest } from 'next/server';
import { getCustomThumbnail } from '@/src/serverless/database';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // 1. AWAIT params để lấy userId từ đường dẫn (chuẩn Next.js 15)
  const { userId } = await params;

  if (!userId) {
    return new Response('Thiếu ID người dùng', { status: 400 });
  }

  try {
    // 2. Tìm trong Database xem user này có cài Thumbnail không
    const thumb = await getCustomThumbnail(userId);

    if (!thumb || !thumb.imageData) {
      return new Response('Không tìm thấy Thumbnail tùy chỉnh', { status: 404 });
    }

    // 3. Dịch ngược chuỗi Base64 thành file nhị phân (Buffer)
    const imageBuffer = Buffer.from(thumb.imageData, 'base64');

    // 4. Trả file ảnh về cho Discord kèm theo header quy định loại ảnh (PNG, JPG...) và Cache
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': thumb.mimeType || 'image/png',
        // Thiết lập Cache để Discord không phải gọi API liên tục mỗi lần ai đó xem profile
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=31536000', 
      },
    });
  } catch (error) {
    console.error(`[API] Lỗi khi load Thumbnail cho user ${userId}:`, error);
    return new Response('Lỗi máy chủ nội bộ', { status: 500 });
  }
}