export default function Home() {
  return (
    <main style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
      color: '#f4f4f5', background: 'radial-gradient(circle at top, #30346b, #11131f 60%)',
    }}>
      <section style={{maxWidth: 620, padding: 32, border: '1px solid #464a74', borderRadius: 20, background: '#191b2dcc'}}>
        <div style={{fontSize: 48}}>🏆</div>
        <h1 style={{fontSize: 36, margin: '12px 0'}}>Ryusei Bot</h1>
        <p style={{fontSize: 18, lineHeight: 1.6, color: '#c7c9db'}}>
          Ranked ladder riêng cho từng Discord server: thách đấu, thread riêng, xác nhận kết quả và Elo leaderboard.
        </p>
        <p style={{color: '#8ee6b1'}}>● Discord Interactions endpoint đang sẵn sàng</p>
      </section>
    </main>
  );
}
