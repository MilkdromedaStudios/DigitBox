export default function DeepforgeLab(props) {
  const { game, openChallenge } = props;

  return (
    <main className="df-lab-layout">
      <section className="df-panel df-lab-hero">
        <div className="df-lab-orb">∑</div>
        <div>
          <span className="df-kicker">ENGINEER LAB</span>
          <h2>Knowledge is an upgrade.</h2>
          <p>
            Solve compact engineering problems to overclock your rigs.
            No worksheets: every correct answer changes the game economy.
          </p>
        </div>
      </section>

      <section className="df-lab-stats">
        <div><span>▣</span><b>{game.research}</b><small>research</small></div>
        <div><span>⚡</span><b>{game.boostCharges}</b><small>boost charges</small></div>
        <div><span>⛏</span><b>{game.blocksMined}</b><small>blocks mined</small></div>
      </section>

      <button className="df-primary" onClick={openChallenge}>Run engineer challenge</button>

      <section className="df-learning-map">
        <article className="df-panel"><b>Ratios</b><span>Refinery recipes & production</span></article>
        <article className="df-panel"><b>Algebra</b><span>Machine calibration & automation</span></article>
        <article className="df-panel"><b>Geometry</b><span>City lots, tunnels & construction</span></article>
        <article className="df-panel"><b>Percent</b><span>Markets, shields & efficiency</span></article>
      </section>
    </main>
  );
}