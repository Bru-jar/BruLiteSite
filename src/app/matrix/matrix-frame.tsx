import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

const glyphs = "0101100101ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾏﾐﾑﾒﾓΞ∑∆⟐";
const streams = Array.from({ length: 42 }, (_, column) => {
  const length = 14 + (column * 7) % 13;
  const text = Array.from({ length }, (_, row) =>
    glyphs[(column * 17 + row * 13 + row * column + row ** 2) % glyphs.length],
  ).join("\n");
  return { text, duration: 12 + (column * 11) % 15, delay: -((column * 47 + 23) % 221) / 10 };
});

function CodeRain() {
  return (
    <div className="matrix-rain" aria-hidden="true">
      <div className="matrix-rain-streams">
        {streams.map(({ text, duration, delay }, column) => (
          <div key={column} style={{ "--duration": `${duration}s`, "--delay": `${delay}s` } as CSSProperties}>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatrixFrame({ children, rain = false }: { children: ReactNode; rain?: boolean }) {
  return (
    <div className="matrix-frame">
      {rain && <CodeRain />}
      <header className="matrix-header">
        <Link className="matrix-brand" href="/matrix">
          <Image src="/matrix-mark.svg" width={38} height={38} alt="" unoptimized />
          <span>Matrix</span>
        </Link>
        <span className="matrix-badge"><span aria-hidden="true" /> Closed beta</span>
      </header>
      <main className="matrix-main">{children}</main>
      <footer className="matrix-footer">
        <span>Matrix <span aria-hidden="true">/</span> Closed beta</span>
        {rain && (
          <div>
            <input id="pause-rain" className="matrix-motion-toggle" type="checkbox" />
            <label className="matrix-motion-label" htmlFor="pause-rain">Pause code rain</label>
          </div>
        )}
      </footer>
    </div>
  );
}
