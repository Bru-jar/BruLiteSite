export function SiteFooter() {
  return (
    <footer className="site-container matrix-footer">
      <span>© {new Date().getFullYear()} Matrix</span>
      <div>
        <input id="matrix-pause-rain" className="matrix-motion-toggle" type="checkbox" />
        <label className="matrix-motion-label" htmlFor="matrix-pause-rain">
          <span className="matrix-motion-default">Pause code rain</span>
          <span className="matrix-motion-reduced">Play code rain</span>
        </label>
      </div>
    </footer>
  );
}
