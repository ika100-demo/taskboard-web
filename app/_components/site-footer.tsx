export function SiteFooter({ name }: { name: string }) {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>{name}</p>
        <p>Built with Next.js and the sdlc-foundry template.</p>
      </div>
    </footer>
  );
}
