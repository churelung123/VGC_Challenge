import { getBill, markBillPaid, SUPER_ADMIN_ID, MAIN_GUILD_ID } from '@/src/serverless/database';
import { checkEconomyAchievements } from '@/src/serverless/achievements';
import { createDMChannel, createMessage, editChannelMessage } from '@/src/serverless/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as any;
    console.log('[SePay Webhook Received]:', JSON.stringify(body));

    const content = String(body.content || body.description || '');
    const transferAmount = Number(body.transferAmount || body.amountIn || body.amount || 0);

    const match = content.match(/BILL\d+/i);
    if (!match) {
      return Response.json({ success: true, message: 'No bill code found in transaction memo' });
    }

    const billCode = match[0].toUpperCase();
    const bill = await getBill(billCode);

    if (!bill) {
      console.warn(`[SePay Webhook] Không tìm thấy Bill với mã ${billCode}`);
      return Response.json({ success: true, message: `Bill ${billCode} not found` });
    }

    if (bill.status === 'paid') {
      return Response.json({ success: true, message: `Bill ${billCode} already paid` });
    }

    if (transferAmount < bill.amount) {
      console.warn(`[SePay Webhook] Số tiền nhận (${transferAmount}đ) nhỏ hơn tiền Bill (${bill.amount}đ)`);
      return Response.json({ success: true, message: `Amount insufficient` });
    }

    const updatedBill = await markBillPaid(billCode);
    if (!updatedBill) {
      return Response.json({ success: true, message: `Failed updating bill ${billCode}` });
    }

    if (bill.customerId) {
      await checkEconomyAchievements(bill.guildId || MAIN_GUILD_ID, bill.customerId).catch(console.error);
    }

    const paidTs = Math.floor(Date.now() / 1000);
    const amountFormatted = bill.amount.toLocaleString('vi-VN');

    // Xác định kênh gửi tin nhắn (nếu ở DM thì lấy DM channel ID)
    let targetChannelId = bill.channelId;
    if ((!targetChannelId || targetChannelId === 'DM') && bill.customerId) {
      try {
        const dm = await createDMChannel(bill.customerId);
        targetChannelId = dm.id;
      } catch (err) {
        console.error('[SePay] Lỗi lấy DM channel cho khách:', err);
      }
    }

    if (targetChannelId && bill.messageId) {
      const isLate = bill.expiresAt ? Date.now() > bill.expiresAt : false;
      const paidEmbed = {
        color: 0x2ECC71,
        author: { name: 'RYUSEI BILLING · XÁC NHẬN THANH TOÁN' },
        title: isLate ? `✅ ĐÃ THANH TOÁN (Nhận tiền trễ hạn)` : `✅ ĐÃ THANH TOÁN THÀNH CÔNG`,
        description:
          `🎉 Hóa đơn **${bill.id}** cho **${bill.title}** đã được thanh toán thành công qua MBBank VietQR!\n` +
          `──────────────────────────────────`,
        fields: [
          { name: '📦 Dịch vụ / Nội dung', value: `**${bill.title}**`, inline: true },
          { name: '💵 Số tiền đã nhận', value: `**${amountFormatted} VNĐ**`, inline: true },
          { name: '👤 Khách hàng', value: bill.customerId ? `<@${bill.customerId}>` : 'Thành viên', inline: true },
          { name: '🏦 Ngân hàng nhận', value: 'MBBank (`0828006916`)', inline: true },
          { name: '⏰ Thời gian thanh toán', value: `<t:${paidTs}:F>${isLate ? ' *(Thanh toán sau hạn)*' : ''}`, inline: false },
        ],
        footer: { text: `Ryusei Bot • Mã đơn: ${bill.id} • Trạng thái: PAID` },
        timestamp: new Date().toISOString(),
      };

      await editChannelMessage(targetChannelId, bill.messageId, {
        embeds: [paidEmbed],
        components: [],
      }).catch(err => console.error(`[SePay] Lỗi update message bill:`, err));

      await createMessage(targetChannelId, {
        content: `${bill.customerId ? `<@${bill.customerId}> ` : ''}🎉 **XÁC NHẬN THANH TOÁN THÀNH CÔNG!**\nHóa đơn mã \`${bill.id}\` (**${amountFormatted}đ**) cho **${bill.title}** đã được thanh toán thành công!`,
        allowed_mentions: { users: bill.customerId ? [bill.customerId] : [] },
      }).catch(err => console.error(`[SePay] Lỗi gửi message thông báo:`, err));
    }

    const superAdminId = process.env.SUPER_ADMIN_ID || SUPER_ADMIN_ID;
    try {
      const dm = await createDMChannel(superAdminId);
      await createMessage(dm.id, {
        embeds: [
          {
            color: 0xF1C40F,
            title: `💸 [XÁC NHẬN BILL THÀNH CÔNG] +${amountFormatted}đ`,
            description: `Vừa nhận thanh toán tự động qua VietQR MBBank (SePay)!`,
            fields: [
              { name: '🧾 Mã Bill', value: `\`${bill.id}\``, inline: true },
              { name: '💵 Số tiền', value: `**${amountFormatted} VNĐ**`, inline: true },
              { name: '📦 Dịch vụ', value: `**${bill.title}**`, inline: false },
              { name: '👤 Khách hàng', value: bill.customerId ? `<@${bill.customerId}> (\`${bill.customerId}\`)` : 'Chưa tag', inline: true },
              { name: '⏰ Thời gian', value: `<t:${paidTs}:F>`, inline: true },
            ],
            footer: { text: 'Ryusei Bot • Automated Payment Verification' },
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (dmErr) {
      console.error(`[SePay] Lỗi gửi DM cho Super Admin:`, dmErr);
    }

    if (bill.customerId) {
      try {
        const customerDm = await createDMChannel(bill.customerId);
        await createMessage(customerDm.id, {
          embeds: [
            {
              color: 0x2ECC71,
              title: `✅ Thanh toán thành công hóa đơn ${bill.id}`,
              description: `Cảm ơn bạn đã thanh toán dịch vụ **${bill.title}** - Số tiền **${amountFormatted}đ**!`,
              footer: { text: 'Ryusei Bot Billing' },
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } catch (custErr) {
        console.error(`[SePay] Lỗi gửi DM cho khách hàng:`, custErr);
      }
    }

    return Response.json({ success: true, message: `Bill ${billCode} processed successfully` });
  } catch (error) {
    console.error('[SePay Webhook Error]:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export function GET(): Response {
  return Response.json({ ok: true, service: 'Ryusei Bot SePay Payment Webhook' });
}
