export function SiteFooter() {
  return (
    <footer className="site-container matrix-footer">
      <span>© {new Date().getFullYear()} Matrix</span>
      <div>
        <input id="matrix-pause-rain" className="matrix-motion-toggle" type="checkbox" />
        <label className="matrix-motion-label" htmlFor="matrix-pause-rain">Pause code rain</label>
      </div>
    </footer>
  );
}
