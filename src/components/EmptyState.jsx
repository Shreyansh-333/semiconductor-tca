import { useEffect, useState } from 'react';

// Purely cosmetic idle state shown before the first run. A small typewriter
// effect cycles example orders with a blinking cursor so the page feels alive.
// No business logic here.
const PHRASES = [
  'Buy 10,000 NXPI with a VWAP schedule.',
  'Compare TWAP, VWAP, POV and IS on one order.',
  'Measure implementation shortfall against the arrival price.',
  'Watch slippage versus interval VWAP as fills land.',
];

export default function EmptyState() {
  const [text, setText] = useState('');
  const [phrase, setPhrase] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = PHRASES[phrase];
    const atFull = !deleting && text === current;
    const atEmpty = deleting && text === '';

    let delay = deleting ? 35 : 55;
    if (atFull) delay = 1400; // pause on a complete phrase
    if (atEmpty) delay = 300;

    const timer = setTimeout(() => {
      if (atFull) {
        setDeleting(true);
      } else if (atEmpty) {
        setDeleting(false);
        setPhrase((p) => (p + 1) % PHRASES.length);
      } else {
        setText(deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1));
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [text, deleting, phrase]);

  return (
    <div className="empty-state">
      <h2>Set up an order, then press Run execution.</h2>
      <p className="typewriter">
        <span>{text}</span>
        <span className="cursor" aria-hidden="true" />
      </p>
      <p className="empty-hint">
        Pick a stock from the basket, choose a side, size and algorithm, then watch the simulated
        fills land on the real price path while the cost metrics update in place.
      </p>
    </div>
  );
}
